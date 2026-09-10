-- fn_release_monthly_plan_link_on_request_terminal_status trigger fonksiyonu
-- (07.09.2026'daki procurement_monthly_plan linki temizleme trigger'i) anon
-- rolune bile EXECUTE yetkisi acik birakilmisti (Supabase security advisor,
-- anon_security_definer_function_executable). RETURNS trigger oldugundan
-- dogrudan RPC ile cagirilamaz (Postgres reddeder) — pratikte somurulebilir
-- degil, ama projenin kendi kuralina (yeni SECURITY DEFINER fonksiyonlarda
-- REVOKE ... FROM PUBLIC, anon) uymuyordu. Diger tum trigger fonksiyonlariyla
-- ayni deseni tamamliyoruz.
revoke execute on function public.fn_release_monthly_plan_link_on_request_terminal_status() from public, anon, authenticated;
