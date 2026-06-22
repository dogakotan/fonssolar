import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'

const URGENCY = {
  normal:    { bg: '#F3F4F6', color: '#374151', label: 'Normal' },
  acil:      { bg: '#FEF3C7', color: '#92400E', label: 'Acil' },
  'çok_acil': { bg: '#FEE2E2', color: '#991B1B', label: 'Çok Acil' },
}

const TH = { padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
const fmt = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)

function ItemsPanel({ items }) {
  if (!items?.length) return (
    <tr>
      <td colSpan={7} style={{ padding: '10px 24px', background: '#F9FAFB', fontSize: 13, color: '#9CA3AF' }}>Kalem bilgisi yok.</td>
    </tr>
  )
  return (
    <tr>
      <td colSpan={7} style={{ padding: '0 24px 12px', background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
        <div style={{ paddingTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 60px 100px 100px', gap: 12, fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, padding: '0 2px' }}>
            <span>Malzeme</span><span>Miktar</span><span>Birim</span><span>Birim Fiyat</span><span>Toplam</span>
          </div>
          {items.map((item, i) => {
            const lineTotal = item.total_price ?? (item.quantity * (item.unit_price || 0))
            return (
              <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 60px 100px 100px', gap: 12, fontSize: 13, color: '#374151', padding: '5px 2px', borderTop: i > 0 ? '1px solid #E5E7EB' : 'none' }}>
                <span style={{ fontWeight: 500, color: '#111827' }}>{item.name}</span>
                <span>{item.quantity}</span>
                <span>{item.unit}</span>
                <span>{item.unit_price ? fmt(item.unit_price) : '—'}</span>
                <span style={{ fontWeight: 600, color: '#185FA5' }}>{lineTotal ? fmt(lineTotal) : '—'}</span>
              </div>
            )
          })}
        </div>
      </td>
    </tr>
  )
}

function ActionCell({ requestId, onApprove, onReject, busy }) {
  const [showReject, setShowReject] = useState(false)
  const [note, setNote] = useState('')

  if (showReject) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Red gerekçesi (opsiyonel)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: 176 }}
        />
        <button
          onClick={() => { onReject(requestId, note); setShowReject(false); setNote('') }}
          disabled={busy}
          style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {busy ? '…' : 'Reddi Onayla'}
        </button>
        <button
          onClick={() => { setShowReject(false); setNote('') }}
          style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          İptal
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        onClick={() => onApprove(requestId)}
        disabled={busy}
        style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {busy ? '…' : '✓ Onayla'}
      </button>
      <button
        onClick={() => setShowReject(true)}
        disabled={busy}
        style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        ✗ Reddet
      </button>
    </div>
  )
}

export default function ProjeTabSaOnayKuyrugu({ projectId }) {
  const { user } = useAuth()
  const [requests, setRequests]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [expanded, setExpanded]           = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => { if (projectId) fetchData() }, [projectId])

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('purchase_requests')
      .select('*, projects(name), purchase_request_items(*)')
      .eq('status', 'bekliyor')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    setRequests(data || [])
    setLoading(false)
  }

  const toggle = (id) => setExpanded(e => e === id ? null : id)

  async function handleApprove(id) {
    setActionLoading(id)
    await supabase
      .from('purchase_requests')
      .update({ status: 'onaylandı', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', id)
    setActionLoading(null)
    fetchData()
  }

  async function handleReject(id, note) {
    setActionLoading(id)
    await supabase
      .from('purchase_requests')
      .update({ status: 'reddedildi', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', id)
    setActionLoading(null)
    fetchData()
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Onay Kuyruğu</h3>
        <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
          {requests.length} bekliyor
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Yükleniyor…</div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#10B981', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
          Onay bekleyen talep yok
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
              {['', 'TALEP BAŞLIĞI', 'ACİLİYET', 'KALEMLER', 'TALEP EDEN', 'TARİH', 'İŞLEM'].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.map(r => {
              const isOpen = expanded === r.id
              const ub = URGENCY[r.urgency] || URGENCY.normal
              return (
                <Fragment key={r.id}>
                  <tr style={{ borderBottom: isOpen ? 'none' : '1px solid #F3F4F6', background: isOpen ? '#F9FAFB' : 'transparent', cursor: 'pointer' }}>
                    <td onClick={() => toggle(r.id)} style={{ padding: '12px 8px 12px 20px', width: 28, color: '#9CA3AF', fontSize: 12, userSelect: 'none' }}>
                      {isOpen ? '▲' : '▼'}
                    </td>
                    <td onClick={() => toggle(r.id)} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#111827' }}>{r.title}</td>
                    <td onClick={() => toggle(r.id)} style={{ padding: '12px 16px' }}>
                      <span style={{ background: ub.bg, color: ub.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>{ub.label}</span>
                    </td>
                    <td onClick={() => toggle(r.id)} style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>
                      {r.purchase_request_items?.length ?? 0} kalem
                    </td>
                    <td onClick={() => toggle(r.id)} style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>—</td>
                    <td onClick={() => toggle(r.id)} style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                      <ActionCell
                        requestId={r.id}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        busy={actionLoading === r.id}
                      />
                    </td>
                  </tr>
                  {isOpen && <ItemsPanel items={r.purchase_request_items} />}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
