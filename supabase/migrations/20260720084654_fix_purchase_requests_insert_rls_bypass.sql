DROP POLICY IF EXISTS purchase_requests_insert ON public.purchase_requests;

CREATE POLICY purchase_requests_insert ON public.purchase_requests
FOR INSERT
WITH CHECK (
  requested_by = (select auth.uid())
  AND has_project_access(project_id)
);

