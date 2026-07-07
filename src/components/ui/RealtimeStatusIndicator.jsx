// useRealtimeRefresh ile birlikte kullanılan ortak gösterge: bağlantı durumu
// ("Canlı" / "Bağlanıyor…" / "Çevrimdışı") + son yenileme zaman etiketi.
function formatTime(date) {
  if (!date) return '—'
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function RealtimeStatusIndicator({ status, lastUpdated }) {
  const isLive = status === 'live'
  const isOffline = status === 'offline'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5,
      color: isOffline ? '#B45309' : 'var(--color-muted)', fontWeight: 500,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: isLive ? '#16a34a' : isOffline ? '#f59e0b' : '#94a3b8',
          display: 'inline-block',
          animation: isLive ? 'realtime-pulse 2s ease-in-out infinite' : 'none',
        }} />
        {isLive ? 'Canlı' : isOffline ? 'Çevrimdışı' : 'Bağlanıyor…'}
      </span>
      <span>· Son güncelleme: {formatTime(lastUpdated)}</span>
      <style>{`@keyframes realtime-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }`}</style>
    </div>
  )
}
