import { useState, useEffect, useRef } from 'react'
import { unzipSync, strFromU8, strToU8 } from 'fflate'
import { supabase } from '../../../lib/supabase'
import { getProjects } from '../../../api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import ProgBar from '../../../components/ui/ProgBar'
import ExportButton from '../../../components/ui/ExportButton'
import DateNavigator from '../../../components/ui/DateNavigator'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import RealtimeStatusIndicator from '../../../components/ui/RealtimeStatusIndicator'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import { useWeather } from '../../../hooks/useWeather'
import { dateFilter } from '../../../utils/exportUtils'
import {
  fetchXlsxTemplate,
  fillTemplateSheet as fillExcelTemplateSheet,
  setTemplateCell as setExcelTemplateCell,
  downloadXlsxZip,
  formatExcelDate,
} from '../../../utils/excelUtils'

function dateTr(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('T')[0].split('-')
  return y && m && d ? `${d}.${m}.${y}` : String(iso)
}

function toIsoDate(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function parseIsoDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function getPeriodRange(type, filterDate) {
  const base = filterDate ? parseIsoDate(filterDate) : new Date()
  base.setHours(12, 0, 0, 0)

  if (type === 'gunluk') {
    const day = filterDate || toIsoDate(base)
    return { start: day, end: day, label: 'GÜNLÜK' }
  }

  if (type === 'haftalik') {
    if (filterDate) {
      const day = base.getDay() || 7
      const start = new Date(base)
      start.setDate(base.getDate() - day + 1)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { start: toIsoDate(start), end: toIsoDate(end), label: 'HAFTALIK' }
    }
    const end = new Date(base)
    end.setDate(base.getDate() - 1)
    const start = new Date(base)
    start.setDate(base.getDate() - 7)
    return { start: toIsoDate(start), end: toIsoDate(end), label: 'HAFTALIK' }
  }

  if (filterDate) {
    const start = new Date(base.getFullYear(), base.getMonth(), 1, 12)
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12)
    return { start: toIsoDate(start), end: toIsoDate(end), label: 'AYLIK' }
  }

  const prev = new Date(base.getFullYear(), base.getMonth() - 1, 1, 12)
  const start = new Date(prev.getFullYear(), prev.getMonth(), 1, 12)
  const end = new Date(prev.getFullYear(), prev.getMonth() + 1, 0, 12)
  return { start: toIsoDate(start), end: toIsoDate(end), label: 'AYLIK' }
}

function sumBy(rows, predicate) {
  return (rows || []).filter(predicate).reduce((sum, row) => sum + Number(row.count || 0), 0)
}

function norm(value) {
  return String(value || '').toLowerCase()
}

function isBadWeather(weatherValue) {
  return ['yağmurlu', 'yagmurlu', 'karlı', 'karli', 'fırtınalı', 'firtinali'].includes(norm(weatherValue))
}

function shortId(id) {
  return String(id || '').slice(0, 8)
}

// ─────────────────────────────────────────────────────────
//  Yardımcı
// ─────────────────────────────────────────────────────────
const STATUS_MAP = {
  aktif:          { badge: 'green', label: 'Aktif' },
  tamamlandı:     { badge: 'blue',  label: 'Tamamlandı' },
  beklemede:      { badge: 'amber', label: 'Beklemede' },
  'iptal edildi': { badge: 'red',   label: 'İptal' },
}

