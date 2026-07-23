import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useWeather } from '../../hooks/useWeather'
import { resolveProjectByAssignedId } from '../../utils/projectResolver'
import { toUserMessage as translateError } from '../../utils/errors'
import { compressImageFile } from '../../utils/imageCompression'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STATUS_OPTIONS  = ['normal', 'dikkat', 'kritik']
const STATUS_LABELS   = { normal: 'Normal', dikkat: 'Dikkat', kritik: 'Kritik' }
const WEATHER_LABELS  = {
  açık: 'Açık', 'parçalı bulutlu': 'Parçalı Bulutlu', bulutlu: 'Bulutlu',
  yağmurlu: 'Yağmurlu', karlı: 'Karlı', fırtınalı: 'Fırtınalı',
}
const SHIFTS          = ['mühendis', 'usta', 'işçi']
const DEPARTMENTS     = ['idari', 'mekanik', 'elektrik', 'yevmiyeci']
const SHIFT_LABELS    = { mühendis: 'Mühendis', usta: 'Usta', işçi: 'İşçi' }
const DEPT_LABELS     = { idari: 'İdari', mekanik: 'Mekanik', elektrik: 'Elektrik', yevmiyeci: 'Yevmiyeci' }
const MACH_STATUS     = ['çalışıyor', 'arızalı', 'beklemede']
const MACH_STATUS_COLOR = {
  çalışıyor: 'var(--color-success)',
  arızalı:   'var(--color-danger)',
  beklemede: 'var(--color-warning)',
}
const MACH_STATUS_LABELS = { çalışıyor: 'Çalışıyor', arızalı: 'Arızalı', beklemede: 'Beklemede' }
const MACHINE_TYPE_ALIASES = {
  'ekskavatör': 'ekskavatör',
  'ekskavator': 'ekskavatör',
  'jcb': 'jcb',
  'loader': 'loader',
  'rok delim': 'rok_delim',
  'rok delgi makinesi': 'rok_delim',
  'rok_delim': 'rok_delim',
  'gayk delici': 'gayk_delici',
  'gayk_delici': 'gayk_delici',
  'vinç': 'vinç',
  'vinc': 'vinç',
  'kamyon': 'kamyon',
  'kamyon / nakliye': 'kamyon',
  'traktör': 'traktör',
  'traktor': 'traktör',
}
const PRIORITY_OPTIONS = ['düşük', 'orta', 'yüksek', 'kritik']
const RESOLUTION_OPTIONS = ['açık', 'devam ediyor', 'çözüldü']

function normalizeWeather(value) {
  const v = String(value || '').toLocaleLowerCase('tr-TR')
  if (v.includes('fırtına') || v.includes('dolu')) return 'fırtınalı'
  if (v.includes('kar')) return 'karlı'
  if (v.includes('yağmur') || v.includes('sağanak') || v.includes('çise')) return 'yağmurlu'
  if (v.includes('parçalı') || v.includes('az bulut')) return 'parçalı bulutlu'
  if (v.includes('bulut') || v.includes('kapalı') || v.includes('sis')) return 'bulutlu'
  return 'açık'
}

function formatWeatherNote(current) {
  if (!current) return ''
  const parts = []
  if (current.temp !== null && current.temp !== undefined) parts.push(`${current.temp}°C`)
  if (current.wind !== null && current.wind !== undefined) parts.push(`Rüzgar ${current.wind} km/h`)
  if (current.humidity !== null && current.humidity !== undefined) parts.push(`Nem %${current.humidity}`)
  return parts.join(' · ')
}

function normalizeMachineType(value) {
  const raw = String(value || '').trim()
  const key = raw.toLocaleLowerCase('tr-TR')
  return MACHINE_TYPE_ALIASES[key] || raw
}

const DAILY_REPORT_ERROR_RULES = [
  { match: 'general_status', message: 'Genel durum geçersiz. Lütfen listeden seçin.' },
  { match: ['machinery_logs_status', 'machine'], message: 'Makine durumu geçersiz. Lütfen listeden seçin.' },
  { match: 'weather', message: 'Hava durumu geçersiz. Lütfen listeden seçin.' },
  { match: ['department', 'shift'], message: 'Personel bilgisi geçersiz. Lütfen listeden seçin.' },
  { match: ['duplicate', 'unique'], message: 'Bu tarih için zaten bir rapor var.' },
]

function toUserMessage(e) {
  return translateError(e, { rules: DAILY_REPORT_ERROR_RULES, fallback: 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.' })
}

function initPersonnel() {
  return SHIFTS.map(shift => ({ shift, idari: 0, mekanik: 0, elektrik: 0, yevmiyeci: 0 }))
}
function initMachinery() {
  return []
}
function newMachineryRow() {
  return { machine_type: '', count: 0, status: 'çalışıyor', notes: '' }
}
function newIssueRow() {
  return {
    id: null,
    ticket_id: null,
    topic: '',
    category: '',
    priority: 'orta',
    assigned_to: '',
    description: '',
    resolution_status: 'açık',
    closed_at: '',
    notes: '',
  }
}

// Ticket durumu için kısa TR etiketleri — src/components/tickets/*'daki STATUS
// haritasıyla aynı anlam, burada yalnızca rozet metni için (bağımlılık eklemeye gerek yok).
const TICKET_STATUS_LABEL = {
  gönderildi:   'Açık',
  açık:         'Açık',
  işlemde:      'İşlemde',
  kapatıldı:    'Kapatıldı',
  iptal_edildi: 'İptal Edildi',
}
function newTaskRow() {
  return { description: '' }
}

const ISSUE_META_PREFIX = '__ISSUE_META__'
const REPORT_NOTES_META_PREFIX = '__REPORT_NOTES_META__'

function encodeMeta(prefix, payload, fallback = '') {
  const hasExtra = Object.entries(payload).some(([key, value]) => key !== 'description' && String(value || '').trim())
  if (!hasExtra) return fallback || payload.description || ''
  return `${prefix}${JSON.stringify(payload)}`
}

function decodeMeta(prefix, value) {
  const text = String(value || '')
  if (!text.startsWith(prefix)) return { description: text }
  try {
    return JSON.parse(text.slice(prefix.length)) || { description: '' }
  } catch {
    return { description: text }
  }
}

function issueDescription(row) {
  return encodeMeta(ISSUE_META_PREFIX, {
    category: row.category || '',
    closed_at: row.closed_at || '',
    notes: row.notes || '',
    description: row.description || '',
  }, row.description || '')
}

function reportNotesPayload(formData) {
  return encodeMeta(REPORT_NOTES_META_PREFIX, {
    isg_notes: String(formData.isg_notes || '').trim() || 'İSG ile ilgili olumsuzluk bildirilmedi.',
    incident_notes: String(formData.incident_notes || '').trim() || 'Olağandışı olay veya şantiye ziyareti bildirilmedi.',
    description: String(formData.notes || '').trim() || 'Ek saha notu bulunmuyor.',
  }, String(formData.notes || '').trim() || 'Ek saha notu bulunmuyor.')
}

function InfoTile({ label, value }) {
  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-md)', borderRadius: 10, padding: '10px 12px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'var(--color-muted-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>{value}</p>
    </div>
  )
}

// Sol bölüm listesi — mockup'taki 9 bölüm, sırayla. Tıklanınca sağdan (mobilde alttan) panel açılır.
const SECTION_DEFS = [
  { key: 'general',   label: 'Hava ve Genel Durum', icon: '☀️' },
  { key: 'personnel', label: 'Personel',            icon: '👷' },
  { key: 'machinery', label: 'Makine / Ekipman',    icon: '🚜' },
  { key: 'tasks',     label: 'Günün İşleri',         icon: '🗓️' },
  { key: 'progress',  label: 'İlerleme Girişi',      icon: '📈' },
  { key: 'photos',    label: 'Fotoğraflar',          icon: '📷', optional: true },
  { key: 'notes',     label: 'Notlar',               icon: '🗒️', optional: true },
]

