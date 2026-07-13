import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useWeather } from '../hooks/useWeather'
import { useSantiyeData } from '../hooks/useSantiyeData'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../components/ui/DataStatusBanner'
import RealtimeStatusIndicator from '../components/ui/RealtimeStatusIndicator'
import YeniTicketModal from '../components/tickets/YeniTicketModal'
import YeniTalepModal from '../components/satin-alma/YeniTalepModal'
import TicketDetayModal from '../components/tickets/TicketDetayModal'
import TalepDetayModal from '../components/satin-alma/TalepDetayModal'
import Badge, { TONE, PR_STATUS, PR_URGENCY, TK_STATUS, TK_SEVERITY } from '../components/ui/StatusBadge'
import Pager from '../components/ui/Pager'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

// KPI hover içeriğinde bölüm/personel etiketleri — DailyReportForm.jsx'teki DEPT_LABELS ile aynı sözlük.
const DEPT_LABELS = { idari: 'İdari', mekanik: 'Mekanik', elektrik: 'Elektrik', yevmiyeci: 'Yevmiyeci' }

function DEPT_TITLE(value) {
  const text = String(value || '').replaceAll('_', ' ')
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1)
}

const TURKEY_CITIES = [
  'adana', 'adıyaman', 'afyonkarahisar', 'ağrı', 'amasya', 'ankara', 'antalya', 'artvin',
  'aydın', 'balıkesir', 'bilecik', 'bingöl', 'bitlis', 'bolu', 'burdur', 'bursa',
  'çanakkale', 'çankırı', 'çorum', 'denizli', 'diyarbakır', 'edirne', 'elazığ', 'erzincan',
  'erzurum', 'eskişehir', 'gaziantep', 'giresun', 'gümüşhane', 'hakkari', 'hatay', 'ısparta',
  'mersin', 'istanbul', 'izmir', 'kars', 'kastamonu', 'kayseri', 'kırklareli', 'kırşehir',
  'kocaeli', 'konya', 'kütahya', 'malatya', 'manisa', 'kahramanmaraş', 'mardin', 'muğla',
  'muş', 'nevşehir', 'niğde', 'ordu', 'rize', 'sakarya', 'samsun', 'siirt', 'sinop',
  'sivas', 'tekirdağ', 'tokat', 'trabzon', 'tunceli', 'şanlıurfa', 'uşak', 'van', 'yozgat',
  'zonguldak', 'aksaray', 'bayburt', 'karaman', 'kırıkkale', 'batman', 'şırnak', 'bartın',
  'ardahan', 'ığdır', 'yalova', 'karabük', 'kilis', 'osmaniye', 'düzce',
]

function normalizeTR(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function titleCity(value) {
  if (!value) return null
  return value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1)
}

function extractWeatherCity(project) {
  if (!project) return null

  const candidates = [
    project.weather_city,
    project.city,
    project.province,
    project.il,
    project.location,
    project.name,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const firstPart = String(candidate).split(/[\/,;-]/)[0]?.trim()
    if (firstPart) {
      const exactCity = TURKEY_CITIES.find(city => normalizeTR(city) === normalizeTR(firstPart))
      if (exactCity) return titleCity(exactCity)
    }

    const normalized = normalizeTR(candidate)
    const containedCity = TURKEY_CITIES.find(city => normalized.includes(normalizeTR(city)))
    if (containedCity) return titleCity(containedCity)
  }

  return null
}

// KPI kart satırındaki tekil bilgi kartı — tıklanabilirse buton, değilse div.
function KpiCard({ label, value, tone = 'muted', onClick }) {
  const t = TONE[tone] || TONE.muted
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      style={{
        background: t.bg, border: '1px solid var(--color-border-md)', borderRadius: 12,
        padding: '12px 14px', textAlign: 'left', fontFamily: 'inherit',
        cursor: onClick ? 'pointer' : 'default', minHeight: 76,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 500, color: t.text }}>{value}</span>
    </Tag>
  )
}

const PAGE_SIZE = 5

