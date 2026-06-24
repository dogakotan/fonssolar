import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { getProjects, getDashboardKpis } from '../../../api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import ProgBar from '../../../components/ui/ProgBar'
import ExportButton from '../../../components/ui/ExportButton'
import WeatherWidget from '../../../components/ui/WeatherWidget'
import DateNavigator from '../../../components/ui/DateNavigator'
import { dateFilter } from '../../../utils/exportUtils'

// ─────────────────────────────────────────────────────────
//  Yardımcı
// ─────────────────────────────────────────────────────────
const STATUS_MAP = {
  aktif:          { badge: 'green', label: 'Aktif' },
  tamamlandı:     { badge: 'blue',  label: 'Tamamlandı' },
  beklemede:      { badge: 'amber', label: 'Beklemede' },
  'iptal edildi': { badge: 'red',   label: 'İptal' },
}

function fmt(n) { return Number(n || 0).toLocaleString('tr-TR') }
function fmtMoney(n) { return Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) }
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─────────────────────────────────────────────────────────
//  SVG Halka Bileşenleri
// ─────────────────────────────────────────────────────────
function Ring({ pct = 0, size = 68, sw = 7, color = '#003B8E' }) {
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}

function DualRing({ actual = 0, planned = 0, size = 72 }) {
  const sw = 6
  const or = (size - sw) / 2
  const ir = or - sw - 2
  const oc = 2 * Math.PI * or; const ic = 2 * Math.PI * ir
  const oo = oc - (Math.min(100, Math.max(0, planned)) / 100) * oc
  const io = ic - (Math.min(100, Math.max(0, actual)) / 100) * ic
  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={or} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={ir} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={or} fill="none" stroke="#3b82f6" strokeWidth={sw}
        strokeDasharray={oc} strokeDashoffset={oo} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <circle cx={size/2} cy={size/2} r={ir} fill="none" stroke="#22c55e" strokeWidth={sw}
        strokeDasharray={ic} strokeDashoffset={io} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────
//  S-Eğrisi Hesaplama
// ─────────────────────────────────────────────────────────
function calcPlannedAt(tasks, date) {
  const valid = tasks.filter(t => t.planned_start && t.planned_end)
  if (!valid.length) return 0
  const ts = date.getTime()
  const sum = valid.reduce((acc, t) => {
    const s = new Date(t.planned_start).getTime()
    const e = new Date(t.planned_end).getTime()
    if (ts < s) return acc
    if (ts >= e) return acc + 100
    if (e === s) return acc
    return acc + ((ts - s) / (e - s)) * 100
  }, 0)
  return sum / valid.length
}

function buildScurve(tasks, startDate, endDate, actualPct) {
  if (!startDate || !endDate || !tasks.length) return []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const endD = new Date(endDate)
  const data = []
  let cur = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth(), 1)
  while (cur <= endD) {
    const d = new Date(cur)
    data.push({
      label: d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }),
      planned: Math.round(calcPlannedAt(tasks, d)),
      actual: d <= today ? Math.round(actualPct) : null,
    })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return data
}

