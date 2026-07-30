-- ============================================================================
-- 1) Backfill: 6 orphaned invoices still carrying the OLD two-step approval
--    chain (step 1 "Muhasebe Onayı" + step 2 "Yönetici Onayı", both 'bekliyor')
--    from before the 2026-07-20 single-step simplification. Their invoices.status
--    is stuck at 'bekliyor'/'muhasebe_onayında' — a status current code can NEVER
--    produce or advance (canApproveHere only checks status='yönetici_onayında'),
--    so these rows are permanently un-actionable in the UI today. Collapse them
--    to the current single-step model (same shape create_invoice_approval_chain()
--    produces for new invoices) so they become normal, actionable invoices again.
-- ============================================================================
delete from invoice_approvals
where invoice_id in (select id from invoices where status in ('bekliyor', 'muhasebe_onayında'));

insert into invoice_approvals (invoice_id, step, step_label, status)
select id, 1, 'Yönetici Onayı', 'bekliyor'
from invoices where status in ('bekliyor', 'muhasebe_onayında');

-- fn_validate_invoice_status_transition() has no allowed-transition branch for
-- old.status='muhasebe_onayında' at all (further proof it's dead) and also
-- requires an authenticated admin/muhasebe session for bekliyor->yönetici_onayında
-- — neither holds for this one-time migration-tool backfill, so the trigger is
-- disabled for just this statement and re-enabled immediately after.
alter table invoices disable trigger trg_validate_invoice_status_transition;

update invoices set status = 'yönetici_onayında', updated_at = now()
where status in ('bekliyor', 'muhasebe_onayında');

alter table invoices enable trigger trg_validate_invoice_status_transition;

-- ============================================================================
-- 2) Tighten the CHECK constraint: 'muhasebe_onayında' can never be produced by
--    any current code path (create_invoice_approval_chain always sets
--    'yönetici_onayında' directly) and after the backfill above no row uses it.
--    'bekliyor' must stay — it's the column DEFAULT and the transient value an
--    AFTER INSERT trigger immediately advances past.
-- ============================================================================
alter table invoices drop constraint invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status = any (array['bekliyor','yönetici_onayında','onaylandı','reddedildi','ödendi']));

