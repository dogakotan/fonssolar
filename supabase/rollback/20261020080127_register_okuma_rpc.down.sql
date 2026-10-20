-- Ters SQL — 20261020090000_register_okuma_rpc. Üç fonksiyon yeni; önceki hali yok, yalnızca kaldırılır.
-- Başka nesne bu fonksiyonlara bağlı değil (ön yüz çağırır; ters SQL'den önce ön yüzün Register sekmesi
-- kapatılmalı: 20261020090100_register_navigasyon.down.sql).
drop function if exists public.get_register_status_history(text, uuid);
drop function if exists public.get_register_list(text, text);
drop function if exists public.register_view_allowed(text, text);
