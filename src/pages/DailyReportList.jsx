import { useState, useEffect, useMemo } from 'react'
import { unzipSync, strFromU8, strToU8 } from 'fflate'
import { supabase } from '../lib/supabase'
import { useScope } from '../context/ScopeContext'
import { useDashboardData } from '../hooks/useDashboardData'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../components/ui/DataStatusBanner'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'
import DailyReportDetail from './DailyReportDetail'
import Badge from '../components/ui/Badge'
import { DAILY_REPORT_STATUS } from '../components/ui/StatusBadge'
import { exportToPdf } from '../utils/exportUtils'
import {
  fetchXlsxTemplate,
  setTemplateCell as setExcelTemplateCell,
  xlsxZipBlob,
  downloadXlsxZip,
  formatExcelDate,
} from '../utils/excelUtils'

const PAGE_SIZE = 10

const PDF_SERVICE_ENDPOINT = import.meta.env.VITE_PDF_SERVICE_URL || 'http://127.0.0.1:8002/generate-pdf'

const WEATHER_EMOJI = {
  'Güneşli': '☀️', 'Parçalı Bulutlu': '⛅', 'Bulutlu': '☁️',
  'Yağmurlu': '🌧️', 'Karlı': '🌨️', 'Fırtınalı': '⛈️', 'Sisli': '🌫️',
  'açık': '☀️', 'parçalı bulutlu': '⛅', 'bulutlu': '☁️',
  'yağmurlu': '🌧️', 'karlı': '🌨️', 'fırtınalı': '⛈️',
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

function norm(value) {
  return String(value || '').toLocaleLowerCase('tr-TR')
}

function displayLabel(value) {
  const text = String(value || '').replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1) : '—'
}

function sumCount(rows, predicate) {
  return (rows || []).filter(predicate).reduce((sum, row) => sum + Number(row.count || 0), 0)
}

function dailyProgressStatus(pct) {
  if (pct >= 100) return 'Tamamlandı'
  if (pct > 0) return 'Devam ediyor'
  return ''
}

function aggregateProgressRows(rows) {
  const grouped = new Map()
  ;(rows || []).forEach(row => {
    if (!row.task_id) return
    const current = grouped.get(row.task_id) || { ...row, qty_added: 0, notes: [] }
    current.qty_added += Number(row.qty_added || 0)
    if (row.note) current.notes.push(row.note)
    grouped.set(row.task_id, current)
  })
  return grouped
}

