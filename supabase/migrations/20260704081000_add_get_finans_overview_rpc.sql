CREATE OR REPLACE FUNCTION public.get_finans_overview(p_project_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'project', (
      SELECT jsonb_build_object(
        'id', p.id, 'name', p.name, 'start_date', p.start_date, 'target_date', p.target_date
      )
      FROM projects p WHERE p.id = p_project_id
    ),
    'invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'invoice_date', i.invoice_date, 'amount', i.amount, 'total_amount', i.total_amount,
        'category', i.category, 'status', i.status, 'created_at', i.created_at
      ) ORDER BY i.invoice_date)
      FROM invoices i WHERE i.project_id = p_project_id
    ), '[]'::jsonb),
    'budget_lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', b.category, 'name', b.name, 'planned_amount', b.planned_amount))
      FROM budget_lines b WHERE b.project_id = p_project_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

