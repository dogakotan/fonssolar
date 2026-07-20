import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import Badge, { INVOICE_STATUS, PROCUREMENT_CHANGE_STATUS } from '../../../components/ui/StatusBadge'
import Pager from '../../../components/ui/Pager'
import ApprovalStepsHorizontal from '../../../components/ui/ApprovalStepsHorizontal'
import { buildApprovalSteps } from '../../../utils/satinAlma'
import { MANAGER_ROLES } from '../../../config/navigation'

const BADGE_MAP = {
  invoice: INVOICE_STATUS,
  procurement_item_change_request: PROCUREMENT_CHANGE_STATUS,
}

// Ticket'ın basit 3 adımlı süreci — iptal_edildi ayrı bir "reddedildi" dalı olarak gösterilir.
// TicketDetayModal.jsx'e dokunulmuyor, bu yalnızca bildirim satırına özel kompakt bir özet.
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

// Bildirim tipine göre ikon/etiket — filtre çipleri ve satır ikonu için ortak kaynak.
const ENTITY_META = {
  ticket:                          { icon: '🎫', label: 'Ticket' },
  purchase_request:                { icon: '🛒', label: 'Satın Alma' },
  invoice:                         { icon: '🧾', label: 'Fatura' },
  daily_report:                    { icon: '📋', label: 'Günlük Rapor' },
  daily_report_reminder:           { icon: '⏰', label: 'Hatırlatma' },
  procurement_item_change_request: { icon: '📦', label: 'Malzeme Değişikliği' },
}
const DEFAULT_META = { icon: '🔔', label: 'Bildirim' }

