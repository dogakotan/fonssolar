// Proje Excel şablonunu v7'den v8'e çevirir (Faz 1 Adım 5, Karar 57): Proje Bilgileri 13. satır "Proje Kodu *".
// Stiller 12. satırdan kopyalanır. Tekrar çalıştırılırsa değişiklik yapmaz (idempotent).
//   node scripts/proje-kontrol/sablon-v8.mjs [dosya]   (varsayılan public/excel/fons-solar-proje-sablonu.xlsx)
// Senkron tutulması gereken diğer yerler: supabase/functions/export-project-excel/template_builder.ts (label 13),
// import-project-excel (E13 okur), export-project-excel (E13 yazar).
import ExcelJS from 'exceljs'

const file = process.argv[2] || 'public/excel/fons-solar-proje-sablonu.xlsx'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const p = wb.getWorksheet('Proje Bilgileri')
if (!p) throw new Error('"Proje Bilgileri" sayfası yok')

const already = String(p.getCell('B13').value ?? '').startsWith('Proje Kodu')
if (already) {
  console.log('Şablon zaten v8 (B13 = Proje Kodu); değişiklik yok.')
  process.exit(0)
}
if (p.getCell('B13').value || p.getCell('E13').value) throw new Error('13. satır boş değil; elle kontrol edin')

const copyStyle = (from, to) => { p.getCell(to).style = JSON.parse(JSON.stringify(p.getCell(from).style || {})) }
p.mergeCells('B13:D13')
copyStyle('B12', 'B13')
p.getCell('B13').value = 'Proje Kodu *'
p.mergeCells('E13:F13')
copyStyle('E12', 'E13')
p.getCell('E13').value = null
copyStyle('H12', 'H13')
p.getCell('H13').value = '2-5 karakter, harfle başlar, büyük harf/rakam (ör. DYB). Sonradan değiştirilemez'
p.getRow(13).height = p.getRow(12).height
// Biçim kontrolü: Excel'de büyük harf/rakam, 2-5 karakter, harfle başlar
p.getCell('E13').dataValidation = {
  type: 'custom', allowBlank: true, showErrorMessage: true,
  formulae: ['AND(LEN(E13)>=2,LEN(E13)<=5,EXACT(E13,UPPER(E13)),ISERROR(VALUE(LEFT(E13,1))))'],
  errorTitle: 'Proje kodu', error: '2-5 karakter, harfle başlar, yalnızca büyük harf ve rakam (ör. DYB, ADN1).',
}

const g = wb.worksheets.find(w => w.name.includes('Kılavuz'))
if (g) {
  const banner = 'Şablon v8 (12.10.2026: Proje Bilgileri E13 Proje Kodu eklendi; ağırlıksız kategoriye görev yazılamaz)'
  for (let c = 2; c <= 5; c++) if (String(g.getCell(2, c).value ?? '').startsWith('Şablon v')) g.getCell(2, c).value = banner
  g.getCell('E5').value = 'Proje ID: küçük harf, boşluksuz, tire. Proje Kodu (E13): 2-5 karakter, harfle başlar, büyük harf/rakam (ör. DYB); yeni projede zorunlu, sonradan değiştirilemez. Mevcut projeyi güncellerken E13 projenin koduyla aynı olmalı, yoksa yükleme reddedilir. Tür ve Durum dropdown. Toplam Gün otomatik.'
  g.getCell('E7').value = 'Genel proje ilerlemesi ağırlık tablosundaki kategorilerin ağırlıklı ortalamasıdır. Buradan veri içeri aktarılmaz. Ağırlık tablosunda olmayan kategoriye görev yazılamaz: önce ağırlık tanımlayın, fiziksel değilse %0 girin.'
}

await wb.xlsx.writeFile(file)
console.log(`v8 yazıldı: ${file}`)
