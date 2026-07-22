import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function TicketStats({ refreshKey }) {
  const { role, projectId } = useAuth()
  const [c, setC] = useState({ acik: 0, islemde: 0, bugun: 0, sonuclandi: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const scope = (query) => role === 'santiye_sefi' && projectId ? query.eq('project_id', projectId) : query
      const [acik, islemde, bugun, sonuclandi] = await Promise.all([
        scope(supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('workflow_stage', 'acik')),
        scope(supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('workflow_stage', 'islemde')),
        scope(supabase.from('tickets').select('id', { count: 'exact', head: true }).gte('created_at', today)),
        scope(supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('workflow_stage', 'sonuclandi')),
      ])
      setC({
        acik:        acik.count ?? 0,
        islemde:     islemde.count ?? 0,
        bugun:       bugun.count ?? 0,
        sonuclandi:  sonuclandi.count ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [refreshKey, role, projectId])

  const cards = [
    { label: 'Açık',          value: c.acik,        accent: '#1D4ED8', note: 'Bekliyor' },
    { label: 'İşlemde',       value: c.islemde,    accent: '#6B7280', note: 'İnceleniyor' },
    { label: 'Bugün Açılan',  value: c.bugun,      accent: '#185FA5', note: 'Son 24 saat' },
    { label: 'Sonuçlandı',     value: c.sonuclandi, accent: '#6B7280', note: 'Kapatıldı / İptal' },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {cards.map(card => (
        <div
          key={card.label}
          style={{
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderLeft: `3px solid ${card.accent}`,
            borderRadius: 12,
            padding: '16px 20px',
            flex: 1,
            minWidth: 140,
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 6px' }}>
            {card.label}
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: card.accent, margin: '0 0 2px', lineHeight: 1 }}>
            {loading ? '…' : card.value}
          </p>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>{card.note}</p>
        </div>
      ))}
    </div>
  )
}
