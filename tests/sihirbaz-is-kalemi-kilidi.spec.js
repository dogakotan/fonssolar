// Proje düzenleme sihirbazı — İş Kalemleri kilidi (utils/projectTaskLock.js).
//
// SALT OKUNUR: canlı veritabanına yazmaz. Her test, REST katmanında GET/HEAD ve get_* okuma
// RPC'leri dışındaki bütün istekleri (insert/update/delete ve yazan RPC'ler) ağ seviyesinde
// durdurur ve sayar; test sonunda hiç yazma denemesi olmadığı doğrulanır. "Projeyi Güncelle"
// (Adım 7) butonuna basılmaz.
//
// Beklenen veri: DYB1 (isdemir-diyarbakir-arazi-faz1) bağımlılık + aylık plan taşıyor → kilitli;
// ADN2 (kaptan-demir-adana-arazi-faz2) bunların hiçbirini taşımıyor → kilitsiz.
import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'

const LOCKED_PROJECT = 'isdemir-diyarbakir-arazi-faz1'
const FREE_PROJECT   = 'kaptan-demir-adana-arazi-faz2'

async function guardWrites(page) {
  const blocked = []
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request()
    const method = req.method()
    const url = req.url()
    const isRead = method === 'GET' || method === 'HEAD'
    const isReadRpc = method === 'POST' && /\/rest\/v1\/rpc\/get_/.test(url)
    if (isRead || isReadRpc) return route.continue()
    blocked.push(`${method} ${url}`)
    return route.abort()
  })
  return blocked
}

async function openEditWizard(page, projectId) {
  await page.goto('/dashboard/proje-ekle')
  const row = page.locator('tr', { has: page.locator('td', { hasText: projectId }) })
  await row.getByRole('button', { name: 'Düzenle' }).click()
  await page.getByRole('button', { name: /İş Kalemleri/ }).first().click()
}

test.describe('Sihirbaz İş Kalemleri kilidi (salt okunur)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_EMAIL, 'TEST_ADMIN_EMAIL tanımlı değil')
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
  })

  test('veri taşıyan projede uyarı bandı çıkar, adım 2 Kaydet hiçbir şey yazmaz', async ({ page }) => {
    const blocked = await guardWrites(page)
    await openEditWizard(page, LOCKED_PROJECT)

    const banner = page.getByTestId('task-lock-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('sihirbazdan kaydedilemez')
    await expect(banner).toContainText('öncül/ardıl bağımlılığı')
    await expect(banner).toContainText('aylık plan satırı')

    // Görev alanları ve Excel içe aktarma kapalı.
    await expect(page.getByPlaceholder('Görev adı').first()).toBeDisabled()
    await expect(page.getByRole('button', { name: "Excel'den İçe Aktar" })).toBeDisabled()

    // Kenar çubuğundaki "Kaydet" (adım 2 directSave yolu) → hata bildirimi, yazma yok.
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    await expect(page.getByText(/sihirbazdan kaydedilemez/).last()).toBeVisible()

    // Adım 7 özetinde İş Kalemleri "kilitli" görünür (butona basılmaz).
    await page.getByRole('button', { name: /Tamamlandı/ }).first().click()
    await expect(page.getByText('kilitli — kaydedilmeyecek')).toBeVisible()

    await page.getByRole('button', { name: 'İptal', exact: true }).click()
    expect(blocked, 'yazma denemesi olmamalı').toEqual([])
  })

  test('veri taşımayan projede bant çıkmaz, alanlar düzenlenebilir', async ({ page }) => {
    const blocked = await guardWrites(page)
    await openEditWizard(page, FREE_PROJECT)

    await expect(page.getByText('Görev verileri kontrol ediliyor…')).toBeHidden()
    await expect(page.getByTestId('task-lock-banner')).toHaveCount(0)
    await expect(page.getByPlaceholder('Görev adı').first()).toBeEnabled()

    await page.getByRole('button', { name: 'İptal', exact: true }).click()
    expect(blocked, 'yazma denemesi olmamalı').toEqual([])
  })
})
