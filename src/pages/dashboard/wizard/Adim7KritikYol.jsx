import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const STATUS_OPTS = [
  { v: 'beklemede',    l: 'Beklemede' },
  { v: 'devam_ediyor', l: 'Devam Ediyor' },
  { v: 'tamamlandi',   l: 'Tamamlandı' },
  { v: 'askida',       l: 'Askıda' },
  { v: 'iptal',        l: 'İptal' },
]

const DEF = {
  path_code: '', activity_name: '', planned_start: '', planned_end: '',
  is_critical: true, status: 'beklemede', progress_pct: '0', responsible: '', notes: '',
}

const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.03em' }
const inp = { padding: '0.45rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' }
const btnP = { padding: '0.5rem 1.1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim7KritikYol({ projectId, result, onDone, onBack, mode = 'new' }) {
  const [rows,  setRows]  = useState(() => {
    if (mode === 'edit') return []
    if (result?.rows?.length) {
      return result.rows.map((r, i) => ({
        ...DEF, ...r,
        _id: Date.now() + i,
        progress_pct: String(r.progress_pct ?? 0),
        is_critical: r.is_critical ?? true,
      }))
    }
    return [{ ...DEF, _id: 1 }]
  })
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (mode !== 'edit' || loadedRef.current) return
    loadedRef.current = true
    supabase.from('critical_path_items').select('*').eq('project_id', projectId)
      .then(({ data }) => {
        setRows(data?.length
          ? data.map((r, i) => ({ ...DEF, ...r, _id: r.id ?? (Date.now() + i), progress_pct: String(r.progress_pct ?? 0), is_critical: r.is_critical ?? true }))
          : [])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() { setRows(r => [...r, { ...DEF, _id: Date.now() }]) }
  function upd(_id, k, v) { setRows(r => r.map(row => row._id === _id ? { ...row, [k]: v } : row)) }
  function del(_id) { setRows(r => r.filter(row => row._id !== _id)) }

  function handleSave() {
    setError(null)
    if (rows.length === 0) { onDone({ skipped: true, count: 0 }); return }
    const invalid = rows.filter(r => !r.activity_name?.trim())
    if (invalid.length > 0) { setError('"Aktivite Adı" zorunludur.'); return }
    const payload = rows.map(({ _id, id, created_at, ...r }) => ({
      project_id:    projectId,
      path_code:     r.path_code     || null,
      activity_name: r.activity_name,
      planned_start: r.planned_start || null,
      planned_end:   r.planned_end   || null,
      is_critical:   r.is_critical,
      status:        r.status,
      progress_pct:  r.progress_pct  !== '' ? Number(r.progress_pct) : 0,
      responsible:   r.responsible   || null,
      notes:         r.notes         || null,
    }))
    onDone({ rows: payload, skipped: false, count: rows.length })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım 7 — Kritik Yol</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Opsiyonel — critical_path_items</span>
      </div>

      <div style={{ padding: '1rem 1.5rem', maxHeight: '62vh', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {rows.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '1.5rem 0' }}>
            Henüz aktivite yok — "+ Aktivite Ekle" ile başlayın.
          </p>
        )}

        {rows.map((row, idx) => (
          <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Aktivite #{idx + 1}
              </span>
              <button onClick={() => del(row._id)} title="Sil" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <div>
                <label style={lbl}>Yol Kodu</label>
                <input style={inp} value={row.path_code} onChange={e => upd(row._id, 'path_code', e.target.value)} placeholder="C1" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Aktivite Adı <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inp} value={row.activity_name} onChange={e => upd(row._id, 'activity_name', e.target.value)} placeholder="Aktivite adı" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ paddingTop: 18 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: 13, color: '#0f172a' }}>
                    <input type="checkbox" checked={row.is_critical} onChange={e => upd(row._id, 'is_critical', e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                    Kritik Yol
                  </label>
                </div>
              </div>
              <div>
                <label style={lbl}>Plan Başlangıç</label>
                <input style={inp} type="date" value={row.planned_start} onChange={e => upd(row._id, 'planned_start', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Plan Bitiş</label>
                <input style={inp} type="date" value={row.planned_end} onChange={e => upd(row._id, 'planned_end', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Durum</label>
                <select style={inp} value={row.status} onChange={e => upd(row._id, 'status', e.target.value)}>
                  {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>% İlerleme</label>
                <input style={inp} type="number" min="0" max="100" value={row.progress_pct} onChange={e => upd(row._id, 'progress_pct', e.target.value)} placeholder="0" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Sorumlu</label>
                <input style={inp} value={row.responsible} onChange={e => upd(row._id, 'responsible', e.target.value)} placeholder="Ad Soyad" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Notlar</label>
                <input style={inp} value={row.notes} onChange={e => upd(row._id, 'notes', e.target.value)} placeholder="Ek notlar" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addRow} style={{ ...btnS, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.4rem' }}>
          + Aktivite Ekle
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
