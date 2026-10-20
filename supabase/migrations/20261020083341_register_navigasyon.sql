-- ============================================================================
-- Register sekmesi — navigasyon verisi (veri migration'ı). BEKLEYEN: canlıya uygulanmadı.
-- Ters SQL: supabase/rollback/20261020090100_register_navigasyon.down.sql
--
-- Dört rolün hepsi Register'da en az bir alt sekme görür (Karar 6, "G"):
--   admin, proje_yoneticisi: 10 register (9 alt sekme; çizim Doküman'da süzgeç)
--   santiye_sefi: Doküman/Çizim, RFI, Karar, Aksiyon, Teknik Sunum, Malzeme Onayı, Arayüz
--   muhasebe: Değişiklik, Hak Talebi
-- admin roles.tabs_unrestricted = true → role_allowed_tabs satırı gerekmez; yalnızca sidebar satırı.
-- order_index rol başına sıradaki boş değer (UNIQUE (role_key, order_index)). Sidebar'daki görünüm sırası
-- Sidebar.jsx'teki öğe dizisinden gelir; order_index yalnızca tekillik için.
-- Ön koşul: 20261020090000_register_okuma_rpc ve ön yüz (TabRegister) aynı anda yayında olmalı; aksi halde
-- menüde görünen sekme "Veri yüklenemedi" gösterir.
-- ============================================================================
insert into public.role_allowed_tabs (role_key, tab_key, order_index)
select x.role_key, 'register',
       coalesce((select max(t.order_index) from public.role_allowed_tabs t where t.role_key = x.role_key), -1) + 1
  from (values ('proje_yoneticisi'), ('santiye_sefi'), ('muhasebe')) as x(role_key)
on conflict (role_key, tab_key) do nothing;

insert into public.role_sidebar_items (role_key, item_key, order_index)
select x.role_key, 'register',
       coalesce((select max(s.order_index) from public.role_sidebar_items s where s.role_key = x.role_key), -1) + 1
  from (values ('admin'), ('proje_yoneticisi'), ('santiye_sefi'), ('muhasebe')) as x(role_key)
on conflict (role_key, item_key) do nothing;
