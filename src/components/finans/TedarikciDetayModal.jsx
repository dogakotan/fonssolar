import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatPaymentCurrency, PAYMENT_METHOD_LABELS } from './OdemeEkleModal'
import TedarikciOdemeModal from './TedarikciOdemeModal'
import TedarikciFormModal from './TedarikciFormModal'

const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR') : '—'
const typeLabel = value => ({ malzeme_ekipman: 'Malzeme ve Ekipman', hizmet: 'Hizmet', nakliye: 'Nakliye', diger: 'Diğer' }[value] || '—')
const today = () => new Date().toISOString().slice(0, 10)
const in7Days = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

export default function TedarikciDetayModal({ supplierId, onClose, onChanged }) {
  const [supplier, setSupplier] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [transactions, setTransactions] = useState([])
  const [payments, setPayments] = useState([])
  const [txPayments, setTxPayments] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)

  async function fetchData() {
    setLoading(true)
    const [supplierResult, invoiceResult, transactionResult, projectResult] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', supplierId).maybeSingle(),
      supabase.from('v_invoice_payment_overview').select('*').eq('supplier_id', supplierId),
      supabase.from('financial_transactions').select('*').eq('supplier_id', supplierId).neq('status', 'iptal'),
      supabase.from('projects').select('id, name'),
    ])
    const list = invoiceResult.data || []
    const txList = transactionResult.data || []
    const invoiceIds = list.map(invoice => invoice.id)
    const txIds = txList.map(tx => tx.id)
    const [paymentResult, txPaymentResult] = await Promise.all([
      invoiceIds.length
        ? supabase.from('invoice_payments').select('*').in('invoice_id', invoiceIds).eq('is_cancelled', false).order('payment_date', { ascending: false })
        : Promise.resolve({ data: [] }),
      txIds.length
        ? supabase.from('financial_transaction_payments').select('*').in('transaction_id', txIds).eq('is_cancelled', false).order('payment_date', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])
    setSupplier(supplierResult.data || null)
    setInvoices(list)
    setTransactions(txList)
    setPayments(paymentResult.data || [])
    setTxPayments(txPaymentResult.data || [])
    setProjects(projectResult.data || [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [supplierId])
  const projectMap = useMemo(() => Object.fromEntries(projects.map(project => [project.id, project.name])), [projects])
  const supplierMap = supplier ? { [supplier.id]: supplier.name } : {}

  // Bakiye/geçmiş hem faturaları hem faturasız ödemeleri (financial_transactions)
  // kapsar — önceden yalnızca invoices sayılıyordu, aynı tedarikçiye faturasız
  // yapılan ödemeler bakiyeye hiç yansımıyordu.
  const records = useMemo(() => {
    const fromInvoices = invoices.map(invoice => ({ ...invoice, source: 'fatura', label: invoice.invoice_no }))
    const fromTransactions = transactions.map(tx => ({
      id: tx.id, source: 'faturasiz', label: tx.transaction_no, project_id: tx.project_id,
      total_amount: tx.amount, total_amount_try: tx.amount, paid_amount: tx.paid_amount, paid_amount_try: tx.paid_amount,
      remaining_amount: tx.remaining_amount, remaining_amount_try: tx.remaining_amount,
      currency: tx.currency, due_date: tx.due_date,
      status: tx.status === 'odendi' ? 'ödendi' : tx.status,
      vade_durumu: ['odeme_bekliyor', 'kismen_odendi'].includes(tx.status) && tx.due_date
        ? (tx.due_date < today() ? 'vadesi_gecti' : tx.due_date <= in7Days() ? 'vadesi_yaklasiyor' : null)
        : null,
    }))
    return [...fromInvoices, ...fromTransactions]
  }, [invoices, transactions])
  const historyPayments = useMemo(() => [
    ...payments.map(payment => ({ ...payment, refId: payment.invoice_id })),
    ...txPayments.map(payment => ({ ...payment, refId: payment.transaction_id })),
  ].sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date))), [payments, txPayments])
  const openInvoices = records.filter(record => Number(record.remaining_amount) > 0)
  // total/paid/remaining hep TRY karşılığı (_try alanları) kullanılır — aksi
  // halde USD/EUR faturalar TRY faturalarla aynı toplamda karışır (bkz.
  // CLAUDE.md "Bilinen açık noktalar"). Açık kayıt satırları (aşağıda) kendi
  // para biriminde kalır — yalnızca üstteki KPI toplamları TRY'ye çevrilir.
  const total = records.reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0)
  const paid = records.reduce((sum, record) => sum + Number(record.paid_amount_try ?? record.paid_amount ?? 0), 0)
  const remaining = openInvoices.reduce((sum, record) => sum + Number(record.remaining_amount_try ?? record.remaining_amount ?? 0), 0)
  const overdue = openInvoices.filter(record => record.vade_durumu === 'vadesi_gecti').reduce((sum, record) => sum + Number(record.remaining_amount_try ?? record.remaining_amount ?? 0), 0)
  const nearestDue = openInvoices.map(record => record.due_date).filter(Boolean).sort()[0]
  const status = overdue > 0 ? 'Gecikmiş Borç' : remaining > 0 ? 'Ödeme Bekliyor' : 'Borç Yok'

  if (loading || !supplier) return <div className="supplier-detail-backdrop"><div className="supplier-detail-loading">Yükleniyor…</div></div>
  if (editing) return <TedarikciFormModal supplier={supplier} onClose={() => setEditing(false)} onSaved={async () => { await fetchData(); onChanged?.() }} />

  return (
    <div className="supplier-detail-backdrop">
      <div className="supplier-detail">
        <header><div><small>Finans / Tedarikçiler / {supplier.name}</small><div><h2>{supplier.name}</h2><span className={overdue ? 'danger' : remaining ? 'info' : 'success'}>{status}</span></div><p>Vergi No {supplier.tax_no || '—'}　•　{supplier.tax_office || 'Vergi dairesi belirtilmedi'}</p></div><div><button onClick={() => setEditing(true)}>✎ Düzenle</button><button className="primary" onClick={() => setPaying(true)}>⊕ Ödeme Ekle</button><button className="close" onClick={onClose}>×</button></div></header>
        <div className="supplier-detail-kpis">
          {[['▤', 'Toplam Faturalanan', total, 'blue'], ['▣', 'Toplam Ödenen', paid, 'green'], ['▧', 'Toplam Kalan', remaining, 'orange'], ['!', 'Vadesi Geçen', overdue, 'red']].map(([icon, label, value, tone]) => <article className={tone} key={label}><i>{icon}</i><div><small>{label}</small><b>{formatPaymentCurrency(value)}</b></div></article>)}
          <article className="due"><i>▣</i><div><small>En yakın vade</small><b>{dateText(nearestDue)}</b></div></article>
        </div>
        <nav><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Genel Bakış</button><button className={tab === 'invoices' ? 'active' : ''} onClick={() => setTab('invoices')}>Açık Kayıtlar <b>{openInvoices.length}</b></button><button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>Ödeme Geçmişi <b>{historyPayments.length}</b></button></nav>
        <div className="supplier-detail-content">
          <main>
            {(tab === 'overview' || tab === 'invoices') && <section><header><h3>Açık Kayıtlar</h3></header><div className="supplier-detail-invoice-head"><span>Fatura / İşlem</span><span>Proje</span><span>Toplam</span><span>Ödenen</span><span>Kalan</span><span>Vade</span><span>Durum</span></div>{openInvoices.map(record => {
              const progress = Math.min(100, Number(record.paid_amount) / Math.max(1, Number(record.total_amount)) * 100)
              return <article className="supplier-detail-invoice" key={`${record.source}-${record.id}`}><p><b>{record.label}</b><small>{projectMap[record.project_id] || '—'}{record.source === 'faturasiz' && ' · Faturasız'}</small></p><span className="desktop-project">{projectMap[record.project_id] || '—'}</span><span>{formatPaymentCurrency(record.total_amount, record.currency)}</span><span>{formatPaymentCurrency(record.paid_amount, record.currency)}</span><strong>{formatPaymentCurrency(record.remaining_amount, record.currency)}</strong><span>{dateText(record.due_date)}</span><em className={record.vade_durumu === 'vadesi_gecti' ? 'danger' : record.status === 'kismen_odendi' ? 'partial' : 'info'}>{record.vade_durumu === 'vadesi_gecti' ? 'Vadesi Geçti' : record.status === 'kismen_odendi' ? 'Kısmen Ödendi' : 'Ödeme Bekliyor'}</em><i><u style={{ width: `${progress}%` }} /></i></article>
            })}{!openInvoices.length && <p className="supplier-detail-empty">Açık kayıt bulunmuyor.</p>}</section>}
            {(tab === 'overview' || tab === 'payments') && <section><header><h3>Ödeme Geçmişi</h3></header><div className="supplier-detail-payment-head"><span>Tarih</span><span>Fatura / İşlem</span><span>Proje</span><span>Tutar</span><span>Yöntem</span><span>Referans</span></div>{historyPayments.map(payment => {
              const record = records.find(item => item.id === payment.refId)
              return <article className="supplier-detail-payment" key={payment.id}><i /><span>{dateText(payment.payment_date)}</span><p><b>{record?.label || '—'}</b><small>{projectMap[record?.project_id] || '—'}</small></p><span className="desktop-project">{projectMap[record?.project_id] || '—'}</span><strong>{formatPaymentCurrency(payment.amount, payment.currency)}</strong><span>{PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}</span><span>{payment.reference_no || '—'}</span></article>
            })}{!historyPayments.length && <p className="supplier-detail-empty">Ödeme kaydı bulunmuyor.</p>}</section>}
          </main>
          <aside>
            <section><h3>Tedarikçi Bilgileri</h3><dl><dt>İlgili Kişi</dt><dd>{supplier.contact || '—'}</dd><dt>Telefon</dt><dd>{supplier.phone || '—'}</dd><dt>E-posta</dt><dd>{supplier.email || '—'}</dd><dt>İl / İlçe</dt><dd>{[supplier.city, supplier.district].filter(Boolean).join(' / ') || '—'}</dd><dt>Tür</dt><dd>{typeLabel(supplier.supplier_type)}</dd><dt>Para Birimi</dt><dd>{supplier.currency || 'TRY'}</dd><dt>Durum</dt><dd><span className="success">{supplier.status === 'pasif' ? 'Pasif' : 'Aktif'}</span></dd></dl><p>ⓘ Tedarikçi bilgileri, muhasebe kayıtlarına göre otomatik olarak senkronize edilir.</p></section>
            <section><h3>Vade Özeti</h3><div className="supplier-due-list">{openInvoices.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).map(record => <p key={`${record.source}-${record.id}`} className={record.vade_durumu === 'vadesi_gecti' ? 'danger' : ''}><i /><span><b>{dateText(record.due_date)}</b><small>{record.vade_durumu === 'vadesi_gecti' ? 'Gecikmiş' : 'Planlı'}</small></span><strong>{formatPaymentCurrency(record.remaining_amount, record.currency)}</strong></p>)}</div></section>
          </aside>
        </div>
        <button className="supplier-detail-mobile-pay" onClick={() => setPaying(true)}>⊕ Ödeme Ekle</button>
      </div>
      {paying && <TedarikciOdemeModal rows={invoices} supplierMap={supplierMap} projectMap={projectMap} onClose={() => setPaying(false)} onSaved={async () => { await fetchData(); onChanged?.() }} />}
    </div>
  )
}
