import { useAuth } from '../../context/AuthContext'

const ALL_ROLES  = ['admin', 'santiye_sefi', 'muhendis', 'koordinator', 'muhasebe', 'satin_alma_uzmani']
const SAHA_ROLES = ['admin', 'santiye_sefi', 'muhendis', 'koordinator']

const ROLE_LABEL = {
  admin:             'Yönetici',
  muhasebe:          'Muhasebe',
  santiye_sefi:      'Şantiye Şefi',
  muhendis:          'Mühendis',
  koordinator:       'Koordinatör',
  satin_alma_uzmani: 'Satın Alma Uzmanı',
}

export default function Sidebar({ active, onTab, onLogout, isOpen }) {
  const { user, role } = useAuth()
  const items = [
    {
      key: 'genel', label: 'Genel Bakış',
      roles: SAHA_ROLES,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
    },
    {
      key: 'projeler', label: 'Projeler',
      roles: ['admin', 'muhendis', 'koordinator'],
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20h20"/><path d="M5 20V8l7-6 7 6v12"/><path d="M9 20v-6h6v6"/></svg>,
    },
    {
      key: 'is-plani', label: 'İş Planı',
      roles: SAHA_ROLES,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    },
    {
      key: 'satin-alma', label: 'Satın Alma',
      roles: [...SAHA_ROLES, 'satin_alma_uzmani'],
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
    },
    {
      key: 'finans', label: 'Finans',
      roles: ['admin', 'muhasebe'],
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    },
    {
      key: 'tickets', label: 'Tickets',
      roles: SAHA_ROLES,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    },
  ]

  const visibleItems = role ? items.filter(item => item.roles.includes(role)) : items

  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`}>
      <div className="sidebar-brand">
        <img src="/images/fons-logo.jpeg" alt="Fons Solar" />
        <div>
          <strong>Fons Solar</strong>
          <span>GES Dashboard</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map(item => (
          <button
            key={item.key}
            className={`nav-item${active === item.key ? ' active' : ''}`}
            onClick={() => onTab(item.key)}
            data-label={item.label}
            title={item.label}
          >
            {item.icon}
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-user">
        <div>
          <p className="user-name">{user?.email?.split('@')[0] || 'Kullanıcı'}</p>
          <p className="user-role">{ROLE_LABEL[role] || user?.email || '—'}</p>
        </div>
        <button className="logout-btn" onClick={onLogout} title="Çıkış Yap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" x2="9" y1="12" y2="12"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}
