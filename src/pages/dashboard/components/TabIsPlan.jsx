import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh'
import DataStatusBanner, { UnauthorizedScopeNotice } from '../../../components/ui/DataStatusBanner'
import { useAuth } from '../../../context/AuthContext'
import TabIsPlaniDetay from './TabIsPlaniDetay'

// Gantt grupları project_tasks.group_label kolonundan DOĞRUDAN gelir — bu
// kolon serbest metin (admin elle giriyor, ör. "KABUL", "ENH", "Mekanik
// Bölüm"), bu yüzden burada category'ye dayalı hiçbir switch/case veya
// keyword-matching YAPILMAZ (eskiden yapılıyordu, group_label config'te
// bulunamayınca category+task_name metninde 'og'/'devreye' gibi kelime
// arayan bir fallback'e düşüyordu — bu yüzden group_label='ENH' olan
// görevler "og" geçen metin yüzünden Elektriksel — OG'ye, group_label=
// 'KABUL' olan görevler "devreye_alma" category'si yüzünden Test & Devreye
// Alma'ya yanlış düşüyordu, 11.08.2026'da bulunup düzeltildi).
// CATEGORY_FALLBACK_GROUP yalnızca group_label boş olan görevler için
// kullanılır (DB'de bugün itibarıyla görevlerin çoğunda group_label NULL —
// bunlar için tek başvurulacak nokta task_category enum'ından sabit bir
// obje lookup'ı, group_label doluyken bu tabloya hiç bakılmaz).
const CATEGORY_FALLBACK_GROUP = {
  mobilizasyon: 'Şantiye Hazırlık',
  mekanik: 'Mekanik Montaj',
  kolon_montaji: 'Mekanik Montaj',
  kiris_montaji: 'Mekanik Montaj',
  asik_montaji: 'Mekanik Montaj',
  panel_montaji: 'Mekanik Montaj',
  elektrik_dc: 'Elektriksel — DC',
  elektrik_ac: 'Elektriksel — AC',
  elektrik_og: 'Elektriksel — OG',
  kosk_trafo: 'Elektriksel — OG',
  topraklama: 'Elektriksel — OG',
  enh: 'ENH',
  devreye_alma: 'Devreye Alma',
  evrak_sureci: 'Projelendirme & İzinler',
  satin_alma: 'Satın Alma',
}

// Bölüm başlıklarının görüntülenme sırası. group_label serbest metin
// olduğundan (aynı kategori için "Mekanik"/"Mekanik Bölüm", "Elektrik AC"/
// "Elektriksel — AC" gibi birden çok yazım DB'de bir arada duruyor) burada
// hepsi ayrı ayrı, kendi başlıkları altında listelenir — birbirine
// eşitlenmez (farklı group_label = farklı başlık, her zaman).
export const GROUP_ORDER = [
  'Projelendirme & İzinler',
  'Şantiye Hazırlık',
  'Mobilizasyon',
  'Şantiye Mobilizasyon',
  'Mekanik Montaj',
  'Mekanik',
  'Mekanik Bölüm',
  'Topraklama',
  'Elektriksel Bölüm',
  'Elektriksel — DC',
  'Elektrik DC',
  'Elektriksel — AC',
  'Elektrik AC',
  'Elektriksel — OG',
  'Elektrik OG',
  'ENH',
  'Satın Alma',
  'Devreye Alma',
  'KABUL',
]

// group_label içinde bu ayraç geçiyorsa çok seviyeli (Elektriksel Bölüm ›
// TR-1-3000 kVA › Inverter-3 › DC gibi) gerçek iç içe geçmiş bir Gantt dalı
// olarak render edilir — ayraç yoksa (eski tek seviyeli etiketler, ör.
// "Mekanik Bölüm") tek düğümlük bir dal gibi davranır, geriye dönük uyumlu.
const GROUP_PATH_DELIM = ' › '

