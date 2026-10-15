import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { buildGroupTree, collectNodeTasks, GROUP_INDENT_PX, groupConfigFor } from './TabIsPlan'
import {
  buildMonthRange, buildTaskCells, categoryLabel, cellTooltip, fmtPct, fmtQty,
  indexRowsByTask, isActiveCell, monthKey, monthPhase, performanceTone,
} from '../../../utils/aylikPlan'

// Aylık İş Planı (Faz 1: salt okunur). Satırlar görevler (Genel/Detaylı ile
// aynı buildGroupTree hiyerarşisi ve aynı görev sırası — üst bileşenin
// get_project_gantt'tan aldığı liste), kolonlar projenin start_date →
// target_date ayları. Hücre verisi vw_task_monthly_plan_vs_actual'dan.
// Faz 2'de (admin/proje_yoneticisi) hücre düzenleme MonthCell'in `editable`
// özelliğine bağlanacak; bugün hep false.

const MODES = [
  { key: 'plan', label: 'Plan' },
  { key: 'plan_gercek', label: 'Plan / Gerçekleşen' },
  { key: 'kumulatif', label: 'Kümülatif %' },
]

const PAGE = 1000

// PostgREST varsayılan satır sınırı (1000) büyük projelerde (görev × ay)
// aşılabilir — sayfa sayfa çekilir.
async function fetchAll(buildQuery) {
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data || []))
    if (!data || data.length < PAGE) return all
  }
}

function readMode() {
  try {
    const stored = window.localStorage.getItem('is-plani-aylik-mod')
    return MODES.some(m => m.key === stored) ? stored : 'plan'
  } catch { return 'plan' }
}

function MonthCell({ cell, task, mode, phase, editable = false }) {
  const classes = ['aylik-cell', `phase-${phase}`]
  if (cell.source === 'hesaplanan') classes.push('src-hesaplanan')
  if (cell.note) classes.push('has-note')
  if (editable) classes.push('editable')

  const target = Number(task.target_qty || 0)
  let content = null

  if (mode === 'plan') {
    if (cell.planned > 0) content = fmtQty(cell.planned)
  } else if (mode === 'plan_gercek') {
    if (cell.planned > 0 || cell.actual > 0) {
      content = <>{fmtQty(cell.actual)}<span className="aylik-sep">/</span>{fmtQty(cell.planned)}</>
      const tone = phase === 'future' ? null : performanceTone(cell.planned, cell.actual)
      if (tone) classes.push(`tone-${tone}`)
    }
  } else if (cell.inSpan && (cell.plannedCum > 0 || cell.actualCum > 0)) {
    content = (
      <span className="aylik-cum">
        <span>P {fmtPct(cell.plannedCum, target)}</span>
        {phase !== 'future' && <span>G {fmtPct(cell.actualCum, target)}</span>}
      </span>
    )
  }

  const hasData = cell.hasRow || cell.actual > 0
  return (
    <td
      className={classes.join(' ')}
      data-month={cell.monthKey}
      data-planned={cell.planned}
      data-actual={cell.actual}
      data-source={cell.source || ''}
      title={hasData ? cellTooltip(cell, task) : undefined}
    >
      {content}
    </td>
  )
}

