import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { SEVERITY_META as SEVERITY } from '../../utils/ticketSeverity'
import { STATUS_META as STATUS, CATEGORY_META as CATEGORY } from '../../utils/ticketStatus'

const CARD = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14, minWidth: 0 }
const TITLE = { margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#0F172A' }
const LABEL = { margin: 0, fontSize: 11, color: '#64748B' }
const VALUE = { margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }

const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—'
const ACTION_QUESTIONS = {
  process: 'Ticket işleme alınacak. Onaylıyor musunuz?',
  close:   'İşlemi kapatmak istiyor musunuz?',
  cancel:  'İşlemi iptal etmek istiyor musunuz?',
  delete:  'Bu ticket tamamen silinecek. Onaylıyor musunuz?',
}

// SiteChiefTicketDetayModal.jsx'teki 3 adımlı dikey süreç göstergesiyle aynı
// mantık — iki modal aynı temayı paylaşsın diye tekilleştirildi.
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

function Step({ done, active, rejected, label, last = false }) {
  const color = rejected ? '#EF4444' : done ? '#22C55E' : active ? '#F59E0B' : '#CBD5E1'
  const ring = rejected ? '#FEE2E2' : done ? '#DCFCE7' : active ? '#FEF3C7' : '#F1F5F9'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 8, position: 'relative' }}>
      {!last && <span aria-hidden="true" style={{ position: 'absolute', left: 5, top: 16, bottom: -10, width: 1, background: '#E5E7EB' }} />}
      <span aria-hidden="true" style={{ position: 'relative', zIndex: 1, width: 10, height: 10, borderRadius: '50%', background: color, marginTop: 4, boxShadow: `0 0 0 4px ${ring}` }} />
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: done || active || rejected ? '#0F172A' : '#94A3B8' }}>{label}</p>
    </div>
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

  const steps = buildTicketSteps(ticket.status)
  const ca = CATEGORY[ticket.category] || CATEGORY['genel'] || { bg: '#F3F4F6', color: '#374151', label: readableValue('category', ticket.category) }
  const statusMeta = STATUS[ticket.status] || { bg: '#F3F4F6', color: '#374151', label: readableValue('status', ticket.status) }
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18 }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-detail-title"
        style={{ position: 'relative', width: 'min(760px, calc(100vw - 36px))', maxHeight: 'calc(100svh - 36px)', background: '#F8FAFC', borderRadius: 12, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)', overflowY: 'auto' }}
        onMouseDown={event => event.stopPropagation()}
      >
        <header style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="ticket-detail-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.title || 'Ticket'}
            </h2>
            {loadingTicket && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF' }}>Detaylar yükleniyor…</p>}
          </div>
          <span style={{ background: statusMeta.bg, color: statusMeta.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
            {statusMeta.label}
          </span>
          <button type="button" aria-label="Kapat" onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#64748B', fontSize: 24, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </header>

        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          {error && !confirmVisible && <div role="alert" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>{error}</div>}

          <div className="site-chief-detail-grid">
            <section style={CARD}>
              <h3 style={TITLE}>Ticket Bilgileri</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 12 }}>
                <div><p style={LABEL}>Kategori</p><p style={VALUE}>{ca.label}</p></div>
                <div><p style={LABEL}>Önem</p><p style={VALUE}>{readableValue('severity', ticket.severity)}</p></div>
                <div><p style={LABEL}>Oluşturan</p><p style={VALUE}>{ticket.creator?.full_name || '—'}</p></div>
                <div><p style={LABEL}>Açılma Tarihi</p><p style={VALUE}>{fmtDate(ticket.created_at)}</p></div>
                <div><p style={LABEL}>Proje</p><p style={VALUE}>{ticket.projects?.name || 'Genel'}</p></div>
                <div><p style={LABEL}>Lokasyon</p><p style={VALUE}>{ticket.location || '—'}</p></div>
              </div>
            </section>

            <section style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
              <h3 style={TITLE}>İşlem Süreci</h3>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-evenly', gap: 10 }}>
                {steps.map((step, index) => <Step key={step.key} {...step} last={index === steps.length - 1} />)}
              </div>
              {actionOwnerText && (
                <p style={{ margin: '14px 0 0', padding: '8px 10px', background: '#EFF6FF', borderRadius: 8, color: '#1D4ED8', fontSize: 11.5, lineHeight: 1.4 }}>
                  {actionOwnerText}
                </p>
              )}
            </section>
          </div>

          <section style={CARD}>
            <h3 style={TITLE}>Açıklama</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <p style={LABEL}>Konu</p>
                <p style={{ ...VALUE, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{ticket.title || '—'}</p>
              </div>
              <div>
                <p style={LABEL}>Detaylı Açıklama</p>
                <p style={{ margin: '3px 0 0', minHeight: 32, fontSize: 12.5, lineHeight: 1.55, color: '#334155', whiteSpace: 'pre-wrap' }}>{ticket.description || '—'}</p>
              </div>
            </div>
          </section>

          {attachments.length > 0 && (
            <section style={CARD}>
              <h3 style={TITLE}>Ekler ({attachments.length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {attachments.map(att => {
                  const isImage = /\.(jpe?g|png|gif|webp)$/i.test(att.storage_path)
                  const canDeleteAttachment = user?.id === att.uploaded_by
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
                      {canDeleteAttachment && (
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
            </section>
          )}

          {history.length > 0 && (
            <section style={CARD}>
              <h3 style={TITLE}>Değişiklik Geçmişi</h3>
              <div style={{ paddingLeft: 8, borderLeft: '2px solid #E5E7EB' }}>
                {history.map(h => (
                  <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#64748B', padding: '4px 0 4px 10px', position: 'relative' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D1D5DB', flexShrink: 0, marginTop: 3, position: 'absolute', left: -4 }} />
                    <span>
                      {`${readableValue(null, h.field)}: ${readableValue(h.field, h.old_value)} → ${readableValue(h.field, h.new_value)}`}
                      {' — '}<strong style={{ color: '#334155' }}>{h.profiles?.full_name || '—'}</strong>
                      {' — '}{fmtDate(h.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasActions && (
            <section style={{ ...CARD, padding: 12, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              {canProcess && (
                <button type="button" onClick={() => initiateAction('process')} style={{ border: '1.5px solid #185FA5', background: '#EFF6FF', color: '#185FA5', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  İşleme Al
                </button>
              )}
              {canClose && (
                <button type="button" onClick={() => initiateAction('close')} style={{ border: '1.5px solid #D1D5DB', background: '#F9FAFB', color: '#374151', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Kapat
                </button>
              )}
              {canCancel && (
                <button type="button" onClick={() => initiateAction('cancel')} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  İptal Et
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => initiateAction('delete')} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ticket'ı Sil
                </button>
              )}
            </section>
          )}

          {!isActive && !hasActions && (
            <section style={{ ...CARD, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
                {ticket.status === 'kapatıldı' ? 'Kapatılmış' : ticket.status === 'iptal_edildi' ? 'İptal edilmiş' : statusMeta.label}
              </p>
            </section>
          )}
        </div>

        {confirmVisible && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.35)', borderRadius: 12, zIndex: 20, display: 'grid', placeItems: 'center', padding: 18 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '22px 24px', maxWidth: 360, width: '100%', boxSizing: 'border-box', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#0F172A' }}>
                {ACTION_QUESTIONS[pendingAction]}
              </h3>
              <p style={{ margin: `0 0 ${error ? 12 : 18}px`, fontSize: 12.5, color: '#64748B' }}>
                {pendingAction === 'delete' ? 'Bu işlem geri alınamaz.' : 'Ticket durumu güncellenecek.'}
              </p>
              {error && (
                <p style={{ color: '#DC2626', fontSize: 12, margin: '0 0 14px' }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={executeAction}
                  disabled={updating}
                  style={{ flex: 1, background: pendingAction === 'cancel' || pendingAction === 'delete' ? '#DC2626' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: updating ? 0.7 : 1 }}
                >
                  {updating ? '…' : 'Onayla'}
                </button>
                <button
                  onClick={cancelAction}
                  disabled={updating}
                  style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
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
