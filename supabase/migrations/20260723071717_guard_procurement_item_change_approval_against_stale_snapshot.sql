-- review_procurement_item_change_request onay anında yalnızca bildirim
-- mesajında kullanılan old_planned_qty anlık görüntüsünü hiç doğrulamıyordu:
-- talep oluşturulduktan sonra otomatik aşım mekanizması (veya başka bir
-- onay) planned_qty'yi değiştirmişse, bu onay anında sessizce eziliyordu.
-- Artık onaylanacaksa ve mevcut bir kalem güncelleniyorsa güncel planned_qty
-- talebin old_planned_qty'siyle karşılaştırılıyor (FOR UPDATE ile
-- kilitlenerek); eşleşmezse onay açık bir hatayla reddediliyor.
CREATE OR REPLACE FUNCTION public.review_procurement_item_change_request(p_id uuid, p_approve boolean, p_review_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row procurement_item_change_requests%ROWTYPE;
  v_new_item_id uuid;
  v_current_qty numeric;
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

  IF p_approve AND v_row.procurement_item_id IS NOT NULL THEN
    SELECT planned_qty INTO v_current_qty
    FROM procurement_items WHERE id = v_row.procurement_item_id FOR UPDATE;

    IF v_current_qty IS DISTINCT FROM v_row.old_planned_qty THEN
      RAISE EXCEPTION 'Bu malzemenin planlanan miktarı talep oluşturulduktan sonra değişti (talep anında: %, şu an: %). Talebi reddedip güncel miktarla yeniden oluşturun.',
        coalesce(v_row.old_planned_qty::text, '—'), coalesce(v_current_qty::text, '—');
    END IF;
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
