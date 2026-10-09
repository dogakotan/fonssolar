-- ============================================================================
-- B4 DOĞRULAMA — kendini geri alan tek DO bloğu (TASLAK) · 07.10.2026
-- Ön koşul: B1 + B2 + B4. Test projesindeki bir görevin activity_id'si geçici olarak doldurulur; sonda geri alınır.
-- ============================================================================
do $$
declare
  p constant text := 'test-izmir-ges-2026';
  u_admin uuid; u_pm uuid;
  t uuid;
  j jsonb;
  n int;
  checks int := 0;
begin
  reset role;
  create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    reset role;
    perform set_config('request.jwt.claims',
      case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    if p_uid is not null then set local role authenticated; end if;
  end $f$;
  create or replace function pg_temp.expect_err(p_sql text, p_code text) returns text language plpgsql as $f$
  declare e text; ok boolean := false;
  begin
    begin execute p_sql; exception when others then ok := true; e := sqlerrm; end;
    if not ok then raise exception 'BEKLENMEDIK BASARI: %', p_sql; end if;
    if p_code is not null and e not like p_code then
      raise exception 'BEKLENMEDIK HATA (% beklendi): % | %', p_code, e, p_sql;
    end if;
    return e;
  end $f$;

  select id into u_admin from public.profiles where role_key = 'admin' order by id limit 1;
  select id into u_pm from public.profiles where role_key = 'proje_yoneticisi' order by id limit 1;

  -- ── 1. Katalog ──
  if not (select prosecdef from pg_proc where oid = 'public.admin_correct_task_activity_id(uuid,text,text)'::regprocedure) then
    raise exception 'düzeltme RPC''si DEFINER değil';
  end if;
  if has_function_privilege('anon', 'public.admin_correct_task_activity_id(uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_correct_task_activity_id(uuid,text,text)', 'EXECUTE') then
    raise exception 'düzeltme RPC''si yetkileri yanlış';
  end if;
  checks := checks + 1;

  -- ── 2. Hazırlık: boş bir görevin activity_id'si ilk kez atanır (NULL → değer guard'a takılmaz) ──
  select id into t from public.project_tasks where project_id = p and activity_id is null order by id limit 1;
  if t is null then raise exception 'test görevi bulunamadı'; end if;
  update public.project_tasks set activity_id = 'B4-TEST-001' where id = t;

  -- ── 3. Guard hâlâ doğrudan değişikliği reddediyor (bayrak açık olsa bile authenticated için) ──
  perform pg_temp.as_user(u_admin);
  perform pg_temp.expect_err(format('update public.project_tasks set activity_id = %L where id = %L', 'B4-TEST-002', t), 'Atanmış Activity ID değiştirilemez%');
  perform set_config('fons.activity_id_fix', 'on', true);
  perform pg_temp.expect_err(format('update public.project_tasks set activity_id = %L where id = %L', 'B4-TEST-002', t), 'Atanmış Activity ID değiştirilemez%');
  perform set_config('fons.activity_id_fix', 'off', true);
  perform pg_temp.expect_err(format('update public.project_tasks set activity_id = null where id = %L', t), 'Atanmış Activity ID değiştirilemez%');
  checks := checks + 1;

  -- ── 4. RPC ──
  perform pg_temp.as_user(u_pm);
  perform pg_temp.expect_err(format('select public.admin_correct_task_activity_id(%L, %L, %L)', t, 'B4-TEST-002', 'neden'), 'forbidden');
  perform pg_temp.as_user(u_admin);
  perform pg_temp.expect_err(format('select public.admin_correct_task_activity_id(%L, %L, %L)', t, 'B4-TEST-002', ''), 'validation');
  perform pg_temp.expect_err(format('select public.admin_correct_task_activity_id(%L, %L, %L)', t, 'kötü id!', 'neden'), 'validation');
  perform pg_temp.expect_err(format('select public.admin_correct_task_activity_id(%L, %L, %L)', gen_random_uuid(), 'B4-TEST-002', 'neden'), 'not_found');
  j := public.admin_correct_task_activity_id(t, 'B4-TEST-002', 'yanlış girilmiş');
  if (j ->> 'changed')::boolean is not true or j ->> 'old_activity_id' <> 'B4-TEST-001' then raise exception 'düzeltme olmadı: %', j; end if;
  if coalesce(current_setting('fons.activity_id_fix', true), '') = 'on' then raise exception 'bayrak açık kaldı'; end if;
  j := public.admin_correct_task_activity_id(t, 'B4-TEST-002', 'tekrar');
  if (j ->> 'changed')::boolean then raise exception 'aynı değerde değişiklik sayıldı'; end if;
  j := public.admin_correct_task_activity_id(t, null, 'temizle');
  reset role;
  if (select activity_id from public.project_tasks where id = t) is not null then raise exception 'NULL''a dönüş olmadı'; end if;
  select count(*) into n from public.register_audit where table_name = 'project_tasks' and record_id = t
    and reason in ('yanlış girilmiş', 'temizle') and changed_fields ? 'activity_id';
  if n <> 2 then raise exception 'düzeltmeler audit''e yazılmadı: %', n; end if;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | B4 | % kontrol grubu | guard doğrudan değişikliği reddediyor, yalnızca admin RPC''si gerekçeyle düzeltiyor', checks;
end $$;
