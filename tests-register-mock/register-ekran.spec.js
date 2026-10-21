// Register ekranı — ağ taklitli, yalnızca okuma testleri (veritabanı yok, yazma yok).
// Koşturma: npx playwright test -c playwright.register-mock.config.js
import { test, expect } from '@playwright/test'
import { installMock, EXPECTED_TABS } from './mockSupabase.js'

const SHOTS = process.env.REGISTER_SCREENSHOT_DIR || 'test-results/register-ekran'

function assertReadOnly(calls) {
  const leaked = calls.filter(c => c.leaked)
  expect(leaked, 'canlı Supabase adresine istek gitmemeli').toEqual([])
  const writes = calls.filter(c => c.method !== 'GET' && c.method !== 'HEAD' && c.method !== 'OPTIONS'
    && !/^\/rest\/v1\/rpc\/(get_[a-z_]+)$/.test(c.path || ''))
  expect(writes, 'yalnızca okuma (get_* RPC) istekleri').toEqual([])
}

for (const role of Object.keys(EXPECTED_TABS)) {
  test(`${role}: Register menüsü ve görünen alt sekmeler (Karar 6)`, async ({ page }) => {
    const calls = []
    await installMock(page, role, { calls })
    await page.goto('/dashboard/register')
    const nav = page.locator('.sidebar-nav')
    await expect(nav.getByRole('button', { name: 'Register' })).toBeVisible()
    const tabs = page.getByRole('tablist', { name: 'Register türleri' }).getByRole('tab')
    await expect(tabs).toHaveText(EXPECTED_TABS[role])
    await expect(page.locator('.register-title')).toHaveText(EXPECTED_TABS[role][0])
    await expect(page.locator('.register-code')).toContainText('Proje kodu: TIZ')
    await page.screenshot({ path: `${SHOTS}/${role}-register.png`, fullPage: true })
    assertReadOnly(calls)
  })
}

test('muhasebe adreste görmediği register\'ı istese de ilk izinli sekmeye düşer', async ({ page }) => {
  const calls = []
  await installMock(page, 'muhasebe', { calls })
  await page.goto('/dashboard/register?tur=rfi')
  await expect(page.getByRole('tab', { selected: true })).toHaveText('Değişiklik')
  await expect(page.getByRole('tab', { name: 'RFI' })).toHaveCount(0)
  expect(calls.some(c => c.path === '/rest/v1/rpc/get_register_list')).toBeTruthy()
  assertReadOnly(calls)
})

test('dolu tablo: sayfalama, sıralama, arama, sütun menüsü, rozetler, görev bağı salt okunur', async ({ page }) => {
  const calls = []
  await installMock(page, 'admin', { calls })
  await page.goto('/dashboard/register?tur=rfi')
  const rows = page.locator('.register-table tbody tr')
  await expect(rows).toHaveCount(10)
  await expect(page.getByText('1 / 2')).toBeVisible()
  await expect(page.getByText('13 kayıt')).toBeVisible()
  // varsayılan sıralama numara azalan
  await expect(rows.first().locator('.register-no').first()).toHaveText('RFI-TIZ-0013')
  await page.getByRole('button', { name: /^Numara/ }).click()
  await expect(rows.first().locator('.register-no').first()).toHaveText('RFI-TIZ-0001')
  // durum ve öncelik rozeti: renk + metin
  await expect(rows.first()).toContainText('Açık')
  await expect(rows.first()).toContainText('Düşük')
  // görev bağı (Karar 69) salt okunur görünür
  await expect(rows.first()).toContainText('M6')
  await page.screenshot({ path: `${SHOTS}/admin-rfi-tablo.png`, fullPage: true })
  // arama
  await page.getByRole('searchbox', { name: 'Kayıtlarda ara' }).fill('inverter')
  await expect(rows).toHaveCount(1)
  await page.getByRole('searchbox', { name: 'Kayıtlarda ara' }).fill('')
  // sütun menüsü
  await expect(page.getByRole('columnheader', { name: /Disiplin/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sütunlar' }).click()
  await page.getByLabel('Disiplin').check()
  await expect(page.getByRole('columnheader', { name: /Disiplin/ })).toHaveCount(1)
  // ilk sürüm yalnızca okuma: ekle/düzenle yok
  await expect(page.getByRole('button', { name: /Ekle|Düzenle|Yeni|Sil|Kaydet/ })).toHaveCount(0)
  assertReadOnly(calls)
})

test('yan panel: alanlar ve durum geçmişi; adres kayit parametresini taşır', async ({ page }) => {
  const calls = []
  await installMock(page, 'proje_yoneticisi', { calls })
  await page.goto('/dashboard/register?tur=rfi')
  await page.locator('.register-table tbody tr').first().click()
  await expect(page).toHaveURL(/tur=rfi&kayit=/)
  const panel = page.getByRole('dialog')
  await expect(panel).toContainText('RFI-TIZ-0013')
  await expect(panel).toContainText('Durum geçmişi')
  await expect(panel.locator('.register-history-list li')).toHaveCount(2)
  await expect(panel).toContainText('İncelemede')
  await page.screenshot({ path: `${SHOTS}/pm-rfi-yan-panel.png`, fullPage: true })
  await panel.getByRole('button', { name: 'Paneli kapat' }).click()
  await expect(page).not.toHaveURL(/kayit=/)
  assertReadOnly(calls)
})

test('geçmişi tutulmayan register için not; çizim süzgeci', async ({ page }) => {
  const calls = []
  await installMock(page, 'santiye_sefi', { calls })
  await page.goto('/dashboard/register?tur=document')
  await expect(page.locator('.register-table tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'Yalnızca çizimler' }).click()
  await expect(page).toHaveURL(/tur=drawing/)
  await expect(page.locator('.register-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.register-table tbody tr')).toContainText('DRW-TIZ-0001')
  await page.locator('.register-table tbody tr').first().click()
  await expect(page.getByRole('dialog')).toContainText('Bu register için durum geçmişi tutulmuyor.')
  assertReadOnly(calls)
})

test('boş durum ekranı', async ({ page }) => {
  const calls = []
  await installMock(page, 'admin', { calls })
  await page.goto('/dashboard/register?tur=submittal')
  await expect(page.getByText('Bu projede henüz Teknik Sunum kaydı yok.')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/admin-bos-durum.png`, fullPage: true })
  assertReadOnly(calls)
})
