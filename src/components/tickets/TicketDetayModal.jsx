import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const SEVERITY = {
  'düşük':  { bg: '#F3F4F6', color: '#374151', label: 'Düşük' },
  'orta':   { bg: '#FEF3C7', color: '#92400E', label: 'Orta' },
  'yüksek': { bg: '#FEE2E2', color: '#991B1B', label: 'Yüksek' },
  'kritik': { bg: '#991B1B', color: '#FFFFFF', label: 'Kritik' },
}
const STATUS = {
  'açık':      { bg: '#FEE2E2', color: '#991B1B', label: 'Oluşturuldu',  db: 'açık' },
  'işlemde':   { bg: '#FEF3C7', color: '#92400E', label: 'İşleme Alındı', db: 'işlemde' },
  'kapatıldı': { bg: '#F3F4F6', color: '#6B7280', label: 'Kapatıldı',    db: 'kapatıldı' },
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

function Avatar({ name }) {
  const initial = name?.charAt(0)?.toUpperCase() || '?'
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
      {initial}
    </div>
  )
}

function Badge({ map, value, style: extra }) {
  const b = map[value] || { bg: '#F3F4F6', color: '#374151', label: value || '—' }
  return (
    <span style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20, ...extra }}>
      {b.label || (value?.charAt(0)?.toUpperCase() + value?.slice(1)) || '—'}
    </span>
  )
}

const historyLabel = (item) => {
  if (item.field === 'status')      return `Durum: ${item.old_value || '—'} → ${item.new_value}`
  if (item.field === 'assigned_to') return `Atama değişti`
  if (item.field === 'severity')    return `Şiddet: ${item.old_value || '—'} → ${item.new_value}`
  return `${item.field}: ${item.old_value || '—'} → ${item.new_value}`
}

