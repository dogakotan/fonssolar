// WBS / alan Excel şablonu: üretme, okuma ve dosya içi doğrulama (Faz 1 Adım 4).
// Saf modül: Supabase'e ve Vite'a bağlı değil; ExcelJS dışarıdan verilir. Hem ön yüz
// (dinamik import('exceljs')) hem Node betikleri (scripts/proje-kontrol/wbs-alan/) kullanır.
// Doğrulama kuralları import_wbs_areas RPC'sinin projesiz modundakiyle aynıdır; hata kodları,
// sayfa adları ve satır numaraları birebir aynı üretilir (tests/proje-kontrol-wbs-alan-excel.spec.js).

export const SHEET_WBS = 'WBS'
export const SHEET_AREAS = 'Alanlar'
export const SHEET_LINKS = 'Alan-WBS'
export const HEADER_ROW = 3
export const FIRST_DATA_ROW = 4
export const MAX_ROWS = 5000

// task_disciplines tablosuyla aynı (Karar 20, 37)
export const DISCIPLINES = ['mechanical', 'dc', 'ac', 'mv', 'hv', 'enh', 'civil', 'scada', 'general']
// project_areas_type_check ile aynı
export const AREA_TYPES = ['genel', 'ges', 'pv_blok', 'inverter_station', 'mv_feeder', 'tm', 'eih_section',
  'depo', 'laydown', 'kamp', 'yol', 'diger']

const WBS_CODE_RE = /^[A-Z0-9][A-Z0-9-]*$/
const AREA_CODE_RE = /^[A-Z0-9]+$/

// Kolonlar canlı tablolardan: project_wbs(wbs_code, name, parent_id, discipline, is_active, notes),
// project_areas(area_code, name, area_type, parent_id, is_active, notes), area_wbs(area_id, wbs_id).
export const COLUMNS = {
  [SHEET_WBS]: [
    { key: 'code', header: 'WBS Kodu', width: 16 },
    { key: 'name', header: 'Ad', width: 40 },
    { key: 'parent_code', header: 'Üst WBS Kodu', width: 16 },
    { key: 'discipline', header: 'Disiplin', width: 14 },
    { key: 'active', header: 'Aktif', width: 8 },
    { key: 'notes', header: 'Not', width: 40 },
  ],
  [SHEET_AREAS]: [
    { key: 'code', header: 'Alan Kodu', width: 14 },
    { key: 'name', header: 'Ad', width: 36 },
    { key: 'area_type', header: 'Alan Tipi', width: 18 },
    { key: 'parent_code', header: 'Üst Alan Kodu', width: 14 },
    { key: 'active', header: 'Aktif', width: 8 },
    { key: 'notes', header: 'Not', width: 40 },
  ],
  [SHEET_LINKS]: [
    { key: 'area_code', header: 'Alan Kodu', width: 14 },
    { key: 'wbs_code', header: 'WBS Kodu', width: 16 },
  ],
}

const SHEET_NOTES = {
  [SHEET_WBS]: 'Kodları sabit haneli yazın (DYB-020, DYB-100): liste WBS koduna göre sıralanır. Kod: büyük harf, rakam, tire. Üst kod boşsa kök.',
  [SHEET_AREAS]: 'Alan kodu yalnızca büyük harf ve rakam (tire yok): Activity ID\'nin parçasıdır. Alan tipi boşsa "diger".',
  [SHEET_LINKS]: 'Bir WBS\'te (veya üst WBS\'lerinde) bağ tanımlıysa, o WBS\'e Activity ID alacak görevin alanı bu bağlardan biri olmalı (Karar 38).',
}

