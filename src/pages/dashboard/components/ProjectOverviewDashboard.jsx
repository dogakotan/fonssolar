import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWeather } from '../../../hooks/useWeather'

const TYPE_LABEL = {
  arazi_ges: 'Arazi GES',
  cati_ges: 'Çatı GES',
  depolamali_ges: 'Depolamalı GES',
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
  const s = (status || '').toLowerCase()
  if (s.includes('teslim')) return 'green'
  if (s.includes('sipariş') || s.includes('siparis')) return 'green'
  if (s.includes('onay')) return 'amber'
  if (s.includes('plan')) return 'blue'
  if (s.includes('iptal') || s.includes('red')) return 'red'
  return 'gray'
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
    status: pr.status || 'planlandı',
    delivery: pr.delivery_date || pr.required_date || pr.created_at,
  }
}

function ProjectWeatherCard({ location, lostDays }) {
  const city = location ? location.split('/')[0].split(',')[0].trim() : ''
  const weather = useWeather(city || null)

  return (
    <div className="card project-overview-card project-weather-card">
      <div className="project-card-title">
        <h3>Hava Durumu</h3>
        <span>{city || 'Konum bilgisi yok'}</span>
      </div>
      {weather.loading ? (
        <div className="project-weather-empty">Hava yükleniyor…</div>
      ) : weather.error || !weather.current ? (
        <div className="project-weather-empty">Hava durumu alınamadı</div>
      ) : (
        <>
          <div className="project-weather-main">
            <span className="project-weather-emoji">{weather.current.emoji}</span>
            <div>
              <strong>{weather.current.temp}°C</strong>
              <p>{weather.current.label}</p>
            </div>
            <div className="project-weather-meta">
              <span>💨 {weather.current.wind} km/h</span>
              <span>💧 %{weather.current.humidity}</span>
            </div>
          </div>
          <div className="project-weather-tomorrow">
            <span>Yarın</span>
            <strong>{weather.tomorrow.emoji} {weather.tomorrow.max}°</strong>
            <small>{weather.tomorrow.min}° · {weather.tomorrow.label} · yağış %{weather.tomorrow.rain}</small>
          </div>
        </>
      )}
      <div className="project-weather-lost">
        Hava Kaynaklı Kayıp Gün: <strong>{lostDays}</strong>
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
}) {
  const [loading, setLoading] = useState(true)
  const [projectDetails, setProjectDetails] = useState(null)
  const [dailyReports, setDailyReports] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [machinery, setMachinery] = useState([])
  const [dailyTasks, setDailyTasks] = useState([])
  const [progressItemRows, setProgressItemRows] = useState([])
  const [purchases, setPurchases] = useState([])
  const [budgetLines, setBudgetLines] = useState([])
  const [invoices, setInvoices] = useState([])
  const [risks, setRisks] = useState([])
  const [tickets, setTickets] = useState([])
  const [sahaPhotos, setSahaPhotos] = useState([])
  const [tooltipInfo, setTooltipInfo] = useState(null)

  const range = useMemo(() => getRange(filterDate, reportPeriod), [filterDate, reportPeriod])

  useEffect(() => {
    if (!projectId) return
    let alive = true

    async function load() {
      setLoading(true)
      const endOfRange = `${range.end}T23:59:59`
      const reportsRes = await supabase
        .from('daily_reports')
        .select('id, report_date, weather, notes, prepared_by')
        .eq('project_id', projectId)
        .gte('report_date', range.start)
        .lte('report_date', range.end)
        .order('report_date', { ascending: false })

      const reports = reportsRes.data || []
      const reportIds = reports.map(r => r.id)

      const [
        personnelRes,
        machineryRes,
        dailyTasksRes,
        progressItemsRes,
        purchaseRes,
        budgetRes,
        invoiceRes,
        riskRes,
        projectRes,
        ticketRes,
        photoRes,
      ] = await Promise.all([
        reportIds.length
          ? supabase.from('personnel_log_entries').select('report_id, shift, department, count').in('report_id', reportIds)
          : Promise.resolve({ data: [] }),
        reportIds.length
          ? supabase.from('machinery_logs').select('report_id, machine_type, count, status').in('report_id', reportIds)
          : Promise.resolve({ data: [] }),
        reportIds.length
          ? supabase.from('daily_tasks').select('report_id, type, description, order_index').in('report_id', reportIds).order('order_index')
          : Promise.resolve({ data: [] }),
        supabase
          .from('progress_items')
          .select(`
            id,
            name,
            category,
            target_qty,
            unit,
            total_progress,
            progress_daily (
              qty_added,
              report:daily_reports!report_id (report_date)
            )
          `)
          .eq('project_id', projectId)
          .order('order_index', { ascending: true }),
        supabase.from('purchase_requests').select('id, title, request_no, description, status, delivery_date, required_date, created_at').eq('project_id', projectId).lte('created_at', endOfRange).order('created_at', { ascending: false }).limit(6),
        supabase.from('budget_lines').select('id, category, planned_amount').eq('project_id', projectId),
        supabase.from('invoices').select('id, total_amount, amount, status, created_at, invoice_date').eq('project_id', projectId),
        supabase.from('project_risks').select('*').eq('project_id', projectId).neq('status', 'kapandi').limit(6),
        supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
        supabase.from('tickets').select('id, title, severity, status, created_at').eq('project_id', projectId).neq('status', 'kapatıldı').order('created_at', { ascending: false }).limit(8),
        supabase.from('daily_report_photos').select('id, storage_path, report_date, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(9),
      ])

      if (!alive) return
      setProjectDetails(projectRes.data || null)
      setDailyReports(reports)
      setPersonnel(personnelRes.data || [])
      setMachinery(machineryRes.data || [])
      setDailyTasks(dailyTasksRes.data || [])
      setProgressItemRows(progressItemsRes.data || [])
      setPurchases(purchaseRes.data || [])
      setBudgetLines(budgetRes.data || [])
      setInvoices(invoiceRes.data || [])
      setRisks(riskRes.data || [])
      setTickets(ticketRes.data || [])
      setSahaPhotos(photoRes.data || [])
      setLoading(false)
    }

    load().catch(error => {
      console.error('ProjectOverviewDashboard load error:', error)
      if (alive) setLoading(false)
    })

    return () => { alive = false }
  }, [projectId, range.start, range.end])

  const currentProject = projectDetails || project
  const latestReport = dailyReports[0] || null
  const avgTaskProgress = tasks.length
    ? Math.round(tasks.reduce((sum, task) => sum + clamp(task.progress), 0) / tasks.length)
    : 0

  const progressItems = progressItemRows.map(item => {
    const dailyRows = item.progress_daily || []
    const cumulative = dailyRows
      .filter(row => row.report?.report_date && row.report.report_date <= range.end)
      .reduce((sum, row) => sum + Number(row.qty_added || 0), 0)
    const periodAdded = dailyRows
      .filter(row => row.report?.report_date && row.report.report_date >= range.start && row.report.report_date <= range.end)
      .reduce((sum, row) => sum + Number(row.qty_added || 0), 0)
    const pct = item.target_qty > 0 ? (cumulative / Number(item.target_qty)) * 100 : 0
    return {
      name: item.name || 'İş kalemi',
      done: cumulative,
      periodAdded,
      target: item.target_qty || 0,
      unit: item.unit || '',
      pct: clamp(pct),
    }
  })

  const avgReportProgress = progressItems.length
    ? Math.round(progressItems.reduce((sum, item) => sum + item.pct, 0) / progressItems.length)
    : avgTaskProgress

  const plannedPct = calcPlannedAt(tasks, filterDate)
  const totalBudget = budgetLines.reduce((sum, b) => sum + Number(b.planned_amount || 0), 0)
  const invoicesUntilEnd = invoices.filter(i => {
    const date = (i.invoice_date || i.created_at || '').slice(0, 10)
    return !date || date <= range.end
  })
  const spent = invoicesUntilEnd
    .filter(i => ['onaylandı', 'onaylandi', 'ödendi', 'odendi', 'paid', 'approved'].includes((i.status || '').toLowerCase()))
    .reduce((sum, i) => sum + Number(i.total_amount || i.amount || 0), 0)
  const budgetPct = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0
  const target = currentProject?.target_date ? new Date(`${currentProject.target_date}T00:00:00`) : null
  const selected = new Date(`${filterDate}T00:00:00`)
  const remainingDays = target ? Math.ceil((target - selected) / 86400000) : null
  const lostDays = dailyReports.filter(r => ['yağmurlu', 'yagmurlu', 'karlı', 'karli', 'fırtınalı', 'firtinali'].includes((r.weather || '').toLowerCase())).length

  const totalPersonnel = personnel.reduce((sum, p) => sum + Number(p.count || 0), 0)
  const activeMachines = machinery
    .filter(m => !m.status || ['çalışıyor', 'calisiyor', 'aktif'].includes((m.status || '').toLowerCase()))
    .reduce((sum, m) => sum + Number(m.count || 0), 0)
  const todayDone = dailyTasks.find(t => ['tamamlandı', 'tamamlandi', 'done'].includes((t.type || '').toLowerCase()))?.description
  const tomorrowPlan = dailyTasks.find(t => ['planlandı', 'planlandi', 'planned'].includes((t.type || '').toLowerCase()))?.description

  const milestones = progressItems.length ? progressItems.slice(0, 11).map(item => ({
    id: item.name,
    name: item.name,
    progress: item.pct,
  })) : tasks.length ? tasks.slice(0, 11) : [
    { id: 'm1', name: 'Mobilizasyon', progress: 100 },
    { id: 'm2', name: 'Arazi Tesviye', progress: 100 },
    { id: 'm3', name: 'Konstrüksiyon', progress: 60 },
    { id: 'm4', name: 'Panel Montajı', progress: 0 },
    { id: 'm5', name: 'Test & Devreye Alma', progress: 0 },
  ]

  const purchaseRows = purchases.map(normalizePurchase)
  const riskRows = risks.map(normalizeRisk)
  const progressRows = progressItems.length
    ? progressItems.slice(0, 6)
    : tasks.slice(0, 6).map(t => ({ name: t.name || t.task_name, done: '', target: '', unit: '', pct: t.progress || 0 }))

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
        <div className="spin" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTop: '3px solid #003B8E', borderRadius: '50%' }} />
        <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: 0 }}>Proje verisi yükleniyor…</p>
      </div>
    )
  }

  return (
    <div className="project-overview">
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
          <p>Günlük raporlara göre genel proje ilerlemesi</p>
        </div>

        <div className="card project-overview-card">
          <div className="project-card-title"><h3>Özet Durum</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {[
              {
                label: 'Kalan Gün',
                value: remainingDays === null ? '—' : remainingDays < 0 ? `${Math.abs(remainingDays)} gün gecikti` : `${remainingDays} gün`,
                color: remainingDays === null ? '#64748b' : remainingDays > 30 ? '#16a34a' : remainingDays >= 0 ? '#f59e0b' : '#ef4444',
              },
              {
                label: 'Plan / Gerçek',
                value: `%${plannedPct} / %${avgReportProgress}`,
                color: avgReportProgress >= plannedPct ? '#16a34a' : '#ef4444',
              },
              {
                label: 'Bütçe Kullanımı',
                value: totalBudget > 0 ? `%${budgetPct}` : '—',
                color: '#f59e0b',
              },
              {
                label: 'Satın Alma Talebi',
                value: purchases.filter(p => (p.status || '').toLowerCase() === 'bekliyor').length,
                color: purchases.filter(p => (p.status || '').toLowerCase() === 'bekliyor').length > 0 ? '#ef4444' : '#16a34a',
              },
              {
                label: 'Açık Ticket',
                value: tickets.length,
                color: tickets.length > 0 ? '#ef4444' : '#16a34a',
              },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <ProjectWeatherCard location={currentProject?.location} lostDays={lostDays} />
      </div>

      {tooltipInfo && (
        <div style={{
          position: 'fixed',
          left: tooltipInfo.x,
          top: tooltipInfo.y - 8,
          transform: 'translateX(-50%) translateY(-100%)',
          background: '#1e293b', color: '#fff', padding: '6px 10px', borderRadius: 7,
          fontSize: 11.5, whiteSpace: 'nowrap', zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none',
        }}>
          {tooltipInfo.label}
          <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>%{Math.round(tooltipInfo.pct)}</div>
        </div>
      )}

      <div className="card project-timeline-card">
        <div className="project-card-title">
          <h3>Projenin Gidişatı</h3>
          <span style={{ fontSize: 12 }}>
            Planlanan vs Gerçek:
            <strong style={{ color: avgReportProgress >= plannedPct ? '#16a34a' : '#ef4444', marginLeft: 4 }}>
              {avgReportProgress >= plannedPct ? '+' : ''}{Math.round(avgReportProgress - plannedPct)}%
            </strong>
            {avgReportProgress < plannedPct && (
              <span style={{ color: '#ef4444', marginLeft: 8 }}>· Gecikme: {plannedPct - avgReportProgress} puan</span>
            )}
          </span>
        </div>
        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: milestones.length * 90, padding: '8px 16px 4px' }}>
            {milestones.map((m, index) => {
              const pct = clamp(m.progress || m.progress_pct)
              const isDone = pct >= 100
              const isActive = pct > 0 && pct < 100
              const label = m.name || m.task_name || m.title || 'Milestone'
              const prevPct = index > 0 ? clamp(milestones[index - 1].progress || milestones[index - 1].progress_pct) : 100
              return (
                <div
                  key={m.id || `${label}-${index}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', cursor: 'default' }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setTooltipInfo({ x: rect.left + rect.width / 2, y: rect.top, label, pct })
                  }}
                  onMouseLeave={() => setTooltipInfo(null)}
                >
                  {index > 0 && (
                    <div style={{ position: 'absolute', left: 0, top: 14, width: '50%', height: 2, background: prevPct >= 100 ? '#16a34a' : '#e2e8f0', zIndex: 0 }} />
                  )}
                  {index < milestones.length - 1 && (
                    <div style={{ position: 'absolute', left: '50%', top: 14, width: '50%', height: 2, background: isDone ? '#16a34a' : '#e2e8f0', zIndex: 0 }} />
                  )}
                  <div style={{
                    position: 'relative', zIndex: 1,
                    width: 28, height: 28, borderRadius: '50%',
                    background: isDone ? '#16a34a' : isActive ? '#003B8E' : '#e2e8f0',
                    color: isDone || isActive ? '#fff' : '#64748b',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 11,
                    border: `2px solid ${isDone ? '#16a34a' : isActive ? '#003B8E' : '#cbd5e1'}`,
                  }}>
                    {isDone ? '✓' : index + 1}
                  </div>
                  <p style={{ fontSize: 9.5, color: '#64748b', textAlign: 'center', marginTop: 5, maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                    {label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="project-bottom-grid">
        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Günlük Rapor Özeti</h3>
            <LinkButton onClick={() => onGoTab?.('genel')}>Tüm Raporlar</LinkButton>
          </div>
          {[
            { label: 'Aktif Personel', value: totalPersonnel ? `${totalPersonnel} kişi` : '—' },
            { label: 'Çalışan Makine', value: activeMachines ? `${activeMachines} adet` : '—' },
            { label: 'İlerleme Yapılan Kalem', value: progressItems.filter(i => i.periodAdded > 0).length ? `${progressItems.filter(i => i.periodAdded > 0).length} kalem` : '—' },
            { label: 'Rapor / Gönderen', value: latestReport ? `${fmtDate(latestReport.report_date)}${latestReport.prepared_by ? ` · ${latestReport.prepared_by}` : ''}` : '—' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>{item.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', textAlign: 'right', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
            </div>
          ))}
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>İş Kalemleri Takibi</h3>
            <LinkButton onClick={() => onGoTab?.('gantt')}>Detayı Gör</LinkButton>
          </div>
          {(() => {
            const active = progressRows.filter(i => i.periodAdded > 0).slice(0, 4)
            const rows = active.length ? active : progressRows.slice(0, 4)
            return rows.length ? rows.map(item => (
              <div className="project-progress-row" key={item.name}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.done || 0} / {item.target || '—'} {item.unit}{item.periodAdded ? ` +${item.periodAdded}` : ''}</span>
                </div>
                <MiniProgress value={item.pct} />
                <b>{Math.round(item.pct)}%</b>
              </div>
            )) : <p className="project-empty">İş kalemi verisi yok.</p>
          })()}
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Malzeme Kalemleri / Satın Alma</h3>
            <LinkButton onClick={() => onGoTab?.('satin-alma')}>Tüm Satın Almalar</LinkButton>
          </div>
          {purchaseRows.length ? purchaseRows.slice(0, 4).map((row, idx) => (
            <div className="project-list-row" key={`${row.material}-${idx}`}>
              <strong>{row.material}</strong>
              <span className={`badge ${getStatusBadge(row.status)}`}>{row.status}</span>
              <small>{fmtDate(row.delivery)}</small>
            </div>
          )) : <p className="project-empty">Satın alma kaydı yok.</p>}
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Maliyet Durumu</h3>
            <LinkButton onClick={() => onGoTab?.('finans')}>Detayı Gör</LinkButton>
          </div>
          <DetailRow label="Hedef Maliyet" value={totalBudget ? `${fmtMoney(totalBudget)} ₺` : '—'} />
          <DetailRow label="Harcanan Tutar" value={spent ? `${fmtMoney(spent)} ₺` : '—'} tone="success" />
          <DetailRow label="Kullanım Oranı" value={totalBudget ? `%${budgetPct}` : '—'} tone={budgetPct > 90 ? 'danger' : 'primary'} />
          <MiniProgress value={budgetPct} color={budgetPct > 90 ? '#ef4444' : '#185FA5'} />
          <DetailRow label="Öngörülen Toplam Maliyet" value={totalBudget ? `${fmtMoney(Math.max(totalBudget, spent))} ₺` : '—'} tone="danger" />
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Güncel Ticketlar</h3>
            <LinkButton onClick={() => onGoTab?.('tickets')}>Tümünü Gör</LinkButton>
          </div>
          {tickets.length === 0
            ? <p className="project-empty">Açık ticket bulunmuyor.</p>
            : (
              <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tickets.map(ticket => (
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
            <h3>Saha Fotoğrafları</h3>
            <LinkButton onClick={() => onGoTab?.('genel')}>Tümünü Gör</LinkButton>
          </div>
          {sahaPhotos.length === 0
            ? <p className="project-empty">Henüz fotoğraf yüklenmemiş.</p>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {sahaPhotos.slice(0, 9).map(photo => {
                  const url = supabase.storage.from('saha-fotolari').getPublicUrl(photo.storage_path).data.publicUrl
                  return (
                    <a key={photo.id} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: '#f1f5f9' }}
                    >
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    </a>
                  )
                })}
              </div>
            )
          }
          {sahaPhotos.length > 0 && (
            <p style={{ fontSize: 10, color: 'var(--color-muted)', margin: '6px 0 0', textAlign: 'right' }}>
              {sahaPhotos.length} fotoğraf
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
