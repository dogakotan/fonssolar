-- MENU_bolumler.sql'i geri alır. Önce (uygulanmışsa) MENU_register_kaldir.down.sql çalıştırılmalı.
-- Mevcut öğelerin sırası 22.10.2026'daki canlı değerlere döner.
set local lock_timeout = '3s';

delete from public.role_allowed_tabs  where tab_key  like 'register-%';
delete from public.role_sidebar_items where item_key like 'register-%';

update public.role_sidebar_items set order_index = order_index + 2000;
update public.role_sidebar_items s
   set order_index = v.n
  from (values
    ('admin', 'genel', 0), ('admin', 'projeler', 1), ('admin', 'satin-alma', 2), ('admin', 'finans', 3),
    ('admin', 'tickets', 4), ('admin', 'bildirimler', 5), ('admin', 'proje-ekle', 6), ('admin', 'kullanicilar', 7),
    ('admin', 'register', 8),
    ('muhasebe', 'genel', 0), ('muhasebe', 'finans', 1), ('muhasebe', 'satin-alma', 2), ('muhasebe', 'bildirimler', 3),
    ('muhasebe', 'odemeler', 10), ('muhasebe', 'register', 11),
    ('proje_yoneticisi', 'genel', 0), ('proje_yoneticisi', 'projeler', 1), ('proje_yoneticisi', 'satin-alma', 2),
    ('proje_yoneticisi', 'tickets', 3), ('proje_yoneticisi', 'bildirimler', 4), ('proje_yoneticisi', 'proje-ekle', 5),
    ('proje_yoneticisi', 'kullanicilar', 6), ('proje_yoneticisi', 'finans', 10), ('proje_yoneticisi', 'register', 11),
    ('santiye_sefi', 'genel', 0), ('santiye_sefi', 'is-plani', 1), ('santiye_sefi', 'rapor-listesi', 2),
    ('santiye_sefi', 'satin-alma', 3), ('santiye_sefi', 'tickets', 4), ('santiye_sefi', 'bildirimler', 5),
    ('santiye_sefi', 'register', 6)
  ) as v(role_key, item_key, n)
 where v.role_key = s.role_key and v.item_key = s.item_key;

-- Eski "register" sayfa erişimi kaldırılıp geri getirildiyse sıranın sonuna eklenmiştir; eski yerine döner.
update public.role_allowed_tabs t
   set order_index = v.n
  from (values ('muhasebe', 11), ('proje_yoneticisi', 11), ('santiye_sefi', 7)) as v(role_key, n)
 where t.role_key = v.role_key and t.tab_key = 'register' and t.order_index <> v.n;

alter table public.role_sidebar_items drop column section_key;
drop table public.sidebar_sections;
