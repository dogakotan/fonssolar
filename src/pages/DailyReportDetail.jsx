import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PRIORITY_COLORS = {
  kritik: { bg: '#FEE2E2', color: '#991B1B' },
  yüksek: { bg: '#FEF3C7', color: '#92400E' },
  orta:   { bg: '#EEF2FF', color: '#3730A3' },
  düşük:  { bg: '#F0FDF4', color: '#065F46' },
}
const RESOLUTION_COLORS = {
  açık:    { bg: '#FEE2E2', color: '#991B1B' },
  devam:   { bg: '#FEF3C7', color: '#92400E' },
  çözüldü: { bg: '#D1FAE5', color: '#065F46' },
}
const DEPT_LABELS = { idari: 'İdari', mekanik: 'Mekanik', elektrik: 'Elektrik', yevmiyeci: 'Yevmiyeci' }
const DEPARTMENTS = ['idari', 'mekanik', 'elektrik', 'yevmiyeci']

function Badge({ text, style }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      textTransform: 'uppercase', letterSpacing: '0.4px', ...style,
    }}>{text}</span>
  )
}

export default function DailyReportDetail({ reportId, onClose, onEdit }) {
  const [loading, setLoading] = useState(true)
  const [report, setReport]   = useState(null)
  const [personnel, setPersonnel] = useState([])
  const [machinery, setMachinery] = useState([])
  const [progress, setProgress]   = useState([])
  const [materials, setMaterials] = useState([])
  const [photos, setPhotos]       = useState([])
  const [issues, setIssues]       = useState([])

  useEffect(() => {
    if (reportId) loadAll()
  }, [reportId])

  async function loadAll() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_daily_report_detail', {
        p_report_id: reportId,
      })
      if (error) { console.error('get_daily_report_detail error:', error); return }

      setReport(data.report || null)
      setPersonnel(data.personnel || [])
      setMachinery(data.machinery || [])
      setProgress(data.progress || [])
      setMaterials(data.materials || [])
      setPhotos(data.photos || [])
      setIssues(data.issues || [])
    } finally {
      setLoading(false)
    }
  }

  if (!reportId) return null

  // Build personnel pivot
  const shifts = [...new Set(personnel.map(p => p.shift))]
  const personnelByShift = {}
  shifts.forEach(shift => {
    personnelByShift[shift] = {}
    DEPARTMENTS.forEach(dept => { personnelByShift[shift][dept] = 0 })
    personnel.filter(p => p.shift === shift).forEach(p => {
      personnelByShift[shift][p.department] = p.count
    })
  })

  return (
    <div style={OVERLAY} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={PANEL}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #F3F4F6',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>Günlük Rapor Detayı</h2>
            {report && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>
                {new Date(report.report_date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {report.profiles?.full_name && ` · ${report.profiles.full_name}`}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {onEdit && (
              <button onClick={() => onEdit(reportId)} style={BTN_SECONDARY}>✏ Düzenle</button>
            )}
            <button
              title="PDF Dışa Aktar" disabled
              style={{ ...BTN_GHOST, opacity: 0.5, cursor: 'not-allowed' }}
              onClick={() => {}}
            >
              PDF ↓
            </button>
            <button onClick={onClose} style={CLOSE_BTN}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Yükleniyor…</div>
          ) : !report ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Rapor bulunamadı.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* 1. Genel Bilgiler */}
              <section>
                <p style={SEC_TITLE}>Genel Bilgiler</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  <InfoCard label="Hava Durumu"    value={report.weather        || '—'} />
                  <InfoCard label="Genel Durum"    value={report.general_status || '—'} />
                  <InfoCard label="Toplam Personel" value={`${report.worker_count || 0} kişi`} />
                  {report.weather_note && <InfoCard label="Hava Notu" value={report.weather_note} />}
                </div>
                {report.notes && (
                  <div style={{ marginTop: 12, background: '#F9FAFB', borderRadius: 8, padding: '12px 14px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>Genel Notlar</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#111827', lineHeight: 1.6 }}>{report.notes}</p>
                  </div>
                )}
              </section>

              {/* 2. Personel */}
              {personnel.length > 0 && (
                <section>
                  <p style={SEC_TITLE}>Personel Durumu</p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Vardiya</th>
                          {DEPARTMENTS.map(d => <th key={d} style={TH}>{DEPT_LABELS[d]}</th>)}
                          <th style={TH}>Toplam</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shifts.map(shift => {
                          const row = personnelByShift[shift]
                          const total = DEPARTMENTS.reduce((s, d) => s + (row[d] || 0), 0)
                          return (
                            <tr key={shift}>
                              <td style={{ ...TD, fontWeight: 600 }}>{shift}</td>
                              {DEPARTMENTS.map(dept => <td key={dept} style={TD}>{row[dept] || 0}</td>)}
                              <td style={{ ...TD, fontWeight: 700, color: '#003B8E' }}>{total}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* 3. Makineler */}
              {machinery.length > 0 && (
                <section>
                  <p style={SEC_TITLE}>İş Makineleri</p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 380 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Makine Türü</th>
                          <th style={TH}>Adet</th>
                          <th style={TH}>Durum</th>
                          <th style={TH}>Notlar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {machinery.map((m, i) => (
                          <tr key={i}>
                            <td style={{ ...TD, fontWeight: 500 }}>{m.machine_type}</td>
                            <td style={TD}>{m.count}</td>
                            <td style={TD}>
                              <Badge text={m.status} style={{
                                bg: m.status === 'Çalışıyor' ? '#D1FAE5' : m.status === 'Arızalı' ? '#FEE2E2' : '#FEF3C7',
                                color: m.status === 'Çalışıyor' ? '#065F46' : m.status === 'Arızalı' ? '#991B1B' : '#92400E',
                                background: m.status === 'Çalışıyor' ? '#D1FAE5' : m.status === 'Arızalı' ? '#FEE2E2' : '#FEF3C7',
                              }} />
                            </td>
                            <td style={{ ...TD, color: '#6B7280' }}>{m.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* 4. İmalat İlerlemesi */}
              {progress.length > 0 && (
                <section>
                  <p style={SEC_TITLE}>İmalat İlerlemesi</p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 420 }}>
                      <thead>
                        <tr>
                          <th style={{ ...TH, textAlign: 'left' }}>İş Kalemi</th>
                          <th style={TH}>Birim</th>
                          <th style={TH}>Bugün Eklenen</th>
                          <th style={TH}>Toplam</th>
                          <th style={TH}>Hedef</th>
                          <th style={TH}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progress.map((p, i) => {
                          const target = Number(p.progress_items?.target_qty) || 0
                          const total  = Number(p.progress_items?.total_progress) || 0
                          const pct    = target > 0 ? Math.min(100, (total / target * 100)).toFixed(1) : '—'
                          return (
                            <tr key={i}>
                              <td style={{ ...TD, textAlign: 'left', fontWeight: 500 }}>{p.progress_items?.name || '—'}</td>
                              <td style={TD}>{p.progress_items?.unit || '—'}</td>
                              <td style={{ ...TD, fontWeight: 600, color: '#003B8E' }}>{p.qty_added}</td>
                              <td style={TD}>{total}</td>
                              <td style={TD}>{target}</td>
                              <td style={{ ...TD, fontWeight: 600, color: Number(pct) >= 100 ? '#22c55e' : '#374151' }}>
                                {pct !== '—' ? `${pct}%` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* 5. Malzeme Kullanımı */}
              {materials.length > 0 && (
                <section>
                  <p style={SEC_TITLE}>Malzeme Kullanımı</p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 380 }}>
                      <thead>
                        <tr>
                          <th style={{ ...TH, textAlign: 'left' }}>Malzeme</th>
                          <th style={TH}>Miktar</th>
                          <th style={TH}>Birim</th>
                          <th style={{ ...TH, textAlign: 'left' }}>İş Kalemi</th>
                          <th style={{ ...TH, textAlign: 'left' }}>Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map((m, i) => (
                          <tr key={i}>
                            <td style={{ ...TD, textAlign: 'left', fontWeight: 500 }}>{m.material_name}</td>
                            <td style={TD}>{m.quantity_used}</td>
                            <td style={TD}>{m.unit}</td>
                            <td style={{ ...TD, textAlign: 'left', color: '#6B7280' }}>{m.progress_items?.name || '—'}</td>
                            <td style={{ ...TD, textAlign: 'left', color: '#6B7280' }}>{m.description || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* 6. Fotoğraflar */}
              {photos.length > 0 && (
                <section>
                  <p style={SEC_TITLE}>Saha Fotoğrafları ({photos.length})</p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 10,
                  }}>
                    {photos.map(photo => {
                      const url = supabase.storage.from('saha-fotolari').getPublicUrl(photo.storage_path).data.publicUrl
                      return (
                        <div key={photo.id}>
                          <img
                            src={url}
                            alt={photo.caption || ''}
                            style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB', cursor: 'pointer' }}
                            onClick={() => window.open(url, '_blank')}
                          />
                          {photo.caption && (
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6B7280', textAlign: 'center', lineHeight: 1.3 }}>
                              {photo.caption}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* 7. Sorunlar */}
              {issues.length > 0 && (
                <section>
                  <p style={SEC_TITLE}>Sorunlar / Blokerlar ({issues.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {issues.map((issue, i) => (
                      <div key={i} style={{
                        background: '#F9FAFB', borderRadius: 10, padding: '12px 14px',
                        border: '1px solid #E5E7EB',
                        borderLeft: `3px solid ${PRIORITY_COLORS[issue.priority]?.color || '#9CA3AF'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827' }}>{issue.topic}</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: PRIORITY_COLORS[issue.priority]?.bg,
                              color: PRIORITY_COLORS[issue.priority]?.color,
                            }}>{issue.priority}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: RESOLUTION_COLORS[issue.resolution_status]?.bg,
                              color: RESOLUTION_COLORS[issue.resolution_status]?.color,
                            }}>{issue.resolution_status}</span>
                          </div>
                        </div>
                        {issue.description && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#374151' }}>{issue.description}</p>}
                        {issue.assigned_to && <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>İlgili: {issue.assigned_to}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value }) {
  return (
    <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 12px', border: '1px solid #E5E7EB' }}>
      <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>{value}</p>
    </div>
  )
}

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
}
const PANEL = {
  background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column',
  width: '96vw', maxWidth: 900, maxHeight: '92vh',
  boxShadow: '0 25px 80px rgba(0,0,0,.25)',
}
const CLOSE_BTN = { background: 'none', border: 'none', fontSize: 24, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1, padding: 0 }
const SEC_TITLE = { margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #E5E7EB', paddingBottom: 8 }
const TH = { padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F9FAFB', border: '1px solid #E5E7EB', whiteSpace: 'nowrap' }
const TD = { padding: '7px 10px', textAlign: 'center', border: '1px solid #E5E7EB', fontSize: 13 }
const BTN_SECONDARY = { background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_GHOST = { background: 'none', color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
