
-- project_risks: INSERT/UPDATE'i proje sınırına al
DROP POLICY IF EXISTS authenticated_insert_risks ON project_risks;
DROP POLICY IF EXISTS authenticated_update_risks ON project_risks;

CREATE POLICY authenticated_insert_risks ON project_risks
  FOR INSERT
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY authenticated_update_risks ON project_risks
  FOR UPDATE
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

-- quality_inspections: SELECT/INSERT/UPDATE'i proje sınırına al
DROP POLICY IF EXISTS authenticated_select_quality ON quality_inspections;
DROP POLICY IF EXISTS authenticated_insert_quality ON quality_inspections;
DROP POLICY IF EXISTS authenticated_update_quality ON quality_inspections;

CREATE POLICY authenticated_select_quality ON quality_inspections
  FOR SELECT
  USING (user_has_project_access(project_id));

CREATE POLICY authenticated_insert_quality ON quality_inspections
  FOR INSERT
  WITH CHECK (user_has_project_access(project_id));

CREATE POLICY authenticated_update_quality ON quality_inspections
  FOR UPDATE
  USING (user_has_project_access(project_id))
  WITH CHECK (user_has_project_access(project_id));

-- purchase_request_status_log: request_id -> purchase_requests.project_id üzerinden sınırla
DROP POLICY IF EXISTS purchase_status_log_select ON purchase_request_status_log;
DROP POLICY IF EXISTS purchase_status_log_insert ON purchase_request_status_log;

CREATE POLICY purchase_status_log_select ON purchase_request_status_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_status_log.request_id
        AND user_has_project_access(pr.project_id)
    )
  );

CREATE POLICY purchase_status_log_insert ON purchase_request_status_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_status_log.request_id
        AND user_has_project_access(pr.project_id)
    )
  );

