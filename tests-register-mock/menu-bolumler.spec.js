// Bölümlü menü + register sayfaları — ağ taklitli, yalnızca okuma (veritabanı yok, yazma yok).
// Koşturma: npx playwright test -c playwright.register-mock.config.js
// Beklenen menüler burada ELLE yazıldı (MENU_bolumler.sql'in canlı ROLLBACK provası çıktısı + Sidebar etiketleri).
import { test, expect } from '@playwright/test'
import { installMock } from './mockSupabase.js'

const SHOTS = process.env.REGISTER_SCREENSHOT_DIR || 'test-results/register-ekran'

function assertReadOnly(calls) {
  expect(calls.filter(c => c.leaked), 'canlı Supabase adresine istek gitmemeli').toEqual([])
  const writes = calls.filter(c => c.method !== 'GET' && c.method !== 'HEAD' && c.method !== 'OPTIONS'
    && !/^\/rest\/v1\/rpc\/(get_[a-z_]+)$/.test(c.path || ''))
  expect(writes, 'yalnızca okuma istekleri').toEqual([])
}

const PROJE_KONTROL = ['RFI', 'Aksiyonlar', 'Kararlar', 'Riskler', 'Arayüzler']
const DOKUMAN = ['Dokümanlar', 'Çizimler', 'Teknik sunumlar', 'Malzeme onayları']
const TICARI = ['Değişiklikler', 'Claim']

const EXPECTED_MENU = {
  admin: [
    [null, ['Genel Bakış']], ['Proje', ['Projeler']], ['Proje kontrol', PROJE_KONTROL], ['Doküman ve teknik', DOKUMAN],
    ['Ticari', TICARI], ['Satın alma ve finans', ['Satın Alma', 'Finans']], ['İletişim', ['Tickets', 'Bildirimler']],
    ['Yönetim', ['Proje Yönetimi', 'Kullanıcılar']],
  ],
  proje_yoneticisi: [
    [null, ['Genel Bakış']], ['Proje', ['Projeler']], ['Proje kontrol', PROJE_KONTROL], ['Doküman ve teknik', DOKUMAN],
    ['Ticari', TICARI], ['Satın alma ve finans', ['Satın Alma', 'Finans']], ['İletişim', ['Tickets', 'Bildirimler']],
    ['Yönetim', ['Proje Yönetimi', 'Kullanıcılar']],
  ],
  santiye_sefi: [
    [null, ['Genel Bakış']], ['Proje', ['İş Planı', 'Raporlarım']], ['Proje kontrol', PROJE_KONTROL], ['Doküman ve teknik', DOKUMAN],
    ['Satın alma ve finans', ['Satın Alma']], ['İletişim', ['Tickets', 'Bildirimler']],
  ],
  muhasebe: [
    [null, ['Genel Bakış']], ['Ticari', TICARI], ['Satın alma ve finans', ['Bekleyenler', 'Finans', 'Ödemeler']],
    ['İletişim', ['Bildirimler']],
  ],
}

// Taklit uyarılar: RFI 3, aksiyon 1, karar 1, claim 2, kritik malzeme 1. Rozet yalnızca RFI/Aksiyonlar/Kararlar/Claim.
const EXPECTED_BADGES = {
  admin: { RFI: '3', Aksiyonlar: '1', Kararlar: '1', Claim: '2' },
  proje_yoneticisi: { RFI: '3', Aksiyonlar: '1', Kararlar: '1', Claim: '2' },
  santiye_sefi: { RFI: '3', Aksiyonlar: '1', Kararlar: '1' },
  muhasebe: { Claim: '2' },
}

async function readMenu(page) {
  await expect(page.locator('.sidebar-nav .nav-item').first()).toBeVisible()
  return page.locator('.sidebar-nav .nav-section').evaluateAll(sections => sections.map(s => [
    s.getAttribute('role') === 'group' ? s.getAttribute('aria-label') : null,
    [...s.querySelectorAll('.nav-label')].map(n => n.textContent),
  ]))
}

