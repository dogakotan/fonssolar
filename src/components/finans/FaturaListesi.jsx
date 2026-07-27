import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh'
import DataStatusBanner from '../ui/DataStatusBanner'
import { useAuth } from '../../context/AuthContext'
import Pager from '../ui/Pager'
import { TONE, INVOICE_STATUS } from '../ui/StatusBadge'
import FaturaFormModal from './FaturaFormModal'
import FaturaDetayModal from './FaturaDetayModal'
import { toUserMessage } from '../../utils/errors'

const formatCurrency = (amount, currency = 'TRY') =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0)

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function statusMeta(status) {
  const entry = INVOICE_STATUS[status] || { label: status || '—', tone: 'muted' }
  const tone = TONE[entry.tone] || TONE.muted
  return { bg: tone.bg, color: tone.text, label: entry.label }
}

const PAGE_SIZE = 10

const TABS = [
  { key: 'hepsi', label: 'Tümü' },
  { key: 'taslak', label: 'Taslak' },
  { key: 'yönetici_onayında', label: 'Onay Bekleyen' },
  { key: 'duzeltme_bekliyor', label: 'Düzeltme' },
  { key: 'onaylandı', label: 'Onaylanan' },
  { key: 'odeme_bekliyor', label: 'Ödeme Bekleyen' },
  { key: 'ödendi', label: 'Ödendi' },
]

const STAT_CARDS = [
  { key: 'taslak', label: 'Taslak', icon: '▤', tone: 'muted' },
  { key: 'yönetici_onayında', label: 'Yönetici Onayında', icon: '♙', tone: 'primary' },
  { key: 'duzeltme_bekliyor', label: 'Düzeltme Bekleyen', icon: '!', tone: 'danger' },
  { key: 'onaylanan', label: 'Onaylanan', icon: '✓', tone: 'success' },
]

function StatCard({ meta, data }) {
  const tone = TONE[meta.tone] || TONE.muted
  return (
    <div className="invoice-stat-card" style={{ '--invoice-tone': tone.text, '--invoice-bg': tone.bg }}>
      <span>{meta.icon}</span><div><small>{meta.label}</small><strong>{data?.count || 0}</strong><em>{formatCurrency(data?.amount)}</em></div>
    </div>
  )
}

