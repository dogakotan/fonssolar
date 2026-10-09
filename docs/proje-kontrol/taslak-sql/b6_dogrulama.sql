-- ============================================================================
-- B6 DOĞRULAMA — kendini geri alan tek DO bloğu (TASLAK) · 07.10.2026
-- Ön koşul: B1 + B2 + B3 + B6.
-- ============================================================================
do $$
declare
  p  constant text := 'test-izmir-ges-2026';
  p2 constant text := 'test-kayseri-develi-ges';
  u_pm uuid; u_ss uuid; u_ss2 uuid; u_muh uuid;
  r1 uuid; r2 uuid; doc uuid; drw uuid;
  j jsonb;
  n int;
  v text;
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

  select id into u_pm from public.profiles where role_key = 'proje_yoneticisi' order by id limit 1;
  select id into u_ss from public.profiles where role_key = 'santiye_sefi' and project_id = p limit 1;
  select id into u_ss2 from public.profiles where role_key = 'santiye_sefi' and project_id = p2 limit 1;
  select id into u_muh from public.profiles where role_key = 'muhasebe' order by id limit 1;

  -- ── 1. Katalog ──
  foreach v in array array['vw_reg_document','vw_reg_drawing','vw_reg_rfi','vw_reg_action','vw_reg_decision',
                           'vw_reg_submittal','vw_reg_material_approval','vw_reg_items'] loop
    if not exists (select 1 from pg_class c where c.oid = to_regclass('public.' || v) and c.reloptions @> array['security_invoker=on']) then
      raise exception '% yok veya security_invoker değil', v;
    end if;
    if has_table_privilege('anon', 'public.' || v, 'SELECT') or not has_table_privilege('authenticated', 'public.' || v, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v, 'INSERT,UPDATE,DELETE') then
      raise exception '% yetkileri yanlış', v;
    end if;
  end loop;
  if exists (select 1 from pg_proc pr where pr.pronamespace = 'public'::regnamespace
             and pr.proname in ('get_register_list','get_register_detail','get_register_overview','get_register_audit')
             and (not pr.prosecdef or has_function_privilege('anon', pr.oid, 'EXECUTE') or not has_function_privilege('authenticated', pr.oid, 'EXECUTE'))) then
    raise exception 'okuma RPC''lerinden birinin yetkisi yanlış';
  end if;
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename in ('documents','document_revisions','drawings','rfis','project_actions','decisions','technical_submittals','material_approvals');
  if n <> 8 then raise exception 'realtime yayınında 8 tablo olmalıydı: %', n; end if;
  checks := checks + 1;

  -- ── 2. Veri (RPC ile) ──
  perform pg_temp.as_user(u_ss);
  r1 := (public.save_register_record('rfi', p, null, json_build_object('subject', 'B6 liste RFI 1', 'question', 'q',
           'due_date', current_date - 1)::jsonb) ->> 'id')::uuid;
  r2 := (public.save_register_record('rfi', p, null, '{"subject":"B6 liste RFI 2","question":"q"}') ->> 'id')::uuid;
  doc := (public.save_register_record('document', p, null, '{"title":"B6 çizim","document_type":"drawing"}') ->> 'id')::uuid;
  perform pg_temp.as_user(u_pm);
  drw := (public.save_register_record('drawing', p, null, json_build_object('document_id', doc)::jsonb) ->> 'id')::uuid;
  perform pg_temp.as_user(u_ss);
  perform public.link_register_records(p, 'rfi', r1, 'drawing', drw);

  -- ── 3. Liste ──
  j := public.get_register_list(p, 'rfi');
  if (j ->> 'total')::int < 2 or not exists (select 1 from jsonb_array_elements(j -> 'items') i where (i ->> 'id')::uuid = r1 and i ->> 'register_no' like 'RFI-TIZ-%') then
    raise exception 'liste RFI''yi döndürmüyor: %', j;
  end if;
  j := public.get_register_list(p, 'rfi', '{}', 'B6 liste RFI 1');
  if (j ->> 'total')::int <> 1 then raise exception 'arama yanlış: %', j ->> 'total'; end if;
  j := public.get_register_list(p, 'rfi', '{"overdue":true}');
  if not exists (select 1 from jsonb_array_elements(j -> 'items') i where (i ->> 'id')::uuid = r1) then raise exception 'termin filtresi yanlış'; end if;
  j := public.get_register_list(p, 'rfi', '{"record_state":["draft"],"status":"open"}', null, 'register_no', 1, 0);
  if jsonb_array_length(j -> 'items') <> 1 or (j ->> 'total')::int < 2 then raise exception 'sayfalama/filtre yanlış: %', j; end if;
  perform pg_temp.expect_err(format('select public.get_register_list(%L, %L)', p, 'yok'), 'validation');
  perform pg_temp.expect_err(format('select public.get_register_list(%L, %L, %L, null, %L)', p, 'rfi', '{}', 'id; drop'), 'validation');
  perform pg_temp.expect_err(format('select public.get_register_list(%L, %L, %L)', p, 'rfi', '{"assigned_to":"x"}'), 'validation');
  checks := checks + 1;

  -- ── 4. Detay, bağlar, izinler, audit, özet ──
  j := public.get_register_detail('rfi', r1);
  if j -> 'record' ->> 'register_no' is null
     or not exists (select 1 from jsonb_array_elements(j -> 'links' -> 'outgoing') l where l ->> 'to_type' = 'drawing' and (l ->> 'to_id')::uuid = drw)
     or (j -> 'permissions' ->> 'can_edit_this')::boolean is not true
     or jsonb_array_length(j -> 'allowed_status_transitions') <> 0 then
    raise exception 'RFI detayı yanlış: %', j;
  end if;
  j := public.get_register_detail('drawing', drw);
  if not exists (select 1 from jsonb_array_elements(j -> 'links' -> 'incoming') l where (l ->> 'from_id')::uuid = r1)
     or jsonb_typeof(j -> 'revisions') <> 'array' then
    raise exception 'çizim detayı gelen bağı göstermiyor: %', j;
  end if;
  j := public.get_register_audit('rfi', r1);
  if jsonb_array_length(j -> 'items') < 2 then raise exception 'audit okuma eksik: %', j; end if;
  j := public.get_register_overview(p);
  if (j -> 'registers' -> 'rfi' ->> 'total')::int < 2 or (j -> 'registers' -> 'rfi' ->> 'overdue')::int < 1
     or not (j -> 'registers' ? 'document') then
    raise exception 'özet yanlış: %', j;
  end if;
  checks := checks + 1;

  -- ── 5. Yetkisizler ──
  perform pg_temp.as_user(u_muh);
  perform pg_temp.expect_err(format('select public.get_register_list(%L, %L)', p, 'rfi'), 'forbidden');
  j := public.get_register_overview(p);
  if j -> 'registers' <> '{}'::jsonb then raise exception 'muhasebe özeti boş olmalıydı: %', j; end if;
  select count(*) into n from public.vw_reg_items where project_id = p;
  if n <> 0 then raise exception 'muhasebe görünümden kayıt görüyor: %', n; end if;
  perform pg_temp.as_user(u_ss2);
  perform pg_temp.expect_err(format('select public.get_register_list(%L, %L)', p, 'rfi'), 'forbidden');
  perform pg_temp.expect_err(format('select public.get_register_detail(%L, %L)', 'rfi', r1), 'not_found');
  perform pg_temp.expect_err(format('select public.get_register_audit(%L, %L)', 'rfi', r1), 'not_found');
  select count(*) into n from public.vw_reg_items where project_id = p;
  if n <> 0 then raise exception 'başka projenin santiye şefi görünümden kayıt görüyor: %', n; end if;
  perform pg_temp.as_user(null);
  set local role anon;
  perform pg_temp.expect_err(format('select public.get_register_list(%L, %L)', p, 'rfi'), 'permission denied%');
  perform pg_temp.expect_err('select count(*) from public.vw_reg_items', 'permission denied%');
  reset role;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | B6 | % kontrol grubu | liste/detay/özet/audit ve 8 görünüm RLS ile çalışıyor', checks;
end $$;