// ─────────────────────────────────────────────────────────
//  Proje Listesi (projectId yokken)
// ─────────────────────────────────────────────────────────
function ProjectListView({ onSelectProject, selectedDate, setSelectedDate }) {
  const [kpis, setKpis]         = useState({ activeProjects: '—', openTasks: '—', pendingPurchases: '—' })
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [konum, setKonum]       = useState(null)
  const [showCal, setShowCal]   = useState(false)
  const [calPos, setCalPos]     = useState({ top: 0, right: 0 })
  const [openTickets, setOpenTickets]         = useState(null)
  const [criticalTickets, setCriticalTickets] = useState(null)
  const calRef    = useRef(null)
  const calBtnRef = useRef(null)

  useEffect(() => {
    function h(e) {
      if (calRef.current && !calRef.current.contains(e.target) && !calBtnRef.current?.contains(e.target))
        setShowCal(false)
    }
    if (showCal) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showCal])

  function openCal() {
    if (calBtnRef.current) {
      const r = calBtnRef.current.getBoundingClientRect()
      setCalPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setShowCal(v => !v)
  }

  useEffect(() => {
    async function load() {
      const [kpiData, { data: projData }, tOpen, tCrit] = await Promise.all([
        getDashboardKpis(),
        getProjects(),
        supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'açık'),
        supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('severity', 'kritik').neq('status', 'kapatıldı'),
      ])
      if (projData) setProjects(projData)
      setKpis(kpiData)
      if (!tOpen.error)  setOpenTickets(tOpen.count  ?? 0)
      if (!tCrit.error)  setCriticalTickets(tCrit.count ?? 0)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setKonum({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => setKonum('İstanbul')
      )
    } else {
      setKonum('İstanbul')
    }
  }, [])

  const displayProjects = selectedDate
    ? projects.filter(p => p.created_at && new Date(p.created_at) <= new Date(selectedDate))
    : projects
  const totalMwp = displayProjects.reduce((s, p) => s + (p.capacity_kwp || 0), 0) / 1000
  const ticketVal   = loading || openTickets === null ? '…' : openTickets
  const ticketClass = criticalTickets ? 'red-text' : ''
  const ticketNote  = criticalTickets ? `${criticalTickets} kritik` : 'Açık bildirim'

  const stats = [
    { label: 'Toplam Proje',     value: loading ? '…' : kpis.activeProjects,          note: 'Kayıtlı proje sayısı' },
    { label: 'Toplam Kapasite',  value: loading ? '…' : `${totalMwp.toFixed(2)} MWp`, note: 'Kurulu güç' },
    { label: 'Açık Görev',       value: loading ? '…' : kpis.openTasks,               note: 'Aktif + gecikmiş', valueClass: 'amber-text' },
    { label: 'Bekleyen Sipariş', value: loading ? '…' : kpis.pendingPurchases,        note: 'Onay bekliyor',    valueClass: 'red-text' },
    { label: 'Açık Ticket',      value: ticketVal,                                     note: ticketNote,          valueClass: ticketClass },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <div className="stats-grid" style={{ flex: 1, minWidth: 0, marginBottom: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {stats.map(s => (
            <div className="stat-card" key={s.label}>
              <p className="stat-label">{s.label}</p>
              <p className={`stat-value ${s.valueClass || ''}`}>{s.value}</p>
              <p className="stat-note">{s.note}</p>
            </div>
          ))}
        </div>
        {konum && (
          <div className="stat-card weather-widget-wrap" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="stat-label" style={{ margin: 0 }}>Hava Durumu</p>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {typeof konum === 'string' ? konum : 'Mevcut Konum'}
              </span>
            </div>
            <WeatherWidget location={konum} size="full" />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Projeler</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {setSelectedDate && (
              <div style={{ position: 'relative' }}>
                <button ref={calBtnRef} onClick={openCal} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px',
                  background: selectedDate ? '#185FA5' : '#fff',
                  color: selectedDate ? '#fff' : 'var(--color-text)',
                  border: selectedDate ? 'none' : '1px solid var(--color-border)',
                  borderRadius: 8, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: selectedDate ? '0 2px 8px rgba(24,95,165,0.18)' : 'none',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}>
                  {selectedDate
                    ? selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Tarih Seç'}
                </button>
                {showCal && (
                  <div ref={calRef} style={{ position: 'fixed', top: calPos.top, right: calPos.right, zIndex: 9999 }}>
                    <DateNavigator selectedDate={selectedDate} onChange={d => { setSelectedDate(d); setShowCal(false) }} />
                  </div>
                )}
              </div>
            )}
            <ExportButton
              title="Proje Listesi"
              disabled={loading || displayProjects.length === 0}
              getData={periyot => {
                const filtered = selectedDate ? displayProjects : dateFilter(displayProjects, 'created_at', periyot)
                return {
                  columns: ['Proje Adı', 'Konum', 'Kapasite (kWp)', 'Kapasite (kWe)', 'Durum'],
                  rows: filtered.map(p => [
                    p.name,
                    p.location || '—',
                    p.capacity_kwp || 0,
                    p.capacity_kwe || 0,
                    { aktif: 'Aktif', tamamlandı: 'Tamamlandı', beklemede: 'Beklemede', 'iptal edildi': 'İptal' }[p.status] || '—',
                  ]),
                }
              }}
            />
          </div>
        </div>
        <div className="desk-only" style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 520 }}>
            <thead>
              <tr><th>Proje Adı</th><th>Konum</th><th>kWp</th><th>kWe</th><th>Durum</th><th>İlerleme</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-muted)' }}>Yükleniyor…</td></tr>}
              {!loading && displayProjects.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-muted)' }}>Proje bulunamadı.</td></tr>
              )}
              {displayProjects.map(p => {
                const s = STATUS_MAP[p.status] || { badge: 'blue', label: 'Aktif' }
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelectProject?.(p.id, p.name)}>
                    <td className="fw">{p.name}</td>
                    <td>{p.location || '—'}</td>
                    <td>{p.capacity_kwp?.toLocaleString('tr-TR') || '—'}</td>
                    <td>{p.capacity_kwe?.toLocaleString('tr-TR') || '—'}</td>
                    <td><span className={`badge ${s.badge}`}>● {s.label}</span></td>
                    <td><ProgBar pct={p.progress || 0} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mob-only">
          {loading && <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-muted)', margin: 0 }}>Yükleniyor…</p>}
          {!loading && displayProjects.length === 0 && (
            <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-muted)', margin: 0 }}>Proje bulunamadı.</p>
          )}
          {!loading && displayProjects.map(p => {
            const s = STATUS_MAP[p.status] || { badge: 'blue', label: 'Aktif' }
            return (
              <div key={p.id} className="proj-mob-card" onClick={() => onSelectProject?.(p.id, p.name)}>
                <div className="proj-mob-card-title">{p.name}</div>
                <div className="proj-mob-card-sub">
                  <span>{p.location || '—'}</span>
                  {p.capacity_kwp && <><span style={{ color: '#D1D5DB' }}>·</span><span>{p.capacity_kwp.toLocaleString('tr-TR')} kWp</span></>}
                </div>
                <div className="proj-mob-card-prog">
                  <span className={`badge ${s.badge}`}>● {s.label}</span>
                  <ProgBar pct={p.progress || 0} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────
//  Proje Dashboard'u (projectId varken)
// ─────────────────────────────────────────────────────────
function ProjectDashboard({ projectId, filterDate = new Date().toISOString().split('T')[0] }) {
  const [project, setProject]           = useState(null)
  const [tasks, setTasks]               = useState([])
  const [progressItems, setProgressItems] = useState([])
  const [critical, setCritical]         = useState([])
  const [budgetLines, setBudgetLines]   = useState([])
  const [invoices, setInvoices]         = useState([])
  const [risks, setRisks]               = useState([])
  const [weather, setWeather]           = useState(null)
  const [lostDays, setLostDays]         = useState(0)
  const [mechCheck, setMechCheck]       = useState([])
  const [elecCheck, setElecCheck]       = useState([])
  const [inspections, setInspections]   = useState([])
  const [personnel, setPersonnel]       = useState([])
  const [machinery, setMachinery]       = useState([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)

    async function load() {
      const [
        { data: proj },
        { data: tasksData },
        { data: progData, error: progErr },
        { data: critData, error: critErr },
        { data: budgData, error: budgErr },
        { data: invData,  error: invErr  },
        { data: riskData, error: riskErr },
        { data: dailyData },
        { data: mechData, error: mechErr },
        { data: elecData, error: elecErr },
        { data: inspData, error: inspErr },
        { count: lostCount },
      ] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('project_tasks')
          .select('task_code, task_name, group_label, planned_start, planned_end, progress_pct, status')
          .eq('project_id', projectId),
        supabase.from('progress_items')
          .select('name, unit, target_qty, total_progress, dashboard_visible, dashboard_order')
          .eq('project_id', projectId).eq('dashboard_visible', true).order('dashboard_order'),
        supabase.from('critical_path_items')
          .select('path_code, activity_name, planned_start, planned_end, status, progress_pct, is_critical')
          .eq('project_id', projectId).order('planned_start'),
        supabase.from('budget_lines')
          .select('name, planned_amount').eq('project_id', projectId),
        supabase.from('invoices')
          .select('amount, status').eq('project_id', projectId),
        supabase.from('project_risks')
          .select('id, title, severity, probability, impact, status')
          .eq('project_id', projectId).eq('status', 'açık'),
        supabase.from('daily_reports')
          .select('id, report_date, weather')
          .eq('project_id', projectId)
          .lte('report_date', filterDate)
          .order('report_date', { ascending: false }).limit(1),
        supabase.from('mechanical_checklist')
          .select('id, is_completed').eq('project_id', projectId),
        supabase.from('electrical_checklist')
          .select('id, is_completed').eq('project_id', projectId),
        supabase.from('quality_inspections')
          .select('id, result').eq('project_id', projectId),
        supabase.from('daily_reports')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .lte('report_date', filterDate)
          .in('weather', ['yağmurlu', 'karlı', 'fırtınalı']),
      ])

      setProject(proj || null)
      setTasks(tasksData || [])
      setProgressItems(progErr ? [] : (progData || []))
      setCritical(critErr ? [] : (critData || []))
      setBudgetLines(budgErr ? [] : (budgData || []))
      setInvoices(invErr ? [] : (invData || []))
      setRisks(riskErr ? [] : (riskData || []))
      setLostDays(lostCount || 0)

      const latestReport = (dailyData || [])[0] || null
      setWeather(latestReport?.weather || null)
      setMechCheck(mechErr ? [] : (mechData || []))
      setElecCheck(elecErr ? [] : (elecData || []))
      setInspections(inspErr ? [] : (inspData || []))

      if (latestReport?.id) {
        const [{ data: persData }, { data: machData }] = await Promise.all([
          supabase.from('personnel_log_entries').select('count').eq('report_id', latestReport.id),
          supabase.from('machinery_logs').select('count, status').eq('report_id', latestReport.id),
        ])
        setPersonnel(persData || [])
        setMachinery(machData || [])
      }

      setLoading(false)
    }

    load().catch(() => setLoading(false))
  }, [projectId, filterDate])

  if (loading) {
    return (
      <div className="card">
        <div className="card-header"><h3>Genel Bakış</h3></div>
        <p style={{ padding: '2rem', color: 'var(--color-muted)' }}>Yükleniyor…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="card">
        <div className="card-header"><h3>Genel Bakış</h3></div>
        <p style={{ padding: '2rem', color: 'var(--color-muted)' }}>Proje bulunamadı.</p>
      </div>
    )
  }

  // ── Hesaplamalar ─────────────────────────────────────
  const today = filterDate ? new Date(filterDate + 'T00:00:00') : new Date(); today.setHours(0, 0, 0, 0)

  // KPI 1 – Kalan gün
  const targetD   = project.target_date ? new Date(project.target_date) : null
  const kalanGun  = targetD ? Math.round((targetD - today) / 86400000) : null
  const gunColor  = kalanGun === null ? '#64748b' : kalanGun > 30 ? '#16a34a' : kalanGun >= 0 ? '#f59e0b' : '#ef4444'
  const gunLabel  = kalanGun === null ? '—' : kalanGun < 0 ? `${Math.abs(kalanGun)} gün gecikti` : `${kalanGun} gün kaldı`

  // KPI 2 – Genel ilerleme
  const avgProgress = tasks.length
    ? tasks.reduce((s, t) => s + Number(t.progress_pct || 0), 0) / tasks.length
    : 0

  // KPI 3 – Plan/Gerçek sapma
  const planPct  = calcPlannedAt(tasks, today)
  const sapma    = avgProgress - planPct
  const sapmaColor = sapma >= 0 ? '#16a34a' : '#ef4444'
  const sapmaLabel = sapma >= 0 ? `+${Math.round(sapma)}% önde` : `${Math.round(sapma)}% geride`

  // KPI 4 – Kritik yol
  const critTotal     = critical.length
  const critDone      = critical.filter(c => c.status === 'tamamlandi').length
  const critOngoing   = critical.filter(c => c.status === 'devam_ediyor').length

  // KPI 5 – Bütçe
  const totalBudget = budgetLines.reduce((s, b) => s + Number(b.planned_amount || 0), 0)
  const paid        = invoices.filter(i => i.status === 'ödendi').reduce((s, i) => s + Number(i.amount || 0), 0)
  const remaining   = totalBudget - paid
  const budgetPct   = totalBudget > 0 ? (paid / totalBudget) * 100 : 0

  // KPI 7 – Açık riskler
  const riskCounts = risks.reduce((acc, r) => {
    acc[r.severity] = (acc[r.severity] || 0) + 1; return acc
  }, {})

  // Kalite
  const mechTotal   = mechCheck.length
  const mechDone    = mechCheck.filter(c => c.is_completed).length
  const elecTotal   = elecCheck.length
  const elecDone    = elecCheck.filter(c => c.is_completed).length
  const inspTotal   = inspections.length
  const inspPassed  = inspections.filter(i => i.result === 'geçti').length

  // Personel / makine
  const totalPersonnel  = personnel.reduce((s, p) => s + Number(p.count || 0), 0)
  const activeMachines  = machinery.filter(m => m.status === 'çalışıyor').reduce((s, m) => s + Number(m.count || 0), 0)
  const waitingMachines = machinery.filter(m => m.status !== 'çalışıyor').reduce((s, m) => s + Number(m.count || 0), 0)

  // S-Curve verisi
  const sCurveData = buildScurve(tasks, project.start_date, project.target_date, avgProgress)
  const todayLabel = today.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' })


  // DC/AC oranı
  const dcAcRatio  = project.capacity_kwe > 0
    ? (project.capacity_kwp / project.capacity_kwe).toFixed(2)
    : '—'

  // Proje süresi (Gantt barlar için)
  const projStart = project.start_date ? new Date(project.start_date).getTime() : null
  const projEnd   = project.target_date ? new Date(project.target_date).getTime() : null
  const projSpan  = projStart && projEnd ? projEnd - projStart : 0
  const todayPos  = projStart && projSpan > 0
    ? Math.min(100, Math.max(0, ((today.getTime() - projStart) / projSpan) * 100))
    : null

  // Top 5 bütçe kalemi
  const top5Budget = [...budgetLines]
    .sort((a, b) => Number(b.planned_amount || 0) - Number(a.planned_amount || 0))
    .slice(0, 5)

  // En riskli 3
  const top3Risks = [...risks]
    .sort((a, b) => (Number(b.probability || 0) * Number(b.impact || 0)) - (Number(a.probability || 0) * Number(a.impact || 0)))
    .slice(0, 3)

  const SEV_COLOR = {
    kritik: 'red', yüksek: 'amber', orta: 'amber', düşük: 'blue',
  }

  const WEATHER_LABEL = {
    açık: '☀ Açık', parçalı_bulutlu: '⛅ Parçalı', bulutlu: '☁ Bulutlu',
    yağmurlu: '🌧 Yağmurlu', karlı: '❄ Karlı', fırtınalı: '⛈ Fırtınalı',
  }


  function InfoRow({ label, value }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
      </div>
    )
  }

  return (
    <div>
      {/* ─── PROJE BAŞLIĞI ─────────────────────────────── */}
      <div style={{
        background: '#fff',
        borderRadius: '1rem',
        padding: '1.25rem 1.5rem',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border)',
        marginBottom: '1.25rem',
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 0.3rem' }}>
          {project.name}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '0 0 0.75rem' }}>
          {[
            project.location,
            project.capacity_kwp && `${(project.capacity_kwp / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 3 })} MWp`,
            project.capacity_kwe && `${fmt(project.capacity_kwe)} kWe`,
          ].filter(Boolean).join('  •  ')}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: 0 }}>
          Başlangıç: <strong style={{ color: 'var(--color-text)' }}>{fmtDate(project.start_date)}</strong>
          &nbsp;→&nbsp;
          Bitiş: <strong style={{ color: targetD && today > targetD ? '#ef4444' : 'var(--color-text)' }}>{fmtDate(project.target_date)}</strong>
        </p>
      </div>


      {/* ─── 8 KPI KART ─────────────────────────────────── */}
      <div className="proj-dash-kpi-grid">

        {/* KPI 1: Kalan Gün */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Kalan Gün</p>
          <p style={{ fontSize: '1.875rem', fontWeight: 700, color: gunColor, margin: 0, lineHeight: 1 }}>
            {kalanGun === null ? '—' : Math.abs(kalanGun)}
          </p>
          <p style={{ fontSize: 11, color: gunColor, margin: 0 }}>{gunLabel}</p>
        </div>

        {/* KPI 2: Genel İlerleme */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Genel İlerleme</p>
          <div className="kpi-card-ring-row">
            <div style={{ position: 'relative', width: 68, height: 68 }}>
              <Ring pct={avgProgress} size={68} sw={7} color="#003B8E" />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#003B8E' }}>
                {Math.round(avgProgress)}%
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>Ortalama<br />ilerleme</p>
          </div>
        </div>

        {/* KPI 3: Plan / Gerçek Sapma */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Plan / Gerçek Sapma</p>
          <div className="kpi-card-ring-row">
            <div style={{ position: 'relative', width: 72, height: 72 }}>
              <DualRing actual={avgProgress} planned={planPct} size={72} />
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#3b82f6', margin: '0 0 3px' }}>Plan: %{Math.round(planPct)}</p>
              <p style={{ fontSize: 11, color: '#22c55e', margin: '0 0 3px' }}>Gerçek: %{Math.round(avgProgress)}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: sapmaColor, margin: 0 }}>{sapmaLabel}</p>
            </div>
          </div>
        </div>

        {/* KPI 4: Kritik Yol */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Kritik Yol</p>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px', lineHeight: 1 }}>
            {critTotal}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: '0 0 4px' }}>
            kritik iş kalemi
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge green" style={{ fontSize: 10 }}>{critDone} tamam</span>
            <span className="badge blue" style={{ fontSize: 10 }}>{critOngoing} devam</span>
          </div>
        </div>

        {/* KPI 5: Bütçe Kullanımı */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Bütçe Kullanımı</p>
          <div className="kpi-card-ring-row">
            <div style={{ position: 'relative', width: 68, height: 68 }}>
              <Ring pct={budgetPct} size={68} sw={7} color="#f59e0b" />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
                {Math.round(budgetPct)}%
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>Toplam bütçe<br />kullanımı</p>
          </div>
        </div>

        {/* KPI 6: Ödenen / Kalan */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Ödenen / Kalan</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', margin: '0 0 4px' }}>
            Ödenen: {fmtMoney(paid)} USD
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', margin: 0 }}>
            Kalan: {fmtMoney(remaining)} USD
          </p>
        </div>

        {/* KPI 7: Açık Riskler */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Açık Riskler</p>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, color: risks.length > 0 ? '#ef4444' : '#16a34a', margin: '0 0 6px', lineHeight: 1 }}>
            {risks.length}
          </p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['kritik', 'yüksek', 'orta', 'düşük'].filter(s => riskCounts[s]).map(s => (
              <span key={s} className={`badge ${SEV_COLOR[s] || 'gray'}`} style={{ fontSize: 10 }}>
                {riskCounts[s]} {s}
              </span>
            ))}
            {risks.length === 0 && <span className="badge green" style={{ fontSize: 10 }}>Açık risk yok</span>}
          </div>
        </div>

        {/* KPI 8: Hava / Kayıp Gün */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Hava / Kayıp Gün</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px' }}>
            {weather ? (WEATHER_LABEL[weather] || weather) : '—'}
          </p>
          <p style={{ fontSize: 11, color: lostDays > 0 ? '#ef4444' : 'var(--color-muted)', margin: 0 }}>
            Kayıp Gün: <strong>{lostDays}</strong>
          </p>
        </div>
      </div>

      {/* ─── ALAN 1: Teknik Özet + S-Eğrisi ─────────────── */}
      <div className="proj-dash-grid-2">

        {/* Sol: Teknik Özet */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 1rem' }}>Proje Teknik Özeti</h3>
          <InfoRow label="DC Güç"      value={`${fmt(project.capacity_kwp)} kWp  (${(project.capacity_kwp / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 3 })} MWp)`} />
          <InfoRow label="AC Güç"      value={`${fmt(project.capacity_kwe)} kWe`} />
          <InfoRow label="DC/AC Oranı" value={dcAcRatio} />
          {progressItems.filter(p => p.name?.toLowerCase().includes('panel')).slice(0, 1).map(p => (
            <InfoRow key={p.name} label="Panel" value={`${fmt(p.target_qty)} ${p.unit || 'adet'}`} />
          ))}
          {progressItems.filter(p => p.name?.toLowerCase().includes('inverter')).slice(0, 1).map(p => (
            <InfoRow key={p.name} label="İnverter" value={`${fmt(p.target_qty)} ${p.unit || 'adet'}`} />
          ))}
          <InfoRow label="Lokasyon"     value={project.location || '—'} />
          <InfoRow label="Başlangıç"    value={fmtDate(project.start_date)} />
          <InfoRow label="Hedef Bitiş"  value={fmtDate(project.target_date)} />
        </div>

        {/* Sağ: Milestone Şeridi + S-Eğrisi */}
        <div className="card" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>S-Eğrisi</h3>


          {/* S-Eğrisi grafiği */}
          {sCurveData.length > 0 ? (
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
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Görev tarihleri girilmeden grafik oluşturulamaz.</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
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

      {/* ─── ALAN 2: İmalat + Kritik Yol ────────────────── */}
      <div className="proj-dash-grid-2">

        {/* Sol: İmalat İlerlemesi */}
        <div className="card">
          <div className="card-header"><h3>İmalat İlerlemesi</h3></div>
          <div style={{ padding: '0.75rem 1.5rem' }}>
            {progressItems.length === 0 && (
              <p style={{ color: 'var(--color-muted)', fontSize: 13, padding: '0.5rem 0' }}>Veri bulunamadı.</p>
            )}
            {progressItems.map(item => {
              const pct = item.target_qty > 0
                ? Math.min(100, (Number(item.total_progress || 0) / Number(item.target_qty)) * 100)
                : 0
              return (
                <div key={item.name} style={{ marginBottom: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{item.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                      {fmt(item.total_progress)} / {fmt(item.target_qty)} {item.unit} &nbsp;
                      <strong style={{ color: pct >= 100 ? '#16a34a' : 'var(--color-primary)' }}>%{Math.round(pct)}</strong>
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#16a34a' : 'var(--color-primary)', borderRadius: 999, transition: 'width .4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sağ: Kritik Yol Timeline */}
        <div className="card">
          <div className="card-header"><h3>Kritik Yol (İlk 5)</h3></div>
          <div style={{ padding: '0.75rem 1.5rem' }}>
            {critical.length === 0 && (
              <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Kritik yol verisi bulunamadı.</p>
            )}
            {critical.slice(0, 5).map((item, i) => {
              const sTs   = item.planned_start ? new Date(item.planned_start).getTime() : projStart
              const eTs   = item.planned_end   ? new Date(item.planned_end).getTime()   : projEnd
              const barL  = projSpan > 0 ? Math.max(0, (sTs - projStart) / projSpan * 100) : 0
              const barW  = projSpan > 0 ? Math.max(2, (eTs - sTs) / projSpan * 100) : 10
              const barColor = item.status === 'tamamlandi' ? '#16a34a' : item.status === 'devam_ediyor' ? '#3b82f6' : '#94a3b8'
              const statBadge = item.status === 'tamamlandi' ? 'green' : item.status === 'devam_ediyor' ? 'blue' : 'gray'
              const statLabel = item.status === 'tamamlandi' ? 'Tamamlandı' : item.status === 'devam_ediyor' ? 'Devam Ediyor' : 'Beklemede'
              return (
                <div key={item.path_code || i} style={{ marginBottom: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.activity_name}
                    </span>
                    <span className={`badge ${statBadge}`} style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }}>{statLabel}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 4 }}>
                    {fmtDate(item.planned_start)} → {fmtDate(item.planned_end)}
                  </div>
                  <div style={{ position: 'relative', height: 8, background: '#f1f5f9', borderRadius: 999 }}>
                    <div style={{
                      position: 'absolute', left: `${barL}%`, width: `${barW}%`,
                      height: '100%', background: barColor, borderRadius: 999, opacity: 0.75,
                    }} />
                    {todayPos !== null && (
                      <div style={{ position: 'absolute', left: `${todayPos}%`, top: -2, bottom: -2, width: 2, background: '#ef4444', borderRadius: 1 }} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
              Tüm Kritik Yolu Gör →
            </span>
          </div>
        </div>
      </div>

      {/* ─── ALAN 3: Maliyet + Risk ─────────────────────── */}
      <div className="proj-dash-grid-2">

        {/* Sol: Maliyet Özeti */}
        <div className="card">
          <div className="card-header"><h3>Maliyet Özeti</h3></div>
          <div style={{ padding: '1rem 1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'Toplam Bütçe', value: `${fmtMoney(totalBudget)} USD`, color: 'var(--color-text)' },
                { label: 'Ödenen',       value: `${fmtMoney(paid)} USD`,        color: '#16a34a' },
                { label: 'Kalan',        value: `${fmtMoney(remaining)} USD`,   color: '#ef4444' },
              ].map(c => (
                <div key={c.label} style={{ textAlign: 'center', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                  <p style={{ fontSize: 10, color: 'var(--color-muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: c.color, margin: 0 }}>{c.value}</p>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>Bütçe Kullanımı</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>%{Math.round(budgetPct)}</span>
              </div>
              <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${budgetPct}%`, height: '100%', background: '#f59e0b', borderRadius: 999 }} />
              </div>
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.875rem 0 0.5rem' }}>En Büyük 5 Kalem</p>
            {top5Budget.map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{b.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{fmtMoney(b.planned_amount)} USD</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sağ: Risk Özeti */}
        <div className="card">
          <div className="card-header"><h3>Risk Özeti</h3></div>
          <div style={{ padding: '1rem 1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {[
                { sev: 'kritik', color: 'red',   label: 'Kritik' },
                { sev: 'yüksek', color: 'amber', label: 'Yüksek' },
                { sev: 'orta',   color: 'amber', label: 'Orta' },
                { sev: 'düşük',  color: 'blue',  label: 'Düşük' },
              ].map(s => (
                <span key={s.sev} className={`badge ${s.color}`} style={{ fontSize: 12, padding: '0.3rem 0.75rem' }}>
                  {riskCounts[s.sev] || 0} {s.label}
                </span>
              ))}
            </div>
            {top3Risks.length === 0 && (
              <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Açık risk bulunmuyor.</p>
            )}
            {top3Risks.map(r => (
              <div key={r.id} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', marginBottom: '0.5rem', borderLeft: `3px solid ${r.severity === 'kritik' ? '#ef4444' : r.severity === 'yüksek' ? '#f59e0b' : '#94a3b8'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)', flex: 1 }}>{r.title}</span>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span className={`badge ${SEV_COLOR[r.severity] || 'gray'}`} style={{ fontSize: 10 }}>{r.severity}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)', padding: '2px 6px', background: '#fff', borderRadius: 999 }}>
                      Skor: {(Number(r.probability || 0) * Number(r.impact || 0)).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── ALAN 4: Kalite + Kaynaklar ──────────────────── */}
      <div className="proj-dash-grid-2">

        {/* Sol: Kalite / Checklist */}
        <div className="card">
          <div className="card-header"><h3>Kalite / Kontrol Listesi</h3></div>
          <div style={{ padding: '1rem 1.5rem' }}>
            {[
              { label: 'Mekanik Kontrol Listesi', total: mechTotal, done: mechDone },
              { label: 'Elektrik Kontrol Listesi', total: elecTotal, done: elecDone },
              { label: 'Kalite Denetimleri (Geçti)', total: inspTotal, done: inspPassed },
            ].map(c => {
              const pct = c.total > 0 ? (c.done / c.total) * 100 : 0
              return (
                <div key={c.label} style={{ marginBottom: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{c.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                      {c.done} / {c.total} &nbsp;
                      <strong style={{ color: pct >= 100 ? '#16a34a' : 'var(--color-primary)' }}>%{Math.round(pct)}</strong>
                    </span>
                  </div>
                  <div style={{ height: 5, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#16a34a' : 'var(--color-primary)', borderRadius: 999 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sağ: Saha Kaynakları */}
        <div className="card">
          <div className="card-header"><h3>Saha Kaynakları (Son Rapor)</h3></div>
          <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{ padding: '0.875rem', background: '#f8fafc', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: 24 }}>👷</span>
              <div>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: '0 0 2px' }}>Aktif Personel</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', margin: 0, lineHeight: 1 }}>
                  {totalPersonnel > 0 ? fmt(totalPersonnel) : '—'}
                </p>
              </div>
            </div>
            <div style={{ padding: '0.875rem', background: '#f8fafc', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: 24 }}>🏗️</span>
              <div>
                <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: '0 0 2px' }}>İş Makineleri</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
                  Aktif: <strong style={{ color: '#16a34a' }}>{activeMachines}</strong>
                  &nbsp;|&nbsp;
                  Bekleyen: <strong style={{ color: '#f59e0b' }}>{waitingMachines}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  Ana Export
// ─────────────────────────────────────────────────────────
export default function TabGenel({ projectId, onSelectProject, selectedDate, setSelectedDate, filterDate }) {
  if (projectId) {
    return <ProjectDashboard projectId={projectId} filterDate={filterDate} />
  }
  return (
    <ProjectListView
      onSelectProject={onSelectProject}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
    />
  )
}
