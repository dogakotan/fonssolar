import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { fetchDoviz } from '../../../utils/exchangeRates'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import { curvePointLabel, buildDagilimItems, formatRecentActivity } from '../../../utils/finans'
import ProjeTabFinansOzet from './ProjeTabFinansOzet'
import ProjeTabFinansSidebar, { BudgetUsageCard } from './ProjeTabFinansSidebar'
import ProjeTabFinansYanPanel, { KurCard } from './ProjeTabFinansYanPanel'
import MaliyetOzetTable from './MaliyetOzetTable'
import ProjeTabMaliyetTablosu from './ProjeTabMaliyetTablosu'
import FaturaListesi from '../../../components/finans/FaturaListesi'
import OnayKuyrugu   from '../../../components/finans/OnayKuyrugu'

const EMPTY_KPI = {
  pendingCount: 0, pendingAmount: 0, totalPlanned: 0, totalActual: 0,
  remainingBudget: 0, availableBudget: 0, thisMonthActual: 0, remainingDays: null,
}
const EMPTY_SAPMA = { amount: 0, pct: 0, plannedToDate: 0 }
const EMPTY_CPI = { ev: 0, cpi: null }
const EMPTY_COST_BUCKETS = { buckets: [], totalPlanned: 0, totalActual: 0, totalSapma: 0, totalPct: 0 }
const EMPTY_QUICK_FACTS = { pendingCount: 0, pendingAmount: 0, overBudgetCount: 0 }
const EMPTY_ACTION_ITEMS = {
  muhasebeOnayi: { count: 0, amount: 0 }, yoneticiOnayi: { count: 0, amount: 0 },
}

export default function TabFinans() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('genel')
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  // Tüm KPI/kova/sapma/CPI hesapları get_finans_overview_all RPC'sinde (Postgres) yapılır —
  // get_finans_overview ile aynı şekli döndürür, tek fark tüm projeleri kapsaması.
  const { data: overview, loading, refreshing, error, refetch } = useDashboardData(
    'get_finans_overview_all',
    { p_as_of_date: new Date().toISOString().split('T')[0] }
  )
  useRealtimeRefresh(['invoices'], refetch)

  useEffect(() => {
    let alive = true
    fetchDoviz().then(kurData => {
      if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date })
    })
    return () => { alive = false }
  }, [])

  const kpi = overview?.kpi || EMPTY_KPI
  const sapma = overview?.sapma || EMPTY_SAPMA
  const cpi = overview?.cpi || EMPTY_CPI
  const costBuckets = overview?.costBuckets || EMPTY_COST_BUCKETS
  const quickFacts = overview?.quickFacts || EMPTY_QUICK_FACTS
  const actionItems = overview?.actionItems || EMPTY_ACTION_ITEMS
  const curve = (overview?.curve || []).map(point => ({
    label: curvePointLabel(point.month), planned: point.planned, actual: point.actual, pendingSnapshot: point.pendingSnapshot,
  }))
  const dagilim = buildDagilimItems(overview?.dagilim)
  const recentActivity = formatRecentActivity(overview?.recentActivity)

  const TABS = [
    { key: 'genel',     label: 'Genel' },
    { key: 'faturalar', label: 'Faturalar' },
    { key: 'onay',      label: 'Onay Kuyruğu' },
    ...(isAdmin ? [{ key: 'maliyet', label: 'Maliyet Tablosu' }] : []),
  ]

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', padding: '10px 22px',
              fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#185FA5' : '#6B7280',
              cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: tab === t.key ? '2px solid #185FA5' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'genel' && (
        <>
          <div className="finans-panel-grid">
            <ProjeTabFinansOzet kpi={kpi} quickFacts={quickFacts} loading={loading} />
            <BudgetUsageCard kpi={kpi} />
            <KurCard doviz={doviz} />
          </div>
          <div className="finans-row2-grid">
            <ProjeTabFinansSidebar curve={curve} dagilim={dagilim} sapma={sapma} cpi={cpi} loading={loading} />
            <ProjeTabFinansYanPanel actionItems={actionItems} recentActivity={recentActivity} onNavigate={setTab} loading={loading} />
          </div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1 }}>Maliyet Kalemi Özeti</h3>
              {isAdmin && (
                <button onClick={() => setTab('maliyet')} style={{
                  background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}>
                  Tüm maliyet tablosunu görüntüle →
                </button>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <MaliyetOzetTable costBuckets={costBuckets} loading={loading} />
            </div>
          </div>
        </>
      )}
      {tab === 'faturalar' && <FaturaListesi />}
      {tab === 'onay'      && <OnayKuyrugu />}
      {tab === 'maliyet'   && <ProjeTabMaliyetTablosu costBuckets={costBuckets} loading={loading} />}
    </div>
  )
}
