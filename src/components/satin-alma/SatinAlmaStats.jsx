import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const CARD = {
  background: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  padding: '16px 20px',
  flex: 1,
  minWidth: 140,
}

export default function SatinAlmaStats() {
  const [counts, setCounts] = useState({ bekliyor: 0, onaylandı: 0, fatura_kesilecek: 0, fatura_kesildi: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('purchase_requests')
        .select('status')
      if (data) {
        const c = { bekliyor: 0, onaylandı: 0, fatura_kesilecek: 0, fatura_kesildi: 0 }
        data.forEach(r => {
          if (r.status === 'bekliyor')       c.bekliyor++
          if (r.status === 'onaylandı')      c.onaylandı++
          if (r.status === 'fatura_kesildi') c.fatura_kesildi++
        })
        setCounts(c)
      }
      setLoading(false)
    }
    load()
  }, [])

  const cards = [
    { label: 'Toplam Talep',       value: Object.values(counts).reduce((a, b) => a + b, 0), color: '#111827', note: 'Tüm talepler' },
    { label: 'Onay Bekliyor',      value: counts.bekliyor,      color: '#92400E', note: 'Yönetici onayında', bg: '#FEF3C7' },
    { label: 'Onaylandı',          value: counts.onaylandı,     color: '#065F46', note: 'Fatura kesilecek', bg: '#D1FAE5' },
    { label: 'Fatura Kesildi',     value: counts.fatura_kesildi, color: '#185FA5', note: 'Tamamlandı', bg: '#EFF6FF' },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {cards.map(c => (
        <div key={c.label} style={{ ...CARD, borderLeft: `3px solid ${c.color}` }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 6px' }}>
            {c.label}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: c.color, margin: '0 0 2px', lineHeight: 1 }}>
            {loading ? '…' : c.value}
          </p>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>{c.note}</p>
        </div>
      ))}
    </div>
  )
}
