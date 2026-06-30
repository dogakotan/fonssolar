import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useWeather } from '../../hooks/useWeather'
import { resolveProjectByAssignedId } from '../../utils/projectResolver'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STEPS = [
  { id: 1, label: 'Genel Bilgiler' },
  { id: 2, label: 'Ekip & Makine' },
  { id: 3, label: 'İmalat İlerlemesi' },
  { id: 4, label: 'Malzeme Kullanımı' },
  { id: 5, label: 'Fotoğraflar & Sorunlar' },
]

const WEATHER_OPTIONS = ['açık', 'parçalı bulutlu', 'bulutlu', 'yağmurlu', 'karlı', 'fırtınalı']
const STATUS_OPTIONS  = ['iyi', 'normal', 'sorunlu']
const SHIFTS          = ['mühendis', 'usta', 'işçi']
const DEPARTMENTS     = ['idari', 'mekanik', 'elektrik', 'yevmiyeci']
const SHIFT_LABELS    = { mühendis: 'Mühendis', usta: 'Usta', işçi: 'İşçi' }
const DEPT_LABELS     = { idari: 'İdari', mekanik: 'Mekanik', elektrik: 'Elektrik', yevmiyeci: 'Yevmiyeci' }
const MACH_STATUS     = ['çalışıyor', 'bekliyor', 'arızalı']
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
const RESOLUTION_OPTIONS = ['açık', 'devam', 'çözüldü']

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
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.4 }}>{value}</p>
    </div>
  )
}

