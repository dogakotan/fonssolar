// Proje Kontrol Faz B · B5 (doküman deposu) — TEST TASLAĞI · ★ PATRON ONAYI BEKLİYOR ★
// SQL: docs/proje-kontrol/taslak-sql/b5_document_storage.sql (UYGULANMADI). Bucket canlıda yoksa kendini atlar.
// Gerçek Storage API'siyle yükler (boyut/MIME sınırı burada sınanır; politikalar b5_dogrulama.sql'de de denendi).
// Temizlik sınırı: tamamlanmış (ready) dosya RPC/politika ile silinemez, doküman void edilir. Test sonunda doküman
// void edilir; dosya ve satır test projesinde kalır → test sonrası admin panelinden/SQL ile temizlik gerekir
// (bkz. docs/proje-kontrol/faz-b-migration-plani.md "Test verisi temizliği").
import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'
import { createHash, randomBytes } from 'node:crypto'

const BUCKET = 'proje-dokumanlari'

test.describe('Proje Kontrol B5 — doküman yükleme', () => {
  let admin, pm, santiye, muhasebe
  let izmir, kayseri
  let applied = false
  const voidAfter = []

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    izmir = process.env.TEST_PROJECT_IZMIR
    kayseri = process.env.TEST_PROJECT_KAYSERI
    applied = (await admin.rpc('get_storage_usage')).error == null
  })
  test.beforeEach(() => test.skip(!applied, 'B5 uygulanmadı (patron onayı bekleniyor)'))

  test.afterAll(async () => {
    for (const id of voidAfter) await pm.rpc('void_document', { p_document_id: id, p_reason: 'E2E temizlik' })
  })

  const pdf = () => {
    const bytes = Buffer.concat([Buffer.from('%PDF-1.4\n% E2E-B5\n'), randomBytes(64)])
    return { bytes, sha: createHash('sha256').update(bytes).digest('hex') }
  }

  test('yükle → tamamla → yalnızca yetkili kullanıcı açar', async () => {
    const f = pdf()
    const begin = await santiye.rpc('begin_document_upload', { p_project_id: izmir, p_document_id: null,
      p_meta: { title: `E2E-B5-${Date.now()}`, document_type: 'report' }, p_file_name: 'E2E rapor.pdf',
      p_size: f.bytes.length, p_mime: 'application/pdf', p_sha256: f.sha })
    expect(begin.error, begin.error?.message).toBeNull()
    voidAfter.push(begin.data.document_id)
    expect(begin.data.storage_path.startsWith(`${izmir}/`)).toBe(true)

    // Başka bir yola yükleme politikada reddedilir
    const wrong = await santiye.storage.from(BUCKET).upload(`${izmir}/${begin.data.document_id}/baska.pdf`, f.bytes, { contentType: 'application/pdf' })
    expect(wrong.error).toBeTruthy()

    const up = await santiye.storage.from(BUCKET).upload(begin.data.storage_path, f.bytes, { contentType: 'application/pdf' })
    expect(up.error, up.error?.message).toBeNull()
    const done = await santiye.rpc('complete_document_upload', { p_revision_id: begin.data.revision_id })
    expect(done.error, done.error?.message).toBeNull()

    expect((await pm.storage.from(BUCKET).createSignedUrl(begin.data.storage_path, 60)).error).toBeNull()
    expect((await muhasebe.storage.from(BUCKET).createSignedUrl(begin.data.storage_path, 60)).error).toBeTruthy()

    // Aynı dosya ikinci kez: duplicate
    const dup = await santiye.rpc('begin_document_upload', { p_project_id: izmir, p_document_id: null,
      p_meta: { title: 'x', document_type: 'report' }, p_file_name: 'a.pdf', p_size: f.bytes.length, p_mime: 'application/pdf', p_sha256: f.sha })
    expect(dup.error?.message).toBe('duplicate')

    // Hazır dosya silinemez, güncellenemez
    expect((await santiye.storage.from(BUCKET).remove([begin.data.storage_path])).data?.length ?? 0).toBe(0)
    expect((await santiye.storage.from(BUCKET).update(begin.data.storage_path, f.bytes, { contentType: 'application/pdf' })).error).toBeTruthy()
  })

  test('başka projede yükleme başlatılamaz; izinsiz tür ve boyut reddedilir', async () => {
    const f = pdf()
    const base = { p_document_id: null, p_meta: { title: 'x', document_type: 'report' }, p_sha256: f.sha }
    expect((await santiye.rpc('begin_document_upload', { ...base, p_project_id: kayseri, p_file_name: 'a.pdf', p_size: 10, p_mime: 'application/pdf' })).error?.message).toBe('forbidden')
    expect((await santiye.rpc('begin_document_upload', { ...base, p_project_id: izmir, p_file_name: 'a.exe', p_size: 10, p_mime: 'application/octet-stream' })).error?.message).toBe('validation')
    expect((await santiye.rpc('begin_document_upload', { ...base, p_project_id: izmir, p_file_name: 'a.pdf', p_size: 60 * 1024 * 1024, p_mime: 'application/pdf' })).error?.message).toBe('validation')
  })

  test('yarım kalan yükleme iptal edilir ve dosyası silinebilir', async () => {
    const f = pdf()
    const begin = await pm.rpc('begin_document_upload', { p_project_id: izmir, p_document_id: null,
      p_meta: { title: `E2E-B5-iptal-${Date.now()}`, document_type: 'report' }, p_file_name: 'iptal.pdf',
      p_size: f.bytes.length, p_mime: 'application/pdf', p_sha256: f.sha })
    expect(begin.error).toBeNull()
    voidAfter.push(begin.data.document_id)
    await pm.storage.from(BUCKET).upload(begin.data.storage_path, f.bytes, { contentType: 'application/pdf' })
    const ab = await pm.rpc('abort_document_upload', { p_revision_id: begin.data.revision_id })
    expect(ab.data.delete_file).toBe(true)
    const rm = await pm.storage.from(BUCKET).remove([begin.data.storage_path])
    expect(rm.error).toBeNull()
    expect(rm.data.length).toBe(1)
  })

  test('kullanım raporu yalnızca admin', async () => {
    expect((await pm.rpc('get_storage_usage')).error?.message).toBe('forbidden')
    expect((await admin.rpc('get_storage_usage')).data.total_bytes).toBeGreaterThanOrEqual(0)
  })
})
