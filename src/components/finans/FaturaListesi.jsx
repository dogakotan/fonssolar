import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getProjects } from '../../api'
import { useAuth } from '../../context/AuthContext'

const formatCurrency = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const STATUS_BADGE = {
  bekliyor:           { bg: '#FEF3C7', color: '#92400E', label: 'Bekliyor' },
  muhasebe_onayında:  { bg: '#EFF6FF', color: '#185FA5', label: 'Muhasebe Onayında' },
  yönetici_onayında:  { bg: '#F5F3FF', color: '#5B21B6', label: 'Yönetici Onayında' },
  onaylandı:          { bg: '#D1FAE5', color: '#065F46', label: 'Onaylandı' },
  reddedildi:         { bg: '#FEE2E2', color: '#991B1B', label: 'Reddedildi' },
}

const PAGE_SIZE = 10

// ── Fatura Ekle Modal ─────────────────────────────────────────────────────────
function FaturaEkleModal({ onClose, onSaved, defaultProjectId }) {
  const [form, setForm] = useState({
    supplier_id: '', project_id: defaultProjectId || '', invoice_no: '', invoice_date: '',
    due_date: '', amount: '', vat_rate: '20', category: 'malzeme', description: '',
  })
  const [suppliers, setSuppliers] = useState([])
  const [projects,  setProjects]  = useState([])
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('id, name').order('name'),
      getProjects(),
    ]).then(([sRes, pRes]) => {
      setSuppliers(sRes.data || [])
      setProjects(pRes.data || [])
    })
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('invoices').insert({
      supplier_id:  form.supplier_id  || null,
      project_id:   form.project_id   || null,
      invoice_no:   form.invoice_no,
      invoice_date: form.invoice_date,
      due_date:     form.due_date     || null,
      amount:       parseFloat(form.amount) || 0,
      vat_rate:     parseInt(form.vat_rate),
      category:     form.category,
      description:  form.description  || null,
      status:       'bekliyor',
      source:       'manual',
    }).select().single()
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
    onClose()
  }

  const inp = {
    width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px',
    fontSize: 14, color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  }
  const lbl = { fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>Yeni Fatura Ekle</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Tedarikçi</label>
              <select style={inp} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                <option value="">Seçiniz</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Proje</label>
              <select style={inp} value={form.project_id} onChange={e => set('project_id', e.target.value)} disabled={!!defaultProjectId}>
                <option value="">Seçiniz</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Fatura No *</label>
            <input required style={inp} value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} placeholder="FAT-2026-001" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Fatura Tarihi *</label>
              <input required type="date" style={inp} value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Vade Tarihi</label>
              <input type="date" style={inp} value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Tutar — KDV Hariç (₺) *</label>
              <input required type="number" style={inp} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" min="0" step="0.01" />
            </div>
            <div>
              <label style={lbl}>KDV Oranı</label>
              <select style={inp} value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)}>
                <option value="8">%8</option>
                <option value="10">%10</option>
                <option value="18">%18</option>
                <option value="20">%20</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Kategori</label>
            <select style={inp} value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="malzeme">Malzeme</option>
              <option value="hizmet">Hizmet</option>
              <option value="nakliye">Nakliye</option>
              <option value="ekipman">Ekipman</option>
              <option value="diğer">Diğer</option>
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Açıklama</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 72 }} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              İptal
            </button>
            <button type="submit" disabled={saving} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Fatura Detay Modal (menü modu: onay zinciri + içinden iptal) ─────────────
