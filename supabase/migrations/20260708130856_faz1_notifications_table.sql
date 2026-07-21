create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  project_id text references public.projects(id) on delete cascade,
  entity_type text not null check (entity_type in ('purchase_request','invoice','ticket','daily_report')),
  entity_id uuid not null,
  event_type text not null check (event_type in ('created','status_changed','approved','rejected','commented')),
  title text not null,
  body text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_unread_idx on public.notifications (recipient_id, is_read, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (recipient_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

alter publication supabase_realtime add table public.notifications;

