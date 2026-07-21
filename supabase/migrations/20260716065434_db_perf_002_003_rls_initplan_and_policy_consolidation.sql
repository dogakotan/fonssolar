-- ================= agent_reports =================
DROP POLICY "ar_select_own" ON public.agent_reports;
DROP POLICY "ar_select_staff" ON public.agent_reports;
CREATE POLICY "ar_select" ON public.agent_reports FOR SELECT
USING (
  (created_by = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role_key = ANY (ARRAY['admin'::text,'koordinator'::text,'proje_koordinatoru'::text]))
);

DROP POLICY "ar_delete_admin" ON public.agent_reports;
CREATE POLICY "ar_delete_admin" ON public.agent_reports FOR DELETE
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role_key = 'admin'::text));

DROP POLICY "ar_insert_auth" ON public.agent_reports;
CREATE POLICY "ar_insert_auth" ON public.agent_reports FOR INSERT TO authenticated
WITH CHECK ((created_by = (select auth.uid())) OR (created_by IS NULL));

DROP POLICY "ar_update_admin" ON public.agent_reports;
CREATE POLICY "ar_update_admin" ON public.agent_reports FOR UPDATE
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role_key = 'admin'::text));

-- ================= profiles =================
DROP POLICY "Admin tüm profilleri okur" ON public.profiles;
DROP POLICY "Herkes kendi profilini okur" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
USING (
  (get_my_role() = 'admin'::text)
  OR ((select auth.uid()) = id)
);

-- ================= projects =================
DROP POLICY "projects_admin" ON public.projects;
DROP POLICY "projects_user_access" ON public.projects;

CREATE POLICY "projects_select" ON public.projects FOR SELECT
USING (
  (get_my_role() = 'admin'::text)
  OR EXISTS (SELECT 1 FROM user_project_access upa WHERE upa.user_id = (select auth.uid()) AND upa.project_id = projects.id)
  OR (id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())))
  OR (get_my_role() = ANY (ARRAY['muhasebe'::text,'satin_alma_uzmani'::text]))
);

CREATE POLICY "projects_insert_admin" ON public.projects FOR INSERT
WITH CHECK (get_my_role() = 'admin'::text);

CREATE POLICY "projects_update_admin" ON public.projects FOR UPDATE
USING (get_my_role() = 'admin'::text);

CREATE POLICY "projects_delete_admin" ON public.projects FOR DELETE
USING (get_my_role() = 'admin'::text);

-- ================= purchase_requests =================
DROP POLICY "pr_insert" ON public.purchase_requests;
DROP POLICY "Project team creates assigned purchase requests" ON public.purchase_requests;
CREATE POLICY "purchase_requests_insert" ON public.purchase_requests FOR INSERT
WITH CHECK (
  ((select auth.uid()) IS NOT NULL)
  OR (
    (requested_by = (select auth.uid()))
    AND (project_id IN (SELECT p.project_id FROM profiles p WHERE p.id = (select auth.uid()) AND p.project_id IS NOT NULL))
  )
);

DROP POLICY "pr_select" ON public.purchase_requests;
DROP POLICY "Project team reads assigned purchase requests" ON public.purchase_requests;
CREATE POLICY "purchase_requests_select" ON public.purchase_requests FOR SELECT
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin'::text,'muhasebe'::text,'satin_alma_uzmani'::text]))
  OR ((select auth.uid()) = requested_by)
  OR (project_id IN (SELECT p.project_id FROM profiles p WHERE p.id = (select auth.uid()) AND p.project_id IS NOT NULL))
);

DROP POLICY "pr_update" ON public.purchase_requests;
CREATE POLICY "pr_update" ON public.purchase_requests FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text)
  OR ((select auth.uid()) = requested_by)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text)
  OR (
    ((select auth.uid()) = requested_by)
    AND fn_purchase_request_sensitive_unchanged(id, status, project_id, requested_by, approved_by, approved_at)
  )
);

-- ================= roles =================
DROP POLICY "roles_admin_only" ON public.roles;

CREATE POLICY "roles_insert_admin" ON public.roles FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text));

CREATE POLICY "roles_update_admin" ON public.roles FOR UPDATE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text));

CREATE POLICY "roles_delete_admin" ON public.roles FOR DELETE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text));

-- ================= user_project_access =================
DROP POLICY "upa_select_admin" ON public.user_project_access;
DROP POLICY "upa_select_own" ON public.user_project_access;
CREATE POLICY "upa_select" ON public.user_project_access FOR SELECT
USING (
  (get_my_role() = 'admin'::text)
  OR (user_id = (select auth.uid()))
);

-- ================= daily_report_issues =================
DROP POLICY "dri_insert" ON public.daily_report_issues;
CREATE POLICY "dri_insert" ON public.daily_report_issues FOR INSERT TO authenticated
WITH CHECK (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())));

DROP POLICY "dri_update" ON public.daily_report_issues;
CREATE POLICY "dri_update" ON public.daily_report_issues FOR UPDATE TO authenticated
USING (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())));

DROP POLICY "dri_delete" ON public.daily_report_issues;
CREATE POLICY "dri_delete" ON public.daily_report_issues FOR DELETE TO authenticated
USING (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())));

