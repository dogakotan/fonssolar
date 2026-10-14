-- ============================================================================
-- F1 A1-A3 DAVRANIŞ DOĞRULAMASI (TASLAK) · 14.10.2026
-- Ne zaman: f1_a1_a3_proje_olusturma.sql BÖLÜM A ile aynı işlemde (ROLLBACK'li deneme) ya da uygulamadan sonra.
-- Nasıl: gerçek kullanıcılarla (request.jwt.claims + SET LOCAL ROLE authenticated); sonunda bilerek hata fırlatır,
--   test projeleri (zzh-*) hiçbir durumda kalıcı olmaz. Sonuç: "DOGRULAMA SONUCU: OK | F1 A1-A3 …".
-- Kural 10 ön kontrolü: değişkenler u_/v_ önekli (kolon adlarıyla çakışmaz); fonksiyon sonucu jsonb ile
--   karşılaştırılır; hata kodları fonksiyonun message alanından (forbidden/validation/duplicate) gelir;
--   her yazma ayrı ifade, okuma sonraki ifadede.
-- ============================================================================
do $$
declare
  u_admin uuid; u_pm uuid; u_ss uuid; u_muh uuid;
  v_res jsonb;
  v_txt text;
  v_n int;
  checks int := 0;
begin
  create or replace function pg_temp.h_as(p_uid uuid) returns void language plpgsql as $f$
  begin
    reset role;
    perform set_config('request.jwt.claims',
      case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    if p_uid is not null then set local role authenticated; end if;
  end $f$;
  -- Çalıştırır; başarıda 'OK', hatada hata metni (fonksiyon hatalarında kısa kod) döner.
  create or replace function pg_temp.h_try(p_sql text) returns text language plpgsql as $f$
  begin
    begin execute p_sql; return 'OK';
    exception when others then return sqlerrm; end;
  end $f$;

  select id into u_admin from public.profiles where role_key = 'admin' order by id limit 1;
  select id into u_pm from public.profiles where role_key = 'proje_yoneticisi' order by id limit 1;
  select id into u_ss from public.profiles where role_key = 'santiye_sefi' order by id limit 1;
  select id into u_muh from public.profiles where role_key = 'muhasebe' order by id limit 1;
  if u_admin is null or u_pm is null or u_ss is null or u_muh is null then
    raise exception 'test kullanıcıları bulunamadı';
  end if;

  -- ── H1 · Katalog ──
  if not exists (select 1 from pg_constraint where conname = 'project_register_settings_prefix_format'
                 and pg_get_constraintdef(oid) like '%^[A-Z][A-Z0-9]{1,4}$%') then
    raise exception 'H1 prefix kısıtı beklenen değil';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_areas_code_format'
                 and pg_get_constraintdef(oid) like '%^[A-Z0-9]+$%') then
    raise exception 'H1 alan kodu kısıtı beklenen değil';
  end if;
  if not exists (select 1 from pg_proc where proname = 'create_project_with_code' and prosecdef
                 and coalesce(proconfig::text, '') like '%search_path=public%') then
    raise exception 'H1 fonksiyon DEFINER/search_path değil';
  end if;
  if has_function_privilege('anon', 'public.create_project_with_code(jsonb,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_project_with_code(jsonb,text)', 'EXECUTE') then
    raise exception 'H1 fonksiyon yetkileri yanlış';
  end if;
  select count(*) into v_n from public.project_register_settings where prefix !~ '^[A-Z][A-Z0-9]{1,4}$';
  if v_n <> 0 then raise exception 'H1 mevcut projelerde kurala uymayan kod: %', v_n; end if;
  checks := checks + 1;

  -- ── H2 · Admin proje açar (Excel ve sihirbaz için aynı yol) ──
  perform pg_temp.h_as(u_admin);
  v_res := public.create_project_with_code(
    '{"id":"zzh-admin","name":"H admin testi","status":"aktif","project_type":"arazi_ges","start_date":"2026-11-01","target_date":"2027-04-30"}'::jsonb,
    'zzha');
  perform pg_temp.h_as(null);
  if v_res <> '{"id":"zzh-admin","code":"ZZHA"}'::jsonb then raise exception 'H2 dönüş: %', v_res; end if;
  select count(*) into v_n from public.project_register_settings where project_id = 'zzh-admin' and prefix = 'ZZHA';
  if v_n <> 1 then raise exception 'H2 proje kodu yazılmadı'; end if;
  select count(*) into v_n from public.project_category_weights where project_id = 'zzh-admin';
  if v_n <> 10 then raise exception 'H2 varsayılan ağırlıklar (trigger) 10 değil: %', v_n; end if;
  v_txt := public.next_register_no('zzh-admin', 'RFI');
  if v_txt <> 'RFI-ZZHA-0001' then raise exception 'H2 register numarası: %', v_txt; end if;
  checks := checks + 1;

  -- ── H3 · PM proje açar ve sihirbazın devamı (görev, ağırlık, tedarik, bütçe) PM'le çalışır ──
  perform pg_temp.h_as(u_pm);
  v_res := public.create_project_with_code('{"id":"zzh-pm","name":"H PM testi"}'::jsonb, 'ZZHP');
  v_txt := pg_temp.h_try('insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, status, target_qty, progress_pct) values (''zzh-pm'', ''T001'', ''H görev'', ''mekanik'', ''2026-11-01'', ''2026-11-30'', ''beklemede'', 0, 0)')
        || '/' || pg_temp.h_try('select public.save_project_category_weights(''zzh-pm'', ''[{"category":"mekanik","weight_pct":60},{"category":"elektrik_dc","weight_pct":40}]''::jsonb)')
        || '/' || pg_temp.h_try('select public.set_project_procurement_completed(''zzh-pm'', true)')
        || '/' || pg_temp.h_try('insert into public.budget_lines (project_id, category, name, planned_amount, order_index) values (''zzh-pm'', ''Mekanik'', ''H kalem'', 1000, 0)');
  perform pg_temp.h_as(null);
  if v_res <> '{"id":"zzh-pm","code":"ZZHP"}'::jsonb then raise exception 'H3 dönüş: %', v_res; end if;
  if v_txt <> 'OK/OK/OK/OK' then raise exception 'H3 sihirbaz devamı (görev/ağırlık/tedarik/bütçe): %', v_txt; end if;
  select count(*) into v_n from public.projects where id = 'zzh-pm' and status = 'aktif' and total_days = 180 and progress = 0;
  if v_n <> 1 then raise exception 'H3 varsayılanlar (aktif/180/0) yazılmadı'; end if;
  checks := checks + 1;

  -- ── H4 · Şantiye şefi ve muhasebe açamaz ──
  perform pg_temp.h_as(u_ss);
  v_txt := pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-ss","name":"x"}''::jsonb, ''ZZHS'')');
  perform pg_temp.h_as(u_muh);
  v_txt := v_txt || '/' || pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-mu","name":"x"}''::jsonb, ''ZZHM'')');
  perform pg_temp.h_as(null);
  if v_txt <> 'forbidden/forbidden' then raise exception 'H4 rol: %', v_txt; end if;
  checks := checks + 1;

  -- ── H5 · Doğrulama hataları (admin) ──
  perform pg_temp.h_as(u_admin);
  v_txt := pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-v1","name":"x"}''::jsonb, ''Z'')')
        || '/' || pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-v2","name":"x"}''::jsonb, ''1AB'')')
        || '/' || pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-v3","name":"x"}''::jsonb, ''ABCDEF'')')
        || '/' || pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-v4","name":"x"}''::jsonb, null)')
        || '/' || pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-v5","name":"x","bogus":1}''::jsonb, ''ZZHV'')')
        || '/' || pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-v6"}''::jsonb, ''ZZHW'')');
  perform pg_temp.h_as(null);
  if v_txt <> 'validation/validation/validation/validation/validation/validation' then raise exception 'H5 doğrulama: %', v_txt; end if;
  checks := checks + 1;

  -- ── H6 · Tekrar: kullanılan kod ve kullanılan ID ──
  perform pg_temp.h_as(u_admin);
  v_txt := pg_temp.h_try('select public.create_project_with_code(''{"id":"zzh-d1","name":"x"}''::jsonb, ''TIZ'')')
        || '/' || pg_temp.h_try('select public.create_project_with_code(''{"id":"test-izmir-ges-2026","name":"x"}''::jsonb, ''ZZHD'')');
  perform pg_temp.h_as(null);
  if v_txt <> 'duplicate/duplicate' then raise exception 'H6 tekrar: %', v_txt; end if;
  select count(*) into v_n from public.projects where id like 'zzh-v%' or id like 'zzh-d%' or id in ('zzh-ss', 'zzh-mu');
  if v_n <> 0 then raise exception 'H6 reddedilen çağrı proje bıraktı: %', v_n; end if;
  checks := checks + 1;

  -- ── H7 · Yeni CHECK'ler (postgres bağlamı) ──
  v_txt := pg_temp.h_try('update public.project_register_settings set prefix = ''1AB'' where project_id = ''zzh-admin''');
  if v_txt not like '%project_register_settings_prefix_format%' then raise exception 'H7 prefix kısıtı çalışmadı: %', v_txt; end if;
  v_txt := pg_temp.h_try('insert into public.project_areas (project_id, area_code, name) values (''zzh-admin'', ''A-1'', ''x'')');
  if v_txt not like '%project_areas_code_format%' then raise exception 'H7 alan kodu kısıtı çalışmadı: %', v_txt; end if;
  v_txt := pg_temp.h_try('insert into public.project_areas (project_id, area_code, name) values (''zzh-admin'', ''PB01'', ''x'')');
  if v_txt <> 'OK' then raise exception 'H7 geçerli alan kodu reddedildi: %', v_txt; end if;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | F1 A1-A3 | % kontrol grubu | admin ve PM proje+kod açar, sihirbaz devamı PM ile çalışır, SS/muhasebe reddedilir, biçim/tekrar kontrolleri', checks;
end $$;
