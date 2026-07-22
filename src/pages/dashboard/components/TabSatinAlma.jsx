import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'
import TabSatinAlmaOnayKuyrugu from './TabSatinAlmaOnayKuyrugu'
import TedarikKuyrugu from './TedarikKuyrugu'

export default function TabSatinAlma({ openRequestId, onOpenedRequest } = {}) {
  const { role, isAdmin } = useAuth()
  const [tab, setTab] = useState('talepler')

  // Bildirimler'den belirli bir talebe gidilince "Onay Bekleyenler" sekmesinde
  // kalınmış olabilir — talep detayının render edildiği "Talepler" sekmesine zorla geç.
  useEffect(() => {
    if (openRequestId) setTab('talepler')
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

  const TABS = [
    { key: 'talepler', label: 'Tüm Talepler' },
    ...(isAdmin ? [{ key: 'onay', label: 'Onay Bekleyenler' }] : []),
    ...(role === 'proje_yoneticisi' ? [{ key: 'tedarik', label: 'İşlem Bekleyenler' }] : []),
  ]

  const activeProjectId = projectFilter === 'all' ? undefined : projectFilter

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--color-border-md)', flexWrap: 'wrap' }}>
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
      {tab === 'talepler' && (
        <TabSatinAlmaTalepListesi
          onChanged={refresh}
          procurement={scopedProcurement}
          projectId={activeProjectId}
          refreshKey={refreshKey}
          openRequestId={openRequestId}
          onOpenedRequest={onOpenedRequest}
        />
      )}
      {tab === 'onay' && isAdmin && <TabSatinAlmaOnayKuyrugu onChanged={refresh} procurement={scopedProcurement} projectId={activeProjectId} refreshKey={refreshKey} />}
      {tab === 'tedarik' && role === 'proje_yoneticisi' && <TedarikKuyrugu onChanged={refresh} projectId={activeProjectId} projects={projectOptions} refreshKey={refreshKey} />}
    </div>
  )
}
