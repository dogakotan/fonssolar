drop policy if exists dr_delete on public.daily_reports;

create policy dr_delete on public.daily_reports
for delete
to authenticated
using (
  public.get_my_role() = 'admin'
  or created_by = (select auth.uid())
);