const PAGE_SIZE = 10

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'şimdi'
  if (min < 60) return `${min} dk önce`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} sa önce`
  const day = Math.floor(hr / 24)
  return `${day} gün önce`
}

// Kronolojik listeyi okunabilir bölümlere ayırmak için gün farkı bazlı kova.
function dateBucket(iso) {
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000)
  if (diffDays <= 0) return 'Bugün'
  if (diffDays === 1) return 'Dün'
  if (diffDays < 7) return 'Bu Hafta'
  return 'Daha Eski'
}

// Günlük rapor hatırlatması: ilk gelişte (okunmamış + pending) sarı, okunup rapor hâlâ
// girilmediyse normal zemine döner, rapor girilince (resolved) yeşil zeminli — NotificationBell.jsx ile aynı kural.
function reminderTone(n) {
  if (n.entity_type !== 'daily_report_reminder') return null
  if (n.event_type === 'resolved') return { bg: 'var(--color-success-bg)', dot: 'var(--color-success-text)' }
  if (!n.is_read) return { bg: 'var(--color-warning-bg)', dot: 'var(--color-warning-text)' }
  return null
}

export default function TabBildirimler({ onGoToTicket, onOpenReport, onGoToRequest, onGoToInvoice, onGoToMalzemeListesi }) {
  const { user, role } = useAuth()
  const isManager = MANAGER_ROLES.includes(role)
  const [items, setItems] = useState([])
  const [liveStatus, setLiveStatus] = useState({})
  const [invoiceStepSummary, setInvoiceStepSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('all')

  async function load() {
    if (!user?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, project_id, entity_type, entity_id, event_type, title, body, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    setItems(data || [])
    setLoading(false)

    // Satın alma talebi / ticket / fatura / malzeme miktarı değişikliği bildirimleri için canlı
    // durum ayrıca çekilir — bildirim metni oluşturulduğu andaki durumu dondurur, süreç
    // ilerlediğinde güncellenmez.
    const prIds = [...new Set((data || []).filter(n => n.entity_type === 'purchase_request').map(n => n.entity_id))]
    const tkIds = [...new Set((data || []).filter(n => n.entity_type === 'ticket').map(n => n.entity_id))]
    const invIds = [...new Set((data || []).filter(n => n.entity_type === 'invoice').map(n => n.entity_id))]
    const pcrIds = [...new Set((data || []).filter(n => n.entity_type === 'procurement_item_change_request').map(n => n.entity_id))]
    const [prRes, tkRes, invRes, pcrRes] = await Promise.all([
      prIds.length ? supabase.from('purchase_requests').select('id, status').in('id', prIds) : Promise.resolve({ data: [] }),
      tkIds.length ? supabase.from('tickets').select('id, status').in('id', tkIds) : Promise.resolve({ data: [] }),
      invIds.length ? supabase.from('invoices').select('id, status').in('id', invIds) : Promise.resolve({ data: [] }),
      pcrIds.length ? supabase.from('procurement_item_change_requests').select('id, status').in('id', pcrIds) : Promise.resolve({ data: [] }),
    ])
    const map = {}
    ;(prRes.data || []).forEach(r => { map[r.id] = { kind: 'purchase_request', status: r.status } })
    ;(tkRes.data || []).forEach(r => { map[r.id] = { kind: 'ticket', status: r.status } })
    ;(invRes.data || []).forEach(r => { map[r.id] = { kind: 'invoice', status: r.status } })
    ;(pcrRes.data || []).forEach(r => { map[r.id] = { kind: 'procurement_item_change_request', status: r.status } })
    setLiveStatus(map)

    // Yalnızca yönetici rollerinde: faturanın onay zincirinde hangi adımda olduğunu göster
    // (FaturaDetayModal'ın invoice_approvals sorgusuyla aynı tablo, küçük bir özet).
    if (isManager && invIds.length) {
      const { data: steps } = await supabase
        .from('invoice_approvals')
        .select('invoice_id, step, step_label, status')
        .in('invoice_id', invIds)
        .order('step')
      const byInvoice = {}
      ;(steps || []).forEach(s => {
        if (!byInvoice[s.invoice_id]) byInvoice[s.invoice_id] = []
        byInvoice[s.invoice_id].push(s)
      })
      const summary = {}
      Object.entries(byInvoice).forEach(([invoiceId, rows]) => {
        const total = rows.length
        const rejected = rows.find(r => r.status === 'reddedildi')
        const pending = rows.find(r => r.status === 'bekliyor')
        const target = rejected || pending || rows[rows.length - 1]
        if (target) summary[invoiceId] = `Adım ${target.step}/${total}: ${target.step_label}`
      })
      setInvoiceStepSummary(summary)
    } else {
      setInvoiceStepSummary({})
    }
  }

  useEffect(() => {
    load()
    if (!user?.id) return
    const channel = supabase
      .channel(`bildirimler-sayfa-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function markRead(id) {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  }

  async function markAllRead() {
    const unreadIds = items.filter(n => !n.is_read).map(n => n.id)
    if (!unreadIds.length) return
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', unreadIds)
    load()
  }

  async function handleClick(n) {
    if (!n.is_read) await markRead(n.id)
    switch (n.entity_type) {
      case 'ticket':
        onGoToTicket?.(n.entity_id)
        break
      case 'daily_report':
      case 'daily_report_reminder':
        onOpenReport?.(n.entity_id)
        break
      case 'purchase_request':
        onGoToRequest?.(n.entity_id)
        break
      case 'invoice':
        onGoToInvoice?.(n.entity_id, n.project_id)
        break
      case 'procurement_item_change_request':
        onGoToMalzemeListesi?.(n.project_id)
        break
      default:
        break
    }
    load()
  }

  function changeFilter(f) {
    setFilter(f)
    setPage(0)
  }

  const unreadCount = items.filter(n => !n.is_read).length
  const presentTypes = [...new Set(items.map(n => n.entity_type))].filter(t => ENTITY_META[t])
  const filteredItems = items.filter(n => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.is_read
    return n.entity_type === filter
  })
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = filteredItems.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  let lastBucket = null

  return (
    <div style={CARD}>
      <div style={HEADER}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>Bildirimler</span>
          <span style={{ fontSize: 12, color: 'var(--color-muted-light)', display: 'block' }}>
            Toplam {items.length} bildirim{unreadCount > 0 ? ` · ${unreadCount} okunmamış` : ''}
          </span>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={BTN_SM_OUTLINE}>Tümünü okundu yap</button>
        )}
      </div>

      <div className="bildirim-filters">
        <button className={`bildirim-chip${filter === 'all' ? ' active' : ''}`} onClick={() => changeFilter('all')}>
          Tümü <span className="bildirim-chip-count">{items.length}</span>
        </button>
        <button className={`bildirim-chip${filter === 'unread' ? ' active' : ''}`} onClick={() => changeFilter('unread')}>
          Okunmamış <span className="bildirim-chip-count">{unreadCount}</span>
        </button>
        {presentTypes.map(t => {
          const meta = ENTITY_META[t]
          const count = items.filter(n => n.entity_type === t).length
          return (
            <button key={t} className={`bildirim-chip${filter === t ? ' active' : ''}`} onClick={() => changeFilter(t)}>
              <span aria-hidden="true">{meta.icon}</span> {meta.label} <span className="bildirim-chip-count">{count}</span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: '4px 16px 16px' }}>
        {loading ? (
          <div className="bildirim-empty">
            <span className="bildirim-empty-icon" aria-hidden="true">⏳</span>
            <p>Yükleniyor…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bildirim-empty">
            <span className="bildirim-empty-icon" aria-hidden="true">🔕</span>
            <p>{filter === 'all' ? 'Henüz bildirim yok.' : 'Bu filtrede bildirim yok.'}</p>
          </div>
        ) : (
          <>
            <div style={{ minHeight: PAGE_SIZE * 66 }}>
              {pageItems.map(n => {
                const tone = reminderTone(n)
                const live = liveStatus[n.entity_id]
                const meta = ENTITY_META[n.entity_type] || DEFAULT_META
                const bucket = dateBucket(n.created_at)
                const showBucket = bucket !== lastBucket
                lastBucket = bucket
                return (
                  <div key={n.id}>
                    {showBucket && <div className="bildirim-bucket">{bucket}</div>}
                    <button
                      onClick={() => handleClick(n)}
                      className={`bildirim-row${!n.is_read ? ' unread' : ''}`}
                      style={tone ? { background: tone.bg } : undefined}
                    >
                      <span className="bildirim-icon" aria-hidden="true">{meta.icon}</span>
                      <div className="bildirim-body">
                        <p className="bildirim-title">{n.title}</p>
                        {n.body && <p className="bildirim-desc">{n.body}</p>}
                        {live && live.kind === 'purchase_request' && (
                          <ApprovalStepsHorizontal steps={buildApprovalSteps(live.status)} />
                        )}
                        {live && live.kind === 'ticket' && (
                          <ApprovalStepsHorizontal steps={buildTicketSteps(live.status)} />
                        )}
                        {live && live.kind !== 'purchase_request' && live.kind !== 'ticket' && (
                          <p className="bildirim-live">
                            Şu an: <Badge map={BADGE_MAP[live.kind]} value={live.status} />
                          </p>
                        )}
                        {isManager && n.entity_type === 'invoice' && invoiceStepSummary[n.entity_id] && (
                          <p className="bildirim-step">{invoiceStepSummary[n.entity_id]}</p>
                        )}
                      </div>
                      <div className="bildirim-meta">
                        {!n.is_read && <span className="bildirim-dot" style={tone ? { background: tone.dot } : undefined} />}
                        <span className="bildirim-time">{timeAgo(n.created_at)}</span>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
            <Pager page={safePage} totalPages={totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}

const CARD = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 14,
  boxShadow: 'var(--shadow-card)', overflow: 'hidden',
}
const HEADER = {
  padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
}
const BTN_SM_OUTLINE = {
  background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border-md)', borderRadius: 6,
  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}
