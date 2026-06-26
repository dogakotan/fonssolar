import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const GROUP_ORDER = [
  'Projelendirme & İzinler',
  'Şantiye Hazırlık',
  'Mekanik Montaj',
  'Elektriksel — DC',
  'Elektriksel — AC',
  'Elektriksel — OG',
  'Test & Devreye Alma',
]

const GROUP_CONFIG = {
  'Projelendirme & İzinler': { tone: 'blue', bar: '#5b8def', label: 'PROJELENDİRME & İZİNLER' },
  'Şantiye Hazırlık': { tone: 'green', bar: '#42b883', label: 'ŞANTİYE HAZIRLIK' },
  'Mekanik Montaj': { tone: 'purple', bar: '#a78bfa', label: 'MEKANİK MONTAJ' },
  'Elektriksel — DC': { tone: 'amber', bar: '#f4b344', label: 'ELEKTRİKSEL — DC' },
  'Elektriksel — AC': { tone: 'sky', bar: '#77aae6', label: 'ELEKTRİKSEL — AC' },
  'Elektriksel — OG': { tone: 'teal', bar: '#4fbda7', label: 'ELEKTRİKSEL — OG' },
  'Test & Devreye Alma': { tone: 'rose', bar: '#ea7d8c', label: 'TEST & DEVREYE ALMA' },
  '_diger': { tone: 'slate', bar: '#94a3b8', label: 'DİĞER' },
}

const STATUS_LABELS = {
  devam_ediyor: 'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  askida: 'Askıda',
  bekliyor: 'Bekliyor',
}

const W_NO = 42
const W_NAME = 170
const W_START = 72
const W_END = 72
const W_DUR = 48
const W_PROGRESS = 64
const W_WEEK = 20

function resolveGroup(task) {
  if (task.group_label && GROUP_CONFIG[task.group_label]) return task.group_label

  const text = `${task.group_label || ''} ${task.category || ''} ${task.task_name || ''}`.toLocaleLowerCase('tr-TR')
  if (text.includes('izin') || text.includes('proje') || text.includes('evrak') || text.includes('onay')) return 'Projelendirme & İzinler'
  if (text.includes('şantiye') || text.includes('santiye') || text.includes('mobilizasyon') || text.includes('arazi') || text.includes('tesviye') || text.includes('güvenlik')) return 'Şantiye Hazırlık'
  if (text.includes('mekanik') || text.includes('kolon') || text.includes('kiriş') || text.includes('kiris') || text.includes('panel') || text.includes('montaj')) return 'Mekanik Montaj'
  if (text.includes('dc') || text.includes('konnektör') || text.includes('konnektor')) return 'Elektriksel — DC'
  if ((text.includes('ac') || text.includes('inverter') || text.includes('pano')) && !text.includes('og')) return 'Elektriksel — AC'
  if (text.includes('og') || text.includes('orta') || text.includes('xlpe') || text.includes('trafo') || text.includes('köşk') || text.includes('kosk') || text.includes('scada') || text.includes('enh')) return 'Elektriksel — OG'
  if (text.includes('test') || text.includes('devreye') || text.includes('scada işlemleri') || text.includes('ticari üretim')) return 'Test & Devreye Alma'
  return '_diger'
}

function fmtDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtLongDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysBetween(start, end) {
  if (!start || !end) return 0
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1)
}

function buildTimeline(startTs, endTs) {
  const months = []
  const weeks = []
  const start = new Date(startTs)
  const end = new Date(endTs)
  const timelineStart = new Date(start.getFullYear(), start.getMonth(), 1)
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1)

  while (cursor.getTime() <= end.getTime()) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59)
    const dayCount = monthEnd.getDate()
    const monthTicks = []

    for (let day = 1; day <= dayCount; day += 7) {
      const tickDate = new Date(cursor.getFullYear(), cursor.getMonth(), day)
      const tick = {
        key: tickDate.toISOString().slice(0, 10),
        label: String(day).padStart(2, '0'),
      }
      monthTicks.push(tick)
      weeks.push(tick)
    }

    months.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: cursor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
      start: monthStart,
      end: monthEnd,
      span: monthTicks.length,
    })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  return { months, weeks, timelineStart }
}

