// drive-gateway istek işleyicisi. index.ts yalnızca gerçek bağımlılıkları (Supabase istemcisi,
// Drive istemcisi, Deno.env) enjekte eder; bu dosya testte sahte bağımlılıklarla çalışır.
//
// Sözleşme: docs/proje-kontrol/tasarim.md Bölüm 4.5 (eylem tablosu) ve 4.4 (RPC + hata kodları).
// Sıra her eylemde aynı: JWT → (boyut ön kontrolü) → girdi → PROJE YETKİSİ → tür/boyut → Drive yapılandırması.
// Yani Drive yapılandırılmamış olsa bile yetkisiz kullanıcı 401/403 alır, 501 değil.
//
// Veritabanına yalnızca kullanıcının JWT'siyle gidilir (service_role yok); Drive'a yalnızca servis hesabıyla.

import type { DriveClient, DriveConfig } from './driveClient.ts'
import { buildFolderPlan, DriveNotImplementedError, DriveRequestError } from './driveClient.ts'
import {
  contentDisposition, detectFileKind, DISCIPLINES, DOC_TYPES, isOneOf, isUuid, MAX_JSON_BYTES,
  MULTIPART_OVERHEAD_BYTES, parseMaxUploadBytes, sha256Hex, buildDriveFileName,
} from './validation.ts'

export interface RpcResult { data: unknown; error: { code?: string; message?: string; details?: string } | null }

/** supabase-js istemcisinin bu fonksiyonun kullandığı alt kümesi. */
export interface UserClient {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> }
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>
}

export interface GatewayDeps {
  getEnv(key: string): string | undefined
  createUserClient(authorization: string): UserClient
  parseDriveConfig(getEnv: (key: string) => string | undefined): DriveConfig | null
  createDriveClient(config: DriveConfig): DriveClient
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition',
}

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const ACTION_METHODS: Record<string, string> = {
  upload: 'POST',
  download: 'GET',
  provision_folders: 'POST',
}

// PostgREST "fonksiyon bulunamadı" — Faz B RPC'leri henüz yokken beklenen durum.
const RPC_MISSING_CODES = new Set(['PGRST202', '42883'])

/** RPC hata mesajını tasarım 4.4 hata sözleşmesine göre HTTP yanıtına çevirir. */
function rpcErrorResponse(error: NonNullable<RpcResult['error']>, rpcName: string): Response {
  if (error.code && RPC_MISSING_CODES.has(error.code)) {
    return json({ error: 'register_rpc_missing', detail: `${rpcName} henüz yok (Faz B migration'ı bekleniyor)` }, 501)
  }
  const message = error.message ?? ''
  const code = message.split(/[\s:]/)[0]
  const map: Record<string, number> = { forbidden: 403, not_found: 404, duplicate: 409, validation: 400, invalid_state: 409 }
  if (code in map) return json({ error: code, detail: error.details ?? null }, map[code])
  if (error.code === '42501') return json({ error: 'forbidden' }, 403)
  console.error(`drive-gateway: ${rpcName} failed`, error.code)
  return json({ error: 'database_error' }, 500)
}

type AccessResult = 'ok' | 'forbidden' | Response

/**
 * has_project_access(NULL) veritabanında true döner (genel ticket'lar için) — bu yüzden boş
 * project_id burada 400 ile reddedilir, RPC'ye hiç gitmez.
 */
async function checkProjectAccess(client: UserClient, projectId: unknown): Promise<AccessResult> {
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    return json({ error: 'validation', detail: { fields: ['project_id'] } }, 400)
  }
  const { data, error } = await client.rpc('has_project_access', { p_project_id: projectId })
  if (error) {
    // Bulgu olarak raporlanır: has_project_access authenticated'e çağrılabilir olmalı.
    console.error('drive-gateway: has_project_access unavailable', error.code)
    return json({ error: 'access_check_unavailable' }, 500)
  }
  return data === true ? 'ok' : 'forbidden'
}

function driveErrorResponse(error: unknown): Response {
  if (error instanceof DriveNotImplementedError) return json({ error: 'drive_not_implemented' }, 501)
  if (error instanceof DriveRequestError) {
    return json({ error: error.status === 404 ? 'not_found' : 'drive_error' }, error.status === 404 ? 404 : 502)
  }
  console.error('drive-gateway: drive call failed', String(error))
  return json({ error: 'drive_error' }, 502)
}

