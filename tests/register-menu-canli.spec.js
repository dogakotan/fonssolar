// Bölümlü menü — CANLI, yalnızca okuma. Koşar: PW_TARGET=live VE canlıda sidebar_sections varsa (MENU_bolumler.sql).
// Yoksa atlanır. Hesaplar: admin, proje yöneticisi ve şantiye şefi TEST hesapları (Karar 90). Muhasebe bu testte YOK
// (.env.test'teki muhasebe hesabı gerçek bir kişiye ait); muhasebe menüsü tests-register-mock'ta taklitle sınanır.
// Beklenen bölümler ELLE yazıldı (MENU_bolumler.sql).
import { test, expect } from '@playwright/test'
import { signIn, loginUi } from './helpers.js'

const LIVE = process.env.PW_TARGET === 'live'
const TIZ = process.env.TEST_PROJECT_IZMIR
const PK = ['RFI', 'Aksiyonlar', 'Kararlar', 'Riskler', 'Arayüzler']
const DOK = ['Dokümanlar', 'Çizimler', 'Teknik sunumlar', 'Malzeme onayları']

const ROLES = [
  { role: 'admin', email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD,
    sections: { 'Proje kontrol': PK, 'Doküman ve teknik': DOK, Ticari: ['Değişiklikler', 'Claim'] } },
  { role: 'proje_yoneticisi', email: process.env.TEST_PROJEYONETICISI_EMAIL, password: process.env.TEST_PROJEYONETICISI_PASSWORD,
    sections: { 'Proje kontrol': PK, 'Doküman ve teknik': DOK, Ticari: ['Değişiklikler', 'Claim'] } },
  { role: 'santiye_sefi', email: process.env.TEST_IZMIR_EMAIL, password: process.env.TEST_IZMIR_PASSWORD,
    sections: { 'Proje kontrol': PK, 'Doküman ve teknik': DOK }, noSection: ['Ticari'] },
]

let ready = false
let skipReason = 'PW_TARGET=live değil'

test.beforeAll(async () => {
  if (!LIVE) return
  const { client } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
  const { error } = await client.from('sidebar_sections').select('section_key').limit(1)
  if (error) { skipReason = `sidebar_sections canlıda yok (${error.code})`; return }
  ready = true
})

for (const r of ROLES) {
  test(`canlı — ${r.role}: bölümlü menü ve register sayfası (yalnızca okuma)`, async ({ page }) => {
    test.skip(!ready, skipReason)
    const writes = []
    page.on('request', req => {
      const u = new URL(req.url())
      if (!u.pathname.startsWith('/rest/v1/') && !u.pathname.startsWith('/auth/v1/')) return
      if (u.pathname.startsWith('/auth/v1/token')) return
      if (req.method() !== 'GET' && !/^\/rest\/v1\/rpc\/get_[a-z_]+$/.test(u.pathname)) writes.push(`${req.method()} ${u.pathname}`)
    })
    if (TIZ) await page.addInitScript(pid => window.localStorage.setItem('register-project', JSON.stringify(pid)), TIZ)
    await loginUi(page, r.email, r.password)
    const nav = page.locator('.sidebar-nav')
    for (const [label, items] of Object.entries(r.sections)) {
      const group = nav.getByRole('group', { name: label, exact: true })
      // Açılır-kapanır bölüm: kapalıysa aç (register bölümleri ilk girişte kapalı)
      const toggle = group.locator('.nav-section-toggle')
      if (await toggle.count() && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
      await expect(group.locator('.nav-label')).toHaveText(items)
    }
    for (const label of r.noSection || []) await expect(nav.getByRole('group', { name: label, exact: true })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0)
    await nav.getByRole('button', { name: /^RFI/ }).click()
    await expect(page).toHaveURL(/\/dashboard\/register-rfi/)
    await expect(page.locator('.register-title')).toHaveText('RFI')
    await nav.getByRole('button', { name: /^Riskler/ }).click()
    await expect(page.locator('.register-title')).toHaveText('Riskler')
    if (TIZ) {
      // 20261023134000: riskler get_register_list'ten, RSK numaralı (TIZ'de risk var)
      await expect(page.locator('.register-table th').first()).toContainText('Numara')
      await expect(page.locator('.register-table tbody tr').first()).toContainText(/RSK-TIZ-\d{4}/)
      await page.locator('.register-table tbody tr').first().click()
      await expect(page.getByRole('dialog').locator('.register-history')).toBeVisible()
      await expect(page.getByRole('dialog')).not.toContainText('Durum geçmişi yüklenemedi')
    }
    expect(writes, 'ekran yazma isteği atmamalı').toEqual([])
  })
}
