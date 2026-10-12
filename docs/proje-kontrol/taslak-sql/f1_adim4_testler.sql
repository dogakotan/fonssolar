-- ============================================================================
-- FAZ 1 · ADIM 4 — canlı ROLLBACK test blokları (TIZ) · 12.10.2026
-- Oturumlar build4.mjs ile üretilir: kurulum (B1, B2 A1-A2+A4, B4, AID A1-A6, Adım 4) + [ORTAK] + oturum bölümü + [SON].
-- Her oturum tek DO bloğu, hatayla biter (COMMIT yok). Beklenen ile gelen farklıysa satır "KALDI" yazar.
-- Kural 10 ön kontrolü:
--   * Değişken adları (out, r, n, v, ok, p, j, ex, rs, t1..t4, a_*, w*) sorgu takma adlarında ve kolon adlarında yok;
--     sorgularda takma ad kullanılmıyor ya da tablo adıyla nitelendiriliyor.
--   * Beklenenler kolon tiplerinden (12.10.2026'da canlıda SELECT ile doğrulandı): level smallint ::text → '2';
--     boolean ::text → 'true'/'false' (concat_ws/format %s ham boolean'ı 't'/'f' yazar; burada hep ::text);
--     jsonb sayılar ->> ile '6'; count(*) bigint → '14'; jsonb nesne metninde anahtarlar uzunluk, sonra bayt sırasıyla.
--   * Her yazma (import, tryas, assign) kendi ifadesinde; sonuç ayrı ifadede okunur. ID'ler önceden değişkene alınır.
-- ============================================================================

  -- [ORTAK]
  declare
    p constant text := 'test-izmir-ges-2026';
    u_admin constant uuid := '72421e18-aad0-45cc-9301-70bf096f7954';
    u_pm constant uuid := '7b69b7da-9d0a-4598-846e-1cb03e562fca';
    u_ss constant uuid := 'acc38be0-b60f-4789-8747-b576cae4b802';
    u_muh constant uuid := 'b8a98d29-d125-4ce0-bb0f-f9f269c640ef';
    j jsonb; j2 jsonb; ex text; rs text; c0 text; c1 text;
    t1 uuid; t2 uuid; t3 uuid; t4 uuid;
    a_ges uuid; a_b1 uuid; a_b2 uuid; a_inv1 uuid; a_depo uuid;
    w100 uuid; w200 uuid; w210 uuid; w220 uuid; w300 uuid; w310 uuid; w320 uuid; w330 uuid; w500 uuid; w510 uuid; w511 uuid;
  begin
    create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
    begin
      reset role;
      perform set_config('request.jwt.claims',
        case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
      if p_uid is not null then set local role authenticated; end if;
    end $f$;
    create function pg_temp.tryas(p_uid uuid, p_sql text) returns text language plpgsql as $f$
    declare res text; k bigint;
    begin
      perform pg_temp.as_user(p_uid);
      begin execute p_sql; get diagnostics k = row_count; res := 'OK(' || k || ')';
      exception when others then res := 'ERR:' || sqlerrm; end;
      perform pg_temp.as_user(null);
      return res;
    end $f$;
    create function pg_temp.k4(m text) returns text language sql as $f$
      select case
        when m like 'ERR:Kullanımdaki%' then 'KOD'
        when m like 'ERR:Activity ID''li görevin%pasifleştirilemez%' then 'PAS'
        when m like 'ERR:Activity ID''li görevin%taşınamaz%' then 'TAS'
        when m like 'ERR:Activity ID''li görevin%silinemez%' then 'SIL'
        when m like 'ERR:Alan-WBS bağı eklenemez%' then 'EKL'
        when m like 'ERR:Alan-WBS bağı kaldırılamaz%' then 'CIK'
        when m like 'ERR:Aktif alt%' then 'ALT'
        else m end $f$;
    -- Import çağrısı: rapor ya da {err, hint, detail}
    create function pg_temp.imp(p_uid uuid, p_proj text, p_pl jsonb, p_dry boolean) returns jsonb language plpgsql as $f$
    declare res jsonb; m text; h text; dt text;
    begin
      perform pg_temp.as_user(p_uid);
      begin
        res := public.import_wbs_areas(p_proj, p_pl, p_dry);
      exception when others then
        get stacked diagnostics m = message_text, h = pg_exception_hint, dt = pg_exception_detail;
        res := jsonb_build_object('err', m, 'hint', h, 'detail', case when dt ~ '^\s*\{' then dt::jsonb end);
      end;
      perform pg_temp.as_user(null);
      return res;
    end $f$;
    -- Özet: w=ekle/güncelle/değişmez/hata a=… l=ekle/değişmez/hata err= aid=
    create function pg_temp.sm(rp jsonb) returns text language sql as $f$
      select case when rp ? 'err' then 'ERR:' || (rp ->> 'err') else
        'w=' || (rp #>> '{summary,wbs,insert}') || '/' || (rp #>> '{summary,wbs,update}') || '/'
          || (rp #>> '{summary,wbs,unchanged}') || '/' || (rp #>> '{summary,wbs,error}')
        || ' a=' || (rp #>> '{summary,areas,insert}') || '/' || (rp #>> '{summary,areas,update}') || '/'
          || (rp #>> '{summary,areas,unchanged}') || '/' || (rp #>> '{summary,areas,error}')
        || ' l=' || (rp #>> '{summary,links,insert}') || '/' || (rp #>> '{summary,links,unchanged}') || '/'
          || (rp #>> '{summary,links,error}')
        || ' err=' || (rp #>> '{summary,error_count}') || ' aid=' || (rp #>> '{summary,aid_impact_count}') end $f$;
    -- Hata listesi: sayfa:satır:kod (önizleme raporundan ya da validation ayrıntısından)
    create function pg_temp.ec(rp jsonb) returns text language sql as $f$
      select coalesce(string_agg((x.v ->> 'sheet') || ':' || coalesce(x.v ->> 'row', '-') || ':' || (x.v ->> 'code'), ',' order by x.o), '-')
        from jsonb_array_elements(coalesce(rp -> 'errors', rp #> '{detail,errors}', '[]')) with ordinality as x(v, o) $f$;
    create function pg_temp.ai(rp jsonb) returns text language sql as $f$
      select coalesce(string_agg((x.v ->> 'sheet') || ':' || (x.v ->> 'row') || ':' || (x.v ->> 'activity_id'), ',' order by x.o), '-')
        from jsonb_array_elements(coalesce(rp -> 'aid_impact', rp #> '{detail,aid_impact}', '[]')) with ordinality as x(v, o) $f$;
    create function pg_temp.pl(pw jsonb, pa jsonb, pk jsonb) returns jsonb language sql as $f$
      select jsonb_build_object('file_name', 'tiz.xlsx', 'wbs', pw, 'areas', pa, 'links', pk) $f$;
    -- Temel dosya (kurgu, TIZ tarzı)
    create function pg_temp.bw() returns jsonb language sql as $f$ select '[
      {"row":4,"code":"TIZ-100","name":"Mobilizasyon","discipline":"general"},
      {"row":5,"code":"TIZ-200","name":"Mekanik Montaj","discipline":"mechanical"},
      {"row":6,"code":"TIZ-210","name":"Kazık Çakımı","parent_code":"TIZ-200","discipline":"mechanical"},
      {"row":7,"code":"TIZ-220","name":"Konstrüksiyon Montajı","parent_code":"TIZ-200","discipline":"mechanical"},
      {"row":8,"code":"TIZ-300","name":"DC Elektrik","discipline":"dc"},
      {"row":9,"code":"TIZ-310","name":"DC Kablo Çekimi","parent_code":"TIZ-300","discipline":"dc","notes":"Örnek not"}]'::jsonb $f$;
    create function pg_temp.ba() returns jsonb language sql as $f$ select '[
      {"row":4,"code":"GES","name":"TIZ GES Sahası","area_type":"ges"},
      {"row":5,"code":"B1","name":"PV Blok 1","area_type":"pv_blok","parent_code":"GES"},
      {"row":6,"code":"B2","name":"PV Blok 2","area_type":"pv_blok","parent_code":"GES"},
      {"row":7,"code":"INV1","name":"İnverter İstasyonu 1","area_type":"inverter_station","parent_code":"B1"},
      {"row":8,"code":"DEPO","name":"Saha Deposu","area_type":"depo"}]'::jsonb $f$;
    create function pg_temp.bl() returns jsonb language sql as $f$ select '[
      {"row":4,"area_code":"B1","wbs_code":"TIZ-210"},
      {"row":5,"area_code":"B2","wbs_code":"TIZ-210"},
      {"row":6,"area_code":"B1","wbs_code":"TIZ-310"}]'::jsonb $f$;
    create function pg_temp.base() returns jsonb language sql as $f$ select pg_temp.pl(pg_temp.bw(), pg_temp.ba(), pg_temp.bl()) $f$;
    -- TIZ'deki WBS/alan/bağ sayısı ve bu tabloların audit satırı
    create function pg_temp.cnt() returns text language sql as $f$
      select (select count(*) from public.project_wbs where project_wbs.project_id = 'test-izmir-ges-2026') || '/'
          || (select count(*) from public.project_areas where project_areas.project_id = 'test-izmir-ges-2026') || '/'
          || (select count(*) from public.area_wbs where area_wbs.project_id = 'test-izmir-ges-2026') || '/'
          || (select count(*) from public.register_audit where register_audit.table_name in ('project_wbs', 'project_areas', 'area_wbs')) $f$;
    -- Satır sürümleri (ctid): güncellenmeyen satırın ctid'i değişmez
    create function pg_temp.ver() returns text language sql as $f$
      select md5(coalesce((select string_agg(project_wbs.ctid::text, ',' order by project_wbs.wbs_code) from public.project_wbs
                            where project_wbs.project_id = 'test-izmir-ges-2026'), '')
              || coalesce((select string_agg(project_areas.ctid::text, ',' order by project_areas.area_code) from public.project_areas
                            where project_areas.project_id = 'test-izmir-ges-2026'), '')) $f$;
    create function pg_temp.wid(pc text) returns uuid language sql as $f$
      select project_wbs.id from public.project_wbs where project_wbs.project_id = 'test-izmir-ges-2026' and project_wbs.wbs_code = pc $f$;
    create function pg_temp.aid4(pc text) returns uuid language sql as $f$
      select project_areas.id from public.project_areas where project_areas.project_id = 'test-izmir-ges-2026' and project_areas.area_code = pc $f$;
    create function pg_temp.lvl(pc text) returns text language sql as $f$
      select project_wbs.level::text from public.project_wbs where project_wbs.project_id = 'test-izmir-ges-2026' and project_wbs.wbs_code = pc $f$;
    create function pg_temp.mk(p_code text, p_disc text, p_area uuid, p_wbs uuid) returns uuid language plpgsql as $f$
    declare nid uuid;
    begin
      insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, discipline, area_id, wbs_id)
      values ('test-izmir-ges-2026', p_code, p_code || ' test', 'mekanik', current_date, current_date + 60, p_disc, p_area, p_wbs)
      returning id into nid;
      return nid;
    end $f$;
    create function pg_temp.chk(p_name text, p_got text, p_exp text) returns text language sql as $f$
      select E'\n' || p_name || ': ' || case when p_got is not distinct from p_exp then 'GEÇTİ' else 'KALDI' end
          || ' | gelen=' || coalesce(p_got, '∅') || case when p_got is distinct from p_exp then ' | beklenen=' || coalesce(p_exp, '∅') else '' end $f$;

  -- [AIDKUR]
    -- Temel dosya PM ile yüklenir; iki ID'li görev (B1/TIZ-210, B2/TIZ-220) ve bir ID'siz görev (B1/TIZ-310)
    j := pg_temp.imp(u_pm, p, pg_temp.base(), false);
    out := out || pg_temp.chk('kurulum import', pg_temp.sm(j), 'w=6/0/0/0 a=5/0/0/0 l=3/0/0 err=0 aid=0');
    a_ges := pg_temp.aid4('GES'); a_b1 := pg_temp.aid4('B1'); a_b2 := pg_temp.aid4('B2');
    a_inv1 := pg_temp.aid4('INV1'); a_depo := pg_temp.aid4('DEPO');
    w100 := pg_temp.wid('TIZ-100'); w200 := pg_temp.wid('TIZ-200'); w210 := pg_temp.wid('TIZ-210');
    w220 := pg_temp.wid('TIZ-220'); w300 := pg_temp.wid('TIZ-300'); w310 := pg_temp.wid('TIZ-310');
    t1 := pg_temp.mk('A4-T1', 'mechanical', a_b1, w210);
    t2 := pg_temp.mk('A4-T2', 'mechanical', a_b2, w220);
    t3 := pg_temp.mk('A4-T3', 'dc', a_b1, w310);
    perform pg_temp.as_user(u_pm);
    j := public.assign_activity_ids(array[t1, t2], false);
    perform pg_temp.as_user(null);
    rs := (select string_agg(coalesce(project_tasks.activity_id, '∅'), ',' order by project_tasks.task_code)
             from public.project_tasks where project_tasks.id in (t1, t2, t3));
    out := out || pg_temp.chk('kurulum ID', rs, 'TIZ-MEC-B1-0010,TIZ-MEC-B2-0010,∅');

  -- [4a]
    -- R17 katalog
    rs := concat_ws('|',
      (select prosecdef::text || coalesce(proconfig::text, '') from pg_proc where oid = 'public.import_wbs_areas(text,jsonb,boolean)'::regprocedure),
      has_function_privilege('anon', 'public.import_wbs_areas(text,jsonb,boolean)', 'EXECUTE')::text,
      has_function_privilege('authenticated', 'public.import_wbs_areas(text,jsonb,boolean)', 'EXECUTE')::text,
      has_function_privilege('authenticated', 'public.fn_aid_area_wbs_violations(uuid,uuid)', 'EXECUTE')::text,
      (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_project_wbs_audit', 'trg_project_areas_audit',
         'trg_area_wbs_audit', 'trg_area_wbs_aid_guard', 'trg_project_wbs_level_cascade', 'trg_project_wbs_delete_guard',
         'trg_project_areas_delete_guard'))::text,
      (select count(*) from pg_constraint where conname = 'project_wbs_discipline_fk')::text,
      (select string_agg(prosecdef::text, '' order by proname) from pg_proc where proname in ('fn_project_wbs_guard', 'fn_project_areas_guard')));
    out := out || pg_temp.chk('R17 katalog', rs, 'true{search_path=public}|false|true|false|7|1|truetrue');

    -- T21 önizleme hiçbir şey yazmaz
    c0 := pg_temp.cnt();
    j := pg_temp.imp(u_pm, p, pg_temp.base(), true);
    c1 := pg_temp.cnt();
    out := out || pg_temp.chk('T21 önizleme', pg_temp.sm(j) || ' | ' || c0 || '→' || c1,
                              'w=6/0/0/0 a=5/0/0/0 l=3/0/0 err=0 aid=0 | 0/0/0/0→0/0/0/0');

    -- T22 gerçek import
    j := pg_temp.imp(u_pm, p, pg_temp.base(), false);
    c1 := pg_temp.cnt();
    rs := concat_ws('|', pg_temp.sm(j), j ->> 'written', c1, pg_temp.lvl('TIZ-210'),
      (select discipline || '/' || coalesce(notes, '∅') from public.project_wbs where project_wbs.project_id = p and wbs_code = 'TIZ-310'),
      (select area_type || '/' || (select a2.area_code from public.project_areas a2 where a2.id = project_areas.parent_id)
         from public.project_areas where project_areas.project_id = p and area_code = 'INV1'),
      (select count(*) from public.register_audit where reason = 'WBS/alan import: tiz.xlsx' and changed_by = u_pm)::text);
    out := out || pg_temp.chk('T22 gerçek import', rs,
      'w=6/0/0/0 a=5/0/0/0 l=3/0/0 err=0 aid=0|{"wbs_updated": 0, "wbs_inserted": 6, "areas_updated": 0, "areas_inserted": 5, "links_inserted": 3}|6/5/3/14|2|dc/Örnek not|inverter_station/B1|14');

    -- T23 aynı dosya tekrar: değişmeyecek, yeni audit yok, satır sürümü aynı
    c0 := pg_temp.ver();
    j := pg_temp.imp(u_pm, p, pg_temp.base(), false);
    c1 := pg_temp.ver();
    out := out || pg_temp.chk('T23 idempotent', concat_ws('|', pg_temp.sm(j), j ->> 'written', pg_temp.cnt(), (c0 = c1)::text),
      'w=0/0/6/0 a=0/0/5/0 l=0/3/0 err=0 aid=0|{"wbs_updated": 0, "wbs_inserted": 0, "areas_updated": 0, "areas_inserted": 0, "links_inserted": 0}|6/5/3/14|true');

    -- T24 dosyada olmayan kayıt silinmez (TIZ-310, DEPO, B1/TIZ-310 çıkarıldı)
    j := pg_temp.imp(u_pm, p, pg_temp.pl(pg_temp.bw() - 5, pg_temp.ba() - 4, pg_temp.bl() - 2), false);
    out := out || pg_temp.chk('T24 silinmez', concat_ws('|', pg_temp.sm(j), j -> 'not_in_file', pg_temp.cnt()),
      'w=0/0/5/0 a=0/0/4/0 l=0/2/0 err=0 aid=0|{"wbs": ["TIZ-310"], "areas": ["DEPO"], "links": [{"wbs_code": "TIZ-310", "area_code": "B1"}]}|6/5/3/14');

    -- T25 ad ve alan tipi değişikliği
    j2 := pg_temp.pl(jsonb_set(pg_temp.bw(), '{0,name}', '"Mobilizasyon ve Şantiye Kurulumu"'),
                     jsonb_set(pg_temp.ba(), '{4,area_type}', '"laydown"'), pg_temp.bl());
    j := pg_temp.imp(u_pm, p, j2, true);
    rs := concat_ws('|', pg_temp.sm(j), j #> '{items,wbs,0,changes}', j #> '{items,areas,4,changes}');
    j := pg_temp.imp(u_pm, p, j2, false);
    rs := concat_ws('|', rs, j #>> '{written,wbs_updated}', j #>> '{written,areas_updated}', pg_temp.cnt(),
      (select string_agg(jsonb_object_keys, ',') from (select jsonb_object_keys(changed_fields) from public.register_audit
         where register_audit.table_name = 'project_wbs' and action = 'update') q));
    out := out || pg_temp.chk('T25 güncelleme', rs, 'w=0/1/5/0 a=0/1/4/0 l=0/3/0 err=0 aid=0|["name"]|["area_type"]|1|1|6/5/3/16|name');

    -- T29 yetki
    rs := concat_ws('|',
      pg_temp.sm(pg_temp.imp(u_ss, p, pg_temp.base(), true)),
      pg_temp.sm(pg_temp.imp(u_ss, p, pg_temp.base(), false)),
      pg_temp.sm(pg_temp.imp(u_muh, p, pg_temp.base(), true)),
      pg_temp.sm(pg_temp.imp(u_muh, p, pg_temp.base(), false)),
      pg_temp.sm(pg_temp.imp(u_ss, null, pg_temp.base(), true)));
    out := out || pg_temp.chk('T29 şantiye şefi/muhasebe', rs, 'ERR:forbidden|ERR:forbidden|ERR:forbidden|ERR:forbidden|ERR:forbidden');
    j := pg_temp.imp(u_admin, p, j2, true);
    out := out || pg_temp.chk('T29 admin', pg_temp.sm(j) || '|' || pg_temp.cnt(), 'w=0/0/6/0 a=0/0/5/0 l=0/3/0 err=0 aid=0|6/5/3/16');

    -- T30 projesiz: önizleme iç kurallarla geçer; gerçek import reddedilir
    j := pg_temp.imp(u_pm, null, pg_temp.base(), true);
    rs := pg_temp.sm(j);
    j := pg_temp.imp(u_pm, null, pg_temp.base(), false);
    out := out || pg_temp.chk('T30 projesiz', rs || '|' || pg_temp.sm(j) || '|' || pg_temp.cnt(),
      'w=6/0/0/0 a=5/0/0/0 l=3/0/0 err=0 aid=0|ERR:validation|6/5/3/16');

  -- [4b]
    j := pg_temp.imp(u_pm, p, pg_temp.base(), false);
    out := out || pg_temp.chk('kurulum import', pg_temp.sm(j) || '|' || pg_temp.cnt(), 'w=6/0/0/0 a=5/0/0/0 l=3/0/0 err=0 aid=0|6/5/3/14');
    create temp table t26 (k text, pw jsonb, pa jsonb, pk jsonb, exp text) on commit drop;
    insert into t26 values
     ('a WBS küçük harf', pg_temp.bw() || '[{"row":10,"code":"tiz-400","name":"x"}]', pg_temp.ba(), pg_temp.bl(), 'WBS:10:code_format'),
     ('b tireli alan', pg_temp.bw(), pg_temp.ba() || '[{"row":9,"code":"B-3","name":"x","area_type":"pv_blok"}]', pg_temp.bl(), 'Alanlar:9:code_format'),
     ('c ad boş', pg_temp.bw() || '[{"row":10,"code":"TIZ-400"}]', pg_temp.ba(), pg_temp.bl(), 'WBS:10:required_missing'),
     ('d aktif geçersiz', pg_temp.bw() || '[{"row":10,"code":"TIZ-400","name":"x","active":"belki"}]', pg_temp.ba(), pg_temp.bl(), 'WBS:10:value_invalid'),
     ('e alan tipi', pg_temp.bw(), pg_temp.ba() || '[{"row":9,"code":"B3","name":"x","area_type":"tarla"}]', pg_temp.bl(), 'Alanlar:9:value_invalid'),
     ('f disiplin', pg_temp.bw() || '[{"row":10,"code":"TIZ-400","name":"x","discipline":"elektrik"}]', pg_temp.ba(), pg_temp.bl(), 'WBS:10:discipline_unknown'),
     ('g tekrar WBS', pg_temp.bw() || '[{"row":10,"code":"TIZ-100","name":"x"}]', pg_temp.ba(), pg_temp.bl(), 'WBS:10:duplicate_in_file'),
     ('h tekrar alan', pg_temp.bw(), pg_temp.ba() || '[{"row":9,"code":"DEPO","name":"x"}]', pg_temp.bl(), 'Alanlar:9:duplicate_in_file'),
     ('i tekrar bağ', pg_temp.bw(), pg_temp.ba(), pg_temp.bl() || '[{"row":7,"area_code":"B1","wbs_code":"TIZ-210"}]', 'Alan-WBS:7:duplicate_in_file'),
     ('j olmayan üst', pg_temp.bw() || '[{"row":10,"code":"TIZ-400","name":"x","parent_code":"TIZ-999"}]', pg_temp.ba(), pg_temp.bl(), 'WBS:10:parent_missing'),
     ('k kendi üstü', pg_temp.bw() || '[{"row":10,"code":"TIZ-400","name":"x","parent_code":"TIZ-400"}]', pg_temp.ba(), pg_temp.bl(), 'WBS:10:self_parent'),
     ('l döngü', pg_temp.bw() || '[{"row":10,"code":"TIZ-500","name":"x","parent_code":"TIZ-510"},{"row":11,"code":"TIZ-510","name":"y","parent_code":"TIZ-500"}]',
        pg_temp.ba(), pg_temp.bl(), 'WBS:10:cycle,WBS:11:cycle'),
     ('m tanımsız bağ', pg_temp.bw(), pg_temp.ba(), pg_temp.bl() || '[{"row":7,"area_code":"B9","wbs_code":"TIZ-210"},{"row":8,"area_code":"B1","wbs_code":"TIZ-999"}]',
        'Alan-WBS:7:link_area_missing,Alan-WBS:8:link_wbs_missing'),
     ('n pasif üst aktif alt', jsonb_set(pg_temp.bw(), '{1,active}', 'false'), pg_temp.ba(), pg_temp.bl(),
        'WBS:6:inactive_parent_active_child,WBS:7:inactive_parent_active_child'),
     ('p satır sınırı', (select jsonb_agg(jsonb_build_object('row', g + 3, 'code', 'G' || lpad(g::text, 4, '0'), 'name', 'g')) from generate_series(1, 5001) g),
        '[]', '[]', 'WBS:-:row_limit');
    -- T26: her dosya proje modunda ve projesiz modda aynı hata listesini vermeli
    for r in select * from t26 order by k loop
      j := pg_temp.imp(u_pm, p, pg_temp.pl(r.pw, r.pa, r.pk), true);
      j2 := pg_temp.imp(u_pm, null, pg_temp.pl(r.pw, r.pa, r.pk), true);
      out := out || pg_temp.chk('T26' || r.k, pg_temp.ec(j) || ' / projesiz=' || pg_temp.ec(j2), r.exp || ' / projesiz=' || r.exp);
    end loop;
    -- T26 o: pasifleştirilen üstün dosyada olmayan aktif altı (yalnızca projeyle görülür)
    j2 := pg_temp.pl('[{"row":4,"code":"TIZ-200","name":"Mekanik Montaj","active":false}]', '[]', '[]');
    j := pg_temp.imp(u_pm, p, j2, true);
    rs := pg_temp.ec(j);
    j := pg_temp.imp(u_pm, null, j2, true);
    out := out || pg_temp.chk('T26o dosya dışı aktif alt', rs || ' / projesiz=' || pg_temp.ec(j), 'WBS:4:deactivate_with_active_children / projesiz=-');
    -- T30b: üst kod projede varsa proje modunda geçer, projesiz modda olmayan üst
    j2 := pg_temp.pl('[{"row":4,"code":"TIZ-230","name":"x","parent_code":"TIZ-200"}]', '[]', '[]');
    j := pg_temp.imp(u_pm, p, j2, true);
    rs := pg_temp.ec(j);
    j := pg_temp.imp(u_pm, null, j2, true);
    out := out || pg_temp.chk('T30b üst projede', rs || ' / projesiz=' || pg_temp.ec(j), '- / projesiz=WBS:4:parent_missing');
    -- T26 hatalı dosya gerçek import'ta hiçbir şey yazmaz
    c0 := pg_temp.ver() || pg_temp.cnt();
    j := pg_temp.imp(u_pm, p, pg_temp.pl(pg_temp.bw() || '[{"row":10,"code":"TIZ-500","name":"x","parent_code":"TIZ-510"},{"row":11,"code":"TIZ-510","name":"y","parent_code":"TIZ-500"}]', pg_temp.ba(), pg_temp.bl()), false);
    c1 := pg_temp.ver() || pg_temp.cnt();
    out := out || pg_temp.chk('T26 gerçek', pg_temp.sm(j) || ' ' || pg_temp.ec(j) || ' ' || (c0 = c1)::text, 'ERR:validation WBS:10:cycle,WBS:11:cycle true');
    -- T27: 10 geçerli + 1 hatalı satır → hiçbir satır yazılmaz
    j2 := pg_temp.pl(pg_temp.bw()
            || (select jsonb_agg(jsonb_build_object('row', g + 9, 'code', 'TIZ-4' || lpad(g::text, 2, '0'), 'name', 'Yeni ' || g)) from generate_series(1, 10) g)
            || '[{"row":20,"code":"tiz-450","name":"hatalı"}]', pg_temp.ba(), pg_temp.bl());
    j := pg_temp.imp(u_pm, p, j2, false);
    c1 := pg_temp.ver() || pg_temp.cnt();
    out := out || pg_temp.chk('T27 hepsi ya da hiçbiri', pg_temp.sm(j) || ' ' || pg_temp.ec(j) || ' ' || (c0 = c1)::text, 'ERR:validation WBS:20:code_format true');

  -- [4c]
    -- T28 Activity ID etkisi import'ta engellenir ve listelenir
    c0 := pg_temp.ver() || pg_temp.cnt();
    j2 := pg_temp.pl(pg_temp.bw(), jsonb_set(jsonb_set(pg_temp.ba(), '{1,active}', 'false'), '{3,active}', 'false'), pg_temp.bl());
    j := pg_temp.imp(u_pm, p, j2, true);
    rs := pg_temp.sm(j) || ' ' || pg_temp.ai(j);
    j := pg_temp.imp(u_pm, p, j2, false);
    out := out || pg_temp.chk('T28a alan pasif', rs || ' | ' || pg_temp.sm(j) || ' ' || pg_temp.ai(j),
      'w=0/0/6/0 a=0/2/3/0 l=0/3/0 err=0 aid=1 Alanlar:5:TIZ-MEC-B1-0010 | ERR:validation Alanlar:5:TIZ-MEC-B1-0010');
    j := pg_temp.imp(u_pm, p, pg_temp.pl(jsonb_set(pg_temp.bw(), '{2,parent_code}', '"TIZ-300"'), pg_temp.ba(), pg_temp.bl()), true);
    out := out || pg_temp.chk('T28b WBS taşıma', pg_temp.ai(j), 'WBS:6:TIZ-MEC-B1-0010');
    j := pg_temp.imp(u_pm, p, pg_temp.pl(jsonb_set(jsonb_set(jsonb_set(pg_temp.bw(), '{1,active}', 'false'), '{2,active}', 'false'), '{3,active}', 'false'),
                                         pg_temp.ba(), pg_temp.bl()), true);
    out := out || pg_temp.chk('T28b üst WBS pasif', pg_temp.ai(j),
      'WBS:5:TIZ-MEC-B1-0010,WBS:5:TIZ-MEC-B2-0010,WBS:6:TIZ-MEC-B1-0010,WBS:7:TIZ-MEC-B2-0010');
    j := pg_temp.imp(u_pm, p, pg_temp.pl(pg_temp.bw(), pg_temp.ba(), pg_temp.bl() || '[{"row":7,"area_code":"B1","wbs_code":"TIZ-200"}]'), true);
    out := out || pg_temp.chk('T28c Karar 38 bağı', pg_temp.ai(j), 'Alan-WBS:7:TIZ-MEC-B2-0010');
    c1 := pg_temp.ver() || pg_temp.cnt();
    out := out || pg_temp.chk('T28 yazılmadı', (c0 = c1)::text, 'true');
    -- T28d aynı türden değişiklikler ID'siz kayıtlarda geçer (DEPO pasif, TIZ-310 taşınır, bağlar eklenir)
    j2 := pg_temp.pl(jsonb_set(pg_temp.bw(), '{5,parent_code}', '"TIZ-100"'), jsonb_set(pg_temp.ba(), '{4,active}', 'false'),
                     pg_temp.bl() || '[{"row":7,"area_code":"DEPO","wbs_code":"TIZ-310"},{"row":8,"area_code":"B2","wbs_code":"TIZ-220"}]');
    j := pg_temp.imp(u_pm, p, j2, false);
    rs := concat_ws('|', pg_temp.sm(j), j ->> 'written', pg_temp.cnt(), pg_temp.lvl('TIZ-310'),
      (select is_active::text from public.project_areas where project_areas.id = a_depo));
    out := out || pg_temp.chk('T28d ID''siz geçer', rs,
      'w=0/1/5/0 a=0/1/4/0 l=2/3/0 err=0 aid=0|{"wbs_updated": 1, "wbs_inserted": 0, "areas_updated": 1, "areas_inserted": 0, "links_inserted": 2}|6/5/5/18|2|false');
    -- T31 taşınan WBS'in altlarının level'ı (import ile)
    j2 := pg_temp.pl(jsonb_set(pg_temp.bw(), '{5,parent_code}', '"TIZ-100"') || '[{"row":10,"code":"TIZ-311","name":"DC Uç","parent_code":"TIZ-310"}]',
                     jsonb_set(pg_temp.ba(), '{4,active}', 'false'), '[]');
    j := pg_temp.imp(u_pm, p, j2, false);
    rs := pg_temp.sm(j) || '|' || pg_temp.lvl('TIZ-310') || pg_temp.lvl('TIZ-311');
    j := pg_temp.imp(u_pm, p, jsonb_set(j2, '{wbs,5,parent_code}', '"TIZ-220"'), false);
    rs := rs || '|' || pg_temp.lvl('TIZ-310') || pg_temp.lvl('TIZ-311');
    j := pg_temp.imp(u_pm, p, jsonb_set(j2, '{wbs,5}', (j2 #> '{wbs,5}') - 'parent_code'), false);
    rs := rs || '|' || pg_temp.lvl('TIZ-310') || pg_temp.lvl('TIZ-311');
    out := out || pg_temp.chk('T31 level', rs, 'w=1/0/6/0 a=0/0/5/0 l=0/0/0 err=0 aid=0|23|34|12');
    rs := (select string_agg(project_tasks.activity_id, ',' order by project_tasks.activity_id) from public.project_tasks where project_tasks.id in (t1, t2));
    out := out || pg_temp.chk('T28 ID''ler korunur', rs, 'TIZ-MEC-B1-0010,TIZ-MEC-B2-0010');

  -- [4d]
    -- T32 doğrudan yazma: ID'li görevi etkileyen değişiklikler şantiye şefi ve admin için reddedilir
    rs := concat_ws('|',
      pg_temp.k4(pg_temp.tryas(u_ss, format('update public.project_areas set area_code = %L where id = %L', 'B1X', a_b1))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_areas set area_code = %L where id = %L', 'B1X', a_b1))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_wbs set wbs_code = %L where id = %L', 'TIZ-211', w210))),
      pg_temp.k4(pg_temp.tryas(u_ss, format('update public.project_wbs set wbs_code = %L where id = %L', 'TIZ-211', w210))));
    out := out || pg_temp.chk('T32-1 kod', rs, 'KOD|KOD|KOD|OK(0)');
    rs := concat_ws('|',
      pg_temp.k4(pg_temp.tryas(u_ss, format('update public.project_areas set is_active = false where id = %L', a_b1))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_areas set is_active = false where id = %L', a_b1))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_wbs set is_active = false where id = %L', w200))),
      pg_temp.k4(pg_temp.tryas(u_ss, format('update public.project_areas set parent_id = %L where id = %L', a_depo, a_b1))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_areas set parent_id = %L where id = %L', a_depo, a_b1))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_wbs set parent_id = %L where id = %L', w100, w210))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_wbs set parent_id = %L where id = %L', w100, w200))));
    out := out || pg_temp.chk('T32-2 pasif/taşıma', rs, 'PAS|PAS|PAS|TAS|TAS|TAS|TAS');
    rs := concat_ws('|',
      pg_temp.k4(pg_temp.tryas(u_ss, format('insert into public.area_wbs (project_id, area_id, wbs_id) values (%L, %L, %L)', p, a_b1, w220))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('insert into public.area_wbs (project_id, area_id, wbs_id) values (%L, %L, %L)', p, a_b1, w200))),
      pg_temp.k4(pg_temp.tryas(u_ss, format('delete from public.area_wbs where area_id = %L and wbs_id = %L', a_b1, w210))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('delete from public.area_wbs where area_id = %L and wbs_id = %L', a_b1, w210))));
    out := out || pg_temp.chk('T32-3 alan-WBS', rs, 'EKL|EKL|CIK|CIK');
    -- Küme görevin alanını içerdikçe ekleme serbest; görevin alanını çıkaran silme reddedilir
    rs := pg_temp.tryas(u_admin, format('insert into public.area_wbs (project_id, area_id, wbs_id) values (%L, %L, %L)', p, a_b2, w220));
    ex := pg_temp.tryas(u_admin, format('insert into public.area_wbs (project_id, area_id, wbs_id) values (%L, %L, %L)', p, a_b1, w220));
    rs := rs || '|' || ex;
    ex := pg_temp.k4(pg_temp.tryas(u_admin, format('delete from public.area_wbs where area_id = %L and wbs_id = %L', a_b2, w220)));
    rs := rs || '|' || ex;
    out := out || pg_temp.chk('T32-3b küme', rs, 'OK(1)|OK(1)|CIK');
    rs := concat_ws('|',
      pg_temp.k4(pg_temp.tryas(u_admin, format('delete from public.project_areas where id = %L', a_b1))),
      pg_temp.k4(pg_temp.tryas(u_admin, format('delete from public.project_wbs where id = %L', w210))),
      pg_temp.k4(pg_temp.tryas(u_ss, format('delete from public.project_areas where id = %L', a_b1))));
    out := out || pg_temp.chk('T32-4 silme', rs, 'SIL|SIL|OK(0)');
    rs := concat_ws('|', (select string_agg(project_tasks.activity_id, ',' order by project_tasks.activity_id) from public.project_tasks where project_tasks.id in (t1, t2)),
      (select area_code || is_active::text from public.project_areas where project_areas.id = a_b1),
      (select wbs_code || is_active::text || coalesce(parent_id::text = w200::text, false)::text from public.project_wbs where project_wbs.id = w210));
    out := out || pg_temp.chk('T32 durum korundu', rs, 'TIZ-MEC-B1-0010,TIZ-MEC-B2-0010|B1true|TIZ-210truetrue');

    -- T33 aynı işlemler ID'siz kayıtlarda geçer
    insert into public.project_wbs (project_id, wbs_code, name, parent_id) values (p, 'TIZ-320', 'DC Pano', w300);
    insert into public.project_wbs (project_id, wbs_code, name, parent_id) values (p, 'TIZ-330', 'DC Test', w300);
    w320 := pg_temp.wid('TIZ-320'); w330 := pg_temp.wid('TIZ-330');
    t4 := pg_temp.mk('A4-T4', 'dc', a_b2, w320);
    rs := pg_temp.tryas(u_ss, format('update public.project_areas set area_code = %L where id = %L', 'DEPO2', a_depo));
    ex := pg_temp.tryas(u_admin, format('update public.project_wbs set wbs_code = %L where id = %L', 'TIZ-331', w330));
    rs := rs || '|' || ex;
    ex := pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_wbs set wbs_code = %L where id = %L', 'TIZ-321', w320)));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_ss, format('update public.project_areas set is_active = false where id = %L', a_depo));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_admin, format('update public.project_wbs set is_active = false where id = %L', w320));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_admin, format('update public.project_wbs set parent_id = %L where id = %L', w100, w320));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_ss, format('update public.project_areas set parent_id = %L where id = %L', a_ges, a_depo));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_ss, format('insert into public.area_wbs (project_id, area_id, wbs_id) values (%L, %L, %L)', p, a_b1, w320));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_ss, format('delete from public.area_wbs where area_id = %L and wbs_id = %L', a_b1, w320));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_admin, format('delete from public.project_areas where id = %L', a_depo));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_admin, format('delete from public.project_wbs where id = %L', w330));
    rs := rs || '|' || ex;
    out := out || pg_temp.chk('T33 ID''siz geçer', rs, 'OK(1)|OK(1)|KOD|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)|OK(1)');
    rs := (select count(*) from public.register_audit where register_audit.table_name = 'project_areas' and changed_by = u_ss
             and changed_fields ? 'area_code')::text
       || '/' || (select count(*) from public.register_audit where register_audit.table_name = 'area_wbs' and changed_by = u_ss)::text;
    out := out || pg_temp.chk('T33 audit', rs, '1/2');

    -- T34 Ç-7: aktif alt kaydı olan üst pasifleştirilemez; taşınan WBS'in altlarının level'ı güncellenir
    rs := pg_temp.k4(pg_temp.tryas(u_admin, format('update public.project_wbs set is_active = false where id = %L', w300)));
    ex := pg_temp.tryas(u_admin, format('update public.project_wbs set is_active = false where id = %L', w310));
    rs := rs || '|' || ex;
    ex := pg_temp.tryas(u_admin, format('update public.project_wbs set is_active = false where id = %L', w300));
    rs := rs || '|' || ex;
    ex := pg_temp.k4(pg_temp.tryas(u_ss, format('update public.project_areas set is_active = false where id = %L', a_ges)));
    rs := rs || '|' || ex;
    out := out || pg_temp.chk('T34 aktif alt', rs, 'ALT|OK(1)|OK(1)|ALT');
    insert into public.project_wbs (project_id, wbs_code, name) values (p, 'TIZ-500', 'Zincir');
    w500 := pg_temp.wid('TIZ-500');
    insert into public.project_wbs (project_id, wbs_code, name, parent_id) values (p, 'TIZ-510', 'Zincir 2', w500);
    w510 := pg_temp.wid('TIZ-510');
    insert into public.project_wbs (project_id, wbs_code, name, parent_id) values (p, 'TIZ-511', 'Zincir 3', w510);
    rs := pg_temp.lvl('TIZ-510') || pg_temp.lvl('TIZ-511');
    ex := pg_temp.tryas(u_admin, format('update public.project_wbs set parent_id = %L where id = %L', w220, w510));
    rs := rs || '|' || ex || '|' || pg_temp.lvl('TIZ-510') || pg_temp.lvl('TIZ-511');
    ex := pg_temp.tryas(u_admin, format('update public.project_wbs set parent_id = null where id = %L', w510));
    rs := rs || '|' || ex || '|' || pg_temp.lvl('TIZ-510') || pg_temp.lvl('TIZ-511');
    out := out || pg_temp.chk('T34 level', rs, '23|OK(1)|34|OK(1)|12');

  -- [SON]
  end;
