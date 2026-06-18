import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import YeniTalepModal from './YeniTalepModal'
import TalepDetayModal from './TalepDetayModal'

const URGENCY = {
  normal:    { bg: '#F3F4F6', color: '#374151', label: 'Normal' },
  acil:      { bg: '#FEF3C7', color: '#92400E', label: 'Acil' },
  'çok_acil': { bg: '#FEE2E2', color: '#991B1B', label: 'Çok Acil' },
}
const STATUS = {
  bekliyor:       { bg: '#FEF3C7', color: '#92400E',  label: 'Bekliyor' },
  onaylandı:      { bg: '#D1FAE5', color: '#065F46',  label: 'Onaylandı' },
  reddedildi:     { bg: '#FEE2E2', color: '#991B1B',  label: 'Reddedildi' },
  fatura_kesildi: { bg: '#EFF6FF', color: '#185FA5',  label: 'Fatura Kesildi' },
}

const TH = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'

function filterBtn(active) {
  return {
    padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
    fontFamily: 'inherit', border: active ? '1px solid #185FA5' : '1px solid #E5E7EB',
    background: active ? '#EFF6FF' : '#fff', color: active ? '#185FA5' : '#6B7280',
    fontWeight: active ? 600 : 400,
  }
}

export default function TalepListesi() {
  const { role } = useAuth()
  const [requests, setRequests]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [showNew, setShowNew]           = useState(false)
  const [selected, setSelected]         = useState(null)

  const canCreate = role !== 'muhasebe'

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_requests')
      .select('*, purchase_request_items(count), projects(name)')
      .order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  const filtered = requests.filter(r => {
    if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false
    if (statusFilter  !== 'all' && r.status  !== statusFilter)  return false
    return true
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>

      {/* Header + filtreler */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Satın Alma Talepleri</h3>
        <span style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
          {requests.length} talep
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Aciliyet filtresi */}
          {[
            { value: 'all',      label: 'Tümü' },
            { value: 'normal',   label: 'Normal' },
            { value: 'acil',     label: 'Acil' },
            { value: 'çok_acil', label: 'Çok Acil' },
          ].map(({ value, label }) => (
            <button key={value} style={filterBtn(urgencyFilter === value)} onClick={() => setUrgencyFilter(value)}>
              {label}
            </button>
          ))}

          {/* Durum filtresi */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="bekliyor">Bekliyor</option>
            <option value="onaylandı">Onaylandı</option>
            <option value="reddedildi">Reddedildi</option>
            <option value="fatura_kesildi">Fatura Kesildi</option>
          </select>

          {canCreate && (
            <button
              onClick={() => setShowNew(true)}
              style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Yeni Talep
            </button>
          )}
        </div>
      </div>

      {/* Tablo */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Yükleniyor…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Talep bulunamadı.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              {['TALEP BAŞLIĞI', 'PROJİ', 'ACİLİYET', 'DURUM', 'KALEM SAYISI', 'TARİH', 'İŞLEM'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const ub = URGENCY[r.urgency] || URGENCY.normal
              const sb = STATUS[r.status]   || STATUS.bekliyor
              const itemCount = r.purchase_request_items?.[0]?.count ?? 0
              return (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#111827' }}>{r.title}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#374151' }}>{r.projects?.name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: ub.bg, color: ub.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>{ub.label}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: sb.bg, color: sb.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>{sb.label}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{itemCount} kalem</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setSelected(r)}
                      style={{ background: '#F3F4F6', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Detay
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {showNew && (
        <YeniTalepModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); fetchData() }}
        />
      )}
      {selected && (
        <TalepDetayModal
          request={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
