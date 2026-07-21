
CREATE OR REPLACE FUNCTION public.save_daily_report(
  p_project_id text, p_report_date date, p_created_by uuid, p_general_status text,
  p_worker_count integer, p_weather text, p_weather_note text, p_notes text,
  p_personnel jsonb, p_machinery jsonb, p_progress jsonb DEFAULT '[]'::jsonb,
  p_daily_tasks jsonb DEFAULT '[]'::jsonb, p_materials jsonb DEFAULT '[]'::jsonb,
  p_issues jsonb DEFAULT '[]'::jsonb, p_task_progress jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_rid uuid;
begin
  insert into daily_reports (
    project_id, report_date, created_by,
    general_status, worker_count, weather, weather_note, notes, updated_at
  )
  values (
    p_project_id, p_report_date, p_created_by,
    p_general_status, p_worker_count, p_weather,
    nullif(p_weather_note, ''), nullif(p_notes, ''), now()
  )
  on conflict (project_id, report_date) do update set
    general_status = excluded.general_status,
    worker_count   = excluded.worker_count,
    weather        = excluded.weather,
    weather_note   = excluded.weather_note,
    notes          = excluded.notes,
    updated_at     = now()
  returning id into v_rid;

  delete from personnel_log_entries where report_id = v_rid;
  insert into personnel_log_entries (report_id, shift, department, count)
  select v_rid, item->>'shift', item->>'department', (item->>'count')::integer
  from   jsonb_array_elements(p_personnel) as item
  where  (item->>'count')::integer > 0;

  delete from machinery_logs where report_id = v_rid;
  insert into machinery_logs (report_id, machine_type, count, status, notes)
  select v_rid, item->>'machine_type', (item->>'count')::integer, item->>'status', nullif(item->>'notes', '')
  from   jsonb_array_elements(p_machinery) as item
  where  (item->>'count')::integer > 0;

  delete from progress_daily where report_id = v_rid;
  insert into progress_daily (report_id, task_id, qty_added, note)
  select v_rid, (item->>'task_id')::uuid, (item->>'qty_added')::numeric, nullif(item->>'note', '')
  from   jsonb_array_elements(p_task_progress) as item
  where  coalesce((item->>'qty_added')::numeric, 0) > 0;

  delete from daily_tasks where report_id = v_rid;
  insert into daily_tasks (report_id, type, description, order_index)
  select v_rid, item->>'type', item->>'description', coalesce((item->>'order_index')::integer, 0)
  from   jsonb_array_elements(p_daily_tasks) as item
  where  nullif(item->>'description', '') is not null;

  delete from daily_report_material_usage where report_id = v_rid;
  insert into daily_report_material_usage (report_id, project_id, material_name, quantity_used, unit, description, reason)
  select v_rid, p_project_id, item->>'material_name',
         coalesce((item->>'quantity_used')::numeric, 0), coalesce(nullif(item->>'unit', ''), 'Adet'),
         nullif(item->>'description', ''), nullif(item->>'reason', '')
  from   jsonb_array_elements(p_materials) as item
  where  nullif(item->>'material_name', '') is not null;

  -- ISSUES: upsert instead of delete+reinsert, so re-saving a report does NOT
  -- spawn duplicate tickets or orphan the ticket link (daily_report_issues.ticket_id
  -- is auto-populated by trg_create_ticket_from_daily_report_issue on true INSERT only).
  -- Client must pass back 'id' for issues that already existed (from get_daily_report_detail).

  -- 1) remove issues the user deleted from the form
  delete from daily_report_issues
  where report_id = v_rid
    and id not in (
      select nullif(item->>'id', '')::uuid
      from jsonb_array_elements(p_issues) as item
      where nullif(item->>'id', '') is not null
    );

  -- 2) update issues that already existed (preserves ticket_id; trigger syncs
  --    the linked ticket's status if resolution_status changed)
  update daily_report_issues d
  set topic             = item->>'topic',
      priority          = coalesce(nullif(item->>'priority', ''), 'orta'),
      assigned_to       = nullif(item->>'assigned_to', ''),
      description       = nullif(item->>'description', ''),
      resolution_status = coalesce(nullif(item->>'resolution_status', ''), 'açık')
  from   jsonb_array_elements(p_issues) as item
  where  d.report_id = v_rid
    and  d.id = nullif(item->>'id', '')::uuid;

  -- 3) insert genuinely new issues (no id in payload) -> fires ticket-creation trigger once
  insert into daily_report_issues (report_id, project_id, topic, priority, assigned_to, description, resolution_status)
  select v_rid, p_project_id, item->>'topic', coalesce(nullif(item->>'priority', ''), 'orta'),
         nullif(item->>'assigned_to', ''), nullif(item->>'description', ''),
         coalesce(nullif(item->>'resolution_status', ''), 'açık')
  from   jsonb_array_elements(p_issues) as item
  where  nullif(item->>'topic', '') is not null
    and  nullif(item->>'id', '') is null;

  return v_rid;
end;
$function$;

