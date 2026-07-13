import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import Badge, { PR_STATUS, TK_STATUS } from '../../../components/ui/StatusBadge'
import Pager from '../../../components/ui/Pager'

const ENTITY_TAB = {
  purchase_request: 'satin-alma',
  invoice: 'finans',
  ticket: 'tickets',
  daily_report: 'rapor-listesi',
  daily_report_reminder: 'daily-report',
}

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

// Günlük rapor hatırlatması: ilk gelişte (okunmamış + pending) sarı, okunup rapor hâlâ
// girilmediyse normal zemine döner, rapor girilince (resolved) yeşil zeminli — NotificationBell.jsx ile aynı kural.
function reminderTone(n) {
  if (n.entity_type !== 'daily_report_reminder') return null
  if (n.event_type === 'resolved') return { bg: 'var(--color-success-bg)', dot: 'var(--color-success-text)' }
  if (!n.is_read) return { bg: 'var(--color-warning-bg)', dot: 'var(--color-warning-text)' }
  return null
}

export default function TabBildirimler({ onNavigate }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [liveStatus, setLiveStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

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

    // Satın alma talebi / ticket bildirimleri için canlı durumu ayrıca çekilir —
    // bildirim metni oluşturulduğu andaki durumu dondurur, süreç ilerlediğinde güncellenmez.
    const prIds = [...new Set((data || []).filter(n => n.entity_type === 'purchase_request').map(n => n.entity_id))]
    const tkIds = [...new Set((data || []).filter(n => n.entity_type === 'ticket').map(n => n.entity_id))]
    const [prRes, tkRes] = await Promise.all([
      prIds.length ? supabase.from('purchase_requests').select('id, status').in('id', prIds) : Promise.resolve({ data: [] }),
      tkIds.length ? supabase.from('tickets').select('id, status').in('id', tkIds) : Promise.resolve({ data: [] }),
    ])
    const map = {}
    ;(prRes.data || []).forEach(r => { map[r.id] = { kind: 'purchase_request', status: r.status } })
    ;(tkRes.data || []).forEach(r => { map[r.id] = { kind: 'ticket', status: r.status } })
    setLiveStatus(map)
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
    const tab = ENTITY_TAB[n.entity_type]
    if (tab && onNavigate) onNavigate(tab)
    load()
  }

  const unreadCount = items.filter(n => !n.is_read).length
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

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

      <div style={{ padding: 16 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 13, padding: '24px 0' }}>Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 13, padding: '24px 0' }}>Henüz bildirim yok.</p>
        ) : (
          <>
            <div style={{ minHeight: PAGE_SIZE * 62 }}>
              {pageItems.map(n => {
                const tone = reminderTone(n)
                const live = liveStatus[n.entity_id]
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', border: 'none',
                      borderBottom: '1px solid var(--color-border)', cursor: 'pointer', fontFamily: 'inherit',
                      background: tone ? tone.bg : (n.is_read ? 'var(--color-surface)' : 'var(--color-primary-bg)'),
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      {!n.is_read && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: tone ? tone.dot : 'var(--color-primary)', marginTop: 5, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{n.title}</p>
                        {n.body && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>{n.body}</p>}
                        {live && (
                          <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                            Şu an: <Badge map={live.kind === 'ticket' ? TK_STATUS : PR_STATUS} value={live.status} />
                          </p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: 10.5, color: 'var(--color-muted-light)' }}>{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
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
