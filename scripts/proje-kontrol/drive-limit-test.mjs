#!/usr/bin/env node
// Drive sınır denemesi — Proje Kontrol Faz A (docs/proje-kontrol/tasarim.md Bölüm 3, 13-19 Eki,
// "Büyük bir çizim paketi PDF'iyle yükleme ve indirme denemesi: süre, kota ve boyut sınırları").
//
// ── ÇALIŞTIRMA TALİMATI ─────────────────────────────────────────────────────
// Ön koşullar (Google Cloud tarafı, sende):
//   1. Drive API etkin bir Google Cloud projesi ve bir servis hesabı (JSON anahtar).
//   2. "Fons Projects" Shared Drive; servis hesabı üye (Content manager).
//   3. Shared Drive içinde deneme için bir klasör (ör. "99_Arsiv/limit-test"), kimliği TEST_FOLDER_ID.
//
// Ortam değişkenleri (kabukta set et; dosyaya/repoya YAZMA):
//   GOOGLE_SERVICE_ACCOUNT_JSON  JSON içeriğinin kendisi VEYA JSON dosyasının yolu
//   DRIVE_SHARED_DRIVE_ID        Shared Drive kimliği
//   TEST_FOLDER_ID               Deneme klasörünün kimliği (Shared Drive içinde)
//
// Kullanım:
//   node scripts/proje-kontrol/drive-limit-test.mjs <dosya.pdf> [--repeat 3] [--chunk-mb 8] [--keep]
//     --repeat N    yükle/indir döngüsü sayısı (varsayılan 1)
//     --chunk-mb M  resumable upload parça boyutu MB (varsayılan 8; 256 KB'ın katına yuvarlanır)
//     --keep        yüklenen dosyaları silme (varsayılan: deneme sonunda silinir)
//
// PowerShell örneği:
//   $env:GOOGLE_SERVICE_ACCOUNT_JSON = "C:\gizli\fons-drive-sa.json"
//   $env:DRIVE_SHARED_DRIVE_ID = "..." ; $env:TEST_FOLDER_ID = "..."
//   node scripts/proje-kontrol/drive-limit-test.mjs C:\olcum\cizim-paketi-120mb.pdf --repeat 3
//
// Çıktı: adım bazında süre, boyut, hız, HTTP kodu ve hata tablosu + özet. Sonuç
// MAX_UPLOAD_BYTES secret'ının değerini ve edge function'da akış (streaming) gerekip
// gerekmediğini belirlemek için kullanılır. Edge function sınırları (süre, bellek) bu betikle
// ÖLÇÜLMEZ — bu betik Drive API'nin kendisini ölçer.
// ────────────────────────────────────────────────────────────────────────────

import { createHash, createSign } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive'

function parseArgs(argv) {
  const args = { file: null, repeat: 1, chunkMb: 8, keep: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repeat') args.repeat = Math.max(1, Number(argv[++i]) || 1)
    else if (a === '--chunk-mb') args.chunkMb = Math.max(0.25, Number(argv[++i]) || 8)
    else if (a === '--keep') args.keep = true
    else if (!args.file) args.file = a
  }
  return args
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Eksik ortam değişkeni: ${name} (bkz. betiğin başındaki talimat)`)
    process.exit(2)
  }
  return value
}

async function loadServiceAccount(raw) {
  const text = raw.startsWith('{') ? raw : await readFile(raw, 'utf8')
  const sa = JSON.parse(text)
  if (!sa.client_email || !sa.private_key) throw new Error('Servis hesabı JSON\'unda client_email/private_key yok')
  return sa
}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Token alınamadı (HTTP ${res.status}): ${body.error_description || body.error || ''}`)
  return body.access_token
}

const rows = []
function record(step, { ms = null, bytes = null, status = null, error = null } = {}) {
  const mbps = ms && bytes ? (bytes / 1024 / 1024) / (ms / 1000) : null
  rows.push({
    adim: step,
    sure_ms: ms == null ? '' : Math.round(ms),
    boyut_mb: bytes == null ? '' : (bytes / 1024 / 1024).toFixed(2),
    hiz_mb_s: mbps == null ? '' : mbps.toFixed(2),
    http: status ?? '',
    hata: error ? String(error).slice(0, 120) : '',
  })
}

async function timed(fn) {
  const t0 = performance.now()
  const out = await fn()
  return { ...out, ms: performance.now() - t0 }
}

