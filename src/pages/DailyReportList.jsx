import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import DailyReportDetail from './DailyReportDetail'
import { exportToExcel, exportToPdf } from '../utils/exportUtils'

const PAGE_SIZE = 10

const WEATHER_EMOJI = {
  'Güneşli': '☀️', 'Parçalı Bulutlu': '⛅', 'Bulutlu': '☁️',
  'Yağmurlu': '🌧️', 'Karlı': '🌨️', 'Fırtınalı': '⛈️', 'Sisli': '🌫️',
  'açık': '☀️', 'parçalı bulutlu': '⛅', 'bulutlu': '☁️',
  'yağmurlu': '🌧️', 'karlı': '🌨️', 'fırtınalı': '⛈️',
}

const STATUS_COLORS = {
  'İyi':          { bg: '#D1FAE5', color: '#065F46' },
  'Normal':       { bg: '#EEF2FF', color: '#3730A3' },
  'Gecikme Var':  { bg: '#FEF3C7', color: '#92400E' },
  'Durduruldu':   { bg: '#FEE2E2', color: '#991B1B' },
  'iyi':          { bg: '#D1FAE5', color: '#065F46' },
  'normal':       { bg: '#EEF2FF', color: '#3730A3' },
  'sorunlu':      { bg: '#FEE2E2', color: '#991B1B' },
  'dikkat':       { bg: '#FEF3C7', color: '#92400E' },
  'kritik':       { bg: '#FEE2E2', color: '#991B1B' },
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekAgoStr() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseLocalDate(value) {
  const [year, month, day] = String(value || todayStr()).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, Math.min(date.getDate(), 28))
}

function startOfWeek(date) {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(date, diff)
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6)
}

function getDateRange(anchorDate, mode, active) {
  if (!active) return { start: '', end: '' }
  const base = parseLocalDate(anchorDate)
  if (mode === 'weekly') {
    return { start: toDateStr(startOfWeek(base)), end: toDateStr(endOfWeek(base)) }
  }
  if (mode === 'monthly') {
    const start = new Date(base.getFullYear(), base.getMonth(), 1)
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0)
    return { start: toDateStr(start), end: toDateStr(end) }
  }
  return { start: toDateStr(base), end: toDateStr(base) }
}

