-- projects: proje yöneticisi de silebilsin (admin ile aynı)
alter policy projects_delete_admin
on public.projects
using (get_my_role() = any (array['admin', 'proje_yoneticisi']));

-- invoices: proje silme akışının bağlı faturaları temizleyebilmesi için
alter policy invoices_delete
on public.invoices
using (get_my_role() = any (array['admin', 'proje_yoneticisi']));

-- purchase_requests: proje silme akışının bağlı talepleri temizleyebilmesi için
-- (purchase_requests -> projects FK'si RESTRICT, temizlenmezse proje silinemez)
alter policy purchase_requests_delete
on public.purchase_requests
using (get_my_role() = any (array['admin', 'proje_yoneticisi']));

-- agent_reports: proje silme akışının bağlı AI raporlarını temizleyebilmesi için
alter policy ar_delete_admin
on public.agent_reports
using (get_my_role() = any (array['admin', 'proje_yoneticisi']));

-- procurement_item_change_requests: hiç DELETE policy'si yoktu (admin dahil kimse
-- silemiyordu) — procurement_items'a NO ACTION FK'si olmayan (is_new=true) satırlar
-- projects'e de NO ACTION ile bağlı, temizlenmezse proje silinemez.
create policy picr_delete
on public.procurement_item_change_requests
for delete
using (
  (get_my_role() = any (array['admin', 'proje_yoneticisi']))
  and has_project_access(project_id)
);

-- procurement_item_adjustments: aynı sebep, hiç DELETE policy'si yoktu.
create policy procurement_item_adjustments_delete
on public.procurement_item_adjustments
for delete
using (
  (get_my_role() = any (array['admin', 'proje_yoneticisi']))
  and has_project_access(project_id)
);

-- daily_report_material_usage: mevcut policy admin'i bile kapsamıyordu (yalnızca
-- kullanıcının kendi profile.project_id'siyle eşleşen satırları siliyordu).
alter policy dmu_delete
on public.daily_report_material_usage
using (
  (get_my_role() = any (array['admin', 'proje_yoneticisi']) and has_project_access(project_id))
  or (project_id = (select profiles.project_id from profiles where profiles.id = (select auth.uid())))
);
