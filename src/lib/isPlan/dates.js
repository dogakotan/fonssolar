// İş Planı tarih yardımcıları (saf, React/Supabase'e bağımlı değil).
//
// Kural: tarih her yerde 'YYYY-MM-DD' metni ("gün anahtarı") olarak taşınır. Aritmetik, Date.UTC ile
// üretilen gün numarası üzerinden yapılır; yerel saat dilimi (getDate/setHours/toISOString karışımı) hiç
// kullanılmaz. Böylece sonuç tarayıcının saat diliminden bağımsızdır. "Bugün" yalnızca todayKey() ile ve
// açıkça verilen saat diliminde (varsayılan Europe/Istanbul) hesaplanır.
//
// Eski kodun hataları (docs/is-plani-denetim.md §3): yerel gece yarısını toISOString() ile metne çevirmek
// UTC+3'te bir gün geri gidiyordu; new Date('YYYY-MM-DD') UTC gece yarısı olduğu için UTC-7'de bir gün
// geri gösteriyordu.

export const DEFAULT_TIME_ZONE = 'Europe/Istanbul'
const MS_DAY = 86400000
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})/

// 'YYYY-MM-DD' (veya bununla başlayan metin, ör. '2026-10-15T00:00:00') → gün anahtarı; geçersizse null.
export function toKey(value) {
  if (!value || typeof value !== 'string') return null
  const m = KEY_RE.exec(value)
  if (!m) return null
  const [, y, mo, d] = m
  const n = Date.UTC(Number(y), Number(mo) - 1, Number(d))
  // 2026-02-30 gibi var olmayan günler reddedilir.
  return fromDayNumber(n / MS_DAY) === `${y}-${mo}-${d}` ? `${y}-${mo}-${d}` : null
}

function parts(key) {
  const k = toKey(key)
  if (!k) throw new TypeError(`Geçersiz tarih: ${key}`)
  return [Number(k.slice(0, 4)), Number(k.slice(5, 7)), Number(k.slice(8, 10))]
}

// 1970-01-01'den bu yana gün sayısı (UTC; saat dilimi yok).
export function dayNumber(key) {
  const [y, m, d] = parts(key)
  return Date.UTC(y, m - 1, d) / MS_DAY
}

export function fromDayNumber(n) {
  return new Date(n * MS_DAY).toISOString().slice(0, 10)
}

export function addDays(key, days) {
  return fromDayNumber(dayNumber(key) + days)
}

// a - b, gün olarak.
export function diffDays(a, b) {
  return dayNumber(a) - dayNumber(b)
}

// Başlangıç ve bitiş dahil gün sayısı; uçlardan biri yoksa 0, en az 1 (eski daysBetween davranışı).
export function daysInclusive(start, end) {
  const s = toKey(start)
  const e = toKey(end)
  if (!s || !e) return 0
  return Math.max(1, diffDays(e, s) + 1)
}

// 0 = pazar … 6 = cumartesi.
export function weekday(key) {
  return new Date(dayNumber(key) * MS_DAY).getUTCDay()
}

// Haftanın pazartesisi ve pazarı (hafta pazartesi başlar).
export function startOfWeek(key) {
  return addDays(key, -((weekday(key) + 6) % 7))
}

export function endOfWeek(key) {
  return addDays(key, (7 - weekday(key)) % 7)
}

export function daysInMonth(key) {
  const [y, m] = parts(key)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function startOfMonth(key) {
  return `${toKey(key).slice(0, 7)}-01`
}

export function endOfMonth(key) {
  return `${toKey(key).slice(0, 7)}-${String(daysInMonth(key)).padStart(2, '0')}`
}

// Ayın 1'inden n ay ilerisinin 1'i.
export function addMonths(key, n) {
  const [y, m] = parts(key)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

// 'YYYY-MM'
export function monthOf(key) {
  return toKey(key).slice(0, 7)
}

// Verilen saat diliminde bugünün gün anahtarı (varsayılan Europe/Istanbul; tarayıcının saat dilimi değil).
export function todayKey(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map(({ type, value }) => [type, value])
  )
  return `${p.year}-${p.month}-${p.day}`
}

// 'gg.aa.yyyy' (shortYear: 'gg.aa.yy'); tarih yoksa '-' (eski fmtDate davranışı).
export function formatDate(value, { shortYear = false } = {}) {
  const k = toKey(value)
  if (!k) return '-'
  const yy = shortYear ? k.slice(2, 4) : k.slice(0, 4)
  return `${k.slice(8, 10)}.${k.slice(5, 7)}.${yy}`
}

const MONTH_LONG = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// 'Ekim 2026'
export function formatMonthLong(key) {
  return MONTH_LONG.format(new Date(dayNumber(startOfMonth(key)) * MS_DAY))
}