export async function handleRequest(req: Request, deps: GatewayDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const action = new URL(req.url).searchParams.get('action') ?? ''
  const expectedMethod = ACTION_METHODS[action]
  if (!expectedMethod) return json({ error: 'unknown_action' }, 400)
  if (req.method !== expectedMethod) return json({ error: 'method_not_allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'auth_required' }, 401)

  if (!deps.getEnv('SUPABASE_URL') || !deps.getEnv('SUPABASE_ANON_KEY')) {
    return json({ error: 'supabase_not_configured' }, 500)
  }
  const client = deps.createUserClient(authorization)
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return json({ error: 'invalid_session' }, 401)

  try {
    if (action === 'upload') return await handleUpload(req, client, user.id, deps)
    if (action === 'download') return await handleDownload(req, client, deps)
    return await handleProvisionFolders(req, client, deps)
  } catch (error) {
    console.error('drive-gateway: unhandled', String(error))
    return json({ error: 'internal_error' }, 500)
  }
}

// ── upload ─────────────────────────────────────────────────────────────────

async function handleUpload(req: Request, client: UserClient, userId: string, deps: GatewayDeps): Promise<Response> {
  const maxBytes = parseMaxUploadBytes(deps.getEnv('MAX_UPLOAD_BYTES'))
  const declaredLength = Number(req.headers.get('content-length') || 0)
  if (declaredLength > maxBytes + MULTIPART_OVERHEAD_BYTES) return json({ error: 'payload_too_large', max_bytes: maxBytes }, 413)
  if (!(req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    return json({ error: 'validation', detail: { fields: ['content-type'] } }, 400)
  }

  // TODO(Faz B): formData() tüm gövdeyi belleğe alır. Faz A sınır denemesi büyük çizim paketlerinin
  // edge function belleğini aştığını gösterirse Drive resumable upload'a akışla aktarılmalı.
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'validation', detail: { fields: ['body'] } }, 400)
  }

  const projectId = form.get('project_id')
  const access = await checkProjectAccess(client, projectId)
  if (access instanceof Response) return access
  if (access === 'forbidden') return json({ error: 'forbidden' }, 403)

  const docType = form.get('doc_type')
  const discipline = form.get('discipline')
  const revision = typeof form.get('revision') === 'string' ? String(form.get('revision')).trim() : ''
  const file = form.get('file')
  const badFields = [
    !isOneOf(DOC_TYPES, docType) && 'doc_type',
    !isOneOf(DISCIPLINES, discipline) && 'discipline',
    !(file instanceof File) && 'file',
    revision.length > 20 && 'revision',
  ].filter(Boolean)
  if (badFields.length) return json({ error: 'validation', detail: { fields: badFields } }, 400)

  const upload = file as File
  if (upload.size > maxBytes) return json({ error: 'payload_too_large', max_bytes: maxBytes }, 413)
  const bytes = new Uint8Array(await upload.arrayBuffer())
  const kind = detectFileKind(upload.name, bytes)
  if (!kind) return json({ error: 'unsupported_media_type' }, 415)
  const titleRaw = form.get('title')
  const title = (typeof titleRaw === 'string' && titleRaw.trim()) || upload.name.replace(/\.[^.]+$/, '')
  const sha256 = await sha256Hex(bytes)

  const driveConfig = deps.parseDriveConfig(deps.getEnv)
  if (!driveConfig) return json({ error: 'drive_not_configured' }, 501)

  const meta = {
    doc_type: docType, discipline, revision: revision || null, title,
    file_name: upload.name, mime_type: kind.mimeType, size_bytes: upload.size, sha256,
  }

  // 1) Tekrar kontrolü (dosya Drive'a gitmeden) — create_document_record p_dry_run=true.
  const dryRun = await client.rpc('create_document_record', { p_project_id: projectId, p_meta: meta, p_dry_run: true })
  if (dryRun.error) return rpcErrorResponse(dryRun.error, 'create_document_record')
  const dry = (dryRun.data ?? {}) as { register_no?: string; folder_id?: string }
  if (!dry.register_no || !dry.folder_id) {
    // TODO(Faz B, M09): dry-run yanıtı hedef klasörü (project_drive_folders) ve ayrılacak numarayı döndürmeli.
    return json({ error: 'register_rpc_missing', detail: 'create_document_record dry-run register_no/folder_id döndürmedi' }, 501)
  }

  // 2) Drive'a yükle.
  const drive = deps.createDriveClient(driveConfig)
  let fileId: string
  try {
    ;({ fileId } = await drive.uploadFile({
      folderId: dry.folder_id,
      name: buildDriveFileName(dry.register_no, revision, title, kind.ext),
      mimeType: kind.mimeType,
      bytes,
      appProperties: { project_id: String(projectId), sha256, uploaded_by: userId },
    }))
  } catch (error) {
    return driveErrorResponse(error)
  }

  // 3) Kaydı aç; açılamazsa Drive'daki dosyayı sil (telafi, test T19).
  const created = await client.rpc('create_document_record', {
    p_project_id: projectId,
    p_meta: { ...meta, drive_file_id: fileId, drive_folder_id: dry.folder_id },
    p_dry_run: false,
  })
  if (created.error) {
    await drive.deleteFile(fileId).catch(err => console.error('drive-gateway: compensation delete failed', String(err)))
    return rpcErrorResponse(created.error, 'create_document_record')
  }
  const record = (created.data ?? {}) as { id?: string; register_no?: string }

  // 4) AI işleme kuyruğu (dwg AI'a gönderilmez).
  let jobId: string | null = null
  if (kind.aiEligible && record.id) {
    const job = await client.rpc('enqueue_document_job', { p_document_id: record.id, p_job_type: 'classify' })
    if (job.error) console.error('drive-gateway: enqueue_document_job failed', job.error.code)
    else jobId = (job.data as string) ?? null
  }

  return json({ document_id: record.id ?? null, register_no: record.register_no ?? null, job_id: jobId }, 201)
}

