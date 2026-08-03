import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import FaturaOlusturModal from '../../../components/satin-alma/FaturaOlusturModal'
import TalepDetayModal from '../../../components/satin-alma/TalepDetayModal'
import Pager from '../../../components/ui/Pager'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import { requestNo } from '../../../utils/purchaseRequestNo'
import { useUrlSyncedSelection } from '../../../hooks/useUrlSyncedSelection'

const PAGE_SIZE = 8
const money = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value) || 0)
const dateText = value => value ? new Date(value).toLocaleDateString('tr-TR') : '—'
const requestAmount = request => Number(request.approved_amount ?? request.estimated_amount_incl_vat ?? request.total_amount ?? request.estimated_amount ?? 0)
const requestType = request => request.category === 'hizmet' ? 'Hizmet' : request.category === 'diger' ? 'Diğer' : 'Malzeme'
const supplierName = request => request.supplier_name || request.supplier?.name || request.suppliers?.name || '—'

export default function MuhasebeSatinAlma({ requests, refreshing, onRefresh, projectOptions, projectFilter, onProjectFilter, openRequestId, onOpenedRequest, onSelectedRequestChange }) {
  const [invoices, setInvoices] = useState([])
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [page, setPage] = useState(0)
  const [invoiceRequest, setInvoiceRequest] = useState(null)
  const [detailRequest, setDetailRequest] = useState(null)
  const [invoiceError, setInvoiceError] = useState('')
  const [showAddInvoice, setShowAddInvoice] = useState(false)

  // Bildirimler'den bir satın alma talebine deep-link — bu ekranın kendi
  // requests prop'u zaten tam talep listesini içerdiğinden (get_satin_alma_overview_all),
  // TabSatinAlmaTalepListesi'ndeki gibi ayrı bir RPC'ye gerek yok, doğrudan bulunur.
  // Öncesinde bu bileşen openRequestId'yi hiç almıyordu — muhasebe bir satın alma
  // bildirimine tıkladığında sessizce hiçbir şey açılmıyordu.
  useEffect(() => {
    if (!openRequestId) return
    // requests prop'u (get_satin_alma_overview_all) henüz yüklenmemiş olabilir —
    // boşken tüketmeyi (onOpenedRequest) erteliyoruz, aksi halde veri gelmeden
    // "bulunamadı" sayılıp deep-link sessizce kaybolurdu.
    if (!requests.length) return
    const found = requests.find(r => r.id === openRequestId)
    if (found) setDetailRequest(found)
    onOpenedRequest?.()
  }, [openRequestId, requests, onOpenedRequest])

  // Açık detay modalının id'sini adres çubuğuna yansıtır.
  useUrlSyncedSelection(detailRequest?.id ?? null, onSelectedRequestChange)

  async function fetchInvoices() {
    const { data, error } = await supabase.rpc('get_invoices_list', { p_project_id: null, p_filter_date: null })
    if (error) {
      console.error('purchase invoice summary error:', error)
      setInvoiceError('Fatura bağlantısı kurulamadı.')
    } else {
      setInvoices(data?.invoices || [])
      setInvoiceError('')
    }
  }
  useEffect(() => { fetchInvoices() }, [])
  useRealtimeRefresh(['invoices'], fetchInvoices)

  // requests get_satin_alma_overview_all'da muhasebe için satin_alindi/
  // fatura_bekliyor/fatura_onay_bekliyor'a daraltılmış gelir (bkz. TabSatinAlma.jsx)
  // — fatura_onay_bekliyor, muhasebenin oluşturduğu faturanın hâlâ yönetici
  // onayında olduğu anlamına gelir, "Onayda" olarak gösterilir; onaylanıp
  // faturasi_kesildi'ye geçtiğinde talep bu listeden tamamen düşer.
  const invoicedRequestIds = useMemo(() => new Set(invoices.map(invoice => invoice.purchase_request_id).filter(Boolean)), [invoices])

  function requestStatus(request) {
    if (request.status === 'fatura_onay_bekliyor') return { label: 'Onayda', tone: 'onayda', canInvoice: false }
    if (invoicedRequestIds.has(request.id)) return { label: 'Fatura Oluşturuldu', tone: 'done', canInvoice: false }
    return { label: 'Fatura Bekliyor', tone: 'waiting', canInvoice: true }
  }

  const filtered = requests.filter(request => {
    if (projectFilter !== 'all' && request.project_id !== projectFilter) return false
    if (dateFilter !== 'all') {
      const date = new Date(request.approved_at || request.updated_at || request.created_at)
      const now = new Date()
      const days = (now - date) / 86400000
      if (dateFilter === 'week' && days > 7) return false
      if (dateFilter === 'month' && (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false
    }
    const hay = `${requestNo(request)} ${supplierName(request)} ${request.project_name || ''} ${request.title || ''}`.toLocaleLowerCase('tr-TR')
    return !search.trim() || hay.includes(search.trim().toLocaleLowerCase('tr-TR'))
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const rows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function resetFilters() {
    setSearch(''); setDateFilter('all'); onProjectFilter('all'); setPage(0)
  }
  async function saved() {
    setInvoiceRequest(null)
    await Promise.all([onRefresh?.(), fetchInvoices()])
  }

  return (
    <div className="purchase-accounting">
      <DataStatusBanner error={invoiceError} refreshing={false} onRetry={fetchInvoices} />
      <div className="purchase-filterbar">
        <label className="purchase-search">⌕<input value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Talep no, tedarikçi veya proje ara" /></label>
        <select value={projectFilter} onChange={event => { onProjectFilter(event.target.value); setPage(0) }}><option value="all">Tüm Projeler</option>{projectOptions.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <select value={dateFilter} onChange={event => { setDateFilter(event.target.value); setPage(0) }}><option value="all">Onay Tarihi</option><option value="week">Son 7 gün</option><option value="month">Bu ay</option></select>
        <button className="purchase-reset" onClick={resetFilters}>Temizle</button>
        {refreshing && <small className="purchase-refreshing">Güncelleniyor…</small>}
        <button className="purchase-add-btn" onClick={() => setShowAddInvoice(true)}>+ Fatura / Harcama Ekle</button>
      </div>
      <div className="purchase-list-shell">
        {rows.length === 0 ? <div className="purchase-empty">Bu filtrelere uygun satın alma talebi bulunamadı.</div> : (
          <>
            <div className="purchase-table-wrap"><table className="purchase-table"><thead><tr><th /><th>Talep</th><th>Tedarikçi</th><th>Proje</th><th>Tür</th><th>Onaylanan Tutar</th><th>Onay Tarihi</th><th>Durum</th><th>İşlem</th></tr></thead>
              <tbody>{rows.map(request => {
                const status = requestStatus(request)
                return [
                  <tr key={request.id} className={expanded === request.id ? 'expanded' : ''} onClick={() => setExpanded(current => current === request.id ? null : request.id)}>
                    <td className="purchase-chevron">{expanded === request.id ? '⌄' : '›'}</td><td><b>{requestNo(request)}</b></td><td>{supplierName(request)}</td><td>{request.project_name || '—'}</td><td>{requestType(request)}</td><td><strong>{money(requestAmount(request))}</strong></td><td>{dateText(request.approved_at || request.updated_at || request.created_at)}</td>
                    <td><span className={`purchase-status ${status.tone}`}>{status.label}</span></td>
                    <td onClick={event => event.stopPropagation()}>{status.canInvoice ? <button className="purchase-invoice-btn" onClick={() => setInvoiceRequest(request)}>Fatura Oluştur</button> : <button className="purchase-view-btn" onClick={() => setDetailRequest(request)}>Görüntüle</button>}</td>
                  </tr>,
                  expanded === request.id && <tr className="purchase-detail-row" key={`${request.id}-detail`}><td colSpan="9"><div className="purchase-inline-detail">
                    <div><h4>Talep Özeti</h4><p><span>Talep Eden</span><b>{request.requester_name || request.requested_by_name || '—'}</b></p><p><span>Açıklama</span><b>{request.description || request.title || '—'}</b></p><button onClick={() => setDetailRequest(request)}>Talep detayını görüntüle ›</button></div>
                    <div className="purchase-items"><table><thead><tr><th>Ürün</th><th>Açıklama</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead><tbody>{(request.items || []).slice(0, 4).map((item, index) => <tr key={item.id || index}><td>{item.name}</td><td>{item.description || '—'}</td><td>{item.quantity} {item.unit || ''}</td><td>{money(item.unit_price)}</td><td>{money(item.total_price || Number(item.quantity) * Number(item.unit_price))}</td></tr>)}</tbody></table></div>
                  </div></td></tr>,
                ]
              })}</tbody>
            </table></div>
            <div className="purchase-mobile-list">{rows.map(request => {
              const status = requestStatus(request)
              return <article key={request.id}><header><b>{requestNo(request)}</b><span className={`purchase-status ${status.tone}`}>{status.label}</span></header><dl><dt>Tedarikçi</dt><dd>{supplierName(request)}</dd><dt>Proje</dt><dd>{request.project_name || '—'}</dd><dt>Tür</dt><dd>{requestType(request)}</dd><dt>Onaylanan Tutar</dt><dd>{money(requestAmount(request))}</dd><dt>Onay Tarihi</dt><dd>{dateText(request.approved_at || request.updated_at || request.created_at)}</dd></dl><button className="purchase-summary-toggle" onClick={() => setExpanded(current => current === request.id ? null : request.id)}>Talep Özeti {expanded === request.id ? '⌃' : '⌄'}</button>{expanded === request.id && <div className="purchase-mobile-summary">{request.description || request.title || 'Açıklama bulunmuyor.'}<button onClick={() => setDetailRequest(request)}>Talep detayını görüntüle ›</button></div>}{status.canInvoice ? <button className="purchase-invoice-btn full" onClick={() => setInvoiceRequest(request)}>Fatura Oluştur</button> : <button className="purchase-view-btn full" onClick={() => setDetailRequest(request)}>Görüntüle</button>}</article>
            })}</div>
            <div className="purchase-pager"><span>{filtered.length ? safePage * PAGE_SIZE + 1 : 0}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} / {filtered.length} talep</span><Pager page={safePage} totalPages={totalPages} onChange={setPage} /></div>
          </>
        )}
      </div>
      {invoiceRequest && <FaturaOlusturModal request={invoiceRequest} onClose={() => setInvoiceRequest(null)} onSaved={saved} />}
      {detailRequest && <TalepDetayModal request={detailRequest} onClose={() => setDetailRequest(null)} />}
      {showAddInvoice && <FaturaOlusturModal onClose={() => setShowAddInvoice(false)} onSaved={async () => { setShowAddInvoice(false); await Promise.all([onRefresh?.(), fetchInvoices()]) }} />}
    </div>
  )
}
