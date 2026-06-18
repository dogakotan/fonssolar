import { useWeather } from '../../hooks/useWeather'

export default function WeatherWidget({ location, size = 'full' }) {
  const { loading, error, current, tomorrow } = useWeather(location)

  if (loading) return (
    <div style={size === 'mini' ? miniContainer : fullContainer}>
      <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Hava yükleniyor…</span>
    </div>
  )

  if (error || !current) return (
    <div style={size === 'mini' ? miniContainer : fullContainer}>
      <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Hava durumu alınamadı</span>
    </div>
  )

  if (size === 'mini') {
    return (
      <div style={miniContainer}>
        <span style={{ fontSize: 14 }}>{current.emoji}</span>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {current.temp}°C · {current.label}
        </span>
      </div>
    )
  }

  // size === 'full'
  return (
    <div style={fullContainer}>
      {/* Bugün — ana blok */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: 38, lineHeight: 1 }}>{current.emoji}</span>
        <div>
          <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1 }}>{current.temp}°</span>
          <p style={{ fontSize: 13, color: '#374151', margin: '0.15rem 0 0' }}>{current.label}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', fontSize: 12, color: 'var(--color-muted)' }}>
          <span>💨 {current.wind} km/h</span>
          <span>💧 %{current.humidity}</span>
        </div>
      </div>

      {/* Ayırıcı */}
      <div style={{ height: 1, background: 'rgba(148,163,184,0.3)', margin: '0 0 0.5rem' }} />

      {/* Yarın — kompakt satır */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>Yarın</span>
        <span style={{ fontSize: 15 }}>{tomorrow.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{tomorrow.max}°</span>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{tomorrow.min}°</span>
        <span style={{ fontSize: 12, color: '#374151', marginLeft: '0.25rem' }}>{tomorrow.label}</span>
        <span style={{ fontSize: 12, color: 'var(--color-muted)', marginLeft: 'auto' }}>🌧️ %{tomorrow.rain}</span>
      </div>
    </div>
  )
}

// ── Stiller ────────────────────────────────────────────────────────────────

const miniContainer = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  marginTop: '0.5rem',
}

const fullContainer = {
  display: 'flex',
  flexDirection: 'column',
  background: 'linear-gradient(135deg, #f0f7ff 0%, #e8f4e8 100%)',
  borderRadius: 10,
  padding: '0.875rem 1rem',
  border: '1px solid #dbeafe',
}

const fullCard = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

const dateLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: '0 0 0.375rem',
}

const descLabel = {
  fontSize: 13,
  color: '#374151',
  margin: '0.125rem 0',
}

const metaRow = {
  display: 'flex',
  gap: '0.75rem',
  fontSize: 12,
  color: 'var(--color-muted)',
  marginTop: '0.25rem',
}
