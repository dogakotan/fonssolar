import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWeather } from '../../../hooks/useWeather'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { normalizeStatus, statusLabel } from '../../../utils/satinAlma'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'

const TYPE_LABEL = {
  arazi_ges: 'Arazi GES',
  cati_ges: 'Çatı GES',
  depolamali_ges: 'Depolamalı GES',
}

const TASK_CATEGORY_LABEL = {
  mobilizasyon:   'Mobilizasyon',
  mekanik:        'Mekanik',
  elektrik_dc:    'Elektrik DC',
  elektrik_ac:    'Elektrik AC',
  elektrik_og:    'Elektrik OG',
  topraklama:     'Topraklama',
  enh:            'ENH',
  devreye_alma:   'Devreye Alma',
  evrak_sureci:   'Evrak Süreci',
  satin_alma:     'Satın Alma',
  kolon_montaji:  'Kolon Montajı',
  kiris_montaji:  'Kiriş Montajı',
  asik_montaji:   'Aşık Montajı',
  panel_montaji:  'Panel Montajı',
  kosk_trafo:     'Köşk Trafo',
}

const STATUS_LABEL = {
  aktif: 'Aktif',
  tamamlandi: 'Tamamlandı',
  beklemede: 'Beklemede',
  askida: 'Askıda',
  gecikti: 'Gecikti',
}

const RISK_BADGE = {
  kritik: 'red',
  yüksek: 'amber',
  yuksek: 'amber',
  orta: 'amber',
  düşük: 'blue',
  dusuk: 'blue',
}

const RISK_CATEGORY_LABEL = {
  is_kalemi: 'İş Kalemi',
  satin_alma: 'Satın Alma',
  diger: 'Diğer',
}

const RISK_RULE_LABEL = {
  gorev_gecikmesi: 'Görev Gecikmesi',
  malzeme_fazla_talep: 'Malzeme Fazla Talebi',
}

const PURCHASE_STATUS_BADGE = {
  bekliyor: 'blue',
  onaylandi: 'amber',
  red_edildi: 'red',
  satin_alindi: 'green',
  fatura_bekliyor: 'gray',
  fatura_onay_bekliyor: 'amber',
  faturasi_kesildi: 'green',
  iptal: 'red',
}

const WEATHER_META = {
  'açık': { label: 'Açık', emoji: '☀️' },
  acik: { label: 'Açık', emoji: '☀️' },
  'parçalı bulutlu': { label: 'Parçalı Bulutlu', emoji: '🌤️' },
  'parcali bulutlu': { label: 'Parçalı Bulutlu', emoji: '🌤️' },
  bulutlu: { label: 'Bulutlu', emoji: '☁️' },
  'yağmurlu': { label: 'Yağmurlu', emoji: '🌧️' },
  yagmurlu: { label: 'Yağmurlu', emoji: '🌧️' },
  'karlı': { label: 'Karlı', emoji: '❄️' },
  karli: { label: 'Karlı', emoji: '❄️' },
  'fırtınalı': { label: 'Fırtınalı', emoji: '⛈️' },
  firtinali: { label: 'Fırtınalı', emoji: '⛈️' },
}

function clamp(n, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(n || 0)))
}

function fmtDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMoney(value) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })
}

function fmtNumber(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—'
  return `${Number(value).toLocaleString('tr-TR')}${suffix}`
}

function normalizeWeatherKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
}

function getWeatherMeta(value) {
  const direct = String(value || '').trim().toLocaleLowerCase('tr-TR')
  return WEATHER_META[direct] || WEATHER_META[normalizeWeatherKey(value)] || { label: value || 'Kayıt yok', emoji: '🌡️' }
}

function getRange(dateText, period) {
  const base = new Date(`${dateText}T00:00:00`)
  if (period === 'weekly') {
    const day = base.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = new Date(base)
    start.setDate(base.getDate() + diff)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }
  if (period === 'monthly') {
    const start = new Date(base.getFullYear(), base.getMonth(), 1)
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }
  return { start: dateText, end: dateText }
}

function calcPlannedAt(tasks, dateText) {
  const date = new Date(`${dateText}T00:00:00`)
  const dated = tasks.filter(t => t.start_date && t.due_date)
  if (!dated.length) return 0

  const total = dated.reduce((sum, task) => {
    const start = new Date(task.start_date)
    const end = new Date(task.due_date)
    if (date <= start) return sum
    if (date >= end) return sum + 100
    const span = Math.max(1, end - start)
    return sum + clamp(((date - start) / span) * 100)
  }, 0)

  return Math.round(total / dated.length)
}

