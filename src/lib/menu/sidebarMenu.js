// Sol menü bölümleri ve register uyarıları — saf yardımcılar (React/Supabase bağımlılığı yok; tests-unit'ten test edilir).
// Menü satırları ve bölümleri veritabanından gelir (role_sidebar_items.section_key, sidebar_sections).
import { canViewRegister } from '../register/registerConfig.js'

// Menü anahtarı → register kodu, menü etiketi, rozetin saydığı uyarı türü.
export const REGISTER_MENU_ITEMS = {
  'register-rfi':               { register: 'rfi',               label: 'RFI',              alert: 'rfi_overdue' },
  'register-action':            { register: 'action',            label: 'Aksiyonlar',       alert: 'action_overdue' },
  'register-decision':          { register: 'decision',          label: 'Kararlar',         alert: 'decision_overdue' },
  'register-risk':              { register: 'risk',              label: 'Riskler' },
  'register-interface':         { register: 'interface',         label: 'Arayüzler' },
  'register-document':          { register: 'document',          label: 'Dokümanlar' },
  'register-drawing':           { register: 'drawing',           label: 'Çizimler' },
  'register-submittal':         { register: 'submittal',         label: 'Teknik sunumlar' },
  'register-material-approval': { register: 'material_approval', label: 'Malzeme onayları' },
  'register-change':            { register: 'change',            label: 'Değişiklikler' },
  'register-claim':             { register: 'claim',             label: 'Claim',            alert: 'claim_notice_due' },
}

export function registerForTab(tabKey) {
  return REGISTER_MENU_ITEMS[tabKey]?.register ?? null
}

// itemKeys: rolün menü anahtarları (order_index sırasıyla). sectionOf: { item_key: section_key | null }.
// sections: [{ section_key, label, order_index }]. Dönüş: bölümsüzler en üstte (label null), sonra bölümler
// sırasıyla; öğesi olmayan bölüm yok. Bilinmeyen bölüm anahtarlı öğe bölümsüz sayılır.
export function groupSidebarItems(itemKeys, sectionOf = {}, sections = []) {
  const ordered = [...sections].sort((a, b) => a.order_index - b.order_index)
  const known = new Set(ordered.map(s => s.section_key))
  const groups = [{ key: null, label: null, items: [] }, ...ordered.map(s => ({ key: s.section_key, label: s.label, items: [] }))]
  const byKey = new Map(groups.map(g => [g.key, g]))
  for (const item of itemKeys) {
    const sec = sectionOf[item]
    byKey.get(sec && known.has(sec) ? sec : null).items.push(item)
  }
  return groups.filter(g => g.items.length > 0)
}

const TEKNIK = ['admin', 'proje_yoneticisi', 'santiye_sefi']

// v_register_alerts 20261023134000'den beri register satırlarını register_view_allowed ile süzüyor; yalnızca
// 'procurement' (critical_material_due) satırı rol süzgeçsiz (purchase_requests RLS'i). Ekranda rolün göremediği
// register'ın uyarısı yine gösterilmez: görüntü süzgeci, yetki değil (görünüm eski haline dönerse de doğru kalır).
export function canSeeAlert(role, alert) {
  const code = alert?.register_code
  if (code === 'risk' || code === 'procurement') return TEKNIK.includes(role)
  return canViewRegister(role, code)
}

export function alertCounts(alerts, role) {
  const counts = {}
  for (const a of alerts || []) {
    if (!canSeeAlert(role, a)) continue
    counts[a.alert_type] = (counts[a.alert_type] || 0) + 1
  }
  return counts
}

export function menuBadge(tabKey, counts) {
  const type = REGISTER_MENU_ITEMS[tabKey]?.alert
  const n = type ? counts?.[type] || 0 : 0
  return n > 0 ? n : null
}

// Genel ekrandaki uyarı kartları. tab: karta tıklayınca açılan menü sayfası.
export const ALERT_CARDS = [
  { type: 'rfi_overdue',           label: 'Gecikmiş RFI',                    tab: 'register-rfi' },
  { type: 'decision_overdue',      label: 'Süresi geçen karar',              tab: 'register-decision' },
  { type: 'action_overdue',        label: 'Geciken aksiyon',                 tab: 'register-action' },
  { type: 'claim_notice_due',      label: 'Claim bildirim süresi yaklaşan',  tab: 'register-claim' },
  { type: 'critical_material_due', label: 'Sahada gerekli kritik malzeme',   tab: 'satin-alma' },
]

// Rolün görebildiği ve sayısı 0'dan büyük kartlar.
export function visibleAlertCards(counts) {
  return ALERT_CARDS.filter(c => (counts?.[c.type] || 0) > 0).map(c => ({ ...c, count: counts[c.type] }))
}