function groupPath(task) {
  const label = (task.group_label || '').trim()
  if (!label) return [CATEGORY_FALLBACK_GROUP[task.category] || '_diger']
  return label.split(GROUP_PATH_DELIM).map(s => s.trim()).filter(Boolean)
}

// Bir grup düğümündeki (kendi + tüm alt dallardaki) görevleri toplar —
// üst seviye başlıkların (ör. "Elektriksel Bölüm") görev sayısı/ortalama
// ilerlemesi tüm alt dalları kapsasın diye.
export function collectNodeTasks(node) {
  return node.tasks.concat(...node.childList.map(collectNodeTasks))
}

// Düz task listesinden group_label'a göre çok seviyeli bir ağaç kurar.
// TabIsPlan'daki tek seviyeli grup mantığının (grouped/groupKeys) yerine
// geçer — bilinen (GROUP_ORDER'da olan) kök segmentler sabit sırada, diğerleri
// (ör. yeni bir group_label) en erken planned_start'a göre sıralanır; aynı
// mantık her seviyede (kardeşler arasında) tekrarlanır.
export function buildGroupTree(tasks) {
  const topMap = new Map()
  tasks.forEach(task => {
    const path = groupPath(task)
    let map = topMap
    let acc = []
    path.forEach((segment, i) => {
      acc = [...acc, segment]
      const key = acc.join(GROUP_PATH_DELIM)
      if (!map.has(key)) map.set(key, { key, label: segment, depth: i, tasks: [], children: new Map() })
      const node = map.get(key)
      if (i === path.length - 1) node.tasks.push(task)
      map = node.children
    })
  })

  function finalize(map) {
    return [...map.values()].map(node => {
      const childList = finalize(node.children)
      const withChildren = { ...node, childList }
      // Grup başlığının kendi Başlangıç/Bitiş/Süre sütunları — tüm alt
      // dallardaki (kendi + iç içe geçmiş) görevlerin en erken planned_start /
      // en geç planned_end'i, harici planlama aracındaki gibi grup satırında
      // da tarih göstermek için (07.09.2026'da eklendi).
      let rangeStart = null
      let rangeEnd = null
      collectNodeTasks(withChildren).forEach(t => {
        if (t.planned_start && (!rangeStart || t.planned_start < rangeStart)) rangeStart = t.planned_start
        if (t.planned_end && (!rangeEnd || t.planned_end > rangeEnd)) rangeEnd = t.planned_end
      })
      return { ...withChildren, rangeStart, rangeEnd }
    })
  }

  function earliestStart(node) {
    return node.rangeStart ? new Date(node.rangeStart).getTime() : Infinity
  }

  function sortLevel(arr, isTop) {
    arr.sort((a, b) => {
      if (a.label === '_diger') return 1
      if (b.label === '_diger') return -1
      if (isTop) {
        const ai = GROUP_ORDER.indexOf(a.label)
        const bi = GROUP_ORDER.indexOf(b.label)
        if (ai !== -1 && bi !== -1) return ai - bi
        if (ai !== -1) return -1
        if (bi !== -1) return 1
      }
      const diff = earliestStart(a) - earliestStart(b)
      if (diff) return diff
      return a.label.localeCompare(b.label, 'tr', { numeric: true, sensitivity: 'base' })
    })
    arr.forEach(node => sortLevel(node.childList, false))
    return arr
  }

  return sortLevel(finalize(topMap), true)
}

