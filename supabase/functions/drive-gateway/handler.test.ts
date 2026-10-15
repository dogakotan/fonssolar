// drive-gateway yetki ve doğrulama akışı testleri — ağ, veritabanı ve Drive olmadan (sahte bağımlılıklar).
// Çalıştırma (deploy gerektirmez):
//   node --test supabase/functions/drive-gateway/handler.test.ts     (Node >= 22.18, tip silme yerleşik)
//   deno test supabase/functions/drive-gateway/handler.test.ts       (Deno kuruluysa)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from './handler.ts'
import type { GatewayDeps, RpcResult, UserClient } from './handler.ts'
import type { DriveClient, DriveConfig } from './driveClient.ts'
import { buildFolderPlan, createDriveClient, DriveNotImplementedError, parseDriveConfig } from './driveClient.ts'
import { buildDriveFileName, contentDisposition, detectFileKind, slugify } from './validation.ts'

const BASE = 'https://example.supabase.co/functions/v1/drive-gateway'
const PROJECT = 'test-izmir-ges-2026'
const DOC_ID = '11111111-2222-3333-4444-555555555555'
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])

type RpcHandler = (args: Record<string, unknown> | undefined) => RpcResult

interface FakeOptions {
  user?: { id: string } | null
  rpc?: Record<string, RpcHandler>
  driveConfigured?: boolean
  drive?: Partial<DriveClient>
  env?: Record<string, string>
}

function setup(opts: FakeOptions = {}) {
  const calls: { rpc: string[]; drive: string[]; driveCreated: number } = { rpc: [], drive: [], driveCreated: 0 }
  const missing = (): RpcResult => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
  const client: UserClient = {
    auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: 'u-1' } : opts.user }, error: null }) },
    rpc: async (fn, args) => {
      calls.rpc.push(fn)
      return (opts.rpc?.[fn] ?? missing)(args)
    },
  }
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon', ...opts.env,
  }
  if (opts.driveConfigured) {
    env.GOOGLE_SERVICE_ACCOUNT_JSON = '{"client_email":"x"}'
    env.DRIVE_SHARED_DRIVE_ID = 'shared-drive'
  }
  const drive: DriveClient = {
    uploadFile: async () => { calls.drive.push('upload'); return { fileId: 'drive-file-1' } },
    downloadFile: async () => {
      calls.drive.push('download')
      return { body: new Blob([PDF]).stream(), mimeType: 'application/pdf', sizeBytes: PDF.length }
    },
    deleteFile: async () => { calls.drive.push('delete') },
    ensureFolder: async (_parent, name) => { calls.drive.push('ensure'); return `id:${name}` },
    ...opts.drive,
  }
  const deps: GatewayDeps = {
    getEnv: key => env[key],
    createUserClient: () => client,
    parseDriveConfig,
    createDriveClient: (_cfg: DriveConfig) => { calls.driveCreated++; return drive },
  }
  return { deps, calls }
}

const ok = (data: unknown): RpcHandler => () => ({ data, error: null })
const auth = { Authorization: 'Bearer user-jwt' }

function uploadRequest(fields: Record<string, string | File>, headers: Record<string, string> = auth) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request(`${BASE}?action=upload`, { method: 'POST', headers, body: form })
}
const pdfFile = (name = 'rfi.pdf', bytes: Uint8Array = PDF) => new File([bytes], name, { type: 'application/pdf' })
const validUpload = (file: File = pdfFile()) => ({ project_id: PROJECT, doc_type: 'rfi', discipline: 'dc', revision: 'R01', title: 'Kazık yerleşimi', file })

async function body(res: Response) { return res.json() as Promise<Record<string, unknown>> }

// ── Ortak kapılar ───────────────────────────────────────────────────────────

test('OPTIONS CORS yanıtı verir', async () => {
  const { deps } = setup()
  const res = await handleRequest(new Request(`${BASE}?action=upload`, { method: 'OPTIONS' }), deps)
  assert.equal(res.status, 200)
})

