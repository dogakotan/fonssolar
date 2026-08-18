import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { exportToExcel, exportToPdf } from '../../utils/exportUtils'
import { formatPaymentCurrency } from './OdemeEkleModal'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../ui/DataStatusBanner'

const money = value => formatPaymentCurrency(value, 'TRY')

// Not: "Hedef Maliyet" karşılaştırması bilinçli olarak burada yok — budget_lines
// muhasebe için RLS'te kapalı (bütçe/planlanan veri yalnızca admin/proje yöneticisine
// açık, bkz. CLAUDE.md "muhasebe izolasyonu") ve zaten muhasebenin ihtiyacı bu değil.
// Yönetici hedef/gerçekleşen karşılaştırmasını kendi Finans > Genel sekmesindeki
// Maliyet Kalemi Özeti tablosundan görür.
export default function FinansRaporlari({ defaultProjectId = '' }) {
  const [invoices, setInvoices] = useState([])
  const [transactions, setTransactions] = useState([])
  const [projects, setProjects] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState('TRY')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))

  async function fetchData() {
    setLoading(true)
    const [invoiceResult, transactionResult, projectResult, supplierResult] = await Promise.all([
      supabase.from('v_invoice_payment_overview').select('*'),
      supabase.from('financial_transactions').select('*').neq('status', 'iptal'),
      supabase.from('projects').select('id, name'),
      supabase.from('suppliers').select('id, name'),
    ])
    const fetchError = invoiceResult.error || transactionResult.error || projectResult.error || supplierResult.error
    if (fetchError) {
      console.error('finance reports fetch error:', fetchError)
      setError('Finans raporu Supabase üzerinden hazırlanamadı.')
    } else {
      setInvoices(invoiceResult.data || [])
      setTransactions(transactionResult.data || [])
      setProjects(projectResult.data || [])
      setSuppliers(supplierResult.data || [])
      setError('')
    }
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [])
  useEffect(() => { setProjectId(defaultProjectId) }, [defaultProjectId])
  useRealtimeRefresh(['invoices', { table: 'invoice_payments', filterColumn: null }, { table: 'financial_transactions', filterColumn: null }, 'suppliers'], fetchData)

  // Fatura + faturasız ödeme kayıtları tek listede — ikisi de "gerçekleşen" harcama.
  const records = useMemo(() => [
    ...invoices.map(invoice => ({ ...invoice, source: 'fatura', category: invoice.category || 'diger' })),
    ...transactions.map(tx => ({
      id: tx.id, project_id: tx.project_id, supplier_id: tx.supplier_id, currency: tx.currency,
      invoice_date: tx.transaction_date, total_amount: tx.amount, total_amount_try: tx.amount, paid_amount: tx.paid_amount,
      remaining_amount: tx.remaining_amount, source: 'faturasiz', category: 'diger',
    })),
  ], [invoices, transactions])

  const filtered = records.filter(record => {
    if (projectId && record.project_id !== projectId) return false
    if (supplierId && record.supplier_id !== supplierId) return false
    if (currency && (record.currency || 'TRY') !== currency) return false
    if (month && record.invoice_date && !record.invoice_date.startsWith(month)) return false
    return true
  })
  // total_amount_try (TRY karşılığı) kullanılır — aksi halde USD/EUR faturalar
  // TRY faturalarla aynı toplamda karışır (bkz. CLAUDE.md "Bilinen açık noktalar").
  const total = filtered.reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0)
  const paid = filtered.reduce((sum, record) => sum + Number(record.paid_amount || 0), 0)
  const remaining = filtered.reduce((sum, record) => sum + Number(record.remaining_amount || 0), 0)
  const paymentRate = total ? Math.round(paid / total * 100) : 0
  const projectRows = projects.map(project => {
    const list = filtered.filter(record => record.project_id === project.id)
    const invoiced = list.filter(record => record.source === 'fatura').reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0)
    const invoiceless = list.filter(record => record.source === 'faturasiz').reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0)
    const projectPaid = list.reduce((sum, record) => sum + Number(record.paid_amount || 0), 0)
    const rate = (invoiced + invoiceless) > 0 ? Math.round(projectPaid / (invoiced + invoiceless) * 100) : 0
    return { id: project.id, name: project.name, invoiced, invoiceless, paid: projectPaid, remaining: (invoiced + invoiceless) - projectPaid, rate }
  }).filter(row => row.invoiced || row.invoiceless)
  const maxValue = Math.max(1, ...projectRows.flatMap(row => [row.invoiced + row.invoiceless]))
  const categories = [
    ['Malzeme', filtered.filter(record => record.category === 'malzeme').reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0), '#2563EB'],
    ['Hizmet', filtered.filter(record => record.category === 'hizmet').reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0), '#6D3BD1'],
    ['Diğer', filtered.filter(record => !['malzeme', 'hizmet'].includes(record.category)).reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0), '#F97316'],
  ]
  const categoryTotal = categories.reduce((sum, item) => sum + item[1], 0)
  const exportColumns = ['Proje', 'Faturalı', 'Faturasız', 'Ödenen', 'Kalan', 'Ödeme Oranı']
  const exportRows = projectRows.map(row => [row.name, row.invoiced, row.invoiceless, row.paid, row.remaining, `%${row.rate}`])

  const reset = () => { setSupplierId(''); setCurrency('TRY'); setMonth(new Date().toISOString().slice(0, 7)) }
  const reportTitle = 'Proje Harcamaları'

  return (
    <>
      <DataStatusBanner error={error} refreshing={loading && invoices.length > 0} onRetry={fetchData} />
      <div className="finance-report-filters"><label>Dönem<input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label><label>Tedarikçi<select value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Tümü</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Para Birimi<select value={currency} onChange={e => setCurrency(e.target.value)}><option>TRY</option><option>USD</option><option>EUR</option></select></label><button className="clear" onClick={reset}>Temizle</button><div className="finance-report-export"><button onClick={() => exportToExcel(reportTitle, 'aylik', exportColumns, exportRows)}>▣ Excel⌄</button><button onClick={() => exportToPdf(reportTitle, 'aylik', exportColumns, exportRows)}>▧ PDF⌄</button></div></div>
      <div className="finance-report-kpis">{[['▤', 'Toplam Harcama', money(total), 'blue'], ['✓', 'Toplam Ödenen', money(paid), 'green'], ['♙', 'Kalan Borç', money(remaining), 'orange'], ['◔', 'Ödeme Oranı', `%${paymentRate}`, 'purple']].map(([icon, label, value, tone]) => <article className={tone} key={label}><i>{icon}</i><div><small>{label}</small><b>{value}</b></div></article>)}</div>
      {loading ? <div className="finance-report-empty">Rapor hazırlanıyor…</div> : <>
        <div className="finance-report-charts">
          <section><h3>Proje Bazlı Harcama Karşılaştırması</h3><div className="cost-bars"><div className="cost-bar-legend"><span>■ Faturalı</span><span>■ Faturasız</span></div>{projectRows.slice(0, 5).map(row => <article key={row.id}><b>{row.name}</b><div><i style={{ width: `${row.invoiced / maxValue * 100}%` }} /><em style={{ width: `${row.invoiceless / maxValue * 100}%` }} /></div><span>{money(row.invoiced + row.invoiceless)}</span></article>)}</div></section>
          <section><h3>Harcama Dağılımı</h3><div className="report-donut-wrap"><div className="report-donut" style={{ background: `conic-gradient(${categories.map((item, index) => `${item[2]} ${categories.slice(0, index).reduce((sum, current) => sum + (categoryTotal ? current[1] / categoryTotal * 100 : 0), 0)}% ${categories.slice(0, index + 1).reduce((sum, current) => sum + (categoryTotal ? current[1] / categoryTotal * 100 : 0), 0)}%`).join(',')})` }}><i /></div><div>{categories.map(([label, value, color]) => <p key={label}><i style={{ background: color }} /><span><b>{label}</b><small>{money(value)}</small></span><strong>{categoryTotal ? Math.round(value / categoryTotal * 100) : 0}%</strong></p>)}</div></div></section>
        </div>
        <section className="finance-report-table"><h3>{reportTitle}</h3><div><table><thead><tr>{exportColumns.map(column => <th key={column}>{column}</th>)}<th>İşlem</th></tr></thead><tbody>{projectRows.map(row => <tr key={row.id}><td><b>{row.name}</b></td><td>{money(row.invoiced)}</td><td>{money(row.invoiceless)}</td><td>{money(row.paid)}</td><td>{money(row.remaining)}</td><td><span>%{row.rate}</span><i><em style={{ width: `${Math.min(100, row.rate)}%` }} /></i></td><td><button>Detay ›</button></td></tr>)}</tbody><tfoot><tr><td>Toplam</td><td>{money(projectRows.reduce((sum, row) => sum + row.invoiced, 0))}</td><td>{money(projectRows.reduce((sum, row) => sum + row.invoiceless, 0))}</td><td>{money(paid)}</td><td>{money(remaining)}</td><td>%{paymentRate}</td><td>—</td></tr></tfoot></table></div></section>
        <div className="finance-report-mobile-cards">{projectRows.map(row => <article key={row.id}><header><b>{row.name}</b><small className={row.rate > 70 ? 'watch' : 'normal'}>%{row.rate}</small></header><dl><dt>Faturalı</dt><dd>{money(row.invoiced)}</dd><dt>Faturasız</dt><dd>{money(row.invoiceless)}</dd><dt>Ödenen</dt><dd>{money(row.paid)}</dd><dt>Kalan</dt><dd>{money(row.remaining)}</dd></dl><footer><span>Ödeme Oranı %{row.rate}<i><em style={{ width: `${Math.min(100, row.rate)}%` }} /></i></span><button>Detay ›</button></footer></article>)}</div>
      </>}
    </>
  )
}
