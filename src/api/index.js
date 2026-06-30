import { supabase } from '../lib/supabase'

// ── Projeler ──────────────────────────────────────────────────────────────────
export const getProjects = () =>
  supabase
    .from('projects')
    .select('id, name, capacity_kwp, capacity_kwe, location, total_days, start_date, target_date, status, progress, project_type, created_at')
    .order('created_at', { ascending: false })
