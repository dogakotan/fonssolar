import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { fetchDoviz } from '../../../utils/exchangeRates'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import { curvePointLabel, buildDagilimItems, formatRecentActivity } from '../../../utils/finans'
import ProjeTabFinansOzet from './ProjeTabFinansOzet'
import ProjeTabFinansSidebar, { BudgetUsageCard } from './ProjeTabFinansSidebar'
import ProjeTabFinansYanPanel, { KurCard } from './ProjeTabFinansYanPanel'
import MaliyetOzetTable from './MaliyetOzetTable'
import FaturaListesi from '../../../components/finans/FaturaListesi'
import OnayKuyrugu from '../../../components/finans/OnayKuyrugu'

const EMPTY_KPI = {
  pendingCount: 0, pendingAmount: 0, totalPlanned: 0, totalActual: 0,
  remainingBudget: 0, availableBudget: 0, thisMonthActual: 0, remainingDays: null,
}
const EMPTY_SAPMA = { amount: 0, pct: 0, plannedToDate: 0 }
const EMPTY_CPI = { ev: 0, cpi: null }
const EMPTY_COST_BUCKETS = { buckets: [], totalPlanned: 0, totalActual: 0, totalSapma: 0, totalPct: 0 }
const EMPTY_QUICK_FACTS = { pendingCount: 0, pendingAmount: 0, overBudgetCount: 0 }
const EMPTY_ACTION_ITEMS = {
  yoneticiOnayi: { count: 0, amount: 0 },
}

export default function ProjeTabFinans({ projectId, filterDate, openInvoiceId, onOpenedInvoice, onSelectedInvoiceChange }) {
  const { isAdmin, role } = useAuth()
  // Proje yöneticisi artık fatura onay sürecindeki "Yönetici" — Faturalar/Onay
  // Kuyruğu'nu görüp aksiyon alabilmesi gerekiyor.
  const canApprove = isAdmin || role === 'proje_yoneticisi'
  // Sekme seçimi projeye özel olarak localStorage'da kalıcı — aksi halde başka
  // bir menü öğesine geçip aynı projeye geri dönüldüğünde (ProjeDetay unmount/
  // remount olduğundan) her seferinde "Genel"e dönüyordu (bkz. TabFinans.jsx'teki
  // aynı desen; burada anahtar projectId'ye göre ayrıştırılıyor ki farklı bir
  // proje açmak yanlışlıkla başka projenin sekmesini miras almasın).
  const [tab, setTab] = useState(() => {
    try { return window.localStorage.getItem(`proje-finans-active-subtab-${projectId}`) || 'genel' } catch { return 'genel' }
  })
  useEffect(() => {
    try { window.localStorage.setItem(`proje-finans-active-subtab-${projectId}`, tab) } catch {}
  }, [tab, projectId])
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  const asOfDate = filterDate || new Date().toISOString().split('T')[0]

  // Tüm KPI/kova/sapma/CPI hesapları get_finans_overview RPC'sinde (Postgres) yapılır —
  // frontend sadece hazır sonucu görüntülemek için biçimlendirir, yeniden sorgulamaz.
  const { data: overview, loading, refreshing, error, refetch } = useDashboardData(
    'get_finans_overview',
    { p_project_id: projectId, p_as_of_date: asOfDate },
    { enabled: !!projectId }
  )
  const authorized = overview?.authorized ?? true
  useRealtimeRefresh(
    ['invoices'],
    refetch,
    { enabled: !!projectId, filter: { column: 'project_id', value: projectId } }
  )

  useEffect(() => {
    let alive = true
    // TCMB kur servisi yavaş/erişilemez olabilir; ana veriyi bekletmemesi için ayrı yükleniyor.
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

  const tabs = [
    { key: 'genel', label: 'Genel' },
    ...(canApprove ? [
      { key: 'faturalar', label: 'Faturalar' },
      { key: 'onay', label: 'Onay Kuyruğu' },
    ] : []),
  ]

  // localStorage'dan gelen sekme farklı bir rolden kalmış olabilir — geçerli
  // değilse varsayılana düş (bkz. TabFinans.jsx'teki aynı desen). Erken
  // return'den (aşağıdaki authorized kontrolü) ÖNCE çağrılmalı — aksi halde
  // Hooks kuralı ihlal edilir (react-hooks/rules-of-hooks).
  useEffect(() => {
    if (!tabs.some(t => t.key === tab)) setTab('genel')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canApprove])

  // Adres çubuğunda bir fatura id'si varsa (yenileme/deep-link) "Faturalar"
  // sekmesine zorla geç — bkz. menü seviyesindeki TabFinans.jsx'teki aynı desen.
  useEffect(() => {
    if (!openInvoiceId) return
    setTab('faturalar')
  }, [openInvoiceId])

  if (!loading && !authorized) {
    return <UnauthorizedScopeNotice />
  }

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      {canApprove && (
        <div style={{ display: 'flex', borderBottom: '2px solid #E5E7EB', marginBottom: 20 }}>
          {tabs.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              style={{
                background: 'none', border: 'none', padding: '10px 22px',
                fontSize: 14, fontWeight: tab === item.key ? 600 : 400,
                color: tab === item.key ? '#185FA5' : '#6B7280', cursor: 'pointer',
                fontFamily: 'inherit', borderBottom: tab === item.key ? '2px solid #185FA5' : '2px solid transparent',
                marginBottom: -2,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {tab === 'genel' && <>
          <div className="finans-panel-grid">
            <ProjeTabFinansOzet kpi={kpi} quickFacts={quickFacts} loading={loading} />
            <BudgetUsageCard kpi={kpi} />
            <KurCard doviz={doviz} />
          </div>
          <div className="finans-row2-grid">
            <ProjeTabFinansSidebar curve={curve} dagilim={dagilim} sapma={sapma} cpi={cpi} loading={loading} />
            <ProjeTabFinansYanPanel actionItems={actionItems} recentActivity={recentActivity} onNavigate={canApprove ? setTab : undefined} loading={loading} />
          </div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1 }}>Maliyet Kalemi Özeti</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <MaliyetOzetTable costBuckets={costBuckets} loading={loading} />
            </div>
          </div>
      </>}
      {tab === 'faturalar' && (
        <FaturaListesi
          projectId={projectId}
          openInvoiceId={openInvoiceId}
          onOpenedInvoice={onOpenedInvoice}
          onSelectedInvoiceChange={onSelectedInvoiceChange}
        />
      )}
      {tab === 'onay' && <OnayKuyrugu projectId={projectId} />}
    </div>
  )
}
