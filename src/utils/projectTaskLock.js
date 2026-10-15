// Proje düzenleme sihirbazının İş Kalemleri kilidi.
//
// Sihirbaz düzenleme modunda iş kalemlerini kaydederken projenin BÜTÜN görevlerini silip
// yeniden ekliyor (ProjeEditWizard.directSave adım 2, Adim8Tamamlandi "Projeyi Güncelle").
// Görev silinince task_dependencies ve task_monthly_plan satırları FK CASCADE ile uyarısız
// silinir; wbs_id, group_label gibi sihirbazın yeniden yazmadığı alanlar kaybolur; günlük
// rapor ve register bağları kopar ya da silme FK hatasıyla yarıda kalır. Bu modül görev
// silmeden önce projede bu verilerden biri var mı diye sayar; varsa kayıt engellenir.
//
// Supabase istemcisi parametre olarak alınır (bu dosya lib/supabase'i import etmez) —
// böylece saf fonksiyonlar Node'da birim testiyle sınanabilir.

// Göreve bağlı kayıt tutan tablolar (task_id dolu satırlar). Hepsinin project_id kolonu var.
export const LINKED_RECORD_TABLES = [
  'project_risks', 'rfis', 'documents', 'decisions', 'project_actions', 'technical_submittals',
  'material_approvals', 'changes', 'claims', 'interfaces', 'procurement_items', 'purchase_requests',
]

// Sayılan veriler; sıra uyarı metnindeki sıradır.
export const TASK_LOCK_CHECKS = [
  { key: 'dependencies', label: 'öncül/ardıl bağımlılığı', table: 'task_dependencies', select: 'project_id' },
  { key: 'monthlyPlan',  label: 'aylık plan satırı',       table: 'task_monthly_plan', select: 'project_id' },
  { key: 'progress',     label: 'günlük rapor ilerleme kaydı', table: 'progress_daily', viaTask: true },
  { key: 'wbs',          label: "WBS'e bağlı görev",       table: 'project_tasks', select: 'id', notNull: 'wbs_id' },
  { key: 'linked',       label: 'göreve bağlı kayıt',      table: 'daily_tasks', viaTask: true },
  ...LINKED_RECORD_TABLES.map(table => ({
    key: 'linked', label: 'göreve bağlı kayıt', table, select: 'project_id', notNull: 'task_id',
  })),
]

// counts: { [table]: sayı } → { locked, reasons: [{ key, label, count }] }. Aynı anahtarlı
// tablolar (göreve bağlı kayıtlar) tek satırda toplanır. Sayısı bilinmeyen (null/undefined)
// tablo kilit sebebi sayılır: kontrol yapılamadıysa güvenli taraf engellemektir.
export function summarizeTaskLock(counts = {}) {
  const byKey = new Map()
  let unknown = false
  for (const check of TASK_LOCK_CHECKS) {
    const raw = counts[check.table]
    if (raw == null || Number.isNaN(Number(raw))) { unknown = true; continue }
    const n = Number(raw)
    if (n <= 0) continue
    const prev = byKey.get(check.key)
    byKey.set(check.key, { key: check.key, label: check.label, count: (prev?.count ?? 0) + n })
  }
  const reasons = TASK_LOCK_CHECKS
    .map(c => c.key)
    .filter((k, i, arr) => arr.indexOf(k) === i && byKey.has(k))
    .map(k => byKey.get(k))
  return { locked: unknown || reasons.length > 0, unknown, reasons }
}

export function taskLockMessage(summary) {
  if (!summary?.locked) return null
  const tail = 'İş kalemleri sihirbazdan kaydedilirse bu veriler silinir veya bozulur; bu yüzden ' +
    'bu projede iş kalemleri sihirbazdan kaydedilemez. Görev değişikliği için sistem yöneticisine başvurun.'
  if (!summary.reasons.length) {
    return 'Bu projenin görev verileri kontrol edilemedi. ' + tail
  }
  const parts = summary.reasons.map(r => `${r.count} ${r.label}`)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ve ${parts.at(-1)}` : parts[0]
  return `Bu projede ${list} var. ${tail}`
}

// Projede kilit gerektiren veri var mı? Ağ/yetki hatasında locked:true döner (fail-closed).
export async function fetchProjectTaskLock(client, projectId) {
  const counts = {}
  await Promise.all(TASK_LOCK_CHECKS.map(async (check) => {
    let q = check.viaTask
      ? client.from(check.table).select('task_id, project_tasks!inner(project_id)', { count: 'exact', head: true })
        .eq('project_tasks.project_id', projectId)
      : client.from(check.table).select(check.select, { count: 'exact', head: true }).eq('project_id', projectId)
    if (check.notNull) q = q.not(check.notNull, 'is', null)
    const { count, error } = await q
    counts[check.table] = error ? null : (count ?? 0)
  }))
  const summary = summarizeTaskLock(counts)
  return { ...summary, counts, message: taskLockMessage(summary) }
}
