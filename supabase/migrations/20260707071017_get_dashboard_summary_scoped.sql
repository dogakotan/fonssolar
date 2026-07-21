-- get_dashboard_summary: parametresiz eski imza farklı bir overload'a yol açar,
-- bu yüzden önce eski imzayı düşürüp yeni imzayla yeniden oluşturuyoruz.
DROP FUNCTION IF EXISTS public.get_dashboard_summary();

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_project_id text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role        text := get_my_role();
  v_is_manager  boolean;
  v_own_project text;
  v_scope_all   boolean := false;
  v_authorized  boolean := true;
  v_project_ids text[] := '{}';
BEGIN
  v_is_manager  := v_role = ANY (ARRAY['admin','koordinator','proje_koordinatoru','muhasebe','maliyet_kontrolcu']);
  v_own_project := (SELECT project_id FROM profiles WHERE id = auth.uid());

  IF p_project_id IS NOT NULL THEN
    -- Tek proje istendi: yönetim rolü, user_project_access veya kendi atanmış projesiyse izin ver.
    IF v_is_manager
       OR user_has_project_access(p_project_id)
       OR p_project_id = v_own_project
    THEN
      v_project_ids := ARRAY[p_project_id];
    ELSE
      v_project_ids := '{}'; -- yetkisiz istek -> boş sonuç, veri sızdırma yok
      v_authorized  := false;
    END IF;
  ELSIF v_is_manager THEN
    v_scope_all := true; -- NULL + yönetim rolü -> tüm projeler
  ELSE
    -- NULL + saha/diğer rol -> user_project_access + kendi atanmış projesinin toplamı
    SELECT COALESCE(array_agg(id), '{}') INTO v_project_ids
    FROM projects
    WHERE user_has_project_access(id) OR id = v_own_project;
  END IF;

  RETURN json_build_object(
    'authorized', v_authorized,
    'open_tickets',
      (SELECT count(*) FROM tickets
       WHERE status = 'açık' AND (v_scope_all OR project_id = ANY(v_project_ids))),
    'critical_tickets',
      (SELECT count(*) FROM tickets
       WHERE severity IN ('kritik','yüksek') AND status <> 'kapatıldı'
         AND (v_scope_all OR project_id = ANY(v_project_ids))),
    'total_budget',
      (SELECT COALESCE(sum(planned_amount), 0) FROM budget_lines
       WHERE (v_scope_all OR project_id = ANY(v_project_ids))),
    'spent_amount',
      (SELECT COALESCE(sum(amount), 0) FROM invoices
       WHERE status IN ('ödendi','yönetici_onayında','muhasebe_onayında')
         AND (v_scope_all OR project_id = ANY(v_project_ids))),
    'pending_invoices',
      (SELECT count(*) FROM invoices
       WHERE status IN ('yönetici_onayında','muhasebe_onayında')
         AND (v_scope_all OR project_id = ANY(v_project_ids))),
    'recent_notifications',
      (SELECT COALESCE(json_agg(t ORDER BY t.created_at DESC), '[]'::json)
       FROM (
         SELECT id, title, severity, status, created_at
         FROM tickets
         WHERE status <> 'kapatıldı' AND (v_scope_all OR project_id = ANY(v_project_ids))
         ORDER BY created_at DESC
         LIMIT 5
       ) t)
  );
END;
$function$;

