DROP POLICY IF EXISTS purchase_requests_select ON purchase_requests;
CREATE POLICY purchase_requests_select ON purchase_requests
FOR SELECT
USING (
  has_project_access(project_id) OR (select auth.uid()) = requested_by
);

