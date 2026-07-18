import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useScope } from '../../context/ScopeContext'
import Sidebar from '../../components/layouts/Sidebar'
import TabGenel from './components/TabGenel'
import TabProjeler from './components/TabProjeler'
import TabSatinAlma from './components/TabSatinAlma'
import ProjeTabSatinAlma from './components/ProjeTabSatinAlma'
import TabFinans from './components/TabFinans'
import TabTickets from './components/TabTickets'
import TabSantiyeSefi from './components/TabSantiyeSefi'
import TabKullanicilar from './components/TabKullanicilar'
import TabIsPlan from './components/TabIsPlan'
import TabBildirimler from './components/TabBildirimler'
import ProjeDetay from './components/ProjeDetay'
import TabProjeYonetimi from './components/TabProjeYonetimi'
import KaliteKontrolListesi from '../../components/kalite-kontrol/KaliteKontrolListesi'
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
  'kalite-kontrol':  { title: 'Kalite Kontrol',      subtitle: 'Denetim kayıtları ve punch list takibi' },
  bildirimler:       { title: 'Bildirimler',        subtitle: 'Tüm bildirimleriniz' },
}

// Tek projeye kilitli saha/teknik uzman rolleri — henüz kendi özel modülleri yok
// (bkz. CLAUDE.md "Hiç yapılmamış modüller"), bu yüzden hepsi santiye_sefi'nin
// genel demetini (Genel Bakış/İş Planı/Satın Alma/Tickets) paylaşıyor, ama
// santiye_sefi'ye özel Günlük Rapor formu/listesi olmadan.
const FIELD_SPECIALIST_ROLES = [
  'elektrik_sefi', 'mekanik_sef', 'isg_sorumlusu', 'kalite_kontrol_sefi',
  'enh_sorumlusu', 'proje_kurulum_sefi', 'proje_tasarim_sorumlusu',
  'evrak_takip', 'operasyon_sorumlusu', 'is_makinesi_operator', 'lojistik_tedarik',
]
const FIELD_SPECIALIST_TABS = ['genel', 'is-plani', 'satin-alma', 'tickets', 'bildirimler']

const ROLE_TABS = {
  muhasebe:          ['finans', 'bildirimler'],
  proje_yoneticisi:  ['genel', 'projeler', 'is-plani', 'satin-alma', 'bildirimler'],
  santiye_sefi:      ['genel', 'is-plani', 'daily-report', 'rapor-listesi', 'satin-alma', 'tickets', 'bildirimler'],
  ...Object.fromEntries(FIELD_SPECIALIST_ROLES.map(role => [role, FIELD_SPECIALIST_TABS])),
  // kalite_kontrol_sefi jenerik FIELD_SPECIALIST_TABS demetini genişletir — kendi Kalite
  // Kontrol modülü var artık, bu yüzden yukarıdaki spread'i override eden özel bir kayıt.
  kalite_kontrol_sefi: ['genel', 'is-plani', 'satin-alma', 'kalite-kontrol', 'tickets', 'bildirimler'],
}

const ROLE_DEFAULT = {
  muhasebe:          'finans',
  proje_yoneticisi:  'genel',
  santiye_sefi:      'genel',
  ...Object.fromEntries(FIELD_SPECIALIST_ROLES.map(role => [role, 'genel'])),
}

const ROLE_LABEL = {
  admin:                     'Yönetici',
  muhasebe:                  'Muhasebe',
  santiye_sefi:              'Şantiye Şefi',
  muhendis:                  'Mühendis',
  koordinator:               'Koordinatör',
  proje_yoneticisi:          'Proje Yöneticisi',
  proje_koordinatoru:        'Proje Koordinatörü',
  maliyet_kontrolcu:         'Maliyet Kontrolcü',
  elektrik_sefi:             'Elektrik Şefi',
  mekanik_sef:               'Mekanik Şef',
  isg_sorumlusu:             'İSG Sorumlusu',
  kalite_kontrol_sefi:       'Kalite Kontrol Şefi',
  enh_sorumlusu:             'ENH Sorumlusu',
  proje_kurulum_sefi:        'Proje Kurulum Şefi',
  proje_tasarim_sorumlusu:   'Proje Tasarım Sorumlusu',
  evrak_takip:               'Evrak Takip',
  operasyon_sorumlusu:       'Operasyon Sorumlusu',
  is_makinesi_operator:      'İş Makinesi Operatörü',
  lojistik_tedarik:          'Lojistik ve Tedarik',
}

function getHeaderInitials(name) {
  if (!name) return '?'
  return name.split(/[\s@._-]+/).slice(0, 2).map(p => p[0]?.toUpperCase()).filter(Boolean).join('') || '?'
}

