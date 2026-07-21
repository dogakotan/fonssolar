
CREATE OR REPLACE FUNCTION fn_ticket_sensitive_unchanged(p_id uuid, p_status text, p_project_id text, p_created_by uuid, p_resolved_at timestamptz)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_status IS NOT DISTINCT FROM t.status
    AND p_project_id IS NOT DISTINCT FROM t.project_id
    AND p_created_by IS NOT DISTINCT FROM t.created_by
    AND p_resolved_at IS NOT DISTINCT FROM t.resolved_at
  FROM tickets t WHERE t.id = p_id;
$$;

CREATE OR REPLACE FUNCTION fn_purchase_request_sensitive_unchanged(p_id uuid, p_status text, p_project_id text, p_requested_by uuid, p_approved_by uuid, p_approved_at timestamptz)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_status IS NOT DISTINCT FROM pr.status
    AND p_project_id IS NOT DISTINCT FROM pr.project_id
    AND p_requested_by IS NOT DISTINCT FROM pr.requested_by
    AND p_approved_by IS NOT DISTINCT FROM pr.approved_by
    AND p_approved_at IS NOT DISTINCT FROM pr.approved_at
  FROM purchase_requests pr WHERE pr.id = p_id;
$$;

REVOKE EXECUTE ON FUNCTION fn_ticket_sensitive_unchanged(uuid, text, text, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_purchase_request_sensitive_unchanged(uuid, text, text, uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_ticket_sensitive_unchanged(uuid, text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_purchase_request_sensitive_unchanged(uuid, text, text, uuid, uuid, timestamptz) TO authenticated;

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
    AND fn_purchase_request_sensitive_unchanged(id, status, project_id, requested_by, approved_by, approved_at)
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
    AND fn_ticket_sensitive_unchanged(id, status, project_id, created_by, resolved_at)
  )
);

