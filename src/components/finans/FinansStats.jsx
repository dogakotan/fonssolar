import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatKur = (val) =>
  val != null
    ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ₺'
    : '—'

const formatTarih = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  const AY = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']
  return `${parseInt(d)} ${AY[parseInt(m) - 1]} ${y}`
}

export default function FinansStats() {
  const [stats,   setStats]   = useState({ toplamFatura: 0, onayBekleyen: 0, buAyOnaylanan: 0, spendPct: 0 })
  const [doviz,   setDoviz]   = useState({ usd: null, eur: null, tarih: null })
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)

  useEffect(() => {
    async function load() {
      const now         = new Date()
      const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [invRes, sumRes, kurRes] = await Promise.all([
        supabase.from('invoices').select('total_amount, status, created_at'),
        supabase.from('project_cost_summary').select('spend_pct'),
        fetch('https://api.frankfurter.app/latest?from=USD&to=TRY,EUR')
          .then(r => r.json())
          .catch(() => null),
      ])

      if (invRes.error) { setErr(invRes.error.message); setLoading(false); return }

      const invoices      = invRes.data || []
      const toplamFatura  = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
      const onayBekleyen  = invoices.filter(i =>
        ['bekliyor', 'muhasebe_onayında', 'yönetici_onayında'].includes(i.status)
      ).length
      const buAyOnaylanan = invoices
        .filter(i => i.status === 'onaylandı' && i.created_at >= ayBaslangic)
        .reduce((s, i) => s + (i.total_amount || 0), 0)

      const rows     = sumRes.data || []
      const spendPct = rows.length
        ? Math.round(rows.reduce((s, r) => s + (r.spend_pct || 0), 0) / rows.length)
        : 0

      setStats({ toplamFatura, onayBekleyen, buAyOnaylanan, spendPct })

      if (kurRes?.rates) {
        const usd = kurRes.rates.TRY
        const eur = kurRes.rates.EUR ? kurRes.rates.TRY / kurRes.rates.EUR : null
        setDoviz({ usd, eur, tarih: kurRes.date })
      }

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

  const pc     = stats.spendPct
  const pColor = pc < 70 ? '#10B981' : pc < 90 ? '#F59E0B' : '#EF4444'

  const tarihStr = formatTarih(doviz.tarih)

  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 24, alignItems: 'stretch', flexWrap: 'wrap' }}>

      {/* Ana KPI'lar — 4 kart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, flex: '1 1 600px' }}>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }}>
          <p style={LBL}>TOPLAM FATURA TUTARI</p>
          <p style={{ ...VAL, color: '#185FA5' }}>{loading ? '…' : formatTRY(stats.toplamFatura)}</p>
          <div style={NOTE}>Tüm faturalar dahil</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }}>
          <p style={LBL}>ONAY BEKLEYEN</p>
          <p style={{ ...VAL, color: '#F59E0B' }}>{loading ? '…' : stats.onayBekleyen}</p>
          <div style={NOTE}>Bekliyor + muhasebe + yönetici</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }}>
          <p style={LBL}>BU AY ONAYLANAN</p>
          <p style={{ ...VAL, color: '#10B981' }}>{loading ? '…' : formatTRY(stats.buAyOnaylanan)}</p>
          <div style={NOTE}>Cari ay onaylanan tutar</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }}>
          <p style={LBL}>BÜTÇE KULLANIMI</p>
          <p style={{ ...VAL, color: pColor }}>{loading ? '…' : `%${pc}`}</p>
          <div style={{ marginTop: 6 }}>
            <div style={{ background: '#E5E7EB', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, pc)}%`, height: '100%', background: pColor, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Döviz Kurları */}
      <div style={{ display: 'flex', gap: 14, flex: '0 1 auto', flexWrap: 'wrap' }}>

        <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: '20px 24px', minWidth: 148 }}>
          <p style={{ ...LBL, color: '#0369A1' }}>$ DOLAR / TRY</p>
          <p style={{ ...VAL, color: '#0C4A6E', fontSize: 22 }}>
            {loading ? '…' : formatKur(doviz.usd)}
          </p>
          <div style={{ ...NOTE, color: '#0369A1' }}>
            {tarihStr || 'Güncelleniyor…'}
          </div>
        </div>

        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '20px 24px', minWidth: 148 }}>
          <p style={{ ...LBL, color: '#15803D' }}>€ EURO / TRY</p>
          <p style={{ ...VAL, color: '#14532D', fontSize: 22 }}>
            {loading ? '…' : formatKur(doviz.eur)}
          </p>
          <div style={{ ...NOTE, color: '#15803D' }}>
            {tarihStr || 'Güncelleniyor…'}
          </div>
        </div>
      </div>
    </div>
  )
}

const LBL  = { fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }
const VAL  = { fontSize: 28, fontWeight: 700, margin: '0 0 4px' }
const NOTE = { fontSize: 13, color: '#6B7280', margin: 0 }
