-- Fatura oluşturmada USD/EUR desteği: invoices'a exchange_rate + total_amount_try
-- (TRY karşılığı, bütçe/KPI toplamlarının kanonik girdisi) eklenir. Mevcut
-- "gerçekleşen maliyet" toplamları (get_dashboard_summary, get_finans_overview(_all)_internal,
-- get_invoices_list stats, cost_allocations, get_project_by_date) total_amount yerine
-- total_amount_try kullanacak şekilde güncellenir — aksi halde bir USD/EUR fatura
-- eklendiğinde bu toplamlar farklı para birimlerini sessizce aynı sütunda toplardı.
-- Ödeme takibi (paid_amount/remaining_amount/invoice_payments) kapsam dışı — faturanın
-- kendi para biriminde kalmaya devam eder, dönüştürülmez.

alter table public.invoices
  add column exchange_rate numeric not null default 1,
  add column total_amount_try numeric generated always as
    ((amount + (amount * vat_rate) / 100) * exchange_rate) stored;

alter table public.invoices
  add constraint invoices_exchange_rate_positive check (exchange_rate > 0);

comment on column public.invoices.exchange_rate is
  'Fatura oluşturulduğu gündeki TCMB satış kuru (TRY faturalarda her zaman 1).';
comment on column public.invoices.total_amount_try is
  'total_amount * exchange_rate — bütçe/KPI karşılaştırmalarında kullanılan kanonik TRY tutarı.';

