import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toUserMessage as translateError } from '../../utils/errors'

// Satın alma talebi onaylandıktan sonra muhasebenin faturayı kesmesi için kullanılır.
// invoices.purchase_request_id set edilerek kaydedilir; DB tetikleyicisi (sync_purchase_request_from_invoice)
// talebin durumunu otomatik 'fatura_onay_bekliyor' yapar ve fatura onay zincirini (Finans > Onay Kuyruğu) başlatır.
const inp = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px',
  fontSize: 14, color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}
const lbl = { fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }

function requestCategoryToInvoiceCategory(category) {
  if (category === 'hizmet') return 'hizmet'
  if (category === 'malzeme') return 'malzeme'
  return 'diger'
}

const INVOICE_ERROR_RULES = [
  { match: ['fatura eklemeye uygun değil', 'henüz proje yöneticisi tarafından'], message: 'Bu talep henüz proje yöneticisi tarafından tamamlanmadı. Fatura eklemeden önce talebin “Proje Yöneticisinde” aşamasının tamamlanması gerekiyor.' },
  { match: ['duplicate', 'unique'], message: 'Bu talep için zaten bir fatura kaydı var.' },
]

function toUserMessage(error) {
  return translateError(error, { rules: INVOICE_ERROR_RULES, fallback: err => err?.message || 'Fatura kaydedilemedi. Lütfen tekrar deneyin.' })
}

export default function FaturaOlusturModal({ request, onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [form, setForm] = useState({
    supplier_id: request.supplier_id || '',
    invoice_no: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: request.estimated_amount_excl_vat || '',
    vat_rate: String(request.estimated_vat_rate || 20),
    category: requestCategoryToInvoiceCategory(request.category),
    description: request.title || '',
  })

  useEffect(() => {
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr(null)

    const { error } = await supabase.from('invoices').insert({
      supplier_id: form.supplier_id || null,
      project_id: request.project_id,
      purchase_request_id: request.id,
      invoice_no: form.invoice_no,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      amount: parseFloat(form.amount) || 0,
      vat_rate: parseInt(form.vat_rate),
      category: form.category,
      description: form.description || null,
      status: 'bekliyor',
      source: 'satin_alma',
    })
    setSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    onSaved?.()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Fatura Oluştur</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748B' }}>{request.title || 'Satın alma talebi'} için fatura kesiliyor. Kaydedince muhasebe onay sürecine düşer.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Tedarikçi</label>
              <select style={inp} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                <option value="">Seçiniz</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Kategori</label>
              <select style={inp} value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="malzeme">Malzeme</option>
                <option value="hizmet">Hizmet</option>
                <option value="diger">Diğer</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Fatura No *</label>
            <input required style={inp} value={form.invoice_no} onChange={e => set('invoice_no', e.target.value)} placeholder="FAT-2026-001" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Fatura Tarihi *</label>
              <input required type="date" style={inp} value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Vade Tarihi</label>
              <input type="date" style={inp} value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
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

          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Açıklama</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              İptal
            </button>
            <button type="submit" disabled={saving} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Kaydediliyor…' : 'Faturayı Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
