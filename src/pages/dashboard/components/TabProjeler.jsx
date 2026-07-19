import { useState, useEffect } from 'react'
import { getProjects } from '../../../api'
import { PROJECT_STATUS_META } from '../../../utils/projectStatus'

const TYPE_OPTIONS = [
  { value: 'tümü',                 label: 'Tüm Tipler' },
  { value: 'arazi_ges',            label: 'Arazi GES' },
  { value: 'endustriyel_cati_ges', label: 'Endüstriyel Çatı GES' },
  { value: 'evsel_ges',            label: 'Evsel GES' },
]

const TYPE_LABEL = {
  arazi_ges:            'Arazi GES',
  endustriyel_cati_ges: 'Endüstriyel Çatı',
  evsel_ges:            'Evsel GES',
}

function dateTr(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).split('T')[0].split('-')
  return y && m && d ? `${d}.${m}.${y}` : String(iso)
}

const DROP_STYLE = {
  padding: '0.4rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: 8,
  background: '#fff', color: '#374151', fontSize: 12, fontFamily: 'inherit',
  cursor: 'pointer', outline: 'none',
}

const COL_STYLE = {
  padding: '8px 10px', textAlign: 'left', color: '#64748b',
  fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase',
  letterSpacing: '.04em', whiteSpace: 'nowrap',
  borderBottom: '1px solid #e2e8f0',
}

export default function TabProjeler({ onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState('tümü')
  const [typeFilter,   setTypeFilter]   = useState('tümü')
  const [hoveredId,    setHoveredId]    = useState(null)

  useEffect(() => {
    getProjects().then(({ data, error }) => {
      if (!error) setProjects(data || [])
      setLoading(false)
    })
  }, [])

  const filtered = projects
    .filter(p => statusFilter === 'tümü' || p.status === statusFilter)
    .filter(p => typeFilter   === 'tümü' || p.project_type === typeFilter)

  return (
    <div className="card">
      <div className="card-header">
        <div>
          {!loading && (
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Toplam Proje: {projects.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={DROP_STYLE}>
            <option value="tümü">Tüm Durumlar</option>
            <option value="aktif">Aktif</option>
            <option value="tamamlandı">Tamamlandı</option>
            <option value="beklemede">Beklemede</option>
            <option value="iptal edildi">İptal</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={DROP_STYLE}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-muted)' }}>
            Yükleniyor…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-muted)' }}>
            {projects.length === 0 ? 'Henüz proje yok.' : 'Filtreye uyan proje bulunamadı.'}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={COL_STYLE}>Proje Adı</th>
                <th style={COL_STYLE}>Tür</th>
                <th style={COL_STYLE}>Kapasite</th>
                <th style={COL_STYLE}>Hedef Tarih</th>
                <th style={COL_STYLE}>Durum</th>
                <th style={{ ...COL_STYLE, minWidth: 120 }}>İlerleme</th>
                <th style={{ ...COL_STYLE, width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const sc      = PROJECT_STATUS_META[p.status] || { bg: '#f1f5f9', color: '#475569', label: 'Aktif' }
                const cap     = p.capacity_kwp ? `${Number(p.capacity_kwp).toLocaleString('tr-TR')} kWp` : '—'
                const end     = dateTr(p.target_date)
                const typeLbl = TYPE_LABEL[p.project_type] || '—'
                const pct     = p.progress || 0
                const isHov   = hoveredId === p.id

                return (
                  <tr
                    key={p.id}
                    onMouseEnter={() => setHoveredId(p.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSelectProject?.(p.id, p.name)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: isHov ? '#f8fafc' : '#fff',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                  >
                    {/* Proje adı + konum */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 13 }}>
                        {p.name}
                      </div>
                      {p.location && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          📍 {p.location}
                        </div>
                      )}
                    </td>

                    {/* Tür */}
                    <td style={{ padding: '10px 10px', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {typeLbl}
                    </td>

                    {/* Kapasite */}
                    <td style={{ padding: '10px 10px', color: '#475569', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {cap}
                    </td>

                    {/* Hedef tarih */}
                    <td style={{ padding: '10px 10px', color: '#475569', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {end}
                    </td>

                    {/* Durum */}
                    <td style={{ padding: '10px 10px', verticalAlign: 'middle' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12,
                        fontSize: 11, fontWeight: 600,
                        background: sc.bg, color: sc.color,
                        whiteSpace: 'nowrap',
                      }}>
                        {sc.label}
                      </span>
                    </td>

                    {/* İlerleme */}
                    <td style={{ padding: '10px 10px', minWidth: 120, verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#003B8E', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>{pct}%</span>
                      </div>
                    </td>

                    {/* Ok */}
                    <td style={{ padding: '10px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke={isHov ? '#003B8E' : '#cbd5e1'}
                        strokeWidth="2.5"
                        style={{ display: 'block', transition: 'stroke 0.12s' }}
                      >
                        <path d="m9 18 6-6-6-6"/>
                      </svg>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