// proje_yoneticisi artık cross_project=true (birden fazla projeye erişebiliyor) ama header'daki
// global proje seçici kaldırıldı — Genel/İş Planı/Satın Alma sekmeleri tek-proje odaklı olduğundan
// scopeProjectId boşken bu küçük seçici devreye girer (yalnızca bu rol için, diğer rollerin
// "Tüm Projeler" davranışını etkilemez).
function ProjeSecimGerekli({ projects, onSelect }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 16 }}>Devam etmek için bir proje seçin</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, margin: '0 auto' }}>
        {projects.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              background: '#fff', border: '1px solid var(--color-border-md)', borderRadius: 10,
              padding: '12px 16px', fontSize: 14, fontWeight: 600, color: 'var(--color-text)',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, role, isAdmin, projectId, loading: authLoading, authError } = useAuth()
  const { scopeProjectId: contextScopeProjectId, projects: scopeProjects } = useScope()
  // ScopeContext artık manuel override desteklemiyor (header seçicisi kalkınca kasıtlı
  // sadeleştirildi, scopeProjectId yalnızca tek-proje kullanıcıda otomatik çözülüyor).
  // proje_yoneticisi (cross_project=true, çoklu proje) için bu üç sekmede (genel/is-plani/
  // satin-alma) hâlâ tek bir proje seçilmesi gerektiğinden, ortak context'e dokunmadan bu
  // role özel yerel bir seçim state'i tutuyoruz — diğer rollerin "Tüm Projeler" davranışını etkilemez.
  const [pySelectedProjectId, setPySelectedProjectId] = useState(null)
  const scopeProjectId = role === 'proje_yoneticisi' ? (contextScopeProjectId || pySelectedProjectId) : contextScopeProjectId
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
  const [openTicketId,        setOpenTicketId]        = useState(null)
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

  // Günlük rapor formundaki "Ticket açıldı" rozetine tıklayınca: raporu kapat,
  // Tickets sekmesine geç, o ticket'ı doğrudan aç.
  function goToTicket(ticketId) {
    closeReportModal()
    setOpenTicketId(ticketId)
    handleTabChange('tickets')
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
        {activeTab === 'is-plani'     && role === 'proje_yoneticisi' && (
          !scopeProjectId && scopeProjects.length > 1
            ? <ProjeSecimGerekli projects={scopeProjects} onSelect={setPySelectedProjectId} />
            : <TabIsPlan projectId={scopeProjectId} />
        )}
        {activeTab === 'is-plani'     && FIELD_SPECIALIST_ROLES.includes(role) && (
          <TabIsPlan projectId={projectId} />
        )}
        {activeTab === 'kalite-kontrol' && role === 'kalite_kontrol_sefi' && (
          <KaliteKontrolListesi projectId={projectId} />
        )}
        {activeTab === 'bildirimler'  && <TabBildirimler onNavigate={handleTabChange} />}
        {activeTab === 'genel'        && role === 'proje_yoneticisi' && (
          !scopeProjectId && scopeProjects.length > 1
            ? <ProjeSecimGerekli projects={scopeProjects} onSelect={setPySelectedProjectId} />
            : <TabGenel scopeProjectId={scopeProjectId} onSelectProject={handleSelectProject} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onTabChange={handleTabChange} />
        )}
        {activeTab === 'genel'        && role !== 'santiye_sefi' && role !== 'proje_yoneticisi' && <TabGenel scopeProjectId={scopeProjectId} onSelectProject={handleSelectProject} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onTabChange={handleTabChange} />}
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
        {activeTab === 'satin-alma'   && role === 'santiye_sefi' && (
          <ProjeTabSatinAlma projectId={projectId} siteChiefView />
        )}
        {activeTab === 'satin-alma'   && role === 'proje_yoneticisi' && (
          !scopeProjectId && scopeProjects.length > 1
            ? <ProjeSecimGerekli projects={scopeProjects} onSelect={setPySelectedProjectId} />
            : <ProjeTabSatinAlma projectId={scopeProjectId} procurementManagerView />
        )}
        {activeTab === 'satin-alma'   && role !== 'santiye_sefi' && role !== 'proje_yoneticisi' && <TabSatinAlma />}
        {activeTab === 'finans'       && role !== 'proje_yoneticisi' && <TabFinans />}
        {activeTab === 'tickets'      && role !== 'proje_yoneticisi' && (
          <TabTickets
            selectedDate={selectedDate}
            openTicketId={openTicketId}
            onOpenedTicket={() => setOpenTicketId(null)}
          />
        )}
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
                  onGoToTicket={goToTicket}
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
