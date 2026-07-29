import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getProjects } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { toUserMessage } from '../../utils/errors'
import { fetchDoviz } from '../../utils/exchangeRates'

const money = (value, currency = 'TRY') => new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0)

const inp = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px',
  fontSize: 14, color: '#111827', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}
const lbl = { fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }

function toFormState(invoice, defaultProjectId) {
  return {
    supplier_id: invoice?.supplier_id || '',
    project_id: invoice?.project_id || defaultProjectId || '',
    purchase_request_id: invoice?.purchase_request_id || '',
    invoice_no: invoice?.invoice_no || '',
    invoice_date: invoice?.invoice_date || '',
    due_date: invoice?.due_date || '',
    amount: invoice?.amount ?? '',
    vat_rate: String(invoice?.vat_rate ?? 20),
    currency: invoice?.currency || 'TRY',
    category: invoice?.category || 'malzeme',
    description: invoice?.description || '',
    requiresPaymentTracking: invoice ? !!invoice.requires_payment_tracking : true,
  }
}

// Yeni fatura oluşturma VE taslak/düzeltme_bekliyor bir faturayı düzenleme tek
// bileşende. "Taslak Kaydet" yalnızca invoices'a yazar (invoice_approvals'a hiç
// dokunmaz); "Onaya Gönder"/"Tekrar Gönder" ayrıca invoice_approvals'a doğru
// satırı INSERT/UPDATE ederek trg_invoice_approval_submitted/cascade'i tetikler
// — invoices.status'u burada elle set etmiyoruz (bkz. CLAUDE.md "Trigger
// zincirleri").
export default function FaturaFormModal({ invoice = null, onClose, onSaved, defaultProjectId }) {
  const { user } = useAuth()
  const [form, setForm] = useState(toFormState(invoice, defaultProjectId))
  const [suppliers, setSuppliers] = useState([])
  const [projects, setProjects] = useState([])
  const [purchaseRequests, setPurchaseRequests] = useState([])
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [supplierSaving, setSupplierSaving] = useState(false)
  const [saving, setSaving] = useState(null) // null | 'taslak' | 'gonder'
  const [err, setErr] = useState(null)
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('id, name').order('name'),
      getProjects(),
    ]).then(([sRes, pRes]) => {
      setSuppliers(sRes.data || [])
      setProjects(pRes.data || [])
    })
  }, [])

  useEffect(() => {
    let alive = true
    fetchDoviz().then(kurData => { if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date }) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!form.project_id) { setPurchaseRequests([]); return }
    supabase
      .from('purchase_requests')
      .select('id, title')
      .eq('project_id', form.project_id)
      .eq('status', 'satin_alindi')
      .then(({ data }) => setPurchaseRequests(data || []))
  }, [form.project_id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const isDuzeltme = invoice?.status === 'duzeltme_bekliyor'
  const exchangeRate = form.currency === 'TRY' ? 1 : form.currency === 'USD' ? doviz.usd : doviz.eur
  const rateReady = exchangeRate != null
  const canSubmit = form.invoice_no.trim() && form.invoice_date && form.amount !== '' && form.amount !== null && rateReady

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    setSupplierSaving(true)
    const { data, error } = await supabase.from('suppliers').insert({ name: newSupplierName.trim() }).select().single()
    setSupplierSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    setSuppliers(s => [...s, data].sort((a, b) => a.name.localeCompare(b.name, 'tr')))
    set('supplier_id', data.id)
    setAddingSupplier(false)
    setNewSupplierName('')
  }

  function buildPayload() {
    return {
      supplier_id: form.supplier_id || null,
      project_id: form.project_id || null,
      purchase_request_id: form.purchase_request_id || null,
      invoice_no: form.invoice_no.trim(),
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      amount: parseFloat(form.amount) || 0,
      vat_rate: parseInt(form.vat_rate, 10),
      currency: form.currency,
      exchange_rate: exchangeRate || 1,
      category: form.category,
      description: form.description.trim() || null,
      requires_payment_tracking: form.requiresPaymentTracking,
    }
  }

  async function upsertInvoice(extraOnInsert) {
    if (invoice?.id) {
      const { error } = await supabase.from('invoices').update(buildPayload()).eq('id', invoice.id)
      if (error) throw error
      return invoice.id
    }
    const { data, error } = await supabase.from('invoices').insert({
      ...buildPayload(),
      status: 'taslak',
      source: form.purchase_request_id ? 'satin_alma' : 'manuel',
      created_by: user?.id || null,
      ...extraOnInsert,
    }).select().single()
    if (error) throw error
    return data.id
  }

  async function handleTaslakKaydet(e) {
    e.preventDefault()
    setSaving('taslak')
    setErr(null)
    try {
      await upsertInvoice()
      onSaved()
      onClose()
    } catch (error) {
      setErr(toUserMessage(error))
    } finally {
      setSaving(null)
    }
  }

  async function handleOnayaGonder(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving('gonder')
    setErr(null)
    try {
      const invoiceId = await upsertInvoice()

      const { data: existingApproval } = await supabase
        .from('invoice_approvals')
        .select('id, status')
        .eq('invoice_id', invoiceId)
        .eq('step', 1)
        .eq('step_label', 'Yönetici Onayı')
        .maybeSingle()

      if (!existingApproval) {
        const { error } = await supabase.from('invoice_approvals').insert({
          invoice_id: invoiceId, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
        })
        if (error) throw error
      } else if (existingApproval.status === 'duzeltme_istendi') {
        const { error } = await supabase.from('invoice_approvals')
          .update({ status: 'bekliyor', note: null })
          .eq('id', existingApproval.id)
        if (error) throw error
      }
      // existingApproval.status === 'bekliyor' → zaten gönderilmiş, tekrar dokunma.

      onSaved()
      onClose()
    } catch (error) {
      setErr(toUserMessage(error))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>
            {invoice ? 'Faturayı Düzenle' : 'Yeni Fatura'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <form>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Tedarikçi</label>
              {!addingSupplier ? (
                <>
                  <select style={inp} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                    <option value="">Seçiniz</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setAddingSupplier(true)} style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>
                    + Yeni tedarikçi
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    autoFocus style={{ ...inp, flex: 1 }} placeholder="Tedarikçi adı"
                    value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)}
                  />
                  <button type="button" onClick={handleAddSupplier} disabled={supplierSaving || !newSupplierName.trim()}
                    style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '0 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {supplierSaving ? '…' : 'Ekle'}
                  </button>
                  <button type="button" onClick={() => { setAddingSupplier(false); setNewSupplierName('') }}
                    style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '0 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Vazgeç
                  </button>
                </div>
              )}
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
            <label style={lbl}>Bağlı Satın Alma Talebi (opsiyonel)</label>
            <select style={inp} value={form.purchase_request_id} onChange={e => set('purchase_request_id', e.target.value)} disabled={!form.project_id}>
              <option value="">Yok</option>
              {purchaseRequests.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
            </select>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Tutar — KDV Hariç *</label>
              <input required type="number" style={inp} value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" min="0" step="0.01" />
            </div>
            <div>
              <label style={lbl}>Para Birimi *</label>
              <select style={inp} value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              {form.currency !== 'TRY' && (
                <small style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#6B7280' }}>
                  {rateReady ? `1 ${form.currency} = ${money(exchangeRate)} (TCMB, ${doviz.date || '—'})` : 'Kur yükleniyor…'}
                </small>
              )}
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
            <label style={lbl}>Fatura Türü</label>
            <select style={inp} value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="malzeme">Malzeme</option>
              <option value="hizmet">Hizmet</option>
              <option value="diger">Diğer</option>
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Açıklama</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 72 }} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 14px', marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#111827' }}>
              <input
                type="checkbox"
                checked={form.requiresPaymentTracking}
                onChange={e => set('requiresPaymentTracking', e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Bu fatura için ödeme takibi yapılsın mı?
            </label>
            {!form.requiresPaymentTracking && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 6, padding: '7px 10px' }}>
                Bu fatura onaylandığında doğrudan kapanacak, ayrıca ödeme girişi istenmeyecek.
                Peşin ödenmiş veya ödeme takibi gerektirmeyen faturalar için kullanın.
              </p>
            )}
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              İptal
            </button>
            <button type="button" onClick={handleTaslakKaydet} disabled={!!saving || !rateReady} style={{ background: '#fff', color: '#185FA5', border: '1px solid #185FA5', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || !rateReady) ? 0.7 : 1 }}>
              {saving === 'taslak' ? 'Kaydediliyor…' : isDuzeltme ? 'Kaydet (Göndermeden)' : 'Taslak Kaydet'}
            </button>
            <button type="button" onClick={handleOnayaGonder} disabled={!!saving || !canSubmit} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (saving || !canSubmit) ? 0.6 : 1 }}>
              {saving === 'gonder' ? 'Gönderiliyor…' : isDuzeltme ? 'Tekrar Gönder' : 'Onaya Gönder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
