import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import {
  buildTemplateWorkbook, parseWbsAreaWorkbook, validateWbsAreaPayload, parseActive,
  SHEET_WBS, SHEET_AREAS, SHEET_LINKS, FIRST_DATA_ROW, COLUMNS,
} from '../src/utils/wbsAreaExcel.js'

// Faz 1 Adım 4: WBS/alan Excel şablonu. Saf testler (DB ve tarayıcı yok, bom-matching.spec.js deseni).
// Beklenen hata listeleri, import_wbs_areas'ın projesiz modunda canlıda ROLLBACK ile alınan sonuçlarla
// birebir aynıdır (taslak-sql/f1_adim4_testler.sql [4b], T26 "projesiz=" sütunu, 12.10.2026).

const BW = [
  { row: 4, code: 'TIZ-100', name: 'Mobilizasyon', discipline: 'general' },
  { row: 5, code: 'TIZ-200', name: 'Mekanik Montaj', discipline: 'mechanical' },
  { row: 6, code: 'TIZ-210', name: 'Kazık Çakımı', parent_code: 'TIZ-200', discipline: 'mechanical' },
  { row: 7, code: 'TIZ-220', name: 'Konstrüksiyon Montajı', parent_code: 'TIZ-200', discipline: 'mechanical' },
  { row: 8, code: 'TIZ-300', name: 'DC Elektrik', discipline: 'dc' },
  { row: 9, code: 'TIZ-310', name: 'DC Kablo Çekimi', parent_code: 'TIZ-300', discipline: 'dc', notes: 'Örnek not' },
]
const BA = [
  { row: 4, code: 'GES', name: 'TIZ GES Sahası', area_type: 'ges' },
  { row: 5, code: 'B1', name: 'PV Blok 1', area_type: 'pv_blok', parent_code: 'GES' },
  { row: 6, code: 'B2', name: 'PV Blok 2', area_type: 'pv_blok', parent_code: 'GES' },
  { row: 7, code: 'INV1', name: 'İnverter İstasyonu 1', area_type: 'inverter_station', parent_code: 'B1' },
  { row: 8, code: 'DEPO', name: 'Saha Deposu', area_type: 'depo' },
]
const BL = [
  { row: 4, area_code: 'B1', wbs_code: 'TIZ-210' },
  { row: 5, area_code: 'B2', wbs_code: 'TIZ-210' },
  { row: 6, area_code: 'B1', wbs_code: 'TIZ-310' },
]
const pl = (wbs = BW, areas = BA, links = BL) => ({ file_name: 't.xlsx', wbs, areas, links })
const codes = (errors) => (errors.length ? errors.map((e) => `${e.sheet}:${e.row ?? '-'}:${e.code}`).join(',') : '-')

// T26 (projesiz mod) — SQL ile aynı beklentiler
const CASES = [
  ['a WBS küçük harf', pl([...BW, { row: 10, code: 'tiz-400', name: 'x' }]), 'WBS:10:code_format'],
  ['b tireli alan', pl(BW, [...BA, { row: 9, code: 'B-3', name: 'x', area_type: 'pv_blok' }]), 'Alanlar:9:code_format'],
  ['c ad boş', pl([...BW, { row: 10, code: 'TIZ-400' }]), 'WBS:10:required_missing'],
  ['d aktif geçersiz', pl([...BW, { row: 10, code: 'TIZ-400', name: 'x', active: 'belki' }]), 'WBS:10:value_invalid'],
  ['e alan tipi', pl(BW, [...BA, { row: 9, code: 'B3', name: 'x', area_type: 'tarla' }]), 'Alanlar:9:value_invalid'],
  ['f disiplin', pl([...BW, { row: 10, code: 'TIZ-400', name: 'x', discipline: 'elektrik' }]), 'WBS:10:discipline_unknown'],
  ['g tekrar WBS', pl([...BW, { row: 10, code: 'TIZ-100', name: 'x' }]), 'WBS:10:duplicate_in_file'],
  ['h tekrar alan', pl(BW, [...BA, { row: 9, code: 'DEPO', name: 'x' }]), 'Alanlar:9:duplicate_in_file'],
  ['i tekrar bağ', pl(BW, BA, [...BL, { row: 7, area_code: 'B1', wbs_code: 'TIZ-210' }]), 'Alan-WBS:7:duplicate_in_file'],
  ['j olmayan üst', pl([...BW, { row: 10, code: 'TIZ-400', name: 'x', parent_code: 'TIZ-999' }]), 'WBS:10:parent_missing'],
  ['k kendi üstü', pl([...BW, { row: 10, code: 'TIZ-400', name: 'x', parent_code: 'TIZ-400' }]), 'WBS:10:self_parent'],
  ['l döngü', pl([...BW, { row: 10, code: 'TIZ-500', name: 'x', parent_code: 'TIZ-510' }, { row: 11, code: 'TIZ-510', name: 'y', parent_code: 'TIZ-500' }]),
    'WBS:10:cycle,WBS:11:cycle'],
  ['m tanımsız bağ', pl(BW, BA, [...BL, { row: 7, area_code: 'B9', wbs_code: 'TIZ-210' }, { row: 8, area_code: 'B1', wbs_code: 'TIZ-999' }]),
    'Alan-WBS:7:link_area_missing,Alan-WBS:8:link_wbs_missing'],
  ['n pasif üst aktif alt', pl(BW.map((r) => (r.code === 'TIZ-200' ? { ...r, active: false } : r))),
    'WBS:6:inactive_parent_active_child,WBS:7:inactive_parent_active_child'],
  ['p satır sınırı', pl(Array.from({ length: 5001 }, (_, i) => ({ row: i + 4, code: `G${String(i + 1).padStart(4, '0')}`, name: 'g' })), [], []),
    'WBS:-:row_limit'],
  ['o dosya dışı aktif alt (projesiz görünmez)', pl([{ row: 4, code: 'TIZ-200', name: 'Mekanik Montaj', active: false }], [], []), '-'],
  ['T30b üst yalnızca projede', pl([{ row: 4, code: 'TIZ-230', name: 'x', parent_code: 'TIZ-200' }], [], []), 'WBS:4:parent_missing'],
]

