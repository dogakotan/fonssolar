import { test, expect } from '@playwright/test'
import { loginUi, signIn } from './helpers.js'

// Genel/Detaylı İş Planı hiyerarşi ayrımının gerçek gruplama mantığı
// (buildGroupTree, group_label'daki " › " ayracına göre çok seviyeli ağaç)
// hiç test kapsamında değildi — CLAUDE.md'nin belgelediği 09.09.2026 (7-8. tur)
// regresyonunu doğrudan doğrular: Genel İş Planı bir ara sürümde group_label'ın
// yalnızca İLK segmentine göre gruplayıp aynı üst başlık altındaki farklı
// alt dalları (ör. Inverter-1 › AC ile Inverter-2 › AC) tek bir kovada
// birleştiriyordu. Bu test, kendi izole (marker'lı, gerçek proje verisiyle
// çakışmayan) 3 satırlık bir görev seti kurup Genel İş Planı'nda üç seviyenin
// de (üst / inverter / AC-DC) AYRI başlıklar olarak render edildiğini,
// aynı isimli iki farklı dalın (iki "AC" yaprağı) birbirine karışmadığını
// doğrudan tarayıcıda doğruluyor.
async function openMenu(page, name) {
  await page.getByText(name, { exact: true }).first().click()
}

const TOP = `E2ISP${Date.now()}`
const INV1 = `${TOP}-INV1`
const INV2 = `${TOP}-INV2`
const AC = `${TOP}-AC`
const DC = `${TOP}-DC`

test.describe.serial('İş Planı hiyerarşi gruplaması (buildGroupTree)', () => {
  let admin
  const taskIds = []
  const projectId = process.env.TEST_PROJECT_IZMIR

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))

    const rows = [
      { task_code: `${TOP}-A`, task_name: `${TOP} görev A`, group_label: `${TOP} › ${INV1} › ${AC}` },
      { task_code: `${TOP}-B`, task_name: `${TOP} görev B`, group_label: `${TOP} › ${INV1} › ${DC}` },
      { task_code: `${TOP}-C`, task_name: `${TOP} görev C`, group_label: `${TOP} › ${INV2} › ${AC}` },
    ].map(r => ({
      ...r,
      project_id: projectId,
      category: 'elektrik_dc',
      planned_start: '2026-09-01',
      planned_end: '2026-09-30',
      status: 'devam_ediyor',
    }))

    const { data, error } = await admin.from('project_tasks').insert(rows).select('id')
    expect(error).toBeNull()
    taskIds.push(...data.map(r => r.id))
  })

  test.afterAll(async () => {
    if (taskIds.length) await admin.from('project_tasks').delete().in('id', taskIds)
  })

  test('Genel İş Planı çok seviyeli group_label\'ı tek kovaya indirgemeden, her dalı ayrı başlık olarak gösterir', async ({ page }) => {
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    await openMenu(page, 'Projeler')
    await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
    await page.getByRole('main').getByRole('button', { name: 'İş Planı', exact: true }).click()

    // Üst segment: 3 görevin tamamını kapsayan tek bir kök başlık.
    await expect(page.getByRole('button', { name: new RegExp(`${TOP}\\b.*3 görev`) })).toBeVisible()

    // İki ayrı inverter dalı — REGRESYONDA bu ikisi hiç render edilmiyordu,
    // tüm görevler doğrudan kök başlığın altına düz listeleniyordu.
    await expect(page.getByRole('button', { name: new RegExp(`${INV1}\\b.*2 görev`) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`${INV2}\\b.*1 görev`) })).toBeVisible()

    // Aynı isimli ("AC") iki farklı yaprak düğüm — biri Inverter-1, biri
    // Inverter-2 altında — birbirine karışmadan İKİ AYRI başlık olarak
    // görünmeli (regresyonda tek bir düz kova olduğundan bu ayrım hiç yoktu).
    await expect(page.getByRole('button', { name: new RegExp(`${AC}\\b.*1 görev`) })).toHaveCount(2)
    await expect(page.getByRole('button', { name: new RegExp(`${DC}\\b.*1 görev`) })).toHaveCount(1)
  })

  test('Detaylı İş Planı da aynı hiyerarşiyi (aynı buildGroupTree ağacını) kullanır', async ({ page }) => {
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    await openMenu(page, 'Projeler')
    await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
    await page.getByRole('main').getByRole('button', { name: 'İş Planı', exact: true }).click()
    await page.getByRole('button', { name: 'Detaylı İş Planı', exact: true }).click()

    // TabIsPlaniDetay.jsx'teki grup başlıkları da Genel'le AYNI buildGroupTree
    // ağacını kullanır — yalnızca "X görev | %Y" yerine "X görev · %Y" gösterir
    // (bkz. buildDetayRows). Aynı locator deseni, generic getByText yerine
    // buton bazlı — TOP metni ayrıca kapalı bir <select><option> içinde de
    // (grup filtre dropdown'u) geçtiğinden getByText o gizli option'ı
    // yakalayıp yanlış pozitif/negatife yol açabiliyordu.
    await expect(page.getByRole('button', { name: new RegExp(`${TOP}\\b.*3 görev`) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`${INV1}\\b.*2 görev`) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`${INV2}\\b.*1 görev`) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`${AC}\\b.*1 görev`) })).toHaveCount(2)
    await expect(page.getByRole('button', { name: new RegExp(`${DC}\\b.*1 görev`) })).toHaveCount(1)
  })
})
