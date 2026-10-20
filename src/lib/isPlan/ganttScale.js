// Gantt zaman ölçeği (saf): gün başına sabit piksel.
//
// Ay başlıkları, hafta tikleri, görev çubukları ve "bugün" çizgisi aynı x() fonksiyonundan konum alır.
// Bir ayın genişliği = gün sayısı × pxPerDay. Eski kod her ayı 7 günlük tik sayısıyla ölçtüğü için
// (31 günlük ay = 5 tik = 35 gün) başlıklar çubuklardan her ay biraz daha kayıyordu (denetim H1).
import { addDays, addMonths, daysInMonth, diffDays, endOfMonth, formatMonthLong, monthOf, startOfMonth, toKey } from './dates.js'

export const MIN_PX_PER_DAY = 3

// Her ayda tik günleri. Son tik ay sonuna kadar uzar (22 → 28/29/30/31), kısa artık hücre oluşmaz.
const TICK_DAYS = [1, 8, 15, 22]

// Zaman çizelgesi aralığı: proje başlangıç/hedef tarihleri ve görev tarihlerinin hepsini kapsayan tam
// aylar. Aralık dışında kalan görev çubuğu kırpılmaz.
export function ganttRange({ projectStart, projectEnd, taskDates = [] }) {
  const keys = [projectStart, projectEnd, ...taskDates].map(toKey).filter(Boolean).sort()
  if (!keys.length) return null
  return { startKey: startOfMonth(keys[0]), endKey: endOfMonth(keys[keys.length - 1]) }
}

// Kapsayıcıyı doldurmak için gün başına piksel; en az MIN_PX_PER_DAY.
export function fitPxPerDay(availablePx, totalDays, min = MIN_PX_PER_DAY) {
  if (!(availablePx > 0) || !(totalDays > 0)) return min
  return Math.max(min, availablePx / totalDays)
}

export function createGanttScale({ startKey, endKey, pxPerDay = MIN_PX_PER_DAY }) {
  const start = startOfMonth(startKey)
  const end = endOfMonth(endKey)
  const totalDays = diffDays(end, start) + 1

  // Günün sol kenarının pikseli (zaman çizelgesi başına göre).
  const x = key => diffDays(key, start) * pxPerDay
  // Başlangıç ve bitiş günleri dahil çubuk.
  const span = (startDay, endDay) => ({ left: x(startDay), width: (diffDays(endDay, startDay) + 1) * pxPerDay })
  const contains = key => key >= start && key <= end

  const months = []
  const ticks = []
  for (let cursor = start; cursor <= end; cursor = addMonths(cursor, 1)) {
    const days = daysInMonth(cursor)
    months.push({ key: monthOf(cursor), start: cursor, days, label: formatMonthLong(cursor), left: x(cursor), width: days * pxPerDay })
    TICK_DAYS.forEach((day, i) => {
      const tickStart = addDays(cursor, day - 1)
      const nextDay = TICK_DAYS[i + 1] ?? days + 1
      ticks.push({ key: tickStart, label: String(day).padStart(2, '0'), left: x(tickStart), width: (nextDay - day) * pxPerDay })
    })
  }

  return { startKey: start, endKey: end, pxPerDay, totalDays, width: totalDays * pxPerDay, x, span, contains, months, ticks }
}

// Görev satırlarındaki dikey hafta çizgileri: her tikin sol kenarında 1 px'lik çizgi. CSS background
// katmanları olarak döner (eski tekdüze background-size yalnızca eşit hafta aralığında doğruydu).
export function gridBackground(scale, color = '#e2e8f0') {
  return scale.ticks
    .map(t => `linear-gradient(${color}, ${color}) ${t.left.toFixed(2)}px 0 / 1px 100% no-repeat`)
    .join(', ')
}

// Ölçek ile çizilmiş öğelerin hizasını sınamak için: bir günün ayı ve ay başlığı içindeki beklenen piksel.
export function expectedPositionInHeader(scale, key) {
  const month = scale.months.find(m => m.key === monthOf(key))
  if (!month) return null
  return { month, px: month.left + diffDays(key, month.start) * scale.pxPerDay }
}
