import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { fetchDoviz } from '../../../utils/exchangeRates'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import { classifyMaterials, classifyRequestTypes, normalizeStatus } from '../../../utils/satinAlma'
import ProjeTabSatinAlmaStats from './ProjeTabSatinAlmaStats'
import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'
import TabSatinAlmaOnayKuyrugu from './TabSatinAlmaOnayKuyrugu'
import ProjeTabSatinAlmaSidebar from './ProjeTabSatinAlmaSidebar'
import TedarikKuyrugu from './TedarikKuyrugu'

export default function ProjeTabSatinAlma({ projectId, filterDate, siteChiefView = false, procurementManagerView = false }) {
  const { isAdmin, role } = useAuth()
  const canManageProcurement = isAdmin || role === 'proje_yoneticisi'
  const [tab, setTab] = useState(procurementManagerView ? 'tedarik' : 'talepler')
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  const { data: overview, loading, refreshing, error, refetch } = useDashboardData(
    'get_satin_alma_overview',
    { p_project_id: projectId },
    { enabled: !!projectId }
  )
  const authorized = overview?.authorized ?? true
  const requests = overview?.requests || []
  const procurement = overview?.procurement_items || []
  const refresh = refetch
  // TabSatinAlmaTalepListesi kendi ham purchase_requests sorgusunu koşuyor (RPC'den bağımsız)
  // — overview.requests'in Realtime ile tazelenmesi liste tablosuna yansımaz. refreshKey'i
  // bump ederek çocuk bileşenin kendi fetchData'sını da tetikliyoruz.
  const [refreshKey, setRefreshKey] = useState(0)
  useRealtimeRefresh(
    ['purchase_requests'],
    () => { refetch(); setRefreshKey(k => k + 1) },
    { enabled: !!projectId, filter: { column: 'project_id', value: projectId } }
  )

  useEffect(() => {
    if (siteChiefView || procurementManagerView) return // Şantiye şefi / proje yöneticisi görünümünde döviz kartı (sidebar) gösterilmiyor.
    let alive = true
    // TCMB kur servisi yavaş/erişilemez olabilir; ana veriyi bekletmemesi için ayrı yükleniyor.
    fetchDoviz().then(kurData => {
      if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date })
    })
    return () => { alive = false }
  }, [siteChiefView, procurementManagerView])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const pendingRequests = requests.filter(r => normalizeStatus(r.status) === 'bekliyor')
  const tedarik = classifyMaterials(procurement, pendingRequests)
  const dagilim = classifyRequestTypes(requests)
  const kpi = {
    pending: pendingRequests.length,
    risky: tedarik.excess,
    invoicePending: requests.filter(r => ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor'].includes(normalizeStatus(r.status))).length,
    monthOpened: requests.filter(r => r.created_at && new Date(r.created_at) >= monthStart).length,
  }

  const TABS = procurementManagerView
    ? [
        { key: 'tedarik', label: 'Proje Yöneticisinde' },
      ]
    : [
        { key: 'talepler', label: 'Talepler' },
        ...(isAdmin ? [{ key: 'onay', label: 'Onay Bekleyenler' }] : []),
        ...(canManageProcurement ? [{ key: 'tedarik', label: 'Proje Yöneticisinde' }] : []),
      ]

  if (!loading && !authorized) {
    return <UnauthorizedScopeNotice />
  }

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      {!siteChiefView && !procurementManagerView && (
        <div className="sa-overview-grid">
          <ProjeTabSatinAlmaStats kpi={kpi} loading={loading} />
          <ProjeTabSatinAlmaSidebar tedarik={tedarik} dagilim={dagilim} doviz={doviz} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--color-border-md)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', padding: '10px 22px',
            fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
            color: tab === t.key ? 'var(--color-primary)' : 'var(--color-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'talepler' && (
        <TabSatinAlmaTalepListesi projectId={projectId} filterDate={filterDate} onChanged={refresh} procurement={procurement} refreshKey={refreshKey} siteChiefView={siteChiefView} />
      )}
      {tab === 'onay' && isAdmin && <TabSatinAlmaOnayKuyrugu projectId={projectId} filterDate={filterDate} onChanged={refresh} procurement={procurement} refreshKey={refreshKey} />}
      {tab === 'tedarik' && canManageProcurement && <TedarikKuyrugu projectId={projectId} />}
    </div>
  )
}
