import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import { signIn } from './helpers.js'

// XLSX (SheetJS) tamamen kaldırıldı (bkz. CLAUDE.md "Son değişiklik" — 10.09.2026,
// güvenlik açığı nedeniyle exceljs'e geçiş) — bu test dosyası da aynı kütüphaneye
// geçirildi. SheetJS'in `.v`'si ExcelJS'te `cell.value`, `.f`'i `cell.formula`'ya
// karşılık gelir; `sheet_to_json(header:1, defval:null)` eşdeğeri aşağıdaki
// `sheetRows()` yardımcısıyla üretiliyor.
function cellToPlain(v) {
  if (v === undefined || v === null) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('')
    if (v.text !== undefined) return v.text
    if (v.result !== undefined) return v.result
  }
  return v
}

function sheetRows(sheet) {
  // ExcelJS'in row.values'ı, satırda YALNIZCA bazı ara kolonlar hiç set edilmemişse
  // (ör. otomatik risklerde Olasılık/Etki/Skoru hiç yazılmıyor) gerçek bir "sparse
  // array" (delik/hole) dönebiliyor — .slice()/.map() delikleri ATLAYIP korur, bu
  // da index bazlı erişimde (ör. row[5]) undefined'a yol açar (SheetJS'in
  // sheet_to_json(header:1, defval:null)'ı bu delikleri null ile doldururdu).
  // Array.from({length}, ...) her index'i AÇIKÇA ziyaret ettiğinden delik sorunu
  // yaşanmıyor — çözüm bu, uzunluk pad'lemek değil.
  const width = sheet.columnCount
  const rows = []
  sheet.eachRow({ includeEmpty: true }, row => {
    rows.push(Array.from({ length: width }, (_, i) => cellToPlain(row.values[i + 1])))
  })
  return rows
}

test('proje Excel export bütçe özetini ve dinamik ağırlık toplamını üretir', async () => {
  const { client } = await signIn(
    process.env.TEST_PROJEYONETICISI_EMAIL,
    process.env.TEST_PROJEYONETICISI_PASSWORD,
  )
  const session = (await client.auth.getSession()).data.session
  const projectId = process.env.TEST_PROJECT_IZMIR

  const response = await fetch(
    `${process.env.VITE_SUPABASE_URL}/functions/v1/export-project-excel?project_id=${encodeURIComponent(projectId)}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.VITE_SUPABASE_ANON_KEY,
      },
    },
  )
  expect(response.status).toBe(200)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await response.arrayBuffer())
  const budget = workbook.getWorksheet('Bütçe')
  const weights = workbook.getWorksheet('Kategori Ağırlıkları')
  const risks = workbook.getWorksheet('Riskler')
  expect(budget).toBeTruthy()
  expect(weights).toBeTruthy()
  expect(risks).toBeTruthy()

  expect(budget.getCell('G4').value).toBe('KATEGORİ REHBERİ')
  expect(budget.getCell('J4').value).toBe('BÜTÇE ÖZETİ (OTOMATİK)')
  expect(budget.getCell('K6').formula).toBe('SUMIF($A$6:$A$304,"panel",$C$6:$C$304)')
  expect(budget.getCell('K18').formula).toBe('SUM(K6:K17)')
  expect(budget.getCell('K20').formula).toBe('COUNTIF($A$6:$A$304,"<>")')

  const weightRows = sheetRows(weights)
  const totalIndex = weightRows.findIndex(row => row[0] === 'TOPLAM')
  expect(totalIndex).toBeGreaterThan(4)
  const totalRow = totalIndex + 1
  expect(weights.getCell(`B${totalRow}`).formula).toBe(`SUM(B5:B${totalRow - 1})`)

  const riskRows = sheetRows(risks)
  const automaticRisk = riskRows.find(row => String(row[1] || '').startsWith('Görev gecikti:'))
  expect(automaticRisk).toBeTruthy()
  expect(['orta', 'yüksek', 'kritik']).toContain(automaticRisk[6])
  expect(automaticRisk[5]).toBeNull()
})
