// useDashboardData ile birlikte kullanılan ortak durum bandı:
// hata varsa Türkçe mesaj + Tekrar Dene butonu; yoksa ve `refreshing` ise
// köşede küçük bir "güncelleniyor" göstergesi. İkisi de yoksa hiçbir şey render etmez.
export default function DataStatusBanner({ error, refreshing, onRetry }) {
  if (error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B',
        borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13,
      }}>
        <span>{error}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              background: '#991B1B', color: '#fff', border: 'none', borderRadius: 6,
              padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Tekrar Dene
          </button>
        )}
      </div>
    )
  }

  if (refreshing) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
        fontSize: 11.5, color: 'var(--color-muted)', fontWeight: 500,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: '#0ea5e9',
          display: 'inline-block', animation: 'pulse-dot 1.2s ease-in-out infinite',
        }} />
        Güncelleniyor…
        <style>{`@keyframes pulse-dot { 0%,100% { opacity: 1 } 50% { opacity: .3 } }`}</style>
      </div>
    )
  }

  return null
}

// authorized:false döndüren dashboard RPC'leri için ortak "erişim yok" ekranı.
export function UnauthorizedScopeNotice() {
  return (
    <div style={{
      background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
      padding: '32px 24px', textAlign: 'center', color: '#92400E',
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Bu projeye erişim yetkiniz yok.</p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#B45309' }}>
        Kapsam seçiciden erişebildiğiniz bir proje seçin.
      </p>
    </div>
  )
}
