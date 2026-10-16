CREATE OR REPLACE FUNCTION public.review_procurement_item_change_request(
  p_id uuid,
  p_approve boolean,
  p_review_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.procurement_item_change_requests%rowtype;
  v_new_item_id uuid;
  v_current_qty numeric;
  v_actor uuid := auth.uid();
  v_actor_role text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Oturum açmanız gerekiyor.';
  END IF;

  SELECT * INTO v_row
  FROM public.procurement_item_change_requests
  WHERE id = p_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı';
  END IF;

  v_actor_role := public.get_my_role();

  IF v_actor_role IS DISTINCT FROM 'admin'
     AND v_actor_role IS DISTINCT FROM v_row.approver_role THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_row.status <> 'bekliyor' THEN
    RAISE EXCEPTION 'Bu talep zaten sonuçlandırılmış.';
  END IF;

  IF p_approve AND v_row.procurement_item_id IS NOT NULL THEN
    SELECT planned_qty INTO v_current_qty
    FROM public.procurement_items
    WHERE id = v_row.procurement_item_id
    FOR UPDATE;

    IF v_current_qty IS DISTINCT FROM v_row.old_planned_qty THEN
      RAISE EXCEPTION 'Bu malzemenin planlanan miktarı talep oluşturulduktan sonra değişti (talep anında: %, şu an: %). Talebi reddedip güncel miktarla yeniden oluşturun.',
        COALESCE(v_row.old_planned_qty::text, '—'),
        COALESCE(v_current_qty::text, '—');
    END IF;
  END IF;

  UPDATE public.procurement_item_change_requests
  SET status = CASE WHEN p_approve THEN 'onaylandi' ELSE 'reddedildi' END,
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_note = p_review_note
  WHERE id = p_id;

  IF p_approve THEN
    IF v_row.procurement_item_id IS NOT NULL THEN
      UPDATE public.procurement_items
      SET planned_qty = v_row.new_planned_qty,
          quantity = v_row.new_planned_qty::text,
          updated_at = now()
      WHERE id = v_row.procurement_item_id;
    ELSE
      INSERT INTO public.procurement_items (
        project_id, equipment, unit, category, planned_qty, quantity
      )
      VALUES (
        v_row.project_id, v_row.new_equipment, v_row.new_unit,
        v_row.new_category, v_row.new_planned_qty, v_row.new_planned_qty::text
      )
      RETURNING id INTO v_new_item_id;
    END IF;

    PERFORM public.fn_recompute_auto_risks(v_row.project_id, true);
  END IF;

  PERFORM public.notify_user(
    v_row.requested_by, v_actor, v_row.project_id,
    'procurement_item_change_request', p_id,
    CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    CASE WHEN p_approve THEN
      CASE WHEN v_row.procurement_item_id IS NULL
        THEN 'Yeni malzeme ekleme onaylandı'
        ELSE 'Malzeme miktarı değişikliği onaylandı'
      END
    ELSE
      CASE WHEN v_row.procurement_item_id IS NULL
        THEN 'Yeni malzeme ekleme reddedildi'
        ELSE 'Malzeme miktarı değişikliği reddedildi'
      END
    END,
    COALESCE(p_review_note, '')
  );
END;
$$;
