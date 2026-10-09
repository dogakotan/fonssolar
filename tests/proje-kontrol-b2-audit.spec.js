// Proje Kontrol Faz B · B2 (register_audit, FK indeksleri, G-13) — TEST TASLAĞI.
// SQL: docs/proje-kontrol/taslak-sql/b2_register_audit_indexes.sql (UYGULANMADI). Paket canlıda yoksa kendini atlar.
// İndeks ve G-13 yetkileri katalog düzeyinde b2_dogrulama.sql ile doğrulanır (PostgREST TRUNCATE'i açmaz).
// Audit içeriği B3 yazma RPC'si gerektirdiğinden o test B3 yoksa atlanır.
import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

test.describe('Proje Kontrol B2 — register_audit', () => {
  let admin, pm, santiye, muhasebe, anon
  let izmir
  let applied = false
  let writeRpc = false
  const created = []

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    anon = makeClient()
    izmir = process.env.TEST_PROJECT_IZMIR
    applied = !(await admin.from('register_audit').select('id').limit(1)).error
    writeRpc = applied && (await santiye.rpc('save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null, p_data: {} })).error?.message === 'validation'
  })
  test.beforeEach(() => test.skip(!applied, 'B2 henüz uygulanmadı (register_audit yok)'))

  test.afterAll(async () => {
    // Taslak RFI'ler: admin siler (silme yalnızca taslakta mümkün)
    for (const id of created) await admin.rpc('delete_register_record', { p_register_type: 'rfi', p_id: id })
  })

  test('hiçbir rol audit tablosuna yazamaz, anon okuyamaz', async () => {
    for (const c of [admin, pm, santiye]) {
      const ins = await c.from('register_audit').insert({ project_id: izmir, table_name: 'rfis', record_id: crypto.randomUUID(), action: 'insert' })
      expect(ins.error).toBeTruthy()
      const del = await c.from('register_audit').delete().eq('project_id', izmir).select('id')
      expect(Boolean(del.error) || del.data.length === 0).toBe(true)
    }
    const r = await anon.from('register_audit').select('id').limit(1)
    expect(Boolean(r.error) || r.data.length === 0).toBe(true)
  })

  test('kayıt düzenlenince yalnızca değişen alan yazılır; muhasebe göremez', async () => {
    test.skip(!writeRpc, 'B3 yazma RPC\'si yok')
    const subject = `E2E-B2-${Date.now()}`
    const { data } = await santiye.rpc('save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null, p_data: { subject, question: 'q' } })
    created.push(data.id)
    await santiye.rpc('save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: data.id, p_data: { description: 'ilk açıklama' } })
    const { data: rows } = await santiye.from('register_audit').select('action, changed_fields').eq('record_id', data.id).order('id')
    expect(rows.map(r => r.action)).toEqual(['insert', 'update'])
    expect(Object.keys(rows[1].changed_fields)).toEqual(['description'])
    expect(rows[1].changed_fields.description).toEqual([null, 'ilk açıklama'])
    const m = await muhasebe.from('register_audit').select('id').eq('record_id', data.id)
    expect(m.data?.length ?? 0).toBe(0)
  })
})
