  declare
    p constant text := 'test-izmir-ges-2026';
    p2 constant text := 'test-kayseri-develi-ges';
    w_base uuid; a_base uuid; w2 uuid;
    u record; s text; e_ins text; e_upd text; e_del text; a_ins text; a_ins2 text; a_upd text; a_del text;
    aw_ins text; aw_upd text; aw_del text; sel text; exp text; act text; j jsonb;
    rp_n text; rp_ins text; rp_set text;
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
    begin execute p_sql; get diagnostics n = row_count; return 'OK(' || n || ')';
    exception when others then return case when sqlerrm like '%row-level security%' then 'RLS' when sqlerrm like 'permission denied%' then 'YETKİ_YOK' else 'ERR:' || sqlerrm end; end $f$;
    create function pg_temp.res(p_id text, p_exp text, p_act text, p_pass boolean) returns text language sql as $f$
      select E'\n' || p_id || ' | beklenen: ' || p_exp || ' | gerçek: ' || coalesce(p_act, '∅') || ' | ' || case when p_pass then 'GEÇTİ' else 'KALDI' end $f$;

    -- Kurulum (postgres): TIZ'de bir WBS, bir alan, bir bağ; TKY'de bir WBS
    perform pg_temp.as_user(null);
    insert into public.project_wbs (project_id, wbs_code, name) values (p, 'T7BASE', 'T7 taban') returning id into w_base;
    insert into public.project_areas (project_id, area_code, name) values (p, 'T7BASE', 'T7 taban') returning id into a_base;
    insert into public.project_wbs (project_id, wbs_code, name) values (p2, 'T7TKY', 'T7 TKY') returning id into w2;

    -- T7 · 4 rol × WBS / alan / alan-WBS
    for u in select * from (values
        ('admin', '72421e18-aad0-45cc-9301-70bf096f7954'::uuid, 'OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|YETKİ_YOK|OK(1)', 'ADM'),
        ('proje_yoneticisi', '7b69b7da-9d0a-4598-846e-1cb03e562fca'::uuid, 'OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|YETKİ_YOK|OK(1)', 'PM'),
        ('santiye_sefi', 'acc38be0-b60f-4789-8747-b576cae4b802'::uuid, 'RLS|OK(0)|OK(0)|OK(1)|RLS|OK(1)|OK(1)|YETKİ_YOK|OK(1)', 'SS'),
        ('muhasebe', 'b8a98d29-d125-4ce0-bb0f-f9f269c640ef'::uuid, 'RLS|OK(0)|OK(0)|RLS|RLS|OK(0)|RLS|YETKİ_YOK|OK(0)', 'MU')
      ) v(rol, uid, beklenen, kod) loop
      perform pg_temp.as_user(u.uid);
      sel := (select count(*)::text from public.project_wbs where project_id = p);
      e_ins := pg_temp.try(format($q$insert into public.project_wbs (project_id, wbs_code, name) values (%L, %L, 'x')$q$, p, 'T7W' || u.kod));
      e_upd := pg_temp.try(format($q$update public.project_wbs set name = 'T7 güncel' where id = %L$q$, w_base));
      e_del := pg_temp.try(format($q$delete from public.project_wbs where project_id = %L and wbs_code = 'T7TKY'$q$, p2));
      a_ins := pg_temp.try(format($q$insert into public.project_areas (project_id, area_code, name) values (%L, %L, 'x')$q$, p, 'T7A' || u.kod));
      a_ins2 := pg_temp.try(format($q$insert into public.project_areas (project_id, area_code, name) values (%L, %L, 'x')$q$, p2, 'T7B' || u.kod));
      a_upd := pg_temp.try(format($q$update public.project_areas set name = 'T7 güncel' where id = %L$q$, a_base));
      aw_ins := pg_temp.try(format($q$insert into public.area_wbs (project_id, area_id, wbs_id) values (%L, %L, %L)$q$, p, a_base, w_base));
      aw_upd := pg_temp.try(format($q$update public.area_wbs set wbs_id = wbs_id where area_id = %L$q$, a_base));
      aw_del := pg_temp.try(format($q$delete from public.area_wbs where area_id = %L$q$, a_base));
      perform pg_temp.as_user(null);
      -- bir sonraki rol aynı başlangıçla görsün: bağı ve taban kayıtları geri koy
      delete from public.area_wbs where area_id = a_base;
      if not exists (select 1 from public.project_wbs where id = w2) then
        insert into public.project_wbs (id, project_id, wbs_code, name) values (w2, p2, 'T7TKY', 'T7 TKY');
      end if;
      act := concat_ws('|', e_ins, e_upd, e_del, a_ins, a_ins2, a_upd, aw_ins, aw_upd, aw_del);
      out := out || pg_temp.res('T7 ' || u.rol || ' (WBS ekle|güncelle|TKY sil|alan TIZ ekle|alan TKY ekle|alan güncelle|bağ ekle|bağ güncelle|bağ sil), WBS okuma=' || sel,
        u.beklenen, act, act = u.beklenen and sel::int >= 1);
    end loop;

    -- T7 · TRUNCATE / REFERENCES / TRIGGER (rol düzeyi, 4 rol için ortak 'authenticated')
    act := concat_ws(',', has_table_privilege('authenticated', 'public.project_wbs', 'TRUNCATE')::text,
                         has_table_privilege('authenticated', 'public.project_areas', 'REFERENCES')::text,
                         has_table_privilege('authenticated', 'public.area_wbs', 'TRIGGER')::text,
                         has_table_privilege('authenticated', 'public.area_wbs', 'UPDATE')::text);
    out := out || pg_temp.res('T7 authenticated TRUNCATE/REFERENCES/TRIGGER/area_wbs UPDATE', 'false,false,false,false', act,
      act = 'false,false,false,false');

    -- T8a · register_permissions × 4 rol
    for u in select * from (values
        ('admin', '72421e18-aad0-45cc-9301-70bf096f7954'::uuid, 'OK(1)', 'true|true|true|true|true|all'),
        ('proje_yoneticisi', '7b69b7da-9d0a-4598-846e-1cb03e562fca'::uuid, 'ERR:forbidden', 'true|true|true|true|false|all'),
        ('santiye_sefi', 'acc38be0-b60f-4789-8747-b576cae4b802'::uuid, 'ERR:forbidden', 'true|true|true|false|false|own'),
        ('muhasebe', 'b8a98d29-d125-4ce0-bb0f-f9f269c640ef'::uuid, 'ERR:forbidden', 'false|false|false|false|false|all')
      ) v(rol, uid, set_beklenen, rfi_beklenen) loop
      perform pg_temp.as_user(u.uid);
      rp_n := (select count(*)::text from public.register_permissions);
      rp_ins := pg_temp.try($q$insert into public.register_permissions (role_key, register_type, can_view) values ('muhasebe','rfi',true) on conflict do nothing$q$);
      rp_set := pg_temp.try($q$select public.set_register_permission('muhasebe','payment',true,false,false,false,false,'all')$q$);
      j := public.get_my_register_permissions(p);
      act := concat_ws('|', j->'registers'->'rfi'->>'view', j->'registers'->'rfi'->>'create', j->'registers'->'rfi'->>'edit',
                       j->'registers'->'rfi'->>'approve', j->'registers'->'rfi'->>'delete', j->'registers'->'rfi'->>'edit_scope');
      s := concat_ws(',', public.register_can('ncr','view')::text, public.register_can('ncr','create')::text,
                     public.register_can('inspection','view')::text, public.register_can('inspection','approve')::text);
      perform pg_temp.as_user(null);
      out := out || pg_temp.res('T8a ' || u.rol || ' (okuma sayısı | doğrudan yazma | set_register_permission | rfi haritası | ncr/inspection register_can)',
        '64 | YETKİ_YOK | ' || u.set_beklenen || ' | ' || u.rfi_beklenen || ' | false,false,false,false',
        rp_n || ' | ' || rp_ins || ' | ' || replace(rp_set, 'OK(1)', 'OK(1)') || ' | ' || act || ' | ' || s,
        rp_n = '64' and rp_ins = 'YETKİ_YOK' and rp_set = u.set_beklenen and act = u.rfi_beklenen and s = 'false,false,false,false');
    end loop;

    -- T8b · ayrılmış tipler
    act := (select count(*)::text || ' satır, ' || count(*) filter (where can_view or can_create or can_edit or can_approve or can_delete)::text || ' yetkili'
            from public.register_permissions where register_type in ('ncr','inspection'));
    out := out || pg_temp.res('T8b ncr/inspection satırları', '8 satır, 0 yetkili', act, act = '8 satır, 0 yetkili');
  end;
