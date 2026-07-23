import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import ApprovalStepsHorizontal from '../ui/ApprovalStepsHorizontal'
import { SEVERITY_META as SEVERITY } from '../../utils/ticketSeverity'
import { STATUS_META as STATUS, CATEGORY_META as CATEGORY } from '../../utils/ticketStatus'

const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
const ACTION_QUESTIONS = {
  process: 'Ticket işleme alınacak. Onaylıyor musunuz?',
  close:   'İşlemi kapatmak istiyor musunuz?',
  cancel:  'İşlemi iptal etmek istiyor musunuz?',
  delete:  'Bu ticket tamamen silinecek. Onaylıyor musunuz?',
}

function buildTicketSteps(status) {
  const isCancelled = status === 'iptal_edildi'
  const isProcessing = status === 'işlemde'
  const isClosed = status === 'kapatıldı'
  return [
    { key: 'gonderildi', label: 'Gönderildi', done: true },
    { key: 'islemde', label: isCancelled ? 'İptal Edildi' : 'İşlemde', done: !isCancelled && (isProcessing || isClosed), active: isProcessing, rejected: isCancelled },
    { key: 'kapatildi', label: 'Kapatıldı', done: isClosed },
  ]
}

function Badge({ map, value }) {
  const b = map[value] || { bg: '#F3F4F6', color: '#374151', label: value || '—' }
  return (
    <span style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 500, padding: '2px 10px', borderRadius: 20 }}>
      {b.label || (value?.charAt(0)?.toUpperCase() + value?.slice(1)) || '—'}
    </span>
  )
}

function readableValue(field, value) {
  if (!value) return '—'
  const map = field === 'status' ? STATUS : field === 'severity' ? SEVERITY : field === 'category' ? CATEGORY : null
  if (map?.[value]?.label) return map[value].label
  const text = String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1)
}

