import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useRegisterAlerts } from '../../hooks/useRegisterAlerts'
import {
  REGISTER_MENU_ITEMS, groupSidebarItems, menuBadge, sectionBadge, openSectionsFor, toggleSection,
} from '../../lib/menu/sidebarMenu'

const OPEN_SECTIONS_KEY = 'sidebar-open-sections'

const svg = children => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
)

// Register menü öğelerinin ikonları (etiketler sidebarMenu.REGISTER_MENU_ITEMS'ta).
const REGISTER_ICONS = {
  'register-rfi': svg(<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><line x1="12" y1="17" x2="12.01" y2="17"/></>),
  'register-action': svg(<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>),
  'register-decision': svg(<><path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/></>),
  'register-risk': svg(<><path d="M12 3 2 21h20L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.5" x2="12.01" y2="17.5"/></>),
  'register-interface': svg(<><rect x="3" y="8" width="7" height="8" rx="1"/><rect x="14" y="8" width="7" height="8" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></>),
  'register-document': svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>),
  'register-drawing': svg(<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l6-6 4 4 3-3 5 5"/></>),
  'register-submittal': svg(<><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></>),
  'register-material-approval': svg(<><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m9 12 2 2 4-4"/></>),
  'register-change': svg(<><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>),
  'register-claim': svg(<><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>),
}

export default function Sidebar({ active, onTab, onLogout, isOpen }) {
  const { navigation, isMuhasebe } = useAuth()
  const alertCountsByType = useRegisterAlerts()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })
  // İkon-only moddaki nav-item tooltip'i .sidebar'ın kendisi overflow-x:hidden
  // olduğundan (nav listesinin dikey scroll'u için gerekli) saf CSS ::after ile
  // kutunun dışına taşamıyor, görünmez kalıyordu — document.body'ye portal'lanan
  // gerçek bir DOM node'u bu kısıtlamayı by-pass eder.
  const [tooltip, setTooltip] = useState(null) // { label, top, left } | null

  useEffect(() => {
    try { localStorage.setItem('sidebar-collapsed', String(collapsed)) } catch {}
  }, [collapsed])

  // Açılır-kapanır bölümler: ilk girişte günlük bölümler açık, register bölümleri kapalı (DEFAULT_OPEN_SECTIONS);
  // etkin sayfa kapalı bir bölüme geçince o bölüm açılır. Kullanıcının seçimi tarayıcıda saklanır.
  const activeSection = navigation?.sectionOf?.[active] || null
  const [openSections, setOpenSections] = useState(() => {
    let stored = null
    try { stored = JSON.parse(localStorage.getItem(OPEN_SECTIONS_KEY)) } catch {}
    return openSectionsFor(stored, activeSection)
  })
  useEffect(() => {
    if (activeSection) setOpenSections(prev => (prev.includes(activeSection) ? prev : [...prev, activeSection]))
  }, [activeSection])
  useEffect(() => {
    try { localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(openSections)) } catch {}
  }, [openSections])

  const showFull = !collapsed || isOpen

  function showTooltip(e, label) {
    if (showFull) return
    const r = e.currentTarget.getBoundingClientRect()
    setTooltip({ label, top: r.top + r.height / 2, left: r.right + 10 })
  }
  function hideTooltip() {
    setTooltip(null)
  }

  const items = [
    {
      key: 'genel', label: 'Genel Bakış',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      ),
    },
    {
      key: 'is-plani', label: 'İş Planı',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="7" y1="14" x2="13" y2="14"/>
          <line x1="7" y1="17" x2="17" y2="17"/>
        </svg>
      ),
    },
    {
      key: 'rapor-listesi', label: 'Raporlarım',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      ),
    },
    {
      key: 'projeler', label: 'Projeler',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 20h20"/><path d="M5 20V8l7-6 7 6v12"/><path d="M9 20v-6h6v6"/>
        </svg>
      ),
    },
    {
      // "Bekleyenler" yalnızca muhasebe için — muhasebe bu sekmede yalnızca
      // fatura kesilmeyi bekleyen (satin_alindi) talepleri görür, diğer
      // rollerde tam satın alma talebi listesi (tüm durumlar) olduğundan
      // "Satın Alma" daha doğru.
      key: 'satin-alma', label: isMuhasebe ? 'Bekleyenler' : 'Satın Alma',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" x2="21" y1="6" y2="6"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
      ),
    },
    {
      key: 'teklif-pazarlik-siparis', label: 'Teklif / Pazarlık / Sipariş',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/>
          <path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
        </svg>
      ),
    },
    {
      key: 'finans', label: 'Finans',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" x2="8" y1="13" y2="13"/>
          <line x1="16" x2="8" y1="17" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      ),
    },
    {
      key: 'odemeler', label: 'Ödemeler',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2"/>
          <line x1="2" x2="22" y1="10" y2="10"/>
          <line x1="6" x2="10" y1="15" y2="15"/>
        </svg>
      ),
    },
    {
      key: 'tickets', label: 'Tickets',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    {
      // Proje kontrol register'ları (RFI, Doküman, Karar…). Alt sekmeler TabRegister'da, rol bazlı (Karar 6).
      key: 'register', label: 'Register',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="3" width="16" height="18" rx="2"/>
          <line x1="8" y1="8" x2="16" y2="8"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
          <line x1="8" y1="16" x2="12" y2="16"/>
        </svg>
      ),
    },
    {
      key: 'bildirimler', label: 'Bildirimler',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
      ),
    },
    {
      key: 'proje-ekle', label: 'Proje Yönetimi',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      ),
    },
    {
      key: 'kullanicilar', label: 'Kullanıcılar',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    ...Object.entries(REGISTER_MENU_ITEMS).map(([key, meta]) => ({ key, label: meta.label, icon: REGISTER_ICONS[key] })),
  ]
  const itemByKey = new Map(items.map(item => [item.key, item]))

  // Sıra veritabanından (role_sidebar_items.order_index); tanınmayan anahtar atlanır.
  // 'bildirimler' rol tanımından bağımsız her zaman görünür (RLS: recipient_id=auth.uid())
  // — role_sidebar_items henüz yüklenmemiş/boşsa bile bildirim erişimi kaybolmasın diye.
  // Eski tek "register" öğesi, bölümlü register sayfaları geldiyse gizlenir (veritabanından ayrıca kaldırılacak).
  const sidebarKeys = navigation ? [...(navigation.sidebarItems || [])] : []
  if (navigation && !sidebarKeys.includes('bildirimler')) sidebarKeys.push('bildirimler')
  const hasRegisterPages = sidebarKeys.some(k => k in REGISTER_MENU_ITEMS)
  const visibleKeys = sidebarKeys.filter(k => itemByKey.has(k) && !(k === 'register' && hasRegisterPages))
  const groups = groupSidebarItems(visibleKeys, navigation?.sectionOf, navigation?.sidebarSections)

  function renderItem(key) {
    const item = itemByKey.get(key)
    const badge = menuBadge(key, alertCountsByType)
    return (
      <button
        key={item.key}
        className={`nav-item${active === item.key ? ' active' : ''}`}
        onClick={() => onTab(item.key)}
        title={item.label}
        aria-label={badge ? `${item.label}, ${badge} uyarı` : item.label}
        aria-current={active === item.key ? 'page' : undefined}
        onMouseEnter={e => showTooltip(e, badge ? `${item.label} (${badge})` : item.label)}
        onMouseLeave={hideTooltip}
        onFocus={e => showTooltip(e, item.label)}
        onBlur={hideTooltip}
      >
        {item.icon}
        {showFull && <span className="nav-label">{item.label}</span>}
        {badge && <span className="nav-badge" aria-hidden="true">{badge}</span>}
      </button>
    )
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${isOpen ? ' open' : ''}`}>
      <div
        className="sidebar-brand"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
      >
        <img src="/images/fons-logo.jpeg" alt="Fons Solar" />
        {showFull && (
          <div>
            <strong>Fons Solar</strong>
            <span>GES Dashboard</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Ana menü">
        {groups.map(group => {
          if (!group.label) return <div key="bolumsuz" className="nav-section">{group.items.map(renderItem)}</div>
          // İkon modunda başlık yok, bütün ikonlar görünür (bölümler ince çizgiyle ayrılır).
          if (!showFull) {
            return (
              <div key={group.key} className="nav-section" role="group" aria-label={group.label}>
                <div className="nav-section-sep" aria-hidden="true" />
                {group.items.map(renderItem)}
              </div>
            )
          }
          const open = openSections.includes(group.key)
          const total = open ? null : sectionBadge(group.items, alertCountsByType)
          const listId = `nav-section-${group.key}`
          return (
            <div key={group.key} className={`nav-section${open ? ' open' : ''}`} role="group" aria-label={group.label}>
              <button
                type="button"
                className="nav-section-toggle"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={total ? `${group.label}, ${total} uyarı` : group.label}
                onClick={() => setOpenSections(prev => toggleSection(prev, group.key))}
              >
                <span className="nav-section-label">{group.label}</span>
                {total && <span className="nav-badge" aria-hidden="true">{total}</span>}
                <svg className="nav-section-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
              <div id={listId} className="nav-section-items" hidden={!open}>
                {group.items.map(renderItem)}
              </div>
            </div>
          )
        })}
      </nav>

      {tooltip && createPortal(
        <div
          className="sidebar-nav-tooltip"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.label}
        </div>,
        document.body
      )}

      <div className="sidebar-bottom">
        <button className="sidebar-logout-btn" onClick={onLogout} title="Çıkış Yap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" x2="9" y1="12" y2="12"/>
          </svg>
          {showFull && <span>Çıkış</span>}
        </button>
      </div>
    </aside>
  )
}
