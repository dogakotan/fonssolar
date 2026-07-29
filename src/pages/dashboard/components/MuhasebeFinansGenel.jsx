import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { formatPaymentCurrency } from '../../../components/finans/OdemeEkleModal'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'

const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const money = (amount, currency = 'TRY') => formatPaymentCurrency(amount, currency)
const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
const daysUntil = date => date ? Math.ceil((new Date(`${date}T23:59:59`) - new Date()) / 86400000) : null

function Metric({ title, value, note, tone, icon }) {
  return <div className={`finance-overview-metric ${tone}`}><span>{icon}</span><div><small>{title}</small><strong>{value}</strong><em>{note}</em></div></div>
}

export default function MuhasebeFinansGenel({ onNavigate, projectId = '' }) {
  const [invoices, setInvoices] = useState([])
  const [overview, setOverview] = useState([])
  const [payments, setPayments] = useState([])
  const [projects, setProjects] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function fetchData() {
    setLoading(true)
    const [invoiceResult, overviewResult, paymentResult, projectResult, supplierResult] = await Promise.all([
      supabase.rpc('get_invoices_list', { p_project_id: null, p_filter_date: null }),
      supabase.from('v_invoice_payment_overview').select('*'),
      supabase.from('invoice_payments').select('id, invoice_id, amount, currency, payment_date, created_at, is_cancelled').eq('is_cancelled', false),
      supabase.from('projects').select('id, name'),
      supabase.from('suppliers').select('id, name'),
    ])
    const fetchError = invoiceResult.error || overviewResult.error || paymentResult.error || projectResult.error || supplierResult.error
    if (fetchError) {
      console.error('finance overview fetch error:', fetchError)
      setError('Finans özeti Supabase üzerinden yüklenemedi.')
    } else {
      setInvoices(invoiceResult.data?.invoices || [])
      setOverview(overviewResult.data || [])
      setPayments(paymentResult.data || [])
      setProjects(projectResult.data || [])
      setSuppliers(supplierResult.data || [])
      setError('')
    }
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [])
  useRealtimeRefresh(['invoices', 'invoice_payments'], fetchData)

  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map(supplier => [supplier.id, supplier.name])), [suppliers])
  const scopedInvoices = projectId ? invoices.filter(invoice => invoice.project_id === projectId) : invoices
  const scopedOverview = projectId ? overview.filter(invoice => invoice.project_id === projectId) : overview
  const scopedInvoiceIds = new Set(scopedOverview.map(invoice => invoice.id))
  const scopedPayments = projectId ? payments.filter(payment => scopedInvoiceIds.has(payment.invoice_id)) : payments
  const current = new Date()
  const monthInvoices = scopedInvoices.filter(invoice => {
    const date = new Date(invoice.invoice_date)
    return date.getMonth() === current.getMonth() && date.getFullYear() === current.getFullYear()
  })
  const monthPayments = scopedPayments.filter(payment => {
    const date = new Date(payment.payment_date)
    return date.getMonth() === current.getMonth() && date.getFullYear() === current.getFullYear()
  })
  const open = scopedOverview.filter(invoice => ['odeme_bekliyor', 'kismen_odendi'].includes(invoice.status))
  const overdue = open.filter(invoice => invoice.vade_durumu === 'vadesi_gecti')
  const partial = open.filter(invoice => invoice.status === 'kismen_odendi' && invoice.vade_durumu !== 'vadesi_gecti')
  const waiting = open.filter(invoice => invoice.status === 'odeme_bekliyor' && invoice.vade_durumu !== 'vadesi_gecti')

  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth() - 5 + index, 1)
    return {
      label: monthNames[date.getMonth()],
      value: sum(scopedPayments.filter(payment => {
        const paymentDate = new Date(payment.payment_date)
        return paymentDate.getMonth() === date.getMonth() && paymentDate.getFullYear() === date.getFullYear()
      }), 'amount'),
    }
  })
  const maxMonthly = Math.max(...monthly.map(item => item.value), 1)
  const debtParts = [
    { label: 'Ödeme Bekleyen', value: sum(waiting, 'remaining_amount'), color: '#2563EB' },
    { label: 'Kısmen Ödenen', value: sum(partial, 'remaining_amount'), color: '#7C3AED' },
    { label: 'Vadesi Geçen', value: sum(overdue, 'remaining_amount'), color: '#EF4444' },
  ]
  const debtTotal = debtParts.reduce((total, item) => total + item.value, 0) || 1
  let cursor = 0
  const gradient = debtParts.map(item => {
    const start = cursor
    cursor += item.value / debtTotal * 100
    return `${item.color} ${start}% ${cursor}%`
  }).join(', ')

  const projectRows = projects.map(project => {
    const rows = scopedOverview.filter(invoice => invoice.project_id === project.id)
    return { ...project, billed: sum(rows, 'total_amount'), paid: sum(rows, 'paid_amount'), remaining: sum(rows, 'remaining_amount') }
  }).filter(project => project.billed > 0).sort((a, b) => b.billed - a.billed).slice(0, 5)
  const critical = [...open].filter(invoice => invoice.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5)

  return (
    <div className="finance-overview">
      <DataStatusBanner error={error} refreshing={loading && overview.length > 0} onRetry={fetchData} />
      <div className="finance-overview-metrics">
        <Metric title="Toplam Faturalanan" value={loading ? '…' : money(sum(monthInvoices, 'total_amount'))} note="Bu ay" tone="blue" icon="▣" />
        <Metric title="Toplam Ödenen" value={loading ? '…' : money(sum(monthPayments, 'amount'))} note="Bu ay" tone="green" icon="✓" />
        <Metric title="Kalan Borç" value={loading ? '…' : money(sum(open, 'remaining_amount'))} note={`${open.length} açık fatura`} tone="orange" icon="◴" />
        <Metric title="Vadesi Geçen" value={loading ? '…' : money(sum(overdue, 'remaining_amount'))} note={`${overdue.length} fatura`} tone="red" icon="!" />
      </div>
      <div className="finance-overview-charts">
        <section className="finance-overview-panel">
          <header><div><h3>Aylık Nakit Çıkışı</h3><small>₺ (Milyon)</small></div><div><small>{monthNames[current.getMonth()]}</small><strong>{money(monthly.at(-1)?.value)}</strong></div></header>
          <div className="finance-bar-chart">{monthly.map((item, index) => <div key={item.label} className="finance-bar-column"><div className="finance-bar-track"><span className={index === monthly.length - 1 ? 'current' : ''} style={{ height: `${Math.max(5, item.value / maxMonthly * 100)}%` }} title={money(item.value)} /></div><small>{item.label}</small></div>)}</div>
        </section>
        <section className="finance-overview-panel">
          <header><h3>Borç Dağılımı</h3></header>
          <div className="finance-debt-chart"><div className="finance-donut" style={{ background: `conic-gradient(${gradient})` }}><i /></div><div className="finance-debt-legend">{debtParts.map(item => <div key={item.label}><span style={{ background: item.color }} /><p><small>{item.label}</small><b>{money(item.value)}</b></p></div>)}</div></div>
        </section>
      </div>
      <div className="finance-overview-bottom">
        <section className="finance-overview-panel finance-project-spend">
          <header><h3>Proje Bazlı Harcamalar</h3></header>
          <div className="finance-table-head"><span>Proje</span><span>Faturalanan</span><span>Ödenen</span><span>Kalan</span><span>Tahsilat</span></div>
          {projectRows.length === 0 ? <p className="finance-empty">Proje harcaması bulunmuyor.</p> : projectRows.map(project => {
            const rate = project.billed ? project.paid / project.billed * 100 : 0
            return <div className="finance-project-row" key={project.id}><b>{project.name}</b><span>{money(project.billed)}</span><span>{money(project.paid)}</span><span>{money(project.remaining)}</span><div><small>%{Math.round(rate)}</small><i><em style={{ width: `${Math.min(100, rate)}%` }} /></i></div></div>
          })}
        </section>
        <section className="finance-overview-panel finance-critical">
          <header><h3>Kritik Ödemeler</h3><button onClick={() => onNavigate?.('odemeler')}>Ödeme takibine git ›</button></header>
          {critical.length === 0 ? <p className="finance-empty">Kritik ödeme bulunmuyor.</p> : critical.map(invoice => {
            const days = daysUntil(invoice.due_date)
            const tone = days < 0 ? 'red' : days <= 3 ? 'orange' : 'blue'
            return <div className="finance-critical-row" key={invoice.id}><i className={tone} /><b>{supplierMap[invoice.supplier_id] || invoice.invoice_no}</b><span className={tone}>{days < 0 ? `Vadesi ${Math.abs(days)} gün geçti` : days === 0 ? 'Bugün' : `${days} gün kaldı`}</span><strong className={tone}>{money(invoice.remaining_amount, invoice.currency)}</strong></div>
          })}
        </section>
      </div>
    </div>
  )
}
