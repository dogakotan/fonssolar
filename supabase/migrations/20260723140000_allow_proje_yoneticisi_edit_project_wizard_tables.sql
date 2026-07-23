-- projects: proje bilgilerini düzenleme (Adım 1)
alter policy projects_update_admin
on public.projects
using (get_my_role() = any (array['admin', 'proje_yoneticisi']));

-- budget_lines: Bütçe adımını görüntüleme + düzenleme (Adım 6)
alter policy budget_lines_select
on public.budget_lines
using (get_my_role() = any (array['admin', 'proje_koordinatoru', 'proje_yoneticisi']));

alter policy budget_lines_insert
on public.budget_lines
with check (get_my_role() = any (array['admin', 'proje_yoneticisi']));

alter policy budget_lines_update
on public.budget_lines
using (get_my_role() = any (array['admin', 'proje_yoneticisi']))
with check (get_my_role() = any (array['admin', 'proje_yoneticisi']));

alter policy budget_lines_delete
on public.budget_lines
using (get_my_role() = any (array['admin', 'proje_yoneticisi']));

-- project_tasks: İş Kalemleri adımını düzenleme (Adım 2)
alter policy project_tasks_insert
on public.project_tasks
with check (
  (get_my_role() = 'admin')
  or (get_my_role() = 'santiye_sefi' and project_id = (select profiles.project_id from profiles where profiles.id = (select auth.uid())))
  or (get_my_role() = 'proje_yoneticisi' and has_project_access(project_id))
);

alter policy project_tasks_update
on public.project_tasks
using (
  (get_my_role() = 'admin')
  or (get_my_role() = 'santiye_sefi' and project_id = (select profiles.project_id from profiles where profiles.id = (select auth.uid())))
  or (get_my_role() = 'proje_yoneticisi' and has_project_access(project_id))
);

alter policy project_tasks_delete
on public.project_tasks
using (
  (get_my_role() = 'admin')
  or (get_my_role() = 'proje_yoneticisi' and has_project_access(project_id))
);
