import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const PRI_OPTS = [{ v: 'kritik', l: 'Kritik' }, { v: 'önemli', l: 'Önemli' }, { v: 'normal', l: 'Normal' }]
const STA_OPTS = [
  { v: 'planlandı',       l: 'Planlandı' },
  { v: 'sipariş_verildi', l: 'Sipariş Verildi' },
  { v: 'teslim_edildi',   l: 'Teslim Edildi' },
  { v: 'iptal',           l: 'İptal' },
  { v: 'gecikmiş',        l: 'Gecikmiş' },
]

const DEF = {
  category: '', equipment: '', quantity: '', unit: '', brand_criteria: '',
  warranty_years: '', responsible: 'Yüklenici', lead_time_days: '',
  priority: 'normal', status: 'planlandı', supplier: '',
  order_date: '', expected_delivery: '', notes: '',
}

const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.03em' }
const inp = { padding: '0.45rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' }
const btnP = { padding: '0.5rem 1.1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim5Tedarik({ projectId, result, onDone, onBack, mode = 'new' }) {
  const [rows,  setRows]  = useState(() => {
    if (mode === 'edit') return []
    if (result?.rows?.length) {
      return result.rows.map((r, i) => ({
        ...DEF, ...r,
        _id: Date.now() + i,
        warranty_years: String(r.warranty_years ?? ''),
        lead_time_days: String(r.lead_time_days ?? ''),
      }))
    }
    return [{ ...DEF, _id: 1 }]
  })
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (mode !== 'edit' || loadedRef.current) return
    loadedRef.current = true
    supabase.from('procurement_items').select('*').eq('project_id', projectId)
      .then(({ data }) => {
        setRows(data?.length
          ? data.map((r, i) => ({ ...DEF, ...r, _id: r.id ?? (Date.now() + i), warranty_years: String(r.warranty_years ?? ''), lead_time_days: String(r.lead_time_days ?? '') }))
          : [])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() { setRows(r => [...r, { ...DEF, _id: Date.now() }]) }
  function upd(_id, k, v) { setRows(r => r.map(row => row._id === _id ? { ...row, [k]: v } : row)) }
  function del(_id) { setRows(r => r.filter(row => row._id !== _id)) }

  function handleSave() {
    setError(null)
    if (rows.length === 0) { onDone({ skipped: true, count: 0 }); return }
    const invalid = rows.filter(r => !r.equipment?.trim())
    if (invalid.length > 0) { setError('"Ekipman/Ürün" adı zorunludur.'); return }
    const payload = rows.map(({ _id, id, created_at, ...r }) => ({
      project_id:        projectId,
      category:          r.category          || null,
      equipment:         r.equipment,
      quantity:          r.quantity          || null,
      unit:              r.unit              || null,
      brand_criteria:    r.brand_criteria    || null,
      warranty_years:    r.warranty_years !== '' ? Number(r.warranty_years) : null,
      responsible:       r.responsible       || 'Yüklenici',
      lead_time_days:    r.lead_time_days !== '' ? Number(r.lead_time_days) : null,
      priority:          r.priority,
      status:            r.status,
      supplier:          r.supplier          || null,
      order_date:        r.order_date        || null,
      expected_delivery: r.expected_delivery || null,
      notes:             r.notes             || null,
    }))
    onDone({ rows: payload, skipped: false, count: rows.length })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım 5 — Tedarik</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Opsiyonel — procurement_items</span>
      </div>

      <div style={{ padding: '1rem 1.5rem', maxHeight: '62vh', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {rows.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '1.5rem 0' }}>
            Henüz tedarik kalemi yok — "+ Tedarik Ekle" ile başlayın.
          </p>
        )}

        {rows.map((row, idx) => (
          <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Tedarik #{idx + 1}
              </span>
              <button onClick={() => del(row._id)} title="Sil" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <div>
                <label style={lbl}>Kategori</label>
                <input style={inp} value={row.category} onChange={e => upd(row._id, 'category', e.target.value)} placeholder="Kategori" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Ekipman / Ürün <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inp} value={row.equipment} onChange={e => upd(row._id, 'equipment', e.target.value)} placeholder="Ürün adı" />
              </div>
              <div>
                <label style={lbl}>Miktar</label>
                <input style={inp} value={row.quantity} onChange={e => upd(row._id, 'quantity', e.target.value)} placeholder="100" />
              </div>
              <div>
                <label style={lbl}>Birim</label>
                <input style={inp} value={row.unit} onChange={e => upd(row._id, 'unit', e.target.value)} placeholder="adet" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Marka Kriteri</label>
                <input style={inp} value={row.brand_criteria} onChange={e => upd(row._id, 'brand_criteria', e.target.value)} placeholder="Marka / model" />
              </div>
              <div>
                <label style={lbl}>Garanti (Yıl)</label>
                <input style={inp} type="number" min="0" value={row.warranty_years} onChange={e => upd(row._id, 'warranty_years', e.target.value)} placeholder="2" />
              </div>
              <div>
                <label style={lbl}>Sorumlu</label>
                <input style={inp} value={row.responsible} onChange={e => upd(row._id, 'responsible', e.target.value)} placeholder="Yüklenici" />
              </div>
              <div>
                <label style={lbl}>Temin Süresi (Gün)</label>
                <input style={inp} type="number" min="0" value={row.lead_time_days} onChange={e => upd(row._id, 'lead_time_days', e.target.value)} placeholder="30" />
              </div>
              <div>
                <label style={lbl}>Öncelik</label>
                <select style={inp} value={row.priority} onChange={e => upd(row._id, 'priority', e.target.value)}>
                  {PRI_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Durum</label>
                <select style={inp} value={row.status} onChange={e => upd(row._id, 'status', e.target.value)}>
                  {STA_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Tedarikçi</label>
                <input style={inp} value={row.supplier} onChange={e => upd(row._id, 'supplier', e.target.value)} placeholder="Firma adı" />
              </div>
              <div>
                <label style={lbl}>Sipariş Tarihi</label>
                <input style={inp} type="date" value={row.order_date} onChange={e => upd(row._id, 'order_date', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Beklenen Teslimat</label>
                <input style={inp} type="date" value={row.expected_delivery} onChange={e => upd(row._id, 'expected_delivery', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <label style={lbl}>Notlar</label>
                <input style={inp} value={row.notes} onChange={e => upd(row._id, 'notes', e.target.value)} placeholder="Ek notlar" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addRow} style={{ ...btnS, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.4rem' }}>
          + Tedarik Ekle
        </button>
      </div>

      <div style={{ display: 'none' }}>
        <button style={btnS} onClick={onBack}>← Geri</button>
        <button style={btnS} onClick={() => onDone({ skipped: true, count: 0 })}>Bu Adımı Atla</button>
        <button data-wizard-submit="next" style={btnP} onClick={handleSave}>Devam →</button>
      </div>
    </div>
  )
}
