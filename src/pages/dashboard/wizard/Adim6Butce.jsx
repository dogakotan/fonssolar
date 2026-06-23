import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const DEF = { category: '', name: '', planned_amount: '', order_index: '0' }

const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.03em' }
const inp = { padding: '0.45rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' }
const btnP = { padding: '0.5rem 1.1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim6Butce({ projectId, result, onDone, onBack, mode = 'new' }) {
  const [rows,  setRows]  = useState(mode === 'new' ? [{ ...DEF, _id: 1 }] : [])
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (mode !== 'edit' || loadedRef.current) return
    loadedRef.current = true
    supabase.from('budget_lines').select('*').eq('project_id', projectId)
      .then(({ data }) => {
        setRows(data?.length
          ? data.map((r, i) => ({ ...DEF, ...r, _id: r.id ?? (Date.now() + i), planned_amount: String(r.planned_amount ?? ''), order_index: String(r.order_index ?? 0) }))
          : [])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (result !== undefined) {
    return (
      <div className="card">
        <div className="card-header"><h3>Adım 6 — Bütçe Kalemleri</h3></div>
        <div style={{ padding: '1.5rem' }}>
          <p style={{ color: result.skipped ? 'var(--color-muted)' : 'var(--color-success)', margin: '0 0 1rem', fontSize: 14 }}>
            {result.skipped ? '⊘ Bu adım atlandı.' : `✓ ${result.count} bütçe kalemi hazırlandı.`}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button style={btnS} onClick={onBack}>← Geri</button>
            <button style={btnP} onClick={() => onDone(result)}>Devam Et →</button>
          </div>
        </div>
      </div>
    )
  }

  function addRow() { setRows(r => [...r, { ...DEF, _id: Date.now() }]) }
  function upd(_id, k, v) { setRows(r => r.map(row => row._id === _id ? { ...row, [k]: v } : row)) }
  function del(_id) { setRows(r => r.filter(row => row._id !== _id)) }

  function handleSave() {
    setError(null)
    if (rows.length === 0) { onDone({ skipped: true, count: 0 }); return }
    const invalid = rows.filter(r => !r.name?.trim() || r.planned_amount === '')
    if (invalid.length > 0) { setError('"Kalem Adı" ve "Planlanan Tutar" zorunludur.'); return }
    const payload = rows.map(({ _id, id, created_at, ...r }) => ({
      project_id:     projectId,
      category:       r.category    || null,
      name:           r.name,
      planned_amount: Number(r.planned_amount),
      order_index:    r.order_index !== '' ? Number(r.order_index) : 0,
    }))
    onDone({ rows: payload, skipped: false, count: rows.length })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım 6 — Bütçe Kalemleri</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Opsiyonel — budget_lines</span>
      </div>

      <div style={{ padding: '1rem 1.5rem' }}>
        {error && (
          <div style={{ padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {rows.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '1.5rem 0' }}>
            Henüz bütçe kalemi yok — "+ Kalem Ekle" ile başlayın.
          </p>
        )}

        {rows.map((row, idx) => (
          <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Bütçe Kalemi #{idx + 1}
              </span>
              <button onClick={() => del(row._id)} title="Sil" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <div>
                <label style={lbl}>Kategori</label>
                <input style={inp} value={row.category} onChange={e => upd(row._id, 'category', e.target.value)} placeholder="Mekanik" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Kalem Adı <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inp} value={row.name} onChange={e => upd(row._id, 'name', e.target.value)} placeholder="Kalem adı" />
              </div>
              <div>
                <label style={lbl}>Sıra</label>
                <input style={inp} type="number" min="0" value={row.order_index} onChange={e => upd(row._id, 'order_index', e.target.value)} placeholder="0" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Planlanan Tutar (₺) <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inp} type="number" min="0" step="any" value={row.planned_amount} onChange={e => upd(row._id, 'planned_amount', e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addRow} style={{ ...btnS, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.4rem' }}>
          + Kalem Ekle
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9' }}>
        <button style={btnS} onClick={onBack}>← Geri</button>
        <button style={btnS} onClick={() => onDone({ skipped: true, count: 0 })}>Bu Adımı Atla</button>
        <button style={btnP} onClick={handleSave}>Devam →</button>
      </div>
    </div>
  )
}
