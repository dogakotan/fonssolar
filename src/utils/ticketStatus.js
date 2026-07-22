// tickets.status/category rozet haritaları — önceden TicketDetayModal.jsx ve TicketListesi.jsx'te
// birebir aynı içerikle iki ayrı kopya olarak tutuluyordu (ticketSeverity.js'teki severity
// tekilleştirmesiyle aynı desen).
export const STATUS_META = {
  'gönderildi':   { bg: '#DBEAFE', color: '#1D4ED8', label: 'Açık' },
  'açık':         { bg: '#DBEAFE', color: '#1D4ED8', label: 'Açık' },
  'işlemde':      { bg: '#E5E7EB', color: '#6B7280', label: 'İşlemde' },
  'kapatıldı':    { bg: '#D1FAE5', color: '#065F46', label: 'Kapatıldı' },
  'iptal_edildi': { bg: '#F3F4F6', color: '#9CA3AF', label: 'İptal Edildi' },
}

export const CATEGORY_META = {
  'genel':    { bg: '#F3F4F6', color: '#6B7280' },
  'elektrik': { bg: '#EFF6FF', color: '#185FA5' },
  'mekanik':  { bg: '#F5F3FF', color: '#7C3AED' },
}

export const STATUS_TABS = [
  { key: 'all',         label: 'Tümü' },
  { key: 'acik',        label: 'Açık' },
  { key: 'islemde',     label: 'İşlemde' },
  { key: 'sonuclandi',  label: 'Sonuçlandı' },
]
