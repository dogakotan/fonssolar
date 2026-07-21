import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'

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

  test('yönetici satın alma onay kuyruğunu ve finans onayını görür', async ({ page }) => {
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    await openMenu(page, 'Satın Alma')
    await expect(page.getByRole('button', { name: 'Onay Bekleyenler', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Onayla', exact: true }).first()).toBeVisible()
    await openMenu(page, 'Finans')
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