async function driveJson(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

async function resumableUpload(token, { folderId, name, bytes, chunkBytes }) {
  const init = await fetch(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,size,md5Checksum`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/pdf',
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify({ name, parents: [folderId], mimeType: 'application/pdf', appProperties: { fons_limit_test: '1' } }),
  })
  if (!init.ok) {
    const err = await init.json().catch(() => ({}))
    return { status: init.status, error: err?.error?.message || 'resumable oturumu açılamadı', chunks: 0 }
  }
  const session = init.headers.get('location')
  let offset = 0
  let chunks = 0
  while (offset < bytes.length) {
    const end = Math.min(offset + chunkBytes, bytes.length)
    const res = await fetch(session, {
      method: 'PUT',
      headers: { 'Content-Length': String(end - offset), 'Content-Range': `bytes ${offset}-${end - 1}/${bytes.length}` },
      body: bytes.subarray(offset, end),
    })
    chunks++
    if (res.status === 308) { offset = end; continue }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { status: res.status, error: body?.error?.message || 'parça yüklenemedi', chunks }
    return { status: res.status, fileId: body.id, md5: body.md5Checksum, chunks }
  }
  return { status: null, error: 'yükleme yanıtı alınamadı', chunks }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.file || !existsSync(args.file)) {
    console.error('Kullanım: node scripts/proje-kontrol/drive-limit-test.mjs <dosya.pdf> [--repeat N] [--chunk-mb M] [--keep]')
    process.exit(2)
  }
  const sa = await loadServiceAccount(requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON'))
  const sharedDriveId = requireEnv('DRIVE_SHARED_DRIVE_ID')
  const folderId = requireEnv('TEST_FOLDER_ID')

  const size = (await stat(args.file)).size
  const bytes = new Uint8Array(await readFile(args.file))
  const localSha = createHash('sha256').update(bytes).digest('hex')
  const localMd5 = createHash('md5').update(bytes).digest('hex')
  const chunkBytes = Math.max(256 * 1024, Math.round((args.chunkMb * 1024 * 1024) / (256 * 1024)) * 256 * 1024)
  console.log(`Dosya: ${basename(args.file)} · ${(size / 1024 / 1024).toFixed(2)} MB · sha256 ${localSha.slice(0, 16)}…`)
  console.log(`Servis hesabı: ${sa.client_email} · parça: ${(chunkBytes / 1024 / 1024).toFixed(2)} MB · tekrar: ${args.repeat}\n`)

  const tok = await timed(async () => ({ token: await getAccessToken(sa) }))
  record('token', { ms: tok.ms, status: 200 })
  const token = tok.token

  // Shared Drive erişimi ve kota bilgisi
  const drv = await timed(() => driveJson(token, `${DRIVE}/drives/${sharedDriveId}?fields=id,name,capabilities(canAddChildren,canDeleteChildren)`))
  record('shared_drive_get', { ms: drv.ms, status: drv.res.status, error: drv.res.ok ? null : drv.body?.error?.message })
  if (drv.res.ok) console.log(`Shared Drive: ${drv.body.name} · ekleyebilir=${drv.body.capabilities?.canAddChildren} · silebilir=${drv.body.capabilities?.canDeleteChildren}`)
  const about = await timed(() => driveJson(token, `${DRIVE}/about?fields=maxUploadSize,storageQuota`))
  record('about_quota', { ms: about.ms, status: about.res.status, error: about.res.ok ? null : about.body?.error?.message })
  if (about.res.ok) console.log(`maxUploadSize: ${about.body.maxUploadSize} · storageQuota: ${JSON.stringify(about.body.storageQuota)}\n`)

  const uploaded = []
  for (let i = 1; i <= args.repeat; i++) {
    const name = `fons-limit-test_${Date.now()}_${i}_${basename(args.file)}`
    const up = await timed(() => resumableUpload(token, { folderId, name, bytes, chunkBytes }))
    record(`upload#${i} (${up.chunks} parça)`, { ms: up.ms, bytes: size, status: up.status, error: up.error })
    if (!up.fileId) continue
    uploaded.push(up.fileId)
    if (up.md5 && up.md5 !== localMd5) record(`md5#${i}`, { error: `md5 uyuşmuyor: drive=${up.md5}` })

    const down = await timed(async () => {
      const res = await fetch(`${DRIVE}/files/${up.fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return { status: res.status, error: err?.error?.message || 'indirilemedi' }
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      return { status: res.status, buf }
    })
    const sameHash = down.buf ? createHash('sha256').update(down.buf).digest('hex') === localSha : false
    record(`download#${i}`, {
      ms: down.ms, bytes: down.buf?.length ?? null, status: down.status,
      error: down.error || (down.buf && !sameHash ? 'sha256 uyuşmuyor' : null),
    })
  }

  if (!args.keep) {
    for (const id of uploaded) {
      const del = await timed(async () => {
        const res = await fetch(`${DRIVE}/files/${id}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        return { status: res.status, error: res.ok ? null : (await res.json().catch(() => ({})))?.error?.message }
      })
      record('delete', { ms: del.ms, status: del.status, error: del.error })
    }
  } else if (uploaded.length) {
    console.log(`--keep: ${uploaded.length} dosya Drive'da bırakıldı: ${uploaded.join(', ')}`)
  }

  console.log('')
  console.table(rows)
  const failures = rows.filter(r => r.hata)
  console.log(failures.length ? `\n${failures.length} adım hatalı.` : '\nTüm adımlar başarılı.')
  process.exit(failures.length ? 1 : 0)
}

main().catch(error => {
  console.error('Beklenmeyen hata:', error.message)
  if (rows.length) console.table(rows)
  process.exit(1)
})
