import { useDashboardData } from '../../../hooks/useDashboardData'
import { buildMaterialListRows } from '../../../utils/satinAlma'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import ProjeTabFaturaKesilecekler from './ProjeTabFaturaKesilecekler'

export default function ProjeTabMalzemeListesi({ projectId, filterDate }) {
  const { data: overview, loading, refreshing, error, refetch } = useDashboardData(
    'get_satin_alma_overview',
    { p_project_id: projectId },
    { enabled: !!projectId }
  )

  const authorized = overview?.authorized ?? true
  const requests = overview?.requests || []
  const procurement = overview?.procurement_items || []
  const pendingChanges = overview?.pending_changes || []
  const dateBoundary = new Date((filterDate || new Date().toISOString().split('T')[0]) + 'T23:59:59')
  const requestsUntilDate = requests.filter(request => !request.created_at || new Date(request.created_at) <= dateBoundary)
  const rows = buildMaterialListRows(procurement, requestsUntilDate)

  if (!loading && !authorized) return <UnauthorizedScopeNotice />

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <ProjeTabFaturaKesilecekler
        rows={rows}
        requests={requestsUntilDate}
        loading={loading}
        pendingChanges={pendingChanges}
        onPendingChanged={refetch}
      />
    </div>
  )
}
