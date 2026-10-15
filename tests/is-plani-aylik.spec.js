import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'
import {
  buildMonthRange, buildTaskCells, cellTooltip, excelRawText, fmtQty, fmtPct,
  indexRowsByTask, isActiveCell, monthLabel, monthPhase, performanceTone,
} from '../src/utils/aylikPlan.js'

// Aylık İş Planı (Faz 1, salt okunur). İki blok:
//  1) src/utils/aylikPlan.js'in yan etkisiz yardımcıları — tarayıcı/DB yok.
//  2) Canlıda isdemir-diyarbakir-arazi-faz1 üzerinde arayüz — YALNIZCA OKUR,
//     hiçbir satır yazmaz, bildirim üretmez (Karar 72 istisnası, 15.10.2026).
//     Proje yöneticisi test hesabıyla girilir.

const DYB1 = process.env.TEST_PROJECT_DYB1 || 'isdemir-diyarbakir-arazi-faz1'

test.describe('aylikPlan yardımcıları', () => {
  test('ay aralığı proje başlangıç–hedef ayları, Türkçe kısa etiket', () => {
    const months = buildMonthRange('2026-09-01', '2027-11-30')
    expect(months).toHaveLength(15)
    expect(months[0]).toEqual({ key: '2026-09', label: 'Eyl 26' })
    expect(months[1].label).toBe('Eki 26')
    expect(months[14]).toEqual({ key: '2027-11', label: 'Kas 27' })
    expect(monthLabel('2027-08')).toBe('Ağu 27')
  })

  test('aralık dışındaki veri ayı aralığı genişletir, veri gizlenmez', () => {
    const months = buildMonthRange('2026-09-01', '2026-10-15', ['2026-07', '2026-12'])
    expect(months.map(m => m.key)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
    expect(buildMonthRange(null, null)).toEqual([])
  })

  test('kümülatif değer satırı olmayan aya taşınır, aralık öncesi satırlar dahil', () => {
    const rows = [
      { task_id: 't', month: '2026-08-01', planned_qty: 5, actual_qty: 1, source: 'excel_aylik', note: null },
      { task_id: 't', month: '2026-09-01', planned_qty: 10, actual_qty: 4, source: 'excel_aylik', note: null },
      { task_id: 't', month: '2026-11-01', planned_qty: 20, actual_qty: 0, source: 'hesaplanan', note: 'n' },
    ]
    const months = buildMonthRange('2026-09-01', '2026-12-31')
    const cells = buildTaskCells(indexRowsByTask(rows).get('t'), months)
    expect(cells.map(c => c.planned)).toEqual([10, 0, 20, 0])
    expect(cells.map(c => c.plannedCum)).toEqual([15, 15, 35, 35])
    expect(cells.map(c => c.actualCum)).toEqual([5, 5, 5, 5])
    expect(cells[2]).toMatchObject({ source: 'hesaplanan', note: 'n', hasRow: true })
    expect(cells[1].hasRow).toBe(false)
    // İlk–son satırlı ay arası (Ağu–Kas); Aralık aralık dışında.
    expect(cells.map(c => c.inSpan)).toEqual([true, true, true, false])
    expect(isActiveCell(cells[0])).toBe(true)
    expect(isActiveCell(cells[1])).toBe(false)
  })

  test('renk eşikleri ve ay evresi', () => {
    expect(performanceTone(100, 100)).toBe('iyi')
    expect(performanceTone(100, 120)).toBe('iyi')
    expect(performanceTone(100, 70)).toBe('orta')
    expect(performanceTone(100, 99.9)).toBe('orta')
    expect(performanceTone(100, 69.9)).toBe('kotu')
    expect(performanceTone(0, 5)).toBe('iyi')
    expect(performanceTone(0, 0)).toBeNull()
    expect(monthPhase('2026-09', '2026-10')).toBe('past')
    expect(monthPhase('2026-10', '2026-10')).toBe('current')
    expect(monthPhase('2026-11', '2026-10')).toBe('future')
  })

  test('tr-TR sayı biçimi: binlik ayraç, en fazla 2 ondalık', () => {
    expect(fmtQty(63384)).toBe('63.384')
    expect(fmtQty(900000)).toBe('900.000')
    expect(fmtQty(10)).toBe('10')
    expect(fmtQty(1.5)).toBe('1,5')
    expect(fmtQty(1.256)).toBe('1,26')
    expect(fmtPct(1, 4)).toBe('%25')
    expect(fmtPct(1, 0)).toBe('—')
  })

  test('tooltip: kaynak etiketi, Excel ham değeri ve not', () => {
    const task = { task_code: 'E6', unit: 'mt (tahmini)', target_qty: 1000 }
    const cell = {
      monthKey: '2026-11', planned: 250, actual: 0, plannedCum: 250, actualCum: 0,
      source: 'excel_aylik', sourceQty: 2, sourceUnit: 'Trafo Merkezi', note: 'orantılandı',
    }
    const text = cellTooltip(cell, task)
    expect(text).toContain('Kaynak: Excel Aylık İş Planı')
    expect(text).toContain('Excel: 2 Trafo Merkezi')
    expect(text).toContain('Not: orantılandı')
    expect(text).toContain('Plan: 250 mt (tahmini)')
    expect(cellTooltip({ ...cell, source: 'hesaplanan', sourceQty: null, note: null }, task)).toContain('Gün bazlı hesaplandı')
    // Birim ve miktar aynıysa ham değer tekrar yazılmaz.
    expect(excelRawText({ ...cell, sourceUnit: 'mt (tahmini)', sourceQty: 250 }, task.unit)).toBeNull()
  })
})

test.describe.serial('Aylık İş Planı arayüzü (canlı, salt okunur)', () => {
  test.beforeEach(async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
  })

  test('bölüm geçişi URL’e yazılır ve yenilemede korunur', async ({ page }) => {
    await page.goto(`/dashboard/projeler/${DYB1}/gantt`)
    const aylikBtn = page.getByRole('button', { name: 'Aylık İş Planı' })
    await expect(aylikBtn).toBeVisible({ timeout: 20000 })
    await aylikBtn.click()
    await expect(page).toHaveURL(/[?&]view=aylik/)
    await expect(page.locator('table.aylik-table')).toBeVisible({ timeout: 20000 })

    await page.reload()
    await expect(page).toHaveURL(/[?&]view=aylik/)
    await expect(page.locator('table.aylik-table')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Aylık İş Planı' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Genel İş Planı' }).click()
    await expect(page).toHaveURL(/[?&]view=gantt/)
    await expect(page.locator('table.aylik-table')).toHaveCount(0)
  })

  test('M4: 6 ay hücresi, toplam ve hedef 63.384; tooltip kaynak bilgisi', async ({ page }) => {
    await page.goto(`/dashboard/projeler/${DYB1}/gantt?view=aylik`)
    const row = page.locator('tr.aylik-task-row[data-task-code="M4"]')
    await expect(row).toHaveCount(1, { timeout: 20000 })

    const planned = await row.locator('td.aylik-cell').evaluateAll(cells =>
      cells.map(c => Number(c.dataset.planned || 0)).filter(v => v > 0))
    expect(planned).toHaveLength(6)
    expect(planned.reduce((a, b) => a + b, 0)).toBeCloseTo(63384, 6)
    await expect(row.locator('td.aylik-col-hedef')).toHaveText('63.384')

    const firstPlanned = row.locator('td.aylik-cell[data-month="2026-11"]')
    await expect(firstPlanned).toHaveText('4.464')
    await expect(firstPlanned).toHaveAttribute('title', /Kaynak: Excel Aylık İş Planı/)

    // Plan / Gerçekleşen ve Kümülatif modları aynı satırı yeniden çizer.
    await page.getByRole('button', { name: 'Plan / Gerçekleşen' }).click()
    await expect(firstPlanned).toContainText('/')
    await page.getByRole('button', { name: 'Kümülatif %' }).click()
    await expect(row.locator('td.aylik-cell[data-month="2027-04"]')).toContainText('P %100')
    await page.getByRole('button', { name: 'Plan', exact: true }).click()

    // Bu ayın kolonu (proje aralığındaysa) vurgulu.
    const now = new Date()
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentTh = page.locator(`th.aylik-month[data-month="${currentKey}"]`)
    if (await currentTh.count()) await expect(currentTh).toHaveClass(/is-current/)

    // Özet satırı: ay başına aktif kalem sayısı; M4'ün plan aylarında en az 1.
    await expect(page.locator('tr.aylik-summary-row td[data-month="2026-11"]')).not.toHaveText('')
  })

  test('filtreler: arama ve kategori', async ({ page }) => {
    await page.goto(`/dashboard/projeler/${DYB1}/gantt?view=aylik`)
    await expect(page.locator('tr.aylik-task-row').first()).toBeVisible({ timeout: 20000 })
    await page.getByPlaceholder('Kod veya iş kalemi ara…').fill('M4')
    await expect(page.locator('tr.aylik-task-row[data-task-code="M4"]')).toHaveCount(1)
    await page.getByPlaceholder('Kod veya iş kalemi ara…').fill('')
    await page.locator('.aylik-plan select').selectOption('kiris_montaji')
    const codes = await page.locator('tr.aylik-task-row').evaluateAll(rows => rows.map(r => r.dataset.taskCode))
    expect(codes).toContain('M4')
    expect(codes.every(Boolean)).toBe(true)
  })
})
