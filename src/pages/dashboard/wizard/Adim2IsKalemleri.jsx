import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { parseIsKalemleri, downloadProjectTemplate } from '../../../utils/projectExcelImport'

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
  { v: 'kolon_montaji', l: 'Kolon Montajı' },
  { v: 'kiris_montaji', l: 'Kiriş Montajı' },
  { v: 'asik_montaji',  l: 'Aşık Montajı' },
  { v: 'panel_montaji', l: 'Panel Montajı' },
  { v: 'kosk_trafo',    l: 'Köşk Trafo' },
]

const STATUS_OPTS = [
  { v: 'beklemede',    l: 'Beklemede' },
  { v: 'devam_ediyor', l: 'Devam Ediyor' },
  { v: 'tamamlandi',   l: 'Tamamlandı' },
  { v: 'askida',       l: 'Askıda' },
  { v: 'iptal',        l: 'İptal' },
]

const UNIT_OPTS = ['', 'adet', 'm', 'm²', 'm³', 'kg', 'ton', 'rulo', 'kutu']

const DEF = {
  task_code: '', task_name: '', category: 'mekanik', sub_category: '',
  planned_start: '', planned_end: '', progress_pct: '0', status: 'beklemede',
  responsible: '', team_size: '', equipment_notes: '', notes: '',
  unit: '', target_qty: '0', dashboard_visible: false, dashboard_order: '0',
  is_critical: false,
}

