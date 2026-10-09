-- ============================================================================
-- FAZ B · B1 — register_permissions — TASLAK (UYGULANMADI, onay bekliyor) · 07.10.2026
-- Plan: docs/proje-kontrol/faz-b-migration-plani.md · Tasarım: tasarim.md §4.2 A, §4.3, §4.4
-- Doğrulama: taslak-sql/b1_dogrulama.sql · Anlık görüntü: yedek-faz-b-07-10.sql (B1 yeni nesne ekler,
-- mevcut nesneye dokunmaz) · Test: tests/proje-kontrol-b1-yetki.spec.js
--
-- İçerik:
--   * register_permissions (rol × register × eylem) + edit_scope (all | own)
--   * register_status_transitions (iş durumu geçiş beyaz listesi)
--   * register_raise()   — ortak hata sözleşmesi (yalnızca diğer DEFINER fonksiyonlar çağırır)
--   * register_can()     — RLS ve RPC'lerin ortak yetki kontrolü
--   * get_my_register_permissions(p_project_id) — arayüz için yetki haritası
--   * set_register_permission(...) — yalnızca admin
--   * Seed: tasarım 4.3 matrisi (Karar 6 AÇIK: değerler öneri; tablo değişince kod değişmez)
--
-- Yetki modeli: pg_default_acl yeni tablolarda authenticated'a tüm yetkileri, yeni fonksiyonlarda
-- anon + authenticated'a EXECUTE verir → aşağıda hepsi açıkça geri çekilir.
-- Tek transaction. BÖLÜM B (geri al) dosyanın sonunda yorum içinde.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A1 · Tablolar ──
create table public.register_permissions (
  role_key      text not null references public.roles(key) on update cascade on delete cascade,
  register_type text not null,
  can_view      boolean not null default false,
  can_create    boolean not null default false,
  can_edit      boolean not null default false,
  can_approve   boolean not null default false,
  can_delete    boolean not null default false,
  edit_scope    text not null default 'all',
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null,
  primary key (role_key, register_type),
  constraint register_permissions_type_check check (register_type in (
    'document','drawing','rfi','submittal','material_approval','interface','decision','action',
    'risk','change','claim','procurement','subcontractor','payment')),
  constraint register_permissions_edit_scope_check check (edit_scope in ('all','own')),
  -- Görmeyen düzenleyemez/onaylayamaz/silemez
  constraint register_permissions_view_implied check (
    can_view or not (can_create or can_edit or can_approve or can_delete))
);
comment on table public.register_permissions is
  'Rol × register × eylem yetkisi (tasarım 4.3). edit_scope=own: rol yalnızca kendi oluşturduğu kaydı düzenler.';
create index idx_register_permissions_updated_by on public.register_permissions (updated_by) where updated_by is not null;

create table public.register_status_transitions (
  register_type text not null,
  from_status   text not null,
  to_status     text not null,
  primary key (register_type, from_status, to_status),
  constraint register_status_transitions_type_check check (register_type in (
    'document','rfi','action','decision','submittal','material_approval')),
  constraint register_status_transitions_distinct check (from_status <> to_status)
);
comment on table public.register_status_transitions is
  'set_register_status yalnızca bu tablodaki iş durumu geçişlerine izin verir.';

alter table public.register_permissions enable row level security;
alter table public.register_status_transitions enable row level security;

-- Yetki matrisi hassas değil: oturum açmış herkes okur; yazma yalnızca RPC.
create policy register_permissions_select on public.register_permissions
  for select to authenticated using (true);
create policy register_status_transitions_select on public.register_status_transitions
  for select to authenticated using (true);

revoke all on public.register_permissions, public.register_status_transitions from anon, authenticated;
grant select on public.register_permissions, public.register_status_transitions to authenticated;

-- ── A2 · Seed: tasarım 4.3 (V görüntüle, C oluştur, E düzenle, A onayla, D sil) ──
insert into public.register_permissions
  (role_key, register_type, can_view, can_create, can_edit, can_approve, can_delete, edit_scope)
select m.role_key, m.register_type,
       position('V' in m.f) > 0, position('C' in m.f) > 0, position('E' in m.f) > 0,
       position('A' in m.f) > 0, position('D' in m.f) > 0,
       case when m.role_key = 'santiye_sefi' and position('E' in m.f) > 0 then 'own' else 'all' end