function timelineOffsetPct(date, timelineStart, timelineUnits) {
  const start = new Date(timelineStart)
  start.setHours(0, 0, 0, 0)
  const current = new Date(date)
  current.setHours(0, 0, 0, 0)
  const dayOffset = Math.max(0, (current.getTime() - start.getTime()) / 86400000)
  return Math.min(100, (dayOffset / timelineUnits) * 100)
}

function progressFor(task, progressMap) {
  return Math.round(progressMap[task.id] !== undefined ? progressMap[task.id] : Number(task.progress_pct || 0))
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status?.replace(/_/g, ' ') || '-'
}

export default function TabIsPlan({ projectId, filterDate }) {
  const [tasks, setTasks] = useState([])
  const [project, setProject] = useState(null)
  const [criticalCodes, setCriticalCodes] = useState(new Set())
  const [critCount, setCritCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [taskProgressByDate, setTaskProgressByDate] = useState({})
  const [detailContext, setDetailContext] = useState({ latestReport: null, latestPurchase: null, topRisk: null })
  const topScrollRef = useRef(null)
  const bottomScrollRef = useRef(null)
  const bodyScrollRef = useRef(null)

  useEffect(() => {
    setLoading(true)

    async function load() {
      if (projectId) {
        const [
          { data: projData },
          { data: tasksData },
          { data: critData },
          { data: progItemsData },
          latestReportRes,
          latestPurchaseRes,
          topRiskRes,
        ] = await Promise.all([
          supabase.from('projects')
            .select('id, name, capacity_kwp, location, start_date, target_date')
            .eq('id', projectId).single(),
          supabase.from('project_tasks')
            .select('id, task_code, task_name, group_label, category, planned_start, planned_end, progress_pct, status, responsible_role')
            .eq('project_id', projectId)
            .order('planned_start', { ascending: true }),
          supabase.from('critical_path_items')
            .select('path_code')
            .eq('project_id', projectId),
          supabase.from('progress_items')
            .select('id, task_id, target_qty')
            .eq('project_id', projectId),
          supabase.from('daily_reports')
            .select('report_date, notes')
            .eq('project_id', projectId)
            .order('report_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('purchase_requests')
            .select('id, title, request_no, status, required_date, delivery_date, created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('project_risks')
            .select('*')
            .eq('project_id', projectId)
            .neq('status', 'kapandi')
            .limit(1)
            .maybeSingle(),
        ])

        setProject(projData || null)
        setTasks(tasksData || [])
        const codes = new Set((critData || []).map(c => c.path_code).filter(Boolean))
        setCriticalCodes(codes)
        setCritCount(codes.size)
        setDetailContext({
          latestReport: latestReportRes.error ? null : latestReportRes.data,
          latestPurchase: latestPurchaseRes.error ? null : latestPurchaseRes.data,
          topRisk: topRiskRes.error ? null : topRiskRes.data,
        })

        const itemIds = (progItemsData || []).map(p => p.id)
        if (itemIds.length > 0) {
          const { data: pdData } = await supabase
            .from('progress_daily')
            .select('item_id, qty_added, daily_reports!inner(report_date)')
            .in('item_id', itemIds)
            .lte('daily_reports.report_date', filterDate || new Date().toISOString().split('T')[0])

          const sumByItem = {}
          for (const d of (pdData || [])) {
            sumByItem[d.item_id] = (sumByItem[d.item_id] || 0) + Number(d.qty_added || 0)
          }
          const taskSums = {}
          for (const item of (progItemsData || [])) {
            if (!item.task_id || !item.target_qty) continue
            const pct = Math.min(100, ((sumByItem[item.id] || 0) / item.target_qty) * 100)
            if (!taskSums[item.task_id]) taskSums[item.task_id] = { sum: 0, count: 0 }
            taskSums[item.task_id].sum += pct
            taskSums[item.task_id].count++
          }
          const finalMap = {}
          for (const [tid, { sum, count }] of Object.entries(taskSums)) finalMap[tid] = sum / count
          setTaskProgressByDate(finalMap)
        } else {
          setTaskProgressByDate({})
        }
      } else {
        const { data: tasksData } = await supabase
          .from('project_tasks')
          .select('id, task_code, task_name, group_label, category, planned_start, planned_end, progress_pct, status')
          .order('planned_start', { ascending: true })
        setTasks(tasksData || [])
        setCritCount(0)
        setDetailContext({ latestReport: null, latestPurchase: null, topRisk: null })
      }
      setLoading(false)
    }

    load().catch(() => setLoading(false))
  }, [projectId, filterDate])

  const today = useMemo(() => {
    const date = filterDate ? new Date(`${filterDate}T00:00:00`) : new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }, [filterDate])

  const allGroupNames = useMemo(() => [...new Set(tasks.map(t => resolveGroup(t)))].sort(), [tasks])

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (groupFilter !== 'all' && resolveGroup(task) !== groupFilter) return false
    if (statusFilter === 'devam') return task.status === 'devam_ediyor'
    if (statusFilter === 'tamamlandi') return task.status === 'tamamlandi'
    if (statusFilter === 'geciken') {
      return task.planned_end && new Date(task.planned_end) < today && task.status !== 'tamamlandi'
    }
    return true
  }), [groupFilter, statusFilter, tasks, today])

  const withDates = filteredTasks.filter(t => t.planned_start && t.planned_end)

  const kpis = useMemo(() => {
    const late = tasks.filter(t => t.planned_end && new Date(t.planned_end) < today && t.status !== 'tamamlandi').length
    const ongoing = tasks.filter(t => t.status === 'devam_ediyor').length
    return { late, ongoing }
  }, [tasks, today])

  useEffect(() => {
    if (!selectedTaskId && withDates[0]) setSelectedTaskId(withDates[0].id)
    if (selectedTaskId && !withDates.some(t => t.id === selectedTaskId)) setSelectedTaskId(withDates[0]?.id || null)
  }, [selectedTaskId, withDates])

  if (loading) {
    return (
      <div className="card gantt-card">
        <div className="card-header"><h3>Gantt İş Planı</h3></div>
        <p className="gantt-empty">Yükleniyor...</p>
      </div>
    )
  }

  const selectedTask = withDates.find(task => task.id === selectedTaskId) || null

  if (withDates.length === 0) {
    return (
      <div className="gantt-page">
        <KpiStrip total={tasks.length} devam={kpis.ongoing} late={kpis.late} crit={critCount} />
        <GanttShell
          project={project}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          allGroupNames={allGroupNames}
        >
          <p className="gantt-empty">
            {tasks.length === 0 ? 'Henüz iş kalemi eklenmemiş.' : 'Seçilen filtreye uyan tarihli iş kalemi bulunamadı.'}
          </p>
        </GanttShell>
      </div>
    )
  }

  const projStartTs = project?.start_date
    ? new Date(project.start_date).getTime()
    : Math.min(...withDates.map(t => new Date(t.planned_start).getTime()))
  const projEndTs = project?.target_date
    ? new Date(project.target_date).getTime()
    : Math.max(...withDates.map(t => new Date(t.planned_end).getTime()))
  const { months, weeks, timelineStart } = buildTimeline(projStartTs, projEndTs)
  const timelineUnits = Math.max(1, weeks.length * 7)
  const showToday = today.getTime() >= projStartTs && today.getTime() <= projEndTs
  const todayOffsetPct = showToday ? timelineOffsetPct(today, timelineStart, timelineUnits) : 0

  const grouped = {}
  withDates.forEach(task => {
    const key = resolveGroup(task)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(task)
  })
  const groupKeys = [...GROUP_ORDER, '_diger'].filter(key => grouped[key])
  const leftWidth = W_NO + W_NAME + W_START + W_END + W_DUR + W_PROGRESS
  const timelineWidth = weeks.length * W_WEEK
  const minWidth = leftWidth + timelineWidth

  function toggleGroup(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function syncScroll(source, targets) {
    const nextLeft = source.currentTarget.scrollLeft
    targets.forEach(target => {
      if (target.current && target.current.scrollLeft !== nextLeft) {
        target.current.scrollLeft = nextLeft
      }
    })
  }

  function setAllGanttScroll(left) {
    ;[bodyScrollRef, topScrollRef, bottomScrollRef].forEach(target => {
      if (target.current) {
        target.current.scrollLeft = left
      }
    })
  }

  function syncScrollFromBody(event) {
    syncScroll(event, [topScrollRef, bottomScrollRef])
  }

  function syncScrollFromTop(event) {
    syncScroll(event, [bodyScrollRef, bottomScrollRef])
  }

  function syncScrollFromBottom(event) {
    syncScroll(event, [bodyScrollRef, topScrollRef])
  }

  function ScrollTrack({ className, scrollRef, onScroll, label }) {
    return (
      <div
        className={className}
        ref={scrollRef}
        onScroll={onScroll}
        aria-label={label}
      >
        <div style={{ width: `${minWidth}px` }} />
      </div>
    )
  }

  function handleGanttWheel(event) {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.shiftKey
        ? event.deltaY
        : 0

    if (!delta || !bodyScrollRef.current) return
    event.preventDefault()
    const nextLeft = bodyScrollRef.current.scrollLeft + delta
    setAllGanttScroll(nextLeft)
  }

  return (
    <div className="gantt-page">
      <KpiStrip total={tasks.length} devam={kpis.ongoing} late={kpis.late} crit={critCount} />

      <div className={`gantt-workspace${panelOpen ? ' has-panel' : ''}`}>
        <GanttShell
          project={project}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          allGroupNames={allGroupNames}
        >
          <ScrollTrack
            className="gantt-edge-scroll gantt-top-scroll"
            scrollRef={topScrollRef}
            onScroll={syncScrollFromTop}
            label="Gantt zaman çizelgesi üst yatay kaydırma"
          />
          <div className="gantt-scroll">
            <div
              className="gantt-scroll-body"
              ref={bodyScrollRef}
              onScroll={syncScrollFromBody}
              onWheel={handleGanttWheel}
            >
              <div className="gantt-board" style={{ '--gantt-min-width': `${minWidth}px`, '--left-width': `${leftWidth}px`, '--timeline-width': `${timelineWidth}px`, '--week-width': `${W_WEEK}px`, '--week-count': weeks.length }}>
              <div className="gantt-header-row">
                <div className="gantt-left-head" style={{ '--w-no': `${W_NO}px`, '--w-name': `${W_NAME}px`, '--w-start': `${W_START}px`, '--w-end': `${W_END}px`, '--w-dur': `${W_DUR}px`, '--w-progress': `${W_PROGRESS}px` }}>
                  <span>No</span>
                  <span>İş Kalemi / Bölüm</span>
                  <span>Başlangıç</span>
                  <span>Bitiş</span>
                  <span>Süre</span>
                  <span>İlerleme</span>
                </div>
                <div className="gantt-timeline-head" style={{ '--week-count': weeks.length }}>
                  <div className="gantt-months">
                    {months.map(month => (
                      <span key={month.key} style={{ '--month-span': month.span }}>{month.label}</span>
                    ))}
                  </div>
                  <div className="gantt-month-ticks">
                    {weeks.map(week => (
                      <span key={week.key}>{week.label}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="gantt-body">
                {showToday && (
                  <div className="gantt-today-line" style={{ '--today-left': `calc(${leftWidth}px + (100% - ${leftWidth}px) * ${todayOffsetPct / 100})` }}>
                    <span>Bugün</span>
                  </div>
                )}

                {groupKeys.map(groupKey => {
                  const cfg = GROUP_CONFIG[groupKey] || GROUP_CONFIG._diger
                  const items = grouped[groupKey] || []
                  const isOpen = !collapsed.has(groupKey)
                  const avg = items.length
                    ? Math.round(items.reduce((sum, task) => sum + progressFor(task, taskProgressByDate), 0) / items.length)
                    : 0

                  return (
                    <div key={groupKey} className="gantt-group">
                      <button className={`gantt-group-row tone-${cfg.tone}`} onClick={() => toggleGroup(groupKey)}>
                        <span className="gantt-group-toggle">{isOpen ? '▾' : '▸'}</span>
                        <strong>{cfg.label}</strong>
                        <small>{items.length} görev | %{avg}</small>
                      </button>

                      {isOpen && items.map((task, index) => {
                        const cfg = GROUP_CONFIG[resolveGroup(task)] || GROUP_CONFIG._diger
                        const barLeft = timelineOffsetPct(task.planned_start, timelineStart, timelineUnits)
                        const barEnd = timelineOffsetPct(task.planned_end, timelineStart, timelineUnits) + (100 / timelineUnits)
                        const barWidth = Math.max(1.2, barEnd - barLeft)
                        const duration = daysBetween(task.planned_start, task.planned_end)
                        const pct = progressFor(task, taskProgressByDate)
                        const isCrit = criticalCodes.has(task.task_code)
                        const isLate = task.planned_end && new Date(task.planned_end) < today && task.status !== 'tamamlandi'
                        const isSelected = task.id === selectedTaskId

                        return (
                          <button
                            key={task.id}
                            className={`gantt-task-row${isSelected ? ' selected' : ''}`}
                            onClick={() => { setSelectedTaskId(task.id); setPanelOpen(true) }}
                          >
                            <span className="gantt-task-left" style={{ '--w-no': `${W_NO}px`, '--w-name': `${W_NAME}px`, '--w-start': `${W_START}px`, '--w-end': `${W_END}px`, '--w-dur': `${W_DUR}px`, '--w-progress': `${W_PROGRESS}px` }}>
                              <span className="gantt-code">
                                {task.task_code || index + 1}
                                {isCrit && <b>K</b>}
                              </span>
                              <span className={`gantt-name${isLate ? ' late' : ''}`}>{task.task_name || '-'}</span>
                              <span>{fmtDate(task.planned_start)}</span>
                              <span className={isLate ? 'late' : ''}>{fmtDate(task.planned_end)}</span>
                              <span>{duration} gün</span>
                              <span className="gantt-progress-cell">
                                <i><em style={{ '--progress': `${pct}%`, '--bar-color': cfg.bar }} /></i>
                                <b>%{pct}</b>
                              </span>
                            </span>
                            <span
                              className={`gantt-bar${isCrit ? ' critical' : ''}${isLate ? ' late' : ''}`}
                              style={{ '--bar-left': `${barLeft}%`, '--bar-width': `${barWidth}%`, '--bar-color': cfg.bar, '--progress': `${pct}%` }}
                              title={`${task.task_name || ''} - ${fmtDate(task.planned_start)} / ${fmtDate(task.planned_end)}`}
                            >
                              <i />
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              </div>
            </div>
          </div>
          <ScrollTrack
            className="gantt-edge-scroll gantt-sticky-scroll"
            scrollRef={bottomScrollRef}
            onScroll={syncScrollFromBottom}
            label="Gantt zaman çizelgesi alt yatay kaydırma"
          />
        </GanttShell>

        {panelOpen ? (
          <TaskDetailPanel
            task={selectedTask}
            group={selectedTask ? resolveGroup(selectedTask) : null}
            progress={selectedTask ? progressFor(selectedTask, taskProgressByDate) : 0}
            isCritical={selectedTask ? criticalCodes.has(selectedTask.task_code) : false}
            context={detailContext}
            onClose={() => setPanelOpen(false)}
          />
        ) : (
          <button className="gantt-panel-reopen" onClick={() => setPanelOpen(true)}>Görev Detayı</button>
        )}
      </div>
    </div>
  )
}

function GanttShell({ project, statusFilter, setStatusFilter, groupFilter, setGroupFilter, allGroupNames, children }) {
  return (
    <div className="card gantt-card">
      <div className="gantt-card-header">
        <div>
          <h3>Gantt İş Planı</h3>
          {project && (
            <p>
              {project.name}
              {project.capacity_kwp ? ` · ${(project.capacity_kwp / 1000).toFixed(3)} MWp` : ''}
              {project.location ? ` · ${project.location}` : ''}
              {project.start_date && project.target_date ? ` · ${fmtDate(project.start_date)} - ${fmtDate(project.target_date)}` : ''}
            </p>
          )}
        </div>
        <div className="gantt-toolbar">
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">Tüm Durumlar</option>
            <option value="devam">Devam Eden</option>
            <option value="geciken">Geciken</option>
            <option value="tamamlandi">Tamamlanan</option>
          </select>
          <select value={groupFilter} onChange={event => setGroupFilter(event.target.value)}>
            <option value="all">Tüm Gruplar</option>
            {allGroupNames.map(group => (
              <option key={group} value={group}>{GROUP_CONFIG[group]?.label || group}</option>
            ))}
          </select>
        </div>
      </div>
      {children}
    </div>
  )
}

function KpiStrip({ total, devam, late, crit }) {
  const cards = [
    { label: 'Toplam Görev', value: total, note: 'Tüm iş kalemleri', icon: 'clipboard', tone: 'blue' },
    { label: 'Devam Eden', value: devam, note: 'Aktif görevler', icon: 'play', tone: 'green' },
    { label: 'Geciken', value: late, note: 'Plan gerisinde', icon: 'clock', tone: 'orange' },
    { label: 'Kritik İşler', value: crit, note: 'Kritik yol üzeri', icon: 'warning', tone: 'red' },
  ]
  return (
    <div className="gantt-kpi-strip">
      {cards.map(card => (
        <div key={card.label} className={`gantt-kpi-card tone-${card.tone}`}>
          <span className="gantt-kpi-icon"><KpiIcon name={card.icon} /></span>
          <div>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </div>
        </div>
      ))}
    </div>
  )
}

function KpiIcon({ name }) {
  if (name === 'play') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8l6 4-6 4z" />
      </svg>
    )
  }
  if (name === 'clock') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </svg>
    )
  }
  if (name === 'warning') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4l9 16H3L12 4z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="4" width="10" height="4" rx="1" />
      <path d="M6 6h12v14H6z" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  )
}

function TaskDetailPanel({ task, group, progress, isCritical, context, onClose }) {
  const purchase = context.latestPurchase
  const risk = context.topRisk
  const report = context.latestReport

  if (!task) {
    return (
      <aside className="gantt-detail-panel">
        <div className="gantt-detail-head">
          <h3>Görev Detayı</h3>
          <button onClick={onClose} aria-label="Detay panelini kapat">×</button>
        </div>
        <div className="gantt-detail-empty">Bir görev seçildiğinde detaylar burada görüntülenecek.</div>
      </aside>
    )
  }

  const groupCfg = GROUP_CONFIG[group] || GROUP_CONFIG._diger
  const duration = daysBetween(task.planned_start, task.planned_end)
  const riskTitle = risk?.title || risk?.risk_title || risk?.description || '-'
  const purchaseTitle = purchase ? (purchase.request_no ? `${purchase.request_no} · ${purchase.title || 'Satın alma talebi'}` : purchase.title || 'Satın alma talebi') : '-'

  const rows = [
    ['Durum', statusLabel(task.status), task.status === 'devam_ediyor' ? 'blue' : 'muted'],
    ['Grup', group || '-', groupCfg.tone],
    ['Sorumlu', task.responsible_role || '-'],
    ['Plan Başlangıç', fmtDate(task.planned_start)],
    ['Plan Bitiş', fmtDate(task.planned_end)],
    ['Süre', `${duration} gün`],
    ['İlerleme', `%${progress}`, 'blue'],
    ['Kritiklik', isCritical ? 'Kritik Yol' : 'Normal', isCritical ? 'red' : 'muted'],
    ['Bağlı Satın Alma', purchaseTitle, purchase ? 'blue' : 'muted'],
    ['Risk Durumu', riskTitle, risk ? 'red' : 'muted'],
    ['Son Günlük Rapor', report ? fmtLongDate(report.report_date) : '-'],
  ]

  return (
    <aside className="gantt-detail-panel">
      <div className="gantt-detail-head">
        <div>
          <h3>Görev Detayı</h3>
          <p>
            <span>{task.task_code || '-'}</span>
            {task.task_name || '-'}
          </p>
        </div>
        <button onClick={onClose} aria-label="Detay panelini kapat">×</button>
      </div>

      <div className="gantt-detail-body">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="gantt-detail-row">
            <span>{label}</span>
            <strong className={tone ? `tone-${tone}` : ''}>{value}</strong>
          </div>
        ))}
        <DetailText title="Bugün Yapılan" text={report?.notes || 'Günlük rapor notu bulunamadı.'} />
        <DetailText title="Yarın Planlanan" text={task.status === 'tamamlandi' ? 'Görev tamamlandı.' : 'Plan takibine göre sonraki saha aktivitesi izlenecek.'} />
        <DetailText title="Not" text={isCritical ? 'Bu görev kritik yol üzerinde izleniyor.' : 'Ek görev notu bulunmuyor.'} />
      </div>
    </aside>
  )
}

function DetailText({ title, text }) {
  return (
    <div className="gantt-detail-note">
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  )
}
