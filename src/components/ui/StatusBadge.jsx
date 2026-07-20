// Semantik ton → mevcut :root token'larına eşleme (tint zemin + koyu metin)
export const TONE = {
  primary: { bg: 'var(--color-primary-bg)', text: 'var(--color-primary-text)' },
  success: { bg: 'var(--color-success-bg)', text: 'var(--color-success-text)' },
  warning: { bg: 'var(--color-warning-bg)', text: 'var(--color-warning-text)' },
  danger:  { bg: 'var(--color-danger-bg)',  text: 'var(--color-danger-text)' },
  muted:   { bg: 'var(--color-border)',     text: 'var(--color-muted)' },
}

// purchase_requests_status_check (DB) tam 10 değere izin verir — bu harita önceden yalnızca
// 7'sini tanıyordu (fiyat_girildi/onay_bekliyor/fatura_bekliyor eksikti), bu 3 durumdaki bir
// talep Badge'in fallback'ine düşüp ham enum metnini gösteriyordu. Artık tam 10/10.
export const PR_STATUS = {
  talep_olusturuldu:    { label: 'Talep Oluşturuldu',    tone: 'primary' },
  fiyat_girildi:        { label: 'Fiyat Girildi',        tone: 'primary' },
  onay_bekliyor:        { label: 'Onay Bekliyor',        tone: 'warning' },
  onaylandi:            { label: 'Onaylandı',            tone: 'success' },
  fatura_bekliyor:      { label: 'Fatura Bekleniyor',    tone: 'warning' },
  fatura_onay_bekliyor: { label: 'Fatura Onayı Bekliyor', tone: 'warning' },
  faturasi_kesildi:     { label: 'Faturası Kesildi',      tone: 'primary' },
  satin_alindi:         { label: 'Satın Alındı',          tone: 'success' },
  reddedildi:           { label: 'Reddedildi',            tone: 'danger' },
  iptal:                { label: 'İptal',                 tone: 'muted' },
}
export const PR_URGENCY = {
  normal:   { label: 'Normal',    tone: 'muted' },
  acil:     { label: 'Acil',      tone: 'warning' },
  çok_acil: { label: 'Çok Acil', tone: 'danger' },
}
// tickets_status_check (DB) 5 değere izin verir — bu harita önceden yalnızca 4'ünü tanıyordu
// (iptal_edildi eksikti), iptal edilmiş bir ticket ham enum metnine düşüyordu.
export const TK_STATUS = {
  gönderildi:   { label: 'Gönderildi',   tone: 'primary' },
  açık:         { label: 'Açık',         tone: 'primary' },
  işlemde:      { label: 'İşlemde',      tone: 'warning' },
  kapatıldı:    { label: 'Kapatıldı',    tone: 'success' },
  iptal_edildi: { label: 'İptal Edildi', tone: 'muted' },
}
export const TK_SEVERITY = {
  düşük:  { label: 'Düşük',   tone: 'muted' },
  orta:   { label: 'Orta',    tone: 'warning' },
  yüksek: { label: 'Yüksek',  tone: 'danger' },
  kritik: { label: 'Kritik',  tone: 'danger' },
}
export const INVOICE_STATUS = {
  bekliyor:           { label: 'Bekliyor',            tone: 'warning' },
  muhasebe_onayında:  { label: 'Muhasebe Onayında',   tone: 'primary' },
  yönetici_onayında:  { label: 'Yönetici Onayında',   tone: 'primary' },
  onaylandı:          { label: 'Onaylandı',           tone: 'success' },
  reddedildi:         { label: 'Reddedildi',          tone: 'danger' },
}
export const PROCUREMENT_CHANGE_STATUS = {
  bekliyor:   { label: 'Onay Bekliyor', tone: 'warning' },
  onaylandi:  { label: 'Onaylandı',     tone: 'success' },
  reddedildi: { label: 'Reddedildi',    tone: 'danger' },
}

export default function Badge({ map, value }) {
  const entry = map[value] || { label: value || '—', tone: 'muted' }
  const tone = TONE[entry.tone] || TONE.muted
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: tone.bg, color: tone.text, whiteSpace: 'nowrap', flexShrink: 0,
    }}>{entry.label}</span>
  )
}
