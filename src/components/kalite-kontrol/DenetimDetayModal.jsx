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

export default function DenetimDetayModal({ inspectionId, onClose }) {
  const { isAdmin, role } = useAuth()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [busyFindingId, setBusyFindingId] = useState(null)
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
