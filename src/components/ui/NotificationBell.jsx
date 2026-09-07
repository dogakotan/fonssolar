import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { dedupeNotifications, notificationDisplay } from '../../utils/notifications'

// Günlük rapor hatırlatması: ilk gelişte (okunmamış + pending) sarı, okunup rapor hâlâ
// girilmediyse normal zemine döner, rapor girilince (resolved) yeşil zeminli gösterilir.
function reminderTone(n) {
  if (n.entity_type !== 'daily_report_reminder') return null
  if (n.event_type === 'resolved') return { bg: 'var(--color-success-bg)', dot: 'var(--color-success-text)' }
  if (!n.is_read) return { bg: 'var(--color-warning-bg)', dot: 'var(--color-warning-text)' }
  return null
}

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

export default function NotificationBell({ onGoToTicket, onOpenReport, onGoToRequest, onGoToInvoice, onGoToMalzemeListesi }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  async function load() {
    if (!user?.id) return
    // Rozet sayısı önceden yalnızca en son 30 kayıt üzerinden hesaplanıyordu —
    // toplam bildirim sayısı 30'u aştığında (ör. yoğun bir muhasebe hesabı)
    // gerçek okunmamış sayısından (Bildirimler sayfasının kendi sayımı, aynı
    // dedupeNotifications mantığıyla ama limit(200) kullanıyor) düşük çıkıyordu.
    // Aynı üst sınır (200) + aynı dedup burada da kullanılıyor ki iki sayı hep
    // eşleşsin; açılır listede yalnızca ilk 30'u gösteriyoruz (kasıtlı sade).
    // Tarayıcı önbelleği aynı URL'e giden bu sorguyu eski (okunmamış) haliyle
    // döndürebiliyordu (bkz. TabBildirimler.jsx'teki aynı not) — zararsız,
    // sonucu değiştirmeyen bir `.neq` filtresi URL'i her çağrıda benzersiz kılar.
    const { data } = await supabase
      .from('notifications')
      .select('id, project_id, entity_type, entity_id, event_type, title, body, is_read, created_at')
      .neq('id', crypto.randomUUID())
      .order('created_at', { ascending: false })
      .limit(200)
    const uniqueItems = dedupeNotifications(data || [])
    setItems(uniqueItems.slice(0, 30))
    setUnread(uniqueItems.filter(n => !n.is_read).length)
  }

  useEffect(() => {
    load()
    if (!user?.id) return
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function markRead(id) {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  }

  async function markAllRead() {
    // Dropdown yalnızca ilk 30 bildirimi gösterir (`items`) — bir kullanıcının
    // 30'dan fazla okunmamış bildirimi varsa yalnızca görünenleri işaretlemek
    // rozeti hiç sıfırlamıyordu (RLS zaten recipient_id=auth.uid()'e daralttığı
    // için `items` listesine bağlı kalmadan doğrudan is_read=false ile toplu
    // güncelleme yapmak gerçekten TÜMÜNÜ kapsar).
    if (!unread) return
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('is_read', false)
    load()
  }

  // TabBildirimler.jsx'teki handleClick ile aynı entity_type → sayfa eşlemesi
  // (deep-link'in tek kaynağı orada, bkz. index.jsx'teki goToTicket/goToRequest/
  // goToInvoice/goToReport/goToProjectTab) — zil de artık genel bir sekmeye
  // değil doğrudan ilgili kayda götürüyor.
  async function handleClick(n) {
    if (!n.is_read) await markRead(n.id)
    setOpen(false)
    switch (n.entity_type) {
      case 'ticket':
        onGoToTicket?.(n.entity_id)
        break
      case 'daily_report':
        onOpenReport?.(n.entity_id, n.project_id)
        break
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
        onGoToMalzemeListesi?.(n.project_id, n.entity_id)
        break
      default:
        break
    }
    load()
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'relative',
          background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '50%',
          width: 36, height: 36, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: '#64748b', flexShrink: 0,
          transition: 'border-color 0.15s, background 0.15s',
        }}
        title={`${unread} okunmamış bildirim`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: '#ef4444', color: '#fff', borderRadius: '50%',
            minWidth: 16, height: 16, fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: '0 3px',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 340, maxHeight: 420,
          overflowY: 'auto', overflowX: 'hidden', background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 12, boxShadow: '0 12px 30px rgba(15,23,42,0.12)', zIndex: 50,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0,
            background: '#fff',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>Bildirimler</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Tümünü okundu yap
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p style={{ padding: '28px 14px', textAlign: 'center', fontSize: 13, color: 'var(--color-muted)' }}>
              Henüz bildirim yok.
            </p>
          ) : (
            items.map(n => {
              const tone = reminderTone(n)
              const display = notificationDisplay(n)
              return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none',
                  borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontFamily: 'inherit',
                  background: tone ? tone.bg : (n.is_read ? '#fff' : '#EFF6FF'),
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {!n.is_read && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: tone ? tone.dot : 'var(--color-primary)', marginTop: 5, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>{display.title}</p>
                    {display.body && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>{display.body}</p>}
                    <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#94a3b8' }}>{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
