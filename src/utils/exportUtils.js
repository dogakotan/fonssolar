import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'

// ─── Fons Solar Marka Sabitleri ───────────────────────────────────────────────
const BRAND = {
  primary:   [24,  95, 165],   // #185FA5
  secondary: [15, 110,  86],   // #0F6E56
  dark:      [17,  24,  39],   // #111827
  muted:     [100, 116, 139],  // #64748B
  lightBg:   [245, 247, 250],  // #F5F7FA
  white:     [255, 255, 255],
  border:    [226, 232, 240],  // #E2E8F0
}

const PERIYOT_LABEL = { gunluk: 'Günlük', haftalik: 'Haftalık', aylik: 'Aylık' }

function nowLabel() {
  return new Date().toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fileDate() {
  return new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')
}

// jsPDF'in yerleşik 'helvetica' fontu Türkçe ş/ğ/ı/İ karakterlerini render edemiyor
// (WinAnsi/Latin-1 kodlamasında yoklar) — Unicode TTF (Roboto, SIL OFL 1.1) gömülüyor.
// Ayrı dosyadan dinamik import ediliyor ki bu ~650KB'lık font, PDF üretilmeyen
// sayfalarda ana bundle'a dahil olmasın (yalnızca tıklanınca yüklensin).
async function registerUnicodeFont(doc) {
  const { ROBOTO_REGULAR_BASE64 } = await import('../assets/fonts/robotoBase64.js')
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64)
  for (const style of ['normal', 'bold', 'italic', 'bolditalic']) {
    doc.addFont('Roboto-Regular.ttf', 'Roboto', style)
  }
  doc.setFont('Roboto', 'normal')
}

// ─── EXCEL EXPORT ─────────────────────────────────────────────────────────────
export function exportToExcel(title, periyot, columns, rows) {
  const periyotLabel = PERIYOT_LABEL[periyot] || periyot
  const wb = XLSX.utils.book_new()

  // Başlık bloğu + veri
  const headerRows = [
    ['FONS SOLAR'],
    [`${title} — ${periyotLabel} Raporu`],
    [`Oluşturulma: ${nowLabel()}`],
    [],                      // boş ayraç
    columns,                 // kolon başlıkları
    ...rows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(headerRows)

  // Kolon genişlikleri — başlık satırındaki en uzun içeriğe göre
  const colCount = columns.length
  const widths = Array(colCount).fill(0)
  rows.forEach(row =>
    row.forEach((cell, i) => {
      const len = String(cell ?? '').length
      if (len > widths[i]) widths[i] = len
    })
  )
  columns.forEach((col, i) => {
    if (String(col).length > widths[i]) widths[i] = String(col).length
  })
  ws['!cols'] = widths.map(w => ({ wch: Math.max(w + 4, 14) }))

  // Merge: başlık satırlarını tüm kolonlara yay
  if (colCount > 1) {
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
    ]
  }

  // Hücre stilleri (xlsx CE sınırlı — temel kalın/zemin)
  const styleHeader = { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '185FA5' } }, alignment: { horizontal: 'left' } }
  const styleTitle  = { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F6E56' } }, alignment: { horizontal: 'left' } }
  const styleMeta   = { font: { sz: 9, color: { rgb: '64748B' } }, fill: { fgColor: { rgb: 'F5F7FA' } } }
  const styleCol    = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center' } }

  const cellRef = (r, c) => XLSX.utils.encode_cell({ r, c })

  if (ws[cellRef(0, 0)]) ws[cellRef(0, 0)].s = styleHeader
  if (ws[cellRef(1, 0)]) ws[cellRef(1, 0)].s = styleTitle
  if (ws[cellRef(2, 0)]) ws[cellRef(2, 0)].s = styleMeta
  columns.forEach((_, i) => {
    const ref = cellRef(4, i)
    if (ws[ref]) ws[ref].s = styleCol
  })

  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31))
  XLSX.writeFile(wb, `FonsSolar_${title}_${periyotLabel}_${fileDate()}.xlsx`)
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
export async function exportToPdf(title, periyot, columns, rows, opts = {}) {
  const {
    orientation = 'landscape',
    subtitle = '',
    projectName = '',
    footerText = 'Fons Solar Enerji A.Ş. — Gizli ve Şirkete Özeldir',
  } = opts

  const periyotLabel = PERIYOT_LABEL[periyot] || periyot
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  await registerUnicodeFont(doc)
  const W = doc.internal.pageSize.getWidth()

  // ── Üst başlık bandı ────────────────────────────────────────────────────
  doc.setFillColor(...BRAND.primary)
  doc.rect(0, 0, W, 22, 'F')

  // "FONS SOLAR" sol
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...BRAND.white)
  doc.text('FONS SOLAR', 14, 14)

  // Tarih sağ
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.text(nowLabel(), W - 14, 14, { align: 'right' })

  // ── İkinci bant — rapor başlığı ────────────────────────────────────────
  doc.setFillColor(...BRAND.secondary)
  doc.rect(0, 22, W, 11, 'F')

  doc.setFont('Roboto', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND.white)
  doc.text(`${title}`, 14, 29.5)

  // Sağ: periyot + proje adı
  const metaRight = [periyotLabel, projectName].filter(Boolean).join(' | ')
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.text(metaRight, W - 14, 29.5, { align: 'right' })

  // ── Opsiyonel alt başlık ───────────────────────────────────────────────
  let startY = 38
  if (subtitle) {
    doc.setFont('Roboto', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.muted)
    doc.text(subtitle, 14, 36)
    startY = 41
  }

  // ── Tablo ──────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY,
    head: [columns],
    body: rows,
    styles: {
      font: 'Roboto',
      fontSize: 8,
      cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
      textColor: BRAND.dark,
      lineColor: BRAND.border,
      lineWidth: 0.1,
    },
    headStyles: {
      font: 'Roboto',
      fillColor: BRAND.primary,
      textColor: BRAND.white,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: BRAND.lightBg,
    },
    rowPageBreak: 'auto',
    margin: { left: 14, right: 14 },

    // ── Sayfa alt bilgisi ──────────────────────────────────────────────
    didDrawPage(data) {
      const pageH = doc.internal.pageSize.getHeight()
      const pageW = doc.internal.pageSize.getWidth()

      // Alt çizgi
      doc.setDrawColor(...BRAND.border)
      doc.setLineWidth(0.3)
      doc.line(14, pageH - 10, pageW - 14, pageH - 10)

      // Sol: şirket adı
      doc.setFont('Roboto', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...BRAND.muted)
      doc.text(footerText, 14, pageH - 6)

      // Sağ: sayfa numarası
      const pageNum = `Sayfa ${data.pageNumber}`
      doc.text(pageNum, pageW - 14, pageH - 6, { align: 'right' })
    },
  })

  doc.save(`FonsSolar_${title}_${periyotLabel}_${fileDate()}.pdf`)
}

