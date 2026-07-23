import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { STATUS_META, CATEGORY_META } from '../../utils/ticketStatus'
import { SEVERITY_META } from '../../utils/ticketSeverity'

const CARD = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 14, minWidth: 0 }
const TITLE = { margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#0F172A' }
const LABEL = { margin: 0, fontSize: 11, color: '#64748B' }
const VALUE = { margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: '#0F172A' }

const fmtDate = value => value ? new Date(value).toLocaleDateString('tr-TR') : '—'

function metaLabel(map, value) {
  return map[value]?.label || String(value || '—').replaceAll('_', ' ')
}

function processSteps(status) {
  const cancelled = status === 'iptal_edildi'
  const processing = status === 'işlemde'
  const closed = status === 'kapatıldı'
  return [
    { key: 'created', label: 'Ticket Oluşturuldu', done: true },
    {
      key: 'processing',
      label: cancelled ? 'İşlem İptal Edildi' : 'İşleme Alındı',
      done: !cancelled && (processing || closed),
      active: processing,
      rejected: cancelled,
    },
    { key: 'completed', label: 'İşlem Tamamlandı', done: closed },
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

export default function SiteChiefTicketDetayModal({ ticket: initial, onClose, onUpdated }) {
  const { user } = useAuth()
  const [ticket, setTicket] = useState(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      const { data } = await supabase
        .from('tickets')
        .select('*, projects(name), creator:profiles!tickets_created_by_fkey(full_name)')
        .eq('id', initial.id)
        .maybeSingle()

      if (active && data) {
        let updater = null
        if (data.updated_by) {
          const { data: updaterProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', data.updated_by)
            .maybeSingle()
          updater = updaterProfile
        }
        if (active) setTicket({ ...data, updater })
      }
    }

    if (initial?.id) load()
    return () => { active = false }
  }, [initial?.id])

  if (!ticket) return null

  const steps = processSteps(ticket.status)
  const statusMeta = STATUS_META[ticket.status] || { bg: '#F3F4F6', color: '#374151', label: metaLabel(STATUS_META, ticket.status) }
  const canDelete = ticket.created_by === user?.id && ['gönderildi', 'açık'].includes(ticket.status)

  async function deleteTicket() {
    setDeleting(true)
    setError('')
    const { error: deleteError } = await supabase.rpc('delete_own_open_ticket', { p_ticket_id: ticket.id })
    if (deleteError) {
      setError(deleteError.message || 'Ticket silinemedi.')
      setDeleting(false)
      return
    }
    onUpdated?.()
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.42)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18 }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-chief-ticket-title"
        style={{ position: 'relative', width: 'min(680px, calc(100vw - 36px))', maxHeight: 'calc(100svh - 36px)', background: '#F8FAFC', borderRadius: 12, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)', overflowY: 'auto' }}
        onMouseDown={event => event.stopPropagation()}
      >
        <header style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="site-chief-ticket-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Ticket</h2>
          </div>
          <span style={{ background: statusMeta.bg, color: statusMeta.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
            {statusMeta.label}
          </span>
          <button type="button" aria-label="Kapat" onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#64748B', fontSize: 24, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </header>

        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          {error && <div role="alert" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>{error}</div>}

          <div className="site-chief-detail-grid">
            <section style={CARD}>
              <h3 style={TITLE}>Ticket Bilgileri</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 12 }}>
                <div><p style={LABEL}>Kategori</p><p style={VALUE}>{metaLabel(CATEGORY_META, ticket.category)}</p></div>
                <div><p style={LABEL}>Önem</p><p style={VALUE}>{metaLabel(SEVERITY_META, ticket.severity)}</p></div>
                <div><p style={LABEL}>Oluşturan</p><p style={VALUE}>{ticket.creator?.full_name || '—'}</p></div>
                <div><p style={LABEL}>Açılma Tarihi</p><p style={VALUE}>{fmtDate(ticket.created_at)}</p></div>
                <div style={{ gridColumn: '1 / -1' }}><p style={LABEL}>Proje</p><p style={VALUE}>{ticket.projects?.name || '—'}</p></div>
              </div>
            </section>

            <section style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
              <h3 style={TITLE}>İşlem Süreci</h3>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-evenly', gap: 10 }}>
                {steps.map((step, index) => <Step key={step.key} {...step} last={index === steps.length - 1} />)}
              </div>
              {ticket.updater?.full_name && (
                <p style={{ margin: '14px 0 0', padding: '8px 10px', background: '#EFF6FF', borderRadius: 8, color: '#1D4ED8', fontSize: 11.5, lineHeight: 1.4 }}>
                  Son işlem: {ticket.updater.full_name}
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

          {canDelete && (
            <section style={{ ...CARD, padding: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmDelete(true)} style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Ticket'ı Sil
              </button>
            </section>
          )}
        </div>

        {confirmDelete && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.35)', borderRadius: 12, zIndex: 20, display: 'grid', placeItems: 'center', padding: 18 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '22px 24px', maxWidth: 340, width: '100%', boxSizing: 'border-box', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.22)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Ticket tamamen silinsin mi?</h3>
              <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#64748B' }}>Bu işlem geri alınamaz.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={deleteTicket} disabled={deleting} style={{ flex: 1, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Siliniyor…' : 'Sil'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Vazgeç</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
