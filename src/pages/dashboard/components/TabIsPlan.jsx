import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import ExportButton from '../../../components/ui/ExportButton'

// ─────────────────────────────────────────────────────────
//  Grup Yapılandırması
// ─────────────────────────────────────────────────────────
const GROUP_ORDER = [
  'Şantiye Mobilizasyon',
  'Mekanik Bölüm',
  'Elektriksel — DC',
  'Elektriksel — AC',
  'Elektriksel — OG',
  'Topraklama',
  'ENH',
  'Devreye Alma',
]

const GROUP_CONFIG = {
  'Şantiye Mobilizasyon': { bg: '#1e40af', bar: '#60a5fa', label: 'ŞANTİYE MOBİLİZASYON' },
  'Mekanik Bölüm':        { bg: '#15803d', bar: '#4ade80', label: 'MEKANİK BÖLÜM'         },
  'Elektriksel — DC':     { bg: '#6d28d9', bar: '#a78bfa', label: 'ELEKTRİKSEL — DC'       },
  'Elektriksel — AC':     { bg: '#c2410c', bar: '#fb923c', label: 'ELEKTRİKSEL — AC'       },
  'Elektriksel — OG':     { bg: '#0369a1', bar: '#38bdf8', label: 'ELEKTRİKSEL — OG'       },
  'Topraklama':           { bg: '#78350f', bar: '#d97706', label: 'TOPRAKLAMA'              },
  'ENH':                  { bg: '#1e3a5f', bar: '#93c5fd', label: 'ENH'                    },
  'Devreye Alma':         { bg: '#0f766e', bar: '#2dd4bf', label: 'DEVREYE ALMA'            },
  '_diger':               { bg: '#475569', bar: '#94a3b8', label: 'DİĞER'                  },
}

// ── Kategori → grup anahtarı eşlemesi (group_label yoksa fallback) ──
function resolveGroup(task) {
  if (task.group_label && GROUP_CONFIG[task.group_label]) return task.group_label
  const c = (task.category || '').toLowerCase()
  const n = (task.task_name || '').toLowerCase()
  if (c.includes('şantiye') || c.includes('santiye') || c.includes('mobilizasyon')) return 'Şantiye Mobilizasyon'
  if (c.includes('mekanik')) return 'Mekanik Bölüm'
  if (c.includes('elektrik') && c.includes('dc')) return 'Elektriksel — DC'
  if (c.includes('elektrik') && c.includes('ac') && !c.includes('og')) return 'Elektriksel — AC'
  if (c.includes('elektrik') && (c.includes('og') || c.includes('orta'))) return 'Elektriksel — OG'
  if (c.includes('topraklama')) return 'Topraklama'
  if (c.includes('enh') || c.includes('enerji nakil')) return 'ENH'
  if (c.includes('devreye')) return 'Devreye Alma'
  // isim bazlı fallback
  if (n.includes('arazi') || n.includes('depo') || n.includes('ulaşım')) return 'Şantiye Mobilizasyon'
  if (n.includes('kolon') || n.includes('kiriş') || n.includes('panel montaj')) return 'Mekanik Bölüm'
  if (n.includes(' dc') || n.includes('konnektör')) return 'Elektriksel — DC'
  if (n.includes('inverter') || n.includes('ges pano')) return 'Elektriksel — AC'
  if (n.includes('xlpe') || n.includes('trafo') || n.includes('köşk') || n.includes('scada')) return 'Elektriksel — OG'
  if (n.includes('enh') || n.includes('enerji nakil')) return 'ENH'
  if (n.includes('topraklama')) return 'Topraklama'
  if (n.includes('devreye') || n.includes('test')) return 'Devreye Alma'
  return '_diger'
}

// ── Bar rengi (status bazlı) ──
function barStyle(task, groupKey, today) {
  const cfg  = GROUP_CONFIG[groupKey] || GROUP_CONFIG['_diger']
  const bar  = cfg.bar
  const late  = task.planned_end && new Date(task.planned_end) < today && task.status !== 'tamamlandi'
  if (late)                         return { bg: `${bar}22`, fill: '#ef444488', border: '1.5px solid #ef4444' }
  if (task.status === 'tamamlandi') return { bg: `${bar}22`, fill: bar,         border: `1.5px solid ${bar}` }
  if (task.status === 'devam_ediyor') return { bg: `${bar}15`, fill: `${bar}bb`, border: `1.5px solid ${bar}88` }
  if (task.status === 'askida')     return { bg: '#94a3b822', fill: '#94a3b8',    border: '1.5px solid #94a3b8' }
  return { bg: `${bar}10`, fill: `${bar}55`, border: `1.5px solid ${bar}44` }
}

