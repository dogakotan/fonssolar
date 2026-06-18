import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const INPUT = {
  border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}
const LABEL = {
  fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: '0.4px', display: 'block', marginBottom: 4,
}

const CATEGORIES = ['teknik', 'isg', 'kalite', 'lojistik', 'elektrik', 'mekanik', 'genel']
const SEVERITIES = [
  { value: 'düşük',  bg: '#F3F4F6', color: '#374151' },
  { value: 'orta',   bg: '#FEF3C7', color: '#92400E' },
  { value: 'yüksek', bg: '#FEE2E2', color: '#991B1B' },
  { value: 'kritik', bg: '#991B1B', color: '#FFFFFF' },
]

export default function YeniTicketModal({ onClose, onSaved }) {
  const { user, projectId: authProjectId } = useAuth()
  const [projects, setProjects] = useState([])
  const [autoProject, setAutoProject] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    project_id: '', title: '', category: 'teknik', severity: 'orta', description: '',
  })

  useEffect(() => {
    if (authProjectId) {
      supabase.from('projects').select('id, name, location').eq('id', authProjectId).single()
        .then(({ data }) => { if (data) setAutoProject(data) })
    } else {
      supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || []))
    }
  }, [authProjectId])

  const setF = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit() {
    if (!form.title.trim() || !form.description.trim()) return
    setSaving(true)
    const effectiveProjectId = authProjectId || form.project_id || null
    const location = autoProject?.location || null
    const { error } = await supabase.from('tickets').insert({
      project_id:  effectiveProjectId,
      title:       form.title.trim(),
      description: form.description.trim(),
      category:    form.category,
      severity:    form.severity,
      status:      'açık',
      created_by:  user.id,
      location,
    })
    setSaving(false)
    if (!error) onSaved()
  }

  const canSubmit = form.title.trim() && form.description.trim()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>Yeni Ticket Aç</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {authProjectId ? (
            <div>
              <label style={LABEL}>Proje</label>
              <div style={{ ...INPUT, background: '#F9FAFB', color: '#374151', cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{autoProject?.name || 'Yükleniyor…'}</span>
                {autoProject?.location && (
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{autoProject.location}</span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label style={LABEL}>Proje</label>
              <select value={form.project_id} onChange={setF('project_id')} style={INPUT}>
                <option value="">— Proje seçin —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={LABEL}>Başlık *</label>
            <input type="text" placeholder="Sorunu kısaca özetleyin" value={form.title} onChange={setF('title')} style={INPUT} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Kategori</label>
              <select value={form.category} onChange={setF('category')} style={INPUT}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={LABEL}>Şiddet</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SEVERITIES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setForm(f => ({ ...f, severity: s.value }))}
                    style={{
                      flex: 1, padding: '7px 6px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: form.severity === s.value ? s.bg : '#F9FAFB',
                      color: form.severity === s.value ? s.color : '#6B7280',
                      border: form.severity === s.value ? `2px solid ${s.color === '#FFFFFF' ? '#991B1B' : s.color}` : '1px solid #E5E7EB',
                    }}
                  >
                    {s.value.charAt(0).toUpperCase() + s.value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={LABEL}>Açıklama *</label>
            <textarea
              placeholder="Sorunu detaylı açıklayın: nerede, nasıl, ne zaman tespit edildi..."
              value={form.description}
              onChange={setF('description')}
              rows={4}
              style={{ ...INPUT, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !canSubmit}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: canSubmit ? 1 : 0.5 }}
          >
            {saving ? 'Kaydediliyor…' : 'Ticket Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
