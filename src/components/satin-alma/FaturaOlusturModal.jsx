import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { toUserMessage as translateError } from '../../utils/errors'
import { fetchDoviz } from '../../utils/exchangeRates'

const INVOICE_ERROR_RULES = [
  { match: ['fatura eklemeye uygun değil', 'faturasız kapatmaya uygun değil', 'henüz proje yöneticisi tarafından'], message: 'Bu talep henüz kapatmaya uygun değil.' },
  { match: ['duplicate', 'unique'], message: 'Bu talep veya fatura numarası için zaten bir kayıt var.' },
]
const DOCUMENT_TYPES = [['belgesiz', 'Belge yok / sonra eklenecek'], ['fis', 'Fiş'], ['makbuz', 'Makbuz'], ['sozlesme', 'Sözleşme'], ['dekont', 'Dekont'], ['diger', 'Diğer']]
const money = (value, currency = 'TRY') => new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0)
const requestNo = request => request.request_no || request.code || `SAT-${new Date(request.created_at || Date.now()).getFullYear()}-${String(request.id || '').replaceAll('-', '').slice(-4).toUpperCase()}`
const categoryLabel = category => category === 'hizmet' ? 'Hizmet' : category === 'malzeme' ? 'Malzeme' : 'Diğer'
const errorText = error => translateError(error, { rules: INVOICE_ERROR_RULES, fallback: err => err?.message || 'Kayıt oluşturulamadı.' })

const modeToggleBtn = active => ({
  flex: 1, padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border-md)',
  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
  color: active ? '#fff' : 'var(--color-text-sub)',
})

