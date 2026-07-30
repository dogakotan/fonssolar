import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import { fetchDoviz } from '../../../utils/exchangeRates'
import { KurCard } from './ProjeTabFinansYanPanel'
import OdemeTakvimi from '../../../components/finans/OdemeTakvimi'

const money = (value, currency = 'TRY') => new Intl.NumberFormat('tr-TR', {
  style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 0,
}).format(Number(value) || 0)
const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR') : '—'
const timeText = value => {
  if (!value) return '—'
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const prefix = date.toDateString() === today.toDateString() ? 'Bugün' : date.toDateString() === yesterday.toDateString() ? 'Dün' : date.toLocaleDateString('tr-TR')
  return `${prefix} ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
}
const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
const dayDiff = value => value ? Math.ceil((new Date(`${value}T23:59:59`) - new Date()) / 86400000) : null

const KPI_META = [
  { key: 'requests', label: 'Faturalanacak Talepler', color: '#D97706', bg: '#FFF7ED', icon: '⌛' },
  { key: 'approval', label: 'Yönetici Onayında', color: '#6D28D9', bg: '#F5F3FF', icon: '♙' },
  { key: 'takvim', label: 'Ödeme Takvimi', color: '#1D4ED8', bg: '#EFF6FF', icon: '▣' },
  { key: 'overdue', label: 'Vadesi Geçen', color: '#DC2626', bg: '#FEF2F2', icon: '!' },
]

function KpiCard({ meta, count, note, loading, onClick }) {
  return (
    <button className="accounting-kpi" onClick={onClick} style={{ '--kpi-color': meta.color, '--kpi-bg': meta.bg }}>
      <span className="accounting-kpi-icon">{meta.icon}</span>
      <span className="accounting-kpi-copy">
        <small>{meta.label}</small><strong>{loading ? '…' : count}</strong>{(loading || note) && <em>{loading ? 'Yükleniyor…' : note}</em>}
      </span>
      <span className="accounting-kpi-arrow">›</span>
    </button>
  )
}

function Panel({ title, action, children, className = '' }) {
  return <section className={`accounting-panel ${className}`}><header><h3>{title}</h3>{action}</header>{children}</section>
}

export default function MuhasebeGenelOzet({ onNavigate, onGoToInvoice }) {
  const { data: invoiceData, loading, refreshing: invoiceRefreshing, error: invoiceError, refetch: refetchInvoices } =
    useDashboardData('get_invoices_list', {})
  const { data: requestData, refreshing: requestRefreshing, error: requestError, refetch: refetchRequests } =
    useDashboardData('get_satin_alma_overview_all', {})
  const [paymentOverview, setPaymentOverview] = useState([])
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })
  const [showCalendar, setShowCalendar] = useState(false)

  async function fetchPayments() {
    setPaymentLoading(true)
    const overviewResult = await supabase.from('v_invoice_payment_overview').select('*').in('status', ['odeme_bekliyor', 'kismen_odendi', 'ödendi'])
    if (overviewResult.error) console.error('accounting overview payment fetch error:', overviewResult.error)
    setPaymentOverview(overviewResult.data || [])
    setPaymentLoading(false)
  }

  useEffect(() => { fetchPayments() }, [])
  useEffect(() => {
    let alive = true
    fetchDoviz().then(kurData => {
      if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date })
    })
    return () => { alive = false }
  }, [])
  useRealtimeRefresh(['invoices'], () => { refetchInvoices(); fetchPayments() })
  useRealtimeRefresh(['purchase_requests'], refetchRequests)
  useRealtimeRefresh(['invoice_payments'], fetchPayments)

  const invoices = invoiceData?.invoices || []
  // get_satin_alma_overview_all() muhasebe için satin_alindi/fatura_bekliyor'un
  // yanına fatura_onay_bekliyor'u da eklendi (bkz. CLAUDE.md "Satın alma akışı")
  // — ama bu ikincisi zaten faturası oluşturulmuş, yönetici onayında bekleyen
  // talepler demek, "faturalanacak" değil. Burada hâlâ gerçekten faturasız
  // olanları saymak gerekiyor, aksi halde KPI/görev sayısı şişer.
  const pendingRequests = (requestData?.requests || []).filter(request => request.status !== 'fatura_onay_bekliyor')
  const approval = invoices.filter(invoice => invoice.status === 'yönetici_onayında')
  const waiting = paymentOverview.filter(invoice => ['odeme_bekliyor', 'kismen_odendi'].includes(invoice.status))
  const overdue = waiting.filter(invoice => invoice.vade_durumu === 'vadesi_gecti')
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
  const upcoming = waiting
    .filter(invoice => invoice.due_date && invoice.due_date >= monthStart && invoice.due_date < monthEnd)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const invoiceMap = Object.fromEntries(invoices.map(invoice => [invoice.id, invoice]))
  const supplierMap = useMemo(() => Object.fromEntries(invoices.filter(invoice => invoice.supplier_id).map(invoice => [invoice.supplier_id, invoice.suppliers?.name])), [invoices])
  const projectMap = useMemo(() => Object.fromEntries(invoices.filter(invoice => invoice.project_id).map(invoice => [invoice.project_id, invoice.projects?.name])), [invoices])

  // "Bugün Yapılacaklar" artık doğrudan faturalanmayı bekleyen satın alma
  // taleplerinin listesi — muhasebenin fatura girmesi gereken kuyruk.
  const tasks = [...pendingRequests]
    .sort((a, b) => new Date(b.approved_at || b.updated_at || b.created_at) - new Date(a.approved_at || a.updated_at || a.created_at))
    .slice(0, 6)
    .map(request => ({
      id: `request-${request.id}`,
      tone: 'orange',
      title: request.title || 'Satın alma talebi',
      subtitle: request.project_name || '—',
      action: 'Fatura Oluştur',
      onAction: () => onNavigate?.('satin-alma'),
    }))

  // "Son Hareketler": gelen talep (faturalanacak kuyruğa giren), yönetici
  // onayında bekleyen faturalar, ödeme bekleyen faturalar — hepsi tek
  // kronolojik akışta, en son gelme sırasına göre.
  const recent = [
    ...pendingRequests.map(request => ({
      id: `request-${request.id}`, icon: '⌛', tone: 'orange',
      title: 'Yeni talep geldi', subtitle: request.title || request.project_name || 'Satın alma talebi',
      at: request.approved_at || request.updated_at || request.created_at,
    })),
    ...approval.map(invoice => ({
      id: `approval-${invoice.id}`, icon: '♙', tone: 'purple',
      title: 'Yönetici onayında', subtitle: invoice.suppliers?.name || invoice.invoice_no || 'Fatura',
      at: invoice.updated_at || invoice.created_at,
    })),
    ...waiting.map(invoice => ({
      id: `waiting-${invoice.id}`, icon: '▣', tone: 'blue',
      title: 'Ödeme bekliyor', subtitle: invoiceMap[invoice.id]?.suppliers?.name || invoice.invoice_no || 'Fatura',
      at: invoiceMap[invoice.id]?.updated_at,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8)

  const kpis = {
    requests: { count: pendingRequests.length },
    approval: { count: approval.length, note: money(sum(approval, 'total_amount')) },
    takvim: { count: waiting.length, note: `${money(sum(waiting, 'remaining_amount'))} planlı` },
    overdue: { count: overdue.length, note: `${money(sum(overdue, 'remaining_amount'))} riskte` },
  }
  const refreshing = invoiceRefreshing || requestRefreshing
  const error = invoiceError || requestError
  const isLoading = loading || paymentLoading

  return (
    <div className="accounting-overview">
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={() => { refetchInvoices(); refetchRequests(); fetchPayments() }} />
      <div className="accounting-kpi-grid">
        {KPI_META.map(meta => (
          <KpiCard
            key={meta.key}
            meta={meta}
            {...kpis[meta.key]}
            loading={isLoading}
            onClick={() => {
              if (meta.key === 'takvim') { setShowCalendar(true); return }
              onNavigate?.(meta.key === 'requests' ? 'satin-alma' : 'finans')
            }}
          />
        ))}
        <div className="accounting-kur-card" onClick={() => onNavigate?.('finans')}>
          <KurCard doviz={doviz} />
        </div>
      </div>
      <div className="accounting-main-grid">
        <Panel title="Bugün Yapılacaklar" action={<button className="accounting-header-link" onClick={() => onNavigate?.('satin-alma')}>{pendingRequests.length} bekleyen talep ›</button>}>
          {tasks.length === 0 ? <div className="accounting-empty">Bekleyen talep yok.</div> : tasks.map(task => (
            <div className="accounting-task-row" key={task.id}>
              <span className={`accounting-dot ${task.tone}`} /><div><b>{task.title}</b><small>{task.subtitle}</small></div>
              <button onClick={task.onAction}>{task.action}</button>
            </div>
          ))}
        </Panel>
        <Panel title="Yaklaşan Ödemeler" action={<button className="accounting-header-link" onClick={() => onNavigate?.('odemeler')}>Ödeme takibi ›</button>}>
          {upcoming.length === 0 ? <div className="accounting-empty">Bu ay planlı ödeme bulunmuyor.</div> : upcoming.map(invoice => {
            const days = dayDiff(invoice.due_date)
            const source = invoiceMap[invoice.id]
            return <div className="accounting-payment-row" key={invoice.id}>
              <div><b>{source?.suppliers?.name || invoice.invoice_no || 'Fatura'}</b><small>{invoice.invoice_no}</small></div>
              <span>{dateText(invoice.due_date)}</span><strong>{money(invoice.remaining_amount, invoice.currency)}</strong>
              <em className={days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'normal'}>{days === 0 ? 'Bugün' : days < 0 ? `${-days} gün gecikti` : `${days} gün`}</em>
            </div>
          })}
        </Panel>
      </div>
      <Panel title="Son Hareketler" action={<button className="accounting-header-link" onClick={() => onNavigate?.('bildirimler')}>Bildirimler ›</button>} className="accounting-recent-panel">
        {recent.length === 0 ? <div className="accounting-empty">Henüz finansal hareket yok.</div> : recent.map(item => (
          <div
            className="accounting-recent-row accounting-recent-row-clickable"
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate?.('bildirimler')}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate?.('bildirimler') } }}
          >
            <span className={`accounting-activity-icon ${item.tone}`}>{item.icon}</span><b>{item.title}</b><span>{item.subtitle}</span><time>{timeText(item.at)}</time>
          </div>
        ))}
      </Panel>
      {showCalendar && (
        <OdemeTakvimi
          rows={paymentOverview}
          supplierMap={supplierMap}
          projectMap={projectMap}
          canManage
          onPay={() => { setShowCalendar(false); onNavigate?.('odemeler') }}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  )
}
