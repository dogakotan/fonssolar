// Aylık İş Planı (TabIsPlaniAylik.jsx) için yan etkisiz yardımcılar.
// Supabase/React'e bağımlı değil — tests/is-plani-aylik.spec.js doğrudan
// Node'da import eder (bom-matching.spec.js deseni).
//
// Veri kaynağı vw_task_monthly_plan_vs_actual: görev × ay satırı, planned_qty
// görevin kendi biriminde, actual_qty progress_daily'den (rapor tarihinin ayı).
// Bir görevin satırı olmayan ayı boş hücredir; kümülatif değerler burada
// satırı olmayan aylara da taşınır (view yalnızca satırı olan ayda verir).

const TR_SHORT_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

export const SOURCE_LABELS = {
  excel_aylik: 'Excel Aylık İş Planı',
  hesaplanan: 'Gün bazlı hesaplandı',
  manuel: 'Elle girildi',
}

export const CATEGORY_LABELS = {
  mobilizasyon: 'Mobilizasyon',
  mekanik: 'Mekanik',
  kolon_montaji: 'Kolon Montajı',
  kiris_montaji: 'Kiriş Montajı',
  asik_montaji: 'Aşık Montajı',
  panel_montaji: 'Panel Montajı',
  elektrik_dc: 'Elektrik DC',
  elektrik_ac: 'Elektrik AC',
  elektrik_og: 'Elektrik OG',
  kosk_trafo: 'Köşk / Trafo',
  topraklama: 'Topraklama',
  enh: 'ENH',
  devreye_alma: 'Devreye Alma',
  evrak_sureci: 'Evrak Süreci',
  satin_alma: 'Satın Alma',
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || String(category || '-').replaceAll('_', ' ')
}

// 'YYYY-MM' — date tipi ('2026-10-01'), tam tarih ya da Date kabul eder.
// Metin girdide saat dilimi kayması olmasın diye Date'e çevrilmeden kesilir.
export function monthKey(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 7)
  const d = value instanceof Date ? value : new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return `${TR_SHORT_MONTHS[m - 1]} ${String(y).slice(2)}`
}

function nextMonthKey(key) {
  const [y, m] = key.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// Projenin start_date ayından target_date ayına kadar ay kolonları. Aralığın
// dışında veri (ör. başlangıçtan önce girilmiş ilerleme) varsa aralık o aya
// kadar genişler — veri hiçbir zaman gizlenmez. Tarih yoksa yalnızca veri
// aylarından türetilir.
export function buildMonthRange(startDate, endDate, dataMonthKeys = []) {
  const keys = [monthKey(startDate), monthKey(endDate), ...dataMonthKeys].filter(Boolean).sort()
  if (keys.length === 0) return []
  const first = keys[0]
  const last = keys[keys.length - 1]
  const months = []
  let cursor = first
  // Bozuk veriye karşı üst sınır: 20 yıl.
  for (let i = 0; i < 240; i += 1) {
    months.push({ key: cursor, label: monthLabel(cursor) })
    if (cursor === last) break
    cursor = nextMonthKey(cursor)
  }
  return months
}

// 'past' | 'current' | 'future' — renk yalnızca geçmiş ve içinde bulunulan ayda.
export function monthPhase(key, currentKey) {
  if (key < currentKey) return 'past'
  if (key === currentKey) return 'current'
  return 'future'
}

// task_id → Map(monthKey → view satırı)
export function indexRowsByTask(rows) {
  const byTask = new Map()
  ;(rows || []).forEach(row => {
    const key = monthKey(row.month)
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, new Map())
    byTask.get(row.task_id).set(key, row)
  })
  return byTask
}

const num = value => (value === null || value === undefined || value === '' ? 0 : Number(value) || 0)