// ─── KAPSAMLI PROJE RAPORU — PDF ─────────────────────────────────────────────
/**
 * exportGunlukRaporPdf(project, workPackages, ilerlemeData, personelRaporu, opts)
 *
 * Örnek PDF çıktısıyla eşleşen tam günlük rapor:
 *  • FONS SOLAR header bandı
 *  • KPI özeti (4 kutu)
 *  • Personel & İş Makinası tablosu
 *  • A — Bugün / B — Yarın yapılacak işler
 *  • C — Genel İlerleme Durumu (MEKANİK + ELEKTRİK)
 *  • İş Paketleri tam listesi
 *  • Her sayfada footer
 */
export async function exportGunlukRaporPdf(project, workPackages = [], ilerlemeData = [], personelRaporu = null, opts = {}) {
  const { selectedDate = null } = opts
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await registerUnicodeFont(doc)
  const W = doc.internal.pageSize.getWidth()   // 210 mm

  // ── Tarih etiketi ────────────────────────────────────────────────────────────
  const rapTarih = selectedDate
    ? new Date(selectedDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })
    : new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })

  const projAd = project?.name || opts.projectName || 'GES PROJESİ'
  const kapsite = project?.capacity_kwp ? `${Number(project.capacity_kwp).toLocaleString('tr-TR')} kWp` : ''

  // ── Footer yardımcısı ────────────────────────────────────────────────────────
  function drawFooter() {
    const pH = doc.internal.pageSize.getHeight()
    doc.setDrawColor(...BRAND.border)
    doc.setLineWidth(0.3)
    doc.line(14, pH - 10, W - 14, pH - 10)
    doc.setFont('Roboto', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRAND.muted)
    doc.text('Fons Solar Enerji A.Ş. — Gizli ve Şirkete Özeldir', 14, pH - 6)
    const pn = `Sayfa ${doc.internal.getCurrentPageInfo().pageNumber}`
    doc.text(pn, W - 14, pH - 6, { align: 'right' })
  }

  // ── Bölüm başlığı çizici ─────────────────────────────────────────────────────
  function sectionTitle(y, letter, text) {
    doc.setFillColor(...BRAND.primary)
    doc.roundedRect(14, y, 6, 6, 1, 1, 'F')
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.white)
    doc.text(letter, 17, y + 4.5, { align: 'center' })
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.dark)
    doc.text(text, 22, y + 4.5)
    return y + 10
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // SAYFA 1 — Başlık + KPI + Personel
  // ──────────────────────────────────────────────────────────────────────────────

  // Header bandı (mavi)
  doc.setFillColor(...BRAND.primary)
  doc.rect(0, 0, W, 22, 'F')
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...BRAND.white)
  doc.text('FONS SOLAR', 14, 14)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.text(rapTarih, W - 14, 14, { align: 'right' })

  // Alt bant (yeşil)
  doc.setFillColor(...BRAND.secondary)
  doc.rect(0, 22, W, 11, 'F')
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND.white)
  doc.text(projAd, 14, 29.5)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  const rightMeta = ['Günlük Raporu', kapsite].filter(Boolean).join(' — ')
  doc.text(rightMeta, W - 14, 29.5, { align: 'right' })

  let y = 37

  // ── KPI özeti (4 kutu) ───────────────────────────────────────────────────────
  const total     = workPackages.length
  const completed = workPackages.filter(w => ['completed','done'].includes(w.status)).length
  const late      = workPackages.filter(w => w.status === 'late').length
  const avgPct    = total ? Math.round(workPackages.reduce((s,w) => s + (w.progress || 0), 0) / total) : 0

  const kpis = [
    { label: 'Toplam İş Paketi', value: String(total) },
    { label: 'Tamamlandı',       value: `${completed} (%${total ? Math.round(completed/total*100) : 0})` },
    { label: 'Gecikmiş',         value: String(late) },
    { label: 'Genel İlerleme',   value: `%${avgPct}` },
  ]

  const bw = (W - 28 - 9) / 4
  kpis.forEach((k, i) => {
    const x = 14 + i * (bw + 3)
    doc.setFillColor(...BRAND.lightBg)
    doc.roundedRect(x, y, bw, 18, 2, 2, 'F')
    doc.setDrawColor(...BRAND.border)
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, bw, 18, 2, 2, 'S')
    doc.setFont('Roboto', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRAND.muted)
    doc.text(k.label, x + bw / 2, y + 6, { align: 'center' })
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...BRAND.primary)
    doc.text(k.value, x + bw / 2, y + 14, { align: 'center' })
  })
  y += 22

  // ── Personel & Makine tablosu ────────────────────────────────────────────────
  const p = personelRaporu
  if (p) {
    y = sectionTitle(y, 'P', 'PERSONEL & İŞ MAKİNASI DURUMU')

    const DEPT = [
      { ad: 'İDARİ',     m: p.idari_muhendis,    u: p.idari_usta,    i: p.idari_isci },
      { ad: 'MEKANİK',   m: p.mekanik_muhendis,  u: p.mekanik_usta,  i: p.mekanik_isci },
      { ad: 'ELEKTRİK',  m: p.elektrik_muhendis, u: p.elektrik_usta, i: p.elektrik_isci },
      { ad: 'YEVMİYECİ', m: p.yevmiyeci_muhendis, u: p.yevmiyeci_usta, i: p.yevmiyeci_isci },
    ]

    const MAKS = [
      { label: 'Vinç',       val: p.vinc },
      { label: 'JCB',        val: p.jcb },
      { label: 'Ekskavatör', val: p.ekskavatör || p.ekskavatör },
      { label: 'Kamyon',     val: p.kamyon },
      { label: 'Traktör',    val: p.traktör || p.traktor },
    ].filter(m => m.val != null && m.val !== 0)

    const fmt0 = v => v != null ? String(v) : '0'
    const topla = d => (Number(d.m||0) + Number(d.u||0) + Number(d.i||0))
    const genelToplam = DEPT.reduce((s, d) => s + topla(d), 0)

    const persHead = [['Departman', 'Vardiya Baş.', 'Vardiya Bitiş', 'Mühendis', 'Usta', 'İşçi', 'Toplam']]
    const persBody = [
      ...DEPT.map(d => [d.ad, '08:00', '17:00', fmt0(d.m), fmt0(d.u), fmt0(d.i), String(topla(d))]),
      [{ content: 'GENEL TOPLAM', colSpan: 6, styles: { fontStyle: 'bold', fillColor: BRAND.lightBg } }, { content: String(genelToplam), styles: { fontStyle: 'bold', fillColor: BRAND.lightBg, halign: 'center' } }],
    ]

    autoTable(doc, {
      startY: y, head: persHead, body: persBody,
      styles: { font: 'Roboto', fontSize: 8, cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 }, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: BRAND.lightBg },
      columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
      didDrawPage: drawFooter,
    })

    y = doc.lastAutoTable.finalY + 4

    // Makine kutuları (yatay)
    if (MAKS.length) {
      const mw = Math.min(30, (W - 28) / Math.max(MAKS.length, 1))
      MAKS.forEach((m, i) => {
        const mx = 14 + i * (mw + 2)
        doc.setFillColor(...BRAND.lightBg)
        doc.roundedRect(mx, y, mw, 13, 1.5, 1.5, 'F')
        doc.setDrawColor(...BRAND.border); doc.setLineWidth(0.1)
        doc.roundedRect(mx, y, mw, 13, 1.5, 1.5, 'S')
        doc.setFont('Roboto', 'normal'); doc.setFontSize(7); doc.setTextColor(...BRAND.muted)
        doc.text(m.label, mx + mw/2, y + 5, { align: 'center' })
        doc.setFont('Roboto', 'bold'); doc.setFontSize(11); doc.setTextColor(...BRAND.secondary)
        doc.text(fmt0(m.val), mx + mw/2, y + 11, { align: 'center' })
      })
      y += 18
    }
  }

  // ── A — Bugün Yapılan İşler ──────────────────────────────────────────────────
  const bugunRows = opts.doneTasks?.length
    ? opts.doneTasks.map((desc, i) => [String(i + 1), desc, '—', '—'])
    : workPackages.filter(w => w.status === 'aktif').map((w, i) => [String(i + 1), w.name || w.title || '—', w.category || '—', `%${w.progress || 0}`])

  const yarinRows = opts.plannedTasks?.length
    ? opts.plannedTasks.map((desc, i) => [String(i + 1), desc, '—', '—'])
    : workPackages.filter(w => w.status === 'bekliyor').map((w, i) => [String(i + 1), w.name || w.title || '—', w.category || '—', `%${w.progress || 0}`])

  if (bugunRows.length || yarinRows.length) {
    // Yeni sayfa gerekirse
    const remSpace = doc.internal.pageSize.getHeight() - y - 20
    if (remSpace < 40) { doc.addPage(); y = 20 }

    if (bugunRows.length) {
      y = sectionTitle(y, 'A', 'BUGÜN YAPILAN İŞLER')
      autoTable(doc, {
        startY: y,
        head: [['#', 'İş Kalemi', 'Kategori', 'İlerleme']],
        body: bugunRows,
        styles: { font: 'Roboto', fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
        headStyles: { fillColor: BRAND.secondary, textColor: BRAND.white, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' } },
        alternateRowStyles: { fillColor: BRAND.lightBg },
        margin: { left: 14, right: 14 },
        didDrawPage: drawFooter,
      })
      y = doc.lastAutoTable.finalY + 4
    }

    if (yarinRows.length) {
      const remSpace2 = doc.internal.pageSize.getHeight() - y - 20
      if (remSpace2 < 30) { doc.addPage(); y = 20 }
      y = sectionTitle(y, 'B', 'YARIN YAPILACAK İŞLER')
      autoTable(doc, {
        startY: y,
        head: [['#', 'İş Kalemi', 'Kategori', 'İlerleme']],
        body: yarinRows,
        styles: { font: 'Roboto', fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
        headStyles: { fillColor: [245, 158, 11], textColor: BRAND.white, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' } },
        alternateRowStyles: { fillColor: BRAND.lightBg },
        margin: { left: 14, right: 14 },
        didDrawPage: drawFooter,
      })
      y = doc.lastAutoTable.finalY + 4
    }
  }

  // ── C — Genel İlerleme Durumu ────────────────────────────────────────────────
  if (ilerlemeData.length) {
    const remSpace = doc.internal.pageSize.getHeight() - y - 20
    if (remSpace < 40) { doc.addPage(); y = 20 }
    y = sectionTitle(y, 'C', 'GENEL İLERLEME DURUMU')

    const normalize = r => ({
      name: r.work_item || r.name || r.title || '—',
      category: r.category || '—',
      quantity: r.quantity ?? '—',
      unit: r.unit || r.birim || '—',
      dailyProgress: r.daily_progress ?? '—',
      totalProgress: r.total_progress ?? '—',
      pct: r.progress_percent ?? r.progress ?? 0,
    })

    const rows = ilerlemeData.map(r => {
      const n = normalize(r)
      return [n.category, n.name, String(n.quantity), n.unit, String(n.dailyProgress), String(n.totalProgress), `%${n.pct}`]
    })

    autoTable(doc, {
      startY: y,
      head: [['Kategori', 'İş Kalemi', 'Miktar', 'Birim', 'Günlük', 'Toplam', '%']],
      body: rows,
      styles: { font: 'Roboto', fontSize: 7.5, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 22 },
        2: { halign: 'right', cellWidth: 18 },
        3: { cellWidth: 14 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
      },
      alternateRowStyles: { fillColor: BRAND.lightBg },
      margin: { left: 14, right: 14 },
      didDrawPage: drawFooter,
    })
    y = doc.lastAutoTable.finalY + 4
  }

  // ── D — İş Paketleri Tam Listesi ────────────────────────────────────────────
  if (workPackages.length) {
    const remSpace = doc.internal.pageSize.getHeight() - y - 20
    if (remSpace < 40) { doc.addPage(); y = 20 }
    y = sectionTitle(y, 'D', 'İŞ PAKETLERİ TAM LİSTESİ')

    const STATUS_LABEL = { tamamlandı: 'Tamamlandı', aktif: 'Devam Ediyor', bekliyor: 'Beklemede', gecikmiş: 'Gecikmiş' }

    const rows = workPackages.map((w, i) => [
      String(i + 1),
      w.name || w.title || '—',
      w.category || '—',
      STATUS_LABEL[w.status] || w.status || '—',
      w.due_date ? new Date(w.due_date).toLocaleDateString('tr-TR') : '—',
      `%${w.progress || 0}`,
    ])

    autoTable(doc, {
      startY: y,
      head: [['#', 'İş Paketi', 'Kategori', 'Durum', 'Bitiş Tarihi', 'İlerleme']],
      body: rows,
      styles: { font: 'Roboto', fontSize: 7.5, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        3: { cellWidth: 28 },
        4: { cellWidth: 24 },
        5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: BRAND.lightBg },
      margin: { left: 14, right: 14 },
      didDrawPage: drawFooter,
    })
  }

  // Son sayfaya footer ekle
  drawFooter()

  // Dosya kaydet
  const tarihSlug = (selectedDate ? new Date(selectedDate) : new Date()).toLocaleDateString('tr-TR').replace(/\./g, '-')
  const safeName  = projAd.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_ÇçĞğİıÖöŞşÜü]/g, '')
  doc.save(`FonsSolar_${safeName}_GunlukRapor_${tarihSlug}.pdf`)
}

// ─── KAPSAMLI PROJE RAPORU — EXCEL ───────────────────────────────────────────
/**
 * exportGunlukRaporExcel(project, workPackages, ilerlemeData, personelRaporu, opts)
 *
 * Çok sayfalı Excel:
 *  Sheet 1 — Özet KPI
 *  Sheet 2 — İş Paketleri
 *  Sheet 3 — İlerleme Durumu
 *  Sheet 4 — Personel & Makine
 */
export function exportGunlukRaporExcel(project, workPackages = [], ilerlemeData = [], personelRaporu = null, opts = {}) {
  const { selectedDate = null } = opts
  const wb      = XLSX.utils.book_new()
  const projAd  = project?.name || opts.projectName || 'GES PROJESİ'
  const kapsite = project?.capacity_kwp ? `${Number(project.capacity_kwp).toLocaleString('tr-TR')} kWp` : ''

  const tarihLabel = selectedDate
    ? new Date(selectedDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })
    : new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })

  const STYL = {
    H1: { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '185FA5' } }, alignment: { horizontal: 'left' } },
    H2: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F6E56' } }, alignment: { horizontal: 'left' } },
    META: { font: { sz: 9, color: { rgb: '64748B' } }, fill: { fgColor: { rgb: 'F5F7FA' } } },
    COL: { font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center' } },
    DATA: { font: { sz: 9, color: { rgb: '111827' } } },
    BOLD: { font: { bold: true, sz: 9, color: { rgb: '111827' } } },
  }

  function buildSheet(title, colNames, rows) {
    const aoa = [
      ['FONS SOLAR'],
      [`${projAd}${kapsite ? ' — ' + kapsite : ''}`],
      [`${title} — ${tarihLabel}`],
      [],
      colNames,
      ...rows,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Kolon genişlikleri
    const colCount = colNames.length
    const widths = colNames.map(c => String(c).length)
    rows.forEach(row => row.forEach((cell, i) => { const l = String(cell ?? '').length; if (l > (widths[i] || 0)) widths[i] = l }))
    ws['!cols'] = widths.map(w => ({ wch: Math.max(w + 4, 12) }))

    // Merges
    if (colCount > 1) {
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
      ]
    }

    const cr = (r, c) => XLSX.utils.encode_cell({ r, c })
    if (ws[cr(0,0)]) ws[cr(0,0)].s = STYL.H1
    if (ws[cr(1,0)]) ws[cr(1,0)].s = STYL.H2
    if (ws[cr(2,0)]) ws[cr(2,0)].s = STYL.META
    colNames.forEach((_, i) => { const ref = cr(4, i); if (ws[ref]) ws[ref].s = STYL.COL })

    return ws
  }

  // ── Sheet 1: KPI Özet ────────────────────────────────────────────────────────
  const total     = workPackages.length
  const completed = workPackages.filter(w => w.status === 'tamamlandı').length
  const active    = workPackages.filter(w => w.status === 'aktif').length
  const late      = workPackages.filter(w => w.status === 'gecikmiş').length
  const pending   = workPackages.filter(w => w.status === 'bekliyor').length
  const avgPct    = total ? Math.round(workPackages.reduce((s,w) => s + (w.progress||0), 0) / total) : 0

  const ozet = buildSheet('KPI Özeti', ['Gösterge', 'Değer', 'Açıklama'], [
    ['Proje Adı', projAd, ''],
    ['Kapasite', kapsite, ''],
    ['Konum', project?.location || '—', ''],
    ['Rapor Tarihi', tarihLabel, ''],
    ['', '', ''],
    ['Toplam İş Paketi', total, 'Tüm kayıtlı görevler'],
    ['Tamamlandı', completed, `${total ? Math.round(completed/total*100) : 0}%`],
    ['Devam Ediyor', active, ''],
    ['Beklemede', pending, ''],
    ['Gecikmiş', late, late > 0 ? '⚠️ Dikkat' : 'Normal'],
    ['Genel İlerleme', `%${avgPct}`, 'Ortalama tamamlanma'],
  ])
  XLSX.utils.book_append_sheet(wb, ozet, 'KPI Özeti')

  // ── Sheet 2: İş Paketleri ────────────────────────────────────────────────────
  const STATUS_LABEL = { completed: 'Tamamlandı', done: 'Tamamlandı', active: 'Devam Ediyor', pending: 'Beklemede', late: 'Gecikmiş' }
  const wpSheet = buildSheet('İş Paketleri',
    ['#', 'İş Paketi Adı', 'Kategori', 'Durum', 'Başlangıç', 'Bitiş Tarihi', 'İlerleme %'],
    workPackages.map((w, i) => [
      i + 1,
      w.name || w.title || '—',
      w.category || '—',
      STATUS_LABEL[w.status] || w.status || '—',
      w.start_date ? new Date(w.start_date).toLocaleDateString('tr-TR') : '—',
      w.due_date   ? new Date(w.due_date).toLocaleDateString('tr-TR')   : '—',
      `%${w.progress || 0}`,
    ])
  )
  XLSX.utils.book_append_sheet(wb, wpSheet, 'İş Paketleri')

  // ── Sheet 3: İlerleme Durumu ─────────────────────────────────────────────────
  if (ilerlemeData.length) {
    const ilerSheet = buildSheet('İlerleme Durumu',
      ['Kategori', 'İş Kalemi', 'Miktar', 'Birim', 'Günlük İlerleme', 'Toplam İlerleme', 'İlerleme %', 'Açıklama'],
      ilerlemeData.map(r => [
        r.category || '—',
        r.work_item || r.name || r.title || '—',
        r.quantity ?? '—',
        r.unit || r.birim || '—',
        r.daily_progress ?? 0,
        r.total_progress ?? 0,
        `%${r.progress_percent ?? r.progress ?? 0}`,
        r.description || r.aciklama || '',
      ])
    )
    XLSX.utils.book_append_sheet(wb, ilerSheet, 'İlerleme Durumu')
  }

  // ── Sheet 4: Personel & Makine ───────────────────────────────────────────────
  if (personelRaporu) {
    const p = personelRaporu
    const persRows = [
      ['İDARİ',     '08:00', '17:00', p.idari_muhendis||0, p.idari_usta||0, p.idari_isci||0, (p.idari_muhendis||0)+(p.idari_usta||0)+(p.idari_isci||0)],
      ['MEKANİK',   '08:00', '17:00', p.mekanik_muhendis||0, p.mekanik_usta||0, p.mekanik_isci||0, (p.mekanik_muhendis||0)+(p.mekanik_usta||0)+(p.mekanik_isci||0)],
      ['ELEKTRİK',  '08:00', '17:00', p.elektrik_muhendis||0, p.elektrik_usta||0, p.elektrik_isci||0, (p.elektrik_muhendis||0)+(p.elektrik_usta||0)+(p.elektrik_isci||0)],
      ['YEVMİYECİ', '08:00', '17:00', p.yevmiyeci_muhendis||0, p.yevmiyeci_usta||0, p.yevmiyeci_isci||0, (p.yevmiyeci_muhendis||0)+(p.yevmiyeci_usta||0)+(p.yevmiyeci_isci||0)],
    ]
    const persSheet = buildSheet('Personel ve Makine',
      ['Departman', 'Vardiya Baş.', 'Vardiya Bitiş', 'Mühendis', 'Usta', 'İşçi', 'Toplam'],
      persRows
    )
    // Makine verileri ekle
    const mStart = 4 + 1 + persRows.length + 2
    const makRows = [
      ['İŞ MAKİNASI', '', '', '', '', '', ''],
      ['Vinç', p.vinc||0, '', '', '', '', ''],
      ['JCB', p.jcb||0, '', '', '', '', ''],
      ['Ekskavatör', p.ekskavatör||0, '', '', '', '', ''],
      ['Kamyon', p.kamyon||0, '', '', '', '', ''],
      ['Traktör', p.traktör||p.traktor||0, '', '', '', '', ''],
    ]
    XLSX.utils.sheet_add_aoa(persSheet, makRows, { origin: mStart })
    XLSX.utils.book_append_sheet(wb, persSheet, 'Personel ve Makine')
  }

  const tarihSlug  = (selectedDate ? new Date(selectedDate) : new Date()).toLocaleDateString('tr-TR').replace(/\./g, '-')
  const safeName   = projAd.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_ÇçĞğİıÖöŞşÜü]/g, '')
  XLSX.writeFile(wb, `FonsSolar_${safeName}_GunlukRapor_${tarihSlug}.xlsx`)
}

