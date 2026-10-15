create table public.project_wbs (
  id                 uuid primary key default gen_random_uuid(),
  project_id         text not null references public.projects(id) on delete cascade,
  wbs_code           text not null,
  parent_id          uuid,
  name               text not null,
  level              smallint not null default 1,
  discipline         text,
  default_owner_role text,
  is_active          boolean not null default true,
  notes              text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint project_wbs_code_format check (wbs_code ~ '^[A-Z0-9][A-Z0-9-]*$'),
  constraint project_wbs_not_own_parent check (parent_id is distinct from id),
  constraint project_wbs_project_code_key unique (project_id, wbs_code),
  constraint project_wbs_project_id_id_key unique (project_id, id),
  constraint project_wbs_parent_fk foreign key (project_id, parent_id)
    references public.project_wbs (project_id, id) on delete restrict
);
create index idx_project_wbs_parent_id on public.project_wbs (parent_id);

create table public.project_areas (
  id               uuid primary key default gen_random_uuid(),
  project_id       text not null references public.projects(id) on delete cascade,
  area_code        text not null,
  parent_id        uuid,
  name             text not null,
  area_type        text not null default 'diger',
  responsible_user uuid references public.profiles(id) on delete set null,
  is_active        boolean not null default true,
  notes            text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint project_areas_code_format check (area_code ~ '^[A-Z0-9][A-Z0-9-]*$'),
  constraint project_areas_type_check check (area_type in (
    'genel','ges','pv_blok','inverter_station','mv_feeder','tm',
    'eih_section','depo','laydown','kamp','yol','diger')),
  constraint project_areas_not_own_parent check (parent_id is distinct from id),
  constraint project_areas_project_code_key unique (project_id, area_code),
  constraint project_areas_project_id_id_key unique (project_id, id),
  constraint project_areas_parent_fk foreign key (project_id, parent_id)
    references public.project_areas (project_id, id) on delete restrict
);
create index idx_project_areas_parent_id on public.project_areas (parent_id);
create index idx_project_areas_responsible_user on public.project_areas (responsible_user);

create table public.area_wbs (
  project_id text not null,
  area_id    uuid not null,
  wbs_id     uuid not null,
  primary key (area_id, wbs_id),
  constraint area_wbs_area_fk foreign key (project_id, area_id)
    references public.project_areas (project_id, id) on delete cascade,
  constraint area_wbs_wbs_fk foreign key (project_id, wbs_id)
    references public.project_wbs (project_id, id) on delete cascade
);
create index idx_area_wbs_wbs on public.area_wbs (project_id, wbs_id);

alter table public.project_tasks
  add column activity_id  text,
  add column wbs_id       uuid,
  add column area_id      uuid,
  add column discipline   text,
  add column baseline_start date,
  add column baseline_end   date,
  add column primavera_id text,
  add constraint project_tasks_wbs_fk foreign key (project_id, wbs_id)
    references public.project_wbs (project_id, id) on delete restrict,
  add constraint project_tasks_area_fk foreign key (project_id, area_id)
    references public.project_areas (project_id, id) on delete restrict,
  add constraint project_tasks_activity_id_format
    check (activity_id is null or activity_id ~ '^[A-Z0-9][A-Z0-9-]*$'),
  add constraint project_tasks_baseline_order
    check (baseline_end is null or baseline_start is null or baseline_end >= baseline_start);

create unique index project_tasks_project_activity_id_key
  on public.project_tasks (project_id, activity_id) where activity_id is not null;
create index idx_project_tasks_wbs_id  on public.project_tasks (wbs_id);
create index idx_project_tasks_area_id on public.project_tasks (area_id);

update public.project_tasks
   set baseline_start = planned_start,
       baseline_end   = planned_end
 where baseline_start is null and baseline_end is null;

