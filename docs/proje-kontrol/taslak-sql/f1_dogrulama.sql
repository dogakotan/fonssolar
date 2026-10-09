-- F1 doğrulama. Uygulama sonrası (ve Adım 6'da canlıda) çalıştırılır. Hata yoksa son satır
-- 'DOGRULAMA SONUCU: OK' fırlatır; blok her durumda hatayla biter → yaptığı her şey geri alınır.
-- Regresyon testleri (R1-R5) kuralı fiilen tetikler. Her biri kendi alt işleminde çalışır ve sonunda kasıtlı
-- 'GERI_AL' hatasıyla geri alınır; geçici test projeleri (zzf1-*) hiçbir durumda kalıcı olmaz.
-- A4 (kodsuz projeyi reddeden kural) ayrı migration'dır (Karar 34): trigger'lar yoksa A4 kontrolleri atlanır
-- ve sonuç satırında "A4 yok" yazar.
-- Postgres (tablo sahibi) bağlamında çalıştırılmalıdır (RLS'i aşması gerekir).
do $$
declare
  n int; checks int := 0; e text; a4 boolean;
  c_trg constant text := 'public.trg_projects_require_code, public.trg_project_register_settings_keep_code';
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

  raise exception 'DOGRULAMA SONUCU: OK | F1 | % kontrol grubu | %', checks,
    case when a4 then 'A4 var, R1-R5 regresyon geçti' else 'A4 yok (ayrı migration, Karar 34) — R1-R5 atlandı' end;
end $$;
