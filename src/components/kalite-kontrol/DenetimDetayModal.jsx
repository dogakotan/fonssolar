import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { SEVERITY_META } from '../../utils/ticketSeverity'
import { RESULT_META, STATUS_META, STATUS_OPTIONS } from '../../utils/qualityInspection'
import YeniDenetimModal from './YeniDenetimModal'

const fmtDate = (date) =>
  date ? new Date(date).toLocaleDateString('tr-TR') : '—'
const fmtDateTime = (value) =>
  value ? new Date(value).toLocaleString('tr-TR') : '—'

function Badge({ meta, value }) {
  const m = meta[value] || { bg: '#F3F4F6', color: '#374151', label: value || '—' }
  return (
    <span style={{ background: m.bg, color: m.color, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

export default function DenetimDetayModal({ inspectionId, onClose, onGoToTicket }) {
  const { user, isAdmin, role } = useAuth()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [busyFindingId, setBusyFindingId] = useState(null)
  const [uploadingFindingId, setUploadingFindingId] = useState(null)
  const [showEdit, setShowEdit] = useState(false)

  const canManage = isAdmin || role === 'kalite_kontrol_sefi'

  useEffect(() => { load() }, [inspectionId])

  async function load() {
    setLoading(true)
    setErrorMessage('')
    const { data, error } = await supabase.rpc('get_quality_inspection_detail', { p_id: inspectionId })
    if (error || !data?.authorized) {
      console.error('quality_inspection_detail load error:', error)
      setErrorMessage('Denetim yüklenemedi.')
      setInspection(null)
      setLoading(false)
      return
    }
    setInspection(data)
    setLoading(false)
  }

  async function changeStatus(findingId, status) {
    setBusyFindingId(findingId)
    const { error } = await supabase.rpc('update_quality_finding_status', { p_finding_id: findingId, p_status: status })
    if (error) {
      console.error('update_quality_finding_status error:', error)
      setErrorMessage('Bulgu durumu güncellenemedi.')
    } else {
      await load()
    }
    setBusyFindingId(null)
  }

  async function uploadPhoto(finding, file) {
    setUploadingFindingId(finding.id)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${inspection.project_id}/kalite-kontrolu/${finding.id}/${Date.now()}_${safeName}`
    const { error: uploadErr } = await supabase.storage.from('saha-fotolari').upload(path, file)
    if (uploadErr) {
      console.error('quality photo upload error:', uploadErr)
      setErrorMessage('Fotoğraf yüklenemedi.')
      setUploadingFindingId(null)
      return
    }
    const { error: insertErr } = await supabase.from('quality_inspection_photos').insert({
      finding_id: finding.id,
      project_id: inspection.project_id,
      storage_path: path,
      uploaded_by: user?.id,
    })
    if (insertErr) {
      console.error('quality_inspection_photos insert error:', insertErr)
      setErrorMessage('Fotoğraf kaydedilemedi.')
    } else {
      await load()
    }
    setUploadingFindingId(null)
  }

  async function removePhoto(photo) {
    await supabase.storage.from('saha-fotolari').remove([photo.storage_path])
    await supabase.from('quality_inspection_photos').delete().eq('id', photo.id)
    await load()
  }

  if (showEdit && inspection) {
    return (
      <YeniDenetimModal
        editInspection={inspection}
        defaultProjectId={inspection.project_id}
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); load() }}
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="modal-centered-box" style={{ width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>Kalite Denetimi Detayı</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>Yükleniyor…</div>
          ) : errorMessage ? (
            <p style={{ color: '#991B1B', fontSize: 13 }}>{errorMessage}</p>
          ) : inspection && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Tarih</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{fmtDate(inspection.inspection_date)}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Denetçi</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{inspection.inspector || '—'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Kategori</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{inspection.category || '—'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sonuç</p>
                  <Badge meta={RESULT_META} value={inspection.result} />
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Proje</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{inspection.project_name || '—'}</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Oluşturan</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{inspection.created_by_name || '—'}</p>
                </div>
              </div>

              {inspection.notes && (
                <div style={{ marginBottom: 18 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Not</p>
                  <p style={{ margin: 0, fontSize: 13.5, color: '#374151', whiteSpace: 'pre-wrap' }}>{inspection.notes}</p>
                </div>
              )}

              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>
                Bulgular ({inspection.findings?.length || 0})
              </h3>

              {(!inspection.findings || inspection.findings.length === 0) ? (
                <p style={{ fontSize: 13, color: '#9CA3AF' }}>Bu denetimde bulgu kaydedilmemiş.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {inspection.findings.map(finding => (
                    <div key={finding.id} style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {finding.location && (
                            <p style={{ margin: '0 0 3px', fontSize: 11.5, color: '#6B7280', fontWeight: 600 }}>{finding.location}</p>
                          )}
                          <p style={{ margin: 0, fontSize: 13.5, color: '#111827' }}>{finding.description}</p>
                          {finding.assigned_to && (
                            <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#6B7280' }}>Sorumlu: {finding.assigned_to}</p>
                          )}
                          {finding.resolved_at && (
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF' }}>Çözülme: {fmtDateTime(finding.resolved_at)}</p>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                          <Badge meta={SEVERITY_META} value={finding.severity} />
                          {canManage ? (
                            <select
                              value={finding.status}
                              disabled={busyFindingId === finding.id}
                              onChange={e => changeStatus(finding.id, e.target.value)}
                              style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '4px 6px', fontSize: 11.5, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
                            >
                              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <Badge meta={STATUS_META} value={finding.status} />
                          )}
                        </div>
                      </div>

                      {finding.ticket_id && (
                        <button
                          type="button"
                          onClick={() => onGoToTicket?.(finding.ticket_id)}
                          style={{
                            marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE',
                            borderRadius: 999, padding: '4px 12px', fontSize: 11.5, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          🎫 Ticket açıldı →
                        </button>
                      )}

                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        {(finding.photos || []).map(photo => {
                          const url = supabase.storage.from('saha-fotolari').getPublicUrl(photo.storage_path).data.publicUrl
                          return (
                            <div key={photo.id} style={{ position: 'relative' }}>
                              <a href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB' }} />
                              </a>
                              {photo.uploaded_by === user?.id && (
                                <button
                                  type="button"
                                  onClick={() => removePhoto(photo)}
                                  title="Sil"
                                  style={{
                                    position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                                    background: '#991B1B', color: '#fff', border: 'none', fontSize: 11, lineHeight: 1,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >×</button>
                              )}
                            </div>
                          )
                        })}
                        {canManage && (
                          <label style={{
                            width: 56, height: 56, borderRadius: 8, border: '1px dashed #D1D5DB',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: '#6B7280', cursor: 'pointer', textAlign: 'center',
                          }}>
                            {uploadingFindingId === finding.id ? '…' : '+ Foto'}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingFindingId === finding.id}
                              onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadPhoto(finding, f) }}
                              style={{ display: 'none' }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 20px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Kapat
          </button>
          {canManage && inspection && (
            <button
              onClick={() => setShowEdit(true)}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Düzenle
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
