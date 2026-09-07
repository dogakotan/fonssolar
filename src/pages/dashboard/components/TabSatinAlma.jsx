import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import { classifyMaterials, normalizeStatus } from '../../../utils/satinAlma'
import ProjeTabSatinAlmaStats from './ProjeTabSatinAlmaStats'
import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'
import TabSatinAlmaOnayKuyrugu from './TabSatinAlmaOnayKuyrugu'
import MuhasebeSatinAlma from './MuhasebeSatinAlma'

export default function TabSatinAlma({ openRequestId, onOpenedRequest, onSelectedRequestChange } = {}) {
  const { isAdmin, isMuhasebe } = useAuth()
  // Üst sekme: Genel (tüm projeler KPI özeti) | Detay (talep listeleri) — Muhasebe
  // Finans'taki Genel/Detay pill deseniyle aynı fikir; listeler artık sayfa açılınca
  // ilk görünen içerik değil, "Detay"ın içine taşındı (kullanıcı kararı, 03.09.2026).
  const [tab, setTab] = useState(() => {
    try { return window.localStorage.getItem('satin-alma-active-maintab') || 'genel' } catch { return 'genel' }
  })
  useEffect(() => {
    try { window.localStorage.setItem('satin-alma-active-maintab', tab) } catch {}
  }, [tab])

  // Detay içindeki liste alt-sekmesi — ayrı anahtarda kalıcı (eski davranışla aynı).
  const [subTab, setSubTab] = useState(() => {
    try { return window.localStorage.getItem('satin-alma-active-subtab') || 'talepler' } catch { return 'talepler' }
  })
  useEffect(() => {
    try { window.localStorage.setItem('satin-alma-active-subtab', subTab) } catch {}
  }, [subTab])

  // Bildirimler'den belirli bir talebe gidilince Detay > Talepler'e zorla geç.
  useEffect(() => {
    if (openRequestId) { setTab('detay'); setSubTab('talepler') }
  }, [openRequestId])
  const [projectFilter, setProjectFilter] = useState('all')
  const { data: overview, refreshing, error, refetch } = useDashboardData('get_satin_alma_overview_all', {})
  const requests = overview?.requests || []
  const procurement = overview?.procurement_items || []
  const refresh = refetch
  // TabSatinAlmaTalepListesi kendi get_purchase_requests_list RPC çağrısını yapıyor
  // (bu overview'dan bağımsız) — bu yüzden overview.requests'in Realtime ile tazelenmesi
  // liste tablosuna yansımaz. refreshKey'i bump ederek çocuk bileşenin kendi fetchData'sını
  // da tetikliyoruz.
  const [refreshKey, setRefreshKey] = useState(0)
  useRealtimeRefresh(['purchase_requests'], () => { refetch(); setRefreshKey(k => k + 1) })

  const projectOptions = (() => {
    const map = new Map()
    requests.forEach(r => { if (r.project_id && !map.has(r.project_id)) map.set(r.project_id, r.project_name) })
    procurement.forEach(p => { if (p.project_id && !map.has(p.project_id)) map.set(p.project_id, p.project_name) })
    return [...map.entries()]
      .map(([id, name]) => ({ id, name: name || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  })()

  const scopedProcurement = projectFilter === 'all' ? procurement : procurement.filter(p => p.project_id === projectFilter)

  // Muhasebe'nin gördüğü tek talep listesi zaten satin_alindi/fatura_bekliyor
  // kapsamına daraltılmış (get_purchase_requests_list_internal) — "Tüm Talepler"
  // etiketi bu daralmayı yansıtmıyor, gerçek görevini ("faturalanacak talepler")
  // anlatan bir başlık kullanılıyor.
  // "Teklif / Pazarlık / Sipariş" 03.09.2026'da ayrı bir üst-seviye sayfaya taşındı
  // (bkz. TabTeklifPazarlikSiparis.jsx, Sidebar.jsx) — aynı verinin burada tekrar
  // listelenmemesi için bu alt-sekme kaldırıldı. "Bekleyen" (fixedStatus="onaylandi")
  // sekmesi de 04.09.2026'da aynı gerekçeyle kaldırıldı — bu durumdaki talepler
  // zaten "Tüm Talepler" sekmesinde aynı "Tamamlandı" satır aksiyonuyla görünüyor
  // (bkz. ProjeTabSatinAlma.jsx'teki aynı karar).
  const SUB_TABS = [
    { key: 'talepler', label: isMuhasebe ? 'Faturalanacak Talepler' : 'Tüm Talepler' },
    ...(isAdmin ? [{ key: 'onay', label: 'Onay Bekleyenler' }] : []),
  ]

  // localStorage'dan gelen alt-sekme farklı bir rolden kalmış olabilir — geçerli
  // değilse varsayılana düş (bkz. TabFinans.jsx'teki aynı desen).
  useEffect(() => {
    if (!SUB_TABS.some(t => t.key === subTab)) setSubTab('talepler')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const activeProjectId = projectFilter === 'all' ? undefined : projectFilter

  // "Genel" KPI özeti proje filtresinden bağımsız — her zaman erişilebilir tüm
  // projelerin toplamı (kullanıcı kararı: filtreye duyarlı değil, ProjeTabSatinAlma'daki
  // 4 kartla birebir aynı hesap, yalnızca tek proje yerine tüm requests/procurement).
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const pendingRequests = requests.filter(r => normalizeStatus(r.status) === 'bekliyor')
  const kpi = {
    pending: pendingRequests.length,
    risky: classifyMaterials(procurement, pendingRequests).excess,
    invoicePending: requests.filter(r => ['satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor'].includes(normalizeStatus(r.status))).length,
    monthOpened: requests.filter(r => r.created_at && new Date(r.created_at) >= monthStart).length,
  }

  if (isMuhasebe) {
    return (
      <div>
        <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
        <MuhasebeSatinAlma
          requests={requests}
          refreshing={refreshing}
          onRefresh={refresh}
          projectOptions={projectOptions}
          projectFilter={projectFilter}
          onProjectFilter={setProjectFilter}
          openRequestId={openRequestId}
          onOpenedRequest={onOpenedRequest}
          onSelectedRequestChange={onSelectedRequestChange}
        />
      </div>
    )
  }

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <div className="finans-genel-subtabs">
        <button className={tab === 'genel' ? 'active' : ''} onClick={() => setTab('genel')}>Genel</button>
        <button className={tab === 'detay' ? 'active' : ''} onClick={() => setTab('detay')}>Detay</button>
      </div>

      {tab === 'genel' && (
        <ProjeTabSatinAlmaStats kpi={kpi} loading={refreshing && requests.length === 0} />
      )}

      {tab === 'detay' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--color-border-md)', flexWrap: 'wrap' }}>
            {SUB_TABS.map(t => (
              <button key={t.key} onClick={() => setSubTab(t.key)} style={{
                background: 'none', border: 'none', padding: '10px 22px',
                fontSize: 14, fontWeight: subTab === t.key ? 600 : 400,
                color: subTab === t.key ? 'var(--color-primary)' : 'var(--color-muted)',
                cursor: 'pointer', fontFamily: 'inherit',
                borderBottom: subTab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: -2,
              }}>
                {t.label}
              </button>
            ))}
            <select
              value={projectFilter}
              onChange={event => setProjectFilter(event.target.value)}
              style={{ marginLeft: 'auto', marginBottom: 10, border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '7px 30px 7px 12px', fontSize: 13, color: 'var(--color-text-sub)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
            >
              <option value="all">Tüm Projeler</option>
              {projectOptions.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          {subTab === 'talepler' && (
            <TabSatinAlmaTalepListesi
              onChanged={refresh}
              procurement={scopedProcurement}
              projectId={activeProjectId}
              refreshKey={refreshKey}
              openRequestId={openRequestId}
              onOpenedRequest={onOpenedRequest}
              onSelectedRequestChange={onSelectedRequestChange}
              listTitle={isMuhasebe ? 'Faturalanacak Talepler' : undefined}
            />
          )}
          {subTab === 'onay' && isAdmin && <TabSatinAlmaOnayKuyrugu onChanged={refresh} procurement={scopedProcurement} projectId={activeProjectId} refreshKey={refreshKey} />}
        </>
      )}
    </div>
  )
}