// Kurgu örnek satırlar (TIZ tarzı, gerçek proje verisi değil)
export const EXAMPLE_ROWS = {
  [SHEET_WBS]: [
    { code: 'TIZ-100', name: 'Mobilizasyon', discipline: 'general' },
    { code: 'TIZ-200', name: 'Mekanik Montaj', discipline: 'mechanical' },
    { code: 'TIZ-210', name: 'Kazık Çakımı', parent_code: 'TIZ-200', discipline: 'mechanical' },
    { code: 'TIZ-220', name: 'Konstrüksiyon Montajı', parent_code: 'TIZ-200', discipline: 'mechanical' },
    { code: 'TIZ-300', name: 'DC Elektrik', discipline: 'dc' },
    { code: 'TIZ-310', name: 'DC Kablo Çekimi', parent_code: 'TIZ-300', discipline: 'dc', notes: 'Örnek not' },
  ],
  [SHEET_AREAS]: [
    { code: 'GES', name: 'TIZ GES Sahası', area_type: 'ges' },
    { code: 'B1', name: 'PV Blok 1', area_type: 'pv_blok', parent_code: 'GES' },
    { code: 'B2', name: 'PV Blok 2', area_type: 'pv_blok', parent_code: 'GES' },
    { code: 'INV1', name: 'İnverter İstasyonu 1', area_type: 'inverter_station', parent_code: 'B1' },
    { code: 'DEPO', name: 'Saha Deposu', area_type: 'depo' },
  ],
  [SHEET_LINKS]: [
    { area_code: 'B1', wbs_code: 'TIZ-210' },
    { area_code: 'B2', wbs_code: 'TIZ-210' },
    { area_code: 'B1', wbs_code: 'TIZ-310' },
  ],
}

function colLetter(i) {
  return String.fromCharCode(65 + i)
}

// Şablon: her sayfada 1. satır başlık, 2. satır açıklama, 3. satır kolon başlıkları, veri 4. satırdan.
export function buildTemplateWorkbook(ExcelJS, { withExamples = true } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Fons Solar'
  const lists = wb.addWorksheet('Listeler', { state: 'veryHidden' })
  DISCIPLINES.forEach((d, i) => { lists.getCell(i + 1, 1).value = d })
  AREA_TYPES.forEach((t, i) => { lists.getCell(i + 1, 2).value = t })
  lists.getCell(1, 3).value = 'Evet'
  lists.getCell(2, 3).value = 'Hayır'

  for (const sheetName of [SHEET_WBS, SHEET_AREAS, SHEET_LINKS]) {
    const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: HEADER_ROW }] })
    const cols = COLUMNS[sheetName]
    ws.columns = cols.map((c) => ({ width: c.width }))
    ws.getCell(1, 1).value = `${sheetName} — WBS/alan şablonu`
    ws.getCell(1, 1).font = { bold: true, size: 13 }
    ws.getCell(2, 1).value = SHEET_NOTES[sheetName] + (withExamples ? ' ÖRNEK satırları silip kendi verinizi yazın.' : '')
    ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF555555' } }
    cols.forEach((c, i) => {
      const cell = ws.getCell(HEADER_ROW, i + 1)
      cell.value = c.header
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    })
    if (withExamples) {
      EXAMPLE_ROWS[sheetName].forEach((row, r) => {
        cols.forEach((c, i) => {
          const v = c.key === 'active' ? 'Evet' : row[c.key]
          if (v !== undefined) ws.getCell(FIRST_DATA_ROW + r, i + 1).value = v
        })
      })
    }
    const last = FIRST_DATA_ROW + MAX_ROWS - 1
    const listRef = { discipline: 'A', area_type: 'B', active: 'C' }
    const listLen = { discipline: DISCIPLINES.length, area_type: AREA_TYPES.length, active: 2 }
    cols.forEach((c, i) => {
      if (!listRef[c.key]) return
      const col = colLetter(i)
      ws.dataValidations.add(`${col}${FIRST_DATA_ROW}:${col}${last}`, {
        type: 'list',
        allowBlank: true,
        formulae: [`Listeler!$${listRef[c.key]}$1:$${listRef[c.key]}$${listLen[c.key]}`],
        showErrorMessage: true,
        errorTitle: c.header,
        error: `${c.header} listeden seçilmeli`,
      })
    })
  }
  return wb
}

