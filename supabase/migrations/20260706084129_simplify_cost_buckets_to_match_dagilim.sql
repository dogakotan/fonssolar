-- Kullanıcı isteği: Maliyet Kalemi Özeti / Maliyet Tablosu, Harcama Dağılımı ile AYNI kategorilere
-- (Malzeme/Hizmet/Diğer) göre bölünsün — GES alt kategorileri (Panel/İnverter/...) kaldırıldı.
-- Bu sayede oranlı dağıtım tahminine gerek kalmadı: malzeme/iscilik/diger invoices.category'de
-- birebir gerçek olduğu için actual/pending artık tahmin değil, doğrudan gerçek toplam.
CREATE OR REPLACE FUNCTION public.get_finans_overview(p_project_id text, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_project record;
  v_total_planned numeric := 0;
  v_total_actual numeric := 0;
  v_total_actual_incl numeric := 0;
  v_pending_count int := 0;
  v_pending_amount numeric := 0;
  v_pending_amount_excl numeric := 0;
  v_this_month_actual numeric := 0;
  v_remaining_budget numeric := 0;
  v_available_budget numeric := 0;
  v_usage_pct int := 0;
  v_remaining_pct int := 0;
  v_remaining_days int;
  v_cost_per_kwp numeric;
  v_planned_cost_per_kwp numeric;
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
  v_bucket_total_pending numeric := 0;
  v_bucket_total_sapma numeric := 0;
  v_bucket_total_pct numeric := 0;
  v_over_budget_count int := 0;
  v_savings_amount numeric := 0;
  v_recent jsonb;
  v_ai_muhasebe_count int := 0;
  v_ai_muhasebe_amount numeric := 0;
  v_ai_yonetici_count int := 0;
  v_ai_yonetici_amount numeric := 0;
  v_ai_odeme_count int := 0;
  v_ai_odeme_amount numeric := 0;
  v_ai_eksikbelge_count int := 0;
  result jsonb;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = p_project_id;

  SELECT COALESCE(SUM(planned_amount), 0) INTO v_total_planned FROM budget_lines WHERE project_id = p_project_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status IN ('onaylandı','ödendi') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('onaylandı','ödendi') AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında') AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında') AND invoice_date <= p_as_of_date), 0),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('onaylandı','ödendi') AND invoice_date >= date_trunc('month', p_as_of_date) AND invoice_date <= p_as_of_date), 0)
  INTO v_total_actual, v_total_actual_incl, v_pending_count, v_pending_amount, v_pending_amount_excl, v_this_month_actual
  FROM invoices WHERE project_id = p_project_id;

  -- Aksiyon Gerektirenler: fatura onay zincirindeki adımlara göre gerçek sayımlar
  SELECT
    COUNT(*) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında') AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında') AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'yönetici_onayında' AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status = 'onaylandı' AND invoice_date <= p_as_of_date),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'onaylandı' AND invoice_date <= p_as_of_date), 0),
    COUNT(*) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında') AND invoice_document_url IS NULL AND invoice_date <= p_as_of_date)
  INTO v_ai_muhasebe_count, v_ai_muhasebe_amount, v_ai_yonetici_count, v_ai_yonetici_amount, v_ai_odeme_count, v_ai_odeme_amount, v_ai_eksikbelge_count
  FROM invoices WHERE project_id = p_project_id;

  v_remaining_budget := v_total_planned - v_total_actual;
  v_available_budget := v_total_planned - v_total_actual - v_pending_amount;
  IF v_total_planned > 0 THEN
    v_usage_pct := ROUND(v_total_actual / v_total_planned * 100);
    v_remaining_pct := ROUND(v_remaining_budget / v_total_planned * 100);
  END IF;

  IF v_project.target_date IS NOT NULL THEN
    v_remaining_days := (v_project.target_date - p_as_of_date);
  END IF;

  IF v_project.capacity_kwp > 0 THEN
    v_cost_per_kwp := ROUND(v_total_actual / v_project.capacity_kwp);
    v_planned_cost_per_kwp := ROUND(v_total_planned / v_project.capacity_kwp);
  END IF;

  IF v_project.start_date IS NOT NULL AND v_project.target_date IS NOT NULL
     AND v_total_planned > 0 AND v_project.target_date > v_project.start_date THEN
    WITH months AS (
      SELECT generate_series(date_trunc('month', v_project.start_date), date_trunc('month', v_project.target_date), interval '1 month')::date AS month_start
    ), calc AS (
      SELECT
        month_start,
        (month_start + interval '1 month -1 day')::date AS month_end,
        LEAST(GREATEST((month_start + interval '1 month -1 day')::date - v_project.start_date, 0), v_project.target_date - v_project.start_date) AS planned_elapsed,
        (v_project.target_date - v_project.start_date) AS total_span
      FROM months
    )
    SELECT jsonb_agg(jsonb_build_object(
      'month', month_start,
      'planned', ROUND(v_total_planned * (planned_elapsed::numeric / NULLIF(total_span, 0))),
      'actual', CASE WHEN month_start <= p_as_of_date THEN (
        SELECT ROUND(COALESCE(SUM(amount), 0)) FROM invoices
        WHERE project_id = p_project_id AND status IN ('onaylandı','ödendi')
          AND invoice_date <= LEAST(month_end, p_as_of_date)
      ) ELSE NULL END,
      'pendingSnapshot', CASE WHEN date_trunc('month', p_as_of_date) = month_start
        THEN ROUND(v_total_actual + v_pending_amount_excl)
        ELSE NULL END
    ) ORDER BY month_start) INTO v_curve
    FROM calc;

    v_planned_to_date := ROUND(v_total_planned * (
      LEAST(GREATEST(p_as_of_date - v_project.start_date, 0), v_project.target_date - v_project.start_date)::numeric
      / (v_project.target_date - v_project.start_date)
    ));
    v_sapma_amount := v_total_actual - v_planned_to_date;
    IF v_planned_to_date > 0 THEN
      v_sapma_pct := ROUND((v_sapma_amount / v_planned_to_date) * 1000) / 10;
    END IF;
  END IF;
  v_curve := COALESCE(v_curve, '[]'::jsonb);

  IF v_project.progress IS NOT NULL AND v_total_planned > 0 AND v_total_actual > 0 THEN
    v_ev := ROUND((v_project.progress::numeric / 100) * v_total_planned);
    v_cpi := ROUND((v_ev / v_total_actual) * 100) / 100;
  END IF;

  -- Maliyet kalemleri de Harcama Dağılımı ile AYNI 3 kategoriye göre bölünür (Malzeme/İşçilik/Diğer) —
  -- invoices.category'de birebir gerçek, tahmini dağıtıma gerek yok.
  WITH bucket_map AS (
    SELECT name, category, planned_amount,
      CASE
        WHEN category = 'iscilik' THEN 'iscilik'
        WHEN category IN ('panel','inverter','mekanik','elektrik_dc','elektrik_ac','elektrik_og','enh','altyapi') THEN 'malzeme'
        ELSE 'diger'
      END AS bucket
    FROM budget_lines WHERE project_id = p_project_id
  ), bucket_planned AS (
    SELECT bucket, SUM(planned_amount) AS planned,
      jsonb_agg(jsonb_build_object('name', name, 'category', category, 'planned_amount', planned_amount) ORDER BY name) AS lines
    FROM bucket_map GROUP BY bucket
  ), invoice_agg AS (
    SELECT
      CASE WHEN category = 'iscilik' THEN 'iscilik' WHEN category = 'malzeme' THEN 'malzeme' ELSE 'diger' END AS bucket,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('onaylandı','ödendi')), 0) AS actual,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('bekliyor','muhasebe_onayında','yönetici_onayında')), 0) AS pending
    FROM invoices WHERE project_id = p_project_id AND invoice_date <= p_as_of_date
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
    COALESCE(SUM(planned), 0), COALESCE(SUM(actual), 0), COALESCE(SUM(pending), 0),
    COALESCE(SUM(actual), 0) - COALESCE(SUM(planned), 0),
    COUNT(*) FILTER (WHERE actual - planned > 0),
    COALESCE(SUM(planned - actual) FILTER (WHERE actual < planned), 0)
  INTO v_buckets, v_bucket_total_planned, v_bucket_total_actual, v_bucket_total_pending, v_bucket_total_sapma, v_over_budget_count, v_savings_amount
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
    FROM invoices WHERE project_id = p_project_id
    ORDER BY created_at DESC NULLS LAST, invoice_date DESC LIMIT 6
  ) t;

  result := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id, 'name', v_project.name, 'start_date', v_project.start_date, 'target_date', v_project.target_date,
      'capacity_kwp', v_project.capacity_kwp, 'progress', v_project.progress
    ),
    'kpi', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'totalPlanned', v_total_planned, 'totalActual', v_total_actual, 'totalActualInclVat', v_total_actual_incl,
      'remainingBudget', v_remaining_budget, 'availableBudget', v_available_budget,
      'usagePct', v_usage_pct, 'remainingPct', v_remaining_pct,
      'thisMonthActual', v_this_month_actual,
      'remainingDays', v_remaining_days,
      'costPerKwp', v_cost_per_kwp, 'plannedCostPerKwp', v_planned_cost_per_kwp, 'capacityKwp', v_project.capacity_kwp
    ),
    'curve', v_curve,
    'dagilim', v_dagilim,
    'sapma', jsonb_build_object('amount', v_sapma_amount, 'pct', v_sapma_pct, 'plannedToDate', v_planned_to_date),
    'cpi', jsonb_build_object('ev', v_ev, 'cpi', v_cpi),
    'costBuckets', jsonb_build_object(
      'buckets', v_buckets, 'totalPlanned', v_bucket_total_planned, 'totalActual', v_bucket_total_actual,
      'totalPending', v_bucket_total_pending, 'totalSapma', v_bucket_total_sapma, 'totalPct', v_bucket_total_pct
    ),
    'quickFacts', jsonb_build_object(
      'pendingCount', v_pending_count, 'pendingAmount', v_pending_amount,
      'overBudgetCount', v_over_budget_count, 'savingsAmount', v_savings_amount
    ),
    'actionItems', jsonb_build_object(
      'muhasebeOnayi', jsonb_build_object('count', v_ai_muhasebe_count, 'amount', v_ai_muhasebe_amount),
      'yoneticiOnayi', jsonb_build_object('count', v_ai_yonetici_count, 'amount', v_ai_yonetici_amount),
      'odemeBekleyen', jsonb_build_object('count', v_ai_odeme_count, 'amount', v_ai_odeme_amount),
      'eksikBelge', jsonb_build_object('count', v_ai_eksikbelge_count),
      'butceKontrolGereken', jsonb_build_object('count', v_over_budget_count)
    ),
    'recentActivity', COALESCE(v_recent, '[]'::jsonb)
  );

  RETURN result;
END;
$function$;

