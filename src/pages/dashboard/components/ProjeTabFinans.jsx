import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { supabase } from '../../../lib/supabase'
import { fetchDoviz } from '../../../utils/exchangeRates'
import { curvePointLabel, buildDagilimItems, formatRecentActivity, CATEGORY_META } from '../../../utils/finans'
import ProjeTabFinansOzet from './ProjeTabFinansOzet'
import ProjeTabFinansSidebar from './ProjeTabFinansSidebar'
import ProjeTabFinansYanPanel from './ProjeTabFinansYanPanel'
import CostBucketTable from './CostBucketTable'
import ProjeTabFaturaListesi from './ProjeTabFaturaListesi'
import ProjeTabOnayKuyrugu from './ProjeTabOnayKuyrugu'
import ProjeTabMaliyetTablosu from './ProjeTabMaliyetTablosu'

const EMPTY_KPI = {
  pendingCount: 0, pendingAmount: 0, totalPlanned: 0, totalActual: 0, totalActualInclVat: 0,
  remainingBudget: 0, usagePct: 0, remainingPct: 0, thisMonthActual: 0, remainingDays: null,
  costPerKwp: null, plannedCostPerKwp: null, capacityKwp: 0,
}
const EMPTY_SAPMA = { amount: 0, pct: 0, plannedToDate: 0 }
const EMPTY_CPI = { ev: 0, cpi: null }
const EMPTY_COST_BUCKETS = { buckets: [], totalPlanned: 0, totalActual: 0, totalSapma: 0, totalPct: 0 }
const EMPTY_QUICK_FACTS = { pendingCount: 0, pendingAmount: 0, overBudgetCount: 0, savingsAmount: 0 }

export default function ProjeTabFinans({ projectId, filterDate }) {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('genel')
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState(null)
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  const asOfDate = filterDate || new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!projectId) return
    let alive = true
    setLoading(true)
    // Tüm KPI/kova/sapma/CPI hesapları get_finans_overview RPC'sinde (Postgres) yapılır —
    // frontend sadece hazır sonucu görüntülemek için biçimlendirir, yeniden sorgulamaz.
    supabase.rpc('get_finans_overview', { p_project_id: projectId, p_as_of_date: asOfDate }).then(res => {
      if (!alive) return
      if (res.error) console.error('get_finans_overview error:', res.error)
      setOverview(res.data || null)
      setLoading(false)
    })
    // TCMB kur servisi yavaş/erişilemez olabilir; ana veriyi bekletmemesi için ayrı yükleniyor.
    fetchDoviz().then(kurData => {
      if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date })
    })
    return () => { alive = false }
  }, [projectId, asOfDate])

  const kpi = overview?.kpi || EMPTY_KPI
  const sapma = overview?.sapma || EMPTY_SAPMA
  const cpi = overview?.cpi || EMPTY_CPI
  const costBuckets = overview?.costBuckets || EMPTY_COST_BUCKETS
  const quickFacts = overview?.quickFacts || EMPTY_QUICK_FACTS
  const curve = (overview?.curve || []).map(point => ({ label: curvePointLabel(point.month), planned: point.planned, actual: point.actual }))
  const dagilim = buildDagilimItems(overview?.dagilim)
  const recentActivity = formatRecentActivity(overview?.recentActivity)
  const displayBuckets = costBuckets.buckets.map(b => ({ ...b, ...CATEGORY_META[b.key] }))

  const TABS = [
    { key: 'genel',      label: 'Genel' },
    { key: 'faturalar',  label: 'Faturalar' },
    { key: 'onay',       label: 'Onay Kuyruğu' },
    ...(isAdmin ? [{ key: 'maliyet', label: 'Maliyet Tablosu' }] : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--color-border-md)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: 'none', border: 'none', padding: '10px 22px',
            fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
            color: tab === t.key ? 'var(--color-primary)' : 'var(--color-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: -2,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'genel' && (
        <>
          <div className="finans-panel-grid">
            <ProjeTabFinansOzet kpi={kpi} quickFacts={quickFacts} loading={loading} />
            <ProjeTabFinansSidebar kpi={kpi} curve={curve} dagilim={dagilim} sapma={sapma} cpi={cpi} loading={loading} />
            <ProjeTabFinansYanPanel doviz={doviz} recentActivity={recentActivity} loading={loading} />
          </div>
          {!loading && (
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1 }}>Maliyet Kalemleri Özeti</h3>
                {isAdmin && (
                  <button onClick={() => setTab('maliyet')} style={{
                    background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}>
                    Detaylı Maliyet Tablosu →
                  </button>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <CostBucketTable
                  buckets={displayBuckets}
                  totalPlanned={costBuckets.totalPlanned}
                  totalActual={costBuckets.totalActual}
                  totalSapma={costBuckets.totalSapma}
                  totalPct={costBuckets.totalPct}
                  compact
                />
              </div>
            </div>
          )}
        </>
      )}
      {tab === 'faturalar' && <ProjeTabFaturaListesi projectId={projectId} filterDate={filterDate} />}
      {tab === 'onay'      && <ProjeTabOnayKuyrugu projectId={projectId} filterDate={filterDate} />}
      {tab === 'maliyet'   && <ProjeTabMaliyetTablosu costBuckets={costBuckets} loading={loading} />}
    </div>
  )
}
