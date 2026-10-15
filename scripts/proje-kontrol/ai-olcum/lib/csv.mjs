// Küçük RFC 4180 CSV okuyucu. Excel'in Türkçe yerelinde kaydettiği ';' ayraçlı dosyaları ve
// UTF-8 BOM'u da kabul eder (ayraç başlık satırından tespit edilir).

export function parseCsv(text) {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(cell => cell !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some(cell => cell !== '')) rows.push(row)
  if (!rows.length) return []
  const header = rows[0].map(h => h.trim())
  return rows.slice(1).map(cells => Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()])))
}

export function toCsv(rows, columns) {
  const esc = v => {
    const s = v == null ? '' : String(v)
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(','), ...rows.map(r => columns.map(c => esc(r[c])).join(','))].join('\n') + '\n'
}
