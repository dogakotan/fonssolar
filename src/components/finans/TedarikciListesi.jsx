import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Pager from '../ui/Pager'
import { formatPaymentCurrency } from './OdemeEkleModal'
import TedarikciFormModal from './TedarikciFormModal'
import TedarikciDetayModal from './TedarikciDetayModal'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../ui/DataStatusBanner'
import { useUrlSyncedSelection } from '../../hooks/useUrlSyncedSelection'

const PAGE_SIZE = 8
const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR') : '—'

function supplierStatus(row) {
  if (row.overdue > 0) return ['Gecikmiş Borç', 'danger']
  if (row.remaining <= 0) return ['Borç Yok', 'success']
  if (row.nearestDue && new Date(`${row.nearestDue}T23:59:59`) - new Date() <= 7 * 86400000) return ['Vade Yaklaşıyor', 'warning']
  return ['Ödeme Bekliyor', 'info']
}

const today = () => new Date().toISOString().slice(0, 10)
const in7Days = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

export default function TedarikciListesi({ projectId = '', openSupplierId, onOpenedSupplier, onSelectedSupplierChange }) {
  const [suppliers, setSuppliers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [balance, setBalance] = useState('all')
  const [due, setDue] = useState('all')
  const [page, setPage] = useState(0)
  const [detailId, setDetailId] = useState(null)
  const [adding, setAdding] = useState(false)

  // Adres çubuğundan (yenileme/deep-link) gelen tedarikçi id'si — TedarikciDetayModal
  // zaten yalnızca id ile çalıştığından ayrı bir kayıt araması gerekmiyor.
  useEffect(() => {
    if (!openSupplierId) return
    setDetailId(openSupplierId)
    onOpenedSupplier?.()
  }, [openSupplierId, onOpenedSupplier])

  // Açık tedarikçi detay modalının id'sini adres çubuğuna yansıtır.
  useUrlSyncedSelection(detailId ?? null, onSelectedSupplierChange)

  async function fetchData() {
    setLoading(true)
    const [supplierResult, invoiceResult, transactionResult] = await Promise.all([
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('v_invoice_payment_overview').select('*'),
      supabase.from('financial_transactions').select('id, supplier_id, project_id, amount, paid_amount, remaining_amount, currency, due_date, status').neq('status', 'iptal'),
    ])
    const fetchError = supplierResult.error || invoiceResult.error || transactionResult.error
    if (fetchError) {
      console.error('supplier finance fetch error:', fetchError)
      setError('Tedarikçi bakiyeleri Supabase üzerinden yüklenemedi.')
    } else {
      setSuppliers(supplierResult.data || [])
      setInvoices(invoiceResult.data || [])
      setTransactions(transactionResult.data || [])
      setError('')
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])
  useRealtimeRefresh(['suppliers', 'invoices', { table: 'invoice_payments', filterColumn: null }, { table: 'financial_transactions', filterColumn: null }], fetchData)

  // Bakiye hem faturaları hem faturasız ödemeleri (financial_transactions) kapsar.
  const records = useMemo(() => [
    ...invoices.map(invoice => ({ ...invoice, remaining_amount: invoice.remaining_amount })),
    ...transactions.map(tx => ({
      supplier_id: tx.supplier_id, project_id: tx.project_id, total_amount: tx.amount, total_amount_try: tx.amount,
      paid_amount: tx.paid_amount, remaining_amount: tx.remaining_amount, due_date: tx.due_date,
      vade_durumu: ['odeme_bekliyor', 'kismen_odendi'].includes(tx.status) && tx.due_date
        ? (tx.due_date < today() ? 'vadesi_gecti' : tx.due_date <= in7Days() ? 'vadesi_yaklasiyor' : null)
        : null,
    })),
  ], [invoices, transactions])

  const rows = useMemo(() => suppliers.map(supplier => {
    const list = records.filter(record => record.supplier_id === supplier.id && (!projectId || record.project_id === projectId))
    const open = list.filter(record => Number(record.remaining_amount) > 0)
    // total_amount_try (TRY karşılığı) kullanılır — aksi halde USD/EUR faturalar
    // TRY faturalarla aynı toplamda karışır (bkz. CLAUDE.md "Bilinen açık noktalar").
    const total = list.reduce((sum, record) => sum + Number(record.total_amount_try ?? record.total_amount ?? 0), 0)
    const paid = list.reduce((sum, record) => sum + Number(record.paid_amount || 0), 0)
    const remaining = open.reduce((sum, record) => sum + Number(record.remaining_amount || 0), 0)
    const overdue = open.filter(record => record.vade_durumu === 'vadesi_gecti').reduce((sum, record) => sum + Number(record.remaining_amount || 0), 0)
    const nearestDue = open.map(record => record.due_date).filter(Boolean).sort()[0] || null
    return { ...supplier, openCount: open.length, total, paid, remaining, overdue, nearestDue }
  }), [suppliers, records, projectId])

  const filtered = rows.filter(row => {
    if (search && !row.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))) return false
    if (balance === 'with_debt' && row.remaining <= 0) return false
    if (balance === 'without_debt' && row.remaining > 0) return false
    if (due === 'overdue' && row.overdue <= 0) return false
    if (due === 'upcoming' && supplierStatus(row)[1] !== 'warning') return false
    return true
  })
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalDebt = rows.reduce((sum, row) => sum + row.remaining, 0)
  const overdueDebt = rows.reduce((sum, row) => sum + row.overdue, 0)

  const reset = () => { setSearch(''); setBalance('all'); setDue('all'); setPage(0) }

  return (
    <>
      <DataStatusBanner error={error} refreshing={loading && suppliers.length > 0} onRetry={fetchData} />
      <header className="supplier-page-heading">
        <button onClick={() => setAdding(true)}>⊕ Yeni Tedarikçi</button>
      </header>
      <div className="supplier-kpis">
        {[
          ['◎', 'Toplam Tedarikçi', rows.length, 'blue'],
          ['▣', 'Açık Borç', formatPaymentCurrency(totalDebt), 'orange'],
          ['!', 'Vadesi Geçen Borç', formatPaymentCurrency(overdueDebt), 'red'],
          ['✓', 'Borcu Olmayan', rows.filter(row => row.remaining <= 0).length, 'green'],
        ].map(([icon, label, value, tone]) => <article className={`supplier-kpi ${tone}`} key={label}><i>{icon}</i><div><small>{label}</small><b>{value}</b></div></article>)}
      </div>
      <div className="supplier-filters">
        <label><span>⌕</span><input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Tedarikçi adı veya vergi no ara" /></label>
        <select value={balance} onChange={e => { setBalance(e.target.value); setPage(0) }}><option value="all">Bakiye Durumu</option><option value="with_debt">Borcu Olan</option><option value="without_debt">Borcu Olmayan</option></select>
        <select value={due} onChange={e => { setDue(e.target.value); setPage(0) }}><option value="all">Vade Durumu</option><option value="overdue">Vadesi Geçen</option><option value="upcoming">Vadesi Yaklaşan</option></select>
        <button className="filter">≡ Filtrele</button><button className="clear" onClick={reset}>Temizle</button>
      </div>
      <section className="supplier-list-shell">
        {loading ? <div className="supplier-empty">Yükleniyor…</div> : pageRows.length === 0 ? <div className="supplier-empty">Tedarikçi bulunamadı.</div> : <>
          <div className="supplier-table-wrap"><table className="supplier-table"><thead><tr><th>Tedarikçi</th><th>Açık Kayıt</th><th>Toplam Faturalanan</th><th>Ödenen</th><th>Kalan</th><th>Vadesi Geçen</th><th>En Yakın Vade</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{pageRows.map(row => {
            const [label, tone] = supplierStatus(row)
            return <tr key={row.id}><td><b>{row.name}</b><small>Tedarikçi No {String(row.id).slice(-8).toUpperCase()}</small></td><td>{row.openCount}</td><td>{formatPaymentCurrency(row.total)}</td><td>{formatPaymentCurrency(row.paid)}</td><td><b>{formatPaymentCurrency(row.remaining)}</b></td><td className={row.overdue ? 'danger' : ''}>{formatPaymentCurrency(row.overdue)}</td><td>{dateText(row.nearestDue)}</td><td><span className={`supplier-status ${tone}`}>{label}</span></td><td><button onClick={() => setDetailId(row.id)}>Detay</button></td></tr>
          })}</tbody></table></div>
          <div className="supplier-mobile-list">{pageRows.map(row => {
            const [label, tone] = supplierStatus(row)
            return <article key={row.id}><header><div><b>{row.name}</b><small>Tedarikçi No {String(row.id).slice(-8).toUpperCase()}</small></div><span className={`supplier-status ${tone}`}>{label}</span></header><dl><dt>Açık Kayıt</dt><dd>{row.openCount}</dd><dt>Toplam</dt><dd>{formatPaymentCurrency(row.total)}</dd><dt>Ödenen</dt><dd>{formatPaymentCurrency(row.paid)}</dd><dt>Kalan</dt><dd>{formatPaymentCurrency(row.remaining)}</dd><dt>Vadesi Geçen</dt><dd className="danger">{formatPaymentCurrency(row.overdue)}</dd><dt>En Yakın Vade</dt><dd>{dateText(row.nearestDue)}</dd></dl><button onClick={() => setDetailId(row.id)}>Detayları Gör</button></article>
          })}</div>
          <Pager page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onChange={setPage} />
        </>}
      </section>
      <p className="supplier-info">ⓘ Tedarikçi bakiyesi, fatura ve ödeme kayıtlarına göre otomatik hesaplanır. Manuel olarak düzenlenemez.</p>
      {adding && <TedarikciFormModal onClose={() => setAdding(false)} onSaved={fetchData} />}
      {detailId && <TedarikciDetayModal supplierId={detailId} onClose={() => setDetailId(null)} onChanged={fetchData} />}
    </>
  )
}
