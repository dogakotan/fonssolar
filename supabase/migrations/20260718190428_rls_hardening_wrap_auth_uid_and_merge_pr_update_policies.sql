-- 1) auth.uid() sarmalama (7 politika, davranış değişikliği yok)
ALTER POLICY projects_select ON projects
USING (
  (get_my_role() = 'admin')
  OR EXISTS (SELECT 1 FROM user_project_access upa WHERE upa.user_id = (select auth.uid()) AND upa.project_id = projects.id)
  OR (id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())))
  OR (get_my_role() = 'muhasebe')
);

ALTER POLICY purchase_requests_select ON purchase_requests
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin','muhasebe']))
  OR (select auth.uid()) = requested_by
  OR project_id IN (SELECT p.project_id FROM profiles p WHERE p.id = (select auth.uid()) AND p.project_id IS NOT NULL)
);

ALTER POLICY pr_items_select ON purchase_request_items
USING (
  EXISTS (
    SELECT 1 FROM purchase_requests pr WHERE pr.id = purchase_request_items.request_id
    AND (
      pr.requested_by = (select auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin','muhasebe']))
      OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id))
    )
  )
);

ALTER POLICY pr_items_insert ON purchase_request_items
WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_requests pr WHERE pr.id = purchase_request_items.request_id
    AND (
      pr.requested_by = (select auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin','muhasebe']))
      OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id))
    )
  )
);

ALTER POLICY pr_items_delete ON purchase_request_items
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin')
  OR EXISTS (SELECT 1 FROM purchase_requests pr WHERE pr.id = purchase_request_items.request_id AND get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id))
);

ALTER POLICY pr_items_update ON purchase_request_items
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin')
  OR EXISTS (SELECT 1 FROM purchase_requests pr WHERE pr.id = purchase_request_items.request_id AND get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id))
);

ALTER POLICY picr_insert ON procurement_item_change_requests
WITH CHECK (
  has_project_access(project_id)
  AND requested_by = (select auth.uid())
  AND get_my_role() = ANY (ARRAY['proje_yoneticisi','admin'])
);

-- 2) purchase_requests UPDATE: 2 permissive politikayı 1'e birleştir (OR mantığı birebir korunuyor)
DROP POLICY pr_update ON purchase_requests;
DROP POLICY pr_update_proje_yoneticisi ON purchase_requests;

CREATE POLICY purchase_requests_update ON purchase_requests
FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin')
  OR (select auth.uid()) = requested_by
  OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(project_id) AND status = ANY (ARRAY['onaylandi','satin_alindi']))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin')
  OR ((select auth.uid()) = requested_by AND fn_purchase_request_sensitive_unchanged(id, status, project_id, requested_by, approved_by, approved_at))
  OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(project_id) AND fn_purchase_request_procurement_fields_only(id, project_id, requested_by, approved_by, approved_at, title, urgency, category, estimated_amount_excl_vat, status))
);

