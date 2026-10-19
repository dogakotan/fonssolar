import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'

// Genel İş Planı (Gantt) ölçek hizası — canlı veri, YALNIZCA OKUR.
// Yazma istekleri (REST'te GET/HEAD ve get_* RPC'leri dışındaki her şey, edge function ve Storage
// yazmaları) ağda durdurulur ve sayılır; sayı 0 olmalı. Bildirim üretmez.
// Tarayıcıda çizilmiş öğeleri ölçer: "bugün" çizgisi ve her görev çubuğunun başlangıç/bitiş kenarı, o günün
// ay başlığı ve hafta başlığı içindeki beklenen pikselle aynı olmalı. Beklenen piksel yalnızca başlık
// hücrelerinin ekrandaki konumundan ve gün başına pikselden hesaplanır (ölçek kodu yeniden kullanılmaz),
// böylece başlık ile çubuk ayrışırsa yakalanır. Eski 7 günlük tik ölçeğinde DYB1'de fark 16.10.2026'da
// −19,8 px idi, proje sonunda ~−163 px.
// Üç saat diliminde koşar (Europe/Istanbul, UTC, America/Los_Angeles): tarih hesapları tarayıcının saat
// diliminden bağımsız olmalı.
//
// Derlenmiş paketi sunucu açmadan ölçmek için (tek dev sunucu kuralı): GANTT_HIZA_DIST=<dist klasörü>
// verilirse baseURL altındaki istekler bu klasörden servis edilir (SPA: bilinmeyen yol → index.html).

const DYB1 = process.env.TEST_PROJECT_DYB1 || 'isdemir-diyarbakir-arazi-faz1'
const ZONES = ['Europe/Istanbul', 'UTC', 'America/Los_Angeles']
// Ölçüm piksel; alt piksel yuvarlaması için yarım piksel pay (yuvarlanmış fark 0 olmalı).
const TOLERANCE_PX = 0.5

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain', '.json': 'application/json' }

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

// Yalnızca okuma: GET/HEAD ve get_* RPC'leri geçer; diğer REST, edge function ve Storage yazmaları durdurulur.
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
    if (req.method() === 'GET' || req.method() === 'HEAD' || req.method() === 'OPTIONS') return route.continue()
    blocked.push(`${req.method()} ${req.url()}`)
    return route.abort()
  })
  return blocked
}

async function measure(page) {
  return page.evaluate(() => {
    const board = document.querySelector('.gantt-board')
    const pxPerDay = Number(board.dataset.pxPerDay)
    const months = [...document.querySelectorAll('.gantt-months span[data-month-start]')].map(el => {
      const r = el.getBoundingClientRect()
      return { start: el.dataset.monthStart, left: r.left, width: r.width }
    })
    const ticks = [...document.querySelectorAll('.gantt-month-ticks span')].map(el => {
      const r = el.getBoundingClientRect()
      return { day: Number(el.textContent.trim()), left: r.left, width: r.width }
    })
    const dayOf = key => Number(key.slice(8, 10))
    const monthIndex = key => months.findIndex(m => m.start.slice(0, 7) === key.slice(0, 7))
    // Ay başlığına göre: başlığın sol kenarı + (gün − 1) × px
    const byMonth = key => {
      const m = months[monthIndex(key)]
      return m ? m.left + (dayOf(key) - 1) * pxPerDay : null
    }
    // Hafta başlığına göre: her ayda dört tik (01, 08, 15, 22); günü içeren tikin sol kenarı + (gün − tik günü) × px
    const byWeek = key => {
      const mi = monthIndex(key)
      if (mi < 0) return null
      const d = dayOf(key)
      const t = ticks[mi * 4 + (d >= 22 ? 3 : d >= 15 ? 2 : d >= 8 ? 1 : 0)]
      return t ? t.left + (d - t.day) * pxPerDay : null
    }
    const bars = [...document.querySelectorAll('.gantt-bar[data-start][data-end]')].map(el => {
      const r = el.getBoundingClientRect()
      const { start, end } = el.dataset
      const expEnd = byMonth(end) === null ? null : byMonth(end) + pxPerDay
      const natural = expEnd === null || byMonth(start) === null ? 0 : expEnd - byMonth(start)
      return {
        start, end,
        leftMonth: byMonth(start) === null ? null : r.left - byMonth(start),
        leftWeek: byWeek(start) === null ? null : r.left - byWeek(start),
        // min-width (14 px) ile genişletilmiş kısa çubukta sağ kenar ölçülmez.
        right: natural < 14 ? 0 : r.right - expEnd,
      }
    })
    const line = document.querySelector('.gantt-today-line')
    const today = line ? {
      key: line.dataset.date,
      month: line.getBoundingClientRect().left - byMonth(line.dataset.date),
      week: line.getBoundingClientRect().left - byWeek(line.dataset.date),
    } : null
    const monthWidth = months.map(m => {
      const [y, mo] = m.start.split('-').map(Number)
      return m.width - new Date(Date.UTC(y, mo, 0)).getUTCDate() * pxPerDay
    })
    const contiguous = months.every((m, i) => i === 0 || Math.abs(m.left - (months[i - 1].left + months[i - 1].width)) < 0.01)
    return { pxPerDay, months: months.length, ticks: ticks.length, bars, today, monthWidth, contiguous }
  })
}

