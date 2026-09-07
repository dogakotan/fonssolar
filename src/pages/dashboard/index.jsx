import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, signOut } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useScope } from '../../context/ScopeContext'
import Sidebar from '../../components/layouts/Sidebar'
import TabGenel from './components/TabGenel'
import MuhasebeGenelOzet from './components/MuhasebeGenelOzet'
import TabProjeler from './components/TabProjeler'
import TabSatinAlma from './components/TabSatinAlma'
import TabTeklifPazarlikSiparis from './components/TabTeklifPazarlikSiparis'
import ProjeTabSatinAlma from './components/ProjeTabSatinAlma'
import TabFinans from './components/TabFinans'
import TabOdemeler from './components/TabOdemeler'
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
  'satin-alma':     { title: 'Bekleyenler',       subtitle: 'Tedarik talepleri ve siparişler' },
  'teklif-pazarlik-siparis': { title: 'Teklif / Pazarlık / Sipariş', subtitle: 'Teklif toplama, pazarlık onayı ve sipariş süreci' },
  finans:           { title: 'Finans',            subtitle: 'Fatura yönetimi ve maliyet takibi' },
  odemeler:         { title: 'Ödemeler',          subtitle: 'Ödeme takibi ve tedarikçi bakiyeleri' },
  tickets:          { title: 'Ticket Sistemi',    subtitle: 'Sahadan yöneticiye hata bildirimi' },
  kullanicilar:     { title: 'Kullanıcı Yönetimi', subtitle: 'Sistem kullanıcıları ve rol atamaları' },
  'proje-ekle':     { title: 'Proje Yönetimi',    subtitle: 'Projeleri görüntüle, ekle ve düzenle' },
  'daily-report':    { title: 'Günlük Rapor Gir',  subtitle: 'Saha günlük raporu oluştur veya düzenle' },
  'rapor-listesi':   { title: 'Raporlarım',         subtitle: 'Geçmiş günlük raporlar' },
  'is-plani':        { title: 'İş Planı',           subtitle: 'Proje iş programı ve görev takibi' },
  bildirimler:       { title: 'Bildirimler',        subtitle: 'Tüm bildirimleriniz' },
}

function getHeaderInitials(name) {
  if (!name) return '?'
  return name.split(/[\s@._-]+/).slice(0, 2).map(p => p[0]?.toUpperCase()).filter(Boolean).join('') || '?'
}


