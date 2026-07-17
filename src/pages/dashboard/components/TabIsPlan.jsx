import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'

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

function getEffectiveFilterDate(dateText, period) {
  const fallback = new Date().toISOString().split('T')[0]
  const base = new Date(`${dateText || fallback}T00:00:00`)

  if (period === 'weekly') {
    const day = base.getDay()
    const end = new Date(base)
    end.setDate(base.getDate() + (day === 0 ? 0 : 7 - day))
    return end.toISOString().slice(0, 10)
  }

  if (period === 'monthly') {
    return new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().slice(0, 10)
  }

  return dateText || fallback
}

function deriveTaskStatusAt(task, pct, date) {
  // Gerçek durum tamamlandı/iptal ise bu kesin kabul edilir — miktar tahmini asla ezmez
  // (aksi halde hedefe tam ulaşmayan ama fiilen bitmiş bir görev "devam ediyor" görünür).
  if (task.status === 'tamamlandi' || task.status === 'iptal') return task.status
  if (pct >= 100) return 'tamamlandi'

  const selected = new Date(`${date}T00:00:00`)
  const start = task.planned_start ? new Date(`${task.planned_start}T00:00:00`) : null

  if (start && selected < start) return 'bekliyor'
  if (pct > 0) return 'devam_ediyor'
  return task.status || 'bekliyor'
}

function isTaskLate(task, today) {
  if (!task.planned_end) return false
  if (task.status === 'tamamlandi' || task.status === 'iptal') return false
  return new Date(task.planned_end) < today
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status?.replace(/_/g, ' ') || '-'
}

function pctFromDailyProgress(targetQty, dailyRows) {
  if (targetQty <= 0) return 0

  const dailyDone = (dailyRows || []).reduce((sum, row) => sum + Number(row.qty_added || 0), 0)
  return Math.min(100, Math.round((dailyDone / targetQty) * 100))
}

