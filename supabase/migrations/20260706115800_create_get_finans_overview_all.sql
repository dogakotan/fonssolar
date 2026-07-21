-- Genel Finans sayfası için: get_finans_overview ile AYNI şekli döndürür, ama tek proje yerine
-- TÜM projeleri toplar. Proje bazlı start_date/target_date/progress gerektiren alanlar
-- (aylık akış, sapma, CPI) her projenin kendi tarih aralığı üzerinden hesaplanıp toplanır.
CREATE OR REPLACE FUNCTION public.get_finans_overview_all(p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_planned numeric := 0;
  v_total_actual numeric := 0;
  v_pending_count int := 0;
  v_pending_amount numeric := 0;
  v_pending_amount_excl numeric := 0;
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
  v_ai_muhasebe_count int := 0;
  v_ai_muhasebe_amount numeric := 0;
  v_ai_yonetici_count int := 0;
  v_ai_yonetici_amount numeric := 0;
  result jsonb;
BEGIN
  SELECT COALESCE(SUM(planned_amount), 0) INTO v_total_planned FROM budget_lines;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status IN ('onaylandı','ödendi') AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında') AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('onaylandı','ödendi') AND invoice_date >= date_trunc('month', p_as_of_date) AND invoice_date <= p_as_of_date), 0)
  INTO v_total_actual, v_pending_count, v_pending_amount, v_pending_amount_excl, v_this_month_actual
  FROM invoices;

  -- Aksiyon Gerektirenler: tüm projeler için fatura onay zincirindeki gerçek sayımlar
  SELECT
    COUNT(*) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında') AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında') AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date), 0)
  INTO v_ai_muhasebe_count, v_ai_muhasebe_amount, v_ai_yonetici_count, v_ai_yonetici_amount
  FROM invoices;

  v_remaining_budget := v_total_planned - v_total_actual;
  v_available_budget := v_total_planned - v_total_actual - v_pending_amount;

  -- Proje bazlı S-eğrisi/sapma/CPI: her projenin kendi start/target aralığındaki kümülatif
  -- planlanan tutarı hesaplanır, sonra tüm projeler için toplanır.
  WITH proj AS (
    SELECT p.id, p.start_date, p.target_date, p.progress,
      COALESCE((SELECT SUM(b.planned_amount) FROM budget_lines b WHERE b.project_id = p.id), 0) AS planned
    FROM projects p
    WHERE p.start_date IS NOT NULL AND p.target_date IS NOT NULL AND p.target_date > p.start_date
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
      SELECT ROUND(COALESCE(SUM(amount), 0)) FROM invoices
      WHERE status IN ('onaylandı','ödendi') AND invoice_date <= LEAST(month_end, p_as_of_date)
    ) ELSE NULL END,
    'pendingSnapshot', CASE WHEN date_trunc('month', p_as_of_date) = month_start
      THEN ROUND(v_total_actual + v_pending_amount_excl)
      ELSE NULL END
  ) ORDER BY month_start) INTO v_curve
  FROM month_planned;
  v_curve := COALESCE(v_curve, '[]'::jsonb);

  -- Maliyet kalemleri Harcama Dağılımı ile AYNI 3 kategoriye göre bölünür (Malzeme/İşçilik/Diğer) —
  -- invoices.category'de birebir gerçek, tahmini dağıtıma gerek yok. Proje filtresi YOK.
  WITH bucket_map AS (
    SELECT name, category, planned_amount,
      CASE
        WHEN category = 'iscilik' THEN 'iscilik'
        WHEN category IN ('panel','inverter','mekanik','elektrik_dc','elektrik_ac','elektrik_og','enh','altyapi') THEN 'malzeme'
        ELSE 'diger'
      END AS bucket
    FROM budget_lines
  ), bucket_planned AS (
    SELECT bucket, SUM(planned_amount) AS planned,
      jsonb_agg(jsonb_build_object('name', name, 'category', category, 'planned_amount', planned_amount) ORDER BY name) AS lines
    FROM bucket_map GROUP BY bucket
  ), invoice_agg AS (
    SELECT
      CASE WHEN category = 'iscilik' THEN 'iscilik' WHEN category = 'malzeme' THEN 'malzeme' ELSE 'diger' END AS bucket,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('onaylandı','ödendi')), 0) AS actual,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında')), 0) AS pending
    FROM invoices WHERE invoice_date <= p_as_of_date
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
    'id', id, 'status', status, 'category', category, 'amount', amount, 'total_amount', total_amount,
    'invoice_date', invoice_date, 'created_at', created_at
  ))
  INTO v_recent
  FROM (
    SELECT id, status, category, amount, total_amount, invoice_date, created_at
    FROM invoices
    ORDER BY created_at DESC NULLS LAST, invoice_date DESC LIMIT 6
  ) t;

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
      'muhasebeOnayi', jsonb_build_object('count', v_ai_muhasebe_count, 'amount', v_ai_muhasebe_amount),
      'yoneticiOnayi', jsonb_build_object('count', v_ai_yonetici_count, 'amount', v_ai_yonetici_amount)
    ),
    'recentActivity', COALESCE(v_recent, '[]'::jsonb)
  );

  RETURN result;
END;
$function$;

