// quality_inspections.result ve quality_inspection_findings.status için tek kaynak.
// Şiddet için ayrı bir sözlük yazılmaz — src/utils/ticketSeverity.js'teki
// SEVERITY_META/SEVERITY_OPTIONS (düşük/orta/yüksek/kritik) doğrudan kullanılır.
export const RESULT_META = {
  'geçti':     { bg: '#D1FAE5', color: '#065F46', label: 'Geçti' },
  'başarısız': { bg: '#FEE2E2', color: '#991B1B', label: 'Başarısız' },
  'beklemede': { bg: '#F3F4F6', color: '#374151', label: 'Beklemede' },
}

export const RESULT_OPTIONS = Object.keys(RESULT_META).map(value => ({
  value,
  label: RESULT_META[value].label,
}))

export const STATUS_META = {
  'açık':         { bg: '#FEE2E2', color: '#991B1B', label: 'Açık' },
  'devam ediyor': { bg: '#FEF3C7', color: '#92400E', label: 'Devam Ediyor' },
  'çözüldü':      { bg: '#D1FAE5', color: '#065F46', label: 'Çözüldü' },
}

export const STATUS_OPTIONS = Object.keys(STATUS_META).map(value => ({
  value,
  label: STATUS_META[value].label,
}))
