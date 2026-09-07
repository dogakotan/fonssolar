import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { toUserMessage } from '../../utils/errors'

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

// Düzeltme İste — Onay Kuyruğu tablo satırından tıklanınca açılan box (modal).
// Muhasebeden istenen değişiklik burada yazılır; gönderilince invoice_approvals
// güncellenir, fn_invoice_approval_cascade faturayı duzeltme_bekliyor'a çeker
// ve (bkz. migration notify_muhasebe_on_duzeltme_istendi) muhasebeye bildirim gider.
function DuzeltmeIsteModal({ onClose, onSubmit, busy }) {
  const [note, setNote] = useState('')
  const canSubmit = note.trim().length > 0

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-surface)', borderRadius: 16, padding: 24, width: 460, maxWidth: '100%', boxShadow: '0 28px 80px rgba(15,23,42,.24)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>Düzeltme İste</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--color-muted)' }}>
          Muhasebeden istediğiniz değişikliği yazın. Fatura "Düzeltme Bekliyor" durumuna alınır ve muhasebeye bildirilir.
        </p>
        <textarea
          autoFocus
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Düzeltme gerekçesi / istenen değişiklik (zorunlu)"
          style={{ width: '100%', minHeight: 90, resize: 'vertical', border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--color-text)', background: 'var(--color-surface)', boxSizing: 'border-box', outline: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} disabled={busy} style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            Vazgeç
          </button>
          <button
            onClick={() => onSubmit(note)}
            disabled={busy || !canSubmit}
            style={{ background: 'var(--color-warning-text)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: (busy || !canSubmit) ? 'not-allowed' : 'pointer', opacity: (busy || !canSubmit) ? 0.6 : 1, fontFamily: 'inherit' }}
          >
            {busy ? 'Gönderiliyor…' : 'Düzeltme İsteğini Gönder'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Yönetici (proje_yoneticisi/admin) tarafından yönetici_onayında bir faturada
// Onayla/Düzeltme İste/Reddet aksiyonu. invoice_approvals.status günceller;
// invoices.status'a hiç dokunmaz — fn_invoice_approval_cascade trigger'ına
// bırakılır (elle yazmak trigger'la çakışır).
//
// layout='compact' (varsayılan, OnayKuyrugu tablo satırı): Onayla anında
// çalışır, Reddet tıklanınca satır içi küçük bir not alanı açılır, Düzeltme
// İste tıklanınca ayrı bir box (modal) açılır — istenen değişiklik orada yazılır.
// layout='full' (FaturaDetayModal): tek paylaşımlı not kutusu her zaman
// görünür, üç buton da her zaman görünür (brief'in referans mockup'ıyla
// birebir) — Onayla notsuz da gönderilebilir, Düzeltme İste/Reddet not
// zorunlu kılar.
export default function OnayReddetActions({ invoiceId, onDone, layout = 'compact' }) {
  const { user } = useAuth()
  const [mode, setMode] = useState(null) // yalnızca compact: null | 'duzeltme' | 'reddet'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // error kontrolsüz bırakılırsa (ör. project_id=NULL "genel harcama" faturasında
  // cost_allocations NOT NULL ihlali gibi bir trigger hatası) satır güncellenmez
  // ama onDone yine de çağrılıp modal kapanırdı — kullanıcıya butonun "hiçbir şey
  // yapmadığı" izlenimini veriyordu (2026-09-02'de bulunan bug). Artık hata varsa
  // modal kapanmıyor, mesaj gösteriliyor.
  async function submit(status, noteOverride) {
    setBusy(true)
    setErr('')
    const { error } = await supabase
      .from('invoice_approvals')
      .update({
        status,
        note: (noteOverride ?? note).trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewer_id: user.id,
      })
      .eq('invoice_id', invoiceId)
      .eq('status', 'bekliyor')
    setBusy(false)
    if (error) { setErr(toUserMessage(error)); return }
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
        {err && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--color-danger-text)' }}>{err}</p>
        )}
      </div>
    )
  }

  if (mode === 'reddet') {
    const canSubmit = note.trim().length > 0
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          autoFocus
          placeholder="Red gerekçesi (zorunlu)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 210 }}
        />
        <button onClick={() => submit('reddedildi')} disabled={busy || !canSubmit} style={btnStyle(BTN.reddet, canSubmit)}>
          {busy ? '…' : 'Reddi Onayla'}
        </button>
        <button
          onClick={() => { setMode(null); setNote(''); setErr('') }}
          style={{ background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          İptal
        </button>
        {err && <span style={{ fontSize: 11.5, color: 'var(--color-danger-text)', width: '100%' }}>{err}</span>}
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => submit('onaylandı')} disabled={busy} style={btnStyle(BTN.onayla)}>
          {busy ? '…' : BTN.onayla.label}
        </button>
        <button onClick={() => setMode('duzeltme')} disabled={busy} style={btnStyle(BTN.duzeltme)}>
          {BTN.duzeltme.label}
        </button>
        <button onClick={() => setMode('reddet')} disabled={busy} style={btnStyle(BTN.reddet)}>
          {BTN.reddet.label}
        </button>
        {err && <span style={{ fontSize: 11.5, color: 'var(--color-danger-text)' }}>{err}</span>}
      </div>
      {mode === 'duzeltme' && (
        <DuzeltmeIsteModal
          busy={busy}
          onClose={() => setMode(null)}
          onSubmit={noteValue => submit('duzeltme_istendi', noteValue)}
        />
      )}
    </>
  )
}
