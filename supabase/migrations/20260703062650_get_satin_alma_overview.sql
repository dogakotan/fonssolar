CREATE OR REPLACE FUNCTION public.get_satin_alma_overview(p_project_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'title', pr.title,
        'status', pr.status,
        'urgency', pr.urgency,
        'created_at', pr.created_at,
        'updated_at', pr.updated_at,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit))
          FROM purchase_request_items pri WHERE pri.request_id = pr.id
        ), '[]'::jsonb)
      ) ORDER BY pr.created_at DESC)
      FROM purchase_requests pr WHERE pr.project_id = p_project_id
    ), '[]'::jsonb),
    'procurement_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'item_no', pi.item_no,
        'equipment', pi.equipment,
        'category', pi.category,
        'quantity', pi.quantity,
        'unit', pi.unit,
        'status', pi.status
      ) ORDER BY pi.item_no NULLS LAST)
      FROM procurement_items pi WHERE pi.project_id = p_project_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_satin_alma_overview(text) TO authenticated;

