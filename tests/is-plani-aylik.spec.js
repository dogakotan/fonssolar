import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'
import {
  buildMonthRange, buildTaskCells, cellTooltip, displayPlanned, excelRawText, fmtQty, fmtPct,
  indexRowsByTask, isActiveCell, isConvertedSetTask, monthLabel, monthPhase, performanceTone,
} from '../src/utils/aylikPlan.js'

// Aylık İş Planı (Faz 1, salt okunur). İki blok:
//  1) src/utils/aylikPlan.js'in yan etkisiz yardımcıları — tarayıcı/DB yok.
//  2) Canlıda isdemir-diyarbakir-arazi-faz1 üzerinde arayüz — YALNIZCA OKUR,
//     hiçbir satır yazmaz, bildirim üretmez (Karar 72 istisnası, 15.10.2026).
//     Proje yöneticisi test hesabıyla girilir.

const DYB1 = process.env.TEST_PROJECT_DYB1 || 'isdemir-diyarbakir-arazi-faz1'

test.describe('aylikPlan yardımcıları', () => {
  test('15.10.2026 Set dönüşümü: çalışılan ayda 1 gösterilir, oran ipucunda', () => {
    const set = { task_code: 'E1', unit: 'Set', target_qty: 1, notes: 'Öncül: M1\nBirim değişikliği (15.10.2026): 2.020.000 mt (kazı) → 1 Set; aylık plan eski oranla dağıtıldı.' }
    const eskiSet = { task_code: 'M0', unit: 'Set', target_qty: 1, notes: 'Sorumlu: Şantiye Şefi' }
    expect(isConvertedSetTask(set)).toBe(true)
    expect(isConvertedSetTask(eskiSet)).toBe(false)
    expect(isConvertedSetTask({ ...set, target_qty: 2 })).toBe(false)
    const cell = { monthKey: '2027-03', planned: 0.23, actual: 0, hasRow: true, source: 'excel_aylik', history: [] }
    expect(displayPlanned(cell, set)).toBe(1)
    expect(displayPlanned({ ...cell, planned: 0 }, set)).toBe(0)
    expect(displayPlanned({ ...cell, planned: 0.49 }, eskiSet)).toBe(0.49)
    const tip = cellTooltip(cell, set, { phase: 'future' })
    expect(tip).toContain('Bu ayın planı: hücrede 1 Set')
    expect(tip).toContain('Setin bu aya düşen payı: 0,23 Set')
  })

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

  // İpucu her sayının hesabını açıklar. Örnekler DYB1'in gerçek satırları (15.10.2026).
  const cellsFor = (task, rows, from, to) => buildTaskCells(
    indexRowsByTask(rows.map(r => ({ task_id: 't', actual_qty: 0, note: null, ...r }))).get('t'),
    buildMonthRange(from, to))

  test('ipucu: Excel değeri birim farkıyla orantılandı (E9: 105.000 × 2 ÷ 16)', () => {
    const task = { task_code: 'E9', task_name: 'DC Kazı Kapatma', unit: 'mt (tahmini)', target_qty: 105000, planned_start: '2026-11-01', planned_end: '2027-05-31' }
    const ex = (month, planned_qty, source_qty) => ({ month, planned_qty, source: 'excel_aylik', source_qty, source_unit: 'Trafo Merkezi' })
    const cells = cellsFor(task, [ex('2026-11-01', 13125, 2), ex('2026-12-01', 19688, 3), ex('2027-03-01', 19687, 3), ex('2027-04-01', 26250, 4), ex('2027-05-01', 26250, 4)], '2026-11-01', '2027-05-31')
    const nov = cellTooltip(cells[0], task, { phase: 'future' })
    expect(nov).toContain('Bu ayın planı: 13.125 mt (tahmini)')
    expect(nov).toContain('"Trafo Merkezi" biriminde')
    expect(nov).toContain("Excel'deki bütün ayların toplamı 16 Trafo Merkezi")
    expect(nov).toContain('105.000 × 2 ÷ 16 = 13.125')
    expect(nov).toContain('Gelecek ay')
    const dec = cellTooltip(cells[1], task, { phase: 'future' })
    expect(dec).toContain('105.000 × 3 ÷ 16 = 19.687,5')
    expect(dec).toContain('19.688 olarak yuvarlandı')
    expect(dec).toContain('13.125 (Kas 26) + 19.688 (Ara 26) = 32.813')
    expect(dec).toContain('= %31,3')
    // Ocak: plan yok, kümülatif taşınır.
    const jan = cellTooltip(cells[2], task, { phase: 'future' })
    expect(jan).toContain('Bu ay için plan yok')
    expect(jan).toContain('önceki aylardan taşındı')
  })

  test('ipucu: Excel toplamı hedefe eşit değil, aynı birimde orantılandı (DYB2 E2)', () => {
    const task = { task_code: 'E2', unit: 'mt', target_qty: 900000 }
    const ex = (month, planned_qty, source_qty) => ({ month, planned_qty, source: 'excel_aylik', source_qty, source_unit: 'mt' })
    const cells = cellsFor(task, [ex('2027-03-01', 25000, 20000), ex('2027-04-01', 250000, 200000), ex('2027-05-01', 312500, 250000), ex('2027-06-01', 312500, 250000)], '2027-03-01', '2027-06-30')
    const text = cellTooltip(cells[0], task, { phase: 'future' })
    expect(text).toContain('Excel toplamı (720.000) görev hedefine (900.000) eşit olmadığı için')
    expect(text).toContain('900.000 × 20.000 ÷ 720.000 = 25.000')
    expect(text).not.toContain('yuvarlandı')
  })

  test('ipucu: Excel değeri olduğu gibi (M4) ve gerçekleşme oranı/renk', () => {
    const task = { task_code: 'M4', unit: 'Adet', target_qty: 63384 }
    const cells = cellsFor(task, [{ month: '2026-11-01', planned_qty: 4464, actual_qty: 3200, source: 'excel_aylik', source_qty: 4464, source_unit: 'Adet' }], '2026-11-01', '2026-11-30')
    const text = cellTooltip(cells[0], task, { phase: 'past' })
    expect(text).toContain("Excel'de bu ay 4.464 Adet yazıyor; olduğu gibi alındı")
    expect(text).toContain('3.200 ÷ 4.464 = %71,7 → sarı (%70–99)')
    expect(text).toContain('Günlük raporlarda Kas 26 içinde')
  })

  test('ipucu: gün bazlı dağıtım (EK1: 16 × 30 ÷ 61)', () => {
    const task = { task_code: 'EK1', unit: 'Pano/Köşk', target_qty: 16, planned_start: '2027-06-01', planned_end: '2027-07-31' }
    const h = (month, planned_qty) => ({ month, planned_qty, source: 'hesaplanan', note: 'Excel Aylık İş Planında yok; gün bazlı dağıtıldı' })
    const cells = cellsFor(task, [h('2027-06-01', 7.87), h('2027-07-01', 8.13)], '2027-06-01', '2027-07-31')
    const jun = cellTooltip(cells[0], task, { phase: 'future' })
    expect(jun).toContain('toplam 61 gün; bunun 30 günü bu ayda (01.06 – 30.06)')
    expect(jun).toContain('16 × 30 ÷ 61 = 7,87 Pano/Köşk')
    expect(jun).toContain('Not: Excel Aylık İş Planında yok')
    expect(cellTooltip(cells[1], task, { phase: 'future' })).toContain('16 × 31 ÷ 61 = 8,13')
    // Birim ve miktar aynıysa ham değer tekrar yazılmaz (eski yardımcı).
    expect(excelRawText({ planned: 250, sourceUnit: 'mt', sourceQty: 250 }, 'mt')).toBeNull()
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
    await expect(firstPlanned).toHaveAttribute('data-tip', /Kaynak: Excel Aylık İş Planı/)
    // Fareyle üzerine gelince ipucu kutusu anında açılır, imleç soru işareti olmaz.
    await firstPlanned.hover()
    await expect(page.getByRole('tooltip')).toContainText('Kaynak: Excel Aylık İş Planı')
    expect(await firstPlanned.evaluate(c => getComputedStyle(c).cursor)).not.toBe('help')
    await page.locator('.aylik-legend').hover()
    await expect(page.getByRole('tooltip')).toHaveCount(0)

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
