import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const SEVERITY = {
  'düşük':  { bg: '#F3F4F6', color: '#374151', label: 'Düşük' },
  'orta':   { bg: '#FEF3C7', color: '#92400E', label: 'Orta' },
  'yüksek': { bg: '#FEE2E2', color: '#991B1B', label: 'Yüksek' },
  'kritik': { bg: '#7F1D1D', color: '#FEE2E2', label: 'Kritik' },
}
const STATUS = {
  'gönderildi':   { bg: '#DBEAFE', color: '#1D4ED8', label: 'Gönderildi' },
  'açık':         { bg: '#DBEAFE', color: '#1D4ED8', label: 'Gönderildi' },
  'işlemde':      { bg: '#E5E7EB', color: '#6B7280', label: 'İşlemde' },
  'kapatıldı':    { bg: '#D1FAE5', color: '#065F46', label: 'Kapatıldı' },
  'iptal_edildi': { bg: '#F3F4F6', color: '#9CA3AF', label: 'İptal Edildi' },
}
const CATEGORY = {
  'genel':    { bg: '#F3F4F6', color: '#6B7280' },
  'elektrik': { bg: '#EFF6FF', color: '#185FA5' },
  'mekanik':  { bg: '#F5F3FF', color: '#7C3AED' },
}

const ACTION_DEFAULTS = {
  process: 'Ticketınız işleme alındı.',
  close:   'Ticketınız kapatıldı.',
  cancel:  'Ticketınız iptal edildi.',
}
const ACTION_QUESTIONS = {
  process: 'Ticket işleme alınacak. Onaylıyor musunuz?',
  close:   'İşlemi kapatmak istiyor musunuz?',
  cancel:  'İşlemi iptal etmek istiyor musunuz?',
}

function Avatar({ name }) {
  const initial = name?.charAt(0)?.toUpperCase() || '?'
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
      {initial}
    </div>
  )
}

function Badge({ map, value }) {
  const b = map[value] || { bg: '#F3F4F6', color: '#374151', label: value || '—' }
  return (
    <span style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
      {b.label || (value?.charAt(0)?.toUpperCase() + value?.slice(1)) || '—'}
    </span>
  )
}

