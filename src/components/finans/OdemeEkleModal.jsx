import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { fetchDoviz } from '../../utils/exchangeRates'

const METHODS = [
  ['havale', 'Havale'],
  ['eft', 'EFT'],
  ['kredi_karti', 'Kredi Kartı'],
  ['nakit', 'Nakit'],
  ['cek', 'Çek'],
  ['diger', 'Diğer'],
]

// Paylaşılan ödeme formatlayıcıları aynı modülde tutuluyor.
// eslint-disable-next-line react-refresh/only-export-components
export function formatPaymentCurrency(amount, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 2,
  }).format(Number(amount) || 0)
}

// eslint-disable-next-line react-refresh/only-export-components
export function paymentErrorMessage(error) {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLocaleLowerCase('tr-TR')
  if (text.includes('kalan') && text.includes('aş')) return 'Ödeme tutarı kalan fatura tutarını aşamaz.'
  if (text.includes('ödeme takibi') || text.includes('odeme takibi')) return 'Bu fatura ödeme takibi aşamasında değil.'
  if (text.includes('row-level security') || text.includes('permission')) return 'Bu işlem için yetkiniz bulunmuyor.'
  return 'Ödeme kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.'
}

const field = { width: '100%', border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }
const label = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-sub)', marginBottom: 4 }

export default function OdemeEkleModal({ invoice, onClose, onSaved }) {
  const { user } = useAuth()
  // Ödeme her zaman faturanın kendi para biriminde girilir — bir seçici sunup
  // farklı bir birim seçtirmek, ne frontend ne de DB trigger'ının kontrol
  // ettiği bir mismatch'e (paid_amount'ın sessizce bozulmasına) yol açardı.
  const currency = invoice.currency || 'TRY'
  const remaining = Number(invoice.remaining_amount) || 0
  const [form, setForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    amount: '', payment_method: 'havale',
    bank_account: '', reference_no: '', note: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [doviz, setDoviz] = useState({ usd: null, eur: null, date: null })

  useEffect(() => {
    if (currency === 'TRY') return
    let alive = true
    fetchDoviz().then(kurData => { if (alive && kurData) setDoviz({ usd: kurData.usd, eur: kurData.eur, date: kurData.date }) })
    return () => { alive = false }
  }, [currency])

  const exchangeRate = currency === 'TRY' ? 1 : currency === 'USD' ? doviz.usd : doviz.eur
  const rateReady = exchangeRate != null
  const amount = Number(form.amount) || 0
  const amountTry = rateReady ? amount * exchangeRate : null
  const exceeds = amount > remaining
  const invalidAmount = amount <= 0 || exceeds || !rateReady
  const after = Math.max(0, remaining - amount)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    if (invalidAmount) return
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('invoice_payments').insert({
      invoice_id: invoice.id,
      payment_date: form.payment_date,
      amount,
      currency,
      exchange_rate: exchangeRate || 1,
      payment_method: form.payment_method,
      bank_account: form.bank_account.trim() || null,
      reference_no: form.reference_no.trim() || null,
      note: form.note.trim() || null,
      created_by: user?.id,
    })
    setSaving(false)
    if (insertError) {
      setError(paymentErrorMessage(insertError))
      return
    }
    await onSaved?.()
    onClose()
  }

  return (
    <div className="payment-modal-backdrop" role="presentation">
      <div className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 id="payment-modal-title" style={{ margin: 0, fontSize: 18, color: 'var(--color-text)' }}>Ödeme Ekle</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--color-muted)', fontSize: 12 }}>{invoice.invoice_no || 'Fatura'} · Kalan {formatPaymentCurrency(remaining, currency)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" style={{ border: 0, background: 'none', fontSize: 22, color: 'var(--color-muted)', cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="payment-form-grid">
            <div><label style={label}>Ödeme Tarihi *</label><input required type="date" style={field} value={form.payment_date} onChange={e => set('payment_date', e.target.value)} /></div>
            <div>
              <label style={label}>Ödenen Tutar *</label>
              <input required min="0.01" step="0.01" type="number" style={{ ...field, borderColor: exceeds ? '#DC2626' : undefined }} value={form.amount} onChange={e => set('amount', e.target.value)} />
              {exceeds && <small style={{ color: '#DC2626' }}>Kalan tutarı ({formatPaymentCurrency(remaining, currency)}) aşamazsınız.</small>}
            </div>
            <div><label style={label}>Para Birimi</label><input disabled style={{ ...field, background: 'var(--color-bg)', color: 'var(--color-muted)' }} value={currency} /></div>
            <div><label style={label}>Ödeme Yöntemi *</label><select style={field} value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>{METHODS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
            <div><label style={label}>Banka/Hesap</label><input style={field} value={form.bank_account} onChange={e => set('bank_account', e.target.value)} /></div>
            <div><label style={label}>Referans/İşlem No</label><input style={field} placeholder="örn. TRX-849201" value={form.reference_no} onChange={e => set('reference_no', e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={label}>Açıklama</label><textarea style={{ ...field, minHeight: 66, resize: 'vertical' }} value={form.note} onChange={e => set('note', e.target.value)} /></div>
          <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'var(--color-bg)', display: 'grid', gap: 5, fontSize: 12.5 }}>
            <div className="payment-summary-row"><span>Fatura toplamı</span><b>{formatPaymentCurrency(invoice.total_amount, currency)}</b></div>
            <div className="payment-summary-row"><span>Önceden ödenen</span><b>{formatPaymentCurrency(invoice.paid_amount, currency)}</b></div>
            <div className="payment-summary-row"><span>Bu ödeme</span><b>{formatPaymentCurrency(amount, currency)}</b></div>
            <div className="payment-summary-row" style={{ paddingTop: 5, borderTop: '1px solid var(--color-border-md)' }}><span>Ödeme sonrası kalan</span><b>{formatPaymentCurrency(after, currency)}</b></div>
            {currency !== 'TRY' && (
              <div className="payment-summary-row" style={{ paddingTop: 5, borderTop: '1px solid var(--color-border-md)', color: 'var(--color-muted)' }}>
                <span>{rateReady ? `1 ${currency} = ${formatPaymentCurrency(exchangeRate, 'TRY')} (TCMB, ${doviz.date || '—'})` : 'Kur yükleniyor…'}</span>
                <b>{rateReady ? `≈ ${formatPaymentCurrency(amountTry, 'TRY')}` : ''}</b>
              </div>
            )}
          </div>
          {error && <p style={{ color: '#DC2626', fontSize: 12.5, margin: '12px 0 0' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
            <button type="button" onClick={onClose} className="payment-secondary-btn">Vazgeç</button>
            <button type="submit" disabled={saving || invalidAmount} className="payment-primary-btn">{saving ? 'Kaydediliyor…' : 'Ödemeyi Kaydet'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export const PAYMENT_METHOD_LABELS = Object.fromEntries(METHODS)