// Hücre değerini düz metne çevirir (zengin metin, formül sonucu, sayı).
export function cellText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((p) => p.text).join('').trim()
    if ('result' in value) return cellText(value.result)
    if ('text' in value) return String(value.text).trim()
    if (value instanceof Date) return value.toISOString().slice(0, 10)
  }
  return String(value).trim()
}

// "Evet"/"Hayır" → true/false, boş → null; tanınmayan değer metin olarak kalır (value_invalid).
export function parseActive(text) {
  if (text === '') return null
  const t = text.toLocaleLowerCase('tr-TR')
  if (t === 'evet') return true
  if (t === 'hayır' || t === 'hayir') return false
  return text
}

// Çalışma kitabını import_wbs_areas payload'ına çevirir. Eksik sayfa parseErrors'a yazılır.
export function parseWbsAreaWorkbook(workbook, fileName = 'dosya.xlsx') {
  const payload = { file_name: fileName, wbs: [], areas: [], links: [] }
  const parseErrors = []
  const target = { [SHEET_WBS]: 'wbs', [SHEET_AREAS]: 'areas', [SHEET_LINKS]: 'links' }
  for (const sheetName of [SHEET_WBS, SHEET_AREAS, SHEET_LINKS]) {
    const ws = workbook.getWorksheet(sheetName)
    if (!ws) {
      parseErrors.push({ sheet: sheetName, row: null, code: 'sheet_missing', field: null, message: `"${sheetName}" sayfası yok` })
      continue
    }
    const cols = COLUMNS[sheetName]
    const headers = cols.map((_, i) => cellText(ws.getCell(HEADER_ROW, i + 1).value))
    cols.forEach((c, i) => {
      if (headers[i] !== c.header) {
        parseErrors.push({ sheet: sheetName, row: HEADER_ROW, code: 'header_mismatch', field: c.key,
          message: `${colLetter(i)} kolonu "${c.header}" olmalı, "${headers[i]}" bulundu` })
      }
    })
    for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r += 1) {
      const vals = cols.map((_, i) => cellText(ws.getCell(r, i + 1).value))
      if (vals.every((v) => v === '')) continue
      const row = { row: r }
      cols.forEach((c, i) => {
        const v = vals[i]
        if (c.key === 'active') row.active = parseActive(v)
        else if (v !== '') row[c.key] = v
      })
      payload[target[sheetName]].push(row)
    }
  }
  return { payload, parseErrors }
}

const SHEET_ORDER = { [SHEET_WBS]: 1, [SHEET_AREAS]: 2, [SHEET_LINKS]: 3 }