export default function FaturaOlusturModal({ request, onClose, onSaved }) {
  const { user } = useAuth()
  const [mode, setMode] = useState('faturali') // 'faturali' | 'faturasiz'
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
    currency: 'TRY',
    category: ['malzeme', 'hizmet', 'diger'].includes(request.category) ? request.category : 'diger',
    description: request.title || '',
    document_type: 'belgesiz',
    requires_payment_tracking: true,
  })
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  useEffect(() => {
    supabase.from('suppliers').select('id, name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [])
  useEffect(() => {
    let alive = true
    fetchDoviz().then(kurData => { if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date }) })
    return () => { alive = false }
  }, [])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const selectedSupplier = suppliers.find(supplier => supplier.id === form.supplier_id)
  const amount = Number(form.amount) || 0
  // Faturasız kapatmada KDV kırılımı yok (financial_transactions'ta vat_rate kolonu yok) —
  // amount ödenen/ödenecek tam tutar sayılır. Para birimi de bilinçli olarak TRY'ye kilitli:
  // satın alma talebinin kendi tahmini (approvedTotal) her zaman TRY, karşılaştırmanın
  // anlamlı kalması için bu kapatma yolu da TRY'de tutuluyor.
  const vat = mode === 'faturali' ? amount * (Number(form.vat_rate) || 0) / 100 : 0
  const total = mode === 'faturali' ? amount + vat : amount
  const currency = mode === 'faturali' ? form.currency : 'TRY'
  const exchangeRate = currency === 'TRY' ? 1 : currency === 'USD' ? doviz.usd : doviz.eur
  const rateReady = exchangeRate != null
  const totalTry = rateReady ? total * exchangeRate : null
  const approvedTotal = Number(request.estimated_amount_incl_vat) || 0
  const amountMatches = !approvedTotal || (totalTry != null && Math.abs(totalTry - approvedTotal) < 0.02)
  const canSaveFaturali = form.invoice_no.trim() && form.invoice_date && form.due_date && amount > 0 && form.supplier_id && rateReady
  const canSaveFaturasiz = form.invoice_date && amount > 0 && form.supplier_id && form.description.trim()
  const canSave = mode === 'faturali' ? canSaveFaturali : canSaveFaturasiz
  const checks = useMemo(() => [
    ['Tedarikçi eşleşti', selectedSupplier?.name || 'Tedarikçi seçilmedi', !!selectedSupplier],
    ['Proje eşleşti', request.project_name || request.project_id || '—', !!request.project_id],
    ['Genel toplam talep sınırında', `${money(total, currency)}${currency !== 'TRY' && totalTry != null ? ` (~${money(totalTry)})` : ''} ${approvedTotal ? `≤ ${money(approvedTotal)}` : ''}`, !approvedTotal || (totalTry != null && totalTry <= approvedTotal)],
    mode === 'faturali'
      ? ['Fatura numarası hazır', form.invoice_no || 'Numara girilmedi', !!form.invoice_no.trim()]
      : ['Açıklama girildi', form.description || 'Açıklama girilmedi', !!form.description.trim()],
  ], [selectedSupplier, request.project_name, request.project_id, total, totalTry, approvedTotal, form.invoice_no, form.description, currency, mode])

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
      currency: form.currency,
      exchange_rate: exchangeRate || 1,
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

  // Faturasız kapatma: financial_transactions'a talep bağlantısıyla (purchase_request_id)
  // insert edilir — DB tetikleyicisi (trg_financial_transaction_sync_purchase_request)
  // talebi doğrudan faturasi_kesildi'ye taşır (invoices'ın aksine burada yönetici onay
  // adımı yok, muhasebe zaten direkt giriyor). Ödeme girişi normal Ödeme Takibi akışından
  // devam eder.
  async function insertFinancialTransaction() {
    const transactionNo = `FIN-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const { data, error } = await supabase.from('financial_transactions').insert({
      transaction_no: transactionNo,
      transaction_type: 'diger',
      supplier_id: form.supplier_id,
      project_id: request.project_id,
      purchase_request_id: request.id,
      transaction_date: form.invoice_date,
      due_date: form.due_date || null,
      amount,
      currency: 'TRY',
      description: form.description.trim(),
      document_type: form.document_type,
      created_by: user?.id || null,
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

  async function handleSaveFaturasiz() {
    if (!canSave) return
    setSaving('faturasiz'); setErr('')
    try {
      await insertFinancialTransaction()
      await onSaved?.()
      onClose()
    } catch (error) {
      setErr(errorText(error))
    } finally {
      setSaving(null)
    }
  }

  const stepLabels = mode === 'faturali'
    ? ['Talep Bilgileri', 'Fatura Bilgileri', 'Fatura Kalemleri', 'Kontrol ve Gönder']
    : ['Talep Bilgileri', 'Ödeme Bilgileri', 'Kontrol ve Gönder']

  return (
    <div className="invoice-wizard-backdrop">
      <div className="invoice-wizard">
        <header className="invoice-wizard-header">
          <div><p>Finans / Faturalar / {mode === 'faturali' ? 'Yeni Fatura' : 'Faturasız Kapatma'}</p><h2>{mode === 'faturali' ? 'Yeni Fatura' : 'Faturasız Kapatma'}</h2><span>{requestNo(request)} numaralı talep için {mode === 'faturali' ? 'fatura oluşturun' : 'faturasız kayıt oluşturun'}.</span></div>
          <button onClick={onClose} aria-label="Kapat">×</button>
        </header>
        <div className="invoice-wizard-steps">
          {stepLabels.map((label, index) => <div key={label} className={index === 0 ? 'done' : index === 1 ? 'active' : ''}><i>{index === 0 ? '✓' : index + 1}</i><span>{label}</span></div>)}
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
              <h3>Kayıt Türü</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={modeToggleBtn(mode === 'faturali')} onClick={() => setMode('faturali')}>Faturalı</button>
                <button type="button" style={modeToggleBtn(mode === 'faturasiz')} onClick={() => setMode('faturasiz')}>Faturasız</button>
              </div>
              {mode === 'faturasiz' && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>
                  Tedarikçiden resmi fatura alınmadı — bu tutar doğrudan gider (faturasız ödeme) olarak kaydedilir ve talep kapatılır.
                </p>
              )}
            </section>
            <section className="invoice-wizard-card">
              <h3>{mode === 'faturali' ? 'Fatura Bilgileri' : 'Ödeme Bilgileri'}</h3>
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
                {mode === 'faturali' && (
                  <label>Fatura No *<input value={form.invoice_no} onChange={event => set('invoice_no', event.target.value)} placeholder="FTR-2026-0001" /></label>
                )}
                <label>{mode === 'faturali' ? 'Fatura Tarihi *' : 'İşlem Tarihi *'}<input type="date" value={form.invoice_date} onChange={event => set('invoice_date', event.target.value)} /></label>
                <label>Vade Tarihi{mode === 'faturali' ? ' *' : ''}<input type="date" value={form.due_date} onChange={event => set('due_date', event.target.value)} /></label>
                {mode === 'faturali' ? (
                  <label>Para Birimi *
                    <select value={form.currency} onChange={event => set('currency', event.target.value)}>
                      <option value="TRY">TRY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    {form.currency !== 'TRY' && (
                      <small style={{ display: 'block', marginTop: 4, fontSize: '10px', color: 'var(--color-muted)' }}>
                        {rateReady ? `1 ${form.currency} = ${money(exchangeRate)} (TCMB, ${doviz.date || '—'})` : 'Kur yükleniyor…'}
                      </small>
                    )}
                  </label>
                ) : (
                  <label>Belge Türü *<select value={form.document_type} onChange={event => set('document_type', event.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                )}
                {mode === 'faturali' && (
                  <>
                    <label>Fatura Türü *<select><option>Satın Alma</option></select></label>
                    <label>Gider Türü *<select value={form.category} onChange={event => set('category', event.target.value)}><option value="malzeme">Malzeme</option><option value="hizmet">Hizmet</option><option value="diger">Diğer</option></select></label>
                  </>
                )}
                <label className="wide">Açıklama{mode === 'faturasiz' ? ' *' : ''}<input value={form.description} onChange={event => set('description', event.target.value)} /></label>
                {mode === 'faturali' && (
                  <label className="wide checkbox"><input type="checkbox" checked={form.requires_payment_tracking} onChange={event => set('requires_payment_tracking', event.target.checked)} /> Bu fatura ödeme takibine dahil edilsin</label>
                )}
              </div>
            </section>
            <section className="invoice-wizard-card">
              <h3>Tutar Bilgileri</h3>
              <div className="invoice-amount-grid">
                <label>{mode === 'faturali' ? 'KDV Hariç Tutar *' : 'Tutar *'}<input type="number" min="0" step="0.01" value={form.amount} onChange={event => set('amount', event.target.value)} /></label>
                {mode === 'faturali' && (
                  <>
                    <label>KDV Oranı *<select value={form.vat_rate} onChange={event => set('vat_rate', event.target.value)}><option value="8">%8</option><option value="10">%10</option><option value="18">%18</option><option value="20">%20</option></select></label>
                    <label>KDV Tutarı<input readOnly value={money(vat, form.currency)} /></label>
                    <label>Genel Toplam<input readOnly value={money(total, form.currency)} /></label>
                  </>
                )}
              </div>
              {mode === 'faturali' && currency !== 'TRY' && (
                <p className="invoice-amount-check" style={{ color: 'var(--color-muted)' }}>
                  {rateReady ? `≈ ${money(totalTry)} (günün kuruyla)` : 'Kur yükleniyor…'}
                </p>
              )}
              <p className={`invoice-amount-check ${amountMatches ? 'ok' : 'warn'}`}>{amountMatches ? '✓ Onaylanan talep tutarı ile uyumlu' : `! Talep toplamı ${money(approvedTotal)}, kayıt toplamı ${money(total, currency)}`}</p>
            </section>
          </main>
          <aside>
            <section className="invoice-wizard-card invoice-checks"><h3>Otomatik Kontroller</h3>{checks.map(([title, detail, ok]) => <div key={title}><i className={ok ? 'ok' : 'wait'}>{ok ? '✓' : '!'}</i><p><b>{title}</b><span>{detail}</span></p></div>)}</section>
            <section className="invoice-wizard-card invoice-save-state"><h3>Kaydetme Durumu</h3><b>{mode === 'faturali' ? 'Taslak' : 'Doğrudan Kayıt'}</b><p>{mode === 'faturali' ? 'Henüz yöneticiye gönderilmedi.' : 'Onay adımı yok — kaydedilince talep kapanır.'}</p></section>
          </aside>
        </div>
        {err && <p className="invoice-wizard-error">{err}</p>}
        <footer className="invoice-wizard-footer">
          <button className="cancel" onClick={onClose}>İptal</button><span />
          {mode === 'faturali' ? (
            <>
              <button className="draft" disabled={!canSave || !!saving} onClick={handleDraft}>{saving === 'draft' ? 'Kaydediliyor…' : 'Taslak Kaydet'}</button>
              <button className="continue" disabled={!canSave || !!saving} onClick={handleSubmit}>{saving === 'submit' ? 'Gönderiliyor…' : 'Devam Et'}</button>
            </>
          ) : (
            <button className="continue" disabled={!canSave || !!saving} onClick={handleSaveFaturasiz}>{saving === 'faturasiz' ? 'Kaydediliyor…' : 'Kaydet ve Talebi Kapat'}</button>
          )}
        </footer>
      </div>
    </div>
  )
}
