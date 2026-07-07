import { useDashboardData } from './useDashboardData'
import { useRealtimeRefresh } from './useRealtimeRefresh'

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useSantiyeData(projectId) {
  const { data, loading, refreshing, error, refetch } = useDashboardData(
    'get_santiye_dashboard',
    { p_project_id: projectId, p_today: todayStr() },
    { enabled: !!projectId }
  )

  // Faz D: eski ss-tickets/ss-prs/ss-daily kanalları kaldırıldı, ortak
  // useRealtimeRefresh'e taşındı (tek kanal, debounce'lu, polling yedekli).
  const realtime = useRealtimeRefresh(
    ['daily_reports', 'purchase_requests', 'tickets', 'progress_items', 'project_tasks'],
    refetch,
    { enabled: !!projectId, filter: projectId ? { column: 'project_id', value: projectId } : undefined }
  )

  return {
    loading,
    refreshing,
    error,
    authorized: data?.authorized ?? true,
    project: data?.project || null,
    openPurchaseRequests: data?.purchase_requests || [],
    openTickets: data?.tickets || [],
    todayReport: data?.today_report || null,
    recentReports: data?.recent_reports || [],
    stats: { prCount: data?.pr_count || 0, ticketCount: data?.ticket_count || 0 },
    progressSummary: data?.progress_summary || null,
    progressItems: data?.progress_items || [],
    refetch,
    realtimeStatus: realtime.status,
    realtimeLastUpdated: realtime.lastUpdated,
  }
}
