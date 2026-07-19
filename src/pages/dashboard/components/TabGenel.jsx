import { useState, useEffect, useRef } from 'react'
import { unzipSync, strFromU8, strToU8 } from 'fflate'
import { supabase } from '../../../lib/supabase'
import { getProjects } from '../../../api'
import ProgBar from '../../../components/ui/ProgBar'
import { PROJECT_STATUS_META } from '../../../utils/projectStatus'
import ExportButton from '../../../components/ui/ExportButton'
import DateNavigator from '../../../components/ui/DateNavigator'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
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
  useRealtimeRefresh(
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

  // Riskli gecikmeler — yalnızca iç yönetici dashboard'u, vw_delayed_tasks (personel adı dahil) hiçbir export'a gitmez.
  const { data: delayedData } = useDashboardData('get_delayed_tasks_scoped', { p_project_id: scopeProjectId })
  const delayedTasks = delayedData?.tasks ?? []
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

  // Başlangıç yüklemesi — proje listesi (KPI özeti artık ayrı useDashboardData ile çekiliyor).
  // İlerleme, projects.progress kolonundan doğrudan okunuyor (fn_sync_project_progress
  // tarafından kategori-ağırlıklı olarak güncel tutuluyor) — client-side yeniden hesap yok.
  useEffect(() => {
    async function load() {
      const { data: projData } = await getProjects()
      const projectRows = (projData || []).map(project => ({
        ...project,
        progress: Math.round(Number(project.progress || 0)),
      }))
      setProjects(projectRows)
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [])

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

        {/* KPI: Riskli Gecikmeler — sadece yönetici dashboard'u, export'a girmez */}
        <div className="stat-card" style={{ borderTop: '3px solid #ef4444' }}>
          <p className="stat-label">⏰ Riskli Gecikmeler</p>
          <p className="stat-value" style={{ color: delayedTasks.length > 0 ? '#dc2626' : undefined }}>
            {delayedTasks.length}
          </p>
          <div style={{ maxHeight: 100, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {delayedTasks.length === 0
              ? <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>Gecikmiş görev yok</p>
              : delayedTasks.slice(0, 6).map(t => (
                <div key={t.id} style={{
                  fontSize: 10, padding: '4px 6px', borderRadius: 6,
                  background: '#f8fafc',
                  borderLeft: `3px solid ${t.delaySeverity === 'kritik' ? '#ef4444' : t.delaySeverity === 'yüksek' ? '#f59e0b' : '#94a3b8'}`,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: 'var(--color-text)', fontWeight: 500,
                }}>
                  {t.taskName} · {t.daysOverdue}g {!scopeProjectId ? `· ${t.projectName}` : ''}
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
                const s = PROJECT_STATUS_META[p.status] || { badgeClass: 'blue', label: 'Aktif' }
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelectProject?.(p.id, p.name)}>
                    <td className="fw">{p.name}</td>
                    <td>{p.location || '—'}</td>
                    <td>{p.capacity_kwp?.toLocaleString('tr-TR') || '—'}</td>
                    <td>{p.capacity_kwe?.toLocaleString('tr-TR') || '—'}</td>
                    <td><span className={`badge ${s.badgeClass}`}>● {s.label}</span></td>
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
            const s = PROJECT_STATUS_META[p.status] || { badgeClass: 'blue', label: 'Aktif' }
            return (
              <div key={p.id} className="proj-mob-card" onClick={() => onSelectProject?.(p.id, p.name)}>
                <div className="proj-mob-card-title">{p.name}</div>
                <div className="proj-mob-card-sub">
                  <span>{p.location || '—'}</span>
                  {p.capacity_kwp && <><span style={{ color: '#D1D5DB' }}>·</span><span>{p.capacity_kwp.toLocaleString('tr-TR')} kWp</span></>}
                </div>
                <div className="proj-mob-card-prog">
                  <span className={`badge ${s.badgeClass}`}>● {s.label}</span>
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
//  Ana Export
// ─────────────────────────────────────────────────────────
export default function TabGenel({ scopeProjectId, onSelectProject, selectedDate, setSelectedDate, onTabChange }) {
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
