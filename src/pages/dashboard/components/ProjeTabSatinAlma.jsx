import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'
import TabSatinAlmaOnayKuyrugu from './TabSatinAlmaOnayKuyrugu'
import ProjeTabAylikPlan from './ProjeTabAylikPlan'
import ProjeTabFaturaKesilecekler from './ProjeTabFaturaKesilecekler'
import ProjeTabRiskler from './ProjeTabRiskler'
import { buildMaterialListRows } from '../../../utils/satinAlma'

// activeSubTab/onSubTabChange kontrollüyse (ProjeDetay — Genel Proje'deki Riskler
// kartından "riskler" alt-sekmesine deep-link yapabilsin ve bildirimden gelen bir
// malzeme değişikliği "malzeme" alt-sekmesini zorlayabilsin diye) üst bileşenden
// gelir; yoksa (ör. index.jsx'teki şantiye şefi menü-seviyesi çağrısı) yerel,
// projeye özel localStorage'da kalıcı state'e düşülür (bkz. TabFinans.jsx'teki
// aynı desen) — ProjeTabMalzemeListesi.jsx'teki activeSection/onSectionChange
// ile birebir aynı fikir.
export default function ProjeTabSatinAlma({
  projectId, filterDate, siteChiefView = false,
  openRequestId, onOpenedRequest, onSelectedRequestChange,
  activeSubTab, onSubTabChange,
  openChangeRequestId, onOpenedChangeRequest,
  onGoTab,
}) {
  const { isAdmin, role } = useAuth()
  const canManageProcurement = isAdmin || role === 'proje_yoneticisi'
  const defaultTab = 'talepler'
  const [localTab, setLocalTab] = useState(() => {
    try { return window.localStorage.getItem(`proje-satin-alma-active-subtab-${projectId}`) || defaultTab } catch { return defaultTab }
  })
  const tab = activeSubTab ?? localTab
  const setTab = onSubTabChange ?? setLocalTab
  useEffect(() => {
    if (activeSubTab !== undefined) return
    try { window.localStorage.setItem(`proje-satin-alma-active-subtab-${projectId}`, localTab) } catch {}
  }, [localTab, projectId, activeSubTab])

  // Bildirimler'den belirli bir talebe gidilince talep detayının render edildiği sekmeye zorla geç.
  useEffect(() => {
    if (openRequestId) setTab('talepler')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequestId])

  // Aylık plandan "Talep Oluştur" ile bağlanan bir talebe tıklanınca da aynı yoldan
  // Talepler sekmesine geçip detay modalını açıyoruz — openRequestId dış (bildirim)
  // kaynaklı olduğundan, bunun için ayrı bir yerel state kullanılıyor.
  const [planLinkedRequestId, setPlanLinkedRequestId] = useState(null)
  function openLinkedRequest(requestId) {
    setPlanLinkedRequestId(requestId)
    setTab('talepler')
  }

  const { data: overview, loading, refreshing, error, refetch } = useDashboardData(
    'get_satin_alma_overview',
    { p_project_id: projectId },
    { enabled: !!projectId }
  )
  const authorized = overview?.authorized ?? true
  const procurement = overview?.procurement_items || []
  const pendingChanges = overview?.pending_changes || []
  const refresh = refetch
  // Malzeme Listesi alt-sekmesi için — 07.09.2026'da Malzeme Listesi/Riskler
  // buraya taşınana kadar bu hesaplama ProjeTabMalzemeListesi.jsx'te ayrı bir
  // get_satin_alma_overview çağrısıyla yapılıyordu (aynı veri iki kez çekiliyordu);
  // artık burada zaten yüklü olan `overview`'dan türetiliyor.
  const overviewRequests = overview?.requests || []
  const materialDateBoundary = new Date((filterDate || new Date().toISOString().split('T')[0]) + 'T23:59:59')
  const materialRequestsUntilDate = overviewRequests.filter(request => !request.created_at || new Date(request.created_at) <= materialDateBoundary)
  const materialRows = buildMaterialListRows(procurement, materialRequestsUntilDate)
  // TabSatinAlmaTalepListesi kendi get_purchase_requests_list RPC çağrısını yapıyor
  // (bu overview'dan bağımsız) — bu yüzden overview.requests'in Realtime ile tazelenmesi
  // liste tablosuna yansımaz. refreshKey'i bump ederek çocuk bileşenin kendi fetchData'sını
  // da tetikliyoruz.
  const [refreshKey, setRefreshKey] = useState(0)
  // projectId yoksa (proje yöneticisi tüm projeler modu) proje filtresi olmadan
  // dinlenir — RLS (has_project_access) zaten yalnızca erişilebilir projelerin
  // olaylarını client'a ulaştırıyor, ekstra bir daraltma gerekmiyor.
  useRealtimeRefresh(
    ['purchase_requests'],
    () => { refetch(); setRefreshKey(k => k + 1) },
    { enabled: true, filter: projectId ? { column: 'project_id', value: projectId } : undefined }
  )

  // "Bekleyen" (fixedStatus="onaylandi") sekmesi 04.09.2026'da kaldırıldı — bu
  // durumdaki talepler zaten "Talepler" sekmesinde de görünüyor ve proje
  // yöneticisi için aynı "Tamamlandı" satır aksiyonunu gösteriyor
  // (TabSatinAlmaTalepListesi.jsx'teki canCompleteProcurement satır mantığı
  // fixedStatus'tan bağımsız çalışır) — bu sekme yalnızca aynı verinin filtreli
  // bir tekrarıydı, kullanıcı kararıyla kaldırıldı.
  // "Aylık Satın Alma Planı" 04.09.2026'da Malzeme Listesi sekmesinden buraya
  // taşındı (bkz. ProjeTabAylikPlan.jsx) — proje yöneticisinin aylık satın alma
  // planlamasını Satın Alma bağlamında yapması için, kullanıcı kararıyla.
  // 'surec' ile aynı görünürlük kapsamını kullanır. "Malzeme Listesi"/"Riskler"
  // de 07.09.2026'da eski ayrı üst-seviye "Malzeme Listesi" sekmesinden (artık
  // kaldırıldı, bkz. ProjeDetay.jsx) buraya taşındı — ikisi de rol kısıtı olmadan
  // (siteChiefView dahil tüm roller) görünür, tek fark siteChiefView'da
  // Onay Bekleyenler/Teklif-Pazarlık-Sipariş/Aylık Plan'ın hâlâ gizli kalması.
  const TABS = [
    { key: 'talepler', label: 'Talepler' },
    ...(isAdmin ? [{ key: 'onay', label: 'Onay Bekleyenler' }] : []),
    ...(canManageProcurement ? [{ key: 'surec', label: 'Teklif / Pazarlık / Sipariş' }] : []),
    ...(canManageProcurement ? [{ key: 'aylik-plan', label: 'Aylık Satın Alma Planı' }] : []),
    { key: 'malzeme', label: 'Malzeme Listesi' },
    { key: 'riskler', label: 'Riskler' },
  ]

  // localStorage'dan gelen sekme farklı bir rolden/görünümden kalmış olabilir —
  // geçerli değilse varsayılana düş (bkz. TabFinans.jsx'teki aynı desen).
  useEffect(() => {
    if (!TABS.some(t => t.key === tab)) setTab(defaultTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, canManageProcurement])

  if (!loading && !authorized) {
    return <UnauthorizedScopeNotice />
  }

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      {/* Şantiye şefi görünümünde de artık bu şerit gösteriliyor (07.09.2026'ya kadar
          tamamen gizliydi, yalnızca Talepler görünürdü) — Malzeme Listesi/Riskler
          buraya taşınınca şantiye şefinin bunlara erişebilmesi için TABS zaten
          Onay Bekleyenler/Teklif-Pazarlık-Sipariş/Aylık Plan'ı bu rolde filtreliyor,
          yalnızca Talepler/Malzeme Listesi/Riskler kalıyor. */}
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
        <TabSatinAlmaTalepListesi
          projectId={projectId}
          filterDate={filterDate}
          onChanged={refresh}
          procurement={procurement}
          refreshKey={refreshKey}
          siteChiefView={siteChiefView}
          openRequestId={openRequestId || planLinkedRequestId}
          onOpenedRequest={() => { onOpenedRequest?.(); setPlanLinkedRequestId(null) }}
          onSelectedRequestChange={onSelectedRequestChange}
        />
      )}
      {tab === 'malzeme' && (
        <ProjeTabFaturaKesilecekler
          rows={materialRows}
          loading={loading}
          pendingChanges={pendingChanges}
          onPendingChanged={refresh}
          projectId={projectId}
          openChangeRequestId={openChangeRequestId}
          onOpenedChangeRequest={onOpenedChangeRequest}
          requests={materialRequestsUntilDate}
          procurement={procurement}
        />
      )}
      {tab === 'riskler' && (
        <ProjeTabRiskler
          projectId={projectId}
          onGoTab={target => { if (target === 'satin-alma') setTab('talepler'); else onGoTab?.(target) }}
        />
      )}
      {tab === 'onay' && isAdmin && <TabSatinAlmaOnayKuyrugu projectId={projectId} filterDate={filterDate} onChanged={refresh} procurement={procurement} refreshKey={refreshKey} />}
      {tab === 'surec' && canManageProcurement && (
        <TabSatinAlmaTalepListesi
          projectId={projectId}
          filterDate={filterDate}
          onChanged={refresh}
          procurement={procurement}
          refreshKey={refreshKey}
          fixedStatus={['teklif_toplama', 'pazarlik_onay_bekliyor', 'pazarlik', 'siparis']}
          listTitle="Teklif / Pazarlık / Sipariş Süreci"
        />
      )}
      {tab === 'aylik-plan' && canManageProcurement && (
        <ProjeTabAylikPlan projectId={projectId} onOpenRequest={openLinkedRequest} />
      )}
    </div>
  )
}
