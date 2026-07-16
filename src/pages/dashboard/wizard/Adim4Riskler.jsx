import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const SEV_OPTS    = [{ v: 'kritik', l: 'Kritik' }, { v: 'yüksek', l: 'Yüksek' }, { v: 'orta', l: 'Orta' }, { v: 'düşük', l: 'Düşük' }]
const STATUS_OPTS = [
  { v: 'açık',         l: 'Açık' },
  { v: 'azaltıldı',    l: 'Azaltıldı' },
  { v: 'kabul_edildi', l: 'Kabul Edildi' },
  { v: 'kapatıldı',    l: 'Kapatıldı' },
]
const CAT_OPTS = [
  { v: 'is_kalemi',  l: 'İş Kalemi' },
  { v: 'satin_alma', l: 'Satın Alma' },
  { v: 'diger',      l: 'Diğer' },
]

const DEF = { title: '', description: '', severity: 'orta', probability: '3', impact: '3', mitigation: '', status: 'açık', category: 'diger' }

const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.03em' }
const inp = { padding: '0.45rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' }
const btnP = { padding: '0.5rem 1.1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim4Riskler({ projectId, result, onDone, onBack, mode = 'new' }) {
  const [rows,  setRows]  = useState(() => {
    if (mode === 'edit') return []
    if (result?.rows?.length) {
      return result.rows.map((r, i) => ({
        ...DEF, ...r,
        _id: Date.now() + i,
        probability: String(r.probability ?? 3),
        impact: String(r.impact ?? 3),
      }))
    }
    return [{ ...DEF, _id: 1 }]
  })
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (mode !== 'edit' || loadedRef.current) return
    loadedRef.current = true
    supabase.from('project_risks').select('*').eq('project_id', projectId)
      .then(({ data }) => {
        setRows(data?.length
          ? data.map((r, i) => ({ ...DEF, ...r, _id: r.id ?? (Date.now() + i), probability: String(r.probability ?? 3), impact: String(r.impact ?? 3) }))
          : [])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() { setRows(r => [...r, { ...DEF, _id: Date.now() }]) }
  function upd(_id, k, v) { setRows(r => r.map(row => row._id === _id ? { ...row, [k]: v } : row)) }
  function del(_id) { setRows(r => r.filter(row => row._id !== _id)) }

  function handleSave() {
    setError(null)
    if (rows.length === 0) { onDone({ skipped: true, count: 0 }); return }
    const invalid = rows.filter(r => !r.title?.trim())
    if (invalid.length > 0) { setError('"Risk Başlığı" zorunludur.'); return }
    const payload = rows.map(({ _id, id, created_at, ...r }) => ({
      project_id:  projectId,
      title:       r.title,
      description: r.description || null,
      severity:    r.severity,
      probability: r.probability !== '' ? Number(r.probability) : 3,
      impact:      r.impact      !== '' ? Number(r.impact) : 3,
      mitigation:  r.mitigation  || null,
      status:      r.status,
      category:    r.category || 'diger',
    }))
    onDone({ rows: payload, skipped: false, count: rows.length })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım 3 — Riskler</h3>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Opsiyonel — project_risks</span>
      </div>

      <div style={{ padding: '1rem 1.5rem', maxHeight: '62vh', overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {rows.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '1.5rem 0' }}>
            Henüz risk yok — "+ Risk Ekle" ile başlayın.
          </p>
        )}

        {rows.map((row, idx) => (
          <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Risk #{idx + 1}
              </span>
              <button onClick={() => del(row._id)} title="Sil" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Risk Başlığı <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inp} value={row.title} onChange={e => upd(row._id, 'title', e.target.value)} placeholder="Risk başlığı" />
              </div>
              <div>
                <label style={lbl}>Kategori</label>
                <select style={inp} value={row.category} onChange={e => upd(row._id, 'category', e.target.value)}>
                  {CAT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Şiddet</label>
                <select style={inp} value={row.severity} onChange={e => upd(row._id, 'severity', e.target.value)}>
                  {SEV_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Durum</label>
                <select style={inp} value={row.status} onChange={e => upd(row._id, 'status', e.target.value)}>
                  {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 5' }}>
                <label style={lbl}>Açıklama</label>
                <input style={inp} value={row.description} onChange={e => upd(row._id, 'description', e.target.value)} placeholder="Riskin açıklaması" />
              </div>
              <div>
                <label style={lbl}>Olasılık (1–5)</label>
                <input style={inp} type="number" min="1" max="5" value={row.probability} onChange={e => upd(row._id, 'probability', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Etki (1–5)</label>
                <input style={inp} type="number" min="1" max="5" value={row.impact} onChange={e => upd(row._id, 'impact', e.target.value)} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Azaltma Yöntemi</label>
                <input style={inp} value={row.mitigation} onChange={e => upd(row._id, 'mitigation', e.target.value)} placeholder="Azaltma yöntemi veya aksiyon" />
              </div>
            </div>
          </div>
        ))}

        <button onClick={addRow} style={{ ...btnS, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.4rem' }}>
          + Risk Ekle
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
