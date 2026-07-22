import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

test.describe.serial('Proje kategori ağırlıkları', () => {
  let admin, santiye, projectId, originalWeights

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    projectId = process.env.TEST_PROJECT_IZMIR

    const { data, error } = await admin.from('project_category_weights')
      .select('category, weight_pct')
      .eq('project_id', projectId)
      .order('category')
    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
    originalWeights = data.map(row => ({ category: row.category, weight_pct: Number(row.weight_pct) }))
  })

  test('toplamı yüzde 100 olmayan dağılım atomik olarak reddedilir', async () => {
    const invalid = originalWeights.map((row, index) => index === 0
      ? { ...row, weight_pct: row.weight_pct + 1 }
      : row)

    const { error } = await admin.rpc('save_project_category_weights', {
      p_project_id: projectId,
      p_weights: invalid,
    })
    expect(error?.message).toContain('toplamı 100 olmalıdır')

    const { data: persisted } = await admin.from('project_category_weights')
      .select('category, weight_pct')
      .eq('project_id', projectId)
      .order('category')
    expect(persisted.map(row => ({ category: row.category, weight_pct: Number(row.weight_pct) }))).toEqual(originalWeights)
  })

  test('yetkisiz saha rolü ağırlıkları değiştiremez', async () => {
    const { error } = await santiye.rpc('save_project_category_weights', {
      p_project_id: projectId,
      p_weights: originalWeights,
    })
    expect(error?.message).toContain('değiştirme yetkiniz yok')
  })

  test('geçerli dağılım tek işlemde kaydedilir', async () => {
    const { error } = await admin.rpc('save_project_category_weights', {
      p_project_id: projectId,
      p_weights: originalWeights,
    })
    expect(error).toBeNull()

    const { data } = await admin.from('project_category_weights')
      .select('weight_pct')
      .eq('project_id', projectId)
    const total = data.reduce((sum, row) => sum + Number(row.weight_pct), 0)
    expect(total).toBeCloseTo(100, 2)
  })
})
