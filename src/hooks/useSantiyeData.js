import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { resolveProjectByAssignedId } from '../utils/projectResolver'

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useSantiyeData(projectId) {
  const [loading, setLoading]                           = useState(true)
  const [project, setProject]                           = useState(null)
  const [openPurchaseRequests, setOpenPurchaseRequests] = useState([])
  const [openTickets, setOpenTickets]                   = useState([])
  const [todayReport, setTodayReport]                   = useState(null)
  const [recentReports, setRecentReports]               = useState([])
  const [stats, setStats]                               = useState({ prCount: 0, ticketCount: 0 })
  const [progressSummary, setProgressSummary]           = useState(null)
  const [progressItems, setProgressItems]               = useState([])

  async function migrateLegacyDailyReports(legacyProjectId, canonicalProjectId) {
    if (!legacyProjectId || !canonicalProjectId || legacyProjectId === canonicalProjectId) return

    const { data: legacyReports } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('project_id', legacyProjectId)

    const reportIds = (legacyReports || []).map(r => r.id)
    if (reportIds.length === 0) return

    await supabase.from('daily_reports').update({ project_id: canonicalProjectId }).in('id', reportIds)
    await Promise.all([
      supabase.from('daily_report_material_usage').update({ project_id: canonicalProjectId }).in('report_id', reportIds),
      supabase.from('daily_report_photos').update({ project_id: canonicalProjectId }).in('report_id', reportIds),
      supabase.from('daily_report_issues').update({ project_id: canonicalProjectId }).in('report_id', reportIds),
    ])
  }

  const fetchAll = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const today = todayStr()

    const resolvedProject = await resolveProjectByAssignedId(supabase, projectId, 'id, name, location')
    const effectiveProjectId = resolvedProject?.id || projectId
    await migrateLegacyDailyReports(projectId, effectiveProjectId)

    const { data, error } = await supabase.rpc('get_santiye_dashboard', {
      p_project_id: effectiveProjectId,
      p_today:      today,
    })
    if (error) { console.error('get_santiye_dashboard error:', error); setLoading(false); return }

    setProject(data.project || resolvedProject || null)
    setTodayReport(data.today_report || null)
    setRecentReports(data.recent_reports || [])
    setOpenPurchaseRequests(data.purchase_requests || [])
    setOpenTickets(data.tickets || [])
    setStats({
      prCount:     data.pr_count     || 0,
      ticketCount: data.ticket_count || 0,
    })
    setProgressSummary(data.progress_summary || null)
    setProgressItems(data.progress_items    || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!projectId) return
    const channels = [
      supabase.channel('ss-tickets')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `project_id=eq.${projectId}` }, fetchAll)
        .subscribe(),
      supabase.channel('ss-prs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_requests', filter: `project_id=eq.${projectId}` }, fetchAll)
        .subscribe(),
      supabase.channel('ss-daily')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports', filter: `project_id=eq.${projectId}` }, fetchAll)
        .subscribe(),
    ]
    return () => channels.forEach(c => supabase.removeChannel(c))
  }, [projectId, fetchAll])

  return { loading, project, openPurchaseRequests, openTickets, todayReport, recentReports, stats, progressSummary, progressItems, refetch: fetchAll }
}
