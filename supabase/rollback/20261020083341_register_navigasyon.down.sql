-- Ters SQL — 20261020090100_register_navigasyon. Yalnızca bu migration'ın eklediği 'register' satırlarını siler;
-- diğer navigasyon satırlarına ve order_index değerlerine dokunmaz.
delete from public.role_sidebar_items where item_key = 'register';
delete from public.role_allowed_tabs where tab_key = 'register';
