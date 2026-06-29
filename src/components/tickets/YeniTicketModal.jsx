import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const ROW = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '9px 0', borderBottom: '1px solid #F3F4F6',
}
const ROW_LABEL = { fontSize: 12, color: '#9CA3AF', fontWeight: 500 }
const ROW_VALUE = { fontSize: 13, color: '#111827', fontWeight: 500 }

const SELECT_STYLE = {
  border: '1px solid #E5E7EB', borderRadius: 7, padding: '7px 10px',
  fontSize: 13, fontFamily: 'inherit', color: '#111827', background: '#fff',
  outline: 'none', cursor: 'pointer', minWidth: 130,
}

function projectIdLabel(projectId) {
  if (!projectId) return '—'
  if (/^[0-9a-f-]{24,}$/i.test(String(projectId))) return 'Bağlı Proje'
  return String(projectId)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toLocaleUpperCase('tr-TR'))
}

export default function YeniTicketModal({ onClose, onSaved, defaultProject }) {
  const { user, profile, projectId } = useAuth()
  const [project, setProject]         = useState(null)
  const [category, setCategory]       = useState('genel')
  const [severity, setSeverity]       = useState('orta')
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)

  useEffect(() => {
    if (defaultProject) {
      setProject(defaultProject)
      return
    }
    if (!projectId) return
    async function loadProject() {
      const byId = await supabase.from('projects').select('id, name, location')
        .eq('id', projectId).maybeSingle()

      if (byId.data) {
        setProject(byId.data)
        return
      }

      const label = projectIdLabel(projectId)
      if (label !== 'Bağlı Proje') {
        const byName = await supabase.from('projects').select('id, name, location')
          .ilike('name', `%${String(projectId).replace(/[-_]+/g, ' ')}%`)
          .limit(1)
          .maybeSingle()

        if (byName.data) {
          setProject(byName.data)
          return
        }
      }

      setProject({ id: projectId, name: label, location: null })
    }
    loadProject()
  }, [projectId, defaultProject])

  async function handleSubmit() {
    if (!description.trim()) return
    setSaving(true)
    setError(null)

    const effectiveProjectId = projectId || null
    const ticketLocation = project?.location || null

    const { error: err } = await supabase.from('tickets').insert({
      project_id:  effectiveProjectId,
      created_by:  user.id,
      title:       description.trim().slice(0, 60),
      description: description.trim(),
      category,
      severity,
      status:      'gönderildi',
      location:    ticketLocation,
    })
    setSaving(false)
    if (err) { setError('Ticket oluşturulamadı. Lütfen tekrar deneyin.'); return }
    onSaved()
  }

  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const projeAdi = project?.name || '—'
  const lokasyon = project?.location || '—'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="modal-centered-box" style={{ width: '100%', maxWidth: 520 }}>

        {/* Başlık */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>Yeni Ticket Aç</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Satır satır bilgi + Ticket Cinsi + Aciliyet */}
          <div>
            <div style={ROW}>
              <span style={ROW_LABEL}>Proje</span>
              <span style={ROW_VALUE}>{projeAdi}</span>
            </div>
            <div style={ROW}>
              <span style={ROW_LABEL}>Lokasyon</span>
              <span style={ROW_VALUE}>{lokasyon}</span>
            </div>
            <div style={ROW}>
              <span style={ROW_LABEL}>Tarih</span>
              <span style={ROW_VALUE}>{today}</span>
            </div>
            <div style={ROW}>
              <span style={ROW_LABEL}>Oluşturan</span>
              <span style={ROW_VALUE}>{profile?.full_name || user?.email || '—'}</span>
            </div>
            <div style={{ ...ROW, borderBottom: 'none' }}>
              <span style={ROW_LABEL}>Ticket Cinsi</span>
              <select value={category} onChange={e => setCategory(e.target.value)} style={SELECT_STYLE}>
                <option value="genel">Genel</option>
                <option value="elektrik">Elektrik</option>
                <option value="mekanik">Mekanik</option>
              </select>
            </div>
            <div style={{ ...ROW, borderBottom: 'none', marginTop: 4 }}>
              <span style={ROW_LABEL}>Aciliyet</span>
              <select value={severity} onChange={e => setSeverity(e.target.value)} style={SELECT_STYLE}>
                <option value="düşük">Düşük</option>
                <option value="orta">Orta</option>
                <option value="yüksek">Yüksek</option>
              </select>
            </div>
          </div>

          {/* Açıklama */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 6 }}>
              AÇIKLAMA *
            </label>
            <textarea
              placeholder="Sorunu detaylı açıklayın: nerede, nasıl, ne zaman tespit edildi..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              style={{
                border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px',
                fontSize: 13, fontFamily: 'inherit', outline: 'none',
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#DC2626' }}>
            {error}
          </div>
        )}

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            Vazgeç
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !description.trim()}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: description.trim() ? 1 : 0.5 }}
          >
            {saving ? 'Kaydediliyor…' : 'Ticket Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
