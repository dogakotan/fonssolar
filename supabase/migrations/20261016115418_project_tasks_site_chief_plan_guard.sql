-- İş Planı revizyonu Faz 1 (veri temeli), adım 5 — Karar İP-4.
-- Şantiye şefi project_tasks'ta yalnızca gerçekleşen alanları yazar:
--   izinli: actual_start, actual_end, progress_pct, total_progress, status, notes, equipment_notes (İP-9)
--           (+ updated_at, trigger yazar)
--   reddedilen: diğer bütün kolonlar — planned_*, baseline_*, forecast_*, target_qty dahil; ayrıca
--   team_size (İP-9), task_name, category, unit, group_label, wbs_id, area_id, discipline vb. (izin listesi
--   yaklaşımı: yeni eklenen bir kolon da varsayılan olarak korunur). Hesaplanan (GENERATED) kolonlar
--   (duration_days) karşılaştırılmaz; kaynakları zaten korunuyor.
--   Yeni görev ekleme (INSERT) de reddedilir; silme zaten RLS'te admin/PM.
-- Admin, proje_yoneticisi, muhasebe ve oturumsuz bağlam (migration, service role, cron) etkilenmez.
--
-- SECURITY DEFINER akışlar: get_my_role() rolü oturumun auth.uid()'sinden okur, DEFINER fonksiyonun içinde
-- de çağıranın rolünü döndürür. Şantiye şefinin kendi akışları yalnızca izinli kolonlara yazar:
--   add_task_progress → progress_daily INSERT → sync_task_progress_from_daily:
--     total_progress, progress_pct, status, actual_start, updated_at
--   set_task_milestone_status: status, progress_pct, actual_start, actual_end, updated_at
set local lock_timeout = '3s';

create or replace function public.fn_project_tasks_site_chief_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
declare
  v_izinli  constant text[] := array['actual_start','actual_end','progress_pct','total_progress','status','notes','equipment_notes','updated_at'];
  v_degisen text[];
begin
  if public.get_my_role() is distinct from 'santiye_sefi' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Şantiye şefi iş planına yeni iş kalemi ekleyemez; proje yöneticisine başvurun.'
      using errcode = '42501';
  end if;

  -- Hesaplanan (GENERATED) kolonlar karşılaştırılmaz: BEFORE trigger'da NEW'de henüz hesaplanmamış (null)
  -- görünürler (ör. duration_days = planned_end - planned_start). Kaynak kolonları zaten korunuyor.
  select array_agg(yeni.key order by yeni.key)
    into v_degisen
    from jsonb_each(to_jsonb(new)) yeni
   where not (yeni.key = any (v_izinli))
     and not exists (select 1 from pg_attribute att
                      where att.attrelid = tg_relid and att.attname = yeni.key and att.attgenerated <> '')
     and yeni.value is distinct from (to_jsonb(old) -> yeni.key);

  if v_degisen is not null then
    raise exception 'Şantiye şefi plan alanlarını değiştiremez (%). Yalnızca gerçekleşen başlangıç/bitiş, ilerleme, durum, not ve ekipman notu güncellenebilir.',
      array_to_string(v_degisen, ', ')
      using errcode = '42501';
  end if;

  return new;
end
$fn$;

comment on function public.fn_project_tasks_site_chief_guard() is
  'project_tasks BEFORE INSERT/UPDATE: şantiye şefi yalnızca actual_*, progress_pct, total_progress, status, notes, equipment_notes yazar (İP-4, İP-9).';

-- Trigger fonksiyonu doğrudan çağrılamaz; yine de varsayılan EXECUTE yetkisi kaldırılır (pg_default_acl).
revoke all on function public.fn_project_tasks_site_chief_guard() from public, anon, authenticated;

drop trigger if exists trg_project_tasks_site_chief_guard on public.project_tasks;
create trigger trg_project_tasks_site_chief_guard
  before insert or update on public.project_tasks
  for each row execute function public.fn_project_tasks_site_chief_guard();
