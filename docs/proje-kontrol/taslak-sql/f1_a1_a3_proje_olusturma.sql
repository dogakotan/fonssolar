-- ============================================================================
-- F1 A1-A3 — proje kodu biçimi, tiresiz alan kodu, create_project_with_code — 6a'dan ÖNE ALINDI (Karar 85)
-- Tarih: 14.10.2026. Durum: TASLAK, uygulama "uygula" ile.
-- Kaynak: f1_proje_kodu_ve_olusturma.sql BÖLÜM A'nın A1-A3'ü (birebir). A4 (kodsuz projeyi reddeden kural) burada YOK,
--   sonraya kalır (Karar 34). Bu paket uygulandıktan sonra 6a'daki F1 parçası yalnızca A4'tür
--   (prova-6a.mjs ve register-oncelikli-plan.md buna göre güncellenir).
-- Gerekçe: manuel sihirbaz ve Excel ile yeni proje oluşturma bugün kırık / kodsuz (14.10 ROLLBACK testi):
--   PM projects INSERT'te RLS'e takılıyor; yeni projeye proje kodu verilmediği için register numarası alınamıyor.
-- Yedek ve mesai dışı: Karar 85 ile yalnızca bu paket için feragat (kısa kilit, lock_timeout 3s, geri alma SQL'i test edildi).
-- Doğrulama: f1_dogrulama.sql (§1-3; A4/AID/Adım 4 yokken diğerleri atlanır) + f1_a1_a3_dogrulama.sql (davranış).
-- Mevcut tablolar: project_register_settings ve project_areas'ta yalnızca birer CHECK değişir. Yeni kurallar eskilerin alt kümesi
--   (mevcut 4 kod ADN1, ADN2, TIZ, TKY uyuyor; project_areas boş). Kısıt yeniden eklenirken bu iki küçük tablo kısa süre kilitlenir.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;
set local lock_timeout = '3s';

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

commit;

-- ############################################################################
-- BÖLÜM B — GERİ AL (yorum bloğu; yalnızca gerekirse, ayrı çalıştırılır)
-- ############################################################################
-- Kapsam: fonksiyon düşer, iki CHECK eski metniyle geri gelir. Başka hiçbir şeye dokunmaz.
-- Fonksiyonla açılmış projeler ve kodları SİLİNMEZ; yeni kurallar eskilerin alt kümesi olduğu için eski CHECK'ler onları kabul eder.
-- Canlıya apply_migration ile uygulandıysa geri alma da ayrı bir migration olarak uygulanır.
/*
begin;
set local lock_timeout = '3s';
drop function public.create_project_with_code(jsonb, text);
alter table public.project_register_settings
  drop constraint project_register_settings_prefix_format,
  add constraint project_register_settings_prefix_format check (prefix ~ '^[A-Z0-9]{2,6}$');
alter table public.project_areas
  drop constraint project_areas_code_format,
  add constraint project_areas_code_format check (area_code ~ '^[A-Z0-9][A-Z0-9-]*$');
commit;
*/