export default function SantiyeSefiDashboard({ onTabChange, onNewReport, onEditReport }) {
  const { projectId } = useAuth()
  const [talepTab, setTalepTab]   = useState('all')
  const [requestPage, setRequestPage] = useState(0)
  const [reportPage, setReportPage] = useState(0)
  const [showTicket, setShowTicket] = useState(false)
  const [showTalep, setShowTalep]   = useState(false)
  const [detayTicket, setDetayTicket] = useState(null)
  const [detayTalep, setDetayTalep]   = useState(null)
  const [toast, setToast] = useState('')

  const { project, openPurchaseRequests, openTickets, todayReport, recentReports, stats, progressSummary, progressItems, refetch, loading: dataLoading, refreshing, error, authorized, realtimeStatus, realtimeLastUpdated } = useSantiyeData(projectId)
  const weatherCity = extractWeatherCity(project)
  const weather     = useWeather(weatherCity)
  const [machineDetail, setMachineDetail] = useState(null)
  const [personnelDetail, setPersonnelDetail] = useState(null)

  useEffect(() => {
    setReportPage(0)
  }, [projectId])

  // Son rapordaki araç ve personel dökümü — RPC bunu döndürmüyor, KPI hover içeriği için
  // hafif doğrudan sorgularla alınır (proje kuralı: küçük okuma sorguları için RPC şart değil).
  const lastReportId = recentReports[0]?.id
  useEffect(() => {
    if (!lastReportId) { setMachineDetail(null); setPersonnelDetail(null); return }
    let cancelled = false
    Promise.all([
      supabase.from('machinery_logs').select('machine_type, count, status').eq('report_id', lastReportId),
      supabase.from('personnel_log_entries').select('department, count').eq('report_id', lastReportId),
    ]).then(([machRes, persRes]) => {
      if (cancelled) return
      const machRows = machRes.data || []
      setMachineDetail({
        active: machRows.filter(r => r.status === 'çalışıyor').reduce((s, r) => s + (Number(r.count) || 0), 0),
        broken: machRows.filter(r => r.status === 'arızalı').reduce((s, r) => s + (Number(r.count) || 0), 0),
        rows: machRows,
      })
      const byDept = {}
      ;(persRes.data || []).forEach(r => { byDept[r.department] = (byDept[r.department] || 0) + (Number(r.count) || 0) })
      setPersonnelDetail(byDept)
    })
    return () => { cancelled = true }
  }, [lastReportId])

  // İş Planı'ndaki planlı tarihler — "İlerleme Kalemleri"nde geciken/aktif kalemleri öne çıkarmak için.
  // project_tasks.planned_start/end dolu olduğunda devreye girer; boşken sıralama düz % bazlı kalır (bkz. enrichedProgressItems).
  const [projectTasks, setProjectTasks] = useState([])
  useEffect(() => {
    if (!projectId) { setProjectTasks([]); return }
    let cancelled = false
    supabase
      .from('project_tasks')
      .select('id, planned_start, planned_end, status')
      .eq('project_id', projectId)
      .then(({ data }) => { if (!cancelled) setProjectTasks(data || []) })
    return () => { cancelled = true }
  }, [projectId])

  const lastReportDateLabel = recentReports[0]?.report_date
    ? new Date(recentReports[0].report_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const machineTooltip = !lastReportId
    ? 'Henüz rapor girilmedi'
    : !machineDetail
      ? 'Yükleniyor…'
      : [
          lastReportDateLabel ? `Rapor: ${lastReportDateLabel}` : null,
          ...(machineDetail.rows.length
            ? machineDetail.rows.map(r => `${DEPT_TITLE(r.machine_type)}: ${r.count} adet (${r.status})`)
            : ['Araç/makine kaydı yok']),
          machineDetail.broken > 0 ? `⚠ ${machineDetail.broken} araç arızalı` : null,
        ].filter(Boolean).join('\n')

  const personnelTooltip = !lastReportId
    ? 'Henüz rapor girilmedi'
    : !personnelDetail
      ? 'Yükleniyor…'
      : [
          lastReportDateLabel ? `Rapor: ${lastReportDateLabel}` : null,
          ...(Object.keys(personnelDetail).length
            ? Object.entries(personnelDetail).map(([dept, count]) => `${DEPT_LABELS[dept] || DEPT_TITLE(dept)}: ${count} kişi`)
            : ['Personel kaydı yok']),
        ].filter(Boolean).join('\n')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // "İlerleme Kalemleri" — task_id eşleşmesi varsa geciken/bugün-aktif kalemler öne alınır;
  // eşleşme yoksa (backfill uygulanana kadar) düz % sıralamasına düşer, hiçbir kalem kaybolmaz.
  const tasksById = Object.fromEntries(projectTasks.map(t => [t.id, t]))
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const rankedProgressItems = progressItems
    .map(item => {
      const pct = item.target_qty > 0
        ? Math.min(100, Math.round((Number(item.total_progress) / Number(item.target_qty)) * 100))
        : 0
      const task = item.task_id ? tasksById[item.task_id] : null
      let scheduleState = 'none'
      let overdueLabel = null
      if (task) {
        // Gecikme, kalemin kendi miktar yüzdesine değil GÖREVİN durumuna göre belirlenir
        // (vw_project_progress_summary.delayed_tasks ile aynı kural) — aksi halde tamamlanmış
        // bir görevin kalemi, hedef miktara tam ulaşmadığı için (örn. %92) yanlışlıkla "gecikti" görünür.
        const taskDone = task.status === 'tamamlandi' || task.status === 'iptal'
        const start = task.planned_start ? new Date(task.planned_start) : null
        const end = task.planned_end ? new Date(task.planned_end) : null
        if (!taskDone && end && end < todayMidnight) {
          scheduleState = 'overdue'
          overdueLabel = end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
        } else if (!taskDone && start && end && start <= todayMidnight && todayMidnight <= end) {
          scheduleState = 'active'
        }
      }
      return { item, pct, scheduleState, overdueLabel }
    })
    // Sadece geciken veya o gün planlı olarak devam eden kalemler gösterilir —
    // henüz başlamamış/plan dışı ("none") kalemlerle 6'ya tamamlanmaz, boş bırakılır.
    .filter(x => x.scheduleState !== 'none')
    .sort((a, b) => {
      const rank = s => (s === 'overdue' ? 0 : s === 'active' ? 1 : 2)
      const rankDiff = rank(a.scheduleState) - rank(b.scheduleState)
      return rankDiff !== 0 ? rankDiff : a.pct - b.pct
    })
    .slice(0, 6)

  const requestItems = [
    ...openPurchaseRequests.map(item => ({ ...item, _type: 'purchase' })),
    ...openTickets.map(item => ({ ...item, _type: 'ticket' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const visibleRequests = requestItems.filter(item => {
    if (talepTab === 'satin_alma') return item._type === 'purchase'
    if (talepTab === 'ticket') return item._type === 'ticket'
    return true
  })
  // Canlı güncelleme liste boyutunu küçültürse (örn. bir talep kapanınca) sayfa aralık dışı kalmasın.
  const requestTotalPages = Math.max(1, Math.ceil(visibleRequests.length / PAGE_SIZE))
  const safeRequestPage = Math.min(requestPage, requestTotalPages - 1)
  const reportTotalPages = Math.max(1, Math.ceil(recentReports.length / PAGE_SIZE))
  const safeReportPage = Math.min(reportPage, reportTotalPages - 1)

  function goRequests(tab = 'all') {
    setTalepTab(tab)
    setRequestPage(0)
    document.getElementById('taleplerim')?.scrollIntoView({ behavior: 'smooth' })
  }

  function openTodayReport() {
    todayReport ? onEditReport?.(todayReport.id) : onNewReport?.()
  }

  if (projectId && !dataLoading && !authorized) {
    return <UnauthorizedScopeNotice />
  }

  return (
    <div style={{ minHeight: '100%' }}>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <RealtimeStatusIndicator status={realtimeStatus} lastUpdated={realtimeLastUpdated} />
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: 'var(--color-success-bg)', color: 'var(--color-success-text)', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: 'var(--shadow-card)',
        }}>
          {toast}
        </div>
      )}

      {/* Proje bilgi şeridi — atanmış proje sabit, değiştirilemez */}
      <div className="ss-project-bar">
        <span title="Proje sabit atanmış">🔒</span>
        <span className="ss-project-bar-name">{project?.name || projectId || 'Proje'}</span>
        {(project?.location || weatherCity) && (
          <>
            <span className="ss-project-bar-sep">·</span>
            <span className="ss-project-bar-loc">{project?.location || weatherCity}</span>
          </>
        )}
        <span className="ss-project-bar-sep">·</span>
        <span className="ss-project-bar-date">
          {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* KPI Cards — 1.Bugünkü rapor 2.Açık talep 3.Açık ticket 4.Son rapor işçi 5.Son rapor araç 6.Hava */}
      <div className="ss-kpi-grid-6" style={{ marginBottom: 16 }}>
        <KpiCard
          label="Bugünkü Rapor"
          value={todayReport ? 'Girildi' : 'Bekliyor'}
          tone={todayReport ? 'success' : 'warning'}
          onClick={openTodayReport}
        />
        <KpiCard
          label="Açık Satın Alma Talebi"
          value={stats.prCount}
          tone="primary"
          onClick={() => goRequests('satin_alma')}
        />
        <KpiCard
          label="Açık Ticket"
          value={stats.ticketCount}
          tone="primary"
          onClick={() => goRequests('ticket')}
        />
        <div className="kpi-hover" data-tooltip={personnelTooltip} style={{ position: 'relative' }}>
          <KpiCard
            label="Son Rapor İşçi Sayısı"
            value={recentReports[0]?.worker_count ?? '—'}
            tone="muted"
          />
        </div>
        <div className="kpi-hover" data-tooltip={machineTooltip} style={{ position: 'relative' }}>
          <KpiCard
            label="Son Rapor Aktif Araç"
            value={machineDetail?.active ?? '—'}
            tone="muted"
          />
        </div>

        {/* Hava Durumu */}
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12,
          padding: '12px 14px', minHeight: 76, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: 'var(--color-muted)', fontWeight: 500 }}>
            Hava{weatherCity ? ` — ${weatherCity}` : ''}
          </span>
          {!weatherCity ? (
            <p style={{ fontSize: 12, color: 'var(--color-muted-light)', margin: 0 }}>{dataLoading ? 'Yükleniyor…' : 'Konum tanımsız'}</p>
          ) : weather.loading || !weather.current ? (
            <p style={{ fontSize: 12, color: 'var(--color-muted-light)', margin: 0 }}>Yükleniyor…</p>
          ) : weather.error ? (
            <p style={{ fontSize: 12, color: 'var(--color-muted-light)', margin: 0 }}>Alınamadı</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{weather.current.emoji}</span>
              <span style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-text)' }}>{weather.current.temp}°C</span>
            </div>
          )}
        </div>
      </div>

      {/* Aksiyon alanı — 3 buton yan yana, mobilde alt alta sarar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <button onClick={openTodayReport} style={{ ...BTN_ACTION_PRIMARY, width: 'auto', flex: '1 1 200px' }}>
          📋 {todayReport ? 'Günlük Raporu Görüntüle' : 'Günlük Rapor Gir'}
        </button>
        <button onClick={() => setShowTalep(true)} style={{ ...BTN_ACTION_OUTLINE, width: 'auto', flex: '1 1 200px' }}>🛒 Satın Alma Talebi</button>
        <button onClick={() => setShowTicket(true)} style={{ ...BTN_ACTION_OUTLINE, width: 'auto', flex: '1 1 200px' }}>🎫 Ticket Aç</button>
      </div>

      {/* Proje İlerlemesi — tek net genel ilerleme çubuğu (plan işaretli) + kalemler yatay bar listesi olarak,
          eski donut grid + ayrı varyans rozeti karmaşası kaldırıldı (kullanıcı geri bildirimi: "anlaşılır değil"). */}
      {(progressSummary || progressItems.length > 0) && (
        <div style={{ ...CARD_BASE, padding: 0, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: progressItems.length > 0 ? '1px solid var(--color-border)' : 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', display: 'block', marginBottom: 10 }}>Proje İlerlemesi</span>

            {progressSummary && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }}>%{progressSummary.actual_progress_pct}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>tamamlandı</span>
                </div>

                <div style={{ position: 'relative', height: 12, background: 'var(--color-border)', borderRadius: 6, marginBottom: 4 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 6,
                    background: 'var(--color-primary)', width: `${progressSummary.actual_progress_pct || 0}%`, transition: 'width .4s',
                  }} />
                  {progressSummary.planned_progress_pct > 0 && (
                    <div
                      title={`Planlanan ilerleme: %${progressSummary.planned_progress_pct}`}
                      style={{
                        position: 'absolute', top: -3, bottom: -3, width: 3, borderRadius: 2,
                        background: 'var(--color-text)', left: `${progressSummary.planned_progress_pct}%`, transform: 'translateX(-50%)',
                      }}
                    />
                  )}
                </div>
                {progressSummary.planned_progress_pct > 0 && (
                  <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--color-muted-light)' }}>
                    ▍ işareti planlanan ilerlemeyi gösterir (%{progressSummary.planned_progress_pct})
                  </p>
                )}

                {progressSummary.progress_variance != null && (
                  <p style={{
                    margin: '0 0 10px', fontSize: 12, fontWeight: 600,
                    color: Number(progressSummary.progress_variance) >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {Number(progressSummary.progress_variance) >= 0
                      ? `Plana göre ${progressSummary.progress_variance} puan önde`
                      : `Plana göre ${Math.abs(progressSummary.progress_variance)} puan geride`}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    <strong style={{ color: 'var(--color-text-sub)' }}>{progressSummary.completed_tasks}</strong>/{progressSummary.total_tasks} görev tamamlandı
                  </span>
                  {progressSummary.delayed_tasks > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--color-danger)', fontWeight: 600 }}>
                      ⚠ {progressSummary.delayed_tasks} geciken görev
                    </span>
                  )}
                  {progressSummary.days_remaining != null && (
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      <strong style={{ color: 'var(--color-text-sub)' }}>{progressSummary.days_remaining}</strong> gün kaldı
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {progressItems.length > 0 && (
            <div style={{ padding: '12px 18px 16px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: 'var(--color-muted-light)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                İlerleme Kalemleri · geciken ve bugün aktif olanlar
              </p>
              {rankedProgressItems.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-muted-light)' }}>
                  Bugün için planlı olarak devam eden veya geciken kalem yok.
                </p>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rankedProgressItems.map(({ item, pct, scheduleState, overdueLabel }) => {
                    const tone = scheduleState === 'overdue'
                      ? 'var(--color-danger)'
                      : pct >= 70 ? 'var(--color-success)' : pct >= 35 ? 'var(--color-primary)' : 'var(--color-danger)'
                    return (
                      <div key={item.id} className="pi-item-row" style={{
                        padding: '9px 10px', background: 'var(--color-surface)',
                        border: scheduleState === 'overdue' ? '1px solid var(--color-danger)' : '1px solid var(--color-border)',
                        borderRadius: 8,
                      }}>
                        <div className="pi-item-name-col">
                          <span title={item.name} style={{
                            display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--color-muted-light)', whiteSpace: 'nowrap' }}>
                            {Number(item.total_progress).toLocaleString('tr-TR')}/{Number(item.target_qty).toLocaleString('tr-TR')} {item.unit}
                          </span>
                        </div>
                        <div className="pi-item-bar-col">
                          <div style={{ flex: 1, position: 'relative', height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden', minWidth: 40 }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4, background: tone, width: `${pct}%`, transition: 'width .4s' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: tone, width: 34, textAlign: 'right', flexShrink: 0 }}>%{pct}</span>
                          {scheduleState === 'overdue' && (
                            <span title={`${overdueLabel} bitmeliydi`} style={{ fontSize: 13, flexShrink: 0 }}>⚠</span>
                          )}
                          {scheduleState === 'active' && (
                            <span title="Bugün aktif" style={{ fontSize: 10, color: 'var(--color-primary)', flexShrink: 0 }}>●</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Taleplerim */}
      <div id="taleplerim" style={{
        ...CARD_BASE, padding: 0, marginBottom: 16, overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>Taleplerim</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowTalep(true)} style={BTN_SM_OUTLINE}>+ Satın Alma</button>
            <button onClick={() => setShowTicket(true)} style={BTN_SM_OUTLINE}>+ Ticket</button>
          </div>
        </div>

        {/* Sekme seçici */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', padding: '0 18px' }}>
          {[
            { key: 'all', label: `Tümü (${requestItems.length})` },
            { key: 'satin_alma', label: `Satın Alma (${openPurchaseRequests.length})` },
            { key: 'ticket',     label: `Ticketlar (${openTickets.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setTalepTab(tab.key); setRequestPage(0) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 600, padding: '10px 16px', whiteSpace: 'nowrap',
                color: talepTab === tab.key ? 'var(--color-primary)' : 'var(--color-muted-light)',
                borderBottom: talepTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.1s, border-color 0.1s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {visibleRequests.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 13, padding: '16px 0', margin: 0 }}>
              Açık talep bulunmuyor.
            </p>
          ) : (
            <div>
              <div style={{ minHeight: PAGE_SIZE * 53 }}>
              {visibleRequests.slice(safeRequestPage * PAGE_SIZE, safeRequestPage * PAGE_SIZE + PAGE_SIZE).map(item => {
                const isPurchase = item._type === 'purchase'
                return (
                  <button
                    key={`${item._type}-${item.id}`}
                    onClick={() => isPurchase ? setDetayTalep(item) : setDetayTicket(item)}
                    className="ss-list-row"
                    style={{ width: '100%', border: 'none', background: 'none', borderBottom: '1px solid var(--color-border)', fontFamily: 'inherit' }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{isPurchase ? '🛒' : '🎫'}</span>
                    <span className="ss-list-title">
                      {item.title || item.description || 'Başlıksız talep'}
                    </span>
                    <span className="ss-list-badges">
                      {isPurchase ? (
                        <>
                          <Badge map={PR_URGENCY} value={item.urgency} />
                          <Badge map={PR_STATUS} value={item.status} />
                        </>
                      ) : (
                        <>
                          <Badge map={TK_SEVERITY} value={item.severity} />
                          <Badge map={TK_STATUS} value={item.status} />
                        </>
                      )}
                    </span>
                    <span className="ss-list-date">{fmtDate(item.created_at)}</span>
                  </button>
                )
              })}
              </div>
              <Pager
                page={safeRequestPage}
                totalPages={requestTotalPages}
                onChange={setRequestPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Son Raporlar */}
      <div style={{
        ...CARD_BASE, padding: 0, marginBottom: 16, overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', display: 'block' }}>Son Raporlar</span>
            <span style={{ fontSize: 12, color: 'var(--color-muted-light)' }}>En son girilen günlük saha raporları</span>
          </div>
          <button onClick={() => onTabChange?.('rapor-listesi')} style={BTN_SM_OUTLINE}>Tümünü Gör</button>
        </div>

        <div style={{ padding: 16 }}>
          {recentReports.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 13, padding: '16px 0', margin: 0 }}>
              Henüz günlük rapor girilmedi.
            </p>
          ) : (
            <div>
              <div style={{ minHeight: PAGE_SIZE * 53 }}>
              {recentReports.slice(safeReportPage * PAGE_SIZE, safeReportPage * PAGE_SIZE + PAGE_SIZE).map(report => (
                <button
                  key={report.id}
                  onClick={() => onEditReport?.(report.id)}
                  className="ss-list-row"
                  style={{ width: '100%', border: 'none', background: 'none', borderBottom: '1px solid var(--color-border)', fontFamily: 'inherit' }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
                  <span className="ss-list-title">
                    {report.report_date ? new Date(report.report_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tarihsiz rapor'}
                    {' · '}{report.weather || 'Hava yok'} · {report.worker_count || 0} personel
                  </span>
                  <span className="ss-list-badges">
                    <Badge map={{}} value={report.general_status} />
                  </span>
                </button>
              ))}
              </div>
              <Pager
                page={safeReportPage}
                totalPages={reportTotalPages}
                onChange={setReportPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modaller */}
      {showTicket && (
        <YeniTicketModal
          defaultProject={project ? { ...project, location: project.location || weatherCity } : undefined}
          onClose={() => setShowTicket(false)}
          onSaved={() => { setShowTicket(false); refetch(); showToast('Ticket oluşturuldu ✓') }}
        />
      )}
      {showTalep && (
        <YeniTalepModal
          defaultProjectId={projectId}
          onClose={() => setShowTalep(false)}
          onSaved={() => { setShowTalep(false); refetch(); showToast('Satın alma talebi oluşturuldu ✓') }}
        />
      )}
      {detayTicket && (
        <TicketDetayModal
          ticket={detayTicket}
          onClose={() => { setDetayTicket(null); refetch() }}
          onUpdated={() => { setDetayTicket(null); refetch() }}
        />
      )}
      {detayTalep && (
        <TalepDetayModal
          request={detayTalep}
          onClose={() => { setDetayTalep(null); refetch() }}
        />
      )}
    </div>
  )
}

const CARD_BASE = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 14,
  padding: '14px 16px', boxShadow: 'var(--shadow-card)',
}
const BTN_ACTION_PRIMARY = {
  background: 'var(--color-primary)', color: 'var(--color-surface)', border: 'none', borderRadius: 10,
  padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  width: '100%', minHeight: 44,
}
const BTN_ACTION_OUTLINE = {
  background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border-md)', borderRadius: 10,
  padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  width: '100%', minHeight: 44,
}
const BTN_SM_OUTLINE = {
  background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border-md)', borderRadius: 6,
  padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}