function formatRangeLabel(anchorDate, mode, active) {
  if (!active) return 'Tüm Raporlar'
  const range = getDateRange(anchorDate, mode, true)
  if (mode === 'weekly') {
    return `${parseLocalDate(range.start).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} - ${parseLocalDate(range.end).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}`
  }
  if (mode === 'monthly') {
    return parseLocalDate(anchorDate).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  }
  return parseLocalDate(anchorDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function buildCalendarDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

export default function DailyReportList({ onNewReport, onEditReport, projectId: projectIdOverride, title = 'Günlük Raporlarım', showHeader = true }) {
  const { projectId: authProjectId } = useAuth()
  const projectId = projectIdOverride || authProjectId

  const [loading, setLoading]       = useState(true)
  const [reports, setReports]       = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage]             = useState(0)
  const [filterMode, setFilterMode] = useState('monthly')
  const [filterActive, setFilterActive] = useState(true)
  const [anchorDate, setAnchorDate] = useState(todayStr())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = parseLocalDate(todayStr())
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const [detailId, setDetailId]     = useState(null)
  const [exportingId, setExportingId] = useState(null)
  const [loadError, setLoadError]   = useState('')
  const selectedRange = useMemo(() => getDateRange(anchorDate, filterMode, filterActive), [anchorDate, filterMode, filterActive])
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])

  const fetchReports = useCallback(async () => {
    if (!projectId) {
      setLoading(false)
      setReports([])
      setTotalCount(0)
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await supabase.rpc('get_daily_reports_list', {
        p_project_id: projectId,
        p_start_date: selectedRange.start || null,
        p_end_date:   selectedRange.end   || null,
        p_page:       page,
        p_page_size:  PAGE_SIZE,
      })

      if (error) {
        setReports([])
        setTotalCount(0)
        setLoadError(error.message || 'Raporlar yuklenemedi.')
        return
      }

      setReports(data.reports || [])
      setTotalCount(data.total_count || 0)
    } finally {
      setLoading(false)
    }
  }, [projectId, selectedRange.start, selectedRange.end, page])

  useEffect(() => { fetchReports() }, [fetchReports])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  async function buildReportRows(reportId) {
    const { data, error } = await supabase.rpc('get_daily_report_detail', { p_report_id: reportId })
    if (error || !data) return { rows: [], projectName: 'Proje', titleDate: '' }

    const report  = data.report  || {}
    const project = data.project || {}
    const creatorName = report.profiles?.full_name || null

    const rows = [
      ['Genel', 'Proje',           project.name    || '—'],
      ['Genel', 'Konum',           project.location || '—'],
      ['Genel', 'Tarih',           report.report_date ? new Date(report.report_date).toLocaleDateString('tr-TR') : '—'],
      ['Genel', 'Hazırlayan',      creatorName      || '—'],
      ['Genel', 'Hava',            report.weather   || '—'],
      ['Genel', 'Hava Notu',       report.weather_note || '—'],
      ['Genel', 'Durum',           report.general_status || '—'],
      ['Genel', 'Toplam Personel', String(report.worker_count || 0)],
      ['Genel', 'Notlar',          report.notes     || '—'],
    ]

    ;(data.personnel || []).forEach(p => {
      rows.push(['Personel', `${p.shift} / ${p.department}`, String(p.count || 0)])
    })
    ;(data.machinery || []).forEach(m => {
      rows.push(['İş Makinesi', m.machine_type || '—', `${m.count || 0} adet · ${m.status || '—'}${m.notes ? ` · ${m.notes}` : ''}`])
    })
    ;(data.progress || []).forEach(p => {
      const item = p.progress_items || {}
      rows.push(['İmalat', item.name || '—', `${p.qty_added || 0} ${item.unit || ''} · Toplam: ${item.total_progress || 0}/${item.target_qty || 0}`])
    })
    ;(data.issues || []).forEach(i => {
      rows.push(['Sorun', i.topic || '—', `${i.priority || '—'} · ${i.resolution_status || '—'} · ${i.description || ''}`])
    })

    const titleDate = report.report_date ? new Date(report.report_date).toLocaleDateString('tr-TR') : ''
    return { rows, projectName: project.name || 'Proje', titleDate }
  }

  async function handleExport(reportId, type) {
    setExportingId(`${type}-${reportId}`)
    try {
      const { rows, projectName, titleDate } = await buildReportRows(reportId)
      const title = 'Günlük Rapor'
      const columns = ['Bölüm', 'Alan', 'Değer']
      if (type === 'excel') exportToExcel(title, 'gunluk', columns, rows)
      else exportToPdf(title, 'gunluk', columns, rows, { orientation: 'portrait', projectName, subtitle: titleDate })
    } finally {
      setExportingId(null)
    }
  }

  function selectMode(nextMode) {
    setFilterMode(nextMode)
    setFilterActive(true)
    setPage(0)
  }

  function movePeriod(direction) {
    const base = parseLocalDate(anchorDate)
    const next = filterMode === 'monthly'
      ? addMonths(base, direction)
      : addDays(base, filterMode === 'weekly' ? direction * 7 : direction)
    setAnchorDate(toDateStr(next))
    setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1))
    setFilterActive(true)
    setPage(0)
  }

  function selectCalendarDay(day) {
    setAnchorDate(toDateStr(day))
    setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1))
    setFilterActive(true)
    setCalendarOpen(false)
    setPage(0)
  }

  function clearFilter() {
    setFilterActive(false)
    setCalendarOpen(false)
    setPage(0)
  }

  function jumpToday() {
    const today = parseLocalDate(todayStr())
    setAnchorDate(toDateStr(today))
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setFilterActive(true)
    setCalendarOpen(false)
    setPage(0)
  }

  return (
    <div style={{ fontFamily: 'inherit' }}>

      {showHeader && (
        <div style={{
          background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
          padding: '14px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          boxShadow: '0 1px 3px rgba(0,0,0,.06)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Toplam {totalCount} rapor</p>
          </div>
          {onNewReport && (
            <button onClick={onNewReport} style={BTN_PRIMARY}>+ Yeni Rapor Gir</button>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={FILTER_BAR}>
        <div style={SEGMENTED}>
          {[
            ['daily', 'Günlük'],
            ['weekly', 'Haftalık'],
            ['monthly', 'Aylık'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => selectMode(mode)}
              style={filterMode === mode && filterActive ? SEGMENT_ACTIVE : SEGMENT_BTN}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={DATE_PICKER_WRAP}>
          <button type="button" onClick={() => setCalendarOpen(v => !v)} style={ICON_BTN} title="Takvim">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>

          {calendarOpen && (
            <div style={CALENDAR_POPOVER}>
              <div style={CALENDAR_HEADER}>
                <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} style={CALENDAR_NAV}>↑</button>
                <strong>
                  {calendarMonth.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                </strong>
                <button type="button" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} style={CALENDAR_NAV}>↓</button>
              </div>
              <div style={CALENDAR_WEEKDAYS}>
                {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'].map(day => <span key={day}>{day}</span>)}
              </div>
              <div style={CALENDAR_GRID}>
                {calendarDays.map(day => {
                  const dayText = toDateStr(day)
                  const selected = filterActive && dayText === anchorDate
                  const inMonth = day.getMonth() === calendarMonth.getMonth()
                  return (
                    <button
                      key={dayText}
                      type="button"
                      onClick={() => selectCalendarDay(day)}
                      style={{
                        ...CALENDAR_DAY,
                        ...(selected ? CALENDAR_DAY_ACTIVE : {}),
                        color: selected ? '#fff' : inMonth ? '#0f172a' : '#94a3b8',
                      }}
                    >
                      {day.getDate()}
                    </button>
                  )
                })}
              </div>
              <div style={CALENDAR_FOOTER}>
                <button type="button" onClick={clearFilter} style={CALENDAR_LINK}>Temizle</button>
                <button type="button" onClick={jumpToday} style={CALENDAR_LINK}>Bugün</button>
              </div>
            </div>
          )}
        </div>

        <button type="button" onClick={() => movePeriod(-1)} style={PERIOD_ARROW}>‹</button>
        <div style={RANGE_LABEL}>{formatRangeLabel(anchorDate, filterMode, filterActive)}</div>
        <button type="button" onClick={() => movePeriod(1)} style={PERIOD_ARROW}>›</button>

        <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
          {filterActive ? `${selectedRange.start} / ${selectedRange.end}` : 'Filtre yok'}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            Yükleniyor…
          </div>
        ) : loadError ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>
            Raporlar yüklenemedi: {loadError}
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF' }}>
            <p style={{ fontSize: 32, margin: '0 0 12px' }}>📋</p>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Rapor bulunamadı</p>
            <p style={{ fontSize: 12 }}>Yeni bir rapor girin ya da tarih aralığını temizleyin.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={TH}>Tarih</th>
                  <th style={TH}>Hava</th>
                  <th style={TH}>Durum</th>
                  <th style={TH}>Toplam Personel</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Hazırlayan</th>
                  <th style={{ ...TH, textAlign: 'left' }}>Not</th>
                  <th style={TH}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setDetailId(r.id)}
                    style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                  >
                    <td style={{ ...TD, fontWeight: 600, whiteSpace: 'nowrap', color: '#111827' }}>
                      {new Date(r.report_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </td>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 16 }}>{WEATHER_EMOJI[r.weather] || '—'}</span>
                      <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 4 }}>{r.weather || '—'}</span>
                    </td>
                    <td style={TD}>
                      {r.general_status ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          background: STATUS_COLORS[r.general_status]?.bg || '#F3F4F6',
                          color: STATUS_COLORS[r.general_status]?.color || '#374151',
                        }}>
                          {r.general_status}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.worker_count || 0}</td>
                    <td style={{ ...TD, textAlign: 'left', color: '#374151' }}>
                      {r.creator_name || '—'}
                    </td>
                    <td style={{ ...TD, textAlign: 'left', color: '#9CA3AF', maxWidth: 200 }}>
                      <span style={{
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: 180,
                      }}>
                        {r.notes || '—'}
                      </span>
                    </td>
                    <td style={TD}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailId(r.id) }}
                          style={BTN_SMALL}
                        >
                          Görüntüle
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExport(r.id, 'excel') }}
                          disabled={exportingId === `excel-${r.id}`}
                          style={{ ...BTN_SMALL, background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', opacity: exportingId === `excel-${r.id}` ? 0.6 : 1 }}
                        >
                          Excel
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExport(r.id, 'pdf') }}
                          disabled={exportingId === `pdf-${r.id}`}
                          style={{ ...BTN_SMALL, background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', opacity: exportingId === `pdf-${r.id}` ? 0.6 : 1 }}
                        >
                          PDF
                        </button>
                        {onEditReport && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditReport(r.id) }}
                            style={{ ...BTN_SMALL, background: '#EEF2FF', color: '#3730A3', border: '1px solid #C7D2FE' }}
                          >
                            Düzenle
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid #F3F4F6',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              Sayfa {page + 1} / {totalPages} · Toplam {totalCount} rapor
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ ...BTN_GHOST, opacity: page === 0 ? 0.4 : 1 }}
              >
                ← Önceki
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ ...BTN_GHOST, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
              >
                Sonraki →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailId && (
        <DailyReportDetail
          reportId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={onEditReport ? (id) => { setDetailId(null); onEditReport(id) } : undefined}
        />
      )}
    </div>
  )
}

