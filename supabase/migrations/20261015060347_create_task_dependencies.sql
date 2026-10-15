create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  predecessor_id uuid not null references public.project_tasks(id) on delete cascade,
  dep_type text not null default 'FS' check (dep_type in ('FS','SS','FF','SF')),
  lag_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_dependencies_unique unique (task_id, predecessor_id),
  constraint task_dependencies_no_self check (task_id <> predecessor_id)
);

comment on table public.task_dependencies is 'İş planı öncül/ardıl ilişkileri (FS/SS/FF/SF + gecikme günü). Gantt okları ve CPM için.';

create index task_dependencies_project_idx on public.task_dependencies(project_id);
create index task_dependencies_task_idx on public.task_dependencies(task_id);
create index task_dependencies_pred_idx on public.task_dependencies(predecessor_id);

-- iki görev de aynı projede olmalı; project_id görevden türetilir
create or replace function public.fn_task_dependencies_guard()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_p1 text; v_p2 text;
begin
  select project_id into v_p1 from project_tasks where id = new.task_id;
  select project_id into v_p2 from project_tasks where id = new.predecessor_id;
  if v_p1 is distinct from v_p2 then
    raise exception 'Öncül ve ardıl görev aynı projede olmalı';
  end if;
  new.project_id := v_p1;
  return new;
end $$;

create trigger trg_task_dependencies_guard
before insert or update on public.task_dependencies
for each row execute function public.fn_task_dependencies_guard();

create trigger trg_task_dependencies_updated_at
before update on public.task_dependencies
for each row execute function public.update_updated_at_column();

alter table public.task_dependencies enable row level security;

create policy task_dependencies_select on public.task_dependencies
for select using (user_has_project_access(project_id));

create policy task_dependencies_insert on public.task_dependencies
for insert to authenticated with check (
  (get_my_role() = 'admin')
  or ((get_my_role() = 'santiye_sefi') and project_id = (select profiles.project_id from profiles where profiles.id = (select auth.uid())))
  or ((get_my_role() = 'proje_yoneticisi') and has_project_access(project_id)));

create policy task_dependencies_update on public.task_dependencies
for update to authenticated using (
  (get_my_role() = 'admin')
  or ((get_my_role() = 'santiye_sefi') and project_id = (select profiles.project_id from profiles where profiles.id = (select auth.uid())))
  or ((get_my_role() = 'proje_yoneticisi') and has_project_access(project_id)));

create policy task_dependencies_delete on public.task_dependencies
for delete to authenticated using (
  (get_my_role() = 'admin')
  or ((get_my_role() = 'proje_yoneticisi') and has_project_access(project_id)));