const worst = values => values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

for (const timezoneId of ZONES) {
  test.describe(`Gantt ölçek hizası — DYB1, TZ=${timezoneId} (canlı, salt okunur)`, () => {
    test.use({ timezoneId, locale: 'tr-TR', viewport: { width: 1440, height: 1000 } })

    test('bugün çizgisi ve çubuk kenarları ay/hafta başlıklarıyla aynı pikselde', async ({ page, baseURL }, testInfo) => {
      await serveDist(page, baseURL)
      const blocked = await blockWrites(page)
      await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
      await page.goto(`/dashboard/projeler/${DYB1}/gantt?view=gantt`)
      await expect(page.locator('.gantt-bar[data-start]').first()).toBeVisible({ timeout: 30000 })
      await expect(page.locator('.gantt-today-line')).toBeVisible()

      const m = await measure(page)
      const summary = {
        tz: timezoneId, pxPerDay: m.pxPerDay, ay: m.months, tik: m.ticks, cubuk: m.bars.length,
        bugun: m.today && { tarih: m.today.key, ayFarkiPx: +m.today.month.toFixed(3), haftaFarkiPx: +m.today.week.toFixed(3) },
        cubukBaslangicAyPx: +worst(m.bars.map(b => b.leftMonth)).toFixed(3),
        cubukBaslangicHaftaPx: +worst(m.bars.map(b => b.leftWeek)).toFixed(3),
        cubukBitisPx: +worst(m.bars.map(b => b.right)).toFixed(3),
        ayGenisligiPx: +worst(m.monthWidth).toFixed(3),
        yazmaDenemesi: blocked.length,
      }
      testInfo.annotations.push({ type: 'olcum', description: JSON.stringify(summary) })
      console.log('Gantt hiza ölçümü:', JSON.stringify(summary))

      expect(m.months).toBeGreaterThanOrEqual(15)
      expect(m.ticks).toBe(m.months * 4)
      expect(m.contiguous).toBe(true)
      expect(m.bars.length).toBeGreaterThan(40)
      expect(m.bars.every(b => b.leftMonth !== null && b.leftWeek !== null)).toBe(true)
      expect(worst(m.monthWidth)).toBeLessThanOrEqual(TOLERANCE_PX)
      expect(Math.abs(m.today.month)).toBeLessThanOrEqual(TOLERANCE_PX)
      expect(Math.abs(m.today.week)).toBeLessThanOrEqual(TOLERANCE_PX)
      expect(worst(m.bars.map(b => b.leftMonth))).toBeLessThanOrEqual(TOLERANCE_PX)
      expect(worst(m.bars.map(b => b.leftWeek))).toBeLessThanOrEqual(TOLERANCE_PX)
      expect(worst(m.bars.map(b => b.right))).toBeLessThanOrEqual(TOLERANCE_PX)
      expect(blocked).toEqual([])
    })
  })
}
