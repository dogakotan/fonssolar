import { useState, useEffect } from 'react'
import { getProjects } from '../../../api'
import ProgBar from '../../../components/ui/ProgBar'

const STATUS_MAP = {
  aktif:          { badge: 'green', label: 'Aktif' },
  tamamlandı:     { badge: 'blue',  label: 'Tamamlandı' },
  beklemede:      { badge: 'amber', label: 'Beklemede' },
  'iptal edildi': { badge: 'red',   label: 'İptal' },
}

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
          <div style={{ padding: '0 0.25rem' }}>
            {/* Başlık satırı */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1.4fr 28px',
              padding: '0.625rem 1.25rem',
              background: '#f8fafc',
              borderRadius: 8,
              marginBottom: '0.5rem',
            }}>
              {['PROJE ADI', 'TÜR', 'KAPASİTE', 'HEDEF TARİH', 'DURUM', 'İLERLEME', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>

            {/* Proje satırları */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filtered.map(p => {
                const s     = STATUS_MAP[p.status] || { badge: 'green', label: 'Aktif' }
                const cap   = p.capacity_kwp ? `${p.capacity_kwp} kWp` : '—'
                const end     = dateTr(p.target_date)
                const typeLbl = TYPE_LABEL[p.project_type] || '—'
                const pct     = p.progress || 0
                const isHov   = hoveredId === p.id

                return (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHoveredId(p.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => onSelectProject?.(p.id, p.name)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1.4fr 28px',
                      alignItems: 'center',
                      padding: '0.875rem 1.25rem',
                      background: '#fff',
                      border: `1px solid ${isHov ? '#003B8E' : '#e2e8f0'}`,
                      borderRadius: 12,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      boxShadow: isHov ? '0 2px 12px rgba(0,59,142,0.09)' : '0 1px 3px rgba(0,0,0,0.04)',
                      fontSize: 13,
                    }}
                  >
                    {/* Proje adı + konum */}
                    <div style={{ minWidth: 0, paddingRight: '0.75rem' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📍 {p.location || '—'}
                      </div>
                    </div>
                    {/* Tür */}
                    <div style={{ color: '#64748b', fontSize: 12, paddingRight: '0.5rem' }}>{typeLbl}</div>
                    {/* Kapasite */}
                    <div style={{ color: '#475569', whiteSpace: 'nowrap' }}>{cap}</div>
                    {/* Hedef tarih */}
                    <div style={{ color: '#475569', whiteSpace: 'nowrap' }}>{end}</div>
                    {/* Durum */}
                    <div>
                      <span className={`badge ${s.badge}`}>● {s.label}</span>
                    </div>
                    {/* İlerleme */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <ProgBar pct={pct} />
                    </div>
                    {/* Ok */}
                    <div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isHov ? '#003B8E' : '#cbd5e1'} strokeWidth="2.5" style={{ transition: 'stroke 0.12s', display: 'block' }}>
                        <path d="m9 18 6-6-6-6"/>
                      </svg>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