-- 1) get_dashboard_summary: spent_amount artık TRY karşılığıyla toplanıyor
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
      (select coalesce(sum(total_amount_try), 0) from invoices
       where status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi')
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'pending_invoices',
      (select count(*) from invoices
       where status in ('yönetici_onayında','duzeltme_bekliyor')
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

-- 2) get_finans_overview_internal: tüm aktif/bekleyen/bu-ay/bucket toplamları
--    total_amount_try'a geçti; v_recent'e (recentActivity) currency + total_amount_try eklendi.
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
    coalesce(sum(total_amount_try) filter (where status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') and invoice_date <= p_as_of_date), 0),
    count(*) filter (where status in ('yönetici_onayında','duzeltme_bekliyor') and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount_try) filter (where status in ('yönetici_onayında','duzeltme_bekliyor') and invoice_date <= p_as_of_date), 0),
    coalesce(sum(total_amount_try) filter (where status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') and invoice_date >= date_trunc('month', p_as_of_date) and invoice_date <= p_as_of_date), 0)
  into v_total_actual, v_pending_count, v_pending_amount, v_this_month_actual
  from invoices where project_id = p_project_id;

  select
    count(*) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date),
    coalesce(sum(total_amount_try) filter (where status = 'yönetici_onayında' and invoice_date <= p_as_of_date), 0)
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
        select round(coalesce(sum(total_amount_try), 0)) from invoices
        where project_id = p_project_id and status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi')
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
      coalesce(sum(total_amount_try) filter (where status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi')), 0) as actual,
      coalesce(sum(total_amount_try) filter (where status in ('yönetici_onayında','duzeltme_bekliyor')), 0) as pending
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
    'total_amount_try', total_amount_try, 'currency', currency,
    'invoice_date', invoice_date, 'created_at', created_at
  ))
  into v_recent
  from (
    select id, status, category, amount, total_amount, total_amount_try, currency, invoice_date, created_at
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

-- 3) get_finans_overview_all_internal: aynı total_amount_try geçişi (tüm-projeler görünümü)
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
    COALESCE(SUM(total_amount_try) FILTER (WHERE status IN ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status IN ('yönetici_onayında','duzeltme_bekliyor') AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount_try) FILTER (WHERE status IN ('yönetici_onayında','duzeltme_bekliyor') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(total_amount_try) FILTER (WHERE status IN ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') AND invoice_date >= date_trunc('month', p_as_of_date) AND invoice_date <= p_as_of_date), 0)
  INTO v_total_actual, v_pending_count, v_pending_amount, v_this_month_actual
  FROM invoices WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids));

  SELECT
    COUNT(*) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount_try) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date), 0)
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
      SELECT ROUND(COALESCE(SUM(total_amount_try), 0)) FROM invoices
      WHERE status IN ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') AND invoice_date <= LEAST(month_end, p_as_of_date)
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
      COALESCE(SUM(total_amount_try) FILTER (WHERE status IN ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi')), 0) AS actual,
      COALESCE(SUM(total_amount_try) FILTER (WHERE status IN ('yönetici_onayında','duzeltme_bekliyor')), 0) AS pending
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
    'total_amount_try', i.total_amount_try, 'currency', i.currency,
    'invoice_date', i.invoice_date, 'created_at', i.created_at,
    'project_id', i.project_id, 'project_name', p.name
  ))
  INTO v_recent
  FROM (
    SELECT id, status, category, amount, total_amount, total_amount_try, currency, invoice_date, created_at, project_id
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

-- 4) get_invoices_list: stat kartları (Onay/Düzeltme/Ödeme Bekleyen, Bu Ay Onaylanan)
--    total_amount_try'a geçti — liste satırlarının kendisi (to_jsonb(inv)) değişmedi,
--    yeni currency/exchange_rate/total_amount_try kolonları zaten otomatik dahil oluyor.
CREATE OR REPLACE FUNCTION public.get_invoices_list(p_project_id text DEFAULT NULL::text, p_filter_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_scope record;
  v_stats jsonb;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'onayBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'yönetici_onayında'),
      'amount', COALESCE(SUM(inv.total_amount_try) FILTER (WHERE inv.status = 'yönetici_onayında'), 0)
    ),
    'duzeltmeBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'duzeltme_bekliyor'),
      'amount', COALESCE(SUM(inv.total_amount_try) FILTER (WHERE inv.status = 'duzeltme_bekliyor'), 0)
    ),
    'odemeBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'odeme_bekliyor'),
      'amount', COALESCE(SUM(inv.total_amount_try) FILTER (WHERE inv.status = 'odeme_bekliyor'), 0)
    ),
    'buAyOnaylanan', jsonb_build_object(
      'count', (
        SELECT COUNT(*) FROM invoice_approvals ia
        JOIN invoices i2 ON i2.id = ia.invoice_id
        WHERE ia.step_label = 'Yönetici Onayı' AND ia.status = 'onaylandı'
          AND date_trunc('month', ia.reviewed_at) = date_trunc('month', CURRENT_DATE)
          AND CASE WHEN p_project_id IS NOT NULL THEN i2.project_id = p_project_id
                   ELSE (v_scope.scope_all OR i2.project_id = ANY(v_scope.project_ids)) END
      ),
      'amount', (
        SELECT COALESCE(SUM(i2.total_amount_try), 0) FROM invoice_approvals ia
        JOIN invoices i2 ON i2.id = ia.invoice_id
        WHERE ia.step_label = 'Yönetici Onayı' AND ia.status = 'onaylandı'
          AND date_trunc('month', ia.reviewed_at) = date_trunc('month', CURRENT_DATE)
          AND CASE WHEN p_project_id IS NOT NULL THEN i2.project_id = p_project_id
                   ELSE (v_scope.scope_all OR i2.project_id = ANY(v_scope.project_ids)) END
      )
    )
  )
  INTO v_stats
  FROM invoices inv
  WHERE CASE WHEN p_project_id IS NOT NULL THEN inv.project_id = p_project_id
             ELSE (v_scope.scope_all OR inv.project_id = ANY(v_scope.project_ids)) END;

  SELECT jsonb_build_object(
    'authorized', true,
    'stats', v_stats,
    'invoices', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(inv)
        || jsonb_build_object('suppliers', jsonb_build_object('name', sup.name))
        || jsonb_build_object('projects', jsonb_build_object('name', proj.name))
        || jsonb_build_object('purchase_requests', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('title', pr.title) END)
        || jsonb_build_object('creator', CASE WHEN creator.id IS NULL THEN NULL ELSE jsonb_build_object('full_name', creator.full_name) END)
        ORDER BY inv.invoice_date DESC
      )
      FROM invoices inv
      LEFT JOIN suppliers sup ON sup.id = inv.supplier_id
      LEFT JOIN projects proj ON proj.id = inv.project_id
      LEFT JOIN purchase_requests pr ON pr.id = inv.purchase_request_id
      LEFT JOIN profiles creator ON creator.id = inv.created_by
      WHERE
        CASE
          WHEN p_project_id IS NOT NULL THEN
            inv.project_id = p_project_id
            AND inv.invoice_date <= COALESCE(p_filter_date, CURRENT_DATE)
          ELSE
            (v_scope.scope_all OR inv.project_id = ANY(v_scope.project_ids))
        END
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

