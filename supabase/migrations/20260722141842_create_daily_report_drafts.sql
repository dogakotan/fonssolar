create table if not exists public.daily_report_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  report_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_report_drafts_project_date_user_unique unique (project_id, report_date, user_id)
);

alter table public.daily_report_drafts enable row level security;

revoke all on public.daily_report_drafts from public, anon;
grant select, insert, update, delete on public.daily_report_drafts to authenticated;

drop policy if exists daily_report_drafts_select_own on public.daily_report_drafts;
create policy daily_report_drafts_select_own on public.daily_report_drafts
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists daily_report_drafts_insert_own on public.daily_report_drafts;
create policy daily_report_drafts_insert_own on public.daily_report_drafts
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.user_has_project_access(project_id)
);

drop policy if exists daily_report_drafts_update_own on public.daily_report_drafts;
create policy daily_report_drafts_update_own on public.daily_report_drafts
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and public.user_has_project_access(project_id)
);

drop policy if exists daily_report_drafts_delete_own on public.daily_report_drafts;
create policy daily_report_drafts_delete_own on public.daily_report_drafts
for delete to authenticated
using (user_id = (select auth.uid()));
