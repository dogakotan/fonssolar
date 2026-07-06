import { formatActionItems } from '../../../utils/finans'

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
  padding: '17px 19px',
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
}

const sectionTitle = {
  margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--color-muted-light)',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}

const sectionDivider = { height: 1, background: 'var(--color-border-md)', margin: '10px 0' }

// Kur Bilgisi — küçük bir bilgi kartı olarak kalır, ana finans kartları kadar baskın olmamalı.
// Proje Finans Özeti ve Bütçe Kullanımı ile birlikte üst satırda (finans-panel-grid) yer alması
// için ayrı export edildi.
export function KurCard({ doviz }) {
  return (
    <section className="sa-card" style={{
      background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '17px 19px',
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <p style={{ fontSize: 10.5, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, whiteSpace: 'nowrap' }}>
        Kur Bilgisi
      </p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: '#0369A1', whiteSpace: 'nowrap' }}>$ Dolar / TRY</p>
          <p style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 700, color: '#0C4A6E', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {formatKur(doviz.usd)}
          </p>
        </div>
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 8, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: '#15803D', whiteSpace: 'nowrap' }}>€ Euro / TRY</p>
          <p style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 700, color: '#14532D', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {formatKur(doviz.eur)}
          </p>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 10.5, color: '#94A3B8', whiteSpace: 'nowrap' }}>{doviz.date || 'Güncelleniyor…'}</p>
    </section>
  )
}

function ActionRow({ item, onClick }) {
  const clickable = item.count > 0 && !!onClick
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
        cursor: clickable ? 'pointer' : 'default', borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.count > 0 ? item.color : 'var(--color-border-md)', flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--color-text)' }}>{item.label}</p>
        <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--color-muted)' }}>{item.description}</p>
      </div>
      <strong style={{ fontSize: 13, fontWeight: 800, color: item.count > 0 ? item.color : 'var(--color-muted-light)' }}>{item.count}</strong>
    </div>
  )
}

// "Aksiyon Gerektirenler" — muhasebe/yönetici onayı bekleyen fatura sayılarını gösterir, her satır
// ilgili alt sekmeye (onNavigate) yönlendirir. Altında Son Hareketler listesi kalan alanı doldurur.
export default function ProjeTabFinansYanPanel({ actionItems, recentActivity, onNavigate, loading }) {
  const rows = formatActionItems(actionItems)
  const recent = (recentActivity || []).slice(0, 3)

  return (
    <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)', order: 4 }}>
      <h3 style={sectionTitle}>Aksiyon Gerektirenler</h3>
      <div style={sectionDivider} />
      {loading ? (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-muted-light)' }}>…</p>
      ) : (
        <>
          <div>
            {rows.map(item => (
              <ActionRow key={item.key} item={item} onClick={onNavigate ? () => onNavigate(item.targetTab) : undefined} />
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border-md)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Son Hareketler</p>
            {recent.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-muted-light)', fontSize: 12 }}>Henüz işlem yok.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recent.map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, marginTop: 4, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </p>
                      <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--color-muted)' }}>{item.subtitle} · {timeAgo(item.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
