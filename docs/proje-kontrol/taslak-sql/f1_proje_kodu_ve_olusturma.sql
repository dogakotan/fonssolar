-- ============================================================================
-- FAZ 1 · F1 — proje kodu kuralı, proje oluşturma fonksiyonu, alan kodu kısıtı — TASLAK (UYGULANMADI)
-- Tarih: 09.10.2026 · Kararlar: 21 + Ç14 (biçim), Ç15 (b) (tek fonksiyon + reddeden kural), Ç18 (alan kodu)
-- Doğrulama: taslak-sql/f1_dogrulama.sql · Edge function diff'i: docs/proje-kontrol/f1-import-project-excel-diff.md
-- Bağımlılık: yok (B1'den bağımsız; hata sözleşmesi register_raise ile aynı biçim, ama onu çağırmaz).
-- Sıra önerisi (Adım 6): bkz. dosya sonundaki "uygulama sırası" notu — reddeden kural (A4) frontend ve
--   edge function deploy edilmeden uygulanırsa sihirbazla ve Excel'le yeni proje oluşturma kırılır.
--
-- Canlı durum (09.10.2026 SELECT):
--   * projects: 4 satır; hepsinin project_register_settings satırı var (ADN1, ADN2, TIZ, TKY).
--   * project_register_settings_prefix_format: ^[A-Z0-9]{2,6}$ → ^[A-Z][A-Z0-9]{1,4}$ (4 kod uyuyor).
--   * project_areas_code_format: ^[A-Z0-9][A-Z0-9-]*$ → ^[A-Z0-9]+$ (project_areas boş, veri riski yok).
--   * projects INSERT policy'si yalnızca admin (projects_insert_admin). Edge function admin+proje_yoneticisi'ne
--     izin veriyor (service_role ile). Bu fonksiyon edge function'la aynı kuralı uygular: admin, proje_yoneticisi.
--     → Davranış değişikliği: proje yöneticisi sihirbazdan da proje oluşturabilir hâle gelir (UI zaten
--       canCreateProject = admin || proje_yoneticisi diyor; bugün RLS'e takılıyor — doğrulanmadı, yalnızca
--       policy metninden çıkarım).
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A1 · Proje kodu biçimi (Ç14): harfle başlar, 2-5 karakter, büyük harf/rakam ──
alter table public.project_register_settings
  drop constraint project_register_settings_prefix_format,
  add constraint project_register_settings_prefix_format check (prefix ~ '^[A-Z][A-Z0-9]{1,4}$');

-- ── A2 · Alan kodu tiresiz (Ç18): Activity ID {PROJE}-{DİSİPLİN}-{ALAN}-{NNNN} ayrıştırılabilsin ──
alter table public.project_areas
  drop constraint project_areas_code_format,
  add constraint project_areas_code_format check (area_code ~ '^[A-Z0-9]+$');

-- ── A3 · Proje oluşturma fonksiyonu (Ç15 b): proje + kod tek işlemde ──
create function public.create_project_with_code(p_project jsonb, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array[
    'id','name','location','capacity_kwp','capacity_kwe','storage_kwh','start_date','target_date',
    'total_days','status','progress','project_type','panel_brand','panel_count','inverter_brand',
    'inverter_count','battery_brand','battery_power_kw','battery_count'];
  v_extra text[];
  v_code  text := upper(btrim(coalesce(p_code, '')));
  r       public.projects;
begin
  if coalesce(public.get_my_role(), '') not in ('admin', 'proje_yoneticisi') then
    raise exception using message = 'forbidden', hint = 'Proje oluşturma yetkiniz yok',
      detail = jsonb_build_object('role', public.get_my_role())::text;
  end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception using message = 'validation', hint = 'Proje bilgisi eksik',
      detail = jsonb_build_object('fields', jsonb_build_array('project'))::text;
  end if;
  select array_agg(k) into v_extra from jsonb_object_keys(p_project) k where k <> all (v_allowed);
  if v_extra is not null then
    raise exception using message = 'validation', hint = 'Tanınmayan proje alanı',
      detail = jsonb_build_object('unknown_fields', to_jsonb(v_extra))::text;
  end if;
  if v_code !~ '^[A-Z][A-Z0-9]{1,4}$' then
    raise exception using message = 'validation',
      hint = 'Proje kodu harfle başlamalı, 2-5 karakter, yalnızca büyük harf ve rakam (ör. DYB, ADN1)',
      detail = jsonb_build_object('fields', jsonb_build_array('code'), 'value', p_code)::text;
  end if;

  r := jsonb_populate_record(null::public.projects, p_project);
  if nullif(btrim(r.id), '') is null or nullif(btrim(r.name), '') is null then
    raise exception using message = 'validation', hint = 'Proje ID ve Proje Adı zorunludur',
      detail = jsonb_build_object('fields', jsonb_build_array('id', 'name'))::text;
  end if;
  if exists (select 1 from public.projects where id = r.id) then
    raise exception using message = 'duplicate', hint = 'Bu proje ID''si zaten kullanılıyor',
      detail = jsonb_build_object('field', 'id', 'value', r.id)::text;
  end if;
  if exists (select 1 from public.project_register_settings where prefix = v_code) then
    raise exception using message = 'duplicate', hint = 'Bu proje kodu başka bir projede kullanılıyor',
      detail = jsonb_build_object('field', 'code', 'value', v_code)::text;
  end if;

  insert into public.projects (
    id, name, location, capacity_kwp, capacity_kwe, storage_kwh, start_date, target_date, total_days,
    status, progress, project_type, panel_brand, panel_count, inverter_brand, inverter_count,
    battery_brand, battery_power_kw, battery_count)
  values (
    btrim(r.id), btrim(r.name), r.location, r.capacity_kwp, r.capacity_kwe, r.storage_kwh, r.start_date,
    r.target_date, coalesce(r.total_days, 180), coalesce(r.status, 'aktif'), coalesce(r.progress, 0),
    r.project_type, r.panel_brand, r.panel_count, r.inverter_brand, r.inverter_count, r.battery_brand,
    r.battery_power_kw, r.battery_count);

  insert into public.project_register_settings (project_id, prefix) values (btrim(r.id), v_code);

  return jsonb_build_object('id', btrim(r.id), 'code', v_code);
end $$;

comment on function public.create_project_with_code(jsonb, text) is
  'Yeni proje + proje kodu (project_register_settings.prefix) tek işlemde. Yalnızca admin ve proje_yoneticisi.';
revoke all on function public.create_project_with_code(jsonb, text) from public, anon;
grant execute on function public.create_project_with_code(jsonb, text) to authenticated;

-- ── A4 · Kodu olmayan projeyi reddeden kural (ertelenmiş, işlem sonunda kontrol) ──
-- projects INSERT'inde ve project_register_settings DELETE / project_id değişiminde çalışır. Proje silinirken
-- ayar satırı CASCADE ile gider; işlem sonunda proje de yok olduğu için hata vermez.
create function public.fn_require_project_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_pid text;
begin
  v_pid := case when tg_table_name = 'projects' then new.id else old.project_id end;
  if exists (select 1 from public.projects where id = v_pid)
     and not exists (select 1 from public.project_register_settings where project_id = v_pid) then
    raise exception using message = 'validation',
      hint = 'Proje kodu olmadan proje kaydedilemez (project_register_settings)',
      detail = jsonb_build_object('fields', jsonb_build_array('code'), 'project_id', v_pid)::text;
  end if;
  return null;
end $$;
revoke all on function public.fn_require_project_code() from public, anon, authenticated;

create constraint trigger trg_projects_require_code
  after insert on public.projects
  deferrable initially deferred
  for each row execute function public.fn_require_project_code();

create constraint trigger trg_project_register_settings_keep_code
  after delete or update of project_id on public.project_register_settings
  deferrable initially deferred
  for each row execute function public.fn_require_project_code();

commit;

-- Uygulama sırası notu (Adım 6):
--   A1, A2, A3 geriye dönük uyumlu (mevcut akışları bozmaz). A4 bozar: bugünkü sihirbaz (doğrudan projects insert)
--   ve import-project-excel (service_role upsert) kodsuz proje oluşturur → A4 sonrası reddedilir.
--   Öneri: A1-A3 → frontend + edge function deploy → A4. Bu dosya tek transaction olduğu için gerekirse A4
--   ayrı bir migration'a bölünür (kullanıcı kararı).

-- ############################################################################
-- BÖLÜM B — GERİ AL (yorum; yalnızca gerekirse, ayrı onayla)
-- ############################################################################
-- begin;
-- drop trigger if exists trg_project_register_settings_keep_code on public.project_register_settings;
-- drop trigger if exists trg_projects_require_code on public.projects;
-- drop function if exists public.fn_require_project_code();
-- drop function if exists public.create_project_with_code(jsonb, text);
-- alter table public.project_areas drop constraint project_areas_code_format,
--   add constraint project_areas_code_format check (area_code ~ '^[A-Z0-9][A-Z0-9-]*$');
-- alter table public.project_register_settings drop constraint project_register_settings_prefix_format,
--   add constraint project_register_settings_prefix_format check (prefix ~ '^[A-Z0-9]{2,6}$');
-- commit;
