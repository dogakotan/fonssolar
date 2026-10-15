-- TERS SQL (geri alma) — 20261015130100_project_tasks_site_chief_plan_guard
-- Bu klasör (supabase/rollback) migration zincirine girmez; yalnızca geri alma gerektiğinde elle uygulanır.
--
-- Şantiye şefi plan korumasını tamamen kaldırır: trigger ve fonksiyon 130100'den önce yoktu.
-- Sonrasında şantiye şefinin project_tasks yazma kapsamı yeniden yalnızca RLS'e (project_tasks_update:
-- kendi projesi) bağlı olur.
set local lock_timeout = '3s';

drop trigger if exists trg_project_tasks_site_chief_guard on public.project_tasks;
drop function if exists public.fn_project_tasks_site_chief_guard();