// ── Fatura İptal Modal (onaylandı/odeme_bekliyor → reddedildi, admin) ────────
function FaturaIptalModal({ invoice, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleConfirm() {
    setSaving(true)
    setErr('')
    const { error } = await supabase.from('invoices').update({ status: 'reddedildi' }).eq('id', invoice.id)
    setSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Faturayı İptal Et</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 12px' }}>
          ⚠ {invoice.invoice_no || 'Bu fatura'} onaylanmış. İptal edilirse maliyet kaydı geri alınır ve fatura reddedildi durumuna döner.
        </p>
        {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Vazgeç
          </button>
          <button type="button" disabled={saving} onClick={handleConfirm} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Kaydediliyor…' : 'Evet, İptal Et'}
          </button>
        </div>
      </div>
    </div>
  )
}

// İşlem kolonu: statü + role göre hangi buton/metin gösterileceği.
function islemHucresi({ inv, isAdmin, isMuhasebe, canApprove, onEdit, onCancel, onOpen }) {
  if (inv.status === 'taslak' && isMuhasebe) {
    return <button onClick={() => onEdit(inv)} style={linkBtn}>Düzenle / Gönder</button>
  }
  if (inv.status === 'yönetici_onayında' && canApprove) {
    return <button onClick={() => onOpen(inv)} style={linkBtn}>İncele</button>
  }
  if (inv.status === 'duzeltme_bekliyor' && isMuhasebe) {
    return <button onClick={() => onEdit(inv)} style={linkBtn}>Düzenle</button>
  }
  if (inv.status === 'odeme_bekliyor' && isMuhasebe) {
    return <button onClick={() => onOpen(inv)} style={linkBtn}>Ödeme Gir</button>
  }
  if (isAdmin && (inv.status === 'onaylandı' || inv.status === 'odeme_bekliyor')) {
    return <button onClick={() => onCancel(inv)} style={{ ...linkBtn, color: '#DC2626' }}>İptal Et</button>
  }
  return <button onClick={() => onOpen(inv)} style={linkBtn}>Görüntüle</button>
}

const linkBtn = { background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }

// ── Ana Bileşen ───────────────────────────────────────────────────────────────
// projectId/filterDate yoksa (menü modu): tüm projelerin faturaları, Satıra
// tıklama → detay modalı. projectId doluysa (proje modu): yalnız o projenin
// faturaları (filterDate'e kadar).
export default function FaturaListesi({ projectId = null, filterDate = null, openInvoiceId, onOpenedInvoice }) {
  const { isAdmin, isMuhasebe, role } = useAuth()
  const canApprove = isAdmin || role === 'proje_yoneticisi'
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [activeTab, setActiveTab] = useState('hepsi')
  const [filterStatus, setFilterStatus] = useState('hepsi')
  const [filterCategory, setFilterCategory] = useState('hepsi')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [detayFatura, setDetayFatura] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  async function fetchInvoices() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_invoices_list', {
      p_project_id: projectId || null,
      p_filter_date: filterDate || null,
    })
    if (error || !data?.authorized) {
      console.error('invoices fetch error:', error)
      setError('Faturalar Supabase üzerinden yüklenemedi.')
    } else {
      setInvoices(data?.invoices || [])
      setError('')
    }
    setLoading(false)
  }

  // fetchInvoices yalnız proje/tarih kapsamı değişince yenilenir; render-başına
  // oluşan fonksiyon referansı dependency olursa istek döngüsü oluşur.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchInvoices() }, [projectId, filterDate])
  useRealtimeRefresh(['invoices', { table: 'invoice_approvals', filterColumn: null }, { table: 'invoice_payments', filterColumn: null }], fetchInvoices)

  // Dışarıdan (Bildirimler sayfasından) belirli bir faturaya doğrudan gitme —
  // mevcut filtrelerden/sayfalamadan bağımsız, tek faturayı id ile çekip açar.
  useEffect(() => {
    if (!openInvoiceId) return
    let alive = true
    supabase
      .from('invoices')
      .select('*, suppliers(name), projects(name), purchase_requests(title)')
      .eq('id', openInvoiceId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) setDetayFatura(data)
        onOpenedInvoice?.()
      })
    return () => { alive = false }
  }, [openInvoiceId, onOpenedInvoice])

  function selectTab(key) {
    setActiveTab(key)
    setFilterStatus(key)
    setPage(0)
  }

  const searchLower = search.trim().toLocaleLowerCase('tr-TR')
  const filtered = invoices.filter(inv => {
    if (filterStatus !== 'hepsi' && inv.status !== filterStatus) return false
    if (filterCategory !== 'hepsi' && inv.category !== filterCategory) return false
    if (searchLower) {
      const hay = `${inv.invoice_no || ''} ${inv.suppliers?.name || ''} ${inv.projects?.name || ''} ${inv.purchase_requests?.title || ''}`.toLocaleLowerCase('tr-TR')
      if (!hay.includes(searchLower)) return false
    }
    return true
  })
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const tabCounts = TABS.reduce((acc, t) => {
    acc[t.key] = t.key === 'hepsi' ? invoices.length : invoices.filter(i => i.status === t.key).length
    return acc
  }, {})

  const statData = {
    taslak: { count: invoices.filter(i => i.status === 'taslak').length, amount: invoices.filter(i => i.status === 'taslak').reduce((s, i) => s + Number(i.total_amount || 0), 0) },
    yönetici_onayında: { count: invoices.filter(i => i.status === 'yönetici_onayında').length, amount: invoices.filter(i => i.status === 'yönetici_onayında').reduce((s, i) => s + Number(i.total_amount || 0), 0) },
    duzeltme_bekliyor: { count: invoices.filter(i => i.status === 'duzeltme_bekliyor').length, amount: invoices.filter(i => i.status === 'duzeltme_bekliyor').reduce((s, i) => s + Number(i.total_amount || 0), 0) },
    onaylanan: { count: invoices.filter(i => ['onaylandı', 'odeme_bekliyor', 'kismen_odendi', 'ödendi'].includes(i.status)).length, amount: invoices.filter(i => ['onaylandı', 'odeme_bekliyor', 'kismen_odendi', 'ödendi'].includes(i.status)).reduce((s, i) => s + Number(i.total_amount || 0), 0) },
  }

  function openInvoice(inv) {
    if (inv.status === 'taslak' || inv.status === 'duzeltme_bekliyor') {
      if ((inv.status === 'taslak' && isMuhasebe) || (inv.status === 'duzeltme_bekliyor' && isMuhasebe)) {
        setEditingInvoice(inv)
        setShowForm(true)
        return
      }
    }
    setDetayFatura(inv)
  }

  return (
    <>
      <DataStatusBanner error={error} refreshing={loading && invoices.length > 0} onRetry={fetchInvoices} />
      <div className="invoice-page-heading">
        <div><span>Finans Operasyonları</span><h1>Faturalar</h1><p>Faturaları ve onay süreçlerini yönetin.</p></div>
        <button onClick={() => { setEditingInvoice(null); setShowForm(true) }}>▤ Faturalanacak Talepler</button>
      </div>
      <div className="invoice-stats-grid">
        {STAT_CARDS.map(meta => <StatCard key={meta.key} meta={meta} data={statData[meta.key]} />)}
      </div>

      <div className="invoice-tabs">
        {TABS.map(t => (
          <button key={t.key} onClick={() => selectTab(t.key)} className={activeTab === t.key ? 'active' : ''}>
            {t.label} <b>{tabCounts[t.key]}</b>
          </button>
        ))}
      </div>

      <div className="invoice-filterbar">
        <label className="invoice-search">⌕<input type="text" placeholder="Fatura no, tedarikçi veya proje ara" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setActiveTab(e.target.value); setPage(0) }}>
          <option value="hepsi">Tüm Durumlar</option>{Object.entries(INVOICE_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(0) }}>
          <option value="hepsi">Tüm Fatura Türleri</option><option value="malzeme">Malzeme</option><option value="hizmet">Hizmet</option><option value="diger">Diğer</option>
        </select>
        <button className="invoice-filter-btn">☰ Filtrele</button>
        <button className="invoice-reset-btn" onClick={() => { setSearch(''); setFilterStatus('hepsi'); setFilterCategory('hepsi'); setActiveTab('hepsi'); setPage(0) }}>Temizle</button>
      </div>

      <div className="invoice-list-shell">
        {loading ? <div className="invoice-empty">Yükleniyor…</div> : paged.length === 0 ? <div className="invoice-empty">Fatura bulunamadı.</div> : (
          <>
            <div className="invoice-table-wrap"><table className="invoice-modern-table"><thead><tr>{['Fatura', 'Tedarikçi', 'Proje', 'Fatura Tarihi', 'Vade', 'Genel Toplam', 'Onay Durumu', 'İşlem'].map(header => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>{paged.map(inv => {
                const meta = statusMeta(inv.status)
                return <tr key={inv.id} onClick={() => openInvoice(inv)}>
                  <td><b>{inv.invoice_no || '—'}</b><small>{inv.purchase_requests?.title || '—'}</small></td>
                  <td>{inv.suppliers?.name || '—'}</td><td>{inv.projects?.name || '—'}</td><td>{formatDate(inv.invoice_date)}</td><td>{formatDate(inv.due_date)}</td><td><strong>{formatCurrency(inv.total_amount, inv.currency)}</strong></td>
                  <td><span className="invoice-status-pill" style={{ color: meta.color, background: meta.bg, borderColor: meta.color }}>{meta.label}</span></td>
                  <td onClick={e => e.stopPropagation()}>{islemHucresi({ inv, isAdmin, isMuhasebe, canApprove, onEdit: i => { setEditingInvoice(i); setShowForm(true) }, onCancel: setCancelling, onOpen: setDetayFatura })}</td>
                </tr>
              })}</tbody>
            </table></div>
            <div className="invoice-mobile-list">{paged.map(inv => {
              const meta = statusMeta(inv.status)
              return <article key={inv.id}><header><div><b>{inv.invoice_no || '—'}</b><small>{inv.purchase_requests?.title || '—'}</small></div><span className="invoice-status-pill" style={{ color: meta.color, background: meta.bg, borderColor: meta.color }}>{meta.label}</span></header><p>{inv.suppliers?.name || '—'}</p><p>{inv.projects?.name || '—'}</p><div><span>{formatDate(inv.invoice_date)}</span><span>{formatDate(inv.due_date)}</span><strong>{formatCurrency(inv.total_amount, inv.currency)}</strong></div><footer onClick={e => e.stopPropagation()}>{islemHucresi({ inv, isAdmin, isMuhasebe, canApprove, onEdit: i => { setEditingInvoice(i); setShowForm(true) }, onCancel: setCancelling, onOpen: setDetayFatura })}</footer></article>
            })}</div>
            <div className="invoice-pager"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} / {filtered.length} fatura</span><Pager page={page} totalPages={totalPages} onChange={setPage} /></div>
          </>
        )}
      </div>

      {showForm && (
        <FaturaFormModal
          invoice={editingInvoice}
          onClose={() => { setShowForm(false); setEditingInvoice(null) }}
          onSaved={fetchInvoices}
          defaultProjectId={projectId}
        />
      )}
      {detayFatura && (
        <FaturaDetayModal
          invoice={detayFatura}
          onClose={() => setDetayFatura(null)}
          onChanged={fetchInvoices}
        />
      )}
      {cancelling && (
        <FaturaIptalModal invoice={cancelling} onClose={() => setCancelling(null)} onSaved={fetchInvoices} />
      )}
    </>
  )
}
