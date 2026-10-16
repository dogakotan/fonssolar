CREATE OR REPLACE FUNCTION public.fn_ticket_sensitive_unchanged(
  p_id uuid,
  p_status text,
  p_project_id text,
  p_created_by uuid,
  p_resolved_at timestamptz
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_status IS NOT DISTINCT FROM t.status
    AND p_project_id IS NOT DISTINCT FROM t.project_id
    AND p_created_by IS NOT DISTINCT FROM t.created_by
    AND p_resolved_at IS NOT DISTINCT FROM t.resolved_at
  FROM public.tickets t
  WHERE t.id = p_id
    AND t.created_by = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.fn_purchase_request_sensitive_unchanged(
  p_id uuid,
  p_status text,
  p_project_id text,
  p_requested_by uuid,
  p_approved_by uuid,
  p_approved_at timestamptz
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_status IS NOT DISTINCT FROM pr.status
    AND p_project_id IS NOT DISTINCT FROM pr.project_id
    AND p_requested_by IS NOT DISTINCT FROM pr.requested_by
    AND p_approved_by IS NOT DISTINCT FROM pr.approved_by
    AND p_approved_at IS NOT DISTINCT FROM pr.approved_at
  FROM public.purchase_requests pr
  WHERE pr.id = p_id
    AND pr.requested_by = (SELECT auth.uid());
$$;