from (values
  ('admin','document','VCEAD'), ('proje_yoneticisi','document','VCEA'), ('santiye_sefi','document','VC'), ('muhasebe','document',''),
  ('admin','drawing','VCEAD'), ('proje_yoneticisi','drawing','VCEA'), ('santiye_sefi','drawing','V'), ('muhasebe','drawing',''),
  ('admin','rfi','VCEAD'), ('proje_yoneticisi','rfi','VCEA'), ('santiye_sefi','rfi','VCE'), ('muhasebe','rfi',''),
  ('admin','submittal','VCEAD'), ('proje_yoneticisi','submittal','VCEA'), ('santiye_sefi','submittal','V'), ('muhasebe','submittal',''),
  ('admin','material_approval','VCEAD'), ('proje_yoneticisi','material_approval','VCEA'), ('santiye_sefi','material_approval','V'), ('muhasebe','material_approval',''),
  ('admin','interface','VCEAD'), ('proje_yoneticisi','interface','VCEA'), ('santiye_sefi','interface','VC'), ('muhasebe','interface',''),
  ('admin','decision','VCEAD'), ('proje_yoneticisi','decision','VCEA'), ('santiye_sefi','decision','V'), ('muhasebe','decision',''),
  ('admin','action','VCEAD'), ('proje_yoneticisi','action','VCEA'), ('santiye_sefi','action','VCE'), ('muhasebe','action',''),
  ('admin','risk','VCEAD'), ('proje_yoneticisi','risk','VCEA'), ('santiye_sefi','risk','VC'), ('muhasebe','risk',''),
  ('admin','change','VCEAD'), ('proje_yoneticisi','change','VCEA'), ('santiye_sefi','change','VC'), ('muhasebe','change','V'),
  ('admin','claim','VCEAD'), ('proje_yoneticisi','claim','VCEA'), ('santiye_sefi','claim',''), ('muhasebe','claim','V'),
  ('admin','procurement','V'), ('proje_yoneticisi','procurement','V'), ('santiye_sefi','procurement','V'), ('muhasebe','procurement','V'),
  ('admin','subcontractor','VCED'), ('proje_yoneticisi','subcontractor','VCE'), ('santiye_sefi','subcontractor','V'), ('muhasebe','subcontractor','V'),
  ('admin','payment','V'), ('proje_yoneticisi','payment','V'), ('santiye_sefi','payment',''), ('muhasebe','payment','V')
) as m(role_key, register_type, f)
on conflict (role_key, register_type) do nothing;

-- İş durumu geçişleri (canlı CHECK listelerine göre; öneri — onayla değişebilir)
insert into public.register_status_transitions (register_type, from_status, to_status) values
  ('document','active','void'),
  ('rfi','open','under_review'), ('rfi','under_review','open'),
  ('rfi','open','answered'), ('rfi','under_review','answered'), ('rfi','answered','under_review'),
  ('rfi','answered','closed'), ('rfi','closed','under_review'),
  ('rfi','open','rejected'), ('rfi','under_review','rejected'),
  ('action','open','in_progress'), ('action','in_progress','open'),
  ('action','open','done'), ('action','in_progress','done'), ('action','done','in_progress'),
  ('action','open','cancelled'), ('action','in_progress','cancelled'),
  ('decision','proposed','approved'), ('decision','proposed','cancelled'),
  ('decision','approved','superseded'), ('decision','approved','cancelled'),
  ('submittal','draft','submitted'), ('submittal','submitted','under_review'),
  ('submittal','submitted','approved'), ('submittal','submitted','approved_with_comments'),
  ('submittal','submitted','rejected'), ('submittal','submitted','resubmit_required'),
  ('submittal','under_review','approved'), ('submittal','under_review','approved_with_comments'),
  ('submittal','under_review','rejected'), ('submittal','under_review','resubmit_required'),
  ('submittal','resubmit_required','submitted'), ('submittal','rejected','submitted'),
  ('material_approval','draft','submitted'),
  ('material_approval','submitted','approved'), ('material_approval','submitted','approved_with_comments'),
  ('material_approval','submitted','rejected'), ('material_approval','rejected','submitted'),
  ('material_approval','approved','expired'), ('material_approval','approved_with_comments','expired')
