import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { materialKey, materialName, normalizeStatus, toNumber } from '../utils/satinAlma'
import { useDashboardData } from './useDashboardData'
import { useRealtimeRefresh } from './useRealtimeRefresh'

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useSantiyeData(projectId) {
  const { user } = useAuth()
  const [purchaseRequests, setPurchaseRequests] = useState([])
  const [tickets, setTickets] = useState([])
  const [materialPlan, setMaterialPlan] = useState(new Map())
  const [requestedTotals, setRequestedTotals] = useState(new Map())
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsError, setRequestsError] = useState(null)

  const {
    data,
    loading,
    refreshing,
    error,
    refetch: refetchDashboard,
  } = useDashboardData(
    'get_santiye_dashboard',
    { p_project_id: projectId, p_today: todayStr() },
    { enabled: !!projectId }
  )

  // Keep overview data aligned with the dedicated menu pages:
  // own purchase requests and all tickets belonging to the assigned project.
  const fetchRequests = useCallback(async () => {
    if (!projectId || !user?.id) {
      setPurchaseRequests([])
      setTickets([])
      setMaterialPlan(new Map())
      setRequestedTotals(new Map())
      return
    }

    setRequestsLoading(true)
    setRequestsError(null)

    const [purchaseResult, ticketResult, materialResult] = await Promise.all([
      supabase.rpc('get_purchase_requests_list', {
        p_project_id: projectId,
        p_filter_date: null,
        p_only_pending: false,
      }),
      supabase
        .from('tickets')
        .select('id, project_id, created_by, title, description, severity, status, category, location, created_at, updated_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_satin_alma_overview', {
        p_project_id: projectId,
      }),
    ])

    if (
      purchaseResult.error ||
      !purchaseResult.data?.authorized ||
      ticketResult.error ||
      materialResult.error ||
      !materialResult.data?.authorized
    ) {
      const loadError = purchaseResult.error || ticketResult.error || materialResult.error || new Error('Talep listeleri yüklenemedi.')
      console.error('site chief request lists load error:', loadError)
      setRequestsError(loadError)
      setPurchaseRequests([])
      setTickets([])
      setMaterialPlan(new Map())
      setRequestedTotals(new Map())
      setRequestsLoading(false)
      return
    }

    const projectRequests = purchaseResult.data.requests || []
    const nextMaterialPlan = new Map()
    ;(materialResult.data.procurement_items || []).forEach(material => {
      const key = materialKey(materialName(material))
      if (!key) return
      nextMaterialPlan.set(
        key,
        toNumber(material.planned_qty ?? material.planned_quantity ?? material.quantity)
      )
    })

    const nextRequestedTotals = new Map()
    projectRequests
      .filter(request => normalizeStatus(request.status) === 'bekliyor')
      .forEach(request => {
        ;(request.items || []).forEach(item => {
          const key = materialKey(item.name)
          if (!key) return
          nextRequestedTotals.set(
            key,
            (nextRequestedTotals.get(key) || 0) + toNumber(item.quantity)
          )
        })
      })

    setPurchaseRequests(projectRequests.filter(request => request.requested_by === user.id))
    setTickets(ticketResult.data || [])
    setMaterialPlan(nextMaterialPlan)
    setRequestedTotals(nextRequestedTotals)
    setRequestsLoading(false)
  }, [projectId, user?.id])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const refetch = useCallback(
    () => Promise.all([refetchDashboard(), fetchRequests()]),
    [fetchRequests, refetchDashboard]
  )

  useRealtimeRefresh(
    ['daily_reports', 'purchase_requests', 'procurement_items', 'tickets', 'project_tasks'],
    refetch,
    { enabled: !!projectId, filter: projectId ? { column: 'project_id', value: projectId } : undefined }
  )

  return {
    loading: loading || requestsLoading,
    refreshing,
    error: error || requestsError,
    authorized: data?.authorized ?? true,
    project: data?.project || null,
    openPurchaseRequests: purchaseRequests,
    openTickets: tickets,
    materialPlan,
    requestedTotals,
    todayReport: data?.today_report || null,
    recentReports: data?.recent_reports || [],
    stats: { prCount: purchaseRequests.length, ticketCount: tickets.length },
    progressSummary: data?.progress_summary || null,
    progressItems: data?.progress_items || [],
    refetch,
  }
}