export default function Dashboard() {
  const { user, role, isAdmin, projectId, loading: authLoading, authError, navigation, roleLabel } = useAuth()
  // ScopeContext artık manuel override desteklemiyor (header seçicisi kalkınca kasıtlı
  // sadeleştirildi, scopeProjectId yalnızca tek-proje kullanıcıda otomatik çözülüyor).
  // proje_yoneticisi (cross_project=true, çoklu proje) için scopeProjectId boşken
  // 'genel' sekmesi TabGenel'e aggregate ("Tüm Projeler") modunda geçer (2026-07-21).
  const { scopeProjectId } = useScope()
  const location = useLocation()
  const navigate = useNavigate()
  // URL /dashboard/:tab(/:projectId(/:projectTab)) şeklinde parse edilir — tek bir
  // wildcard route (/dashboard/*) kullanılıyor (Dashboard bileşeni her navigasyonda
  // yeniden mount OLMASIN diye, ayrı <Route> girdileri olsaydı React bunları farklı
  // ağaç konumu sayıp remount edebilirdi). Adres çubuğunun geçerli görünümü
  // yansıtması + yenilemede/geri-ileri'de korunması için tek doğruluk kaynağı bu.
  // `useMemo` ile `location.pathname` değişmediği sürece AYNI array referansı
  // korunuyor — memoize edilmeden bu her render'da (ör. openRequestId gibi bir
  // state değişip Dashboard yeniden render olduğunda) YENİ bir dizi üretiyordu,
  // bu da aşağıdaki URL-senkron efektinin (satır ~150, deps'inde pathSegments
  // var) location GERÇEKTEN değişmediği hâlde her seferinde yeniden çalışmasına
  // yol açıyordu. Bildirimden bir kayda gidince (openRequestId vb. set edilip
  // useHighlightRow ~300ms sonra onOpenedRequest ile null'a çekince) Dashboard
  // yeniden render oluyor → pathSegments yeni referans → efekt yeniden çalışıp
  // URL'de hâlâ duran `?talep=` parametresini tekrar okuyup openRequestId'yi
  // AYNI id'ye geri set ediyordu — sonsuz bir 300ms'lik id→null→id döngüsü
  // (04.09.2026'da useHighlightRow'un vurguyu hiç söndürmediği/`onConsumed`'ın
  // hiç kalıcı olmadığı bug'ı araştırılırken bulundu; kök neden burada).
  const pathSegments = useMemo(
    () => location.pathname.replace(/^\/dashboard\/?/, '').split('/').filter(Boolean),
    [location.pathname]
  )
  const [sidebarOpen,         setSidebarOpen]         = useState(false)
  const [activeTab,           setActiveTab]           = useState(() => {
    const urlTab = pathSegments[0]
    if (urlTab && TABS[urlTab]) return urlTab
    const saved = window.localStorage.getItem('dashboard-active-tab')
    return saved && TABS[saved] ? saved : 'genel'
  })
  const [editReportId, setEditReportId] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportViewKey, setReportViewKey] = useState(0)
  const [selectedProjectId,   setSelectedProjectId]   = useState(() => (pathSegments[0] === 'projeler' ? pathSegments[1] || null : null))
  const [selectedProjectName, setSelectedProjectName] = useState('')
  const [showProjectDetail,   setShowProjectDetail]   = useState(() => pathSegments[0] === 'projeler' && !!pathSegments[1])
  const [selectedDate,        setSelectedDate]        = useState(null)
  const [openTicketId,        setOpenTicketId]        = useState(null)
  const [openRequestId,       setOpenRequestId]        = useState(null)
  const [openInvoiceId,       setOpenInvoiceId]        = useState(null)
  const [openSupplierId,      setOpenSupplierId]       = useState(null)
  const [invoiceProjectId,    setInvoiceProjectId]     = useState(null)
  const [initialProjectTab,   setInitialProjectTab]    = useState(() => (pathSegments[0] === 'projeler' ? pathSegments[2] || null : null))
  const [initialReportId,     setInitialReportId]      = useState(null)
  const [initialChangeRequestId, setInitialChangeRequestId] = useState(null)

  // Kısıtlı roller → başlangıç sekmesi (yalnızca gerçek bir GİRİŞ/rol
  // değişiminde — supabase.auth.onAuthStateChange her tetiklendiğinde
  // (ör. rutin token yenileme) AuthContext'teki fetchProfile() yeni bir
  // `navigation` nesnesi üretiyor; bu efekt [role, navigation]'a bağlı
  // olduğundan referans değişince tekrar çalışıp kullanıcıyı o an durduğu
  // sekmeden farkında olmadan role'ün varsayılan sekmesine (ör. proje_yoneticisi/
  // muhasebe/santiye_sefi için 'genel') geri atıyordu — özellikle uzun süren
  // bir formda (proje sihirbazı gibi) arka planda bir token yenilemesi olursa
  // fark ediliyordu (2026-07-30'da bulunan bug). `appliedForRole` ref'i bunu
  // yalnızca role GERÇEKTEN değiştiğinde (ilk yükleme/gerçek rol değişimi)
  // uygulanacak şekilde sınırlıyor.
  const appliedDefaultTabForRole = useRef(null)
  useEffect(() => {
    if (!role || !navigation) return
    if (appliedDefaultTabForRole.current === role) return
    appliedDefaultTabForRole.current = role
    const allowed = navigation.tabs
    const urlTab = pathSegments[0]
    const urlTabValid = urlTab && TABS[urlTab] && (!allowed || allowed.includes(urlTab)) && !(urlTab === 'is-plani' && role !== 'santiye_sefi')
    // Adres çubuğu zaten geçerli/izinli bir sekme gösteriyorsa (bookmark/yenileme)
    // role varsayılanıyla ezme — yalnızca URL boş/geçersiz/izinsizse varsayılana git.
    if (urlTabValid) return
    const defaultTab = navigation.defaultTab || 'genel'
    navigate(`/dashboard/${defaultTab}`, { replace: true })
  }, [role, navigation, navigate, pathSegments])

  // Adres çubuğu tek doğruluk kaynağı — her navigasyonda (geri/ileri tuşları,
  // navigate() çağrıları, doğrudan URL girişi) buradan activeTab/proje
  // detayı state'i yeniden türetilir. handleTabChange/handleSelectProject
  // vb. artık state'i doğrudan set ETMEZ, navigate() çağırır; state güncellemesi
  // bu efekt üzerinden gerçekleşir (React Router'ın push/replace + browser
  // geri/ileri'si aynı koddan geçsin diye tek yol).
  useEffect(() => {
    const [tabSeg, projSeg, projTabSeg] = pathSegments
    const allowed = navigation?.tabs
    const nextTab = tabSeg && TABS[tabSeg] && (!allowed || allowed.includes(tabSeg)) ? tabSeg : null
    if (!nextTab) return
    setActiveTab(nextTab)
    // Bir liste ekranındaki açık detay modalı (talep/ticket/fatura/tedarikçi)
    // da adres çubuğundaki sorgu parametresinden geri yükleniyor — yenileme/
    // geri-ileri/doğrudan URL'de modal açık kalsın diye (bkz. syncEntityParam,
    // TabSatinAlmaTalepListesi/MuhasebeSatinAlma/TicketListesi/FaturaListesi/
    // TedarikciListesi'ndeki onSelect* callback'leri). Proje detayı içindeki
    // Satın Alma/Finans/Tickets alt-sekmeleri de (02.08.2026'da eklendi) aynı
    // state'i (openRequestId vb.) paylaşır — activeTab tek seferde ya 'satin-alma'
    // ya 'projeler' olduğundan çakışma olmaz.
    const params = new URLSearchParams(location.search)
    if (nextTab === 'projeler' && projSeg) {
      setSelectedProjectId(projSeg)
      setShowProjectDetail(true)
      setInitialProjectTab(projTabSeg || null)
      if (projTabSeg === 'satin-alma') setOpenRequestId(params.get('talep') || null)
      if (projTabSeg === 'finans') setOpenInvoiceId(params.get('fatura') || null)
      if (projTabSeg === 'tickets') setOpenTicketId(params.get('ticket') || null)
    } else if (nextTab === 'projeler') {
      setShowProjectDetail(false)
      setInitialProjectTab(null)
    }

    if (nextTab === 'satin-alma') setOpenRequestId(params.get('talep') || null)
    if (nextTab === 'tickets') setOpenTicketId(params.get('ticket') || null)
    if (nextTab === 'finans') setOpenInvoiceId(params.get('fatura') || null)
    if (nextTab === 'odemeler') setOpenSupplierId(params.get('tedarikci') || null)
  }, [location.pathname, location.search, navigation, pathSegments])

  // Bir liste ekranındaki açık detay modalının id'sini adres çubuğuna yazar/siler
  // (replace — her aç/kapa browser history'e yeni girdi eklemesin diye) — yukarıdaki
  // URL-sync efektinin karşılığı, yenilemede modalın geri yüklenebilmesi için.
  function syncEntityParam(paramName, id) {
    const params = new URLSearchParams(location.search)
    if (id) params.set(paramName, id)
    else params.delete(paramName)
    const qs = params.toString()
    navigate(`${location.pathname}${qs ? `?${qs}` : ''}`, { replace: true })
  }

  useEffect(() => {
    window.localStorage.setItem('dashboard-active-tab', activeTab)
  }, [activeTab])

  // URL'den (bookmark/yenileme/geri-ileri) gelen bir proje id'sinin başlık adı
  // henüz bilinmez — handleSelectProject tıklamadan geleni optimistik set eder,
  // bu efekt her durumda gerçek adla teyit/düzeltir.
  useEffect(() => {
    if (!selectedProjectId) return
    supabase.from('projects').select('name').eq('id', selectedProjectId).maybeSingle().then(({ data }) => {
      if (data?.name) setSelectedProjectName(data.name)
    })
  }, [selectedProjectId])

  function handleSelectProject(id, name) {
    setSelectedProjectName(name)
    navigate(`/dashboard/projeler/${id}`)
  }

  // Bildirimler'den bir malzeme miktarı değişikliği bildirimine tıklanınca: ilgili
  // projenin ProjeDetay'ına, doğrudan Malzeme Listesi sekmesiyle açık şekilde git.
  // 04.09.2026'ya kadar burada duruyordu (yalnızca sekmeyi açıyordu, spesifik kaydı
  // değil) — artık değişiklik talebinin id'si de taşınıyor, ProjeTabFaturaKesilecekler
  // bununla bağlı procurement_items satırını bulup kendi geçmiş/detay modalını
  // otomatik açıyor (bkz. initialChangeRequestId/onOpenedChangeRequest). Talep
  // henüz var olmayan bir kaleme "yeni malzeme" ekliyorsa (procurement_item_id
  // null) açılacak bir kayıt yok — bu durumda hâlâ yalnızca sekmeye gidilir, bu
  // kalıcı bir sınırlama (Bekleyen Değişiklikler paneli zaten sayfanın en üstünde).
  // Proje adı bildirimde
  // yok — ProjeDetay zaten kendi projesini RPC'den çekiyor, header'daki kısa süreli
  // başlık için burada ayrıca hızlıca çekilir.
  function goToProjectTab(id, tab, reportId = null, changeRequestId = null) {
    setInitialReportId(reportId)
    setInitialChangeRequestId(changeRequestId)
    navigate(`/dashboard/projeler/${id}/${tab}`)
  }

  function handleTabChange(tab, query = '') {
    const allowed = navigation?.tabs
    if (allowed && !allowed.includes(tab)) return
    if (role === 'santiye_sefi' && tab === 'daily-report') {
      setEditReportId(null)
      setShowReportModal(true)
      return
    }
    // "Projeler" sekmesine geri dönüldüğünde en son bakılan projenin detayında
    // kalınsın diye — hâlâ bir proje detayı açıksa aynı projenin (son alt-sekmesiyle
    // birlikte) URL'sine dönülür, bomboş listeye düşülmez. Listeye dönmenin açık yolu
    // ProjeDetay'ın kendi "← Projelere Dön" butonu (onBack={() => navigate('/dashboard/projeler')}).
    // Öncesinde sidebar'daki
    // HER tıklama (Projeler'in kendisi dahil) showProjectDetail'i sıfırlıyordu,
    // bu yüzden başka bir sekmeye gidip Projeler'e geri dönmek her seferinde
    // proje listesine düşüyordu (2026-07-30'da bulunan bug).
    if (tab === 'projeler' && showProjectDetail && selectedProjectId) {
      navigate(`/dashboard/projeler/${selectedProjectId}${initialProjectTab ? `/${initialProjectTab}` : ''}`)
      return
    }
    navigate(`/dashboard/${tab}${query}`)
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
    handleTabChange('tickets', `?ticket=${ticketId}`)
  }

  // Bildirimler sayfasından bir satın alma talebi bildirimine tıklanınca:
  // Satın Alma sekmesine geç, o talebi doğrudan aç.
  function goToRequest(requestId) {
    handleTabChange('satin-alma', `?talep=${requestId}`)
  }

  // Bildirimler sayfasından bir fatura bildirimine tıklanınca: Finans sekmesine
  // geç, o faturayı doğrudan aç (biliniyorsa proje filtresini de ayarla).
  // santiye_sefi gibi 'finans' sekmesine erişimi olmayan bir talep sahibi bu
  // bildirimi alabiliyor (trg_notify_invoice_status → v_pr_owner) — o rolde
  // handleTabChange('finans') sessizce no-op olurdu, bunun yerine erişebildiği
  // bağlı satın alma talebine yönlendiriyoruz.
  async function goToInvoice(invoiceId, invoiceProjectId = null) {
    if (navigation?.tabs && !navigation.tabs.includes('finans')) {
      const { data } = await supabase.rpc('get_invoice_linked_purchase_request', { p_invoice_id: invoiceId })
      if (data) goToRequest(data)
      return
    }
    setInvoiceProjectId(invoiceProjectId)
    handleTabChange('finans', `?fatura=${invoiceId}`)
  }

  // Bildirimler sayfasından bir günlük rapor bildirimine tıklanınca: rapor
  // sahibi santiye_sefi ise kendi düzenleme modalını aç (mevcut davranış,
  // hatırlatma bildirimleri de bu yoldan geçer); trg_notify_daily_report yalnızca
  // admin'i hedeflediğinden ve admin'in kendi düzenleme modalına erişimi
  // olmadığından (index.jsx'teki showReportModal bloğu role==='santiye_sefi'
  // ile sınırlı), admin için bunun yerine ilgili projenin Raporlar sekmesini
  // açıp raporu orada gösteriyoruz.
  function goToReport(reportId, reportProjectId = null) {
    if (reportProjectId && (!navigation?.tabs || navigation.tabs.includes('projeler'))) {
      goToProjectTab(reportProjectId, 'raporlar', reportId)
      return
    }
    openReportModal(reportId)
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
  // "Bekleyenler" yalnızca muhasebe için anlamlı (bu sekmede yalnızca fatura
  // kesilmeyi bekleyen talepleri görür) — diğer rollerde tam satın alma
  // talebi listesi olduğundan "Satın Alma" gösterilir (bkz. Sidebar.jsx).
  const headerTitle = showingDetail
    ? selectedProjectName
    : (activeTab === 'satin-alma' && role !== 'muhasebe') ? 'Satın Alma' : TABS[activeTab].title

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
            <NotificationBell
              onGoToTicket={goToTicket}
              onOpenReport={goToReport}
              onGoToRequest={goToRequest}
              onGoToInvoice={goToInvoice}
              onGoToMalzemeListesi={(projectId, changeRequestId) => goToProjectTab(projectId, 'malzeme-listesi', null, changeRequestId)}
            />
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
                  {roleLabel || '—'}
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
        {activeTab === 'bildirimler'  && (
          <TabBildirimler
            onGoToTicket={goToTicket}
            onOpenReport={goToReport}
            onGoToRequest={goToRequest}
            onGoToInvoice={goToInvoice}
            onGoToMalzemeListesi={(projectId, changeRequestId) => goToProjectTab(projectId, 'malzeme-listesi', null, changeRequestId)}
          />
        )}
        {/* proje_yoneticisi 2026-07-21'de admin gibi aggregate (scopeProjectId=null → "Tüm
            Projeler") moda geçti — TabGenel/ProjectListView zaten null'ı destekliyor (diğer
            kısıtsız roller de böyle kullanıyor), bu yüzden girişte artık proje seçim ekranı
            YOK. */}
        {activeTab === 'genel'        && role === 'muhasebe' && <MuhasebeGenelOzet onNavigate={handleTabChange} onGoToInvoice={goToInvoice} />}
        {activeTab === 'genel'        && role !== 'santiye_sefi' && role !== 'muhasebe' && <TabGenel scopeProjectId={scopeProjectId} onSelectProject={handleSelectProject} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onTabChange={handleTabChange} />}
        {activeTab === 'projeler'     && !showProjectDetail && <TabProjeler onSelectProject={handleSelectProject} />}
        {activeTab === 'projeler'     && showProjectDetail  && (
          <ProjeDetay
            projectId={selectedProjectId}
            projectName={selectedProjectName}
            onBack={() => navigate('/dashboard/projeler')}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            initialTab={initialProjectTab}
            onTabChange={(tab) => navigate(`/dashboard/projeler/${selectedProjectId}/${tab}`, { replace: true })}
            initialReportId={initialReportId}
            onOpenedReport={() => setInitialReportId(null)}
            initialChangeRequestId={initialChangeRequestId}
            onOpenedChangeRequest={() => setInitialChangeRequestId(null)}
            openRequestId={openRequestId}
            onOpenedRequest={() => setOpenRequestId(null)}
            onSelectedRequestChange={(id) => syncEntityParam('talep', id)}
            openInvoiceId={openInvoiceId}
            onOpenedInvoice={() => setOpenInvoiceId(null)}
            onSelectedInvoiceChange={(id) => syncEntityParam('fatura', id)}
            openTicketId={openTicketId}
            onOpenedTicket={() => setOpenTicketId(null)}
            onSelectedTicketChange={(id) => syncEntityParam('ticket', id)}
          />
        )}
        {activeTab === 'satin-alma'   && role === 'santiye_sefi' && (
          <ProjeTabSatinAlma projectId={projectId} siteChiefView openRequestId={openRequestId} onOpenedRequest={() => setOpenRequestId(null)} onSelectedRequestChange={(id) => syncEntityParam('talep', id)} />
        )}
        {activeTab === 'satin-alma'   && role === 'proje_yoneticisi' && (
          <TabSatinAlma openRequestId={openRequestId} onOpenedRequest={() => setOpenRequestId(null)} onSelectedRequestChange={(id) => syncEntityParam('talep', id)} />
        )}
        {activeTab === 'satin-alma'   && role !== 'santiye_sefi' && role !== 'proje_yoneticisi' && (
          <TabSatinAlma openRequestId={openRequestId} onOpenedRequest={() => setOpenRequestId(null)} onSelectedRequestChange={(id) => syncEntityParam('talep', id)} />
        )}
        {activeTab === 'teklif-pazarlik-siparis' && (isAdmin || role === 'proje_yoneticisi') && (
          <TabTeklifPazarlikSiparis />
        )}
        {activeTab === 'finans'       && (
          <TabFinans
            openInvoiceId={openInvoiceId}
            onOpenedInvoice={() => setOpenInvoiceId(null)}
            onSelectedInvoiceChange={(id) => syncEntityParam('fatura', id)}
            invoiceProjectId={invoiceProjectId}
            onNavigateTop={handleTabChange}
          />
        )}
        {activeTab === 'odemeler'     && (
          <TabOdemeler
            openSupplierId={openSupplierId}
            onOpenedSupplier={() => setOpenSupplierId(null)}
            onSelectedSupplierChange={(id) => syncEntityParam('tedarikci', id)}
          />
        )}
        {activeTab === 'tickets'      && (
          <TabTickets
            selectedDate={selectedDate}
            openTicketId={openTicketId}
            onOpenedTicket={() => setOpenTicketId(null)}
            onSelectedTicketChange={(id) => syncEntityParam('ticket', id)}
          />
        )}
        {activeTab === 'kullanicilar' && (isAdmin || role === 'proje_yoneticisi') && <TabKullanicilar />}
        {activeTab === 'proje-ekle'  && (isAdmin || role === 'proje_yoneticisi') && (
          <TabProjeYonetimi
            onViewProject={(id, name) => {
              setSelectedProjectName(name)
              navigate(`/dashboard/projeler/${id}`)
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
