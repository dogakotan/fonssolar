-- report_id üzerinden proje erişim kontrolü (RLS recursion önlemek için SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.user_can_access_report(p_report_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM daily_reports dr
    WHERE dr.id = p_report_id
      AND (
        get_my_role() = 'admin'
        OR dr.created_by = auth.uid()
        OR dr.project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
      )
  );
$$;

