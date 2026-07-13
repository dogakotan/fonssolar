import * as XLSX from 'xlsx'

// Excel seri tarih ya da string → YYYY-MM-DD
function toDateStr(val) {
  if (!val && val !== 0) return ''
  if (typeof val === 'string') {
    const dot = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
    if (dot) return `${dot[3]}-${dot[2].padStart(2, '0')}-${dot[1].padStart(2, '0')}`
    const iso = val.match(/^\d{4}-\d{2}-\d{2}/)
    if (iso) return val.slice(0, 10)
    return ''
  }
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (!d) return ''
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return ''
}

const CAT_MAP = {
  mobilizasyon: 'mobilizasyon',
  mekanik: 'mekanik',
  'elektrik dc': 'elektrik_dc', elektrik_dc: 'elektrik_dc',
  'elektrik ac': 'elektrik_ac', elektrik_ac: 'elektrik_ac',
  'elektrik og': 'elektrik_og', elektrik_og: 'elektrik_og',
  topraklama: 'topraklama',
  enh: 'enh',
  'devreye alma': 'devreye_alma', devreye_alma: 'devreye_alma',
  'evrak sureci': 'evrak_sureci', evrak_sureci: 'evrak_sureci', 'evrak süreci': 'evrak_sureci',
  'satin alma': 'satin_alma', satin_alma: 'satin_alma', 'satın alma': 'satin_alma',
}

function normCat(val, fallback = 'mekanik') {
  if (!val) return fallback
  return CAT_MAP[String(val).toLowerCase().trim()] || fallback
}

function toBoolTR(val) {
  if (!val) return false
  return /^(evet|true|1|yes|x|✓)$/i.test(String(val).trim())
}

const VALID_UNITS = ['adet', 'm', 'm²', 'm³', 'kg', 'ton', 'rulo', 'kutu']

// Satır objesinden herhangi bir anahtar adıyla değer al
function pick(row, ...keys) {
  for (const k of keys) {
    const norm = k.toLowerCase().replace(/[\s_]+/g, '')
    const found = Object.keys(row).find(
      rk => rk.toLowerCase().replace(/[\s_]+/g, '') === norm
    )
    if (found !== undefined && row[found] !== '' && row[found] !== null && row[found] !== undefined)
      return row[found]
  }
  return ''
}

// Dosyayı XLSX workbook olarak oku
function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        resolve(XLSX.read(e.target.result, { type: 'array', cellDates: false }))
      } catch (err) {
        reject(new Error('Excel dosyası okunamadı: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Dosya okunamadı'))
    reader.readAsArrayBuffer(file)
  })
}

// "İş Kalemleri" sayfasını parse et → project_tasks satırları (Gantt görevi +
// varsa ölçülebilir ilerleme hedefi — birim/hedef miktar/dashboard alanları tek satırda)
export async function parseIsKalemleri(file) {
  const wb = await readWorkbook(file)
  const sheetName =
    wb.SheetNames.find(n => /iş|is|görev|gorev|task/i.test(n)) ||
    wb.SheetNames[0]
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })

  const rows = raw
    .map((r, i) => {
      const rawUnit = String(pick(r, 'birim', 'unit') || '').trim().toLowerCase()
      return {
        _id:               Date.now() + i,
        task_code:         String(pick(r, 'görev kodu', 'task_code', 'kod', 'no') || '').trim(),
        task_name:         String(pick(r, 'görev adı', 'görev adi', 'task_name', 'görev', 'gorev', 'ad', 'name') || '').trim(),
        category:          normCat(pick(r, 'kategori', 'category')),
        sub_category:      String(pick(r, 'alt kategori', 'sub_category', 'ilgili kurum', 'kurum') || '').trim(),
        planned_start:     toDateStr(pick(r, 'başlangıç', 'plan başlangıç', 'planned_start', 'baslangic', 'start')),
        planned_end:       toDateStr(pick(r, 'bitiş', 'plan bitiş', 'planned_end', 'bitis', 'end')),
        progress_pct:      String(pick(r, 'ilerleme', 'progress_pct', '%') || 0),
        status:            'beklemede',
        responsible:       String(pick(r, 'sorumlu', 'responsible') || '').trim(),
        team_size:         String(pick(r, 'ekip', 'team_size', 'ekip sayısı', 'ekip sayisi') || '').trim(),
        equipment_notes:   String(pick(r, 'ekipman', 'equipment_notes') || '').trim(),
        notes:             String(pick(r, 'notlar', 'notes', 'not') || '').trim(),
        unit:              VALID_UNITS.includes(rawUnit) ? rawUnit : '',
        target_qty:        String(Number(pick(r, 'hedef miktar', 'target_qty', 'hedef', 'miktar') || 0)),
        dashboard_visible: toBoolTR(pick(r, 'dashboard göster', 'dashboard goster', 'dashboard_visible')),
        dashboard_order:   String(Number(pick(r, 'dashboard sıra', 'dashboard sira', 'dashboard_order') || 0)),
      }
    })
    .filter(r => r.task_name)

  return { rows, sheetName, skippedCount: raw.length - rows.length }
}

// İndirilebilir örnek Excel şablonu oluştur
export function downloadProjectTemplate() {
  const wb = XLSX.utils.book_new()

  // Sayfa 1: İş Kalemleri (Gantt görevi + varsa ölçülebilir ilerleme hedefi)
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['Görev Kodu', 'Görev Adı', 'Kategori', 'Alt Kategori / Kurum', 'Plan Başlangıç', 'Plan Bitiş', 'Sorumlu', 'Ekip Sayısı', 'Ekipman', 'Notlar', 'Birim', 'Hedef Miktar', 'Dashboard Göster', 'Dashboard Sıra'],
    ['T001', 'Mobilizasyon ve Şantiye Kurulumu', 'mobilizasyon', '',   '2026-07-01', '2026-07-07', 'Proje Müdürü', 10,  '', '',                      '',     0,    '', 0],
    ['T002', 'Panel Temel Kazık Çakımı',         'mekanik',       '',   '2026-07-08', '2026-07-30', 'Mekanik Şef', 25,  'Kazık çakma makinesi', '', 'adet', 2500, 'Evet', 1],
    ['T003', 'Solar Panel Montajı',               'mekanik',       '',   '2026-07-20', '2026-08-15', 'Mekanik Şef', 30,  '', '',                     'adet', 3000, 'Evet', 2],
    ['T004', 'DC Kablo Döşeme',                   'elektrik_dc',   '',   '2026-08-01', '2026-08-20', 'Elektrik Şefi', 15, '', '',                    'm',    15000, 'Evet', 3],
    ['T005', 'AC Kablo ve Pano',                  'elektrik_ac',   '',   '2026-08-10', '2026-08-25', 'Elektrik Şefi', 12, '', '',                    'm',    3000, 'Evet', 4],
    ['T006', 'Devreye Alma',                      'devreye_alma',  '',   '2026-09-01', '2026-09-10', 'Proje Müdürü', 8,  '', '',                      '',     0,    '', 0],
  ])
  ws1['!cols'] = [8, 28, 15, 18, 15, 15, 15, 10, 20, 20, 8, 12, 14, 12].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws1, 'İş Kalemleri')

  XLSX.writeFile(wb, 'GES_Proje_Sablonu.xlsx')
}