async function readBadges(page) {
  return page.locator('.sidebar-nav .nav-item').evaluateAll(items => Object.fromEntries(items
    .filter(i => i.querySelector('.nav-badge'))
    .map(i => [i.querySelector('.nav-label').textContent, i.querySelector('.nav-badge').textContent])))
}

for (const role of Object.keys(EXPECTED_MENU)) {
  test(`${role}: bölümlü menü, eski Register öğesi gizli, rozetler`, async ({ page }) => {
    const calls = []
    await installMock(page, role, { calls, menu: 'bolumlu' })
    await page.goto('/dashboard/bildirimler')
    await expect.poll(() => readMenu(page)).toEqual(EXPECTED_MENU[role])
    // Bölüm başlığı cümle düzeninde, küçük ve soluk
    const label = page.locator('.nav-section-label').first()
    await expect(label).toHaveCSS('text-transform', 'none')
    expect(parseFloat(await label.evaluate(el => getComputedStyle(el).fontSize))).toBeLessThanOrEqual(12)
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: 'Register', exact: true })).toHaveCount(0)
    await expect.poll(() => readBadges(page)).toEqual(EXPECTED_BADGES[role])
    await page.screenshot({ path: `${SHOTS}/${role}-menu-bolumlu.png` })
    assertReadOnly(calls)
  })
}

test('bölüm migration\'ı uygulanmamışsa giriş bozulmaz, menü düz kalır', async ({ page }) => {
  const calls = []
  await installMock(page, 'proje_yoneticisi', { calls, menu: 'duz' })
  await page.goto('/dashboard/bildirimler')
  await expect(page.locator('.sidebar-nav').getByRole('button', { name: 'Register', exact: true })).toBeVisible()
  await expect(page.locator('.nav-section-label')).toHaveCount(0)
  assertReadOnly(calls)
})