test.describe('WBS/alan Excel doğrulaması', () => {
  test('temel kurgu dosya hatasız', () => {
    expect(codes(validateWbsAreaPayload(pl()))).toBe('-')
  })

  for (const [name, payload, expected] of CASES) {
    test(`T26 ${name}`, () => {
      expect(codes(validateWbsAreaPayload(payload))).toBe(expected)
    })
  }

  test('Aktif hücresi: Evet/Hayır/boş/geçersiz', () => {
    expect(parseActive('Evet')).toBe(true)
    expect(parseActive('HAYIR')).toBe(false)
    expect(parseActive('hayir')).toBe(false)
    expect(parseActive('')).toBe(null)
    expect(parseActive('belki')).toBe('belki')
  })
})

test.describe('WBS/alan Excel şablonu', () => {
  test('şablon üretilip geri okunur; kolonlar ve örnek satırlar korunur', async () => {
    const wb = buildTemplateWorkbook(ExcelJS)
    const buf = await wb.xlsx.writeBuffer()
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buf)
    const { payload, parseErrors } = parseWbsAreaWorkbook(back, 'sablon.xlsx')
    expect(parseErrors).toEqual([])
    expect(payload.wbs).toEqual(BW.map((r) => ({ ...r, active: true })))
    expect(payload.areas).toEqual(BA.map((r) => ({ ...r, active: true })))
    expect(payload.links).toEqual(BL)
    expect(validateWbsAreaPayload(payload)).toEqual([])
  })

  test('hatalı hücreler Excel satır numarasıyla raporlanır; boş satırlar atlanır', async () => {
    const wb = buildTemplateWorkbook(ExcelJS, { withExamples: false })
    const ws = wb.getWorksheet(SHEET_WBS)
    ws.getCell(FIRST_DATA_ROW, 1).value = 'DYB-010'
    ws.getCell(FIRST_DATA_ROW, 2).value = { richText: [{ text: 'Mobili' }, { text: 'zasyon' }] }
    // 5. satır boş bırakılır
    ws.getCell(FIRST_DATA_ROW + 2, 1).value = 'dyb-020'
    ws.getCell(FIRST_DATA_ROW + 2, 2).value = 'Küçük harfli kod'
    ws.getCell(FIRST_DATA_ROW + 2, 5).value = 'Hayır'
    ws.getCell(FIRST_DATA_ROW + 3, 1).value = 100
    ws.getCell(FIRST_DATA_ROW + 3, 2).value = 'Sayı hücreli kod'
    const areas = wb.getWorksheet(SHEET_AREAS)
    areas.getCell(FIRST_DATA_ROW, 1).value = 'B-1'
    areas.getCell(FIRST_DATA_ROW, 2).value = 'Tireli alan'
    const links = wb.getWorksheet(SHEET_LINKS)
    links.getCell(FIRST_DATA_ROW + 1, 1).value = 'B9'
    links.getCell(FIRST_DATA_ROW + 1, 2).value = 'DYB-010'
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(await wb.xlsx.writeBuffer())
    const { payload } = parseWbsAreaWorkbook(back)
    expect(payload.wbs.map((r) => [r.row, r.code, r.name, r.active])).toEqual([
      [4, 'DYB-010', 'Mobilizasyon', null], [6, 'dyb-020', 'Küçük harfli kod', false], [7, '100', 'Sayı hücreli kod', null]])
    expect(codes(validateWbsAreaPayload(payload))).toBe('WBS:6:code_format,Alanlar:4:code_format,Alan-WBS:5:link_area_missing')
  })

  test('kolon başlığı değiştirilmişse ve sayfa eksikse raporlanır', async () => {
    const wb = buildTemplateWorkbook(ExcelJS)
    wb.getWorksheet(SHEET_WBS).getCell(3, 4).value = 'Disiplin Kodu'
    wb.removeWorksheet(wb.getWorksheet(SHEET_LINKS).id)
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(await wb.xlsx.writeBuffer())
    const { parseErrors } = parseWbsAreaWorkbook(back)
    expect(parseErrors.map((e) => `${e.sheet}:${e.row ?? '-'}:${e.code}`)).toEqual(['WBS:3:header_mismatch', 'Alan-WBS:-:sheet_missing'])
  })

  test('şablon kolonları canlı tablo kolonlarına karşılık gelir; sıra kolonu yok', () => {
    expect(COLUMNS[SHEET_WBS].map((c) => c.key)).toEqual(['code', 'name', 'parent_code', 'discipline', 'active', 'notes'])
    expect(COLUMNS[SHEET_AREAS].map((c) => c.key)).toEqual(['code', 'name', 'area_type', 'parent_code', 'active', 'notes'])
    expect(COLUMNS[SHEET_LINKS].map((c) => c.key)).toEqual(['area_code', 'wbs_code'])
  })
})