function buildScurve(tasks, startDateText, endDateText, actualPct) {
  if (!startDateText || !endDateText || !tasks.length) return []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(`${startDateText}T00:00:00`)
  const end   = new Date(`${endDateText}T00:00:00`)
  const data = []
  let cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    const dateText = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`
    data.push({
      label: cur.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }),
      planned: calcPlannedAt(tasks, dateText),
      actual: cur <= today ? Math.round(actualPct) : null,
    })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return data
}

const SEV_BORDER = {
  kritik: '#ef4444',
  yüksek: '#f59e0b',
  yuksek: '#f59e0b',
  orta: '#94a3b8',
  düşük: '#3b82f6',
  dusuk: '#3b82f6',
}

function Ring({ value }) {
  const pct = clamp(value)
  return (
    <div className="project-ring" style={{ '--pct': pct }}>
      <span>{Math.round(pct)}%</span>
    </div>
  )
}

function MiniProgress({ value, color = '#185FA5' }) {
  const pct = clamp(value)
  return (
    <div className="project-mini-progress">
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function DetailRow({ label, value, tone }) {
  return (
    <div className="project-detail-row">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : ''}>{value || '—'}</strong>
    </div>
  )
}

function SummaryLine({ icon, label, value }) {
  return (
    <div className="project-summary-line">
      <span className="project-summary-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function LinkButton({ children, onClick }) {
  return (
    <button type="button" className="project-card-link" onClick={onClick}>
      {children} →
    </button>
  )
}

function getStatusBadge(status) {
  return PURCHASE_STATUS_BADGE[normalizeStatus(status)] || 'gray'
}

function normalizeRisk(risk) {
  const title = risk.risk_title || risk.title || risk.subject || risk.description || 'Risk kaydı'
  const severity = (risk.severity || risk.priority || risk.risk_level || 'orta').toLowerCase()
  const date = risk.due_date || risk.target_date || risk.created_at
  return { title, severity, date }
}

function normalizePurchase(pr) {
  return {
    material: pr.material_name || pr.title || pr.request_no || pr.description || 'Malzeme talebi',
    status: pr.status,
    statusLabel: statusLabel(pr.status),
    delivery: pr.delivery_date || pr.required_date || pr.created_at,
  }
}

function ProjectWeatherCard({ location, lostDays, reportWeather }) {
  const city = location ? location.split('/')[0].split(',')[0].trim() : ''
  const weather = useWeather(city || null)
  const storedWeather = reportWeather?.weather ? getWeatherMeta(reportWeather.weather) : null

  const current = weather.current
  const tomorrow = weather.tomorrow

  return (
    <div className="stat-card" style={{ borderTop: '3px solid #0ea5e9' }}>
      <p className="stat-label">🌤 Hava Durumu{city ? ` — ${city}` : ''}</p>

      {weather.loading ? (
        <p className="stat-value" style={{ fontSize: '1.5rem' }}>…</p>
      ) : !city ? (
        <p className="stat-note">Konum girilmemiş</p>
      ) : !current ? (
        storedWeather ? (
          <>
            <p className="stat-value" style={{ fontSize: '1.85rem' }}>{storedWeather.emoji} {storedWeather.label}</p>
            <p className="stat-note">Rapor verisi</p>
          </>
        ) : (
          <p className="stat-note">Veri alınamadı</p>
        )
      ) : (
        <>
          <p className="stat-value" style={{ fontSize: '1.85rem' }}>
            {current.emoji} {current.temp}°
          </p>
          <p className="stat-note">{current.label}</p>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--color-muted)' }}>Rüzgar</span>
              <strong>{current.wind} km/h</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
              <span style={{ color: 'var(--color-muted)' }}>Nem</span>
              <strong>%{current.humidity}</strong>
            </div>
            {tomorrow && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                <span style={{ color: 'var(--color-muted)' }}>Yarın</span>
                <strong>{tomorrow.emoji} {tomorrow.max}°/{tomorrow.min}°</strong>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: 'var(--color-muted)' }}>Kayıp Gün (hava)</span>
        <strong style={{ color: lostDays > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>{lostDays} gün</strong>
      </div>
    </div>
  )
}

export default function ProjectOverviewDashboard({
  project,
  projectId,
  tasks = [],
  filterDate,
  reportPeriod,
  onGoTab,
  progressSummary: progressSummaryProp,
}) {
  const [projectDetails, setProjectDetails] = useState(null)
  const [report, setReport]             = useState(null)   // seçili tarihe en yakın rapor
  const [personnel, setPersonnel]       = useState([])
  const [machinery, setMachinery]       = useState([])
  const [progressItems, setProgressItems] = useState([])
  const [overallProgressPct, setOverallProgressPct] = useState(null)
  const [categoryWeights, setCategoryWeights] = useState([])
  const [risks, setRisks]               = useState([])
  const [tickets, setTickets]           = useState([])
  const [purchases, setPurchases]       = useState([])
  const [budgetLines, setBudgetLines]   = useState([])
  const [invoices, setInvoices]         = useState([])
  const [lostDays, setLostDays]         = useState(0)
  const [sitePhotos, setSitePhotos]     = useState([])
  const [sitePhotoReport, setSitePhotoReport] = useState(null)
  const [sitePhotosLoading, setSitePhotosLoading] = useState(false)
  const [photoLightbox, setPhotoLightbox] = useState(null)

  // Haftalık → o haftanın son günü, Aylık → o ayın son günü, Günlük → filterDate
  const effectiveDate = useMemo(() => {
    const base = new Date(`${filterDate}T00:00:00`)
    if (reportPeriod === 'weekly') {
      const day = base.getDay()
      const end = new Date(base)
      end.setDate(base.getDate() + (day === 0 ? 0 : 7 - day))
      return end.toISOString().slice(0, 10)
    }
    if (reportPeriod === 'monthly') {
      const end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
      return end.toISOString().slice(0, 10)
    }
    return filterDate
  }, [filterDate, reportPeriod])

  const { data: byDateData, loading, refreshing, error, refetch } = useDashboardData(
    'get_project_by_date',
    { p_project_id: projectId, p_date: effectiveDate },
    { enabled: !!projectId }
  )
  const authorized = byDateData?.authorized ?? true
  useRealtimeRefresh(
    ['daily_reports', { table: 'progress_daily', filterColumn: null }, 'project_tasks', 'tickets', 'purchase_requests', 'invoices'],
    refetch,
    { enabled: !!projectId, filter: projectId ? { column: 'project_id', value: projectId } : undefined }
  )

  useEffect(() => {
    if (!byDateData || byDateData.authorized === false) return
    setProjectDetails(byDateData.project || null)
    setReport(byDateData.report || null)
    setPersonnel(byDateData.personnel || [])
    setMachinery(byDateData.machinery || [])
    setProgressItems(byDateData.progress_items || [])
    setOverallProgressPct(byDateData.overall_pct ?? null)
    setCategoryWeights(byDateData.category_weights || [])
    setRisks(byDateData.risks || [])
    setTickets(byDateData.tickets || [])
    setPurchases(byDateData.purchases || [])
    setBudgetLines(byDateData.budget_lines || [])
    setInvoices(byDateData.invoices || [])
    setLostDays(Number(byDateData.weather_lost_days || 0))
  }, [byDateData])

  useEffect(() => {
    if (!projectId || !filterDate) return
    let alive = true
    setSitePhotosLoading(true)

    async function loadSitePhotos() {
      const { data: dailyReport } = await supabase
        .from('daily_reports')
        .select('id, report_date')
        .eq('project_id', projectId)
        .eq('report_date', filterDate)
        .maybeSingle()

      if (!alive) return
      setSitePhotoReport(dailyReport || null)

      if (!dailyReport?.id) {
        setSitePhotos([])
        setSitePhotosLoading(false)
        return
      }

      const { data: photos } = await supabase
        .from('daily_report_photos')
        .select('id, storage_path, caption, created_at, uploaded_by')
        .eq('project_id', projectId)
        .eq('report_date', filterDate)
        .order('created_at', { ascending: false })

      if (!alive) return
      setSitePhotos(photos || [])
      setSitePhotosLoading(false)
    }

    loadSitePhotos().catch(err => {
      console.error('daily_report_photos load error:', err)
      if (alive) {
        setSitePhotos([])
        setSitePhotosLoading(false)
      }
    })

    return () => { alive = false }
  }, [projectId, filterDate])

  const currentProject  = projectDetails || project
  const taskProgressRows = tasks.map(task => {
    const pct = clamp(task.progress_pct ?? task.progress ?? 0)
    return {
      id:   task.id,
      name: task.name || task.task_name || task.title || 'İş kalemi',
      pct,  progress: pct, progress_pct: pct,
      start_date: task.planned_start || task.start_date,
      due_date:   task.planned_end   || task.due_date,
    }
  })

  const avgReportProgress = overallProgressPct !== null
    ? Math.round(Number(overallProgressPct))
    : currentProject?.progress != null
      ? Math.round(Number(currentProject.progress))
      : taskProgressRows.length
        ? Math.round(taskProgressRows.reduce((s, t) => s + t.pct, 0) / taskProgressRows.length)
        : Math.round(Number(progressSummaryProp?.actual_progress_pct ?? 0))

  const plannedPct     = calcPlannedAt(tasks, effectiveDate)
  const totalBudget    = budgetLines.reduce((s, b) => s + Number(b.planned_amount || 0), 0)
  const spent          = invoices
    .filter(i => ['onaylandı','onaylandi','ödendi','odendi','paid','approved'].includes((i.status||'').toLowerCase()))
    .reduce((s, i) => s + Number(i.total_amount || i.amount || 0), 0)
  const budgetPct      = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0
  const target         = currentProject?.target_date ? new Date(`${currentProject.target_date}T00:00:00`) : null
  const selected       = new Date(`${effectiveDate}T00:00:00`)
  const remainingDays  = target ? Math.ceil((target - selected) / 86400000) : null

  const totalPersonnel = personnel.reduce((s, p) => s + Number(p.count || 0), 0) || Number(report?.worker_count || 0)
  const activeMachines = machinery
    .filter(m => ['çalışıyor','calisiyor','aktif'].includes((m.status||'').toLowerCase()))
    .reduce((s, m) => s + Number(m.count || 0), 0)

  const purchaseRows  = purchases.map(normalizePurchase)
  const top5Budget = [...budgetLines]
    .sort((a, b) => Number(b.planned_amount || 0) - Number(a.planned_amount || 0))
    .slice(0, 5)
  const sCurveData = buildScurve(taskProgressRows, currentProject?.start_date, currentProject?.target_date, avgReportProgress)
  const categoryChartData = categoryWeights.map(cw => ({
    label: TASK_CATEGORY_LABEL[cw.category] || cw.category,
    progress: Math.round(Number(cw.avg_progress || 0)),
    weight: Number(cw.weight_pct || 0),
  }))
  const openRisks = risks.filter(r => r.source === 'otomatik')
  const todayLabel = new Date().toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })
  const sitePhotoUrl = path => supabase.storage.from('saha-fotolari').getPublicUrl(path).data.publicUrl

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
        <div className="spin" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTop: '3px solid #003B8E', borderRadius: '50%' }} />
        <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: 0 }}>Proje verisi yükleniyor…</p>
      </div>
    )
  }

  if (projectId && !authorized) {
    return <UnauthorizedScopeNotice />
  }

  return (
    <div className="project-overview">
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <div className="project-top-grid">
        <div className="card project-overview-card project-detail-card">
          <div className="project-card-title"><h3>Proje Detayları</h3></div>
          <div className="project-detail-columns">
            <div>
              <DetailRow label="Proje Adı" value={currentProject?.name} />
              <DetailRow label="Proje Türü" value={TYPE_LABEL[currentProject?.project_type] || currentProject?.project_type || 'Arazi GES'} tone="primary" />
              <DetailRow label="Durumu" value={STATUS_LABEL[currentProject?.status] || currentProject?.status || '—'} tone="success" />
              <DetailRow label="Konumu" value={currentProject?.location} />
              <DetailRow label="Başlangıç" value={fmtDate(currentProject?.start_date)} />
              <DetailRow label="Bitiş" value={fmtDate(currentProject?.target_date)} />
            </div>
            <div>
              <DetailRow label="DC Güç" value={fmtNumber(currentProject?.capacity_kwp, ' kWp')} />
              <DetailRow label="AC Güç" value={fmtNumber(currentProject?.capacity_kwe, ' kWe')} />
              <DetailRow label="Depolama" value={fmtNumber(currentProject?.storage_kwh, ' kWh')} />
              <DetailRow label="Panel Sayısı" value={fmtNumber(currentProject?.panel_count, ' adet')} />
              <DetailRow label="İnverter Sayısı" value={fmtNumber(currentProject?.inverter_count, ' adet')} />
              <DetailRow label="Batarya Sayısı" value={fmtNumber(currentProject?.battery_count, ' adet')} />
            </div>
          </div>
        </div>

        <div className="card project-overview-card project-progress-card">
          <div className="project-card-title"><h3>Genel İlerleme</h3></div>
          <Ring value={avgReportProgress} />
          <p>Kategori-ağırlıklı proje ilerlemesi</p>
        </div>

        <div className="card project-overview-card">
          <div className="project-card-title">
            <h3>{reportPeriod === 'weekly' ? 'Haftalık Özet' : reportPeriod === 'monthly' ? 'Aylık Özet' : 'Günlük Özet'}</h3>
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              {reportPeriod === 'weekly' ? `Hafta sonu: ${effectiveDate}` : reportPeriod === 'monthly' ? `Ay sonu: ${effectiveDate}` : effectiveDate}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {(() => {
              const delayColor = remainingDays === null ? '#64748b' : remainingDays > 30 ? '#16a34a' : remainingDays >= 0 ? '#f59e0b' : '#ef4444'
              const pendingPurchases = purchases.filter(p => normalizeStatus(p.status) === 'bekliyor').length

              const remainingRow = {
                label: reportPeriod === 'weekly' ? 'Kalan Hafta' : reportPeriod === 'monthly' ? 'Kalan Ay' : 'Kalan Gün',
                value: remainingDays === null ? '—'
                  : remainingDays < 0
                    ? `${reportPeriod === 'weekly' ? Math.ceil(Math.abs(remainingDays) / 7) : reportPeriod === 'monthly' ? Math.ceil(Math.abs(remainingDays) / 30) : Math.abs(remainingDays)} ${reportPeriod === 'weekly' ? 'hafta' : reportPeriod === 'monthly' ? 'ay' : 'gün'} gecikti`
                    : `${reportPeriod === 'weekly' ? Math.ceil(remainingDays / 7) : reportPeriod === 'monthly' ? Math.ceil(remainingDays / 30) : remainingDays} ${reportPeriod === 'weekly' ? 'hafta' : reportPeriod === 'monthly' ? 'ay' : 'gün'}`,
                color: delayColor,
              }

              const periodSpecific = reportPeriod === 'daily'
                ? { label: 'Günlük Rapor Durumu', value: report?.general_status ? (report.general_status === 'normal' ? 'Normal' : report.general_status === 'dikkat' ? 'Dikkat' : 'Kritik') : '—', color: report?.general_status === 'kritik' ? '#ef4444' : report?.general_status === 'dikkat' ? '#f59e0b' : '#16a34a' }
                : reportPeriod === 'weekly'
                  ? { label: 'Aktif Personel', value: totalPersonnel ? `${totalPersonnel} kişi` : '—', color: '#185FA5' }
                  : { label: 'Hava Kayıp Gün', value: `${lostDays} gün`, color: lostDays > 5 ? '#ef4444' : lostDays > 2 ? '#f59e0b' : '#16a34a' }

              return [
                remainingRow,
                { label: 'Plan / Gerçek', value: `%${plannedPct} / %${avgReportProgress}`, color: avgReportProgress >= plannedPct ? '#16a34a' : '#ef4444' },
                { label: 'Bütçe Kullanımı', value: totalBudget > 0 ? `%${budgetPct}` : '—', color: '#f59e0b' },
                { label: 'Bekleyen Satın Alma', value: pendingPurchases, color: pendingPurchases > 0 ? '#ef4444' : '#16a34a' },
                periodSpecific,
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{item.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</span>
                </div>
              ))
            })()}
          </div>
        </div>

        <ProjectWeatherCard location={currentProject?.location} lostDays={lostDays} reportWeather={report} />
      </div>

      <div className="project-mid-grid">
        {sCurveData.length > 0 && (
          <div className="card project-timeline-card">
            <div className="project-card-title">
              <h3>Projenin Gidişatı</h3>
              <LinkButton onClick={() => onGoTab?.('gantt')}>İş Planını Gör</LinkButton>
            </div>
            <div style={{ padding: '0 0.25rem 0.25rem' }}>
              <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                Planlanan vs Gerçek:
                <strong style={{ color: avgReportProgress >= plannedPct ? '#16a34a' : '#ef4444', marginLeft: 4 }}>
                  {avgReportProgress >= plannedPct ? '+' : ''}{Math.round(avgReportProgress - plannedPct)}%
                </strong>
              </span>
            </div>
            <div style={{ padding: '0.5rem 0.25rem 1rem' }}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={sCurveData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={v => v !== null ? `${Math.round(v)}%` : '—'} />
                  <ReferenceLine x={todayLabel} stroke="#ef4444" strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="planned" stroke="#3b82f6" dot={false} strokeWidth={2} name="Planlanan" />
                  <Line type="monotone" dataKey="actual"  stroke="#22c55e" dot={{ r: 4 }} strokeWidth={2} name="Gerçekleşen" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 20, height: 2, background: '#3b82f6', display: 'inline-block' }} /> Planlanan
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 20, height: 2, background: '#22c55e', display: 'inline-block' }} /> Gerçekleşen
                </span>
                <span style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 2, height: 12, background: '#ef4444', display: 'inline-block' }} /> Bugün
                </span>
              </div>
            </div>
          </div>
        )}

        {categoryWeights.length > 0 && (
          <div className="card project-mini-card project-category-card">
            <div className="project-card-title">
              <h3>Kategori Bazlı İlerleme</h3>
              <LinkButton onClick={() => onGoTab?.('gantt')}>İş Planını Gör</LinkButton>
            </div>
            {categoryWeights.length <= 8 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryChartData} margin={{ top: 4, right: 8, bottom: 24, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={44} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(v, _name, item) => [`${v}% (ağırlık %${item?.payload?.weight ?? 0})`, 'İlerleme']}
                  />
                  <Bar dataKey="progress" fill="#185FA5" radius={[4, 4, 0, 0]} name="İlerleme" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {categoryWeights.map(cw => (
                  <div className="project-progress-row" key={cw.category}>
                    <div>
                      <strong>{TASK_CATEGORY_LABEL[cw.category] || cw.category}</strong>
                      <span>Ağırlık %{fmtNumber(cw.weight_pct)}</span>
                    </div>
                    <MiniProgress value={cw.avg_progress} />
                    <b>{Math.round(Number(cw.avg_progress || 0))}%</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="project-bottom-grid">
        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Günlük Rapor Özeti</h3>
            <LinkButton onClick={() => onGoTab?.('raporlar')}>Tüm Raporlar</LinkButton>
          </div>
          {[
            { label: 'Aktif Personel', value: totalPersonnel ? `${totalPersonnel} kişi` : '—' },
            { label: 'Çalışan Makine', value: activeMachines ? `${activeMachines} adet` : '—' },
            { label: 'İlerleme Yapılan Kalem', value: progressItems.filter(i => Number(i.pct) > 0).length ? `${progressItems.filter(i => Number(i.pct) > 0).length} kalem` : '—' },
            { label: 'Rapor Tarihi', value: report ? fmtDate(report.report_date) : '—' },
            { label: 'Gönderen', value: report?.creator_name || '—' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{item.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', textAlign: 'right', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
            </div>
          ))}
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Malzeme Kalemleri / Satın Alma</h3>
            <LinkButton onClick={() => onGoTab?.('satin-alma')}>Tüm Satın Almalar</LinkButton>
          </div>
          {purchaseRows.length ? purchaseRows.slice(0, 4).map((row, idx) => (
            <div className="project-list-row" key={`${row.material}-${idx}`}>
              <strong>{row.material}</strong>
              <span className={`badge ${getStatusBadge(row.status)}`}>{row.statusLabel}</span>
              <small>{fmtDate(row.delivery)}</small>
            </div>
          )) : <p className="project-empty">Satın alma kaydı yok.</p>}
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Maliyet Durumu</h3>
            <LinkButton onClick={() => onGoTab?.('finans')}>Detayı Gör</LinkButton>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>Harcanan / Hedef</p>
              <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                {fmtMoney(spent)} ₺ <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted)' }}>/ {totalBudget ? `${fmtMoney(totalBudget)} ₺` : '—'}</span>
              </p>
            </div>
            <span className={`badge ${budgetPct > 90 ? 'red' : 'blue'}`} style={{ fontSize: 12, flexShrink: 0 }}>%{budgetPct}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <MiniProgress value={budgetPct} color={budgetPct > 90 ? '#ef4444' : '#185FA5'} />
          </div>
          {totalBudget > 0 && spent > totalBudget && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-danger)' }}>
              Bütçe aşıldı — öngörülen toplam: {fmtMoney(spent)} ₺
            </p>
          )}
          {top5Budget.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.8rem 0 0.2rem' }}>
                En Büyük 5 Kalem
              </p>
              <div style={{ maxHeight: 108, overflowY: 'auto' }}>
                {top5Budget.map((b, i) => (
                  <div key={b.id || i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name || b.category}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-muted)', flexShrink: 0 }}>{fmtMoney(b.planned_amount)} ₺</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Güncel Ticketlar</h3>
            <LinkButton onClick={() => onGoTab?.('tickets')}>Tümünü Gör</LinkButton>
          </div>
          {tickets.length === 0
            ? <p className="project-empty">Açık ticket bulunmuyor.</p>
            : (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tickets.slice(0, 5).map(ticket => (
                  <div key={ticket.id} style={{
                    padding: '8px 10px', background: '#f8fafc',
                    borderRadius: 8, border: '1px solid #e2e8f0',
                    borderLeft: `3px solid ${ticket.severity === 'kritik' ? '#ef4444' : ticket.severity === 'yüksek' ? '#f59e0b' : '#94a3b8'}`,
                    flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ticket.title}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <span className={`badge ${ticket.severity === 'kritik' ? 'red' : ticket.severity === 'yüksek' ? 'amber' : 'gray'}`} style={{ fontSize: 9 }}>
                        {ticket.severity || '—'}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                        {new Date(ticket.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Açık Riskler (Detay)</h3>
          </div>
          <p style={{ margin: '-6px 0 8px', fontSize: 10.5, color: 'var(--color-muted)' }}>
            Sistem tarafından otomatik tespit edilen riskler
          </p>
          {openRisks.length === 0 ? (
            <p className="project-empty">Açık risk bulunmuyor.</p>
          ) : (
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {openRisks.map(risk => {
                const target = risk.rule_code === 'gorev_gecikmesi' ? 'gantt'
                  : risk.rule_code === 'malzeme_fazla_talep' ? 'satin-alma'
                  : null
                return (
                  <div
                    key={risk.id}
                    onClick={target ? () => onGoTab?.(target) : undefined}
                    style={{
                      padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0',
                      borderLeft: `3px solid ${SEV_BORDER[risk.severity] || '#94a3b8'}`,
                      cursor: target ? 'pointer' : 'default', flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {risk.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span className={`badge ${RISK_BADGE[risk.severity] || 'gray'}`} style={{ fontSize: 9 }}>
                        {risk.severity}
                      </span>
                      <span style={{ fontSize: 9, color: '#475569', background: '#eef2f7', padding: '1px 6px', borderRadius: 999 }}>
                        {RISK_CATEGORY_LABEL[risk.category] || 'Diğer'}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>
                        {RISK_RULE_LABEL[risk.rule_code] || 'Otomatik tespit'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card project-photo-card" style={{ marginTop: '1rem' }}>
        <div className="project-card-title">
          <h3>Saha Fotoğrafları</h3>
          <LinkButton onClick={() => onGoTab?.('raporlar')}>Tümünü Gör</LinkButton>
        </div>
        {sitePhotosLoading ? (
          <p className="project-empty">Fotoğraflar yükleniyor…</p>
        ) : !sitePhotoReport ? (
          <p className="project-empty">{fmtDate(filterDate)} için rapor bekleniyor.</p>
        ) : sitePhotos.length === 0 ? (
          <p className="project-empty">Rapor yüklendi, saha fotoğrafı yüklenmedi.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 8 }}>
            {sitePhotos.slice(0, 12).map(photo => {
              const url = sitePhotoUrl(photo.storage_path)
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setPhotoLightbox(url)}
                  title={photo.caption || 'Saha fotoğrafı'}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    padding: 0,
                    borderRadius: 10,
                    overflow: 'hidden',
                    aspectRatio: '4/3',
                    cursor: 'pointer',
                  }}
                >
                  <img src={url} alt={photo.caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                </button>
              )
            })}
          </div>
        )}
        {sitePhotos.length > 12 && (
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--color-muted)' }}>
            +{sitePhotos.length - 12} fotoğraf daha
          </p>
        )}
      </div>

      {photoLightbox && (
        <div
          onClick={() => setPhotoLightbox(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={photoLightbox}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 24px 60px rgba(0,0,0,.35)' }}
          />
          <button
            onClick={() => setPhotoLightbox(null)}
            style={{ position: 'fixed', top: 18, right: 22, border: 'none', background: 'transparent', color: '#fff', fontSize: 34, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
