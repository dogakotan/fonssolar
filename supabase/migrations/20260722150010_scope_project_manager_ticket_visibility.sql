alter policy tickets_select on public.tickets
using (
  public.get_my_role() = 'admin'
  or (select auth.uid()) = created_by
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.project_id = tickets.project_id
  )
  or (
    public.get_my_role() = 'proje_yoneticisi'
    and public.has_project_access(project_id)
  )
);
