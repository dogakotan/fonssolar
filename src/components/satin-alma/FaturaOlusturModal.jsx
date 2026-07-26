import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { toUserMessage as translateError } from '../../utils/errors'

const INVOICE_ERROR_RULES = [
  { match: ['fatura eklemeye uygun değil', 'henüz proje yöneticisi tarafından'], message: 'Bu talep henüz fatura eklemeye uygun değil.' },
  { match: ['duplicate', 'unique'], message: 'Bu talep veya fatura numarası için zaten bir kayıt var.' },
]
const money = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(Number(value) || 0)
const requestNo = request => request.request_no || request.code || `SAT-${new Date(request.created_at || Date.now()).getFullYear()}-${String(request.id || '').replaceAll('-', '').slice(-4).toUpperCase()}`
const categoryLabel = category => category === 'hizmet' ? 'Hizmet' : category === 'malzeme' ? 'Malzeme' : 'Diğer'
const errorText = error => translateError(error, { rules: INVOICE_ERROR_RULES, fallback: err => err?.message || 'Fatura kaydedilemedi.' })

export default function FaturaOlusturModal({ request, onClose, onSaved }) {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [saving, setSaving] = useState(null)
  const [err, setErr] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [supplierSaving, setSupplierSaving] = useState(false)
  const [form, setForm] = useState({
    supplier_id: request.supplier_id || '',
    invoice_no: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    amount: request.estimated_amount_excl_vat || '',
    vat_rate: String(request.estimated_vat_rate || 20),
    category: ['malzeme', 'hizmet', 'diger'].includes(request.category) ? request.category : 'diger',
    description: request.title || '',
    requires_payment_tracking: true,
  })

  useEffect(() => {
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const selectedSupplier = suppliers.find(supplier => supplier.id === form.supplier_id)
  const amount = Number(form.amount) || 0
  const vat = amount * (Number(form.vat_rate) || 0) / 100
  const total = amount + vat
  const approvedTotal = Number(request.estimated_amount_incl_vat) || 0
  const amountMatches = !approvedTotal || Math.abs(total - approvedTotal) < 0.02
  const canSave = form.invoice_no.trim() && form.invoice_date && form.due_date && amount > 0 && form.supplier_id
  const checks = useMemo(() => [
    ['Tedarikçi eşleşti', selectedSupplier?.name || 'Tedarikçi seçilmedi', !!selectedSupplier],
    ['Proje eşleşti', request.project_name || request.project_id || '—', !!request.project_id],
    ['Genel toplam talep sınırında', `${money(total)} ${approvedTotal ? `≤ ${money(approvedTotal)}` : ''}`, !approvedTotal || total <= approvedTotal],
    ['Fatura numarası hazır', form.invoice_no || 'Numara girilmedi', !!form.invoice_no.trim()],
  ], [selectedSupplier, request.project_name, request.project_id, total, approvedTotal, form.invoice_no])

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    setSupplierSaving(true)
    const { data, error } = await supabase.from('suppliers').insert({ name: newSupplierName.trim() }).select().single()
    setSupplierSaving(false)
    if (error) { setErr(errorText(error)); return }
    setSuppliers(current => [...current, data].sort((a, b) => a.name.localeCompare(b.name, 'tr')))
    set('supplier_id', data.id)
    setAddingSupplier(false)
    setNewSupplierName('')
  }

  async function insertInvoice() {
    const { data, error } = await supabase.from('invoices').insert({
      supplier_id: form.supplier_id,
      project_id: request.project_id,
      purchase_request_id: request.id,
      invoice_no: form.invoice_no.trim(),
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      amount,
      vat_rate: Number(form.vat_rate),
      category: form.category,
      description: form.description.trim() || null,
      status: 'taslak',
      source: 'satin_alma',
      created_by: user?.id || null,
      requires_payment_tracking: form.requires_payment_tracking,
    }).select().single()
    if (error) throw error
    return data
  }

  async function handleDraft() {
    if (!canSave) return
    setSaving('draft'); setErr('')
    try {
      await insertInvoice()
      await onSaved?.()
      onClose()
    } catch (error) {
      setErr(errorText(error))
    } finally {
      setSaving(null)
    }
  }

  async function handleSubmit() {
    if (!canSave) return
    setSaving('submit'); setErr('')
    try {
      const invoice = await insertInvoice()
      const { error } = await supabase.from('invoice_approvals').insert({
        invoice_id: invoice.id, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
      })
      if (error) throw error
      await onSaved?.()
      onClose()
    } catch (error) {
      setErr(errorText(error))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="invoice-wizard-backdrop">
      <div className="invoice-wizard">
        <header className="invoice-wizard-header">
          <div><p>Finans / Faturalar / Yeni Fatura</p><h2>Yeni Fatura</h2><span>{requestNo(request)} numaralı talep için fatura oluşturun.</span></div>
          <button onClick={onClose} aria-label="Kapat">×</button>
        </header>
        <div className="invoice-wizard-steps">
          {['Talep Bilgileri', 'Fatura Bilgileri', 'Fatura Kalemleri', 'Kontrol ve Gönder'].map((label, index) => <div key={label} className={index === 0 ? 'done' : index === 1 ? 'active' : ''}><i>{index === 0 ? '✓' : index + 1}</i><span>{label}</span></div>)}
        </div>
        <div className="invoice-wizard-content">
          <main>
            <section className="invoice-wizard-card linked">
              <header><div><h3>Bağlı Satın Alma Talebi <small>▣</small></h3><p>Bilgiler talep üzerinden getirilmiştir ve değiştirilemez.</p></div></header>
              <div className="invoice-request-grid">
                <div><small>Talep No</small><b className="blue">{requestNo(request)}</b></div>
                <div><small>Proje</small><b>{request.project_name || request.project_id || '—'}</b></div>
                <div><small>Tedarikçi</small><b>{selectedSupplier?.name || request.supplier_name || '—'}</b></div>
                <div><small>Onaylanan Tutar</small><b>{money(approvedTotal)}</b></div>
                <div><small>Tür</small><b>{categoryLabel(request.category)}</b></div>
              </div>
            </section>
            <section className="invoice-wizard-card">
              <h3>Fatura Bilgileri</h3>
              <div className="invoice-form-grid">
                <label className="wide">
                  Tedarikçi *
                  {!addingSupplier ? (
                    <select value={form.supplier_id} onChange={event => set('supplier_id', event.target.value)}>
                      <option value="">Seçiniz</option>
                      {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        autoFocus style={{ flex: 1, border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '7px 8px', fontSize: '10.5px', fontFamily: 'inherit', color: 'var(--color-text)', background: 'var(--color-surface)' }}
                        placeholder="Tedarikçi adı" value={newSupplierName} onChange={event => setNewSupplierName(event.target.value)}
                      />
                      <button type="button" onClick={handleAddSupplier} disabled={supplierSaving || !newSupplierName.trim()} style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '0 12px', fontSize: '10.5px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {supplierSaving ? '…' : 'Ekle'}
                      </button>
                      <button type="button" onClick={() => { setAddingSupplier(false); setNewSupplierName('') }} style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '0 10px', fontSize: '10.5px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Vazgeç
                      </button>
                    </div>
                  )}
                </label>
                {!addingSupplier && (
                  <button type="button" onClick={() => setAddingSupplier(true)} style={{ gridColumn: 'span 2', justifySelf: 'start', alignSelf: 'end', marginBottom: 6, background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    + Yeni tedarikçi
                  </button>
                )}
                <label>Fatura No *<input value={form.invoice_no} onChange={event => set('invoice_no', event.target.value)} placeholder="FTR-2026-0001" /></label>
                <label>Fatura Tarihi *<input type="date" value={form.invoice_date} onChange={event => set('invoice_date', event.target.value)} /></label>
                <label>Vade Tarihi *<input type="date" value={form.due_date} onChange={event => set('due_date', event.target.value)} /></label>
                <label>Para Birimi *<select disabled><option>TRY</option></select></label>
                <label>Fatura Türü *<select><option>Satın Alma</option></select></label>
                <label>Gider Türü *<select value={form.category} onChange={event => set('category', event.target.value)}><option value="malzeme">Malzeme</option><option value="hizmet">Hizmet</option><option value="diger">Diğer</option></select></label>
                <label className="wide">Açıklama<input value={form.description} onChange={event => set('description', event.target.value)} /></label>
                <label className="wide checkbox"><input type="checkbox" checked={form.requires_payment_tracking} onChange={event => set('requires_payment_tracking', event.target.checked)} /> Bu fatura ödeme takibine dahil edilsin</label>
              </div>
            </section>
            <section className="invoice-wizard-card">
              <h3>Tutar Bilgileri</h3>
              <div className="invoice-amount-grid">
                <label>KDV Hariç Tutar *<input type="number" min="0" step="0.01" value={form.amount} onChange={event => set('amount', event.target.value)} /></label>
                <label>KDV Oranı *<select value={form.vat_rate} onChange={event => set('vat_rate', event.target.value)}><option value="8">%8</option><option value="10">%10</option><option value="18">%18</option><option value="20">%20</option></select></label>
                <label>KDV Tutarı<input readOnly value={money(vat)} /></label>
                <label>Genel Toplam<input readOnly value={money(total)} /></label>
              </div>
              <p className={`invoice-amount-check ${amountMatches ? 'ok' : 'warn'}`}>{amountMatches ? '✓ Onaylanan talep tutarı ile uyumlu' : `! Talep toplamı ${money(approvedTotal)}, fatura toplamı ${money(total)}`}</p>
            </section>
          </main>
          <aside>
            <section className="invoice-wizard-card invoice-checks"><h3>Otomatik Kontroller</h3>{checks.map(([title, detail, ok]) => <div key={title}><i className={ok ? 'ok' : 'wait'}>{ok ? '✓' : '!'}</i><p><b>{title}</b><span>{detail}</span></p></div>)}</section>
            <section className="invoice-wizard-card invoice-save-state"><h3>Kaydetme Durumu</h3><b>Taslak</b><p>Henüz yöneticiye gönderilmedi.</p></section>
          </aside>
        </div>
        {err && <p className="invoice-wizard-error">{err}</p>}
        <footer className="invoice-wizard-footer">
          <button className="cancel" onClick={onClose}>İptal</button><span />
          <button className="draft" disabled={!canSave || !!saving} onClick={handleDraft}>{saving === 'draft' ? 'Kaydediliyor…' : 'Taslak Kaydet'}</button>
          <button className="continue" disabled={!canSave || !!saving} onClick={handleSubmit}>{saving === 'submit' ? 'Gönderiliyor…' : 'Devam Et'}</button>
        </footer>
      </div>
    </div>
  )
}
