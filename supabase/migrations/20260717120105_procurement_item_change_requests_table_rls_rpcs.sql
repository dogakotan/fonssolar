CREATE TABLE public.procurement_item_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_item_id uuid NOT NULL REFERENCES public.procurement_items(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES public.projects(id),
  old_planned_qty numeric,
  new_planned_qty numeric NOT NULL,
  note text,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'bekliyor' CHECK (status IN ('bekliyor','onaylandi','reddedildi')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text
);

ALTER TABLE public.procurement_item_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY picr_select ON public.procurement_item_change_requests
  FOR SELECT USING (has_project_access(project_id));

CREATE POLICY picr_insert ON public.procurement_item_change_requests
  FOR INSERT WITH CHECK (
    has_project_access(project_id)
    AND requested_by = auth.uid()
    AND get_my_role() = ANY (ARRAY['proje_yoneticisi','admin'])
  );

CREATE POLICY picr_update ON public.procurement_item_change_requests
  FOR UPDATE USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.create_procurement_item_change_request(
  p_procurement_item_id uuid, p_new_planned_qty numeric, p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id text;
  v_old_qty numeric;
  v_id uuid;
BEGIN
  SELECT project_id, planned_qty INTO v_project_id, v_old_qty
  FROM procurement_items WHERE id = p_procurement_item_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Malzeme kalemi bulunamadı';
  END IF;

  IF NOT has_project_access(v_project_id) OR get_my_role() NOT IN ('admin', 'proje_yoneticisi') THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  INSERT INTO procurement_item_change_requests (
    procurement_item_id, project_id, old_planned_qty, new_planned_qty, note, requested_by
  ) VALUES (
    p_procurement_item_id, v_project_id, v_old_qty, p_new_planned_qty, p_note, auth.uid()
  ) RETURNING id INTO v_id;

  PERFORM notify_managers(
    v_project_id, auth.uid(), 'procurement_item_change_request', v_id, 'pending',
    'Malzeme miktarı değişikliği onay bekliyor',
    format('Planlanan miktar %s → %s olarak değiştirilmek isteniyor.', coalesce(v_old_qty::text,'—'), p_new_planned_qty::text)
  );

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_procurement_item_change_request(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_procurement_item_change_request(
  p_id uuid, p_approve boolean, p_review_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row procurement_item_change_requests%ROWTYPE;
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
    UPDATE procurement_items
    SET planned_qty = v_row.new_planned_qty, quantity = v_row.new_planned_qty::text, updated_at = now()
    WHERE id = v_row.procurement_item_id;
  END IF;

  PERFORM notify_user(
    v_row.requested_by, auth.uid(), v_row.project_id, 'procurement_item_change_request', p_id,
    CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    CASE WHEN p_approve THEN 'Malzeme miktarı değişikliği onaylandı' ELSE 'Malzeme miktarı değişikliği reddedildi' END,
    coalesce(p_review_note, '')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_procurement_item_change_request(uuid, boolean, text) TO authenticated;

