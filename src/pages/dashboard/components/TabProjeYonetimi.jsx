import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'
import { supabase } from '../../../lib/supabase'
import YeniProjeWizard from '../wizard/YeniProjeWizard'
import ProjeEditWizard from '../wizard/ProjeEditWizard'

const STATUS_LABEL = {
  aktif:          'Aktif',
  beklemede:      'Beklemede',
  'tamamlandı':   'Tamamlandı',
  'iptal edildi': 'İptal Edildi',
}

const STATUS_COLOR = {
  aktif:          { bg: '#dcfce7', color: '#166534' },
  beklemede:      { bg: '#fef9c3', color: '#854d0e' },
  'tamamlandı':   { bg: '#dbeafe', color: '#1e40af' },
  'iptal edildi': { bg: '#fee2e2', color: '#991b1b' },
}

const SUB_TABLES = [
  'project_tasks',
  'progress_items',
  'project_risks',
  'procurement_items',
  'budget_lines',
  'critical_path_items',
]

const PROJECT_DELETE_TABLES = [
  'schedule_activities', 'agent_reports', 'mechanical_checklist',
  'electrical_checklist', 'quality_inspections',
]

const CAT_MAP = {
  'Mobilizasyon':       'mobilizasyon',
  'Mekanik':            'mekanik',
  'Elektrik DC':        'elektrik_dc',
  'Elektrik AC':        'elektrik_ac',
  'Elektrik OG':        'elektrik_og',
  'Topraklama':         'topraklama',
  'ENH':                'enh',
  'Devreye Alma':       'devreye_alma',
  'Evrak Süreci':       'evrak_sureci',
  'Satın Alma':         'satin_alma',
}

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

function parseDate(v) {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().split('T')[0]
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return d.toISOString().split('T')[0]
  }
  const s = String(v).trim()
  if (!s) return null
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split('.')
    return `${y}-${m}-${d}`
  }
  return s
}

const parseNum = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return isNaN(n) ? null : n
}

const catVal = v => CAT_MAP[v] || String(v || '').toLowerCase().trim() || null

const xmlEscape = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

