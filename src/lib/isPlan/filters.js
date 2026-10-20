// İş Planı filtreleri (saf).
import { endOfMonth, endOfWeek, todayKey, toKey } from './dates.js'
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

// KPI şeridi: iptaller hariç toplam, devam eden, geciken.
export function taskKpis(tasks, asOf) {
  const active = tasks.filter(t => t.status !== 'iptal')
  return {
    total: active.length,
    ongoing: active.filter(t => t.status === 'devam_ediyor').length,
    risky: active.filter(t => isTaskLate(t, asOf)).length,
  }
}