const TYPE_LABEL = {
  arazi_ges:            'Arazi GES',
  endustriyel_cati_ges: 'Endüstriyel Çatı GES',
  evsel_ges:            'Evsel GES',
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
function ProjectListView({ scopeProjectId, onSelectProject, selectedDate, setSelectedDate, onTabChange }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [konum, setKonum]       = useState(null)
  const [showCal, setShowCal]   = useState(false)
  const [calPos, setCalPos]     = useState({ top: 0, right: 0 })
  const [filteredPurchases, setFilteredPurchases] = useState(null)
  const [showApprovalMenu, setShowApprovalMenu] = useState(false)

  // Genel Bakış KPI özeti — kapsam seçicideki proje (veya Tüm Projeler) için canlı çekilir.
  const { data: summary, refreshing: summaryRefreshing, error: summaryError, refetch: refetchSummary } =
    useDashboardData('get_dashboard_summary', { p_project_id: scopeProjectId })
  const realtime = useRealtimeRefresh(
    ['tickets', 'invoices'],
    refetchSummary,
    { filter: scopeProjectId ? { column: 'project_id', value: scopeProjectId } : undefined }
  )
  const authorized          = summary?.authorized ?? true
  const openTickets         = summary?.open_tickets ?? null
  const criticalTickets     = summary?.critical_tickets ?? null
  const totalBudget         = summary?.total_budget ?? null
  const spentAmount         = summary?.spent_amount ?? null
  const pendingInvoices     = summary?.pending_invoices ?? null
  const recentNotifications = summary?.recent_notifications ?? []
  const approvalRef = useRef(null)
  const calRef      = useRef(null)
  const calBtnRef   = useRef(null)

  useEffect(() => {
    function h(e) {
      if (calRef.current && !calRef.current.contains(e.target) && !calBtnRef.current?.contains(e.target))
        setShowCal(false)
    }
    if (showCal) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showCal])

  useEffect(() => {
    function h(e) {
      if (approvalRef.current && !approvalRef.current.contains(e.target))
        setShowApprovalMenu(false)
    }
    if (showApprovalMenu) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showApprovalMenu])

  function openCal() {
    if (calBtnRef.current) {
      const r = calBtnRef.current.getBoundingClientRect()
      setCalPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setShowCal(v => !v)
  }

  async function applyReportProgress(projectRows) {
    const projectIds = projectRows.map(p => p.id).filter(Boolean)
    if (!projectIds.length) return projectRows

    const asOfDate = selectedDate ? toIsoDate(selectedDate) : null
    const [itemsRes, reportsRes] = await Promise.all([
      supabase
        .from('progress_items')
        .select('id, project_id, target_qty')
        .in('project_id', projectIds),
      (() => {
        let query = supabase
          .from('daily_reports')
          .select('id, project_id, report_date')
          .in('project_id', projectIds)
        if (asOfDate) query = query.lte('report_date', asOfDate)
        return query
      })(),
    ])

    if (itemsRes.error || reportsRes.error) throw (itemsRes.error || reportsRes.error)

    const items = itemsRes.data || []
    const reports = reportsRes.data || []
    const reportIds = reports.map(report => report.id).filter(Boolean)
    const reportProjectById = new Map(reports.map(report => [report.id, report.project_id]))

    let dailyRows = []
    if (reportIds.length) {
      const { data, error } = await supabase
        .from('progress_daily')
        .select('report_id, item_id, qty_added')
        .in('report_id', reportIds)
      if (error) throw error
      dailyRows = data || []
    }

    const qtyByItem = new Map()
    dailyRows.forEach(row => {
      if (!reportProjectById.has(row.report_id)) return
      qtyByItem.set(row.item_id, (qtyByItem.get(row.item_id) || 0) + Number(row.qty_added || 0))
    })

    const itemsByProject = new Map()
    items.forEach(item => {
      if (!itemsByProject.has(item.project_id)) itemsByProject.set(item.project_id, [])
      itemsByProject.get(item.project_id).push(item)
    })

    return projectRows.map(project => {
      const projectItems = itemsByProject.get(project.id) || []
      if (!projectItems.length) return project
      const pct = Math.round(projectItems.reduce((sum, item) => {
        const target = Number(item.target_qty || 0)
        const done = Number(qtyByItem.get(item.id) || 0)
        return sum + (target > 0 ? Math.min(done / target, 1) * 100 : 0)
      }, 0) / projectItems.length)
      return { ...project, progress: pct }
    })
  }

  // Başlangıç yüklemesi — proje listesi (KPI özeti artık ayrı useDashboardData ile çekiliyor)
  useEffect(() => {
    async function load() {
      const { data: projData } = await getProjects()
      let projectRows = projData || []
      const projectIds = projectRows.map(p => p.id).filter(Boolean)

      if (projectIds.length) {
        try {
          projectRows = await applyReportProgress(projectRows)
        } catch (reportProgressErr) {
          console.warn('Günlük rapor ilerlemesi hesaplanamadı, özet view deneniyor:', reportProgressErr)
          const { data: progressRows, error: progressErr } = await supabase
            .from('vw_project_progress_summary')
            .select('project_id, actual_progress_pct')
            .in('project_id', projectIds)

          if (!progressErr && progressRows) {
            const progressByProject = new Map(progressRows.map(row => [
              row.project_id,
              Math.round(Number(row.actual_progress_pct || 0)),
            ]))
            projectRows = projectRows.map(project => ({
              ...project,
              progress: progressByProject.has(project.id)
                ? progressByProject.get(project.id)
                : Math.round(Number(project.progress || 0)),
            }))
          }
        }
      }

      setProjects(projectRows)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [selectedDate])

  // selectedDate değiştiğinde filtreli proje ID'lerine göre görev + satın alma say
  useEffect(() => {
    if (loading || projects.length === 0) return

    const ids = selectedDate
      ? projects.filter(p => p.created_at && new Date(p.created_at) <= new Date(selectedDate)).map(p => p.id)
      : projects.map(p => p.id)

    if (ids.length === 0) {
      setFilteredPurchases(0)
      return
    }

    supabase.from('purchase_requests')
      .select('id', { count: 'exact', head: true })
      .in('project_id', ids)
      .eq('status', 'bekliyor')
      .then(({ count, error }) => {
        if (!error) setFilteredPurchases(count ?? 0)
      })
  }, [selectedDate, projects, loading])

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setKonum({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => setKonum('İstanbul'),
        { timeout: 5000 }
      )
    } else {
      setKonum('İstanbul')
    }
  }, [])

  const { loading: weatherLoading, error: weatherError, current: weatherCurrent, tomorrow: weatherTomorrow } = useWeather(konum)

  const displayProjects = selectedDate
    ? projects.filter(p => p.created_at && new Date(p.created_at) <= new Date(selectedDate))
    : projects

  if (!authorized) {
    return <UnauthorizedScopeNotice />
  }

  return (
    <>
      <DataStatusBanner error={summaryError} refreshing={summaryRefreshing} onRetry={refetchSummary} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <RealtimeStatusIndicator status={realtime.status} lastUpdated={realtime.lastUpdated} />
      </div>
      <div className="stats-grid" style={{ marginBottom: '1.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>

        {/* KPI 1: Proje Özeti */}
        <div className="stat-card" style={{ borderTop: '3px solid #003B8E', cursor: 'pointer' }} onClick={() => onTabChange?.('projeler')}>
          <p className="stat-label">📁 Proje Özeti</p>
          <p className="stat-value">{loading ? '…' : displayProjects.length}</p>
          <p className="stat-note">Toplam Proje</p>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--color-muted)' }}>Toplam Güç</span>
              <strong>{loading ? '…' : `${(displayProjects.reduce((s, p) => s + (p.capacity_kwp || 0), 0) / 1000).toFixed(2)} MWp`}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
              <span style={{ color: 'var(--color-muted)' }}>Kritik Risk</span>
              <strong style={{ color: (criticalTickets ?? 0) > 0 ? '#ef4444' : 'var(--color-text)' }}>
                {criticalTickets === null ? '…' : criticalTickets} proje
              </strong>
            </div>
          </div>
        </div>

        {/* KPI 2: Finans Özeti */}
        <div className="stat-card" style={{ borderTop: '3px solid #16a34a', cursor: 'pointer' }} onClick={() => onTabChange?.('finans')}>
          <p className="stat-label">💰 Finans Özeti</p>
          <p className="stat-value" style={{ fontSize: '1.1rem' }}>
            {totalBudget === null ? '…' : `${Number(totalBudget).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`}
          </p>
          <p className="stat-note">Toplam Bütçe</p>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: 'var(--color-muted)' }}>Gerçekleşen</span>
              <strong style={{ color: '#16a34a' }}>
                {spentAmount === null ? '…' : `${Number(spentAmount).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
              <span style={{ color: 'var(--color-muted)' }}>Kalan</span>
              <strong style={{ color: '#ef4444' }}>
                {totalBudget === null || spentAmount === null ? '…' : `${Number(Math.max(0, totalBudget - spentAmount)).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`}
              </strong>
            </div>
          </div>
        </div>

        {/* KPI 3: Bekleyen Onaylar */}
        <div
          ref={approvalRef}
          className="stat-card"
          style={{ borderTop: '3px solid #f59e0b', cursor: 'pointer' }}
          onClick={() => setShowApprovalMenu(v => !v)}
        >
          <p className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⏳ Bekleyen Onaylar</span>
            {showApprovalMenu && <span style={{ fontSize: 16, lineHeight: 1, color: '#94a3b8' }}>×</span>}
          </p>

          {showApprovalMenu ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {[
                { label: 'Satın Alma', tab: 'satin-alma', count: filteredPurchases, color: '#f59e0b' },
                { label: 'Fatura',     tab: 'finans',     count: pendingInvoices,   color: '#f59e0b' },
                { label: 'Ticket',     tab: 'tickets',    count: openTickets,       color: '#ef4444' },
              ].map(item => (
                <button
                  key={item.tab}
                  onClick={e => { e.stopPropagation(); onTabChange?.(item.tab); setShowApprovalMenu(false) }}
                  style={{
                    width: '100%', textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: 8,
                    padding: '10px 14px', background: '#f8fafc',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text)',
                    fontSize: 13, fontWeight: 600,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#93c5fd' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0' }}
                >
                  {item.label}
                  <strong style={{ color: item.color, fontSize: 17 }}>{item.count ?? '…'}</strong>
                </button>
              ))}
            </div>
          ) : (
            <>
              <p className="stat-value amber-text">
                {(filteredPurchases ?? 0) + (pendingInvoices ?? 0) + (openTickets ?? 0)}
              </p>
              <p className="stat-note">Toplam bekleyen · tıkla</p>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--color-muted)' }}>Satın Alma</span>
                  <strong style={{ color: '#f59e0b' }}>{filteredPurchases ?? '…'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                  <span style={{ color: 'var(--color-muted)' }}>Fatura</span>
                  <strong style={{ color: '#f59e0b' }}>{pendingInvoices ?? '…'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                  <span style={{ color: 'var(--color-muted)' }}>Ticket</span>
                  <strong style={{ color: (openTickets ?? 0) > 0 ? '#ef4444' : '#16a34a' }}>{openTickets ?? '…'}</strong>
                </div>
              </div>
            </>
          )}
        </div>

        {/* KPI 4: Son Bildirimler */}
        <div className="stat-card" style={{ borderTop: '3px solid #8b5cf6' }}>
          <p className="stat-label">🔔 Son Bildirimler</p>
          <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentNotifications.length === 0
              ? <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>Yeni bildirim yok</p>
              : recentNotifications.map(n => (
                <div key={n.id} style={{
                  fontSize: 10, padding: '4px 6px', borderRadius: 6,
                  background: '#f8fafc',
                  borderLeft: `3px solid ${n.severity === 'kritik' ? '#ef4444' : n.severity === 'yüksek' ? '#f59e0b' : '#94a3b8'}`,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: 'var(--color-text)', fontWeight: 500,
                }}>
                  {n.title}
                </div>
              ))
            }
          </div>
        </div>

        {/* KPI 5: Hava Durumu */}
        <div className="stat-card" style={{ borderTop: '3px solid #0ea5e9' }}>
          <p className="stat-label">🌤 Hava Durumu</p>
          {!konum || weatherLoading ? (
            <p className="stat-value" style={{ fontSize: '1.5rem' }}>…</p>
          ) : weatherError || !weatherCurrent ? (
            <p className="stat-note">Veri alınamadı</p>
          ) : (
            <>
              <p className="stat-value" style={{ fontSize: '1.85rem' }}>
                {weatherCurrent.emoji} {weatherCurrent.temp}°
              </p>
              <p className="stat-note">{weatherCurrent.label}</p>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--color-muted)' }}>Rüzgar</span>
                  <strong>{weatherCurrent.wind} km/h</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                  <span style={{ color: 'var(--color-muted)' }}>Nem</span>
                  <strong>%{weatherCurrent.humidity}</strong>
                </div>
                {weatherTomorrow && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: 'var(--color-muted)' }}>Yarın</span>
                    <strong>{weatherTomorrow.emoji} {weatherTomorrow.max}°/{weatherTomorrow.min}°</strong>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
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
//  Yatay Timeline (hover tooltip + scroll)
// ─────────────────────────────────────────────────────────
function TimelineStrip({ steps, fmtDate }) {
  const [hovered, setHovered] = useState(null)
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        minWidth: `${Math.max(steps.length * 88, 300)}px`,
        padding: '28px 16px 12px',
        position: 'relative',
      }}>
        {steps.map((item, i) => {
          const done    = item.status === 'tamamlandi'
          const active  = item.status === 'devam_ediyor'
          const dotColor  = done ? '#16a34a' : active ? '#003B8E' : '#cbd5e1'
          const lineColor = done && i < steps.length - 1 ? '#16a34a' : '#e2e8f0'
          const shortName = (item.activity_name || '').slice(0, 12) + ((item.activity_name || '').length > 12 ? '…' : '')
          return (
            <div key={item.path_code || i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {/* connecting line */}
              {i < steps.length - 1 && (
                <div style={{
                  position: 'absolute', top: 13, left: '50%', right: '-50%',
                  height: 2, background: lineColor, zIndex: 0,
                }} />
              )}
              {/* dot */}
              <div
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: 'relative', zIndex: 1,
                  width: 26, height: 26, borderRadius: '50%',
                  background: done ? '#16a34a' : active ? '#fff' : '#f1f5f9',
                  border: active ? `2.5px solid #003B8E` : `2px solid ${dotColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'default',
                  boxShadow: active ? '0 0 0 3px rgba(0,59,142,0.15)' : 'none',
                  flexShrink: 0,
                }}
              >
                {done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#003B8E' }} />}

                {/* tooltip */}
                {hovered === i && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1e293b', color: '#fff', padding: '6px 10px',
                    borderRadius: 8, fontSize: 11, whiteSpace: 'nowrap', zIndex: 20,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.18)', pointerEvents: 'none',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.activity_name}</div>
                    <div style={{ opacity: 0.8 }}>İlerleme: %{item.progress_pct || 0}</div>
                    <div style={{ opacity: 0.8 }}>{fmtDate(item.planned_start)} → {fmtDate(item.planned_end)}</div>
                  </div>
                )}
              </div>
              {/* label */}
              <div style={{ fontSize: 9.5, color: done ? '#16a34a' : active ? '#003B8E' : '#94a3b8', marginTop: 5, textAlign: 'center', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>
                {shortName}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  Proje Dashboard'u (projectId varken)
// ─────────────────────────────────────────────────────────
function ProjectDashboard({ projectId, filterDate }) {
  const effectiveDate = filterDate || new Date().toISOString().split('T')[0]

  const [project, setProject]           = useState(null)
  const [tasks, setTasks]               = useState([])
  const [avgProgress, setAvgProgress]   = useState(0)
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
  const [openTickets, setOpenTickets]   = useState(null)
  const [pendingPR, setPendingPR]       = useState(null)
  const [recentTickets, setRecentTickets] = useState([])
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [reportExporting, setReportExporting] = useState(null)
  const [reportExportError, setReportExportError] = useState('')

  useEffect(() => {
    if (!projectId) return
    let alive = true
    setLoading(true)

    async function load() {
      const { data, error } = await supabase.rpc('get_project_dashboard', {
        p_project_id:     projectId,
        p_effective_date: effectiveDate,
      })
      if (!alive) return
      if (error) { console.error('get_project_dashboard error:', error); setLoading(false); return }

      const taskList = data.tasks || []
      setProject(data.project || null)
      setTasks(taskList)
      setProgressItems(data.progress_items || [])
      setCritical(data.critical || [])
      setBudgetLines(data.budget_lines || [])
      setInvoices(data.invoices || [])
      setRisks(data.risks || [])
      setWeather(data.weather || null)
      setLostDays(data.lost_days || 0)
      setMechCheck(data.mech_check || [])
      setElecCheck(data.elec_check || [])
      setInspections(data.inspections || [])
      setOpenTickets(data.open_tickets ?? 0)
      setPendingPR(data.pending_pr ?? 0)
      setRecentTickets(data.recent_tickets || [])
      setPersonnel(data.personnel || [])
      setMachinery(data.machinery || [])

      // avgProgress: tarih filtreli progress_items toplamından hesapla
      const items = data.progress_items || []
      if (items.length) {
        const progresses = items.map(item =>
          Math.min(Number(item.total_progress || 0) / (Number(item.target_qty) || 1), 1.0)
        )
        setAvgProgress((progresses.reduce((s, v) => s + v, 0) / progresses.length) * 100)
      } else {
        setAvgProgress(
          taskList.length
            ? taskList.reduce((s, t) => s + Number(t.progress_pct || 0), 0) / taskList.length
            : 0
        )
      }

      setLoading(false)
    }

    load().catch(err => { console.error('get_project_dashboard error:', err); if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId, effectiveDate])

  async function getReportsBetween(start, end) {
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('project_id', projectId)
      .gte('report_date', start)
      .lte('report_date', end)
      .order('report_date')
    return data || []
  }

  async function getProgressTotalsByDate(endDate) {
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('id, report_date')
      .eq('project_id', projectId)
      .lte('report_date', endDate)

    const reportIds = (reports || []).map(r => r.id)
    if (!reportIds.length) return new Map()

    const { data: dailyRows } = await supabase
      .from('progress_daily')
      .select('item_id, qty_added, report_id')
      .in('report_id', reportIds)

    const totals = new Map()
    ;(dailyRows || []).forEach(row => {
      totals.set(row.item_id, (totals.get(row.item_id) || 0) + Number(row.qty_added || 0))
    })
    return totals
  }

  async function getDailyReportData(selectedDate) {
    const fallbackDate = selectedDate || effectiveDate
    const [{ data: dailyReport }, { data: latestDailyReport }] = await Promise.all([
      supabase
        .from('daily_reports')
        .select('*')
        .eq('project_id', projectId)
        .eq('report_date', fallbackDate)
        .maybeSingle(),
      supabase
        .from('daily_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const resolvedReport = dailyReport || latestDailyReport
    const reportId = resolvedReport?.id
    const [
      { data: proj },
      { data: progItems },
      { data: taskRows },
      personnelRes,
      machineryRes,
      progressTotals,
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('progress_items').select('*').eq('project_id', projectId).order('order_index'),
      supabase.from('project_tasks').select('*').eq('project_id', projectId).in('status', ['devam_ediyor', 'tamamlandi']).order('task_code'),
      reportId ? supabase.from('personnel_log_entries').select('*').eq('report_id', reportId) : Promise.resolve({ data: [] }),
      reportId ? supabase.from('machinery_logs').select('*').eq('report_id', reportId) : Promise.resolve({ data: [] }),
      getProgressTotalsByDate(fallbackDate),
    ])

    return {
      project: proj || project,
      dailyReport: resolvedReport,
      progressItems: progItems || [],
      tasks: taskRows || [],
      personnel: personnelRes.data || [],
      machinery: machineryRes.data || [],
      progressTotals,
    }
  }

  async function exportDailyReport(period) {
    const templateBuffer = await fetchXlsxTemplate(['/fons-solar-gunluk-rapor-sablonu.xlsx', '/excel/fons-solar-gunluk-rapor-sablonu.xlsx'])
    const files = unzipSync(new Uint8Array(templateBuffer))
    const data = await getDailyReportData(period.start)

    let reportXml = strFromU8(files['xl/worksheets/sheet1.xml'])
    reportXml = setExcelTemplateCell(reportXml, 'E4', data.project?.id || projectId)
    reportXml = setExcelTemplateCell(reportXml, 'E5', formatExcelDate(data.dailyReport?.report_date || period.start))
    reportXml = setExcelTemplateCell(reportXml, 'E6', data.project?.name || '')
    reportXml = setExcelTemplateCell(reportXml, 'E7', data.dailyReport?.weather || '')
    reportXml = setExcelTemplateCell(reportXml, 'E8', data.dailyReport?.notes || '')

    const personel = data.personnel
    const p = (departmentIncludes, shiftIncludes) => sumBy(personel, row => {
      const dep = norm(row.department)
      const sh = norm(row.shift)
      return departmentIncludes.some(key => dep.includes(key)) && (!shiftIncludes?.length || shiftIncludes.some(key => sh.includes(key)))
    })
    reportXml = setExcelTemplateCell(reportXml, 'D12', p(['mekanik'], ['gündüz', 'gunduz']))
    reportXml = setExcelTemplateCell(reportXml, 'H12', p(['mekanik'], ['gece']))
    reportXml = setExcelTemplateCell(reportXml, 'D13', p(['elektrik'], ['gündüz', 'gunduz']))
    reportXml = setExcelTemplateCell(reportXml, 'H13', p(['elektrik'], ['gece']))
    reportXml = setExcelTemplateCell(reportXml, 'D14', p(['yevmiyeci'], []))
    reportXml = setExcelTemplateCell(reportXml, 'D15', p(['idari', 'teknik'], []))

    ;(data.machinery || []).slice(0, 4).forEach((machine, index) => {
      reportXml = setExcelTemplateCell(reportXml, `C${20 + index}`, Number(machine.count || 0))
      reportXml = setExcelTemplateCell(reportXml, `D${20 + index}`, machine.status || '')
    })
    files['xl/worksheets/sheet1.xml'] = strToU8(reportXml)

    fillExcelTemplateSheet(files, 2, data.progressItems.map(item => [
      undefined,
      item.name || '',
      item.unit || '',
      item.target_qty || 0,
      data.progressTotals.get(item.id) || 0,
      '',
    ]), 5)

    fillExcelTemplateSheet(files, 3, data.tasks.map(task => [
      undefined,
      task.task_code || '',
      task.task_name || '',
      task.status || '',
      Number(task.progress_pct || 0) / 100,
      '',
    ]), 5)

    downloadXlsxZip(files, `gunluk-rapor-${projectId}-${period.start}.xlsx`)
  }

  async function exportPeriodicReport(type, period) {
    const templateBuffer = await fetchXlsxTemplate(['/fons-solar-periyodik-rapor-sablonu.xlsx', '/excel/fons-solar-periyodik-rapor-sablonu.xlsx'])
    const files = unzipSync(new Uint8Array(templateBuffer))

    const reportsInPeriod = await getReportsBetween(period.start, period.end)
    const reportIds = reportsInPeriod.map(r => r.id)
    const reportById = new Map(reportsInPeriod.map(r => [r.id, r]))

    const [
      { data: proj },
      { data: progItems },
      { data: risksData },
      { data: budgetData },
      { data: invoicesData },
      { data: requestsData },
      { data: ticketsData },
      personnelRes,
      machineryRes,
      progressBefore,
      progressEnd,
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('progress_items').select('*').eq('project_id', projectId).order('order_index'),
      supabase.from('project_risks').select('*').eq('project_id', projectId).eq('status', 'açık'),
      supabase.from('budget_lines').select('*').eq('project_id', projectId).order('order_index'),
      supabase.from('invoices').select('*').eq('project_id', projectId).lte('invoice_date', period.end),
      supabase.from('purchase_requests').select('*').eq('project_id', projectId).gte('created_at', `${period.start}T00:00:00`).lte('created_at', `${period.end}T23:59:59`),
      supabase.from('tickets').select('*').eq('project_id', projectId).gte('created_at', `${period.start}T00:00:00`).lte('created_at', `${period.end}T23:59:59`),
      reportIds.length ? supabase.from('personnel_log_entries').select('*').in('report_id', reportIds) : Promise.resolve({ data: [] }),
      reportIds.length ? supabase.from('machinery_logs').select('*').in('report_id', reportIds) : Promise.resolve({ data: [] }),
      getProgressTotalsByDate(toIsoDate(new Date(parseIsoDate(period.start).getTime() - 86400000))),
      getProgressTotalsByDate(period.end),
    ])

    const requestIds = (requestsData || []).map(r => r.id)
    const { data: requestItems } = requestIds.length
      ? await supabase.from('purchase_request_items').select('*').in('request_id', requestIds)
      : { data: [] }

    const projectData = proj || project
    const progressRows = (progItems || []).map(item => {
      const before = progressBefore.get(item.id) || 0
      const end = progressEnd.get(item.id) || 0
      return [undefined, item.name || '', item.unit || '', before, end, undefined, item.target_qty || 0]
    })

    let summaryXml = strFromU8(files['xl/worksheets/sheet1.xml'])
    summaryXml = setExcelTemplateCell(summaryXml, 'A3', `${projectData.name || projectId}   |   ${formatExcelDate(period.start)} – ${formatExcelDate(period.end)}   |   ${period.label}`)
    const avgProgressPct = (progItems || []).length
      ? ((progItems || []).reduce((sum, item) => {
          const target = Number(item.target_qty || 0)
          return sum + (target > 0 ? Math.min((progressEnd.get(item.id) || 0) / target, 1) : 0)
        }, 0) / (progItems || []).length) * 100
      : 0
    const planned = calcPlannedAt(tasks, parseIsoDate(period.end))
    const totalBudgetAmount = (budgetData || []).reduce((sum, item) => sum + Number(item.planned_amount || 0), 0)
    const paidUntilEnd = (invoicesData || []).filter(inv => !inv.invoice_date || inv.invoice_date <= period.end).filter(inv => inv.status === 'ödendi').reduce((sum, inv) => sum + Number(inv.amount || 0), 0)
    const totalPersonnelDays = (personnelRes.data || []).reduce((sum, row) => sum + Number(row.count || 0), 0)
    const activeMachineAvg = reportsInPeriod.length
      ? Math.round((machineryRes.data || []).filter(m => norm(m.status).includes('çalış') || norm(m.status).includes('calis')).reduce((sum, m) => sum + Number(m.count || 0), 0) / reportsInPeriod.length)
      : 0

    summaryXml = setExcelTemplateCell(summaryXml, 'G7', projectData.target_date ? Math.round((parseIsoDate(projectData.target_date) - new Date()) / 86400000) : '')
    summaryXml = setExcelTemplateCell(summaryXml, 'G11', avgProgressPct / 100)
    summaryXml = setExcelTemplateCell(summaryXml, 'G15', (avgProgressPct - planned) / 100)
    summaryXml = setExcelTemplateCell(summaryXml, 'K7', reportsInPeriod.filter(r => isBadWeather(r.weather)).length)
    summaryXml = setExcelTemplateCell(summaryXml, 'K11', totalPersonnelDays)
    summaryXml = setExcelTemplateCell(summaryXml, 'K15', activeMachineAvg)
    summaryXml = setExcelTemplateCell(summaryXml, 'O7', totalBudgetAmount > 0 ? paidUntilEnd / totalBudgetAmount : 0)
    summaryXml = setExcelTemplateCell(summaryXml, 'O11', (risksData || []).length)
    files['xl/worksheets/sheet1.xml'] = strToU8(summaryXml)
    fillExcelTemplateSheet(files, 1, progressRows, 16)

    const personnelByReport = reportIds.reduce((acc, id) => ({ ...acc, [id]: (personnelRes.data || []).filter(row => row.report_id === id) }), {})
    const machineryByReport = reportIds.reduce((acc, id) => ({ ...acc, [id]: (machineryRes.data || []).filter(row => row.report_id === id) }), {})
    fillExcelTemplateSheet(files, 2, reportsInPeriod.map(report => {
      const pr = personnelByReport[report.id] || []
      const mr = machineryByReport[report.id] || []
      return [
        undefined,
        formatExcelDate(report.report_date),
        report.weather || '',
        pr.reduce((sum, row) => sum + Number(row.count || 0), 0),
        sumBy(pr, row => norm(row.department).includes('mekanik')),
        sumBy(pr, row => norm(row.department).includes('elektrik')),
        sumBy(pr, row => norm(row.department).includes('yevmiyeci')),
        sumBy(mr, row => norm(row.status).includes('çalış') || norm(row.status).includes('calis')),
        sumBy(mr, row => !(norm(row.status).includes('çalış') || norm(row.status).includes('calis'))),
        isBadWeather(report.weather) ? 1 : 0,
        undefined,
        undefined,
        report.notes || '',
      ]
    }), 6)

    fillExcelTemplateSheet(files, 3, (progItems || []).map(item => [
      undefined,
      item.name || '',
      item.unit || '',
      item.target_qty || 0,
      progressBefore.get(item.id) || 0,
      progressEnd.get(item.id) || 0,
    ]), 6)

    fillExcelTemplateSheet(files, 4, reportsInPeriod.map(report => {
      const pr = personnelByReport[report.id] || []
      const mr = machineryByReport[report.id] || []
      const count = (depKeys, shiftKeys) => sumBy(pr, row => depKeys.some(dep => norm(row.department).includes(dep)) && shiftKeys.some(shift => norm(row.shift).includes(shift)))
      return [
        undefined,
        formatExcelDate(report.report_date),
        undefined,
        count(['mekanik'], ['gündüz', 'gunduz']),
        count(['mekanik'], ['gece']),
        count(['elektrik'], ['gündüz', 'gunduz']),
        count(['elektrik'], ['gece']),
        sumBy(pr, row => norm(row.department).includes('yevmiyeci')),
        sumBy(pr, row => norm(row.department).includes('idari') || norm(row.department).includes('teknik')),
        sumBy(mr, row => norm(row.status).includes('çalış') || norm(row.status).includes('calis')),
        sumBy(mr, row => !(norm(row.status).includes('çalış') || norm(row.status).includes('calis'))),
      ]
    }), 6)

    fillExcelTemplateSheet(files, 5, (budgetData || []).map(line => [
      undefined,
      line.category || '',
      line.name || '',
      line.planned_amount || 0,
      undefined,
      paidUntilEnd,
    ]), 6)
    const requestTotals = new Map()
    ;(requestItems || []).forEach(item => {
      const total = Number(item.total_amount ?? item.amount ?? (Number(item.quantity || 0) * Number(item.unit_price || 0)))
      requestTotals.set(item.request_id, (requestTotals.get(item.request_id) || 0) + total)
    })
    fillExcelTemplateSheet(files, 5, (requestsData || []).map(req => [
      undefined,
      formatExcelDate(req.created_at),
      shortId(req.id),
      req.title || '',
      undefined,
      undefined,
      requestTotals.get(req.id) || 0,
      req.status || '',
    ]), 26)
    fillExcelTemplateSheet(files, 5, (invoicesData || []).filter(inv => inv.invoice_date >= period.start && inv.invoice_date <= period.end).map(inv => [
      undefined,
      formatExcelDate(inv.invoice_date),
      inv.invoice_no || '',
      inv.description || '',
      undefined,
      inv.amount || 0,
      undefined,
      inv.status || '',
    ]), 50)

    fillExcelTemplateSheet(files, 6, (risksData || []).map((risk, index) => [
      undefined,
      index + 1,
      risk.title || '',
      risk.category || risk.severity || '',
      risk.probability || '',
      risk.impact || '',
      undefined,
      risk.status || '',
      risk.mitigation || '',
      risk.responsible || '',
    ]), 6)
    fillExcelTemplateSheet(files, 6, (ticketsData || []).map(ticket => [
      undefined,
      formatExcelDate(ticket.created_at),
      shortId(ticket.id),
      ticket.title || '',
      ticket.category || '',
      ticket.severity || '',
      ticket.status || '',
      ticket.assigned_to || '',
    ]), 36)

    const fileName = type === 'haftalik'
      ? `haftalik-rapor-${projectId}-${period.start}-${period.end}.xlsx`
      : `aylik-rapor-${projectId}-${period.start.slice(0, 7)}.xlsx`
    downloadXlsxZip(files, fileName)
  }

  async function handleReportExport(type) {
    setReportExportError('')
    setReportExporting(type)
    setExportMenuOpen(false)
    try {
      const period = getPeriodRange(type, filterDate)
      if (type === 'gunluk') {
        await exportDailyReport(period)
      } else {
        await exportPeriodicReport(type, period)
      }
    } catch (err) {
      const msg = err.message || 'Rapor dışa aktarılamadı'
      setReportExportError(`❌ ${msg}`)
    } finally {
      setReportExporting(null)
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, flexDirection: 'column', gap: 12,
      }}>
        <div className="spin" style={{
          width: 32, height: 32, border: '3px solid #e2e8f0',
          borderTop: '3px solid #003B8E', borderRadius: '50%',
        }} />
        <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: 0 }}>
          Proje verisi yükleniyor…
        </p>
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
  const today = new Date(effectiveDate + 'T00:00:00')

  // KPI 1 – Kalan gün
  const targetD   = project.target_date ? new Date(project.target_date) : null
  const kalanGun  = targetD ? Math.round((targetD - today) / 86400000) : null
  const gunColor  = kalanGun === null ? '#64748b' : kalanGun > 30 ? '#16a34a' : kalanGun >= 0 ? '#f59e0b' : '#ef4444'
  const gunLabel  = kalanGun === null ? '—' : kalanGun < 0 ? `${Math.abs(kalanGun)} gün gecikti` : `${kalanGun} gün kaldı`

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.3rem', flexWrap: 'wrap', position: 'relative' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
            {project.name}
          </h2>
          {project.project_type && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px',
              borderRadius: 999, background: '#eff6ff', color: '#1d4ed8',
              border: '1px solid #bfdbfe', letterSpacing: '0.02em', whiteSpace: 'nowrap',
            }}>
              {TYPE_LABEL[project.project_type] ?? project.project_type}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExportMenuOpen(open => !open)}
            disabled={!!reportExporting}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #bfdbfe',
              background: reportExporting ? '#f8fafc' : '#eff6ff',
              color: '#1d4ed8',
              fontSize: 12,
              fontWeight: 700,
              cursor: reportExporting ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {reportExporting ? 'Hazırlanıyor…' : 'Dışa Aktar'} <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {exportMenuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 8px)',
              zIndex: 20,
              width: 190,
              background: '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              boxShadow: '0 12px 30px rgba(15,23,42,.14)',
              padding: 6,
            }}>
              {[
                ['gunluk', '📋 Günlük Rapor'],
                ['haftalik', '📊 Haftalık Rapor'],
                ['aylik', '📈 Aylık Rapor'],
              ].map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleReportExport(type)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 10px',
                    border: 0,
                    borderRadius: 8,
                    background: 'transparent',
                    color: 'var(--color-text)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {reportExportError && (
          <p style={{ margin: '0 0 0.75rem', color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
            {reportExportError}
          </p>
        )}
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


      {/* ─── SATIR 1 — Saha Durumu ──────────────────────── */}
      <p style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>SAHA DURUMU</p>
      <div className="proj-dash-kpi-grid" style={{ marginBottom: '0.75rem' }}>

        {/* Kalan Gün */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Kalan Gün</p>
          <p style={{ fontSize: '1.875rem', fontWeight: 700, color: gunColor, margin: 0, lineHeight: 1 }}>
            {kalanGun === null ? '—' : Math.abs(kalanGun)}
          </p>
          <p style={{ fontSize: 11, color: gunColor, margin: 0 }}>{gunLabel}</p>
        </div>

        {/* Genel İlerleme */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">
            Genel İlerleme
            {tasks.length > 0 && (
              <span style={{ fontSize: 9, color: 'var(--color-muted)', fontWeight: 400, marginLeft: 4 }}>
                ({tasks.length} görev)
              </span>
            )}
          </p>
          <div className="kpi-card-ring-row">
            <div style={{ position: 'relative', width: 68, height: 68 }}>
              <Ring pct={avgProgress} size={68} sw={7} color="#003B8E" />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#003B8E' }}>
                {Math.round(avgProgress)}%
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>
              Başlamış<br />görev ortalaması
            </p>
          </div>
        </div>

        {/* Plan / Gerçek Sapma */}
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

        {/* Hava / Kayıp Gün */}
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

      {/* ─── SATIR 2 — Saha Kaynakları ──────────────────── */}
      <p style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>SAHA KAYNAKLARI</p>
      <div className="proj-dash-kpi-grid" style={{ marginBottom: '0.75rem' }}>

        {/* Aktif Personel */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Aktif Personel</p>
          <p style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, lineHeight: 1 }}>
            {totalPersonnel > 0 ? fmt(totalPersonnel) : '—'}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>
            Son rapor{weather ? ` · ${WEATHER_LABEL[weather] || weather}` : ''}
          </p>
        </div>

        {/* Çalışan Makine */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Çalışan Makine</p>
          <p style={{ fontSize: '1.875rem', fontWeight: 700, color: '#16a34a', margin: 0, lineHeight: 1 }}>
            {activeMachines}
          </p>
          <p style={{ fontSize: 11, color: '#f59e0b', margin: 0 }}>
            Bekleyen: <strong>{waitingMachines}</strong>
          </p>
        </div>

        {/* Açık Ticket */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Açık Ticket</p>
          <p style={{ fontSize: '1.875rem', fontWeight: 700, color: openTickets > 0 ? '#ef4444' : '#16a34a', margin: 0, lineHeight: 1 }}>
            {openTickets === null ? '…' : openTickets}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>Açık bildirim</p>
        </div>

        {/* Açık Riskler */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">
            Açık Riskler
            <span style={{ fontSize: 9, color: 'var(--color-muted)', fontWeight: 400, marginLeft: 4 }}>(güncel)</span>
          </p>
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
      </div>

      {/* ─── SATIR 3 — Mali Durum ───────────────────────── */}
      <p style={{ fontSize: 10, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>MALİ DURUM</p>
      <div className="proj-dash-kpi-grid" style={{ marginBottom: '0.75rem' }}>

        {/* Toplam Bütçe */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Toplam Bütçe</p>
          <div className="kpi-card-ring-row">
            <div style={{ position: 'relative', width: 68, height: 68 }}>
              <Ring pct={budgetPct} size={68} sw={7} color="#f59e0b" />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
                {Math.round(budgetPct)}%
              </div>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 2px' }}>
                {fmtMoney(totalBudget)} ₺
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>Planlanan bütçe</p>
            </div>
          </div>
        </div>

        {/* Ödenen / Kalan */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">
            Ödenen / Kalan
            <span style={{ fontSize: 9, color: 'var(--color-muted)', fontWeight: 400, marginLeft: 4 }}>(güncel)</span>
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', margin: '0 0 4px' }}>
            Ödenen: {fmtMoney(paid)} ₺
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', margin: 0 }}>
            Kalan: {fmtMoney(remaining)} ₺
          </p>
        </div>

        {/* Bekleyen Satın Alma */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Bekleyen Satın Alma</p>
          <p style={{ fontSize: '1.875rem', fontWeight: 700, color: pendingPR > 0 ? '#ef4444' : '#16a34a', margin: 0, lineHeight: 1 }}>
            {pendingPR === null ? '…' : pendingPR}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>Onay bekleyen talep</p>
        </div>

        {/* Kritik Yol */}
        <div className="kpi-card-compact">
          <p className="kpi-card-compact-label">Kritik Yol</p>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 4px', lineHeight: 1 }}>
            {critTotal}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: '0 0 4px' }}>
            başlamış aktivite
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge green" style={{ fontSize: 10 }}>{critDone} tamam</span>
            <span className="badge blue" style={{ fontSize: 10 }}>{critOngoing} devam</span>
          </div>
        </div>
      </div>

      {/* ─── ALAN 1: Teknik Özet + S-Eğrisi ─────────────── */}
      <div className="proj-dash-grid-2">

        {/* Sol: Teknik Özet */}
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 1rem' }}>Proje Teknik Özeti</h3>
          {project.project_type && (
            <InfoRow label="Proje Türü" value={TYPE_LABEL[project.project_type] ?? project.project_type} />
          )}
          <InfoRow label="DC Güç"      value={`${fmt(project.capacity_kwp)} kWp`} />
          <InfoRow label="AC Güç"      value={`${fmt(project.capacity_kwe)} kWe`} />
          {project.storage_kwh ? (
            <InfoRow label="Depolama" value={`${fmt(project.storage_kwh)} kWh`} />
          ) : null}
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

        {/* Sağ: Kritik Yol Timeline + S-Eğrisi */}
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

        {/* Sağ: Kritik Yol Timeline (yatay) */}
        <div className="card">
          <div className="card-header">
            <h3>Projenin Gidişatı</h3>
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
              Plan %{Math.round(planPct)} / Gerçek %{Math.round(avgProgress)}
            </span>
          </div>
          {critical.length === 0 ? (
            <p style={{ color: 'var(--color-muted)', fontSize: 13, padding: '1rem 1.5rem' }}>Kritik yol verisi bulunamadı.</p>
          ) : (
            <TimelineStrip steps={critical} fmtDate={fmtDate} />
          )}
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
                { label: 'Toplam Bütçe', value: `${fmtMoney(totalBudget)} ₺`, color: 'var(--color-text)' },
                { label: 'Ödenen',       value: `${fmtMoney(paid)} ₺`,        color: '#16a34a' },
                { label: 'Kalan',        value: `${fmtMoney(remaining)} ₺`,   color: '#ef4444' },
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
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>{fmtMoney(b.planned_amount)} ₺</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sağ: Ticket Özeti */}
        <div className="card">
          <div className="card-header">
            <h3>Güncel Ticketlar</h3>
            <button
              type="button"
              style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => alert('Ticket sekmesine gidin')}
            >
              Tümünü Gör →
            </button>
          </div>
          <div style={{ padding: '0.75rem 1.5rem', maxHeight: 260, overflowY: 'auto' }}>
            {recentTickets.length === 0 && (
              <p style={{ color: 'var(--color-muted)', fontSize: 13, textAlign: 'center', padding: '1rem 0' }}>Açık ticket bulunmuyor.</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {recentTickets.map(ticket => (
                <div key={ticket.id} style={{
                  padding: '8px 10px', background: '#f8fafc',
                  borderRadius: 8, border: '1px solid #e2e8f0',
                  borderLeft: `3px solid ${ticket.severity === 'kritik' ? '#ef4444' : ticket.severity === 'yüksek' ? '#f59e0b' : '#94a3b8'}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ticket.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
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
export default function TabGenel({ projectId, scopeProjectId, onSelectProject, selectedDate, setSelectedDate, filterDate, onTabChange }) {
  if (projectId) {
    return <ProjectDashboard projectId={projectId} filterDate={filterDate} />
  }
  return (
    <ProjectListView
      scopeProjectId={scopeProjectId}
      onSelectProject={onSelectProject}
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      onTabChange={onTabChange}
    />
  )
}