on conflict do nothing;

-- ── A3 · Fonksiyonlar ──

-- Ortak hata sözleşmesi (tasarım 4.4): message = kısa kod, detail = JSON, hint = Türkçe açıklama.
create function public.register_raise(p_code text, p_message text default null, p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception using
    message = p_code,
    detail  = coalesce(p_detail, '{}'::jsonb)::text,
    hint    = coalesce(p_message, p_code),
    errcode = 'P0001';
end $$;

create function public.register_can(p_type text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case p_action
             when 'view'    then rp.can_view
             when 'create'  then rp.can_create
             when 'edit'    then rp.can_edit
             when 'approve' then rp.can_approve
             when 'delete'  then rp.can_delete
             else false
           end
    from public.register_permissions rp
    where rp.role_key = public.get_my_role() and rp.register_type = p_type), false);
$$;
comment on function public.register_can(text, text) is
  'Çağıranın rolü bu register''da bu eylemi yapabilir mi (proje erişimi AYRICA has_project_access ile aranır).';

create function public.get_my_register_permissions(p_project_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
  v_access boolean;
begin
  if p_project_id is null then
    perform public.register_raise('validation', 'Proje seçilmedi', jsonb_build_object('fields', jsonb_build_array('p_project_id')));
  end if;
  v_access := v_role is not null and public.has_project_access(p_project_id);
  return jsonb_build_object(
    'role', v_role,
    'project_access', v_access,
    'registers', coalesce((
      select jsonb_object_agg(rp.register_type, jsonb_build_object(
               'view',    v_access and rp.can_view,
               'create',  v_access and rp.can_create,
               'edit',    v_access and rp.can_edit,
               'approve', v_access and rp.can_approve,
               'delete',  v_access and rp.can_delete,
               'edit_scope', rp.edit_scope))
      from public.register_permissions rp
      where rp.role_key = v_role), '{}'::jsonb));
end $$;

create function public.set_register_permission(
  p_role_key text, p_register_type text,
  p_view boolean, p_create boolean, p_edit boolean, p_approve boolean, p_delete boolean,
  p_edit_scope text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.register_permissions;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then
    perform public.register_raise('forbidden', 'Yetki matrisini yalnızca admin değiştirebilir');
  end if;
  begin
    insert into public.register_permissions as rp
      (role_key, register_type, can_view, can_create, can_edit, can_approve, can_delete, edit_scope, updated_at, updated_by)
    values (p_role_key, p_register_type, p_view, p_create, p_edit, p_approve, p_delete, coalesce(p_edit_scope, 'all'), now(), auth.uid())
    on conflict (role_key, register_type) do update set
      can_view = excluded.can_view, can_create = excluded.can_create, can_edit = excluded.can_edit,
      can_approve = excluded.can_approve, can_delete = excluded.can_delete, edit_scope = excluded.edit_scope,
      updated_at = now(), updated_by = auth.uid()
    returning * into r;
  exception when check_violation or foreign_key_violation or not_null_violation then
    perform public.register_raise('validation', 'Geçersiz rol, register türü veya yetki birleşimi',
      jsonb_build_object('error', sqlerrm));
  end;
  return to_jsonb(r);
end $$;

-- ── A4 · Fonksiyon yetkileri ──
revoke all on function public.register_raise(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.register_can(text, text) from public, anon;
revoke all on function public.get_my_register_permissions(text) from public, anon;
revoke all on function public.set_register_permission(text, text, boolean, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.register_can(text, text) to authenticated;
grant execute on function public.get_my_register_permissions(text) to authenticated;
grant execute on function public.set_register_permission(text, text, boolean, boolean, boolean, boolean, boolean, text) to authenticated;

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL (yalnızca gerekirse, ayrı çalıştırılır; B3/B5/B6 uygulanmışsa önce onlar geri alınır)
-- ############################################################################
/*
begin;
drop function if exists public.set_register_permission(text, text, boolean, boolean, boolean, boolean, boolean, text);
drop function if exists public.get_my_register_permissions(text);
drop function if exists public.register_can(text, text);
drop function if exists public.register_raise(text, text, jsonb);
drop table if exists public.register_status_transitions;
drop table if exists public.register_permissions;
commit;
*/
