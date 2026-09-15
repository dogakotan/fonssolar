import { test, expect } from '@playwright/test'
import { loginUi, signIn } from './helpers.js'

// 09.09.2026'da eklenen "Onaylar" alt-sekmesi (Satın Alma) ve Malzeme Listesi'ndeki
// "Talep Eden" filtresi hiç kalıcı test kapsamında değildi (yalnızca geçici bir
// testle bir kerelik doğrulanıp silinmişti, bkz. CLAUDE.md). Bu dosya ikisini de
// gerçek UI etkileşimiyle doğrular: proje yöneticisi Malzeme Listesi'nde talep
// edene göre filtreleyebiliyor mu, "Onaylar" sekmesinde yalnızca kendisine
// yönlendirilen (approver_role='proje_yoneticisi') talebi görüp onaylayabiliyor
// mu, admin'e yönlendirilmiş bir talebi görmüyor mu, ve admin kendi talebini
// "Onaylar" sekmesinde görüp reddedebiliyor mu.
async function openMenu(page, name) {
  await page.getByText(name, { exact: true }).first().click()
}

const markerOsman = `E2E_ONAYLAR_OSM_${Date.now()}`
const markerAdmin = `E2E_ONAYLAR_ADM_${Date.now()}`

test.describe.serial('Malzeme Listesi "Onaylar" alt-sekmesi ve "Talep Eden" filtresi', () => {
  let admin, osman
  let itemOsmanId, itemAdminId, changeOsmanId, changeAdminId

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: osman } = await signIn(process.env.TEST_OSMANKARADOGAN_EMAIL, process.env.TEST_OSMANKARADOGAN_PASSWORD))

    const { data: itemOsman, error: e1 } = await admin.from('procurement_items').insert({
      project_id: process.env.TEST_PROJECT_IZMIR, equipment: markerOsman, unit: 'Adet', category: 'diger', planned_qty: 10, quantity: '10',
    }).select('id').single()
    expect(e1).toBeNull()
    itemOsmanId = itemOsman.id

    const { data: itemAdmin, error: e2 } = await admin.from('procurement_items').insert({
      project_id: process.env.TEST_PROJECT_IZMIR, equipment: markerAdmin, unit: 'Adet', category: 'diger', planned_qty: 10, quantity: '10',
    }).select('id').single()
    expect(e2).toBeNull()
    itemAdminId = itemAdmin.id

    // Osman Karadoğan admin hesabı ama approver_role hesaplaması onu proje
    // yöneticisine yönlendiriyor (bkz. CLAUDE.md 09.09.2026, 1. tur).
    const { data: changeOsman, error: e3 } = await osman.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: itemOsmanId, p_new_planned_qty: 25, p_note: markerOsman,
    })
    expect(e3).toBeNull()
    changeOsmanId = changeOsman

    // Genel admin hesabından açılan talep 'admin'de kalır.
    const { data: changeAdmin, error: e4 } = await admin.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: itemAdminId, p_new_planned_qty: 30, p_note: markerAdmin,
    })
    expect(e4).toBeNull()
    changeAdminId = changeAdmin
  })

  test.afterAll(async () => {
    if (changeOsmanId) await admin.from('procurement_item_change_requests').delete().eq('id', changeOsmanId)
    if (changeAdminId) await admin.from('procurement_item_change_requests').delete().eq('id', changeAdminId)
    if (itemOsmanId) await admin.from('procurement_items').delete().eq('id', itemOsmanId)
    if (itemAdminId) await admin.from('procurement_items').delete().eq('id', itemAdminId)
  })

  test('proje yöneticisi Malzeme Listesi\'nde "Talep Eden" filtresiyle yalnızca ilgili kalemi görür', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await openMenu(page, 'Projeler')
    await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
    await page.getByRole('main').getByRole('button', { name: 'Satın Alma', exact: true }).click()
    await page.getByRole('button', { name: 'Malzeme Listesi', exact: true }).click()

    await expect(page.getByRole('row').filter({ hasText: markerOsman })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: markerAdmin })).toBeVisible()

    const requesterSelect = page.getByTitle('Bekleyen bir değişiklik/ekleme talebi olan kalemleri talep edene göre filtrele')
    await expect(requesterSelect).toBeVisible()
    await requesterSelect.selectOption({ label: 'Osman Karadoğan' })

    await expect(page.getByRole('row').filter({ hasText: markerOsman })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: markerAdmin })).toHaveCount(0)
  })

  test('proje yöneticisi "Onaylar" sekmesinde yalnızca kendisine yönlendirilen talebi görür ve onaylayabilir', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await openMenu(page, 'Projeler')
    await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
    await page.getByRole('main').getByRole('button', { name: 'Satın Alma', exact: true }).click()
    await page.getByRole('button', { name: 'Onaylar', exact: true }).click()

    await expect(page.getByText(markerOsman, { exact: false }).first()).toBeVisible()
    // Panel "requester_name · note" birleşik bir metin olarak render ediyor
    // (BekleyenDegisikliklerPanel) — exact:true tüm düğüm metnini istediğinden
    // burada kasıtlı olarak substring (exact:false) eşleşmesi kullanılıyor.
    await expect(page.getByText('Osman Karadoğan', { exact: false })).toBeVisible()
    // admin'in kendi talebi (approver_role='admin') proje yöneticisine hiç görünmemeli.
    await expect(page.getByText(markerAdmin, { exact: false })).toHaveCount(0)

    await page.getByRole('button', { name: 'Onayla', exact: true }).click()

    await expect.poll(async () => {
      const { data } = await admin.from('procurement_items').select('planned_qty').eq('id', itemOsmanId).single()
      return Number(data?.planned_qty)
    }).toBe(25)

    await expect(page.getByText(markerOsman, { exact: false })).toHaveCount(0)
  })

  test('admin "Onaylar" sekmesinde kendi talebini görür ve reddedebilir', async ({ page }) => {
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    await openMenu(page, 'Projeler')
    await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
    await page.getByRole('main').getByRole('button', { name: 'Satın Alma', exact: true }).click()
    await page.getByRole('button', { name: 'Onaylar', exact: true }).click()

    await expect(page.getByText(markerAdmin, { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Reddet', exact: true }).click()

    await expect.poll(async () => {
      const { data } = await admin.from('procurement_item_change_requests').select('status').eq('id', changeAdminId).single()
      return data?.status
    }).toBe('reddedildi')
  })
})
