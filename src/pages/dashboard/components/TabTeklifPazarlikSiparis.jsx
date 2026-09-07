import { useState } from 'react'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import { normalizeStatus } from '../../../utils/satinAlma'
import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'

const STAGE_METRICS = [
  { key: 'teklif_toplama', label: 'Teklif Toplama', note: 'Teklif bekleniyor', color: 'var(--color-warning)' },
  { key: 'pazarlik_onay_bekliyor', label: 'Pazarlık Onayı Bekliyor', note: 'Yönetici onayı', color: 'var(--color-danger)' },
  { key: 'pazarlik', label: 'Pazarlık', note: 'Nihai tutar bekleniyor', color: 'var(--color-primary)' },
  { key: 'siparis', label: 'Sipariş', note: 'Teslim bekleniyor', color: 'var(--color-success)' },
]

// Satın Alma'nın yanına ayrı bir üst-seviye sayfa olarak eklendi (03.09.2026,
// kullanıcı kararı) — daha önce Satın Alma > Detay altında "Teklif / Pazarlık /
// Sipariş" alt-sekmesiydi, o alt-sekme buraya taşındığı için TabSatinAlma.jsx'ten
// kaldırıldı (aynı verinin iki yerde tekrar listelenmesini önlemek için).
// ProjeTabSatinAlma.jsx'teki proje-içi "surec" sekmesi kasıtlı olarak korundu —
// tek bir projeyle çalışırken sayfa değiştirmeden erişim sağlıyor.
//
// Diğer sayfalarla (Satın Alma, Finans) aynı Genel/Detay deseni: sayfa açılınca
// önce aşama bazlı KPI özeti görünür, talep listesi Detay'a tıklanınca açılır
// (kullanıcı kararı, 03.09.2026 — ilk sürümde doğrudan liste açılıyordu).
export default function TabTeklifPazarlikSiparis() {
  const [tab, setTab] = useState(() => {
    try { return window.localStorage.getItem('teklif-pazarlik-siparis-active-maintab') || 'genel' } catch { return 'genel' }
  })
  const [projectFilter, setProjectFilter] = useState('all')
  const { data: overview, refreshing, error, refetch } = useDashboardData('get_satin_alma_overview_all', {})
  const requests = overview?.requests || []
  const procurement = overview?.procurement_items || []
  const [refreshKey, setRefreshKey] = useState(0)
  useRealtimeRefresh(['purchase_requests'], () => { refetch(); setRefreshKey(k => k + 1) })

  function selectTab(next) {
    setTab(next)
    try { window.localStorage.setItem('teklif-pazarlik-siparis-active-maintab', next) } catch {}
  }

  const projectOptions = (() => {
    const map = new Map()
    requests.forEach(r => { if (r.project_id && !map.has(r.project_id)) map.set(r.project_id, r.project_name) })
    procurement.forEach(p => { if (p.project_id && !map.has(p.project_id)) map.set(p.project_id, p.project_name) })
    return [...map.entries()]
      .map(([id, name]) => ({ id, name: name || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  })()

  const scopedProcurement = projectFilter === 'all' ? procurement : procurement.filter(p => p.project_id === projectFilter)
  const activeProjectId = projectFilter === 'all' ? undefined : projectFilter

  // "Genel" özeti proje filtresinden bağımsız — tüm projeler toplamı (Satın Alma'nın
  // kendi Genel sekmesiyle aynı kural, bkz. TabSatinAlma.jsx).
  const stageCounts = STAGE_METRICS.reduce((acc, metric) => {
    acc[metric.key] = requests.filter(r => normalizeStatus(r.status) === metric.key).length
    return acc
  }, {})

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <div className="finans-genel-subtabs">
        <button className={tab === 'genel' ? 'active' : ''} onClick={() => selectTab('genel')}>Genel</button>
        <button className={tab === 'detay' ? 'active' : ''} onClick={() => selectTab('detay')}>Detay</button>
      </div>

      {tab === 'genel' && (
        <section className="sa-panel-card sa-summary-card">
          <p className="sa-eyebrow">Süreç Durumu</p>
          <div className="sa-metric-grid">
            {STAGE_METRICS.map(metric => (
              <div key={metric.key} className="sa-metric">
                <span className="sa-metric-label">{metric.label}</span>
                <strong style={{ color: metric.color }}>{refreshing && requests.length === 0 ? '…' : stageCounts[metric.key]}</strong>
                <small>{metric.note}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'detay' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <select
              value={projectFilter}
              onChange={event => setProjectFilter(event.target.value)}
              style={{ border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '7px 30px 7px 12px', fontSize: 13, color: 'var(--color-text-sub)', background: 'var(--color-surface)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
            >
              <option value="all">Tüm Projeler</option>
              {projectOptions.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <TabSatinAlmaTalepListesi
            onChanged={refetch}
            procurement={scopedProcurement}
            projectId={activeProjectId}
            refreshKey={refreshKey}
            fixedStatus={['teklif_toplama', 'pazarlik_onay_bekliyor', 'pazarlik', 'siparis']}
            listTitle="Teklif / Pazarlık / Sipariş Süreci"
          />
        </>
      )}
    </div>
  )
}
