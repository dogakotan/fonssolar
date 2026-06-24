import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const CATEGORY_OPTS = [
  { v: 'mobilizasyon', l: 'Mobilizasyon' },
  { v: 'mekanik',      l: 'Mekanik' },
  { v: 'elektrik_dc',  l: 'Elektrik DC' },
  { v: 'elektrik_ac',  l: 'Elektrik AC' },
  { v: 'elektrik_og',  l: 'Elektrik OG' },
  { v: 'topraklama',   l: 'Topraklama' },
  { v: 'enh',          l: 'ENH' },
  { v: 'devreye_alma', l: 'Devreye Alma' },
  { v: 'evrak_sureci', l: 'Evrak Süreci' },
  { v: 'satin_alma',   l: 'Satın Alma' },
]

const DEF = { category: 'mekanik', name: '', unit: 'adet', target_qty: '0', total_progress: '0', order_index: '0' }

const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.03em' }
const inp = { padding: '0.45rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' }
const btnP = { padding: '0.5rem 1.1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim3IlerlemeBilgileri({ projectId, result, onDone, onBack, mode = 'new' }) {
  const [rows,  setRows]  = useState(() => {
    if (mode === 'edit') return []
    if (result?.rows?.length) {
      return result.rows.map((r, i) => ({
        ...DEF, ...r,
        _id: Date.now() + i,
        target_qty: String(r.target_qty ?? 0),
        total_progress: String(r.total_progress ?? 0),
        order_index: String(r.order_index ?? 0),
      }))
    }
    return [{ ...DEF, _id: 1 }]
  })
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (mode !== 'edit' || loadedRef.current) return
    loadedRef.current = true
    supabase.from('progress_items').select('*').eq('project_id', projectId)
      .then(({ data }) => {
        setRows(data?.length
          ? data.map((r, i) => ({ ...DEF, ...r, _id: r.id ?? (Date.now() + i), target_qty: String(r.target_qty ?? 0), total_progress: String(r.total_progress ?? 0), order_index: String(r.order_index ?? 0) }))
          : [])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() { setRows(r => [...r, { ...DEF, _id: Date.now() }]) }
  function upd(_id, k, v) { setRows(r => r.map(row => row._id === _id ? { ...row, [k]: v } : row)) }
  function del(_id) { setRows(r => r.filter(row => row._id !== _id)) }

  function handleSave() {
    setError(null)
    if (rows.length === 0) { onDone({ skipped: true, count: 0 }); return }
    const invalid = rows.filter(r => !r.name?.trim())
    if (invalid.length > 0) { setError('"Kalem Adı" zorunludur.'); return }
    const payload = rows.map(({ _id, id, created_at, ...r }) => ({
      project_id:     projectId,
      category:       r.category,
      name:           r.name,
      unit:           r.unit           || 'adet',
      target_qty:     r.target_qty     !== '' ? Number(r.target_qty) : 0,
      total_progress: r.total_progress !== '' ? Number(r.total_progress) : 0,
      order_index:    r.order_index    !== '' ? Number(r.order_index) : 0,
    }))
    onDone({ rows: payload, skipped: false, count: rows.length })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım 3 — İlerleme Kalemleri</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Opsiyonel — progress_items</span>
      </div>

      <div style={{ padding: '1rem 1.5rem', maxHeight: '62vh', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {rows.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '1.5rem 0' }}>
            Henüz kalem yok — "+ Kalem Ekle" ile başlayın.
          </p>
        )}

        {rows.map((row, idx) => (
          <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Kalem #{idx + 1}
              </span>
              <button onClick={() => del(row._id)} title="Sil" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <div>
                <label style={lbl}>Kategori</label>
                <select style={inp} value={row.category} onChange={e => upd(row._id, 'category', e.target.value)}>
                  {CATEGORY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Kalem Adı <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inp} value={row.name} onChange={e => upd(row._id, 'name', e.target.value)} placeholder="Kalem adı" />
              </div>
              <div>
                <label style={lbl}>Birim</label>
                <input style={inp} value={row.unit} onChange={e => upd(row._id, 'unit', e.target.value)} placeholder="adet" />
              </div>
              <div>
                <label style={lbl}>Hedef Miktar</label>
                <input style={inp} type="number" min="0" step="any" value={row.target_qty} onChange={e => upd(row._id, 'target_qty', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Toplam İlerleme</label>
                <input style={inp} type="number" min="0" step="any" value={row.total_progress} onChange={e => upd(row._id, 'total_progress', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Sıra</label>
                <input style={inp} type="number" min="0" value={row.order_index} onChange={e => upd(row._id, 'order_index', e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addRow} style={{ ...btnS, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.4rem' }}>
          + Kalem Ekle
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