function decodeStoredMeta(prefix, value) {
  const text = String(value || '')
  if (!text.startsWith(prefix)) return { description: text }
  try {
    return JSON.parse(text.slice(prefix.length)) || { description: '' }
  } catch {
    return { description: text }
  }
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
  const { scopeProjectId, loadingProjects: scopeLoading } = useScope()
  const projectId = projectIdOverride || scopeProjectId
  // "Tüm Projeler" yalnızca kapsam seçicisinden gelen NULL modunda geçerli —
  // dışarıdan projectId zorlanmışsa (örn. ProjeDetay içinde) her zaman tek-proje.
  const isAllProjectsMode = !projectIdOverride && !projectId

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
  const selectedRange = useMemo(() => getDateRange(anchorDate, filterMode, filterActive), [anchorDate, filterMode, filterActive])
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])

  useEffect(() => { setPage(0) }, [projectId])

  const { data, loading, refreshing, error, refetch } = useDashboardData(
    'get_daily_reports_list',
    {
      p_project_id: projectId,
      p_start_date: selectedRange.start || null,
      p_end_date:   selectedRange.end   || null,
      p_page:       page,
      p_page_size:  PAGE_SIZE,
    },
    { enabled: !!projectIdOverride || !scopeLoading }
  )
  const authorized = data?.authorized ?? true
  useRealtimeRefresh(
    ['daily_reports'],
    refetch,
    { filter: projectId ? { column: 'project_id', value: projectId } : undefined }
  )
  const reports = data?.reports || []
  const totalCount = data?.total_count || 0

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  async function buildReportRows(reportId) {
    const [{ data, error }, { data: reportMeta }] = await Promise.all([
      supabase.rpc('get_daily_report_detail', { p_report_id: reportId }),
      supabase.from('daily_reports').select('weather_loss_day').eq('id', reportId).maybeSingle(),
    ])
    if (error || !data) return { rows: [], projectName: 'Proje', titleDate: '' }

    const report  = data.report  || {}
    const project = data.project || {}
    const creatorName = report.profiles?.full_name || null

    const rows = [
      ['Genel', 'Proje',           project.name    || '—'],
      ['Genel', 'Konum',           project.location || '—'],
      ['Genel', 'Tarih',           report.report_date ? new Date(report.report_date).toLocaleDateString('tr-TR') : '—'],
      ['Genel', 'Hazırlayan',      creatorName      || '—'],
      ['Genel', 'Hava',            displayLabel(report.weather)],
      ['Genel', 'Hava Notu',       report.weather_note || '—'],
      ['Genel', 'Durum',           displayLabel(report.general_status)],
      ['Genel', 'Hava Kayıplı Gün', reportMeta?.weather_loss_day ? 'Evet' : 'Hayır'],
      ['Genel', 'Toplam Personel', String(report.worker_count || 0)],
      ['Genel', 'Notlar',          report.notes     || '—'],
    ]

    ;(data.personnel || []).forEach(p => {
      rows.push(['Personel', `${p.shift} / ${p.department}`, String(p.count || 0)])
    })
    ;(data.machinery || []).forEach(m => {
      rows.push(['İş Makinesi', displayLabel(m.machine_type), `${m.count || 0} adet · ${displayLabel(m.status)}${m.notes ? ` · ${m.notes}` : ''}`])
    })
    aggregateProgressRows(data.progress).forEach(p => {
      const item = p.progress_items || {}
      rows.push(['İmalat', item.name || '—', `${p.qty_added || 0} ${item.unit || ''} · Toplam: ${item.total_progress || 0}/${item.target_qty || 0}`])
    })
    ;(data.issues || []).forEach(i => {
      rows.push(['Sorun', i.topic || '—', `${i.priority || '—'} · ${i.resolution_status || '—'} · ${i.description || ''}`])
    })

    const titleDate = report.report_date ? new Date(report.report_date).toLocaleDateString('tr-TR') : ''
    return { rows, projectName: project.name || 'Proje', titleDate }
  }

  async function buildReportExcelById(reportId, reportProjectId) {
    const exportProjectId = reportProjectId || projectId
    const templateBuffer = await fetchXlsxTemplate([
      '/excel/fons-solar-gunluk-rapor.xlsx',
      '/fons-solar-gunluk-rapor.xlsx',
      '/excel/fons-solar-gunluk-rapor-sablonu.xlsx',
      '/fons-solar-gunluk-rapor-sablonu.xlsx',
    ])
    const files = unzipSync(new Uint8Array(templateBuffer))

    const { data: report } = await supabase.from('daily_reports').select('*').eq('id', reportId).maybeSingle()
    if (!report) throw new Error('Rapor bulunamadı')

    const selectedDay = report.report_date
    const previousDay = toDateStr(addDays(parseLocalDate(selectedDay), -1))

    const [
      projectRes,
      progressItemsRes,
      purchasesRes,
      ticketsRes,
      personnelRes,
      machineryRes,
      dailyTasksRes,
      progressDailyRes,
      materialUsageRes,
      issuesRes,
      creatorRes,
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', exportProjectId).maybeSingle(),
      supabase.from('project_tasks').select('id, task_code, task_name, category, unit, target_qty, notes').eq('project_id', exportProjectId).gt('target_qty', 0).order('planned_start'),
      supabase.from('purchase_requests').select('*').eq('project_id', exportProjectId)
        .gte('created_at', `${selectedDay}T00:00:00`)
        .lte('created_at', `${selectedDay}T23:59:59`)
        .order('created_at', { ascending: true }).limit(6),
      supabase.from('tickets').select('*').eq('project_id', exportProjectId)
        .gte('created_at', `${selectedDay}T00:00:00`)
        .lte('created_at', `${selectedDay}T23:59:59`)
        .order('created_at', { ascending: true }).limit(6),
      supabase.from('personnel_log_entries').select('*').eq('report_id', reportId),
      supabase.from('machinery_logs').select('*').eq('report_id', reportId),
      supabase.from('daily_tasks').select('*').eq('report_id', reportId).order('order_index'),
      supabase.from('progress_daily').select('*').eq('report_id', reportId),
      supabase.from('daily_report_material_usage').select('*').eq('report_id', reportId),
      supabase.from('daily_report_issues').select('*').eq('report_id', reportId),
      report.created_by
        ? supabase.from('profiles').select('full_name, email').eq('id', report.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const { data: prevReports } = await supabase
      .from('daily_reports').select('id').eq('project_id', exportProjectId).lte('report_date', previousDay)
    const prevIds = (prevReports || []).map(r => r.id).filter(Boolean)
    const previousTotals = new Map()
    if (prevIds.length) {
      const { data: prevRows } = await supabase.from('progress_daily').select('task_id, qty_added').in('report_id', prevIds)
      ;(prevRows || []).forEach(row => {
        previousTotals.set(row.task_id, (previousTotals.get(row.task_id) || 0) + Number(row.qty_added || 0))
      })
    }

    const projectData = projectRes.data || {}
    const personnel = personnelRes.data || []
    const machinery = machineryRes.data || []
    const progressItems = progressItemsRes.data || []
    const progressByItem = aggregateProgressRows(progressDailyRes.data || [])
    const creatorName = creatorRes.data?.full_name || creatorRes.data?.email || ''
    const reportNotes = decodeStoredMeta('__REPORT_NOTES_META__', report.notes)

    let xml = strFromU8(files['xl/worksheets/sheet1.xml'])
    const put = (cell, value) => { xml = setExcelTemplateCell(xml, cell, value ?? '') }

    put('B5', projectData.name || exportProjectId)
    put('E5', formatExcelDate(report.report_date))
    put('H5', String(report.id).slice(0, 8).toUpperCase())
    put('J5', [
      displayLabel(report.weather),
      `Genel: ${displayLabel(report.general_status)}`,
      report.weather_loss_day ? 'Hava Kayıplı Gün' : '',
    ].filter(Boolean).join(' · '))
    put('L5', creatorName)

    const p = (departments, shifts) => sumCount(personnel, row => {
      const dep = norm(row.department)
      const shift = norm(row.shift)
      return departments.some(key => dep.includes(key)) && shifts.some(key => shift.includes(key))
    })
    const deptCols = [
      { keys: ['idari', 'teknik'], col: 'E' },
      { keys: ['mekanik'], col: 'F' },
      { keys: ['elektrik'], col: 'G' },
      { keys: ['yevmiyeci'], col: 'H' },
      { keys: ['diger', 'diğer'], col: 'I' },
    ]
    deptCols.forEach(({ keys, col }) => {
      put(`${col}9`, p(keys, ['mühendis', 'muhendis', 'tekniker']))
      put(`${col}10`, p(keys, ['usta', 'teknisyen']))
      put(`${col}11`, p(keys, ['işçi', 'isci', 'yardımcı', 'yardimci']))
    })

    // Makine/ekipman adları artık serbest metindir. Şablondaki sekiz satıra,
    // kullanıcı hangi adı girdiyse onu yaz; bilinmeyen ekipmanları atlama.
    machinery.filter(machine => Number(machine.count || 0) > 0).slice(0, 8).forEach((machine, index) => {
      const row = 16 + index
      put(`C${row}`, displayLabel(machine.machine_type))
      put(`E${row}`, Number(machine.count || 0))
      put(`F${row}`, displayLabel(machine.status))
      put(`G${row}`, machine.usage_area || machine.notes || '')
      put(`J${row}`, machine.notes || '')
    })

    const doneTasks = (dailyTasksRes.data || []).filter(t => ['tamamlandı', 'tamamlandi', 'done'].includes(norm(t.type))).slice(0, 7)
    const plannedTasks = (dailyTasksRes.data || []).filter(t => ['planlandı', 'planlandi', 'planned'].includes(norm(t.type))).slice(0, 7)
    doneTasks.forEach((task, idx) => put(`C${26 + idx}`, task.description || ''))
    plannedTasks.forEach((task, idx) => put(`C${35 + idx}`, task.description || ''))

    progressItems.slice(0, 35).forEach((item, idx) => {
      const row = 46 + idx
      const daily = progressByItem.get(item.id)
      const previous = Number(previousTotals.get(item.id) || 0)
      const dailyQty = Number(daily?.qty_added || 0)
      const cumulative = previous + dailyQty
      const target = Number(item.target_qty || 0)
      const pct = target > 0 ? Math.min(1, cumulative / target) : 0
      put(`B${row}`, item.task_code || `K-${String(idx + 1).padStart(2, '0')}`)
      put(`C${row}`, item.task_name || '')
      put(`D${row}`, item.unit || '')
      put(`E${row}`, target || '')
      put(`F${row}`, previous || '')
      put(`G${row}`, dailyQty || '')
      put(`H${row}`, cumulative || '')
      put(`I${row}`, pct)
      put(`J${row}`, dailyProgressStatus(Math.round(pct * 100)))
      put(`K${row}`, daily?.notes?.join(' · ') || daily?.note || item.notes || '')
    })

    ;(materialUsageRes.data || []).slice(0, 7).forEach((material, idx) => {
      const row = 86 + idx
      const meta = decodeStoredMeta('__MATERIAL_META__', material.description)
      put(`C${row}`, material.material_name || '')
      put(`D${row}`, meta.supplier || '')
      put(`E${row}`, Number(material.quantity_used || 0) || '')
      put(`F${row}`, material.unit || '')
      put(`G${row}`, meta.waybill_no || '')
      put(`H${row}`, formatExcelDate(meta.delivery_date || ''))
      put(`I${row}`, meta.storage_location || '')
      put(`K${row}`, meta.description || material.reason || '')
    })

    ;(purchasesRes.data || []).slice(0, 6).forEach((purchase, idx) => {
      const row = 95 + idx
      put(`C${row}`, purchase.title || purchase.material_name || purchase.description || '')
      put(`E${row}`, purchase.quantity || '')
      put(`F${row}`, purchase.unit || '')
      put(`H${row}`, purchase.supplier || '')
      put(`J${row}`, purchase.status || '')
      put(`K${row}`, formatExcelDate(purchase.required_date || purchase.delivery_date || purchase.created_at))
    })

    const issueRows = [...(issuesRes.data || []), ...(ticketsRes.data || [])].slice(0, 6)
    issueRows.forEach((issue, idx) => {
      const row = 103 + idx
      const meta = decodeStoredMeta('__ISSUE_META__', issue.description)
      put(`C${row}`, issue.topic || issue.title || meta.description || issue.description || '')
      put(`E${row}`, issue.category || meta.category || issue.type || '')
      put(`F${row}`, issue.priority || issue.severity || '')
      put(`G${row}`, issue.assigned_to || issue.assignee || '')
      put(`I${row}`, issue.resolution_status || issue.status || '')
      put(`K${row}`, formatExcelDate(issue.closed_at || meta.closed_at || issue.resolved_at || ''))
      put(`L${row}`, issue.notes || meta.notes || meta.description || '')
    })

    put('C110', report.isg_notes || reportNotes.isg_notes || '')
    put('C111', report.incident_notes || reportNotes.incident_notes || '')
    put('C112', [
      report.weather_loss_day ? 'HAVA KAYIPLI GÜN' : '',
      reportNotes.description || report.notes || report.weather_note || '',
    ].filter(Boolean).join(' — '))
    put('C114', creatorName)

    files['xl/worksheets/sheet1.xml'] = strToU8(xml)
    return {
      files,
      reportDate: selectedDay,
      metadata: {
        projectName: projectData.name || exportProjectId,
        reportNo: String(report.id).slice(0, 8).toUpperCase(),
        weather: report.weather || '',
        creatorName,
      },
    }
  }

  async function handleExport(reportId, type, reportProjectId) {
    const exportProjectId = reportProjectId || projectId
    setExportingId(`${type}-${reportId}`)
    try {
      if (type === 'pdf') {
        const { files, reportDate, metadata } = await buildReportExcelById(reportId, exportProjectId)
        const { data: reportPhotos } = await supabase
          .from('daily_report_photos')
          .select('storage_path')
          .eq('project_id', exportProjectId)
          .eq('report_date', reportDate)
          .order('created_at', { ascending: true })
        const blob = xlsxZipBlob(files)
        const form = new FormData()
        form.append('excel', blob, `rapor-${reportDate}.xlsx`)
        form.append('proje_id', exportProjectId)
        form.append('tarih', reportDate)
        form.append('proje_adi', metadata.projectName)
        form.append('rapor_no', metadata.reportNo)
        form.append('hava', metadata.weather)
        form.append('hazirlayan', metadata.creatorName)
        form.append('photo_paths', JSON.stringify((reportPhotos || []).map(photo => photo.storage_path).filter(Boolean)))
        const res = await fetch(PDF_SERVICE_ENDPOINT, { method: 'POST', body: form })
        if (!res.ok) throw new Error(`PDF servisi hatası: ${await res.text().catch(() => String(res.status))}`)
        const pdfBlob = await res.blob()
        const url = URL.createObjectURL(pdfBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `gunluk-rapor-${exportProjectId}-${reportDate}.pdf`
        a.click()
        URL.revokeObjectURL(url)
        return
      }
      if (type === 'excel') {
        const { files, reportDate } = await buildReportExcelById(reportId, exportProjectId)
        downloadXlsxZip(files, `gunluk-rapor-${exportProjectId}-${reportDate}.xlsx`)
        return
      }
      const { rows, projectName: pName, titleDate } = await buildReportRows(reportId)
      const title = 'Günlük Rapor'
      const columns = ['Bölüm', 'Alan', 'Değer']
      exportToPdf(title, 'gunluk', columns, rows, { orientation: 'portrait', projectName: pName, subtitle: titleDate })
    } catch (error) {
      if (type === 'pdf') alert(`PDF oluşturulamadı: ${error.message}\n\nPDF servisi çalışıyor mu? → pdf-service/start.bat`)
      else throw error
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

  if (!loading && !authorized) {
    return <UnauthorizedScopeNotice />
  }

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
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
                  {isAllProjectsMode && <th style={{ ...TH, textAlign: 'left' }}>Proje</th>}
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
                    {isAllProjectsMode && (
                      <td style={{ ...TD, textAlign: 'left', color: '#374151', fontWeight: 600 }}>
                        {r.project_name || '—'}
                      </td>
                    )}
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 16 }}>{WEATHER_EMOJI[r.weather] || '—'}</span>
                      <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 4 }}>{r.weather || '—'}</span>
                    </td>
                    <td style={TD}>
                      {r.general_status ? <Badge map={DAILY_REPORT_STATUS} value={r.general_status} /> : '—'}
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
                          onClick={(e) => { e.stopPropagation(); handleExport(r.id, 'excel', r.project_id) }}
                          disabled={exportingId === `excel-${r.id}`}
                          style={{ ...BTN_SMALL, background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', opacity: exportingId === `excel-${r.id}` ? 0.6 : 1 }}
                        >
                          Excel
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExport(r.id, 'pdf', r.project_id) }}
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
