ALTER TABLE public.procurement_item_change_requests
  ALTER COLUMN procurement_item_id DROP NOT NULL,
  ADD COLUMN new_equipment text,
  ADD COLUMN new_unit text,
  ADD COLUMN new_category text;

ALTER TABLE public.procurement_item_change_requests
  ADD CONSTRAINT procurement_item_change_requests_item_xor_new_chk
  CHECK (
    (procurement_item_id IS NOT NULL AND new_equipment IS NULL)
    OR (procurement_item_id IS NULL AND new_equipment IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.create_procurement_item_add_request(
  p_project_id text, p_equipment text, p_unit text, p_category text,
  p_planned_qty numeric, p_note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT has_project_access(p_project_id) OR get_my_role() NOT IN ('admin', 'proje_yoneticisi') THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
  IF coalesce(trim(p_equipment), '') = '' THEN
    RAISE EXCEPTION 'Malzeme adı zorunludur.';
  END IF;

  INSERT INTO procurement_item_change_requests (
    procurement_item_id, project_id, old_planned_qty, new_planned_qty, note, requested_by,
    new_equipment, new_unit, new_category
  ) VALUES (
    NULL, p_project_id, NULL, p_planned_qty, p_note, auth.uid(),
    trim(p_equipment), nullif(trim(p_unit), ''), nullif(trim(p_category), '')
  ) RETURNING id INTO v_id;

  PERFORM notify_managers(
    p_project_id, auth.uid(), 'procurement_item_change_request', v_id, 'pending',
    'Yeni malzeme ekleme talebi onay bekliyor',
    format('%s (%s %s) malzeme listesine eklenmek isteniyor.', trim(p_equipment), p_planned_qty::text, coalesce(nullif(trim(p_unit), ''), ''))
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_procurement_item_add_request(text, text, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_procurement_item_add_request(text, text, text, text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_procurement_item_change_request(p_id uuid, p_approve boolean, p_review_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row procurement_item_change_requests%ROWTYPE;
  v_new_item_id uuid;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  SELECT * INTO v_row FROM procurement_item_change_requests WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı';
  END IF;
  IF v_row.status <> 'bekliyor' THEN
    RAISE EXCEPTION 'Bu talep zaten sonuçlandırılmış.';
  END IF;

  UPDATE procurement_item_change_requests
  SET status = CASE WHEN p_approve THEN 'onaylandi' ELSE 'reddedildi' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_review_note
  WHERE id = p_id;

  IF p_approve THEN
    IF v_row.procurement_item_id IS NOT NULL THEN
      UPDATE procurement_items
      SET planned_qty = v_row.new_planned_qty, quantity = v_row.new_planned_qty::text, updated_at = now()
      WHERE id = v_row.procurement_item_id;
    ELSE
      INSERT INTO procurement_items (project_id, equipment, unit, category, planned_qty, quantity)
      VALUES (v_row.project_id, v_row.new_equipment, v_row.new_unit, v_row.new_category, v_row.new_planned_qty, v_row.new_planned_qty::text)
      RETURNING id INTO v_new_item_id;
    END IF;
  END IF;

  PERFORM notify_user(
    v_row.requested_by, auth.uid(), v_row.project_id, 'procurement_item_change_request', p_id,
    CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    CASE WHEN p_approve THEN
      (CASE WHEN v_row.procurement_item_id IS NULL THEN 'Yeni malzeme ekleme onaylandı' ELSE 'Malzeme miktarı değişikliği onaylandı' END)
    ELSE
      (CASE WHEN v_row.procurement_item_id IS NULL THEN 'Yeni malzeme ekleme reddedildi' ELSE 'Malzeme miktarı değişikliği reddedildi' END)
    END,
    coalesce(p_review_note, '')
  );
END;
$function$;

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

