// Register ekranı — CANLI, yalnızca okuma, yalnızca TIZ (Karar 72). Hiçbir kayıt yazmaz.
// Koşar: PW_TARGET=live VE canlıda get_register_list + 'register' navigasyon satırları varsa
// (20261020090000_register_okuma_rpc ve 20261020090100_register_navigasyon uygulandıktan sonra). Yoksa atlanır.
// Muhasebe bu testte YOK: .env.test'teki muhasebe hesabı gerçek bir kişiye ait; muhasebe görünürlüğü
// tests-register-mock'ta ağ taklitli olarak sınanır.
import { test, expect } from '@playwright/test'
import { signIn, loginUi } from './helpers.js'

const TIZ = process.env.TEST_PROJECT_IZMIR
const LIVE = process.env.PW_TARGET === 'live'

const ROLES = [
  { role: 'admin', email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD,
    tabs: ['RFI', 'Doküman', 'Karar', 'Aksiyon', 'Teknik Sunum', 'Malzeme Onayı', 'Değişiklik', 'Hak Talebi', 'Arayüz (Interface)'] },
  { role: 'proje_yoneticisi', email: process.env.TEST_PROJEYONETICISI_EMAIL, password: process.env.TEST_PROJEYONETICISI_PASSWORD,
    tabs: ['RFI', 'Doküman', 'Karar', 'Aksiyon', 'Teknik Sunum', 'Malzeme Onayı', 'Değişiklik', 'Hak Talebi', 'Arayüz (Interface)'] },
  { role: 'santiye_sefi', email: process.env.TEST_IZMIR_EMAIL, password: process.env.TEST_IZMIR_PASSWORD,
    tabs: ['RFI', 'Doküman', 'Karar', 'Aksiyon', 'Teknik Sunum', 'Malzeme Onayı', 'Arayüz (Interface)'] },
]

let ready = false
let skipReason = 'PW_TARGET=live değil'
let tizSubmittals = null

test.beforeAll(async () => {
  if (!LIVE) return
  if (!TIZ) { skipReason = 'TEST_PROJECT_IZMIR tanımlı değil'; return }
  const { client } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
  const { data, error } = await client.rpc('get_register_list', { p_project_id: TIZ, p_register: 'submittal' })
  if (error) { skipReason = `get_register_list canlıda yok (${error.code})`; return }
  const { data: nav } = await client.from('role_sidebar_items').select('role_key').eq('item_key', 'register')
  if (!nav || nav.length === 0) { skipReason = "'register' navigasyon satırları canlıda yok"; return }
  tizSubmittals = data?.rows?.length ?? null
  ready = true
})

for (const r of ROLES) {
  test(`canlı TIZ — ${r.role}: Register menüsü, Karar 6 alt sekmeleri, boş durum (yalnızca okuma)`, async ({ page }) => {
    test.skip(!ready, skipReason)
    const writes = []
    page.on('request', req => {
      const u = new URL(req.url())
      if (!u.pathname.startsWith('/rest/v1/') && !u.pathname.startsWith('/auth/v1/')) return
      if (u.pathname.startsWith('/auth/v1/token')) return // giriş
      if (req.method() !== 'GET' && !/^\/rest\/v1\/rpc\/get_[a-z_]+$/.test(u.pathname)) writes.push(`${req.method()} ${u.pathname}`)
    })
    await page.addInitScript(pid => window.localStorage.setItem('register-project', JSON.stringify(pid)), TIZ)
    await loginUi(page, r.email, r.password)
    await page.goto('/dashboard/register?tur=submittal')
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: 'Register' })).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Register türleri' }).getByRole('tab')).toHaveText(r.tabs)
    await expect(page.locator('.register-code')).toContainText('TIZ')
    if (tizSubmittals === 0) {
      await expect(page.getByText('Bu projede henüz Teknik Sunum kaydı yok.')).toBeVisible()
    }
    expect(writes, 'ekran yazma isteği atmamalı').toEqual([])
  })
}
