create table if not exists public.user_management_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_email text not null,
  action text not null check (action in ('password_changed', 'user_created', 'user_deleted')),
  created_at timestamptz not null default now()
);

alter table public.user_management_audit enable row level security;

revoke all on table public.user_management_audit from anon, authenticated;
grant select on table public.user_management_audit to authenticated;

create policy "Admins can read user management audit"
  on public.user_management_audit
  for select
  to authenticated
  using ((select public.get_my_role()) = 'admin');

create index if not exists user_management_audit_target_created_idx
  on public.user_management_audit (target_user_id, created_at desc);

create index if not exists user_management_audit_created_idx
  on public.user_management_audit (created_at desc);

comment on table public.user_management_audit is
  'Kullanıcı yönetimi olaylarını kaydeder. Parola veya parola özeti kesinlikle saklanmaz.';