export default function TicketDetayModal({ ticket: initial, onClose, onUpdated }) {
  const { user, isAdmin } = useAuth()
  const [ticket, setTicket]                 = useState(initial)
  const [loadingTicket, setLoadingTicket]   = useState(false)
  const [notifications, setNotifications]  = useState([])
  const [history, setHistory]              = useState([])
  const [attachments, setAttachments]      = useState([])
  const [commentText, setCommentText]      = useState('')
  const [updating, setUpdating]            = useState(false)
  const [error, setError]                  = useState(null)
  const [pendingAction, setPendingAction]  = useState(null)
  const [confirmVisible, setConfirmVisible] = useState(false)

  useEffect(() => {
    if (!initial?.id) return
    fetchTicket()
    fetchNotifications()
    fetchHistory()
    fetchAttachments()
  }, [initial?.id])

  async function fetchTicket() {
    setLoadingTicket(true)
    try {
      const { data } = await supabase
        .from('tickets')
        .select('*, projects(name), creator:profiles!tickets_created_by_fkey(full_name)')
        .eq('id', initial.id)
        .single()
      if (data) setTicket(data)
    } finally {
      setLoadingTicket(false)
    }
  }

  async function fetchNotifications() {
    const { data } = await supabase
      .from('ticket_comments')
      .select('*, profiles!user_id(full_name)')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    if (!data) {
      const fallback = await supabase
        .from('ticket_comments')
        .select('*, profiles!created_by(full_name)')
        .eq('ticket_id', initial.id)
        .order('created_at', { ascending: true })
      setNotifications(fallback.data || [])
      return
    }
    setNotifications(data || [])
  }

  async function fetchHistory() {
    const { data } = await supabase
      .from('ticket_history')
      .select('*, profiles!changed_by(full_name)')
      .eq('ticket_id', initial.id)
      .order('created_at', { ascending: true })
    setHistory(data || [])
  }

  async function fetchAttachments() {
    const { data } = await supabase
      .from('ticket_attachments')
      .select('*')
      .eq('ticket_id', initial.id)
      .order('created_at', { ascending: true })
    setAttachments(data || [])
  }

  function attachmentUrl(path) {
    return supabase.storage.from('ticket-ekleri').getPublicUrl(path).data.publicUrl
  }

  async function deleteAttachment(att) {
    await supabase.storage.from('ticket-ekleri').remove([att.storage_path])
    await supabase.from('ticket_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  function initiateAction(type) {
    setCommentText(prev => prev.trim() ? prev : ACTION_DEFAULTS[type])
    setPendingAction(type)
    setConfirmVisible(true)
  }

  function cancelAction() {
    setConfirmVisible(false)
    setPendingAction(null)
    setCommentText('')
    setError(null)
  }

  async function executeAction() {
    if (pendingAction === 'cancel' && !commentText.trim()) {
      setError('İptal sebebi boş bırakılamaz.')
      return
    }
    setUpdating(true)
    setError(null)

    const statusMap = { process: 'işlemde', close: 'kapatıldı', cancel: 'iptal_edildi' }
    const newStatus = statusMap[pendingAction]
    const noteText  = commentText.trim() || ACTION_DEFAULTS[pendingAction]

    const { error: err } = await supabase.from('tickets').update({
      status:     newStatus,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
      ...(newStatus === 'kapatıldı' ? { resolved_at: new Date().toISOString() } : {}),
    }).eq('id', ticket.id)

    if (err) { setError('İşlem kaydedilemedi.'); setUpdating(false); return }

    await supabase.from('ticket_comments').insert({
      ticket_id:       ticket.id,
      user_id:         user.id,
      content:         noteText,
      is_notification: true,
      sent_by_admin:   isAdmin,
    })

    setUpdating(false)
    setConfirmVisible(false)
    onUpdated?.()
    onClose()
  }

  if (!ticket) return null

  const ca       = CATEGORY[ticket.category] || CATEGORY['genel']
  const isActive = ticket.status === 'gönderildi' || ticket.status === 'açık' || ticket.status === 'işlemde'

  const canProcess = isAdmin && (ticket.status === 'gönderildi' || ticket.status === 'açık')
  const canClose   = isAdmin && isActive
  const canCancel  = isAdmin
    ? isActive
    : (user?.id === ticket.created_by && isActive)
  const hasActions = canProcess || canClose || canCancel

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '30px 20px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', marginBottom: 30 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ background: ca.bg, color: ca.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
                {ticket.category?.charAt(0).toUpperCase() + ticket.category?.slice(1) || '—'}
              </span>
              <Badge map={SEVERITY} value={ticket.severity} />
              <Badge map={STATUS}   value={ticket.status} />
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
              {ticket.title || ticket.description}
            </h2>
            {loadingTicket && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9CA3AF' }}>Detaylar yükleniyor…</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9CA3AF', flexShrink: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div className="ticket-detail-body">

          {/* Sol kolon */}
          <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Açıklama */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Açıklama</p>
              <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.65, background: '#F9FAFB', borderRadius: 8, padding: '12px 14px' }}>
                {ticket.description || '—'}
              </p>
            </div>

            {/* Ekler */}
            {attachments.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>
                  Ekler ({attachments.length})
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {attachments.map(att => {
                    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(att.storage_path)
                    const canDelete = user?.id === att.uploaded_by
                    return (
                      <div key={att.id} style={{ position: 'relative' }}>
                        <a href={attachmentUrl(att.storage_path)} target="_blank" rel="noreferrer">
                          {isImage ? (
                            <img src={attachmentUrl(att.storage_path)} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB' }} />
                          ) : (
                            <div style={{ width: 72, height: 72, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                              📄
                            </div>
                          )}
                        </a>
                        {canDelete && (
                          <button
                            onClick={() => deleteAttachment(att)}
                            title="Sil"
                            style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#DC2626', color: '#fff', border: 'none', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}
                          >×</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Bildirimler */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>
                Yorumlar {notifications.length > 0 && `(${notifications.length})`}
              </p>
              {notifications.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>Henüz yorum yok.</p>
              ) : (
                <div style={{ marginBottom: 12 }}>
                  {notifications.map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                      <Avatar name={c.profiles?.full_name} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{c.profiles?.full_name || (c.sent_by_admin ? 'Yönetici' : 'Kullanıcı')}</span>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDateTime(c.created_at)}</span>
                        </div>
                        <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.55, background: '#EFF6FF', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #185FA5' }}>
                          {c.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Mesaj textarea — sadece aktif ve izinli */}
              {hasActions && isActive && (
                <div>
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder={pendingAction ? ACTION_DEFAULTS[pendingAction] : 'İşlem yaparken gönderilecek mesajı önceden yazabilirsiniz.'}
                    rows={2}
                    style={{ width: '100%', border: `1px solid ${pendingAction ? '#185FA5' : '#E5E7EB'}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s', background: pendingAction ? '#F0F7FF' : '#fff' }}
                  />
                  {pendingAction && (
                    <p style={{ fontSize: 11, color: pendingAction === 'cancel' ? '#DC2626' : '#185FA5', margin: '4px 0 0' }}>
                      {pendingAction === 'cancel'
                        ? 'İptal sebebi zorunludur. Bu mesaj ticket sahibine gönderilecek.'
                        : 'Bu mesaj ticket sahibine bildirim olarak gönderilecek. Düzenleyebilirsiniz.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Geçmiş */}
            {history.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Değişiklik Geçmişi</p>
                <div style={{ paddingLeft: 8, borderLeft: '2px solid #E5E7EB' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#6B7280', padding: '4px 0 4px 10px', position: 'relative' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D1D5DB', flexShrink: 0, marginTop: 3, position: 'absolute', left: -4 }} />
                      <span>
                        {h.field === 'status' ? `Durum: ${h.old_value || '—'} → ${h.new_value}` : `${h.field}: ${h.old_value || '—'} → ${h.new_value}`}
                        {' — '}<strong style={{ color: '#374151' }}>{h.profiles?.full_name || '—'}</strong>
                        {' — '}{fmtDate(h.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sağ kolon */}
          <div className="ticket-detail-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Detaylar */}
            <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>Detaylar</p>
              {[
                { label: 'Proje',     value: ticket.projects?.name || '—' },
                { label: 'Oluşturan', value: ticket.creator?.full_name || '—' },
                { label: 'Lokasyon',  value: ticket.location || '—' },
                { label: 'Açılma',    value: fmtDate(ticket.created_at) },
                { label: 'Çözüm',     value: ticket.resolved_at ? fmtDate(ticket.resolved_at) : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 9 }}>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#111827', fontWeight: 500 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Aksiyon butonları */}
            {hasActions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {canProcess && (
                  <button
                    onClick={() => initiateAction('process')}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1.5px solid #185FA5', background: '#EFF6FF', color: '#185FA5', textAlign: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF' }}
                  >
                    İşleme Al
                  </button>
                )}
                {canClose && (
                  <button
                    onClick={() => initiateAction('close')}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1.5px solid #D1D5DB', background: '#F9FAFB', color: '#374151', textAlign: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#E5E7EB' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#F9FAFB' }}
                  >
                    Kapat
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => initiateAction('cancel')}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', textAlign: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2' }}
                  >
                    İptal Et
                  </button>
                )}
              </div>
            )}

            {!isActive && (
              <div style={{ background: '#F3F4F6', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
                  {ticket.status === 'kapatıldı' ? 'Kapatılmış' : 'İptal edilmiş'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Onay overlay */}
        {confirmVisible && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.35)', borderRadius: 16, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '28px 32px', maxWidth: 360, width: '90%', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#111827' }}>
                {ACTION_QUESTIONS[pendingAction]}
              </h3>
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '10px 14px', marginBottom: error ? 12 : 20, fontSize: 13, color: '#374151', fontStyle: 'italic', textAlign: 'left', lineHeight: 1.5 }}>
                "{commentText || ACTION_DEFAULTS[pendingAction]}"
              </div>
              {error && (
                <p style={{ color: '#DC2626', fontSize: 12, margin: '0 0 14px' }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={executeAction}
                  disabled={updating}
                  style={{ flex: 1, background: pendingAction === 'cancel' ? '#DC2626' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: updating ? 0.7 : 1 }}
                >
                  {updating ? '…' : 'Onayla'}
                </button>
                <button
                  onClick={cancelAction}
                  style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Vazgeç
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
