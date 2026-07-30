begin;

alter table public.roles
  add column if not exists tabs_unrestricted boolean not null default false;

update public.roles set tabs_unrestricted = (allowed_tabs is null);

create table public.role_allowed_tabs (
  role_key text not null references public.roles(key) on update cascade on delete cascade,
  tab_key text not null,
  order_index integer not null check (order_index >= 0),
  primary key (role_key, tab_key),
  unique (role_key, order_index)
);

create table public.role_sidebar_items (
  role_key text not null references public.roles(key) on update cascade on delete cascade,
  item_key text not null,
  order_index integer not null check (order_index >= 0),
  primary key (role_key, item_key),
  unique (role_key, order_index)
);

insert into public.role_allowed_tabs(role_key, tab_key, order_index)
select r.key, item.value, item.ordinality - 1
from public.roles r
cross join lateral unnest(r.allowed_tabs) with ordinality item(value, ordinality)
where r.allowed_tabs is not null;

insert into public.role_sidebar_items(role_key, item_key, order_index)
select r.key, item.value, item.ordinality - 1
from public.roles r
cross join lateral unnest(r.sidebar_items) with ordinality item(value, ordinality);

alter table public.role_allowed_tabs enable row level security;
alter table public.role_sidebar_items enable row level security;

create policy role_allowed_tabs_read on public.role_allowed_tabs
  for select to authenticated using (true);
create policy role_allowed_tabs_admin_insert on public.role_allowed_tabs
  for insert to authenticated
  with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'));
create policy role_allowed_tabs_admin_update on public.role_allowed_tabs
  for update to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'))
  with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'));
create policy role_allowed_tabs_admin_delete on public.role_allowed_tabs
  for delete to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'));
create policy role_sidebar_items_read on public.role_sidebar_items
  for select to authenticated using (true);
create policy role_sidebar_items_admin_insert on public.role_sidebar_items
  for insert to authenticated
  with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'));
create policy role_sidebar_items_admin_update on public.role_sidebar_items
  for update to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'))
  with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'));
create policy role_sidebar_items_admin_delete on public.role_sidebar_items
  for delete to authenticated
  using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role_key='admin'));

grant select, insert, update, delete
  on public.role_allowed_tabs, public.role_sidebar_items to authenticated;
revoke all on public.role_allowed_tabs, public.role_sidebar_items from anon;

alter table public.roles
  drop column allowed_tabs,
  drop column sidebar_items;

commit;
