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
  const [files, setFiles]             = useState([])

  const hasFixedProject = !!(defaultProject || projectId)
  const [projectOptions, setProjectOptions] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')

  useEffect(() => {
    if (hasFixedProject) return
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => setProjectOptions(data || []))
  }, [hasFixedProject])

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

  const needsProjectPick = !hasFixedProject && category !== 'genel'

  async function handleSubmit() {
    if (!description.trim()) return
    if (needsProjectPick && !selectedProjectId) {
      setError('Bu ticket cinsi için proje seçimi zorunludur.')
      return
    }
    setSaving(true)
    setError(null)

    const effectiveProjectId = hasFixedProject ? (projectId || null) : (selectedProjectId || null)
    const ticketLocation = project?.location || null

    const { data: inserted, error: err } = await supabase.from('tickets').insert({
      project_id:  effectiveProjectId,
      created_by:  user.id,
      title:       description.trim().slice(0, 60),
      description: description.trim(),
      category,
      severity,
      status:      'gönderildi',
      location:    ticketLocation,
    }).select('id').single()

    if (err) { setError('Ticket oluşturulamadı. Lütfen tekrar deneyin.'); setSaving(false); return }

    for (const file of files) {
      const path = `${inserted.id}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('ticket-ekleri').upload(path, file)
      if (!uploadErr) {
        await supabase.from('ticket_attachments').insert({
          ticket_id: inserted.id,
          storage_path: path,
          uploaded_by: user.id,
        })
      }
    }

    setSaving(false)
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
            {hasFixedProject ? (
              <>
                <div style={ROW}>
                  <span style={ROW_LABEL}>Proje</span>
                  <span style={ROW_VALUE}>{projeAdi}</span>
                </div>
                <div style={ROW}>
                  <span style={ROW_LABEL}>Lokasyon</span>
                  <span style={ROW_VALUE}>{lokasyon}</span>
                </div>
              </>
            ) : needsProjectPick && (
              <div style={ROW}>
                <span style={ROW_LABEL}>Proje *</span>
                <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} style={SELECT_STYLE}>
                  <option value="">— Proje seçin —</option>
                  {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
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
                <option value="kritik">Kritik</option>
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

          {/* Dosya/Foto ekle */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 6 }}>
              DOSYA / FOTO EKLE
            </label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={e => setFiles(Array.from(e.target.files || []))}
              style={{ fontSize: 13, fontFamily: 'inherit' }}
            />
            {files.length > 0 && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6B7280' }}>{files.length} dosya seçildi</p>
            )}
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
            disabled={saving || !description.trim() || (needsProjectPick && !selectedProjectId)}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (description.trim() && !(needsProjectPick && !selectedProjectId)) ? 1 : 0.5 }}
          >
            {saving ? 'Kaydediliyor…' : 'Ticket Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