create or replace function public.fn_project_wbs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_level  smallint;
  parent_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'WBS kaydının projesi değiştirilemez';
    end if;
    if new.wbs_code <> old.wbs_code
       and exists (select 1 from public.project_tasks t where t.wbs_id = old.id) then
      raise exception 'Kullanımdaki WBS kodu değiştirilemez: %', old.wbs_code;
    end if;
  end if;

  if new.parent_id is null then
    new.level := 1;
  else
    select w.level, w.is_active into parent_level, parent_active
      from public.project_wbs w where w.id = new.parent_id;
    new.level := parent_level + 1;
    if new.is_active and not parent_active then
      raise exception 'Üst WBS pasifken alt WBS aktif olamaz';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      if exists (
        with recursive anc as (
          select id, parent_id from public.project_wbs where id = new.parent_id
          union all
          select w.id, w.parent_id from public.project_wbs w join anc on w.id = anc.parent_id
        )
        select 1 from anc where id = new.id
      ) then
        raise exception 'WBS kendi alt dalına taşınamaz';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fn_project_areas_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'Alan kaydının projesi değiştirilemez';
    end if;
    if new.area_code <> old.area_code
       and exists (select 1 from public.project_tasks t where t.area_id = old.id) then
      raise exception 'Kullanımdaki alan kodu değiştirilemez: %', old.area_code;
    end if;
  end if;

  if new.parent_id is not null then
    select a.is_active into parent_active
      from public.project_areas a where a.id = new.parent_id;
    if new.is_active and not parent_active then
      raise exception 'Üst alan pasifken alt alan aktif olamaz';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      if exists (
        with recursive anc as (
          select id, parent_id from public.project_areas where id = new.parent_id
          union all
          select a.id, a.parent_id from public.project_areas a join anc on a.id = anc.parent_id
        )
        select 1 from anc where id = new.id
      ) then
        raise exception 'Alan kendi alt dalına taşınamaz';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fn_project_tasks_identity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.activity_id is not null
     and new.activity_id is distinct from old.activity_id then
    raise exception 'Atanmış Activity ID değiştirilemez: %', old.activity_id;
  end if;

  if new.wbs_id is not null
     and (tg_op = 'INSERT' or new.wbs_id is distinct from old.wbs_id) then
    if exists (select 1 from public.project_wbs w where w.id = new.wbs_id and not w.is_active) then
      raise exception 'Pasif WBS aktiviteye atanamaz';
    end if;
  end if;
  if new.area_id is not null
     and (tg_op = 'INSERT' or new.area_id is distinct from old.area_id) then
    if exists (select 1 from public.project_areas a where a.id = new.area_id and not a.is_active) then
      raise exception 'Pasif alan aktiviteye atanamaz';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_project_wbs_guard
  before insert or update on public.project_wbs
  for each row execute function public.fn_project_wbs_guard();
create trigger trg_project_wbs_updated_at
  before update on public.project_wbs
  for each row execute function public.update_updated_at_column();

create trigger trg_project_areas_guard
  before insert or update on public.project_areas
  for each row execute function public.fn_project_areas_guard();
create trigger trg_project_areas_updated_at
  before update on public.project_areas
  for each row execute function public.update_updated_at_column();

create trigger trg_project_tasks_identity_guard
  before insert or update on public.project_tasks
  for each row execute function public.fn_project_tasks_identity_guard();

revoke all on function public.fn_project_wbs_guard()            from public, anon, authenticated;
revoke all on function public.fn_project_areas_guard()          from public, anon, authenticated;
revoke all on function public.fn_project_tasks_identity_guard() from public, anon, authenticated;

alter table public.project_wbs   enable row level security;
alter table public.project_areas enable row level security;
alter table public.area_wbs      enable row level security;

revoke all on public.project_wbs, public.project_areas, public.area_wbs from anon;

create policy project_wbs_select on public.project_wbs
  for select to authenticated
  using (public.user_has_project_access(project_id));

create policy project_wbs_insert on public.project_wbs
  for insert to authenticated
  with check (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
  );

create policy project_wbs_update on public.project_wbs
  for update to authenticated
  using (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
  )
  with check (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
  );

create policy project_wbs_delete on public.project_wbs
  for delete to authenticated
  using (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
  );

create policy project_areas_select on public.project_areas
  for select to authenticated
  using (public.user_has_project_access(project_id));

create policy project_areas_insert on public.project_areas
  for insert to authenticated
  with check (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
    or ((select public.get_my_role()) = 'santiye_sefi'
        and project_id = (select p.project_id from public.profiles p where p.id = (select auth.uid())))
  );

create policy project_areas_update on public.project_areas
  for update to authenticated
  using (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
    or ((select public.get_my_role()) = 'santiye_sefi'
        and project_id = (select p.project_id from public.profiles p where p.id = (select auth.uid())))
  )
  with check (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
    or ((select public.get_my_role()) = 'santiye_sefi'
        and project_id = (select p.project_id from public.profiles p where p.id = (select auth.uid())))
  );

create policy project_areas_delete on public.project_areas
  for delete to authenticated
  using (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
  );

create policy area_wbs_select on public.area_wbs
  for select to authenticated
  using (public.user_has_project_access(project_id));

create policy area_wbs_insert on public.area_wbs
  for insert to authenticated
  with check (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
    or ((select public.get_my_role()) = 'santiye_sefi'
        and project_id = (select p.project_id from public.profiles p where p.id = (select auth.uid())))
  );

create policy area_wbs_delete on public.area_wbs
  for delete to authenticated
  using (
    (select public.get_my_role()) = 'admin'
    or ((select public.get_my_role()) = 'proje_yoneticisi' and public.has_project_access(project_id))
    or ((select public.get_my_role()) = 'santiye_sefi'
        and project_id = (select p.project_id from public.profiles p where p.id = (select auth.uid())))
  );