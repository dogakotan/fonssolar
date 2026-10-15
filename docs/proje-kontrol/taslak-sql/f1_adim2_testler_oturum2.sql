  declare
    p constant text := 'test-izmir-ges-2026';
    u_admin constant uuid := '72421e18-aad0-45cc-9301-70bf096f7954';
    u_pm constant uuid := '7b69b7da-9d0a-4598-846e-1cb03e562fca';
    u_ss constant uuid := 'acc38be0-b60f-4789-8747-b576cae4b802';
    u_muh constant uuid := 'b8a98d29-d125-4ce0-bb0f-f9f269c640ef';
    a text; b text; c text; d text; t uuid; e text; j jsonb;
  begin
    create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
    begin
      reset role;
      perform set_config('request.jwt.claims',
        case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
      if p_uid is not null then set local role authenticated; end if;
    end $f$;
    create function pg_temp.try(p_sql text) returns text language plpgsql as $f$
    begin execute p_sql; return 'OK'; exception when others then return 'ERR:' || sqlerrm; end $f$;
    create function pg_temp.res(p_id text, p_exp text, p_act text, p_pass boolean) returns text language sql as $f$
      select E'\n' || p_id || ' | beklenen: ' || p_exp || ' | gerçek: ' || coalesce(p_act, '∅') || ' | ' || case when p_pass then 'GEÇTİ' else 'KALDI' end $f$;

    -- T1 · numara üretimi (postgres bağlamı; G-01 authenticated yazmayı kapatıyor)
    perform pg_temp.as_user(null);
    insert into public.rfis (project_id, subject, question) values (p, 'T1 a', '?') returning rfi_no into a;
    insert into public.rfis (project_id, subject, question) values (p, 'T1 b', '?') returning rfi_no into b;
    insert into public.documents (project_id, title, document_type) values (p, 'T1 doc', 'report') returning document_no into c;
    insert into public.documents (project_id, title, document_type) values (p, 'T1 drw', 'drawing') returning document_no into d;
    out := out || pg_temp.res('T1 RFI biçim/artış', 'RFI-TIZ-NNNN, ikinci = birinci+1', a || ', ' || b,
      a ~ '^RFI-TIZ-\d{4,}$' and b ~ '^RFI-TIZ-\d{4,}$' and split_part(b, '-', 3)::int = split_part(a, '-', 3)::int + 1);
    out := out || pg_temp.res('T1 DOC/DRW', 'DOC-TIZ-NNNN, DRW-TIZ-NNNN', c || ', ' || d,
      c ~ '^DOC-TIZ-\d{4,}$' and d ~ '^DRW-TIZ-\d{4,}$');

    -- T2a · admin geçerli kodla
    perform pg_temp.as_user(u_admin);
    a := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-deneme","name":"F1 deneme","location":"Test"}'::jsonb, 'ZTST')$q$);
    perform pg_temp.as_user(null);
    select count(*) into n from public.project_register_settings where project_id = 'ztst-f1-deneme' and prefix = 'ZTST';
    b := (select count(*)::text from public.project_category_weights where project_id = 'ztst-f1-deneme');
    out := out || pg_temp.res('T2a admin + ZTST', 'OK, ayar satırı 1, kategori ağırlıkları > 0', a || ', ayar=' || n || ', ağırlık=' || b,
      a = 'OK' and n = 1 and b::int > 0);

    -- T2b · biçim
    perform pg_temp.as_user(u_admin);
    a := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-b0","name":"x"}'::jsonb, null)$q$);
    b := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-b1","name":"x"}'::jsonb, '1AB')$q$);
    c := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-b2","name":"x"}'::jsonb, 'ABCDEF')$q$);
    d := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-b3","name":"x"}'::jsonb, 'AB-1')$q$);
    e := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-b4","name":"x"}'::jsonb, 'ab')$q$);
    perform pg_temp.as_user(null);
    out := out || pg_temp.res('T2b kodsuz / 1AB / ABCDEF / AB-1', '4× validation', concat_ws(', ', a, b, c, d),
      a = 'ERR:validation' and b = 'ERR:validation' and c = 'ERR:validation' and d = 'ERR:validation');
    out := out || pg_temp.res('T2b küçük harf ab', 'OK, kod AB', e || ', kod=' || coalesce((select prefix from public.project_register_settings where project_id = 'ztst-f1-b4'), '∅'),
      e = 'OK' and exists (select 1 from public.project_register_settings where project_id = 'ztst-f1-b4' and prefix = 'AB'));

    -- T2c · tekrar eden kod / ID
    perform pg_temp.as_user(u_admin);
    a := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-c1","name":"x"}'::jsonb, 'TIZ')$q$);
    b := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-deneme","name":"x"}'::jsonb, 'ZZZ')$q$);
    -- T2e · tanınmayan alan, ID'siz
    c := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-e1","name":"x","foo":1}'::jsonb, 'ZE1')$q$);
    d := pg_temp.try($q$select public.create_project_with_code('{"name":"x"}'::jsonb, 'ZE2')$q$);
    perform pg_temp.as_user(null);
    out := out || pg_temp.res('T2c kod TIZ / mevcut ID', '2× duplicate', a || ', ' || b, a = 'ERR:duplicate' and b = 'ERR:duplicate');
    out := out || pg_temp.res('T2e tanınmayan alan / ID yok', '2× validation', c || ', ' || d, c = 'ERR:validation' and d = 'ERR:validation');

    -- T2d · roller
    perform pg_temp.as_user(u_ss);
    a := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-ss","name":"x"}'::jsonb, 'ZSS')$q$);
    perform pg_temp.as_user(u_muh);
    b := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-muh","name":"x"}'::jsonb, 'ZMU')$q$);
    perform pg_temp.as_user(u_pm);
    c := pg_temp.try($q$select public.create_project_with_code('{"id":"ztst-f1-pm","name":"x"}'::jsonb, 'ZPM')$q$);
    d := pg_temp.try($q$insert into public.projects (id, name) values ('ztst-f1-pm-direkt', 'x')$q$);
    perform pg_temp.as_user(null);
    out := out || pg_temp.res('T2d santiye_sefi / muhasebe / proje_yoneticisi', 'forbidden, forbidden, OK', concat_ws(', ', a, b, c),
      a = 'ERR:forbidden' and b = 'ERR:forbidden' and c = 'OK');
    out := out || pg_temp.res('T2d bilgi: PM doğrudan projects insert (bugünkü RLS)', 'RLS reddi (yalnızca admin)', d, d like 'ERR:%row-level security%');

    -- T2f · admin doğrudan kodsuz insert + kural anında
    perform pg_temp.as_user(u_admin);
    a := pg_temp.try($q$insert into public.projects (id, name) values ('ztst-f1-kodsuz', 'x'); set constraints public.trg_projects_require_code immediate$q$);
    perform pg_temp.as_user(null);
    set constraints public.trg_projects_require_code, public.trg_project_register_settings_keep_code deferred;
    -- T2g · TIZ'in ayar satırını silme
    b := pg_temp.try($q$delete from public.project_register_settings where project_id = 'test-izmir-ges-2026'; set constraints public.trg_project_register_settings_keep_code immediate$q$);
    set constraints public.trg_projects_require_code, public.trg_project_register_settings_keep_code deferred;
    -- T2h · proje silinince (ayar CASCADE) kural hata vermemeli
    c := pg_temp.try($q$delete from public.projects where id = 'ztst-f1-b4'; set constraints public.trg_projects_require_code, public.trg_project_register_settings_keep_code immediate$q$);
    set constraints public.trg_projects_require_code, public.trg_project_register_settings_keep_code deferred;
    out := out || pg_temp.res('T2f kodsuz doğrudan insert', 'validation', a, a = 'ERR:validation');
    out := out || pg_temp.res('T2g TIZ kodunu silme', 'validation', b, b = 'ERR:validation');
    out := out || pg_temp.res('T2h kodlu projeyi silme (CASCADE)', 'OK', c, c = 'OK');

    -- T3 · mevcut 4 proje
    select count(*) into n from public.project_register_settings
     where project_id in ('kaptan-demir-adana-arazi-faz1','kaptan-demir-adana-arazi-faz2','test-izmir-ges-2026','test-kayseri-develi-ges')
       and prefix ~ '^[A-Z][A-Z0-9]{1,4}$';
    out := out || pg_temp.res('T3 mevcut kodlar yeni biçimde', '4/4', n || '/4', n = 4);

    -- T4 · alan kodu
    a := pg_temp.try(format($q$insert into public.project_areas (project_id, area_code, name) values (%L, 'A1', 'T4')$q$, p));
    b := pg_temp.try(format($q$insert into public.project_areas (project_id, area_code, name) values (%L, 'A-1', 'T4')$q$, p));
    out := out || pg_temp.res('T4 alan kodu A1 / A-1', 'OK, check ihlali', a || ', ' || b, a = 'OK' and b like 'ERR:%project_areas_code_format%');

    -- T5a · Activity ID değiştirilemezliği
    select id into t from public.project_tasks where project_id = p and activity_id is null order by id limit 1;
    a := pg_temp.try(format($q$update public.project_tasks set activity_id = 'TIZ-GEN-A1-0010' where id = %L$q$, t));
    b := pg_temp.try(format($q$update public.project_tasks set activity_id = 'TIZ-GEN-A1-0020' where id = %L$q$, t));
    c := pg_temp.try(format($q$update public.project_tasks set activity_id = null where id = %L$q$, t));
    out := out || pg_temp.res('T5a ilk atama / değiştirme / NULL', 'OK, red, red', concat_ws(', ', a, b, c),
      a = 'OK' and b like 'ERR:Atanmış Activity ID değiştirilemez%' and c like 'ERR:Atanmış Activity ID değiştirilemez%');

    -- T5b · authenticated + bayrak
    perform pg_temp.as_user(u_admin);
    perform set_config('fons.activity_id_fix', 'on', true);
    a := pg_temp.try(format($q$update public.project_tasks set activity_id = 'TIZ-GEN-A1-0030' where id = %L$q$, t));
    perform set_config('fons.activity_id_fix', 'off', true);
    perform pg_temp.as_user(null);
    b := (select activity_id from public.project_tasks where id = t);
    out := out || pg_temp.res('T5b admin oturumu + bayrak ile doğrudan UPDATE', 'red, değer TIZ-GEN-A1-0010 kalır', a || ', değer=' || b,
      a like 'ERR:Atanmış Activity ID değiştirilemez%' and b = 'TIZ-GEN-A1-0010');

    -- T5c · B4 düzeltmesi
    perform pg_temp.as_user(u_pm);
    a := pg_temp.try(format($q$select public.admin_correct_task_activity_id(%L, 'TIZ-GEN-A1-0040', 'neden')$q$, t));
    perform pg_temp.as_user(u_ss);
    b := pg_temp.try(format($q$select public.admin_correct_task_activity_id(%L, 'TIZ-GEN-A1-0040', 'neden')$q$, t));
    perform pg_temp.as_user(u_muh);
    c := pg_temp.try(format($q$select public.admin_correct_task_activity_id(%L, 'TIZ-GEN-A1-0040', 'neden')$q$, t));
    perform pg_temp.as_user(u_admin);
    d := pg_temp.try(format($q$select public.admin_correct_task_activity_id(%L, 'TIZ-GEN-A1-0040', '')$q$, t));
    e := pg_temp.try(format($q$select public.admin_correct_task_activity_id(%L, 'TIZ-GEN-A1-0040', 'T5c gerekçe')$q$, t));
    perform pg_temp.as_user(null);
    out := out || pg_temp.res('T5c B4: PM / şantiye şefi / muhasebe', '3× forbidden', concat_ws(', ', a, b, c),
      a = 'ERR:forbidden' and b = 'ERR:forbidden' and c = 'ERR:forbidden');
    select count(*) into n from public.register_audit where record_id = t and reason = 'T5c gerekçe';
    out := out || pg_temp.res('T5c B4: admin gerekçesiz / gerekçeli', 'validation, OK + audit 1 + değer 0040', d || ', ' || e || ', audit=' || n
      || ', değer=' || (select activity_id from public.project_tasks where id = t),
      d = 'ERR:validation' and e = 'OK' and n = 1 and (select activity_id from public.project_tasks where id = t) = 'TIZ-GEN-A1-0040');
  end;
