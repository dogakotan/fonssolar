-- Menü bölümleri adım 2/2: eski tek "register" menü öğesi ve sayfa erişimi kaldırılır.
-- Yalnızca bölümlü menü ve register-* sayfaları yayına çıkıp doğrulandıktan sonra uygulanır
-- (önce uygulanırsa yayındaki eski ön yüzde Register menüden kaybolur).
-- Geri alma: MENU_register_kaldir.down.sql
set local lock_timeout = '3s';

delete from public.role_sidebar_items where item_key = 'register';
delete from public.role_allowed_tabs  where tab_key  = 'register';
