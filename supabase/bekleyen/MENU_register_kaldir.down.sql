-- MENU_register_kaldir.sql'i geri alır: eski "register" öğesi dört rolde sıranın sonuna, bölümsüz döner.
set local lock_timeout = '3s';

insert into public.role_sidebar_items (role_key, item_key, order_index)
select r.key, 'register', (select coalesce(max(s.order_index), -1) + 1 from public.role_sidebar_items s where s.role_key = r.key)
  from public.roles r
 where r.key in ('admin', 'proje_yoneticisi', 'santiye_sefi', 'muhasebe')
on conflict (role_key, item_key) do nothing;

insert into public.role_allowed_tabs (role_key, tab_key, order_index)
select r.key, 'register', (select coalesce(max(t.order_index), -1) + 1 from public.role_allowed_tabs t where t.role_key = r.key)
  from public.roles r
 where r.key in ('proje_yoneticisi', 'santiye_sefi', 'muhasebe')
on conflict (role_key, tab_key) do nothing;
