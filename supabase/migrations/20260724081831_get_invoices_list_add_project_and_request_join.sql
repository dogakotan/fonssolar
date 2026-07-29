-- get_invoices_list: Faturalar listesindeki "Proje" kolonu ve fatura no altındaki
-- bağlı talep başlığı için additive join'ler (mevcut 'stats'/'invoices' şekli aynı).
create or replace function public.get_invoices_list(p_project_id text default null::text, p_filter_date date default null::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      'amount', COALESCE(SUM(inv.total_amount) FILTER (WHERE inv.status = 'yönetici_onayında'), 0)
    ),
    'duzeltmeBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'duzeltme_bekliyor'),
      'amount', COALESCE(SUM(inv.total_amount) FILTER (WHERE inv.status = 'duzeltme_bekliyor'), 0)
    ),
    'odemeBekleyen', jsonb_build_object(
      'count', COUNT(*) FILTER (WHERE inv.status = 'odeme_bekliyor'),
      'amount', COALESCE(SUM(inv.total_amount) FILTER (WHERE inv.status = 'odeme_bekliyor'), 0)
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
        SELECT COALESCE(SUM(i2.total_amount), 0) FROM invoice_approvals ia
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
        ORDER BY inv.invoice_date DESC
      )
      FROM invoices inv
      LEFT JOIN suppliers sup ON sup.id = inv.supplier_id
      LEFT JOIN projects proj ON proj.id = inv.project_id
      LEFT JOIN purchase_requests pr ON pr.id = inv.purchase_request_id
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
