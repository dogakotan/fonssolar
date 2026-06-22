import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

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

const fmt = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'

function Badge({ map, value }) {
  const b = map[value] || { bg: '#F3F4F6', color: '#374151', label: value || '—' }
  return <span style={{ background: b.bg, color: b.color, fontSize: 12, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>{b.label}</span>
}

export default function TalepDetayModal({ request, onClose }) {
  const { isAdmin, user } = useAuth()
  const [data, setData] = useState(null)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  useEffect(() => {
    async function load() {
      const { data: req } = await supabase
        .from('purchase_requests')
        .select('*, projects(name), profiles!requested_by(full_name), purchase_request_items(*)')
        .eq('id', request.id)
        .single()
      if (req) {
        setData(req)
        setItems(req.purchase_request_items || [])
      }
    }
    load()
  }, [request.id])

  const req = data || request
  const total = items.reduce((sum, i) => sum + (i.total_price ?? (i.quantity * (i.unit_price || 0))), 0)

  const meta = [
    { label: 'Proje',        value: req.projects?.name || '—' },
    { label: 'Aciliyet',     value: <Badge map={URGENCY} value={req.urgency} /> },
    { label: 'Durum',        value: <Badge map={STATUS}  value={req.status}  /> },
    { label: 'Talep Eden',   value: req.profiles?.full_name || '—' },
    { label: 'Tarih',        value: fmtDate(req.created_at) },
    { label: 'Toplam Tutar', value: <strong style={{ color: '#185FA5' }}>{fmt(total)}</strong> },
  ]

  async function handleApprove() {
    setSaving(true)
    await supabase
      .from('purchase_requests')
      .update({ status: 'onaylandı', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', req.id)
    setSaving(false)
    onClose()
  }

  async function handleReject() {
    setSaving(true)
    await supabase
      .from('purchase_requests')
      .update({ status: 'reddedildi', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', req.id)
    setSaving(false)
    onClose()
  }

  const showActions = isAdmin && req.status === 'bekliyor'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>{req.title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {meta.map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#111827' }}>{value}</p>
              </div>
            ))}
          </div>

          {req.request_note && (
            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Açıklama</p>
              <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{req.request_note}</p>
            </div>
          )}

          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Malzeme Kalemleri</p>
            {items.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Kalem eklenmemiş.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                    {['Malzeme', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const lineTotal = item.total_price ?? (item.quantity * (item.unit_price || 0))
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px 8px', fontSize: 13, fontWeight: 500, color: '#111827' }}>{item.name}</td>
                        <td style={{ padding: '8px 8px', fontSize: 13, color: '#374151' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 8px', fontSize: 13, color: '#374151' }}>{item.unit}</td>
                        <td style={{ padding: '8px 8px', fontSize: 13, color: '#374151' }}>{item.unit_price ? fmt(item.unit_price) : '—'}</td>
                        <td style={{ padding: '8px 8px', fontSize: 13, fontWeight: 600, color: '#185FA5' }}>{lineTotal ? fmt(lineTotal) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid #E5E7EB' }}>
                    <td colSpan={4} style={{ padding: '10px 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Toplam</td>
                    <td style={{ padding: '10px 8px', fontSize: 14, fontWeight: 700, color: '#185FA5' }}>{fmt(total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
            {showActions && !showReject && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={saving}
                  style={{ background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? '…' : '✓ Onayla'}
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  disabled={saving}
                  style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ✗ Reddet
                </button>
              </>
            )}
            {showActions && showReject && (
              <>
                <input
                  type="text"
                  placeholder="Red gerekçesi (opsiyonel)"
                  value={rejectNote}
                  onChange={e => setRejectNote(e.target.value)}
                  style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                />
                <button
                  onClick={handleReject}
                  disabled={saving}
                  style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, whiteSpace: 'nowrap' }}
                >
                  {saving ? '…' : 'Reddi Onayla'}
                </button>
                <button
                  onClick={() => { setShowReject(false); setRejectNote('') }}
                  style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  İptal
                </button>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
