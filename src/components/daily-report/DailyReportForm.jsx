import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useWeather } from '../../hooks/useWeather'
import { resolveProjectByAssignedId } from '../../utils/projectResolver'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEATHER_OPTIONS = ['açık', 'parçalı bulutlu', 'bulutlu', 'yağmurlu', 'karlı', 'fırtınalı']
const STATUS_OPTIONS  = ['normal', 'dikkat', 'kritik']
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
const MACHINERY_PRESETS = ['ekskavatör', 'jcb', 'loader', 'rok_delim', 'gayk_delici', 'vinç', 'kamyon', 'traktör']
const MACHINE_LABELS = {
  ekskavatör: 'Ekskavatör',
  jcb: 'JCB',
  loader: 'Loader',
  rok_delim: 'Rok Delim',
  gayk_delici: 'Gayk Delici',
  vinç: 'Vinç',
  kamyon: 'Kamyon',
  traktör: 'Traktör',
}
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
const UNIT_OPTIONS    = ['Adet', 'm', 'm²', 'm³', 'kg', 'ton', 'rulo', 'kutu']
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
  const key = String(value || '').trim().toLocaleLowerCase('tr-TR')
  return MACHINE_TYPE_ALIASES[key] || (MACHINERY_PRESETS.includes(key) ? key : '')
}

function toUserMessage(e) {
  const m = (e?.message || '').toLowerCase()
  if (m.includes('general_status')) return 'Genel durum geçersiz. Lütfen listeden seçin.'
  if (m.includes('machinery_logs_status') || m.includes('machine')) return 'Makine durumu geçersiz. Lütfen listeden seçin.'
  if (m.includes('weather')) return 'Hava durumu geçersiz. Lütfen listeden seçin.'
  if (m.includes('department') || m.includes('shift')) return 'Personel bilgisi geçersiz. Lütfen listeden seçin.'
  if (m.includes('row-level security') || m.includes('permission')) return 'Bu işlem için yetkiniz yok.'
  if (m.includes('duplicate') || m.includes('unique')) return 'Bu tarih için zaten bir rapor var.'
  return 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.'
}

const CATEGORY_LABELS = {
  mobilizasyon: 'Mobilizasyon', mekanik: 'Mekanik', elektrik_dc: 'Elektrik DC',
  elektrik_ac: 'Elektrik AC', elektrik_og: 'Elektrik OG', topraklama: 'Topraklama',
  enh: 'ENH', devreye_alma: 'Devreye Alma', elektrik: 'Elektrik', inşaat: 'İnşaat', diğer: 'Diğer',
}
const CATEGORY_COLORS = {
  mobilizasyon: '#6366F1', mekanik: '#0EA5E9', elektrik_dc: '#F59E0B', elektrik_ac: '#F59E0B',
  elektrik_og: '#EF4444', topraklama: '#84CC16', enh: '#8B5CF6', devreye_alma: '#185FA5',
  elektrik: '#F59E0B', inşaat: '#78716C', diğer: '#9CA3AF',
}

function initPersonnel() {
  return SHIFTS.map(shift => ({ shift, idari: 0, mekanik: 0, elektrik: 0, yevmiyeci: 0 }))
}
function initMachinery() {
  return MACHINERY_PRESETS.map(machine_type => ({ machine_type, count: 0, status: 'çalışıyor', notes: '' }))
}
function newMachineryRow() {
  return { machine_type: '', count: 0, status: 'çalışıyor', notes: '' }
}
function newMaterialRow() {
  return {
    progress_item_id: '',
    material_name: '',
    quantity_used: '',
    unit: 'Adet',
    supplier: '',
    waybill_no: '',
    delivery_date: '',
    storage_location: '',
    description: '',
    reason: '',
  }
}
function newIssueRow() {
  return {
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
function newTaskRow() {
  return { description: '' }
}

const MATERIAL_META_PREFIX = '__MATERIAL_META__'
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

function materialDescription(row) {
  return encodeMeta(MATERIAL_META_PREFIX, {
    supplier: row.supplier || '',
    waybill_no: row.waybill_no || '',
    delivery_date: row.delivery_date || '',
    storage_location: row.storage_location || '',
    description: row.description || '',
  }, row.description || '')
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
    isg_notes: formData.isg_notes || '',
    incident_notes: formData.incident_notes || '',
    description: formData.notes || '',
  }, formData.notes || '')
}