-- ================= daily_report_material_usage =================
DROP POLICY "dmu_insert" ON public.daily_report_material_usage;
CREATE POLICY "dmu_insert" ON public.daily_report_material_usage FOR INSERT TO authenticated
WITH CHECK (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())));

DROP POLICY "dmu_update" ON public.daily_report_material_usage;
CREATE POLICY "dmu_update" ON public.daily_report_material_usage FOR UPDATE TO authenticated
USING (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())));

DROP POLICY "dmu_delete" ON public.daily_report_material_usage;
CREATE POLICY "dmu_delete" ON public.daily_report_material_usage FOR DELETE TO authenticated
USING (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())));

-- ================= daily_reports =================
DROP POLICY "dr_insert" ON public.daily_reports;
CREATE POLICY "dr_insert" ON public.daily_reports FOR INSERT
WITH CHECK (
  (get_my_role() = 'admin'::text)
  OR (
    (created_by = (select auth.uid()))
    AND (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())))
  )
);

DROP POLICY "dr_select" ON public.daily_reports;
CREATE POLICY "dr_select" ON public.daily_reports FOR SELECT
USING (
  (get_my_role() = 'admin'::text)
  OR (created_by = (select auth.uid()))
  OR (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())))
);

DROP POLICY "dr_update" ON public.daily_reports;
CREATE POLICY "dr_update" ON public.daily_reports FOR UPDATE
USING (
  (get_my_role() = 'admin'::text)
  OR (created_by = (select auth.uid()))
);

-- ================= tickets =================
DROP POLICY "tickets_insert" ON public.tickets;
CREATE POLICY "tickets_insert" ON public.tickets FOR INSERT
WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY "tickets_select" ON public.tickets;
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text)
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.project_id = tickets.project_id)
  OR ((select auth.uid()) = created_by)
);

DROP POLICY "tickets_update" ON public.tickets;
CREATE POLICY "tickets_update" ON public.tickets FOR UPDATE
USING (
  ((select auth.uid()) = created_by)
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = 'admin'::text)
  OR (
    ((select auth.uid()) = created_by)
    AND fn_ticket_sensitive_unchanged(id, status, project_id, created_by, resolved_at)
  )
);

-- ================= purchase_request_items =================
DROP POLICY "pr_items_select" ON public.purchase_request_items;
CREATE POLICY "pr_items_select" ON public.purchase_request_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_items.request_id
      AND (
        (pr.requested_by = (select auth.uid()))
        OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin'::text,'muhasebe'::text,'satin_alma_uzmani'::text]))
      )
  )
);

DROP POLICY "pr_items_insert" ON public.purchase_request_items;
CREATE POLICY "pr_items_insert" ON public.purchase_request_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_items.request_id
      AND (
        (pr.requested_by = (select auth.uid()))
        OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin'::text,'muhasebe'::text,'satin_alma_uzmani'::text]))
      )
  )
);

DROP POLICY "pr_items_update" ON public.purchase_request_items;
CREATE POLICY "pr_items_update" ON public.purchase_request_items FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin'::text,'satin_alma_uzmani'::text]))
);

DROP POLICY "pr_items_delete" ON public.purchase_request_items;
CREATE POLICY "pr_items_delete" ON public.purchase_request_items FOR DELETE
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.role_key = ANY (ARRAY['admin'::text,'satin_alma_uzmani'::text]))
);

-- ================= daily_report_photos =================
DROP POLICY "drp_insert" ON public.daily_report_photos;
CREATE POLICY "drp_insert" ON public.daily_report_photos FOR INSERT
WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY "drp_delete" ON public.daily_report_photos;
CREATE POLICY "drp_delete" ON public.daily_report_photos FOR DELETE
USING (uploaded_by = (select auth.uid()));

-- ================= notifications =================
DROP POLICY "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
USING (recipient_id = (select auth.uid()));

DROP POLICY "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
USING (recipient_id = (select auth.uid()))
WITH CHECK (recipient_id = (select auth.uid()));

-- ================= project_tasks =================
DROP POLICY "project_tasks_insert" ON public.project_tasks;
CREATE POLICY "project_tasks_insert" ON public.project_tasks FOR INSERT TO authenticated
WITH CHECK (
  (get_my_role() = 'admin'::text)
  OR (
    (get_my_role() = 'santiye_sefi'::text)
    AND (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())))
  )
);

DROP POLICY "project_tasks_update" ON public.project_tasks;
CREATE POLICY "project_tasks_update" ON public.project_tasks FOR UPDATE TO authenticated
USING (
  (get_my_role() = 'admin'::text)
  OR (
    (get_my_role() = 'santiye_sefi'::text)
    AND (project_id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = (select auth.uid())))
  )
);

-- ================= ticket_attachments =================
DROP POLICY "ta_insert" ON public.ticket_attachments;
CREATE POLICY "ta_insert" ON public.ticket_attachments FOR INSERT
WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY "ta_delete" ON public.ticket_attachments;
CREATE POLICY "ta_delete" ON public.ticket_attachments FOR DELETE
USING (uploaded_by = (select auth.uid()));

