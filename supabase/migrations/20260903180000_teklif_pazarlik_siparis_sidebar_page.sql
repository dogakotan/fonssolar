-- "Teklif / Pazarlık / Sipariş" Satın Alma'nın yanına ayrı bir üst-seviye
-- sidebar sayfası olarak eklendi (kullanıcı kararı, 03.09.2026). Sayfanın
-- kendisi zaten admin/proje_yoneticisi'ye özel (index.jsx'te
-- `isAdmin || role === 'proje_yoneticisi'` ile gate'leniyor) — admin
-- tabs_unrestricted=true olduğu için role_allowed_tabs satırına ihtiyaç
-- duymuyor, yalnızca role_sidebar_items satırı yeterli.
insert into role_sidebar_items (role_key, item_key, order_index) values
  ('admin', 'teklif-pazarlik-siparis', 8),
  ('proje_yoneticisi', 'teklif-pazarlik-siparis', 11)
on conflict (role_key, item_key) do nothing;

insert into role_allowed_tabs (role_key, tab_key, order_index) values
  ('proje_yoneticisi', 'teklif-pazarlik-siparis', 11)
on conflict (role_key, tab_key) do nothing;