function InfoTile({ label, value }) {
  return (
    <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border-md)', borderRadius: 10, padding: '10px 12px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'var(--color-muted-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>{value}</p>
    </div>
  )
}

export default function DailyReportForm({ reportId: initialReportId, onBack, onSaved, className = '' }) {
  const { user, projectId } = useAuth()
  const fileInputRef = useRef(null)

  const [openSection, setOpenSection] = useState(null) // null | 'materials' | 'photos' | 'issues'
  const [reportId, setReportId]     = useState(initialReportId || null)
  const [project, setProject]       = useState(null)
  const [resolvedProjectId, setResolvedProjectId] = useState(null)
  const [preparedBy, setPreparedBy] = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [toast, setToast]           = useState('')

  // Step 1
  const [formData, setFormData] = useState({
    report_date:    todayStr(),
    weather:        'açık',
    weather_note:   '',
    general_status: 'normal',
    worker_count:   0,
    isg_notes:      '',
    incident_notes: '',
    notes:          '',
  })

  // Step 2
  const [personnel, setPersonnel]   = useState(initPersonnel)
  const [machinery, setMachinery]   = useState(initMachinery)

  // Step 3
  const [progressItems, setProgressItems] = useState([])
  const [todayQty, setTodayQty]           = useState({})
  const [itemNotes, setItemNotes]         = useState({})
  const [existingQtys, setExistingQtys]   = useState({})
  const [doneTasks, setDoneTasks]         = useState([newTaskRow()])
  const [plannedTasks, setPlannedTasks]   = useState([newTaskRow()])

  // Step 4
  const [materials, setMaterials] = useState([newMaterialRow()])

  // Step 5 - Photos
  const [photos, setPhotos]             = useState([]) // { file, caption, preview }
  const [existingPhotos, setExistingPhotos] = useState([])

  // Step 5 - Issues
  const [issues, setIssues] = useState([newIssueRow()])

  const [alreadyExists, setAlreadyExists] = useState(false)
  const weatherCity = project?.location?.split('/')?.[0]?.trim() || null
  const liveWeather = useWeather(weatherCity)

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    // alreadyExists true ise formda yüklenmiş gerçek bir rapor var — canlı hava
    // durumu onun weather alanının üzerine yazmamalı (aksi halde tarih değişince
    // yüklenen geçmiş rapor, o günün havasıyla değil bugünün canlı havasıyla görünür).
    if (!initialReportId && !alreadyExists && liveWeather.current?.label) {
      const weatherNote = formatWeatherNote(liveWeather.current)
      setFormData(f => ({
        ...f,
        weather: normalizeWeather(liveWeather.current.label),
        weather_note: f.weather_note || weatherNote,
      }))
    }
  }, [
    initialReportId,
    alreadyExists,
    liveWeather.current?.label,
    liveWeather.current?.temp,
    liveWeather.current?.wind,
    liveWeather.current?.humidity,
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
    // Personnel/machinery/progress/materials/photos/issues get_daily_report_detail RPC'sinden
    // tek çağrıyla gelir (mevcut RPC, ayrı ayrı 7 supabase.from() sorgusuyla aynı veriyi döner).
    // daily_tasks bu RPC'nin dönüşünde henüz yok, o yüzden ayrı sorgulanıyor.
    const [detailRes, taskRes] = await Promise.all([
      supabase.rpc('get_daily_report_detail', { p_report_id: id }),
      supabase.from('daily_tasks').select('*').eq('report_id', id).order('order_index'),
    ])

    if (seq !== undefined && seq !== dateCheckSeqRef.current) return // daha yeni bir tarih değişikliği bunu geçersiz kıldı

    const detail = detailRes.data?.authorized ? detailRes.data : null

    if (detail?.report) {
      const r = detail.report
      const reportNotes = decodeMeta(REPORT_NOTES_META_PREFIX, r.notes)
      setFormData({
        report_date:    r.report_date || todayStr(),
        weather:        normalizeWeather(r.weather || 'açık'),
        weather_note:   r.weather_note   || '',
        general_status: r.general_status || 'normal',
        worker_count:   r.worker_count   || 0,
        isg_notes:      reportNotes.isg_notes || '',
        incident_notes: reportNotes.incident_notes || '',
        notes:          reportNotes.description || '',
      })
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

    // Progress qtys
    const eQtys = {}
    ;(detail?.progress || []).forEach(e => { eQtys[e.item_id] = Number(e.qty_added) || 0 })
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

    // Materials
    const matRows = detail?.materials || []
    if (matRows.length > 0) {
      setMaterials(matRows.map(m => {
        const meta = decodeMeta(MATERIAL_META_PREFIX, m.description)
        return {
          progress_item_id: m.progress_item_id || '',
          material_name:    m.material_name    || '',
          quantity_used:    m.quantity_used     || '',
          unit:             m.unit              || 'Adet',
          supplier:         meta.supplier       || '',
          waybill_no:       meta.waybill_no     || '',
          delivery_date:    meta.delivery_date  || '',
          storage_location: meta.storage_location || '',
          description:      meta.description    || '',
          reason:           m.reason            || '',
        }
      }))
    } else {
      setMaterials([newMaterialRow()])
    }

    // Existing photos
    setExistingPhotos(detail?.photos || [])

    // Issues
    const issueRows = detail?.issues || []
    if (issueRows.length > 0) {
      setIssues(issueRows.map(i => {
        const meta = decodeMeta(ISSUE_META_PREFIX, i.description)
        return {
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
  }

  // Seçilen tarih için hiç rapor yoksa formu o tarihle boşa döner.
  function resetToBlank(date) {
    photos.forEach(p => URL.revokeObjectURL(p.preview))
    setFormData({
      report_date:    date,
      weather:        'açık',
      weather_note:   '',
      general_status: 'normal',
      worker_count:   0,
      isg_notes:      '',
      incident_notes: '',
      notes:          '',
    })
    setPersonnel(initPersonnel())
    setMachinery(initMachinery())
    setExistingQtys({})
    setTodayQty({})
    setDoneTasks([newTaskRow()])
    setPlannedTasks([newTaskRow()])
    setMaterials([newMaterialRow()])
    setPhotos([])
    setExistingPhotos([])
    setIssues([newIssueRow()])
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
      resetToBlank(date)
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

      const [itemsRes] = await Promise.all([
        supabase.from('progress_items')
          .select('id, name, unit, target_qty, total_progress, category, order_index')
          .eq('project_id', effectiveProjectId)
          .order('order_index'),
      ])
      setProgressItems(itemsRes.data || [])

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

  // Material helpers
  function updateMaterial(i, field, val) {
    setMaterials(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }
  function addMaterialRow()    { setMaterials(prev => [...prev, newMaterialRow()]) }
  function removeMaterialRow(i){ setMaterials(prev => prev.filter((_, idx) => idx !== i)) }

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

  async function handleSave() {
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
          progressRows.push({ item_id: item.id, qty_added: newQty, note: itemNotes[item.id] || null })
        }
      }

      const validMats = materials.filter(r => r.material_name).map(r => ({
        progress_item_id: r.progress_item_id || null,
        material_name:    r.material_name,
        quantity_used:    Number(r.quantity_used) || 0,
        unit:             r.unit || 'Adet',
        description:      materialDescription(r) || null,
        reason:           r.reason || null,
      }))

      const validIssues = issues.filter(r => r.topic).map(r => ({
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
        p_progress:       progressRows,
        p_daily_tasks:    taskRows,
        p_materials:      validMats,
        p_issues:         validIssues,
      })
      if (saveErr) throw saveErr
      setReportId(rid)

      // Fotoğraflar: Storage API'ye Postgres fonksiyonundan erişilemediği için
      // yükleme + kayıt istemci tarafında ayrı kalır.
      for (const photo of photos) {
        const safeName = photo.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${effectiveProjectId}/${formData.report_date}/${Date.now()}_${safeName}`
        const { error: uploadErr } = await supabase.storage.from('saha-fotolari').upload(path, photo.file)
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

  // ─── Grouped progress items ───────────────────────────────────────────────
  const groupedItems = {}
  progressItems.forEach(item => {
    const cat = item.category || 'diğer'
    if (!groupedItems[cat]) groupedItems[cat] = []
    groupedItems[cat].push(item)
  })

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted-light)', fontSize: 14 }}>
        Yükleniyor…
      </div>
    )
  }

  return (
    <div className={className} style={{ fontFamily: 'inherit' }}>

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

      {/* Header bar */}
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16,
        padding: '14px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap',
        boxShadow: 'var(--shadow-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={BTN_GHOST}>← Geri</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
              {initialReportId ? 'Raporu Düzenle' : 'Yeni Günlük Rapor'}
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-muted-light)' }}>
              {new Date(formData.report_date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {alreadyExists && !initialReportId && (
            <div style={{
              background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', borderRadius: 8,
              padding: '6px 12px', fontSize: 12, fontWeight: 600,
            }}>
              ⚠ Bu tarih için rapor zaten mevcut — düzenleniyor
            </div>
          )}
          <button onClick={handleSave} disabled={saving} className="desk-only" style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Kaydediliyor…' : '💾 Kaydet'}
          </button>
        </div>
      </div>

      {/* Genel + Personel */}
      <div className="ss-bottom-grid" style={{ marginBottom: 16 }}>
        <div style={CARD}>
          <h3 style={CARD_TITLE}>Genel</h3>
          <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}>
              <InfoTile label="Rapor Tarihi" value={new Date(formData.report_date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
              <InfoTile label="Hazırlayan" value={preparedBy || '—'} />
              <InfoTile label="Proje" value={project?.name || projectId || '—'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>

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
                <select value={formData.weather} onChange={e => setFormData(f => ({ ...f, weather: e.target.value }))} style={INPUT}>
                  {WEATHER_OPTIONS.map(w => <option key={w}>{w}</option>)}
                </select>
              </div>

              <div>
                <label style={LABEL}>Genel Durum</label>
                <select value={formData.general_status} onChange={e => setFormData(f => ({ ...f, general_status: e.target.value }))} style={INPUT}>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label style={LABEL}>Toplam Çalışan Sayısı</label>
                <input
                  type="number" min={0}
                  value={formData.worker_count}
                  onChange={e => setFormData(f => ({ ...f, worker_count: parseInt(e.target.value) || 0 }))}
                  style={INPUT}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Hava Durumu Notu (opsiyonel)</label>
                <input type="text" value={formData.weather_note} onChange={e => setFormData(f => ({ ...f, weather_note: e.target.value }))} placeholder="Hava durumu hakkında ek not..." style={INPUT} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>İSG Notları (opsiyonel)</label>
                <textarea
                  value={formData.isg_notes}
                  onChange={e => setFormData(f => ({ ...f, isg_notes: e.target.value }))}
                  placeholder="İSG gözlemleri, toolbox, uygunsuzluk veya tedbir notları..."
                  rows={2}
                  style={{ ...INPUT, resize: 'vertical' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Olağandışı Olay / Şantiye Ziyareti (opsiyonel)</label>
                <textarea
                  value={formData.incident_notes}
                  onChange={e => setFormData(f => ({ ...f, incident_notes: e.target.value }))}
                  placeholder="Olağandışı durum, ziyaret, denetim veya saha notu..."
                  rows={2}
                  style={{ ...INPUT, resize: 'vertical' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={LABEL}>Genel Notlar</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Bugün yapılan işler, önemli gelişmeler, genel değerlendirme..."
                  rows={4}
                  style={{ ...INPUT, resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

        <div style={CARD}>
          <h3 style={CARD_TITLE}>Personel</h3>
          <p style={SECTION_LABEL}>Personel Durumu</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
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
        </div>
      </div>

      {/* Makine + İlerleme */}
      <div className="ss-bottom-grid" style={{ marginBottom: 16 }}>
        <div style={CARD}>
          <h3 style={CARD_TITLE}>Makine</h3>
          <p style={SECTION_LABEL}>İş Makineleri / Ekipman</p>
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
                        <select value={normalizeMachineType(row.machine_type)} onChange={e => updateMachinery(i, 'machine_type', e.target.value)} style={{ ...INPUT, padding: '5px 8px' }}>
                          <option value="">Makine seçin</option>
                          {MACHINERY_PRESETS.map(type => (
                            <option key={type} value={type}>{MACHINE_LABELS[type] || type}</option>
                          ))}
                        </select>
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
                          {MACH_STATUS.map(s => <option key={s}>{s}</option>)}
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
            <button onClick={addMachineryRow} style={{ ...BTN_GHOST, marginTop: 10 }}>+ Satır Ekle</button>
        </div>

        <div style={CARD}>
          <h3 style={CARD_TITLE}>İlerleme</h3>
          <p style={{ margin: '-6px 0 14px', fontSize: 11, color: 'var(--color-muted-light)' }}>Yüzde sistem tarafından hesaplanır — girilmez.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 22 }}>
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

            {progressItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-muted-light)' }}>
                <p style={{ fontSize: 32, margin: '0 0 12px' }}>📋</p>
                <p style={{ fontSize: 14, fontWeight: 600 }}>Bu projeye henüz iş kalemi tanımlanmamış</p>
                <p style={{ fontSize: 12 }}>Proje yöneticisi iş kalemlerini tanımladıktan sonra bu bölüm aktif olacak.</p>
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-muted-light)' }}>Bugün tamamlanan miktarları girin. Yalnızca miktar girilen kalemler kaydedilir.</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 680 }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, textAlign: 'left' }}>İş Kalemi</th>
                        <th style={{ ...TH, width: 50 }}>Birim</th>
                        <th style={{ ...TH, width: 80 }}>Hedef</th>
                        <th style={{ ...TH, width: 80 }}>Toplam</th>
                        <th style={{ ...TH, width: 90 }}>Bugün</th>
                        <th style={{ ...TH, width: 90 }}>Kümülatif</th>
                        <th style={{ ...TH, width: 60 }}>%</th>
                        <th style={TH}>Not</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(groupedItems).map(([cat, items]) => (
                        <>
                          <tr key={`cat-${cat}`}>
                            <td colSpan={8} style={{
                              padding: '8px 10px',
                              background: CATEGORY_COLORS[cat] || 'var(--color-muted-light)',
                              color: 'var(--color-surface)', fontSize: 11, fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.5px',
                            }}>
                              {CATEGORY_LABELS[cat] || cat}
                            </td>
                          </tr>
                          {items.map(item => {
                            const existQty = Number(existingQtys[item.id]) || 0
                            const prevTotal = Math.max(0, (Number(item.total_progress) || 0) - existQty)
                            const todayVal  = Number(todayQty[item.id]) || 0
                            const cumulative = prevTotal + todayVal
                            const target = Number(item.target_qty) || 0
                            const pct = target > 0 ? Math.min(100, (cumulative / target * 100)).toFixed(1) : '—'
                            const isOver = target > 0 && cumulative > target

                            return (
                              <tr key={item.id} style={{ background: isOver ? 'var(--color-danger-bg)' : undefined }}>
                                <td style={{ ...TD, textAlign: 'left', color: 'var(--color-text)', fontWeight: 500 }}>{item.name}</td>
                                <td style={{ ...TD, color: 'var(--color-muted)' }}>{item.unit}</td>
                                <td style={{ ...TD, color: 'var(--color-muted)' }}>{target}</td>
                                <td style={{ ...TD, color: 'var(--color-muted)' }}>{prevTotal.toFixed(1)}</td>
                                <td style={TD}>
                                  <input
                                    type="number" min={0} step="0.01"
                                    value={todayQty[item.id] || ''}
                                    onChange={e => setTodayQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    style={{ ...NUM_INPUT, width: 72, borderColor: isOver ? 'var(--color-danger)' : undefined }}
                                    placeholder="0"
                                  />
                                </td>
                                <td style={{ ...TD, fontWeight: 600, color: isOver ? 'var(--color-danger)' : 'var(--color-text)' }}>
                                  {cumulative.toFixed(1)}
                                </td>
                                <td style={{
                                  ...TD, fontWeight: 600,
                                  color: Number(pct) >= 100 ? 'var(--color-success)' : Number(pct) >= 50 ? 'var(--color-primary)' : 'var(--color-muted-light)',
                                }}>
                                  {pct !== '—' ? `${pct}%` : '—'}
                                </td>
                                <td style={TD}>
                                  <input
                                    type="text"
                                    value={itemNotes[item.id] || ''}
                                    onChange={e => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    placeholder={isOver ? 'Aşma sebebi...' : 'Not...'}
                                    style={{ ...INPUT, padding: '4px 7px', fontSize: 11, borderColor: isOver && !itemNotes[item.id] ? 'var(--color-danger)' : undefined }}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* 3 aksiyon kartı */}
      <div className="gr-action-tiles" style={{ marginBottom: 90 }}>
        <button type="button" className="gr-action-tile" onClick={() => setOpenSection('photos')}>
          {(existingPhotos.length + photos.length) > 0 && (
            <span className="gr-action-tile-badge">{existingPhotos.length + photos.length}</span>
          )}
          <span className="gr-action-tile-icon">📷</span>
          <span className="gr-action-tile-label">Fotoğraf Ekle</span>
        </button>
        <button type="button" className="gr-action-tile" onClick={() => setOpenSection('issues')}>
          {issues.filter(r => r.topic).length > 0 && (
            <span className="gr-action-tile-badge">{issues.filter(r => r.topic).length}</span>
          )}
          <span className="gr-action-tile-icon">⚠️</span>
          <span className="gr-action-tile-label">Sorun/Not Kaydı</span>
        </button>
        <button type="button" className="gr-action-tile" onClick={() => setOpenSection('materials')}>
          {materials.filter(r => r.material_name).length > 0 && (
            <span className="gr-action-tile-badge">{materials.filter(r => r.material_name).length}</span>
          )}
          <span className="gr-action-tile-icon">📦</span>
          <span className="gr-action-tile-label">Malzeme Kullanımı</span>
        </button>
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '0 0 16px' }}>{error}</p>
      )}

      {/* Mobil sticky Kaydet */}
      <div className="mob-only" style={{ position: 'sticky', bottom: 0, paddingTop: 10, paddingBottom: 10, background: 'var(--color-bg)' }}>
        <button onClick={handleSave} disabled={saving} style={{ ...BTN_PRIMARY, width: '100%', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Kaydediliyor…' : '💾 Kaydet'}
        </button>
      </div>

      {/* Malzeme Kullanımı modalı */}
      {openSection === 'materials' && (
        <div style={MODAL_OVERLAY} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenSection(null) }}>
          <div style={MODAL_BOX} onMouseDown={(e) => e.stopPropagation()}>
            <div style={MODAL_HEADER}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Malzeme Kullanımı</h3>
              <button onClick={() => setOpenSection(null)} style={BTN_GHOST}>Kapat</button>
            </div>
            <div style={MODAL_BODY}>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-muted-light)' }}>Sahada kullanılan malzemeleri kaydedin.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 1120 }}>
                <thead>
                  <tr>
                    <th style={TH}>İş Kalemi (opsiyonel)</th>
                    <th style={TH}>Malzeme Adı</th>
                    <th style={TH}>Tedarikçi</th>
                    <th style={{ ...TH, width: 80 }}>Miktar</th>
                    <th style={{ ...TH, width: 80 }}>Birim</th>
                    <th style={TH}>İrsaliye</th>
                    <th style={{ ...TH, width: 130 }}>Teslim Tarihi</th>
                    <th style={TH}>Depolama Yeri</th>
                    <th style={TH}>Açıklama</th>
                    <th style={TH}>Sebep</th>
                    <th style={{ ...TH, width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((row, i) => (
                    <tr key={i}>
                      <td style={TD}>
                        <select value={row.progress_item_id} onChange={e => updateMaterial(i, 'progress_item_id', e.target.value)} style={{ ...INPUT, padding: '5px 8px', fontSize: 11 }}>
                          <option value="">— Seç —</option>
                          {progressItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.material_name} onChange={e => updateMaterial(i, 'material_name', e.target.value)} placeholder="Malzeme adı..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.supplier} onChange={e => updateMaterial(i, 'supplier', e.target.value)} placeholder="Tedarikçi..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="number" min={0} step="0.01" value={row.quantity_used} onChange={e => updateMaterial(i, 'quantity_used', e.target.value)} style={NUM_INPUT} />
                      </td>
                      <td style={TD}>
                        <select value={row.unit} onChange={e => updateMaterial(i, 'unit', e.target.value)} style={{ ...INPUT, padding: '5px 8px' }}>
                          {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.waybill_no} onChange={e => updateMaterial(i, 'waybill_no', e.target.value)} placeholder="İrsaliye no..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="date" value={row.delivery_date} onChange={e => updateMaterial(i, 'delivery_date', e.target.value)} style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.storage_location} onChange={e => updateMaterial(i, 'storage_location', e.target.value)} placeholder="Depo/saha..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.description} onChange={e => updateMaterial(i, 'description', e.target.value)} placeholder="Açıklama..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.reason} onChange={e => updateMaterial(i, 'reason', e.target.value)} placeholder="Fazla/eksik sebebi..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <button onClick={() => removeMaterialRow(i)} style={BTN_REMOVE} title="Sil">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addMaterialRow} style={{ ...BTN_GHOST, marginTop: 10 }}>+ Satır Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* Fotoğraf modalı */}
      {openSection === 'photos' && (
        <div style={MODAL_OVERLAY} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenSection(null) }}>
          <div style={MODAL_BOX} onMouseDown={(e) => e.stopPropagation()}>
            <div style={MODAL_HEADER}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Saha Fotoğrafları</h3>
              <button onClick={() => setOpenSection(null)} style={BTN_GHOST}>Kapat</button>
            </div>
            <div style={MODAL_BODY}>

            {/* Existing photos (edit mode) */}
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

            {/* New photo upload */}
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current?.click()} style={{ ...BTN_GHOST, marginBottom: 12, minHeight: 44 }}>
              📷 Fotoğraf Seç
            </button>

            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
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
          </div>
        </div>
      )}

      {/* Sorun/Not Kaydı modalı */}
      {openSection === 'issues' && (
        <div style={MODAL_OVERLAY} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenSection(null) }}>
          <div style={MODAL_BOX} onMouseDown={(e) => e.stopPropagation()}>
            <div style={MODAL_HEADER}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Sorunlar / Blokerlar</h3>
              <button onClick={() => setOpenSection(null)} style={BTN_GHOST}>Kapat</button>
            </div>
            <div style={MODAL_BODY}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 980 }}>
                <thead>
                  <tr>
                    <th style={TH}>Konu</th>
                    <th style={TH}>Kategori</th>
                    <th style={{ ...TH, width: 100 }}>Öncelik</th>
                    <th style={TH}>İlgili Kişi</th>
                    <th style={TH}>Açıklama</th>
                    <th style={{ ...TH, width: 110 }}>Çözüm Durumu</th>
                    <th style={{ ...TH, width: 130 }}>Kapanış Tarihi</th>
                    <th style={TH}>Not</th>
                    <th style={{ ...TH, width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((row, i) => (
                    <tr key={i}>
                      <td style={TD}>
                        <input type="text" value={row.topic} onChange={e => updateIssue(i, 'topic', e.target.value)} placeholder="Sorun konusu..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.category} onChange={e => updateIssue(i, 'category', e.target.value)} placeholder="Kategori..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <select value={row.priority} onChange={e => updateIssue(i, 'priority', e.target.value)} style={{ ...INPUT, padding: '5px 8px' }}>
                          {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.assigned_to} onChange={e => updateIssue(i, 'assigned_to', e.target.value)} placeholder="İlgili kişi..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.description} onChange={e => updateIssue(i, 'description', e.target.value)} placeholder="Açıklama..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <select value={row.resolution_status} onChange={e => updateIssue(i, 'resolution_status', e.target.value)} style={{ ...INPUT, padding: '5px 8px' }}>
                          {RESOLUTION_OPTIONS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={TD}>
                        <input type="date" value={row.closed_at} onChange={e => updateIssue(i, 'closed_at', e.target.value)} style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <input type="text" value={row.notes} onChange={e => updateIssue(i, 'notes', e.target.value)} placeholder="Not..." style={{ ...INPUT, padding: '5px 8px' }} />
                      </td>
                      <td style={TD}>
                        <button onClick={() => removeIssueRow(i)} style={BTN_REMOVE} title="Sil">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addIssueRow} style={{ ...BTN_GHOST, marginTop: 10 }}>+ Sorun Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CARD = { background: 'var(--color-surface)', border: '1px solid var(--color-border-md)', borderRadius: 12, padding: '1rem 1.25rem' }
const CARD_TITLE = { margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }
const SECTION_LABEL = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }

const LABEL = { fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 5 }
const INPUT = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border-md)', borderRadius: 8,
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--color-surface)',
}
const TH = { padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', background: 'var(--color-border)', border: '1px solid var(--color-border-md)', whiteSpace: 'nowrap' }
const TD = { padding: '6px 8px', textAlign: 'center', border: '1px solid var(--color-border-md)' }
const NUM_INPUT = { width: 64, textAlign: 'center', border: '1px solid var(--color-border-md)', borderRadius: 6, padding: '5px 6px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const BTN_PRIMARY   = { background: 'var(--color-primary)', color: 'var(--color-surface)', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }
const BTN_GHOST     = { background: 'none', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const MODAL_OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.48)', zIndex: 1100,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
}
const MODAL_BOX = {
  background: 'var(--color-surface)', borderRadius: 16, width: 'min(920px, 96vw)',
  maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
}
const MODAL_HEADER = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
}
const MODAL_BODY = { padding: '18px 20px', overflowY: 'auto' }
const BTN_REMOVE    = { background: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }
