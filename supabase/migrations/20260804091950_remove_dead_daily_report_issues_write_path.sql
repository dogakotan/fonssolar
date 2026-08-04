-- daily_report_issues yazı yolu artık dead code: DailyReportForm.jsx'ten
-- "Sorunlar" bölümü 2026-07-29'da kaldırıldı, hiçbir UI'dan yeni satır
-- eklenmiyor/güncellenmiyor. Tablo + eski verinin salt-okunur gösterimi
-- (DailyReportDetail.jsx, Excel/PDF export, get_daily_report_detail RPC)
-- KORUNUYOR — yalnızca save_daily_report'un p_issues parametresi ve
-- fn_create_ticket_from_daily_report_issue() INSERT trigger'ı kaldırılıyor.

drop trigger if exists trg_create_ticket_from_daily_report_issue on public.daily_report_issues;
drop function if exists public.fn_create_ticket_from_daily_report_issue();

drop function if exists public.save_daily_report(
  text, date, uuid, text, integer, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
);

create function public.save_daily_report(
  p_project_id text,
  p_report_date date,
  p_created_by uuid,
  p_general_status text,
  p_worker_count integer,
  p_weather text,
  p_weather_note text,
  p_notes text,
  p_personnel jsonb,
  p_machinery jsonb,
  p_progress jsonb default '[]'::jsonb,
  p_daily_tasks jsonb default '[]'::jsonb,
  p_materials jsonb default '[]'::jsonb,
  p_task_progress jsonb default '[]'::jsonb
)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rid uuid;
  v_role text;
begin
  if p_created_by is distinct from auth.uid() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  v_role := public.get_my_role();
  if v_role not in ('admin', 'santiye_sefi', 'proje_yoneticisi') then
    raise exception 'Günlük rapor kaydetme yetkiniz yok.';
  end if;

  if not public.has_project_access(p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  insert into public.daily_reports (
    project_id, report_date, created_by,
    general_status, worker_count, weather, weather_note, notes,
    auto_created_from_progress, updated_at
  )
  values (
    p_project_id, p_report_date, p_created_by,
    p_general_status, p_worker_count, p_weather,
    nullif(p_weather_note, ''), nullif(p_notes, ''),
    false, now()
  )
  on conflict (project_id, report_date) do update set
    created_by                 = excluded.created_by,
    general_status             = excluded.general_status,
    worker_count                = excluded.worker_count,
    weather                    = excluded.weather,
    weather_note               = excluded.weather_note,
    notes                      = excluded.notes,
    auto_created_from_progress = false,
    updated_at                 = now()
  returning id into v_rid;

  delete from public.personnel_log_entries where report_id = v_rid;
  insert into public.personnel_log_entries (report_id, shift, department, count)
  select v_rid, item->>'shift', item->>'department', (item->>'count')::integer
  from jsonb_array_elements(p_personnel) as item
  where (item->>'count')::integer > 0;

  delete from public.machinery_logs where report_id = v_rid;
  insert into public.machinery_logs (report_id, machine_type, count, status, notes)
  select v_rid, item->>'machine_type', (item->>'count')::integer,
         item->>'status', nullif(item->>'notes', '')
  from jsonb_array_elements(p_machinery) as item
  where (item->>'count')::integer > 0;

  delete from public.progress_daily
  where report_id = v_rid and source = 'daily_report';

  insert into public.progress_daily (
    report_id, task_id, qty_added, note, source, entered_by
  )
  select v_rid, (item->>'task_id')::uuid, (item->>'qty_added')::numeric,
         nullif(item->>'note', ''), 'daily_report', p_created_by
  from jsonb_array_elements(p_task_progress) as item
  where coalesce((item->>'qty_added')::numeric, 0) > 0;

  delete from public.daily_tasks where report_id = v_rid;
  insert into public.daily_tasks (report_id, type, description, order_index)
  select v_rid, item->>'type', item->>'description',
         coalesce((item->>'order_index')::integer, 0)
  from jsonb_array_elements(p_daily_tasks) as item
  where nullif(item->>'description', '') is not null;

  delete from public.daily_report_material_usage where report_id = v_rid;
  insert into public.daily_report_material_usage (
    report_id, project_id, material_name, quantity_used, unit, description, reason
  )
  select v_rid, p_project_id, item->>'material_name',
         coalesce((item->>'quantity_used')::numeric, 0),
         coalesce(nullif(item->>'unit', ''), 'Adet'),
         nullif(item->>'description', ''), nullif(item->>'reason', '')
  from jsonb_array_elements(p_materials) as item
  where nullif(item->>'material_name', '') is not null;

  return v_rid;
end;
$function$;

revoke all on function public.save_daily_report(
  text, date, uuid, text, integer, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.save_daily_report(
  text, date, uuid, text, integer, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
