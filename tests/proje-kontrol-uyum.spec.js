// Proje Kontrol — uyum migration'ı testi (TASLAK; uyum migration'ı canlıya uygulanmadan ÇALIŞTIRMA).
// Plan: docs/proje-kontrol/uyum-migration-plani.md · SQL: docs/proje-kontrol/taslak-sql/uyum_migration_taslak.sql
//
// İki grup:
//  1) Hemen çalışabilir: yeni adlar ve G-01 yetki modeli (authenticated yalnızca okur, anon hiçbir şey),
//     eski `actions` adının kalmadığı, sayaç/numara fonksiyonuna doğrudan erişim olmadığı, is_critical'ın gittiği.
//     Bu testler yazma YAPMAZ; tüm yazma denemelerinin reddedilmesi beklenir, fikstür oluşmaz.
//  2) test.fixme: numara üretimi (1/9/10/999/1000/1001), 20 eşzamanlı numara, ikinci is_current reddi.
//     G-01 yüzünden authenticated register tablolarına yazamıyor; yazma yolu Faz B'nin
//     save_register_record / create_document_record RPC'leri (tasarim.md §6). O RPC'ler gelene kadar bu
//     davranışlar docs/proje-kontrol/taslak-sql/uyum_migration_dogrulama.sql ile (geri alınan tek DO bloğu)
//     doğrulanır. RPC adları ve parametreleri Faz B'de kesinleşince fixme kaldırılıp gövdeler güncellenir.
import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

const REGISTER_TABLES = ['project_actions', 'documents', 'document_revisions', 'drawings',
  'rfis', 'decisions', 'technical_submittals', 'material_approvals', 'register_status_history']

const denied = ({ data, error }) => Boolean(error) || (Array.isArray(data) && data.length === 0)

