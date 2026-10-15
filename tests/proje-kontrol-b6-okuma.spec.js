// Proje Kontrol Faz B · B6 (okuma görünümleri ve RPC'leri) — TEST TASLAĞI.
// SQL: docs/proje-kontrol/taslak-sql/b6_register_read_rpcs.sql (UYGULANMADI). Paket canlıda yoksa kendini atlar.
// Veri B3 RPC'siyle İzmir test projesinde açılır; sonda taslaklar admin tarafından silinir.
import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

test.describe('Proje Kontrol B6 — register okuma', () => {
  let admin, santiye, muhasebe, anon
  let izmir, kayseri
  let applied = false
  const ids = []
  let marker

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    anon = makeClient()
    izmir = process.env.TEST_PROJECT_IZMIR
    kayseri = process.env.TEST_PROJECT_KAYSERI
    applied = !(await santiye.rpc('get_register_overview', { p_project_id: izmir })).error
    if (!applied) return
    marker = `E2E-B6-${Date.now()}`
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    for (const extra of [{ due_date: yesterday }, {}]) {
      const { data } = await santiye.rpc('save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null,
        p_data: { subject: `${marker} ${ids.length + 1}`, question: 'q', ...extra } })
      ids.push(data.id)
    }
  })
  test.beforeEach(() => test.skip(!applied, 'B6 henüz uygulanmadı (get_register_overview yok)'))

  test.afterAll(async () => {
    for (const id of ids) await admin.rpc('delete_register_record', { p_register_type: 'rfi', p_id: id })
  })

  test('liste: arama, filtre, sayfalama, termin', async () => {
    const all = await santiye.rpc('get_register_list', { p_project_id: izmir, p_register_type: 'rfi', p_search: marker })
    expect(all.error).toBeNull()
    expect(all.data.total).toBe(2)
    expect(all.data.items[0].register_no).toMatch(/^RFI-/)
    const page = await santiye.rpc('get_register_list', { p_project_id: izmir, p_register_type: 'rfi', p_search: marker,
      p_sort: 'register_no', p_limit: 1, p_offset: 1 })
    expect(page.data.items.length).toBe(1)
    const overdue = await santiye.rpc('get_register_list', { p_project_id: izmir, p_register_type: 'rfi', p_search: marker, p_filters: { overdue: true } })
    expect(overdue.data.items.map(i => i.id)).toEqual([ids[0]])
    expect((await santiye.rpc('get_register_list', { p_project_id: izmir, p_register_type: 'rfi', p_sort: 'id; drop' })).error?.message).toBe('validation')
  })

  test('detay ve audit; başka proje not_found', async () => {
    const d = await santiye.rpc('get_register_detail', { p_register_type: 'rfi', p_id: ids[0] })
    expect(d.error).toBeNull()
    expect(d.data.record.register_no).toMatch(/^RFI-/)
    expect(d.data.permissions.can_edit_this).toBe(true)
    expect(d.data.allowed_status_transitions).toEqual([])
    expect((await santiye.rpc('get_register_audit', { p_register_type: 'rfi', p_id: ids[0] })).data.items.length).toBeGreaterThanOrEqual(1)
    const overview = await santiye.rpc('get_register_overview', { p_project_id: izmir })
    expect(overview.data.registers.rfi.overdue).toBeGreaterThanOrEqual(1)
    expect((await santiye.rpc('get_register_list', { p_project_id: kayseri, p_register_type: 'rfi' })).error?.message).toBe('forbidden')
  })

  test('muhasebe ve anon register verisi göremez', async () => {
    expect((await muhasebe.rpc('get_register_list', { p_project_id: izmir, p_register_type: 'rfi' })).error?.message).toBe('forbidden')
    expect((await muhasebe.rpc('get_register_overview', { p_project_id: izmir })).data.registers).toEqual({})
    expect((await muhasebe.from('vw_reg_items').select('id').eq('project_id', izmir)).data?.length ?? 0).toBe(0)
    expect((await muhasebe.rpc('get_register_detail', { p_register_type: 'rfi', p_id: ids[0] })).error?.message).toBe('forbidden')
    const a = await anon.from('vw_reg_items').select('id').limit(1)
    expect(Boolean(a.error) || a.data.length === 0).toBe(true)
  })
})
