-- procurement_items'ta satın alma talebi akışından ÖNCEKİ bir sipariş-takip
-- tasarımından kalma, artık hiçbir RPC/UI'nin yazmadığı/okumadığı kolonlar
-- (update_procurement_status RPC'si daha önce kaldırılmıştı). Malzeme Listesi
-- artık yalnızca planned_qty ile takip ediliyor. Bağımlılık taraması: hiçbir
-- fonksiyon/trigger/view bu kolonlara referans vermiyor.
alter table public.procurement_items
  drop column if exists status,
  drop column if exists priority,
  drop column if exists order_date,
  drop column if exists expected_delivery,
  drop column if exists actual_delivery,
  drop column if exists supplier,
  drop column if exists notes,
  drop column if exists updated_by,
  drop column if exists received_by,
  drop column if exists received_date;
