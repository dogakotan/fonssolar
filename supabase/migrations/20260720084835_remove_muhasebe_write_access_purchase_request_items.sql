DROP POLICY IF EXISTS pr_items_insert ON public.purchase_request_items;

CREATE POLICY pr_items_insert ON public.purchase_request_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.purchase_requests pr
    WHERE pr.id = purchase_request_items.request_id
      AND (
        pr.requested_by = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'
        )
        OR (get_my_role() = 'proje_yoneticisi' AND has_project_access(pr.project_id))
      )
  )
);