export default function TicketDetayModal({ ticket: initial, onClose, onUpdated }) {
  const { user, isAdmin } = useAuth()
  const [ticket, setTicket]         = useState(initial)
  const [comments, setComments]     = useState([])
  const [history, setHistory]       = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [commentText, setCommentText] = useState('')
  const [sending, setSending]       = useState(false)
  const [updating, setUpdating]     = useState(false)

  useEffect(() => {
    fetchComments()
    fetchHistory()
    if (isAdmin) fetchTeam()
  }, [ticket.id])

  async function refreshTicket() {
    const { data } = await supabase
      .from('tickets')
      .select('*, projects(name), profiles!created_by(full_name), assignee:profiles!assigned_to(full_name)')
      .eq('id', ticket.id)
      .single()
    if (data) setTicket(data)
    onUpdated?.()
  }

  async function fetchComments() {
    const { data } = await supabase
      .from('ticket_comments')
      .select('*, profiles!user_id(full_name)')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  async function fetchHistory() {
    const { data } = await supabase
      .from('ticket_history')
      .select('*, profiles!changed_by(full_name)')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setHistory(data || [])
  }

  async function fetchTeam() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name')
    setTeamMembers(data || [])
  }

  async function handleComment() {
    if (!commentText.trim()) return
    setSending(true)
    await supabase.from('ticket_comments').insert({ ticket_id: ticket.id, user_id: user.id, content: commentText.trim() })
    setCommentText('')
    setSending(false)
    fetchComments()
  }

  async function handleAssign(userId) {
    setUpdating(true)
    await supabase.from('tickets').update({ assigned_to: userId || null, updated_at: new Date().toISOString() }).eq('id', ticket.id)
    setUpdating(false)
    refreshTicket()
    fetchHistory()
  }

  async function handleStatusChange(newStatus) {
    if (newStatus === ticket.status) return
    setUpdating(true)
    await supabase.from('tickets').update({
      status:     newStatus,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id)
    setUpdating(false)
    refreshTicket()
    fetchHistory()
  }

  const sv = SEVERITY[ticket.severity] || SEVERITY['orta']
  const st = STATUS[ticket.status]     || STATUS['açık']
  const ca = CATEGORY[ticket.category] || CATEGORY['genel']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '30px 20px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', marginBottom: 30 }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ background: ca.bg, color: ca.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                {ticket.category?.charAt(0).toUpperCase() + ticket.category?.slice(1) || '—'}
              </span>
              <Badge map={SEVERITY} value={ticket.severity} />
              <Badge map={STATUS} value={ticket.status} />
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{ticket.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9CA3AF', flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', gap: 24 }}>

          {/* ─── Sol kolon ─── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Açıklama */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Açıklama</p>
              <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.65, background: '#F9FAFB', borderRadius: 8, padding: '12px 14px' }}>
                {ticket.description || '—'}
              </p>
            </div>

            {/* Yorumlar */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>
                Yorumlar {comments.length > 0 && `(${comments.length})`}
              </p>

              {comments.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>Henüz yorum yok.</p>
              ) : (
                <div style={{ marginBottom: 12 }}>
                  {comments.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                      <Avatar name={c.profiles?.full_name} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{c.profiles?.full_name || 'Kullanıcı'}</span>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDateTime(c.created_at)}</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.55, background: '#F9FAFB', borderRadius: 8, padding: '8px 12px' }}>{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Yorum ekle..."
                  rows={2}
                  style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleComment() }}
                />
                <button
                  onClick={handleComment}
                  disabled={sending || !commentText.trim()}
                  style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', alignSelf: 'flex-end', fontFamily: 'inherit', fontSize: 13, opacity: commentText.trim() ? 1 : 0.5 }}
                >
                  {sending ? '…' : 'Gönder'}
                </button>
              </div>
            </div>

            {/* Geçmiş */}
            {history.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Değişiklik Geçmişi</p>
                <div style={{ paddingLeft: 8, borderLeft: '2px solid #E5E7EB' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#6B7280', padding: '4px 0 4px 10px', position: 'relative' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D1D5DB', flexShrink: 0, marginTop: 3, position: 'absolute', left: -4 }} />
                      <span>{historyLabel(h)} — <strong style={{ color: '#374151' }}>{h.profiles?.full_name || '—'}</strong> — {fmtDate(h.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Sağ kolon ─── */}
          <div style={{ width: 260, flexShrink: 0 }}>

            {/* Detaylar */}
            <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>Detaylar</p>
              {[
                { label: 'Proje',       value: ticket.projects?.name || '—' },
                { label: 'Oluşturan',   value: ticket.profiles?.full_name || '—' },
                { label: 'Atanan',      value: ticket.assignee?.full_name || 'Atanmadı' },
                { label: 'Açılma',      value: fmtDate(ticket.created_at) },
                { label: 'Çözüm',       value: ticket.resolved_at ? fmtDate(ticket.resolved_at) : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#111827', fontWeight: 500 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Admin aksiyonları */}
            {isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Atama */}
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Ata</p>
                  <select
                    value={ticket.assigned_to || ''}
                    onChange={e => handleAssign(e.target.value)}
                    disabled={updating}
                    style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', color: '#374151' }}
                  >
                    <option value="">— Atanmadı —</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                  </select>
                </div>

                {/* Durum */}
                <div>
                  <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>Durum Değiştir</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {['açık', 'işlemde', 'kapatıldı'].map(s => {
                      const b = STATUS[s]
                      const isActive = ticket.status === s
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          disabled={updating || isActive}
                          style={{
                            padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                            cursor: isActive ? 'default' : 'pointer', textAlign: 'left',
                            fontFamily: 'inherit',
                            border: isActive ? `2px solid ${b.color === '#991B1B' ? b.color : b.color}` : '1px solid #E5E7EB',
                            background: isActive ? b.bg : '#fff',
                            color: isActive ? b.color : '#374151',
                          }}
                        >
                          {b.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