test('bilinmeyen eylem 400, yanlış metot 405', async () => {
  const { deps } = setup()
  assert.equal((await handleRequest(new Request(`${BASE}?action=list`, { headers: auth }), deps)).status, 400)
  assert.equal((await handleRequest(new Request(`${BASE}?action=download&document_id=${DOC_ID}`, { method: 'POST', headers: auth }), deps)).status, 405)
})

test('T16: Bearer yoksa 401 — hiçbir RPC veya Drive çağrısı yapılmaz', async () => {
  const { deps, calls } = setup({ driveConfigured: true })
  const res = await handleRequest(uploadRequest(validUpload(), {}), deps)
  assert.equal(res.status, 401)
  assert.deepEqual(calls.rpc, [])
  assert.equal(calls.driveCreated, 0)
})

test('geçersiz oturum 401', async () => {
  const { deps } = setup({ user: null })
  assert.equal((await handleRequest(uploadRequest(validUpload()), deps)).status, 401)
})

// ── upload ──────────────────────────────────────────────────────────────────

test('upload: project_id boşsa 400 (has_project_access(NULL)=true tuzağı RPC’ye gitmeden kapanır)', async () => {
  const { deps, calls } = setup()
  const res = await handleRequest(uploadRequest({ ...validUpload(), project_id: '' }), deps)
  assert.equal(res.status, 400)
  assert.ok(!calls.rpc.includes('has_project_access'))
})

test('T16: yetkisiz proje 403 — Drive yapılandırılmamış olsa bile 501 değil 403', async () => {
  const { deps, calls } = setup({ rpc: { has_project_access: ok(false) } })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 403)
  assert.equal(calls.driveCreated, 0)
})

test('has_project_access çağrılamıyorsa 500 access_check_unavailable', async () => {
  const { deps } = setup({ rpc: { has_project_access: () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) } })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 500)
  assert.equal((await body(res)).error, 'access_check_unavailable')
})

test('upload: geçersiz doc_type/discipline 400', async () => {
  const { deps } = setup({ rpc: { has_project_access: ok(true) } })
  const res = await handleRequest(uploadRequest({ ...validUpload(), doc_type: 'virus', discipline: 'x' }), deps)
  assert.equal(res.status, 400)
  assert.deepEqual((await body(res)).detail, { fields: ['doc_type', 'discipline'] })
})

test('T18: izinsiz tür 415 (uzantı .pdf ama içerik PDF değil)', async () => {
  const { deps } = setup({ rpc: { has_project_access: ok(true) } })
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00])
  const res = await handleRequest(uploadRequest(validUpload(pdfFile('rfi.pdf', exe))), deps)
  assert.equal(res.status, 415)
})

test('T18: izinsiz uzantı 415', async () => {
  const { deps } = setup({ rpc: { has_project_access: ok(true) } })
  const res = await handleRequest(uploadRequest(validUpload(new File([PDF], 'script.js'))), deps)
  assert.equal(res.status, 415)
})

test('T18: aşırı boyut 413', async () => {
  const { deps } = setup({ rpc: { has_project_access: ok(true) }, env: { MAX_UPLOAD_BYTES: '4' } })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 413)
})

test('yetkili + geçerli dosya + Drive yapılandırılmamış → 501 drive_not_configured', async () => {
  const { deps, calls } = setup({ rpc: { has_project_access: ok(true) } })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 501)
  assert.equal((await body(res)).error, 'drive_not_configured')
  assert.equal(calls.driveCreated, 0)
})

test('Drive yapılandırılmış ama Faz B RPC’si yok → 501 register_rpc_missing, Drive’a yükleme yok', async () => {
  const { deps, calls } = setup({ rpc: { has_project_access: ok(true) }, driveConfigured: true })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 501)
  assert.equal((await body(res)).error, 'register_rpc_missing')
  assert.deepEqual(calls.drive, [])
})