export default function TicketDetayModal({ ticket: initial, onClose, onUpdated }) {
  const { user, isAdmin, role } = useAuth()
  const [ticket, setTicket]                 = useState(initial)
  const [loadingTicket, setLoadingTicket]   = useState(false)
  const [history, setHistory]              = useState([])
  const [attachments, setAttachments]      = useState([])
  const [updating, setUpdating]            = useState(false)
  const [error, setError]                  = useState(null)
  const [pendingAction, setPendingAction]  = useState(null)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null)

  useEffect(() => {
    if (!initial?.id) return
    fetchTicket()
    fetchHistory()
    fetchAttachments()
  // Dört yükleyici aynı ticket kimliğinin anık görüntüsünü getirir; render-başına
  // oluşan fonksiyon referanslarını eklemek tekrar-yükleme döngüsü yaratır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id])

  async function fetchTicket() {
    setLoadingTicket(true)
    try {
      const { data } = await supabase
        .from('tickets')
        .select('*, projects(name), creator:profiles!tickets_created_by_fkey(full_name)')
        .eq('id', initial.id)
        .single()
      if (data) {
        let updater = null
        if (data.updated_by) {
          const { data: updaterProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', data.updated_by)
            .maybeSingle()
          updater = updaterProfile
        }
        setTicket({ ...data, updater })
      }
    } finally {
      setLoadingTicket(false)
    }
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
    setDeletingAttachmentId(att.id)
    setError(null)
    const { error: storageError } = await supabase.storage.from('ticket-ekleri').remove([att.storage_path])
    if (storageError) {
      setError('Dosya depolama alanından silinemedi.')
      setDeletingAttachmentId(null)
      return
    }
    const { error: rowError } = await supabase.from('ticket_attachments').delete().eq('id', att.id)
    if (rowError) {
      setError('Dosya kaydı silinemedi. Lütfen tekrar deneyin.')
      setDeletingAttachmentId(null)
      return
    }
    setAttachments(prev => prev.filter(a => a.id !== att.id))
    setDeletingAttachmentId(null)
  }

  function initiateAction(type) {
    setPendingAction(type)
    setConfirmVisible(true)
  }

  function cancelAction() {
    setConfirmVisible(false)
    setPendingAction(null)
    setError(null)
  }

  async function executeAction() {
    setUpdating(true)
    setError(null)

    if (pendingAction === 'delete') {
      const { error: deleteError } = await supabase.rpc('delete_own_open_ticket', { p_ticket_id: ticket.id })
      if (deleteError) {
        setError(deleteError.message || 'Ticket silinemedi.')
        setUpdating(false)
        return
      }
      setUpdating(false)
      setConfirmVisible(false)
      onUpdated?.()
      onClose()
      return
    }

    const statusMap = { process: 'işlemde', close: 'kapatıldı', cancel: 'iptal_edildi' }
    const newStatus = statusMap[pendingAction]

    const { error: err } = role === 'proje_yoneticisi'
      ? await supabase.rpc('project_manager_update_ticket_status', {
          p_ticket_id: ticket.id,
          p_new_status: newStatus,
        })
      : await supabase.from('tickets').update({
          status:     newStatus,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }).eq('id', ticket.id)

    if (err) { setError('İşlem kaydedilemedi.'); setUpdating(false); return }

    setUpdating(false)
    setConfirmVisible(false)
    onUpdated?.()
    onClose()
  }

  if (!ticket) return null

  const ca       = CATEGORY[ticket.category] || CATEGORY['genel']
  const isActive = ticket.status === 'gönderildi' || ticket.status === 'açık' || ticket.status === 'işlemde'

  const canManage  = isAdmin || role === 'proje_yoneticisi'
  const canProcess = canManage && (ticket.status === 'gönderildi' || ticket.status === 'açık')
  const canClose   = canManage && ticket.status === 'işlemde'
  const canCancel  = canManage
    ? isActive
    : false
  const canDelete  = !canManage && user?.id === ticket.created_by && (ticket.status === 'gönderildi' || ticket.status === 'açık')
  const hasActions = canProcess || canClose || canCancel || canDelete
  const actionOwnerText = ticket.updater?.full_name
    ? ticket.status === 'işlemde'
      ? `${ticket.updater.full_name} tarafından işleme alındı`
      : ticket.status === 'kapatıldı'
        ? `${ticket.updater.full_name} tarafından kapatıldı`
        : ticket.status === 'iptal_edildi'
          ? `${ticket.updater.full_name} tarafından iptal edildi`
        : null
    : null

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
                {ca.label || readableValue('category', ticket.category)}
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

        <div style={{ padding: '14px 24px', borderBottom: '1px solid #E5E7EB', background: '#F8FAFC' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.45px' }}>
            İşlem Durumu
          </p>
          <ApprovalStepsHorizontal steps={buildTicketSteps(ticket.status)} />
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
                            disabled={deletingAttachmentId === att.id}
                            title="Sil"
                            style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#DC2626', color: '#fff', border: 'none', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}
                          >{deletingAttachmentId === att.id ? '…' : '×'}</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Geçmiş */}
            {history.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Değişiklik Geçmişi</p>
                <div style={{ paddingLeft: 8, borderLeft: '2px solid #E5E7EB' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#6B7280', padding: '4px 0 4px 10px', position: 'relative' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D1D5DB', flexShrink: 0, marginTop: 3, position: 'absolute', left: -4 }} />
                      <span>
                        {`${readableValue(null, h.field)}: ${readableValue(h.field, h.old_value)} → ${readableValue(h.field, h.new_value)}`}
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
                ...(ticket.closed_at ? [{ label: 'Kapatılma', value: fmtDate(ticket.closed_at) }] : []),
                ...(ticket.cancelled_at ? [{ label: 'İptal', value: fmtDate(ticket.cancelled_at) }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ marginBottom: 9 }}>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#111827', fontWeight: 500 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Aksiyon butonları */}
            {actionOwnerText && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#1D4ED8', fontWeight: 500, lineHeight: 1.45 }}>
                  {actionOwnerText}
                </p>
              </div>
            )}

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
                {canDelete && (
                  <button
                    onClick={() => initiateAction('delete')}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', textAlign: 'center' }}
                  >
                    Ticketı Sil
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
              <p style={{ margin: `0 0 ${error ? 12 : 20}px`, fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                {pendingAction === 'delete' ? 'Bu işlem geri alınamaz.' : 'Ticket durumu güncellenecek.'}
              </p>
              {error && (
                <p style={{ color: '#DC2626', fontSize: 12, margin: '0 0 14px' }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={executeAction}
                  disabled={updating}
                  style={{ flex: 1, background: pendingAction === 'cancel' || pendingAction === 'delete' ? '#DC2626' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '11px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: updating ? 0.7 : 1 }}
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
