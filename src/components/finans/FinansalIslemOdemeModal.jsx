import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatPaymentCurrency } from './OdemeEkleModal'

const today = () => new Date().toISOString().slice(0, 10)

export default function FinansalIslemOdemeModal({ transaction, onClose, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ payment_date: today(), amount: transaction.remaining_amount, payment_method: 'havale', bank_account: '', reference_no: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const exceeds = Number(form.amount) > Number(transaction.remaining_amount)

  async function submit(event) {
    event.preventDefault()
    if (exceeds) return
    setSaving(true)
    const { error: insertError } = await supabase.from('financial_transaction_payments').insert({
      transaction_id: transaction.id, payment_date: form.payment_date, amount: Number(form.amount),
      currency: transaction.currency, payment_method: form.payment_method,
      bank_account: form.bank_account.trim() || null, reference_no: form.reference_no.trim() || null,
      note: form.note.trim() || null, created_by: user?.id || null,
    })
    if (insertError) {
      console.error('financial transaction payment error:', insertError)
      setError(insertError.message?.includes('aşamaz') ? 'Ödeme tutarı kalan işlem tutarını aşamaz.' : 'Ödeme kaydedilemedi.')
      setSaving(false)
      return
    }
    await onSaved?.()
    onClose()
  }

  return (
    <div className="fin-modal-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="fin-modal financial-payment-modal" onSubmit={submit}>
        <header><div><small>{transaction.transaction_no}</small><h2>İşleme Ödeme Ekle</h2><p>{transaction.counterparty}</p></div><button type="button" onClick={onClose}>×</button></header>
        {error && <div className="fin-form-error">{error}</div>}
        <section className="financial-payment-fields">
          <label>Ödeme Tarihi<input type="date" required value={form.payment_date} onChange={e => set('payment_date', e.target.value)} /></label>
          <label>Ödenen Tutar<input type="number" min="0.01" step="0.01" required value={form.amount} onChange={e => set('amount', e.target.value)} /></label>
          {exceeds && <p>Kalan tutarı ({formatPaymentCurrency(transaction.remaining_amount, transaction.currency)}) aşamazsınız.</p>}
          <label>Ödeme Yöntemi<select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}><option value="havale">Havale</option><option value="eft">EFT</option><option value="kredi_karti">Kredi Kartı</option><option value="nakit">Nakit</option><option value="cek">Çek</option><option value="diger">Diğer</option></select></label>
          <label>Banka / Hesap<input value={form.bank_account} onChange={e => set('bank_account', e.target.value)} /></label>
          <label>Referans No<input value={form.reference_no} onChange={e => set('reference_no', e.target.value)} placeholder="örn. TRX-849201" /></label>
          <label>Açıklama<textarea value={form.note} onChange={e => set('note', e.target.value)} /></label>
        </section>
        <div className="financial-payment-summary"><span>İşlem toplamı <b>{formatPaymentCurrency(transaction.amount, transaction.currency)}</b></span><span>Önceden ödenen <b>{formatPaymentCurrency(transaction.paid_amount, transaction.currency)}</b></span><span>Ödeme sonrası kalan <b>{formatPaymentCurrency(Math.max(0, Number(transaction.remaining_amount) - Number(form.amount || 0)), transaction.currency)}</b></span></div>
        <footer><button type="button" className="secondary" onClick={onClose}>İptal</button><button className="primary" disabled={saving || exceeds}>{saving ? 'Kaydediliyor…' : 'Ödemeyi Kaydet'}</button></footer>
      </form>
    </div>
  )
}
