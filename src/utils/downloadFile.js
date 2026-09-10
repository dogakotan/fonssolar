// exceljs'in workbook.xlsx.writeBuffer() cikisi bir ArrayBuffer/Uint8Array —
// SheetJS'in writeFile()'inin aksine tarayicida otomatik indirme tetiklemez.
// Blob + gecici <a download> linkiyle ayni davranisi elle uretiyoruz.
export function downloadBlob(buffer, filename, mime = 'application/octet-stream') {
  const blob = new Blob([buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
