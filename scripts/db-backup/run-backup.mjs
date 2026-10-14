import { existsSync, mkdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

// Varsayılan kip pg_dump (PostgreSQL 17 istemci araçları; Docker gerekmez, Karar 67). Bkz. README.md.
//   npm run db:backup        → şema: public, storage, supabase_migrations (tablolar, fonksiyonlar, trigger'lar, RLS) — VERİ YOK
//   npm run db:backup:data   → veri: public + auth (kullanıcı hesapları, şifre özetleri dahil; oturum/token tabloları hariç)
// --cli: eski yol (npx supabase db dump; Docker gerektirir).
const dataOnly = process.argv.includes('--data')
const useCli = process.argv.includes('--cli')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(scriptDir, '.env.local')

if (!existsSync(envPath)) {
  console.error(`HATA: ${envPath} bulunamadi.`)
  console.error('Once .env.local.example dosyasini ayni klasorde .env.local olarak kopyalayip SUPABASE_DB_URL degiskenini doldurun.')
  process.exit(1)
}

dotenv.config({ path: envPath, quiet: true })

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('HATA: SUPABASE_DB_URL bos. .env.local dosyasini kontrol edin.')
  process.exit(1)
}

const backupDir = path.join(scriptDir, 'backups')
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const outFile = path.join(backupDir, `${dataOnly ? 'data' : 'dump'}_${stamp}.sql`)

// pg_dump'ı bul: PATH, sonra PostgreSQL 17 varsayılan kurulum klasörü. Sürüm canlıdakiyle (17) aynı ya da yeni olmalı.
function findPgDump() {
  const candidates = ['pg_dump']
  if (process.platform === 'win32') candidates.push('C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe')
  for (const bin of candidates) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
    if (r.status === 0) {
      const major = Number((r.stdout.match(/(\d+)\.\d+/) || [])[1])
      return { bin, major, text: r.stdout.trim() }
    }
  }
  return null
}

function runPgDump() {
  const pg = findPgDump()
  if (!pg) {
    console.error('HATA: pg_dump bulunamadi. PostgreSQL 17 "Command Line Tools" kurulu olmali (README.md).')
    process.exit(1)
  }
  if (!(pg.major >= 17)) {
    console.error(`HATA: pg_dump surumu 17 veya ustu olmali (bulunan: ${pg.text}).`)
    process.exit(1)
  }
  console.log(`${pg.text}`)
  const common = ['--dbname', dbUrl, '--file', outFile, '--no-password', '--encoding', 'UTF8']
  const args = dataOnly
    ? [...common, '--data-only', '--schema', 'public', '--schema', 'auth',
        // Kısa ömürlü oturum ve token tabloları yedeklenmez (geri yüklemede gerekmez, gizli değer taşır)
        '--exclude-table-data', 'auth.sessions', '--exclude-table-data', 'auth.refresh_tokens',
        '--exclude-table-data', 'auth.one_time_tokens', '--exclude-table-data', 'auth.flow_state',
        '--exclude-table-data', 'auth.mfa_challenges']
    : [...common, '--schema-only', '--schema', 'public', '--schema', 'storage', '--schema', 'supabase_migrations']
  // Bağlantı adresi yalnızca argüman olarak gider; ekrana yazılmaz.
  return spawnSync(pg.bin, args, { stdio: 'inherit', env: { ...process.env, PGCONNECT_TIMEOUT: '20' } })
}

function runCli() {
  const args = ['supabase@latest', 'db', 'dump', '--db-url', dbUrl, '-f', outFile]
  if (dataOnly) args.push('--data-only', '--use-copy')
  // Windows'ta npx.cmd yeni Node sürümlerinde kabuksuz başlatılamıyor; kabuk da adresteki özel karakterleri yorumlar.
  // Bu yüzden npx'in kendi betiği node ile çağrılır.
  const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  if (process.platform === 'win32' && existsSync(npxCli)) {
    return spawnSync(process.execPath, [npxCli, ...args], { stdio: 'inherit' })
  }
  return spawnSync('npx', args, { stdio: 'inherit' })
}

console.log(`${dataOnly ? 'Veri (public + auth)' : 'Sema'} yedegi aliniyor (${useCli ? 'supabase CLI' : 'pg_dump'}) -> ${outFile}`)
const result = useCli ? runCli() : runPgDump()

if (result.error) {
  console.error('Yedek alma baslatilamadi:', result.error.message)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`Yedek alma basarisiz oldu (${useCli ? 'supabase CLI' : 'pg_dump'} hata verdi).`)
  process.exit(result.status ?? 1)
}
if (!existsSync(outFile)) {
  console.error('HATA: Dump dosyasi olusmadi.')
  process.exit(1)
}

const sizeKb = (statSync(outFile).size / 1024).toFixed(1)
console.log(`Tamamlandi: ${outFile} (${sizeKb} KB)`)