function FaturaDetayModal({ invoice, onClose, onCancelled }) {
  const { isAdmin, isMuhasebe } = useAuth()
  const [approvals, setApprovals] = useState([])
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelErr, setCancelErr] = useState('')

  useEffect(() => {
    if (!invoice) return
    supabase
      .from('invoice_approvals')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('step')
      .then(({ data }) => setApprovals(data || []))
  }, [invoice?.id])

  if (!invoice) return null

  // fn_validate_invoice_status_transition artık onaylandı->reddedildi geçişine de izin veriyor —
  // hem "onay sürecinde reddedildi" hem "onaylandıktan sonra iptal edildi" aynı DB durumunu (reddedildi)
  // paylaşıyor. İkisini ayırt etmek için: step 2 onayı gerçekten "onaylandı" olarak kapanmışsa,
  // fatura sonradan iptal edilmiş demektir (normal red akışında step onayı hiç tamamlanmaz).
  const cancelledAfterApproval = invoice.status === 'reddedildi' && approvals.some(a => a.step === 2 && a.status === 'onaylandı')
  const st = cancelledAfterApproval
    ? { bg: '#FEF3C7', color: '#92400E', label: 'İptal Edildi (Onay Sonrası)' }
    : STATUS_BADGE[invoice.status] || { bg: '#F3F4F6', color: '#111827', label: invoice.status }
  const canCancel = (isAdmin || isMuhasebe) && invoice.status === 'onaylandı'

  async function handleCancel() {
    setCancelSaving(true)
    setCancelErr('')
    const { error } = await supabase.from('invoices').update({ status: 'reddedildi' }).eq('id', invoice.id)
    setCancelSaving(false)
    if (error) { setCancelErr(error.message || 'İptal edilemedi.'); return }
    onCancelled?.()
    onClose()
  }

  const STEP_STYLE = {
    onaylandı:  { bg: '#D1FAE5', color: '#065F46', icon: '✓' },
    reddedildi: { bg: '#FEE2E2', color: '#991B1B', icon: '✕' },
    bekliyor:   { bg: '#F3F4F6', color: '#9CA3AF', icon: '⏳' },
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 620, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>{invoice.invoice_no || '—'}</h3>
            <span style={{ background: st.bg, color: st.color, fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>{st.label}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            ['Tedarikçi',    invoice.suppliers?.name || '—'],
            ['Kategori',     invoice.category || '—'],
            ['Fatura Tarihi', formatDate(invoice.invoice_date)],
            ['Vade Tarihi',  formatDate(invoice.due_date)],
            ['KDV Hariç',    formatCurrency(invoice.amount)],
            ['KDV Oranı',    `%${invoice.vat_rate || 0}`],
            ['KDV Tutarı',   formatCurrency(invoice.vat_amount)],
            ['Toplam',       formatCurrency(invoice.total_amount)],
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#F8F9FA', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 500, textTransform: 'uppercase', margin: '0 0 3px', letterSpacing: '0.3px' }}>{k}</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>{v}</p>
            </div>
          ))}
        </div>

        {invoice.description && (
          <div style={{ background: '#F8F9FA', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 500, textTransform: 'uppercase', margin: '0 0 4px' }}>Açıklama</p>
            <p style={{ fontSize: 14, color: '#111827', margin: 0 }}>{invoice.description}</p>
          </div>
        )}

        {/* Onay zinciri */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Onay Zinciri</p>
          {approvals.length === 0 ? (
            <p style={{ color: '#6B7280', fontSize: 13 }}>Onay kaydı bulunamadı.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {approvals.map((a, i) => {
                const sc = STEP_STYLE[a.status] || STEP_STYLE.bekliyor
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', background: sc.bg, color: sc.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 700, margin: '0 auto 4px',
                      }}>{sc.icon}</div>
                      <p style={{ fontSize: 11, color: '#6B7280', margin: 0, fontWeight: 500, maxWidth: 80, textAlign: 'center' }}>
                        {a.step_label || `Adım ${a.step}`}
                      </p>
                      {a.reviewed_at && (
                        <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{formatDate(a.reviewed_at)}</p>
                      )}
                    </div>
                    {i < approvals.length - 1 && (
                      <div style={{ width: 36, height: 2, background: '#E5E7EB', flexShrink: 0 }} />
                    )}
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 2, background: '#E5E7EB' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#E5E7EB' }} />
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Tamamlandı</p>
              </div>
            </div>
          )}
        </div>

        {canCancel && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{ background: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Faturayı İptal Et
              </button>
            ) : (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 12px' }}>
                  ⚠ Bu fatura zaten onaylanmış. İptal edilirse ilgili maliyet kaydı silinir ve bağlı satın alma talebi tekrar "Onaylandı" durumuna döner, yeniden fatura kesilebilir.
                </p>
                {cancelErr && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 10 }}>{cancelErr}</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Vazgeç
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelSaving}
                    style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: cancelSaving ? 0.7 : 1 }}
                  >
                    {cancelSaving ? 'İptal ediliyor…' : 'Evet, İptal Et'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Fatura İptal Modal (proje modu: sade onay adımlı iptal) ──────────────────
function FaturaIptalModal({ invoice, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleConfirm() {
    setSaving(true)
    setErr('')
    const { error } = await supabase.from('invoices').update({ status: 'reddedildi' }).eq('id', invoice.id)
    setSaving(false)
    if (error) { setErr(error.message || 'İptal edilemedi.'); return }
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
          ⚠ {invoice.invoice_no || 'Bu fatura'} zaten onaylanmış. İptal edilirse ilgili maliyet kaydı silinir ve bağlı satın alma talebi tekrar "Onaylandı" durumuna döner, yeniden fatura kesilebilir.
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

// ── Ana Bileşen ───────────────────────────────────────────────────────────────
// projectId/filterDate yoksa (menü modu): tüm projelerin faturaları, serbest proje seçici,
// "Detay" → onay zinciri modalı. projectId doluysa (proje modu): yalnız o projenin faturaları
// (filterDate'e kadar), kilitli proje seçici, admin/muhasebe için doğrudan "İptal Et".
export default function FaturaListesi({ projectId = null, filterDate = null }) {
  const { isAdmin, isMuhasebe } = useAuth()
  const [invoices,     setInvoices]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [page,         setPage]         = useState(0)
  const [filterStatus, setFilterStatus] = useState('hepsi')
  const [showAdd,      setShowAdd]      = useState(false)
  const [detayFatura,  setDetayFatura]  = useState(null)
  const [cancelling,   setCancelling]   = useState(null)

  async function fetchInvoices() {
    setLoading(true)
    let query = supabase.from('invoices').select('*, suppliers(name)')
    if (projectId) {
      query = query
        .eq('project_id', projectId)
        .lte('invoice_date', filterDate || new Date().toISOString().split('T')[0])
    }
    const { data, error } = await query.order('invoice_date', { ascending: false })
    if (error) console.error('invoices fetch error:', error)
    setInvoices(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchInvoices() }, [projectId, filterDate])

  const filtered   = filterStatus === 'hepsi' ? invoices : invoices.filter(i => i.status === filterStatus)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const canCancel = isAdmin || isMuhasebe
  const TH = projectId
    ? ['FATURA NO', 'TEDARİKÇİ', 'KATEGORİ', 'FATURA TARİHİ', 'VADE TARİHİ', "TUTAR (KDV'SİZ)", "TOPLAM (KDV'Lİ)", 'DURUM', ...(canCancel ? ['İŞLEMLER'] : [])]
    : ['FATURA NO', 'TEDARİKÇİ', 'KATEGORİ', 'FATURA TARİHİ', 'VADE TARİHİ', "TUTAR (KDV'SİZ)", "TOPLAM (KDV'Lİ)", 'DURUM', 'İŞLEMLER']

  return (
    <>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {/* Başlık */}
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Faturalar</h3>
            <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 12 }}>
              {invoices.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
              style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <option value="hepsi">Tüm Durumlar</option>
              <option value="bekliyor">Bekliyor</option>
              <option value="muhasebe_onayında">Muhasebe Onayında</option>
              <option value="yönetici_onayında">Yönetici Onayında</option>
              <option value="onaylandı">Onaylandı</option>
              <option value="reddedildi">Reddedildi</option>
            </select>
            <button
              onClick={() => setShowAdd(true)}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              + Fatura Ekle
            </button>
          </div>
        </div>

        {/* Tablo */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <p style={{ color: '#6B7280', fontSize: 14 }}>Yükleniyor…</p>
          </div>
        ) : paged.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
            Fatura bulunamadı.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: projectId ? 860 : 960 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                  {TH.map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(inv => {
                  const b = STATUS_BADGE[inv.status] || { bg: '#F3F4F6', color: '#111827', label: inv.status }
                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827', fontWeight: 500 }}>{inv.invoice_no || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827' }}>{inv.suppliers?.name || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280', textTransform: 'capitalize' }}>{inv.category || '—'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280' }}>{formatDate(inv.invoice_date)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#6B7280' }}>{formatDate(inv.due_date)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#111827' }}>{formatCurrency(inv.amount)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 14, color: '#111827', fontWeight: 600 }}>{formatCurrency(inv.total_amount)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ background: b.bg, color: b.color, fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20 }}>{b.label}</span>
                      </td>
                      {projectId ? (
                        canCancel && (
                          <td style={{ padding: '14px 16px' }}>
                            {inv.status === 'onaylandı' ? (
                              <button
                                onClick={() => setCancelling(inv)}
                                style={{ background: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                              >
                                İptal Et
                              </button>
                            ) : '—'}
                          </td>
                        )
                      ) : (
                        <td style={{ padding: '14px 16px' }}>
                          <button
                            onClick={() => setDetayFatura(inv)}
                            style={{ background: 'transparent', color: '#185FA5', border: '1px solid #185FA5', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                          >
                            Detay
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '12px 24px', borderTop: '1px solid #E5E7EB' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#D1D5DB' : '#6B7280', fontFamily: 'inherit' }}
            >
              ‹ Önceki
            </button>
            <span style={{ fontSize: 13, color: '#6B7280' }}>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? '#D1D5DB' : '#6B7280', fontFamily: 'inherit' }}
            >
              Sonraki ›
            </button>
          </div>
        )}
      </div>

      {showAdd && <FaturaEkleModal onClose={() => setShowAdd(false)} onSaved={fetchInvoices} defaultProjectId={projectId} />}
      {projectId
        ? cancelling && <FaturaIptalModal invoice={cancelling} onClose={() => setCancelling(null)} onSaved={fetchInvoices} />
        : detayFatura && <FaturaDetayModal invoice={detayFatura} onClose={() => setDetayFatura(null)} onCancelled={fetchInvoices} />}
    </>
  )
}
