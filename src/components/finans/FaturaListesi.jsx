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
      // DB constraint (invoices_source_check) yalnızca 'manuel' (TR) kabul ediyor — İngilizce
      // 'manual' hep constraint ihlaliyle patlıyordu, bu buton hiç çalışmamış olmalıydı.
      source:       'manuel',
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
              <option value="diger">Diğer</option>
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

// Onay Kuyruğu'ndaki ActionButtons ile aynı desen (Onayla düz, Reddet önce not alanı açar) —
// burada tablo satırı/detay modalı içinde kompakt kullanım için ayrı tutuldu.
function OnaylaReddetButtons({ onAction, busy }) {
  const [showReject, setShowReject] = useState(false)
  const [note, setNote] = useState('')

  if (showReject) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
        <input
          type="text"
          placeholder="Red gerekçesi (opsiyonel)"
          value={note}
          onChange={e => setNote(e.target.value)}
          onClick={e => e.stopPropagation()}
          style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 140, flexShrink: 0 }}
        />
        <button
          onClick={e => { e.stopPropagation(); onAction('reddedildi', note); setShowReject(false); setNote('') }}
          disabled={busy}
          style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {busy ? '…' : 'Reddi Onayla'}
        </button>
        <button
          onClick={e => { e.stopPropagation(); setShowReject(false); setNote('') }}
          style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          İptal
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
      <button
        onClick={e => { e.stopPropagation(); onAction('onaylandı') }}
        disabled={busy}
        style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {busy ? '…' : 'Onayla'}
      </button>
      <button
        onClick={e => { e.stopPropagation(); setShowReject(true) }}
        disabled={busy}
        style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        Reddet
      </button>
    </div>
  )
}

