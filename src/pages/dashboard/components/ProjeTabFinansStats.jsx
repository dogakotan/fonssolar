import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { fetchDoviz } from '../../../utils/exchangeRates'

const formatTRY = (amount) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount || 0)

const formatKur = (val) =>
  (val != null && !isNaN(val))
    ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ₺'
    : '—'

export default function ProjeTabFinansStats({ projectId, filterDate }) {
  const [stats,   setStats]   = useState({ toplamFatura: 0, onayBekleyen: 0, buAyOnaylanan: 0, spendPct: 0 })
  const [doviz,   setDoviz]   = useState({ usd: null, eur: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    async function load() {
      const now         = new Date()
      const ayBaslangic = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [invRes, budRes] = await Promise.all([
        supabase.from('invoices').select('total_amount, status, created_at').eq('project_id', projectId)
          .lte('created_at', (filterDate || new Date().toISOString().split('T')[0]) + 'T23:59:59'),
        supabase.from('budget_lines').select('planned_amount').eq('project_id', projectId),
      ])

      const invoices     = invRes.data  || []
      const budgetLines  = budRes.data  || []

      const toplamFatura  = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
      const onayBekleyen  = invoices.filter(i =>
        ['bekliyor', 'muhasebe_onayında', 'yönetici_onayında'].includes(i.status)
      ).length
      const buAyOnaylanan = invoices
        .filter(i => i.status === 'onaylandı' && i.created_at >= ayBaslangic)
        .reduce((s, i) => s + (i.total_amount || 0), 0)

      const totalPlanned = budgetLines.reduce((s, b) => s + (b.planned_amount || 0), 0)
      const totalActual  = invoices.filter(i => i.status === 'onaylandı').reduce((s, i) => s + (i.total_amount || 0), 0)
      const spendPct     = totalPlanned > 0 ? Math.round(totalActual / totalPlanned * 100) : 0

      setStats({ toplamFatura, onayBekleyen, buAyOnaylanan, spendPct })
      setLoading(false)
    }
    load()
    // TCMB kur servisi yavaş/erişilemez olabilir; ana veriyi bekletmemesi için ayrı yükleniyor.
    fetchDoviz().then(kurData => { if (kurData) setDoviz(kurData) })
  }, [projectId, filterDate])

  const pc     = stats.spendPct
  const pColor = pc < 70 ? '#10B981' : pc < 90 ? '#F59E0B' : '#EF4444'
  const bugun  = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 24, alignItems: 'stretch', flexWrap: 'wrap' }}>

      {/* Ana 4 KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, flex: '1 1 560px' }}>

        <div style={CARD}>
          <p style={LBL}>TOPLAM FATURA TUTARI</p>
          <p style={{ ...VAL, color: '#185FA5' }}>{loading ? '…' : formatTRY(stats.toplamFatura)}</p>
          <div style={NOTE}>Tüm faturalar dahil</div>
        </div>

        <div style={CARD}>
          <p style={LBL}>ONAY BEKLEYEN</p>
          <p style={{ ...VAL, color: '#F59E0B' }}>{loading ? '…' : stats.onayBekleyen}</p>
          <div style={NOTE}>Bekliyor + muhasebe + yönetici</div>
        </div>

        <div style={CARD}>
          <p style={LBL}>BU AY ONAYLANAN</p>
          <p style={{ ...VAL, color: '#10B981' }}>{loading ? '…' : formatTRY(stats.buAyOnaylanan)}</p>
          <div style={NOTE}>Cari ay onaylanan tutar</div>
        </div>

        <div style={CARD}>
          <p style={LBL}>BÜTÇE KULLANIMI</p>
          <p style={{ ...VAL, color: pColor }}>{loading ? '…' : `%${pc}`}</p>
          <div style={{ marginTop: 6 }}>
            <div style={{ background: '#E5E7EB', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, pc)}%`, height: '100%', background: pColor, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Döviz Kuru — birleşik kart */}
      <div style={{
        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
        padding: '16px 20px', minWidth: 172,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <p style={{ ...LBL, color: '#475569', margin: '0 0 4px' }}>TCMB SATIŞ KURLARI</p>

        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#0369A1' }}>$ Dolar / TRY</p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#0C4A6E', lineHeight: 1.1 }}>
            {doviz.usd == null ? '…' : formatKur(doviz.usd)}
          </p>
        </div>

        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#15803D' }}>€ Euro / TRY</p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, color: '#14532D', lineHeight: 1.1 }}>
            {doviz.eur == null ? '…' : formatKur(doviz.eur)}
          </p>
        </div>

        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94A3B8' }}>
          {doviz.date || (doviz.usd == null ? 'Güncelleniyor…' : bugun)}
        </p>
      </div>
    </div>
  )
}

const CARD = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px' }
const LBL  = { fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }
const VAL  = { fontSize: 28, fontWeight: 700, margin: '0 0 4px' }
const NOTE = { fontSize: 13, color: '#6B7280', margin: 0 }