const GROUP_CONFIG = {
  'Projelendirme & İzinler': { tone: 'blue', bar: '#5b8def', label: 'PROJELENDİRME & İZİNLER' },
  'Şantiye Hazırlık': { tone: 'green', bar: '#42b883', label: 'ŞANTİYE HAZIRLIK' },
  'Mobilizasyon': { tone: 'green', bar: '#35a36f', label: 'MOBİLİZASYON' },
  'Şantiye Mobilizasyon': { tone: 'green', bar: '#2f9668', label: 'ŞANTİYE MOBİLİZASYON' },
  'Mekanik Montaj': { tone: 'purple', bar: '#a78bfa', label: 'MEKANİK MONTAJ' },
  'Mekanik': { tone: 'purple', bar: '#8b5cf6', label: 'MEKANİK' },
  'Mekanik Bölüm': { tone: 'purple', bar: '#7c4fe0', label: 'MEKANİK BÖLÜM' },
  'Topraklama': { tone: 'teal', bar: '#2f9e88', label: 'TOPRAKLAMA' },
  'Elektriksel — DC': { tone: 'amber', bar: '#f4b344', label: 'ELEKTRİKSEL — DC' },
  'Elektrik DC': { tone: 'amber', bar: '#dc8f22', label: 'ELEKTRİK DC' },
  'Elektriksel — AC': { tone: 'sky', bar: '#77aae6', label: 'ELEKTRİKSEL — AC' },
  'Elektrik AC': { tone: 'sky', bar: '#3f86d8', label: 'ELEKTRİK AC' },
  'Elektriksel — OG': { tone: 'teal', bar: '#4fbda7', label: 'ELEKTRİKSEL — OG' },
  'Elektrik OG': { tone: 'teal', bar: '#14927f', label: 'ELEKTRİK OG' },
  'ENH': { tone: 'blue', bar: '#2454b0', label: 'ENH' },
  'Satın Alma': { tone: 'slate', bar: '#64748b', label: 'SATIN ALMA' },
  'Devreye Alma': { tone: 'rose', bar: '#ea7d8c', label: 'DEVREYE ALMA' },
  'KABUL': { tone: 'rose', bar: '#d94f64', label: 'KABUL' },
  // Çok seviyeli (Elektriksel Bölüm › ... › Inverter-3 › DC gibi) dallarda
  // son segment tek başına burada aranır — TR-1-3000 kVA/Inverter-N gibi
  // bilinmeyenler _diger fallback'iyle kendi metnini gösterir, yeterli.
  'Elektriksel Bölüm': { tone: 'sky', bar: '#3f86d8', label: 'ELEKTRİKSEL BÖLÜM' },
  'DC': { tone: 'amber', bar: '#f4b344', label: 'DC' },
  'AC': { tone: 'sky', bar: '#77aae6', label: 'AC' },
  'OG': { tone: 'teal', bar: '#4fbda7', label: 'OG' },
  'Güvenlik': { tone: 'green', bar: '#2f9668', label: 'GÜVENLİK' },
  '_diger': { tone: 'slate', bar: '#94a3b8', label: 'DİĞER' },
}

// GROUP_CONFIG'te (yukarıdaki 18 bilinen değer) karşılığı olmayan bir
// group_label gelirse (ör. admin ileride yeni bir isim yazarsa) kırılmadan
// _diger'in rengiyle ama KENDİ gerçek metniyle gösterilir — "DİĞER" gibi
// yanıltıcı bir jenerik etiket YAZILMAZ, admin'in yazdığı metin korunur.
export function groupConfigFor(groupKey) {
  if (GROUP_CONFIG[groupKey]) return GROUP_CONFIG[groupKey]
  if (groupKey === '_diger') return GROUP_CONFIG._diger
  return { ...GROUP_CONFIG._diger, label: groupKey }
}

const STATUS_LABELS = {
  beklemede: 'Beklemede',
  devam_ediyor: 'Devam Ediyor',
  tamamlandi: 'Tamamlandı',
  askida: 'Askıda',
  iptal: 'İptal',
}

const W_NO = 42
const W_NAME = 170
const W_START = 72
const W_END = 72
const W_DUR = 54
const W_PROGRESS = 64
const W_WEEK = 20
export const GROUP_INDENT_PX = 20

export function resolveGroup(task) {
  const label = (task.group_label || '').trim()
  if (label) return label
  return CATEGORY_FALLBACK_GROUP[task.category] || '_diger'
}

