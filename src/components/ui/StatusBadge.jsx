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
  // "Onaylandı" yalnızca geçmişi anlatır, sıradaki adımı değil — kullanıcı talebin şu an
  // kimin elinde olduğunu (proje yöneticisi tedarik kuyruğu) görmek istiyor.
  onaylandi:            { label: 'Proje Yöneticisinde',   tone: 'warning' },
  // fatura_bekliyor pratikte hiçbir trigger/RPC tarafından üretilmiyor (yalnızca DB
  // constraint'i izin veriyor) — gerçek akışta fatura oluşturulunca satın alma durumu
  // doğrudan fatura_onay_bekliyor'a geçiyor ve muhasebe/yönetici onay adımlarının HER
  // ikisinde de öyle kalıyor (sync_purchase_request_from_invoice). Bu ekranda kimin
  // sırada olduğu önemli değil, ikisi de aynı metni göstermeli — aksi halde aynı durum
  // için iki farklı yazı görünüyormuş gibi kafa karıştırıyor.
  fatura_bekliyor:      { label: 'Fatura Bekleniyor',    tone: 'warning' },
  fatura_onay_bekliyor: { label: 'Fatura Onayda',         tone: 'primary' },
  faturasi_kesildi:     { label: 'Fatura Kesildi',        tone: 'success' },
  // satin_alindi = proje yöneticisi tedarikçi/teslimatı girdi, fatura HENÜZ oluşturulmadı —
  // bu durumun TEK anlamı "muhasebe fatura kesmeli" (invoice oluşunca durum hemen
  // fatura_onay_bekliyor'a atlıyor, satin_alindi asla "bitti" anlamına gelmiyor). Önceden
  // "Satın Alındı"/success gösteriyordu — geçmişi anlatıyordu, sıradaki adımı değil (2026-07-20'de
  // onaylandi'de düzeltilen bug'ın aynısı) ve muhasebeye görünürlük açılınca kafa karıştırdı.
  satin_alindi:         { label: 'Fatura Bekleniyor',    tone: 'warning' },
  reddedildi:           { label: 'Reddedildi',            tone: 'danger' },
  iptal:                { label: 'İptal',                 tone: 'muted' },
  // Yeni 3 aşamalı satın alma akışı (03.09.2026) — teklif_toplama/pazarlik_onay_bekliyor/
  // pazarlik/siparis, satin_alindi'ye ulaşana kadarki ara aşamalar (bkz. CLAUDE.md "Satın
  // alma akışı"). 'bekliyor' kovasına katılmıyorlar, kendi rozetleri var.
  teklif_toplama:        { label: 'Teklif Toplama',        tone: 'primary' },
  pazarlik_onay_bekliyor:{ label: 'Pazarlık Onayı Bekliyor', tone: 'warning' },
  pazarlik:              { label: 'Pazarlık',              tone: 'primary' },
  siparis:               { label: 'Sipariş',               tone: 'primary' },
}

export const SITE_CHIEF_PR_STATUS = {
  talep_olusturuldu:    { label: 'Talep Oluşturuldu',  tone: 'primary' },
  fiyat_girildi:        { label: 'Talep Oluşturuldu',  tone: 'primary' },
  onay_bekliyor:        { label: 'Talep Oluşturuldu',  tone: 'primary' },
  bekliyor:             { label: 'Talep Oluşturuldu',  tone: 'primary' },
  onaylandi:            { label: 'İşleme Alındı',      tone: 'warning' },
  // Yeni 3 aşamalı akışın 4 ara durumu da (satin_alindi'ye ulaşana kadar) şantiye şefi
  // görünümünde tek bir "İşleme Alındı" etiketine sadeleşir — bu görünüm bilinçli olarak sade.
  teklif_toplama:       { label: 'İşleme Alındı',      tone: 'warning' },
  pazarlik_onay_bekliyor: { label: 'İşleme Alındı',    tone: 'warning' },
  pazarlik:             { label: 'İşleme Alındı',      tone: 'warning' },
  siparis:              { label: 'İşleme Alındı',      tone: 'warning' },
  satin_alindi:         { label: 'İşlem Tamamlandı',   tone: 'success' },
  fatura_bekliyor:      { label: 'İşlem Tamamlandı',   tone: 'success' },
  fatura_onay_bekliyor: { label: 'İşlem Tamamlandı',   tone: 'success' },
  faturasi_kesildi:     { label: 'İşlem Tamamlandı',   tone: 'success' },
  reddedildi:           { label: 'İşlem İptal Edildi', tone: 'danger' },
  red_edildi:           { label: 'İşlem İptal Edildi', tone: 'danger' },
  iptal:                { label: 'İşlem İptal Edildi', tone: 'muted' },
}
// tickets_status_check (DB) 5 değere izin verir — bu harita önceden yalnızca 4'ünü tanıyordu
// (iptal_edildi eksikti), iptal edilmiş bir ticket ham enum metnine düşüyordu.
export const TK_STATUS = {
  gönderildi:   { label: 'Açık',         tone: 'primary' },
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
// Tek onaylayıcı (proje yöneticisi/"Yönetici") + taslak/düzeltme/ödeme-takibi
// akışı (bkz. CLAUDE.md "Satın alma akışı" → Faturalar). 'bekliyor' yalnızca
// invoices.status'un DEFAULT'u/geçici bir ara değer — kalıcı olarak hiçbir
// faturada görünmez. 'muhasebe_onayında' hiçbir kod yolunun üretemediği ölü bir
// değerdi (invoices_status_check'ten de kaldırıldı); burada da yok.
export const INVOICE_STATUS = {
  taslak:             { label: 'Taslak',              tone: 'muted' },
  bekliyor:           { label: 'Bekliyor',            tone: 'warning' },
  yönetici_onayında:  { label: 'Yönetici Onayında',   tone: 'primary' },
  duzeltme_bekliyor:  { label: 'Düzeltme Bekliyor',   tone: 'danger' },
  onaylandı:          { label: 'Onaylandı',           tone: 'success' },
  odeme_bekliyor:     { label: 'Ödeme Bekliyor',      tone: 'primary' },
  kismen_odendi:      { label: 'Kısmen Ödendi',       tone: 'warning' },
  reddedildi:         { label: 'Reddedildi',          tone: 'danger' },
  ödendi:             { label: 'Ödendi',              tone: 'success' },
}
export const PROCUREMENT_CHANGE_STATUS = {
  bekliyor:   { label: 'Onay Bekliyor', tone: 'warning' },
  onaylandi:  { label: 'Onaylandı',     tone: 'success' },
  reddedildi: { label: 'Reddedildi',    tone: 'danger' },
}
export const DAILY_REPORT_STATUS = {
  normal: { label: 'Normal', tone: 'success' },
  dikkat: { label: 'Dikkat', tone: 'warning' },
  kritik: { label: 'Kritik', tone: 'danger' },
}
