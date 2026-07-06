import { durumMeta, CATEGORY_META } from '../../../utils/finans'

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

// Finans > Genel sekmesindeki "Maliyet Kalemi Özeti" — CostBucketTable'a (Maliyet Tablosu sekmesi,
// genişletilebilir/filtrelenebilir) dokunmadan, yöneticiye hızlı fikir veren sade ve
// genişletilemeyen bir özet: Planlanan / Gerçekleşen / Bekleyen / Kalan / Durum.
export default function MaliyetOzetTable({ costBuckets, loading }) {
  const buckets = (costBuckets?.buckets || []).map(b => ({ ...b, ...CATEGORY_META[b.key] }))

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
          return (
            <tr key={b.key} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{b.label}</td>
              <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-sub)' }}>{formatTRY(b.planned)}</td>
              <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: b.color }}>{formatTRY(b.actual)}</td>
              <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-warning)' }}>{formatTRY(b.pending)}</td>
              <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: b.remaining < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{formatTRY(b.remaining)}</td>
              <td style={{ padding: '10px 14px' }}>
                <span style={{ background: d.bg, color: d.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{d.label}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
