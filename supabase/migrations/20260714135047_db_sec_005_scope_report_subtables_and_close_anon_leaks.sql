
-- 1) daily_report_issues / daily_report_material_usage: kanonik proje-scope deseni
ALTER POLICY dri_select ON public.daily_report_issues
  USING (user_can_access_report(report_id));

ALTER POLICY dmu_select ON public.daily_report_material_usage
  USING (user_can_access_report(report_id));

-- 2) anon (girişsiz) tarafından okunabilen tablolar: authenticated'a çek + proje-scope ekle
ALTER POLICY roles_read_all ON public.roles
  TO authenticated;

ALTER POLICY ta_select ON public.ticket_attachments
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_attachments.ticket_id
      AND has_project_access(t.project_id)
  ));

ALTER POLICY drp_select ON public.daily_report_photos
  TO authenticated
  USING (user_can_access_report(report_id));

-- 3) auth.role() temizliği
ALTER POLICY ar_insert_auth ON public.agent_reports
  TO authenticated
  WITH CHECK ((created_by = auth.uid()) OR (created_by IS NULL));

