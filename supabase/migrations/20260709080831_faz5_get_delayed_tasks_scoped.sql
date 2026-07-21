
create or replace function public.get_delayed_tasks_scoped(p_project_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_scope record;
  result jsonb;
begin
  select * into v_scope from get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false, 'tasks', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'projectId', project_id, 'projectName', project_name,
    'taskCode', task_code, 'taskName', task_name, 'category', category,
    'plannedEnd', planned_end, 'progressPct', progress_pct,
    'responsible', responsible, 'daysOverdue', days_overdue, 'delaySeverity', delay_severity
  ) order by days_overdue desc), '[]'::jsonb)
  into result
  from vw_delayed_tasks
  where (v_scope.scope_all or project_id = any(v_scope.project_ids));

  return jsonb_build_object('authorized', true, 'tasks', result);
end;
$function$;

