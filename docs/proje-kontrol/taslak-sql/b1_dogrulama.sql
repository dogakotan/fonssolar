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
  e_k6 text;
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

  -- Karar 6 matrisi hücre hücre (13.10.2026). Bayraklar boolean'dan değil case ile metne çevrilir (kural 10);
  -- '-' = yetki yok, '*' = edit_scope own. Farklı hücreler hata mesajında listelenir.
  select string_agg(format('%s.%s beklenen=%s gerçek=%s', ex.rol, ex.tip, ex.bayrak, coalesce(ac.bayrak, 'YOK')), '; '
                    order by ex.rol, ex.tip) into e_k6
  from (values
    ('admin','action','VCEAD'), ('admin','change','VCEAD'), ('admin','claim','VCEAD'), ('admin','decision','VCEAD'),
    ('admin','document','VCEAD'), ('admin','drawing','VCEAD'), ('admin','inspection','-'), ('admin','interface','VCEAD'),
    ('admin','material_approval','VCEAD'), ('admin','ncr','-'), ('admin','payment','V'), ('admin','procurement','V'),
    ('admin','rfi','VCEAD'), ('admin','risk','VCEAD'), ('admin','subcontractor','V'), ('admin','submittal','VCEAD'),
    ('proje_yoneticisi','action','VCEA'), ('proje_yoneticisi','change','VCE'), ('proje_yoneticisi','claim','VCE'),
    ('proje_yoneticisi','decision','VCE'), ('proje_yoneticisi','document','VCEA'), ('proje_yoneticisi','drawing','VCEA'),
    ('proje_yoneticisi','inspection','-'), ('proje_yoneticisi','interface','VCEA'), ('proje_yoneticisi','material_approval','VCEA'),
    ('proje_yoneticisi','ncr','-'), ('proje_yoneticisi','payment','V'), ('proje_yoneticisi','procurement','V'),
    ('proje_yoneticisi','rfi','VCEA'), ('proje_yoneticisi','risk','VCEA'), ('proje_yoneticisi','subcontractor','V'),
    ('proje_yoneticisi','submittal','VCEA'),
    ('santiye_sefi','action','VCE*'), ('santiye_sefi','change','-'), ('santiye_sefi','claim','-'), ('santiye_sefi','decision','V'),
    ('santiye_sefi','document','VCE*'), ('santiye_sefi','drawing','V'), ('santiye_sefi','inspection','-'), ('santiye_sefi','interface','V'),
    ('santiye_sefi','material_approval','V'), ('santiye_sefi','ncr','-'), ('santiye_sefi','payment','-'), ('santiye_sefi','procurement','V'),
    ('santiye_sefi','rfi','VCE*'), ('santiye_sefi','risk','VCE*'), ('santiye_sefi','subcontractor','V'), ('santiye_sefi','submittal','V'),
    ('muhasebe','action','-'), ('muhasebe','change','V'), ('muhasebe','claim','V'), ('muhasebe','decision','-'),
    ('muhasebe','document','-'), ('muhasebe','drawing','-'), ('muhasebe','inspection','-'), ('muhasebe','interface','-'),
    ('muhasebe','material_approval','-'), ('muhasebe','ncr','-'), ('muhasebe','payment','V'), ('muhasebe','procurement','V'),
    ('muhasebe','rfi','-'), ('muhasebe','risk','-'), ('muhasebe','subcontractor','V'), ('muhasebe','submittal','-')
  ) as ex(rol, tip, bayrak)
  left join (
    select rpm.role_key as rol, rpm.register_type as tip,
           coalesce(nullif(concat(case when rpm.can_view then 'V' end, case when rpm.can_create then 'C' end,
                                  case when rpm.can_edit then 'E' end, case when rpm.can_approve then 'A' end,
                                  case when rpm.can_delete then 'D' end), ''), '-')
           || case when rpm.edit_scope = 'own' then '*' else '' end as bayrak
    from public.register_permissions rpm
  ) ac on ac.rol = ex.rol and ac.tip = ex.tip
  where ac.bayrak is distinct from ex.bayrak;
  if e_k6 is not null then raise exception 'Karar 6 matrisi farklı: %', e_k6; end if;
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
  if public.register_can('change', 'view') or not public.register_can('risk', 'edit') or public.register_can('interface', 'create') then
    raise exception 'santiye Karar 6 yetkisi yanlış (change görmemeli, risk düzenlemeli, interface açmamalı)';
  end if;
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
  if public.register_can('decision', 'approve') or public.register_can('change', 'approve') or public.register_can('claim', 'approve')
     or public.register_can('subcontractor', 'create') then
    raise exception 'pm Karar 6/10 yetkisi yanlış (decision/change/claim onayı ve subcontractor yazma yok)';
  end if;
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

  raise exception 'DOGRULAMA SONUCU: OK | B1 | % kontrol grubu | seed 64, Karar 6 matrisi birebir | geçiş durumları canlı CHECK ile uyumlu', checks;
end $$;
