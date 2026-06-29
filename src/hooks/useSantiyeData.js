import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { resolveProjectByAssignedId } from '../utils/projectResolver'

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useSantiyeData(projectId) {
  const [loading, setLoading]                           = useState(true)
  const [openPurchaseRequests, setOpenPurchaseRequests] = useState([])
  const [openTickets, setOpenTickets]                   = useState([])
  const [todayReport, setTodayReport]                   = useState(null)
  const [recentReports, setRecentReports]               = useState([])
  const [stats, setStats] = useState({ prCount: 0, ticketCount: 0 })

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

    const [reportRes, recentReportsRes, prRes, ticketRes, prCountRes, ticketCountRes] = await Promise.all([
      supabase.from('daily_reports')
        .select('id, report_date, general_status, worker_count, weather, weather_note, notes, created_at')
        .eq('project_id', effectiveProjectId).eq('report_date', today).maybeSingle(),

      supabase.from('daily_reports')
        .select('id, report_date, general_status, worker_count, weather, weather_note, notes, created_at')
        .eq('project_id', effectiveProjectId)
        .order('report_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30),

      supabase.from('purchase_requests')
        .select('id, title, urgency, status, created_at')
        .eq('project_id', effectiveProjectId).in('status', ['bekliyor', 'onaylandı'])
        .order('created_at', { ascending: false }),

      supabase.from('tickets')
        .select('id, title, severity, status, created_at, category')
        .eq('project_id', effectiveProjectId).in('status', ['gönderildi', 'açık', 'işlemde'])
        .order('created_at', { ascending: false }),

      supabase.from('purchase_requests').select('*', { count: 'exact', head: true })
        .eq('project_id', effectiveProjectId).in('status', ['bekliyor', 'onaylandı']),

      supabase.from('tickets').select('*', { count: 'exact', head: true })
        .eq('project_id', effectiveProjectId).in('status', ['gönderildi', 'açık', 'işlemde']),
    ])

    setTodayReport(reportRes.data || null)
    setRecentReports(recentReportsRes.data || [])
    setOpenPurchaseRequests(prRes.data || [])
    setOpenTickets(ticketRes.data || [])
    setStats({
      prCount:     prCountRes.count || 0,
      ticketCount: ticketCountRes.count || 0,
    })
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

  return { loading, openPurchaseRequests, openTickets, todayReport, recentReports, stats, refetch: fetchAll }
}
