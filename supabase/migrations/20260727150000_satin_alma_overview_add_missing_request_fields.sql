-- get_satin_alma_overview_all_internal()'daki requests jsonb'i tedarikçi adı,
-- onaylanan tutar, talep eden kişi ve kalem fiyatlarını hiç döndürmüyordu —
-- MuhasebeSatinAlma.jsx bu alanlara göre filtreleme/gösterim yapıyor
-- (Tedarikçi filtresi hep boş, Onaylanan Tutar hep ₺0 görünüyordu).

CREATE OR REPLACE FUNCTION public.get_satin_alma_overview_all_internal()
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
        'approved_at', pr.approved_at,
        'project_id', pr.project_id,
        'project_name', p.name,
        'supplier_id', pr.supplier_id,
        'supplier_name', sup.name,
        'estimated_amount_incl_vat', pr.estimated_amount_incl_vat,
        'requester_name', requester.full_name,
        'description', pr.request_note,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit,
            'unit_price', pri.unit_price, 'total_price', pri.total_price
          ))
          FROM purchase_request_items pri WHERE pri.request_id = pr.id
        ), '[]'::jsonb)
      ) ORDER BY pr.created_at DESC)
      FROM purchase_requests pr
      LEFT JOIN projects p ON p.id = pr.project_id
      LEFT JOIN suppliers sup ON sup.id = pr.supplier_id
      LEFT JOIN profiles requester ON requester.id = pr.requested_by
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
