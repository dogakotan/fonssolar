import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchDoviz } from '../../utils/exchangeRates'

const CARD = {
  background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
  padding: '16px 20px', flex: 1, minWidth: 140,
}

const formatKur = (value) =>
  (value != null && !Number.isNaN(value))
    ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ₺'
    : '—'

export default function SatinAlmaStats() {
  const [counts, setCounts] = useState({ bekliyor: 0, onaylandi: 0, faturaKesilecek: 0, faturaKesildi: 0 })
  const [doviz, setDoviz] = useState({ usd: null, eur: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('purchase_requests').select('status')
      if (data) {
        const next = { bekliyor: 0, onaylandi: 0, faturaKesilecek: 0, faturaKesildi: 0 }
        data.forEach(row => {
          if (row.status === 'bekliyor') next.bekliyor++
          if (row.status === 'onaylandı') next.onaylandi++
          if (row.status === 'fatura_kesildi') next.faturaKesildi++
        })
        setCounts(next)
      }
      setLoading(false)
    }
    load()
    // TCMB kur servisi yavaş/erişilemez olabilir; ana veriyi bekletmemesi için ayrı yükleniyor.
    fetchDoviz().then(kurData => { if (kurData) setDoviz(kurData) })
  }, [])

  const cards = [
    { label: 'Toplam Talep', value: Object.values(counts).reduce((a, b) => a + b, 0), color: '#111827', note: 'Tüm talepler' },
    { label: 'Onay Bekliyor', value: counts.bekliyor, color: '#92400E', note: 'Yönetici onayında' },
    { label: 'Onaylandı', value: counts.onaylandi, color: '#065F46', note: 'Fatura kesilecek' },
    { label: 'Fatura Kesildi', value: counts.faturaKesildi, color: '#185FA5', note: 'Tamamlandı' },
  ]

  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {cards.map(card => (
        <div key={card.label} style={{ ...CARD, borderLeft: `3px solid ${card.color}` }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 6px' }}>{card.label}</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: card.color, margin: '0 0 2px', lineHeight: 1 }}>{loading ? '…' : card.value}</p>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>{card.note}</p>
        </div>
      ))}

      <div style={{
        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '16px 20px', minWidth: 172, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>TCMB SATIŞ KURLARI</p>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#0369A1' }}>$ Dolar / TRY</p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#0C4A6E', lineHeight: 1.1 }}>{doviz.usd == null ? '…' : formatKur(doviz.usd)}</p>
        </div>
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#15803D' }}>€ Euro / TRY</p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#14532D', lineHeight: 1.1 }}>{doviz.eur == null ? '…' : formatKur(doviz.eur)}</p>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94A3B8' }}>{doviz.date || (doviz.usd == null ? 'Güncelleniyor…' : today)}</p>
      </div>
    </div>
  )
}
