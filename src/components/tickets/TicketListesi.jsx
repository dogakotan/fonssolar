import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import YeniTicketModal from './YeniTicketModal'
import TicketDetayModal from './TicketDetayModal'

const SEVERITY = {
  'düşük':  { bg: '#F3F4F6', color: '#374151', label: 'Düşük' },
  'orta':   { bg: '#FEF3C7', color: '#92400E', label: 'Orta' },
  'yüksek': { bg: '#FEE2E2', color: '#991B1B', label: 'Yüksek' },
  'kritik': { bg: '#991B1B', color: '#FFFFFF', label: 'Kritik' },
}
const STATUS = {
  'açık':      { bg: '#FEE2E2', color: '#991B1B', label: 'Oluşturuldu' },
  'işlemde':   { bg: '#FEF3C7', color: '#92400E', label: 'İşleme Alındı' },
  'çözüldü':   { bg: '#D1FAE5', color: '#065F46', label: 'Çözüldü' },
  'kapatıldı': { bg: '#F3F4F6', color: '#6B7280', label: 'Kapatıldı' },
}
const CATEGORY = {
  'elektrik': { bg: '#EFF6FF', color: '#185FA5' },
  'mekanik':  { bg: '#F5F3FF', color: '#7C3AED' },
  'isg':      { bg: '#FEE2E2', color: '#991B1B' },
  'kalite':   { bg: '#D1FAE5', color: '#065F46' },
  'lojistik': { bg: '#FEF3C7', color: '#92400E' },
  'teknik':   { bg: '#F3F4F6', color: '#374151' },
  'genel':    { bg: '#F3F4F6', color: '#6B7280' },
}

const TH = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'

const STATUS_TABS = [
  { key: 'all',      label: 'Tüm Ticketlar' },
  { key: 'açık',     label: 'Açık' },
  { key: 'işlemde',  label: 'İşlemde' },
  { key: 'çözüldü',  label: 'Çözüldü' },
  { key: 'kapatıldı',label: 'Kapatıldı' },
]

export default function TicketListesi({ onNewTicket, refreshKey, projectId: propProjectId }) {
  const { user, isAdmin, projectId: authProjectId } = useAuth()
  const [tickets, setTickets]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [statusTab, setStatusTab]         = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [myTickets, setMyTickets]         = useState(false)
  const [showNew, setShowNew]             = useState(false)
  const [selected, setSelected]           = useState(null)

  useEffect(() => { fetchTickets() }, [statusTab, categoryFilter, severityFilter, myTickets, refreshKey, propProjectId])

  async function fetchTickets() {
    setLoading(true)
    let q = supabase
      .from('tickets')
      .select('*, projects(name), profiles!created_by(full_name), assignee:profiles!assigned_to(full_name)')
      .order('created_at', { ascending: false })

    if (statusTab !== 'all')        q = q.eq('status', statusTab)
    if (categoryFilter !== 'all')   q = q.eq('category', categoryFilter)
    if (severityFilter !== 'all')   q = q.eq('severity', severityFilter)

    const effectiveProjectId = propProjectId || (!isAdmin ? authProjectId : null)
    if (effectiveProjectId)         q = q.eq('project_id', effectiveProjectId)
    if (myTickets && user?.id)      q = q.eq('created_by', user.id)

    const { data } = await q
    setTickets(data || [])
    setLoading(false)
  }

  const tabBtn = (active) => ({
    background: 'none', border: 'none', padding: '9px 18px',
    fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#185FA5' : '#6B7280', cursor: 'pointer',
    fontFamily: 'inherit',
    borderBottom: active ? '2px solid #185FA5' : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s',
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>

      {/* Status tabs + filters */}
      <div style={{ padding: '0 20px', borderBottom: '2px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(t => (
          <button key={t.key} style={tabBtn(statusTab === t.key)} onClick={() => setStatusTab(t.key)}>
            {t.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, padding: '8px 0', alignItems: 'center' }}>
          <button
            onClick={() => setMyTickets(v => !v)}
            style={{
              border: myTickets ? 'none' : '1px solid #E5E7EB',
              borderRadius: 6, padding: '6px 12px', fontSize: 13, fontFamily: 'inherit',
              cursor: 'pointer', fontWeight: myTickets ? 600 : 400,
              background: myTickets ? '#185FA5' : 'transparent',
              color: myTickets ? '#fff' : '#6B7280',
            }}
          >
            Benim Ticket'larım
          </button>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}
          >
            <option value="all">Tüm Kategoriler</option>
            {Object.keys(CATEGORY).map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}
          >
            <option value="all">Tüm Şiddetler</option>
            {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <button
            onClick={() => setShowNew(true)}
            style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            + Yeni Ticket
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Yükleniyor…</div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
          Bu kriterde ticket bulunamadı.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              {['#', 'BAŞLIK', 'KATEGORİ', 'ŞİDDET', 'DURUM', 'ATANAN', 'TARİH', 'İŞLEM'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t, idx) => {
              const sv = SEVERITY[t.severity] || SEVERITY['orta']
              const st = STATUS[t.status]     || STATUS['açık']
              const ca = CATEGORY[t.category] || CATEGORY['genel']
              return (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>#{idx + 1}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#111827', maxWidth: 240 }}>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {t.title}
                    </span>
                    {t.projects?.name && (
                      <span style={{ fontSize: 11, color: '#9CA3AF', display: 'block', marginTop: 1 }}>{t.projects.name}</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: ca.bg, color: ca.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {t.category?.charAt(0).toUpperCase() + t.category?.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: sv.bg, color: sv.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {sv.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>
                    {t.assignee?.full_name || <span style={{ color: '#D1D5DB' }}>Atanmadı</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{fmtDate(t.created_at)}</td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setSelected(t)}
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
        <YeniTicketModal
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); fetchTickets(); onNewTicket?.() }}
        />
      )}
      {selected && (
        <TicketDetayModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { fetchTickets(); onNewTicket?.() }}
        />
      )}
    </div>
  )
}
