// Proje Kontrol Faz B · B3 (register yazma RPC'leri, G-01 kalıcı kural) — TEST TASLAĞI.
// SQL: docs/proje-kontrol/taslak-sql/b3_register_write_rpcs.sql (UYGULANMADI). Paket canlıda yoksa kendini atlar.
// Test verisi yalnızca İzmir test projesinde açılır. Temizlik: onaylı kayıt önce yeniden açılır (taslağa döner),
// sonra admin taslağı siler. Numara sayacı geri sarılmaz: test projesinde sıra boşlukları beklenir.
// Doküman ve çizim RPC ile silinemez (void edilir) → bu dosya doküman oluşturmaz; doküman akışı b3_dogrulama.sql'de.
import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

const rpc = async (client, fn, args) => {
  const { data, error } = await client.rpc(fn, args)
  return { data, code: error?.message ?? null }
}

test.describe('Proje Kontrol B3 — yazma RPC\'leri', () => {
  let admin, pm, santiye, muhasebe, anon
  let izmir, kayseri
  let applied = false
  const cleanup = []   // { type, id }

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    anon = makeClient()
    izmir = process.env.TEST_PROJECT_IZMIR
    kayseri = process.env.TEST_PROJECT_KAYSERI
    applied = (await rpc(santiye, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null, p_data: {} })).code === 'validation'
  })
  test.beforeEach(() => test.skip(!applied, 'B3 henüz uygulanmadı (save_register_record yok)'))

  test.afterAll(async () => {
    for (const { type, id } of cleanup.reverse()) {
      await pm.rpc('reopen_register_record', { p_register_type: type, p_id: id, p_reason: 'E2E temizlik' })
      await admin.rpc('delete_register_record', { p_register_type: type, p_id: id })
    }
  })

  const newRfi = async (client, extra = {}) => {
    const r = await rpc(client, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null,
      p_data: { subject: `E2E-B3-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, question: 'q', ...extra } })
    expect(r.code, JSON.stringify(r)).toBeNull()
    cleanup.push({ type: 'rfi', id: r.data.id })
    return r.data
  }

  test('numara sunucuda atanır, dışarıdan verilen numara/durum reddedilir', async () => {
    const prefix = (await pm.from('project_register_settings').select('prefix').eq('project_id', izmir).single()).data.prefix
    const a = await newRfi(santiye)
    const b = await newRfi(santiye)
    expect(a.register_no).toMatch(new RegExp(`^RFI-${prefix}-\\d{4,}$`))
    expect(Number(b.register_no.split('-').pop())).toBe(Number(a.register_no.split('-').pop()) + 1)
    expect(a.record_state).toBe('draft')
    for (const bad of [{ rfi_no: `RFI-${prefix}-9999` }, { record_state: 'approved' }, { created_by: null }, { priority: 'zzz' }]) {
      const r = await rpc(santiye, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null,
        p_data: { subject: 'x', question: 'y', ...bad } })
      expect(r.code).toBe('validation')
    }
  })

  test('rol ve proje sınırları', async () => {
    expect((await rpc(muhasebe, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null, p_data: { subject: 'x', question: 'y' } })).code).toBe('forbidden')
    expect((await rpc(santiye, 'save_register_record', { p_register_type: 'rfi', p_project_id: kayseri, p_id: null, p_data: { subject: 'x', question: 'y' } })).code).toBe('forbidden')
    const pmRfi = await newRfi(pm)
    expect((await rpc(santiye, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: pmRfi.id, p_data: { description: 'x' } })).code).toBe('forbidden')
    expect((await muhasebe.from('rfis').select('id').eq('id', pmRfi.id)).data?.length ?? 0).toBe(0)
    expect((await anon.rpc('save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null, p_data: {} })).error).toBeTruthy()
  })

  test('G-01 kalıcı: tablolara doğrudan yazılamaz', async () => {
    for (const c of [admin, pm, santiye]) {
      const ins = await c.from('rfis').insert({ project_id: izmir, rfi_no: '', subject: 's', question: 'q' }).select('id')
      expect(ins.error).toBeTruthy()
    }
  })

  test('akış: taslak → onaya gönder → onay → cevap; kilit ve geçiş kuralları', async () => {
    const r = await newRfi(santiye)
    expect((await rpc(santiye, 'submit_register_record', { p_register_type: 'rfi', p_id: r.id })).data.record_state).toBe('pending_approval')
    expect((await rpc(santiye, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: r.id, p_data: { description: 'x' } })).code).toBe('invalid_state')
    expect((await rpc(santiye, 'approve_register_record', { p_register_type: 'rfi', p_id: r.id })).code).toBe('forbidden')
    expect((await rpc(pm, 'approve_register_record', { p_register_type: 'rfi', p_id: r.id, p_note: 'uygun' })).data.record_state).toBe('approved')
    expect((await rpc(santiye, 'set_register_status', { p_register_type: 'rfi', p_id: r.id, p_status: 'answered' })).code).toBe('validation')
    expect((await rpc(santiye, 'set_register_status', { p_register_type: 'rfi', p_id: r.id, p_status: 'answered', p_note: 'Cevap' })).code).toBeNull()
    expect((await rpc(santiye, 'set_register_status', { p_register_type: 'rfi', p_id: r.id, p_status: 'open' })).code).toBe('invalid_state')
    const row = (await santiye.from('rfis').select('status, response, record_state, approved_by').eq('id', r.id).single()).data
    expect(row).toMatchObject({ status: 'answered', response: 'Cevap', record_state: 'approved' })
  })

  test('ret → düzeltince taslağa döner; onaylı kayıt silinmez', async () => {
    const r = await newRfi(santiye)
    await rpc(santiye, 'submit_register_record', { p_register_type: 'rfi', p_id: r.id })
    expect((await rpc(pm, 'reject_register_record', { p_register_type: 'rfi', p_id: r.id, p_reason: '' })).code).toBe('validation')
    expect((await rpc(pm, 'reject_register_record', { p_register_type: 'rfi', p_id: r.id, p_reason: 'eksik' })).data.record_state).toBe('rejected')
    expect((await rpc(santiye, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: r.id, p_data: { description: 'düzeltildi' } })).data.record_state).toBe('draft')
    await rpc(santiye, 'submit_register_record', { p_register_type: 'rfi', p_id: r.id })
    await rpc(pm, 'approve_register_record', { p_register_type: 'rfi', p_id: r.id })
    expect((await rpc(admin, 'delete_register_record', { p_register_type: 'rfi', p_id: r.id })).code).toBe('invalid_state')
    expect((await rpc(pm, 'delete_register_record', { p_register_type: 'rfi', p_id: r.id })).code).toBe('forbidden')
  })

  test('dört göz: kararı oluşturan onaylayamaz (Karar 10, varsayılan açık)', async () => {
    const d = await rpc(pm, 'save_register_record', { p_register_type: 'decision', p_project_id: izmir, p_id: null,
      p_data: { title: `E2E-B3-karar-${Date.now()}`, decision_text: 'metin' } })
    expect(d.code).toBeNull()
    cleanup.push({ type: 'decision', id: d.data.id })
    await rpc(pm, 'submit_register_record', { p_register_type: 'decision', p_id: d.data.id })
    expect((await rpc(pm, 'approve_register_record', { p_register_type: 'decision', p_id: d.data.id })).code).toBe('forbidden')
    expect((await rpc(admin, 'approve_register_record', { p_register_type: 'decision', p_id: d.data.id })).data.record_state).toBe('approved')
  })

  test('20 eşzamanlı kayıt benzersiz ve ardışık numara alır', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      rpc(pm, 'save_register_record', { p_register_type: 'rfi', p_project_id: izmir, p_id: null,
        p_data: { subject: `E2E-B3-PAR-${Date.now()}-${i}`, question: 'q' } })))
    for (const r of results) { expect(r.code, JSON.stringify(r)).toBeNull(); cleanup.push({ type: 'rfi', id: r.data.id }) }
    const seq = results.map(r => Number(r.data.register_no.split('-').pop())).sort((a, b) => a - b)
    expect(new Set(seq).size).toBe(20)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBe(seq[i - 1] + 1)
  })
})
