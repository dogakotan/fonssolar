import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatPaymentCurrency, paymentErrorMessage } from './OdemeEkleModal'

const METHODS = [['havale', 'Havale'], ['eft', 'EFT'], ['kredi_karti', 'Kredi Kartı'], ['nakit', 'Nakit'], ['cek', 'Çek'], ['diger', 'Diğer']]
const today = () => new Date().toISOString().slice(0, 10)
const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR') : '—'

export default function TedarikciOdemeModal({ rows, supplierMap, projectMap, onClose, onSaved }) {
  const { user } = useAuth()
  const supplierIds = useMemo(() => [...new Set(rows.filter(row => Number(row.remaining_amount) > 0).map(row => row.supplier_id).filter(Boolean))], [rows])
  const [supplierId, setSupplierId] = useState(supplierIds[0] || '')
  const [form, setForm] = useState({ payment_date: today(), amount: '', currency: 'TRY', payment_method: 'havale', bank_account: '', reference_no: '', note: '' })
  const [allocations, setAllocations] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const invoices = useMemo(() => rows
    .filter(row => row.supplier_id === supplierId && Number(row.remaining_amount) > 0)
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))), [rows, supplierId])
  const totalDebt = invoices.reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0)
  const overdue = invoices.filter(row => row.vade_durumu === 'vadesi_gecti')
  const overdueTotal = overdue.reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0)
  const distributed = Object.values(allocations).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const paymentTotal = Number(form.amount) || 0
  const undistributed = Math.max(0, paymentTotal - distributed)
  const valid = paymentTotal > 0 && distributed === paymentTotal && distributed <= totalDebt

  useEffect(() => setAllocations({}), [supplierId])

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setAllocation = (invoice, value) => {
    const amount = Math.min(Number(invoice.remaining_amount) || 0, Math.max(0, Number(value) || 0))
    setAllocations(current => ({ ...current, [invoice.id]: amount }))
  }

  function distributeOldest() {
    let left = paymentTotal
    const next = {}
    invoices.forEach(invoice => {
      const amount = Math.min(left, Number(invoice.remaining_amount) || 0)
      next[invoice.id] = amount
      left -= amount
    })
    setAllocations(next)
  }

  async function submit(event) {
    event.preventDefault()
    if (!valid) return
    setSaving(true)
    setError('')
    const payload = invoices
      .filter(invoice => Number(allocations[invoice.id]) > 0)
      .map(invoice => ({
        invoice_id: invoice.id,
        payment_date: form.payment_date,
        amount: Number(allocations[invoice.id]),
        currency: form.currency,
        payment_method: form.payment_method,
        bank_account: form.bank_account.trim() || null,
        reference_no: form.reference_no.trim() || null,
        note: form.note.trim() || null,
        created_by: user?.id,
      }))
    const { error: insertError } = await supabase.from('invoice_payments').insert(payload)
    setSaving(false)
    if (insertError) {
      setError(paymentErrorMessage(insertError))
      return
    }
    await onSaved?.()
    onClose()
  }

  return (
    <div className="supplier-payment-backdrop">
      <form className="supplier-payment-wizard" onSubmit={submit}>
        <header className="supplier-payment-header">
          <div><small>Finans / Ödeme Takibi / Yeni Ödeme</small><h2>Tedarikçiye Ödeme Ekle</h2><p>Ödemeyi açık faturalara dağıtın.</p></div>
          <button type="button" onClick={onClose} aria-label="Kapat">×</button>
        </header>
        <div className="supplier-payment-steps">
          <div className="active"><i>1</i><span>Ödeme Bilgileri</span></div>
          <div><i>2</i><span>Faturalara Dağıt</span></div>
          <div><i>3</i><span>Kontrol ve Kaydet</span></div>
        </div>
        <div className="supplier-payment-content">
          <aside>
            <section className="supplier-payment-card">
              <h3>Ödeme Bilgileri</h3>
              <label>Tedarikçi *<select value={supplierId} onChange={e => setSupplierId(e.target.value)}>{supplierIds.map(id => <option key={id} value={id}>{supplierMap[id]}</option>)}</select></label>
              <label>Ödeme Tarihi *<input required type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} /></label>
              <div className="supplier-payment-split">
                <label>Toplam Ödeme Tutarı *<input required min="0.01" max={totalDebt} step="0.01" type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></label>
                <label>Para Birimi *<select value={form.currency} onChange={e => set('currency', e.target.value)}><option>TRY</option><option>USD</option><option>EUR</option></select></label>
              </div>
              <div className="supplier-payment-split">
                <label>Ödeme Yöntemi *<select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>{METHODS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
                <label>Banka / Hesap<input value={form.bank_account} onChange={e => set('bank_account', e.target.value)} /></label>
              </div>
              <label>Referans No<input value={form.reference_no} onChange={e => set('reference_no', e.target.value)} /></label>
              <label>Açıklama<textarea maxLength="200" value={form.note} onChange={e => set('note', e.target.value)} /></label>
            </section>
            <section className="supplier-payment-card supplier-summary">
              <h3>Tedarikçi Özeti</h3>
              <div><span><i>▣</i><small>Açık Borç</small><b>{formatPaymentCurrency(totalDebt)}</b></span><span><i>◔</i><small>Açık Fatura</small><b>{invoices.length}</b></span><span><i>!</i><small>Vadesi Geçen</small><b>{formatPaymentCurrency(overdueTotal)}</b></span></div>
            </section>
          </aside>
          <main>
            <section className="supplier-payment-card supplier-allocation">
              <header><h3>Faturalara Dağıtım</h3><button type="button" onClick={distributeOldest} disabled={!paymentTotal}>En eski vadeden dağıt</button></header>
              <div className="supplier-allocation-head"><span>Fatura No / Proje</span><span>Vade Tarihi</span><span>Durum</span><span>Kalan Tutar</span><span>Bu Ödemeden</span></div>
              {invoices.map(invoice => {
                const selected = Number(allocations[invoice.id]) > 0
                return <div className="supplier-allocation-row" key={invoice.id}>
                  <input type="checkbox" checked={selected} onChange={e => setAllocation(invoice, e.target.checked ? invoice.remaining_amount : 0)} />
                  <p><b>{invoice.invoice_no}</b><small>{projectMap[invoice.project_id] || '—'}</small></p>
                  <span>{dateText(invoice.due_date)}</span>
                  <em className={invoice.vade_durumu === 'vadesi_gecti' ? 'overdue' : ''}>{invoice.vade_durumu === 'vadesi_gecti' ? 'Vadesi geçti' : 'Vade var'}</em>
                  <b>{formatPaymentCurrency(invoice.remaining_amount, invoice.currency)}</b>
                  <input type="number" min="0" max={invoice.remaining_amount} step="0.01" value={allocations[invoice.id] || ''} placeholder="₺0,00" onChange={e => setAllocation(invoice, e.target.value)} />
                </div>
              })}
              {!invoices.length && <p className="supplier-payment-empty">Bu tedarikçiye ait açık fatura bulunamadı.</p>}
            </section>
            <section className={`supplier-distribution-summary ${valid ? 'complete' : ''}`}>
              <div><span><small>Toplam Ödeme</small><b>{formatPaymentCurrency(paymentTotal, form.currency)}</b></span><span><small>Faturalara Dağıtılan</small><b>{formatPaymentCurrency(distributed, form.currency)}</b></span><span><small>Dağıtılmayan</small><b>{formatPaymentCurrency(undistributed, form.currency)}</b></span></div>
              <p>{valid ? '✓ Ödeme tutarı tamamen dağıtıldı.' : 'Seçili faturalara dağıtılan tutar, toplam ödemeye eşit olmalı.'}</p>
            </section>
          </main>
        </div>
        {error && <p className="supplier-payment-error">{error}</p>}
        <footer className="supplier-payment-footer"><button type="button" onClick={onClose}>İptal</button><span /><button type="button" className="draft">Taslak Kaydet</button><button type="submit" className="primary" disabled={!valid || saving}>{saving ? 'Kaydediliyor…' : 'Kontrol Et'}</button></footer>
      </form>
    </div>
  )
}
