
create or replace function public.get_project_progress_export(
  p_project_id text,
  p_period text default 'aylik'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_authorized boolean;
  v_project record;
  v_timeline jsonb;
  v_periodic jsonb;
  result jsonb;
begin
  select has_project_access(p_project_id) into v_authorized;
  if not v_authorized then
    return jsonb_build_object('authorized', false);
  end if;

  select id, name, capacity_kwp, start_date, target_date, progress
  into v_project
  from projects where id = p_project_id;

  select jsonb_agg(jsonb_build_object(
    'reportDate', report_date,
    'actualCumulativePct', actual_cumulative_pct,
    'plannedCumulativePct', planned_cumulative_pct
  ) order by report_date)
  into v_timeline
  from vw_progress_timeline
  where project_id = p_project_id;

  if p_period = 'haftalik' then
    select jsonb_agg(jsonb_build_object(
      'periodLabel', week_label, 'periodStart', week_start,
      'reportCount', report_count, 'activeDays', active_days,
      'avgDailyWorkers', avg_daily_workers, 'totalQtyAdded', total_qty_added,
      'activeProgressItems', active_progress_items
    ) order by week_start)
    into v_periodic
    from vw_weekly_progress where project_id = p_project_id;
  else
    select jsonb_agg(jsonb_build_object(
      'periodLabel', month_label, 'periodStart', month_start,
      'reportCount', report_count, 'activeDays', active_days,
      'avgDailyWorkers', avg_daily_workers, 'totalQtyAdded', total_qty_added,
      'activeProgressItems', active_progress_items
    ) order by month_start)
    into v_periodic
    from vw_monthly_progress where project_id = p_project_id;
  end if;

  result := jsonb_build_object(
    'authorized', true,
    'project', jsonb_build_object(
      'id', v_project.id, 'name', v_project.name, 'capacityKwp', v_project.capacity_kwp,
      'startDate', v_project.start_date, 'targetDate', v_project.target_date, 'progress', v_project.progress
    ),
    'timeline', coalesce(v_timeline, '[]'::jsonb),
    'periodic', coalesce(v_periodic, '[]'::jsonb)
  );
  return result;
end;
$function$;

