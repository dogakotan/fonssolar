import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Pager from '../ui/Pager'
import OdemeEkleModal, { formatPaymentCurrency } from './OdemeEkleModal'
import FaturaDetayModal from './FaturaDetayModal'
import TedarikciOdemeModal from './TedarikciOdemeModal'
import OdemeTakvimi from './OdemeTakvimi'
import FaturaOlusturModal from '../satin-alma/FaturaOlusturModal'
import FinansalIslemOdemeModal from './FinansalIslemOdemeModal'

const INVOICE_PAYMENT_STATUSES = ['odeme_bekliyor', 'kismen_odendi', 'ödendi']
const TX_PAYMENT_STATUSES = ['odeme_bekliyor', 'kismen_odendi', 'odendi']
const PAGE_SIZE = 10
const TABS = [
  ['hepsi', 'Tümü'], ['odeme_bekliyor', 'Ödeme Bekleyen'], ['kismen_odendi', 'Kısmen Ödendi'],
  ['vadesi_yaklasiyor', 'Vadesi Yaklaşan'], ['vadesi_gecti', 'Vadesi Geçen'], ['odendi', 'Ödendi'],
]

// invoices'ta 'ödendi', financial_transactions'ta 'odendi' yazılıyor — tek ekranda
// karşılaştırılabilmesi için görüntüleme durumu bu tek isimde birleştirilir.
const normalizeStatus = status => (status === 'ödendi' ? 'odendi' : status)

function computeVadeDurumu(status, dueDate) {
  if (!['odeme_bekliyor', 'kismen_odendi'].includes(status) || !dueDate) return null
  const today = new Date().toISOString().slice(0, 10)
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  if (dueDate < today) return 'vadesi_gecti'
  if (dueDate <= in7) return 'vadesi_yaklasiyor'
  return null
}

function displayStatus(row) {
  if (Number(row.remaining_amount) > 0 && row.vade_durumu === 'vadesi_gecti') return ['Vadesi Geçti', '#FEE2E2', '#B91C1C']
  if (row.status === 'kismen_odendi') return ['Kısmen Ödendi', '#F3E8FF', '#7E22CE']
  if (row.status === 'odendi') return ['Ödendi', '#DCFCE7', '#15803D']
  return ['Ödeme Bekliyor', '#DBEAFE', '#1D4ED8']
}

const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR') : '—'
const formatTotals = (rows, field) => {
  const grouped = rows.reduce((result, row) => {
    const currency = row.currency || 'TRY'
    result[currency] = (result[currency] || 0) + (Number(row[field]) || 0)
    return result
  }, {})
  return Object.entries(grouped).map(([currency, amount]) => formatPaymentCurrency(amount, currency)).join(' · ') || formatPaymentCurrency(0)
}