export function fmtDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function daysBetween(start, end) {
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
  // target_qty'si olmayan kilometre taşı işlerde durum set_task_milestone_status
  // RPC'siyle doğrudan/manuel yönetilir (bkz. MilestoneStatusControl) — bu görevler
  // için DB'deki status alanı zaten tek doğru kaynak, tarih/miktar tahminiyle
  // ezilirse (ör. plan başlangıcı hâlâ ileride diye) kullanıcının seçtiği durum
  // hiçbir zaman tabloya yansımaz.
  if (!(Number(task.target_qty || 0) > 0)) return task.status || 'beklemede'

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

export function statusLabel(status) {
  return STATUS_LABELS[status] || status?.replace(/_/g, ' ') || '-'
}

export function riskSeverityLabel(task) {
  const severity = String(task?.risk_severity || 'orta').toLocaleLowerCase('tr-TR')
  return {
    düşük: 'Düşük',
    orta: 'Orta',
    yüksek: 'Yüksek',
    kritik: 'Kritik',
    çok_kritik: 'Çok Kritik',
  }[severity] || severity.replaceAll('_', ' ')
}

function pctFromDailyProgress(targetQty, dailyRows) {
  if (targetQty <= 0) return 0

  const dailyDone = (dailyRows || []).reduce((sum, row) => sum + Number(row.qty_added || 0), 0)
  return Math.min(100, Math.round((dailyDone / targetQty) * 100))
}

// Genel İş Planı (Gantt, görsel zaman çizelgesi) ve Detaylı İş Planı (tam
// veri tablosu + plan/gerçekleşen sapma) — Malzeme Listesi/Riskler alt-sekme
// deseniyle aynı fikir, tek sayfada iki bölüm. Proje-özel localStorage anahtarı
// (projectId ile sonlandırılmış) — farklı bir proje açmak önceki projenin
// seçtiği bölümü miras almasın diye.
function readSection(projectId) {
  try { return window.localStorage.getItem(`is-plani-active-section-${projectId}`) || 'gantt' } catch { return 'gantt' }
}

export default function TabIsPlan({ projectId, filterDate, reportPeriod = 'daily', siteChiefView = false }) {
  const { role } = useAuth()
  const [tasks, setTasks] = useState([])
  const [project, setProject] = useState(null)
  const [siteChief, setSiteChief] = useState(null)
  const [section, setSection] = useState(() => readSection(projectId))
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

  useEffect(() => { setSection(readSection(projectId)) }, [projectId])
  useEffect(() => {
    try { window.localStorage.setItem(`is-plani-active-section-${projectId}`, section) } catch { /* yok say */ }
  }, [section, projectId])

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
      .select('id, task_code, task_name, group_label, category, planned_start, planned_end, progress_pct, status')
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

  // Detaylı İş Planı'nın kendi filtresi/hiyerarşisi için TAM (ham, " › " dahil)
  // group_label kümesi — Genel'in gruplaması bundan bağımsız, aşağıya bkz.
  const allGroupNames = useMemo(() => [...new Set(tasks.map(t => resolveGroup(t)))].sort(), [tasks])
  // Genel İş Planı yalnızca ÜST SEVİYE segmenti (groupPath'in ilk elemanı)
  // kullanır — bir görevin group_label'ı "Elektriksel Bölüm › TR-1-3000 kVA ›
  // Inverter-3 › AC" gibi Detaylı için eklenmiş çok seviyeli bir yol olsa bile,
  // Genel'de bu tüm inverter/AC-DC kırılımı TEK "Elektriksel Bölüm" grubuna
  // toplanır (09.09.2026'da düzeltildi — kod tek-seviyeli hâline döndükten
  // sonra hâlâ ham resolveGroup kullanılıyordu, bu da her inverter × AC/DC
  // kombinasyonunu kendi başına ayrı, çirkin bir üst-seviye grup gibi
  // gösteriyordu; kullanıcı "veriler de eskiye dönmeli" diye bildirdi).
  const topGroupNames = useMemo(() => [...new Set(tasks.map(t => groupPath(t)[0]))].sort(), [tasks])

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (groupFilter !== 'all' && groupPath(task)[0] !== groupFilter) return false
    if (statusFilter === 'devam') return task.status === 'devam_ediyor'
    if (statusFilter === 'tamamlandi') return task.status === 'tamamlandi'
    if (statusFilter === 'geciken') {
      return isTaskLate(task, today)
    }
    return true
  }), [groupFilter, statusFilter, tasks, today])

  const withDates = filteredTasks.filter(t => t.planned_start && t.planned_end)

  const kpis = useMemo(() => {
    const ongoing = tasks.filter(t => t.status === 'devam_ediyor').length
    const risky = tasks.filter(t => isTaskLate(t, today)).length
    return { ongoing, risky }
  }, [tasks, today])

  useEffect(() => {
    if (!selectedTaskId && withDates[0]) setSelectedTaskId(withDates[0].id)
    if (selectedTaskId && !withDates.some(t => t.id === selectedTaskId)) setSelectedTaskId(withDates[0]?.id || null)
  }, [selectedTaskId, withDates])

  const selectedTask = withDates.find(task => task.id === selectedTaskId) || null
  const canAddProgress = Boolean(projectId && ['santiye_sefi', 'proje_yoneticisi'].includes(role))

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

  const sectionToggle = (
    <SectionToggle section={section} onChange={setSection} />
  )

  // Detaylı İş Planı Gantt'ın planned_start/planned_end zorunluluğuna bağlı
  // değil (tarihsiz görevleri de satır olarak gösterir) — bu yüzden withDates
  // boş olsa (Gantt'ın çizecek hiç barı olmasa) bile bu bölüm kendi başına render edilir.
  if (section === 'detay') {
    return (
      <div className="gantt-page">
        <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
        {sectionToggle}
        <TabIsPlaniDetay
          tasks={tasks}
          today={today}
          allGroupNames={allGroupNames}
          canAddProgress={canAddProgress}
          onProgressSaved={refetch}
        />
      </div>
    )
  }

  if (withDates.length === 0) {
    return (
      <div className="gantt-page">
        <DataStatusBanner error={error} refreshing={refreshing} onRetry={refetch} />
        {sectionToggle}
        <KpiStrip total={tasks.length} devam={kpis.ongoing} risky={kpis.risky} />
        <GanttShell
          project={project}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          allGroupNames={topGroupNames}
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

  // Genel İş Planı (Gantt) tek seviyeli, düz gruplama kullanır (09.09.2026'da
  // geri döndürüldü) — çok seviyeli hiyerarşik ağaç (buildGroupTree, " › "
  // ayracına göre iç içe dallar) yalnızca Detaylı İş Planı'nda kullanılır,
  // Genel her zaman group_label'ın kendisini tek düğüm olarak gösterir.
  const grouped = {}
  withDates.forEach(task => {
    const key = groupPath(task)[0]
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(task)
  })
  Object.values(grouped).forEach(items => {
    items.sort((a, b) => new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime())
  })
  // GROUP_ORDER'da tanımlı olmayan (ör. ileride admin'in yazacağı yeni bir
  // group_label) bir grup çıkarsa listeden SESSİZCE düşmesin diye en erken
  // planned_start'a göre sıralanıp bilinen gruplardan sonra, '_diger'den
  // önce eklenir — her group_label kendi başlığıyla görünür garantisi.
  const knownGroupKeys = GROUP_ORDER.filter(key => grouped[key])
  const unknownGroupKeys = Object.keys(grouped)
    .filter(key => key !== '_diger' && !GROUP_ORDER.includes(key))
    .sort((a, b) => new Date(grouped[a][0].planned_start).getTime() - new Date(grouped[b][0].planned_start).getTime())
  const groupKeys = [...knownGroupKeys, ...unknownGroupKeys, ...(grouped._diger ? ['_diger'] : [])]
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
      {sectionToggle}
      <KpiStrip total={tasks.length} devam={kpis.ongoing} risky={kpis.risky} />

      <div className={`gantt-workspace${panelOpen ? ' has-panel' : ''}`}>
        <GanttShell
          project={project}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          allGroupNames={topGroupNames}
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
                  const cfg = groupConfigFor(groupKey)
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
                        const taskCfg = groupConfigFor(groupPath(task)[0])
                        const barLeft = timelineOffsetPct(task.planned_start, timelineStart, timelineUnits)
                        const barEnd = timelineOffsetPct(task.planned_end, timelineStart, timelineUnits) + (100 / timelineUnits)
                        const barWidth = Math.max(1.2, barEnd - barLeft)
                        const duration = daysBetween(task.planned_start, task.planned_end)
                        const pct = Math.round(Number(task.progress_pct || 0))
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
                              </span>
                              <span className={`gantt-name${isLate ? ' late' : ''}`}>
                                {task.task_name || '-'}
                                {isLate ? ` (${riskSeverityLabel(task)})` : ''}
                              </span>
                              <span>{fmtDate(task.planned_start)}</span>
                              <span className={isLate ? 'late' : ''}>{fmtDate(task.planned_end)}</span>
                              <span>{duration} gün</span>
                              <span className="gantt-progress-cell">
                                <i><em style={{ '--progress': `${pct}%`, '--bar-color': taskCfg.bar }} /></i>
                                <b>%{pct}</b>
                              </span>
                            </span>
                            <span
                              className={`gantt-bar${isLate ? ' late' : ''}`}
                              style={{ '--bar-left': `${barLeft}%`, '--bar-width': `${barWidth}%`, '--bar-color': taskCfg.bar, '--progress': `${pct}%` }}
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
            isRisky={selectedTask ? isTaskLate(selectedTask, today) : false}
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

const IS_PLANI_SECTIONS = [
  { key: 'gantt', label: 'Genel İş Planı' },
  { key: 'detay', label: 'Detaylı İş Planı' },
]

// ProjeTabSatinAlma.jsx'teki alt-sekme şeridiyle aynı görsel dil (altı çizgili
// pill, ayrı bir dosya/CSS class'ı gerekmiyor).
function SectionToggle({ section, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid var(--color-border-md)' }}>
      {IS_PLANI_SECTIONS.map(s => (
        <button key={s.key} onClick={() => onChange(s.key)} style={{
          background: 'none', border: 'none', padding: '10px 22px',
          fontSize: 14, fontWeight: section === s.key ? 600 : 400,
          color: section === s.key ? 'var(--color-primary)' : 'var(--color-muted)',
          cursor: 'pointer', fontFamily: 'inherit',
          borderBottom: section === s.key ? '2px solid var(--color-primary)' : '2px solid transparent',
          marginBottom: -2,
        }}>
          {s.label}
        </button>
      ))}
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

function KpiStrip({ total, devam, risky }) {
  const cards = [
    { label: 'Toplam Görev', value: total, note: 'Tüm iş kalemleri', icon: 'clipboard', tone: 'blue' },
    { label: 'Devam Eden', value: devam, note: 'Aktif görevler', icon: 'play', tone: 'green' },
    { label: 'Riskli / Geciken', value: risky, note: 'Tarihi geçmiş işler', icon: 'warning', tone: 'red' },
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

function TaskDetailPanel({ task, group, dailyPct, siteChief, isRisky, siteChiefView, onClose }) {
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

  const groupCfg = groupConfigFor(group)
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
    ['Risk Durumu', isRisky ? `Riskli (${riskSeverityLabel(task)})` : 'Normal', isRisky ? 'red' : 'muted'],
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
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.5 }}>
          İlerleme girmek / durum güncellemek için "Detaylı İş Planı" görünümüne geçin.
        </p>
      </div>
    </aside>
  )
}

