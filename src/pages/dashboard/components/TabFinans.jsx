import { useState, useEffect } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { getProjects } from '../../../api'
import { fetchDoviz } from '../../../utils/exchangeRates'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import { curvePointLabel, buildDagilimItems, formatRecentActivity } from '../../../utils/finans'
import ProjeTabFinansOzet from './ProjeTabFinansOzet'
import ProjeTabFinansSidebar, { BudgetUsageCard } from './ProjeTabFinansSidebar'
import ProjeTabFinansYanPanel, { KurCard } from './ProjeTabFinansYanPanel'
import MaliyetOzetTable from './MaliyetOzetTable'
import FaturaListesi from '../../../components/finans/FaturaListesi'
import OnayKuyrugu   from '../../../components/finans/OnayKuyrugu'
import OdemeTakibi from '../../../components/finans/OdemeTakibi'
import MuhasebeFinansGenel from './MuhasebeFinansGenel'
import FinansRaporlari from '../../../components/finans/FinansRaporlari'

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

export default function TabFinans({ openInvoiceId, onOpenedInvoice, invoiceProjectId, onNavigateTop } = {}) {
  const { isMuhasebe } = useAuth()
  // Sekme seçimi localStorage'da kalıcı — aksi halde başka bir menü öğesine
  // geçip Finans'a geri dönüldüğünde (bileşen unmount/remount olduğundan)
  // her seferinde varsayılan sekmeye dönüyordu (bkz. sidebar'daki 'dashboard-active-tab'
  // deseniyle aynı fikir).
  const [tab, setTab] = useState(() => {
    try { return window.localStorage.getItem('finans-active-subtab') || (isMuhasebe ? 'faturalar' : 'genel') }
    catch { return isMuhasebe ? 'faturalar' : 'genel' }
  })
  useEffect(() => {
    try { window.localStorage.setItem('finans-active-subtab', tab) } catch {}
  }, [tab])
  const [genelSection, setGenelSection] = useState('genel') // 'genel' | 'detay' — yalnızca muhasebe Genel sekmesi içi
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')

  useEffect(() => {
    let alive = true
    getProjects().then(({ data }) => { if (alive) setProjects(data || []) })
    return () => { alive = false }
  }, [])

  // Bildirimler'den belirli bir faturaya gidilince: "Faturalar" sekmesine zorla geç,
  // biliniyorsa proje filtresini de faturanın projesine ayarla.
  useEffect(() => {
    if (!openInvoiceId) return
    setTab('faturalar')
    if (invoiceProjectId) setSelectedProjectId(invoiceProjectId)
  }, [openInvoiceId, invoiceProjectId])

  // Proje filtresi boşken (varsayılan) tüm projeler; bir proje seçilince tek-proje RPC'sine
  // geçilir — ikisi de aynı şekli döndürür (bkz. get_finans_overview_all). Muhasebe'nin ayrı
  // bir "Projeler" sekmesi yok, bu filtre tek proje detayına inebilmesinin tek yolu.
  const { data: overview, loading, refreshing, error, refetch } = useDashboardData(
    selectedProjectId ? 'get_finans_overview' : 'get_finans_overview_all',
    selectedProjectId
      ? { p_project_id: selectedProjectId, p_as_of_date: new Date().toISOString().split('T')[0] }
      : { p_as_of_date: new Date().toISOString().split('T')[0] },
    { enabled: !isMuhasebe }
  )
  useRealtimeRefresh(['invoices'], refetch, { enabled: !isMuhasebe })

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

  // Ödeme Takibi/Tedarikçiler muhasebe için artık burada değil — ayrı, üst-seviye
  // "Ödemeler" menü öğesine taşındı (bkz. CLAUDE.md "Muhasebe & Finans modülü").
  const TABS = isMuhasebe
    ? [{ key: 'faturalar', label: 'Faturalar' }, { key: 'genel', label: 'Genel' }]
    : [
        { key: 'genel',     label: 'Genel' },
        { key: 'faturalar', label: 'Faturalar' },
        { key: 'odemeler',  label: 'Ödeme Takibi' },
        { key: 'onay',      label: 'Onay Kuyruğu' },
      ]

  // localStorage'dan gelen sekme farklı bir rolden kalmış olabilir (ör. muhasebe
  // 'onay' persiste etmişken sonra proje_yoneticisi aynı tarayıcıda giriş yaptı) —
  // geçerli değilse role'ün varsayılanına düş.
  useEffect(() => {
    if (!TABS.some(t => t.key === tab)) setTab(isMuhasebe ? 'faturalar' : 'genel')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuhasebe])

  return (
    <div>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20, borderBottom: '2px solid #E5E7EB' }}>
        <div style={{ display: 'flex', gap: 0 }}>
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
        <select
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
          style={{ background: 'transparent', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}
        >
          <option value="">Tüm Projeler</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {tab === 'genel' && isMuhasebe && (
        <>
          <div className="finans-genel-subtabs">
            <button className={genelSection === 'genel' ? 'active' : ''} onClick={() => setGenelSection('genel')}>Genel</button>
            <button className={genelSection === 'detay' ? 'active' : ''} onClick={() => setGenelSection('detay')}>Detay</button>
          </div>
          {genelSection === 'genel' && (
            <MuhasebeFinansGenel
              onNavigate={key => (key === 'odemeler' ? onNavigateTop?.('odemeler') : setTab(key))}
              projectId={selectedProjectId}
            />
          )}
          {genelSection === 'detay' && <FinansRaporlari defaultProjectId={selectedProjectId} />}
        </>
      )}
      {tab === 'genel' && !isMuhasebe && (
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
            </div>
            <div style={{ overflowX: 'auto' }}>
              <MaliyetOzetTable costBuckets={costBuckets} loading={loading} />
            </div>
          </div>
        </>
      )}
      {tab === 'faturalar' && (
        <FaturaListesi
          projectId={selectedProjectId || null}
          openInvoiceId={openInvoiceId}
          onOpenedInvoice={onOpenedInvoice}
        />
      )}
      {tab === 'onay'      && <OnayKuyrugu projectId={selectedProjectId || null} />}
      {tab === 'odemeler'  && <OdemeTakibi projectId={selectedProjectId || null} />}
    </div>
  )
}
