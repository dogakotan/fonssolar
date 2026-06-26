import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { todayStr } from '../../hooks/useSantiyeData'

export default function SahaFotograflari({ projectId, userId }) {
  const [photos, setPhotos]           = useState([])
  const [pending, setPending]         = useState([])
  const [uploading, setUploading]     = useState(false)
  const [lightbox, setLightbox]       = useState(null)

  const today = todayStr()

  useEffect(() => { if (projectId) loadPhotos() }, [projectId])

  async function loadPhotos() {
    const { data } = await supabase
      .from('daily_report_photos')
      .select('id, storage_path, caption, created_at')
      .eq('project_id', projectId)
      .eq('report_date', today)
      .order('created_at', { ascending: false })
    setPhotos(data || [])
  }

  function getUrl(path) {
    return supabase.storage.from('saha-fotolari').getPublicUrl(path).data.publicUrl
  }

  function pickFiles(e) {
    const files = Array.from(e.target.files || []).slice(0, 10 - photos.length)
    setPending(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))])
    e.target.value = ''
  }

  async function uploadPending() {
    if (!pending.length) return
    setUploading(true)

    const { data: repData } = await supabase.from('daily_reports')
      .upsert({ project_id: projectId, report_date: today, created_by: userId }, { onConflict: 'project_id,report_date' })
      .select('id').single()
    const rid = repData?.id || null

    for (const { file } of pending) {
      const ext  = file.name.split('.').pop().toLowerCase()
      const uid  = `${Date.now()}_${Math.random().toString(36).slice(2)}`
      const path = `${projectId}/${today}/${uid}.${ext}`
      const { error: upErr } = await supabase.storage.from('saha-fotolari').upload(path, file)
      if (upErr) continue
      await supabase.from('daily_report_photos').insert({
        report_id: rid, project_id: projectId,
        report_date: today, storage_path: path, uploaded_by: userId,
      })
    }

    pending.forEach(p => URL.revokeObjectURL(p.preview))
    setPending([])
    setUploading(false)
    loadPhotos()
  }

  async function deletePhoto(photo) {
    await supabase.storage.from('saha-fotolari').remove([photo.storage_path])
    await supabase.from('daily_report_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Saha Fotoğrafları</span>
          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
            Bugün · {photos.length} fotoğraf · Yönetici paneline yansır
          </span>
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#185FA5', color: '#fff', borderRadius: 8,
          padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          + Fotoğraf Ekle
          <input type="file" accept="image/*" multiple onChange={pickFiles} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ padding: '14px 18px' }}>
        {/* Pending uploads */}
        {pending.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px', fontWeight: 600 }}>
              Seçilen — {pending.length} dosya
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6, marginBottom: 12 }}>
              {pending.map((f, i) => (
                <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: '#F3F4F6' }}>
                  <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => setPending(prev => prev.filter((_, j) => j !== i))}
                    style={DEL_BTN}
                  >×</button>
                </div>
              ))}
            </div>
            <button
              onClick={uploadPending}
              disabled={uploading}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.7 : 1 }}
            >
              {uploading ? 'Yükleniyor…' : `${pending.length} Fotoğrafı Yükle`}
            </button>
          </div>
        )}

        {/* Uploaded photos */}
        {photos.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
            {photos.map(photo => (
              <div key={photo.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: '#F3F4F6', cursor: 'pointer' }}>
                <img
                  src={getUrl(photo.storage_path)}
                  alt=""
                  onClick={() => setLightbox(getUrl(photo.storage_path))}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
                <button onClick={() => deletePhoto(photo)} style={DEL_BTN}>×</button>
              </div>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', margin: '8px 0' }}>
            Bugün için henüz fotoğraf yüklenmedi.
          </p>
        ) : null}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, cursor: 'zoom-out',
          }}
        >
          <img
            src={lightbox}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: 'fixed', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', lineHeight: 1 }}
          >×</button>
        </div>
      )}
    </div>
  )
}

const DEL_BTN = {
  position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.55)',
  color: '#fff', border: 'none', borderRadius: '50%',
  width: 20, height: 20, fontSize: 14, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
}
