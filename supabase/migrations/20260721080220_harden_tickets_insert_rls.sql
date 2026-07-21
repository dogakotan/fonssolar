DROP POLICY IF EXISTS tickets_insert ON public.tickets;
CREATE POLICY tickets_insert ON public.tickets
  FOR INSERT
  WITH CHECK (
    created_by = (select auth.uid())
    AND has_project_access(project_id)
  );