const TH = { padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6B7280', whiteSpace: 'nowrap' }
const TD = { padding: '10px 14px', textAlign: 'center', fontSize: 13, verticalAlign: 'middle' }
const BTN_PRIMARY = { background: '#003B8E', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_GHOST = { background: 'none', color: '#003B8E', border: '1px solid #003B8E', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_SMALL = { background: '#EBF5FF', color: '#003B8E', border: '1px solid #BFDBFE', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const FILTER_LABEL = { fontSize: 12, color: '#6B7280', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }
const DATE_INPUT = { border: '1px solid #E5E7EB', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }
const FILTER_BAR = {
  background: '#fff',
  border: '1px solid #f1f5f9',
  borderRadius: 16,
  padding: '12px 16px',
  marginBottom: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
}
const SEGMENTED = { display: 'flex', gap: 6, background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 999, padding: 4 }
const SEGMENT_BTN = { border: 'none', borderRadius: 999, background: 'transparent', color: '#64748b', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const SEGMENT_ACTIVE = { ...SEGMENT_BTN, background: '#003B8E', color: '#fff', boxShadow: '0 6px 14px rgba(0,59,142,.18)' }
const DATE_PICKER_WRAP = { position: 'relative', display: 'inline-flex' }
const ICON_BTN = {
  width: 42,
  height: 38,
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  background: '#fff',
  color: '#64748b',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
const PERIOD_ARROW = { ...ICON_BTN, width: 34, height: 34, borderRadius: 10, fontSize: 22, fontWeight: 700 }
const RANGE_LABEL = { minWidth: 180, textAlign: 'center', color: '#0f172a', fontSize: 14, fontWeight: 800, textTransform: 'capitalize' }
const CALENDAR_POPOVER = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  zIndex: 50,
  width: 310,
  background: '#fff',
  border: '1px solid #D1D5DB',
  borderRadius: 14,
  boxShadow: '0 18px 44px rgba(15,23,42,.16)',
  padding: 18,
}
const CALENDAR_HEADER = { display: 'grid', gridTemplateColumns: '38px 1fr 38px', alignItems: 'center', gap: 8, marginBottom: 16, color: '#0f172a', fontSize: 15, textTransform: 'capitalize' }
const CALENDAR_NAV = { border: 'none', background: '#fff', color: '#0f172a', fontSize: 24, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }
const CALENDAR_WEEKDAYS = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, color: '#0f172a', fontSize: 12, fontWeight: 800, textAlign: 'center', marginBottom: 8 }
const CALENDAR_GRID = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }
const CALENDAR_DAY = { height: 34, border: 'none', borderRadius: 8, background: 'transparent', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const CALENDAR_DAY_ACTIVE = { background: '#2563EB', outline: '3px solid #0f172a', outlineOffset: -2 }
const CALENDAR_FOOTER = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10 }
const CALENDAR_LINK = { border: 'none', background: 'transparent', color: '#2563EB', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