export default function DailyReportForm({ reportId: initialReportId, onBack, onSaved, className = '' }) {
  const { user, projectId } = useAuth()
  const fileInputRef = useRef(null)

  const [step, setStep]             = useState(1)
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
    if (!initialReportId && liveWeather.current?.label) {
      const weatherNote = formatWeatherNote(liveWeather.current)
      setFormData(f => ({
        ...f,
        weather: normalizeWeather(liveWeather.current.label),
        weather_note: f.weather_note || weatherNote,
      }))
    }
  }, [
    initialReportId,
    liveWeather.current?.label,
    liveWeather.current?.temp,
    liveWeather.current?.wind,
    liveWeather.current?.humidity,
  ])

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
        // Edit mode — load existing report
        const [repRes, persRes, machRes, progRes, taskRes, matRes, photoRes, issueRes] = await Promise.all([
          supabase.from('daily_reports').select('*').eq('id', initialReportId).single(),
          supabase.from('personnel_log_entries').select('*').eq('report_id', initialReportId),
          supabase.from('machinery_logs').select('*').eq('report_id', initialReportId),
          supabase.from('progress_daily').select('*').eq('report_id', initialReportId),
          supabase.from('daily_tasks').select('*').eq('report_id', initialReportId).order('order_index'),
          supabase.from('daily_report_material_usage').select('*').eq('report_id', initialReportId),
          supabase.from('daily_report_photos').select('*').eq('report_id', initialReportId),
          supabase.from('daily_report_issues').select('*').eq('report_id', initialReportId),
        ])

        if (repRes.data) {
          const r = repRes.data
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

        // Populate personnel from personnel_log_entries
        if (persRes.data && persRes.data.length > 0) {
          const pRows = initPersonnel()
          persRes.data.forEach(e => {
            const row = pRows.find(r => r.shift === e.shift)
            if (row && DEPARTMENTS.includes(e.department)) row[e.department] = e.count || 0
          })
          setPersonnel(pRows)
        }

        // Machinery
        if (machRes.data && machRes.data.length > 0) {
          const presetRows = initMachinery()
          const customRows = []
          machRes.data.forEach(m => {
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
        }

        // Progress qtys
        const eQtys = {}
        ;(progRes.data || []).forEach(e => { eQtys[e.item_id] = Number(e.qty_added) || 0 })
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
        if (matRes.data && matRes.data.length > 0) {
          setMaterials(matRes.data.map(m => {
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
        }

        // Existing photos
        setExistingPhotos(photoRes.data || [])

        // Issues
        if (issueRes.data && issueRes.data.length > 0) {
          setIssues(issueRes.data.map(i => {
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
        }

      } else {
        // Create mode — check if today's report already exists
        const { data: existing } = await supabase
          .from('daily_reports')
          .select('id')
          .eq('project_id', effectiveProjectId)
          .eq('report_date', todayStr())
          .maybeSingle()

        if (existing) {
          setAlreadyExists(true)
          setReportId(existing.id)
        } else if (effectiveProjectId !== projectId) {
          const { data: legacy } = await supabase
            .from('daily_reports')
            .select('id')
            .eq('project_id', projectId)
            .eq('report_date', todayStr())
            .maybeSingle()

          if (legacy) {
            setAlreadyExists(true)
            setReportId(legacy.id)
          }
        }
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

  // Step navigation
  function goNext() { setStep(s => Math.min(5, s + 1)) }
  function goBack() { setStep(s => Math.max(1, s - 1)) }

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

      // 1. Upsert daily_reports
      const { data: rep, error: repErr } = await supabase
        .from('daily_reports')
        .upsert({
          project_id:     effectiveProjectId,
          created_by:     user?.id,
          report_date:    formData.report_date,
          weather:        formData.weather,
          weather_note:   formData.weather_note  || null,
          general_status: formData.general_status,
          worker_count:   totalPersonnel,
          notes:          reportNotesPayload(formData) || null,
          updated_at:     new Date().toISOString(),
        }, { onConflict: 'project_id,report_date' })
        .select('id').single()

      if (repErr) throw repErr
      const rid = rep.id
      setReportId(rid)

      // 2. Personnel
      const { error: persDeleteErr } = await supabase.from('personnel_log_entries').delete().eq('report_id', rid)
      if (persDeleteErr) throw persDeleteErr
      const persRows = []
      personnel.forEach(row => {
        DEPARTMENTS.forEach(dept => {
          if (Number(row[dept]) > 0) {
            persRows.push({ report_id: rid, shift: row.shift, department: dept, count: Number(row[dept]) })
          }
        })
      })
      if (persRows.length) {
        const { error: persInsertErr } = await supabase.from('personnel_log_entries').insert(persRows)
        if (persInsertErr) throw persInsertErr
      }

      // 3. Machinery
      const { error: machDeleteErr } = await supabase.from('machinery_logs').delete().eq('report_id', rid)
      if (machDeleteErr) throw machDeleteErr
      const validMach = machinery
        .map(r => ({ ...r, machine_type: normalizeMachineType(r.machine_type) }))
        .filter(r => r.machine_type && Number(r.count) > 0)
      if (validMach.length) {
        const { error: machInsertErr } = await supabase.from('machinery_logs').insert(
          validMach.map(r => ({ report_id: rid, machine_type: r.machine_type, count: Number(r.count), status: r.status, notes: r.notes || null }))
        )
        if (machInsertErr) throw machInsertErr
      }

      // 4. Daily tasks
      const { error: taskDeleteErr } = await supabase.from('daily_tasks').delete().eq('report_id', rid)
      if (taskDeleteErr) throw taskDeleteErr
      const taskRows = [
        ...doneTasks
          .filter(r => String(r.description || '').trim())
          .map((r, index) => ({ report_id: rid, type: 'tamamlandı', description: r.description.trim(), order_index: index })),
        ...plannedTasks
          .filter(r => String(r.description || '').trim())
          .map((r, index) => ({ report_id: rid, type: 'planlandı', description: r.description.trim(), order_index: index })),
      ]
      if (taskRows.length) {
        const { error: taskInsertErr } = await supabase.from('daily_tasks').insert(taskRows)
        if (taskInsertErr) throw taskInsertErr
      }

      // 5. Progress items
      const { error: progressDeleteErr } = await supabase.from('progress_daily').delete().eq('report_id', rid)
      if (progressDeleteErr) throw progressDeleteErr
      const toInsert = []
      for (const item of progressItems) {
        const newQty = Number(todayQty[item.id]) || 0
        const oldQty = Number(existingQtys[item.id]) || 0
        const diff   = newQty - oldQty
        if (newQty > 0) {
          toInsert.push({ report_id: rid, item_id: item.id, qty_added: newQty, note: itemNotes[item.id] || null })
        }
        if (diff !== 0) {
          const newTotal = Math.max(0, (Number(item.total_progress) || 0) + diff)
          const { error: progressUpdateErr } = await supabase.from('progress_items').update({ total_progress: newTotal }).eq('id', item.id)
          if (progressUpdateErr) throw progressUpdateErr
        }
      }
      if (toInsert.length) {
        const { error: progressInsertErr } = await supabase.from('progress_daily').insert(toInsert)
        if (progressInsertErr) throw progressInsertErr
      }

      // 6. Materials
      const { error: matDeleteErr } = await supabase.from('daily_report_material_usage').delete().eq('report_id', rid)
      if (matDeleteErr) throw matDeleteErr
      const validMats = materials.filter(r => r.material_name)
      if (validMats.length) {
        const { error: matInsertErr } = await supabase.from('daily_report_material_usage').insert(
          validMats.map(r => ({
            report_id:       rid,
            project_id:      effectiveProjectId,
            progress_item_id: r.progress_item_id || null,
            material_name:   r.material_name,
            quantity_used:   Number(r.quantity_used) || 0,
            unit:            r.unit || 'Adet',
            description:     materialDescription(r) || null,
            reason:          r.reason || null,
          }))
        )
        if (matInsertErr) throw matInsertErr
      }

      // 7. Photos
      for (const photo of photos) {
        const safeName = photo.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${effectiveProjectId}/${formData.report_date}/${Date.now()}_${safeName}`
        const { error: uploadErr } = await supabase.storage.from('saha-fotolari').upload(path, photo.file)
        if (uploadErr) throw uploadErr
        if (!uploadErr) {
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
      }

      // 8. Issues
      const { error: issueDeleteErr } = await supabase.from('daily_report_issues').delete().eq('report_id', rid)
      if (issueDeleteErr) throw issueDeleteErr
      const validIssues = issues.filter(r => r.topic)
      if (validIssues.length) {
        const { error: issueInsertErr } = await supabase.from('daily_report_issues').insert(
          validIssues.map(r => ({
            report_id:         rid,
            project_id:        effectiveProjectId,
            topic:             r.topic,
            priority:          r.priority,
            assigned_to:       r.assigned_to || null,
            description:       issueDescription(r) || null,
            resolution_status: r.resolution_status,
          }))
        )
        if (issueInsertErr) throw issueInsertErr
      }

      showToast('Rapor kaydedildi ✓')
      setTimeout(() => onSaved?.(), 900)

    } catch (e) {
      setError(e.message || 'Kayıt sırasında hata oluştu.')
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
      <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
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
          background: '#D1FAE5', color: '#065F46', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.12)',
        }}>
          {toast}
        </div>
      )}

      {/* Header bar */}
      <div style={{
        background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
        padding: '14px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={BTN_GHOST}>← Geri</button>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              {initialReportId ? 'Raporu Düzenle' : 'Yeni Günlük Rapor'}
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              {new Date(formData.report_date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        {alreadyExists && !initialReportId && (
          <div style={{
            background: '#FEF3C7', color: '#92400E', borderRadius: 8,
            padding: '6px 12px', fontSize: 12, fontWeight: 600,
          }}>
            ⚠ Bu tarih için rapor zaten mevcut — düzenleniyor
          </div>
        )}
      </div>

      {/* Step indicator */}
      <div style={{
        background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
        padding: '16px 20px', marginBottom: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
        overflowX: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 400 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? '1' : undefined }}>
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: step > s.id ? 'pointer' : 'default' }}
                onClick={() => { if (step > s.id) setStep(s.id) }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: step > s.id ? '#22c55e' : step === s.id ? '#003B8E' : '#E5E7EB',
                  color: step >= s.id ? '#fff' : '#9CA3AF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {step > s.id ? '✓' : s.id}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: step === s.id ? 600 : 400,
                  color: step === s.id ? '#003B8E' : step > s.id ? '#22c55e' : '#9CA3AF',
                  whiteSpace: 'nowrap', textAlign: 'center',
                }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: step > s.id ? '#22c55e' : '#E5E7EB', margin: '0 4px', marginBottom: 20 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={{
        background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
        padding: '24px 24px', marginBottom: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>

        {/* ── Step 1: Genel Bilgiler ── */}
        {step === 1 && (
          <div>
            <h3 style={STEP_TITLE}>1. Genel Bilgiler</h3>
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
                  onChange={e => setFormData(f => ({ ...f, report_date: e.target.value }))}
                  disabled
                  style={{ ...INPUT, background: '#F9FAFB', color: '#6B7280' }}
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
        )}

        {/* ── Step 2: Ekip & Makine ── */}
        {step === 2 && (
          <div>
            <h3 style={STEP_TITLE}>2. Ekip & Makine Durumu</h3>

            {/* Personnel */}
            <p style={SECTION_LABEL}>Personel Durumu</p>
            <div style={{ overflowX: 'auto', marginBottom: 28 }}>
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
                        <td style={{ ...TD, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{SHIFT_LABELS[row.shift] || row.shift}</td>
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
                        <td style={{ ...TD, fontWeight: 700, color: '#003B8E' }}>{rowTotal}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...TD, fontWeight: 700 }}>Genel Toplam</td>
                    {DEPARTMENTS.map(dept => {
                      const colTotal = personnel.reduce((s, r) => s + (Number(r[dept]) || 0), 0)
                      return <td key={dept} style={{ ...TD, fontWeight: 700, color: '#003B8E' }}>{colTotal}</td>
                    })}
                    <td style={{ ...TD, fontWeight: 800, color: '#003B8E', background: '#EEF2FF' }}>{totalPersonnel}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Machinery */}
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
                        <select value={row.status} onChange={e => updateMachinery(i, 'status', e.target.value)} style={{ ...INPUT, padding: '5px 8px' }}>
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
        )}

        {/* ── Step 3: İmalat İlerlemesi ── */}
        {step === 3 && (
          <div>
            <h3 style={STEP_TITLE}>3. İmalat İlerlemesi</h3>

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
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>
                <p style={{ fontSize: 32, margin: '0 0 12px' }}>📋</p>
                <p style={{ fontSize: 14, fontWeight: 600 }}>Bu projeye henüz iş kalemi tanımlanmamış</p>
                <p style={{ fontSize: 12 }}>Proje yöneticisi iş kalemlerini tanımladıktan sonra bu bölüm aktif olacak.</p>
              </div>
            ) : (
              <div>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9CA3AF' }}>Bugün tamamlanan miktarları girin. Yalnızca miktar girilen kalemler kaydedilir.</p>
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
                              background: CATEGORY_COLORS[cat] || '#9CA3AF',
                              color: '#fff', fontSize: 11, fontWeight: 700,
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
                              <tr key={item.id} style={{ background: isOver ? '#FFF5F5' : undefined }}>
                                <td style={{ ...TD, textAlign: 'left', color: '#111827', fontWeight: 500 }}>{item.name}</td>
                                <td style={{ ...TD, color: '#6B7280' }}>{item.unit}</td>
                                <td style={{ ...TD, color: '#6B7280' }}>{target}</td>
                                <td style={{ ...TD, color: '#6B7280' }}>{prevTotal.toFixed(1)}</td>
                                <td style={TD}>
                                  <input
                                    type="number" min={0} step="0.01"
                                    value={todayQty[item.id] || ''}
                                    onChange={e => setTodayQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    style={{ ...NUM_INPUT, width: 72, borderColor: isOver ? '#FCA5A5' : undefined }}
                                    placeholder="0"
                                  />
                                </td>
                                <td style={{ ...TD, fontWeight: 600, color: isOver ? '#EF4444' : '#111827' }}>
                                  {cumulative.toFixed(1)}
                                </td>
                                <td style={{
                                  ...TD, fontWeight: 600,
                                  color: Number(pct) >= 100 ? '#22c55e' : Number(pct) >= 50 ? '#003B8E' : '#9CA3AF',
                                }}>
                                  {pct !== '—' ? `${pct}%` : '—'}
                                </td>
                                <td style={TD}>
                                  <input
                                    type="text"
                                    value={itemNotes[item.id] || ''}
                                    onChange={e => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    placeholder={isOver ? 'Aşma sebebi...' : 'Not...'}
                                    style={{ ...INPUT, padding: '4px 7px', fontSize: 11, borderColor: isOver && !itemNotes[item.id] ? '#FCA5A5' : undefined }}
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
        )}

        {/* ── Step 4: Malzeme Kullanımı ── */}
        {step === 4 && (
          <div>
            <h3 style={STEP_TITLE}>4. Malzeme Kullanımı</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9CA3AF' }}>Sahada kullanılan malzemeleri kaydedin.</p>
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
        )}

        {/* ── Step 5: Fotoğraflar & Sorunlar ── */}
        {step === 5 && (
          <div>
            <h3 style={STEP_TITLE}>5. Fotoğraflar & Sorunlar</h3>

            {/* Photos */}
            <p style={SECTION_LABEL}>Saha Fotoğrafları</p>

            {/* Existing photos (edit mode) */}
            {existingPhotos.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 8px' }}>Mevcut fotoğraflar:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                  {existingPhotos.map(photo => {
                    const url = supabase.storage.from('saha-fotolari').getPublicUrl(photo.storage_path).data.publicUrl
                    return (
                      <div key={photo.id} style={{ position: 'relative' }}>
                        <img src={url} alt={photo.caption || ''} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB' }} />
                        {photo.caption && <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>{photo.caption}</p>}
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
                    <img src={photo.preview} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E7EB' }} />
                    <button
                      onClick={() => removePhoto(i)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
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

            {/* Issues */}
            <p style={SECTION_LABEL}>Sorunlar / Blokerlar</p>
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
        )}
      </div>

      {/* Navigation footer */}
      <div style={{
        background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16,
        padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}>
        <div>
          {error && <p style={{ color: '#EF4444', fontSize: 12, margin: 0 }}>{error}</p>}
          {!error && <span style={{ fontSize: 12, color: '#94a3b8' }}>
            Toplam personel: <strong>{totalPersonnel}</strong> kişi
          </span>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 1 && (
            <button onClick={goBack} style={BTN_SECONDARY} disabled={saving}>← Geri</button>
          )}
          {step < 5 ? (
            <button onClick={goNext} style={BTN_PRIMARY}>İleri →</button>
          ) : (
            <button onClick={handleSave} style={BTN_PRIMARY} disabled={saving}>
              {saving ? 'Kaydediliyor…' : '💾 Raporu Kaydet'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const STEP_TITLE = { margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }
const SECTION_LABEL = { margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }

const LABEL = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 5 }
const INPUT = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #E5E7EB', borderRadius: 8,
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff',
}
const TH = { padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F9FAFB', border: '1px solid #E5E7EB', whiteSpace: 'nowrap' }
const TD = { padding: '6px 8px', textAlign: 'center', border: '1px solid #E5E7EB' }
const NUM_INPUT = { width: 64, textAlign: 'center', border: '1px solid #D1D5DB', borderRadius: 6, padding: '5px 6px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const BTN_PRIMARY   = { background: '#003B8E', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }
const BTN_SECONDARY = { background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }
const BTN_GHOST     = { background: 'none', color: '#003B8E', border: '1px solid #003B8E', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const BTN_REMOVE    = { background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 6, width: 28, height: 28, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }
