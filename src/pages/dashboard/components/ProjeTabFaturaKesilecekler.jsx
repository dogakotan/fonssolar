import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { toUserMessage as translateError } from '../../../utils/errors'
import { useHighlightRow } from '../../../hooks/useHighlightRow'
import { useToast } from '../../../hooks/useToast'
import Toast from '../../../components/ui/Toast'
import { suggestBomMatches } from '../../../utils/satinAlma'
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 24

const TH = { height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 14px', lineHeight: `${HEADER_HEIGHT}px`, textAlign: 'left', fontSize: 9.5, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', verticalAlign: 'middle' }
const TD = { height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 14px', fontSize: 13, color: 'var(--color-text-sub)', verticalAlign: 'middle' }

// Malzeme adı kesildiğinde tam metni görebilmek için üzerine
// gelince çıkan küçük bir balon — native `title` tooltip'i yerine (gecikmeli/
// küçük/tarayıcıya göre değişken) kendi temamıza uygun, anında görünen bir
// tooltip. `overflow:hidden` yalnızca metni saran iç span'da — balon onun
// KARDEŞİ olduğundan kesilmiyor, dışarı taşabiliyor.
function MaterialNameCell({ name, style }) {
  return (
    <td style={{ ...TD, ...style }}>
      <span className="malz-tt-group" style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', verticalAlign: 'middle' }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
          {name}
        </span>
        <span className="malz-tt-bubble">{name}</span>
      </span>
    </td>
  )
}

const formatQty = (value) =>
  Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })

function toUserMessage(error) {
  return translateError(error, { fallback: err => err?.message || 'Kaydedilemedi. Lütfen tekrar deneyin.' })
}

