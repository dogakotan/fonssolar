// WBS/alan Excel şablonunu üretir (Faz 1 Adım 4).
// Kullanım: node scripts/proje-kontrol/wbs-alan/sablon-uret.mjs [çıktı.xlsx] [--bos]
//   varsayılan çıktı: docs/proje-kontrol/sablon/wbs-alan-sablonu.xlsx (kurgu örnek satırlarla)
//   --bos: örnek satırsız şablon
// Veritabanına bağlanmaz, anahtar istemez.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { buildTemplateWorkbook } from '../../../src/utils/wbsAreaExcel.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2)
const empty = args.includes('--bos')
const out = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(root, 'docs/proje-kontrol/sablon/wbs-alan-sablonu.xlsx'))

mkdirSync(path.dirname(out), { recursive: true })
const wb = buildTemplateWorkbook(ExcelJS, { withExamples: !empty })
await wb.xlsx.writeFile(out)
console.log(`Şablon yazıldı: ${out}${empty ? ' (örneksiz)' : ''}`)