test('T17: aynı dosya ikinci kez → 409 ve mevcut kayıt id’si (Drive’a gitmeden)', async () => {
  const { deps, calls } = setup({
    driveConfigured: true,
    rpc: {
      has_project_access: ok(true),
      create_document_record: () => ({ data: null, error: { code: 'P0001', message: 'duplicate', details: JSON.stringify({ id: DOC_ID }) } }),
    },
  })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 409)
  assert.match(String((await body(res)).detail), new RegExp(DOC_ID))
  assert.deepEqual(calls.drive, [])
})

test('mutlu yol: 201 {document_id, register_no, job_id}; sha256 RPC’ye iletilir', async () => {
  let seenMeta: Record<string, unknown> = {}
  const { deps, calls } = setup({
    driveConfigured: true,
    rpc: {
      has_project_access: ok(true),
      create_document_record: args => {
        seenMeta = args?.p_meta as Record<string, unknown>
        return args?.p_dry_run
          ? { data: { register_no: 'DOC-DYB-0001', folder_id: 'folder-rfi' }, error: null }
          : { data: { id: DOC_ID, register_no: 'DOC-DYB-0001' }, error: null }
      },
      enqueue_document_job: ok('job-1'),
    },
  })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 201)
  assert.deepEqual(await body(res), { document_id: DOC_ID, register_no: 'DOC-DYB-0001', job_id: 'job-1' })
  assert.match(String(seenMeta.sha256), /^[0-9a-f]{64}$/)
  assert.equal(seenMeta.drive_file_id, 'drive-file-1')
  assert.deepEqual(calls.drive, ['upload'])
})

test('T19: kayıt açılamazsa Drive’a yüklenen dosya silinir', async () => {
  const { deps, calls } = setup({
    driveConfigured: true,
    rpc: {
      has_project_access: ok(true),
      create_document_record: args => args?.p_dry_run
        ? { data: { register_no: 'DOC-DYB-0002', folder_id: 'f' }, error: null }
        : { data: null, error: { code: 'P0001', message: 'validation', details: '{"fields":["title"]}' } },
    },
  })
  const res = await handleRequest(uploadRequest(validUpload()), deps)
  assert.equal(res.status, 400)
  assert.deepEqual(calls.drive, ['upload', 'delete'])
})

test('Drive istemcisi henüz iskelet → 501 drive_not_implemented', async () => {
  const { deps } = setup({
    driveConfigured: true,
    rpc: { has_project_access: ok(true), create_document_record: ok({ register_no: 'X', folder_id: 'f' }) },
    drive: { uploadFile: () => Promise.reject(new DriveNotImplementedError('stub')) },
  })
  assert.equal((await handleRequest(uploadRequest(validUpload()), deps)).status, 501)
})

// ── download ────────────────────────────────────────────────────────────────

const downloadReq = (q = `document_id=${DOC_ID}`) => new Request(`${BASE}?action=download&${q}`, { headers: auth })

test('download: geçersiz document_id 400', async () => {
  const { deps } = setup()
  assert.equal((await handleRequest(downloadReq('document_id=abc'), deps)).status, 400)
})

test('download: get_document_for_download yoksa 501 — dosya asla verilmez', async () => {
  const { deps, calls } = setup({ driveConfigured: true })
  const res = await handleRequest(downloadReq(), deps)
  assert.equal(res.status, 501)
  assert.equal(calls.driveCreated, 0)
})

test('T16: download başka proje → 403 (RPC forbidden)', async () => {
  const { deps, calls } = setup({
    driveConfigured: true,
    rpc: { get_document_for_download: () => ({ data: null, error: { code: 'P0001', message: 'forbidden' } }) },
  })
  assert.equal((await handleRequest(downloadReq(), deps)).status, 403)
  assert.equal(calls.driveCreated, 0)
})

