import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { SEVERITY_OPTIONS } from '../../utils/ticketSeverity'
import { RESULT_OPTIONS, STATUS_OPTIONS } from '../../utils/qualityInspection'

const INPUT = {
  border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}
const LABEL = {
  fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: '0.4px', display: 'block', marginBottom: 4,
}
const BTN_REMOVE = {
  background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6,
  width: 26, height: 26, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
}
const BTN_GHOST = {
  background: 'none', border: '1px dashed #D1D5DB', borderRadius: 8, padding: '8px 14px',
  fontSize: 12.5, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function newFindingRow() {
  return { id: null, location: '', description: '', severity: 'orta', status: 'açık', assigned_to: '' }
}

export default function YeniDenetimModal({ defaultProjectId, editInspection = null, onClose, onSaved }) {
  const { user } = useAuth()
  const isEdit = !!editInspection
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(defaultProjectId || editInspection?.project_id || '')
  const [inspectionDate, setInspectionDate] = useState(editInspection?.inspection_date || todayISO())
  const [inspector, setInspector] = useState(editInspection?.inspector || '')
  const [category, setCategory] = useState(editInspection?.category || '')
  const [result, setResult] = useState(editInspection?.result || 'beklemede')
  const [notes, setNotes] = useState(editInspection?.notes || '')
  const [findings, setFindings] = useState(
    editInspection?.findings?.length
      ? editInspection.findings.map(f => ({ id: f.id || null, location: f.location || '', description: f.description || '', severity: f.severity, status: f.status, assigned_to: f.assigned_to || '' }))
      : [newFindingRow()]
  )
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    if (defaultProjectId) return
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => setProjects(data || []))
  }, [defaultProjectId])

  function updateFinding(index, field, value) {
    setFindings(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }
  function addFindingRow()    { setFindings(rows => [...rows, newFindingRow()]) }
  function removeFindingRow(i) { setFindings(rows => rows.filter((_, idx) => idx !== i)) }

  const validFindings = findings.filter(f => f.description.trim())
  const canSubmit = !!projectId && !!inspectionDate && !saving

  async function handleSubmit() {
    if (!canSubmit) return
    setSaving(true)
    setErrorMessage(null)

    const { data, error } = await supabase.rpc('save_quality_inspection', {
      p_id: editInspection?.id || null,
      p_project_id: projectId,
      p_inspection_date: inspectionDate,
      p_inspector: inspector.trim() || null,
      p_category: category.trim() || null,
      p_result: result,
      p_notes: notes.trim() || null,
      p_created_by: user.id,
      p_findings: validFindings.map(f => ({
        id: f.id || null, // mevcut bulgu — backend'in mükerrer ticket açmaması için şart
        location: f.location.trim() || null,
        description: f.description.trim(),
        severity: f.severity,
        status: f.status,
        assigned_to: f.assigned_to.trim() || null,
      })),
    })

    if (error || !data?.authorized) {
      setErrorMessage(error?.message || 'Denetim kaydedilemedi.')
      setSaving(false)
      return
    }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="modal-centered-box" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>
            {isEdit ? 'Denetimi Düzenle' : 'Yeni Kalite Denetimi'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!defaultProjectId && (
            <div>
              <label style={LABEL}>Proje</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={INPUT} disabled={isEdit}>
                <option value="">— Proje seçin —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {errorMessage && (
            <p style={{ margin: 0, color: '#B42318', fontSize: 13 }}>{errorMessage}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={LABEL}>Tarih *</label>
              <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Denetçi</label>
              <input type="text" placeholder="Ad Soyad" value={inspector} onChange={e => setInspector(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Kategori</label>
              <input type="text" placeholder="Mekanik / Elektrik / Genel" value={category} onChange={e => setCategory(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Sonuç</label>
              <select value={result} onChange={e => setResult(e.target.value)} style={INPUT}>
                {RESULT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={LABEL}>Not</label>
            <textarea
              placeholder="Denetimle ilgili genel not..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ ...INPUT, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={LABEL}>Bulgular / Uygunsuzluklar</label>
            <div style={{ display: 'grid', gap: 10 }}>
              {findings.map((row, i) => (
                <div key={i} style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input
                      placeholder="Açıklama *"
                      value={row.description}
                      onChange={e => updateFinding(i, 'description', e.target.value)}
                      style={{ ...INPUT, flex: 1 }}
                    />
                    <button type="button" onClick={() => removeFindingRow(i)} style={BTN_REMOVE} title="Sil">×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                    <input
                      placeholder="Konum"
                      value={row.location}
                      onChange={e => updateFinding(i, 'location', e.target.value)}
                      style={INPUT}
                    />
                    <select value={row.severity} onChange={e => updateFinding(i, 'severity', e.target.value)} style={INPUT}>
                      {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={row.status} onChange={e => updateFinding(i, 'status', e.target.value)} style={INPUT}>
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input
                      placeholder="Sorumlu"
                      value={row.assigned_to}
                      onChange={e => updateFinding(i, 'assigned_to', e.target.value)}
                      style={INPUT}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addFindingRow} style={{ ...BTN_GHOST, marginTop: 10 }}>+ Bulgu Ekle</button>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: !canSubmit ? 0.5 : 1 }}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
