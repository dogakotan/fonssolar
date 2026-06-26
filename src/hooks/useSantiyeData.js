import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useSantiyeData(projectId) {
  const [loading, setLoading]                           = useState(true)
  const [openPurchaseRequests, setOpenPurchaseRequests] = useState([])
  const [openTickets, setOpenTickets]                   = useState([])
  const [todayReport, setTodayReport]                   = useState(null)
  const [stats, setStats] = useState({ prCount: 0, ticketCount: 0 })

  const fetchAll = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const today = todayStr()

    const [reportRes, prRes, ticketRes, prCountRes, ticketCountRes] = await Promise.all([
      supabase.from('daily_reports')
        .select('id, general_status, worker_count, weather, weather_note, notes')
        .eq('project_id', projectId).eq('report_date', today).maybeSingle(),

      supabase.from('purchase_requests')
        .select('id, title, urgency, status, created_at')
        .eq('project_id', projectId).in('status', ['bekliyor', 'onaylandı'])
        .order('created_at', { ascending: false }),

      supabase.from('tickets')
        .select('id, title, severity, status, created_at, category')
        .eq('project_id', projectId).in('status', ['gönderildi', 'açık', 'işlemde'])
        .order('created_at', { ascending: false }),

      supabase.from('purchase_requests').select('*', { count: 'exact', head: true })
        .eq('project_id', projectId).in('status', ['bekliyor', 'onaylandı']),

      supabase.from('tickets').select('*', { count: 'exact', head: true })
        .eq('project_id', projectId).in('status', ['gönderildi', 'açık', 'işlemde']),
    ])

    setTodayReport(reportRes.data || null)
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

  return { loading, openPurchaseRequests, openTickets, todayReport, stats, refetch: fetchAll }
}
