const formatKur = (value) =>
  (value != null && !Number.isNaN(value))
    ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ₺'
    : '—'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'az önce'
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} saat önce`
  const days = Math.floor(hours / 24)
  return `${days} gün önce`
}

const sectionBase = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-md)',
  borderRadius: 10,
  padding: '11px 14px',
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
}

const sectionTitle = {
  margin: 0, fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted-light)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}

const sectionDivider = { height: 1, background: 'var(--color-border-md)', margin: '7px 0' }

export default function ProjeTabFinansYanPanel({ doviz, recentActivity, loading }) {
  return (
    <>
      <section className="sa-card" style={{
        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '11px 14px',
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6, order: 2,
      }}>
        <p style={{ fontSize: 9.5, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
          TCMB Satış Kurları
        </p>
        <div>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 500, color: '#0369A1' }}>$ Dolar / TRY</p>
          <p style={{ margin: '1px 0 0', fontSize: 17, fontWeight: 700, color: '#0C4A6E', lineHeight: 1.1 }}>
            {formatKur(doviz.usd)}
          </p>
        </div>
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 6 }}>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 500, color: '#15803D' }}>€ Euro / TRY</p>
          <p style={{ margin: '1px 0 0', fontSize: 17, fontWeight: 700, color: '#14532D', lineHeight: 1.1 }}>
            {formatKur(doviz.eur)}
          </p>
        </div>
        <p style={{ margin: 0, fontSize: 9.5, color: '#94A3B8' }}>{doviz.date || 'Güncelleniyor…'}</p>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)', order: 6 }}>
        <h3 style={sectionTitle}>Son İşlemler</h3>
        <div style={sectionDivider} />
        {loading ? (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-muted-light)' }}>…</p>
        ) : recentActivity.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-muted-light)', fontSize: 12 }}>Henüz işlem yok.</p>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            {recentActivity.map(item => (
              <div key={item.id} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, marginTop: 4, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </p>
                  <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--color-muted)' }}>{item.subtitle} · {timeAgo(item.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
