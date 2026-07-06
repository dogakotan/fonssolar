import { useState, Fragment } from 'react'
import { durumMeta } from '../../../utils/finans'

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatPct = (pct) => {
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : ''
  return `${sign}%${Math.abs(pct).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Malzeme/İşçilik/Diğer kova satırları + genişletilince altındaki bütçe kalemlerini gösteren
// paylaşılan tablo — hem Maliyet Tablosu sekmesinde hem Genel sekmenin özetinde kullanılır.
export default function CostBucketTable({ buckets, totalPlanned, totalActual, totalSapma, totalPct, compact = false }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const totalDurum = durumMeta(totalSapma)

  function toggleExpand(key) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: compact ? 560 : 780 }}>
      <thead>
        <tr>
          {['KALEM', 'KATEGORİ', 'PLANLANAN TUTAR', 'GERÇEKLEŞEN TUTAR', 'SAPMA (₺)', 'SAPMA (%)', 'DURUM'].map(h => (
            <th key={h} style={{ padding: compact ? '8px 12px' : '9px 14px', textAlign: 'left', fontSize: 9.5, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {buckets.map(b => {
          const d = durumMeta(b.sapma)
          const isOpen = expanded.has(b.key)
          return (
            <Fragment key={b.key}>
              <tr onClick={() => toggleExpand(b.key)} style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', cursor: 'pointer' }}>
                <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 700, color: 'var(--color-text)' }}>
                  <span style={{ display: 'inline-block', width: 14, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span> {b.label}
                </td>
                <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13, color: 'var(--color-muted)' }}>{b.lines.length} kalem</td>
                <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 700, color: 'var(--color-text)' }}>{formatTRY(b.planned)}</td>
                <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 700, color: b.color }}>{formatTRY(b.actual)}</td>
                <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 700, color: d.color }}>{b.sapma >= 0 ? '+' : ''}{formatTRY(b.sapma)}</td>
                <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 700, color: d.color }}>{formatPct(b.pct)}</td>
                <td style={{ padding: compact ? '10px 12px' : '12px 14px' }}>
                  <span style={{ background: d.bg, color: d.color, fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{d.label}</span>
                </td>
              </tr>
              {isOpen && b.lines.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '10px 14px 10px 34px', fontSize: 12.5, color: 'var(--color-muted-light)' }}>Bu kategoride bütçe kalemi tanımlı değil.</td>
                </tr>
              )}
              {isOpen && b.lines.map(line => (
                <tr key={line.name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 14px 10px 34px', fontSize: 13, color: 'var(--color-text-sub)' }}>{line.name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--color-muted)', textTransform: 'capitalize' }}>{line.category}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-sub)' }}>{formatTRY(toNumber(line.planned_amount))}</td>
                  <td colSpan={3} style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--color-muted-light)' }}>—</td>
                  <td />
                </tr>
              ))}
            </Fragment>
          )
        })}
        <tr style={{ borderTop: '2px solid var(--color-border-md)', background: 'var(--color-bg)' }}>
          <td colSpan={2} style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 800, color: 'var(--color-text)' }}>TOPLAM</td>
          <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 800, color: 'var(--color-text)' }}>{formatTRY(totalPlanned)}</td>
          <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 800, color: 'var(--color-text)' }}>{formatTRY(totalActual)}</td>
          <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 800, color: totalDurum.color }}>{totalSapma >= 0 ? '+' : ''}{formatTRY(totalSapma)}</td>
          <td style={{ padding: compact ? '10px 12px' : '12px 14px', fontSize: 13.5, fontWeight: 800, color: totalDurum.color }}>{formatPct(totalPct)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  )
}
