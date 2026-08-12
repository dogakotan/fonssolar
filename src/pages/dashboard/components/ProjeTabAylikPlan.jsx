import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import { toUserMessage as translateError } from '../../../utils/errors'
import DataStatusBanner from '../../../components/ui/DataStatusBanner'
import { MALZEME_KATEGORI_OPTS } from './ProjeTabFaturaKesilecekler'

const HEADER_HEIGHT = 24
const ROW_HEIGHT = 44
const TH = { height: HEADER_HEIGHT, boxSizing: 'border-box', padding: '0 14px', lineHeight: `${HEADER_HEIGHT}px`, textAlign: 'left', fontSize: 9.5, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px', verticalAlign: 'middle' }
const TD = { height: ROW_HEIGHT, boxSizing: 'border-box', padding: '0 14px', fontSize: 13, color: 'var(--color-text-sub)', verticalAlign: 'middle' }
const TD_TRUNCATE = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }

const DURUM_OPTS = [
  { v: 'planlandi', l: 'Planlandı', color: '#64748B', bg: '#F1F5F9' },
  { v: 'siparis_verildi', l: 'Sipariş Verildi', color: '#B45309', bg: '#FEF3C7' },
  { v: 'teslim_alindi', l: 'Teslim Alındı', color: '#166534', bg: '#DCFCE7' },
]
const DURUM_META = Object.fromEntries(DURUM_OPTS.map(o => [o.v, o]))

const formatQty = (value) =>
  value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })

function toUserMessage(error) {
  return translateError(error, { fallback: err => err?.message || 'Kaydedilemedi. Lütfen tekrar deneyin.' })
}

// procurement_items ile eşleştirilmiş bir plan kalemi için "BOM'da mevcut" rozeti —
// tıklanınca eşleşen BOM kaydının (equipment/spec_ref/planned_qty) detayını küçük
// bir popover'da gösterir. Dışarı tıklanınca kapanır.
function BomEslesmeRozeti({ item }) {
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

  if (!item) return null

  // Rozet tablonun `overflow:'auto hidden'` kaydırma kutusu içinde olduğundan
  // (yatay scroll için gerekli), position:'absolute' bir popover dikeyde
  // kırpılıyordu — bu yüzden konum, tetikleyici butona göre `position:'fixed'`
  // olarak hesaplanıp kaydırma kapsayıcısının dışına render ediliyor.
  function toggle(e) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopoverStyle({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 250) })
    }
    setOpen(v => !v)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle', marginLeft: 6 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="BOM'da mevcut — detay için tıklayın"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #86EFAC',
          background: '#F0FDF4', color: 'var(--color-success)', borderRadius: 20, padding: '1px 8px',
          fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        BOM'da mevcut
      </button>
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
          <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{item.equipment}</p>
          {item.spec_ref && <p style={{ margin: '0 0 2px', color: '#CBD5E1' }}>Şartname: {item.spec_ref}</p>}
          <p style={{ margin: 0, color: '#CBD5E1' }}>Planlanan: {formatQty(item.planned_qty)} {item.unit || ''}</p>
        </div>
      )}
    </span>
  )
}

const INPUT = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px',
  fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}
const LABEL = { fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }

