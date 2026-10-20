import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'

// İş Planı ortak filtreleri (3A) — canlı veri, YALNIZCA OKUR (DYB1, proje yöneticisi test hesabı).
// Filtre bir bölümde kurulur; Detaylı ve Aylık'a geçince ve sayfa yenilenince korunduğu, parametresiz adreste
// projeye özel son filtrenin geri geldiği ve "Filtreleri temizle"nin adresi temizlediği ölçülür.
// Yazma istekleri (REST'te GET/HEAD ve get_* RPC'leri dışındaki her şey, edge function ve Storage yazmaları)
// ağda durdurulur ve sayılır; sayı 0 olmalı.
// Derlenmiş paketi sunucu açmadan ölçmek için: GANTT_HIZA_DIST=<dist klasörü> (is-plani-gantt-hiza.spec.js ile aynı).

const DYB1 = process.env.TEST_PROJECT_DYB1 || 'isdemir-diyarbakir-arazi-faz1'
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' }

async function serveDist(page, baseURL) {
  const dist = process.env.GANTT_HIZA_DIST
  if (!dist) return
  await page.route(`${new URL(baseURL).origin}/**`, route => {
    const { pathname } = new URL(route.request().url())
    let file = path.join(dist, decodeURIComponent(pathname))
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
    return route.fulfill({ status: 200, body: fs.readFileSync(file), contentType: MIME[path.extname(file)] || 'application/octet-stream' })
  })
}

async function blockWrites(page) {
  const blocked = []
  await page.route('**/rest/v1/**', route => {
    const req = route.request()
    if (req.method() === 'GET' || req.method() === 'HEAD' || (req.method() === 'POST' && /\/rest\/v1\/rpc\/get_/.test(req.url()))) return route.continue()
    blocked.push(`${req.method()} ${req.url()}`)
    return route.abort()
  })
  await page.route(/\/(functions|storage)\/v1\//, route => {
    const req = route.request()
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue()
    blocked.push(`${req.method()} ${req.url()}`)
    return route.abort()
  })
  return blocked
}

const bar = page => page.getByRole('search', { name: 'İş Planı filtreleri' })
const select = (page, name) => bar(page).getByRole('combobox', { name })
const params = page => new URL(page.url()).searchParams

test.use({ timezoneId: 'Europe/Istanbul', locale: 'tr-TR', viewport: { width: 1440, height: 1000 } })

test('ortak filtre üç bölümde korunur, adres çubuğunda ve yenilemede kalır (canlı, salt okunur)', async ({ page, baseURL }) => {
  await serveDist(page, baseURL)
  const blocked = await blockWrites(page)
  await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
  // Önceki koşudan kalan yerel filtre testi etkilemesin.
  await page.evaluate(id => window.localStorage.removeItem(`is-plani-filtre-${id}`), DYB1)

  await page.goto(`/dashboard/projeler/${DYB1}/gantt?view=gantt`)
  await expect(page.locator('.gantt-bar[data-start]').first()).toBeVisible({ timeout: 30000 })
  const tumCubuk = await page.locator('.gantt-bar[data-start]').count()

  // Grup: ilk gerçek seçenek; "Sadece bu ay" ve arama.
  const grupSelect = select(page, 'Grup')
  const grupDegeri = await grupSelect.locator('option').nth(1).getAttribute('value')
  await grupSelect.selectOption(grupDegeri)
  await bar(page).getByLabel('Sadece bu ay').check()
  await expect.poll(() => params(page).get('grup')).toBe(grupDegeri)
  expect(params(page).get('buay')).toBe('1')
  expect(params(page).get('view')).toBe('gantt')
  const suzulmusCubuk = await page.locator('.gantt-bar[data-start]').count()
  expect(suzulmusCubuk).toBeLessThan(tumCubuk)
  await expect(page.locator('.gantt-kpi-card').first()).toContainText('Filtreye uyan')

  // Detaylı: aynı filtre, aynı adres; satır sayısı "(filtrelendi)".
  await page.getByRole('button', { name: 'Detaylı İş Planı' }).click()
  await expect.poll(() => params(page).get('view')).toBe('detay')
  expect(params(page).get('grup')).toBe(grupDegeri)
  await expect(select(page, 'Grup')).toHaveValue(grupDegeri)
  await expect(bar(page).getByLabel('Sadece bu ay')).toBeChecked()
  await expect(page.locator('.gantt-card-header p').first()).toContainText('(filtrelendi)')

  // Aylık: aynı filtre.
  await page.getByRole('button', { name: 'Aylık İş Planı' }).click()
  await expect.poll(() => params(page).get('view')).toBe('aylik')
  await expect(select(page, 'Grup')).toHaveValue(grupDegeri)
  await expect(bar(page).getByLabel('Sadece bu ay')).toBeChecked()

  // Yenileme: adresten geri gelir.
  await page.reload()
  await expect(select(page, 'Grup')).toHaveValue(grupDegeri, { timeout: 30000 })
  await expect(bar(page).getByLabel('Sadece bu ay')).toBeChecked()

  // Parametresiz adres: projeye özel son filtre geri yüklenir.
  await page.goto(`/dashboard/projeler/${DYB1}/gantt?view=gantt`)
  await expect.poll(() => params(page).get('grup'), { timeout: 30000 }).toBe(grupDegeri)
  await expect(select(page, 'Grup')).toHaveValue(grupDegeri)

  // Hızlı yazma: arama kutusu harf kaybetmez (adres geç güncellense de ekran anında güncellenir).
  const ara = bar(page).getByRole('searchbox', { name: 'Kod veya iş kalemi ara' })
  await ara.pressSequentially('zzqx-yok', { delay: 0 })
  await expect(ara).toHaveValue('zzqx-yok')
  await expect.poll(() => params(page).get('q')).toBe('zzqx-yok')
  await expect(page.locator('.gantt-bar[data-start]')).toHaveCount(0)

  // Temizle: filtre parametreleri silinir, view kalır, bütün çubuklar geri gelir.
  await bar(page).getByRole('button', { name: 'Filtreleri temizle' }).click()
  await expect.poll(() => params(page).has('grup')).toBe(false)
  expect(params(page).has('buay')).toBe(false)
  expect(params(page).has('q')).toBe(false)
  await expect(ara).toHaveValue('')
  expect(params(page).get('view')).toBe('gantt')
  await expect(page.locator('.gantt-bar[data-start]')).toHaveCount(tumCubuk)

  console.log('İş Planı filtre ölçümü:', JSON.stringify({ tumCubuk, suzulmusCubuk, yazmaDenemesi: blocked.length }))
  expect(blocked).toEqual([])
})
