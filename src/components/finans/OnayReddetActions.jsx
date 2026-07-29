import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const BTN = {
  onayla:   { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', label: '✓ Onayla' },
  duzeltme: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', label: '✎ Düzeltme İste' },
  reddet:   { bg: 'var(--color-danger-bg)',  color: 'var(--color-danger-text)',  label: '✗ Reddet' },
}

const btnStyle = (meta, enabled = true) => ({
  background: meta.bg, color: meta.color, border: 'none', borderRadius: 6,
  padding: '5px 14px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
  cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.6,
})

const fullBtnStyle = (kind, enabled) => {
  const base = { flex: 1, borderRadius: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5, transition: 'opacity .12s' }
  if (kind === 'onayla') return { ...base, background: 'var(--color-primary)', color: '#fff', border: 'none' }
  if (kind === 'duzeltme') return { ...base, background: 'var(--color-surface)', color: 'var(--color-warning-text)', border: '1px solid var(--color-warning-text)' }
  return { ...base, background: 'var(--color-surface)', color: 'var(--color-danger-text)', border: '1px solid var(--color-danger-text)' }
}

// Yönetici (proje_yoneticisi/admin) tarafından yönetici_onayında bir faturada
// Onayla/Düzeltme İste/Reddet aksiyonu. invoice_approvals.status günceller;
// invoices.status'a hiç dokunmaz — fn_invoice_approval_cascade trigger'ına
// bırakılır (elle yazmak trigger'la çakışır).
//
// layout='compact' (varsayılan, OnayKuyrugu tablo satırı): Onayla/Düzeltme/
// Reddet butonu tıklanınca yalnızca o aksiyon için küçük bir not alanı açılır.
// layout='full' (FaturaDetayModal): tek paylaşımlı not kutusu her zaman
// görünür, üç buton da her zaman görünür (brief'in referans mockup'ıyla
// birebir) — Onayla notsuz da gönderilebilir, Düzeltme İste/Reddet not
// zorunlu kılar.
export default function OnayReddetActions({ invoiceId, onDone, layout = 'compact' }) {
  const { user } = useAuth()
  const [mode, setMode] = useState(null) // yalnızca compact: null | 'duzeltme' | 'reddet'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(status) {
    setBusy(true)
    await supabase
      .from('invoice_approvals')
      .update({
        status,
        note: note.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewer_id: user.id,
      })
      .eq('invoice_id', invoiceId)
      .eq('status', 'bekliyor')
    setBusy(false)
    setMode(null)
    setNote('')
    onDone?.()
  }

  if (layout === 'full') {
    const canReject = note.trim().length > 0
    return (
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>
          İşlem Notları
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Onay veya düzeltme/red notu ekleyin…"
          style={{ width: '100%', minHeight: 70, resize: 'vertical', border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--color-text)', background: 'var(--color-surface)', boxSizing: 'border-box', outline: 'none', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => submit('onaylandı')} disabled={busy} style={fullBtnStyle('onayla', !busy)}>
            {busy ? '…' : 'Onayla'}
          </button>
          <button onClick={() => submit('duzeltme_istendi')} disabled={busy || !canReject} style={fullBtnStyle('duzeltme', !busy && canReject)}>
            Düzeltme İste
          </button>
          <button onClick={() => submit('reddedildi')} disabled={busy || !canReject} style={fullBtnStyle('reddet', !busy && canReject)}>
            Reddet
          </button>
        </div>
        {!canReject && (
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--color-muted-light)' }}>
            Düzeltme İste/Reddet için yukarıya bir gerekçe yazmanız gerekir.
          </p>
        )}
      </div>
    )
  }

  if (mode) {
    const target = mode === 'duzeltme' ? 'duzeltme_istendi' : 'reddedildi'
    const meta = BTN[mode === 'duzeltme' ? 'duzeltme' : 'reddet']
    const canSubmit = note.trim().length > 0
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          autoFocus
          placeholder={mode === 'duzeltme' ? 'Düzeltme gerekçesi (zorunlu)' : 'Red gerekçesi (zorunlu)'}
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 210 }}
        />
        <button onClick={() => submit(target)} disabled={busy || !canSubmit} style={btnStyle(meta, canSubmit)}>
          {busy ? '…' : mode === 'duzeltme' ? 'Düzeltme İsteğini Gönder' : 'Reddi Onayla'}
        </button>
        <button
          onClick={() => { setMode(null); setNote('') }}
          style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          İptal
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button onClick={() => submit('onaylandı')} disabled={busy} style={btnStyle(BTN.onayla)}>
        {busy ? '…' : BTN.onayla.label}
      </button>
      <button onClick={() => setMode('duzeltme')} disabled={busy} style={btnStyle(BTN.duzeltme)}>
        {BTN.duzeltme.label}
      </button>
      <button onClick={() => setMode('reddet')} disabled={busy} style={btnStyle(BTN.reddet)}>
        {BTN.reddet.label}
      </button>
    </div>
  )
}
