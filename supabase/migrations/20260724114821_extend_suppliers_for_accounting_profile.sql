-- GERİYE DÖNÜK YENİDEN İNŞA (04.08.2026) — bkz. 20260724104456 dosyasındaki not,
-- aynı gerekçe/kısıtlar geçerli. suppliers tablosunu muhasebe profiline
-- genişletir (tedarikçi türü/para birimi/durum/adres alanları).

alter table public.suppliers
  add column if not exists tax_office text,
  add column if not exists supplier_type text not null default 'malzeme_ekipman',
  add column if not exists currency text not null default 'TRY',
  add column if not exists status text not null default 'aktif',
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists address text,
  add column if not exists notes text;

alter table public.suppliers drop constraint if exists suppliers_supplier_type_check;
alter table public.suppliers add constraint suppliers_supplier_type_check
  check (supplier_type = any (array['malzeme_ekipman','hizmet','nakliye','diger']));

alter table public.suppliers drop constraint if exists suppliers_currency_check;
alter table public.suppliers add constraint suppliers_currency_check
  check (currency = any (array['TRY','USD','EUR']));

alter table public.suppliers drop constraint if exists suppliers_status_check;
alter table public.suppliers add constraint suppliers_status_check
  check (status = any (array['aktif','pasif']));

alter table public.suppliers drop constraint if exists suppliers_tax_no_unique;
alter table public.suppliers add constraint suppliers_tax_no_unique unique (tax_no);
