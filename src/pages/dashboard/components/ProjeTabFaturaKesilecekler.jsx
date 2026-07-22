import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { toUserMessage as translateError } from '../../../utils/errors'
import Pager from '../../../components/ui/Pager'
import Badge from '../../../components/ui/Badge'
import { PR_STATUS } from '../../../components/ui/StatusBadge'

const PAGE_SIZE = 10
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 24

const TH = { height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 14px', lineHeight: `${HEADER_HEIGHT}px`, textAlign: 'left', fontSize: 9.5, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', verticalAlign: 'middle' }
const TD = { height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 14px', fontSize: 13, color: 'var(--color-text-sub)', verticalAlign: 'middle' }

const formatQty = (value) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })

function toUserMessage(error) {
  return translateError(error, { fallback: err => err?.message || 'Kaydedilemedi. Lütfen tekrar deneyin.' })
}

function MiktarDuzenleModal({ row, onClose, onSaved }) {
  const [newQty, setNewQty] = useState(row.planned || 0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    const { error } = await supabase.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: row.id,
      p_new_planned_qty: Number(newQty),
      p_note: note.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Planlanan Miktarı Değiştir</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748B' }}>
          {row.material} için yeni planlanan miktarı girin. Bu talep yönetici onayına düşer, onaylanana kadar mevcut miktar geçerli kalır.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Mevcut Miktar</label>
              <div style={{ padding: '8px 12px', fontSize: 14, color: '#6B7280', background: '#F9FAFB', borderRadius: 8 }}>{formatQty(row.planned)} {row.unit}</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Yeni Miktar *</label>
              <input required type="number" min="0.01" step="0.01" value={newQty} onChange={e => setNewQty(e.target.value)}
                style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Gerekçe</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Neden değişiyor..."
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical', minHeight: 60 }} />
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Vazgeç
            </button>
            <button type="submit" disabled={saving} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Gönderiliyor…' : 'Onaya Gönder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function YeniMalzemeEkleModal({ projectId, onClose, onSaved }) {
  const [equipment, setEquipment] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('')
  const [plannedQty, setPlannedQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    const { error } = await supabase.rpc('create_procurement_item_add_request', {
      p_project_id: projectId,
      p_equipment: equipment.trim(),
      p_unit: unit.trim() || null,
      p_category: category.trim() || null,
      p_planned_qty: Number(plannedQty || 0),
      p_note: note.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Yeni Malzeme Ekle</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748B' }}>
          Malzeme listesine yeni bir kalem eklemek istiyorsunuz. Bu talep yönetici onayına düşer, onaylanınca kalem listeye eklenir.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Malzeme Adı *</label>
            <input required autoFocus value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="Örn: DC Solar Kablo"
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Birim</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Örn: Metre, Adet"
                style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Planlanan Miktar *</label>
              <input required type="number" min="0.01" step="0.01" value={plannedQty} onChange={e => setPlannedQty(e.target.value)}
                style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Kategori</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Örn: Mekanik, Elektrik"
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Gerekçe</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Neden ekleniyor..."
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical', minHeight: 60 }} />
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Vazgeç
            </button>
            <button type="submit" disabled={saving} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Gönderiliyor…' : 'Onaya Gönder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BekleyenDegisikliklerPanel({ items, onReviewed }) {
  const [busyId, setBusyId] = useState(null)
  const [noteById, setNoteById] = useState({})

  async function review(id, approve) {
    setBusyId(id)
    const { error } = await supabase.rpc('review_procurement_item_change_request', {
      p_id: id,
      p_approve: approve,
      p_review_note: (noteById[id] || '').trim() || null,
    })
    setBusyId(null)
    if (error) { alert(toUserMessage(error)); return }
    onReviewed()
  }

  return (
    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
      <h4 style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#92400E' }}>
        Bekleyen Miktar Değişiklikleri ({items.length})
      </h4>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: '#78716C' }}>Bekleyen miktar değişikliği bulunmuyor.</p>
      ) : <div style={{ display: 'grid', gap: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                {item.is_new ? (
                  <>
                    <span style={{ color: '#065F46', fontWeight: 800 }}>Yeni Malzeme:</span> {item.equipment || 'Malzeme'} — {formatQty(item.new_planned_qty)} {item.unit || ''}
                  </>
                ) : (
                  <>{item.equipment || 'Malzeme'}: {formatQty(item.old_planned_qty)} → {formatQty(item.new_planned_qty)} {item.unit || ''}</>
                )}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#6B7280' }}>
                {item.requester_name || 'Proje yöneticisi'} · {item.note || 'Gerekçe girilmedi'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text" placeholder="Not (opsiyonel)"
                value={noteById[item.id] || ''}
                onChange={e => setNoteById(m => ({ ...m, [item.id]: e.target.value }))}
                style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 140 }}
              />
              <button onClick={() => review(item.id, true)} disabled={busyId === item.id}
                style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Onayla
              </button>
              <button onClick={() => review(item.id, false)} disabled={busyId === item.id}
                style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Reddet
              </button>
            </div>
          </div>
        ))}
      </div>}
    </div>
  )
}

function MalzemeGecmisiModal({ row, requests, onClose }) {
  const [changes, setChanges] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('procurement_item_change_requests').select('*').eq('procurement_item_id', row.id).order('requested_at', { ascending: false }),
      supabase.from('procurement_item_adjustments').select('*').eq('procurement_item_id', row.id).order('created_at', { ascending: false }),
    ]).then(([changeRes, adjustmentRes]) => {
      if (!alive) return
      if (changeRes.error) console.error('material change history error:', changeRes.error)
      if (adjustmentRes.error) console.error('material adjustment history error:', adjustmentRes.error)
      if (changeRes.error || adjustmentRes.error) setHistoryError('Geçmişin bir bölümü yüklenemedi. Lütfen tekrar deneyin.')
      setChanges(changeRes.data || [])
      setAdjustments(adjustmentRes.data || [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [row.id])

  const requestById = new Map((requests || []).map(request => [request.id, request]))
  const statusMeta = status => ({
    bekliyor: ['Bekliyor', '#92400E', '#FEF3C7'],
    onaylandı: ['Onaylandı', '#065F46', '#D1FAE5'],
    onaylandi: ['Onaylandı', '#065F46', '#D1FAE5'],
    reddedildi: ['Reddedildi', '#991B1B', '#FEE2E2'],
  })[status] || [String(status || '—').replace(/_/g, ' '), '#475569', '#F1F5F9']

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, padding: 18, background: 'rgba(15, 23, 42, .42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 680, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 26, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>{row.material}</h3>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#64748B' }}>Malzeme miktarı ve değişim geçmişi</p>
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'none', color: '#64748B', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            ['Planlanan', `${formatQty(row.planned)} ${row.unit}`],
            ['Gönderilen', `${formatQty(row.sent)} ${row.unit}`],
            ['Kalan', `${formatQty(row.required)} ${row.unit}`],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: '11px 13px', borderRadius: 9, background: '#F8FAFC' }}>
              <p style={{ margin: '0 0 3px', fontSize: 10.5, color: '#64748B', textTransform: 'uppercase' }}>{label}</p>
              <strong style={{ fontSize: 14, color: '#0F172A' }}>{value}</strong>
            </div>
          ))}
        </div>

        {loading ? <p style={{ color: '#64748B', fontSize: 13 }}>Geçmiş yükleniyor…</p> : (
          <>
            {historyError && <p style={{ margin: '0 0 12px', padding: '8px 10px', borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 12 }}>{historyError}</p>}
            <h4 style={{ margin: '0 0 9px', fontSize: 13, color: '#334155' }}>Miktar Değişiklikleri</h4>
            {changes.length === 0 ? <p style={{ margin: '0 0 18px', color: '#94A3B8', fontSize: 12.5 }}>Manuel değişiklik kaydı yok.</p> : changes.map(change => {
              const [label, color, bg] = statusMeta(change.status)
              return <div key={change.id} style={{ border: '1px solid #E2E8F0', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>{formatQty(change.old_planned_qty)} → {formatQty(change.new_planned_qty)} {row.unit}</strong>
                  <span style={{ color, background: bg, borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{label}</span>
                </div>
                <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 12 }}>{change.note || 'Gerekçe girilmedi'} · {change.requested_at ? new Date(change.requested_at).toLocaleString('tr-TR') : '—'}</p>
                {change.review_note && <p style={{ margin: '3px 0 0', color: '#475569', fontSize: 12 }}>Onay notu: {change.review_note}</p>}
              </div>
            })}

            <h4 style={{ margin: '18px 0 9px', fontSize: 13, color: '#334155' }}>Fazla Satın Alma / Stok Eklemeleri</h4>
            {adjustments.length === 0 ? <p style={{ margin: 0, color: '#94A3B8', fontSize: 12.5 }}>Onaylı fazla satın alma kaydı yok.</p> : adjustments.map(adjustment => {
              const request = requestById.get(adjustment.purchase_request_id)
              const reversed = !!adjustment.reversed_at
              return <div key={adjustment.id} style={{ border: `1px solid ${reversed ? '#FECACA' : '#86EFAC'}`, background: reversed ? '#FFF7F7' : '#F0FDF4', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: reversed ? '#991B1B' : '#166534', fontSize: 13 }}>+{formatQty(adjustment.delta_qty)} {row.unit}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, color: reversed ? '#991B1B' : '#166534' }}>{reversed ? 'Geri alındı' : 'Onaylandı ve listeye eklendi'}</span>
                </div>
                <p style={{ margin: '5px 0 0', color: '#475569', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{request?.title || request?.material_name || 'Bağlı satın alma talebi'}</span>
                  {request?.status && <Badge map={PR_STATUS} value={request.status} />}
                </p>
                <p style={{ margin: '3px 0 0', color: '#64748B', fontSize: 11.5 }}>{adjustment.created_at ? new Date(adjustment.created_at).toLocaleString('tr-TR') : '—'}</p>
              </div>
            })}
          </>
        )}
      </div>
    </div>
  )
}

