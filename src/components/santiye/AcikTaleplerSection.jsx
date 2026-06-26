import { useState } from 'react'
import TicketDetayModal from '../tickets/TicketDetayModal'
import TalepDetayModal  from '../satin-alma/TalepDetayModal'

const PR_STATUS = {
  bekliyor:    { label: 'Bekliyor',   bg: '#DBEAFE', color: '#1D4ED8' },
  onaylandı:   { label: 'Onaylandı', bg: '#D1FAE5', color: '#065F46' },
  reddedildi:  { label: 'Reddedildi',bg: '#FEE2E2', color: '#991B1B' },
}
const PR_URGENCY = {
  normal:    { label: 'Normal',    bg: '#F3F4F6', color: '#6B7280' },
  acil:      { label: 'Acil',      bg: '#FEF3C7', color: '#92400E' },
  çok_acil:  { label: 'Çok Acil', bg: '#FEE2E2', color: '#991B1B' },
}
const TK_STATUS = {
  'gönderildi': { label: 'Gönderildi', bg: '#DBEAFE', color: '#1D4ED8' },
  'açık':       { label: 'Açık',       bg: '#DBEAFE', color: '#1D4ED8' },
  'işlemde':    { label: 'İşlemde',    bg: '#FEF3C7', color: '#92400E' },
  'kapatıldı':  { label: 'Kapatıldı', bg: '#D1FAE5', color: '#065F46' },
}
const TK_SEVERITY = {
  düşük:   { label: 'Düşük',   bg: '#F3F4F6', color: '#6B7280' },
  orta:    { label: 'Orta',    bg: '#FEF3C7', color: '#D97706' },
  yüksek:  { label: 'Yüksek', bg: '#FEE2E2', color: '#991B1B' },
}

function Badge({ map, value }) {
  const b = map[value] || { label: value || '—', bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>
      {b.label}
    </span>
  )
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—'
}

export default function AcikTaleplerSection({ purchaseRequests, tickets, onRefetch }) {
  const [activeTab, setActiveTab]     = useState('all')
  const [detayTicket, setDetayTicket] = useState(null)
  const [detayTalep, setDetayTalep]   = useState(null)

  const prItems     = purchaseRequests.map(pr => ({ ...pr, _type: 'pr' }))
  const ticketItems = tickets.map(t => ({ ...t, _type: 'ticket' }))

  const allItems = [...prItems, ...ticketItems].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  )

  const visibleItems =
    activeTab === 'pr'     ? prItems :
    activeTab === 'ticket' ? ticketItems :
    allItems

  const tabs = [
    { key: 'all',    label: `Tümü (${allItems.length})` },
    { key: 'pr',     label: `Satın Alma (${prItems.length})` },
    { key: 'ticket', label: `Ticket (${ticketItems.length})` },
  ]

  return (
    <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)' }}>
      {/* Header + tabs */}
      <div style={{ padding: '14px 18px 0', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: 12 }}>
          Açık Talepler
        </span>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: '8px 8px 0 0',
                whiteSpace: 'nowrap', flexShrink: 0,
                color: activeTab === tab.key ? '#185FA5' : '#94a3b8',
                borderBottom: activeTab === tab.key ? '2px solid #185FA5' : '2px solid transparent',
                transition: 'color 0.1s, border-color 0.1s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <p style={{ padding: '24px 18px', color: '#9CA3AF', fontSize: 13, margin: 0, textAlign: 'center' }}>
          Açık talep bulunamadı.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['Başlık', 'Tip', 'Aciliyet / Ciddiyet', 'Durum', 'Tarih', 'Detay'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => (
                <tr key={`${item._type}-${item.id}`} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={TD}>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{item.title}</span>
                  </td>
                  <td style={TD}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                      background: item._type === 'pr' ? '#EFF6FF' : '#F5F3FF',
                      color:      item._type === 'pr' ? '#1D4ED8' : '#7C3AED',
                      textTransform: 'uppercase', letterSpacing: '0.3px',
                    }}>
                      {item._type === 'pr' ? 'Satın Alma' : 'Ticket'}
                    </span>
                  </td>
                  <td style={TD}>
                    {item._type === 'pr'
                      ? <Badge map={PR_URGENCY}  value={item.urgency} />
                      : <Badge map={TK_SEVERITY} value={item.severity} />
                    }
                  </td>
                  <td style={TD}>
                    {item._type === 'pr'
                      ? <Badge map={PR_STATUS} value={item.status} />
                      : <Badge map={TK_STATUS} value={item.status} />
                    }
                  </td>
                  <td style={{ ...TD, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{fmtDate(item.created_at)}</td>
                  <td style={TD}>
                    <button
                      onClick={() => item._type === 'pr' ? setDetayTalep(item) : setDetayTicket(item)}
                      style={{ background: 'none', border: 'none', color: '#185FA5', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                    >
                      Detay &rsaquo;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detayTicket && (
        <TicketDetayModal
          ticket={detayTicket}
          onClose={() => { setDetayTicket(null); onRefetch?.() }}
          onUpdated={() => { setDetayTicket(null); onRefetch?.() }}
        />
      )}

      {detayTalep && (
        <TalepDetayModal
          talepId={detayTalep.id}
          onClose={() => { setDetayTalep(null); onRefetch?.() }}
        />
      )}
    </div>
  )
}

const TH = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' }
const TD = { padding: '10px 12px', verticalAlign: 'middle' }