export default function TabIsPlaniAylik({ projectId, project, tasks, today, dataVersion }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [mode, setMode] = useState(readMode)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [onlyCurrent, setOnlyCurrent] = useState(false)
  const [collapsed, setCollapsed] = useState(new Set())

  useEffect(() => {
    try { window.localStorage.setItem('is-plani-aylik-mod', mode) } catch { /* yok say */ }
  }, [mode])

  // Görünüm source_qty/source_unit/source_code döndürmediği için (tooltip'teki
  // "Excel: …" satırı) bu üç alan aynı RLS'li tablodan paralel çekilip
  // görev × ay anahtarıyla birleştirilir.
  useEffect(() => {
    if (!projectId) return
    let alive = true
    setError('')
    Promise.all([
      fetchAll(() => supabase
        .from('vw_task_monthly_plan_vs_actual')
        .select('task_id, month, planned_qty, actual_qty, source, note')
        .eq('project_id', projectId)
        .order('task_id').order('month')),
      fetchAll(() => supabase
        .from('task_monthly_plan')
        .select('id, task_id, month, source_code, source_qty, source_unit')
        .eq('project_id', projectId)
        .order('id')),
    ])
      .then(([viewRows, rawRows]) => {
        if (!alive) return
        const raw = new Map(rawRows.map(r => [`${r.task_id}|${monthKey(r.month)}`, r]))
        setRows(viewRows.map(r => {
          const extra = raw.get(`${r.task_id}|${monthKey(r.month)}`)
          return extra
            ? { ...r, source_code: extra.source_code, source_qty: extra.source_qty, source_unit: extra.source_unit }
            : r
        }))
        setLoading(false)
      })
      .catch(err => {
        if (!alive) return
        setError(err?.message || 'Aylık plan yüklenemedi.')
        setLoading(false)
      })
    return () => { alive = false }
  }, [projectId, dataVersion, reloadToken])

  const rowsByTask = useMemo(() => indexRowsByTask(rows), [rows])

  const months = useMemo(
    () => buildMonthRange(project?.start_date, project?.target_date, rows.map(r => monthKey(r.month))),
    [project?.start_date, project?.target_date, rows]
  )
  const currentKey = monthKey(today || new Date())
  const currentIndex = months.findIndex(m => m.key === currentKey)

  // Her görevin hücreleri bir kez hesaplanır; filtre/özet/ağaç bunları paylaşır.
  const cellsByTask = useMemo(() => {
    const map = new Map()
    tasks.forEach(task => map.set(task.id, buildTaskCells(rowsByTask.get(task.id), months)))
    return map
  }, [tasks, rowsByTask, months])

  const categories = useMemo(
    () => [...new Set(tasks.map(t => t.category).filter(Boolean))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'tr')),
    [tasks]
  )

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR')
    return tasks.filter(task => {
      if (categoryFilter !== 'all' && task.category !== categoryFilter) return false
      if (term) {
        const hay = `${task.task_code || ''} ${task.task_name || ''}`.toLocaleLowerCase('tr-TR')
        if (!hay.includes(term)) return false
      }
      if (onlyCurrent) {
        if (currentIndex === -1) return false
        if (!isActiveCell(cellsByTask.get(task.id)?.[currentIndex])) return false
      }
      return true
    })
  }, [tasks, search, categoryFilter, onlyCurrent, currentIndex, cellsByTask])

  const groupTree = useMemo(() => buildGroupTree(filteredTasks), [filteredTasks])

  const activeCounts = useMemo(() => months.map((_, i) =>
    filteredTasks.filter(t => isActiveCell(cellsByTask.get(t.id)?.[i])).length
  ), [months, filteredTasks, cellsByTask])

  function toggleGroup(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function monthClass(i) {
    return i === currentIndex ? ' is-current' : ''
  }

  function renderNode(node) {
    const isOpen = !collapsed.has(node.key)
    const nodeTasks = collectNodeTasks(node)
    const cfg = groupConfigFor(node.label)
    const out = [
      <tr key={`g:${node.key}`} className={`aylik-group-row tone-${cfg.tone}`} data-group={node.key}>
        <td className="aylik-sticky aylik-group-label" colSpan={2}>
          <button type="button" aria-expanded={isOpen} onClick={() => toggleGroup(node.key)} style={{ paddingLeft: node.depth * GROUP_INDENT_PX }}>
            <span className="aylik-toggle">{isOpen ? '▾' : '▸'}</span>
            <strong>{cfg.label}</strong>
          </button>
        </td>
        <td className="aylik-sticky aylik-group-rest" colSpan={2}>{nodeTasks.length} kalem</td>
        {months.map((m, i) => {
          const n = nodeTasks.filter(t => isActiveCell(cellsByTask.get(t.id)?.[i])).length
          return <td key={m.key} className={`aylik-group-count${monthClass(i)}`} title={n ? `${m.label}: ${n} aktif kalem` : undefined}>{n || ''}</td>
        })}
      </tr>,
    ]
    if (!isOpen) return out
    node.childList.forEach(child => out.push(...renderNode(child)))
    node.tasks.forEach(task => {
      const cells = cellsByTask.get(task.id) || []
      out.push(
        <tr key={task.id} className="aylik-task-row" data-task-code={task.task_code || ''}>
          <td className="aylik-sticky aylik-col-kod">{task.task_code || '—'}</td>
          <td className="aylik-sticky aylik-col-ad" title={task.task_name || ''}>
            <span style={{ paddingLeft: node.depth * GROUP_INDENT_PX + 14 }}>
              <span className="aylik-kod-mobil">{task.task_code ? `${task.task_code} · ` : ''}</span>
              {task.task_name || '—'}
            </span>
          </td>
          <td className="aylik-sticky aylik-col-birim">{task.unit || '—'}</td>
          <td className="aylik-sticky aylik-col-hedef">{Number(task.target_qty) > 0 ? fmtQty(task.target_qty) : '—'}</td>
          {cells.map(cell => (
            <MonthCell key={cell.monthKey} cell={cell} task={task} mode={mode} phase={monthPhase(cell.monthKey, currentKey)} />
          ))}
        </tr>
      )
    })
    return out
  }

  const filtered = Boolean(search.trim()) || categoryFilter !== 'all' || onlyCurrent

  return (
    <div className="card gantt-card aylik-plan">
      <div className="gantt-card-header">
        <div>
          <h3>Aylık İş Planı</h3>
          <p>
            {filteredTasks.length} iş kalemi{filtered ? ' (filtrelendi)' : ''} · görev biriminde aylık plan
            {mode === 'plan_gercek' ? ' · gerçekleşen / plan' : ''}
          </p>
        </div>
        <div className="gantt-toolbar">
          <div className="aylik-mode" role="group" aria-label="Hücre görünümü">
            {MODES.map(m => (
              <button key={m.key} type="button" className={mode === m.key ? 'active' : ''} aria-pressed={mode === m.key} onClick={() => setMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="aylik-search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Kod veya iş kalemi ara…"
          />
          <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
            <option value="all">Tüm Kategoriler</option>
            {categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
          <label className="aylik-only-current">
            <input type="checkbox" checked={onlyCurrent} onChange={event => setOnlyCurrent(event.target.checked)} />
            Sadece bu ay aktif olanlar
          </label>
        </div>
      </div>

      {loading ? (
        <p className="gantt-empty">Yükleniyor...</p>
      ) : error ? (
        <div className="gantt-empty">
          <p style={{ margin: '0 0 .6rem' }}>Aylık plan yüklenemedi: {error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); setReloadToken(t => t + 1) }}>Tekrar Dene</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="gantt-empty">Bu proje için aylık plan girilmemiş.</p>
      ) : months.length === 0 ? (
        <p className="gantt-empty">Projenin başlangıç ve hedef tarihi olmadığı için ay kolonları oluşturulamadı.</p>
      ) : filteredTasks.length === 0 ? (
        <p className="gantt-empty">Filtreye uyan iş kalemi bulunamadı.</p>
      ) : (
        <>
          <div className="aylik-scroll">
            <table className="aylik-table">
              <thead>
                <tr>
                  <th className="aylik-sticky aylik-col-kod">Kod</th>
                  <th className="aylik-sticky aylik-col-ad">İş Kalemi</th>
                  <th className="aylik-sticky aylik-col-birim">Birim</th>
                  <th className="aylik-sticky aylik-col-hedef">Hedef</th>
                  {months.map((m, i) => (
                    <th key={m.key} className={`aylik-month${monthClass(i)}`} data-month={m.key}>{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupTree.flatMap(node => renderNode(node))}
              </tbody>
              <tfoot>
                <tr className="aylik-summary-row">
                  <td className="aylik-sticky aylik-group-label" colSpan={2}>Aktif kalem sayısı</td>
                  <td className="aylik-sticky aylik-group-rest" colSpan={2}>{filteredTasks.length} kalem</td>
                  {activeCounts.map((n, i) => (
                    <td key={months[i].key} className={`aylik-group-count${monthClass(i)}`} data-month={months[i].key}>{n || ''}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="aylik-legend">
            {mode === 'plan_gercek' && (
              <>
                <span><i className="sw tone-iyi" />≥%100</span>
                <span><i className="sw tone-orta" />%70–99</span>
                <span><i className="sw tone-kotu" />&lt;%70</span>
                <span>Gelecek aylar renksiz</span>
              </>
            )}
            <span><i className="sw sw-hesaplanan" />Gün bazlı hesaplandı</span>
            <span><i className="sw sw-note" />Not var (üzerine gelin)</span>
            <span><i className="sw sw-current" />Bu ay</span>
          </div>
        </>
      )}
    </div>
  )
}