test('download mutlu yol: akış + güvenli başlıklar', async () => {
  const { deps } = setup({
    driveConfigured: true,
    rpc: { get_document_for_download: ok({ drive_file_id: 'drv', file_name: 'Çizim "R03".pdf', mime_type: 'application/pdf', size_bytes: PDF.length }) },
  })
  const res = await handleRequest(downloadReq(`document_id=${DOC_ID}&disposition=attachment`), deps)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/pdf')
  assert.equal(res.headers.get('cache-control'), 'private, no-store')
  assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="_izim _R03_.pdf"; filename\*=UTF-8''/)
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), PDF)
})

// ── provision_folders ───────────────────────────────────────────────────────

const provisionReq = (payload: unknown) => new Request(`${BASE}?action=provision_folders`, {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
})

test('provision_folders: admin olmayan 403', async () => {
  const { deps } = setup({ driveConfigured: true, rpc: { has_project_access: ok(true), get_my_role: ok('proje_yoneticisi') } })
  assert.equal((await handleRequest(provisionReq({ project_id: PROJECT }), deps)).status, 403)
})

test('provision_folders: proje erişimi yoksa 403 (admin kontrolünden önce)', async () => {
  const { deps, calls } = setup({ rpc: { has_project_access: ok(false), get_my_role: ok('admin') } })
  assert.equal((await handleRequest(provisionReq({ project_id: PROJECT }), deps)).status, 403)
  assert.ok(!calls.rpc.includes('get_my_role'))
})

test('provision_folders: admin + Drive yok → 501', async () => {
  const { deps } = setup({ rpc: { has_project_access: ok(true), get_my_role: ok('admin') } })
  assert.equal((await handleRequest(provisionReq({ project_id: PROJECT }), deps)).status, 501)
})

test('provision_folders: admin + Drive → şablondaki tüm klasörler', async () => {
  const { deps } = setup({ driveConfigured: true, rpc: { has_project_access: ok(true), get_my_role: ok('admin') } })
  const res = await handleRequest(provisionReq({ project_id: PROJECT }), deps)
  const out = await body(res)
  assert.equal(res.status, 200)
  assert.equal(out.created, buildFolderPlan(PROJECT).length)
  assert.equal((out.folders as unknown[]).length, 7 * 10)
})

// ── Saf yardımcılar ─────────────────────────────────────────────────────────

test('dosya türü tespiti uzantı + imza ister', () => {
  assert.equal(detectFileKind('a.pdf', PDF)?.mimeType, 'application/pdf')
  assert.equal(detectFileKind('a.PDF', PDF)?.ext, 'pdf')
  assert.equal(detectFileKind('plan.dwg', new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x33]))?.aiEligible, false)
  assert.equal(detectFileKind('a.png', PDF), null)
  assert.equal(detectFileKind('a.exe', PDF), null)
})

test('Drive dosya adı kuralı (tasarım 4.5)', () => {
  assert.equal(buildDriveFileName('DRW-DYB-0125', 'R03', 'PV03 Kazık Yerleşim', 'pdf'), 'DRW-DYB-0125_R03_pv03-kazik-yerlesim.pdf')
  assert.equal(buildDriveFileName('RFI-DYB-0032', '', 'Soru', 'pdf'), 'RFI-DYB-0032_soru.pdf')
  assert.ok(slugify('x'.repeat(200)).length <= 80)
  assert.equal(contentDisposition('inline', 'a\r\nb.pdf').includes('\r'), false)
})

test('iskelet Drive istemcisi her çağrıda DriveNotImplementedError fırlatır', async () => {
  const client = createDriveClient({ serviceAccountJson: '{}', sharedDriveId: 'd' })
  await assert.rejects(client.uploadFile({ folderId: 'f', name: 'n', mimeType: 'm', bytes: PDF }), DriveNotImplementedError)
  await assert.rejects(client.downloadFile('x'), DriveNotImplementedError)
})
