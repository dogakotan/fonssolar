import { zipSync, strFromU8, strToU8 } from 'fflate'

export const xmlEscape = value => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

function columnName(index) {
  let n = index + 1
  let name = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function columnIndexFromAddress(address) {
  const col = address.match(/^[A-Z]+/)?.[0] || ''
  return col.split('').reduce((sum, char) => (sum * 26) + char.charCodeAt(0) - 64, 0)
}

function insertCellSorted(rowInner, newCell, address) {
  const newIndex = columnIndexFromAddress(address)
  const cellRe = /<c r="([A-Z]+\d+)"[^>]*(?:\/>|>.*?<\/c>)/gs
  let result = ''
  let lastIndex = 0
  let inserted = false
  let match

  while ((match = cellRe.exec(rowInner))) {
    const existingIndex = columnIndexFromAddress(match[1])
    if (!inserted && newIndex < existingIndex) {
      result += rowInner.slice(lastIndex, match.index) + newCell
      inserted = true
      lastIndex = match.index
    }
  }

  if (!inserted) return `${rowInner}${newCell}`
  return `${result}${rowInner.slice(lastIndex)}`
}

export function setTemplateCell(xmlStr, address, value) {
  if (address === 'A1') return xmlStr

  const row = address.match(/\d+$/)?.[0]
  if (!row) return xmlStr

  const isNum = typeof value === 'number' && Number.isFinite(value)
  const styleMatch = xmlStr.match(new RegExp(`<c r="${address}"[^>]*s="(\\d+)"`))
  const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''
  const newCell = isNum
    ? `<c r="${address}"${styleAttr} t="n"><v>${value}</v></c>`
    : `<c r="${address}"${styleAttr} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`

  const selfClosingRe = new RegExp(`<c r="${address}"[^>]*\\/\\s*>`)
  const fullCellRe = new RegExp(`<c r="${address}"[^>]*>[\\s\\S]*?<\\/c>`)
  if (selfClosingRe.test(xmlStr)) return xmlStr.replace(selfClosingRe, newCell)
  if (fullCellRe.test(xmlStr)) return xmlStr.replace(fullCellRe, newCell)

  const rowRe = new RegExp(`(<row[^>]*r="${row}"[^>]*>)(.*?)(</row>)`, 's')
  if (rowRe.test(xmlStr)) {
    return xmlStr.replace(rowRe, (_, open, inner, close) => `${open}${insertCellSorted(inner, newCell, address)}${close}`)
  }

  return xmlStr.replace('</sheetData>', `<row r="${row}">${newCell}</row></sheetData>`)
}

export function fillTemplateSheet(files, sheetNumber, rows, startRow = 5) {
  const path = `xl/worksheets/sheet${sheetNumber}.xml`
  let xml = strFromU8(files[path])
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (value !== undefined) {
      xml = setTemplateCell(xml, `${columnName(columnIndex)}${rowIndex + startRow}`, value)
    }
  }))
  files[path] = strToU8(xml)
}

export async function fetchXlsxTemplate(paths) {
  for (const path of paths) {
    const resp = await fetch(path, { cache: 'no-store' })
    if (!resp.ok) continue
    const buffer = await resp.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) return buffer
  }
  throw new Error('Excel şablonu yüklenemedi')
}

export function xlsxZipBlob(files) {
  return new Blob([zipSync(files, { level: 6 })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadXlsxZip(files, filename) {
  const blob = new Blob([zipSync(files, { level: 6 })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function formatExcelDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('T')[0].split('-')
  return y && m && d ? `${d}.${m}.${y}` : String(iso)
}