-- ============================================================================
-- 3) get_invoice_approval_queue: drop the dead 'muhasebe_kuyrugu' AND
--    'kapanan_faturalar' branches. OnayKuyrugu.jsx (its ONLY caller) only ever
--    reads data.yonetici_kuyrugu — both other branches were computed and
--    returned on every call for nothing, leftovers from the old two-step
--    design (muhasebe's own queue) and an unbuilt "closed invoices" view.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_invoice_approval_queue(p_project_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_scope record;
  v_role text;
  v_is_muhasebe boolean;
  v_is_admin boolean;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  v_role := get_my_role();
  v_is_muhasebe := v_role = 'muhasebe';
  v_is_admin := v_role = 'admin';

  SELECT jsonb_build_object(
    'authorized', true,
    'yonetici_kuyrugu', CASE WHEN v_is_muhasebe OR v_is_admin THEN COALESCE((
      SELECT jsonb_agg(
        to_jsonb(inv) || jsonb_build_object('suppliers', jsonb_build_object('name', sup.name), 'projects', jsonb_build_object('name', proj.name))
        ORDER BY inv.invoice_date ASC
      )
      FROM invoices inv
      LEFT JOIN suppliers sup ON sup.id = inv.supplier_id
      LEFT JOIN projects proj ON proj.id = inv.project_id
      WHERE inv.status = 'yönetici_onayında'
        AND (p_project_id IS NULL OR inv.project_id = p_project_id)
        AND (p_project_id IS NOT NULL OR v_scope.scope_all OR inv.project_id = ANY(v_scope.project_ids))
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  ) INTO result;
  RETURN result;
END;
$function$;

-- ============================================================================
-- 4) get_finans_overview_internal / get_finans_overview_all_internal /
--    get_dashboard_summary: drop 'muhasebe_onayında' from "pending" status
--    IN-lists. Pure dead-branch cleanup — after (1)+(2) this value can never
--    match, so removing it changes no numbers, only removes stale-looking SQL.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_finans_overview_internal(p_project_id text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    count(*) filter (where status in ('bekliyor','yönetici_onayında') and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount) filter (where status in ('bekliyor','yönetici_onayında') and invoice_date <= p_as_of_date), 0),
    coalesce(sum(total_amount) filter (where status in ('onaylandı','ödendi') and invoice_date >= date_trunc('month', p_as_of_date) and invoice_date <= p_as_of_date), 0)
  into v_total_actual, v_pending_count, v_pending_amount, v_this_month_actual
  from invoices where project_id = p_project_id;

  select
    count(*) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date), 0)
  into v_ai_yonetici_count, v_ai_yonetici_amount
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
      coalesce(sum(total_amount) filter (where status in ('bekliyor','yönetici_onayında')), 0) as pending
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
      'yoneticiOnayi', jsonb_build_object('count', v_ai_yonetici_count, 'amount', v_ai_yonetici_amount)
    ),
    'recentActivity', coalesce(v_recent, '[]'::jsonb)
  );

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_finans_overview_all_internal(p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope record;
  v_total_planned numeric := 0;
  v_total_actual numeric := 0;
  v_pending_count int := 0;
  v_pending_amount numeric := 0;
  v_this_month_actual numeric := 0;
  v_remaining_budget numeric := 0;
  v_available_budget numeric := 0;
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
  v_ai_yonetici_count int := 0;
  v_ai_yonetici_amount numeric := 0;
  result jsonb;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(NULL);

  SELECT COALESCE(SUM(planned_amount), 0) INTO v_total_planned
  FROM budget_lines WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids));

  SELECT
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('onaylandı','ödendi') AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status IN ('bekliyor','yönetici_onayında') AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('bekliyor','yönetici_onayında') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('onaylandı','ödendi') AND invoice_date >= date_trunc('month', p_as_of_date) AND invoice_date <= p_as_of_date), 0)
  INTO v_total_actual, v_pending_count, v_pending_amount, v_this_month_actual
  FROM invoices WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids));

  SELECT
    COUNT(*) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date), 0)
  INTO v_ai_yonetici_count, v_ai_yonetici_amount
  FROM invoices WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids));

  v_remaining_budget := v_total_planned - v_total_actual;
  v_available_budget := v_total_planned - v_total_actual - v_pending_amount;

  WITH proj AS (
    SELECT p.id, p.start_date, p.target_date, p.progress,
      COALESCE((SELECT SUM(b.planned_amount) FROM budget_lines b WHERE b.project_id = p.id), 0) AS planned
    FROM projects p
    WHERE p.start_date IS NOT NULL AND p.target_date IS NOT NULL AND p.target_date > p.start_date
      AND (v_scope.scope_all OR p.id = ANY(v_scope.project_ids))
  ),
  proj_active AS (
    SELECT * FROM proj WHERE planned > 0
  )
  SELECT
    COALESCE(SUM(ROUND(planned * (
      LEAST(GREATEST(p_as_of_date - start_date, 0), target_date - start_date)::numeric
      / (target_date - start_date)
    ))), 0),
    COALESCE(SUM(ROUND((progress::numeric / 100) * planned)) FILTER (WHERE progress IS NOT NULL), 0)
  INTO v_planned_to_date, v_ev
  FROM proj_active;

  v_sapma_amount := v_total_actual - v_planned_to_date;
  IF v_planned_to_date > 0 THEN
    v_sapma_pct := ROUND((v_sapma_amount / v_planned_to_date) * 1000) / 10;
  END IF;
  IF v_ev > 0 AND v_total_actual > 0 THEN
    v_cpi := ROUND((v_ev / v_total_actual) * 100) / 100;
  END IF;

  WITH proj AS (
    SELECT p.id, p.start_date, p.target_date,
      COALESCE((SELECT SUM(b.planned_amount) FROM budget_lines b WHERE b.project_id = p.id), 0) AS planned
    FROM projects p
    WHERE p.start_date IS NOT NULL AND p.target_date IS NOT NULL AND p.target_date > p.start_date
      AND (v_scope.scope_all OR p.id = ANY(v_scope.project_ids))
  ),
  proj_active AS (
    SELECT * FROM proj WHERE planned > 0
  ),
  bounds AS (
    SELECT MIN(start_date) AS min_start, MAX(target_date) AS max_target FROM proj_active
  ),
  months AS (
    SELECT generate_series(date_trunc('month', min_start), date_trunc('month', max_target), interval '1 month')::date AS month_start
    FROM bounds WHERE min_start IS NOT NULL
  ),
  month_calc AS (
    SELECT
      m.month_start,
      (m.month_start + interval '1 month -1 day')::date AS month_end,
      pa.start_date, pa.target_date, pa.planned
    FROM months m
    JOIN proj_active pa
      ON m.month_start <= date_trunc('month', pa.target_date)
     AND (m.month_start + interval '1 month -1 day')::date >= pa.start_date
  ),
  month_planned AS (
    SELECT month_start, month_end,
      SUM(ROUND(planned * (
        LEAST(GREATEST(month_end - start_date, 0), target_date - start_date)::numeric
        / (target_date - start_date)
      ))) AS planned_sum
    FROM month_calc
    GROUP BY month_start, month_end
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', month_start,
    'planned', planned_sum,
    'actual', CASE WHEN month_start <= p_as_of_date THEN (
      SELECT ROUND(COALESCE(SUM(total_amount), 0)) FROM invoices
      WHERE status IN ('onaylandı','ödendi') AND invoice_date <= LEAST(month_end, p_as_of_date)
        AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
    ) ELSE NULL END,
    'pendingSnapshot', CASE WHEN date_trunc('month', p_as_of_date) = month_start
      THEN ROUND(v_total_actual + v_pending_amount)
      ELSE NULL END
  ) ORDER BY month_start) INTO v_curve
  FROM month_planned;
  v_curve := COALESCE(v_curve, '[]'::jsonb);

  WITH bucket_map AS (
    SELECT name, category, planned_amount,
      CASE
        WHEN category = 'iscilik' THEN 'iscilik'
        WHEN category IN ('panel','inverter','mekanik','elektrik_dc','elektrik_ac','elektrik_og','enh','altyapi') THEN 'malzeme'
        ELSE 'diger'
      END AS bucket
    FROM budget_lines WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
  ), bucket_planned AS (
    SELECT bucket, SUM(planned_amount) AS planned,
      jsonb_agg(jsonb_build_object('name', name, 'category', category, 'planned_amount', planned_amount) ORDER BY name) AS lines
    FROM bucket_map GROUP BY bucket
  ), invoice_agg AS (
    SELECT
      CASE WHEN category = 'iscilik' THEN 'iscilik' WHEN category = 'malzeme' THEN 'malzeme' ELSE 'diger' END AS bucket,
      COALESCE(SUM(total_amount) FILTER (WHERE status IN ('onaylandı','ödendi')), 0) AS actual,
      COALESCE(SUM(total_amount) FILTER (WHERE status IN ('bekliyor','yönetici_onayında')), 0) AS pending
    FROM invoices
    WHERE invoice_date <= p_as_of_date AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
    GROUP BY 1
  ), buckets AS (
    SELECT
      k.bucket AS key,
      COALESCE(bp.planned, 0) AS planned,
      COALESCE(ia.actual, 0) AS actual,
      COALESCE(ia.pending, 0) AS pending,
      COALESCE(bp.lines, '[]'::jsonb) AS lines
    FROM (SELECT unnest(ARRAY['malzeme','iscilik','diger']) AS bucket) k
    LEFT JOIN bucket_planned bp ON bp.bucket = k.bucket
    LEFT JOIN invoice_agg ia ON ia.bucket = k.bucket
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'key', key, 'planned', planned, 'actual', actual, 'pending', pending,
      'remaining', planned - actual - pending,
      'sapma', actual - planned,
      'pct', CASE WHEN planned > 0 THEN ROUND(((actual - planned) / planned) * 10000) / 100 ELSE 0 END,
      'lines', lines
    ) ORDER BY key),
    COALESCE(SUM(planned), 0), COALESCE(SUM(actual), 0),
    COALESCE(SUM(actual), 0) - COALESCE(SUM(planned), 0),
    COUNT(*) FILTER (WHERE actual - planned > 0)
  INTO v_buckets, v_bucket_total_planned, v_bucket_total_actual, v_bucket_total_sapma, v_over_budget_count
  FROM buckets;
  v_buckets := COALESCE(v_buckets, '[]'::jsonb);

  IF v_bucket_total_planned > 0 THEN
    v_bucket_total_pct := ROUND((v_bucket_total_sapma / v_bucket_total_planned) * 10000) / 100;
  END IF;

  SELECT jsonb_object_agg(b->>'key', (b->>'actual')::numeric)
  INTO v_dagilim
  FROM jsonb_array_elements(v_buckets) b;

  SELECT jsonb_agg(jsonb_build_object(
    'id', i.id, 'status', i.status, 'category', i.category, 'amount', i.amount, 'total_amount', i.total_amount,
    'invoice_date', i.invoice_date, 'created_at', i.created_at,
    'project_id', i.project_id, 'project_name', p.name
  ))
  INTO v_recent
  FROM (
    SELECT id, status, category, amount, total_amount, invoice_date, created_at, project_id
    FROM invoices
    WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
    ORDER BY created_at DESC NULLS LAST, invoice_date DESC LIMIT 6
  ) i
  LEFT JOIN projects p ON p.id = i.project_id;

  result := jsonb_build_object(
    'kpi', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'totalPlanned', v_total_planned, 'totalActual', v_total_actual,
      'remainingBudget', v_remaining_budget, 'availableBudget', v_available_budget,
      'thisMonthActual', v_this_month_actual,
      'remainingDays', NULL
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
      'yoneticiOnayi', jsonb_build_object('count', v_ai_yonetici_count, 'amount', v_ai_yonetici_amount)
    ),
    'recentActivity', COALESCE(v_recent, '[]'::jsonb)
  );

  RETURN result;
END;
$function$;

-- ============================================================================
-- 5) get_dashboard_summary: same dead-branch cleanup for pending_invoices.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_project_id text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scope record;
begin
  select * into v_scope from get_project_scope(p_project_id);

  return json_build_object(
    'authorized', v_scope.authorized,
    'open_tickets',
      (select count(*) from tickets
       where status = 'açık' and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'critical_tickets',
      (select count(*) from tickets
       where severity in ('kritik','yüksek') and status <> 'kapatıldı'
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'total_budget',
      (select coalesce(sum(planned_amount), 0) from budget_lines
       where (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'spent_amount',
      (select coalesce(sum(total_amount), 0) from invoices
       where status in ('onaylandı','ödendi')
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'pending_invoices',
      (select count(*) from invoices
       where status = 'yönetici_onayında'
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'recent_notifications',
      (select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
       from (
         select id, title, severity, status, created_at
         from tickets
         where status <> 'kapatıldı' and (v_scope.scope_all or project_id = any(v_scope.project_ids))
         order by created_at desc
         limit 5
       ) t)
  );
end;
$function$;
