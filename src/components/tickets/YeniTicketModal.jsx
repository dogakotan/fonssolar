import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const LABEL = {
  fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase',
  letterSpacing: '0.4px', display: 'block', marginBottom: 4,
}

const TICKET_TYPES = [
  { value: 'elektrik', label: 'Elektrik', bg: '#EFF6FF', color: '#185FA5' },
  { value: 'mekanik',  label: 'Mekanik',  bg: '#F5F3FF', color: '#7C3AED' },
]

const SEVERITIES = [
  { value: 'düşük',  label: 'Düşük',  bg: '#F3F4F6', color: '#374151' },
  { value: 'orta',   label: 'Orta',   bg: '#FEF3C7', color: '#92400E' },
  { value: 'yüksek', label: 'Yüksek', bg: '#FEE2E2', color: '#991B1B' },
  { value: 'kritik', label: 'Kritik', bg: '#991B1B', color: '#FFFFFF' },
]

export default function YeniTicketModal({ onClose, onSaved }) {
  const { user, profile, projectId } = useAuth()
  const [project, setProject]       = useState(null)
  const [category, setCategory]     = useState('elektrik')
  const [severity, setSeverity]     = useState('orta')
  const [description, setDescription] = useState('')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (!projectId) return
    supabase.from('projects').select('id, name, location')
      .eq('id', projectId).single()
      .then(({ data }) => { if (data) setProject(data) })
  }, [projectId])

  async function handleSubmit() {
    if (!description.trim()) return
    setSaving(true)
    const { error } = await supabase.from('tickets').insert({
      project_id:  projectId,
      created_by:  user.id,
      title:       description.trim().slice(0, 60),
      description: description.trim(),
      category,
      severity,
      status:      'açık',
      location:    project?.location || null,
    })
    setSaving(false)
    if (!error) onSaved()
  }

  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>Yeni Ticket Aç</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Otomatik dolan bilgiler — readonly */}
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
            <div>
              <p style={{ ...LABEL, marginBottom: 2 }}>Proje</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111827' }}>{project?.name || '—'}</p>
            </div>
            <div>
              <p style={{ ...LABEL, marginBottom: 2 }}>Lokasyon</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111827' }}>{project?.location || '—'}</p>
            </div>
            <div>
              <p style={{ ...LABEL, marginBottom: 2 }}>Tarih</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111827' }}>{today}</p>
            </div>
            <div>
              <p style={{ ...LABEL, marginBottom: 2 }}>Oluşturan</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111827' }}>{profile?.full_name || user?.email || '—'}</p>
            </div>
          </div>

          {/* Ticket Cinsi */}
          <div>
            <label style={LABEL}>Ticket Cinsi</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {TICKET_TYPES.map(t => {
                const active = category === t.value
                return (
                  <button
                    key={t.value}
                    onClick={() => setCategory(t.value)}
                    style={{
                      flex: 1, padding: '11px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: active ? t.bg : '#fff',
                      color: active ? t.color : '#6B7280',
                      border: active ? `2px solid ${t.color}` : '1px solid #E5E7EB',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Aciliyet */}
          <div>
            <label style={LABEL}>Aciliyet</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {SEVERITIES.map(s => {
                const active = severity === s.value
                return (
                  <button
                    key={s.value}
                    onClick={() => setSeverity(s.value)}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 7, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: active ? s.bg : '#fff',
                      color: active ? s.color : '#6B7280',
                      border: active ? `2px solid ${s.color === '#FFFFFF' ? '#991B1B' : s.color}` : '1px solid #E5E7EB',
                      transition: 'all 0.15s',
                    }}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Açıklama */}
          <div>
            <label style={LABEL}>Açıklama *</label>
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

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
            İptal
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
