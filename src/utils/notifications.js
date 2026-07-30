// Bir kaydın süreç boyunca ürettiği bildirimlerden yalnızca en güncel olanını
// gösterir. Aynı anda oluşan role özel bildirim, genel status_changed kaydından
// daha anlamlı olduğu için önceliklidir.
export function dedupeNotifications(items = []) {
  const seen = new Set()

  const ordered = [...items].sort((a, b) => {
    const dateDiff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    if (dateDiff) return dateDiff
    return Number(a.event_type === 'status_changed') - Number(b.event_type === 'status_changed')
  })

  return ordered.filter(item => {
    const key = item.entity_id
      ? `${item.entity_type ?? ''}\u001f${item.entity_id}`
      : `${item.entity_type ?? ''}\u001f${item.event_type ?? ''}\u001f${item.title ?? ''}`

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function rawStatus(body) {
  const match = String(body || '').match(/(?:Yeni|Güncel) durum:\s*([^\s—]+)/i)
  return match?.[1] || null
}

function labelFromMap(map, status) {
  if (!status) return null
  return map[status]?.label || String(status).replaceAll('_', ' ')
}

export function notificationDisplay(notification, live) {
  const status = live?.status || rawStatus(notification.body)

  switch (notification.entity_type) {
    case 'purchase_request':
      return {
        title: notification.event_type === 'created'
          ? 'Yeni satın alma talebi'
          : 'Satın alma talebi güncellendi',
        body: status
          ? `Güncel durum: ${purchaseStatusLabel(status)}`
          : notification.body,
      }
    case 'invoice':
      return {
        title: notification.event_type === 'created'
          ? 'Yeni fatura onay bekliyor'
          : 'Fatura durumu güncellendi',
        body: status
          ? `Güncel durum: ${labelFromMap(INVOICE_STATUS, status)}`
          : notification.body,
      }
    case 'ticket':
      if (['processed_by_project_manager', 'closed_by_project_manager', 'cancelled_by_project_manager'].includes(notification.event_type)) {
        return { title: notification.title, body: notification.body }
      }
      return {
        title: notification.event_type === 'created'
          ? 'Yeni ticket oluşturuldu'
          : 'Ticket durumu güncellendi',
        body: status
          ? `Güncel durum: ${labelFromMap(TK_STATUS, status)}`
          : notification.body,
      }
    case 'procurement_item_change_request':
      // Bu bildirim türünde DB (create/review RPC'leri) her olayda zaten "Yeni malzeme
      // ekleme..." / "Malzeme miktarı değişikliği..." ayrımını yapan özgün title/body
      // üretiyor — burada jenerik bir "güncellendi" metnine ezmek hangi talebin ne
      // olduğunu (stok artışı mı, yeni malzeme mi) gizliyordu.
      return { title: notification.title, body: notification.body }
    default:
      return { title: notification.title, body: notification.body }
  }
}
import { INVOICE_STATUS, TK_STATUS } from '../components/ui/StatusBadge'
import { statusLabel as purchaseStatusLabel } from './satinAlma'
