import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Sidebar from '../../components/layouts/Sidebar'
import TabGenel from './components/TabGenel'
import TabProjeler from './components/TabProjeler'
import TabIsPlan from './components/TabIsPlan'
import TabSatinAlma from './components/TabSatinAlma'
import TabFinans from './components/TabFinans'
import TabTickets from './components/TabTickets'
import TabSantiyeSefi from './components/TabSantiyeSefi'
import TabKullanicilar from './components/TabKullanicilar'
import ProjeDetay from './components/ProjeDetay'
import FloatingAgent from '../../components/agent/FloatingAgent'
import './Dashboard.css'

const TABS = {
  genel:          { title: 'Genel Bakış',      subtitle: 'Proje özeti ve aktif görevler' },
  projeler:       { title: 'Projeler',          subtitle: 'Tüm GES projeleri' },
  'is-plani':     { title: 'İş Planı',          subtitle: 'Görev takip ve zaman çizelgesi' },
  'satin-alma':   { title: 'Satın Alma',        subtitle: 'Tedarik talepleri ve siparişler' },
  finans:         { title: 'Finans',            subtitle: 'Fatura yönetimi ve maliyet takibi' },
  tickets:        { title: 'Ticket Sistemi',    subtitle: 'Sahadan yöneticiye hata bildirimi' },
  kullanicilar:   { title: 'Kullanıcı Yönetimi', subtitle: 'Sistem kullanıcıları ve rol atamaları' },
}

const ROLE_TABS = {
  muhasebe:          ['finans'],
  satin_alma_uzmani: ['satin-alma'],
}

const ROLE_DEFAULT = {
  muhasebe:          'finans',
  satin_alma_uzmani: 'satin-alma',
}

export default function Dashboard() {
  const { role, isAdmin } = useAuth()
  const [sidebarOpen,         setSidebarOpen]         = useState(false)
  const [activeTab,           setActiveTab]           = useState('genel')
  const [selectedProjectId,   setSelectedProjectId]   = useState(null)
  const [selectedProjectName, setSelectedProjectName] = useState('')
  const [showProjectDetail,   setShowProjectDetail]   = useState(false)
  const [selectedDate,        setSelectedDate]        = useState(null)
  const navigate = useNavigate()

  // Kısıtlı roller → başlangıç sekmesi
  useEffect(() => {
    if (role && ROLE_DEFAULT[role]) setActiveTab(ROLE_DEFAULT[role])
  }, [role])


  function handleSelectProject(id, name) {
    setSelectedProjectId(id)
    setSelectedProjectName(name)
    if (activeTab === 'projeler') {
      setShowProjectDetail(true)
    } else {
      setActiveTab('is-plani')
    }
  }

  function handleTabChange(tab) {
    const allowed = ROLE_TABS[role]
    if (allowed && !allowed.includes(tab)) return
    setShowProjectDetail(false)
    setActiveTab(tab)
  }

  const showingDetail = activeTab === 'projeler' && showProjectDetail

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
        <header className="dash-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <button
            className="menu-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menüyü aç"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <h2>{showingDetail ? selectedProjectName : TABS[activeTab].title}</h2>
            <p>
              {showingDetail
                ? 'Proje detayı ve Gantt görünümü'
                : TABS[activeTab].subtitle}
              {!showingDetail && selectedProjectName && ['is-plani', 'satin-alma'].includes(activeTab) && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  — {selectedProjectName}
                </span>
              )}
            </p>
          </div>
        </header>

        {activeTab === 'genel'        && role === 'santiye_sefi' && <TabSantiyeSefi />}
        {activeTab === 'genel'        && role !== 'santiye_sefi' && <TabGenel onSelectProject={handleSelectProject} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
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
        {activeTab === 'is-plani'     && <TabIsPlan projectId={selectedProjectId} selectedDate={selectedDate} />}
        {activeTab === 'satin-alma'   && <TabSatinAlma projectId={selectedProjectId} selectedDate={selectedDate} />}
        {activeTab === 'finans'       && <TabFinans selectedDate={selectedDate} />}
        {activeTab === 'tickets'      && <TabTickets selectedDate={selectedDate} />}
        {activeTab === 'kullanicilar' && isAdmin && <TabKullanicilar />}
      </main>

      <FloatingAgent activeTab={activeTab} projectId={selectedProjectId} selectedDate={selectedDate} />
    </div>
  )
}