// Bir görevin ay kolonlarına karşılık gelen hücreleri. Kümülatif değerler
// aralık öncesindeki satırları da kapsar ve satırı olmayan aya taşınır.
export function buildTaskCells(taskRows, months) {
  const rowMap = taskRows || new Map()
  const sortedKeys = [...rowMap.keys()].sort()
  const firstKey = sortedKeys[0]
  const lastKey = sortedKeys[sortedKeys.length - 1]
  let plannedCum = 0
  let actualCum = 0
  let i = 0
  return months.map(({ key }) => {
    while (i < sortedKeys.length && sortedKeys[i] <= key) {
      const r = rowMap.get(sortedKeys[i])
      plannedCum += num(r.planned_qty)
      actualCum += num(r.actual_qty)
      i += 1
    }
    const row = rowMap.get(key)
    return {
      monthKey: key,
      hasRow: Boolean(row),
      // Görevin ilk ve son satırlı ayı arasında mı — Kümülatif % modu yalnızca
      // bu aralıkta değer gösterir (iş bittikten sonra her ayda %100 tekrarı yok).
      inSpan: Boolean(firstKey) && key >= firstKey && key <= lastKey,
      planned: row ? num(row.planned_qty) : 0,
      actual: row ? num(row.actual_qty) : 0,
      plannedCum,
      actualCum,
      source: row?.source || null,
      sourceCode: row?.source_code ?? null,
      sourceQty: row?.source_qty ?? null,
      sourceUnit: row?.source_unit ?? null,
      note: row?.note || null,
    }
  })
}

// Bir ayda plan veya gerçekleşen varsa kalem o ay aktiftir.
export function isActiveCell(cell) {
  return Boolean(cell) && (cell.planned > 0 || cell.actual > 0)
}

// Plan / Gerçekleşen modunda renk: ≥%100 iyi, %70–99 orta, <%70 kötü.
// Plan 0 iken gerçekleşen varsa (plandan önce yapılmış iş) iyi sayılır;
// ikisi de 0 ise renk yok.
export function performanceTone(planned, actual) {
  if (!(planned > 0)) return actual > 0 ? 'iyi' : null
  const ratio = actual / planned
  if (ratio >= 1) return 'iyi'
  if (ratio >= 0.7) return 'orta'
  return 'kotu'
}

const QTY_FORMAT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })

export function fmtQty(value) {
  if (value === null || value === undefined || value === '') return '—'
  return QTY_FORMAT.format(Number(value))
}

export function fmtPct(part, whole) {
  if (!(whole > 0)) return '—'
  return `%${QTY_FORMAT.format(Math.round((part / whole) * 1000) / 10)}`
}

function sameUnit(a, b) {
  return String(a || '').trim().toLocaleLowerCase('tr-TR') === String(b || '').trim().toLocaleLowerCase('tr-TR')
}

// Excel'deki ham değer, birimi veya miktarı görevdekinden farklıysa gösterilir
// (birim dönüşümü ya da orantılama yapılmış hücre).
export function excelRawText(cell, taskUnit) {
  if (cell.sourceQty === null || cell.sourceQty === undefined) return null
  const unitDiffers = cell.sourceUnit && !sameUnit(cell.sourceUnit, taskUnit)
  const qtyDiffers = num(cell.sourceQty) !== cell.planned
  if (!unitDiffers && !qtyDiffers) return null
  return `Excel: ${fmtQty(cell.sourceQty)}${cell.sourceUnit ? ` ${cell.sourceUnit}` : ''}`
}

// Hücre tooltip'i (title niteliği) — satır satır metin.
export function cellTooltip(cell, task) {
  const unit = task?.unit ? ` ${task.unit}` : ''
  const lines = [
    `${task?.task_code ? `${task.task_code} · ` : ''}${monthLabel(cell.monthKey)}`,
    `Plan: ${fmtQty(cell.planned)}${unit}`,
    `Gerçekleşen: ${fmtQty(cell.actual)}${unit}`,
  ]
  const target = num(task?.target_qty)
  if (target > 0) {
    lines.push(`Kümülatif: plan ${fmtPct(cell.plannedCum, target)} · gerçekleşen ${fmtPct(cell.actualCum, target)}`)
  }
  if (cell.source) lines.push(`Kaynak: ${SOURCE_LABELS[cell.source] || cell.source}`)
  const raw = excelRawText(cell, task?.unit)
  if (raw) lines.push(raw)
  if (cell.note) lines.push(`Not: ${cell.note}`)
  return lines.join('\n')
}
