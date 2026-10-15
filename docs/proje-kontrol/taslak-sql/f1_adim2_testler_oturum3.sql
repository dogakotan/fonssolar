  declare
    p constant text := 'test-izmir-ges-2026';
    u_admin constant uuid := '72421e18-aad0-45cc-9301-70bf096f7954';
    u_ss constant uuid := 'acc38be0-b60f-4789-8747-b576cae4b802';
    bom constant uuid := 'f18e1ca2-bd60-436f-92a9-a2f785597f5e';   -- OG Hücre, planlı 12
    tsk constant uuid := 'd5953cf0-e9c2-471e-a1aa-3ab3b4fa82fe';   -- N1, %43, bitiş 2026-11-30
    a text; b text; c text; pr uuid; q0 numeric; q1 numeric; r0 int; r1 int; r2 int; m1 int; g0 int; g1 int;
    pd0 int; pd1 int; tp0 numeric; tp1 numeric; pp0 int; pp1 int; adj int;
  begin
    create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
    begin
      reset role;
      perform set_config('request.jwt.claims',
        case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
      if p_uid is not null then set local role authenticated; end if;
    end $f$;
    create function pg_temp.try(p_sql text) returns text language plpgsql as $f$
    declare n bigint;
    begin execute p_sql; get diagnostics n = row_count; return 'OK(' || n || ')'; exception when others then return 'ERR:' || sqlerrm; end $f$;
    create function pg_temp.res(p_id text, p_exp text, p_act text, p_pass boolean) returns text language sql as $f$
      select E'\n' || p_id || ' | beklenen: ' || p_exp || ' | gerçek: ' || coalesce(p_act, '∅') || ' | ' || case when p_pass then 'GEÇTİ' else 'KALDI' end $f$;

    perform pg_temp.as_user(null);
    select count(*) into r0 from public.project_risks where project_id = p and status = 'açık';
    select planned_qty into q0 from public.procurement_items where id = bom;

    -- T6a · satın alma: planı aşan talep (açık request_no, sequence tüketmez) → kalem → onay
    insert into public.purchase_requests (project_id, title, status, request_no, requested_by, category, urgency)
    values (p, 'F1 T6a deneme', 'onay_bekliyor', 'SAT-TEST-F1T6A', u_ss, 'malzeme', 'normal') returning id into pr;
    a := pg_temp.try(format($q$insert into public.purchase_request_items (request_id, name, quantity, unit, bom_item_id, category)
                               values (%L, 'OG Hücre (12 adet)', 50, 'adet', %L, 'malzeme')$q$, pr, bom));
    select count(*) into m1 from public.project_risks
     where project_id = p and rule_code = 'malzeme_fazla_talep' and status = 'açık';
    perform pg_temp.as_user(u_admin);
    b := pg_temp.try(format($q$update public.purchase_requests set status = 'onaylandi', approved_by = %L, approved_at = now() where id = %L$q$, u_admin, pr));
    perform pg_temp.as_user(null);
    select planned_qty into q1 from public.procurement_items where id = bom;
    select count(*) into adj from public.procurement_item_adjustments where purchase_request_id = pr;
    select count(*) into r1 from public.project_risks where project_id = p and status = 'açık';
    out := out || pg_temp.res('T6a satın alma: kalem ekleme / admin onayı', 'hata yok', a || ', ' || b, a like 'OK%' and b = 'OK(1)');
    out := out || pg_temp.res('T6a satın alma: etkiler (bilgi)', 'açık malzeme riski ≥1 (kalem sonrası); planlı miktar onayla artar',
      'malzeme_riski=' || m1 || ', planlı ' || q0 || '→' || q1 || ', düzeltme kaydı=' || adj || ', açık risk ' || r0 || '→' || r1,
      m1 >= 1 and q1 > q0 and adj = 1);

    -- T6b · görev: bitiş tarihi geçmişe → gecikme riski
    select count(*) into g0 from public.project_risks where project_id = p and rule_code = 'gorev_gecikmesi' and status = 'açık';
    perform pg_temp.as_user(u_admin);
    a := pg_temp.try(format($q$update public.project_tasks set planned_end = date '2026-09-01' where id = %L$q$, tsk));
    perform pg_temp.as_user(null);
    select count(*) into g1 from public.project_risks where project_id = p and rule_code = 'gorev_gecikmesi' and status = 'açık';
    out := out || pg_temp.res('T6b görev gecikmesi', 'hata yok, gecikme riski +1', a || ', gecikme riski ' || g0 || '→' || g1,
      a = 'OK(1)' and g1 = g0 + 1);

    -- T6c · günlük rapor: şantiye şefi save_daily_report + görev ilerlemesi
    select count(*) into pd0 from public.progress_daily where task_id = tsk;
    select total_progress into tp0 from public.project_tasks where id = tsk;
    select progress into pp0 from public.projects where id = p;
    perform pg_temp.as_user(u_ss);
    a := pg_temp.try(format($q$select public.save_daily_report(%L, date '2026-10-09', %L, 'normal', 5, 'açık', null, 'F1 T6c deneme',
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, %L::jsonb)$q$,
         p, u_ss, json_build_array(json_build_object('task_id', tsk, 'qty_added', 5))::text));
    perform pg_temp.as_user(null);
    select count(*) into pd1 from public.progress_daily where task_id = tsk;
    select total_progress into tp1 from public.project_tasks where id = tsk;
    select progress into pp1 from public.projects where id = p;
    select count(*) into r2 from public.project_risks where project_id = p and status = 'açık';
    out := out || pg_temp.res('T6c günlük rapor (şantiye şefi)', 'hata yok, ilerleme satırı +1, görev ilerlemesi artar',
      a || ', ilerleme satırı ' || pd0 || '→' || pd1 || ', görev ' || coalesce(tp0::text,'∅') || '→' || coalesce(tp1::text,'∅')
        || ', proje %' || pp0 || '→' || pp1 || ', açık risk ' || r1 || '→' || r2,
      a like 'OK%' and pd1 = pd0 + 1 and coalesce(tp1, 0) > coalesce(tp0, 0));
  end;
