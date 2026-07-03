import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../lib/supabase'
import { fetchDoviz } from '../../../utils/exchangeRates'
import { classifyMaterials, classifyRequestTypes, buildMaterialListRows, normalizeStatus } from '../../../utils/satinAlma'
import ProjeTabSatinAlmaStats from './ProjeTabSatinAlmaStats'
import ProjeTabTalepListesi from './ProjeTabTalepListesi'
import ProjeTabSaOnayKuyrugu from './ProjeTabSaOnayKuyrugu'
import ProjeTabFaturaKesilecekler from './ProjeTabFaturaKesilecekler'
import ProjeTabSatinAlmaSidebar from './ProjeTabSatinAlmaSidebar'

export default function ProjeTabSatinAlma({ projectId, filterDate }) {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('talepler')
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [procurement, setProcurement] = useState([])
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  const refresh = () => setRefreshKey(key => key + 1)

  useEffect(() => {
    if (!projectId) return
    let alive = true
    setLoading(true)
    supabase.rpc('get_satin_alma_overview', { p_project_id: projectId }).then(overviewRes => {
      if (!alive) return
      if (overviewRes.error) console.error('get_satin_alma_overview error:', overviewRes.error)
      setRequests(overviewRes.data?.requests || [])
      setProcurement(overviewRes.data?.procurement_items || [])
      setLoading(false)
    })
    // TCMB kur servisi yavaş/erişilemez olabilir; ana veriyi bekletmemesi için ayrı yükleniyor.
    fetchDoviz().then(kurData => {
      if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date })
    })
    return () => { alive = false }
  }, [projectId, refreshKey])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const pendingRequests = requests.filter(r => normalizeStatus(r.status) === 'bekliyor')
  const tedarik = classifyMaterials(procurement, pendingRequests)
  const dagilim = classifyRequestTypes(requests)
  const materialRows = buildMaterialListRows(procurement, requests)
  const kpi = {
    pending: pendingRequests.length,
    risky: tedarik.excess,
    invoicePending: requests.filter(r => ['faturada', 'onaylandi'].includes(normalizeStatus(r.status))).length,
    monthOpened: requests.filter(r => r.created_at && new Date(r.created_at) >= monthStart).length,
  }
  const recent = [...requests]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 4)

  const TABS = [
    { key: 'talepler', label: 'Talepler' },
    ...(isAdmin ? [{ key: 'onay', label: 'Onay Bekleyenler' }] : []),
    { key: 'malzeme', label: 'Malzeme Listesi' },
  ]

  return (
    <div>
      <div className="sa-overview-grid">
        <ProjeTabSatinAlmaStats kpi={kpi} loading={loading} />
        <ProjeTabSatinAlmaSidebar tedarik={tedarik} pendingCount={kpi.pending} dagilim={dagilim} recent={recent} doviz={doviz} loading={loading} />
      </div>
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
        <ProjeTabTalepListesi projectId={projectId} filterDate={filterDate} onChanged={refresh} procurement={procurement} />
      )}
      {tab === 'onay' && isAdmin && <ProjeTabSaOnayKuyrugu projectId={projectId} onChanged={refresh} procurement={procurement} />}
      {tab === 'malzeme' && <ProjeTabFaturaKesilecekler rows={materialRows} loading={loading} />}
    </div>
  )
}
