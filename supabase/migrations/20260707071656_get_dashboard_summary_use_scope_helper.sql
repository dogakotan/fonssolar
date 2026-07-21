CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_project_id text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);

  RETURN json_build_object(
    'authorized', v_scope.authorized,
    'open_tickets',
      (SELECT count(*) FROM tickets
       WHERE status = 'açık' AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))),
    'critical_tickets',
      (SELECT count(*) FROM tickets
       WHERE severity IN ('kritik','yüksek') AND status <> 'kapatıldı'
         AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))),
    'total_budget',
      (SELECT COALESCE(sum(planned_amount), 0) FROM budget_lines
       WHERE (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))),
    'spent_amount',
      (SELECT COALESCE(sum(amount), 0) FROM invoices
       WHERE status IN ('ödendi','yönetici_onayında','muhasebe_onayında')
         AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))),
    'pending_invoices',
      (SELECT count(*) FROM invoices
       WHERE status IN ('yönetici_onayında','muhasebe_onayında')
         AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))),
    'recent_notifications',
      (SELECT COALESCE(json_agg(t ORDER BY t.created_at DESC), '[]'::json)
       FROM (
         SELECT id, title, severity, status, created_at
         FROM tickets
         WHERE status <> 'kapatıldı' AND (v_scope.scope_all OR project_id = ANY(v_scope.project_ids))
         ORDER BY created_at DESC
         LIMIT 5
       ) t)
  );
END;
$function$;

