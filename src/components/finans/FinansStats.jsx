import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const formatCurrency = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

export default function FinansStats() {
  const [stats, setStats] = useState({ toplamFatura: 0, onayBekleyen: 0, buAyOnaylanan: 0, spendPct: 0 })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    async function load() {
      const now = new Date()
      const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [invRes, sumRes] = await Promise.all([
        supabase.from('invoices').select('total_amount, status, created_at'),
        supabase.from('project_cost_summary').select('spend_pct'),
      ])

      if (invRes.error) { setErr(invRes.error.message); setLoading(false); return }

      const invoices = invRes.data || []
      const toplamFatura   = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
      const onayBekleyen   = invoices.filter(i => ['bekliyor', 'muhasebe_onayında', 'yönetici_onayında'].includes(i.status)).length
      const buAyOnaylanan  = invoices
        .filter(i => i.status === 'onaylandı' && i.created_at >= ayBaslangic)
        .reduce((s, i) => s + (i.total_amount || 0), 0)

      const rows = sumRes.data || []
      const spendPct = rows.length
        ? Math.round(rows.reduce((s, r) => s + (r.spend_pct || 0), 0) / rows.length)
        : 0

      setStats({ toplamFatura, onayBekleyen, buAyOnaylanan, spendPct })
      setLoading(false)
    }
    load()
  }, [])

  if (err) return (
    <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 12, padding: '16px 20px', marginBottom: 24, color: '#991B1B', fontSize: 13 }}>
      <strong>Supabase bağlantı hatası:</strong> {err}
      <p style={{ margin: '6px 0 0', color: '#B91C1C', fontSize: 12 }}>
        Muhtemelen RLS aktif — Supabase'de ilgili tabloların RLS politikalarını kontrol edin.
      </p>
    </div>
  )

  const pc = stats.spendPct
  const pColor = pc < 70 ? '#10B981' : pc < 90 ? '#F59E0B' : '#EF4444'

  const cards = [
    {
      label: 'TOPLAM FATURA TUTARI',
      value: loading ? '…' : formatCurrency(stats.toplamFatura),
      note: 'Tüm faturalar dahil',
      color: '#185FA5',
    },
    {
      label: 'ONAY BEKLEYEN',
      value: loading ? '…' : stats.onayBekleyen,
      note: 'Bekliyor + muhasebe + yönetici',
      color: '#F59E0B',
    },
    {
      label: 'BU AY ONAYLANAN',
      value: loading ? '…' : formatCurrency(stats.buAyOnaylanan),
      note: 'Cari ay onaylanan tutar',
      color: '#10B981',
    },
    {
      label: 'BÜTÇE KULLANIMI',
      value: loading ? '…' : `%${pc}`,
      note: (
        <div style={{ marginTop: 6 }}>
          <div style={{ background: '#E5E7EB', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, pc)}%`, height: '100%', background: pColor, borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
      ),
      color: pColor,
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
            {c.label}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: c.color, margin: '0 0 4px' }}>
            {c.value}
          </p>
          <div style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>{c.note}</div>
        </div>
      ))}
    </div>
  )
}