// ─── DÖNEM (HAFTALIK/AYLIK) İLERLEME RAPORU — MÜŞTERİ EXPORT'U ───────────────
// Günlük rapor formatındaki gibi bölümlü (personel/ekipman/iş kalemi/notlar/
// fotoğraf) ama dönem toplamı olarak. Maliyet/tedarik/talep/fatura ve kişi adı
// hiç göstermez — sadece buildPeriodReportData()'nın topladığı veriyi render eder.
async function fetchImageAsDataUrl(publicUrl) {
  try {
    const res = await fetch(publicUrl)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function storagePublicUrl(bucket, path) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bshhgvdzemgfijkzhcrf.supabase.co'
  const safePath = String(path || '')
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/')
  return `${baseUrl}/storage/v1/object/public/${bucket}/${safePath}`
}

export async function exportPeriodReportPdf(project, periodLabel, periodRangeLabel, data, opts = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await registerUnicodeFont(doc)
  const W = doc.internal.pageSize.getWidth()
  const projAd = project?.name || opts.projectName || 'GES PROJESİ'
  const kapsite = project?.capacityKwp ? `${Number(project.capacityKwp).toLocaleString('tr-TR')} kWp` : ''

  function drawFooter() {
    const pH = doc.internal.pageSize.getHeight()
    doc.setDrawColor(...BRAND.border)
    doc.setLineWidth(0.3)
    doc.line(14, pH - 10, W - 14, pH - 10)
    doc.setFont('Roboto', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRAND.muted)
    doc.text('Fons Solar Enerji A.Ş.', 14, pH - 6)
    doc.text(`Sayfa ${doc.internal.getCurrentPageInfo().pageNumber}`, W - 14, pH - 6, { align: 'right' })
  }

  function sectionTitle(y, letter, text) {
    doc.setFillColor(...BRAND.primary)
    doc.roundedRect(14, y, 6, 6, 1, 1, 'F')
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.white)
    doc.text(letter, 17, y + 4.5, { align: 'center' })
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.dark)
    doc.text(text, 22, y + 4.5)
    return y + 10
  }

  function ensureSpace(y, needed) {
    const remaining = doc.internal.pageSize.getHeight() - y - 20
    if (remaining < needed) { doc.addPage(); return 20 }
    return y
  }

  doc.setFillColor(...BRAND.primary)
  doc.rect(0, 0, W, 22, 'F')
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...BRAND.white)
  doc.text('FONS SOLAR', 14, 14)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.text(nowLabel(), W - 14, 14, { align: 'right' })

  doc.setFillColor(...BRAND.secondary)
  doc.rect(0, 22, W, 11, 'F')
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND.white)
  doc.text(`${periodLabel} İlerleme Raporu — ${projAd}`, 14, 29.5)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.text([kapsite, periodRangeLabel].filter(Boolean).join(' | '), W - 14, 29.5, { align: 'right' })

  let y = 37

  y = sectionTitle(y, 'A', 'PERSONEL DURUMU (DÖNEM TOPLAMI)')
  const DEPT_LABELS = { idari: 'İDARİ', mekanik: 'MEKANİK', elektrik: 'ELEKTRİK', yevmiyeci: 'YEVMİYECİ', diger: 'DİĞER' }
  const persRows = Object.entries(DEPT_LABELS).map(([key, label]) => {
    const d = data.personnel?.[key] || { muhendis: 0, usta: 0, isci: 0 }
    const total = d.muhendis + d.usta + d.isci
    return [label, String(d.muhendis), String(d.usta), String(d.isci), String(total)]
  })
  autoTable(doc, {
    startY: y,
    head: [['Departman', 'Mühendis', 'Usta', 'İşçi', 'Toplam']],
    body: persRows,
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
    headStyles: { font: 'Roboto', fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center', fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: BRAND.lightBg },
    margin: { left: 14, right: 14 },
    didDrawPage: drawFooter,
  })
  y = doc.lastAutoTable.finalY + 6

  y = ensureSpace(y, 30)
  y = sectionTitle(y, 'B', 'İŞ MAKİNALARI VE EKİPMAN (DÖNEM TOPLAM ADET-GÜN)')
  autoTable(doc, {
    startY: y,
    head: [['Ekipman', 'Toplam Adet-Gün']],
    body: data.equipment?.length ? data.equipment.map(e => [e.type, String(e.total)]) : [['—', 'Dönemde aktif ekipman bulunmamaktadır.']],
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
    headStyles: { font: 'Roboto', fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' } },
    alternateRowStyles: { fillColor: BRAND.lightBg },
    margin: { left: 14, right: 14 },
    didDrawPage: drawFooter,
  })
  y = doc.lastAutoTable.finalY + 6

  y = ensureSpace(y, 30)
  y = sectionTitle(y, 'C', 'DÖNEMDE TAMAMLANAN İŞLER')
  autoTable(doc, {
    startY: y,
    head: [['#', 'İş Kalemi']],
    body: data.completedTasks?.length ? data.completedTasks.map((t, i) => [String(i + 1), t]) : [['—', 'Dönemde tamamlanan iş kaydı bulunmamaktadır.']],
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
    headStyles: { font: 'Roboto', fillColor: BRAND.secondary, textColor: BRAND.white, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' } },
    alternateRowStyles: { fillColor: BRAND.lightBg },
    margin: { left: 14, right: 14 },
    didDrawPage: drawFooter,
  })
  y = doc.lastAutoTable.finalY + 6

  y = ensureSpace(y, 40)
  y = sectionTitle(y, 'D', 'İLERLEME DURUMU (DÖNEM BAŞI → DÖNEM SONU)')
  const fmt = v => Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
  autoTable(doc, {
    startY: y,
    head: [['İş Kalemi', 'Birim', 'Hedef', 'Dönem Başı', 'Dönem İçi', 'Dönem Sonu', '%']],
    body: data.progressItems?.length
      ? data.progressItems.map(it => [it.name, it.unit || '', fmt(it.target), fmt(it.before), fmt(it.added), fmt(it.after), `%${it.pct}`])
      : [['—', '', '', '', '', '', '']],
    styles: { font: 'Roboto', fontSize: 7.5, cellPadding: 2, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
    headStyles: { font: 'Roboto', fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
      6: { halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: BRAND.lightBg },
    margin: { left: 14, right: 14 },
    didDrawPage: drawFooter,
  })
  y = doc.lastAutoTable.finalY + 6

  y = ensureSpace(y, 30)
  y = sectionTitle(y, 'E', 'NOTLAR / İSG / OLAĞANDIŞI OLAYLAR')
  autoTable(doc, {
    startY: y,
    head: [['Tarih', 'Tip', 'Not']],
    body: data.notes?.length
      ? data.notes.map(n => [n.date ? new Date(n.date).toLocaleDateString('tr-TR') : '—', n.type, n.text])
      : [['—', '—', 'Dönemde kayda değer bir not bulunmamaktadır.']],
    styles: { font: 'Roboto', fontSize: 8, cellPadding: 2.5, textColor: BRAND.dark, lineColor: BRAND.border, lineWidth: 0.1 },
    headStyles: { font: 'Roboto', fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 32 } },
    alternateRowStyles: { fillColor: BRAND.lightBg },
    margin: { left: 14, right: 14 },
    didDrawPage: drawFooter,
  })

  if (data.photos?.length) {
    doc.addPage()
    y = 20
    y = sectionTitle(y, 'F', 'SAHA FOTOĞRAFLARI')
    y += 4
    const uw = W - 28
    const imgW = (uw - 2 * 3) / 3
    const imgH = imgW * 0.72
    let x = 14
    for (let i = 0; i < data.photos.length; i++) {
      const url = storagePublicUrl('saha-fotolari', data.photos[i])
      const dataUrl = await fetchImageAsDataUrl(url)
      if (dataUrl) {
        try { doc.addImage(dataUrl, 'JPEG', x, y, imgW, imgH) } catch { /* bozuk goruntu, atla */ }
      }
      doc.setDrawColor(...BRAND.border)
      doc.rect(x, y, imgW, imgH)
      if ((i + 1) % 3 === 0) { x = 14; y += imgH + 3 } else { x += imgW + 3 }
    }
  }

  drawFooter()
  const safeName = projAd.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_ÇçĞğİıÖöŞşÜü]/g, '')
  doc.save(`FonsSolar_${safeName}_${periodLabel}IlerlemeRaporu_${fileDate()}.pdf`)
}

export function exportPeriodReportExcel(project, periodLabel, periodRangeLabel, data) {
  const wb = XLSX.utils.book_new()
  const projAd = project?.name || 'GES PROJESİ'
  const kapsite = project?.capacityKwp ? `${Number(project.capacityKwp).toLocaleString('tr-TR')} kWp` : ''

  function buildSheet(title, colNames, rows) {
    const aoa = [
      ['FONS SOLAR'],
      [`${projAd}${kapsite ? ' — ' + kapsite : ''}`],
      [`${title} — ${periodLabel} (${periodRangeLabel})`],
      [],
      colNames,
      ...rows,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const colCount = colNames.length
    const widths = colNames.map(c => String(c).length)
    rows.forEach(row => row.forEach((cell, i) => { const l = String(cell ?? '').length; if (l > (widths[i] || 0)) widths[i] = l }))
    ws['!cols'] = widths.map(w => ({ wch: Math.max(w + 4, 12) }))
    if (colCount > 1) {
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
      ]
    }
    const cr = (r, c) => XLSX.utils.encode_cell({ r, c })
    const STYL = {
      H1: { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '185FA5' } } },
      H2: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F6E56' } } },
      META: { font: { sz: 9, color: { rgb: '64748B' } }, fill: { fgColor: { rgb: 'F5F7FA' } } },
      COL: { font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center' } },
    }
    if (ws[cr(0,0)]) ws[cr(0,0)].s = STYL.H1
    if (ws[cr(1,0)]) ws[cr(1,0)].s = STYL.H2
    if (ws[cr(2,0)]) ws[cr(2,0)].s = STYL.META
    colNames.forEach((_, i) => { const ref = cr(4, i); if (ws[ref]) ws[ref].s = STYL.COL })
    return ws
  }

  const DEPT_LABELS = { idari: 'İdari', mekanik: 'Mekanik', elektrik: 'Elektrik', yevmiyeci: 'Yevmiyeci', diger: 'Diğer' }
  const persRows = Object.entries(DEPT_LABELS).map(([key, label]) => {
    const d = data.personnel?.[key] || { muhendis: 0, usta: 0, isci: 0 }
    return [label, d.muhendis, d.usta, d.isci, d.muhendis + d.usta + d.isci]
  })
  XLSX.utils.book_append_sheet(wb, buildSheet('Personel Durumu', ['Departman', 'Mühendis', 'Usta', 'İşçi', 'Toplam'], persRows), 'Personel')

  const eqRows = (data.equipment || []).map(e => [e.type, e.total])
  XLSX.utils.book_append_sheet(wb, buildSheet('Ekipman (Dönem Toplamı)', ['Ekipman', 'Toplam Adet-Gün'], eqRows), 'Ekipman')

  const taskRows = (data.completedTasks || []).map((t, i) => [i + 1, t])
  XLSX.utils.book_append_sheet(wb, buildSheet('Dönemde Tamamlanan İşler', ['#', 'İş Kalemi'], taskRows), 'Tamamlanan İşler')

  const progRows = (data.progressItems || []).map(it => [it.name, it.unit || '', it.target, it.before, it.added, it.after, it.pct])
  XLSX.utils.book_append_sheet(wb, buildSheet('İlerleme Durumu', ['İş Kalemi', 'Birim', 'Hedef', 'Dönem Başı', 'Dönem İçi', 'Dönem Sonu', 'İlerleme %'], progRows), 'İlerleme')

  const noteRows = (data.notes || []).map(n => [n.date ? new Date(n.date).toLocaleDateString('tr-TR') : '—', n.type, n.text])
  XLSX.utils.book_append_sheet(wb, buildSheet('Notlar / İSG', ['Tarih', 'Tip', 'Not'], noteRows), 'Notlar')

  const safeName = projAd.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_ÇçĞğİıÖöŞşÜü]/g, '')
  XLSX.writeFile(wb, `FonsSolar_${safeName}_${periodLabel}IlerlemeRaporu_${fileDate()}.xlsx`)
}

// ─── TARİH FİLTRESİ ──────────────────────────────────────────────────────────
export function dateFilter(rows, dateField, periyot) {
  const now = new Date()
  return rows.filter(r => {
    const d = new Date(r[dateField])
    if (isNaN(d)) return true
    if (periyot === 'gunluk') {
      return d.toDateString() === now.toDateString()
    }
    if (periyot === 'haftalık') {
      const weekAgo = new Date(now)
      weekAgo.setDate(now.getDate() - 7)
      return d >= weekAgo
    }
    if (periyot === 'aylik') {
      const monthAgo = new Date(now)
      monthAgo.setMonth(now.getMonth() - 1)
      return d >= monthAgo
    }
    return true
  })
}