test('menüden RFI: sekme şeridi yok, durum süzgeci ve arama, yan panelde durum geçmişi', async ({ page }) => {
  const calls = []
  await installMock(page, 'proje_yoneticisi', { calls, menu: 'bolumlu' })
  await page.goto('/dashboard/bildirimler')
  await page.locator('.sidebar-nav').getByRole('button', { name: /^RFI/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/register-rfi$/)
  await expect(page.locator('.register-title')).toHaveText('RFI')
  await expect(page.getByRole('tablist', { name: 'Register türleri' })).toHaveCount(0)
  await expect(page.locator('.register-footer')).toContainText('13 kayıt')
  await page.getByRole('combobox', { name: 'Durum süzgeci' }).selectOption({ label: 'Açık' })
  await expect(page.locator('.register-footer')).toContainText('3 kayıt')
  for (const cell of await page.locator('.register-table tbody tr td:nth-child(3)').allTextContents()) expect(cell).toContain('Açık')
  await page.getByRole('combobox', { name: 'Durum süzgeci' }).selectOption('')
  await page.getByRole('searchbox', { name: 'Kayıtlarda ara' }).fill('inverter')
  await expect(page.locator('.register-table tbody tr')).toHaveCount(1)
  await page.locator('.register-table tbody tr').first().click()
  const panel = page.getByRole('dialog')
  await expect(panel).toContainText('RFI-TIZ-0001')
  await expect(panel.locator('.register-history-list li')).toHaveCount(2)
  await expect(page).toHaveURL(/register-rfi\?kayit=/)
  await page.screenshot({ path: `${SHOTS}/menu-rfi-panel.png`, fullPage: true })
  expect(calls.some(c => c.path === '/rest/v1/rpc/get_register_status_history')).toBeTruthy()
  assertReadOnly(calls)
})

test('Riskler: project_risks\'ten okunur, numara sütunu yok, geçmiş çağrısı yapılmaz', async ({ page }) => {
  const calls = []
  await installMock(page, 'santiye_sefi', { calls, menu: 'bolumlu' })
  await page.goto('/dashboard/register-risk')
  await expect(page.locator('.register-title')).toHaveText('Riskler')
  await expect(page.locator('.register-table tbody tr')).toHaveCount(2)
  const heads = await page.locator('.register-table th').allTextContents()
  expect(heads.map(h => h.replace(/[▲▼]/g, '').trim())).toEqual(expect.arrayContaining(['Başlık', 'Durum', 'Şiddet', 'Olasılık', 'Etki', 'Skor', 'Önlem termini', 'Risk sahibi', 'WBS', 'Alan', 'Görev']))
  expect(heads.some(h => h.startsWith('Numara'))).toBeFalsy()
  // Varsayılan sıra skora göre azalan
  await expect(page.locator('.register-table tbody tr').first()).toContainText('trafo teslim')
  await page.getByRole('combobox', { name: 'Durum süzgeci' }).selectOption({ label: 'Kapatıldı' })
  await expect(page.locator('.register-table tbody tr')).toHaveCount(1)
  await page.locator('.register-table tbody tr').first().click()
  await expect(page.getByRole('dialog')).toContainText('Bu register için durum geçmişi tutulmuyor.')
  await expect(page.getByRole('dialog')).toContainText('M6')
  expect(calls.some(c => c.path === '/rest/v1/project_risks')).toBeTruthy()
  expect(calls.some(c => c.path === '/rest/v1/rpc/get_register_list')).toBeFalsy()
  expect(calls.some(c => c.path === '/rest/v1/rpc/get_register_status_history')).toBeFalsy()
  await page.screenshot({ path: `${SHOTS}/menu-risk.png`, fullPage: true })
  assertReadOnly(calls)
})

test('Çizimler: yalnızca çizim türündeki dokümanlar, süzgeç düğmesi yok', async ({ page }) => {
  const calls = []
  await installMock(page, 'admin', { calls, menu: 'bolumlu' })
  await page.goto('/dashboard/register-drawing')
  await expect(page.locator('.register-title')).toHaveText('Çizimler')
  await expect(page.locator('.register-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.register-table tbody tr').first()).toContainText('DRW-TIZ-0001')
  await expect(page.getByRole('group', { name: 'Doküman süzgeci' })).toHaveCount(0)
  assertReadOnly(calls)
})

test('authorized=false: "Bu bölüme erişimin yok", hata yok', async ({ page }) => {
  const calls = []
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await installMock(page, 'proje_yoneticisi', { calls, menu: 'bolumlu', unauthorized: 'interface' })
  await page.goto('/dashboard/register-interface')
  await expect(page.getByRole('status')).toHaveText('Bu bölüme erişimin yok.')
  await expect(page.locator('.register-error')).toHaveCount(0)
  expect(errors).toEqual([])
  assertReadOnly(calls)
})

test('muhasebe RFI sayfasını adresten açamaz; Genel ekranda yalnızca claim kartı', async ({ page }) => {
  const calls = []
  await installMock(page, 'muhasebe', { calls, menu: 'bolumlu' })
  await page.goto('/dashboard/register-rfi')
  await expect(page).not.toHaveURL(/register-rfi/)
  await page.goto('/dashboard/genel')
  const cards = page.getByRole('region', { name: 'Proje kontrol uyarıları' }).getByRole('button')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('2')
  await expect(cards.first()).toContainText('Claim bildirim süresi yaklaşan')
  assertReadOnly(calls)
})

test('Genel ekran uyarı kartları (proje yöneticisi): beş kart, karttan sayfaya geçiş', async ({ page }) => {
  const calls = []
  await installMock(page, 'proje_yoneticisi', { calls, menu: 'bolumlu' })
  await page.goto('/dashboard/genel')
  const region = page.getByRole('region', { name: 'Proje kontrol uyarıları' })
  await expect(region.getByRole('button')).toHaveText([
    /3\s*Gecikmiş RFI/, /1\s*Süresi geçen karar/, /1\s*Geciken aksiyon/, /2\s*Claim bildirim süresi yaklaşan/, /1\s*Sahada gerekli kritik malzeme/,
  ])
  await page.screenshot({ path: `${SHOTS}/genel-uyari-kartlari.png` })
  await region.getByRole('button', { name: /Gecikmiş RFI/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/register-rfi$/)
  assertReadOnly(calls)
})