// ── Sütun genişlikleri ──
const W_NO   = 48
const W_ISIM = 210
const W_BAS  = 84
const W_BIT  = 84
const W_SURE = 54
const W_PCT  = 64
const W_MON  = 110

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmt(n) { return Number(n || 0).toLocaleString('tr-TR') }

// ─────────────────────────────────────────────────────────
//  Ana Bileşen
// ─────────────────────────────────────────────────────────
export default function TabIsPlan({ projectId, filterDate }) {
  const [tasks,         setTasks]         = useState([])
  const [project,       setProject]       = useState(null)
  const [criticalCodes, setCriticalCodes] = useState(new Set())
  const [critCount,     setCritCount]     = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [collapsed,     setCollapsed]     = useState(new Set())
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [groupFilter,   setGroupFilter]   = useState('all')
  const [taskProgressByDate, setTaskProgressByDate] = useState({})

  useEffect(() => {
    setLoading(true)

    async function load() {
      if (projectId) {
        const [
          { data: projData },
          { data: tasksData },
          { data: critData },
          { data: progItemsData },
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
        ])
        setProject(projData || null)
        setTasks(tasksData || [])
        const codes = new Set((critData || []).map(c => c.path_code).filter(Boolean))
        setCriticalCodes(codes)
        setCritCount(codes.size)

        // progress_daily → filterDate'e kadar task bazlı ilerleme
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
          for (const [tid, { sum, count }] of Object.entries(taskSums)) {
            finalMap[tid] = sum / count
          }
          setTaskProgressByDate(finalMap)
        } else {
          setTaskProgressByDate({})
        }
      } else {
        // Tüm projeler
        const { data: tasksData } = await supabase
          .from('project_tasks')
          .select('id, task_code, task_name, group_label, category, planned_start, planned_end, progress_pct, status')
          .order('planned_start', { ascending: true })
        setTasks(tasksData || [])
        setCritCount(0)
      }
      setLoading(false)
    }

    load().catch(() => setLoading(false))
  }, [projectId, filterDate])

  if (loading) {
    return (
      <div className="card">
        <div className="card-header"><h3>Gantt İş Planı</h3></div>
        <p style={{ padding: '2rem', color: 'var(--color-muted)' }}>Yükleniyor…</p>
      </div>
    )
  }

  const today = filterDate ? new Date(filterDate + 'T00:00:00') : new Date()
  today.setHours(0, 0, 0, 0)

  // ── Filtrele ──
  const filteredTasks = tasks.filter(t => {
    if (groupFilter !== 'all' && resolveGroup(t) !== groupFilter) return false
    if (statusFilter === 'devam')      return t.status === 'devam_ediyor'
    if (statusFilter === 'tamamlandi') return t.status === 'tamamlandi'
    if (statusFilter === 'geciken') {
      return t.planned_end && new Date(t.planned_end) < today && t.status !== 'tamamlandi'
    }
    return true
  })

  const withDates = filteredTasks.filter(t => t.planned_start && t.planned_end)

  // ── KPI hesaplama (tüm tasklar üzerinden, filtre uygulanmadan) ──
  const allLate   = tasks.filter(t => t.planned_end && new Date(t.planned_end) < today && t.status !== 'tamamlandi').length
  const allDevam  = tasks.filter(t => t.status === 'devam_ediyor').length
  const allActive = tasks.filter(t => {
    if (!t.planned_start || !t.planned_end) return false
    return new Date(t.planned_start) <= today && new Date(t.planned_end) >= today
  }).length

  // ── Tüm grup isimleri (filtre dropdown için) — erken dönüşten önce hesaplanmalı ──
  const allGroupNames = [...new Set(tasks.map(t => resolveGroup(t)))].sort()

  if (withDates.length === 0) {
    return (
      <div>
        <KpiStrip total={tasks.length} devam={allDevam} late={allLate} crit={critCount} active={allActive} />
        <div className="card">
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <h3 style={{ margin: 0 }}>Gantt İş Planı</h3>
              </div>
              {project && (
                <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>
                  {project.name}
                  {project.start_date   && ` · Başlangıç: ${fmtDate(project.start_date)}`}
                  {project.target_date  && ` · Bitiş: ${fmtDate(project.target_date)}`}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
                <option value="all">Tüm Durumlar</option>
                <option value="devam">Devam Eden</option>
                <option value="geciken">Geciken</option>
                <option value="tamamlandi">Tamamlanan</option>
              </select>
              <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={selectStyle}>
                <option value="all">Tüm Gruplar</option>
                {allGroupNames.map(g => (
                  <option key={g} value={g}>{GROUP_CONFIG[g]?.label || g}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-muted)' }}>
            {tasks.length === 0
              ? 'Henüz iş kalemi eklenmemiş.'
              : 'Seçilen filtreye uyan tarihli iş kalemi bulunamadı.'}
          </p>
        </div>
      </div>
    )
  }

  // ── Proje / Dönem tarihleri ──
  const projStartTs = project?.start_date
    ? new Date(project.start_date).getTime()
    : Math.min(...withDates.map(t => new Date(t.planned_start).getTime()))
  const projEndTs = project?.target_date
    ? new Date(project.target_date).getTime()
    : Math.max(...withDates.map(t => new Date(t.planned_end).getTime()))

  // ── Aylık sütunlar ──
  const months = []
  let cur = new Date(new Date(projStartTs).getFullYear(), new Date(projStartTs).getMonth(), 1)
  while (cur.getTime() <= projEndTs) {
    months.push({
      label: cur.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase(),
      year: cur.getFullYear(),
      month: cur.getMonth(),
    })
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }

  const showToday  = today.getTime() >= projStartTs && today.getTime() <= projEndTs
  const beforeProj = today.getTime() < projStartTs
  const afterProj  = today.getTime() > projEndTs
  const daysUntil  = Math.abs(Math.round((projStartTs - today.getTime()) / 86400000))
  const daysOver   = Math.abs(Math.round((today.getTime() - projEndTs) / 86400000))

  // ── Gruplama ──
  const grouped = {}
  withDates.forEach(t => {
    const k = resolveGroup(t)
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(t)
  })
  const groupKeys = [...GROUP_ORDER, '_diger'].filter(k => grouped[k])

  function toggleGroup(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Hücre stili
  const cell = {
    flexShrink: 0, padding: '4px 6px', borderRight: '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center',
  }
  const th = {
    ...cell,
    background: '#1e293b', color: '#f1f5f9', fontSize: 10, fontWeight: 700,
    justifyContent: 'center', borderRight: '1px solid #334155',
    borderBottom: '2px solid #475569', whiteSpace: 'nowrap',
  }

  return (
    <div>
      {/* ── KPI Şeridi ── */}
      <KpiStrip total={tasks.length} devam={allDevam} late={allLate} crit={critCount} active={allActive} />

      <div className="card">
        <div className="card-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ marginBottom: 0 }}>Gantt İş Planı</h3>
            </div>
            {project && (
              <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>
                {project.name}
                {project.capacity_kwp && ` · ${(project.capacity_kwp / 1000).toFixed(3)} MWp`}
                {project.location     && ` · ${project.location}`}
                {project.start_date   && ` · Başlangıç: ${fmtDate(project.start_date)}`}
                {project.target_date  && ` · Bitiş: ${fmtDate(project.target_date)}`}
              </p>
            )}
          </div>

          {/* Filtreler + Export */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="devam">Devam Eden</option>
              <option value="geciken">Geciken</option>
              <option value="tamamlandi">Tamamlanan</option>
            </select>

            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">Tüm Gruplar</option>
              {allGroupNames.map(g => (
                <option key={g} value={g}>{GROUP_CONFIG[g]?.label || g}</option>
              ))}
            </select>

            <ExportButton
              title="Gantt İş Planı"
              disabled={withDates.length === 0}
              getData={() => ({
                columns: ['Kod', 'İş Kalemi', 'Grup', 'Başlangıç', 'Bitiş', 'İlerleme (%)', 'Durum'],
                rows: withDates.map(t => [
                  t.task_code || '—',
                  t.task_name || '—',
                  resolveGroup(t),
                  fmtDate(t.planned_start),
                  fmtDate(t.planned_end),
                  Math.round(Number(t.progress_pct || 0)),
                  t.status || '—',
                ]),
              })}
            />
          </div>
        </div>

        {/* ── Proje Durumu Banner ── */}
        {beforeProj && (
          <div style={{ padding: '0.625rem 1.5rem', background: '#dbeafe', color: '#1d4ed8', fontSize: 12, fontWeight: 600 }}>
            Proje başlamasına {daysUntil} gün kaldı
          </div>
        )}
        {afterProj && (
          <div style={{ padding: '0.625rem 1.5rem', background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
            Planlanan bitiş tarihi {daysOver} gün geçti
          </div>
        )}
        {showToday && (
          <div style={{ padding: '0.375rem 1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 2, height: 12, background: '#ef4444', borderRadius: 1, display: 'inline-block' }} />
              Bugün: {today.toLocaleDateString('tr-TR')}
            </span>
          </div>
        )}

        {/* ── Gantt Tablosu ── */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: W_NO + W_ISIM + W_BAS + W_BIT + W_SURE + W_PCT + months.length * W_MON }}>

            {/* Başlık satırı */}
            <div style={{ display: 'flex' }}>
              <div style={{ ...th, width: W_NO }}>No</div>
              <div style={{ ...th, width: W_ISIM, justifyContent: 'flex-start' }}>İŞ KALEMİ / BÖLÜM</div>
              <div style={{ ...th, width: W_BAS }}>BAŞLANGIÇ</div>
              <div style={{ ...th, width: W_BIT }}>BİTİŞ</div>
              <div style={{ ...th, width: W_SURE }}>SÜRE</div>
              <div style={{ ...th, width: W_PCT }}>İLERL.</div>
              {months.map((m, i) => (
                <div key={i} style={{ ...th, width: W_MON, background: '#1e3a5f' }}>{m.label}</div>
              ))}
            </div>

            {/* Gruplar */}
            {groupKeys.map(groupKey => {
              const cfg    = GROUP_CONFIG[groupKey] || GROUP_CONFIG['_diger']
              const items  = grouped[groupKey] || []
              const isOpen = !collapsed.has(groupKey)
              const grpAvg = items.length
                ? items.reduce((s, t) => s + (taskProgressByDate[t.id] !== undefined ? taskProgressByDate[t.id] : Number(t.progress_pct || 0)), 0) / items.length
                : 0

              return (
                <div key={groupKey}>
                  {/* Grup başlığı */}
                  <div
                    style={{ display: 'flex', background: cfg.bg, minHeight: 32, cursor: 'pointer' }}
                    onClick={() => toggleGroup(groupKey)}
                  >
                    <div style={{ width: W_NO, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: 12, opacity: 0.8 }}>{isOpen ? '▼' : '▶'}</span>
                    </div>
                    <div style={{
                      width: W_ISIM + W_BAS + W_BIT + W_SURE + W_PCT,
                      flexShrink: 0, padding: '6px 10px',
                      color: '#fff', fontSize: 11, fontWeight: 800,
                      letterSpacing: '0.06em', borderRight: '1px solid rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span>{cfg.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
                        {items.length} görev &nbsp;|&nbsp; %{Math.round(grpAvg)}
                      </span>
                    </div>
                    {months.map((m, mi) => (
                      <div key={mi} style={{ width: W_MON, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>

                  {/* Görev satırları */}
                  {isOpen && items.map((task, i) => {
                    const start    = new Date(task.planned_start).getTime()
                    const end      = new Date(task.planned_end).getTime()
                    const durationDays = Math.round((end - start) / 86400000)
                    const pct      = taskProgressByDate[task.id] !== undefined
                      ? taskProgressByDate[task.id]
                      : Number(task.progress_pct || 0)
                    const bStyle   = barStyle(task, groupKey, today)
                    const isCrit   = criticalCodes.has(task.task_code)
                    const isLate   = end < today.getTime() && task.status !== 'tamamlandi'
                    const rowBg    = i % 2 === 0 ? '#ffffff' : '#f8fafc'

                    return (
                      <div key={task.id} style={{
                        display: 'flex', minHeight: 34,
                        background: rowBg,
                        borderBottom: '1px solid #e2e8f0',
                      }}>
                        {/* No */}
                        <div style={{ ...cell, width: W_NO, justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.bar }}>
                            {task.task_code || (i + 1)}
                          </span>
                          {isCrit && (
                            <span style={{ fontSize: 9, background: '#f59e0b', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>K</span>
                          )}
                        </div>

                        {/* İsim */}
                        <div style={{ ...cell, width: W_ISIM, fontSize: 12, color: isLate ? '#ef4444' : 'var(--color-text)', overflow: 'hidden' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {task.task_name || '—'}
                          </span>
                        </div>

                        {/* Başlangıç */}
                        <div style={{ ...cell, width: W_BAS, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                          {new Date(task.planned_start).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>

                        {/* Bitiş */}
                        <div style={{ ...cell, width: W_BIT, justifyContent: 'center', fontSize: 11, color: isLate ? '#ef4444' : 'var(--color-muted)' }}>
                          {new Date(task.planned_end).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>

                        {/* Süre */}
                        <div style={{ ...cell, width: W_SURE, justifyContent: 'center', fontSize: 11, color: 'var(--color-muted)' }}>
                          {durationDays}
                        </div>

                        {/* İlerleme */}
                        <div style={{ ...cell, width: W_PCT, justifyContent: 'center', fontSize: 11, fontWeight: 700, color: pct > 0 ? (pct >= 100 ? '#16a34a' : cfg.bar) : 'var(--color-muted)' }}>
                          %{Math.round(pct)}
                        </div>

                        {/* Gantt barları */}
                        {months.map((m, mi) => {
                          const mStart  = new Date(m.year, m.month, 1).getTime()
                          const mEnd    = new Date(m.year, m.month + 1, 0, 23, 59, 59).getTime()
                          const barS    = Math.max(start, mStart)
                          const barE    = Math.min(end, mEnd)
                          const isMonth = today.getTime() >= mStart && today.getTime() <= mEnd
                          const todayX  = isMonth ? ((today.getTime() - mStart) / (mEnd - mStart)) * 100 : null

                          if (barS > barE) {
                            return (
                              <div key={mi} style={{ width: W_MON, flexShrink: 0, position: 'relative', borderRight: '1px solid #e2e8f0', background: rowBg }}>
                                {todayX !== null && showToday && (
                                  <div style={{ position: 'absolute', left: `${todayX}%`, top: 0, bottom: 0, width: 1.5, background: '#ef444488', zIndex: 2 }} />
                                )}
                              </div>
                            )
                          }

                          const leftPct  = ((barS - mStart) / (mEnd - mStart)) * 100
                          const widthPct = Math.max(2, ((barE - barS) / (mEnd - mStart)) * 100)

                          return (
                            <div key={mi} style={{ width: W_MON, flexShrink: 0, position: 'relative', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', background: rowBg }}>
                              {todayX !== null && showToday && (
                                <div style={{ position: 'absolute', left: `${todayX}%`, top: 0, bottom: 0, width: 1.5, background: '#ef444488', zIndex: 2 }} />
                              )}
                              {/* Bar */}
                              <div style={{
                                position: 'absolute',
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                height: 18,
                                borderRadius: 4,
                                overflow: 'hidden',
                                background: bStyle.bg,
                                border: bStyle.border,
                                zIndex: 1,
                                boxShadow: isCrit ? '0 0 0 1px #f59e0b' : 'none',
                              }}>
                                {pct > 0 && (
                                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: bStyle.fill }} />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Legend */}
            <div style={{ display: 'flex', gap: '1.25rem', padding: '0.75rem 1rem', borderTop: '2px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
              {groupKeys.map(k => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11, color: 'var(--color-muted)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: (GROUP_CONFIG[k] || GROUP_CONFIG['_diger']).bar, display: 'inline-block' }} />
                  {(GROUP_CONFIG[k] || GROUP_CONFIG['_diger']).label}
                </span>
              ))}
              {showToday && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11, color: '#ef4444' }}>
                  <span style={{ width: 2, height: 12, background: '#ef4444', borderRadius: 1, display: 'inline-block' }} />
                  Bugün
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 11, color: 'var(--color-muted)', marginLeft: 'auto' }}>
                <span style={{ fontSize: 9, background: '#f59e0b', color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>K</span>
                Kritik Yol
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  KPI Şeridi
// ─────────────────────────────────────────────────────────
function KpiStrip({ total, devam, late, crit, active }) {
  const cards = [
    { label: 'Toplam İş Paketi', value: total,  color: 'var(--color-primary)', note: 'kayıtlı görev' },
    { label: 'Devam Eden',       value: devam,  color: '#3b82f6',              note: 'aktif görev'   },
    { label: 'Geciken',          value: late,   color: late > 0 ? '#ef4444' : '#16a34a', note: 'gecikmiş görev' },
    { label: 'Kritik İşler',     value: crit,   color: '#f59e0b',              note: 'kritik yolda'  },
    { label: 'Bugün Aktif',      value: active, color: '#0f766e',              note: 'bugün sürüyor' },
  ]
  return (
    <div className="gantt-kpi-strip" style={{ marginBottom: '1.25rem' }}>
      {cards.map(c => (
        <div key={c.label} className="kpi-card-compact">
          <p className="kpi-card-compact-label">{c.label}</p>
          <p style={{ fontSize: '1.75rem', fontWeight: 700, color: c.color, margin: 0, lineHeight: 1 }}>{c.value}</p>
          <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: 0 }}>{c.note}</p>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  Select stil yardımcısı
// ─────────────────────────────────────────────────────────
const selectStyle = {
  padding: '6px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--color-text)',
  background: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  outline: 'none',
}
