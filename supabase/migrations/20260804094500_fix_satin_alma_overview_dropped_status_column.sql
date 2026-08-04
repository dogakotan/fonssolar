-- 04.08.2026'daki procurement_items kolon temizliği (drop_unused_procurement_order_tracking_columns)
-- sırasında yapılan bağımlılık taraması get_satin_alma_overview/_all_internal
-- fonksiyonlarının procurement_items çıktısında hala 'status', pi.status alanı
-- döndürdüğünü kaçırmıştı -- pi.status kaldırılan kolonlardan biri, bu da
-- Satın Alma sayfasında "column pi.status does not exist" ile 400 hatasına
-- (canlıda tespit edildi). Frontend (ProjeTabMalzemeListesi/ProjeTabFaturaKesilecekler/
-- ProjeTabSatinAlma/TabSatinAlma) procurement_items çıktısındaki 'status' alanını
-- hiç okumuyor -- güvenle kaldırıldı.

create or replace function public.get_satin_alma_overview(p_project_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

create or replace function public.get_satin_alma_overview_all_internal()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
