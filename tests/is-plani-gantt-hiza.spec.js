import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'

// Genel İş Planı (Gantt) ölçek hizası — canlı, YALNIZCA OKUR (yazma ve bildirim yok).
// Tarayıcıda çizilmiş öğeleri ölçer: her görev çubuğunun sol kenarı (ve min-width'e takılmayan çubukların
// sağ kenarı), başlangıç gününün ay başlığı içindeki beklenen pikseliyle; "bugün" çizgisi de bugünün
// pikseliyle aynı olmalı. Beklenen piksel yalnızca başlık hücresinin ekrandaki konumundan ve gün başına
// pikselden hesaplanır — ölçek kodunu yeniden kullanmaz, böylece başlık ile çubuk ayrışırsa yakalar.
// Eski kodda (7 günlük tik ölçeği) DYB aralığında fark Kasım 2027'de ~57 gün idi (docs/is-plani-denetim.md H1).

const DYB1 = process.env.TEST_PROJECT_DYB1 || 'isdemir-diyarbakir-arazi-faz1'
const TIZ = process.env.TEST_PROJECT_IZMIR || 'test-izmir-ges-2026'
const TOLERANCE_PX = 1

async function measure(page) {
  return page.evaluate(() => {
    const board = document.querySelector('.gantt-board')
    const pxPerDay = Number(board.dataset.pxPerDay)
    const headers = [...document.querySelectorAll('.gantt-months span[data-month-start]')].map(el => {
      const r = el.getBoundingClientRect()
      return { start: el.dataset.monthStart, left: r.left, width: r.width }
    })
    const headerFor = key => headers.find(h => h.start.slice(0, 7) === key.slice(0, 7))
    const dayOf = key => Number(key.slice(8, 10))
    const expectedLeft = key => {
      const h = headerFor(key)
      return h ? h.left + (dayOf(key) - 1) * pxPerDay : null
    }
    const bars = [...document.querySelectorAll('.gantt-bar[data-start][data-end]')].map(el => {
      const r = el.getBoundingClientRect()
      const start = el.dataset.start
      const end = el.dataset.end
      const expStart = expectedLeft(start)
      const expEnd = expectedLeft(end) === null ? null : expectedLeft(end) + pxPerDay
      return {
        start, end,
        leftDiff: expStart === null ? null : r.left - expStart,
        // min-width (14 px) ile genişletilmiş kısa çubukta sağ kenar ölçülmez.
        rightDiff: expEnd === null || (expEnd - expStart) < 14 ? 0 : r.right - expEnd,
      }
    })
    const todayEl = document.querySelector('.gantt-today-line')
    const today = todayEl ? (() => {
      const key = todayEl.dataset.date
      return { key, diff: todayEl.getBoundingClientRect().left - expectedLeft(key) }
    })() : null
    const monthWidthDiffs = headers.map(h => {
      const [y, m] = h.start.split('-').map(Number)
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
      return { start: h.start, diff: h.width - days * pxPerDay }
    })
    const scrollBody = document.querySelector('.gantt-scroll-body')
    return {
      pxPerDay, headers: headers.length, bars, today, monthWidthDiffs,
      timelineWidth: board.getBoundingClientRect().width, visibleWidth: scrollBody.clientWidth,
    }
  })
}

function worst(values) {
  return values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
}

async function openGantt(page, projectId) {
  await page.goto(`/dashboard/projeler/${projectId}/gantt?view=gantt`)
  await expect(page.locator('.gantt-bar[data-start]').first()).toBeVisible({ timeout: 30000 })
}

test.describe.serial('Gantt ölçek hizası (canlı, salt okunur)', () => {
  test.beforeEach(async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
  })

  test('DYB1 (Eylül 2026 – Kasım 2027): çubuklar, ay başlıkları ve bugün çizgisi aynı ölçekte', async ({ page }, testInfo) => {
    await openGantt(page, DYB1)
    const m = await measure(page)

    expect(m.headers).toBeGreaterThanOrEqual(15)
    expect(m.bars.length).toBeGreaterThan(40)
    const left = worst(m.bars.map(b => b.leftDiff))
    const right = worst(m.bars.map(b => b.rightDiff))
    const monthWidth = worst(m.monthWidthDiffs.map(d => d.diff))
    const summary = {
      pxPerDay: m.pxPerDay, ayBasligi: m.headers, cubuk: m.bars.length,
      enBuyukSolFarkPx: Number(left.toFixed(2)), enBuyukSagFarkPx: Number(right.toFixed(2)),
      enBuyukAyGenisligiFarkPx: Number(monthWidth.toFixed(2)),
      bugun: m.today && { tarih: m.today.key, farkPx: Number(m.today.diff.toFixed(2)) },
    }
    testInfo.annotations.push({ type: 'olcum', description: JSON.stringify(summary) })
    console.log('DYB1 hiza ölçümü:', JSON.stringify(summary))

    expect(m.bars.every(b => b.leftDiff !== null)).toBe(true)
    expect(left).toBeLessThanOrEqual(TOLERANCE_PX)
    expect(right).toBeLessThanOrEqual(TOLERANCE_PX)
    expect(monthWidth).toBeLessThanOrEqual(TOLERANCE_PX)
    expect(m.pxPerDay).toBeGreaterThanOrEqual(3)
    // DYB aralığı bugünü (Ekim 2026) içeriyor; çizgi bugünün pikselinde.
    if (m.today) expect(Math.abs(m.today.diff)).toBeLessThanOrEqual(TOLERANCE_PX)
  })

  test('TIZ (kısa proje): zaman çizelgesi ekranı doldurur ve hizalı kalır', async ({ page }, testInfo) => {
    await openGantt(page, TIZ)
    const m = await measure(page)
    const left = worst(m.bars.map(b => b.leftDiff))
    const summary = { pxPerDay: m.pxPerDay, cubuk: m.bars.length, enBuyukSolFarkPx: Number(left.toFixed(2)), tahta: Math.round(m.timelineWidth), gorunur: m.visibleWidth }
    testInfo.annotations.push({ type: 'olcum', description: JSON.stringify(summary) })
    console.log('TIZ hiza ölçümü:', JSON.stringify(summary))

    expect(m.bars.length).toBeGreaterThan(0)
    expect(left).toBeLessThanOrEqual(TOLERANCE_PX)
    expect(m.pxPerDay).toBeGreaterThanOrEqual(3)
    // Ölçek kapsayıcıyı doldurur: tahta görünür alandan dar değil (yuvarlama payı 2 px).
    expect(m.timelineWidth).toBeGreaterThanOrEqual(m.visibleWidth - 2)
  })
})