export default function OdemeTakibi({ projectId = null }) {
  const { isAdmin, isMuhasebe } = useAuth()
  const canManage = isAdmin || isMuhasebe
  const [invoiceRows, setInvoiceRows] = useState([])
  const [txRows, setTxRows] = useState([])
  const [projects, setProjects] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [requests, setRequests] = useState([])
  const [, setMonthPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('hepsi')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('hepsi')
  const [projectFilter, setProjectFilter] = useState(projectId || '')
  const [dueStart, setDueStart] = useState('')
  const [dueEnd, setDueEnd] = useState('')
  const [page, setPage] = useState(0)
  const [paymentInvoice, setPaymentInvoice] = useState(null)
  const [paymentTransaction, setPaymentTransaction] = useState(null)
  const [detailInvoice, setDetailInvoice] = useState(null)
  const [showSupplierPayment, setShowSupplierPayment] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [addingTransaction, setAddingTransaction] = useState(false)

  useEffect(() => setProjectFilter(projectId || ''), [projectId])

  async function fetchData() {
    setLoading(true)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
    const [overview, payments, transactions] = await Promise.all([
      supabase.from('v_invoice_payment_overview').select('*').in('status', INVOICE_PAYMENT_STATUSES),
      supabase.from('invoice_payments').select('id, amount, currency, payment_date').eq('is_cancelled', false).gte('payment_date', monthStart).lt('payment_date', monthEnd),
      supabase.from('financial_transactions').select('*').in('status', TX_PAYMENT_STATUSES),
    ])
    if (overview.error) console.error('payment overview fetch error:', overview.error)
    if (payments.error) console.error('monthly payments fetch error:', payments.error)
    if (transactions.error) console.error('financial transactions fetch error:', transactions.error)
    const list = overview.data || []
    const txList = transactions.data || []
    const projectIds = [...new Set([...list.map(r => r.project_id), ...txList.map(r => r.project_id)].filter(Boolean))]
    const supplierIds = [...new Set([...list.map(r => r.supplier_id), ...txList.map(r => r.supplier_id)].filter(Boolean))]
    const invoiceIds = list.map(r => r.id)
    const [projectResult, supplierResult, invoiceResult] = await Promise.all([
      projectIds.length ? supabase.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
      supplierIds.length ? supabase.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [] }),
      invoiceIds.length ? supabase.from('invoices').select('id, purchase_request_id, invoice_date, category, projects(name), suppliers(name)').in('id', invoiceIds) : Promise.resolve({ data: [] }),
    ])
    const requestIds = [...new Set((invoiceResult.data || []).map(r => r.purchase_request_id).filter(Boolean))]
    const requestResult = requestIds.length
      ? await supabase.from('purchase_requests').select('id, title').in('id', requestIds)
      : { data: [] }
    const invoiceMap = Object.fromEntries((invoiceResult.data || []).map(r => [r.id, r]))
    setInvoiceRows(list.map(row => ({ ...row, ...invoiceMap[row.id] })))
    setTxRows(txList)
    setProjects(projectResult.data || [])
    setSuppliers(supplierResult.data || [])
    setRequests(requestResult.data || [])
    setMonthPayments(payments.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const projectMap = useMemo(() => Object.fromEntries(projects.map(x => [x.id, x.name])), [projects])
  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map(x => [x.id, x.name])), [suppliers])
  const requestMap = useMemo(() => Object.fromEntries(requests.map(x => [x.id, x])), [requests])

  // Fatura ve faturasız ödeme kayıtları aynı tabloda, kaynağını belirten tek bir
  // alanla (source) birleştirilir — muhasebenin tek ekrandan hem faturalı hem
  // faturasız borcunu takip edebilmesi için (bkz. kullanıcı kararı).
  const rows = useMemo(() => {
    const fromInvoices = invoiceRows.map(row => ({
      source: 'fatura', id: row.id, no: row.invoice_no,
      subLabel: requestMap[row.purchase_request_id]?.title || '—',
      supplier_id: row.supplier_id, project_id: row.project_id,
      total_amount: row.total_amount, paid_amount: row.paid_amount, remaining_amount: row.remaining_amount,
      currency: row.currency, due_date: row.due_date, status: normalizeStatus(row.status), vade_durumu: row.vade_durumu,
      raw: row,
    }))
    const fromTransactions = txRows.map(row => ({
      source: 'faturasiz', id: row.id, no: row.transaction_no,
      subLabel: row.beneficiary_name || supplierMap[row.supplier_id] || '—',
      supplier_id: row.supplier_id, project_id: row.project_id,
      total_amount: row.amount, paid_amount: row.paid_amount, remaining_amount: row.remaining_amount,
      currency: row.currency, due_date: row.due_date, status: normalizeStatus(row.status),
      vade_durumu: computeVadeDurumu(row.status, row.due_date),
      raw: { ...row, counterparty: row.beneficiary_name || supplierMap[row.supplier_id] || '—' },
    }))
    return [...fromInvoices, ...fromTransactions]
  }, [invoiceRows, txRows, requestMap, supplierMap])

  const filtered = rows.filter(row => {
    if (projectFilter && row.project_id !== projectFilter) return false
    if (tab === 'vadesi_yaklasiyor' || tab === 'vadesi_gecti') {
      if (!['odeme_bekliyor', 'kismen_odendi'].includes(row.status) || row.vade_durumu !== tab) return false
    } else if (tab !== 'hepsi' && row.status !== tab) return false
    if (status !== 'hepsi' && row.status !== status) return false
    if (dueStart && (!row.due_date || row.due_date < dueStart)) return false
    if (dueEnd && (!row.due_date || row.due_date > dueEnd)) return false
    const hay = `${row.no || ''} ${row.subLabel || ''} ${supplierMap[row.supplier_id] || ''} ${projectMap[row.project_id] || ''}`.toLocaleLowerCase('tr-TR')
    return !search.trim() || hay.includes(search.trim().toLocaleLowerCase('tr-TR'))
  })
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const tabCount = key => {
    if (key === 'hepsi') return rows.length
    if (key === 'vadesi_yaklasiyor' || key === 'vadesi_gecti') {
      return rows.filter(row => row.vade_durumu === key && ['odeme_bekliyor', 'kismen_odendi'].includes(row.status)).length
    }
    return rows.filter(row => row.status === key).length
  }
  const weekEnd = new Date()
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekRows = rows.filter(row => {
    if (!row.due_date || Number(row.remaining_amount) <= 0) return false
    const due = new Date(`${row.due_date}T23:59:59`)
    return due >= new Date() && due <= weekEnd
  })
  const firstPayableInvoice = invoiceRows.find(row => ['odeme_bekliyor', 'kismen_odendi'].includes(row.status))
  const invoiceForModal = raw => ({
    ...raw,
    projects: { name: projectMap[raw.project_id] },
    suppliers: { name: supplierMap[raw.supplier_id] },
    purchase_requests: requestMap[raw.purchase_request_id],
  })
  const canPay = row => canManage && ['odeme_bekliyor', 'kismen_odendi'].includes(row.status)
  const openRow = row => {
    if (row.source === 'fatura') { setDetailInvoice(invoiceForModal(row.raw)); return }
    if (canPay(row)) setPaymentTransaction(row.raw)
  }
  const payRow = row => {
    if (row.source === 'fatura') { canPay(row) ? setPaymentInvoice(invoiceForModal(row.raw)) : setDetailInvoice(invoiceForModal(row.raw)); return }
    if (canPay(row)) setPaymentTransaction(row.raw)
  }

  return (
    <>
      <div className="payment-shell">
        <div className="payment-tabs">{TABS.map(([key, label]) => <button key={key} onClick={() => { setTab(key); setPage(0) }} className={tab === key ? 'active' : ''}>{label}<b>{tabCount(key)}</b></button>)}</div>
        <div className="payment-filters">
          <label className="payment-search"><span>⌕</span><input placeholder="Fatura/işlem no, tedarikçi veya proje ara" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label>
          <select value={projectFilter} onChange={e => { setProjectFilter(e.target.value); setPage(0) }}><option value="">Tüm Projeler</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="hepsi">Tüm Durumlar</option><option value="odeme_bekliyor">Ödeme Bekleyen</option><option value="kismen_odendi">Kısmen Ödendi</option><option value="odendi">Ödendi</option></select>
          <label className="payment-date-filter">Vade Tarihi<input aria-label="Vade başlangıcı" type="date" value={dueStart} onChange={e => setDueStart(e.target.value)} /></label>
          <button className="payment-filter-button">≡ Filtrele</button>
          <button className="payment-clear-button" onClick={() => { setSearch(''); setStatus('hepsi'); setDueStart(''); setDueEnd(''); setProjectFilter(projectId || ''); setPage(0) }}>Temizle</button>
          <div className="payment-page-actions">
            <button className="payment-calendar-btn" onClick={() => setShowCalendar(true)}>▣ <span>Ödeme Takvimi</span></button>
            {canManage && <button className="payment-add-supplier-btn" onClick={() => setAddingTransaction(true)}>＋ <span>Fatura / Harcama Ekle</span></button>}
            {canManage && firstPayableInvoice && (
              <button className="payment-add-supplier-btn" onClick={() => setShowSupplierPayment(true)}>⊕ <span>Tedarikçiye Ödeme Ekle</span></button>
            )}
          </div>
        </div>
        {loading ? <div className="payment-empty">Yükleniyor…</div> : pageRows.length === 0 ? <div className="payment-empty">Ödeme takibinde kayıt bulunamadı.</div> : (
          <>
            <div className="payment-table-wrap"><table className="payment-table"><thead><tr><th>Kayıt</th><th>Tedarikçi / Proje</th><th>Toplam</th><th>Ödenen</th><th>Kalan</th><th>Vade</th><th>Ödeme Durumu</th><th>İşlem</th></tr></thead><tbody>
              {pageRows.map(row => {
                const [label, bg, color] = displayStatus(row)
                return <tr key={`${row.source}-${row.id}`} onClick={() => openRow(row)}>
                  <td><b>{row.no || '—'}</b><small>{row.source === 'fatura' ? row.subLabel : 'Faturasız Ödeme'}</small></td>
                  <td><b>{supplierMap[row.supplier_id] || row.subLabel || '—'}</b><small>{projectMap[row.project_id] || '—'}</small></td>
                  <td className="payment-amount-cell"><b>{formatPaymentCurrency(row.total_amount, row.currency)}</b><i><em style={{ width: `${Math.min(100, (Number(row.paid_amount) / Math.max(1, Number(row.total_amount))) * 100)}%`, background: color }} /></i></td><td>{formatPaymentCurrency(row.paid_amount, row.currency)}</td><td>{Number(row.remaining_amount) ? formatPaymentCurrency(row.remaining_amount, row.currency) : '—'}</td>
                  <td style={{ color: row.vade_durumu === 'vadesi_gecti' ? '#B91C1C' : row.vade_durumu === 'vadesi_yaklasiyor' ? '#C2410C' : undefined, fontWeight: row.vade_durumu ? 700 : 400 }}>{dateText(row.due_date)}</td>
                  <td><span className="payment-badge" style={{ background: bg, color }}>{label}</span></td>
                  <td onClick={e => e.stopPropagation()}><button className="payment-link-btn" onClick={() => payRow(row)}>{canPay(row) ? 'Ödeme Ekle' : 'Görüntüle'}</button></td>
                </tr>
              })}</tbody></table></div>
            <div className="payment-mobile-list">{pageRows.map(row => { const [label, bg, color] = displayStatus(row); return <article key={`${row.source}-${row.id}`} className="payment-mobile-card" onClick={() => openRow(row)}><header><div><b>{supplierMap[row.supplier_id] || row.subLabel}</b><small>{projectMap[row.project_id]}</small></div><strong>{row.no}</strong></header><div className="payment-mobile-values"><span><b>{formatPaymentCurrency(row.total_amount, row.currency)}</b></span><span>Ödenen <b>{formatPaymentCurrency(row.paid_amount, row.currency)}</b></span><span>Kalan <b>{formatPaymentCurrency(row.remaining_amount, row.currency)}</b></span></div><i className="payment-mobile-progress"><em style={{ width: `${Math.min(100, (Number(row.paid_amount) / Math.max(1, Number(row.total_amount))) * 100)}%`, background: color }} /></i><footer><small>Vade: {dateText(row.due_date)}</small><span className="payment-badge" style={{ background: bg, color }}>{label}</span><button className="payment-link-btn" onClick={e => { e.stopPropagation(); payRow(row) }}>{canPay(row) ? 'Ödeme Ekle' : 'Görüntüle'}</button></footer></article> })}</div>
            <Pager page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onChange={setPage} />
          </>
        )}
      </div>
      <section className="payment-week-summary">
        <i>▣</i>
        <div><b>Bu Hafta Ödenecek</b><small>{new Date().toLocaleDateString('tr-TR')} – {weekEnd.toLocaleDateString('tr-TR')}</small></div>
        <p><small>Toplam Tutar</small><strong>{formatTotals(weekRows, 'remaining_amount')}</strong></p>
        <span><b>{weekRows.length}</b> kayıt</span>
        <button>▣ Takvimde Gör</button>
      </section>
      {paymentInvoice && <OdemeEkleModal invoice={paymentInvoice} onClose={() => setPaymentInvoice(null)} onSaved={fetchData} />}
      {paymentTransaction && <FinansalIslemOdemeModal transaction={paymentTransaction} onClose={() => setPaymentTransaction(null)} onSaved={fetchData} />}
      {detailInvoice && <FaturaDetayModal invoice={detailInvoice} onClose={() => setDetailInvoice(null)} onChanged={fetchData} />}
      {addingTransaction && <FaturaOlusturModal defaultProjectId={projectId || ''} onClose={() => setAddingTransaction(false)} onSaved={fetchData} />}
      {showSupplierPayment && <TedarikciOdemeModal rows={invoiceRows} supplierMap={supplierMap} projectMap={projectMap} onClose={() => setShowSupplierPayment(false)} onSaved={fetchData} />}
      {showCalendar && <OdemeTakvimi rows={invoiceRows} supplierMap={supplierMap} projectMap={projectMap} canManage={canManage} onPay={row => { setShowCalendar(false); setPaymentInvoice(invoiceForModal(row)) }} onClose={() => setShowCalendar(false)} />}
    </>
  )
}
