-- Malzeme Listesi eşleştirme önerisi özelliği: purchase_request_items.bom_item_id
-- (mevcut FK) zaten var ama get_satin_alma_overview(_all_internal) bunu hiç
-- döndürmüyordu (yalnızca name/quantity/unit) — frontend'in bir kalemin zaten
-- BOM'a bağlı olup olmadığını bilmesi için eklendi. Ayrıca eşleştirmeyi onaylayınca
-- bom_item_id'yi güvenli şekilde yazan yeni bir RPC.

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
        'request_no', pr.request_no,
        'title', pr.title,
        'status', pr.status,
        'urgency', pr.urgency,
        'category', pr.category,
        'created_at', pr.created_at,
        'updated_at', pr.updated_at,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', pri.id, 'name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit, 'bom_item_id', pri.bom_item_id))
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
        'planned_qty', pi.planned_qty,
        'added_qty', COALESCE((
          SELECT SUM(a.delta_qty) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0),
        'added_via_count', COALESCE((
          SELECT COUNT(DISTINCT a.purchase_request_id) FROM procurement_item_adjustments a
          WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL
        ), 0),
        'has_history', (
          EXISTS (SELECT 1 FROM procurement_item_change_requests pcr WHERE pcr.procurement_item_id = pi.id AND pcr.status = 'onaylandi')
          OR EXISTS (SELECT 1 FROM procurement_item_adjustments a WHERE a.procurement_item_id = pi.id AND a.reversed_at IS NULL)
          OR EXISTS (
            SELECT 1 FROM procurement_item_change_requests pcr2
            WHERE pcr2.procurement_item_id IS NULL AND pcr2.status = 'onaylandi'
              AND pcr2.project_id = pi.project_id
              AND lower(trim(pcr2.new_equipment)) = lower(trim(pi.equipment))
          )
        )
      ) ORDER BY pi.item_no NULLS LAST)
      FROM procurement_items pi WHERE pi.project_id = p_project_id
    ), '[]'::jsonb),
    'pending_changes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pcr.id,
        'procurement_item_id', pcr.procurement_item_id,
        'old_planned_qty', pcr.old_planned_qty,
        'new_planned_qty', pcr.new_planned_qty,
        'note', pcr.note,
        'requested_by', pcr.requested_by,
        'requester_name', prf.full_name,
        'requested_at', pcr.requested_at,
        'status', pcr.status,
        'equipment', COALESCE(pi2.equipment, pcr.new_equipment),
        'unit', COALESCE(pi2.unit, pcr.new_unit),
        'is_new', (pcr.procurement_item_id IS NULL)
      ) ORDER BY pcr.requested_at ASC)
      FROM procurement_item_change_requests pcr
      LEFT JOIN profiles prf ON prf.id = pcr.requested_by
      LEFT JOIN procurement_items pi2 ON pi2.id = pcr.procurement_item_id
      WHERE pcr.project_id = p_project_id AND pcr.status = 'bekliyor'
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

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
        'request_no', pr.request_no,
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
            'id', pri.id, 'name', pri.name, 'quantity', pri.quantity, 'unit', pri.unit,
            'unit_price', pri.unit_price, 'total_price', pri.total_price, 'bom_item_id', pri.bom_item_id
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

-- Bir talep kalemini (henüz bom_item_id'si boşsa) BOM'daki gerçek bir kaleme
-- bağlar. Yalnızca admin/proje_yöneticisi, yalnızca aynı projede, yalnızca kalem
-- hâlâ bağlantısızken. Bağlantı kurulduktan sonra otomatik risk motorunu
-- (fn_recompute_auto_risks) tetikler — artık doğru sayılan miktar planı aşıyorsa
-- yeni bir "malzeme_fazla_talep" riski hemen açılabilsin diye (p_close_material_risks
-- = false: bu çağrı bir onay anlamına gelmiyor, mevcut açık riskleri kapatmaz).
CREATE OR REPLACE FUNCTION public.link_purchase_request_item_to_bom(
  p_item_id uuid,
  p_procurement_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request_project_id text;
  v_current_bom_item_id uuid;
  v_bom_project_id text;
BEGIN
  SELECT pr.project_id, pri.bom_item_id
    INTO v_request_project_id, v_current_bom_item_id
  FROM public.purchase_request_items pri
  JOIN public.purchase_requests pr ON pr.id = pri.request_id
  WHERE pri.id = p_item_id;

  IF v_request_project_id IS NULL THEN
    RAISE EXCEPTION 'Talep kalemi bulunamadı';
  END IF;

  IF NOT public.has_project_access(v_request_project_id)
     OR public.get_my_role() NOT IN ('admin', 'proje_yoneticisi') THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_current_bom_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu talep kalemi zaten bir malzeme listesi kalemine bağlı.';
  END IF;

  SELECT project_id INTO v_bom_project_id
  FROM public.procurement_items
  WHERE id = p_procurement_item_id;

  IF v_bom_project_id IS NULL THEN
    RAISE EXCEPTION 'Malzeme listesi kalemi bulunamadı';
  END IF;

  IF v_bom_project_id <> v_request_project_id THEN
    RAISE EXCEPTION 'Malzeme listesi kalemi farklı bir projeye ait.';
  END IF;

  UPDATE public.purchase_request_items
  SET bom_item_id = p_procurement_item_id
  WHERE id = p_item_id;

  PERFORM public.fn_recompute_auto_risks(v_request_project_id, false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.link_purchase_request_item_to_bom(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.link_purchase_request_item_to_bom(uuid, uuid) FROM PUBLIC, anon;