-- 5) sync_cost_allocation_from_invoice: cost_allocations artık TRY karşılığını yazıyor
--    (get_finans_overview(_all)'daki totalActual ile aynı kanonik kaynağı kullanmaya devam eder).
CREATE OR REPLACE FUNCTION public.sync_cost_allocation_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') then
    insert into cost_allocations (invoice_id, project_id, amount, category, note, allocated_at)
    values (NEW.id, NEW.project_id, NEW.total_amount_try, NEW.category, 'Fatura onayından otomatik', now())
    on conflict (invoice_id) do update
      set amount = excluded.amount, category = excluded.category, project_id = excluded.project_id;
  else
    delete from cost_allocations where invoice_id = NEW.id;
  end if;
  return NEW;
end;
$function$;

-- 6) get_project_by_date: Genel Proje sekmesindeki "Özet/Harcanan" kartı ProjectOverviewDashboard.jsx'te
--    ham total_amount topluyordu — invoices dizisine total_amount_try eklendi, frontend ona geçecek.
CREATE OR REPLACE FUNCTION public.get_project_by_date(p_project_id text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report_id UUID;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT id INTO v_report_id
  FROM daily_reports
  WHERE project_id = p_project_id
    AND report_date <= p_date
  ORDER BY report_date DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'authorized', true,

    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    'report', (
      SELECT jsonb_build_object(
        'id',             dr.id,
        'report_date',    dr.report_date,
        'weather',        dr.weather,
        'notes',          dr.notes,
        'worker_count',   dr.worker_count,
        'general_status', dr.general_status,
        'creator_name',   COALESCE(pr.full_name, pr.email)
      )
      FROM daily_reports dr
      LEFT JOIN profiles pr ON pr.id = dr.created_by
      WHERE dr.id = v_report_id
    ),

    'personnel', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'shift',      ple.shift,
        'department', ple.department,
        'count',      ple.count
      )), '[]'::jsonb)
      FROM personnel_log_entries ple
      WHERE ple.report_id = v_report_id
    ),

    'machinery', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'machine_type', ml.machine_type,
        'count',        ml.count,
        'status',       ml.status
      )), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = v_report_id
    ),

    'progress_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',            pt.id,
        'name',          pt.task_name,
        'unit',          pt.unit,
        'category',      pt.category,
        'target_qty',    pt.target_qty,
        'total_to_date', COALESCE(sums.total_qty, 0),
        'pct',           ROUND(
                           LEAST(100.0,
                             COALESCE(sums.total_qty, 0.0)
                             / NULLIF(pt.target_qty::numeric, 0) * 100.0
                           )::numeric, 1)
      ) ORDER BY pt.planned_start NULLS LAST), '[]'::jsonb)
      FROM project_tasks pt
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.task_id = pt.id
          AND dr.report_date <= p_date
      ) sums ON TRUE
      WHERE pt.project_id = p_project_id
    ),

    'overall_pct', (
      SELECT ROUND(COALESCE(
        CASE
          WHEN EXISTS (SELECT 1 FROM project_category_weights WHERE project_id = p_project_id) THEN (
            SELECT SUM(w.weight_pct * COALESCE(cat_avg.avg_progress, 0)) / 100
            FROM project_category_weights w
            LEFT JOIN (
              SELECT pt.category,
                AVG(
                  LEAST(100.0,
                    COALESCE(sums.total_qty, 0.0)
                    / NULLIF(pt.target_qty::numeric, 0) * 100.0
                  )
                ) AS avg_progress
              FROM project_tasks pt
              LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
                FROM progress_daily pd
                JOIN daily_reports dr ON dr.id = pd.report_id
                WHERE pd.task_id = pt.id
                  AND dr.report_date <= p_date
              ) sums ON TRUE
              WHERE pt.project_id = p_project_id
                AND pt.target_qty > 0
              GROUP BY pt.category
            ) cat_avg ON cat_avg.category = w.category
            WHERE w.project_id = p_project_id
          )
          ELSE (
            SELECT SUM(
              LEAST(100.0,
                COALESCE(sums.total_qty, 0.0)
                / NULLIF(pt.target_qty::numeric, 0) * 100.0
              ) * GREATEST(COALESCE(pt.planned_end - pt.planned_start, 1), 1)
            ) / NULLIF(SUM(GREATEST(COALESCE(pt.planned_end - pt.planned_start, 1), 1)), 0)
            FROM project_tasks pt
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
              FROM progress_daily pd
              JOIN daily_reports dr ON dr.id = pd.report_id
              WHERE pd.task_id = pt.id
                AND dr.report_date <= p_date
            ) sums ON TRUE
            WHERE pt.project_id = p_project_id
              AND pt.target_qty > 0
          )
        END
      , 0)::numeric, 1)
    ),

    'category_weights', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'category',      w.category,
          'weight_pct',    w.weight_pct,
          'avg_progress',  COALESCE(cat_avg.avg_progress, 0)
        ) ORDER BY w.weight_pct DESC
      ), '[]'::jsonb)
      FROM project_category_weights w
      LEFT JOIN (
        SELECT pt.category,
          AVG(
            LEAST(100.0,
              COALESCE(sums.total_qty, 0.0)
              / NULLIF(pt.target_qty::numeric, 0) * 100.0
            )
          ) AS avg_progress
        FROM project_tasks pt
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
          FROM progress_daily pd
          JOIN daily_reports dr ON dr.id = pd.report_id
          WHERE pd.task_id = pt.id
            AND dr.report_date <= p_date
        ) sums ON TRUE
        WHERE pt.project_id = p_project_id
          AND pt.target_qty > 0
        GROUP BY pt.category
      ) cat_avg ON cat_avg.category = w.category
      WHERE w.project_id = p_project_id
    ),

    'risks', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',          r.id,
          'title',       r.title,
          'severity',    r.severity,
          'source',      r.source,
          'rule_code',   r.rule_code,
          'subject_ref', r.subject_ref,
          'category',    r.category
        ) ORDER BY
          CASE r.severity
            WHEN 'kritik' THEN 1
            WHEN 'yüksek' THEN 2
            WHEN 'orta'   THEN 3
            WHEN 'düşük'  THEN 4
            ELSE 5
          END,
          r.created_at DESC
      ), '[]'::jsonb)
      FROM project_risks r
      WHERE r.project_id = p_project_id
        AND r.status = 'açık'
    ),

    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',            pt.id,
        'task_code',     pt.task_code,
        'name',          pt.task_name,
        'task_name',     pt.task_name,
        'category',      pt.category,
        'planned_start', pt.planned_start,
        'planned_end',   pt.planned_end,
        'start_date',    pt.planned_start,
        'due_date',      pt.planned_end,
        'actual_start',  pt.actual_start,
        'progress_pct',  pt.progress_pct,
        'progress',      pt.progress_pct,
        'status',        pt.status,
        'responsible',   pt.responsible,
        'team_size',     pt.team_size
      ) ORDER BY pt.planned_start NULLS LAST), '[]'::jsonb)
      FROM project_tasks pt
      WHERE pt.project_id = p_project_id
    ),

    'tickets', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',         t.id,
        'title',      t.title,
        'severity',   t.severity,
        'status',     t.status,
        'category',   t.category,
        'created_at', t.created_at
      ) ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM tickets t
      WHERE t.project_id = p_project_id
        AND t.created_at::date <= p_date
        AND t.status <> 'kapatıldı'
      LIMIT 8
    ),

    'purchases', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',        pr.id,
        'title',     pr.title,
        'status',    pr.status,
        'urgency',   pr.urgency,
        'notes',     pr.notes,
        'created_at',pr.created_at
      ) ORDER BY pr.created_at DESC), '[]'::jsonb)
      FROM purchase_requests pr
      WHERE pr.project_id = p_project_id
        AND pr.created_at::date <= p_date
      LIMIT 6
    ),

    'budget_lines', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',             bl.id,
        'category',       bl.category,
        'name',           bl.name,
        'planned_amount', bl.planned_amount
      )), '[]'::jsonb)
      FROM budget_lines bl
      WHERE bl.project_id = p_project_id
    ),

    'invoices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',              inv.id,
        'total_amount',    inv.total_amount,
        'total_amount_try',inv.total_amount_try,
        'currency',        inv.currency,
        'amount',          inv.amount,
        'status',          inv.status,
        'created_at',      inv.created_at,
        'invoice_date',    inv.invoice_date
      )), '[]'::jsonb)
      FROM invoices inv
      WHERE inv.project_id = p_project_id
        AND COALESCE(inv.invoice_date, inv.created_at::date) <= p_date
    ),

    'weather_lost_days', (
      SELECT COUNT(*)
      FROM daily_reports dr
      WHERE dr.project_id = p_project_id
        AND dr.report_date <= p_date
        AND dr.weather IN ('yağmurlu', 'karlı', 'fırtınalı')
    )

  );
END;
$function$;