// ── Fatura Detay Modal (menü modu: onay zinciri + içinden iptal) ─────────────
function FaturaDetayModal({ invoice, onClose, onCancelled, onApproved }) {
  const { isAdmin, isMuhasebe, user } = useAuth()
  const [approvals, setApprovals] = useState([])
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelErr, setCancelErr] = useState('')
  const [approveSaving, setApproveSaving] = useState(false)
  const [approveErr, setApproveErr] = useState('')
  const [editingRejected, setEditingRejected] = useState(false)
  const [rejectedBusy, setRejectedBusy] = useState(false)
  const [rejectedErr, setRejectedErr] = useState('')
  const [editForm, setEditForm] = useState({
    invoice_no: invoice?.invoice_no || '',
    invoice_date: invoice?.invoice_date || '',
    due_date: invoice?.due_date || '',
    amount: invoice?.amount ?? '',
    vat_rate: String(invoice?.vat_rate ?? 20),
    category: invoice?.category || 'malzeme',
    description: invoice?.description || '',
  })

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
  // paylaşıyor. İkisini ayırt etmek için: TÜM onay adımları "onaylandı" olarak kapanmışsa fatura
  // sonradan iptal edilmiş demektir (normal red akışında en az bir adım hiç tamamlanmadan reddedilir).
  // Adım sayısı sabit değil (2026-07-20'den önce oluşturulmuş faturalarda 2 adım, sonrasında 1 adım
  // "Yönetici Onayı") — bu yüzden step===2 gibi sabit bir adım numarasına bakılmıyor.
  const cancelledAfterApproval = invoice.status === 'reddedildi' && approvals.length > 0 && approvals.every(a => a.status === 'onaylandı')
  const st = cancelledAfterApproval
    ? { bg: '#FEF3C7', color: '#92400E', label: 'İptal Edildi (Onay Sonrası)' }
    : STATUS_BADGE[invoice.status] || { bg: '#F3F4F6', color: '#111827', label: invoice.status }
  // Onaylanmış fatura bu ekrandan geri alınmaz; red kararı yalnızca yönetici onay
  // aşamasında verilir. Böylece kesinleşmiş maliyet kaydı istemeden silinmez.
  const canCancel = false
  const canRecoverRejected = (isAdmin || isMuhasebe) && invoice.status === 'reddedildi'
  // Onay Kuyruğu'ndaki mantıkla birebir aynı: yalnızca yönetici_onayında + isAdmin.
  // Adım numarası sabit değil (bkz. yukarıdaki not) — hedef her zaman o an bekleyen satır.
  const canApproveHere = isAdmin && invoice.status === 'yönetici_onayında'

  async function handleCancel() {
    setCancelSaving(true)
    setCancelErr('')
    const { error } = await supabase.from('invoices').update({ status: 'reddedildi' }).eq('id', invoice.id)
    setCancelSaving(false)
    if (error) { setCancelErr(error.message || 'İptal edilemedi.'); return }
    onCancelled?.()
    onClose()
  }

  // invoices.status güncellemesi tamamen fn_invoice_approval_cascade trigger'ına bırakılır —
  // OnayKuyrugu.jsx'teki handleAction ile birebir aynı desen.
  async function handleApprove(action, note) {
    setApproveSaving(true)
    setApproveErr('')
    const { error } = await supabase
      .from('invoice_approvals')
      .update({ status: action, note: note || null, reviewed_at: new Date().toISOString(), reviewer_id: user.id })
      .eq('invoice_id', invoice.id)
      .eq('status', 'bekliyor')
    setApproveSaving(false)
    if (error) { setApproveErr(error.message || 'İşlem başarısız.'); return }
    onApproved?.()
    onClose()
  }

  async function handleResubmitRejected(event) {
    event.preventDefault()
    setRejectedBusy(true)
    setRejectedErr('')
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        invoice_no: editForm.invoice_no.trim(),
        invoice_date: editForm.invoice_date,
        due_date: editForm.due_date || null,
        amount: Number(editForm.amount) || 0,
        vat_rate: Number(editForm.vat_rate) || 0,
        category: editForm.category,
        description: editForm.description.trim() || null,
      })
      .eq('id', invoice.id)
      .eq('status', 'reddedildi')

    if (updateError) {
      setRejectedBusy(false)
      setRejectedErr(updateError.message || 'Fatura güncellenemedi.')
      return
    }

    const { error: submitError } = await supabase.rpc('resubmit_rejected_invoice', { p_invoice_id: invoice.id })
    setRejectedBusy(false)
    if (submitError) {
      setRejectedErr(submitError.message || 'Fatura yeniden gönderilemedi.')
      return
    }
    onApproved?.()
    onClose()
  }

  async function handleDeleteRejected() {
    if (!window.confirm('Reddedilen fatura kalıcı olarak silinsin mi? Satın alma talebi tekrar fatura bekleyen aşamaya döner.')) return
    setRejectedBusy(true)
    setRejectedErr('')
    const { error } = await supabase.rpc('delete_rejected_invoice', { p_invoice_id: invoice.id })
    setRejectedBusy(false)
    if (error) {
      setRejectedErr(error.message || 'Fatura silinemedi.')
      return
    }
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

        {canApproveHere && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
            {approveErr && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 10 }}>{approveErr}</p>}
            <OnaylaReddetButtons onAction={handleApprove} busy={approveSaving} />
          </div>
        )}

        {canRecoverRejected && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
            {rejectedErr && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 10 }}>{rejectedErr}</p>}
            {!editingRejected ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditingRejected(true)} style={{ background: '#185FA5', color: '#fff', border: 0, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Düzenle ve Yeniden Gönder
                </button>
                <button onClick={handleDeleteRejected} disabled={rejectedBusy} style={{ background: '#FEF2F2', color: '#DC2626', border: 0, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Faturayı Sil
                </button>
              </div>
            ) : (
              <form onSubmit={handleResubmitRejected} style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input required value={editForm.invoice_no} onChange={e => setEditForm(f => ({ ...f, invoice_no: e.target.value }))} placeholder="Fatura no" style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit' }} />
                  <input required type="date" value={editForm.invoice_date} onChange={e => setEditForm(f => ({ ...f, invoice_date: e.target.value }))} style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit' }} />
                  <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit' }} />
                  <input required type="number" min="0" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} placeholder="KDV hariç tutar" style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit' }} />
                  <select value={editForm.vat_rate} onChange={e => setEditForm(f => ({ ...f, vat_rate: e.target.value }))} style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit' }}>
                    <option value="8">%8 KDV</option><option value="10">%10 KDV</option><option value="18">%18 KDV</option><option value="20">%20 KDV</option>
                  </select>
                  <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit' }}>
                    <option value="malzeme">Malzeme</option><option value="hizmet">Hizmet</option><option value="diger">Diğer</option>
                  </select>
                </div>
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Açıklama" style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 10px', minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" onClick={() => setEditingRejected(false)} style={{ background: '#fff', color: '#64748B', border: '1px solid #D1D5DB', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>Vazgeç</button>
                  <button type="submit" disabled={rejectedBusy} style={{ background: '#185FA5', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: rejectedBusy ? .7 : 1 }}>{rejectedBusy ? 'Gönderiliyor…' : 'Kaydet ve Onaya Gönder'}</button>
                </div>
              </form>
            )}
          </div>
        )}

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
// Satıra tıklama → tüm fatura bilgileri ve onay zinciri modalı. projectId doluysa
// (proje modu): yalnız o projenin faturaları (filterDate'e kadar), kilitli proje seçici.
export default function FaturaListesi({ projectId = null, filterDate = null, openInvoiceId, onOpenedInvoice }) {
  const { isAdmin, isMuhasebe, user } = useAuth()
  const [invoices,     setInvoices]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [page,         setPage]         = useState(0)
  const [filterStatus, setFilterStatus] = useState('hepsi')
  const [showAdd,      setShowAdd]      = useState(false)
  const [detayFatura,  setDetayFatura]  = useState(null)
  const [cancelling,   setCancelling]   = useState(null)
  const [approvingId,  setApprovingId]  = useState(null)

  async function fetchInvoices() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_invoices_list', {
      p_project_id: projectId || null,
      p_filter_date: filterDate || null,
    })
    if (error || !data?.authorized) console.error('invoices fetch error:', error)
    setInvoices(data?.invoices || [])
    setLoading(false)
  }

  // Onay Kuyruğu'ndaki handleAction ile birebir aynı desen — kullanıcı Onayla/Reddet
  // aksiyonunu doğrudan Faturalar listesinden de yapabilsin istedi (ayrı Onay Kuyruğu
  // sekmesine gitmeye gerek kalmadan, "sırası bana gelmiş" satırı gördüğü yerden).
  async function handleApprove(invoiceId, action, note) {
    setApprovingId(invoiceId)
    await supabase
      .from('invoice_approvals')
      .update({ status: action, note: note || null, reviewed_at: new Date().toISOString(), reviewer_id: user.id })
      .eq('invoice_id', invoiceId)
      .eq('status', 'bekliyor')
    setApprovingId(null)
    fetchInvoices()
  }

  useEffect(() => { fetchInvoices() }, [projectId, filterDate])

  // Dışarıdan (Bildirimler sayfasından) belirli bir faturaya doğrudan gitme —
  // mevcut filtrelerden/sayfalamadan bağımsız, tek faturayı id ile çekip açar
  // (TicketListesi'nin openTicketId deseniyle aynı).
  useEffect(() => {
    if (!openInvoiceId) return
    let alive = true
    supabase
      .from('invoices')
      .select('*, suppliers(name)')
      .eq('id', openInvoiceId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) setDetayFatura(data)
        onOpenedInvoice?.()
      })
    return () => { alive = false }
  }, [openInvoiceId])

  const filtered   = filterStatus === 'hepsi' ? invoices : invoices.filter(i => i.status === filterStatus)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Fatura yazma yetkisi yalnızca admin/muhasebe'de (RLS'in de zaten tek izin verdiği roller) —
  // proje_yoneticisi (ve Finans'a erişebilen diğer "kısıtsız" roller) Finans'ı salt-okunur görür.
  const canAct = isAdmin || isMuhasebe
  const TH = projectId
    ? ['FATURA NO', 'TEDARİKÇİ', 'KATEGORİ', 'FATURA TARİHİ', 'VADE TARİHİ', "TUTAR (KDV'SİZ)", "TOPLAM (KDV'Lİ)", 'DURUM', ...(canAct ? ['İŞLEMLER'] : [])]
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
            {canAct && (
              <button
                onClick={() => setShowAdd(true)}
                style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
              >
                + Fatura Ekle
              </button>
            )}
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
                    <tr
                      key={inv.id}
                      onClick={() => setDetayFatura(inv)}
                      style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
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
                        canAct && (
                          <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                            {inv.status === 'onaylandı' ? (
                              <button
                                onClick={() => setCancelling(inv)}
                                style={{ background: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                              >
                                İptal Et
                              </button>
                            ) : isAdmin && inv.status === 'yönetici_onayında' ? (
                              <OnaylaReddetButtons
                                onAction={(action, note) => handleApprove(inv.id, action, note)}
                                busy={approvingId === inv.id}
                              />
                            ) : '—'}
                          </td>
                        )
                      ) : (
                        <td style={{ padding: '14px 16px' }}>
                          <button
                            onClick={e => { e.stopPropagation(); setDetayFatura(inv) }}
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
      {detayFatura && (
        <FaturaDetayModal
          invoice={detayFatura}
          onClose={() => setDetayFatura(null)}
          onCancelled={fetchInvoices}
          onApproved={fetchInvoices}
        />
      )}
      {cancelling && (
        <FaturaIptalModal invoice={cancelling} onClose={() => setCancelling(null)} onSaved={fetchInvoices} />
      )}
    </>
  )
}
