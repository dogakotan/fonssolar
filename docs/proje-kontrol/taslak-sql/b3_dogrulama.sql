-- ============================================================================
-- B3 DOĞRULAMA — kendini geri alan tek DO bloğu (TASLAK) · 07.10.2026
-- Ön koşul: B1 + B2 + B3. Bütün akış gerçek kullanıcılarla RPC üzerinden; sonda her şey geri alınır.
-- ============================================================================
do $$
declare
  p  constant text := 'test-izmir-ges-2026';
  p2 constant text := 'test-kayseri-develi-ges';
  u_admin uuid; u_admin2 uuid; u_pm uuid; u_ss uuid; u_ss2 uuid; u_muh uuid;
  j jsonb;
  rfi1 uuid; rfi2 uuid; rfi_pm uuid; act1 uuid; dec1 uuid; dec2 uuid;
  doc_drw uuid; doc_rep uuid; doc_other uuid; drw1 uuid;
  no1 text; no2 text; drw_no text;
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
  select id into u_admin2 from public.profiles where role_key = 'admin' order by id offset 1 limit 1;
  select id into u_pm from public.profiles where role_key = 'proje_yoneticisi' order by id limit 1;
  select id into u_ss from public.profiles where role_key = 'santiye_sefi' and project_id = p limit 1;
  select id into u_ss2 from public.profiles where role_key = 'santiye_sefi' and project_id = p2 limit 1;
  select id into u_muh from public.profiles where role_key = 'muhasebe' order by id limit 1;
  if u_admin2 is null then raise exception 'dört göz testi için ikinci admin yok'; end if;

  -- ── 1. Katalog ──
  select count(*) into n from pg_policies where schemaname = 'public' and cmd <> 'SELECT'
    and tablename in ('documents','document_revisions','drawings','rfis','project_actions','decisions',
                      'technical_submittals','material_approvals','register_status_history');
  if n <> 0 then raise exception 'register tablolarında yazma policy''si kaldı: %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and cmd = 'SELECT' and qual like '%register_can%'
    and tablename in ('documents','document_revisions','drawings','rfis','project_actions','decisions',
                      'technical_submittals','material_approvals','register_status_history');
  if n <> 9 then raise exception 'register_can''li SELECT policy sayısı 9 olmalıydı: %', n; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee in ('authenticated','anon')
             and privilege_type <> 'SELECT' and table_name in ('documents','document_revisions','drawings','rfis','project_actions',
             'decisions','technical_submittals','material_approvals','register_status_history')) then
    raise exception 'register tablolarında authenticated/anon yazma yetkisi var';
  end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and column_name = 'record_state'
    and table_name in ('documents','rfis','project_actions','decisions','technical_submittals','material_approvals');
  if n <> 6 then raise exception 'record_state kolon sayısı 6 olmalıydı: %', n; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'created_by'
      and table_name in ('rfis','technical_submittals','material_approvals')) <> 3 then raise exception 'created_by eksik'; end if;
  if exists (select 1 from pg_proc pr where pr.pronamespace = 'public'::regnamespace
             and pr.proname in ('save_register_record','submit_register_record','approve_register_record','reject_register_record',
                                'reopen_register_record','set_register_status','delete_register_record','link_register_records','unlink_register_records')
             and (not pr.prosecdef or has_function_privilege('anon', pr.oid, 'EXECUTE') or not has_function_privilege('authenticated', pr.oid, 'EXECUTE'))) then
    raise exception 'yazma RPC''lerinden birinin güvenlik/yetki ayarı yanlış';
  end if;
  if exists (select 1 from pg_proc pr where pr.pronamespace = 'public'::regnamespace
             and pr.proname in ('register_meta','register_editable_fields','register_required_fields','register_load',
                                'register_can_edit_row','register_load_checked','register_result','register_link_column')
             and (has_function_privilege('authenticated', pr.oid, 'EXECUTE') or has_function_privilege('anon', pr.oid, 'EXECUTE'))) then
    raise exception 'iç yardımcı dışarıya açık';
  end if;
  checks := checks + 1;

  -- ── 2. Oluşturma, numara, beyaz liste, boşluksuzluk ──
  perform pg_temp.as_user(u_ss);
  j := public.save_register_record('rfi', p, null, '{"subject":"B3 deneme RFI","question":"Soru?"}');
  rfi1 := (j ->> 'id')::uuid; no1 := j ->> 'register_no';
  if no1 !~ '^RFI-TIZ-[0-9]{4,}$' or j ->> 'record_state' <> 'draft' then raise exception 'ilk RFI yanlış: %', j; end if;
  if not exists (select 1 from public.rfis where id = rfi1 and created_by = u_ss and raised_by = u_ss and source = 'manual') then
    raise exception 'created_by/raised_by/source yazılmadı';
  end if;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p, '{"subject":"x","question":"y","rfi_no":"RFI-TIZ-9999"}'), 'validation');
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p, '{"subject":"x","question":"y","record_state":"approved"}'), 'validation');
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p, '{"subject":"x","question":"y","created_by":null}'), 'validation');
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p, '{"subject":"x"}'), 'validation');
  -- Numara trigger'da atandıktan sonra CHECK ihlali: sayaç geri alınmalı
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p, '{"subject":"x","question":"y","priority":"zzz"}'), 'validation');
  j := public.save_register_record('rfi', p, null, '{"subject":"B3 deneme RFI 2","question":"Soru 2?"}');
  rfi2 := (j ->> 'id')::uuid; no2 := j ->> 'register_no';
  if split_part(no2, '-', 3)::int <> split_part(no1, '-', 3)::int + 1 then
    raise exception 'numara boşluklu: % → %', no1, no2;
  end if;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p2, '{"subject":"x","question":"y"}'), 'forbidden');
  j := public.save_register_record('rfi', p, rfi1, '{"description":"açıklama"}');
  checks := checks + 1;

  -- ── 3. Rol ve proje sınırları ──
  perform pg_temp.as_user(u_muh);
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p, '{"subject":"x","question":"y"}'), 'forbidden');
  select count(*) into n from public.rfis where project_id = p;
  if n <> 0 then raise exception 'muhasebe RFI görüyor (register_can view yok): %', n; end if;
  perform pg_temp.as_user(u_ss2);
  perform pg_temp.expect_err(format('select public.submit_register_record(%L, %L)', 'rfi', rfi1), 'not_found');
  perform pg_temp.as_user(u_pm);
  rfi_pm := (public.save_register_record('rfi', p, null, '{"subject":"PM RFI","question":"q"}') ->> 'id')::uuid;
  perform pg_temp.as_user(u_ss);
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, %L, %L)', 'rfi', p, rfi_pm, '{"description":"x"}'), 'forbidden');
  select count(*) into n from public.rfis where project_id = p;
  if n < 3 then raise exception 'santiye kendi projesinin RFI''lerini göremiyor: %', n; end if;
  perform pg_temp.expect_err(format('insert into public.rfis (project_id, rfi_no, subject, question) values (%L, %L, %L, %L)', p, '', 's', 'q'), 'permission denied%');
  checks := checks + 1;

  -- ── 4. Onaya gönder / onayla / kilit / iş durumu ──
  j := public.submit_register_record('rfi', rfi1);
  if j ->> 'record_state' <> 'pending_approval' then raise exception 'submit çalışmadı: %', j; end if;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, %L, %L)', 'rfi', p, rfi1, '{"description":"y"}'), 'invalid_state');
  perform pg_temp.expect_err(format('select public.approve_register_record(%L, %L)', 'rfi', rfi1), 'forbidden');
  perform pg_temp.as_user(u_pm);
  j := public.approve_register_record('rfi', rfi1, 'uygun');
  if j ->> 'record_state' <> 'approved' or not exists (select 1 from public.rfis where id = rfi1 and approved_by = u_pm and approved_at is not null) then
    raise exception 'approve çalışmadı: %', j;
  end if;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, %L, %L)', 'rfi', p, rfi1, '{"description":"z"}'), 'invalid_state');
  perform pg_temp.as_user(u_ss);
  perform pg_temp.expect_err(format('select public.set_register_status(%L, %L, %L)', 'rfi', rfi1, 'answered'), 'validation');
  j := public.set_register_status('rfi', rfi1, 'answered', 'Cevap metni');
  if not exists (select 1 from public.rfis where id = rfi1 and status = 'answered' and response = 'Cevap metni' and answered_date = current_date) then
    raise exception 'answered yan alanları yazılmadı';
  end if;
  perform pg_temp.expect_err(format('select public.set_register_status(%L, %L, %L)', 'rfi', rfi1, 'open'), 'invalid_state');
  perform pg_temp.expect_err(format('select public.set_register_status(%L, %L, %L)', 'rfi', rfi2, 'under_review'), 'invalid_state');
  select count(*) into n from public.register_status_history where record_id = rfi1;
  if n < 2 then raise exception 'durum geçmişi yazılmadı: %', n; end if;
  checks := checks + 1;

  -- ── 5. Yeniden aç, sil ──
  perform pg_temp.expect_err(format('select public.reopen_register_record(%L, %L, %L)', 'rfi', rfi1, 'neden'), 'forbidden');
  perform pg_temp.as_user(u_pm);
  perform pg_temp.expect_err(format('select public.reopen_register_record(%L, %L, %L)', 'rfi', rfi1, ' '), 'validation');
  j := public.reopen_register_record('rfi', rfi1, 'yeniden incelenecek');
  if j ->> 'record_state' <> 'draft' then raise exception 'reopen çalışmadı: %', j; end if;
  reset role;
  if not exists (select 1 from public.register_audit where record_id = rfi1 and reason = 'yeniden incelenecek') then
    raise exception 'reopen gerekçesi audit''e yazılmadı';
  end if;
  perform pg_temp.as_user(u_pm);
  perform pg_temp.expect_err(format('select public.delete_register_record(%L, %L)', 'rfi', rfi2), 'forbidden');
  perform public.submit_register_record('rfi', rfi_pm);
  perform pg_temp.as_user(u_admin);
  perform public.approve_register_record('rfi', rfi_pm);
  perform pg_temp.expect_err(format('select public.delete_register_record(%L, %L)', 'rfi', rfi_pm), 'invalid_state');
  j := public.delete_register_record('rfi', rfi2);
  if exists (select 1 from public.rfis where id = rfi2) then raise exception 'taslak silinmedi'; end if;
  checks := checks + 1;

  -- ── 6. Ret akışı (aksiyon) ──
  perform pg_temp.as_user(u_ss);
  act1 := (public.save_register_record('action', p, null, '{"title":"B3 aksiyon","source_type":"rfi"}') ->> 'id')::uuid;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'action', p, '{"title":"x","source_type":"ncr"}'), 'validation');
  perform public.submit_register_record('action', act1);
  perform pg_temp.as_user(u_admin);
  perform pg_temp.expect_err(format('select public.reject_register_record(%L, %L, %L)', 'action', act1, ''), 'validation');
  j := public.reject_register_record('action', act1, 'eksik bilgi');
  if not exists (select 1 from public.project_actions where id = act1 and record_state = 'rejected' and rejected_reason = 'eksik bilgi') then
    raise exception 'reject çalışmadı';
  end if;
  perform pg_temp.as_user(u_ss);
  j := public.save_register_record('action', p, act1, '{"description":"tamamlandı"}');
  if j ->> 'record_state' <> 'draft' then raise exception 'reddedilen kayıt düzeltilince taslağa dönmedi: %', j; end if;
  checks := checks + 1;

  -- ── 7. Dört göz (decision) ──
  perform pg_temp.as_user(u_admin);
  dec1 := (public.save_register_record('decision', p, null, '{"title":"B3 karar","decision_text":"metin"}') ->> 'id')::uuid;
  perform public.submit_register_record('decision', dec1);
  perform pg_temp.expect_err(format('select public.approve_register_record(%L, %L)', 'decision', dec1), 'forbidden');
  -- Karar 6/10 (13.10.2026): decision onayı yalnızca admin; PM oluşturan olmasa da onaylayamaz
  perform pg_temp.as_user(u_pm);
  perform pg_temp.expect_err(format('select public.approve_register_record(%L, %L)', 'decision', dec1), 'forbidden');
  perform pg_temp.as_user(u_admin2);
  perform public.approve_register_record('decision', dec1);
  reset role;
  update public.project_register_settings set four_eyes_enabled = false where project_id = p;
  perform pg_temp.as_user(u_admin);
  dec2 := (public.save_register_record('decision', p, null, '{"title":"B3 karar 2","decision_text":"metin"}') ->> 'id')::uuid;
  perform public.submit_register_record('decision', dec2);
  j := public.approve_register_record('decision', dec2);
  if j ->> 'record_state' <> 'approved' then raise exception 'dört göz kapalıyken onay olmadı: %', j; end if;
  checks := checks + 1;

  -- ── 8. Doküman, çizim, bağlar ──
  perform pg_temp.as_user(u_ss);
  j := public.save_register_record('document', p, null, '{"title":"B3 çizim","document_type":"drawing"}');
  doc_drw := (j ->> 'id')::uuid; drw_no := j ->> 'register_no';
  if drw_no !~ '^DRW-TIZ-[0-9]{4,}$' or j ->> 'record_state' <> 'approved' then raise exception 'çizim dokümanı yanlış: %', j; end if;
  j := public.save_register_record('document', p, null, '{"title":"B3 rapor","document_type":"report"}');
  doc_rep := (j ->> 'id')::uuid;
  if j ->> 'register_no' !~ '^DOC-TIZ-[0-9]{4,}$' then raise exception 'rapor dokümanı numarası yanlış: %', j; end if;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'document', p, '{"title":"x","document_type":"xyz"}'), 'validation');
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'drawing', p, json_build_object('document_id', doc_drw)), 'forbidden');
  perform pg_temp.as_user(u_pm);
  j := public.save_register_record('drawing', p, null, json_build_object('document_id', doc_drw, 'drawing_type', 'layout')::jsonb);
  drw1 := (j ->> 'id')::uuid;
  if j ->> 'register_no' <> drw_no then raise exception 'çizim numarası dokümanınki değil: %', j; end if;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'drawing', p, json_build_object('document_id', doc_rep)), 'validation');
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, %L, %L)', 'document', p, doc_drw, '{"document_type":"report"}'), 'validation');
  reset role;
  insert into public.documents (project_id, title, document_type) values (p2, 'B3 başka proje', 'report') returning id into doc_other;
  perform pg_temp.as_user(u_ss);
  j := public.link_register_records(p, 'rfi', rfi1, 'drawing', drw1);
  if not exists (select 1 from public.rfis where id = rfi1 and drawing_id = drw1) then raise exception 'link yazılmadı'; end if;
  perform pg_temp.expect_err(format('select public.link_register_records(%L, %L, %L, %L, %L)', p, 'rfi', rfi1, 'document', doc_other), 'not_found');
  perform pg_temp.expect_err(format('select public.link_register_records(%L, %L, %L, %L, %L)', p, 'rfi', rfi1, 'submittal', doc_rep), 'validation');
  j := public.unlink_register_records(p, 'rfi', rfi1, 'drawing');
  if exists (select 1 from public.rfis where id = rfi1 and drawing_id is not null) then raise exception 'unlink çalışmadı'; end if;
  perform pg_temp.expect_err(format('select public.delete_register_record(%L, %L)', 'document', doc_rep), 'invalid_state');
  perform pg_temp.as_user(u_pm);
  j := public.set_register_status('document', doc_rep, 'void', 'yanlış yüklendi');
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, %L, %L)', 'document', p, doc_rep, '{"title":"y"}'), 'invalid_state');
  checks := checks + 1;

  -- ── 9. anon ──
  perform pg_temp.as_user(null);
  set local role anon;
  perform pg_temp.expect_err(format('select public.save_register_record(%L, %L, null, %L)', 'rfi', p, '{"subject":"x","question":"y"}'), 'permission denied%');
  reset role;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | B3 | % kontrol grubu | numaralar %, % (boşluksuz) | çizim % | dört göz ve G-01 kalıcı kural çalışıyor', checks, no1, no2, drw_no;
end $$;