// Şablonun ZIP içeriğinde yalnızca veri hücrelerini değiştirir. Böylece tema,
// renk, koşullu biçimlendirme, sütun genişliği ve veri doğrulamaları korunur.
function setTemplateCell(xml, address, value) {
  const escapedAddress = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const selfClosing = new RegExp(`<c\\b[^>]*\\br="${escapedAddress}"[^>]*/>`, 'i')
  const fullCell = new RegExp(`<c\\b[^>]*\\br="${escapedAddress}"[^>]*>[\\s\\S]*?<\\/c>`, 'i')
  const existing = xml.match(fullCell)?.[0] || xml.match(selfClosing)?.[0]
  if (!existing) throw new Error(`Şablonda ${address} hücresi bulunamadı`)

  const style = existing.match(/\bs="(\d+)"/)?.[1]
  const styleAttr = style ? ` s="${style}"` : ''
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const replacement = numeric
    ? `<c r="${address}"${styleAttr}><v>${value}</v></c>`
    : `<c r="${address}"${styleAttr} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
  return xml.replace(fullCell, replacement).replace(selfClosing, replacement)
}

function fillTemplateSheet(files, sheetNumber, rows) {
  const path = `xl/worksheets/sheet${sheetNumber}.xml`
  let xml = strFromU8(files[path])
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (value !== undefined) xml = setTemplateCell(xml, `${XLSX.utils.encode_col(columnIndex)}${rowIndex + 5}`, value)
  }))
  files[path] = strToU8(xml)
}

export default function TabProjeYonetimi({ onViewProject }) {
  const [view,            setView]            = useState('list')
  const [editProject,     setEditProject]     = useState(null)
  const [projects,        setProjects]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [deleting,        setDeleting]        = useState(null)
  const [exportLoadingId, setExportLoadingId] = useState(null)

  const [importState,   setImportState]   = useState('idle')   // 'idle' | 'preview' | 'importing'
  const [importMode,    setImportMode]    = useState('duplicate') // 'duplicate' | 'overwrite'
  const [importRows,    setImportRows]    = useState([])
  const [importSubData, setImportSubData] = useState({})
  const [importError,   setImportError]   = useState(null)
  const fileInputRef = useRef(null)

  const [toast, setToast] = useState(null)
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, location, status, progress, capacity_kwp, capacity_kwe, start_date, target_date, total_days')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) { setError(err.message); return }
    setProjects(data || [])
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(project) {
    if (!window.confirm(`"${project.name}" projesini ve tüm bağlı verilerini silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.`)) return

    setDeleting(project.id)
    setError(null)

    const deleteByProject = async table => {
      const { error: err } = await supabase.from(table).delete().eq('project_id', project.id)
      if (err) throw new Error(`${table}: ${err.message}`)
    }
    const deleteByIds = async (table, column, ids) => {
      if (!ids.length) return
      const { error: err } = await supabase.from(table).delete().in(column, ids)
      if (err) throw new Error(`${table}: ${err.message}`)
    }

    try {
      const [{ data: tickets }, { data: invoices }, { data: requests }, { data: reports }] = await Promise.all([
        supabase.from('tickets').select('id').eq('project_id', project.id),
        supabase.from('invoices').select('id').eq('project_id', project.id),
        supabase.from('purchase_requests').select('id').eq('project_id', project.id),
        supabase.from('daily_reports').select('id').eq('project_id', project.id),
      ])
      const ids = rows => (rows || []).map(row => row.id)
      await deleteByIds('ticket_comments', 'ticket_id', ids(tickets))
      await deleteByIds('ticket_history', 'ticket_id', ids(tickets))
      await deleteByIds('invoice_approvals', 'invoice_id', ids(invoices))
      await deleteByIds('purchase_request_items', 'request_id', ids(requests))
      await deleteByIds('personnel_log_entries', 'report_id', ids(reports))
      await deleteByIds('machinery_logs', 'report_id', ids(reports))
      await deleteByIds('daily_tasks', 'report_id', ids(reports))
      await deleteByIds('progress_daily', 'report_id', ids(reports))
      await Promise.all(PROJECT_DELETE_TABLES.map(deleteByProject))
      await Promise.all(['tickets', 'invoices', 'purchase_requests', 'daily_reports'].map(deleteByProject))
      const { error: profileErr } = await supabase.from('profiles').update({ project_id: null }).eq('project_id', project.id)
      if (profileErr) throw new Error(`profiles: ${profileErr.message}`)
    } catch (cleanupError) {
      setDeleting(null)
      setError(`Bağlı veri silme hatası: ${cleanupError.message}`)
      return
    }

    for (const table of SUB_TABLES) {
      const { error: err } = await supabase.from(table).delete().eq('project_id', project.id)
      if (err) {
        setDeleting(null)
        setError(`Alt tablo silme hatası (${table}): ${err.message}`)
        return
      }
    }

    const { error: err } = await supabase.from('projects').delete().eq('id', project.id)
    setDeleting(null)
    if (err) { setError(`Proje silme hatası: ${err.message}`); return }
    setProjects(p => p.filter(x => x.id !== project.id))
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport(project) {
    setExportLoadingId(project.id)
    try {
      {
      // Şablonun mevcut biçimlerini koruyarak sadece veri hücrelerini doldur.
      const templateRes = await fetch('/fons-solar-proje-sablonu.xlsx', { cache: 'no-store' })
      if (!templateRes.ok) throw new Error('Excel şablonu yüklenemedi')
      const files = unzipSync(new Uint8Array(await templateRes.arrayBuffer()))
      const [{ data: proj }, { data: tasks }, { data: progressItems }, { data: risks }, { data: procurement }, { data: budget }, { data: criticalPath }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', project.id).single(),
        supabase.from('project_tasks').select('*').eq('project_id', project.id).order('task_code'),
        supabase.from('progress_items').select('*').eq('project_id', project.id).order('order_index'),
        supabase.from('project_risks').select('*').eq('project_id', project.id),
        supabase.from('procurement_items').select('*').eq('project_id', project.id).order('item_no'),
        supabase.from('budget_lines').select('*').eq('project_id', project.id).order('order_index'),
        supabase.from('critical_path_items').select('*').eq('project_id', project.id).order('path_code'),
      ])
      const p = proj || project
      const labels = { arazi_ges: 'Arazi GES', endustriyel_cati_ges: 'Endüstriyel Çatı GES', evsel_ges: 'Evsel GES' }
      const cats = { mobilizasyon: 'Mobilizasyon', mekanik: 'Mekanik', elektrik_dc: 'Elektrik DC', elektrik_ac: 'Elektrik AC', elektrik_og: 'Elektrik OG', topraklama: 'Topraklama', enh: 'ENH', devreye_alma: 'Devreye Alma', evrak_sureci: 'Evrak Süreci', satin_alma: 'Satın Alma' }
      let infoXml = strFromU8(files['xl/worksheets/sheet1.xml'])
      const put = (addr, value) => { infoXml = setTemplateCell(infoXml, addr, value) }
      ;[['E5', p.id], ['E6', p.name], ['E7', p.location], ['E8', labels[p.project_type] || p.project_type], ['E9', p.status], ['E10', p.start_date], ['E11', p.target_date], ['E15', p.capacity_kwp], ['E16', p.capacity_kwe], ['E17', p.storage_kwh], ['E20', p.panel_brand], ['J20', p.panel_count], ['E21', p.inverter_brand], ['J21', p.inverter_count], ['E22', p.battery_brand], ['J22', p.battery_power_kw], ['J23', p.battery_count]].forEach(([a, v]) => put(a, v))
      files['xl/worksheets/sheet1.xml'] = strToU8(infoXml)
      let sheetNumber = 2
      const add = (_, rows) => fillTemplateSheet(files, sheetNumber++, rows)
      add('İş Kalemleri', (tasks || []).map(t => [t.task_code, t.task_name, cats[t.category] || t.category, t.sub_category || '', t.planned_start || '', t.planned_end || '', t.duration_days || '', t.progress_pct || 0, t.status || '', t.responsible || '', t.team_size || '', t.notes || '']))
      add('İlerleme Kalemleri', (progressItems || []).map(x => [cats[x.category] || x.category, x.name, x.unit || '', x.target_qty || 0, x.total_progress || 0, x.target_qty ? +(x.total_progress / x.target_qty).toFixed(4) : 0, x.order_index || '', x.dashboard_visible ? 'Evet' : 'Hayır']))
      add('Riskler', (risks || []).map((r, i) => [i + 1, r.title || '', r.severity || '', r.probability || '', r.impact || '', (r.probability || 0) * (r.impact || 0), r.status || '', r.mitigation || '', '', '']))
      add('Tedarik', (procurement || []).map((x, i) => [i + 1, x.equipment || '', x.quantity || '', x.unit || '', x.supplier || '', '', '', x.status || '', x.order_date || '', x.expected_delivery || '', x.notes || '']))
      add('Bütçe', (budget || []).map(x => [x.category || '', x.name || '', x.planned_amount || 0, x.actual_amount || 0, '', '', '']))
      add('Kritik Yol', (criticalPath || []).map(x => [x.path_code || '', x.activity_name || '', x.planned_start || '', x.planned_end || '', '', '', x.duration_days || '', '', x.is_critical ? 'Evet' : 'Hayır', x.progress_pct || 0, '', x.notes || '']))
      const blob = new Blob([zipSync(files, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${project.id}-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showToast('Şablon formatında Excel indirildi')
      return
      }

      const today = new Date().toLocaleDateString('tr-TR')

      const [
        { data: proj },
        { data: tasks },
        { data: progressItems },
        { data: risks },
        { data: procurement },
        { data: budget },
        { data: criticalPath },
      ] = await Promise.all([
        supabase.from('projects').select('*').eq('id', project.id).single(),
        supabase.from('project_tasks').select('*').eq('project_id', project.id).order('task_code'),
        supabase.from('progress_items').select('*').eq('project_id', project.id).order('order_index'),
        supabase.from('project_risks').select('*').eq('project_id', project.id),
        supabase.from('procurement_items').select('*').eq('project_id', project.id),
        supabase.from('budget_lines').select('*').eq('project_id', project.id).order('order_index'),
        supabase.from('critical_path_items').select('*').eq('project_id', project.id).order('path_code'),
      ])

      const wb = XLSX.utils.book_new()
      const p = proj || project

      const makeSheet = (headers, rows) => {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
        ws['!cols'] = headers.map(h => ({ wch: Math.max(String(h).length + 4, 14) }))
        return ws
      }

      // 1. Proje Bilgileri — label / değer formatı
      const projeWs = XLSX.utils.aoa_to_sheet([
        ['FONS SOLAR GES DASHBOARD — PROJE RAPORU'],
        [`Oluşturma Tarihi: ${today}`],
        [],
        ['Alan', 'Değer'],
        ['Proje ID',           p.id],
        ['Proje Adı',          p.name],
        ['Konum',              p.location          || ''],
        ['Proje Türü',         p.project_type      || ''],
        ['Durum',              p.status],
        ['İlerleme (%)',       p.progress          ?? 0],
        ['DC Güç (kWp)',       p.capacity_kwp      ?? ''],
        ['AC Güç (kWe)',       p.capacity_kwe      ?? ''],
        ['Depolama (kWh)',     p.storage_kwh       ?? ''],
        ['Başlangıç',          p.start_date        || ''],
        ['Hedef Bitiş',        p.target_date       || ''],
        ['Toplam Gün',         p.total_days        ?? ''],
        ['Panel Markası',      p.panel_brand       || ''],
        ['Panel Sayısı',       p.panel_count       ?? ''],
        ['İnvertör Markası',   p.inverter_brand    || ''],
        ['İnvertör Sayısı',    p.inverter_count    ?? ''],
        ['Batarya Markası',    p.battery_brand     || ''],
        ['Batarya Gücü (kW)',  p.battery_power_kw  ?? ''],
        ['Batarya Adedi',      p.battery_count     ?? ''],
      ])
      projeWs['!cols'] = [{ wch: 22 }, { wch: 40 }]
      XLSX.utils.book_append_sheet(wb, projeWs, 'Proje Bilgileri')

      // 2. İş Kalemleri
      if (tasks?.length) {
        XLSX.utils.book_append_sheet(wb, makeSheet(
          ['Görev Kodu', 'Görev Adı', 'Kategori', 'İlgili Kurum', 'Plan Başlangıç', 'Plan Bitiş', 'İlerleme (%)', 'Durum', 'Sorumlu', 'Ekip Sayısı', 'Ekipman Notları', 'Notlar'],
          tasks.map(t => [t.task_code || '', t.task_name || '', t.category || '', t.sub_category || '', t.planned_start || '', t.planned_end || '', t.progress_pct ?? 0, t.status || '', t.responsible || '', t.team_size ?? '', t.equipment_notes || '', t.notes || ''])
        ), 'İş Kalemleri')
      }

      // 3. İlerleme Kalemleri
      if (progressItems?.length) {
        XLSX.utils.book_append_sheet(wb, makeSheet(
          ['Kategori', 'Kalem Adı', 'Birim', 'Hedef Miktar', 'Toplam İlerleme', 'Sıra'],
          progressItems.map(x => [x.category || '', x.name || '', x.unit || '', x.target_qty ?? 0, x.total_progress ?? 0, x.order_index ?? 0])
        ), 'İlerleme Kalemleri')
      }

      // 4. Riskler
      if (risks?.length) {
        XLSX.utils.book_append_sheet(wb, makeSheet(
          ['Risk Başlığı', 'Açıklama', 'Şiddet', 'Olasılık (1-5)', 'Etki (1-5)', 'Durum', 'Azaltma Yöntemi'],
          risks.map(r => [r.title || '', r.description || '', r.severity || '', r.probability ?? '', r.impact ?? '', r.status || '', r.mitigation || ''])
        ), 'Riskler')
      }

      // 5. Tedarik
      if (procurement?.length) {
        XLSX.utils.book_append_sheet(wb, makeSheet(
          ['Kategori', 'Ekipman / Ürün', 'Miktar', 'Birim', 'Marka Kriteri', 'Tedarikçi', 'Öncelik', 'Durum', 'Sipariş Tarihi', 'Beklenen Teslimat', 'Garanti (Yıl)', 'Temin Süresi (Gün)', 'Notlar'],
          procurement.map(x => [x.category || '', x.equipment || '', x.quantity || '', x.unit || '', x.brand_criteria || '', x.supplier || '', x.priority || '', x.status || '', x.order_date || '', x.expected_delivery || '', x.warranty_years ?? '', x.lead_time_days ?? '', x.notes || ''])
        ), 'Tedarik')
      }

      // 6. Bütçe
      if (budget?.length) {
        XLSX.utils.book_append_sheet(wb, makeSheet(
          ['Kategori', 'Kalem Adı', 'Planlanan Tutar', 'Gerçekleşen Tutar', 'Fark', 'Sıra'],
          budget.map(b => [b.category || '', b.name || '', b.planned_amount ?? 0, b.actual_amount ?? 0, (b.planned_amount ?? 0) - (b.actual_amount ?? 0), b.order_index ?? 0])
        ), 'Bütçe')
      }

      // 7. Kritik Yol
      if (criticalPath?.length) {
        XLSX.utils.book_append_sheet(wb, makeSheet(
          ['Yol Kodu', 'Aktivite Adı', 'Plan Başlangıç', 'Plan Bitiş', 'Kritik Yol', 'Durum', 'İlerleme (%)', 'Sorumlu', 'Notlar'],
          criticalPath.map(c => [c.path_code || '', c.activity_name || '', c.planned_start || '', c.planned_end || '', c.is_critical ? 'Evet' : 'Hayır', c.status || '', c.progress_pct ?? 0, c.responsible || '', c.notes || ''])
        ), 'Kritik Yol')
      }

      const tarih = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `${project.id}-rapor-${tarih}.xlsx`)
      showToast('Excel indirildi')
    } catch (err) {
      setError(`Excel oluşturulurken hata: ${err.message}`)
    } finally {
      setExportLoadingId(null)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleImportClick() {
    setImportError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportError(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

      // ── Proje Bilgileri ──────────────────────────────────────────────────
      const projSheetName = wb.SheetNames.includes('Proje Bilgileri') ? 'Proje Bilgileri' : wb.SheetNames[0]
      const projWs = wb.Sheets[projSheetName]

      // Yeni format: 3 başlık satırı → 4. satır 'Alan'/'Değer' başlığı
      const requiredSheets = ['Proje Bilgileri', 'İş Kalemleri', 'İlerleme Kalemleri', 'Riskler', 'Tedarik', 'Bütçe', 'Kritik Yol']
      const isFonsTemplate = requiredSheets.every(name => wb.SheetNames.includes(name))
        && String(projWs.B5?.v || '').trim() === 'Proje ID *'
        && String(projWs.B6?.v || '').trim() === 'Proje Adı *'
        && String(projWs.B7?.v || '').trim() === 'Konum *'
        && String(projWs.B8?.v || '').trim() === 'Proje Türü *'
        && String(projWs.B10?.v || '').trim() === 'Başlangıç Tarihi *'
        && String(projWs.B11?.v || '').trim() === 'Hedef Bitiş *'
        && String(projWs.B15?.v || '').trim() === 'DC Güç (kWp) *'
      if (!isFonsTemplate) {
        throw new Error('Bu dosya Fons Solar proje şablonu değil. “Şablon İndir” ile aldığınız dosyayı kullanın.')
      }
      const cell = addr => projWs[addr]?.v ?? ''
      const lvRows = XLSX.utils.sheet_to_json(projWs, { range: 3, defval: '', raw: false })
      const isLabelValue = lvRows.length > 0 && ('Alan' in lvRows[0] || 'Değer' in lvRows[0])

      let obj = {}
      if (isFonsTemplate) {
        obj = {
          'Proje ID': cell('E5'), 'Proje Adı': cell('E6'), 'Konum': cell('E7'),
          'Proje Türü': cell('E8'), 'Durum': cell('E9'),
          'Başlangıç': cell('E10'), 'Hedef Bitiş': cell('E11'),
          'DC Güç (kWp)': cell('E15'), 'AC Güç (kWe)': cell('E16'),
          'Depolama (kWh)': cell('E17'), 'Panel Markası': cell('E20'),
          'Panel Sayısı': cell('J20'), 'İnvertör Markası': cell('E21'),
          'İnvertör Sayısı': cell('J21'), 'Batarya Markası': cell('E22'),
          'Batarya Gücü (kW)': cell('J22'), 'Batarya Adedi': cell('J23'),
        }
      } else if (isLabelValue) {
        lvRows.forEach(r => { if (String(r['Alan'] || '').trim()) obj[r['Alan']] = r['Değer'] })
      } else {
        // Düz satır formatı (şablon veya eski export)
        const flat = XLSX.utils.sheet_to_json(projWs, { defval: '', raw: false })[0] || {}
        obj = {
          'Proje Adı':         flat['Proje Adı']          || flat['Proje Adı *']       || '',
          'Proje ID':          flat['Proje ID']            || '',
          'Konum':             flat['Konum']               || '',
          'Proje Türü':        flat['Proje Türü']          || '',
          'Durum':             flat['Durum']               || '',
          'DC Güç (kWp)':      flat['DC Güç (kWp)']        || '',
          'AC Güç (kWe)':      flat['AC Güç (kWe)']        || '',
          'Depolama (kWh)':    flat['Depolama (kWh)']      || '',
          'Başlangıç':         flat['Başlangıç']           || '',
          'Hedef Bitiş':       flat['Hedef Bitiş']         || '',
          'Toplam Gün':        flat['Toplam Gün']          || '',
          'İlerleme (%)':      flat['İlerleme (%)']        || '',
          'Panel Markası':     flat['Panel Markası']       || '',
          'Panel Sayısı':      flat['Panel Sayısı']        || '',
          'İnvertör Markası':  flat['İnvertör Markası']    || '',
          'İnvertör Sayısı':   flat['İnvertör Sayısı']     || '',
          'Batarya Markası':   flat['Batarya Markası']     || '',
          'Batarya Gücü (kW)': flat['Batarya Gücü (kW)']  || '',
          'Batarya Adedi':     flat['Batarya Adedi']       || '',
        }
      }

      const requiredFields = [
        ['Proje ID', obj['Proje ID']], ['Proje Adı', obj['Proje Adı']], ['Konum', obj['Konum']],
        ['Proje Türü', obj['Proje Türü']], ['Başlangıç Tarihi', obj['Başlangıç']],
        ['Hedef Bitiş', obj['Hedef Bitiş']], ['DC Güç (kWp)', obj['DC Güç (kWp)']],
      ]
      const missingFields = requiredFields.filter(([, value]) => value === '' || value === null || value === undefined)
      if (missingFields.length) {
        throw new Error(`Şablondaki zorunlu alanlar boş: ${missingFields.map(([label]) => label).join(', ')}`)
      }

      const nameVal = String(obj['Proje Adı'] || '').trim()
      const idVal   = String(obj['Proje ID']  || '').trim().toLowerCase().replace(/\s+/g, '-') || slugify(nameVal)

      const validErrors = []
      if (!nameVal) validErrors.push('❌ Proje Adı boş olamaz ("Proje Bilgileri" sayfasını kontrol edin)')
      if (!idVal)   validErrors.push('❌ Proje ID oluşturulamadı')
      if (validErrors.length) { setImportError(validErrors.join('\n')); return }

      const projectTypes = { 'Arazi GES': 'arazi_ges', 'Endüstriyel Çatı GES': 'endustriyel_cati_ges', 'Evsel GES': 'evsel_ges' }
      const statuses = { aktif: 'aktif', active: 'aktif', tamamlandi: 'tamamlandı', 'tamamlandı': 'tamamlandı', durduruldu: 'beklemede', planlama: 'beklemede' }
      const projRow = {
        id:               idVal,
        name:             nameVal,
        location:         String(obj['Konum']              || '').trim() || null,
        project_type:     projectTypes[String(obj['Proje Türü'] || '').trim()] || String(obj['Proje Türü'] || '').trim() || null,
        status:           statuses[String(obj['Durum'] || 'aktif').trim().toLowerCase()] || 'aktif',
        progress:         parseNum(obj['İlerleme (%)'])    ?? 0,
        capacity_kwp:     parseNum(obj['DC Güç (kWp)']),
        capacity_kwe:     parseNum(obj['AC Güç (kWe)']),
        storage_kwh:      parseNum(obj['Depolama (kWh)']),
        start_date:       parseDate(obj['Başlangıç']),
        target_date:      parseDate(obj['Hedef Bitiş']),
        total_days:       parseNum(obj['Toplam Gün']),
        panel_brand:      String(obj['Panel Markası']      || '').trim() || null,
        panel_count:      parseNum(obj['Panel Sayısı']),
        inverter_brand:   String(obj['İnvertör Markası']   || '').trim() || null,
        inverter_count:   parseNum(obj['İnvertör Sayısı']),
        battery_brand:    String(obj['Batarya Markası']    || '').trim() || null,
        battery_power_kw: parseNum(obj['Batarya Gücü (kW)']),
        battery_count:    parseNum(obj['Batarya Adedi']),
      }

      // ── Alt tablolar ─────────────────────────────────────────────────────
      const readSheet = name => {
        if (!wb.SheetNames.includes(name)) return []
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { range: 3, defval: '', raw: false })
          .filter(r => Object.values(r).some(v => v !== ''))
        const aliases = {
          'Görev\nKodu': 'Görev Kodu', 'Plan\nBaşlangıç': 'Plan Başlangıç',
          'Plan\nBitiş': 'Plan Bitiş', 'İlerleme\n(%)': 'İlerleme (%)',
          'Hedef\nMiktar': 'Hedef Miktar', 'Olasılık\n(1-5)': 'Olasılık (1-5)',
          'Etki\n(1-5)': 'Etki (1-5)', 'Aktivite\nKodu': 'Yol Kodu',
          'Erken\nBaşlangıç': 'Plan Başlangıç', 'Erken\nBitiş': 'Plan Bitiş',
          'Kritik\nmi?': 'Kritik Yol',
          'Ürün / Hizmet': 'Ekipman / Ürün', 'Talep Tarihi': 'Sipariş Tarihi',
          'Teslim Tarihi': 'Beklenen Teslimat', 'Açıklama': 'Kalem Adı',
          'Planlanan (₺)': 'Planlanan Tutar', 'Gerçekleşen (₺)': 'Gerçekleşen Tutar',
          'Gerçekleşen': 'Toplam İlerleme', 'Risk Açıklaması': 'Risk Başlığı',
          'Aksiyon / Önlem': 'Azaltma Yöntemi', 'Ekip': 'Ekip Sayısı',
        }
        return rows.map(row => {
          const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/\r\n/g, '\n'), value]))
          return Object.entries(aliases).reduce((out, [from, to]) => {
          if (out[from] !== undefined && out[to] === undefined) out[to] = out[from]
          return out
          }, normalized)
        })
      }

      const tasks = readSheet('İş Kalemleri')
        .filter(r => r['Görev Adı'])
        .map(r => ({
          task_code:       String(r['Görev Kodu']      || '').trim() || null,
          task_name:       String(r['Görev Adı']            ).trim(),
          category:        catVal(r['Kategori']),
          sub_category:    String(r['İlgili Kurum']    || '').trim() || null,
          planned_start:   parseDate(r['Plan Başlangıç']),
          planned_end:     parseDate(r['Plan Bitiş']),
          progress_pct:    parseNum(r['İlerleme (%)']) ?? 0,
          status:          String(r['Durum']           || 'beklemede').toLowerCase(),
          responsible:     String(r['Sorumlu']         || '').trim() || null,
          team_size:       parseNum(r['Ekip Sayısı']),
          equipment_notes: String(r['Ekipman Notları'] || '').trim() || null,
          notes:           String(r['Notlar']          || '').trim() || null,
        }))

      const progress = readSheet('İlerleme Kalemleri')
        .filter(r => r['Kalem Adı'])
        .map(r => ({
          category:       catVal(r['Kategori']),
          name:           String(r['Kalem Adı']             ).trim(),
          unit:           String(r['Birim']            || '').trim() || null,
          target_qty:     parseNum(r['Hedef Miktar'])  ?? 0,
          total_progress: parseNum(r['Toplam İlerleme']) ?? 0,
          order_index:    parseNum(r['Sıra'])          ?? 0,
        }))

      const risks = readSheet('Riskler')
        .filter(r => r['Risk Başlığı'])
        .map(r => ({
          title:       String(r['Risk Başlığı']         ).trim(),
          description: String(r['Açıklama']        || '').trim() || null,
          severity:    String(r['Şiddet']          || '').trim() || null,
          probability: parseNum(r['Olasılık (1-5)']),
          impact:      parseNum(r['Etki (1-5)']),
          status:      String(r['Durum']           || 'açık').toLowerCase(),
          mitigation:  String(r['Azaltma Yöntemi'] || '').trim() || null,
        }))

      const procurement = readSheet('Tedarik')
        .filter(r => r['Ekipman / Ürün'])
        .map(r => ({
          category:          catVal(r['Kategori']),
          equipment:         String(r['Ekipman / Ürün']        ).trim(),
          quantity:          String(r['Miktar']            || '').trim() || null,
          unit:              String(r['Birim']             || '').trim() || null,
          brand_criteria:    String(r['Marka Kriteri']     || '').trim() || null,
          supplier:          String(r['Tedarikçi']         || '').trim() || null,
          priority:          String(r['Öncelik']           || 'normal').toLowerCase(),
          status:            String(r['Durum']             || 'planlandı').toLowerCase(),
          order_date:        parseDate(r['Sipariş Tarihi']),
          expected_delivery: parseDate(r['Beklenen Teslimat']),
          warranty_years:    parseNum(r['Garanti (Yıl)']),
          lead_time_days:    parseNum(r['Temin Süresi (Gün)']),
          notes:             String(r['Notlar']            || '').trim() || null,
        }))

      const budget = readSheet('Bütçe')
        .filter(r => r['Kalem Adı'])
        .map(r => ({
          category:       catVal(r['Kategori']),
          name:           String(r['Kalem Adı']               ).trim(),
          planned_amount: parseNum(r['Planlanan Tutar'])  ?? 0,
          order_index:    parseNum(r['Sıra'])             ?? 0,
        }))

      const criticalPath = readSheet('Kritik Yol')
        .filter(r => r['Aktivite Adı'])
        .map(r => ({
          path_code:     String(r['Yol Kodu']      || '').trim() || null,
          activity_name: String(r['Aktivite Adı']      ).trim(),
          planned_start: parseDate(r['Plan Başlangıç']),
          planned_end:   parseDate(r['Plan Bitiş']),
          is_critical:   String(r['Kritik Yol']    || 'Hayır').toLowerCase() === 'evet',
          status:        String(r['Durum']         || 'beklemede').toLowerCase(),
          progress_pct:  parseNum(r['İlerleme (%)']) ?? 0,
          responsible:   String(r['Sorumlu']       || '').trim() || null,
          notes:         String(r['Notlar']        || '').trim() || null,
        }))

      // Excel etiketlerini uygulamanın Supabase enum değerlerine dönüştür.
      const taskStatuses = { beklemede: 'beklemede', devam_ediyor: 'devam_ediyor', tamamlandi: 'tamamlandi', tamamlandı: 'tamamlandi', askida: 'askida', askıda: 'askida', iptal: 'iptal' }
      const riskStatuses = { açık: 'açık', acik: 'açık', izleniyor: 'açık', kapatıldı: 'kapatıldı', kapatildi: 'kapatıldı' }
      const procurementStatuses = { planlandı: 'planlandı', planlandi: 'planlandı', sipariş_verildi: 'sipariş_verildi', siparis_verildi: 'sipariş_verildi', teslim_edildi: 'teslim_edildi', iptal: 'iptal', gecikmiş: 'gecikmiş', gecikmis: 'gecikmiş' }
      tasks.forEach(row => { row.status = taskStatuses[String(row.status || '').toLocaleLowerCase('tr-TR')] || 'beklemede' })
      risks.forEach(row => {
        row.status = riskStatuses[String(row.status || '').toLocaleLowerCase('tr-TR')] || 'açık'
        row.severity = row.severity || (row.probability * row.impact >= 15 ? 'kritik' : row.probability * row.impact >= 8 ? 'yüksek' : row.probability * row.impact >= 4 ? 'orta' : 'düşük')
      })
      procurement.forEach(row => { row.status = procurementStatuses[String(row.status || '').toLocaleLowerCase('tr-TR')] || 'planlandı' })

      setImportSubData({ tasks, progress, risks, procurement, budget, criticalPath })
      setImportRows([projRow])
      setImportMode('duplicate')
      setImportState('preview')
    } catch (err) {
      setImportState('idle')
      setImportError(`Excel okunamadı: ${err.message}`)
    }
  }

  function updateImportRow(idx, field, val) {
    setImportRows(rows => rows.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: val }
      if (field === 'name' && r.id === slugify(r.name)) updated.id = slugify(val)
      return updated
    }))
  }

  async function handleImportConfirm() {
    setImportState('importing')
    setImportError(null)
    const errors = []
    let projectsCreated = 0
    const { tasks, progress, risks, procurement, budget, criticalPath } = importSubData

    for (const row of importRows) {
      // Aynı ID'deki projeyi güncellemek yerine ayrı bir kopya üret.
      // Böylece içe aktarma hiçbir mevcut proje ya da bağlı kaydı ezmez.
      const { data: existingProjects, error: lookupError } = await supabase
        .from('projects')
        .select('id')
        .like('id', `${row.id}%`)
      if (lookupError) {
        errors.push(`${row.name}: mevcut proje kontrolü yapılamadı: ${lookupError.message}`)
        continue
      }

      const existingIds = new Set((existingProjects || []).map(project => project.id))
      let projectId = row.id
      let projectName = row.name
      const updatingExisting = importMode === 'overwrite' && existingIds.has(projectId)
      if (existingIds.has(projectId) && !updatingExisting) {
        let copyNumber = 2
        while (existingIds.has(`${row.id}-kopya-${copyNumber}`)) copyNumber += 1
        projectId = `${row.id}-kopya-${copyNumber}`
        projectName = `${row.name} (Kopya ${copyNumber})`
      }
      const projectRow = { ...row, id: projectId, name: projectName }

      const { error: err } = updatingExisting
        ? await supabase.from('projects').update(projectRow).eq('id', projectId)
        : await supabase.from('projects').insert([projectRow])
      if (err) {
        errors.push(`${projectName}: ${err.message}`)
        continue
      }
      projectsCreated += 1

      const insertSub = async (table, rows) => {
        if (updatingExisting) {
          const { error: deleteError } = await supabase.from(table).delete().eq('project_id', projectId)
          if (deleteError) {
            errors.push(`${table}: ${deleteError.message}`)
            return
          }
        }
        if (!rows?.length) return
        const { error: insErr } = await supabase.from(table).insert(rows.map(r => ({ ...r, project_id: projectId })))
        if (insErr) errors.push(`${table}: ${insErr.message}`)
      }
      await insertSub('project_tasks',       tasks)
      await insertSub('progress_items',      progress)
      await insertSub('project_risks',       risks)
      await insertSub('procurement_items',   procurement)
      await insertSub('budget_lines',        budget)
      await insertSub('critical_path_items', criticalPath)
    }

    if (errors.length > 0) {
      setImportState('preview')
      setImportError(`${projectsCreated} proje oluşturuldu. ${errors.length} hata:\n${errors.join('\n')}`)
      await fetchProjects()
      return
    }

    const imported = projectsCreated
    setImportState('idle')
    setImportRows([])
    setImportSubData({})

    if (errors.length > 0) {
      setImportError(`${imported} proje aktarıldı. ${errors.length} hata:\n${errors.join('\n')}`)
    } else {
      showToast(`${imported} proje başarıyla aktarıldı`)
    }
    fetchProjects()
  }

  // ── Template ────────────────────────────────────────────────────────────────
  function handleDownloadTemplate() {
    const a = document.createElement('a')
    a.href = '/fons-solar-proje-sablonu.xlsx'
    a.download = 'fons-solar-proje-sablonu.xlsx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return

    const wb = XLSX.utils.book_new()

    const hS = {
      fill: { patternType: 'solid', fgColor: { rgb: '1D4ED8' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: { right: { style: 'thin', color: { rgb: 'BFDBFE' } }, bottom: { style: 'thin', color: { rgb: '93C5FD' } } },
    }
    const eS = {
      fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } },
      font: { sz: 10, color: { rgb: '1E3A5F' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: { right: { style: 'thin', color: { rgb: 'DBEAFE' } }, bottom: { style: 'thin', color: { rgb: 'DBEAFE' } } },
    }

    const makeSheet = cols => {
      const ws = {}
      cols.forEach(({ h, ex }, i) => {
        ws[XLSX.utils.encode_cell({ r: 0, c: i })] = { v: h,  t: 's', s: hS }
        ws[XLSX.utils.encode_cell({ r: 1, c: i })] = { v: ex, t: typeof ex === 'number' ? 'n' : 's', s: eS }
      })
      ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1, c: cols.length - 1 } })
      ws['!cols'] = cols.map(c => ({ wch: c.w }))
      ws['!rows'] = [{ hpt: 30 }, { hpt: 20 }]
      return ws
    }

    XLSX.utils.book_append_sheet(wb, makeSheet([
      { h: 'Proje Adı *',       ex: 'Ege GES Projesi',   w: 22 },
      { h: 'Proje ID',          ex: 'ege-ges',            w: 16 },
      { h: 'Konum',             ex: 'İzmir / Kemalpaşa', w: 18 },
      { h: 'Proje Türü',        ex: 'arazi_ges',          w: 16 },
      { h: 'Durum',             ex: 'aktif',              w: 12 },
      { h: 'DC Güç (kWp)',      ex: 500,                  w: 13 },
      { h: 'AC Güç (kWe)',      ex: 480,                  w: 13 },
      { h: 'Depolama (kWh)',    ex: 100,                  w: 14 },
      { h: 'Başlangıç',         ex: '2026-07-01',         w: 13 },
      { h: 'Hedef Bitiş',       ex: '2026-12-31',         w: 13 },
      { h: 'Toplam Gün',        ex: 183,                  w: 11 },
      { h: 'İlerleme (%)',      ex: 0,                    w: 11 },
      { h: 'Panel Markası',     ex: 'JA Solar',           w: 14 },
      { h: 'Panel Sayısı',      ex: 1000,                 w: 12 },
      { h: 'İnvertör Markası',  ex: 'Huawei',             w: 16 },
      { h: 'İnvertör Sayısı',   ex: 5,                    w: 14 },
      { h: 'Batarya Markası',   ex: '',                   w: 14 },
      { h: 'Batarya Gücü (kW)', ex: '',                   w: 16 },
      { h: 'Batarya Adedi',     ex: '',                   w: 12 },
    ]), 'Proje Bilgileri')

    XLSX.utils.book_append_sheet(wb, makeSheet([
      { h: 'Görev Kodu',      ex: 'GV-001',            w: 13 },
      { h: 'Görev Adı *',     ex: 'Güney Çit Montajı', w: 22 },
      { h: 'Kategori',        ex: 'mekanik',            w: 14 },
      { h: 'İlgili Kurum',    ex: 'Yüklenici',          w: 14 },
      { h: 'Plan Başlangıç',  ex: '2026-07-15',         w: 13 },
      { h: 'Plan Bitiş',      ex: '2026-07-25',         w: 12 },
      { h: 'İlerleme (%)',    ex: 0,                    w: 11 },
      { h: 'Durum',           ex: 'beklemede',          w: 13 },
      { h: 'Sorumlu',         ex: 'Ekip A',             w: 13 },
      { h: 'Ekip Sayısı',     ex: 5,                    w: 11 },
      { h: 'Ekipman Notları', ex: '',                   w: 16 },
      { h: 'Notlar',          ex: '',                   w: 18 },
    ]), 'İş Kalemleri')

    XLSX.utils.book_append_sheet(wb, makeSheet([
      { h: 'Kategori',        ex: 'mekanik',    w: 14 },
      { h: 'Kalem Adı *',     ex: 'Kazık Çakımı', w: 20 },
      { h: 'Birim',           ex: 'adet',       w: 10 },
      { h: 'Hedef Miktar',    ex: 500,          w: 13 },
      { h: 'Toplam İlerleme', ex: 0,            w: 16 },
      { h: 'Sıra',            ex: 1,            w: 8  },
    ]), 'İlerleme Kalemleri')

    XLSX.utils.book_append_sheet(wb, makeSheet([
      { h: 'Risk Başlığı *',  ex: 'Hava Koşulları',    w: 20 },
      { h: 'Açıklama',        ex: 'Uzun yağmur sezonu', w: 24 },
      { h: 'Şiddet',          ex: 'orta',               w: 10 },
      { h: 'Olasılık (1-5)',  ex: 3,                    w: 13 },
      { h: 'Etki (1-5)',      ex: 3,                    w: 11 },
      { h: 'Durum',           ex: 'açık',               w: 10 },
      { h: 'Azaltma Yöntemi', ex: 'Esnek program',      w: 20 },
    ]), 'Riskler')

    XLSX.utils.book_append_sheet(wb, makeSheet([
      { h: 'Kategori',            ex: 'mekanik',        w: 14 },
      { h: 'Ekipman / Ürün *',    ex: 'Güneş Paneli',   w: 18 },
      { h: 'Miktar',              ex: 1000,             w: 10 },
      { h: 'Birim',               ex: 'adet',           w: 10 },
      { h: 'Marka Kriteri',       ex: 'JA Solar 550W',  w: 16 },
      { h: 'Tedarikçi',           ex: '',               w: 16 },
      { h: 'Öncelik',             ex: 'kritik',         w: 10 },
      { h: 'Durum',               ex: 'planlandı',      w: 12 },
      { h: 'Sipariş Tarihi',      ex: '',               w: 13 },
      { h: 'Beklenen Teslimat',   ex: '2026-07-01',     w: 16 },
      { h: 'Garanti (Yıl)',       ex: 10,               w: 12 },
      { h: 'Temin Süresi (Gün)',  ex: 45,               w: 16 },
      { h: 'Notlar',              ex: '',               w: 18 },
    ]), 'Tedarik')

    XLSX.utils.book_append_sheet(wb, makeSheet([
      { h: 'Kategori',           ex: 'mekanik',    w: 14 },
      { h: 'Kalem Adı *',        ex: 'Panel Alımı', w: 20 },
      { h: 'Planlanan Tutar',    ex: 5000000,      w: 16 },
      { h: 'Gerçekleşen Tutar',  ex: 0,            w: 18 },
      { h: 'Sıra',               ex: 1,            w: 8  },
    ]), 'Bütçe')

    XLSX.utils.book_append_sheet(wb, makeSheet([
      { h: 'Yol Kodu',      ex: 'C1',            w: 11 },
      { h: 'Aktivite Adı *', ex: 'Kazık Çakımı', w: 22 },
      { h: 'Plan Başlangıç', ex: '2026-07-01',   w: 13 },
      { h: 'Plan Bitiş',    ex: '2026-07-15',    w: 12 },
      { h: 'Kritik Yol',    ex: 'Evet',          w: 11 },
      { h: 'Durum',         ex: 'beklemede',     w: 13 },
      { h: 'İlerleme (%)',  ex: 0,               w: 11 },
      { h: 'Sorumlu',       ex: 'Ekip A',        w: 13 },
      { h: 'Notlar',        ex: '',              w: 18 },
    ]), 'Kritik Yol')

    XLSX.writeFile(wb, 'proje-import-sablonu.xlsx')
  }

  // ── Views ───────────────────────────────────────────────────────────────────
  if (view === 'new') {
    return (
      <YeniProjeWizard
        onSuccess={() => { setView('list'); fetchProjects() }}
        onViewProject={onViewProject}
      />
    )
  }

  if (view === 'edit' && editProject) {
    return (
      <ProjeEditWizard
        project={editProject}
        onSuccess={() => { setView('list'); fetchProjects() }}
        onViewProject={onViewProject}
      />
    )
  }

  // ── Önizleme modal yardımcıları ─────────────────────────────────────────────
  const closeModal = () => { setImportState('idle'); setImportRows([]); setImportSubData({}) }
  const prevRow    = importRows[0] ?? {}
  const sub        = importSubData
  const subItems   = [
    { label: 'İş Kalemleri',      count: sub.tasks?.length       ?? 0, icon: '📋' },
    { label: 'İlerleme',          count: sub.progress?.length    ?? 0, icon: '📈' },
    { label: 'Riskler',           count: sub.risks?.length       ?? 0, icon: '⚠️' },
    { label: 'Tedarik',           count: sub.procurement?.length ?? 0, icon: '🛒' },
    { label: 'Bütçe',             count: sub.budget?.length      ?? 0, icon: '💰' },
    { label: 'Kritik Yol',        count: sub.criticalPath?.length ?? 0, icon: '🔗' },
  ]

  return (
    <div className="card" style={{ position: 'relative' }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Import preview modal ───────────────────────────────────────────── */}
      {importState === 'preview' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            width: '100%', maxWidth: 520,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📊</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Excel Önizleme</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Aşağıdaki veriler sisteme aktarılacak</p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* Proje özet */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  ['Proje ID',   <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1d4ed8' }}>{prevRow.id}</span>],
                  ['Proje Adı',  <input value={prevRow.name || ''} onChange={e => updateImportRow(0, 'name', e.target.value)} style={{ border: '1px solid #bfdbfe', borderRadius: 5, padding: '2px 7px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', background: '#fff', width: '100%' }} />],
                  ['ID (slug)',  <input value={prevRow.id   || ''} onChange={e => updateImportRow(0, 'id',   e.target.value)} style={{ border: '1px solid #bfdbfe', borderRadius: 5, padding: '2px 7px', fontSize: 12, fontFamily: 'monospace', outline: 'none', background: '#fff', width: '100%', color: '#1d4ed8' }} />],
                  ['Konum',      <span style={{ fontSize: 13 }}>{prevRow.location || '—'}</span>],
                  ['Tarihler',   <span style={{ fontSize: 13 }}>{prevRow.start_date || '?'} → {prevRow.target_date || '?'}</span>],
                  ['DC Güç',     <span style={{ fontSize: 13 }}>{prevRow.capacity_kwp ? `${prevRow.capacity_kwp} kWp` : '—'}</span>],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', minWidth: 72 }}>{label}</span>
                    <div style={{ flex: 1 }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alt tablo grid */}
            <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Aktarılacak Kayıtlar</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {subItems.map(({ label, count, icon }) => (
                  <div key={label} style={{ background: count > 0 ? '#f0fdf4' : '#f8fafc', border: `1px solid ${count > 0 ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 8, padding: '0.625rem 0.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? '#16a34a' : '#94a3b8', lineHeight: 1 }}>{count}</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Aynı ID varsa</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button type="button" onClick={() => setImportMode('duplicate')} style={{ padding: '0.55rem', borderRadius: 7, border: `1px solid ${importMode === 'duplicate' ? 'var(--color-primary)' : '#e2e8f0'}`, background: importMode === 'duplicate' ? '#eff6ff' : '#fff', color: importMode === 'duplicate' ? 'var(--color-primary)' : '#64748b', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Kopya oluştur</button>
                <button type="button" onClick={() => setImportMode('overwrite')} style={{ padding: '0.55rem', borderRadius: 7, border: `1px solid ${importMode === 'overwrite' ? '#d97706' : '#e2e8f0'}`, background: importMode === 'overwrite' ? '#fffbeb' : '#fff', color: importMode === 'overwrite' ? '#b45309' : '#64748b', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Mevcudu güncelle</button>
              </div>
              <p style={{ margin: '0.5rem 0 0', fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>{importMode === 'overwrite' ? 'Bu projenin iş, risk, tedarik ve bütçe kayıtları Excel içeriğiyle değiştirilir.' : 'Mevcut proje korunur; yeni bir kopya oluşturulur.'}</p>
            </div>

            {importError && (
              <div style={{ margin: '0 1.5rem 0.75rem', padding: '0.625rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 12, whiteSpace: 'pre-line' }}>
                {importError}
              </div>
            )}

            <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={closeModal}
                style={{ flex: 1, padding: '0.5rem 1rem', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                İptal
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importState === 'importing'}
                style={{ flex: 2, padding: '0.5rem 1rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: importState === 'importing' ? 0.7 : 1 }}
              >
                {importState === 'importing' ? 'Aktarılıyor…' : '✓ Projeyi Oluştur ve Yükle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="card-header">
        <h3>Proje Yönetimi</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={handleDownloadTemplate}
            style={{ padding: '0.5rem 1.1rem', background: 'transparent', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Şablon İndir
          </button>
          <button
            onClick={handleImportClick}
            disabled={importState === 'importing'}
            style={{ padding: '0.5rem 1.1rem', background: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {importState === 'importing' ? 'Aktarılıyor…' : 'Excel İçeri Aktar'}
          </button>
          <button
            onClick={() => setView('new')}
            style={{ padding: '0.5rem 1.25rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Yeni Proje
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ padding: '1rem 1.5rem' }}>
        {(error || importError) && importState !== 'preview' && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 13, marginBottom: '1rem', whiteSpace: 'pre-line' }}>
            {error || importError}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2.5rem 0', fontSize: 14 }}>Yükleniyor…</p>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: '1rem' }}>Henüz proje eklenmemiş.</p>
            <button
              onClick={() => setView('new')}
              style={{ padding: '0.5rem 1.5rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + İlk Projeyi Ekle
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Proje Adı', 'ID', 'Konum', 'Durum', 'DC Güç', 'İlerleme', 'Başlangıç', 'Hedef Bitiş', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const sc    = STATUS_COLOR[p.status] || { bg: '#f1f5f9', color: '#475569' }
                  const isDel = deleting === p.id
                  const isExp = exportLoadingId === p.id
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: isDel ? 0.5 : 1 }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--color-text)' }}>{p.name}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-muted)', fontFamily: 'monospace', fontSize: 11 }}>{p.id}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)' }}>{p.location || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                          {STATUS_LABEL[p.status] || p.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>
                        {p.capacity_kwp ? `${Number(p.capacity_kwp).toLocaleString('tr')} kWp` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', minWidth: 110 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                            <div style={{ width: `${p.progress || 0}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)', whiteSpace: 'nowrap', minWidth: 28 }}>{p.progress || 0}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>{p.start_date || '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--color-text-sub)', whiteSpace: 'nowrap' }}>{p.target_date || '—'}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            onClick={() => { setEditProject(p); setView('edit') }}
                            disabled={isDel || isExp}
                            style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleExport(p)}
                            disabled={isDel || isExp}
                            style={{ padding: '4px 10px', background: 'transparent', color: '#15803d', border: '1px solid #16a34a', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500, cursor: isExp ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isExp ? 0.6 : 1 }}
                          >
                            {isExp ? '…' : 'Excel'}
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={isDel || isExp}
                            style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500, cursor: isDel ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isDel ? 0.6 : 1 }}
                          >
                            {isDel ? '…' : 'Sil'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem',
          padding: '0.75rem 1.25rem', borderRadius: 10,
          background: toast.type === 'success' ? '#16a34a' : '#dc2626',
          color: '#fff', fontWeight: 600, fontSize: 13,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          zIndex: 9999, transition: 'all .2s',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