export default function ProjeTabFaturaKesilecekler({ rows = [], requests = [], loading, pendingChanges = [], onPendingChanged, projectId }) {
  const { isAdmin, role } = useAuth()
  const [page, setPage] = useState(0)
  const [editingRow, setEditingRow] = useState(null)
  const [detailRow, setDetailRow] = useState(null)
  const [showNewMaterial, setShowNewMaterial] = useState(false)
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const canRequest = isAdmin || role === 'proje_yoneticisi'
  const canReview = isAdmin
  const pending = canRequest ? pendingChanges : []

  useEffect(() => { setPage(0) }, [rows.length])

  const pendingByItemId = new Map(pending.map(p => [p.procurement_item_id, p]))
  const pendingNewMaterials = pending.filter(item => item.is_new)

  return (
    <div>
      {canReview && <BekleyenDegisikliklerPanel items={pending} onReviewed={onPendingChanged} />}

      {canRequest && !canReview && pendingNewMaterials.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: '#92400E' }}>Onaya Gönderilen Yeni Malzemeler ({pendingNewMaterials.length})</h4>
          <div style={{ display: 'grid', gap: 7 }}>
            {pendingNewMaterials.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', background: '#fff', border: '1px solid #FDE68A', borderRadius: 8, padding: '9px 11px' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text)' }}>{item.equipment || 'Yeni malzeme'} · {formatQty(item.new_planned_qty)} {item.unit || ''}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>Yönetici onayı bekliyor</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Malzeme Listesi</h3>
          <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>
            {rows.length} kalem
          </span>
          {canRequest && (
            <button onClick={() => setShowNewMaterial(true)} style={{ marginLeft: 'auto', background: 'var(--color-primary)', color: '#fff', border: 0, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Yeni Malzeme
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
            Bu projeye ait malzeme listesi henüz eklenmemiş.
          </div>
        ) : (
          <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  {['MALZEME', 'PLANLANAN MİKTAR', 'PROJE İÇİN GÖNDERİLEN', 'GÖNDERİLMESİ GEREKEN', ...(canRequest ? ['İŞLEM'] : [])].map(h => (
                    <th key={h} style={{ ...TH, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1, boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => {
                  const pendingChange = pendingByItemId.get(row.id)
                  return (
                  <tr key={row.id || row.material} onClick={() => setDetailRow(row)} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
                    <td style={{ ...TD, fontWeight: 600, color: 'var(--color-text)' }}>{row.material}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span>{formatQty(row.planned)} {row.unit}</span>
                        {row.addedQty > 0 && (
                          <span
                          title={`+${formatQty(row.addedQty)} ${row.unit} eklendi (${row.addedViaCount} onaylı satın alma ile)`}
                          style={{
                            marginLeft: 8, display: 'inline-block', fontSize: 10.5, fontWeight: 700,
                            color: 'var(--color-success)', background: '#f0fdf4', border: '1px solid #86efac',
                            borderRadius: 20, padding: '1px 7px', cursor: 'help', verticalAlign: 'middle',
                          }}
                          >
                            +{formatQty(row.addedQty)} onaylı
                          </span>
                        )}
                        {pendingChange && (
                          <span style={{ fontSize: 10.5, lineHeight: 1.4, fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                            Onay bekliyor: {formatQty(pendingChange.old_planned_qty)} → {formatQty(pendingChange.new_planned_qty)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...TD, fontWeight: 600, color: 'var(--color-success)' }}>{formatQty(row.sent)} {row.unit}</td>
                    <td style={{ ...TD, fontWeight: 700, color: row.required > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                      {formatQty(row.required)} {row.unit}
                    </td>
                    {canRequest && (
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setEditingRow(row) }}
                          disabled={!!pendingChange}
                          title={pendingChange ? 'Bu kalem için zaten bekleyen bir talep var' : ''}
                          style={{
                            background: pendingChange ? '#F3F4F6' : '#EFF6FF',
                            color: pendingChange ? '#9CA3AF' : '#185FA5',
                            border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                            cursor: pendingChange ? 'default' : 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          Düzenle
                        </button>
                      </td>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '4px 14px 12px' }}>
            <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
          </>
        )}
      </div>

      {editingRow && (
        <MiktarDuzenleModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={onPendingChanged}
        />
      )}
      {detailRow && <MalzemeGecmisiModal row={detailRow} requests={requests} onClose={() => setDetailRow(null)} />}
      {showNewMaterial && (
        <YeniMalzemeEkleModal
          projectId={projectId}
          onClose={() => setShowNewMaterial(false)}
          onSaved={() => onPendingChanged?.()}
        />
      )}
    </div>
  )
}
