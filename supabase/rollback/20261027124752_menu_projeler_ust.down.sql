-- Geri alma: Projeler yeniden Proje bölümünde.
set local lock_timeout = '3s';
update public.role_sidebar_items set section_key = 'proje' where item_key = 'projeler' and section_key is null;