function YeniPlanKalemiModal({ projectId, defaultAyNo, procurementItems, onClose, onSaved }) {
  const [form, setForm] = useState({
    kategori: '', kalem_adi: '', ozellik: '', birim: '', miktar: '', not_metni: '', ay_no: defaultAyNo || 1,
  })
  const [bomSearch, setBomSearch] = useState('')
  const [bomMenuOpen, setBomMenuOpen] = useState(false)
  const [selectedBom, setSelectedBom] = useState(null)
  const bomRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!bomMenuOpen) return
    function onOutside(e) { if (bomRef.current && !bomRef.current.contains(e.target)) setBomMenuOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [bomMenuOpen])

  const setF = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const bomMatches = bomSearch.trim()
    ? procurementItems.filter(p => (p.equipment || '').toLocaleLowerCase('tr').includes(bomSearch.trim().toLocaleLowerCase('tr'))).slice(0, 30)
    : procurementItems.slice(0, 30)

  function selectBom(item) {
    setSelectedBom(item)
    setBomSearch(item.equipment)
    setBomMenuOpen(false)
  }

  function clearBom() {
    setSelectedBom(null)
    setBomSearch('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    const { error } = await supabase.from('procurement_monthly_plan').insert({
      project_id: projectId,
      procurement_item_id: selectedBom?.id || null,
      ay_no: Number(form.ay_no) || 1,
      kategori: form.kategori || null,
      kalem_adi: form.kalem_adi.trim(),
      ozellik: form.ozellik.trim() || null,
      birim: form.birim.trim() || null,
      miktar: form.miktar === '' ? null : Number(form.miktar),
      not_metni: form.not_metni.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Aylık Plana Yeni Kalem Ekle</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748B' }}>
          Ay bazlı satın alma planına yeni bir kalem ekleyin. Mevcut bir malzeme listesi (BOM) kalemiyle eşleştirmek opsiyoneldir.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={LABEL}>Ay *</label>
              <input required type="number" min="1" step="1" value={form.ay_no} onChange={setF('ay_no')} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Kategori</label>
              <select value={form.kategori} onChange={setF('kategori')} style={{ ...INPUT, background: '#fff' }}>
                <option value="">Seçiniz</option>
                {MALZEME_KATEGORI_OPTS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Kalem Adı *</label>
            <input required autoFocus value={form.kalem_adi} onChange={setF('kalem_adi')} placeholder="Örn: DC Solar Kablo" style={INPUT} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Özellik</label>
            <input value={form.ozellik} onChange={setF('ozellik')} placeholder="Örn: 4mm² tek damar" style={INPUT} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={LABEL}>Birim</label>
              <input value={form.birim} onChange={setF('birim')} placeholder="Örn: Metre, Adet" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Miktar</label>
              <input type="number" min="0" step="0.01" value={form.miktar} onChange={setF('miktar')} style={INPUT} />
            </div>
          </div>

          <div style={{ marginBottom: 14, position: 'relative' }} ref={bomRef}>
            <label style={LABEL}>BOM'dan Eşleştir (opsiyonel)</label>
            <div style={{ position: 'relative' }}>
              <input
                value={bomSearch}
                onChange={e => { setBomSearch(e.target.value); setSelectedBom(null); setBomMenuOpen(true) }}
                onFocus={() => setBomMenuOpen(true)}
                placeholder="Malzeme listesinde ara…"
                style={{ ...INPUT, paddingRight: selectedBom ? 30 : 12 }}
              />
              {selectedBom && (
                <button
                  type="button"
                  onClick={clearBom}
                  title="Eşleştirmeyi kaldır"
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
                >✕</button>
              )}
            </div>
            {bomMenuOpen && bomMatches.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50,
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 180,
                overflowY: 'auto', boxShadow: '0 12px 28px rgba(15,23,42,0.16)',
              }}>
                {bomMatches.map(item => (
                  <div
                    key={item.id}
                    onClick={() => selectBom(item)}
                    style={{ padding: '8px 10px', fontSize: 13, cursor: 'pointer', color: '#111827', borderBottom: '1px solid #F3F4F6' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                  >
                    {item.equipment}
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#9CA3AF' }}>({formatQty(item.planned_qty)} {item.unit})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={LABEL}>Not</label>
            <textarea value={form.not_metni} onChange={setF('not_metni')} placeholder="Ek açıklama..."
              style={{ ...INPUT, resize: 'vertical', minHeight: 60 }} />
          </div>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Vazgeç
            </button>
            <button type="submit" disabled={saving || !form.kalem_adi.trim()} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || !form.kalem_adi.trim()) ? 0.7 : 1 }}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const BULK_INPUT = {
  width: '100%', border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 7px',
  fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}
let bulkRowSeq = 0
function makeBulkRow() {
  bulkRowSeq += 1
  return { _id: bulkRowSeq, kategori: '', kalem_adi: '', ozellik: '', birim: '', miktar: '', not_metni: '' }
}

// İlk ayın 24 kalemi gibi büyük listeler tek tek "+ Yeni Kalem" modalıyla (her
// seferinde aç/kapa) girilemeyecek kadar çok olduğundan — aynı formun satır
// satır çoğaltılmış hali: tek modalda birden çok kalem art arda girilip TEK
// seferde kaydedilir. Excel'den içe aktarma kasıtlı olarak YOK (kullanıcı
// kararı) — liste doğrudan bu ekrandan, elle giriliyor.
function TopluKalemEkleModal({ projectId, defaultAyNo, procurementItems, onClose, onSaved }) {
  const [ayNo, setAyNo] = useState(defaultAyNo || 1)
  const [rows, setRows] = useState(() => Array.from({ length: 8 }, makeBulkRow))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const procurementByEquipment = new Map(
    procurementItems.map(i => [(i.equipment || '').trim().toLocaleLowerCase('tr'), i.id])
  )

  function updateRow(id, field, value) {
    setRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r))
  }
  function addRow() { setRows(prev => [...prev, makeBulkRow()]) }
  function removeRow(id) { setRows(prev => prev.filter(r => r._id !== id)) }

  const filledRows = rows.filter(r => r.kalem_adi.trim())

  async function handleSubmit(e) {
    e.preventDefault()
    if (filledRows.length === 0) { setErr('En az bir satıra Kalem Adı girmelisiniz.'); return }
    setSaving(true)
    setErr('')
    const payload = filledRows.map(r => ({
      project_id: projectId,
      procurement_item_id: procurementByEquipment.get(r.kalem_adi.trim().toLocaleLowerCase('tr')) || null,
      ay_no: Number(ayNo) || 1,
      kategori: r.kategori || null,
      kalem_adi: r.kalem_adi.trim(),
      ozellik: r.ozellik.trim() || null,
      birim: r.birim.trim() || null,
      miktar: r.miktar === '' ? null : Number(r.miktar),
      not_metni: r.not_metni.trim() || null,
    }))
    const { error } = await supabase.from('procurement_monthly_plan').insert(payload)
    setSaving(false)
    if (error) { setErr(toUserMessage(error)); return }
    onSaved()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 920, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Aylık Plana Toplu Kalem Ekle</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#6B7280', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#64748B' }}>
          Aynı aya ait birden çok kalemi tek seferde girin. Kalem Adı boş bırakılan satırlar kaydedilmez. Kalem adı BOM'daki (Malzeme Listesi) bir malzemeyle birebir eşleşirse otomatik bağlanır.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>Ay *</label>
          <input type="number" min="1" step="1" value={ayNo} onChange={e => setAyNo(e.target.value)} style={{ ...INPUT, width: 90 }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    {['Kategori', 'Kalem Adı *', 'Özellik', 'Birim', 'Miktar', 'Not', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700, color: '#6B7280', fontSize: 10.5, textTransform: 'uppercase', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '4px 8px', minWidth: 130 }}>
                        <select value={row.kategori} onChange={e => updateRow(row._id, 'kategori', e.target.value)} style={{ ...BULK_INPUT, background: '#fff' }}>
                          <option value="">Seçiniz</option>
                          {MALZEME_KATEGORI_OPTS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 8px', minWidth: 160 }}>
                        <input value={row.kalem_adi} onChange={e => updateRow(row._id, 'kalem_adi', e.target.value)} placeholder="Örn: DC Solar Kablo" style={BULK_INPUT} />
                      </td>
                      <td style={{ padding: '4px 8px', minWidth: 140 }}>
                        <input value={row.ozellik} onChange={e => updateRow(row._id, 'ozellik', e.target.value)} style={BULK_INPUT} />
                      </td>
                      <td style={{ padding: '4px 8px', minWidth: 90 }}>
                        <input value={row.birim} onChange={e => updateRow(row._id, 'birim', e.target.value)} placeholder="Adet" style={BULK_INPUT} />
                      </td>
                      <td style={{ padding: '4px 8px', minWidth: 80 }}>
                        <input type="number" min="0" step="0.01" value={row.miktar} onChange={e => updateRow(row._id, 'miktar', e.target.value)} style={BULK_INPUT} />
                      </td>
                      <td style={{ padding: '4px 8px', minWidth: 150 }}>
                        <input value={row.not_metni} onChange={e => updateRow(row._id, 'not_metni', e.target.value)} style={BULK_INPUT} />
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                        <button type="button" onClick={() => removeRow(row._id)} title="Satırı sil" style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 17, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button type="button" onClick={addRow} style={{ background: 'none', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
            + Satır Ekle
          </button>

          {err && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{err}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Vazgeç
            </button>
            <button type="submit" disabled={saving || filledRows.length === 0} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || filledRows.length === 0) ? 0.6 : 1 }}>
              {saving ? 'Kaydediliyor…' : `${filledRows.length} Kalemi Kaydet`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjeTabAylikPlan({ projectId }) {
  const { isMuhasebe } = useAuth()
  const canEdit = !isMuhasebe

  const [plans, setPlans] = useState([])
  const [procurementItems, setProcurementItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ayNo, setAyNo] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [savingId, setSavingId] = useState(null)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [plansRes, itemsRes] = await Promise.all([
      supabase.from('procurement_monthly_plan').select('*').eq('project_id', projectId).order('kategori').order('kalem_adi'),
      supabase.from('procurement_items').select('id, equipment, spec_ref, planned_qty, unit').eq('project_id', projectId),
    ])
    if (plansRes.error) { setError(plansRes.error.message); setLoading(false); return }
    setPlans(plansRes.data || [])
    setProcurementItems(itemsRes.data || [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchPlans() }, [fetchPlans])
  useRealtimeRefresh(['procurement_monthly_plan'], fetchPlans, { enabled: !!projectId, filter: { column: 'project_id', value: projectId } })

  // Ay seçici yalnızca DB'de gerçekten kaydı olan ayları listeler — ay_no=2 için
  // hiç satır girilmeden dropdown'da "2. Ay" görünmez, ilk kayıt eklenince otomatik
  // belirir (hardcoded bir ay listesi yok, "Yeni Kalem Ekle" formundaki Ay alanı
  // serbest sayı girişi olduğundan yeni bir aya ilk kalemi eklemek için kullanılır).
  const availableMonths = [...new Set(plans.map(p => p.ay_no))].sort((a, b) => a - b)
  useEffect(() => {
    if (ayNo === null && availableMonths.length > 0) setAyNo(availableMonths[0])
  }, [ayNo, availableMonths])
  const effectiveAyNo = ayNo ?? availableMonths[0] ?? 1

  const procurementById = new Map(procurementItems.map(i => [i.id, i]))

  const monthPlans = plans.filter(p => p.ay_no === effectiveAyNo)
  const categoryIndex = Object.fromEntries(MALZEME_KATEGORI_OPTS.map((k, i) => [k, i]))
  const groupKeys = [...new Set(monthPlans.map(p => p.kategori || 'Diğer'))]
    .sort((a, b) => (categoryIndex[a] ?? 99) - (categoryIndex[b] ?? 99) || a.localeCompare(b, 'tr'))

  async function handleDurumChange(plan, newDurum) {
    const prevDurum = plan.durum
    setSavingId(plan.id)
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, durum: newDurum } : p))
    const { error: updateError } = await supabase.from('procurement_monthly_plan').update({ durum: newDurum }).eq('id', plan.id)
    setSavingId(null)
    if (updateError) {
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, durum: prevDurum } : p))
      alert(toUserMessage(updateError))
    }
  }

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, overflow: 'hidden' }}>
      <DataStatusBanner error={error} onRetry={fetchPlans} />

      <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--color-border-md)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Aylık Satın Alma Planı</h3>
        <span style={{ background: 'var(--color-bg)', color: 'var(--color-text-sub)', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20 }}>
          {monthPlans.length} kalem
        </span>

        <select
          value={effectiveAyNo}
          onChange={e => setAyNo(Number(e.target.value))}
          style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--color-border-md)', color: 'var(--color-text)', background: 'var(--color-surface)', fontFamily: 'inherit', cursor: 'pointer' }}
        >
          {availableMonths.length === 0
            ? <option value={1}>1. Ay</option>
            : availableMonths.map(m => <option key={m} value={m}>{m}. Ay</option>)}
        </select>

        {canEdit && (
          <>
            <button onClick={() => setShowBulkAdd(true)} style={{ background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              + Toplu Kalem Ekle
            </button>
            <button onClick={() => setShowAdd(true)} style={{ background: 'var(--color-primary)', color: '#fff', border: 0, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              + Yeni Kalem
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>Yükleniyor…</div>
      ) : monthPlans.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
          Bu ay için henüz bir satın alma planı kalemi girilmemiş.
        </div>
      ) : (
        <div style={{ overflow: 'auto hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr>
                {['KALEM ADI', 'ÖZELLİK', 'BİRİM', 'MİKTAR', 'NOT', 'DURUM'].map(h => (
                  <th key={h} style={{ ...TH, background: 'var(--color-surface)', boxShadow: 'inset 0 -1px 0 0 var(--color-border-md)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupKeys.map(kategori => (
                <FragmentGroup
                  key={kategori}
                  kategori={kategori}
                  rows={monthPlans.filter(p => (p.kategori || 'Diğer') === kategori)}
                  procurementById={procurementById}
                  canEdit={canEdit}
                  savingId={savingId}
                  onDurumChange={handleDurumChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <YeniPlanKalemiModal
          projectId={projectId}
          defaultAyNo={effectiveAyNo}
          procurementItems={procurementItems}
          onClose={() => setShowAdd(false)}
          onSaved={fetchPlans}
        />
      )}
      {showBulkAdd && (
        <TopluKalemEkleModal
          projectId={projectId}
          defaultAyNo={effectiveAyNo}
          procurementItems={procurementItems}
          onClose={() => setShowBulkAdd(false)}
          onSaved={fetchPlans}
        />
      )}
    </div>
  )
}

// Bir kategori başlığı + o kategoriye ait satırlar. Ayrı bir bileşen olmasının
// tek sebebi <tbody> içine doğrudan bir dizi <tr> döndürebilmek (React.Fragment
// key gerektirdiğinden burada isimli bir bileşen kullanmak, ham bir dizi
// map'lemekten daha temiz).
function FragmentGroup({ kategori, rows, procurementById, canEdit, savingId, onDurumChange }) {
  return (
    <>
      <tr>
        <td colSpan={6} style={{ padding: '7px 14px', background: 'var(--color-bg)', fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.35px', borderBottom: '1px solid var(--color-border)', borderTop: '1px solid var(--color-border)' }}>
          {kategori}
        </td>
      </tr>
      {rows.map(row => {
        const bomItem = row.procurement_item_id ? procurementById.get(row.procurement_item_id) : null
        const durumMeta = DURUM_META[row.durum] || DURUM_OPTS[0]
        return (
          <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={{ ...TD, fontWeight: 600, color: 'var(--color-text)' }}>
              <span style={{ ...TD_TRUNCATE, display: 'inline-block', verticalAlign: 'middle', maxWidth: 200 }} title={row.kalem_adi}>
                {row.kalem_adi}
              </span>
              {bomItem && <BomEslesmeRozeti item={bomItem} />}
            </td>
            <td style={{ ...TD, ...TD_TRUNCATE }} title={row.ozellik || ''}>{row.ozellik || '—'}</td>
            <td style={TD}>{row.birim || '—'}</td>
            <td style={TD}>{formatQty(row.miktar)}</td>
            <td style={{ ...TD, ...TD_TRUNCATE }} title={row.not_metni || ''}>{row.not_metni || '—'}</td>
            <td style={TD}>
              {canEdit ? (
                <select
                  value={row.durum}
                  disabled={savingId === row.id}
                  onChange={e => onDurumChange(row, e.target.value)}
                  style={{
                    border: `1px solid ${durumMeta.color}33`, borderRadius: 7, padding: '4px 8px', fontSize: 11.5,
                    fontWeight: 700, color: durumMeta.color, background: durumMeta.bg, fontFamily: 'inherit',
                    cursor: savingId === row.id ? 'default' : 'pointer', opacity: savingId === row.id ? 0.6 : 1,
                  }}
                >
                  {DURUM_OPTS.map(opt => <option key={opt.v} value={opt.v}>{opt.l}</option>)}
                </select>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: durumMeta.color, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: durumMeta.color, flexShrink: 0 }} />
                  {durumMeta.l}
                </span>
              )}
            </td>
          </tr>
        )
      })}
    </>
  )
}