function sortErrors(list) {
  return list.sort((a, b) => (SHEET_ORDER[a.sheet] - SHEET_ORDER[b.sheet])
    || ((a.row ?? -1) - (b.row ?? -1))
    || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

function blank(v) {
  return v === undefined || v === null || String(v).trim() === ''
}

// Projesiz doğrulama: şablon ve dosya içi kurallar (import_wbs_areas(p_project_id = null) ile aynı).
export function validateWbsAreaPayload(payload) {
  const errors = []
  const add = (sheet, row, code, field, message) => errors.push({ sheet, row, code, field, message })
  const wbs = payload.wbs ?? []
  const areas = payload.areas ?? []
  const links = payload.links ?? []
  const norm = (rows, keys) => rows.map((r, i) => {
    const o = { row: r.row ?? i + FIRST_DATA_ROW, active: r.active }
    keys.forEach((k) => { o[k] = blank(r[k]) ? null : String(r[k]).trim() })
    return o
  })
  const W = norm(wbs, ['code', 'name', 'parent_code', 'discipline', 'notes'])
  const A = norm(areas, ['code', 'name', 'area_type', 'parent_code', 'notes'])
  const L = norm(links, ['area_code', 'wbs_code'])

  if (W.length > MAX_ROWS) add(SHEET_WBS, null, 'row_limit', null, `WBS sayfasında en fazla ${MAX_ROWS} satır olabilir`)
  if (A.length > MAX_ROWS) add(SHEET_AREAS, null, 'row_limit', null, `Alanlar sayfasında en fazla ${MAX_ROWS} satır olabilir`)
  if (L.length > MAX_ROWS) add(SHEET_LINKS, null, 'row_limit', null, `Alan-WBS sayfasında en fazla ${MAX_ROWS} satır olabilir`)

  const activeOk = (v) => v === undefined || v === null || typeof v === 'boolean'
  const firstRow = (rows, keyFn) => {
    const m = new Map()
    rows.forEach((r) => { const k = keyFn(r); if (k !== null && (!m.has(k) || r.row < m.get(k))) m.set(k, r.row) })
    return m
  }
  const wFirst = firstRow(W, (r) => r.code)
  const aFirst = firstRow(A, (r) => r.code)
  const lFirst = firstRow(L, (r) => (r.area_code && r.wbs_code ? `${r.area_code}|${r.wbs_code}` : null))

  for (const r of W) {
    if (!r.code) add(SHEET_WBS, r.row, 'required_missing', 'code', 'WBS kodu boş')
    if (!r.name) add(SHEET_WBS, r.row, 'required_missing', 'name', 'WBS adı boş')
    if (r.code && !WBS_CODE_RE.test(r.code)) add(SHEET_WBS, r.row, 'code_format', 'code', `WBS kodu yalnızca büyük harf, rakam ve tire içerebilir, harf/rakamla başlar: ${r.code}`)
    if (!activeOk(r.active)) add(SHEET_WBS, r.row, 'value_invalid', 'active', 'Aktif yalnızca Evet veya Hayır olabilir')
    if (r.discipline && !DISCIPLINES.includes(r.discipline)) add(SHEET_WBS, r.row, 'discipline_unknown', 'discipline', `Bilinmeyen disiplin: ${r.discipline}`)
    if (r.code && wFirst.get(r.code) !== r.row) add(SHEET_WBS, r.row, 'duplicate_in_file', 'code', `WBS kodu dosyada tekrar ediyor: ${r.code} (ilk satır ${wFirst.get(r.code)})`)
    if (r.code && r.parent_code === r.code) add(SHEET_WBS, r.row, 'self_parent', 'parent_code', `WBS kendi üstü olamaz: ${r.code}`)
  }
  for (const r of A) {
    if (!r.code) add(SHEET_AREAS, r.row, 'required_missing', 'code', 'Alan kodu boş')
    if (!r.name) add(SHEET_AREAS, r.row, 'required_missing', 'name', 'Alan adı boş')
    if (r.code && !AREA_CODE_RE.test(r.code)) add(SHEET_AREAS, r.row, 'code_format', 'code', `Alan kodu yalnızca büyük harf ve rakam içerebilir (tire yok): ${r.code}`)
    if (!activeOk(r.active)) add(SHEET_AREAS, r.row, 'value_invalid', 'active', 'Aktif yalnızca Evet veya Hayır olabilir')
    if (r.area_type && !AREA_TYPES.includes(r.area_type)) add(SHEET_AREAS, r.row, 'value_invalid', 'area_type', `Geçersiz alan tipi: ${r.area_type}`)
    if (r.code && aFirst.get(r.code) !== r.row) add(SHEET_AREAS, r.row, 'duplicate_in_file', 'code', `Alan kodu dosyada tekrar ediyor: ${r.code} (ilk satır ${aFirst.get(r.code)})`)
    if (r.code && r.parent_code === r.code) add(SHEET_AREAS, r.row, 'self_parent', 'parent_code', `Alan kendi üstü olamaz: ${r.code}`)
  }
  for (const r of L) {
    if (!r.area_code) add(SHEET_LINKS, r.row, 'required_missing', 'area_code', 'Alan kodu boş')
    if (!r.wbs_code) add(SHEET_LINKS, r.row, 'required_missing', 'wbs_code', 'WBS kodu boş')
    const k = r.area_code && r.wbs_code ? `${r.area_code}|${r.wbs_code}` : null
    if (k && lFirst.get(k) !== r.row) add(SHEET_LINKS, r.row, 'duplicate_in_file', null, `Alan-WBS çifti dosyada tekrar ediyor: ${r.area_code} / ${r.wbs_code} (ilk satır ${lFirst.get(k)})`)
  }

  // Hiyerarşi: dosyadaki ilk geçişler (projesiz modda proje kaydı yok)
  const hierarchy = (rows, first, sheet, label) => {
    const nodes = new Map()
    rows.filter((r) => r.code && first.get(r.code) === r.row).forEach((r) => {
      nodes.set(r.code, { ...r, isActive: typeof r.active === 'boolean' ? r.active : true })
    })
    for (const n of nodes.values()) {
      if (n.parent_code && n.parent_code !== n.code && !nodes.has(n.parent_code)) {
        add(sheet, n.row, 'parent_missing', 'parent_code', `Üst ${label} kodu ne dosyada ne projede var: ${n.parent_code}`)
      }
      const p = n.parent_code ? nodes.get(n.parent_code) : null
      if (p && n.isActive && !p.isActive) {
        add(sheet, n.row, 'inactive_parent_active_child', 'active',
          `Üst ${label} pasifken alt ${label} aktif olamaz: ${n.code} (üst ${n.parent_code})`)
      }
      if (n.parent_code && n.parent_code !== n.code) {
        const seen = new Set([n.code])
        let cur = n.parent_code
        while (cur && nodes.has(cur) && !seen.has(cur)) {
          seen.add(cur)
          cur = nodes.get(cur).parent_code
        }
        if (cur === n.code) add(sheet, n.row, 'cycle', 'parent_code', `${label} hiyerarşisinde döngü: ${n.code}`)
      }
    }
    return nodes
  }
  const wNodes = hierarchy(W, wFirst, SHEET_WBS, 'WBS')
  const aNodes = hierarchy(A, aFirst, SHEET_AREAS, 'alan')
  for (const r of L) {
    if (r.area_code && !aNodes.has(r.area_code)) add(SHEET_LINKS, r.row, 'link_area_missing', 'area_code', `Alan kodu ne Alanlar sayfasında ne projede var: ${r.area_code}`)
    if (r.wbs_code && !wNodes.has(r.wbs_code)) add(SHEET_LINKS, r.row, 'link_wbs_missing', 'wbs_code', `WBS kodu ne WBS sayfasında ne projede var: ${r.wbs_code}`)
  }
  return sortErrors(errors)
}

// Rapor metni (konsol ve .kontrol.md için)
export function formatValidationReport({ fileName, payload, parseErrors, errors }) {
  const all = [...parseErrors, ...errors]
  const lines = [
    `# WBS/alan şablon kontrolü — ${fileName}`,
    '',
    `Satır sayısı: WBS ${payload.wbs.length}, Alanlar ${payload.areas.length}, Alan-WBS ${payload.links.length}`,
    `Sonuç: ${all.length === 0 ? 'HATA YOK (proje olmadan yapılabilen kontroller)' : `${all.length} hata`}`,
    '',
  ]
  if (all.length) {
    lines.push('| Sayfa | Satır | Kod | Açıklama |', '|---|---|---|---|')
    for (const e of all) lines.push(`| ${e.sheet} | ${e.row ?? '-'} | ${e.code} | ${String(e.message).replace(/\|/g, '/')} |`)
    lines.push('')
  }
  lines.push('Not: Projedeki kayıtlara bakan kontroller (üst kodun veya bağ kodunun projede bulunması, dosyada olmayan aktif alt kayıt, Activity ID etkisi)',
    'yalnızca proje seçilerek yapılan önizlemede (import_wbs_areas) çalışır.')
  return lines.join('\n')
}
