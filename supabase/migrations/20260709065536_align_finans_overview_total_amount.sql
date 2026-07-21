
create or replace function public.get_finans_overview(p_project_id text, p_as_of_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_scope record;
  v_project record;
  v_total_planned numeric := 0;
  v_total_actual numeric := 0;
  v_pending_count int := 0;
  v_pending_amount numeric := 0;
  v_this_month_actual numeric := 0;
  v_remaining_budget numeric := 0;
  v_available_budget numeric := 0;
  v_remaining_days int;
  v_curve jsonb := '[]'::jsonb;
  v_dagilim jsonb;
  v_sapma_amount numeric := 0;
  v_sapma_pct numeric := 0;
  v_planned_to_date numeric := 0;
  v_ev numeric := 0;
  v_cpi numeric;
  v_buckets jsonb := '[]'::jsonb;
  v_bucket_total_planned numeric := 0;
  v_bucket_total_actual numeric := 0;
  v_bucket_total_sapma numeric := 0;
  v_bucket_total_pct numeric := 0;
  v_over_budget_count int := 0;
  v_recent jsonb;
  v_ai_muhasebe_count int := 0;
  v_ai_muhasebe_amount numeric := 0;
  v_ai_yonetici_count int := 0;
  v_ai_yonetici_amount numeric := 0;
  result jsonb;
begin
  select * into v_scope from get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false);
  end if;

  select * into v_project from projects where id = p_project_id;

  select coalesce(sum(planned_amount), 0) into v_total_planned from budget_lines where project_id = p_project_id;

  select
    coalesce(sum(total_amount) filter (where status in ('onaylandı','ödendi') and invoice_date <= p_as_of_date), 0),
    count(*) filter (where status in ('bekliyor','muhasebe_onayında','yönetici_onayında') and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount) filter (where status in ('bekliyor','muhasebe_onayında','yönetici_onayında') and invoice_date <= p_as_of_date), 0),
    coalesce(sum(total_amount) filter (where status in ('onaylandı','ödendi') and invoice_date >= date_trunc('month', p_as_of_date) and invoice_date <= p_as_of_date), 0)
  into v_total_actual, v_pending_count, v_pending_amount, v_this_month_actual
  from invoices where project_id = p_project_id;

  select
    count(*) filter (where status in ('bekliyor','muhasebe_onayında') and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount) filter (where status in ('bekliyor','muhasebe_onayında') and invoice_date <= p_as_of_date), 0),
    count(*) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date), 0)
  into v_ai_muhasebe_count, v_ai_muhasebe_amount, v_ai_yonetici_count, v_ai_yonetici_amount
  from invoices where project_id = p_project_id;

  v_remaining_budget := v_total_planned - v_total_actual;
  v_available_budget := v_total_planned - v_total_actual - v_pending_amount;

  if v_project.target_date is not null then
    v_remaining_days := (v_project.target_date - p_as_of_date);
  end if;

  if v_project.start_date is not null and v_project.target_date is not null
     and v_total_planned > 0 and v_project.target_date > v_project.start_date then
    with months as (
      select generate_series(date_trunc('month', v_project.start_date), date_trunc('month', v_project.target_date), interval '1 month')::date as month_start
    ), calc as (
      select
        month_start,
        (month_start + interval '1 month -1 day')::date as month_end,
        least(greatest((month_start + interval '1 month -1 day')::date - v_project.start_date, 0), v_project.target_date - v_project.start_date) as planned_elapsed,
        (v_project.target_date - v_project.start_date) as total_span
      from months
    )
    select jsonb_agg(jsonb_build_object(
      'month', month_start,
      'planned', round(v_total_planned * (planned_elapsed::numeric / nullif(total_span, 0))),
      'actual', case when month_start <= p_as_of_date then (
        select round(coalesce(sum(total_amount), 0)) from invoices
        where project_id = p_project_id and status in ('onaylandı','ödendi')
          and invoice_date <= least(month_end, p_as_of_date)
      ) else null end,
      'pendingSnapshot', case when date_trunc('month', p_as_of_date) = month_start
        then round(v_total_actual + v_pending_amount)
        else null end
    ) order by month_start) into v_curve
    from calc;

    v_planned_to_date := round(v_total_planned * (
      least(greatest(p_as_of_date - v_project.start_date, 0), v_project.target_date - v_project.start_date)::numeric
      / (v_project.target_date - v_project.start_date)
    ));
    v_sapma_amount := v_total_actual - v_planned_to_date;
    if v_planned_to_date > 0 then
      v_sapma_pct := round((v_sapma_amount / v_planned_to_date) * 1000) / 10;
    end if;
  end if;
  v_curve := coalesce(v_curve, '[]'::jsonb);

  if v_project.progress is not null and v_total_planned > 0 and v_total_actual > 0 then
    v_ev := round((v_project.progress::numeric / 100) * v_total_planned);
    v_cpi := round((v_ev / v_total_actual) * 100) / 100;
  end if;

  with bucket_map as (
    select name, category, planned_amount,
      case
        when category = 'iscilik' then 'iscilik'
        when category in ('panel','inverter','mekanik','elektrik_dc','elektrik_ac','elektrik_og','enh','altyapi') then 'malzeme'
        else 'diger'
      end as bucket
    from budget_lines where project_id = p_project_id
  ), bucket_planned as (
    select bucket, sum(planned_amount) as planned,
      jsonb_agg(jsonb_build_object('name', name, 'category', category, 'planned_amount', planned_amount) order by name) as lines
    from bucket_map group by bucket
  ), invoice_agg as (
    select
      case when category = 'iscilik' then 'iscilik' when category = 'malzeme' then 'malzeme' else 'diger' end as bucket,
      coalesce(sum(total_amount) filter (where status in ('onaylandı','ödendi')), 0) as actual,
      coalesce(sum(total_amount) filter (where status in ('bekliyor','muhasebe_onayında','yönetici_onayında')), 0) as pending
    from invoices where project_id = p_project_id and invoice_date <= p_as_of_date
    group by 1
  ), buckets as (
    select
      k.bucket as key,
      coalesce(bp.planned, 0) as planned,
      coalesce(ia.actual, 0) as actual,
      coalesce(ia.pending, 0) as pending,
      coalesce(bp.lines, '[]'::jsonb) as lines
    from (select unnest(array['malzeme','iscilik','diger']) as bucket) k
    left join bucket_planned bp on bp.bucket = k.bucket
    left join invoice_agg ia on ia.bucket = k.bucket
  )
  select
    jsonb_agg(jsonb_build_object(
      'key', key, 'planned', planned, 'actual', actual, 'pending', pending,
      'remaining', planned - actual - pending,
      'sapma', actual - planned,
      'pct', case when planned > 0 then round(((actual - planned) / planned) * 10000) / 100 else 0 end,
      'lines', lines
    ) order by key),
    coalesce(sum(planned), 0), coalesce(sum(actual), 0),
    coalesce(sum(actual), 0) - coalesce(sum(planned), 0),
    count(*) filter (where actual - planned > 0)
  into v_buckets, v_bucket_total_planned, v_bucket_total_actual, v_bucket_total_sapma, v_over_budget_count
  from buckets;
  v_buckets := coalesce(v_buckets, '[]'::jsonb);

  if v_bucket_total_planned > 0 then
    v_bucket_total_pct := round((v_bucket_total_sapma / v_bucket_total_planned) * 10000) / 100;
  end if;

  select jsonb_object_agg(b->>'key', (b->>'actual')::numeric)
  into v_dagilim
  from jsonb_array_elements(v_buckets) b;

  select jsonb_agg(jsonb_build_object(
    'id', id, 'status', status, 'category', category, 'amount', amount, 'total_amount', total_amount,
    'invoice_date', invoice_date, 'created_at', created_at
  ))
  into v_recent
  from (
    select id, status, category, amount, total_amount, invoice_date, created_at
    from invoices where project_id = p_project_id
    order by created_at desc nulls last, invoice_date desc limit 6
  ) t;

  result := jsonb_build_object(
    'authorized', true,
    'project', jsonb_build_object(
      'id', v_project.id, 'name', v_project.name, 'start_date', v_project.start_date, 'target_date', v_project.target_date,
      'capacity_kwp', v_project.capacity_kwp, 'progress', v_project.progress
    ),
    'kpi', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'totalPlanned', v_total_planned, 'totalActual', v_total_actual,
      'remainingBudget', v_remaining_budget, 'availableBudget', v_available_budget,
      'thisMonthActual', v_this_month_actual,
      'remainingDays', v_remaining_days
    ),
    'curve', v_curve,
    'dagilim', v_dagilim,
    'sapma', jsonb_build_object('amount', v_sapma_amount, 'pct', v_sapma_pct, 'plannedToDate', v_planned_to_date),
    'cpi', jsonb_build_object('ev', v_ev, 'cpi', v_cpi),
    'costBuckets', jsonb_build_object(
      'buckets', v_buckets, 'totalPlanned', v_bucket_total_planned, 'totalActual', v_bucket_total_actual,
      'totalSapma', v_bucket_total_sapma, 'totalPct', v_bucket_total_pct
    ),
    'quickFacts', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'overBudgetCount', v_over_budget_count
    ),
    'actionItems', jsonb_build_object(
      'muhasebeOnayi', jsonb_build_object('count', v_ai_muhasebe_count, 'amount', v_ai_muhasebe_amount),
      'yoneticiOnayi', jsonb_build_object('count', v_ai_yonetici_count, 'amount', v_ai_yonetici_amount)
    ),
    'recentActivity', coalesce(v_recent, '[]'::jsonb)
  );

  return result;
end;
$function$;