export const MALZEME_KATEGORI_OPTS = [
  'Mobilizasyon',
  'Hizmet',
  'İş makineleri',
  'Güvenlik',
  'Elektrik',
  'Mekanik',
  'Hırdavat',
  'Diğer',
]

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
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', background: '#fff' }}>
              <option value="">Seçiniz</option>
              {MALZEME_KATEGORI_OPTS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
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

// Bir talep kalemi serbest metinle girildiği için BOM'daki gerçek kalemle isim
// bazlı eşleşmiyorsa (materialMatchKey) hem bu kalemin "Listede Yok" görünmesine
// hem de Malzeme Listesi'ndeki Gönderilen/Kalan miktarların yanlış hesaplanmasına
// yol açar. Bu panel her böyle kalem için BOM'daki en olası adayı (isim benzerliği)
// önerir — kullanıcı onaylarsa link_purchase_request_item_to_bom ile kalıcı
// (bom_item_id) bağlanır, reddederse yalnızca bu oturumda gizlenir (kalıcı bir
// "bu öneriyi bir daha gösterme" kaydı tutulmaz — sayfa yenilenince aynı eşik
// üstü aday varsa tekrar önerilir, bu bilinçli bir sadeleştirme).
function EslestirmeOnerileriPanel({ suggestions, onLinked }) {
  const [busyId, setBusyId] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())
  const [errorById, setErrorById] = useState({})
  const visible = suggestions.filter(s => !dismissed.has(s.itemId))
  if (visible.length === 0) return null

  async function approve(suggestion) {
    setBusyId(suggestion.itemId)
    setErrorById(m => ({ ...m, [suggestion.itemId]: '' }))
    const { error } = await supabase.rpc('link_purchase_request_item_to_bom', {
      p_item_id: suggestion.itemId,
      p_procurement_item_id: suggestion.candidateId,
    })
    setBusyId(null)
    if (error) { setErrorById(m => ({ ...m, [suggestion.itemId]: toUserMessage(error) })); return }
    onLinked?.()
  }

  function dismiss(itemId) {
    setDismissed(prev => new Set(prev).add(itemId))
  }

  return (
    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
      <h4 style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 700, color: '#1E40AF' }}>
        Eşleştirme Önerileri ({visible.length})
      </h4>
      <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#3730A3' }}>
        Bu talep kalemleri Malzeme Listesi'ndeki hiçbir kalemle isim olarak birebir
        eşleşmiyor ama şuna benziyor olabilir — onaylarsanız kalıcı olarak bağlanır.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {visible.map(s => (
          <div key={s.itemId} style={{ background: '#fff', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                "{s.typedName}" ({formatQty(s.quantity)} {s.unit}) <span style={{ color: '#94A3B8', fontWeight: 500 }}>→ belki:</span> {s.candidateName}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#6B7280' }}>
                {s.requestNo || s.requestTitle || 'Talep'} · benzerlik %{Math.round(s.score * 100)}
              </p>
              {errorById[s.itemId] && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#DC2626' }}>{errorById[s.itemId]}</p>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => approve(s)} disabled={busyId === s.itemId}
                style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Onayla
              </button>
              <button onClick={() => dismiss(s.itemId)} disabled={busyId === s.itemId}
                style={{ background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Yoksay
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Ayrıca "Satın Alma > Onaylar" alt-sekmesinde (ProjeTabSatinAlma.jsx) tek başına
// kullanılabilsin diye export edildi — o sekme yalnızca bu paneli, bu dosyanın Malzeme
// Listesi tablosu olmadan gösterir (iki yerde de aynı review_procurement_item_change_request
// aksiyonu, farklı bağlamda — bkz. BekleyenDegisikliklerPanel'in tek kalem üzerindeki eşdeğeri
// olan MalzemeDetayModal için yukarıdaki yorum).
export function BekleyenDegisikliklerPanel({ items, onReviewed }) {
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

// "Miktar Artışı — Onay Bekliyor: X → Y" satır-içi rozeti öncesinde her zaman tam
// metin gösteriyordu — çok kalem birden bekleyen değişikliğe sahip olunca (bkz.
// ekran görüntüsü, 04.09.2026) PLANLANAN MİKTAR kolonu aşırı genişleyip tabloyu
// dağıtıyordu. BomEslesmeRozeti'yle (ProjeTabAylikPlan.jsx) aynı fikir: kompakt
// bir simge, tıklanınca detayı gösteren fixed-position bir kutu açılır.
function MiktarArtisiRozeti({ pendingChange, unit }) {
  const [open, setOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState(null)
  const ref = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target) && !(btnRef.current && btnRef.current.contains(e.target))) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function toggle(e) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopoverStyle({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 260) })
    }
    setOpen(v => !v)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Miktar artışı onay bekliyor — detay için tıklayın"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', border: '1px solid #FDE68A',
          background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 800,
          cursor: 'pointer', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit',
        }}
      >↑</button>
      {open && popoverStyle && (
        <div
          ref={ref}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: popoverStyle.top, left: popoverStyle.left, zIndex: 1200, width: 240,
            background: '#111827', color: '#fff', borderRadius: 10, padding: '10px 12px',
            fontSize: 12, lineHeight: 1.5, boxShadow: '0 8px 20px rgba(0,0,0,.25)',
          }}
        >
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>Miktar Artışı — Onay Bekliyor</p>
          <p style={{ margin: '0 0 4px', color: '#CBD5E1' }}>
            {formatQty(pendingChange.old_planned_qty)} → {formatQty(pendingChange.new_planned_qty)} {unit}
          </p>
          {pendingChange.requester_name && (
            <p style={{ margin: '0 0 4px', color: '#CBD5E1' }}>Talep eden: {pendingChange.requester_name}</p>
          )}
          <p style={{ margin: 0, color: '#CBD5E1' }}>{pendingChange.note || 'Gerekçe girilmedi'}</p>
        </div>
      )}
    </span>
  )
}

// Malzeme satırına tıklanınca açılan tek modal — önce detay (stat kartları),
// ardından (varsa) bekleyen değişikliğin onay/red kısmı ya da (yoksa ve
// canRequest ise) yeni bir revizyon talebi açan inline form, en altta da
// onaylanmış değişikliklerin geçmişi. Öncesinde bu üçü ayrı yerlerdeydi
// (satır-içi "Düzenle" butonu → ayrı MiktarDuzenleModal, üstteki admin-only
// BekleyenDegisikliklerPanel, ve bu modal yalnızca geçmişi gösteriyordu) —
// kullanıcı isteğiyle (07.09.2026) malzemeye tıklayınca hepsi tek yerde.
// BekleyenDegisikliklerPanel (tüm kalemleri tek ekranda toplu taramak için)
// artık burada değil, Satın Alma'nın "Onaylar" alt-sekmesinde (09.09.2026,
// kullanıcı isteği) — bu modal aynı onay/red aksiyonunu tek bir kalem
// bağlamında hâlâ sunar, o an incelenen kalem için ayrı sekmeye gitmeye gerek
// kalmasın diye.
function MalzemeDetayModal({ row, projectId, pendingChange, canRequest, canReview, onClose, onSaved }) {
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [showEditForm, setShowEditForm] = useState(false)
  const [newQty, setNewQty] = useState(row.planned || 0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitErr, setSubmitErr] = useState('')

  const [reviewNote, setReviewNote] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewErr, setReviewErr] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      // Yalnızca onaylanmış (dolayısıyla stok durumunu gerçekten değiştirmiş) talepler —
      // reddedilenler burada gösterilmez, hiçbir şeyi değiştirmediler.
      supabase.from('procurement_item_change_requests').select('*').eq('procurement_item_id', row.id).eq('status', 'onaylandi'),
      // Bu kalem onaylı bir "yeni malzeme ekleme" talebiyle oluşturulmuş olabilir — o talep
      // procurement_item_id'yi hiç taşımaz (kalem henüz yokken açıldı), bu yüzden proje +
      // malzeme adı eşleşmesiyle ayrıca aranıyor (bu projede aynı isimde kalem tekrar
      // eklenmez, çünkü procurement_items için bir silme akışı yok).
      supabase.from('procurement_item_change_requests').select('*')
        .is('procurement_item_id', null).eq('status', 'onaylandi').eq('project_id', projectId)
        .ilike('new_equipment', row.material),
      // reversed_at dolu olan bir aşım geri alınmış demektir, artık geçerli bir stok
      // değişikliği değil — listeden hariç tutulur.
      supabase.from('procurement_item_adjustments').select('*').eq('procurement_item_id', row.id).is('reversed_at', null),
    ]).then(([changeRes, addRes, adjustmentRes]) => {
      if (!alive) return
      if (changeRes.error) console.error('material change history error:', changeRes.error)
      if (addRes.error) console.error('material add-request history error:', addRes.error)
      if (adjustmentRes.error) console.error('material adjustment history error:', adjustmentRes.error)
      if (changeRes.error || addRes.error || adjustmentRes.error) setHistoryError('Geçmişin bir bölümü yüklenemedi. Lütfen tekrar deneyin.')
      const changeEvents = [...(changeRes.data || []), ...(addRes.data || [])]
        .map(change => ({ kind: 'change', date: change.requested_at, data: change }))
      const adjustmentEvents = (adjustmentRes.data || [])
        .map(adjustment => ({ kind: 'adjustment', date: adjustment.created_at, data: adjustment }))
      const merged = [...changeEvents, ...adjustmentEvents]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setTimeline(merged)
      setLoading(false)
    })
    return () => { alive = false }
  }, [row.id, row.material, projectId, reloadKey])

  async function submitChange(e) {
    e.preventDefault()
    setSaving(true)
    setSubmitErr('')
    const { error } = await supabase.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: row.id,
      p_new_planned_qty: Number(newQty),
      p_note: note.trim() || null,
    })
    setSaving(false)
    if (error) { setSubmitErr(toUserMessage(error)); return }
    setShowEditForm(false)
    setNote('')
    onSaved?.()
  }

  async function review(approve) {
    setReviewBusy(true)
    setReviewErr('')
    const { error } = await supabase.rpc('review_procurement_item_change_request', {
      p_id: pendingChange.id,
      p_approve: approve,
      p_review_note: reviewNote.trim() || null,
    })
    setReviewBusy(false)
    if (error) { setReviewErr(toUserMessage(error)); return }
    setReviewNote('')
    onSaved?.()
    setReloadKey(k => k + 1)
  }

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, padding: 18, background: 'rgba(15, 23, 42, .42)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: 680, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 26, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>{row.material}</h3>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#64748B' }}>Malzeme detayı, revizyon ve değişim geçmişi</p>
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

        {pendingChange ? (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#92400E' }}>Bekleyen Değişiklik</h4>
            <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#111827' }}>
              {formatQty(pendingChange.old_planned_qty)} → {formatQty(pendingChange.new_planned_qty)} {row.unit}
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#78716C' }}>
              {pendingChange.requester_name || 'Proje yöneticisi'} · {pendingChange.note || 'Gerekçe girilmedi'}
            </p>
            {canReview ? (
              <>
                <input
                  type="text" placeholder="Not (opsiyonel)" value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                  style={{ width: '100%', border: '1px solid #FDE68A', borderRadius: 6, padding: '6px 9px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 8, background: '#fff' }}
                />
                {reviewErr && <p style={{ margin: '0 0 8px', color: '#EF4444', fontSize: 12 }}>{reviewErr}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => review(true)} disabled={reviewBusy}
                    style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Onayla
                  </button>
                  <button onClick={() => review(false)} disabled={reviewBusy}
                    style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Reddet
                  </button>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: '#78716C', fontStyle: 'italic' }}>Yönetici onayı bekleniyor.</p>
            )}
          </div>
        ) : canRequest && (
          <div style={{ marginBottom: 20 }}>
            {!showEditForm ? (
              <button onClick={() => setShowEditForm(true)}
                style={{ background: '#EFF6FF', color: '#185FA5', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Planlanan Miktarı Değiştir
              </button>
            ) : (
              <form onSubmit={submitChange} style={{ background: '#F8FAFC', border: '1px solid var(--color-border-md)', borderRadius: 10, padding: 14 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#334155' }}>Miktarı Revize Et</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Mevcut Miktar</label>
                    <div style={{ padding: '7px 10px', fontSize: 13, color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 7 }}>{formatQty(row.planned)} {row.unit}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Yeni Miktar *</label>
                    <input required type="number" min="0.01" step="0.01" value={newQty} onChange={e => setNewQty(e.target.value)}
                      style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 7, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Gerekçe</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Neden değişiyor..."
                    style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 7, padding: '7px 10px', fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical', minHeight: 52 }} />
                </div>
                {submitErr && <p style={{ color: '#EF4444', fontSize: 12.5, marginBottom: 10 }}>{submitErr}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" onClick={() => { setShowEditForm(false); setSubmitErr('') }}
                    style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 7, padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Vazgeç
                  </button>
                  <button type="submit" disabled={saving}
                    style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Gönderiliyor…' : 'Onaya Gönder'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {loading ? <p style={{ color: '#64748B', fontSize: 13 }}>Geçmiş yükleniyor…</p> : (
          <>
            {historyError && <p style={{ margin: '0 0 12px', padding: '8px 10px', borderRadius: 8, background: '#FEF2F2', color: '#991B1B', fontSize: 12 }}>{historyError}</p>}
            <h4 style={{ margin: '0 0 9px', fontSize: 13, color: '#334155' }}>Onaylanan Değişiklikler</h4>
            {timeline.length === 0 ? <p style={{ margin: 0, color: '#94A3B8', fontSize: 12.5 }}>Bu kalem için stok değişikliği kaydı yok.</p> : timeline.map(event => {
              if (event.kind === 'adjustment') {
                const adjustment = event.data
                return (
                  <div key={`adj-${adjustment.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 12.5 }}>
                    <span style={{ color: '#64748B' }}>{adjustment.created_at ? new Date(adjustment.created_at).toLocaleDateString('tr-TR') : '—'}</span>
                    <strong style={{ color: '#166534' }}>+{formatQty(adjustment.delta_qty)} {row.unit}</strong>
                  </div>
                )
              }
              const change = event.data
              const isAdd = change.procurement_item_id === null
              return (
                <div key={`chg-${change.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 12.5 }}>
                  <span style={{ color: '#64748B' }}>{change.requested_at ? new Date(change.requested_at).toLocaleDateString('tr-TR') : '—'}</span>
                  <strong style={{ color: '#166534' }}>
                    {isAdd
                      ? <>Yeni malzeme: {formatQty(change.new_planned_qty)} {row.unit}</>
                      : <>{formatQty(change.old_planned_qty)} → {formatQty(change.new_planned_qty)} {row.unit}</>}
                  </strong>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export default function ProjeTabFaturaKesilecekler({ rows = [], loading, pendingChanges = [], onPendingChanged, projectId, openChangeRequestId, onOpenedChangeRequest, requests = [], procurement = [] }) {
  const { isAdmin, role } = useAuth()
  const [detailRow, setDetailRow] = useState(null)
  const [showNewMaterial, setShowNewMaterial] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  // "Değişiklik Talep Eden" filtresi (09.09.2026, kullanıcı isteği) — bekleyen bir
  // değişiklik/ekleme talebi olan kalemleri talebi açan kişiye göre ayırt edebilmek için.
  const [requesterFilter, setRequesterFilter] = useState('')
  // Kategori başlıklarına tıklanınca o grup kapanıp açılabilsin diye (04.09.2026,
  // kullanıcı isteği) — kapalı olan kategori adlarının kümesi. Varsayılan: hepsi açık.
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set())
  function toggleCategory(category) {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const canRequest = isAdmin || role === 'proje_yoneticisi'
  // Bir talebin onaylayıcısı artık her zaman admin değil — talebi açan hesaba göre
  // create_procurement_item_change_request/create_procurement_item_add_request'in
  // belirlediği approver_role'e bağlı (bkz. 09.09.2026 değişikliği: Osman Karadoğan/
  // Cem Aslan admin hesaplarından açılan talepler proje yöneticisine düşer). Admin
  // gözetim amacıyla her zaman onaylayabilir (fatura onay akışındaki desenle aynı).
  const canReviewItem = (item) => isAdmin || (role === 'proje_yoneticisi' && item?.approver_role === 'proje_yoneticisi')
  const pending = canRequest ? pendingChanges : []
  const { toast, showToast } = useToast()
  const bomMatchSuggestions = useMemo(
    () => (canRequest ? suggestBomMatches(requests, procurement) : []),
    [canRequest, requests, procurement]
  )

  // Bildirimler'den bir malzeme miktarı değişikliği bildirimine tıklanınca artık modal
  // açmıyoruz (04.09.2026, kullanıcı kararı — öncesinde doğrudan MalzemeGecmisiModal
  // açılıyordu) — yalnızca talebin bağlı olduğu procurement_items satırını bulup,
  // gerekirse arama/kategori filtresini temizleyip kategorisini açıp, listede o satırı
  // vurguluyoruz (bkz. useHighlightRow). "Yeni malzeme" talepleri (procurement_item_id
  // null) için henüz gerçek bir satır yok — bu durumda hâlâ yalnızca sayfaya gelinir.
  const [highlightItemId, setHighlightItemId] = useState(null)
  // Kullanıcı bu sayfada zaten açıkken bildirim geldiyse `rows` (üst bileşenden
  // gelen prop) henüz o kalemin eklenmesinden ÖNCEki hâliyle donmuş olabilir —
  // `useDashboardData`'nın kendi visibilitychange/60sn yenileme dışında bu
  // sayfada ayrı bir realtime aboneliği yok. Hedef `rows`'ta bulunamazsa
  // vazgeçmeden ÖNCE `onPendingChanged` (üst bileşenin `refetch`'i) ile bir kez
  // tazeleyip tekrar deniyoruz (04.09.2026'da bulunan bug — öncesinde ilk
  // denemede bulunamayınca sessizce vazgeçiyordu).
  const retriedChangeRequestRef = useRef(null)
  useEffect(() => {
    if (!openChangeRequestId) { retriedChangeRequestRef.current = null; return }
    let alive = true
    supabase.from('procurement_item_change_requests').select('id, procurement_item_id')
      .eq('id', openChangeRequestId).maybeSingle().then(({ data }) => {
        if (!alive) return
        const target = data?.procurement_item_id ? rows.find(r => r.id === data.procurement_item_id) : null
        if (target) {
          const rowCategory = target.category || 'Diğer'
          setSearch('')
          setCategoryFilter('')
          setCollapsedCategories(prev => {
            if (!prev.has(rowCategory)) return prev
            const next = new Set(prev)
            next.delete(rowCategory)
            return next
          })
          setHighlightItemId(target.id)
        } else if (!loading) {
          if (data?.procurement_item_id && retriedChangeRequestRef.current !== openChangeRequestId) {
            retriedChangeRequestRef.current = openChangeRequestId
            onPendingChanged?.()
            return
          }
          // rows tazelendi/tam yüklendi ama hâlâ eşleşme yok — ya "yeni malzeme"
          // talebi (henüz gerçek bir satır yok, bu normal — sessizce yalnızca
          // sayfaya gelinir) ya da `data` da null (değişiklik talebinin kendisi
          // silinmiş) — yalnızca bu ikinci durumda toast gösteriyoruz.
          if (!data) {
            showToast('Bu bildirim artık mevcut olmayan bir değişiklik talebine işaret ediyor.', 'error')
          }
          onOpenedChangeRequest?.()
        }
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChangeRequestId, rows, loading])

  // Onaya gönderilmiş yeni malzeme talepleri henüz gerçek bir procurement_items satırı
  // değil — ayrı bir kutuda gizli kalmasın diye listeye "Bekliyor" rozetli sanal bir satır
  // olarak eklenir, miktar değişikliği taleplerinin satır-içi rozetiyle tutarlı görünür.
  const pendingNewRows = pending.filter(item => item.is_new).map(item => ({
    id: `pending-new-${item.id}`,
    material: item.equipment || 'Yeni malzeme',
    unit: item.unit || '',
    planned: Number(item.new_planned_qty || 0),
    sent: 0,
    required: Number(item.new_planned_qty || 0),
    addedQty: 0,
    addedViaCount: 0,
    isPendingNew: true,
    requesterName: item.requester_name || null,
  }))
  const pendingByItemId = new Map(pending.map(p => [p.procurement_item_id, p]))
  // "Değişiklik Talep Eden" filtresi (09.09.2026, kullanıcı isteği) — bir kalemin
  // bekleyen değişiklik/ekleme talebini kimin açtığını satır bazında bulup, seçilen
  // kişiye göre listeyi daraltır (yeni malzeme satırları için requesterName zaten
  // yukarıda taşınıyor, mevcut kalemler için pendingByItemId'den okunur).
  function rowRequesterName(row) {
    return row.isPendingNew ? row.requesterName : (pendingByItemId.get(row.id)?.requester_name || null)
  }
  const pendingRequesterNames = [...new Set(pending.map(p => p.requester_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'))
  const searchTerm = search.trim().toLocaleLowerCase('tr')
  const allRowsUnfiltered = [...pendingNewRows, ...rows]
  const allRows = allRowsUnfiltered
    .filter(row => !searchTerm || (row.material || '').toLocaleLowerCase('tr').includes(searchTerm))
    .filter(row => !categoryFilter || row.category === categoryFilter)
    .filter(row => !requesterFilter || rowRequesterName(row) === requesterFilter)

  // Kategoriler artık ayrı bir sütunda değil, Aylık Satın Alma Planı'yla aynı desende
  // (bkz. ProjeTabAylikPlan.jsx'teki FragmentGroup) bir grup başlığı satırıyla belli
  // ediliyor (04.09.2026, kullanıcı isteği — 175 kalemlik tam listede kategoriye göre
  // gezinmek zorlaşmıştı, sayfalamanın kaldırılmasıyla ihtiyaç arttı). Sıralama
  // MALZEME_KATEGORI_OPTS'taki kanonik sırayı takip eder, kategorisiz kalemler "Diğer"e düşer.
  const categoryIndex = Object.fromEntries(MALZEME_KATEGORI_OPTS.map((k, i) => [k, i]))
  const groupKeys = [...new Set(allRows.map(row => row.category || 'Diğer'))]
    .sort((a, b) => (categoryIndex[a] ?? 99) - (categoryIndex[b] ?? 99) || a.localeCompare(b, 'tr'))
  const sortedRows = groupKeys.flatMap(key => allRows.filter(row => (row.category || 'Diğer') === key))
  const groupCounts = new Map(groupKeys.map(key => [key, sortedRows.filter(row => (row.category || 'Diğer') === key).length]))

  const { highlightedId, rowRef } = useHighlightRow(highlightItemId, sortedRows, r => r.id, () => {
    setHighlightItemId(null)
    onOpenedChangeRequest?.()
  })

  return (
    <div>
      <style>{`
        .malz-tt-bubble {
          visibility: hidden; opacity: 0; pointer-events: none;
          position: absolute; left: 0; top: 100%; margin-top: 6px; z-index: 30;
          background: #111827; color: #fff; padding: 7px 11px; border-radius: 8px;
          font-size: 12px; font-weight: 500; line-height: 1.4; white-space: normal;
          max-width: 320px; box-shadow: 0 6px 18px rgba(0,0,0,.22); transition: opacity .12s ease;
        }
        .malz-tt-group:hover .malz-tt-bubble { visibility: visible; opacity: 1; }
      `}</style>
      {/* Bekleyen miktar değişikliklerinin toplu onay/red banner'ı buradan kaldırıldı
          (09.09.2026, kullanıcı isteği) — artık yalnızca Satın Alma'nın "Onaylar"
          alt-sekmesinde (bkz. ProjeTabSatinAlma.jsx, BekleyenDegisikliklerPanel oradan
          da render ediliyor). Tek bir kalemin bekleyen değişikliğini onaylamak hâlâ
          mümkün — o kalemin satırına tıklayıp MalzemeDetayModal'daki inline aksiyondan. */}
      {canRequest && bomMatchSuggestions.length > 0 && <EslestirmeOnerileriPanel suggestions={bomMatchSuggestions} onLinked={onPendingChanged} />}

      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Malzeme Listesi</h3>
          <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>
            {allRowsUnfiltered.length} kalem
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Malzeme ara…"
            style={{ marginLeft: 'auto', width: 280, fontSize: 13, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--color-border-md)', color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'inherit' }}
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--color-border-md)', color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            <option value="">Tüm Kategoriler</option>
            {MALZEME_KATEGORI_OPTS.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {pendingRequesterNames.length > 0 && (
            <select
              value={requesterFilter}
              onChange={e => setRequesterFilter(e.target.value)}
              title="Bekleyen bir değişiklik/ekleme talebi olan kalemleri talep edene göre filtrele"
              style={{ fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--color-border-md)', color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="">Tüm Değişiklik Talep Edenler</option>
              {pendingRequesterNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          {canRequest && (
            <button onClick={() => setShowNewMaterial(true)} style={{ background: 'var(--color-primary)', color: '#fff', border: 0, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              + Yeni Malzeme
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
        ) : allRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
            {(searchTerm || categoryFilter || requesterFilter) ? 'Aramanızla/filtrenizle eşleşen malzeme bulunamadı.' : 'Bu projeye ait malzeme listesi henüz eklenmemiş.'}
          </div>
        ) : (
          <>
          {/* overflowX tek başına yazılırsa tarayıcı overflow-y'yi de (varsayılan
              'visible' olduğundan) otomatik 'auto'ya çeviriyor -- içerik dikeyde
              hiç taşmasa bile bu, sağda gereksiz bir dikey scrollbar'a yol
              açıyordu. overflowY'yi açıkça 'hidden' yazmak bu otomatik
              dönüşümü engelliyor (yatay scroll ihtiyacı hâlâ çalışır). */}
          <div style={{ overflow: 'auto hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr>
                  {['MALZEME', 'PLANLANAN MİKTAR', 'PROJE İÇİN GÖNDERİLEN', 'GÖNDERİLMESİ GEREKEN', ''].map((h, i) => (
                    <th key={h || `col-${i}`} style={{ ...TH, background: 'var(--color-surface)', boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)', width: h ? undefined : 28 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
                  const rowCategory = row.category || 'Diğer'
                  const showCategoryHeader = idx === 0 || rowCategory !== (sortedRows[idx - 1].category || 'Diğer')
                  const isCollapsed = collapsedCategories.has(rowCategory)
                  const totalColumns = 5
                  const categoryHeader = showCategoryHeader && (
                    <tr onClick={() => toggleCategory(rowCategory)} style={{ cursor: 'pointer' }}>
                      <td colSpan={totalColumns} style={{ padding: '7px 14px', background: 'var(--color-bg)', fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.35px', borderBottom: '1px solid var(--color-border)', borderTop: idx === 0 ? 'none' : '1px solid var(--color-border)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-block', transition: 'transform .12s ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', fontSize: 9 }}>▾</span>
                          {rowCategory}
                          <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--color-muted)' }}>({groupCounts.get(rowCategory)})</span>
                        </span>
                      </td>
                    </tr>
                  )
                  if (isCollapsed) {
                    return <Fragment key={row.id || row.material}>{categoryHeader}</Fragment>
                  }
                  if (row.isPendingNew) {
                    return (
                      <Fragment key={row.id}>
                        {categoryHeader}
                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: '#FFFBEB' }}>
                          <MaterialNameCell name={row.material} style={{ fontWeight: 600, color: 'var(--color-text)' }} />
                          <td style={TD} colSpan={4}>
                            <span style={{ fontSize: 10.5, lineHeight: 1.4, fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                              Yeni Malzeme — Onay Bekliyor: {formatQty(row.planned)} {row.unit}
                            </span>
                          </td>
                        </tr>
                      </Fragment>
                    )
                  }
                  const pendingChange = pendingByItemId.get(row.id)
                  return (
                  <Fragment key={row.id || row.material}>
                    {categoryHeader}
                    <tr
                      ref={rowRef(row.id)}
                      className={highlightedId === row.id ? 'row-highlight-flash' : undefined}
                      onClick={() => setDetailRow(row)}
                      style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                    >
                    <MaterialNameCell name={row.material} style={{ fontWeight: 600, color: 'var(--color-text)' }} />
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
                        {pendingChange && <MiktarArtisiRozeti pendingChange={pendingChange} unit={row.unit} />}
                      </div>
                    </td>
                    <td style={{ ...TD, fontWeight: 600, color: 'var(--color-success)' }}>{formatQty(row.sent)} {row.unit}</td>
                    <td style={{ ...TD, fontWeight: 700, color: row.required > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                      {formatQty(row.required)} {row.unit}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {row.hasHistory && (
                        <span
                          title="Bu kalemde değişiklik geçmişi var — detay için tıklayın"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 17, height: 17, borderRadius: '50%', background: '#dc2626',
                            color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1,
                          }}
                        >!</span>
                      )}
                    </td>
                    </tr>
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {detailRow && (
        <MalzemeDetayModal
          row={detailRow}
          projectId={projectId}
          pendingChange={pendingByItemId.get(detailRow.id)}
          canRequest={canRequest}
          canReview={canReviewItem(pendingByItemId.get(detailRow.id))}
          onClose={() => setDetailRow(null)}
          onSaved={onPendingChanged}
        />
      )}
      {showNewMaterial && (
        <YeniMalzemeEkleModal
          projectId={projectId}
          onClose={() => setShowNewMaterial(false)}
          onSaved={() => onPendingChanged?.()}
        />
      )}
      <Toast toast={toast} />
    </div>
  )
}
