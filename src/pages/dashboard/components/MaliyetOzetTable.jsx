import { useState, Fragment } from 'react'
import { durumMeta, CATEGORY_META } from '../../../utils/finans'

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

// Finans > Genel sekmesindeki "Maliyet Kalemi Özeti" — CostBucketTable'ın (Maliyet Tablosu
// sekmesi) tam filtre/export araç çubuğuna dokunmadan, aynı genişlet/daralt satır
// davranışını kullanan sade bir özet: Planlanan / Gerçekleşen / Bekleyen / Kalan / Durum,
// genişletilince altındaki bütçe kalemlerini (yalnızca planlanan tutar — faturalar
// kalem değil kategori düzeyinde kaydedildiği için gerçekleşen/bekleyen/kalan alt
// kalem bazında hesaplanamıyor) gösterir.
export default function MaliyetOzetTable({ costBuckets, loading }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const buckets = (costBuckets?.buckets || []).map(b => ({ ...b, ...CATEGORY_META[b.key] }))

  function toggleExpand(key) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  if (loading) {
    return <p style={{ margin: 0, padding: '24px 20px', textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 13 }}>Yükleniyor…</p>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
      <thead>
        <tr>
          {['MALİYET KALEMİ', 'PLANLANAN', 'GERÇEKLEŞEN', 'BEKLEYEN', 'KALAN', 'DURUM'].map(h => (
            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9.5, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.35px' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {buckets.map(b => {
          const d = durumMeta(b.sapma)
          const isOpen = expanded.has(b.key)
          return (
            <Fragment key={b.key}>
              <tr onClick={() => toggleExpand(b.key)} style={{ borderTop: '1px solid var(--color-border)', cursor: 'pointer' }}>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
                  <span style={{ display: 'inline-block', width: 14, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span> {b.label}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-sub)' }}>{formatTRY(b.planned)}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: b.color }}>{formatTRY(b.actual)}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-warning)' }}>{formatTRY(b.pending)}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: b.remaining < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{formatTRY(b.remaining)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ background: d.bg, color: d.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{d.label}</span>
                </td>
              </tr>
              {isOpen && b.lines.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '10px 14px 10px 34px', fontSize: 12.5, color: 'var(--color-muted-light)' }}>Bu kategoride bütçe kalemi tanımlı değil.</td>
                </tr>
              )}
              {isOpen && b.lines.map(line => (
                <tr key={line.name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 14px 10px 34px', fontSize: 13, color: 'var(--color-text-sub)' }}>{line.name}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-sub)' }}>{formatTRY(line.planned_amount)}</td>
                  <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--color-muted-light)' }}>—</td>
                </tr>
              ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
