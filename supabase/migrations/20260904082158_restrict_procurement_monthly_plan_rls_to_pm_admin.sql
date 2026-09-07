-- Aylık Satın Alma Planı ekleme/düzenleme yetkisi admin + proje_yoneticisi'ne
-- daraltıldı (kullanıcı kararı, 04.09.2026) — önceki policy muhasebe hariç
-- herkese (şantiye şefi dahil) yazma izni veriyordu; frontend'deki canEdit
-- kısıtlamasıyla eşleşsin diye RLS de sıkılaştırıldı (bkz. ProjeTabAylikPlan.jsx).
drop policy if exists procurement_monthly_plan_access on procurement_monthly_plan;

create policy procurement_monthly_plan_access
on procurement_monthly_plan
for all
to public
using (get_my_role() in ('admin', 'proje_yoneticisi') and has_project_access(project_id))
with check (get_my_role() in ('admin', 'proje_yoneticisi') and has_project_access(project_id));