const lbl = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.03em' }
const inp = { padding: '0.45rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' }
const btnP = { padding: '0.5rem 1.1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnS = { padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border-md)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }

export default function Adim2IsKalemleri({ projectId, result, onDone, onBack, mode = 'new' }) {
  const [rows,  setRows]  = useState(() => {
    if (mode === 'edit') return []
    if (result?.rows?.length) {
      return result.rows.map((r, i) => ({
        ...DEF, ...r,
        _id: Date.now() + i,
        progress_pct: String(r.progress_pct ?? 0),
        team_size: String(r.team_size ?? ''),
        target_qty: String(r.target_qty ?? 0),
        dashboard_order: String(r.dashboard_order ?? 0),
      }))
    }
    return [{ ...DEF, _id: 1 }]
  })
  const [error,       setError]       = useState(null)
  const [importing,   setImporting]   = useState(false)
  const [importMsg,   setImportMsg]   = useState(null)
  const [visibleRows, setVisibleRows] = useState(5)
  const loadedRef  = useRef(false)
  const fileRef    = useRef(null)

  useEffect(() => {
    if (mode !== 'edit' || loadedRef.current) return
    loadedRef.current = true
    supabase.from('project_tasks').select('*').eq('project_id', projectId)
      .then(({ data }) => {
        setRows(data?.length
          ? data.map((r, i) => ({
              ...DEF, ...r, _id: r.id ?? (Date.now() + i),
              progress_pct: String(r.progress_pct ?? 0),
              team_size: String(r.team_size ?? ''),
              unit: r.unit ?? '',
              target_qty: String(r.target_qty ?? 0),
              dashboard_visible: !!r.dashboard_visible,
              dashboard_order: String(r.dashboard_order ?? 0),
              is_critical: !!r.is_critical,
            }))
          : [])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() { setRows(r => [...r, { ...DEF, _id: Date.now() }]) }
  function upd(_id, k, v) { setRows(r => r.map(row => row._id === _id ? { ...row, [k]: v } : row)) }
  function del(_id) { setRows(r => r.filter(row => row._id !== _id)) }

  async function handleExcelImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setError(null)
    setImportMsg(null)
    try {
      const { rows: parsed, sheetName, skippedCount } = await parseIsKalemleri(file)
      if (parsed.length === 0) {
        setError('Excel dosyasında geçerli görev satırı bulunamadı. "Görev Adı" sütununun dolu olduğunu kontrol edin.')
        return
      }
      setRows(parsed)
      setVisibleRows(Math.min(parsed.length, 10))
      setImportMsg(`"${sheetName}" sayfasından ${parsed.length} görev yüklendi${skippedCount > 0 ? ` (${skippedCount} satır atlandı)` : ''}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  function handleSave() {
    setError(null)
    if (rows.length === 0) { onDone({ skipped: true, count: 0 }); return }
    const invalid = rows.filter(r => !r.task_name?.trim())
    if (invalid.length > 0) { setError('Her satırda "Görev Adı" zorunludur.'); return }
    const payload = rows.map(({ _id, id, created_at, ...r }) => ({
      project_id:        projectId,
      task_code:         r.task_code       || null,
      task_name:         r.task_name,
      category:          r.category,
      sub_category:      r.sub_category    || null,
      planned_start:     r.planned_start   || null,
      planned_end:       r.planned_end     || null,
      progress_pct:      r.progress_pct !== '' ? Number(r.progress_pct) : 0,
      status:            r.status,
      responsible:       r.responsible     || null,
      team_size:         r.team_size !== '' ? Number(r.team_size) : null,
      equipment_notes:   r.equipment_notes || null,
      notes:             r.notes           || null,
      unit:              r.unit            || null,
      target_qty:        r.target_qty !== '' ? Number(r.target_qty) : 0,
      dashboard_visible: !!r.dashboard_visible,
      dashboard_order:   r.dashboard_order !== '' ? Number(r.dashboard_order) : 0,
      is_critical:       !!r.is_critical,
    }))
    onDone({ rows: payload, skipped: false, count: rows.length })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Adım 2 — İş Kalemleri</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => downloadProjectTemplate()}
            style={{ ...btnS, fontSize: 12, padding: '0.35rem 0.75rem', color: '#0ea5e9', borderColor: '#0ea5e9' }}
          >
            Şablon İndir
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            style={{ ...btnP, fontSize: 12, padding: '0.35rem 0.75rem', background: importing ? '#94a3b8' : '#16a34a' }}
          >
            {importing ? 'Yükleniyor…' : 'Excel\'den İçe Aktar'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleExcelImport}
          />
        </div>
      </div>

      <div style={{ padding: '1rem 1.5rem', maxHeight: '62vh', overflowY: 'auto' }}>
        {importMsg && (
          <div style={{ padding: '0.5rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 13, marginBottom: '0.75rem' }}>
            {importMsg}
          </div>
        )}
        {error && (
          <div style={{ padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {rows.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 13, padding: '1.5rem 0' }}>
            Henüz görev yok — "+ Görev Ekle" ile başlayın.
          </p>
        )}

        {rows.slice(0, visibleRows).map((row, idx) => (
          <div key={row._id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Görev #{idx + 1}
              </span>
              <button onClick={() => del(row._id)} title="Sil" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <div>
                <label style={lbl}>Görev Kodu</label>
                <input style={inp} value={row.task_code} onChange={e => upd(row._id, 'task_code', e.target.value)} placeholder="T001" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Görev Adı <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inp} value={row.task_name} onChange={e => upd(row._id, 'task_name', e.target.value)} placeholder="Görev adı" />
              </div>
              <div>
                <label style={lbl}>Kategori</label>
                <select style={inp} value={row.category} onChange={e => upd(row._id, 'category', e.target.value)}>
                  {CATEGORY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>İlgili Kurum</label>
                <input style={inp} value={row.sub_category} onChange={e => upd(row._id, 'sub_category', e.target.value)} placeholder="TEDAŞ, TEİAŞ…" />
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
                <label style={lbl}>% İlerleme</label>
                <input style={inp} type="number" min="0" max="100" value={row.progress_pct} onChange={e => upd(row._id, 'progress_pct', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Durum</label>
                <select style={inp} value={row.status} onChange={e => upd(row._id, 'status', e.target.value)}>
                  {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#0f172a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={row.is_critical} onChange={e => upd(row._id, 'is_critical', e.target.checked)} />
                  Kritik Yol
                </label>
              </div>
              <div>
                <label style={lbl}>Sorumlu</label>
                <input style={inp} value={row.responsible} onChange={e => upd(row._id, 'responsible', e.target.value)} placeholder="Ad Soyad" />
              </div>
              <div>
                <label style={lbl}>Ekip Sayısı</label>
                <input style={inp} type="number" min="0" value={row.team_size} onChange={e => upd(row._id, 'team_size', e.target.value)} placeholder="0" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lbl}>Ekipman Notları</label>
                <input style={inp} value={row.equipment_notes} onChange={e => upd(row._id, 'equipment_notes', e.target.value)} placeholder="Kullanılacak ekipman" />
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <label style={lbl}>Notlar</label>
                <input style={inp} value={row.notes} onChange={e => upd(row._id, 'notes', e.target.value)} placeholder="Ek notlar" />
              </div>
              <div style={{ gridColumn: 'span 4', borderTop: '1px dashed #e2e8f0', paddingTop: '0.6rem', marginTop: '0.15rem' }}>
                <label style={{ ...lbl, color: '#0ea5e9' }}>Ölçülebilir İlerleme Hedefi (opsiyonel — sahadan günlük raporla takip edilecekse doldurun)</label>
              </div>
              <div>
                <label style={lbl}>Birim</label>
                <select style={inp} value={row.unit} onChange={e => upd(row._id, 'unit', e.target.value)}>
                  {UNIT_OPTS.map(u => <option key={u} value={u}>{u || '—'}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Hedef Miktar</label>
                <input style={inp} type="number" min="0" step="any" value={row.target_qty} onChange={e => upd(row._id, 'target_qty', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Dashboard Sırası</label>
                <input style={inp} type="number" min="0" value={row.dashboard_order} onChange={e => upd(row._id, 'dashboard_order', e.target.value)} placeholder="0" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#0f172a', cursor: 'pointer' }}>
                  <input type="checkbox" checked={row.dashboard_visible} onChange={e => upd(row._id, 'dashboard_visible', e.target.checked)} />
                  Dashboard'da göster
                </label>
              </div>
            </div>
          </div>
        ))}

        {rows.length > visibleRows && (
          <button onClick={() => setVisibleRows(count => count + 5)} style={{ ...btnS, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
            + {Math.min(5, rows.length - visibleRows)} görev daha göster
          </button>
        )}
        <button onClick={() => { addRow(); setVisibleRows(count => Math.max(count, rows.length + 1)) }} style={{ ...btnS, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.4rem' }}>
          + Görev Ekle
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
