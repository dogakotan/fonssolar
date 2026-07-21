-- Şantiye şefi kendi projesini, muhasebe/satın alma tüm projeleri okuyabilsin
DROP POLICY IF EXISTS projects_user_access ON public.projects;

CREATE POLICY projects_user_access ON public.projects
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_project_access upa
    WHERE upa.user_id = auth.uid() AND upa.project_id = projects.id
  )
  OR id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  OR get_my_role() IN ('muhasebe', 'satin_alma_uzmani')
);

