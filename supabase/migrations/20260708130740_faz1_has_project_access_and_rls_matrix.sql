alter table public.roles add column if not exists cross_project boolean not null default false;
update public.roles set cross_project = true where key in ('satin_alma_uzmani','lojistik_tedarik');

create or replace function public.has_project_access(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p_project_id is null
    or coalesce((select r.is_manager or r.cross_project from public.roles r where r.key = public.get_my_role()), false)
    or (select project_id from public.profiles where id = auth.uid()) = p_project_id
    or exists (
      select 1 from public.user_project_access
      where user_id = auth.uid() and project_id = p_project_id
    );
$$;

drop policy if exists "allow_all_procurement" on public.procurement_items;
create policy "procurement_items_access" on public.procurement_items
  for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

drop policy if exists "wp_all_authenticated" on public.work_packages;
create policy "work_packages_access" on public.work_packages
  for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

drop policy if exists "allow_all_schedule" on public.schedule_activities;
create policy "schedule_activities_access" on public.schedule_activities
  for all using (public.has_project_access(project_id))
  with check (public.has_project_access(project_id));

drop policy if exists "History okuma" on public.ticket_history;
create policy "ticket_history_select" on public.ticket_history
  for select using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_history.ticket_id
      and public.has_project_access(t.project_id)
    )
  );

