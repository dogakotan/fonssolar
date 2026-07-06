import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../lib/supabase'
import { fetchDoviz } from '../../../utils/exchangeRates'
import {
  normalizeStatus,
  classifyRequestTypes,
  groupByProjectId,
  aggregateMaterialsAcrossProjects,
} from '../../../utils/satinAlma'
import ProjeTabSatinAlmaStats from './ProjeTabSatinAlmaStats'
import ProjeTabSatinAlmaSidebar from './ProjeTabSatinAlmaSidebar'
import TabSatinAlmaTalepListesi from './TabSatinAlmaTalepListesi'
import TabSatinAlmaOnayKuyrugu from './TabSatinAlmaOnayKuyrugu'

export default function TabSatinAlma() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('talepler')
  const [projectFilter, setProjectFilter] = useState('all')
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [procurement, setProcurement] = useState([])
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  const refresh = () => setRefreshKey(key => key + 1)

  useEffect(() => {
    let alive = true
    setLoading(true)
    supabase.rpc('get_satin_alma_overview_all').then(overviewRes => {
      if (!alive) return
      if (overviewRes.error) console.error('get_satin_alma_overview_all error:', overviewRes.error)
      setRequests(overviewRes.data?.requests || [])
      setProcurement(overviewRes.data?.procurement_items || [])
      setLoading(false)
    })
    // TCMB kur servisi yavaş/erişilemez olabilir; ana veriyi bekletmemesi için ayrı yükleniyor.
    fetchDoviz().then(kurData => {
      if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date })
    })
    return () => { alive = false }
  }, [refreshKey])

  const projectOptions = (() => {
    const map = new Map()
    requests.forEach(r => { if (r.project_id && !map.has(r.project_id)) map.set(r.project_id, r.project_name) })
    procurement.forEach(p => { if (p.project_id && !map.has(p.project_id)) map.set(p.project_id, p.project_name) })
    return [...map.entries()]
      .map(([id, name]) => ({ id, name: name || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  })()

  const scopedRequests = projectFilter === 'all' ? requests : requests.filter(r => r.project_id === projectFilter)
  const scopedProcurement = projectFilter === 'all' ? procurement : procurement.filter(p => p.project_id === projectFilter)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const pendingRequests = scopedRequests.filter(r => normalizeStatus(r.status) === 'bekliyor')
  const procurementByProject = groupByProjectId(scopedProcurement)
  const pendingByProject = groupByProjectId(pendingRequests)
  const tedarik = aggregateMaterialsAcrossProjects(procurementByProject, pendingByProject)
  const dagilim = classifyRequestTypes(scopedRequests)
  const kpi = {
    pending: pendingRequests.length,
    risky: tedarik.excess,
    invoicePending: scopedRequests.filter(r => ['onaylandi', 'satin_alindi', 'fatura_bekliyor', 'fatura_onay_bekliyor'].includes(normalizeStatus(r.status))).length,
    monthOpened: scopedRequests.filter(r => r.created_at && new Date(r.created_at) >= monthStart).length,
  }
  const recent = [...scopedRequests]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 4)

  const TABS = [
    { key: 'talepler', label: 'Talepler' },
    ...(isAdmin ? [{ key: 'onay', label: 'Onay Bekleyenler' }] : []),
  ]

  const activeProjectId = projectFilter === 'all' ? undefined : projectFilter

  return (
    <div>
      <div className="sa-overview-grid">
        <ProjeTabSatinAlmaStats kpi={kpi} loading={loading} />
        <ProjeTabSatinAlmaSidebar tedarik={tedarik} dagilim={dagilim} recent={recent} doviz={doviz} loading={loading} />
      </div>
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
        <TabSatinAlmaTalepListesi onChanged={refresh} procurement={scopedProcurement} projectId={activeProjectId} />
      )}
      {tab === 'onay' && isAdmin && <TabSatinAlmaOnayKuyrugu onChanged={refresh} procurement={scopedProcurement} projectId={activeProjectId} />}
    </div>
  )
}
