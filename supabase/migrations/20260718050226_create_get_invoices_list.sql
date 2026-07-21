CREATE OR REPLACE FUNCTION public.get_invoices_list(
  p_project_id text DEFAULT NULL,
  p_filter_date date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'invoices', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(inv) || jsonb_build_object('suppliers', jsonb_build_object('name', sup.name))
        ORDER BY inv.invoice_date DESC
      )
      FROM invoices inv
      LEFT JOIN suppliers sup ON sup.id = inv.supplier_id
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

GRANT EXECUTE ON FUNCTION public.get_invoices_list(text, date) TO authenticated;

