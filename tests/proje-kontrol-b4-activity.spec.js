// Proje Kontrol Faz B · B4 (admin_correct_task_activity_id) — TEST TASLAĞI.
// SQL: docs/proje-kontrol/taslak-sql/b4_identity_guard_admin_fix.sql (UYGULANMADI). Paket canlıda yoksa kendini atlar.
// İzmir test projesinde activity_id'si boş bir görev geçici olarak doldurulur; sonda RPC ile NULL'a döndürülür.
import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

test.describe('Proje Kontrol B4 — Activity ID düzeltmesi', () => {
  let admin, pm
  let izmir
  let applied = false
  let taskId = null

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    izmir = process.env.TEST_PROJECT_IZMIR
    const probe = await admin.rpc('admin_correct_task_activity_id', { p_task_id: crypto.randomUUID(), p_new_activity_id: 'X', p_reason: 'yoklama' })
    applied = probe.error?.message === 'not_found'
    if (!applied) return
    const { data } = await admin.from('project_tasks').select('id').eq('project_id', izmir).is('activity_id', null).limit(1)
    taskId = data?.[0]?.id ?? null
    if (taskId) await admin.from('project_tasks').update({ activity_id: `E2E-B4-${Date.now()}` }).eq('id', taskId)
  })
  test.beforeEach(() => test.skip(!applied || !taskId, 'B4 uygulanmadı ya da boş activity_id\'li test görevi yok'))

  test.afterAll(async () => {
    if (applied && taskId) await admin.rpc('admin_correct_task_activity_id', { p_task_id: taskId, p_new_activity_id: null, p_reason: 'E2E temizlik' })
  })

  test('atanmış Activity ID doğrudan değiştirilemez', async () => {
    const { error } = await admin.from('project_tasks').update({ activity_id: 'E2E-B4-DOGRUDAN' }).eq('id', taskId)
    expect(error?.message).toContain('Atanmış Activity ID değiştirilemez')
  })

  test('yalnızca admin, gerekçeyle ve geçerli biçimle düzeltir', async () => {
    const call = (c, v, reason) => c.rpc('admin_correct_task_activity_id', { p_task_id: taskId, p_new_activity_id: v, p_reason: reason })
    expect((await call(pm, 'E2E-B4-YENI', 'neden')).error?.message).toBe('forbidden')
    expect((await call(admin, 'E2E-B4-YENI', '')).error?.message).toBe('validation')
    expect((await call(admin, 'kötü id!', 'neden')).error?.message).toBe('validation')
    const ok = await call(admin, 'E2E-B4-YENI', 'yanlış girilmiş')
    expect(ok.error).toBeNull()
    expect(ok.data.changed).toBe(true)
    const row = (await admin.from('project_tasks').select('activity_id').eq('id', taskId).single()).data
    expect(row.activity_id).toBe('E2E-B4-YENI')
  })
})
