import { supabase } from '../../../lib/supabase'
import { parseDetails, wbsAreaErrorMessage } from '../../../utils/wbsAreaErrors'

// RPC çağrısı. save_project_tasks bu veritabanında yoksa (Faz 1 migration'ı öncesi) { missing: true } döner.
export async function callSaveProjectTasks(projectId, rows, { dryRun, weights = null }) {
  const { data, error } = await supabase.rpc('save_project_tasks', {
    p_project_id: projectId, p_tasks: rows, p_dry_run: dryRun, p_weights: weights,
  })
  if (error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''))) return { missing: true }
  if (error) {
    const detail = parseDetails(error)
    return { error: wbsAreaErrorMessage(error), items: detail?.items || null }
  }
  return { data }
}
