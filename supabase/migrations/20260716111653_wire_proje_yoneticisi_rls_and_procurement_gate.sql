
-- purchase_request_items: drop satin_alma_uzmani from blanket elevated-role arrays,
-- add a project-scoped clause for proje_yoneticisi via the parent purchase_requests row
ALTER POLICY pr_items_select ON purchase_request_items
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
        AND (
          pr.requested_by = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = ANY (ARRAY['admin','muhasebe']))
          OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id))
        )
    )
  );

ALTER POLICY pr_items_insert ON purchase_request_items
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
        AND (
          pr.requested_by = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = ANY (ARRAY['admin','muhasebe']))
          OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id))
        )
    )
  );

ALTER POLICY pr_items_update ON purchase_request_items
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = 'admin')
    OR EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
        AND get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id)
    )
  );

ALTER POLICY pr_items_delete ON purchase_request_items
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = 'admin')
    OR EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
        AND get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id)
    )
  );

-- invoices: proje_yoneticisi can see (not create/edit) their own project's invoices;
-- satin_alma_uzmani dropped everywhere (role retired)
ALTER POLICY invoices_select ON invoices
  USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','proje_koordinatoru'])
    OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(project_id))
  );

ALTER POLICY invoices_insert ON invoices
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','muhasebe']));

-- invoice_approvals: proje_yoneticisi can see the approval chain for their own project's invoices
ALTER POLICY invoice_approvals_select ON invoice_approvals
  USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe'])
    OR (
      get_my_role() = 'proje_yoneticisi'
      AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_approvals.invoice_id AND has_project_access(i.project_id))
    )
  );

-- suppliers / ticket_comments: unscoped (global lists), same breadth satin_alma_uzmani had,
-- just renamed to proje_yoneticisi
ALTER POLICY suppliers_select ON suppliers
  USING (get_my_role() = ANY (ARRAY['admin','muhasebe','proje_yoneticisi','maliyet_kontrolcu','proje_koordinatoru']));

ALTER POLICY suppliers_insert ON suppliers
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','muhasebe','proje_yoneticisi']));

ALTER POLICY suppliers_update ON suppliers
  USING (get_my_role() = ANY (ARRAY['admin','muhasebe','proje_yoneticisi']));

ALTER POLICY "Yorum okuma" ON ticket_comments
  USING (get_my_role() = ANY (ARRAY['admin','santiye_sefi','muhendis','koordinator','proje_yoneticisi']));

ALTER POLICY "Yorum ekleme" ON ticket_comments
  WITH CHECK (get_my_role() = ANY (ARRAY['admin','santiye_sefi','muhendis','koordinator','proje_yoneticisi']));

-- NEW: proje_yoneticisi can update an approved request to fill in supplier/purchase/delivery
-- info, but only sensitive-field-untouched, and only while status is onaylandi/satin_alindi
CREATE OR REPLACE FUNCTION fn_purchase_request_procurement_fields_only(
  p_id uuid, p_project_id text, p_requested_by uuid, p_approved_by uuid,
  p_approved_at timestamptz, p_title text, p_urgency text, p_category text,
  p_estimated_amount_excl_vat numeric, p_status text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    p_project_id IS NOT DISTINCT FROM pr.project_id
    AND p_requested_by IS NOT DISTINCT FROM pr.requested_by
    AND p_approved_by IS NOT DISTINCT FROM pr.approved_by
    AND p_approved_at IS NOT DISTINCT FROM pr.approved_at
    AND p_title IS NOT DISTINCT FROM pr.title
    AND p_urgency IS NOT DISTINCT FROM pr.urgency
    AND p_category IS NOT DISTINCT FROM pr.category
    AND p_estimated_amount_excl_vat IS NOT DISTINCT FROM pr.estimated_amount_excl_vat
    AND p_status = ANY (ARRAY['onaylandi', 'satin_alindi'])
    AND pr.status = ANY (ARRAY['onaylandi', 'satin_alindi'])
  FROM purchase_requests pr WHERE pr.id = p_id;
$$;

CREATE POLICY pr_update_proje_yoneticisi ON purchase_requests
  FOR UPDATE
  USING (get_my_role() = 'proje_yoneticisi' AND has_project_access(project_id) AND status = ANY (ARRAY['onaylandi', 'satin_alindi']))
  WITH CHECK (
    get_my_role() = 'proje_yoneticisi' AND has_project_access(project_id)
    AND fn_purchase_request_procurement_fields_only(
      id, project_id, requested_by, approved_by, approved_at, title, urgency, category, estimated_amount_excl_vat, status
    )
  );

-- Auto-advance: once proje_yoneticisi fills supplier + purchase date on an approved request,
-- move it to 'satin_alindi' automatically (no separate manual approval step needed for this gate).
CREATE OR REPLACE FUNCTION fn_auto_advance_pr_to_satin_alindi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'onaylandi'
     AND NEW.status = 'onaylandi'
     AND NEW.supplier_id IS NOT NULL
     AND NEW.purchase_date IS NOT NULL
  THEN
    NEW.status := 'satin_alindi';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_advance_pr_to_satin_alindi
BEFORE UPDATE ON purchase_requests
FOR EACH ROW EXECUTE FUNCTION fn_auto_advance_pr_to_satin_alindi();

-- Hard gate: muhasebe cannot attach an invoice to a request until procurement (satin_alindi) happened
CREATE OR REPLACE FUNCTION fn_guard_invoice_requires_procurement_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.purchase_request_id IS NOT NULL THEN
    SELECT status INTO v_status FROM purchase_requests WHERE id = NEW.purchase_request_id;
    IF v_status = ANY (ARRAY['talep_olusturuldu', 'fiyat_girildi', 'onay_bekliyor', 'onaylandi']) THEN
      RAISE EXCEPTION 'Bu talep henüz proje yöneticisi tarafından tedarik aşamasına alınmadı (mevcut durum: %). Fatura eklenemez.', v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_invoice_requires_procurement_done
BEFORE INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION fn_guard_invoice_requires_procurement_done();

