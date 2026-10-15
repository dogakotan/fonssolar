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
  // İpucundaki hesap açıklaması için: görevin bütün satırları (ay sırasıyla) ve Excel
  // kaynak değerlerinin toplamı (orantılama paydası).
  const history = sortedKeys.map(k => {
    const r = rowMap.get(k)
    return { key: k, planned: num(r.planned_qty), actual: num(r.actual_qty) }
  })
  const excelRows = sortedKeys.map(k => rowMap.get(k)).filter(r => r.source === 'excel_aylik' && r.source_qty != null)
  const sourceTotal = excelRows.length ? excelRows.reduce((s, r) => s + num(r.source_qty), 0) : null
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
      history: history.slice(0, i),
      sourceTotal,
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

// 15.10.2026'da birimi "Set" (hedef 1) yapılan kalemler: migration notlarına bu satırı yazdı
// (20261015171128, 20261015173313). Aylık plan verisi oranları tutar (ör. 0,23); ekranda
// çalışılan her ayda "1" gösterilir, oran ipucunda yazar.
export const SET_DONUSUM_ISARETI = 'Birim değişikliği (15.10.2026)'

export function isConvertedSetTask(task) {
  return sameUnit(task?.unit, 'Set') && num(task?.target_qty) === 1
    && String(task?.notes || '').includes(SET_DONUSUM_ISARETI)
}

