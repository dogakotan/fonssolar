// Görev ilerlemesi ve tarihe göre durum (saf). Mantık TabIsPlan.jsx'teki eski hâliyle aynı; yalnızca
// tarih karşılaştırması gün anahtarıyla yapılıyor.
import { toKey } from './dates.js'

// get_project_gantt.task_progress (filtre tarihine kadarki miktar yüzdesi) varsa o, yoksa progress_pct.
export function progressFor(task, progressMap) {
  return Math.round(progressMap?.[task.id] !== undefined ? progressMap[task.id] : Number(task.progress_pct || 0))
}

// target_qty'si olmayan kilometre taşı görevlerde durum set_task_milestone_status ile elle yönetilir;
// DB'deki status tek doğru kaynak. Miktarlı görevde tamamlandi/iptal kesin; aksi halde yüzde ve plan
// başlangıcına göre türetilir. Not: 'bekliyor' DB'de olmayan bir değer (denetim R11); bu fazda değişmedi.
export function deriveTaskStatusAt(task, pct, asOf) {
  if (!(Number(task.target_qty || 0) > 0)) return task.status || 'beklemede'
  if (task.status === 'tamamlandi' || task.status === 'iptal') return task.status
  if (pct >= 100) return 'tamamlandi'
  const start = toKey(task.planned_start)
  if (start && asOf < start) return 'bekliyor'
  if (pct > 0) return 'devam_ediyor'
  return task.status || 'bekliyor'
}

// O günkü rapordaki miktarın görev hedefine oranı.
export function pctFromDailyProgress(targetQty, dailyRows) {
  if (targetQty <= 0) return 0
  const dailyDone = (dailyRows || []).reduce((sum, row) => sum + Number(row.qty_added || 0), 0)
  return Math.min(100, Math.round((dailyDone / targetQty) * 100))
}
