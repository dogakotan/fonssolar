
DROP POLICY IF EXISTS pr_update ON purchase_requests;

CREATE POLICY pr_update ON purchase_requests
FOR UPDATE
USING (
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = 'admin'))
  OR (auth.uid() = requested_by)
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = 'admin'))
  OR (
    auth.uid() = requested_by
    AND status IS NOT DISTINCT FROM (SELECT pr2.status FROM purchase_requests pr2 WHERE pr2.id = purchase_requests.id)
    AND project_id IS NOT DISTINCT FROM (SELECT pr2.project_id FROM purchase_requests pr2 WHERE pr2.id = purchase_requests.id)
    AND requested_by IS NOT DISTINCT FROM (SELECT pr2.requested_by FROM purchase_requests pr2 WHERE pr2.id = purchase_requests.id)
    AND approved_by IS NOT DISTINCT FROM (SELECT pr2.approved_by FROM purchase_requests pr2 WHERE pr2.id = purchase_requests.id)
    AND approved_at IS NOT DISTINCT FROM (SELECT pr2.approved_at FROM purchase_requests pr2 WHERE pr2.id = purchase_requests.id)
  )
);

DROP POLICY IF EXISTS tickets_update ON tickets;

CREATE POLICY tickets_update ON tickets
FOR UPDATE
USING (
  (auth.uid() = created_by)
  OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = 'admin'))
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = 'admin'))
  OR (
    auth.uid() = created_by
    AND status IS NOT DISTINCT FROM (SELECT t2.status FROM tickets t2 WHERE t2.id = tickets.id)
    AND project_id IS NOT DISTINCT FROM (SELECT t2.project_id FROM tickets t2 WHERE t2.id = tickets.id)
    AND created_by IS NOT DISTINCT FROM (SELECT t2.created_by FROM tickets t2 WHERE t2.id = tickets.id)
    AND resolved_at IS NOT DISTINCT FROM (SELECT t2.resolved_at FROM tickets t2 WHERE t2.id = tickets.id)
  )
);

