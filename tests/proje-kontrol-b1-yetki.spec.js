// Proje Kontrol Faz B · B1 (register_permissions) — TEST TASLAĞI.
// SQL: docs/proje-kontrol/taslak-sql/b1_register_permissions.sql (UYGULANMADI). Paket canlıda yoksa kendini atlar.
// Yazma yapmaz; yalnızca okuma ve reddedilmesi gereken çağrılar.
import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

test.describe('Proje Kontrol B1 — register yetki matrisi', () => {
  let admin, pm, santiye, muhasebe, anon
  let izmir, kayseri
  let applied = false

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    anon = makeClient()
    izmir = process.env.TEST_PROJECT_IZMIR
    kayseri = process.env.TEST_PROJECT_KAYSERI
    applied = !(await admin.rpc('get_my_register_permissions', { p_project_id: izmir })).error
  })
  test.beforeEach(() => test.skip(!applied, 'B1 henüz uygulanmadı (get_my_register_permissions yok)'))

  test('her rol tasarım 4.3 matrisini görür', async () => {
    const perms = async c => (await c.rpc('get_my_register_permissions', { p_project_id: izmir })).data
    const a = await perms(admin), p = await perms(pm), s = await perms(santiye), m = await perms(muhasebe)
    expect(a.registers.rfi).toMatchObject({ view: true, create: true, edit: true, approve: true, delete: true })
    expect(p.registers.rfi).toMatchObject({ view: true, create: true, edit: true, approve: true, delete: false })
    expect(s.registers.rfi).toMatchObject({ view: true, create: true, edit: true, approve: false, edit_scope: 'own' })
    expect(s.registers.decision).toMatchObject({ view: true, create: false })
    expect(m.registers.rfi.view).toBe(false)
    expect(m.registers.change.view).toBe(true)
  })

  test('erişimi olmayan projede hiçbir eylem açık değil', async () => {
    const { data } = await santiye.rpc('get_my_register_permissions', { p_project_id: kayseri })
    expect(data.project_access).toBe(false)
    for (const r of Object.values(data.registers)) expect(r.view || r.create || r.edit || r.approve || r.delete).toBe(false)
  })

  test('matrisi yalnızca admin değiştirir; tabloya doğrudan yazılamaz', async () => {
    const args = { p_role_key: 'santiye_sefi', p_register_type: 'rfi', p_view: true, p_create: true,
      p_edit: true, p_approve: true, p_delete: true, p_edit_scope: 'all' }
    for (const c of [pm, santiye, muhasebe]) {
      const { error } = await c.rpc('set_register_permission', args)
      expect(error?.message).toBe('forbidden')
    }
    const upd = await admin.from('register_permissions').update({ can_approve: true }).eq('role_key', 'santiye_sefi').select()
    expect(Boolean(upd.error) || upd.data.length === 0).toBe(true)
  })

  test('anon yetki fonksiyonlarını ve tabloları kullanamaz', async () => {
    expect((await anon.rpc('get_my_register_permissions', { p_project_id: izmir })).error).toBeTruthy()
    const r = await anon.from('register_permissions').select('*').limit(1)
    expect(Boolean(r.error) || r.data.length === 0).toBe(true)
  })
})
