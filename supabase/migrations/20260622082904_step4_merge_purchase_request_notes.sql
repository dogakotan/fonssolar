
-- ADIM 4: purchase_requests — approval_note ve note'u birleştir
-- approval_note → ayrı anlamlı (onay notu), note → talep notu
-- Semantik fark olduğu için kolonu rename ile ayırt edelim, approval_note'u temizleyelim
-- Mevcut veriye göre: approval_note hepsi NULL, note dolu → approval_note kaldır

ALTER TABLE purchase_requests DROP COLUMN IF EXISTS approval_note;

-- note kolonunu daha açık isimle yeniden adlandır
ALTER TABLE purchase_requests RENAME COLUMN note TO request_note;

