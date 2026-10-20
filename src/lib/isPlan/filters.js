// İş Planı filtreleri (saf).
import { endOfMonth, endOfWeek, startOfMonth, todayKey, toKey } from './dates.js'
import { isTaskLate } from './delay.js'

// Rapor dönemine göre ekranın "o tarihteki" görünümü için referans gün:
// günlük → seçilen gün, haftalık → o haftanın pazarı, aylık → ayın son günü. Tarih yoksa bugün.
export function effectiveFilterDate(dateText, period, today = todayKey()) {
  const base = toKey(dateText) || today
  if (period === 'weekly') return endOfWeek(base)
  if (period === 'monthly') return endOfMonth(base)
  return base
}

// Gantt durum filtresi: iptal görevler yalnızca 'iptal' filtresinde görünür.
export function matchesStatusFilter(task, statusFilter, asOf) {
  if (statusFilter === 'iptal') return task.status === 'iptal'
  if (task.status === 'iptal') return false
  if (statusFilter === 'devam') return task.status === 'devam_ediyor'
  if (statusFilter === 'tamamlandi') return task.status === 'tamamlandi'
  if (statusFilter === 'geciken') return isTaskLate(task, asOf)
  return true
}

// ── Ortak filtreler (3A) ───────────────────────────────────────────────────────────────────────────
// Genel, Detaylı ve Aylık İş Planı aynı filtre durumunu kullanır. Durum adres çubuğunda tutulur
// (?q=&grup=&durum=&kategori=&sorumlu=&buay=1); varsayılan değerler adrese yazılmaz.

export const DEFAULT_FILTERS = Object.freeze({ q: '', grup: 'all', durum: 'all', kategori: 'all', sorumlu: 'all', buAy: false })

const PARAM = { q: 'q', grup: 'grup', durum: 'durum', kategori: 'kategori', sorumlu: 'sorumlu', buAy: 'buay' }
export const FILTER_PARAM_NAMES = Object.freeze(Object.values(PARAM))

// Durum seçenekleri: ham durumlar + "geciken" (referans güne göre gecikmiş; tamamlanan ve iptal hariç).
// "Tüm durumlar" iptal görevleri de gösterir (Genel ve Detaylı'nın önceki davranışı).
export const DURUM_OPTIONS = Object.freeze([
  { value: 'beklemede', label: 'Beklemede' },
  { value: 'devam', label: 'Devam Eden' },
  { value: 'geciken', label: 'Geciken' },
  { value: 'tamamlandi', label: 'Tamamlanan' },
  { value: 'askida', label: 'Askıda' },
  { value: 'iptal', label: 'İptal' },
])
const DURUM_STATUS = { beklemede: 'beklemede', devam: 'devam_ediyor', tamamlandi: 'tamamlandi', askida: 'askida', iptal: 'iptal' }

// Bilinmeyen değerler varsayılana düşer (eski ya da elle yazılmış adres ekranı boşaltmasın).
export function normalizeFilters(raw = {}) {
  const out = { ...DEFAULT_FILTERS }
  if (typeof raw.q === 'string') out.q = raw.q
  for (const key of ['grup', 'kategori', 'sorumlu']) {
    if (typeof raw[key] === 'string' && raw[key] !== '') out[key] = raw[key]
  }
  if (raw.durum === 'all' || DURUM_OPTIONS.some(o => o.value === raw.durum)) out.durum = raw.durum
  out.buAy = raw.buAy === true || raw.buAy === '1' || raw.buAy === 'true'
  return out
}

export function parseFilterParams(params) {
  const raw = {}
  for (const [key, name] of Object.entries(PARAM)) {
    if (params.has(name)) raw[key] = params.get(name)
  }
  return normalizeFilters(raw)
}

export function hasFilterParams(params) {
  return FILTER_PARAM_NAMES.some(name => params.has(name))
}

// Filtre parametrelerini yazar; diğer parametreler (view vb.) korunur, varsayılan değerler silinir.
export function writeFilterParams(params, filters) {
  const next = new URLSearchParams(params)
  const f = normalizeFilters(filters)
  for (const [key, name] of Object.entries(PARAM)) {
    const value = f[key]
    const isDefault = key === 'q' ? !value.trim() : value === DEFAULT_FILTERS[key]
    if (isDefault) next.delete(name)
    else next.set(name, key === 'buAy' ? '1' : value)
  }
  return next
}

export function isFiltered(filters) {
  const f = normalizeFilters(filters)
  return Boolean(f.q.trim()) || f.grup !== 'all' || f.durum !== 'all' || f.kategori !== 'all' || f.sorumlu !== 'all' || f.buAy
}

// Sorumlu filtresinin değeri: kişi adı, yoksa rol (Detaylı'daki "Sorumlu" kolonuyla aynı).
export function responsibleLabel(task) {
  return String(task.responsible || task.responsible_role || '').trim()
}

// Görevin plan aralığı referans günün ayıyla çakışıyor mu (Genel ve Detaylı'da "bu ay").
export function taskOverlapsMonth(task, asOf) {
  const start = toKey(task.planned_start)
  const end = toKey(task.planned_end) || start
  if (!start || !asOf) return false
  return start <= endOfMonth(asOf) && end >= startOfMonth(asOf)
}

function matchesDurum(task, durum, asOf) {
  if (durum === 'all') return true
  if (durum === 'geciken') return isTaskLate(task, asOf)
  return task.status === DURUM_STATUS[durum]
}

// Üç görünümün ortak süzgeci. groupOf: görevin grup anahtarı (TabIsPlan.resolveGroup); inMonth: "bu ay"
// ölçütü — verilmezse plan aralığının referans ayla çakışması (Aylık, ay hücresindeki plan/gerçekleşeni verir).
export function filterTasks(tasks, filters, { asOf, groupOf = t => t.group_label, inMonth } = {}) {
  const f = normalizeFilters(filters)
  const term = f.q.trim().toLocaleLowerCase('tr-TR')
  const monthTest = inMonth || (task => taskOverlapsMonth(task, asOf))
  return tasks.filter(task => {
    if (f.grup !== 'all' && groupOf(task) !== f.grup) return false
    if (f.kategori !== 'all' && task.category !== f.kategori) return false
    if (f.sorumlu !== 'all' && responsibleLabel(task) !== f.sorumlu) return false
    if (!matchesDurum(task, f.durum, asOf)) return false
    if (term) {
      const hay = `${task.task_code || ''} ${task.task_name || ''}`.toLocaleLowerCase('tr-TR')
      if (!hay.includes(term)) return false
    }
    if (f.buAy && !monthTest(task)) return false
    return true
  })
}

// KPI şeridi: iptaller hariç toplam, devam eden, geciken.
export function taskKpis(tasks, asOf) {
  const active = tasks.filter(t => t.status !== 'iptal')
  return {
    total: active.length,
    ongoing: active.filter(t => t.status === 'devam_ediyor').length,
    risky: active.filter(t => isTaskLate(t, asOf)).length,
  }
}
