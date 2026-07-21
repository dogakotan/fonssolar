CREATE OR REPLACE FUNCTION public.get_invoice_approval_queue(p_project_id text DEFAULT NULL)
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
    'muhasebe_kuyrugu', CASE WHEN v_is_muhasebe THEN COALESCE((
      SELECT jsonb_agg(
        to_jsonb(inv) || jsonb_build_object('suppliers', jsonb_build_object('name', sup.name), 'projects', jsonb_build_object('name', proj.name))
        ORDER BY inv.invoice_date ASC
      )
      FROM invoices inv
      LEFT JOIN suppliers sup ON sup.id = inv.supplier_id
      LEFT JOIN projects proj ON proj.id = inv.project_id
      WHERE inv.status IN ('bekliyor', 'muhasebe_onayında')
        AND (p_project_id IS NULL OR inv.project_id = p_project_id)
        AND (p_project_id IS NOT NULL OR v_scope.scope_all OR inv.project_id = ANY(v_scope.project_ids))
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
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
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'kapanan_faturalar', CASE WHEN p_project_id IS NOT NULL AND (v_is_muhasebe OR v_is_admin) THEN COALESCE((
      SELECT jsonb_agg(to_jsonb(inv) || jsonb_build_object('suppliers', jsonb_build_object('name', sup.name)) ORDER BY inv.invoice_date DESC)
      FROM (
        SELECT * FROM invoices
        WHERE project_id = p_project_id AND status IN ('onaylandı', 'reddedildi')
        ORDER BY invoice_date DESC LIMIT 20
      ) inv
      LEFT JOIN suppliers sup ON sup.id = inv.supplier_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  ) INTO result;
  RETURN result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_invoice_approval_queue(text) TO authenticated;

