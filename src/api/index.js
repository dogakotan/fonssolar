import { supabase } from '../lib/supabase'

// ── Projeler ──────────────────────────────────────────────────────────────────
// Gerçek kolon yapısı: id(text), name, capacity_kwp, capacity_kwe,
//                      location, total_days, start_date, target_date, created_at
export const getProjects = () =>
  supabase
    .from('projects')
    .select('id, name, capacity_kwp, capacity_kwe, location, total_days, start_date, target_date, created_at')
    .order('created_at', { ascending: false })

export const getActiveProjectCount = () =>
  supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })

// ── Günlük İlerleme ───────────────────────────────────────────────────────────
// Tablo: gunluk_ilerleme_örnek
// Kolonlar: project_name, category, work_item, quantity, unit,
//           daily_progress, total_progress, progress_percent, report_date
export const getGunlukIlerleme = (_projectName) =>
  supabase
    .from('gunluk_ilerleme_örnek')
    .select('*')
    .order('report_date', { ascending: false })

export const getPersonelMakineRaporu = () =>
  supabase
    .from('personel_makine_raporu')
    .select('*')
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle()

// ── Görevler ──────────────────────────────────────────────────────────────────
export const getWorkPackages = (projectId) =>
  supabase
    .from('work_packages')
    .select('*')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true })

export const getAllWorkPackages = () =>
  supabase
    .from('work_packages')
    .select('*')
    .order('due_date', { ascending: true })

export const getOpenTaskCount = () =>
  supabase
    .from('work_packages')
    .select('id', { count: 'exact', head: true })
    .in('status', ['active', 'pending', 'late'])

export const updateWorkPackageStatus = (id, status) =>
  supabase
    .from('work_packages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

// ── Satın Alma Talepleri ──────────────────────────────────────────────────────
export const getPendingPurchaseCount = () =>
  supabase
    .from('purchase_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'bekliyor')

// ── Ekip ──────────────────────────────────────────────────────────────────────
export const getProfile = (userId) =>
  supabase.from('profiles').select('*').eq('id', userId).single()

export const getTeamMembers = () =>
  supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .order('full_name')

// ── Agent Raporları ───────────────────────────────────────────────────────────
export const getAgentReports = (projectId) =>
  supabase
    .from('agent_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

// Tüm raporlar — opsiyonel projectId ve/veya role filtresi
export const getAllAgentReports = ({ projectId, role } = {}) => {
  let q = supabase
    .from('agent_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (projectId) q = q.eq('project_id', projectId)
  if (role)      q = q.eq('agent_role', role)
  return q
}

// Proje bazında her rolün en güncel raporu
export const getLatestReportsByProject = (projectId) =>
  supabase
    .from('agent_reports')
    .select('agent_role, report_text, risk_level, created_at')
    .eq('project_id', projectId)
    .neq('agent_role', 'orchestrator')
    .order('created_at', { ascending: false })
    .limit(50)

export const insertAgentReport = (payload) =>
  supabase.from('agent_reports').insert(payload).select().single()

// ── KPI ───────────────────────────────────────────────────────────────────────
export const getDashboardKpis = async () => {
  const [projects, tasks, purchases] = await Promise.all([
    getActiveProjectCount(),
    getOpenTaskCount(),
    getPendingPurchaseCount(),
  ])

  const errors = [projects.error, tasks.error, purchases.error]
    .filter(e => e && e.code !== '42P01')
  return {
    activeProjects:   projects.count  ?? 0,
    openTasks:        tasks.error?.code === '42P01' ? 0 : (tasks.count ?? 0),
    pendingPurchases: purchases.error?.code === '42P01' ? 0 : (purchases.count ?? 0),
    error: errors.length ? errors : null,
  }
}
