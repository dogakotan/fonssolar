alter table public.projects
  add column if not exists procurement_completed boolean not null default false,
  add column if not exists procurement_completed_at timestamptz,
  add column if not exists procurement_completed_by uuid references auth.users(id);

create or replace function public.set_project_procurement_completed(
  p_project_id text,
  p_completed boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu onayı yalnızca proje yöneticisi verebilir.';
  end if;

  if not public.has_project_access(p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  update public.projects
  set procurement_completed = coalesce(p_completed, false),
      procurement_completed_at = case when coalesce(p_completed, false) then now() else null end,
      procurement_completed_by = case when coalesce(p_completed, false) then (select auth.uid()) else null end
  where id = p_project_id;

  if not found then
    raise exception 'Proje bulunamadı.';
  end if;
end;
$$;

revoke execute on function public.set_project_procurement_completed(text, boolean) from public, anon;
grant execute on function public.set_project_procurement_completed(text, boolean) to authenticated;

comment on column public.projects.procurement_completed is
  'Faz 1: proje yöneticisinin sistem dışında yürütülen tedarik/teslimat süreci tamamlandı onayı.';
comment on column public.projects.procurement_completed_at is
  'Tedarik/teslimat tamamlandı onay zamanı.';
comment on column public.projects.procurement_completed_by is
  'Tedarik/teslimat tamamlandı onayını veren proje yöneticisi.';