// Plan hücresinde gösterilecek miktar: dönüştürülen Set kaleminde çalışılan ay "1".
export function displayPlanned(cell, task) {
  if (cell.planned > 0 && isConvertedSetTask(task)) return 1
  return cell.planned
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

// ── İpucu: hücredeki her sayının nereden ve nasıl geldiği ────────────────────
// Satırlar "• " ile başlıyorsa açıklama, başlamıyorsa başlıktır (ipucu kutusu
// başlıkları kalın gösterir).

// 'YYYY-MM-DD' → UTC gün numarası (saat diliminden bağımsız).
function dayNo(dateKey) {
  const [y, m, d] = String(dateKey).slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

function fmtDay(dateKey) {
  const [y, m, d] = String(dateKey).slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

function fmtDayShort(n) {
  const dt = new Date(n * 86400000)
  return `${String(dt.getUTCDate()).padStart(2, '0')}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

// Görevin plan tarihleri içinde, verilen ayda kaç gün var (uç günler dahil).
export function taskDaysInMonth(task, key) {
  if (!task?.planned_start || !task?.planned_end) return null
  const [y, m] = key.split('-').map(Number)
  const monthStart = Math.round(Date.UTC(y, m - 1, 1) / 86400000)
  const monthEnd = Math.round(Date.UTC(y, m, 0) / 86400000)
  const s = dayNo(task.planned_start)
  const e = dayNo(task.planned_end)
  if (e < s) return null
  const from = Math.max(s, monthStart)
  const to = Math.min(e, monthEnd)
  return {
    days: to >= from ? to - from + 1 : 0,
    total: e - s + 1,
    from: to >= from ? fmtDayShort(from) : null,
    to: to >= from ? fmtDayShort(to) : null,
  }
}

// "4.464 (Kas 26) + 11.160 (Ara 26) = 15.624"; uzun listeler kısaltılır.
function sumText(parts, field) {
  const items = parts.filter(p => p[field] > 0)
  if (items.length === 0) return '0'
  const total = items.reduce((s, p) => s + p[field], 0)
  if (items.length === 1) return `${fmtQty(total)} (${monthLabel(items[0].key)})`
  const fmt = p => `${fmtQty(p[field])} (${monthLabel(p.key)})`
  const shown = items.length <= 6
    ? items.map(fmt)
    : [...items.slice(0, 2).map(fmt), `… ${items.length - 3} ay daha …`, fmt(items[items.length - 1])]
  return `${shown.join(' + ')} = ${fmtQty(total)}`
}

function planExplanation(cell, task, unit) {
  const target = num(task?.target_qty)
  const lines = []
  if (!cell.hasRow) {
    lines.push('• Bu ay için plan yok.')
    return lines
  }
  if (cell.source === 'excel_aylik' && cell.sourceQty != null) {
    const sq = num(cell.sourceQty)
    const sUnit = cell.sourceUnit ? ` ${cell.sourceUnit}` : ''
    const unitDiffers = cell.sourceUnit && !sameUnit(cell.sourceUnit, task?.unit)
    if (!unitDiffers && Math.abs(sq - cell.planned) < 0.005) {
      lines.push('• Kaynak: Excel Aylık İş Planı.')
      lines.push(`• Excel'de bu ay ${fmtQty(sq)}${sUnit} yazıyor; olduğu gibi alındı.`)
      return lines
    }
    const total = num(cell.sourceTotal)
    lines.push('• Kaynak: Excel Aylık İş Planı, görev hedefine orantılandı.')
    if (unitDiffers) {
      lines.push(`• Excel bu işi "${cell.sourceUnit}" biriminde veriyor, görev ise "${task?.unit || '—'}" biriminde.`)
    }
    lines.push(`• Excel'de bu ay ${fmtQty(sq)}${sUnit}; Excel'deki bütün ayların toplamı ${fmtQty(total)}${sUnit}.`)
    if (!unitDiffers) {
      lines.push(`• Excel toplamı (${fmtQty(total)}) görev hedefine (${fmtQty(target)}) eşit olmadığı için oran kullanıldı.`)
    }
    if (total > 0 && target > 0) {
      const exact = (target * sq) / total
      lines.push(`• Hesap: hedef × bu ay ÷ Excel toplamı = ${fmtQty(target)} × ${fmtQty(sq)} ÷ ${fmtQty(total)} = ${fmtQty(exact)}`)
      if (Math.abs(exact - cell.planned) >= 0.005) {
        lines.push(`• Ayların toplamı tam hedefe eşit olsun diye ${fmtQty(cell.planned)} olarak yuvarlandı.`)
      }
    }
    return lines
  }
  if (cell.source === 'hesaplanan') {
    lines.push('• Kaynak: Excel aylık planında bu iş yok; hedef, plan tarihlerindeki gün sayısına göre aylara bölündü.')
    const d = taskDaysInMonth(task, cell.monthKey)
    if (d && d.total > 0 && target > 0) {
      lines.push(`• Plan tarihleri ${fmtDay(task.planned_start)} – ${fmtDay(task.planned_end)}: toplam ${d.total} gün; bunun ${d.days} günü bu ayda${d.from ? ` (${d.from} – ${d.to})` : ''}.`)
      const exact = (target * d.days) / d.total
      lines.push(`• Hesap: hedef × bu aydaki gün ÷ toplam gün = ${fmtQty(target)} × ${d.days} ÷ ${d.total} = ${fmtQty(exact)}${unit}`)
    }
    return lines
  }
  if (cell.source === 'manuel') {
    lines.push('• Kaynak: elle girildi.')
    return lines
  }
  lines.push(`• Kaynak: ${SOURCE_LABELS[cell.source] || cell.source || 'bilinmiyor'}.`)
  return lines
}

const TONE_TEXT = {
  iyi: 'yeşil (%100 ve üstü)',
  orta: 'sarı (%70–99)',
  kotu: 'kırmızı (%70 altı)',
}

// Hücre ipucu: başlık, hedef ve tarihler, bu ayın planı (hesabıyla), gerçekleşen,
// gerçekleşme oranı ve renk kuralı, kümülatif plan/gerçekleşen (toplamıyla), not.
// opts.phase: 'past' | 'current' | 'future' (renk yalnızca geçmiş ve içinde bulunulan ayda).
export function cellTooltip(cell, task, opts = {}) {
  const unit = task?.unit ? ` ${task.unit}` : ''
  const target = num(task?.target_qty)
  const month = monthLabel(cell.monthKey)
  const lines = [
    `${task?.task_code ? `${task.task_code} · ` : ''}${month}${task?.task_name ? ` — ${task.task_name}` : ''}`,
  ]
  const span = task?.planned_start && task?.planned_end
    ? ` · Plan tarihleri: ${fmtDay(task.planned_start)} – ${fmtDay(task.planned_end)}`
    : ''
  lines.push(`• Hedef: ${target > 0 ? `${fmtQty(target)}${unit}` : 'tanımlı değil'}${span}`)

  if (cell.planned > 0 && isConvertedSetTask(task)) {
    lines.push(`Bu ayın planı: hücrede 1${unit} (bu ay setin işi yapılıyor)`)
    lines.push(`• Setin bu aya düşen payı: ${fmtQty(cell.planned)}${unit}; hesaplar bu payla yapılır.`)
  } else {
    lines.push(`Bu ayın planı: ${fmtQty(cell.planned)}${unit}`)
  }
  lines.push(...planExplanation(cell, task, unit))

  lines.push(`Bu ayın gerçekleşeni: ${fmtQty(cell.actual)}${unit}`)
  lines.push(`• Günlük raporlarda ${month} içinde bu iş için girilen ilerlemelerin toplamı.`)
  if (opts.phase === 'future') {
    lines.push('• Gelecek ay: gerçekleşen beklenmez, hücre renklendirilmez.')
  } else if (cell.planned > 0) {
    const tone = performanceTone(cell.planned, cell.actual)
    lines.push(`• Gerçekleşme oranı: ${fmtQty(cell.actual)} ÷ ${fmtQty(cell.planned)} = ${fmtPct(cell.actual, cell.planned)} → ${TONE_TEXT[tone]}`)
  } else if (cell.actual > 0) {
    lines.push('• Bu ay plan yokken iş yapılmış: yeşil sayılır.')
  }

  const history = cell.history || []
  lines.push('Kümülatif (ilk aydan bu aya kadar)')
  lines.push(`• Plan: ${sumText(history, 'planned')}${target > 0 ? ` → ÷ ${fmtQty(target)} hedef = ${fmtPct(cell.plannedCum, target)}` : ''}`)
  lines.push(`• Gerçekleşen: ${sumText(history, 'actual')}${target > 0 ? ` → ÷ ${fmtQty(target)} hedef = ${fmtPct(cell.actualCum, target)}` : ''}`)
  if (!cell.hasRow && history.length) {
    lines.push('• Bu ayda yeni plan yok; değer önceki aylardan taşındı.')
  }
  if (cell.note) lines.push(`• Not: ${cell.note}`)
  return lines.join('\n')
}