export default function TabIsPlan({ projectId, filterDate, reportPeriod = 'daily', siteChiefView = false }) {
  const [tasks, setTasks] = useState([])
  const [project, setProject] = useState(null)
  const [siteChief, setSiteChief] = useState(null)
  // Görev bazlı "Kümülatif/Günlük İlerleme" hesaplamak için ham veriler tutulur —
  // önceden tek bir proje-geneli yüzde hesaplanıp HER görevin detay panelinde
  // aynı (yanlış) sayı gösteriliyordu, task_id ile filtrelenmediği için.
  const [taskTargetsAll, setTaskTargetsAll] = useState([])
  const [dailyProgressRowsAll, setDailyProgressRowsAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const topScrollRef = useRef(null)
  const bottomScrollRef = useRef(null)
  const bodyScrollRef = useRef(null)

  const effectiveDate = useMemo(
    () => getEffectiveFilterDate(filterDate, reportPeriod),
    [filterDate, reportPeriod]
  )

  const { data: ganttData, loading: ganttLoading, refreshing, error, refetch } = useDashboardData(
    'get_project_gantt',
    { p_project_id: projectId, p_filter_date: effectiveDate },
    { enabled: !!projectId }
  )
  const authorized = ganttData?.authorized ?? true
  useRealtimeRefresh(
    ['project_tasks', { table: 'progress_daily', filterColumn: null }, 'daily_reports', 'purchase_requests'],
    refetch,
    { enabled: !!projectId, filter: projectId ? { column: 'project_id', value: projectId } : undefined }
  )

  // Proje seçili değilken (genel görünüm) RPC yerine ham sorgu kullanılır — get_project_gantt tek proje ister.
  useEffect(() => {
    if (projectId) return
    let alive = true
    setLoading(true)
    supabase
      .from('project_tasks')
      .select('id, task_code, task_name, group_label, category, planned_start, planned_end, progress_pct, status, is_critical')
      .order('planned_start', { ascending: true })
      .then(({ data: tasksData }) => {
        if (!alive) return
        setTasks((tasksData || []).map(task => ({
          ...task,
          // İlerleme her zaman günlük rapor/miktar verisinden gelir — durum etiketi
          // (tamamlandı/devam ediyor) bunu ezmez, sadece ayrı bir alan olarak gösterilir.
          status: deriveTaskStatusAt(task, Number(task.progress_pct || 0), effectiveDate),
        })))
        setSiteChief(null)
        setTaskTargetsAll([])
        setDailyProgressRowsAll([])
        setLoading(false)
      })
    return () => { alive = false }
  }, [projectId, effectiveDate])

  useEffect(() => {
    if (!projectId) return
    if (ganttLoading) { setLoading(true); return }
    if (!ganttData || ganttData.authorized === false) { setLoading(false); return }

    let alive = true
    setLoading(true)

    async function load() {
      const progressByDate = ganttData.task_progress || {}
      const normalizedTasks = (ganttData.tasks || []).map(task => {
        const pct = progressFor(task, progressByDate)
        return {
          ...task,
          // İlerleme günlük rapor/miktar verisinden gelir (get_project_gantt'ın
          // progress_daily geçmişinden hesapladığı pct) — durum etiketi bunu ezmez.
          progress_pct: pct,
          status: deriveTaskStatusAt(task, pct, effectiveDate),
        }
      })

      setProject(ganttData.project || null)
      setTasks(normalizedTasks)

      const [chiefRes, tasksRes, reportRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, email')
          .eq('project_id', projectId)
          .eq('role_key', 'santiye_sefi')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('project_tasks')
          .select('id, target_qty')
          .eq('project_id', projectId)
          .gt('target_qty', 0),
        supabase
          .from('daily_reports')
          .select('id')
          .eq('project_id', projectId)
          .eq('report_date', effectiveDate)
          .maybeSingle(),
      ])

      if (!alive) return

      const taskTargets = tasksRes.data || []
      let dailyProgressRows = []
      if (reportRes.data?.id) {
        const { data: progressRows } = await supabase
          .from('progress_daily')
          .select('qty_added, task_id')
          .eq('report_id', reportRes.data.id)
        dailyProgressRows = progressRows || []
      }

      setSiteChief(chiefRes.data?.full_name || chiefRes.data?.email || null)
      setTaskTargetsAll(taskTargets)
      setDailyProgressRowsAll(dailyProgressRows)
      setLoading(false)
    }

    load().catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId, ganttData, ganttLoading, effectiveDate])

  const today = useMemo(() => {
    const date = effectiveDate ? new Date(`${effectiveDate}T00:00:00`) : new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }, [effectiveDate])

  const allGroupNames = useMemo(() => [...new Set(tasks.map(t => resolveGroup(t)))].sort(), [tasks])

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (groupFilter !== 'all' && resolveGroup(task) !== groupFilter) return false
    if (statusFilter === 'devam') return task.status === 'devam_ediyor'
    if (statusFilter === 'tamamlandi') return task.status === 'tamamlandi'
    if (statusFilter === 'geciken') {
      return isTaskLate(task, today)
    }
    return true
  }), [groupFilter, statusFilter, tasks, today])

  const withDates = filteredTasks.filter(t => t.planned_start && t.planned_end)

  const kpis = useMemo(() => {
    const late = tasks.filter(t => isTaskLate(t, today)).length
    const ongoing = tasks.filter(t => t.status === 'devam_ediyor').length
    const crit = tasks.filter(t => t.is_critical).length
    return { late, ongoing, crit }
  }, [tasks, today])

  useEffect(() => {
    if (!selectedTaskId && withDates[0]) setSelectedTaskId(withDates[0].id)
    if (selectedTaskId && !withDates.some(t => t.id === selectedTaskId)) setSelectedTaskId(withDates[0]?.id || null)
  }, [selectedTaskId, withDates])

  const selectedTask = withDates.find(task => task.id === selectedTaskId) || null

  // Görevin kendi bugünkü katkısı — proje-geneli değil, sadece bu göreve bağlı
  // project_tasks.target_qty'ye karşı bugün girilen miktar üzerinden hesaplanır. Erken
  // return'lerden (loading/authorized) ÖNCE çağrılmalı — aksi halde Hooks kuralı ihlal edilir.
  const selectedTaskDailyPct = useMemo(() => {
    if (!selectedTask) return 0
    const targetQty = Number(taskTargetsAll.find(t => t.id === selectedTask.id)?.target_qty || 0)
    const taskDailyRows = dailyProgressRowsAll.filter(r => r.task_id === selectedTask.id)
    return pctFromDailyProgress(targetQty, taskDailyRows)
  }, [selectedTask, taskTargetsAll, dailyProgressRowsAll])

  if (loading) {
    return (
      <div className="card gantt-card">
        <div className="card-header"><h3>Gantt İş Planı</h3></div>
        <p className="gantt-empty">Yükleniyor...</p>
      </div>
    )
  }

  if (projectId && !ganttLoading && !authorized) {
    return <UnauthorizedScopeNotice />
  }

  if (withDates.length === 0) {
    return (
      <div className="gantt-page">
        <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
        <KpiStrip total={tasks.length} devam={kpis.ongoing} late={kpis.late} crit={kpis.crit} />
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
      <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
      <KpiStrip total={tasks.length} devam={kpis.ongoing} late={kpis.late} crit={kpis.crit} />

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
                    ? Math.round(items.reduce((sum, task) => sum + Number(task.progress_pct || 0), 0) / items.length)
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
                        const pct = Math.round(Number(task.progress_pct || 0))
                        const isCrit = !!task.is_critical
                        const isLate = isTaskLate(task, today)
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
            dailyPct={selectedTaskDailyPct}
            siteChief={siteChief}
            isCritical={!!selectedTask?.is_critical}
            siteChiefView={siteChiefView}
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

function TaskDetailPanel({ task, group, dailyPct, siteChief, isCritical, siteChiefView, onClose }) {
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

  const rows = [
    ['Durum', statusLabel(task.status), task.status === 'devam_ediyor' ? 'blue' : 'muted'],
    ['Grup', group || '-', groupCfg.tone],
    // Şantiye şefi kendi projesini görüntülediği için "Sorumlu" satırı gereksiz — onun yerine
    // sahada işe yarayan ekipman/genel notları gösterilir (get_project_gantt RPC'sinden gelir).
    ...(siteChiefView ? [] : [['Sorumlu', siteChief || '-']]),
    ['Plan Başlangıç', fmtDate(task.planned_start)],
    ['Plan Bitiş', fmtDate(task.planned_end)],
    ['Süre', `${duration} gün`],
    ['Kümülatif İlerleme', `%${task.progress_pct || 0}`, 'blue'],
    ['Günlük İlerleme', `%${dailyPct || 0}`, dailyPct > 0 ? 'green' : 'muted'],
    ['Kritiklik', isCritical ? 'Kritik Yol' : 'Normal', isCritical ? 'red' : 'muted'],
    ...(siteChiefView && task.equipment_notes ? [['Ekipman Notu', task.equipment_notes]] : []),
    ...(siteChiefView && task.notes ? [['Not', task.notes]] : []),
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
      </div>
    </aside>
  )
}
