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
      <div className="card">
        <div className="card-header"><h3>Genel Proje</h3></div>
        <p className="project-overview-loading">Yükleniyor…</p>
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
          <SummaryLine icon="📅" label="Kalan Gün" value={remainingDays === null ? '—' : remainingDays < 0 ? `${Math.abs(remainingDays)} gün gecikti` : `${remainingDays} gün`} />
          <SummaryLine icon="📈" label="Planlanan / Gerçek" value={`Plan %${plannedPct} · Gerçek %${avgReportProgress}`} />
          <SummaryLine icon="💰" label="Bütçe Kullanımı" value={totalBudget > 0 ? `%${budgetPct}` : '—'} />
        </div>

        <ProjectWeatherCard location={currentProject?.location} lostDays={lostDays} />
      </div>

      <div className="card project-timeline-card">
        <div className="project-card-title">
          <h3>Projenin Gidişatı (Planlanan & Gerçek)</h3>
          <span>Planlanan vs Gerçek: {Math.round(avgReportProgress - plannedPct)}% · Gecikme: {avgReportProgress < plannedPct ? `${plannedPct - avgReportProgress} puan` : 'yok'}</span>
        </div>
        <div className="project-timeline">
          {milestones.map((m, index) => {
            const pct = clamp(m.progress || m.progress_pct)
            const state = pct >= 100 ? 'done' : pct > 0 ? 'active' : 'pending'
            const label = m.name || m.task_name || m.title || 'Milestone'
            return (
              <div className={`project-milestone ${state}`} key={m.id || `${label}-${index}`} data-label={label}>
                <span>{state === 'done' ? '✓' : index + 1}</span>
                <p>{label}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="project-bottom-grid">
        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Günlük Rapor Özeti</h3>
            <LinkButton onClick={() => onGoTab?.('genel')}>Tüm Raporlar</LinkButton>
          </div>
          <SummaryLine icon="☀️" label="Hava Durumu" value={latestReport?.weather || '—'} />
          <SummaryLine icon="👷" label="Aktif Personel" value={totalPersonnel ? `${totalPersonnel} kişi` : '—'} />
          <SummaryLine icon="🚜" label="Çalışan Makine" value={activeMachines ? `${activeMachines} adet` : '—'} />
          <SummaryLine icon="✅" label="Bugün Yapılan İş" value={todayDone || '—'} />
          <SummaryLine icon="📌" label="Yarınki Plan" value={tomorrowPlan || '—'} />
          <SummaryLine icon="🕓" label="Rapor Zamanı" value={latestReport ? `${fmtDate(latestReport.report_date)} 17:00` : '—'} />
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>İş Kalemleri Takibi</h3>
            <LinkButton onClick={() => onGoTab?.('gantt')}>Detayı Gör</LinkButton>
          </div>
          {progressRows.length ? progressRows.map(item => (
            <div className="project-progress-row" key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.done || 0} / {item.target || '—'} {item.unit}{item.periodAdded ? ` · dönem +${item.periodAdded}` : ''}</span>
              </div>
              <MiniProgress value={item.pct} />
              <b>{Math.round(item.pct)}%</b>
            </div>
          )) : <p className="project-empty">İş kalemi verisi yok.</p>}
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Malzeme Kalemleri / Satın Alma</h3>
            <LinkButton onClick={() => onGoTab?.('satin-alma')}>Tüm Satın Almalar</LinkButton>
          </div>
          {purchaseRows.length ? purchaseRows.slice(0, 5).map((row, idx) => (
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
          <DetailRow label="Hedef Maliyet" value={totalBudget ? `${fmtMoney(totalBudget)} USD` : '—'} />
          <DetailRow label="Harcanan Tutar" value={spent ? `${fmtMoney(spent)} USD` : '—'} tone="success" />
          <DetailRow label="Kullanım Oranı" value={totalBudget ? `%${budgetPct}` : '—'} tone={budgetPct > 90 ? 'danger' : 'primary'} />
          <MiniProgress value={budgetPct} color={budgetPct > 90 ? '#ef4444' : '#185FA5'} />
          <DetailRow label="Öngörülen Toplam Maliyet" value={totalBudget ? `${fmtMoney(Math.max(totalBudget, spent))} USD` : '—'} tone="danger" />
        </div>

        <div className="card project-mini-card">
          <div className="project-card-title">
            <h3>Risk Özeti</h3>
            <LinkButton onClick={() => onGoTab?.('tickets')}>Tüm Riskler</LinkButton>
          </div>
          {riskRows.length ? riskRows.slice(0, 4).map((risk, idx) => (
            <div className="project-risk-row" key={`${risk.title}-${idx}`}>
              <span>⚠</span>
              <strong>{risk.title}</strong>
              <b className={`badge ${RISK_BADGE[risk.severity] || 'gray'}`}>{risk.severity}</b>
              <small>{fmtDate(risk.date)}</small>
            </div>
          )) : <p className="project-empty">Açık risk kaydı yok.</p>}
        </div>
      </div>
    </div>
  )
}
