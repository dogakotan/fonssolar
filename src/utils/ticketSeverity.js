// tickets.severity için tek kaynak — TicketListesi.jsx/TicketDetayModal.jsx/
// YeniTicketModal.jsx'te ayrı ayrı tanımlanan aynı 4 değerlik sözlüğün
// tekilleştirilmiş hali. Yeni bir severity değeri eklenirse yalnızca burası
// güncellenir.
export const SEVERITY_META = {
  'düşük':  { bg: '#F3F4F6', color: '#374151', label: 'Düşük' },
  'orta':   { bg: '#FEF3C7', color: '#92400E', label: 'Orta' },
  'yüksek': { bg: '#FEE2E2', color: '#991B1B', label: 'Yüksek' },
  'kritik': { bg: '#7F1D1D', color: '#FEE2E2', label: 'Kritik' },
}

export const SEVERITY_ORDER = { 'kritik': 4, 'yüksek': 3, 'orta': 2, 'düşük': 1 }

export const SEVERITY_OPTIONS = Object.keys(SEVERITY_META).map(value => ({
  value,
  label: SEVERITY_META[value].label,
}))
