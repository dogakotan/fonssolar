import { supabase } from '../lib/supabase'

// ── Projeler ──────────────────────────────────────────────────────────────────
export const getProjects = () =>
  supabase
    .from('projects')
    .select('id, name, capacity_kwp, capacity_kwe, location, total_days, start_date, target_date, status, progress, project_type, created_at')
    .order('created_at', { ascending: false })

// ── Görevler ──────────────────────────────────────────────────────────────────
export const getWorkPackages = async (projectId) => {
  const { data, error } = await supabase
    .from('project_tasks')
    .select('id, task_name, task_code, category, sub_category, planned_start, planned_end, progress_pct, status, responsible, team_size, notes, project_id')
    .eq('project_id', projectId)
    .order('planned_start', { ascending: true })
  return {
    error,
    data: data?.map(r => ({
      ...r,
      name:       r.task_name,
      start_date: r.planned_start,
      due_date:   r.planned_end,
      progress:   r.progress_pct ?? 0,
    })) ?? [],
  }
}
