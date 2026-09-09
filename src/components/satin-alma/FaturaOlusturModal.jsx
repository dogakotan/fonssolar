import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getProjects } from '../../api'
import { toUserMessage as translateError } from '../../utils/errors'
import { fetchDoviz } from '../../utils/exchangeRates'
import { requestNo } from '../../utils/purchaseRequestNo'

const INVOICE_ERROR_RULES = [
  { match: ['fatura eklemeye uygun değil', 'faturasız kapatmaya uygun değil', 'henüz proje yöneticisi tarafından'], message: 'Bu talep henüz kapatmaya uygun değil.' },
  { match: ['duplicate', 'unique'], message: 'Bu talep veya fatura numarası için zaten bir kayıt var.' },
]
const DOCUMENT_TYPES = [['belgesiz', 'Belge yok / sonra eklenecek'], ['fis', 'Fiş'], ['makbuz', 'Makbuz'], ['sozlesme', 'Sözleşme'], ['dekont', 'Dekont'], ['diger', 'Diğer']]
const money = (value, currency = 'TRY') => new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0)
const categoryLabel = category => category === 'hizmet' ? 'Hizmet' : category === 'malzeme' ? 'Malzeme' : 'Diğer'
const errorText = error => translateError(error, { rules: INVOICE_ERROR_RULES, fallback: err => err?.message || 'Kayıt oluşturulamadı.' })

const modeToggleBtn = active => ({
  padding: '7px 16px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border-md)',
  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
  color: active ? '#fff' : 'var(--color-text-sub)',
})

