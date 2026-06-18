import { useState, useEffect } from 'react'
import { getProjects } from '../../../api'
import ProgBar from '../../../components/ui/ProgBar'

const STATUS_MAP = {
  active:    { badge: 'green', label: 'Aktif' },
  completed: { badge: 'blue',  label: 'Tamamlandı' },
  on_hold:   { badge: 'amber', label: 'Beklemede' },
  cancelled: { badge: 'red',   label: 'İptal' },
}

export default function TabProjeler({ onSelectProject }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    getProjects().then(({ data, error }) => {
      if (!error) setProjects(data || [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="card">
      <div className="card-header">
        <h3>Projeler</h3>
        {!loading && (
          <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            {projects.length} proje
          </span>
        )}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Proje Adı</th>
            <th>Kapasite</th>
            <th>Hedef Tarih</th>
            <th>Durum</th>
            <th style={{ width: 180 }}>İlerleme</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-muted)' }}>
                Yükleniyor…
              </td>
            </tr>
          )}
          {!loading && projects.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-muted)' }}>
                Henüz proje yok.
              </td>
            </tr>
          )}
          {projects.map(p => {
            const s    = STATUS_MAP[p.status] || { badge: 'green', label: 'Aktif' }
            const mwp  = p.capacity_kwp ? `${(p.capacity_kwp / 1000).toFixed(2)} MWp` : '—'
            const date = p.target_date
              ? new Date(p.target_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—'

            return (
              <tr
                key={p.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectProject?.(p.id, p.name)}
              >
                <td>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  {p.location && (
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                      📍 {p.location}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 13 }}>⚡ {mwp}</td>
                <td style={{ fontSize: 13, color: 'var(--color-muted)' }}>📅 {date}</td>
                <td>
                  <span className={`badge ${s.badge}`}>● {s.label}</span>
                </td>
                <td>
                  <ProgBar pct={p.progress || 0} />
                </td>
                <td style={{ textAlign: 'right', color: 'var(--color-muted)', fontSize: 16 }}>›</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
