import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useScope } from '../../context/ScopeContext'
import Sidebar from '../../components/layouts/Sidebar'
import TabGenel from './components/TabGenel'
import TabProjeler from './components/TabProjeler'
import TabSatinAlma from './components/TabSatinAlma'
import TabFinans from './components/TabFinans'
import TabTickets from './components/TabTickets'
import TabSantiyeSefi from './components/TabSantiyeSefi'
import TabKullanicilar from './components/TabKullanicilar'
import TabIsPlan from './components/TabIsPlan'
import TabBildirimler from './components/TabBildirimler'
import ProjeDetay from './components/ProjeDetay'
import TabProjeYonetimi from './components/TabProjeYonetimi'
import FloatingAgent from '../../components/agent/FloatingAgent'
import NotificationBell from '../../components/ui/NotificationBell'
import DailyReportForm from '../../components/daily-report/DailyReportForm'
import DailyReportList from '../DailyReportList'
import './Dashboard.css'

const TABS = {
  genel:            { title: 'Genel Bakış',      subtitle: 'Proje özeti ve aktif görevler' },
  projeler:         { title: 'Projeler',          subtitle: 'Tüm GES projeleri' },
  'satin-alma':     { title: 'Satın Alma',        subtitle: 'Tedarik talepleri ve siparişler' },
  finans:           { title: 'Finans',            subtitle: 'Fatura yönetimi ve maliyet takibi' },
  tickets:          { title: 'Ticket Sistemi',    subtitle: 'Sahadan yöneticiye hata bildirimi' },
  kullanicilar:     { title: 'Kullanıcı Yönetimi', subtitle: 'Sistem kullanıcıları ve rol atamaları' },
  'proje-ekle':     { title: 'Proje Yönetimi',    subtitle: 'Projeleri görüntüle, ekle ve düzenle' },
  'daily-report':    { title: 'Günlük Rapor Gir',  subtitle: 'Saha günlük raporu oluştur veya düzenle' },
  'rapor-listesi':   { title: 'Raporlarım',         subtitle: 'Geçmiş günlük raporlar' },
  'is-plani':        { title: 'İş Planı',           subtitle: 'Proje iş programı ve görev takibi' },
  bildirimler:       { title: 'Bildirimler',        subtitle: 'Tüm bildirimleriniz' },
}

const ROLE_TABS = {
  muhasebe:          ['finans', 'bildirimler'],
  satin_alma_uzmani: ['satin-alma', 'bildirimler'],
  santiye_sefi:      ['genel', 'is-plani', 'daily-report', 'rapor-listesi', 'satin-alma', 'tickets', 'bildirimler'],
}

const ROLE_DEFAULT = {
  muhasebe:          'finans',
  satin_alma_uzmani: 'satin-alma',
  santiye_sefi:      'genel',
}

const ROLE_LABEL = {
  admin:             'Yönetici',
  muhasebe:          'Muhasebe',
  santiye_sefi:      'Şantiye Şefi',
  muhendis:          'Mühendis',
  koordinator:       'Koordinatör',
  satin_alma_uzmani: 'Satın Alma Uzmanı',
}

function getHeaderInitials(name) {
  if (!name) return '?'
  return name.split(/[\s@._-]+/).slice(0, 2).map(p => p[0]?.toUpperCase()).filter(Boolean).join('') || '?'
}

