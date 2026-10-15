-- TERS SQL (geri alma) — 20261015130000_task_dependencies_cycle_and_site_chief_guard
-- Bu klasör (supabase/rollback) migration zincirine girmez; yalnızca geri alma gerektiğinde elle uygulanır.
--
-- fn_task_dependencies_guard'ı 20261015060347_create_task_dependencies'teki ilk hâline döndürür
-- (aynı proje kontrolü + project_id türetme; döngü kontrolü ve şantiye şefi engeli yok).
-- Gövde metni karakteri karakterine aynı: uygulandıktan sonra md5(prosrc) = 91f741197d2cf280d1dd8471c40c3235
-- olmalı (15.10.2026'da canlıda okunan değer). Fonksiyonun yetkileri (ACL) ve sahibi CREATE OR REPLACE ile
-- değişmez. Trigger (trg_task_dependencies_guard) zaten bu fonksiyonu kullanıyor; dokunulmaz.
set local lock_timeout = '3s';

create or replace function public.fn_task_dependencies_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_p1 text; v_p2 text;
begin
  select project_id into v_p1 from project_tasks where id = new.task_id;
  select project_id into v_p2 from project_tasks where id = new.predecessor_id;
  if v_p1 is distinct from v_p2 then
    raise exception 'Öncül ve ardıl görev aynı projede olmalı';
  end if;
  new.project_id := v_p1;
  return new;
end $$;

comment on function public.fn_task_dependencies_guard() is null;
