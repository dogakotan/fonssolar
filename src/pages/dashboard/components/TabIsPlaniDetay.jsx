import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { StatusDot } from '../../../components/ui/Badge'
import { TONE } from '../../../components/ui/StatusBadge'
import { buildGroupTree, collectNodeTasks, daysBetween, GROUP_INDENT_PX, groupConfigFor, resolveGroup, riskSeverityLabel } from './TabIsPlan'

// Adim2IsKalemleri.jsx'teki wizard durum düzenleyicisiyle aynı 5 değer —
// yalnız target_qty'si olmayan (miktarla ölçülemeyen, kilometre taşı) iş
// kalemlerinde gösterilen durum güncelleme seçici için.
const MILESTONE_STATUS_OPTIONS = [
  { v: 'beklemede', l: 'Beklemede' },
  { v: 'devam_ediyor', l: 'Devam Ediyor' },
  { v: 'tamamlandi', l: 'Tamamlandı' },
  { v: 'askida', l: 'Askıda' },
  { v: 'iptal', l: 'İptal' },
]

// Tablo başlıkla birlikte sayfaya sığsın diye tam yıl yerine 2 haneli yıl —
// Plan/Gerçek başlangıç-bitiş tek kolonda "gg.aa.yy – gg.aa.yy" olarak
// gösteriliyor, bu yüzden fmtDate (TabIsPlan.jsx'in tam tarihli hâli) burada
// kullanılmıyor.
function fmtShort(date) {
  if (!date) return null
  return new Date(date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Yalnız başlangıcı olan (hâlâ açık) görevde "?" gibi kafa karıştıran bir
// bitiş yer tutucusu değil, devam ettiğini gösteren bir ok kullanılır.
function RangeCell({ start, end }) {
  const a = fmtShort(start)
  const b = fmtShort(end)
  if (!a && !b) return <span style={{ color: 'var(--color-muted-light)' }}>—</span>
  if (a && !b) return <span>{a} →</span>
  if (!a && b) return <span>→ {b}</span>
  return <span>{a} – {b}</span>
}

const TASK_STATUS = {
  beklemede: { label: 'Beklemede', tone: 'muted' },
  devam_ediyor: { label: 'Devam Ediyor', tone: 'primary' },
  tamamlandi: { label: 'Tamamlandı', tone: 'success' },
  askida: { label: 'Askıda', tone: 'warning' },
  iptal: { label: 'İptal', tone: 'danger' },
}

const SORT_OPTIONS = [
  { v: 'plan_start', l: 'Plan Başlangıcına Göre' },
  { v: 'sapma', l: 'En Çok Sapmaya Göre' },
  { v: 'ilerleme', l: 'İlerlemeye Göre (Az → Çok)' },
  { v: 'ad', l: 'Göreve Göre (A-Z)' },
]

function dayDiff(a, b) {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000)
}

// Sapma: gerçek bitiş varsa plan bitişle karşılaştırılır (+ gecikme, - erken).
// Gerçek bitiş henüz yoksa ama plan bitiş tarihi geçmiş ve görev hâlâ açıksa
// (tamamlandı/iptal değilse) bugüne kadarki gecikme gösterilir — Gantt'taki
// "Riskli/Geciken" ile aynı mantık, burada sayısal gün farkı olarak.
function computeSapma(task, today) {
  if (task.actual_end && task.planned_end) return dayDiff(task.actual_end, task.planned_end)
  if (task.planned_end && task.status !== 'tamamlandi' && task.status !== 'iptal') {
    const end = new Date(`${task.planned_end}T00:00:00`)
    if (today.getTime() > end.getTime()) return dayDiff(today.toISOString().slice(0, 10), task.planned_end)
  }
  return null
}

// `buildGroupTree`'nin ürettiği düğümlerdeki `tasks` dizisi ham task
// objeleridir (sapma değeri `_sapma` alanına önceden eklenmiş) — kullanıcının
// seçtiği sıralama (plan tarihi/sapma/ilerleme/ad) her düğümde AYRI AYRI
// uygulanır (bkz. sortTreeTasks), grup sırasının kendisi (buildGroupTree'nin
// GROUP_ORDER/en-erken-tarih mantığı) bundan etkilenmez.
function sortTaskList(list, sortBy) {
  const byNullLast = value => (value === null || value === undefined ? Infinity : 0)
  if (sortBy === 'sapma') return [...list].sort((a, b) => (b._sapma ?? -Infinity) - (a._sapma ?? -Infinity))
  if (sortBy === 'ilerleme') return [...list].sort((a, b) => Number(a.progress_pct || 0) - Number(b.progress_pct || 0))
  if (sortBy === 'ad') return [...list].sort((a, b) => (a.task_name || '').localeCompare(b.task_name || '', 'tr-TR'))
  return [...list].sort((a, b) => {
    const diff = byNullLast(a.planned_start) - byNullLast(b.planned_start)
    if (diff !== 0) return diff
    if (!a.planned_start || !b.planned_start) return 0
    return new Date(a.planned_start) - new Date(b.planned_start)
  })
}

function sortTreeTasks(node, sortBy) {
  node.tasks = sortTaskList(node.tasks, sortBy)
  node.childList.forEach(child => sortTreeTasks(child, sortBy))
}

function SapmaCell({ sapma }) {
  if (sapma === null) return <span style={{ color: 'var(--color-muted-light)' }}>—</span>
  if (sapma === 0) return <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>Zamanında</span>
  const tone = sapma > 0 ? TONE.danger : TONE.success
  return (
    <span style={{ color: tone.text, fontWeight: 700 }}>
      {sapma > 0 ? `+${sapma}g` : `${sapma}g`}
    </span>
  )
}

const TH = {
  padding: '7px 7px', textAlign: 'left', fontSize: 9.5, fontWeight: 700, color: 'var(--color-muted)',
  textTransform: 'uppercase', letterSpacing: '0.2px', whiteSpace: 'nowrap', background: 'var(--color-bg)',
  position: 'sticky', top: 0, zIndex: 2, borderBottom: '1px solid var(--color-border-md)',
}
const TD = { padding: '6px 7px', fontSize: 11.5, color: 'var(--color-text)', whiteSpace: 'nowrap', borderTop: '1px solid var(--color-border)' }
const BASE_COLUMN_COUNT = 12

// Tablo satırı içine sığan, kutu/etiket olmayan sade bir durum seçici —
// TabIsPlan.jsx'teki (Gantt detay panelindeki) MilestoneStatusControl'ün
// aynı RPC'yi (set_task_milestone_status) çağıran, satır-içi sıkıştırılmış hâli.
function InlineMilestoneStatus({ task, onSaved }) {
  const [status, setStatus] = useState(task.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setStatus(task.status) }, [task.id, task.status])

  async function handleChange(event) {
    const next = event.target.value
    const previous = status
    setStatus(next)
    setSaving(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('set_task_milestone_status', {
      p_task_id: task.id,
      p_status: next,
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message || 'Durum güncellenemedi.')
      setStatus(previous)
      return
    }
    onSaved?.()
  }

  return (
    <div>
      <select
        value={status}
        onChange={handleChange}
        disabled={saving}
        style={{
          border: '1px solid var(--color-border-md)', borderRadius: 6,
          padding: '3px 5px', font: 'inherit', fontSize: 10.5, fontWeight: 600,
          color: 'var(--color-text)', background: '#fff', cursor: saving ? 'wait' : 'pointer',
        }}
      >
        {MILESTONE_STATUS_OPTIONS.map(opt => (
          <option key={opt.v} value={opt.v}>{opt.l}</option>
        ))}
      </select>
      {error && <p style={{ margin: '3px 0 0', fontSize: 9.5, color: 'var(--color-danger)', fontWeight: 600, whiteSpace: 'normal' }}>{error}</p>}
    </div>
  )
}

// TabIsPlan.jsx'in eski Gantt detay panelindeki modalın birebir aynısı —
// ilerleme girişi artık yalnızca burada, Detaylı İş Planı'nda yapılıyor.
function ProgressEntryModal({ task, onClose, onSaved }) {
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const remaining = Math.max(0, Number(task.target_qty || 0) - Number(task.total_progress || 0))

  async function save() {
    const qty = Number(String(quantity).replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('İlerleme miktarı sıfırdan büyük olmalıdır.')
      return
    }
    if (qty > remaining && !note.trim()) {
      setError('Hedef aşımı için açıklama girin.')
      return
    }

    setSaving(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('add_task_progress', {
      p_task_id: task.id,
      p_qty: qty,
      p_note: note.trim() || null,
      p_report_date: new Date().toISOString().slice(0, 10),
    })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message || 'İlerleme kaydedilemedi.')
      return
    }
    onSaved()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="İlerleme Gir"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.45)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div style={{ width: 'min(460px, 100%)', background: '#fff', borderRadius: 14, boxShadow: '0 24px 70px rgba(15,23,42,.28)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--color-text)' }}>İlerleme Gir</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>{task.task_code} · {task.task_name}</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, color: 'var(--color-muted)', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              ['Hedef', `${Number(task.target_qty || 0).toLocaleString('tr-TR')} ${task.unit || ''}`],
              ['Tamamlanan', `${Number(task.total_progress || 0).toLocaleString('tr-TR')} ${task.unit || ''}`],
              ['Kalan', `${remaining.toLocaleString('tr-TR')} ${task.unit || ''}`],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 10, borderRadius: 9, background: 'var(--color-bg)' }}>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--color-muted)' }}>{label}</span>
                <strong style={{ display: 'block', marginTop: 3, fontSize: 12.5, color: 'var(--color-text)' }}>{value}</strong>
              </div>
            ))}
          </div>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)' }}>
            Bugünkü İlerleme ({task.unit || 'birim'})
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={event => setQuantity(event.target.value)}
              autoFocus
              style={{ border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '10px 11px', font: 'inherit' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)' }}>
            Not
            <textarea
              rows={3}
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Yapılan işi veya hedef aşımı nedenini yazın"
              style={{ border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '10px 11px', font: 'inherit', resize: 'vertical' }}
            />
          </label>
          {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-danger)', fontWeight: 600 }}>{error}</p>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '9px 14px', background: '#fff', cursor: 'pointer' }}>İptal</button>
          <button type="button" onClick={save} disabled={saving} style={{ border: 'none', borderRadius: 8, padding: '9px 14px', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: saving ? .65 : 1 }}>
            {saving ? 'Kaydediliyor…' : 'İlerlemeyi Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Bir grup düğümünü (ve iç içe alt dallarını) tablo satırlarına açar —
// Gantt'taki renderGanttGroupNode ile aynı fikir, yalnızca div/grid yerine
// <tr>/<td> üretir. Her düğüm kendi tam-yol anahtarıyla (`node.key`)
// bağımsız aç/kapa olur — Inverter-2..9 gibi kardeş düğümler birbirinden
// habersiz, ayrı ayrı genişletilebilir.
function buildDetayRows(node, ctx) {
  const { collapsed, toggleGroup, columnCount } = ctx
  const isOpen = !collapsed.has(node.key)
  const allTasks = collectNodeTasks(node)
  const avg = allTasks.length
    ? Math.round(allTasks.reduce((sum, t) => sum + Number(t.progress_pct || 0), 0) / allTasks.length)
    : 0

  const headerRow = (
    <tr key={`group-${node.key}`}>
      <td colSpan={columnCount} style={{ padding: 0, position: 'sticky', left: 0 }}>
        <button
          onClick={() => toggleGroup(node.key)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            border: 'none', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', font: 'inherit',
            background: '#f1f5f9', color: 'var(--color-text)', minHeight: 34,
            padding: `7px 10px 7px ${10 + node.depth * GROUP_INDENT_PX}px`,
          }}
        >
          <span style={{ flex: '0 0 11px', width: 11, textAlign: 'center', fontSize: 10.5, color: '#64748b' }}>{isOpen ? '▾' : '▸'}</span>
          <strong style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{node.label}</strong>
          <small style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>{allTasks.length} görev · %{avg}</small>
        </button>
      </td>
    </tr>
  )

  if (!isOpen) return [headerRow]

  const childRows = node.childList.flatMap(child => buildDetayRows(child, ctx))
  const taskRows = node.tasks.map(task => buildDetayTaskRow(task, node.depth, ctx))
  return [headerRow, ...childRows, ...taskRows]
}

function buildDetayTaskRow(task, depth, ctx) {
  const { canAddProgress, setProgressTask, onProgressSaved } = ctx
  const sapma = task._sapma ?? null
  const duration = task.duration_days || daysBetween(task.planned_start, task.planned_end)
  const isLate = sapma !== null && sapma > 0 && task.status !== 'tamamlandi' && task.status !== 'iptal' && !task.actual_end
  return (
    <tr key={task.id}>
      <td style={TD}><span style={{ fontWeight: 700 }}>{task.task_code || '-'}</span></td>
      <td style={{ ...TD, whiteSpace: 'normal', minWidth: 160, paddingLeft: 7 + (depth + 1) * GROUP_INDENT_PX }}>
        {task.task_name || '-'}
        {task.sub_category && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--color-muted)' }}>· {task.sub_category}</span>}
        {isLate && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--color-danger-text)' }}>({riskSeverityLabel(task)})</span>}
      </td>
      <td style={TD}>{task.responsible || task.responsible_role || '—'}</td>
      <td style={TD}>{task.team_size || '—'}</td>
      <td style={TD}><RangeCell start={task.planned_start} end={task.planned_end} /></td>
      <td style={TD}><RangeCell start={task.actual_start} end={task.actual_end} /></td>
      <td style={TD}><SapmaCell sapma={sapma} /></td>
      <td style={TD}>{duration ? `${duration}g` : '—'}</td>
      <td style={TD}>{Number(task.target_qty || 0) > 0 ? `${Number(task.target_qty).toLocaleString('tr-TR')} ${task.unit || ''}` : '—'}</td>
      <td style={TD}>%{Math.round(Number(task.progress_pct || 0))}</td>
      <td style={TD}><StatusDot map={TASK_STATUS} value={task.status} /></td>
      <td style={{ ...TD, whiteSpace: 'normal', maxWidth: 180, color: 'var(--color-text-sub)' }} title={task.notes || ''}>{task.notes || '—'}</td>
      {canAddProgress && (
        <td style={{ ...TD, whiteSpace: 'normal' }}>
          {Number(task.target_qty || 0) > 0 ? (
            <button
              type="button"
              onClick={() => setProgressTask(task)}
              style={{
                border: 'none', borderRadius: 6, padding: '4px 8px',
                background: 'var(--color-primary)', color: '#fff',
                fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + İlerleme Gir
            </button>
          ) : (
            <InlineMilestoneStatus task={task} onSaved={onProgressSaved} />
          )}
        </td>
      )}
    </tr>
  )
}

// "Genel İş Planı" (Gantt) yalnızca hem planned_start hem planned_end'i olan
// görevleri bar olarak çizebildiğinden tarihsiz görevleri sessizce atlıyor —
// bu tablo TÜM görevleri (tarihsiz olanlar dahil) satır satır gösterir, bu
// yüzden `tasks`'ı doğrudan alır (Gantt'ın `withDates` filtresine bağlı değil).
// Gruplama/aç-kapa Gantt'la aynı görsel dili (.gantt-group-row/tone-*) ve aynı
// grup sırasını (GROUP_ORDER → bilinmeyenler en erken plan tarihine göre → _diğer
// en sonda) paylaşır — kullanıcı iki görünüm arasında geçince aynı bölümleri tanır.
export default function TabIsPlaniDetay({ tasks, today, allGroupNames, canAddProgress = false, onProgressSaved }) {
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('plan_start')
  const [collapsed, setCollapsed] = useState(new Set())
  const [progressTask, setProgressTask] = useState(null)
  const columnCount = canAddProgress ? BASE_COLUMN_COUNT + 1 : BASE_COLUMN_COUNT

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('tr-TR')
    return tasks.filter(task => {
      if (groupFilter !== 'all' && resolveGroup(task) !== groupFilter) return false
      if (statusFilter !== 'all' && task.status !== statusFilter) return false
      if (term) {
        const hay = `${task.task_code || ''} ${task.task_name || ''}`.toLocaleLowerCase('tr-TR')
        if (!hay.includes(term)) return false
      }
      return true
    }).map(task => ({ task, sapma: computeSapma(task, today) }))
  }, [tasks, search, groupFilter, statusFilter, today])

  // Gantt'ın (Genel İş Planı) kullandığı ÇOK SEVİYELİ ağaç burada da birebir
  // paylaşılıyor — öncesinde bu tablo `resolveGroup` ile tek seviyeli düz bir
  // gruplama yapıyordu (Elektriksel Bölüm/TR-1-3000 kVA/Inverter-N iç içe
  // görünmüyordu, hepsi kendi tam-yol string'iyle YAN YANA ayrı birer grup
  // gibi listeleniyordu) — kullanıcı "detaylı iş planı da fotoğraftaki gibi
  // içiçe geçmeli, inverterler kendi içinde açılmalı" deyince buildGroupTree'ye
  // geçirildi (07.09.2026). `sapma` değeri her task'a `_sapma` alanıyla
  // eklenip ağaca öyle veriliyor (buildGroupTree ham task objesi bekliyor).
  const groupTree = useMemo(() => {
    const augmented = filteredRows.map(({ task, sapma }) => ({ ...task, _sapma: sapma }))
    const tree = buildGroupTree(augmented)
    tree.forEach(node => sortTreeTasks(node, sortBy))
    return tree
  }, [filteredRows, sortBy])

  function toggleGroup(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function resetFilter(setter) {
    return event => setter(event.target.value)
  }

  return (
    <div className="card gantt-card">
      <div className="gantt-card-header">
        <div>
          <h3>Detaylı İş Planı</h3>
          <p>{filteredRows.length} iş kalemi{search || groupFilter !== 'all' || statusFilter !== 'all' ? ' (filtrelendi)' : ''}</p>
        </div>
        <div className="gantt-toolbar" style={{ flexWrap: 'wrap' }}>
          <input
            type="text"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Kod veya görev adı ara…"
            style={{
              border: '1px solid var(--color-border-md)', borderRadius: 8, padding: '7px 10px',
              fontSize: 12.5, fontFamily: 'inherit', minWidth: 180, color: 'var(--color-text)', background: 'var(--color-surface)',
            }}
          />
          <select value={statusFilter} onChange={resetFilter(setStatusFilter)}>
            <option value="all">Tüm Durumlar</option>
            {Object.entries(TASK_STATUS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <select value={groupFilter} onChange={resetFilter(setGroupFilter)}>
            <option value="all">Tüm Gruplar</option>
            {allGroupNames.map(group => <option key={group} value={group}>{groupConfigFor(group).label}</option>)}
          </select>
          <select value={sortBy} onChange={resetFilter(setSortBy)}>
            {SORT_OPTIONS.map(opt => <option key={opt.v} value={opt.v}>{opt.l}</option>)}
          </select>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <p className="gantt-empty">Filtreye uyan iş kalemi bulunamadı.</p>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 620, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--color-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={TH}>Kod</th>
                <th style={TH}>Görev Adı</th>
                <th style={TH}>Sorumlu</th>
                <th style={TH}>Ekip</th>
                <th style={TH}>Plan</th>
                <th style={TH}>Gerçek</th>
                <th style={TH}>Sapma</th>
                <th style={TH}>Süre</th>
                <th style={TH}>Hedef</th>
                <th style={TH}>İlerl.</th>
                <th style={TH}>Durum</th>
                <th style={TH}>Not</th>
                {canAddProgress && <th style={TH}>İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {groupTree.flatMap(node => buildDetayRows(node, { collapsed, toggleGroup, columnCount, canAddProgress, setProgressTask, onProgressSaved }))}
            </tbody>
          </table>
        </div>
      )}
      {progressTask && (
        <ProgressEntryModal
          task={progressTask}
          onClose={() => setProgressTask(null)}
          onSaved={() => {
            setProgressTask(null)
            onProgressSaved?.()
          }}
        />
      )}
    </div>
  )
}