export default function DailyReportForm({ reportId: initialReportId, onBack, onSaved, className = '', onGoToTicket }) {
  const { user, projectId } = useAuth()
  const fileInputRef = useRef(null)

  const [openSection, setOpenSection] = useState(null) // null | bölüm anahtarı (SECTION_DEFS.key)
  const panelSnapshotRef = useRef(null)
  const [reportId, setReportId]     = useState(initialReportId || null)
  const [reportOwnerId, setReportOwnerId] = useState(null)
  const [project, setProject]       = useState(null)
  const [resolvedProjectId, setResolvedProjectId] = useState(null)
  const [preparedBy, setPreparedBy] = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [error, setError]           = useState('')
  const [toast, setToast]           = useState('')
  const [panelError, setPanelError] = useState('')

  // Step 1
  const [formData, setFormData] = useState({
    report_date:    todayStr(),
    weather:        'açık',
    weather_note:   '',
    general_status: 'normal',
    isg_notes:      '',
    incident_notes: '',
    notes:          '',
    weather_loss_day: false,
  })
  const [showWeatherNote, setShowWeatherNote] = useState(false)
  const [weatherLossCount, setWeatherLossCount] = useState(0)

  // Step 2
  const [personnel, setPersonnel]   = useState(initPersonnel)
  const [machinery, setMachinery]   = useState(initMachinery)

  // Step 3
  const [progressItems, setProgressItems] = useState([])
  const [todayQty, setTodayQty]           = useState({})
  const [itemNotes, setItemNotes]         = useState({})
  const [existingQtys, setExistingQtys]   = useState({})
  const [additionalProgressIds, setAdditionalProgressIds] = useState([])
  const [doneTasks, setDoneTasks]         = useState([newTaskRow()])
  const [plannedTasks, setPlannedTasks]   = useState([newTaskRow()])

  // Step 5 - Photos
  const [photos, setPhotos]             = useState([]) // { file, caption, preview }
  const [existingPhotos, setExistingPhotos] = useState([])

  // Step 5 - Issues
  const [issues, setIssues] = useState([newIssueRow()])
  const [issueTicketInfo, setIssueTicketInfo] = useState({}) // ticket_id -> { status, severity }

  const [alreadyExists, setAlreadyExists] = useState(false)
  const weatherCity = project?.location?.split('/')?.[0]?.trim() || null
  const liveWeather = useWeather(weatherCity)

  // Formun ilk açılış verisi bir kez yüklenmelidir; loadAll render kapsamındaki
  // tüm form yardımcılarını kullandığından dependency yapmak yeniden-yükleme döngüsü yaratır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll() }, [])

  const currentWeather = liveWeather.current

  useEffect(() => {
    // alreadyExists true ise formda yüklenmiş gerçek bir rapor var — canlı hava
    // durumu onun weather alanının üzerine yazmamalı (aksi halde tarih değişince
    // yüklenen geçmiş rapor, o günün havasıyla değil bugünün canlı havasıyla görünür).
    if (!initialReportId && !alreadyExists && currentWeather?.label) {
      const weatherNote = formatWeatherNote(currentWeather)
      setFormData(f => ({
        ...f,
        weather: normalizeWeather(currentWeather.label),
        weather_note: f.weather_note || weatherNote,
      }))
    }
  }, [
    initialReportId,
    alreadyExists,
    currentWeather,
  ])

  // Tarih art arda hızlı değiştiğinde (örn. gün/ay/yıl segmentleri tek tek
  // düzenlenirken) birden çok checkDateAndLoad çağrısı çakışabilir. Ağdan en son
  // dönen değil, en son BAŞLATILAN çağrı geçerli olmalı — aksi halde eski bir
  // yanıt yeni yüklenen veriyi ezip formu yanlışlıkla boşaltabilir.
  const dateCheckSeqRef = useRef(0)

  // Bir raporun tüm alt tablolarını çekip formu doldurur — hem "reportId ile
  // düzenle" hem "bu tarihte zaten rapor var" akışı bunu kullanır. İkisinin
  // ayrı ayrı (ve birbirinden sapan) kopyaları olması önceki hatanın kaynağıydı:
  // "zaten var" durumunda form hiç doldurulmuyor, Kaydet o günün verisini siliyordu.
  async function loadReportInto(id, seq) {
    // Personnel/machinery/progress/photos/issues get_daily_report_detail RPC'sinden
    // tek çağrıyla gelir (mevcut RPC, ayrı ayrı supabase.from() sorgularıyla aynı veriyi döner).
    // daily_tasks bu RPC'nin dönüşünde henüz yok, o yüzden ayrı sorgulanıyor. RPC materials
    // de döndürüyor ama bu form artık Malzeme Kullanımı bölümünü göstermediği için kullanılmıyor.
    const [detailRes, taskRes, reportMetaRes] = await Promise.all([
      supabase.rpc('get_daily_report_detail', { p_report_id: id }),
      supabase.from('daily_tasks').select('*').eq('report_id', id).order('order_index'),
      supabase.from('daily_reports').select('weather_loss_day').eq('id', id).maybeSingle(),
    ])

    if (seq !== undefined && seq !== dateCheckSeqRef.current) return // daha yeni bir tarih değişikliği bunu geçersiz kıldı

    const detail = detailRes.data?.authorized ? detailRes.data : null

    if (detail?.report) {
      const r = detail.report
      setReportOwnerId(r.created_by || null)
      const reportNotes = decodeMeta(REPORT_NOTES_META_PREFIX, r.notes)
      setFormData({
        report_date:    r.report_date || todayStr(),
        weather:        normalizeWeather(r.weather || 'açık'),
        weather_note:   r.weather_note   || '',
        general_status: r.general_status || 'normal',
        isg_notes:      reportNotes.isg_notes || '',
        incident_notes: reportNotes.incident_notes || '',
        notes:          reportNotes.description || '',
        weather_loss_day: Boolean(reportMetaRes.data?.weather_loss_day),
      })
      setShowWeatherNote(Boolean(r.weather_note))
    }

    // Personnel
    const persRows = detail?.personnel || []
    if (persRows.length > 0) {
      const pRows = initPersonnel()
      persRows.forEach(e => {
        const row = pRows.find(r => r.shift === e.shift)
        if (row && DEPARTMENTS.includes(e.department)) row[e.department] = e.count || 0
      })
      setPersonnel(pRows)
    } else {
      setPersonnel(initPersonnel())
    }

    // Machinery
    const machRows = detail?.machinery || []
    if (machRows.length > 0) {
      const presetRows = initMachinery()
      const customRows = []
      machRows.forEach(m => {
        const row = {
          machine_type: m.machine_type || '',
          count:        m.count        || 0,
          status:       m.status       || 'çalışıyor',
          notes:        m.notes        || '',
        }
        const preset = presetRows.find(p => p.machine_type === row.machine_type)
        if (preset) Object.assign(preset, row)
        else customRows.push(row)
      })
      setMachinery([...presetRows, ...customRows])
    } else {
      setMachinery(initMachinery())
    }

    // Progress qtys — task_id ile anahtarlanır (eski item_id-bazlı satırlarda da
    // Migration A/B ile backfill edilmiş task_id kullanılabilir hale geldi).
    const eQtys = {}
    ;(detail?.progress || []).forEach(e => { eQtys[e.task_id] = Number(e.qty_added) || 0 })
    setExistingQtys(eQtys)
    setTodayQty({ ...eQtys })

    const taskRows = taskRes.data || []
    const loadedDone = taskRows
      .filter(t => ['tamamlandı', 'tamamlandi', 'done'].includes(String(t.type || '').toLocaleLowerCase('tr-TR')))
      .map(t => ({ description: t.description || '' }))
    const loadedPlanned = taskRows
      .filter(t => ['planlandı', 'planlandi', 'planned'].includes(String(t.type || '').toLocaleLowerCase('tr-TR')))
      .map(t => ({ description: t.description || '' }))
    setDoneTasks(loadedDone.length ? loadedDone : [newTaskRow()])
    setPlannedTasks(loadedPlanned.length ? loadedPlanned : [newTaskRow()])

    // Existing photos
    setExistingPhotos(detail?.photos || [])

    // Issues — id/ticket_id KORUNMALI: id geri gönderilmezse save_daily_report
    // bunu yeni sorun sanıp her kayıtta mükerrer ticket açar (bkz. RPC yorumu).
    const issueRows = detail?.issues || []
    if (issueRows.length > 0) {
      setIssues(issueRows.map(i => {
        const meta = decodeMeta(ISSUE_META_PREFIX, i.description)
        return {
          id:                i.id,
          ticket_id:         i.ticket_id        || null,
          topic:             i.topic             || '',
          category:          meta.category        || '',
          priority:          i.priority          || 'orta',
          assigned_to:       i.assigned_to       || '',
          description:       meta.description    || '',
          resolution_status: i.resolution_status || 'açık',
          closed_at:         meta.closed_at      || '',
          notes:             meta.notes          || '',
        }
      }))
    } else {
      setIssues([newIssueRow()])
    }

    const ticketIds = [...new Set(issueRows.map(i => i.ticket_id).filter(Boolean))]
    if (ticketIds.length > 0) {
      const { data: ticketRows } = await supabase.from('tickets').select('id, status, severity').in('id', ticketIds)
      const map = {}
      ;(ticketRows || []).forEach(t => { map[t.id] = t })
      setIssueTicketInfo(map)
    } else {
      setIssueTicketInfo({})
    }
  }

  // Seçilen tarih için hiç rapor yoksa formu o tarihle boşa döner.
  function resetToBlank(date) {
    photos.forEach(p => URL.revokeObjectURL(p.preview))
    setFormData({
      report_date:    date,
      weather:        'açık',
      weather_note:   '',
      general_status: 'normal',
      isg_notes:      '',
      incident_notes: '',
      notes:          '',
      weather_loss_day: false,
    })
    setShowWeatherNote(false)
    setPersonnel(initPersonnel())
    setMachinery(initMachinery())
    setExistingQtys({})
    setTodayQty({})
    setDoneTasks([newTaskRow()])
    setPlannedTasks([newTaskRow()])
    setPhotos([])
    setExistingPhotos([])
    setIssues([newIssueRow()])
    setIssueTicketInfo({})
    setReportOwnerId(null)
  }

  // Create-mode'da: seçilen tarihte zaten rapor var mı diye bakar. Varsa
  // formu o raporla doldurur (Kaydet artık güncelleme olur, silme değil).
  // Yoksa formu o tarih için temiz bırakır.
  async function checkDateAndLoad(date, effectiveProjectId) {
    const seq = ++dateCheckSeqRef.current

    const { data: existing } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('project_id', effectiveProjectId)
      .eq('report_date', date)
      .maybeSingle()

    let found = existing
    if (!found && effectiveProjectId !== projectId) {
      const { data: legacy } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('project_id', projectId)
        .eq('report_date', date)
        .maybeSingle()
      found = legacy
    }

    if (seq !== dateCheckSeqRef.current) return // daha yeni bir tarih değişikliği bunu geçersiz kıldı

    if (found) {
      setAlreadyExists(true)
      setReportId(found.id)
      await loadReportInto(found.id, seq)
      if (seq !== dateCheckSeqRef.current) return
      showToast('Bu tarihte kayıtlı rapor yüklendi')
    } else {
      setAlreadyExists(false)
      setReportId(null)
      const { data: draft } = await supabase
        .from('daily_report_drafts')
        .select('payload')
        .eq('project_id', effectiveProjectId)
        .eq('report_date', date)
        .eq('user_id', user?.id)
        .maybeSingle()

      if (seq !== dateCheckSeqRef.current) return
      resetToBlank(date)
      const payload = draft?.payload
      if (payload) {
        setFormData(current => ({ ...current, ...(payload.formData || {}), report_date: date }))
        setPersonnel(Array.isArray(payload.personnel) ? payload.personnel : initPersonnel())
        setMachinery(Array.isArray(payload.machinery) ? payload.machinery : [])
        setDoneTasks(Array.isArray(payload.doneTasks) && payload.doneTasks.length ? payload.doneTasks : [newTaskRow()])
        setPlannedTasks(Array.isArray(payload.plannedTasks) && payload.plannedTasks.length ? payload.plannedTasks : [newTaskRow()])
        setTodayQty(payload.todayQty || {})
        setItemNotes(payload.itemNotes || {})
        setAdditionalProgressIds(Array.isArray(payload.additionalProgressIds) ? payload.additionalProgressIds : [])
        setShowWeatherNote(Boolean(payload.formData?.weather_note))
        showToast('Taslak yüklendi')
      }
    }
  }

  async function handleDateChange(newDate) {
    setFormData(f => ({ ...f, report_date: newDate }))
    const effectiveProjectId = resolvedProjectId || project?.id || projectId
    if (!effectiveProjectId) return
    await checkDateAndLoad(newDate, effectiveProjectId)
  }

  async function loadAll() {
    setLoading(true)
    try {
      const resolvedProject = await resolveProjectByAssignedId(supabase, projectId, 'id, name, location')
      const effectiveProjectId = resolvedProject?.id || projectId
      setProject(resolvedProject || null)
      setResolvedProjectId(effectiveProjectId)

      const [itemsRes, weatherLossRes] = await Promise.all([
        supabase.from('project_tasks')
          .select('id, task_name, unit, target_qty, total_progress, category, planned_start, planned_end, status')
          .eq('project_id', effectiveProjectId)
          .gt('target_qty', 0)
          .order('planned_start'),
        supabase.from('daily_reports')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', effectiveProjectId)
          .eq('weather_loss_day', true),
      ])
      setProgressItems((itemsRes.data || []).map(t => ({ ...t, name: t.task_name })))
      setWeatherLossCount(weatherLossRes.count || 0)

      const [profileRes] = await Promise.all([
        user?.id
          ? supabase.from('profiles').select('full_name').eq('id', user.id).single()
          : Promise.resolve({ data: null }),
      ])
      setPreparedBy(profileRes.data?.full_name || user?.email || '')

      if (initialReportId) {
        await loadReportInto(initialReportId)
      } else {
        await checkDateAndLoad(formData.report_date, effectiveProjectId)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Derived
  const totalPersonnel = personnel.reduce((sum, row) =>
    sum + DEPARTMENTS.reduce((s, d) => s + (Number(row[d]) || 0), 0), 0)

  // Personnel helpers
  function updatePersonnel(shiftIndex, dept, val) {
    setPersonnel(prev => prev.map((row, i) =>
      i === shiftIndex ? { ...row, [dept]: Math.max(0, parseInt(val) || 0) } : row
    ))
  }

  // Machinery helpers
  function updateMachinery(i, field, val) {
    setMachinery(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }
  function addMachineryRow()    { setMachinery(prev => [...prev, newMachineryRow()]) }
  function removeMachineryRow(i){ setMachinery(prev => prev.filter((_, idx) => idx !== i)) }

  // Daily task helpers
  function updateTask(kind, i, val) {
    const setter = kind === 'done' ? setDoneTasks : setPlannedTasks
    setter(prev => prev.map((row, idx) => idx === i ? { ...row, description: val } : row))
  }
  function addTask(kind) {
    const setter = kind === 'done' ? setDoneTasks : setPlannedTasks
    setter(prev => [...prev, newTaskRow()])
  }
  function removeTask(kind, i) {
    const setter = kind === 'done' ? setDoneTasks : setPlannedTasks
    setter(prev => {
      const next = prev.filter((_, idx) => idx !== i)
      return next.length ? next : [newTaskRow()]
    })
  }

  // Issue helpers
  function updateIssue(i, field, val) {
    setIssues(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }
  function addIssueRow()    { setIssues(prev => [...prev, newIssueRow()]) }
  function removeIssueRow(i){ setIssues(prev => prev.filter((_, idx) => idx !== i)) }

  // Photo helpers
  function handlePhotoSelect(e) {
    const files = Array.from(e.target.files)
    const newPhotos = files.map(file => ({
      file,
      caption: '',
      preview: URL.createObjectURL(file),
    }))
    setPhotos(prev => [...prev, ...newPhotos])
    e.target.value = ''
  }
  function updatePhotoCaption(i, caption) {
    setPhotos(prev => prev.map((p, idx) => idx === i ? { ...p, caption } : p))
  }
  function removePhoto(i) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  // ─── Panel aç/kapat — her panel kendi "Kaydet ve Kapat" / "İptal" butonuna
  // sahip. Panel açılırken formun o anki tüm durumu anlık görüntülenir;
  // "İptal" bu görüntüye geri döner, "Kaydet ve Kapat" sadece paneli kapatır
  // (veri zaten canlı state'e yazılıyor, ayrıca ağ çağrısı gerekmez — asıl
  // yazma "Raporu Gönder" ile tek seferde olur).
  function captureSnapshot() {
    return {
      formData: { ...formData },
      personnel: personnel.map(r => ({ ...r })),
      machinery: machinery.map(r => ({ ...r })),
      doneTasks: doneTasks.map(r => ({ ...r })),
      plannedTasks: plannedTasks.map(r => ({ ...r })),
      todayQty: { ...todayQty },
      itemNotes: { ...itemNotes },
      existingQtys: { ...existingQtys },
      issues: issues.map(r => ({ ...r })),
      photos: photos.slice(),
      existingPhotos: existingPhotos.slice(),
      reportId,
      alreadyExists,
    }
  }

  function restoreSnapshot(snap) {
    setFormData(snap.formData)
    setPersonnel(snap.personnel)
    setMachinery(snap.machinery)
    setDoneTasks(snap.doneTasks)
    setPlannedTasks(snap.plannedTasks)
    setTodayQty(snap.todayQty)
    setItemNotes(snap.itemNotes)
    setExistingQtys(snap.existingQtys)
    setIssues(snap.issues)
    // Panel açıkken eklenmiş yeni fotoğrafların preview URL'lerini bellekte bırakmamak için iptal edilir.
    const keepUrls = new Set(snap.photos.map(p => p.preview))
    photos.forEach(p => { if (!keepUrls.has(p.preview)) URL.revokeObjectURL(p.preview) })
    setPhotos(snap.photos)
    setExistingPhotos(snap.existingPhotos)
    setReportId(snap.reportId)
    setAlreadyExists(snap.alreadyExists)
  }

  function openPanel(key) {
    panelSnapshotRef.current = captureSnapshot()
    setPanelError('')
    setOpenSection(key)
  }
  function closePanelSave() {
    const sectionDef = SECTION_DEFS.find(section => section.key === openSection)
    if (!sectionDef?.optional && !SECTION_STATE[openSection]?.complete) {
      setPanelError(`${SECTION_DEFS.find(section => section.key === openSection)?.label || 'Bu bölüm'} için gerekli bilgileri girin.`)
      return
    }
    panelSnapshotRef.current = null
    setPanelError('')
    setOpenSection(null)
  }
  function closePanelCancel() {
    if (panelSnapshotRef.current) restoreSnapshot(panelSnapshotRef.current)
    panelSnapshotRef.current = null
    setOpenSection(null)
  }

  async function handleWeatherLossDay() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const effectiveProjectId = resolvedProjectId || project?.id || projectId
      if (!effectiveProjectId || !user?.id) throw new Error('Kullanıcı veya proje bilgisi yüklenemedi.')

      let rid = reportId
      const wasAlreadyWeatherLoss = Boolean(formData.weather_loss_day)
      if (rid) {
        const { error: updateError } = await supabase
          .from('daily_reports')
          .update({
            weather_loss_day: true,
            weather: formData.weather,
            weather_note: formData.weather_note || formatWeatherNote(currentWeather) || null,
          })
          .eq('id', rid)
        if (updateError) throw updateError
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('daily_reports')
          .insert({
            project_id: effectiveProjectId,
            report_date: formData.report_date,
            created_by: user.id,
            general_status: 'dikkat',
            worker_count: 0,
            weather: formData.weather,
            weather_note: formData.weather_note || formatWeatherNote(currentWeather) || null,
            notes: reportNotesPayload(formData),
            weather_loss_day: true,
          })
          .select('id')
          .single()
        if (insertError) throw insertError
        rid = inserted.id
        setReportId(rid)
      }

      setFormData(f => ({ ...f, weather_loss_day: true, general_status: 'dikkat' }))
      if (!wasAlreadyWeatherLoss) setWeatherLossCount(count => count + 1)
      showToast('Hava kayıplı gün kaydedildi')
      setTimeout(() => onSaved?.(), 650)
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleBack() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const effectiveProjectId = resolvedProjectId || project?.id || projectId
      if (!effectiveProjectId || !user?.id) throw new Error('Kullanıcı veya proje bilgisi yüklenemedi.')
      const payload = {
        formData,
        personnel,
        machinery,
        doneTasks,
        plannedTasks,
        todayQty,
        itemNotes,
        additionalProgressIds,
      }
      const { error: draftError } = await supabase.from('daily_report_drafts').upsert({
        project_id: effectiveProjectId,
        report_date: formData.report_date,
        user_id: user.id,
        payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,report_date,user_id' })
      if (draftError) throw draftError
      onBack?.()
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    const incompleteSections = SECTION_DEFS.filter(section => !section.optional && !SECTION_STATE[section.key]?.complete)
    if (incompleteSections.length > 0) {
      setError(`Raporu göndermek için şu bölümleri doldurun: ${incompleteSections.map(section => section.label).join(', ')}.`)
      setOpenSection(incompleteSections[0].key)
      setPanelError(`${incompleteSections[0].label} için gerekli bilgileri girin.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      const effectiveProjectId = resolvedProjectId || project?.id || projectId
      if (!effectiveProjectId || !user?.id) throw new Error('Kullanıcı veya proje bilgisi yüklenemedi.')

      // Rapor + personel + makine + görevler + ilerleme + malzeme + sorunlar tek
      // save_daily_report RPC çağrısıyla server tarafında bir transaction içinde
      // atomik yazılır (önceden 15+ ayrı client-orkestrasyonlu delete/insert/update idi).
      const persRows = []
      personnel.forEach(row => {
        DEPARTMENTS.forEach(dept => {
          if (Number(row[dept]) > 0) {
            persRows.push({ shift: row.shift, department: dept, count: Number(row[dept]) })
          }
        })
      })

      const validMach = machinery
        .map(r => ({ ...r, machine_type: normalizeMachineType(r.machine_type) }))
        .filter(r => r.machine_type && Number(r.count) > 0)
        .map(r => ({ machine_type: r.machine_type, count: Number(r.count), status: r.status, notes: r.notes || null }))

      const taskRows = [
        ...doneTasks
          .filter(r => String(r.description || '').trim())
          .map((r, index) => ({ type: 'tamamlandı', description: r.description.trim(), order_index: index })),
        ...plannedTasks
          .filter(r => String(r.description || '').trim())
          .map((r, index) => ({ type: 'planlandı', description: r.description.trim(), order_index: index })),
      ]

      const progressRows = []
      for (const item of progressItems) {
        const newQty = Number(todayQty[item.id]) || 0
        if (newQty > 0) {
          progressRows.push({ task_id: item.id, qty_added: newQty, note: itemNotes[item.id] || null })
        }
      }

      const validIssues = issues.filter(r => r.topic).map(r => ({
        id:                r.id || null, // mevcut satır — backend'in mükerrer ticket açmaması için şart
        topic:             r.topic,
        priority:          r.priority,
        assigned_to:       r.assigned_to || null,
        description:       issueDescription(r) || null,
        resolution_status: r.resolution_status,
      }))

      const { data: rid, error: saveErr } = await supabase.rpc('save_daily_report', {
        p_project_id:     effectiveProjectId,
        p_report_date:    formData.report_date,
        p_created_by:     user?.id,
        p_general_status: formData.general_status,
        p_worker_count:   totalPersonnel,
        p_weather:        formData.weather,
        p_weather_note:   formData.weather_note || null,
        p_notes:          reportNotesPayload(formData) || null,
        p_personnel:      persRows,
        p_machinery:      validMach,
        // RPC'nin tek kanonik imzasında geriye uyumluluk için kalan alanlar.
        // Bu formda eski ilerleme/malzeme bölümleri artık kullanılmıyor.
        p_progress:       [],
        p_daily_tasks:    taskRows,
        p_materials:      [],
        p_issues:         validIssues,
        p_task_progress:  progressRows,
      })
      if (saveErr) throw saveErr
      setReportId(rid)

      const { error: weatherLossError } = await supabase
        .from('daily_reports')
        .update({ weather_loss_day: Boolean(formData.weather_loss_day) })
        .eq('id', rid)
      if (weatherLossError) throw weatherLossError

      await supabase.from('daily_report_drafts')
        .delete()
        .eq('project_id', effectiveProjectId)
        .eq('report_date', formData.report_date)
        .eq('user_id', user.id)

      // Fotoğraflar: Storage API'ye Postgres fonksiyonundan erişilemediği için
      // yükleme + kayıt istemci tarafında ayrı kalır.
      for (const photo of photos) {
        const uploadFile = await compressImageFile(photo.file)
        const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${effectiveProjectId}/${formData.report_date}/${Date.now()}_${safeName}`
        const { error: uploadErr } = await supabase.storage.from('saha-fotolari').upload(path, uploadFile)
        if (uploadErr) throw uploadErr
        const { error: photoInsertErr } = await supabase.from('daily_report_photos').insert({
          report_id:    rid,
          project_id:   effectiveProjectId,
          report_date:  formData.report_date,
          storage_path: path,
          caption:      photo.caption || null,
          uploaded_by:  user?.id,
        })
        if (photoInsertErr) throw photoInsertErr
      }

      showToast('Rapor kaydedildi ✓')
      setTimeout(() => onSaved?.(), 900)

    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!reportId || deleting || saving) return
    const confirmed = window.confirm(
      `${new Date(formData.report_date).toLocaleDateString('tr-TR')} tarihli raporu kalıcı olarak silmek istediğinize emin misiniz?`
    )
    if (!confirmed) return

    setDeleting(true)
    setError('')
    try {
      const photoPaths = existingPhotos.map(photo => photo.storage_path).filter(Boolean)
      const { data: deletedRows, error: deleteError } = await supabase
        .from('daily_reports')
        .delete()
        .eq('id', reportId)
        .select('id')

      if (deleteError) throw deleteError
      if (!deletedRows?.length) throw new Error('Bu raporu silme yetkiniz bulunmuyor veya rapor artık mevcut değil.')

      if (photoPaths.length > 0) {
        const { error: storageError } = await supabase.storage.from('saha-fotolari').remove(photoPaths)
        if (storageError) console.warn('Rapor silindi ancak bazı fotoğraf dosyaları temizlenemedi:', storageError)
      }

      showToast('Rapor silindi')
      setTimeout(() => onSaved?.(), 450)
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setDeleting(false)
    }
  }

  // ─── Grouped progress items ───────────────────────────────────────────────
  const reportDay = formData.report_date
  const scheduledProgressItems = progressItems.filter(item => {
    const status = String(item.status || '').toLocaleLowerCase('tr-TR')
    const isComplete = ['tamamlandi', 'tamamlandı', 'done'].includes(status)
    const isOverdue = !isComplete && item.planned_end && item.planned_end < reportDay
    const isActiveToday = item.planned_start && item.planned_start <= reportDay && (!item.planned_end || item.planned_end >= reportDay)
    const isAlreadyInReport = Number(existingQtys[item.id]) > 0
    return isOverdue || isActiveToday || isAlreadyInReport || additionalProgressIds.includes(item.id)
  })
  const optionalProgressItems = progressItems.filter(item => !scheduledProgressItems.some(visible => visible.id === item.id))
  const overdueProgressItems = scheduledProgressItems.filter(item => {
    const status = String(item.status || '').toLocaleLowerCase('tr-TR')
    const isComplete = ['tamamlandi', 'tamamlandı', 'done'].includes(status)
    return !isComplete && item.planned_end && item.planned_end < reportDay
  })
  const todayProgressItems = scheduledProgressItems.filter(item => !overdueProgressItems.some(overdue => overdue.id === item.id))

  function renderProgressItem(item, tone) {
    const existQty = Number(existingQtys[item.id]) || 0
    const prevTotal = Math.max(0, (Number(item.total_progress) || 0) - existQty)
    const todayVal = Number(todayQty[item.id]) || 0
    const cumulative = prevTotal + todayVal
    const target = Number(item.target_qty) || 0
    const pct = target > 0 ? Math.min(100, (cumulative / target * 100)).toFixed(1) : '—'
    const isOver = target > 0 && cumulative > target
    const toneColor = tone === 'overdue' ? 'var(--color-danger)' : 'var(--color-primary)'
    const toneBg = tone === 'overdue' ? 'var(--color-danger-bg)' : 'var(--color-primary-bg)'

    return (
      <div key={item.id} style={{ ...CARD_ROW, border: `1.5px solid ${toneColor}`, background: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 13, color: 'var(--color-text)' }}>{item.name}</strong>
            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-muted-light)' }}>
              {item.unit} · Hedef {target} · Önceki toplam {prevTotal.toFixed(1)}
            </div>
          </div>
          <span style={{ padding: '4px 8px', borderRadius: 999, background: toneBg, color: toneColor, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
            {pct !== '—' ? `%${pct}` : '—'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <div>
            <label style={LABEL}>Bugün</label>
            <input
              type="number" min={0} step="0.01"
              value={todayQty[item.id] || ''}
              onChange={e => setTodayQty(prev => ({ ...prev, [item.id]: e.target.value }))}
              style={{ ...INPUT, borderColor: isOver ? 'var(--color-danger)' : toneColor }}
              placeholder="0"
            />
          </div>
          <div>
            <label style={LABEL}>Kümülatif</label>
            <div style={{ ...INPUT, background: 'var(--color-bg)', fontWeight: 600, color: isOver ? 'var(--color-danger)' : 'var(--color-text)' }}>
              {cumulative.toFixed(1)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={LABEL}>Not</label>
          <input
            type="text"
            value={itemNotes[item.id] || ''}
            onChange={e => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
            placeholder={isOver ? 'Aşma sebebi...' : 'Not...'}
            style={{ ...INPUT, borderColor: isOver && !itemNotes[item.id] ? 'var(--color-danger)' : undefined }}
          />
        </div>
      </div>
    )
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
        Yükleniyor…
      </div>
    )
  }

  // ─── Bölüm tamamlanma durumu — "anlamlı veri girildiyse" tamamlandı sayılır.
  // Hava/Genel Durum ve Notlar zaten geçerli varsayılan değerlerle geldiği için hep tamamlanmış sayılır.
  const filledMachinery     = machinery.filter(r => normalizeMachineType(r.machine_type) && Number(r.count) > 0)
  const filledDoneTasks     = doneTasks.filter(r => String(r.description || '').trim())
  const filledPlannedTasks  = plannedTasks.filter(r => String(r.description || '').trim())
  const filledProgressItems = progressItems.filter(item => Number(todayQty[item.id]) > 0)
  const filledIssues        = issues.filter(r => String(r.topic || '').trim())
  const totalPhotoCount     = existingPhotos.length + photos.length

  const SECTION_STATE = {
    general: {
      complete: true,
      preview: `${WEATHER_LABELS[formData.weather] || formData.weather} · ${STATUS_LABELS[formData.general_status] || formData.general_status}${formData.weather_loss_day ? ' · Hava kayıplı gün' : ''}`,
    },
    personnel: {
      complete: totalPersonnel > 0,
      preview: totalPersonnel > 0 ? `${totalPersonnel} kişi` : 'Henüz girilmedi',
    },
    machinery: {
      complete: filledMachinery.length > 0,
      preview: filledMachinery.length > 0 ? `${filledMachinery.length} makine` : 'Henüz girilmedi',
    },
    tasks: {
      complete: filledDoneTasks.length > 0 && filledPlannedTasks.length > 0,
      preview: (filledDoneTasks.length + filledPlannedTasks.length) > 0
        ? `${filledDoneTasks.length} tamamlanan, ${filledPlannedTasks.length} planlanan`
        : 'Henüz girilmedi',
    },
    progress: {
      complete: progressItems.length === 0 || filledProgressItems.length > 0,
      preview: filledProgressItems.length > 0
        ? `${filledProgressItems.length} kalem güncellendi`
        : (progressItems.length ? 'Henüz girilmedi' : 'Bu projeye iş kalemi tanımlanmamış'),
    },
    issues: {
      complete: filledIssues.length > 0,
      preview: filledIssues.length > 0 ? `${filledIssues.length} sorun` : 'Sorun yok',
    },
    photos: {
      complete: totalPhotoCount > 0,
      preview: totalPhotoCount > 0 ? `${totalPhotoCount} fotoğraf` : 'Henüz eklenmedi',
    },
    notes: {
      complete: Boolean(String(formData.isg_notes || '').trim() || String(formData.incident_notes || '').trim() || String(formData.notes || '').trim()),
      preview: (formData.notes || formData.isg_notes || formData.incident_notes)
        ? String(formData.notes || formData.isg_notes || formData.incident_notes).slice(0, 40)
        : 'Henüz girilmedi',
    },
  }

  const requiredSections = SECTION_DEFS.filter(section => !section.optional)
  const completedRequiredCount = requiredSections.filter(section => SECTION_STATE[section.key].complete).length
  const activeSectionDef = SECTION_DEFS.find(d => d.key === openSection)

  return (
    <div className={className} style={{ fontFamily: 'Calibri, Inter, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: 'var(--color-success-bg)', color: 'var(--color-success-text)', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: 'var(--shadow-card)',
        }}>
          {toast}
        </div>
      )}

      {/* Üst bant — geri butonu + her zaman görünen özet kartları */}
      <div style={{
        background: '#1B3A6B', borderRadius: 16, padding: '14px 18px', marginBottom: 16,
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={handleBack} disabled={saving} style={{ ...BTN_BACK, opacity: saving ? .65 : 1 }}>{saving ? 'Taslak kaydediliyor…' : '← Geri'}</button>
          {alreadyExists && !initialReportId && (
            <span style={{
              background: 'rgba(245, 158, 11, 0.18)', color: '#FDE68A', borderRadius: 8,
              padding: '5px 10px', fontSize: 11.5, fontWeight: 700,
            }}>
              ⚠ Bu tarih için rapor zaten mevcut — düzenleniyor
            </span>
          )}
        </div>
        <div className="sr-summary-grid">
          <SummaryTile label="Proje" value={project?.name || projectId || '—'} />
          <SummaryTile label="Tarih" value={new Date(formData.report_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} />
          <SummaryTile label="Toplam İşçi" value={totalPersonnel} />
          <SummaryTile label="Genel Durum" value={formData.general_status} tone={formData.general_status} />
        </div>
      </div>

      {/* Bölüm listesi */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 14, overflow: 'hidden', marginBottom: 16, boxShadow: 'var(--shadow-card)' }}>
        {SECTION_DEFS.map(def => {
          const state = SECTION_STATE[def.key]
          return (
            <button
              key={def.key}
              type="button"
              onClick={() => openPanel(def.key)}
              className="ss-list-row"
              style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--color-border)', background: 'none', fontFamily: 'inherit' }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{def.icon}</span>
              <span className="ss-list-title" style={{ fontWeight: 600 }}>
                {def.label}{def.optional ? ' (Opsiyonel)' : ''}
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--color-muted-light)', marginTop: 2 }}>
                  {state.preview}
                </span>
              </span>
              {state.complete
                ? <span style={CHECK_BADGE} title="Dolduruldu">✓</span>
                : <span style={{ color: 'var(--color-muted-light)', fontSize: 18, flexShrink: 0 }}>›</span>}
            </button>
          )
        })}
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>
      )}

      {/* Sabit "Raporu Gönder" barı */}
      <div className="sr-submit-bar" style={{
        position: 'sticky', bottom: 0, background: 'var(--color-bg)', paddingTop: 10, paddingBottom: 10, marginTop: 4,
      }}>
        <span style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>
          {completedRequiredCount}/{requiredSections.length} zorunlu bölüm dolduruldu
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {reportId && reportOwnerId === user?.id && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              style={{ ...BTN_DELETE_REPORT, opacity: saving || deleting ? 0.6 : 1 }}
            >
              {deleting ? 'Siliniyor…' : 'Raporu Sil'}
            </button>
          )}
          <button onClick={handleSave} disabled={saving || deleting} style={{ ...BTN_SUBMIT, opacity: saving || deleting ? 0.7 : 1 }}>
            {saving ? 'Gönderiliyor…' : '📋 Raporu Gönder'}
          </button>
        </div>
      </div>

      {/* ── Bölüm paneli — sağdan (masaüstü) / alttan (mobil) açılır ── */}
      {openSection && (
        <div className="gr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closePanelCancel() }}>
          <div className="gr-drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div style={MODAL_HEADER}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{activeSectionDef?.label}</h3>
              <button onClick={closePanelCancel} style={BTN_GHOST}>✕</button>
            </div>
            <div style={{ ...MODAL_BODY, flex: 1 }}>

              {/* Hava ve Genel Durum */}
              {openSection === 'general' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <InfoTile label="Hazırlayan" value={preparedBy || '—'} />
                    <InfoTile label="Proje" value={project?.name || projectId || '—'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                    <div>
                      <label style={LABEL}>Rapor Tarihi</label>
                      <input
                        type="date"
                        value={formData.report_date}
                        onChange={e => handleDateChange(e.target.value)}
                        disabled={!!initialReportId}
                        style={initialReportId ? { ...INPUT, background: 'var(--color-bg)', color: 'var(--color-muted)' } : INPUT}
                      />
                    </div>
                    <div>
                      <label style={LABEL}>Hava Durumu</label>
                      <div style={{ ...INPUT, background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{WEATHER_LABELS[formData.weather] || formData.weather}</strong>
                        <span style={{ color: 'var(--color-primary)', fontSize: 11, fontWeight: 700 }}>API’den otomatik</span>
                      </div>
                    </div>
                    <div>
                      <label style={LABEL}>Genel Durum</label>
                      <select value={formData.general_status} onChange={e => setFormData(f => ({ ...f, general_status: e.target.value }))} style={INPUT}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setShowWeatherNote(v => !v)}
                          aria-label="Hava durumu notu ekle"
                          title="Hava durumu notu ekle"
                          style={{ ...BTN_GHOST, width: 38, minHeight: 38, padding: 0, fontSize: 20 }}
                        >+</button>
                        <span style={{ color: 'var(--color-text-sub)', fontSize: 12, fontWeight: 600 }}>Opsiyonel hava notu</span>
                        <button type="button" onClick={handleWeatherLossDay} disabled={saving} style={{ ...BTN_WEATHER_LOSS, marginLeft: 'auto', opacity: saving ? .65 : 1 }}>
                          Hava Kayıplı Gün Gir · Toplam {weatherLossCount}
                        </button>
                      </div>
                      {showWeatherNote && (
                        <input type="text" value={formData.weather_note} onChange={e => setFormData(f => ({ ...f, weather_note: e.target.value }))} placeholder="Hava durumu hakkında ek not..." style={INPUT} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Personel */}
              {openSection === 'personnel' && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 480, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={TH}>Personel Tipi</th>
                        {DEPARTMENTS.map(d => <th key={d} style={TH}>{DEPT_LABELS[d]}</th>)}
                        <th style={TH}>Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personnel.map((row, i) => {
                        const rowTotal = DEPARTMENTS.reduce((s, d) => s + (Number(row[d]) || 0), 0)
                        return (
                          <tr key={row.shift}>
                            <td style={{ ...TD, fontWeight: 600, color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>{SHIFT_LABELS[row.shift] || row.shift}</td>
                            {DEPARTMENTS.map(dept => (
                              <td key={dept} style={TD}>
                                <input
                                  type="number" min={0}
                                  value={row[dept] || 0}
                                  onChange={e => updatePersonnel(i, dept, e.target.value)}
                                  style={NUM_INPUT}
                                />
                              </td>
                            ))}
                            <td style={{ ...TD, fontWeight: 700, color: 'var(--color-primary)' }}>{rowTotal}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td style={{ ...TD, fontWeight: 700 }}>Genel Toplam</td>
                        {DEPARTMENTS.map(dept => {
                          const colTotal = personnel.reduce((s, r) => s + (Number(r[dept]) || 0), 0)
                          return <td key={dept} style={{ ...TD, fontWeight: 700, color: 'var(--color-primary)' }}>{colTotal}</td>
                        })}
                        <td style={{ ...TD, fontWeight: 800, color: 'var(--color-primary)', background: 'var(--color-primary-bg)' }}>{totalPersonnel}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Makine / Ekipman */}
              {openSection === 'machinery' && (
                <div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 560 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Makine Türü</th>
                          <th style={{ ...TH, width: 70 }}>Adet</th>
                          <th style={{ ...TH, width: 140 }}>Durum</th>
                          <th style={TH}>Notlar</th>
                          <th style={{ ...TH, width: 44 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {machinery.map((row, i) => (
                          <tr key={i}>
                            <td style={TD}>
                              <input
                                type="text"
                                value={row.machine_type}
                                onChange={e => updateMachinery(i, 'machine_type', e.target.value)}
                                placeholder="Makine veya ekipman adı"
                                style={{ ...INPUT, padding: '5px 8px' }}
                              />
                            </td>
                            <td style={TD}>
                              <input type="number" min={0} value={row.count} onChange={e => updateMachinery(i, 'count', e.target.value)} style={NUM_INPUT} />
                            </td>
                            <td style={TD}>
                              <select
                                value={row.status}
                                onChange={e => updateMachinery(i, 'status', e.target.value)}
                                style={{ ...INPUT, padding: '5px 8px', borderColor: MACH_STATUS_COLOR[row.status], color: MACH_STATUS_COLOR[row.status], fontWeight: 600 }}
                              >
                                {MACH_STATUS.map(s => <option key={s} value={s}>{MACH_STATUS_LABELS[s]}</option>)}
                              </select>
                            </td>
                            <td style={TD}>
                              <input type="text" value={row.notes} onChange={e => updateMachinery(i, 'notes', e.target.value)} placeholder="Not..." style={{ ...INPUT, padding: '5px 8px' }} />
                            </td>
                            <td style={TD}>
                              <button onClick={() => removeMachineryRow(i)} style={BTN_REMOVE} title="Sil">×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={addMachineryRow} style={{ ...BTN_GHOST, marginTop: 10 }}>+ Makine / Ekipman Ekle</button>
                </div>
              )}

              {/* Günün İşleri */}
              {openSection === 'tasks' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                  <div>
                    <p style={SECTION_LABEL}>Bugün Yapılan İşler</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {doneTasks.map((row, i) => (
                        <div key={`done-${i}`} style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            value={row.description}
                            onChange={e => updateTask('done', i, e.target.value)}
                            placeholder="Bugün yapılan iş..."
                            style={INPUT}
                          />
                          <button onClick={() => removeTask('done', i)} style={BTN_REMOVE} title="Sil">×</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addTask('done')} style={{ ...BTN_GHOST, marginTop: 8 }}>+ İş Ekle</button>
                  </div>

                  <div>
                    <p style={SECTION_LABEL}>Yarın Yapılacak İşler</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {plannedTasks.map((row, i) => (
                        <div key={`planned-${i}`} style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            value={row.description}
                            onChange={e => updateTask('planned', i, e.target.value)}
                            placeholder="Yarın planlanan iş..."
                            style={INPUT}
                          />
                          <button onClick={() => removeTask('planned', i)} style={BTN_REMOVE} title="Sil">×</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addTask('planned')} style={{ ...BTN_GHOST, marginTop: 8 }}>+ Plan Ekle</button>
                  </div>
                </div>
              )}

              {/* İlerleme Girişi */}
              {openSection === 'progress' && (
                <div>
                  {progressItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted-light)' }}>
                      <p style={{ fontSize: 32, margin: '0 0 12px' }}>📋</p>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>Bu projeye henüz iş kalemi tanımlanmamış</p>
                      <p style={{ fontSize: 12 }}>Proje yöneticisi iş kalemlerini tanımladıktan sonra bu bölüm aktif olacak.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {overdueProgressItems.length > 0 && (
                        <section style={{ border: '1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border))', borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)', fontSize: 12, fontWeight: 800 }}>
                            <span>Geciken İşler</span>
                            <span>{overdueProgressItems.length}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
                            {overdueProgressItems.map(item => renderProgressItem(item, 'overdue'))}
                          </div>
                        </section>
                      )}

                      {todayProgressItems.length > 0 && (
                        <section style={{ border: '1px solid color-mix(in srgb, var(--color-primary) 35%, var(--color-border))', borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontSize: 12, fontWeight: 800 }}>
                            <span>Bugün Devam Edenler</span>
                            <span>{todayProgressItems.length}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
                            {todayProgressItems.map(item => renderProgressItem(item, 'today'))}
                          </div>
                        </section>
                      )}

                      {overdueProgressItems.length === 0 && todayProgressItems.length === 0 && (
                        <div style={{ padding: 18, border: '1px dashed var(--color-border-md)', borderRadius: 10, color: 'var(--color-muted)', fontSize: 12, textAlign: 'center' }}>
                          Bugün için otomatik gösterilecek iş kalemi bulunmuyor.
                        </div>
                      )}

                      {optionalProgressItems.length > 0 && (
                        <div style={{ padding: 12, border: '1px dashed color-mix(in srgb, var(--color-primary) 45%, var(--color-border))', borderRadius: 10, background: 'color-mix(in srgb, var(--color-primary) 3%, var(--color-surface))' }}>
                          <label style={{ ...LABEL, color: 'var(--color-primary)', marginBottom: 7 }}>+ İş Kalemi Ekle</label>
                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value) setAdditionalProgressIds(prev => [...new Set([...prev, e.target.value])])
                            }}
                            style={INPUT}
                          >
                            <option value="">İş kalemi seçin…</option>
                            {optionalProgressItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Sorunlar / Blokerlar */}
              {openSection === 'issues' && (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {issues.map((row, i) => (
                      <div key={i} style={CARD_ROW}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)' }}>Sorun {i + 1}</span>
                          <button onClick={() => removeIssueRow(i)} style={BTN_REMOVE} title="Sil">×</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div>
                            <label style={LABEL}>Konu</label>
                            <input type="text" value={row.topic} onChange={e => updateIssue(i, 'topic', e.target.value)} placeholder="Sorun konusu..." style={INPUT} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                            <div>
                              <label style={LABEL}>Kategori</label>
                              <input type="text" value={row.category} onChange={e => updateIssue(i, 'category', e.target.value)} placeholder="Kategori..." style={INPUT} />
                            </div>
                            <div>
                              <label style={LABEL}>Öncelik</label>
                              <select value={row.priority} onChange={e => updateIssue(i, 'priority', e.target.value)} style={INPUT}>
                                {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={LABEL}>İlgili Kişi</label>
                              <input type="text" value={row.assigned_to} onChange={e => updateIssue(i, 'assigned_to', e.target.value)} placeholder="İlgili kişi..." style={INPUT} />
                            </div>
                          </div>
                          <div>
                            <label style={LABEL}>Açıklama</label>
                            <input type="text" value={row.description} onChange={e => updateIssue(i, 'description', e.target.value)} placeholder="Açıklama..." style={INPUT} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                            <div>
                              <label style={LABEL}>Çözüm Durumu</label>
                              <select value={row.resolution_status} onChange={e => updateIssue(i, 'resolution_status', e.target.value)} style={INPUT}>
                                {RESOLUTION_OPTIONS.map(r => <option key={r}>{r}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={LABEL}>Kapanış Tarihi</label>
                              <input type="date" value={row.closed_at} onChange={e => updateIssue(i, 'closed_at', e.target.value)} style={INPUT} />
                            </div>
                            <div>
                              <label style={LABEL}>Not</label>
                              <input type="text" value={row.notes} onChange={e => updateIssue(i, 'notes', e.target.value)} placeholder="Not..." style={INPUT} />
                            </div>
                          </div>
                          {row.ticket_id && (
                            <button
                              type="button"
                              onClick={() => onGoToTicket?.(row.ticket_id)}
                              style={{
                                alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
                                background: '#EFF6FF', color: '#185FA5', border: '1px solid #BFDBFE',
                                borderRadius: 999, padding: '4px 12px', fontSize: 11.5, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              🎫 Ticket açıldı — durum: {TICKET_STATUS_LABEL[issueTicketInfo[row.ticket_id]?.status] || '…'} →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={addIssueRow} style={{ ...BTN_GHOST, marginTop: 12 }}>+ Sorun Ekle</button>
                </div>
              )}

              {/* Fotoğraflar */}
              {openSection === 'photos' && (
                <div>
                  {existingPhotos.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: 11, color: 'var(--color-muted-light)', margin: '0 0 8px' }}>Mevcut fotoğraflar:</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                        {existingPhotos.map(photo => {
                          const url = supabase.storage.from('saha-fotolari').getPublicUrl(photo.storage_path).data.publicUrl
                          return (
                            <div key={photo.id} style={{ position: 'relative' }}>
                              <img src={url} alt={photo.caption || ''} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-md)' }} />
                              {photo.caption && <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--color-muted-light)', textAlign: 'center' }}>{photo.caption}</p>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: 'none' }} />
                  <button onClick={() => fileInputRef.current?.click()} style={{ ...BTN_GHOST, marginBottom: 12, minHeight: 44 }}>
                    📷 Fotoğraf Seç
                  </button>

                  {photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                      {photos.map((photo, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img src={photo.preview} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-md)' }} />
                          <button
                            onClick={() => removePhoto(i)}
                            style={{
                              position: 'absolute', top: 4, right: 4,
                              background: 'rgba(0,0,0,0.6)', color: 'var(--color-surface)', border: 'none',
                              borderRadius: '50%', width: 22, height: 22, fontSize: 12,
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >×</button>
                          <input
                            type="text"
                            value={photo.caption}
                            onChange={e => updatePhotoCaption(i, e.target.value)}
                            placeholder="Açıklama..."
                            style={{ ...INPUT, marginTop: 4, padding: '4px 7px', fontSize: 11 }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Notlar */}
              {openSection === 'notes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={LABEL}>İSG Notları (opsiyonel)</label>
                    <textarea
                      value={formData.isg_notes}
                      onChange={e => setFormData(f => ({ ...f, isg_notes: e.target.value }))}
                      placeholder="İSG gözlemleri, toolbox, uygunsuzluk veya tedbir notları..."
                      rows={3}
                      style={{ ...INPUT, resize: 'vertical' }}
                    />
                  </div>
                  <div>
                    <label style={LABEL}>Olağandışı Olay / Şantiye Ziyareti (opsiyonel)</label>
                    <textarea
                      value={formData.incident_notes}
                      onChange={e => setFormData(f => ({ ...f, incident_notes: e.target.value }))}
                      placeholder="Olağandışı durum, ziyaret, denetim veya saha notu..."
                      rows={3}
                      style={{ ...INPUT, resize: 'vertical' }}
                    />
                  </div>
                  <div>
                    <label style={LABEL}>Genel Notlar</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Bugün yapılan işler, önemli gelişmeler, genel değerlendirme..."
                      rows={5}
                      style={{ ...INPUT, resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}

            </div>
            <div style={{ ...MODAL_HEADER, borderTop: '1px solid var(--color-border)', borderBottom: 'none', gap: 10, flexWrap: 'wrap' }}>
              {panelError && <p style={{ flex: '1 1 100%', margin: 0, color: 'var(--color-danger)', fontSize: 12, fontWeight: 600 }}>{panelError}</p>}
              <button onClick={closePanelCancel} style={BTN_GHOST}>İptal</button>
              <button onClick={closePanelSave} style={BTN_PRIMARY}>Kaydet ve Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Özet kartı (üst bant) ──────────────────────────────────────────────────
function SummaryTile({ label, value, tone }) {
  const toneColor = tone === 'kritik' ? '#FCA5A5' : tone === 'dikkat' ? '#FDE68A' : '#BBF7D0'
  return (
    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px', minWidth: 0 }}>
      <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
      <p style={{
        margin: 0, fontSize: 14, fontWeight: 700, color: tone ? toneColor : '#fff',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: tone ? 'capitalize' : 'none',
      }}>
        {value}
      </p>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const SECTION_LABEL = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }
// Dar panel kutusunda yatay kaydırmalı tablo yerine bölüm/kalem başına dikey kart —
// Sorunlar ve İlerleme Girişi listelerinde kullanılıyor.
const CARD_ROW = { border: '1px solid var(--color-border-md)', borderRadius: 10, padding: '12px 14px', background: 'var(--color-surface)' }

const LABEL = { fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 5 }
const INPUT = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border-md)', borderRadius: 8,
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--color-surface)',
  minHeight: 40,
}
const TH = { padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', background: 'var(--color-border)', border: '1px solid var(--color-border-md)', whiteSpace: 'nowrap' }
const TD = { padding: '6px 8px', textAlign: 'center', border: '1px solid var(--color-border-md)' }
const NUM_INPUT = { width: 64, textAlign: 'center', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 6px', fontSize: 13, fontFamily: 'inherit', outline: 'none', minHeight: 40 }
const BTN_PRIMARY   = { background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }
const BTN_GHOST     = { background: 'none', color: '#2563EB', border: '1px solid #2563EB', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 40 }
const BTN_BACK       = { background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 36 }
const BTN_SUBMIT     = { background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48, whiteSpace: 'nowrap' }
const BTN_WEATHER_LOSS = { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', border: '1px solid color-mix(in srgb, var(--color-warning) 35%, var(--color-border))', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 38, whiteSpace: 'nowrap' }
const BTN_DELETE_REPORT = { background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)', border: '1px solid color-mix(in srgb, var(--color-danger) 24%, var(--color-border))', borderRadius: 10, padding: '11px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48, whiteSpace: 'nowrap' }
const BTN_REMOVE    = { background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: 'none', borderRadius: 6, width: 32, height: 32, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }
const CHECK_BADGE   = {
  width: 24, height: 24, borderRadius: '50%', background: 'var(--color-success)', color: '#fff',
  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const MODAL_HEADER = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
}
const MODAL_BODY = { padding: '18px 20px', overflowY: 'auto' }
