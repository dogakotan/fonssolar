-- F1 doğrulama (salt okunur; uygulama sonrası çalıştırılır). Hata yoksa son satır 'DOGRULAMA SONUCU: OK' fırlatır.
do $$
declare n int; checks int := 0;
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

  -- 3 · Fonksiyon güvenliği
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
  if has_function_privilege('authenticated', 'public.fn_require_project_code()', 'EXECUTE') then
    raise exception 'trigger fonksiyonu authenticated''a açık';
  end if;
  checks := checks + 1;

  -- 4 · Ertelenmiş constraint trigger'lar
  select count(*) into n from pg_trigger
   where tgname in ('trg_projects_require_code', 'trg_project_register_settings_keep_code')
     and tgconstraint <> 0 and tgdeferrable and tginitdeferred;
  if n <> 2 then raise exception 'ertelenmiş trigger sayısı 2 değil: %', n; end if;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | F1 | % kontrol grubu', checks;
end $$;
