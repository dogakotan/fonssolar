-- ============================================================================
-- B1 DOĞRULAMA — kendini geri alan tek DO bloğu (TASLAK) · 07.10.2026
-- Ne zaman: B1 uygulandıktan hemen sonra; ROLLBACK'li denemede B1 ile birlikte.
-- Nasıl: gerçek kullanıcılarla (request.jwt.claims + SET LOCAL ROLE authenticated) dener, sonunda bilerek
-- hata fırlatır → hiçbir şey kalıcı olmaz. Sonuç hata mesajındaki "DOGRULAMA SONUCU: OK …" satırıdır.
-- ============================================================================
do $$
declare
  p  constant text := 'test-izmir-ges-2026';
  p2 constant text := 'test-kayseri-develi-ges';
  u_admin uuid; u_pm uuid; u_ss uuid; u_muh uuid;
  j jsonb;
  n int;
  r record;
  checks int := 0;
begin
  -- ── Yardımcılar (geçici şema; transaction ile birlikte geri alınır) ──
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
  select id into u_ss from public.profiles where role_key = 'santiye_sefi' and project_id = p limit 1;
  select id into u_muh from public.profiles where role_key = 'muhasebe' order by id limit 1;
  if u_admin is null or u_pm is null or u_ss is null or u_muh is null then
    raise exception 'test kullanıcıları bulunamadı';
  end if;

  -- ── 1. Katalog ──
  for r in select c.relname, c.relrowsecurity from pg_class c
           where c.oid in ('public.register_permissions'::regclass, 'public.register_status_transitions'::regclass) loop
    if not r.relrowsecurity then raise exception '% RLS kapalı', r.relname; end if;
    if has_table_privilege('anon', 'public.' || r.relname, 'SELECT') then raise exception '% anon okuyabiliyor', r.relname; end if;
    if not has_table_privilege('authenticated', 'public.' || r.relname, 'SELECT') then raise exception '% authenticated okuyamıyor', r.relname; end if;
    if has_table_privilege('authenticated', 'public.' || r.relname, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception '% authenticated yazabiliyor', r.relname;
    end if;
    checks := checks + 1;
  end loop;

  for r in select pr.oid::regprocedure::text sig, pr.oid, pr.prosecdef, pr.proconfig from pg_proc pr
           where pr.oid in ('public.register_raise(text,text,jsonb)'::regprocedure, 'public.register_can(text,text)'::regprocedure,
                           'public.get_my_register_permissions(text)'::regprocedure,
                           'public.set_register_permission(text,text,boolean,boolean,boolean,boolean,boolean,text)'::regprocedure) loop
    if not r.prosecdef then raise exception '% SECURITY DEFINER değil', r.sig; end if;
    if not coalesce(r.proconfig::text, '') like '%search_path=public%' then raise exception '% search_path yok', r.sig; end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then raise exception '% anon çalıştırabiliyor', r.sig; end if;
    if has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (r.sig not like 'register_raise%') then
      raise exception '% authenticated EXECUTE beklenenden farklı', r.sig;
    end if;
    checks := checks + 1;
  end loop;

  select count(*) into n from public.register_permissions;
  if n <> 64 then raise exception 'seed 64 satır olmalıydı (16 tip × 4 rol): %', n; end if;
  if exists (select 1 from public.register_permissions where register_type in ('ncr','inspection') and can_view) then
    raise exception 'ayrılmış tiplerde (ncr, inspection) yetki olmamalı';
  end if;
  if exists (select 1 from public.roles ro where not exists (select 1 from public.register_permissions rp where rp.role_key = ro.key)) then
    raise exception 'seed''de olmayan rol var';
  end if;
  checks := checks + 1;

  -- Geçiş tablosundaki her durum, ilgili tablonun canlı CHECK listesinde olmalı
  for r in select t.register_type, s.st,
                  case t.register_type when 'document' then 'documents' when 'rfi' then 'rfis' when 'action' then 'project_actions'
                    when 'decision' then 'decisions' when 'submittal' then 'technical_submittals' else 'material_approvals' end as tbl
           from public.register_status_transitions t
           cross join lateral (values (t.from_status), (t.to_status)) s(st) loop
    if not exists (select 1 from pg_constraint c where c.conrelid = ('public.' || r.tbl)::regclass and c.contype = 'c'
                   and pg_get_constraintdef(c.oid) like '%status%' and pg_get_constraintdef(c.oid) like '%''' || r.st || '''%') then
      raise exception 'geçiş durumu % (%) canlı CHECK''te yok', r.st, r.register_type;
    end if;
  end loop;
  checks := checks + 1;

  -- ── 2. Davranış ──
  perform pg_temp.as_user(u_ss);
  if not public.register_can('rfi', 'create') or public.register_can('rfi', 'approve') then raise exception 'santiye rfi yetkisi yanlış'; end if;
  j := public.get_my_register_permissions(p);
  if j -> 'registers' -> 'rfi' ->> 'edit_scope' <> 'own' or (j ->> 'project_access')::boolean is not true then
    raise exception 'santiye izin haritası yanlış: %', j;
  end if;
  j := public.get_my_register_permissions(p2);
  if (j ->> 'project_access')::boolean or (j -> 'registers' -> 'rfi' ->> 'view')::boolean then
    raise exception 'erişimi olmayan projede görme izni dönüyor: %', j;
  end if;
  perform pg_temp.expect_err('select public.get_my_register_permissions(null)', 'validation');
  perform pg_temp.expect_err($q$select public.set_register_permission('santiye_sefi','rfi',true,true,true,true,true,'all')$q$, 'forbidden');
  perform pg_temp.expect_err($q$update public.register_permissions set can_approve = true where role_key = 'santiye_sefi'$q$, 'permission denied%');
  checks := checks + 1;

  perform pg_temp.as_user(u_muh);
  if public.register_can('rfi', 'view') or not public.register_can('change', 'view') then raise exception 'muhasebe yetkisi yanlış'; end if;
  perform pg_temp.as_user(u_pm);
  if not public.register_can('rfi', 'approve') or public.register_can('rfi', 'delete') then raise exception 'pm yetkisi yanlış'; end if;
  perform pg_temp.expect_err($q$select public.set_register_permission('santiye_sefi','rfi',true,true,true,true,true,'all')$q$, 'forbidden');
  checks := checks + 1;

  perform pg_temp.as_user(u_admin);
  j := public.set_register_permission('santiye_sefi', 'decision', true, true, false, false, false, 'own');
  if (j ->> 'can_create')::boolean is not true or (j ->> 'updated_by')::uuid <> u_admin then raise exception 'set_register_permission yazmadı: %', j; end if;
  perform pg_temp.expect_err($q$select public.set_register_permission('santiye_sefi','decision',false,true,false,false,false,'all')$q$, 'validation');
  perform pg_temp.expect_err($q$select public.set_register_permission('santiye_sefi','yok_boyle',true,false,false,false,false,'all')$q$, 'validation');
  checks := checks + 1;

  perform pg_temp.as_user(null);
  set local role anon;
  perform pg_temp.expect_err($q$select public.get_my_register_permissions('test-izmir-ges-2026')$q$, 'permission denied%');
  perform pg_temp.expect_err('select count(*) from public.register_permissions', 'permission denied%');
  reset role;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | B1 | % kontrol grubu | seed 64 | geçiş durumları canlı CHECK ile uyumlu', checks;
end $$;