export default function Dashboard() {
  const { user, role, isAdmin, projectId, loading: authLoading, authError } = useAuth()
  const { projects: scopeProjects, showAllOption, scopeProjectId, setScopeProjectId } = useScope()
  const [sidebarOpen,         setSidebarOpen]         = useState(false)
  const [activeTab,           setActiveTab]           = useState(() => {
    const saved = window.localStorage.getItem('dashboard-active-tab')
    return saved && TABS[saved] ? saved : 'genel'
  })
  const [editReportId, setEditReportId] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportViewKey, setReportViewKey] = useState(0)
  const [selectedProjectId,   setSelectedProjectId]   = useState(null)
  const [selectedProjectName, setSelectedProjectName] = useState('')
  const [showProjectDetail,   setShowProjectDetail]   = useState(false)
  const [selectedDate,        setSelectedDate]        = useState(null)
  const navigate = useNavigate()

  // Kısıtlı roller → başlangıç sekmesi
  useEffect(() => {
    if (role && ROLE_DEFAULT[role]) setActiveTab(ROLE_DEFAULT[role])
  }, [role])

  useEffect(() => {
    window.localStorage.setItem('dashboard-active-tab', activeTab)
  }, [activeTab])


  function handleSelectProject(id, name) {
    setSelectedProjectId(id)
    setSelectedProjectName(name)
    setShowProjectDetail(true)
    setActiveTab('projeler')
  }

  function handleTabChange(tab) {
    const allowed = ROLE_TABS[role]
    if (allowed && !allowed.includes(tab)) return
    if (role === 'santiye_sefi' && tab === 'daily-report') {
      setEditReportId(null)
      setShowReportModal(true)
      return
    }
    setShowProjectDetail(false)
    setActiveTab(tab)
  }

  function openReportModal(id = null) {
    setEditReportId(id)
    setShowReportModal(true)
  }

  function closeReportModal() {
    setEditReportId(null)
    setShowReportModal(false)
  }

  function handleReportSaved() {
    setEditReportId(null)
    setShowReportModal(false)
    setReportViewKey(k => k + 1)
  }

  if (!authLoading && role === null) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', background: '#F8F9FA',
        textAlign: 'center', padding: 24,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Profiliniz Bulunamadı</h1>
        <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 24px', maxWidth: 340 }}>
          Hesabınıza atanmış bir rol bulunamadı. Lütfen yöneticinizle iletişime geçin.
        </p>
        {authError && (
          <p style={{
            fontSize: 12, color: '#991B1B', background: '#FEE2E2',
            border: '1px solid #FCA5A5', borderRadius: 8, padding: '10px 12px',
            margin: '0 0 18px', maxWidth: 420, wordBreak: 'break-word',
          }}>
            {authError}
          </p>
        )}
        <button
          onClick={async () => { await signOut(); navigate('/login') }}
          style={{
            background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Çıkış Yap
        </button>
      </div>
    )
  }

  const showingDetail = activeTab === 'projeler' && showProjectDetail
  const headerTitle = showingDetail ? selectedProjectName : TABS[activeTab].title

  return (
    <div className="dashboard">
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar
        active={activeTab}
        onTab={(tab) => { handleTabChange(tab); setSidebarOpen(false) }}
        onLogout={async () => { await signOut(); navigate('/login') }}
        isOpen={sidebarOpen}
      />
      <main className="dash-main">
        <header className="dash-header">
          <button
            className="menu-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menüyü aç"
            style={{ color: '#64748b' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{headerTitle}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            {showAllOption && (
              <select
                value={scopeProjectId || ''}
                onChange={(e) => setScopeProjectId(e.target.value || null)}
                title="Görüntülenecek proje kapsamı"
                style={{
                  background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: '7px 10px', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)',
                  cursor: 'pointer', fontFamily: 'inherit', maxWidth: 180,
                }}
              >
                <option value="">Tüm Projeler</option>
                {scopeProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <NotificationBell onNavigate={handleTabChange} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }} className="desk-only">
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--color-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {getHeaderInitials(user?.email?.split('@')[0] || 'U')}
              </div>
              <div style={{ lineHeight: 1.25 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                  {user?.email?.split('@')[0] || 'Kullanıcı'}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                  {ROLE_LABEL[role] || '—'}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="dash-content">
        {activeTab === 'genel'        && role === 'santiye_sefi' && (
          <TabSantiyeSefi
            key={reportViewKey}
            onTabChange={handleTabChange}
            onNewReport={() => openReportModal(null)}
            onEditReport={(id) => openReportModal(id)}
          />
        )}
        {activeTab === 'rapor-listesi' && role === 'santiye_sefi' && (
          <DailyReportList
            key={reportViewKey}
            onNewReport={() => openReportModal(null)}
            onEditReport={(id) => openReportModal(id)}
          />
        )}
        {activeTab === 'is-plani'     && role === 'santiye_sefi' && (
          <TabIsPlan projectId={projectId} siteChiefView />
        )}
        {activeTab === 'bildirimler'  && <TabBildirimler onNavigate={handleTabChange} />}
        {activeTab === 'genel'        && role !== 'santiye_sefi' && <TabGenel scopeProjectId={scopeProjectId} onSelectProject={handleSelectProject} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onTabChange={handleTabChange} />}
        {activeTab === 'projeler'     && !showProjectDetail && <TabProjeler onSelectProject={handleSelectProject} />}
        {activeTab === 'projeler'     && showProjectDetail  && (
          <ProjeDetay
            projectId={selectedProjectId}
            projectName={selectedProjectName}
            onBack={() => setShowProjectDetail(false)}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
        )}
        {activeTab === 'satin-alma'   && <TabSatinAlma />}
        {activeTab === 'finans'       && <TabFinans />}
        {activeTab === 'tickets'      && <TabTickets selectedDate={selectedDate} />}
        {activeTab === 'kullanicilar' && isAdmin && <TabKullanicilar />}
        {activeTab === 'proje-ekle'  && isAdmin && (
          <TabProjeYonetimi
            onViewProject={(id, name) => {
              setSelectedProjectId(id)
              setSelectedProjectName(name)
              setShowProjectDetail(true)
              setActiveTab('projeler')
            }}
          />
        )}
        </div>

        {role === 'santiye_sefi' && showReportModal && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.48)',
              zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 18,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeReportModal()
            }}
          >
            <div
              className="daily-report-modal-shell"
              style={{
                width: 'min(1180px, 96vw)', maxHeight: '92vh', overflowY: 'auto',
                background: '#F8FAFC', borderRadius: 18, boxShadow: '0 24px 80px rgba(15,23,42,.28)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ padding: 18 }}>
                <DailyReportForm
                  className="daily-report-modal-form"
                  reportId={editReportId || undefined}
                  onBack={closeReportModal}
                  onSaved={handleReportSaved}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <FloatingAgent activeTab={activeTab} projectId={selectedProjectId} selectedDate={selectedDate} />
    </div>
  )
}
