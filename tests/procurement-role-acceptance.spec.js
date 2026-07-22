import { test, expect } from '@playwright/test'
import { loginUi, signIn } from './helpers.js'

async function openMenu(page, name) {
  await page.getByText(name, { exact: true }).first().click()
}

test.describe('Satın alma dört rol ekran kabulü', () => {
  test('şantiye şefi bağlı projesinde belge istemeden talep formunu açar', async ({ page }) => {
    await loginUi(page, process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD)
    await openMenu(page, 'Satın Alma')
    await expect(page.getByRole('button', { name: '+ Yeni Talep', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '+ Yeni Talep', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Yeni Satın Alma Talebi' })).toBeVisible()
    const fixedProject = page.locator('select:disabled').filter({ has: page.locator('option:checked', { hasText: 'Ege Enerji İzmir GES TEST' }) })
    await expect(fixedProject).toBeVisible()
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
  })

  test('proje yöneticisi satın alma talebinde proje seçmek zorundadır', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await openMenu(page, 'Satın Alma')
    await page.getByRole('button', { name: /Yeni Satın Alma Talebi/ }).click()
    await expect(page.getByRole('heading', { name: 'Yeni Satın Alma Talebi' })).toBeVisible()
    await expect(page.getByText('Proje *', { exact: true })).toBeVisible()
    const projectSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '— Proje seçin —' }) })
    await expect(projectSelect).toBeVisible()
    expect(await projectSelect.locator('option').count()).toBeGreaterThan(1)
  })

  test('proje yöneticisi proje Excelini görür, proje finansında yalnız genel özeti görür', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await openMenu(page, 'Projeler')
    await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
    await page.getByRole('button', { name: /Dışa Aktar/ }).click()
    await expect(page.getByRole('button', { name: 'Proje Excelini İndir', exact: true })).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Finans', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Faturalar', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Onay Kuyruğu', exact: true })).toHaveCount(0)
    await expect(page.getByText('Maliyet Kalemi Özeti', { exact: true })).toBeVisible()
  })

  test('yönetici satın alma onay kuyruğunu ve finans onayını görür', async ({ page }) => {
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    await openMenu(page, 'Satın Alma')
    await expect(page.getByRole('button', { name: 'Onay Bekleyenler', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Onayla', exact: true }).first()).toBeVisible()
    await openMenu(page, 'Finans')
    await expect(page.getByRole('button', { name: 'Faturalar', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Onay Kuyruğu', exact: true })).toBeVisible()

    await openMenu(page, 'Projeler')
    await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
    await page.getByRole('button', { name: /Dışa Aktar/ }).click()
    await expect(page.getByRole('button', { name: 'Proje Excelini İndir', exact: true })).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Finans', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Faturalar', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Onay Kuyruğu', exact: true })).toBeVisible()
  })

  test('muhasebe yalnız fatura alanını görür ve fatura formunda belge alanı yoktur', async ({ page }) => {
    await loginUi(page, process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)
    await openMenu(page, 'Finans')
    await expect(page.getByRole('button', { name: 'Faturalar', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Onay Kuyruğu', exact: true })).toHaveCount(0)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
  })
})

test.describe.serial('Fatura iptali yönetici ve muhasebe ekran akışı', () => {
  const marker = `E2E_UI_CANCEL_${Date.now()}`
  let admin, muhasebe, pm
  let adminId, muhasebeId, pmId, requestId, invoiceId, supplierId
  const projectId = process.env.TEST_PROJECT_IZMIR

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;[adminId, muhasebeId, pmId] = await Promise.all(
      [admin, muhasebe, pm].map(async client => (await client.auth.getUser()).data.user.id),
    )
    supplierId = (await pm.from('suppliers').select('id').limit(1).single()).data.id
    const { data: createdId, error: createError } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: projectId, p_title: marker, p_urgency: 'normal', p_category: 'diger',
      p_request_note: marker, p_requested_by: pmId,
      p_items: [{ name: marker, quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(createError).toBeNull()
    requestId = createdId
    expect((await admin.from('purchase_requests').update({ status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString() }).eq('id', requestId)).error).toBeNull()
    expect((await pm.from('purchase_requests').update({ supplier_id: supplierId, purchase_date: new Date().toISOString().slice(0, 10), purchased_by: pmId }).eq('id', requestId)).error).toBeNull()
    const { data: invoice, error: invoiceError } = await muhasebe.from('invoices').insert({
      project_id: projectId, purchase_request_id: requestId, supplier_id: supplierId,
      invoice_no: marker, invoice_date: new Date().toISOString().slice(0, 10), amount: 100,
      vat_rate: 20, category: 'diger', description: marker, source: 'satin_alma',
      status: 'bekliyor', created_by: muhasebeId,
    }).select('id').single()
    expect(invoiceError).toBeNull()
    invoiceId = invoice.id
    expect((await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')).error).toBeNull()
  })

  test.afterAll(async () => {
    if (invoiceId) await admin.from('invoices').delete().eq('id', invoiceId)
    if (requestId) await admin.from('purchase_requests').delete().eq('id', requestId)
  })

  test('yönetici onaylı faturayı menü ekranından iptal eder', async ({ page }) => {
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    await openMenu(page, 'Finans')
    await page.getByRole('button', { name: 'Faturalar', exact: true }).click()
    await page.getByText(marker, { exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Faturayı İptal Et', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Faturayı İptal Et', exact: true }).click()
    await page.getByRole('button', { name: 'Evet, İptal Et', exact: true }).click()
    await expect.poll(async () => (await admin.from('invoices').select('status').eq('id', invoiceId).single()).data.status).toBe('reddedildi')
  })

  test('muhasebe iptal edilen faturada yalnız düzenle/yeniden gönder veya sil görür', async ({ page }) => {
    await loginUi(page, process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)
    await openMenu(page, 'Finans')
    await page.getByText(marker, { exact: true }).first().click()
    await expect(page.getByText('Yönetici bu onaylı faturayı iptal etti.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Düzenle ve Yeniden Gönder', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Faturayı Sil', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Faturayı İptal Et', exact: true })).toHaveCount(0)
  })
})
