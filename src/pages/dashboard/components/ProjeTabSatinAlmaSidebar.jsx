import { useState } from 'react'
import { statusLabel, normalizeStatus } from '../../../utils/satinAlma'

const formatKur = (value) =>
  (value != null && !Number.isNaN(value))
    ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ₺'
    : '—'

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function StatusDot({ color }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

function RecentIcon({ color, children }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', background: color, color: '#fff',
      display: 'inline-grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

// Malzeme/Hizmet oranı — donut her zaman görünür. Her renk kendi diliminde ayrı
// hover edilebilir (SVG arc'ları) ve sadece o dilime ait bilgiyi gösterir.
function PercentDonut({ total, totalLabel, items, size = 108, thickness = 20 }) {
  const [hovered, setHovered] = useState(null)
  const r = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const holeSize = size - thickness * 2

  let acc = 0
  const arcs = items.map(item => {
    const pct = percent(item.value, total)
    const length = (pct / 100) * circumference
    const offset = -((acc / 100) * circumference)
    acc += pct
    return { ...item, pct, length, offset }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {total <= 0 && (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border-md)" strokeWidth={thickness} />
          )}
          {total > 0 && arcs.map(arc => arc.pct > 0 && (
            <circle
              key={arc.label}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={thickness}
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={arc.offset}
              opacity={hovered && hovered !== arc.label ? 0.4 : 1}
              onMouseEnter={() => setHovered(arc.label)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default', transition: 'opacity .15s ease' }}
            />
          ))}
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ width: holeSize, height: holeSize, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--color-border-md)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{totalLabel}</span>
          </div>
        </div>
        {hovered && arcs.filter(arc => arc.label === hovered).map(arc => (
          <div key={arc.label} style={{
            position: 'absolute', left: '50%', top: 'calc(100% + 10px)', transform: 'translateX(-50%)', zIndex: 20, width: 148,
            background: '#fff', border: `1px solid ${arc.color}`, borderRadius: 10, padding: '8px 11px',
            boxShadow: '0 14px 28px rgba(15,23,42,0.14)', fontSize: 12, whiteSpace: 'nowrap',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-sub)', fontWeight: 700 }}><StatusDot color={arc.color} /> {arc.label}</span>
              <strong style={{ color: arc.color, fontWeight: 800 }}>{arc.value} · %{arc.pct}</strong>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 9.5, color: 'var(--color-muted-light)', textAlign: 'center' }}>
        Yüzdeler toplam {totalLabel === 'talep' ? 'talebe' : totalLabel} göre hesaplanmıştır.
      </p>
    </div>
  )
}

function ColumnChart({ total, totalLabel, items }) {
  const maxBarHeight = 62
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-muted)' }}>Toplam</span>
        <strong style={{ fontSize: 17, color: 'var(--color-text)' }}>
          {total} <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)' }}>{totalLabel}</span>
        </strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 26, height: maxBarHeight + 38, padding: '0 6px' }}>
        {items.map(item => {
          const pct = percent(item.value, total)
          const barHeight = total > 0 ? Math.max(8, Math.round((pct / 100) * maxBarHeight)) : 6
          return (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 54 }}>
              <strong style={{ fontSize: 15, color: item.color, lineHeight: 1 }}>{item.value}</strong>
              <div style={{ width: 42, height: barHeight, borderRadius: '8px 8px 3px 3px', background: item.color, transition: 'height .2s ease' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const sectionBase = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-md)',
  borderRadius: 10,
  padding: '12px 16px',
  minHeight: 118,
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-card)',
  display: 'flex',
  flexDirection: 'column',
}

// Başlık her kartta üstte sabit kalsın, sadece alttaki içerik (grafik/liste) kalan
// boşlukta dikeyde ortalansın — aksi halde farklı içerik yüksekliklerinde başlıklar
// kartlar arasında farklı hizalarda görünür.
const sectionBody = { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }

const sectionTitle = {
  margin: 0, fontSize: 10, fontWeight: 700, color: 'var(--color-muted-light)',
  textTransform: 'uppercase', letterSpacing: '0.6px',
}

const sectionDivider = { height: 1, background: 'var(--color-border-md)', margin: '9px 0' }

export default function ProjeTabSatinAlmaSidebar({ tedarik, dagilim, recent, doviz }) {
  const tedarikItems = [
    { label: 'Uygun', value: tedarik.ok, color: 'var(--color-success)' },
    { label: 'Riskli', value: tedarik.excess, color: 'var(--color-danger)' },
  ]
  const dagilimItems = [
    { label: 'Malzeme', value: dagilim.malzeme, color: 'var(--color-primary)' },
    { label: 'Hizmet', value: dagilim.hizmet, color: 'var(--color-success)' },
  ]
  const dagilimTotal = dagilim.malzeme + dagilim.hizmet

  return (
    <>
      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-success)', order: 2 }}>
        <h3 style={sectionTitle}>Malzeme Tedarik</h3>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          <ColumnChart total={tedarik.total} totalLabel="talep" items={tedarikItems} />
        </div>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)', order: 3 }}>
        <h3 style={sectionTitle}>Talep Dağılımı</h3>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          <PercentDonut total={dagilimTotal} totalLabel="talep" items={dagilimItems} />
        </div>
      </section>

      <section className="sa-card" style={{ ...sectionBase, borderTop: '3px solid var(--color-primary)', order: 4 }}>
        <h3 style={sectionTitle}>Son İşlemler</h3>
        <div style={sectionDivider} />
        <div style={sectionBody}>
          <div style={{ display: 'grid', gap: 7 }}>
            {recent.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-muted-light)', fontSize: 13 }}>Henüz işlem yok.</p>
            ) : recent.map(request => {
              const status = normalizeStatus(request.status)
              const invoiceInProgress = ['fatura_bekliyor', 'fatura_onay_bekliyor'].includes(status)
              const icon = status === 'red_edildi' ? '×' : invoiceInProgress ? '▤' : status === 'bekliyor' ? '◷' : '✓'
              const color = status === 'red_edildi' ? 'var(--color-danger)' : invoiceInProgress ? 'var(--color-primary)' : status === 'bekliyor' ? 'var(--color-warning)' : 'var(--color-success)'
              return (
                <div key={request.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <RecentIcon color={color}>{icon}</RecentIcon>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {request.title || 'Satın alma talebi'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--color-muted)' }}>{statusLabel(request.status)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="sa-card" style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: '16px 20px',
        minHeight: 118,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        order: 5,
      }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>
          TCMB SATIŞ KURLARI
        </p>
        <div style={{ ...sectionBody, gap: 8 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#0369A1' }}>$ Dolar / TRY</p>
            <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#0C4A6E', lineHeight: 1.1 }}>
              {formatKur(doviz.usd)}
            </p>
          </div>
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#15803D' }}>€ Euro / TRY</p>
            <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#14532D', lineHeight: 1.1 }}>
              {formatKur(doviz.eur)}
            </p>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94A3B8' }}>{doviz.date || 'Güncelleniyor…'}</p>
        </div>
      </section>
    </>
  )
}
