-- F1 doğrulama. Uygulama sonrası (ve Adım 6'da canlıda) çalıştırılır. Hata yoksa son satır
-- 'DOGRULAMA SONUCU: OK' fırlatır; blok her durumda hatayla biter → yaptığı her şey geri alınır.
-- Regresyon testleri (R1-R5) kuralı fiilen tetikler. Her biri kendi alt işleminde çalışır ve sonunda kasıtlı
-- 'GERI_AL' hatasıyla geri alınır; geçici test projeleri (zzf1-*) hiçbir durumda kalıcı olmaz.
-- A4 (kodsuz projeyi reddeden kural) ayrı migration'dır (Karar 34): trigger'lar yoksa A4 kontrolleri atlanır
-- ve sonuç satırında "A4 yok" yazar.
-- Adım 3 (Activity ID, f1_aid_activity_id.sql) kuruluysa R6-R16 da çalışır; değilse "AID yok" yazar.
-- R6-R16 her biri kendi alt işleminde geçici bir test projesi (zzf1-a*) kurar ve 'GERI_AL:<sonuç>' ile geri alır.
-- Postgres (tablo sahibi) bağlamında çalıştırılmalıdır (RLS'i aşması gerekir).
do $$
declare
  n int; checks int := 0; e text; a4 boolean; aid boolean;
  c_trg constant text := 'public.trg_projects_require_code, public.trg_project_register_settings_keep_code';
  u_admin uuid; u_pm uuid; t uuid[]; j jsonb; f text;
begin
  -- 1 · Biçim kısıtları
  if not exists (select 1 from pg_constraint where conname = 'project_register_settings_prefix_format'
                 and pg_get_constraintdef(oid) like '%^[A-Z][A-Z0-9]{1,4}$%') then
    raise exception 'prefix biçim kısıtı beklenen değil';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_areas_code_format'
                 and pg_get_constraintdef(oid) like '%^[A-Z0-9]+$%') then
    raise exception 'alan kodu kısıtı beklenen değil';
  end if;
  checks := checks + 1;

  -- 2 · Mevcut projelerin hepsinin geçerli kodu var
  select count(*) into n from public.projects p
   where not exists (select 1 from public.project_register_settings s
                     where s.project_id = p.id and s.prefix ~ '^[A-Z][A-Z0-9]{1,4}$');
  if n > 0 then raise exception '% projenin geçerli kodu yok', n; end if;
  checks := checks + 1;

  -- 3 · create_project_with_code güvenliği
  if not exists (select 1 from pg_proc where proname = 'create_project_with_code' and prosecdef
                 and coalesce(proconfig::text,'') like '%search_path=public%') then
    raise exception 'create_project_with_code DEFINER/search_path değil';
  end if;
  if has_function_privilege('anon', 'public.create_project_with_code(jsonb,text)', 'EXECUTE') then
    raise exception 'anon create_project_with_code çalıştırabiliyor';
  end if;
  if not has_function_privilege('authenticated', 'public.create_project_with_code(jsonb,text)', 'EXECUTE') then
    raise exception 'authenticated create_project_with_code çalıştıramıyor';
  end if;
  checks := checks + 1;

  -- 4 · A4: fonksiyonlar ve ertelenmiş trigger'lar
  select count(*) into n from pg_trigger
   where tgname in ('trg_projects_require_code', 'trg_project_register_settings_keep_code')
     and tgconstraint <> 0 and tgdeferrable and tginitdeferred;
  a4 := n > 0;
  if a4 then
    if n <> 2 then raise exception 'ertelenmiş trigger sayısı 2 değil: %', n; end if;
    for e in select unnest(array['public.project_code_missing(text)', 'public.fn_projects_require_code()',
                                 'public.fn_project_register_settings_keep_code()']) loop
      if not (select prosecdef and coalesce(proconfig::text,'') like '%search_path=public%' from pg_proc where oid = e::regprocedure) then
        raise exception '% DEFINER/search_path değil', e;
      end if;
      if has_function_privilege('anon', e, 'EXECUTE') or has_function_privilege('authenticated', e, 'EXECUTE') then
        raise exception '% dışarıya açık', e;
      end if;
    end loop;
    checks := checks + 1;

    -- R1 · kodsuz proje → validation
    begin
      insert into public.projects (id, name) values ('zzf1-r1', 'F1 doğrulama R1');
      execute 'set constraints ' || c_trg || ' immediate';
      raise exception 'GERI_AL';
    exception when others then e := sqlerrm; end;
    execute 'set constraints ' || c_trg || ' deferred';
    if e <> 'validation' then raise exception 'R1 kodsuz proje: validation beklendi, gelen: %', e; end if;

    -- R2 · kodu silme → validation
    begin
      insert into public.projects (id, name) values ('zzf1-r2', 'F1 doğrulama R2');
      insert into public.project_register_settings (project_id, prefix) values ('zzf1-r2', 'ZZFRB');
      execute 'set constraints ' || c_trg || ' immediate';
      delete from public.project_register_settings where project_id = 'zzf1-r2';
      raise exception 'GERI_AL';
    exception when others then e := sqlerrm; end;
    execute 'set constraints ' || c_trg || ' deferred';
    if e <> 'validation' then raise exception 'R2 kodu silme: validation beklendi, gelen: %', e; end if;

    -- R3 · kodlu projeyi silme (kod CASCADE ile gider) → hata yok
    begin
      insert into public.projects (id, name) values ('zzf1-r3', 'F1 doğrulama R3');
      insert into public.project_register_settings (project_id, prefix) values ('zzf1-r3', 'ZZFRC');
      execute 'set constraints ' || c_trg || ' immediate';
      delete from public.projects where id = 'zzf1-r3';
      raise exception 'GERI_AL';
    exception when others then e := sqlerrm; end;
    execute 'set constraints ' || c_trg || ' deferred';
    if e <> 'GERI_AL' then raise exception 'R3 kodlu projeyi silme: hata beklenmiyordu, gelen: %', e; end if;

    -- R4 · kodlu projenin adını güncelleme → hata yok
    begin
      insert into public.projects (id, name) values ('zzf1-r4', 'F1 doğrulama R4');
      insert into public.project_register_settings (project_id, prefix) values ('zzf1-r4', 'ZZFRD');
      execute 'set constraints ' || c_trg || ' immediate';
      update public.projects set name = 'F1 doğrulama R4 (yeni ad)' where id = 'zzf1-r4';
      raise exception 'GERI_AL';
    exception when others then e := sqlerrm; end;
    execute 'set constraints ' || c_trg || ' deferred';
    if e <> 'GERI_AL' then raise exception 'R4 ad güncelleme: hata beklenmiyordu, gelen: %', e; end if;

    -- R5 · mevcut gerçek bir projenin adını aynı değerle güncelleme (trigger yalnızca INSERT'te) → hata yok
    begin
      update public.projects set name = name where id = (select id from public.projects order by id limit 1);
      execute 'set constraints ' || c_trg || ' immediate';
      raise exception 'GERI_AL';
    exception when others then e := sqlerrm; end;
    execute 'set constraints ' || c_trg || ' deferred';
    if e <> 'GERI_AL' then raise exception 'R5 mevcut proje güncelleme: hata beklenmiyordu, gelen: %', e; end if;

    if exists (select 1 from public.projects where id like 'zzf1-r%') then raise exception 'regresyon test projesi kaldı'; end if;
    checks := checks + 1;
  end if;

  -- 5 · Adım 3: Activity ID (Karar 18, 30, 37-43)
  aid := to_regclass('public.task_disciplines') is not null
         and to_regprocedure('public.assign_activity_ids(uuid[],boolean)') is not null;
  if aid then
    select id into u_admin from public.profiles where role_key = 'admin' order by id limit 1;
    select id into u_pm from public.profiles where role_key = 'proje_yoneticisi' order by id limit 1;
    if u_admin is null or u_pm is null then raise exception 'admin/proje_yoneticisi profili bulunamadı'; end if;

    create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
    begin
      reset role;
      perform set_config('request.jwt.claims',
        case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
      if p_uid is not null then set local role authenticated; end if;
    end $f$;
    -- Test projesi: kod (isteğe bağlı), W1 ↔ A1 bağı, iki görev (general, A1, W1); R-1 daha erken başlar.
    -- Görev kategorisi panel_montaji: yeni projeye trg_seed_default_category_weights 10 kategorilik varsayılan ağırlık
    -- yazar (panel_montaji %20, 'mekanik' listede yok) — ağırlıksız kategori seçilirse R15 iptal filtresini ölçemez.
    create or replace function pg_temp.f1_aid_fx(p_id text, p_prefix text) returns uuid[] language plpgsql as $f$
    declare w uuid; a uuid; t1 uuid; t2 uuid;
    begin
      insert into public.projects (id, name) values (p_id, 'F1 doğrulama ' || p_id);
      if p_prefix is not null then
        insert into public.project_register_settings (project_id, prefix) values (p_id, p_prefix);
      end if;
      insert into public.project_wbs (project_id, wbs_code, name) values (p_id, 'W1', 'W1') returning id into w;
      insert into public.project_areas (project_id, area_code, name) values (p_id, 'A1', 'A1') returning id into a;
      insert into public.area_wbs (project_id, area_id, wbs_id) values (p_id, a, w);
      insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, discipline, area_id, wbs_id)
      values (p_id, 'R-1', 'R görev 1', 'panel_montaji', current_date - 20, current_date + 20, 'general', a, w) returning id into t1;
      insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, discipline, area_id, wbs_id)
      values (p_id, 'R-2', 'R görev 2', 'panel_montaji', current_date - 10, current_date + 20, 'general', a, w) returning id into t2;
      return array[t1, t2];
    end $f$;

    -- Katalog: sözlük (R13), yetkiler
    select string_agg(discipline || '=' || id_code, ',' order by sort_order) into e from public.task_disciplines;
    if e is distinct from 'mechanical=MEC,dc=DC,ac=AC,mv=MV,hv=HV,enh=EIH,civil=CIV,scada=SCA,general=GEN' then
      raise exception 'R13 disiplin sözlüğü beklenen değil: %', e;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'project_tasks_discipline_fk') then
      raise exception 'R13 project_tasks.discipline FK yok';
    end if;
    foreach f in array array['public.assign_activity_ids(uuid[],boolean)', 'public.assign_activity_id(uuid,boolean)',
                             'public.admin_correct_task_activity_id(uuid,text,text,text,uuid)'] loop
      if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
        raise exception '% yetkileri yanlış', f;
      end if;
    end loop;
    foreach f in array array['public.assign_activity_ids(uuid[],boolean)', 'public.admin_correct_task_activity_id(uuid,text,text,text,uuid)',
                             'public.fn_project_tasks_delete_guard()', 'public.fn_project_tasks_wbs_audit()'] loop
      if not (select prosecdef and coalesce(proconfig::text, '') like '%search_path=public%' from pg_proc where oid = f::regprocedure) then
        raise exception '% DEFINER/search_path değil', f;
      end if;
    end loop;
    foreach f in array array['public.fn_project_tasks_delete_guard()', 'public.fn_project_tasks_wbs_audit()',
                             'public.fn_progress_daily_cancelled_guard()', 'public.fn_project_tasks_reopen_guard()'] loop
      if has_function_privilege('authenticated', f, 'EXECUTE') then raise exception '% dışarıya açık', f; end if;
    end loop;
    -- A8 · iptal görev koruması trigger'ları
    if (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_progress_daily_cancelled_guard', 'trg_project_tasks_reopen_guard')) <> 2 then
      raise exception 'R15b iptal görev koruması trigger''ları eksik';
    end if;
    if has_table_privilege('authenticated', 'public.activity_id_counters', 'SELECT')
       or has_table_privilege('authenticated', 'public.activity_id_counters', 'UPDATE')
       or has_table_privilege('authenticated', 'public.task_disciplines', 'INSERT') then
      raise exception 'sayaç/sözlük tablo yetkileri yanlış';
    end if;
    checks := checks + 1;

    -- R12 · Ç16 bayrağını yalnızca beklenen fonksiyonlar kullanır; set_config'e değişken ad veren fonksiyon yok
    select string_agg(proname, ',' order by proname) into e from pg_proc
     where pronamespace = 'public'::regnamespace and prosrc like '%fons.activity_id_%';
    if e is distinct from 'admin_correct_task_activity_id,assign_activity_ids,fn_project_tasks_identity_guard' then
      raise exception 'R12 fons.activity_id_* kullanan fonksiyonlar beklenen değil: %', e;
    end if;
    select string_agg(proname, ',') into e from pg_proc
     where pronamespace = 'public'::regnamespace and prosrc ~* 'set_config\s*\(\s*[^''[:space:]]';
    if e is not null then raise exception 'R12 set_config''e değişken ayar adı veren fonksiyon: %', e; end if;

    -- R6 · Activity ID dolu INSERT reddedilir (postgres bağlamında, bayraksız)
    begin
      t := pg_temp.f1_aid_fx('zzf1-a6', 'ZZFA');
      begin
        insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, activity_id)
        values ('zzf1-a6', 'R-6', 'R6', 'mekanik', current_date, current_date, 'ZZFA-GEN-A1-0010');
        e := 'BASARILI';
      exception when others then e := sqlerrm; end;
      raise exception 'GERI_AL:%', e;
    exception when others then e := sqlerrm; end;
    if e not like 'GERI_AL:Activity ID doğrudan yazılamaz%' then raise exception 'R6 dolu INSERT: %', e; end if;

    -- R7 · authenticated, bayrağı taklit etse bile boş → değer yazamaz
    begin
      t := pg_temp.f1_aid_fx('zzf1-a7', 'ZZFB');
      perform pg_temp.as_user(u_admin);
      perform set_config('fons.activity_id_assign', 'on', true);
      perform set_config('fons.activity_id_fix', 'on', true);
      begin
        update public.project_tasks set activity_id = 'ZZFB-GEN-A1-0010' where id = t[1];
        e := 'BASARILI';
      exception when others then e := sqlerrm; end;
      perform pg_temp.as_user(null);
      raise exception 'GERI_AL:%', e;
    exception when others then e := sqlerrm; end;
    perform pg_temp.as_user(null);
    if e not like 'GERI_AL:Activity ID doğrudan yazılamaz%' then raise exception 'R7 taklit bayrak: %', e; end if;

    -- R9 + R8 · gerçek atama biçimi/artışı; atanmış ID değiştirilemez, NULL'a çekilemez
    begin
      t := pg_temp.f1_aid_fx('zzf1-a8', 'ZZFC');
      perform pg_temp.as_user(u_admin);
      j := public.assign_activity_ids(array[t[2], t[1]], false);
      perform pg_temp.as_user(null);
      e := (select string_agg(activity_id, ',' order by task_code) from public.project_tasks where id = any(t));
      begin
        update public.project_tasks set activity_id = 'ZZFC-GEN-A1-0090' where id = t[1];
        f := 'BASARILI';
      exception when others then f := sqlerrm; end;
      e := e || '|' || f;
      begin
        update public.project_tasks set activity_id = null where id = t[1];
        f := 'BASARILI';
      exception when others then f := sqlerrm; end;
      raise exception 'GERI_AL:%|%', e, f;
    exception when others then e := sqlerrm; end;
    perform pg_temp.as_user(null);
    if e not like 'GERI_AL:ZZFC-GEN-A1-0010,ZZFC-GEN-A1-0020|Atanmış Activity ID değiştirilemez%|Atanmış Activity ID değiştirilemez%' then
      raise exception 'R8/R9 atama ve değiştirme: %', e;
    end if;

    -- R10 · kodsuz projede atama → project_code_missing (önizlemede hata olarak döner)
    begin
      t := pg_temp.f1_aid_fx('zzf1-a10', null);
      perform pg_temp.as_user(u_admin);
      j := public.assign_activity_ids(array[t[1]], true);
      perform pg_temp.as_user(null);
      raise exception 'GERI_AL:%', j -> 'items' -> 0 -> 'errors' -> 0 ->> 'code';
    exception when others then e := sqlerrm; end;
    perform pg_temp.as_user(null);
    if e <> 'GERI_AL:project_code_missing' then raise exception 'R10 kodsuz proje: %', e; end if;

    -- R11 · tireli alan kodu reddedilir (Activity ID ayrıştırması tiresiz alan koduna dayanır)
    begin
      t := pg_temp.f1_aid_fx('zzf1-a11', 'ZZFD');
      begin
        insert into public.project_areas (project_id, area_code, name) values ('zzf1-a11', 'A-1', 'tireli');
        e := 'BASARILI';
      exception when others then get stacked diagnostics e = constraint_name; end;
      raise exception 'GERI_AL:%', e;
    exception when others then e := sqlerrm; end;
    if e <> 'GERI_AL:project_areas_code_format' then raise exception 'R11 tireli alan kodu: %', e; end if;

    -- R14 · ID'li görevde disiplin ve alan kilitli; WBS değişikliği serbest ve audit'e yazılır
    begin
      t := pg_temp.f1_aid_fx('zzf1-a14', 'ZZFE');
      perform pg_temp.as_user(u_admin);
      j := public.assign_activity_ids(array[t[1]], false);
      perform pg_temp.as_user(null);
      begin update public.project_tasks set discipline = 'mechanical' where id = t[1]; e := 'BASARILI';
      exception when others then e := sqlerrm; end;
      insert into public.project_areas (project_id, area_code, name) values ('zzf1-a14', 'B2', 'B2');
      begin update public.project_tasks set area_id = (select id from public.project_areas where project_id = 'zzf1-a14' and area_code = 'B2') where id = t[1];
        f := 'BASARILI';
      exception when others then f := sqlerrm; end;
      e := left(e, 70) || '|' || left(f, 70);
      insert into public.project_wbs (project_id, wbs_code, name) values ('zzf1-a14', 'W2', 'W2');
      update public.project_tasks set wbs_id = (select id from public.project_wbs where project_id = 'zzf1-a14' and wbs_code = 'W2') where id = t[1];
      select count(*) into n from public.register_audit where table_name = 'project_tasks' and record_id = t[1] and changed_fields ? 'wbs_id';
      raise exception 'GERI_AL:%|wbs_audit=%', e, n;
    exception when others then e := sqlerrm; end;
    perform pg_temp.as_user(null);
    if e not like 'GERI_AL:Activity ID atanmış görevin disiplini ve alanı değiştirilemez%|Activity ID atanmış görevin disiplini ve alanı değiştirilemez%|wbs_audit=1' then
      raise exception 'R14 kilit/audit: %', e;
    end if;

    -- R15 · iptal: ID'li görev silinemez, iptal edilir; iptal görev proje ilerlemesini değiştirmez; proje silme zinciri çalışır.
    -- Beklenen ilerleme 10 = panel_montaji ağırlığı %20 × ortalama %50 (iptal R-2 hariç). İptal filtresi olmasa ortalama
    -- %25 olur ve sonuç 5 çıkar.
    begin
      t := pg_temp.f1_aid_fx('zzf1-a15', 'ZZFF');
      perform pg_temp.as_user(u_admin);
      j := public.assign_activity_ids(array[t[1], t[2]], false);
      perform pg_temp.as_user(null);
      begin delete from public.project_tasks where id = t[2]; e := 'BASARILI';
      exception when others then e := sqlerrm; end;
      e := case when e like 'Activity ID atanmış görev silinemez (ZZFF-GEN-A1-0020)%' then 'silinemez' else e end;
      update public.project_tasks set status = 'iptal' where id = t[2];
      update public.project_tasks set progress_pct = 50 where id = t[1];
      e := e || '|progress=' || (select progress from public.projects where id = 'zzf1-a15');
      begin delete from public.projects where id = 'zzf1-a15'; f := 'proje_silindi';
      exception when others then f := sqlerrm; end;
      raise exception 'GERI_AL:%|%', e, f;
    exception when others then e := sqlerrm; end;
    perform pg_temp.as_user(null);
    if e <> 'GERI_AL:silinemez|progress=10|proje_silindi' then
      raise exception 'R15 iptal/silme: %', e;
    end if;

    -- R16 · genişletilmiş B4: yalnızca admin, gerekçe zorunlu, yeni ID görevin disiplin/alanıyla uyumlu, audit
    begin
      t := pg_temp.f1_aid_fx('zzf1-a16', 'ZZFG');
      perform pg_temp.as_user(u_admin);
      j := public.assign_activity_ids(array[t[1]], false);
      perform pg_temp.as_user(u_pm);
      begin perform public.admin_correct_task_activity_id(t[1], 'ZZFG-MEC-A1-0010', 'neden', 'mechanical'); e := 'BASARILI';
      exception when others then e := sqlerrm; end;
      perform pg_temp.as_user(u_admin);
      begin perform public.admin_correct_task_activity_id(t[1], 'ZZFG-MEC-A1-0010', '', 'mechanical'); f := 'BASARILI';
      exception when others then f := sqlerrm; end;
      e := e || '|' || f;
      begin perform public.admin_correct_task_activity_id(t[1], 'ZZFG-MEC-A1-0010', 'neden'); f := 'BASARILI';
      exception when others then f := sqlerrm; end;
      e := e || '|' || f;
      j := public.admin_correct_task_activity_id(t[1], 'ZZFG-MEC-A1-0010', 'disiplin yanlış girilmiş', 'mechanical');
      perform pg_temp.as_user(null);
      e := e || '|' || (select activity_id || '/' || discipline from public.project_tasks where id = t[1]);
      select count(*) into n from public.register_audit where table_name = 'project_tasks' and record_id = t[1]
        and reason = 'disiplin yanlış girilmiş' and changed_fields ? 'activity_id' and changed_fields ? 'discipline';
      raise exception 'GERI_AL:%|audit=%', e, n;
    exception when others then e := sqlerrm; end;
    perform pg_temp.as_user(null);
    if e <> 'GERI_AL:forbidden|validation|validation|ZZFG-MEC-A1-0010/mechanical|audit=1' then
      raise exception 'R16 genişletilmiş B4: %', e;
    end if;

    if exists (select 1 from public.projects where id like 'zzf1-a%') then raise exception 'AID test projesi kaldı'; end if;
    checks := checks + 1;
  end if;

  -- [ADIM4-BASLA]
  -- 6 · Adım 4 (f1_wbs_alan_import.sql): R17-R26. Geçici proje zzf1-w4 tek alt işlemde kurulur, 'GERI_AL:' ile geri alınır.
  if to_regprocedure('public.import_wbs_areas(text,jsonb,boolean)') is not null then
    declare
      u4a uuid; u4s uuid; pl4 jsonb; j4 jsonb; s4 text; x4 text; t4a uuid; t4b uuid;
    begin
      -- R17 · katalog
      if not exists (select 1 from pg_proc where oid = 'public.import_wbs_areas(text,jsonb,boolean)'::regprocedure
                     and prosecdef and coalesce(proconfig::text, '') like '%search_path=public%') then
        raise exception 'R17 import_wbs_areas DEFINER/search_path değil';
      end if;
      if has_function_privilege('anon', 'public.import_wbs_areas(text,jsonb,boolean)', 'EXECUTE')
         or not has_function_privilege('authenticated', 'public.import_wbs_areas(text,jsonb,boolean)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.fn_aid_area_wbs_violations(uuid,uuid)', 'EXECUTE')
         or has_function_privilege('authenticated', 'public.fn_wbs_subtree_activity_ids(uuid)', 'EXECUTE') then
        raise exception 'R17 import/yardımcı fonksiyon yetkileri beklenen değil';
      end if;
      select count(*) into n from pg_trigger where not tgisinternal and tgname in ('trg_project_wbs_audit', 'trg_project_areas_audit',
        'trg_area_wbs_audit', 'trg_area_wbs_aid_guard', 'trg_project_wbs_level_cascade', 'trg_project_wbs_delete_guard',
        'trg_project_areas_delete_guard');
      if n <> 7 then raise exception 'R17 Adım 4 trigger''ları eksik: %/7', n; end if;
      if not exists (select 1 from pg_constraint where conname = 'project_wbs_discipline_fk') then
        raise exception 'R17 project_wbs_discipline_fk yok';
      end if;
      if exists (select 1 from pg_proc where proname in ('fn_project_wbs_guard', 'fn_project_areas_guard') and not prosecdef) then
        raise exception 'R17 WBS/alan guard''ları DEFINER değil';
      end if;

      select id into u4a from public.profiles where role_key = 'admin' order by id limit 1;
      select id into u4s from public.profiles where role_key = 'santiye_sefi' order by id limit 1;
      create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
      begin
        reset role;
        perform set_config('request.jwt.claims',
          case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
        if p_uid is not null then set local role authenticated; end if;
      end $f$;
      create or replace function pg_temp.f4_try(p_uid uuid, p_sql text) returns text language plpgsql as $f$
      declare res text; k bigint;
      begin
        perform pg_temp.as_user(p_uid);
        begin execute p_sql; get diagnostics k = row_count; res := 'OK(' || k || ')';
        exception when others then res := sqlerrm; end;
        perform pg_temp.as_user(null);
        return case
          when res like 'Kullanımdaki%' then 'KOD'
          when res like 'Activity ID''li görevin%pasifleştirilemez%' then 'PAS'
          when res like 'Activity ID''li görevin%taşınamaz%' then 'TAS'
          when res like 'Activity ID''li görevin%silinemez%' then 'SIL'
          when res like 'Alan-WBS bağı eklenemez%' then 'EKL'
          when res like 'Alan-WBS bağı kaldırılamaz%' then 'CIK'
          when res like 'Aktif alt%' then 'ALT'
          else res end;
      end $f$;
      create or replace function pg_temp.f4_imp(p_uid uuid, p_proj text, p_pl jsonb, p_dry boolean) returns jsonb language plpgsql as $f$
      declare res jsonb; m text; dt text;
      begin
        perform pg_temp.as_user(p_uid);
        begin res := public.import_wbs_areas(p_proj, p_pl, p_dry);
        exception when others then
          get stacked diagnostics m = message_text, dt = pg_exception_detail;
          res := jsonb_build_object('err', m, 'detail', case when dt ~ '^\s*\{' then dt::jsonb end);
        end;
        perform pg_temp.as_user(null);
        return res;
      end $f$;
      create or replace function pg_temp.f4_sm(rp jsonb) returns text language sql as $f$
        select case when rp ? 'err' then 'ERR:' || (rp ->> 'err') else
          'w=' || (rp #>> '{summary,wbs,insert}') || '/' || (rp #>> '{summary,wbs,update}') || '/' || (rp #>> '{summary,wbs,unchanged}')
          || '/' || (rp #>> '{summary,wbs,error}') || ' a=' || (rp #>> '{summary,areas,insert}') || '/' || (rp #>> '{summary,areas,update}')
          || '/' || (rp #>> '{summary,areas,unchanged}') || '/' || (rp #>> '{summary,areas,error}') || ' l=' || (rp #>> '{summary,links,insert}')
          || '/' || (rp #>> '{summary,links,unchanged}') || '/' || (rp #>> '{summary,links,error}')
          || ' err=' || (rp #>> '{summary,error_count}') || ' aid=' || (rp #>> '{summary,aid_impact_count}') end $f$;
      create or replace function pg_temp.f4_list(rp jsonb, p_key text) returns text language sql as $f$
        select coalesce(string_agg((x.v ->> 'sheet') || ':' || coalesce(x.v ->> 'row', '-') || ':' || coalesce(x.v ->> 'code', x.v ->> 'activity_id'),
                                   ',' order by x.o), '-')
          from jsonb_array_elements(coalesce(rp -> p_key, rp #> array['detail', p_key], '[]')) with ordinality as x(v, o) $f$;

      begin
        insert into public.projects (id, name) values ('zzf1-w4', 'F1 doğrulama Adım 4');
        insert into public.project_register_settings (project_id, prefix) values ('zzf1-w4', 'ZZW');
        pl4 := '{"file_name":"r.xlsx","wbs":[{"row":4,"code":"W1","name":"W1"},{"row":5,"code":"W11","name":"W11","parent_code":"W1"},
          {"row":6,"code":"W2","name":"W2"},{"row":7,"code":"W3","name":"W3"},{"row":8,"code":"W4","name":"W4"},
          {"row":9,"code":"W41","name":"W41","parent_code":"W4"},{"row":10,"code":"W411","name":"W411","parent_code":"W41"}],
          "areas":[{"row":4,"code":"A1","name":"A1"},{"row":5,"code":"A11","name":"A11","parent_code":"A1"},{"row":6,"code":"A2","name":"A2"}],
          "links":[{"row":4,"area_code":"A1","wbs_code":"W11"}]}';
        -- R18 önizleme yazmaz
        j4 := pg_temp.f4_imp(u4a, 'zzf1-w4', pl4, true);
        s4 := 'R18=' || pg_temp.f4_sm(j4) || '/' || (select count(*) from public.project_wbs where project_wbs.project_id = 'zzf1-w4');
        -- R19 gerçek import + tekrar = değişmeyecek
        j4 := pg_temp.f4_imp(u4a, 'zzf1-w4', pl4, false);
        x4 := pg_temp.f4_sm(j4);
        j4 := pg_temp.f4_imp(u4a, 'zzf1-w4', pl4, false);
        s4 := s4 || ';R19=' || x4 || '|' || pg_temp.f4_sm(j4) || '|'
          || (select count(*) from public.project_wbs where project_wbs.project_id = 'zzf1-w4') || '/'
          || (select count(*) from public.project_areas where project_areas.project_id = 'zzf1-w4') || '/'
          || (select count(*) from public.area_wbs where area_wbs.project_id = 'zzf1-w4') || '|'
          || (select count(*) from public.register_audit where register_audit.project_id = 'zzf1-w4');
        -- İki ID'li görev: (A1, W11) ve (A2, W2)
        insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, discipline, area_id, wbs_id)
        select 'zzf1-w4', 'R4-1', 'R4 görev 1', 'panel_montaji', current_date, current_date + 20, 'general', pa.id, pw.id
          from public.project_areas pa, public.project_wbs pw
         where pa.project_id = 'zzf1-w4' and pa.area_code = 'A1' and pw.project_id = 'zzf1-w4' and pw.wbs_code = 'W11'
        returning id into t4a;
        insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, discipline, area_id, wbs_id)
        select 'zzf1-w4', 'R4-2', 'R4 görev 2', 'panel_montaji', current_date, current_date + 20, 'general', pa.id, pw.id
          from public.project_areas pa, public.project_wbs pw
         where pa.project_id = 'zzf1-w4' and pa.area_code = 'A2' and pw.project_id = 'zzf1-w4' and pw.wbs_code = 'W2'
        returning id into t4b;
        perform pg_temp.as_user(u4a);
        j4 := public.assign_activity_ids(array[t4a, t4b], false);
        perform pg_temp.as_user(null);
        s4 := s4 || ';ID=' || (select string_agg(activity_id, ',' order by activity_id) from public.project_tasks where project_tasks.id in (t4a, t4b));
        -- R20 dosyada olmayan kayıt silinmez
        j4 := pg_temp.f4_imp(u4a, 'zzf1-w4', jsonb_set(pl4, '{wbs}', (pl4 -> 'wbs') - 3), false);
        s4 := s4 || ';R20=' || pg_temp.f4_sm(j4) || '|' || (j4 #>> '{not_in_file,wbs}') || '|'
          || (select count(*) from public.project_wbs where project_wbs.project_id = 'zzf1-w4' and wbs_code = 'W3');
        -- R21 ID'li görevin alanını pasifleştirme: import'ta aid_impact, doğrudan yazmada trigger
        j4 := pg_temp.f4_imp(u4a, 'zzf1-w4', jsonb_set(jsonb_set(pl4, '{areas,0,active}', 'false'), '{areas,1,active}', 'false'), true);
        x4 := pg_temp.f4_try(u4a, 'update public.project_areas set is_active = false where project_id = ''zzf1-w4'' and area_code = ''A1''');
        s4 := s4 || ';R21=' || pg_temp.f4_sm(j4) || '|' || pg_temp.f4_list(j4, 'aid_impact') || '|' || x4;
        -- R22 şantiye şefi import edemez
        j4 := pg_temp.f4_imp(u4s, 'zzf1-w4', pl4, true);
        s4 := s4 || ';R22=' || pg_temp.f4_sm(j4);
        -- R23 döngü ve olmayan üst kod, sayfa + satırla (projesiz mod)
        j4 := pg_temp.f4_imp(u4a, null, '{"wbs":[{"row":4,"code":"X1","name":"x","parent_code":"X2"},{"row":5,"code":"X2","name":"x","parent_code":"X1"},
          {"row":6,"code":"X3","name":"x","parent_code":"X9"}]}', true);
        s4 := s4 || ';R23=' || pg_temp.f4_list(j4, 'errors');
        -- R24 doğrudan yazma: ID'li görevi etkileyen değişiklikler reddedilir (admin)
        x4 := pg_temp.f4_try(u4a, 'update public.project_areas set area_code = ''A1X'' where project_id = ''zzf1-w4'' and area_code = ''A1''');
        s4 := s4 || ';R24=' || x4;
        x4 := pg_temp.f4_try(u4a, 'update public.project_wbs set parent_id = (select w.id from public.project_wbs w where w.project_id = ''zzf1-w4'' and w.wbs_code = ''W2'') where project_id = ''zzf1-w4'' and wbs_code = ''W11''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'insert into public.area_wbs (project_id, area_id, wbs_id) select ''zzf1-w4'', a.id, w.id from public.project_areas a, public.project_wbs w where a.project_id = ''zzf1-w4'' and a.area_code = ''A1'' and w.project_id = ''zzf1-w4'' and w.wbs_code = ''W2''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'delete from public.area_wbs where project_id = ''zzf1-w4''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'delete from public.project_areas where project_id = ''zzf1-w4'' and area_code = ''A2''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'delete from public.project_wbs where project_id = ''zzf1-w4'' and wbs_code = ''W11''');
        s4 := s4 || '|' || x4;
        -- R25 aynı işlemler ID'siz kayıtlarda geçer (admin)
        x4 := pg_temp.f4_try(u4a, 'update public.project_areas set area_code = ''A12'' where project_id = ''zzf1-w4'' and area_code = ''A11''');
        s4 := s4 || ';R25=' || x4;
        x4 := pg_temp.f4_try(u4a, 'update public.project_wbs set wbs_code = ''W30'' where project_id = ''zzf1-w4'' and wbs_code = ''W3''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'update public.project_wbs set is_active = false where project_id = ''zzf1-w4'' and wbs_code = ''W30''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'insert into public.area_wbs (project_id, area_id, wbs_id) select ''zzf1-w4'', a.id, w.id from public.project_areas a, public.project_wbs w where a.project_id = ''zzf1-w4'' and a.area_code = ''A2'' and w.project_id = ''zzf1-w4'' and w.wbs_code = ''W30''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'delete from public.area_wbs where project_id = ''zzf1-w4'' and wbs_id = (select w.id from public.project_wbs w where w.project_id = ''zzf1-w4'' and w.wbs_code = ''W30'')');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'update public.project_wbs set parent_id = (select w.id from public.project_wbs w where w.project_id = ''zzf1-w4'' and w.wbs_code = ''W1'') where project_id = ''zzf1-w4'' and wbs_code = ''W30''');
        s4 := s4 || '|' || x4;
        x4 := pg_temp.f4_try(u4a, 'delete from public.project_areas where project_id = ''zzf1-w4'' and area_code = ''A12''');
        s4 := s4 || '|' || x4;
        -- R26 Ç-7: aktif alt kaydı olan üst pasifleştirilemez; taşınan WBS'in altlarının level'ı; proje silme zinciri
        x4 := pg_temp.f4_try(u4a, 'update public.project_wbs set is_active = false where project_id = ''zzf1-w4'' and wbs_code = ''W4''');
        s4 := s4 || ';R26=' || x4 || '|' || (select string_agg(level::text, '' order by wbs_code) from public.project_wbs
                                               where project_wbs.project_id = 'zzf1-w4' and wbs_code in ('W41', 'W411'));
        x4 := pg_temp.f4_try(u4a, 'update public.project_wbs set parent_id = null where project_id = ''zzf1-w4'' and wbs_code = ''W41''');
        s4 := s4 || '|' || x4 || '|' || (select string_agg(level::text, '' order by wbs_code) from public.project_wbs
                                           where project_wbs.project_id = 'zzf1-w4' and wbs_code in ('W41', 'W411'));
        delete from public.projects where id = 'zzf1-w4';
        s4 := s4 || '|del=' || (select count(*) from public.projects where id = 'zzf1-w4')
          || '/' || (select count(*) from public.project_wbs where project_wbs.project_id = 'zzf1-w4');
        raise exception 'GERI_AL:%', s4;
      exception when others then s4 := sqlerrm; end;
      perform pg_temp.as_user(null);
      if s4 <> 'GERI_AL:R18=w=7/0/0/0 a=3/0/0/0 l=1/0/0 err=0 aid=0/0'
              || ';R19=w=7/0/0/0 a=3/0/0/0 l=1/0/0 err=0 aid=0|w=0/0/7/0 a=0/0/3/0 l=0/1/0 err=0 aid=0|7/3/1|11'
              || ';ID=ZZW-GEN-A1-0010,ZZW-GEN-A2-0010'
              || ';R20=w=0/0/6/0 a=0/0/3/0 l=0/1/0 err=0 aid=0|["W3"]|1'
              || ';R21=w=0/0/7/0 a=0/2/1/0 l=0/1/0 err=0 aid=1|Alanlar:4:ZZW-GEN-A1-0010|PAS'
              || ';R22=ERR:forbidden'
              || ';R23=WBS:4:cycle,WBS:5:cycle,WBS:6:parent_missing'
              || ';R24=KOD|TAS|EKL|CIK|SIL|SIL'
              || ';R25=OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)'
              || ';R26=ALT|23|OK(1)|12|del=0/0' then
        raise exception 'R18-R26 Adım 4: %', s4;
      end if;
      if exists (select 1 from public.projects where id like 'zzf1-w%') then raise exception 'Adım 4 test projesi kaldı'; end if;
      checks := checks + 1;
    end;
  end if;
  -- [ADIM4-BITIR]

  raise exception 'DOGRULAMA SONUCU: OK | F1 | % kontrol grubu | % | % | %', checks,
    case when a4 then 'A4 var, R1-R5 regresyon geçti' else 'A4 yok (ayrı migration, Karar 34) — R1-R5 atlandı' end,
    case when aid then 'AID var, R6-R16 geçti' else 'AID yok (Adım 3 ayrı migration, Karar 42) — R6-R16 atlandı' end,
    case when to_regprocedure('public.import_wbs_areas(text,jsonb,boolean)') is not null then 'Adım 4 var, R17-R26 geçti'
         else 'Adım 4 yok — R17-R26 atlandı' end;
end $$;