// ── download ───────────────────────────────────────────────────────────────

async function handleDownload(req: Request, client: UserClient, deps: GatewayDeps): Promise<Response> {
  const params = new URL(req.url).searchParams
  const documentId = params.get('document_id')
  const disposition = params.get('disposition') ?? 'inline'
  if (!isUuid(documentId) || !['inline', 'attachment'].includes(disposition)) {
    return json({ error: 'validation', detail: { fields: ['document_id', 'disposition'] } }, 400)
  }

  // Yetki: get_document_for_download, has_project_access + register_can('document','view')
  // doğrulamadan drive_file_id döndürmez (tasarım 4.3). RPC yoksa hiçbir dosya verilmez.
  const { data, error } = await client.rpc('get_document_for_download', { p_document_id: documentId })
  if (error) return rpcErrorResponse(error, 'get_document_for_download')
  const doc = data as { drive_file_id?: string; file_name?: string; mime_type?: string; size_bytes?: number } | null
  if (!doc?.drive_file_id) return json({ error: 'not_found' }, 404)

  const driveConfig = deps.parseDriveConfig(deps.getEnv)
  if (!driveConfig) return json({ error: 'drive_not_configured' }, 501)

  try {
    const file = await deps.createDriveClient(driveConfig).downloadFile(doc.drive_file_id)
    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': doc.mime_type || file.mimeType,
      'Content-Disposition': contentDisposition(disposition as 'inline' | 'attachment', doc.file_name || 'dosya'),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    }
    const size = file.sizeBytes ?? doc.size_bytes
    if (size != null) headers['Content-Length'] = String(size)
    return new Response(file.body, { status: 200, headers })
  } catch (error) {
    return driveErrorResponse(error)
  }
}

// ── provision_folders ──────────────────────────────────────────────────────

async function handleProvisionFolders(req: Request, client: UserClient, deps: GatewayDeps): Promise<Response> {
  const declaredLength = Number(req.headers.get('content-length') || 0)
  if (declaredLength > MAX_JSON_BYTES) return json({ error: 'payload_too_large' }, 413)
  let body: Record<string, unknown>
  try {
    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) return json({ error: 'payload_too_large' }, 413)
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'validation', detail: { fields: ['body'] } }, 400)
  }

  const access = await checkProjectAccess(client, body?.project_id)
  if (access instanceof Response) return access
  if (access === 'forbidden') return json({ error: 'forbidden' }, 403)

  // Yalnızca admin (tasarım 4.5 eylem tablosu).
  const role = await client.rpc('get_my_role')
  if (role.error) return rpcErrorResponse(role.error, 'get_my_role')
  if (role.data !== 'admin') return json({ error: 'forbidden' }, 403)

  const driveConfig = deps.parseDriveConfig(deps.getEnv)
  if (!driveConfig) return json({ error: 'drive_not_configured' }, 501)

  // TODO(Faz B, M04/M05): proje klasör adı project_register_settings.prefix + proje adından
  // üretilecek (ör. DYB-Isdemir-Diyarbakir); şimdilik project_id kullanılıyor.
  const projectFolderName = String(body.project_id)
  const plan = buildFolderPlan(projectFolderName)
  const drive = deps.createDriveClient(driveConfig)
  const folderIds = new Map<string, string>()
  try {
    for (const entry of plan) {
      const parentKey = entry.path.slice(0, -1).join('/')
      const parentId = parentKey ? folderIds.get(parentKey)! : driveConfig.sharedDriveId
      folderIds.set(entry.path.join('/'), await drive.ensureFolder(parentId, entry.path[entry.path.length - 1]))
    }
  } catch (error) {
    return driveErrorResponse(error)
  }

  // TODO(Faz B, M05): klasör kimliklerini project_drive_folders'a yazacak bir RPC tasarım 4.4
  // listesinde yok (save_project_drive_folders gibi) — eklenmeli. O gelene kadar kimlikler yalnızca döndürülür.
  const folders = plan
    .filter(entry => entry.discipline && entry.docType)
    .map(entry => ({ discipline: entry.discipline, doc_type: entry.docType, drive_folder_id: folderIds.get(entry.path.join('/')) }))
  return json({ created: folderIds.size, folders })
}