// request verilirse (satın alma listesindeki "Fatura Oluştur" satırı): proje/talep
// sabit, değiştirilemez — eskisi gibi. request verilmezse ("+ Fatura / Harcama Ekle"
// genel giriş noktaları — Satın Alma/Faturalar/Ödemeler sayfalarındaki üst buton):
// proje ve bağlı satın alma talebi (opsiyonel) burada seçilir; talep seçilince
// aynı sabit kartın bilgileri o talepten türetilir.
export default function FaturaOlusturModal({ request = null, defaultProjectId = '', onClose, onSaved }) {
  const { user } = useAuth()
  const isLocked = !!request
  const [mode, setMode] = useState('faturali') // 'faturali' | 'faturasiz'
  // PV Solution — GES projeleriyle ilişkisi olmayan genel harcamalar için
  // (09.09.2026, kullanıcı isteği). Talep bağlantılı (isLocked) akış her
  // zaman bir GES projesine bağlı olduğundan hep 'fons_solar' — seçici
  // yalnızca genel giriş noktalarında (isLocked=false) gösterilir.
  const [company, setCompany] = useState('fons_solar') // 'fons_solar' | 'pv_solution'
  const [suppliers, setSuppliers] = useState([])
  const [projects, setProjects] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [manualProjectId, setManualProjectId] = useState(defaultProjectId)
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [requestSearch, setRequestSearch] = useState('')
  const [showRequestDropdown, setShowRequestDropdown] = useState(false)
  const [saving, setSaving] = useState(null)
  const [err, setErr] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [supplierSaving, setSupplierSaving] = useState(false)
  const [form, setForm] = useState({
    supplier_id: request?.supplier_id || '',
    beneficiary_name: '',
    invoice_no: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    amount: request?.estimated_amount_excl_vat || '',
    vat_rate: String(request?.estimated_vat_rate || 20),
    currency: 'TRY',
    category: ['malzeme', 'hizmet', 'diger'].includes(request?.category) ? request.category : 'diger',
    description: request?.title || '',
    document_type: 'belgesiz',
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
  useEffect(() => {
    if (isLocked) return
    getProjects().then(({ data }) => setProjects(data || []))
    supabase
      .from('purchase_requests')
      .select('id, request_no, title, project_id, supplier_id, category, estimated_amount_excl_vat, estimated_vat_rate, estimated_amount_incl_vat, created_at, projects(name), suppliers(name)')
      .eq('status', 'satin_alindi')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPendingRequests(data || []))
  }, [isLocked])

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  // Genel giriş noktasında talep seçilince form o talebin tahmini bilgileriyle
  // dolar — locked moddaki useState başlangıç değerleriyle aynı mantık.
  function selectRequest(id) {
    setSelectedRequestId(id)
    const picked = pendingRequests.find(r => r.id === id)
    if (!picked) return
    setManualProjectId(picked.project_id)
    setForm(current => ({
      ...current,
      supplier_id: picked.supplier_id || current.supplier_id,
      amount: picked.estimated_amount_excl_vat || current.amount,
      vat_rate: String(picked.estimated_vat_rate || current.vat_rate),
      category: ['malzeme', 'hizmet', 'diger'].includes(picked.category) ? picked.category : current.category,
      description: current.description || picked.title,
    }))
  }

  const linkedRequest = isLocked
    ? request
    : (() => {
        const picked = pendingRequests.find(r => r.id === selectedRequestId)
        return picked ? { ...picked, project_name: picked.projects?.name, supplier_name: picked.suppliers?.name } : null
      })()
  // PV Solution seçiliyken (yalnızca genel giriş noktalarında mümkün, isLocked
  // akışı her zaman Fons Solar) proje/talep alanı hiç gösterilmez — bir GES
  // projesine bağlanamaz.
  const isPvSolution = !isLocked && company === 'pv_solution'
  const effectiveProjectId = isPvSolution ? '' : (linkedRequest?.project_id || manualProjectId)
  const selectableRequests = manualProjectId ? pendingRequests.filter(r => r.project_id === manualProjectId) : pendingRequests
  const filteredRequests = (() => {
    const query = requestSearch.trim().toLocaleLowerCase('tr-TR')
    if (!query) return selectableRequests
    return selectableRequests.filter(pr => `${pr.title} ${pr.projects?.name || ''}`.toLocaleLowerCase('tr-TR').includes(query))
  })()

  const selectedSupplier = suppliers.find(supplier => supplier.id === form.supplier_id)
  const amount = Number(form.amount) || 0
  // Faturasız kapatmada KDV kırılımı yok (financial_transactions'ta vat_rate kolonu yok) —
  // amount ödenen/ödenecek tam tutar sayılır. Bir talebe bağlıyken para birimi bilinçli
  // olarak TRY'ye kilitli (talebin approvedTotal karşılaştırması her zaman TRY); bağlı
  // talep yokken (genel harcama) muhasebe kendi para birimini seçebilir.
  const vat = mode === 'faturali' ? amount * (Number(form.vat_rate) || 0) / 100 : 0
  const total = mode === 'faturali' ? amount + vat : amount
  const currency = mode === 'faturali' ? form.currency : (linkedRequest ? 'TRY' : form.currency)
  const exchangeRate = currency === 'TRY' ? 1 : currency === 'USD' ? doviz.usd : doviz.eur
  const rateReady = exchangeRate != null
  const totalTry = rateReady ? total * exchangeRate : null
  const approvedTotal = Number(linkedRequest?.estimated_amount_incl_vat) || 0
  const canSaveFaturali = form.invoice_no.trim() && form.invoice_date && amount > 0 && form.supplier_id && (isPvSolution || !!effectiveProjectId) && rateReady
  const canSaveFaturasiz = form.invoice_date && amount > 0 && (form.supplier_id || form.beneficiary_name.trim()) && form.description.trim() && (isPvSolution || !!effectiveProjectId)
  const canSave = mode === 'faturali' ? canSaveFaturali : canSaveFaturasiz
  // Vade tarihi girilirse fatura ödeme takibine alınır; girilmezse onaylandığında
  // doğrudan kapanır (peşin/hemen ödenmiş faturalar için) — ayrı bir manuel
  // seçenek yerine tek bir alandan türetiliyor.
  const requiresPaymentTracking = !!form.due_date

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
      company,
      project_id: effectiveProjectId || null,
      purchase_request_id: linkedRequest?.id || null,
      invoice_no: form.invoice_no.trim(),
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      amount,
      vat_rate: Number(form.vat_rate),
      currency: form.currency,
      exchange_rate: exchangeRate || 1,
      category: form.category,
      description: form.description.trim() || null,
      status: 'taslak',
      source: linkedRequest ? 'satin_alma' : 'manuel',
      created_by: user?.id || null,
      requires_payment_tracking: requiresPaymentTracking,
    }).select().single()
    if (error) throw error
    return data
  }

  // Faturasız kapatma: financial_transactions'a bağlı talep varsa purchase_request_id
  // ile insert edilir — DB tetikleyicisi (trg_financial_transaction_sync_purchase_request)
  // talebi doğrudan faturasi_kesildi'ye taşır (invoices'ın aksine burada yönetici onay
  // adımı yok, muhasebe zaten direkt giriyor). Bağlı talep yoksa (genel harcama) talep
  // bağlantısı olmadan, projeye maliyet olarak yansıyacak şekilde kaydedilir. Ödeme
  // girişi normal Ödeme Takibi akışından devam eder.
  async function insertFinancialTransaction() {
    const transactionNo = `FIN-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const { data, error } = await supabase.from('financial_transactions').insert({
      transaction_no: transactionNo,
      transaction_type: 'diger',
      supplier_id: form.supplier_id || null,
      beneficiary_name: form.supplier_id ? null : form.beneficiary_name.trim(),
      company,
      project_id: effectiveProjectId || null,
      purchase_request_id: linkedRequest?.id || null,
      transaction_date: form.invoice_date,
      due_date: form.due_date || null,
      amount,
      currency,
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

  return (
    <div className="invoice-wizard-backdrop">
      <div className="invoice-wizard">
        <header className="invoice-wizard-header">
          <div>
            <p>Finans / Faturalar / {mode === 'faturali' ? 'Yeni Fatura' : 'Faturasız Kapatma'}</p>
            <h2>{mode === 'faturali' ? 'Yeni Fatura' : 'Faturasız Harcama'}</h2>
          </div>
          <button onClick={onClose} aria-label="Kapat">×</button>
        </header>
        <div className="invoice-wizard-content">
          <main>
            {!isLocked && (
              <section className="invoice-wizard-card linked">
                <header><div><h3>Şirket <small>▣</small></h3></div></header>
                <div className="invoice-mode-toggle">
                  <button type="button" style={modeToggleBtn(company === 'fons_solar')} onClick={() => setCompany('fons_solar')}>Fons Solar</button>
                  <button type="button" style={modeToggleBtn(company === 'pv_solution')} onClick={() => { setCompany('pv_solution'); setManualProjectId(''); setSelectedRequestId(''); setRequestSearch('') }}>PV Solution</button>
                </div>
                {isPvSolution && (
                  <small style={{ display: 'block', marginTop: 10, color: 'var(--color-muted)', fontSize: 11 }}>
                    PV Solution kayıtları herhangi bir GES projesine bağlanmaz.
                  </small>
                )}
              </section>
            )}
            {isLocked ? (
              <section className="invoice-wizard-card linked">
                <header><div><h3>Bağlı Satın Alma Talebi <small>▣</small></h3></div></header>
                <div className="invoice-request-grid">
                  <div><small>Talep No</small><b className="blue">{requestNo(request)}</b></div>
                  <div><small>Proje</small><b>{request.project_name || request.project_id || '—'}</b></div>
                  <div><small>Tedarikçi</small><b>{selectedSupplier?.name || request.supplier_name || '—'}</b></div>
                  <div><small>Onaylanan Tutar</small><b>{money(approvedTotal)}</b></div>
                  <div><small>Tür</small><b>{categoryLabel(request.category)}</b></div>
                </div>
                <div className="purchase-inline-detail invoice-request-summary">
                  <div><h4>Talep Özeti</h4><p><span>Talep Eden</span><b>{request.requester_name || request.requested_by_name || '—'}</b></p><p><span>Açıklama</span><b>{request.description || request.title || '—'}</b></p></div>
                  <div className="purchase-items"><table><thead><tr><th>Ürün</th><th>Açıklama</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead><tbody>{(request.items || []).slice(0, 4).map((item, index) => <tr key={item.id || index}><td>{item.name}</td><td>{item.description || '—'}</td><td>{item.quantity} {item.unit || ''}</td><td>{money(item.unit_price)}</td><td>{money(item.total_price || Number(item.quantity) * Number(item.unit_price))}</td></tr>)}</tbody></table></div>
                </div>
              </section>
            ) : !isPvSolution && (
              <section className="invoice-wizard-card linked">
                <header><div><h3>Proje ve Bağlı Talep <small>▣</small></h3></div></header>
                <div className="invoice-form-grid two-col">
                  <label>Proje {!linkedRequest && '*'}
                    <select value={effectiveProjectId} disabled={!!linkedRequest} onChange={event => setManualProjectId(event.target.value)}>
                      <option value="">Seçiniz</option>
                      {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  </label>
                  <label className="request-search-wrap">Bağlı Satın Alma Talebi (opsiyonel)
                    <input
                      type="text"
                      placeholder="Talep ara (başlık, proje)…"
                      value={linkedRequest ? `${linkedRequest.title} — ${linkedRequest.project_name || '—'}` : requestSearch}
                      onChange={event => { setRequestSearch(event.target.value); setSelectedRequestId(''); setShowRequestDropdown(true) }}
                      onFocus={() => setShowRequestDropdown(true)}
                      onBlur={() => setTimeout(() => setShowRequestDropdown(false), 150)}
                    />
                    {linkedRequest && (
                      <button type="button" className="request-search-clear" onClick={() => { setSelectedRequestId(''); setRequestSearch('') }}>×</button>
                    )}
                    {showRequestDropdown && !linkedRequest && (
                      <div className="request-search-dropdown">
                        <div className="request-search-option muted" onClick={() => { setSelectedRequestId(''); setRequestSearch(''); setShowRequestDropdown(false) }}>Yok — genel harcama</div>
                        {filteredRequests.length === 0 ? (
                          <div className="request-search-empty">Eşleşen talep yok</div>
                        ) : filteredRequests.map(pr => (
                          <div key={pr.id} className="request-search-option" onClick={() => { selectRequest(pr.id); setRequestSearch(''); setShowRequestDropdown(false) }}>
                            <b>{pr.title}</b><small>{pr.projects?.name || '—'}</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </label>
                </div>
                {linkedRequest && (
                  <div className="invoice-request-grid" style={{ marginTop: 12 }}>
                    <div><small>Proje</small><b>{linkedRequest.project_name || '—'}</b></div>
                    <div><small>Tedarikçi</small><b>{linkedRequest.supplier_name || '—'}</b></div>
                    <div><small>Onaylanan Tutar</small><b>{money(approvedTotal)}</b></div>
                    <div><small>Tür</small><b>{categoryLabel(linkedRequest.category)}</b></div>
                  </div>
                )}
              </section>
            )}
            <section className="invoice-wizard-card">
              <div className="invoice-mode-row">
                <h3>{mode === 'faturali' ? 'Fatura Bilgileri' : 'Ödeme Bilgileri'}</h3>
                <div className="invoice-mode-toggle">
                  <button type="button" style={modeToggleBtn(mode === 'faturali')} onClick={() => setMode('faturali')}>Faturalı</button>
                  <button type="button" style={modeToggleBtn(mode === 'faturasiz')} onClick={() => setMode('faturasiz')}>Faturasız</button>
                </div>
              </div>
              <div className="invoice-form-grid">
                <label className="wide">
                  Tedarikçi{mode === 'faturali' ? ' *' : ''}
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
                {mode === 'faturasiz' && !form.supplier_id && (
                  <label className="wide">Kişi / Kurum<input value={form.beneficiary_name} onChange={event => set('beneficiary_name', event.target.value)} placeholder="Tedarikçi listesinde yoksa yazın" /></label>
                )}
                {mode === 'faturali' && (
                  <label>Fatura No *<input value={form.invoice_no} onChange={event => set('invoice_no', event.target.value)} placeholder="FTR-2026-0001" /></label>
                )}
                <label>{mode === 'faturali' ? 'Fatura Tarihi *' : 'İşlem Tarihi *'}<input type="date" value={form.invoice_date} onChange={event => set('invoice_date', event.target.value)} /></label>
                <label>Vade Tarihi<input type="date" value={form.due_date} onChange={event => set('due_date', event.target.value)} /></label>
                {mode === 'faturali' && (
                  <small style={{ gridColumn: 'span 2', color: 'var(--color-muted)', fontSize: 11 }}>
                    {form.due_date ? '✓ Vade tarihi girildi — bu fatura ödeme takibine alınacak.' : 'Vade tarihi boş bırakılırsa fatura onaylandığında doğrudan kapanır (peşin ödeme).'}
                  </small>
                )}
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
                  <>
                    <label>Belge Türü *<select value={form.document_type} onChange={event => set('document_type', event.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    {!linkedRequest && (
                      <label>Para Birimi<select value={form.currency} onChange={event => set('currency', event.target.value)}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
                    )}
                  </>
                )}
                {mode === 'faturali' && (
                  <label>Gider Türü *<select value={form.category} onChange={event => set('category', event.target.value)}><option value="malzeme">Malzeme</option><option value="hizmet">Hizmet</option><option value="diger">Diğer</option></select></label>
                )}
                <label className="wide">Açıklama{mode === 'faturasiz' ? ' *' : ''}<input value={form.description} onChange={event => set('description', event.target.value)} /></label>
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
            </section>
          </main>
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
            <button className="continue" disabled={!canSave || !!saving} onClick={handleSaveFaturasiz}>{saving === 'faturasiz' ? 'Kaydediliyor…' : linkedRequest ? 'Kaydet ve Talebi Kapat' : 'Kaydet'}</button>
          )}
        </footer>
      </div>
    </div>
  )
}