test.describe('Proje Kontrol — uyum migration yetkileri', () => {
  let admin, santiye, muhasebe, pm, anon
  let izmir
  let applied = false

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    anon = makeClient()
    izmir = process.env.TEST_PROJECT_IZMIR
    applied = !(await admin.from('project_actions').select('id').limit(1)).error
  })

  // Migration uygulanana kadar tam regresyon setini kırmasın diye kendini atlar.
  test.beforeEach(() => {
    test.skip(!applied, 'uyum migration\'ı henüz uygulanmadı (project_actions yok)')
  })

  test('eski actions adı yok, project_actions var', async () => {
    const old = await admin.from('actions').select('id').limit(1)
    expect(old.error, 'actions tablosu hâlâ erişilebilir').toBeTruthy()
    const renamed = await admin.from('project_actions').select('id').limit(1)
    expect(renamed.error).toBeNull()
  })

  test('anon hiçbir register tablosunu, ayarı ve sayacı okuyamaz', async () => {
    for (const table of [...REGISTER_TABLES, 'project_register_settings', 'project_register_counters']) {
      expect(denied(await anon.from(table).select('*').limit(1)), table).toBe(true)
    }
  })

  test('authenticated register tablolarını okuyabilir (G-01: SELECT kalır)', async () => {
    for (const client of [admin, pm, santiye, muhasebe]) {
      for (const table of REGISTER_TABLES) {
        const { error } = await client.from(table).select('id').limit(1)
        expect(error, `${table}: ${error?.message}`).toBeNull()
      }
    }
  })

  test('hiçbir rol register tablolarına doğrudan yazamaz (G-01 korunuyor)', async () => {
    const rows = {
      project_actions: { project_id: izmir, action_no: '', title: 'E2E-UYUM yazma denemesi' },
      documents: { project_id: izmir, document_no: '', title: 'E2E-UYUM yazma denemesi' },
      document_revisions: { project_id: izmir, document_id: '00000000-0000-0000-0000-000000000000', revision_no: 'R00', revision_status: 'ifr' },
      drawings: { project_id: izmir, document_id: '00000000-0000-0000-0000-000000000000' },
      rfis: { project_id: izmir, rfi_no: '', subject: 'E2E-UYUM', question: 'q' },
    }
    for (const client of [admin, pm, santiye]) {
      for (const [table, row] of Object.entries(rows)) {
        const ins = await client.from(table).insert(row).select('id')
        expect(ins.error, `${table} insert reddedilmeliydi`).toBeTruthy()
        expect(denied(await client.from(table).update({ project_id: izmir }).eq('project_id', izmir).select('id')), `${table} update`).toBe(true)
        expect(denied(await client.from(table).delete().eq('project_id', izmir).select('id')), `${table} delete`).toBe(true)
      }
    }
  })

  test('proje kodu ayarını okuyabilir ama yazamaz; sayaca hiç erişemez', async () => {
    const read = await pm.from('project_register_settings').select('project_id, prefix')
    expect(read.error).toBeNull()
    expect((await pm.from('project_register_settings').insert({ project_id: izmir, prefix: 'ZZE' })).error).toBeTruthy()
    expect((await admin.from('project_register_settings').insert({ project_id: izmir, prefix: 'ZZE' })).error).toBeTruthy()
    expect((await admin.from('project_register_counters').select('*').limit(1)).error).toBeTruthy()
  })

  test('next_register_no doğrudan çağrılamaz (numara tüketilemez)', async () => {
    for (const client of [anon, santiye, admin]) {
      const { error } = await client.rpc('next_register_no', { p_project_id: izmir, p_register: 'RFI' })
      expect(error).toBeTruthy()
    }
  })

  test('project_tasks.is_critical kaldırıldı, tablo okunmaya devam ediyor', async () => {
    expect((await admin.from('project_tasks').select('is_critical').limit(1)).error).toBeTruthy()
    const { data, error } = await admin.from('project_tasks').select('id').eq('project_id', izmir).limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  // ── Faz B yazma RPC'si gelince açılacak testler ──

  test.fixme('numara üretimi: 1., 9., 10., 999., 1000., 1001. kayıt kırpılmıyor ve çakışmıyor', async () => {
    // Faz B: save_register_record('rfi', izmir, null, {...}) ile 1001 kayıt açmak yerine sayaç ara
    // değerlere test-only bir yolla taşınamaz (sayaç tablosuna erişim yok). Bu yüzden yalnızca
    // sıradaki birkaç numarayı ve biçimi doğrular; 999/1000/1001 sınırı SQL doğrulama betiğinde.
    const prefix = (await pm.from('project_register_settings').select('prefix').eq('project_id', izmir).single()).data?.prefix
    expect(prefix).toBeTruthy()
    const nos = []
    for (let i = 0; i < 3; i++) {
      const { data, error } = await pm.rpc('save_register_record', {
        p_register_type: 'rfi', p_project_id: izmir, p_id: null,
        p_data: { subject: `E2E-UYUM-${Date.now()}-${i}`, question: 'q' },
      })
      expect(error).toBeNull()
      nos.push(data.register_no)
    }
    for (const no of nos) expect(no).toMatch(new RegExp(`^RFI-${prefix}-\\d{4,}$`))
    const seq = nos.map(no => Number(no.split('-').pop()))
    expect(seq[1]).toBe(seq[0] + 1)
    expect(seq[2]).toBe(seq[1] + 1)
    // TODO(Faz B): afterAll'da bu kayıtları void yap (silme yerine), numaralar boşluksuz kalır.
  })

  test.fixme('20 eşzamanlı numara üretimi benzersiz ve ardışık', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      pm.rpc('save_register_record', {
        p_register_type: 'rfi', p_project_id: izmir, p_id: null,
        p_data: { subject: `E2E-UYUM-PAR-${Date.now()}-${i}`, question: 'q' },
      })))
    for (const r of results) expect(r.error, r.error?.message).toBeNull()
    const seq = results.map(r => Number(r.data.register_no.split('-').pop())).sort((a, b) => a - b)
    expect(new Set(seq).size).toBe(20)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBe(seq[i - 1] + 1)
  })

  test.fixme('document_revisions: ikinci is_current reddedilir', async () => {
    // Faz B: create_document_record + revizyon ekleme RPC'si. Güncel revizyonu değiştiren RPC önce
    // eskisini false yapmalı; doğrudan ikinci true denemesi unique ihlali vermeli
    // (index: document_revisions_one_current).
  })
})
