import { supabase } from '../lib/supabase'

// ── Projeler ──────────────────────────────────────────────────────────────────
export async function getProjects() {
  const columns = 'id, name, capacity_kwp, capacity_kwe, location, total_days, start_date, target_date, status, progress, project_type, created_at'
  const [visibleResult, scopeResult] = await Promise.all([
    supabase.from('projects').select(columns).order('created_at', { ascending: false }),
    supabase.rpc('get_my_projects'),
  ])

  if (scopeResult.error) return visibleResult

  const visible = visibleResult.data || []
  const visibleIds = new Set(visible.map(project => project.id))
  const missing = (scopeResult.data || []).filter(project => !visibleIds.has(project.id))
  if (!missing.length) return visibleResult

  // cross_project rollerinde (proje_yoneticisi gibi) projects tablosunun RLS'i
  // yalnızca ana projeyi gösterebilir. get_my_projects kapsamı doğru döndürür;
  // eksik projelerin kart alanlarını yetkili detay RPC'sinden tamamlarız.
  const today = new Date().toISOString().slice(0, 10)
  const detailResults = await Promise.all(missing.map(project =>
    supabase.rpc('get_project_by_date', { p_project_id: project.id, p_date: today })
  ))
  const recovered = detailResults
    .filter(result => !result.error && result.data?.authorized && result.data?.project)
    .map(result => result.data.project)

  return {
    data: [...visible, ...recovered].sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    ),
    error: visibleResult.error,
  }
}
