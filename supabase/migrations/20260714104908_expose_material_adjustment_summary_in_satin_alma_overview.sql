
CREATE OR REPLACE FUNCTION public.get_satin_alma_overview(p_project_id text)
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
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'title', pr.title,
        'status', pr.status,
        'urgency', pr.urgency,
        'category', pr.category,
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
        'status', pi.status,
        'planned_qty', pi.planned_qty,
        'added_qty', COALESCE((
          SELECT SUM(a.delta_qty) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0),
        'added_via_count', COALESCE((
          SELECT COUNT(DISTINCT a.purchase_request_id) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0)
      ) ORDER BY pi.item_no NULLS LAST)
      FROM procurement_items pi WHERE pi.project_id = p_project_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_satin_alma_overview_all()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(NULL);

  SELECT jsonb_build_object(
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'title', pr.title,
        'status', pr.status,
        'urgency', pr.urgency,
        'category', pr.category,
        'created_at', pr.created_at,
        'updated_at', pr.updated_at,
        'project_id', pr.project_id,
        'project_name', p.name,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit))
          FROM purchase_request_items pri WHERE pri.request_id = pr.id
        ), '[]'::jsonb)
      ) ORDER BY pr.created_at DESC)
      FROM purchase_requests pr
      LEFT JOIN projects p ON p.id = pr.project_id
      WHERE (v_scope.scope_all OR pr.project_id = ANY(v_scope.project_ids))
    ), '[]'::jsonb),
    'procurement_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pi.id,
        'item_no', pi.item_no,
        'equipment', pi.equipment,
        'category', pi.category,
        'quantity', pi.quantity,
        'unit', pi.unit,
        'status', pi.status,
        'project_id', pi.project_id,
        'project_name', p.name,
        'planned_qty', pi.planned_qty,
        'added_qty', COALESCE((
          SELECT SUM(a.delta_qty) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0),
        'added_via_count', COALESCE((
          SELECT COUNT(DISTINCT a.purchase_request_id) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0)
      ) ORDER BY p.name NULLS LAST, pi.item_no NULLS LAST)
      FROM procurement_items pi
      LEFT JOIN projects p ON p.id = pi.project_id
      WHERE (v_scope.scope_all OR pi.project_id = ANY(v_scope.project_ids))
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

