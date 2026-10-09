-- ============================================================================
-- B2 DOĞRULAMA — kendini geri alan tek DO bloğu (TASLAK) · 07.10.2026
-- Ön koşul: B1 + B2. Audit trigger'ını denemek için (B3 yazma RPC'leri olmadan) postgres olarak doğrudan
-- yazar; her şey sonda geri alınır.
-- ============================================================================
do $$
declare
  p  constant text := 'test-izmir-ges-2026';
  p2 constant text := 'test-kayseri-develi-ges';
  u_admin uuid; u_ss uuid; u_ss2 uuid; u_muh uuid;
  d uuid;
  n int;
  a record;
  r record;
  checks int := 0;
  idx text;
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
  select id into u_ss from public.profiles where role_key = 'santiye_sefi' and project_id = p limit 1;
  select id into u_ss2 from public.profiles where role_key = 'santiye_sefi' and project_id = p2 limit 1;
  select id into u_muh from public.profiles where role_key = 'muhasebe' order by id limit 1;

  -- ── 1. Katalog: register_audit ──
  if to_regclass('public.register_audit') is null then raise exception 'register_audit yok'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.register_audit'::regclass) then raise exception 'register_audit RLS kapalı'; end if;
  if has_table_privilege('anon', 'public.register_audit', 'SELECT') then raise exception 'anon audit okuyabiliyor'; end if;
  if not has_table_privilege('authenticated', 'public.register_audit', 'SELECT') then raise exception 'authenticated audit okuyamıyor'; end if;
  if has_table_privilege('authenticated', 'public.register_audit', 'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'authenticated audit yazabiliyor'; end if;
  if has_table_privilege('service_role', 'public.register_audit', 'UPDATE,DELETE,TRUNCATE') then raise exception 'service_role audit değiştirebiliyor'; end if;
  if has_sequence_privilege('authenticated', 'public.register_audit_id_seq', 'USAGE,SELECT,UPDATE') then raise exception 'authenticated audit sequence yetkisi var'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.fn_register_audit()'::regprocedure) then raise exception 'fn_register_audit DEFINER değil'; end if;
  if has_function_privilege('authenticated', 'public.fn_register_audit()', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_register_audit()', 'EXECUTE') then raise exception 'fn_register_audit dışarıya açık'; end if;
  select count(*) into n from pg_trigger where not tgisinternal and tgfoid = 'public.fn_register_audit()'::regprocedure;
  if n <> 8 then raise exception 'audit trigger sayısı 8 olmalıydı: %', n; end if;
  checks := checks + 1;

  -- ── 2. İndeksler ──
  foreach idx in array array['idx_decisions_created_by','idx_decisions_rfi_id','idx_decisions_risk_id','idx_documents_created_by',
    'idx_drawings_created_by','idx_material_approvals_document_id','idx_material_approvals_technical_submittal_id',
    'idx_material_approvals_supplier_id','idx_procurement_items_area_id','idx_procurement_items_material_approval_id',
    'idx_procurement_items_wbs_id','idx_project_actions_assigned_to','idx_project_actions_created_by','idx_project_actions_decision_id',
    'idx_project_actions_rfi_id','idx_project_actions_risk_id','idx_project_risks_action_id','idx_project_risks_decision_id',
    'idx_project_risks_rfi_id','idx_purchase_requests_area_id','idx_purchase_requests_technical_submittal_id',
    'idx_purchase_requests_wbs_id','idx_rfis_assigned_to','idx_rfis_decision_id','idx_rfis_document_id','idx_rfis_drawing_id',
    'idx_rfis_raised_by','idx_technical_submittals_document_id','idx_technical_submittals_reviewer_id',
    'idx_technical_submittals_supplier_id'] loop
    if to_regclass('public.' || idx) is null then raise exception 'indeks yok: %', idx; end if;
  end loop;
  -- İlgili tablolarda indekssiz FK kalmamalı (drawings'in 3 kolonlu FK'si UNIQUE(document_id) ile karşılanıyor)
  select count(*) into n
  from pg_constraint con
  where con.contype = 'f'
    and con.conrelid::regclass::text in ('project_actions','documents','document_revisions','drawings','rfis','decisions',
        'technical_submittals','material_approvals','project_wbs','project_areas','area_wbs','project_risks',
        'purchase_requests','procurement_items','project_tasks','register_audit')
    and con.conname <> 'drawings_document_fk'
    and array_length(con.conkey, 1) is not null
    and not (array_length(con.conkey, 1) = 1 and con.conkey[1] = (select attnum from pg_attribute where attrelid = con.conrelid and attname = 'project_id'))
    and not exists (
      select 1 from pg_index i
      where i.indrelid = con.conrelid
        and ((i.indkey::int2[])[0] = con.conkey[array_length(con.conkey, 1)]
             or ((i.indkey::int2[])[0] = con.conkey[1] and (i.indkey::int2[])[1] = con.conkey[2])));
  if n > 0 then raise exception 'hâlâ indekssiz FK var: %', n; end if;
  checks := checks + 1;

  -- ── 3. G-13 ──
  if has_table_privilege('authenticated', 'public.project_wbs', 'TRUNCATE') or has_table_privilege('authenticated', 'public.project_wbs', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.project_wbs', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.project_areas', 'TRUNCATE') or has_table_privilege('authenticated', 'public.project_areas', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.project_areas', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.area_wbs', 'TRUNCATE') or has_table_privilege('authenticated', 'public.area_wbs', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.area_wbs', 'TRIGGER') or has_table_privilege('authenticated', 'public.area_wbs', 'UPDATE') then
    raise exception 'G-13: gereksiz yetki kaldı';
  end if;
  if not (has_table_privilege('authenticated', 'public.project_wbs', 'SELECT,INSERT,UPDATE,DELETE')
          and has_table_privilege('authenticated', 'public.project_areas', 'SELECT,INSERT,UPDATE,DELETE')
          and has_table_privilege('authenticated', 'public.area_wbs', 'SELECT')
          and has_table_privilege('authenticated', 'public.area_wbs', 'INSERT')
          and has_table_privilege('authenticated', 'public.area_wbs', 'DELETE')) then
    raise exception 'G-13: gerekli yetki de alınmış';
  end if;
  checks := checks + 1;

  -- ── 4. Audit davranışı (postgres olarak doğrudan yazma; changed_by için admin kimliği) ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  insert into public.documents (project_id, title, document_type) values (p, 'B2 audit denemesi', 'report') returning id into d;
  select * into a from public.register_audit where record_id = d order by id desc limit 1;
  if a.action <> 'insert' or a.changed_by is distinct from u_admin or a.changed_fields is not null or a.table_name <> 'documents' then
    raise exception 'insert audit satırı yanlış: %', to_jsonb(a);
  end if;
  perform set_config('fons.audit_reason', 'B2 test gerekçesi', true);
  update public.documents set title = 'B2 audit denemesi (2)' where id = d;
  select * into a from public.register_audit where record_id = d order by id desc limit 1;
  if a.action <> 'update' or (select count(*) from jsonb_object_keys(a.changed_fields)) <> 1
     or a.changed_fields -> 'title' ->> 0 <> 'B2 audit denemesi' or a.changed_fields -> 'title' ->> 1 <> 'B2 audit denemesi (2)'
     or a.reason <> 'B2 test gerekçesi' then
    raise exception 'update audit satırı yalnızca değişen alanı tutmuyor: %', to_jsonb(a);
  end if;
  perform set_config('fons.audit_reason', '', true);
  update public.documents set title = title where id = d;
  select count(*) into n from public.register_audit where record_id = d and action = 'update';
  if n <> 1 then raise exception 'değişiklik olmayan update audit üretti: %', n; end if;
  checks := checks + 1;

  -- ── 5. Audit okuma yetkisi ──
  perform pg_temp.as_user(u_ss);
  select count(*) into n from public.register_audit where record_id = d;
  if n <> 2 then raise exception 'santiye kendi projesinin audit''ini göremiyor: %', n; end if;
  perform pg_temp.expect_err(format('delete from public.register_audit where record_id = %L', d), 'permission denied%');
  perform pg_temp.expect_err(format('update public.register_audit set reason = %L where record_id = %L', 'x', d), 'permission denied%');
  perform pg_temp.as_user(u_ss2);
  select count(*) into n from public.register_audit where record_id = d;
  if n <> 0 then raise exception 'başka projenin santiye şefi audit görüyor: %', n; end if;
  perform pg_temp.as_user(u_muh);
  select count(*) into n from public.register_audit where record_id = d;
  if n <> 0 then raise exception 'muhasebe (document view yok) audit görüyor: %', n; end if;
  perform pg_temp.as_user(null);
  checks := checks + 1;

  -- ── 6. Silme izi ──
  delete from public.documents where id = d;
  select * into a from public.register_audit where record_id = d order by id desc limit 1;
  if a.action <> 'delete' or a.changed_fields ->> 'title' <> 'B2 audit denemesi (2)' then
    raise exception 'delete audit satırı son hali tutmuyor: %', to_jsonb(a);
  end if;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | B2 | % kontrol grubu | 30 FK indeksi | G-13 kapandı | audit yalnızca değişen alan', checks;
end $$;
