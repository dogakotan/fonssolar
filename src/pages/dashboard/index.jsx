import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, signOut } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Sidebar from '../../components/layouts/Sidebar'
import TabGenel from './components/TabGenel'
import TabProjeler from './components/TabProjeler'
import TabSatinAlma from './components/TabSatinAlma'
import TabFinans from './components/TabFinans'
import TabTickets from './components/TabTickets'
import TabSantiyeSefi from './components/TabSantiyeSefi'
import TabKullanicilar from './components/TabKullanicilar'
import ProjeDetay from './components/ProjeDetay'
import TabProjeYonetimi from './components/TabProjeYonetimi'
import FloatingAgent from '../../components/agent/FloatingAgent'
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
}

const ROLE_TABS = {
  muhasebe:          ['finans'],
  satin_alma_uzmani: ['satin-alma'],
  santiye_sefi:      ['genel', 'daily-report', 'rapor-listesi', 'satin-alma', 'tickets'],
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

function projectIdLabel(projectId) {
  if (!projectId || /^[0-9a-f-]{24,}$/i.test(String(projectId))) return ''
  return String(projectId)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, c => c.toLocaleUpperCase('tr-TR'))
}

export default function Dashboard() {
  const { user, role, isAdmin, projectId } = useAuth()
  const [sidebarOpen,         setSidebarOpen]         = useState(false)
  const [openTicketCount,     setOpenTicketCount]     = useState(0)
  const [activeTab,           setActiveTab]           = useState(() => {
    const saved = window.localStorage.getItem('dashboard-active-tab')
    return saved && TABS[saved] ? saved : 'genel'
  })
  const [editReportId, setEditReportId] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportViewKey, setReportViewKey] = useState(0)
  const [selectedProjectId,   setSelectedProjectId]   = useState(null)
  const [selectedProjectName, setSelectedProjectName] = useState('')
  const [assignedProjectName, setAssignedProjectName] = useState('')
  const [assignedProjectLoaded, setAssignedProjectLoaded] = useState(false)
  const [showProjectDetail,   setShowProjectDetail]   = useState(false)
  const [selectedDate,        setSelectedDate]        = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let query = supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['gönderildi', 'açık', 'işlemde'])
    if (role === 'santiye_sefi' && projectId) query = query.eq('project_id', projectId)
    query
      .then(({ count }) => setOpenTicketCount(count || 0))
  }, [role, projectId])

  useEffect(() => {
    if (role !== 'santiye_sefi') return
    if (!projectId) {
      setAssignedProjectName('')
      setAssignedProjectLoaded(true)
      return
    }
    setAssignedProjectName('')
    setAssignedProjectLoaded(false)
    async function loadAssignedProjectName() {
      try {
        const byId = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .maybeSingle()

        if (byId.data?.name) {
          setAssignedProjectName(byId.data.name)
          return
        }

        if (projectIdLabel(projectId)) {
          const byName = await supabase
            .from('projects')
            .select('*')
            .ilike('name', `%${String(projectId).replace(/[-_]+/g, ' ')}%`)
            .limit(1)
            .maybeSingle()

          if (byName.data?.name) {
            setAssignedProjectName(byName.data.name)
            return
          }
        }

        setAssignedProjectName(projectIdLabel(projectId))
      } finally {
        setAssignedProjectLoaded(true)
      }
    }

    loadAssignedProjectName()
  }, [role, projectId])

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

  const showingDetail = activeTab === 'projeler' && showProjectDetail
  const headerTitle = role === 'santiye_sefi' && activeTab === 'genel'
    ? (assignedProjectName || (projectId && !assignedProjectLoaded ? 'Proje yükleniyor...' : 'Proje atanmadı'))
    : showingDetail
      ? selectedProjectName
      : TABS[activeTab].title
  const headerSubtitle = role === 'santiye_sefi' && activeTab === 'genel' ? 'Genel Bakış' : null

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
            {headerSubtitle && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>{headerSubtitle}</p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <button
              onClick={() => handleTabChange('tickets')}
              style={{
                position: 'relative',
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '50%',
                width: 36, height: 36, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: '#64748b', flexShrink: 0,
                transition: 'border-color 0.15s, background 0.15s',
              }}
              title={`${openTicketCount} açık ticket`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {openTicketCount > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -3,
                  background: '#ef4444', color: '#fff', borderRadius: '50%',
                  minWidth: 16, height: 16, fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, padding: '0 3px',
                }}>
                  {openTicketCount > 99 ? '99+' : openTicketCount}
                </span>
              )}
            </button>
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
        {activeTab === 'daily-report' && role === 'santiye_sefi' && false && (
          <DailyReportForm
            reportId={editReportId || undefined}
            onBack={closeReportModal}
            onSaved={handleReportSaved}
          />
        )}
        {activeTab === 'rapor-listesi' && role === 'santiye_sefi' && (
          <DailyReportList
            key={reportViewKey}
            onNewReport={() => openReportModal(null)}
            onEditReport={(id) => openReportModal(id)}
          />
        )}
        {activeTab === 'genel'        && role !== 'santiye_sefi' && <TabGenel onSelectProject={handleSelectProject} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onTabChange={handleTabChange} />}
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
        {activeTab === 'satin-alma'   && <TabSatinAlma projectId={selectedProjectId} selectedDate={selectedDate} />}
        {activeTab === 'finans'       && <TabFinans selectedDate={selectedDate} />}
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
