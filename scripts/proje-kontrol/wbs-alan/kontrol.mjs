// WBS/alan Excel dosyasını proje olmadan kontrol eder (Faz 1 Adım 4).
// Kullanım: node scripts/proje-kontrol/wbs-alan/kontrol.mjs <dosya.xlsx>
// Şablon ve dosya içi kuralları çalıştırır (import_wbs_areas'ın projesiz önizlemesiyle aynı kurallar),
// raporu konsola ve <dosya>.kontrol.md'ye yazar. Veritabanına bağlanmaz, anahtar istemez.
// Çıkış kodu: 0 hata yok, 1 hata var, 2 dosya okunamadı.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { parseWbsAreaWorkbook, validateWbsAreaPayload, formatValidationReport } from '../../../src/utils/wbsAreaExcel.js'

const file = process.argv[2]
if (!file) {
  console.error('Kullanım: node scripts/proje-kontrol/wbs-alan/kontrol.mjs <dosya.xlsx>')
  process.exit(2)
}

const wb = new ExcelJS.Workbook()
try {
  await wb.xlsx.readFile(file)
} catch (e) {
  console.error(`Dosya okunamadı: ${e.message}`)
  process.exit(2)
}

const fileName = path.basename(file)
const { payload, parseErrors } = parseWbsAreaWorkbook(wb, fileName)
const errors = validateWbsAreaPayload(payload)
const report = formatValidationReport({ fileName, payload, parseErrors, errors })
const out = file.replace(/\.xlsx$/i, '') + '.kontrol.md'
writeFileSync(out, report + '\n', 'utf8')
console.log(report)
console.log(`\nRapor: ${out}`)
process.exit(parseErrors.length + errors.length > 0 ? 1 : 0)
