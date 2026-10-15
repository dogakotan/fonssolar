  -- Faz 1 · Adım 3 · Oturum 2 — B1 + B2 + B4 + F1 + Adım 3 kurulu; TIZ'de T9-T20 (09.10.2026)
  -- WBS/alan satırları ve test görevleri bu blokta oluşturulur; oturum hatayla bittiği için hiçbiri kalmaz.
  -- MCP istek sınırı (~95 KB) nedeniyle iki istekte koşulur:
  --   Oturum 2a = [ORTAK] + [2a] + [SON]  (T9-T14b)
  --   Oturum 2b = [ORTAK] + [2b-hazirlik] + [2b] + [SON]  (T15-T20; hazırlık, 2a'daki ön atamaları yeniden kurar)
  -- [ORTAK]
  declare
    p constant text := 'test-izmir-ges-2026';
    u_admin constant uuid := '72421e18-aad0-45cc-9301-70bf096f7954';
    u_pm constant uuid := '7b69b7da-9d0a-4598-846e-1cb03e562fca';
    u_ss constant uuid := 'acc38be0-b60f-4789-8747-b576cae4b802';
    u_muh constant uuid := 'b8a98d29-d125-4ce0-bb0f-f9f269c640ef';
    d constant date := current_date;
    w uuid; w1 uuid; wn uuid; wx uuid;
    aA1 uuid; aB2 uuid; aC3 uuid; aD4 uuid; aE5 uuid; aF6 uuid; aL uuid; long_code text;
    a1 uuid; a2 uuid; b1 uuid; b2 uuid; b3 uuid; m1 uuid; l1 uuid;
    n1 uuid; n2 uuid; n3 uuid; n4 uuid; c1 uuid;
    k1 uuid; k2 uuid; k3 uuid; k4 uuid; k5 uuid;
    z1 uuid; z2 uuid; z3 uuid; z4 uuid;
    s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid;
    w1u uuid; h1 uuid; q1 uuid; ms uuid; qt uuid; x uuid; ptid uuid; rep uuid;
    j jsonb; jd jsonb; a text; b text; c text; e text; act text; exp text; s0 text; s1s text; n int;
    m0 text; mm text;
  begin
    create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
    begin
      reset role;
      perform set_config('request.jwt.claims',
        case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
      if p_uid is not null then set local role authenticated; end if;
    end $f$;
    -- p_uid ile (NULL = postgres) SQL çalıştırır; OK(n) / ERR:<mesaj>
    create function pg_temp.tryas(p_uid uuid, p_sql text) returns text language plpgsql as $f$
    declare r text; k bigint;
    begin
      perform pg_temp.as_user(p_uid);
      begin execute p_sql; get diagnostics k = row_count; r := 'OK(' || k || ')';
      exception when others then r := 'ERR:' || sqlerrm; end;
      perform pg_temp.as_user(null);
      return r;
    end $f$;
    create function pg_temp.tryrole(p_role text, p_sql text) returns text language plpgsql as $f$
    declare r text; k bigint;
    begin
      reset role;
      perform set_config('request.jwt.claims', '', true);
      execute 'set local role ' || p_role;
      begin execute p_sql; get diagnostics k = row_count; r := 'OK(' || k || ')';
      exception when others then r := 'ERR:' || sqlerrm; end;
      reset role;
      return r;
    end $f$;
    -- Hata kısaltması: D = doğrudan yazılamaz, C = değiştirilemez, K = disiplin/alan kilidi, S = silinemez
    create function pg_temp.k(p text) returns text language sql as $f$
      select case
        when p like 'ERR:Activity ID doğrudan yazılamaz%' then 'D'
        when p like 'ERR:Atanmış Activity ID değiştirilemez%' then 'C'
        when p like 'ERR:Activity ID atanmış görevin disiplini ve alanı değiştirilemez%' then 'K'
        when p like 'ERR:Activity ID atanmış görev silinemez%' then 'S'
        else p end $f$;
    create function pg_temp.asg(p_uid uuid, p_ids uuid[], p_dry boolean) returns jsonb language plpgsql as $f$
    declare r jsonb;
    begin
      perform pg_temp.as_user(p_uid);
      r := public.assign_activity_ids(p_ids, p_dry);
      perform pg_temp.as_user(null);
      return r;
    end $f$;
    -- Hatayı ayrıntısıyla yakalar: ERR:<kod> tasks=<ayrıntıdaki görev sayısı>
    create function pg_temp.asg_err(p_uid uuid, p_ids uuid[], p_dry boolean) returns text language plpgsql as $f$
    declare r text; dt text;
    begin
      perform pg_temp.as_user(p_uid);
      begin
        perform public.assign_activity_ids(p_ids, p_dry);
        r := 'OK';
      exception when others then
        get stacked diagnostics dt = pg_exception_detail;
        r := 'ERR:' || sqlerrm || coalesce(' tasks=' || jsonb_array_length(dt::jsonb -> 'tasks'), '');
      end;
      perform pg_temp.as_user(null);
      return r;
    end $f$;
    create function pg_temp.aid(p_id uuid) returns text language sql as $f$
      select coalesce(activity_id, '∅') from public.project_tasks where id = p_id $f$;
    create function pg_temp.codes(p_j jsonb, p_t uuid, p_key text) returns text language sql as $f$
      select coalesce(string_agg(c.v ->> 'code', '+' order by c.o), '-')
        from jsonb_array_elements(p_j -> 'items') as it(v),
             jsonb_array_elements(it.v -> p_key) with ordinality as c(v, o)
       where it.v ->> 'task_id' = p_t::text $f$;
    create function pg_temp.mk(p_code text, p_disc text, p_area uuid, p_wbs uuid, p_start date, p_tq numeric default 0)
    returns uuid language plpgsql as $f$
    declare v uuid;
    begin
      insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end,
                                        discipline, area_id, wbs_id, target_qty, unit)
      values ('test-izmir-ges-2026', p_code, p_code || ' test', 'mekanik', p_start, p_start + 60,
              p_disc, p_area, p_wbs, p_tq, case when p_tq > 0 then 'adet' end)
      returning id into v;
      return v;
    end $f$;
    create function pg_temp.snap() returns text language sql as $f$
      select md5(coalesce((select string_agg(id::text || coalesce(activity_id, ''), '|' order by id) from public.project_tasks
                            where project_id = 'test-izmir-ges-2026'), ''))
          || '/' || coalesce((select string_agg(discipline || area_id::text || last_no, '|' order by discipline, area_id)
                               from public.activity_id_counters where project_id = 'test-izmir-ges-2026'), '-')
          || '/' || (select count(*) from public.register_audit where table_name = 'project_tasks') $f$;
    create function pg_temp.metrics(p text) returns text language plpgsql as $f$
    declare j jsonb; s jsonb; v record;
    begin
      j := public.get_project_by_date(p, current_date);
      s := public.get_santiye_dashboard(p, current_date);
      select * into v from public.vw_project_progress_summary where project_id = p;
      return concat_ws('|',
        'proje_ilerleme=' || (select progress from public.projects where id = p),
        'overall_pct=' || (j ->> 'overall_pct'),
        'kategori_agirlik=' || left(md5((j -> 'category_weights')::text), 8),
        'tasks(S-egrisi)=' || jsonb_array_length(j -> 'tasks'),
        'progress_items=' || jsonb_array_length(j -> 'progress_items'),
        'santiye_items=' || jsonb_array_length(s -> 'progress_items'),
        'ozet_total=' || v.total_tasks,
        'ozet_geciken=' || v.delayed_tasks,
        'acik_oto_risk=' || (select count(*) from public.project_risks where project_id = p and source = 'otomatik' and status = 'açık'));
    end $f$;
    create function pg_temp.diff(a text, b text) returns text language sql as $f$
      select coalesce(string_agg(x.k || ' ' || x.v || '→' || y.v, ', ' order by x.o), 'fark yok')
        from (select split_part(s, '=', 1) k, split_part(s, '=', 2) v, o from unnest(string_to_array(a, '|')) with ordinality as u(s, o)) x
        join (select split_part(s, '=', 2) v, o from unnest(string_to_array(b, '|')) with ordinality as u(s, o)) y on y.o = x.o
       where x.v is distinct from y.v $f$;
    create function pg_temp.res(p_id text, p_exp text, p_act text, p_pass boolean) returns text language sql as $f$
      select E'\n' || p_id || ' | beklenen: ' || p_exp || ' | gerçek: ' || coalesce(p_act, '∅') || ' | ' || case when coalesce(p_pass, false) then 'GEÇTİ' else 'KALDI' end $f$;

    -- ── Kurulum (postgres): WBS ağacı, alanlar, alan-WBS bağları ──
    perform pg_temp.as_user(null);
    insert into public.project_wbs (project_id, wbs_code, name) values (p, 'T9W', 'T9 kök') returning id into w;
    insert into public.project_wbs (project_id, wbs_code, name, parent_id) values (p, 'T9W1', 'T9 alt', w) returning id into w1;
    insert into public.project_wbs (project_id, wbs_code, name) values (p, 'T9N', 'T9 bağsız') returning id into wn;
    insert into public.project_wbs (project_id, wbs_code, name, discipline) values (p, 'T9X', 'T9 mekanik', 'mechanical') returning id into wx;
    long_code := 'L' || repeat('9', 39);
    insert into public.project_areas (project_id, area_code, name) values (p, 'A1', 'A1') returning id into aA1;
    insert into public.project_areas (project_id, area_code, name) values (p, 'B2', 'B2') returning id into aB2;
    insert into public.project_areas (project_id, area_code, name) values (p, 'C3', 'C3') returning id into aC3;
    insert into public.project_areas (project_id, area_code, name) values (p, 'D4', 'D4') returning id into aD4;
    insert into public.project_areas (project_id, area_code, name) values (p, 'E5', 'E5') returning id into aE5;
    insert into public.project_areas (project_id, area_code, name) values (p, 'F6', 'F6') returning id into aF6;
    insert into public.project_areas (project_id, area_code, name) values (p, long_code, 'uzun kod') returning id into aL;
    insert into public.area_wbs (project_id, area_id, wbs_id)
    select p, x_a, w from unnest(array[aA1, aB2, aC3, aE5, aF6, aL]) as x_a;
    insert into public.area_wbs (project_id, area_id, wbs_id) values (p, aA1, wx);

  -- [2a]
    -- ── T9 · biçim ve artış ──
    a1 := pg_temp.mk('T9-A1a', 'general', aA1, w1, d - 30);
    a2 := pg_temp.mk('T9-A1b', 'general', aA1, w1, d - 20);
    b1 := pg_temp.mk('T9-B2a', 'general', aB2, w, d - 30);
    m1 := pg_temp.mk('T9-M1', 'mechanical', aA1, w1, d - 30);
    j := pg_temp.asg(u_admin, array[a2, a1, b1, m1], false);
    act := concat_ws(',', pg_temp.aid(a1), pg_temp.aid(a2), pg_temp.aid(b1), pg_temp.aid(m1))
           || ' | atanan=' || (j -> 'summary' ->> 'assigned') || ' uyarı=' || (j -> 'summary' ->> 'warning_count');
    exp := 'TIZ-GEN-A1-0010,TIZ-GEN-A1-0020,TIZ-GEN-B2-0010,TIZ-MEC-A1-0010 | atanan=4 uyarı=0';
    out := out || pg_temp.res('T9 biçim/artış (alt WBS, üst WBS bağı üzerinden)', exp, act, act = exp);

    -- T9b · 9990 → 10000 (sayaç elle 9980'e çekilir)
    update public.activity_id_counters set last_no = 9980 where project_id = p and discipline = 'general' and area_id = aB2;
    b2 := pg_temp.mk('T9-B2b', 'general', aB2, w, d - 20);
    b3 := pg_temp.mk('T9-B2c', 'general', aB2, w, d - 10);
    a := pg_temp.asg_err(u_admin, array[b2, b3], false);
    act := a || ' ' || pg_temp.aid(b2) || ',' || pg_temp.aid(b3);
    out := out || pg_temp.res('T9b sınır 9990→10000 (5 hane, biçim kontrolü)', 'OK TIZ-GEN-B2-9990,TIZ-GEN-B2-10000', act,
      act = 'OK TIZ-GEN-B2-9990,TIZ-GEN-B2-10000');

    -- T9c · uzun alan kodu (40 karakter; canlı kontrollerde uzunluk sınırı yok)
    l1 := pg_temp.mk('T9-L1', 'general', aL, w, d - 30);
    a := pg_temp.asg_err(u_admin, array[l1], false);
    act := a || ' ' || pg_temp.aid(l1);
    exp := 'OK TIZ-GEN-' || long_code || '-0010';
    out := out || pg_temp.res('T9c 40 karakterlik alan kodu', exp, act, act = exp);

    -- ── T10 · eksik önkoşullar (önizleme) ──
    n1 := pg_temp.mk('T10-1', null, aA1, w, d - 30);
    n2 := pg_temp.mk('T10-2', 'general', null, w, d - 30);
    n3 := pg_temp.mk('T10-3', 'general', aA1, null, d - 30);
    n4 := pg_temp.mk('T10-4', null, null, null, d - 30);
    c1 := pg_temp.mk('T10-5', 'general', aC3, w, d - 30);
    update public.project_areas set is_active = false where id = aC3;
    j := pg_temp.asg(u_admin, array[n1, n2, n3, n4, c1, a1], true);
    act := concat_ws('|', pg_temp.codes(j, n1, 'errors'), pg_temp.codes(j, n2, 'errors'), pg_temp.codes(j, n3, 'errors'),
                     pg_temp.codes(j, n4, 'errors'), pg_temp.codes(j, c1, 'errors'), pg_temp.codes(j, a1, 'errors'))
           || ' | hata=' || (j -> 'summary' ->> 'error_count');
    exp := 'discipline_missing|area_missing|wbs_missing|discipline_missing+area_missing+wbs_missing|area_inactive|already_assigned | hata=6';
    out := out || pg_temp.res('T10 disiplin/alan/WBS eksik, üçü eksik, pasif alan, zaten atanmış', exp, act, act = exp);
    a := pg_temp.asg_err(u_admin, array[n1], false);
    b := pg_temp.tryas(null, format('update public.project_tasks set discipline = %L where id = %L', 'xyz', n1));
    act := a || ' | bilinmeyen disiplin: ' || b;
    out := out || pg_temp.res('T10 gerçek atamada eksik önkoşul; listede olmayan disiplin', 'ERR:validation tasks=1 | ...project_tasks_discipline_fk',
      act, a = 'ERR:validation tasks=1' and b like '%project_tasks_discipline_fk%');

    -- T10b · alan-WBS kuralı (Karar 38)
    k1 := pg_temp.mk('T10b-1', 'general', aA1, w, d - 5);
    k2 := pg_temp.mk('T10b-2', 'general', aD4, w, d - 5);
    k3 := pg_temp.mk('T10b-3', 'general', aA1, wn, d - 5);
    k4 := pg_temp.mk('T10b-4', 'general', aA1, wx, d - 5);
    k5 := pg_temp.mk('T10b-5', 'general', aB2, w1, d - 5);
    j := pg_temp.asg(u_admin, array[k1, k2, k3, k4, k5], true);
    act := 'hata ' || concat_ws('|', pg_temp.codes(j, k1, 'errors'), pg_temp.codes(j, k2, 'errors'), pg_temp.codes(j, k3, 'errors'),
                                pg_temp.codes(j, k4, 'errors'), pg_temp.codes(j, k5, 'errors'))
        || ' / uyarı ' || concat_ws('|', pg_temp.codes(j, k1, 'warnings'), pg_temp.codes(j, k2, 'warnings'), pg_temp.codes(j, k3, 'warnings'),
                                pg_temp.codes(j, k4, 'warnings'), pg_temp.codes(j, k5, 'warnings'));
    exp := 'hata -|area_wbs_not_linked|-|-|- / uyarı -|-|area_wbs_undefined|discipline_wbs_mismatch|-';
    out := out || pg_temp.res('T10b bağlı / bağsız alan / bağ tanımsız WBS / disiplin farkı / üst WBS bağı', exp, act, act = exp);

    -- ── T11 · önizleme hiçbir şey yazmaz; önerilen = gerçek ──
    s0 := pg_temp.snap();
    jd := pg_temp.asg(u_admin, array[k1, k3, k5], true);
    s1s := pg_temp.snap();
    -- takma ad "ti": oturumun dış bloğunda "v" adlı değişken var (Oturum 2a, 12.10.2026: column reference "v" is ambiguous)
    a := (select string_agg(ti ->> 'activity_id', ',' order by ti ->> 'task_code') from jsonb_array_elements(jd -> 'items') as ti);
    j := pg_temp.asg(u_admin, array[k1, k3, k5], false);
    b := concat_ws(',', pg_temp.aid(k1), pg_temp.aid(k3), pg_temp.aid(k5));
    act := case when s0 = s1s then 'yazma yok' else 'YAZDI' end || ' | önizleme ' || coalesce(a, '∅') || ' | gerçek ' || b;
    exp := 'yazma yok | önizleme TIZ-GEN-A1-0030,TIZ-GEN-A1-0040,TIZ-GEN-B2-10010 | gerçek TIZ-GEN-A1-0030,TIZ-GEN-A1-0040,TIZ-GEN-B2-10010';
    out := out || pg_temp.res('T11 önizleme yazmıyor (görev, sayaç, audit); öneri = gerçek', exp, act, act = exp);

    -- ── T12 · tek hata hepsini geri alır ──
    z1 := pg_temp.mk('T12-1', 'general', aE5, w, d - 30);
    z2 := pg_temp.mk('T12-2', 'general', aE5, w, d - 20);
    z3 := pg_temp.mk('T12-3', 'general', aE5, w, d - 10);
    z4 := pg_temp.mk('T12-4', 'general', null, w, d - 10);
    s0 := pg_temp.snap();
    a := pg_temp.asg_err(u_admin, array[z1, z2, z3, z4], false);
    act := a || ' | ' || concat_ws(',', pg_temp.aid(z1), pg_temp.aid(z2), pg_temp.aid(z3))
           || ' | ' || case when pg_temp.snap() = s0 then 'değişiklik yok' else 'DEĞİŞTİ' end;
    exp := 'ERR:validation tasks=1 | ∅,∅,∅ | değişiklik yok';
    out := out || pg_temp.res('T12 3 geçerli + 1 alanı eksik, gerçek atama', exp, act, act = exp);

    -- ── T13 · ardışık çağrılar; B4 sonrası en büyükten devam; sayaç geri çekilse de çakışma yok; numara tekrar kullanılmaz ──
    s1 := pg_temp.mk('T13-1', 'general', aF6, w, d - 30);
    s2 := pg_temp.mk('T13-2', 'general', aF6, w, d - 29);
    s3 := pg_temp.mk('T13-3', 'general', aF6, w, d - 28);
    s4 := pg_temp.mk('T13-4', 'general', aF6, w, d - 27);
    s5 := pg_temp.mk('T13-5', 'general', aF6, w, d - 26);
    s6 := pg_temp.mk('T13-6', 'general', aF6, w, d - 25);
    j := pg_temp.asg(u_admin, array[s1], false);
    j := pg_temp.asg(u_admin, array[s2], false);
    j := pg_temp.asg(u_admin, array[s3], false);
    act := concat_ws(',', pg_temp.aid(s1), pg_temp.aid(s2), pg_temp.aid(s3));
    a := pg_temp.tryas(u_admin, format('select public.admin_correct_task_activity_id(%L, %L, %L)', s3, 'TIZ-GEN-F6-0090', 'T13 elle düzeltme'));
    j := pg_temp.asg(u_admin, array[s4], false);
    act := act || ' | B4 ' || a || ' → ' || pg_temp.aid(s3) || ', sonraki ' || pg_temp.aid(s4);
    update public.activity_id_counters set last_no = 0 where project_id = p and discipline = 'general' and area_id = aF6;
    j := pg_temp.asg(u_admin, array[s5], false);
    act := act || ' | sayaç 0 iken ' || pg_temp.aid(s5);
    a := pg_temp.tryas(u_admin, format('select public.admin_correct_task_activity_id(%L, null, %L)', s5, 'T13 temizle'));
    b := pg_temp.tryas(u_pm, format('delete from public.project_tasks where id = %L', s5));
    j := pg_temp.asg(u_admin, array[s6], false);
    act := act || ' | temizle ' || a || ', sil ' || b || ', sonraki ' || pg_temp.aid(s6);
    exp := 'TIZ-GEN-F6-0010,TIZ-GEN-F6-0020,TIZ-GEN-F6-0030 | B4 OK(1) → TIZ-GEN-F6-0090, sonraki TIZ-GEN-F6-0100 | sayaç 0 iken TIZ-GEN-F6-0110 | temizle OK(1), sil OK(1), sonraki TIZ-GEN-F6-0120';
    out := out || pg_temp.res('T13 ardışık / B4 sonrası / sayaç geri / silinen numara', exp, act, act = exp);

    -- ── T14 · doğrudan yazma (Ç16) ──
    w1u := pg_temp.mk('T14-1', 'general', aA1, w, d - 3);
    a := pg_temp.k(pg_temp.tryas(u_admin, format($q$insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, activity_id) values (%L, 'T14-I', 'x', 'mekanik', current_date, current_date, 'TIZ-GEN-A1-0500')$q$, p)));
    a := a || ',' || pg_temp.k(pg_temp.tryas(u_admin, format('update public.project_tasks set activity_id = %L where id = %L', 'TIZ-GEN-A1-0500', w1u)));
    a := a || ',' || pg_temp.k(pg_temp.tryas(u_admin, format('update public.project_tasks set activity_id = %L where id = %L', 'TIZ-GEN-A1-0600', a1)));
    a := a || ',' || pg_temp.k(pg_temp.tryas(u_admin, format('update public.project_tasks set activity_id = null where id = %L', a1)));
    a := a || ',' || pg_temp.k(pg_temp.tryas(u_admin, format($q$select set_config('fons.activity_id_assign', 'on', true), set_config('fons.activity_id_fix', 'on', true); update public.project_tasks set activity_id = %L where id = %L$q$, 'TIZ-GEN-A1-0500', w1u)));
    a := a || ',' || pg_temp.k(pg_temp.tryas(u_admin, format($q$select set_config('fons.activity_id_assign', 'on', true), set_config('fons.activity_id_fix', 'on', true); update public.project_tasks set activity_id = %L where id = %L$q$, 'TIZ-GEN-A1-0600', a1)));
    perform set_config('fons.activity_id_assign', '', true);
    perform set_config('fons.activity_id_fix', '', true);
    b := pg_temp.k(pg_temp.tryas(u_pm, format('update public.project_tasks set activity_id = %L where id = %L', 'TIZ-GEN-A1-0500', w1u)));
    c := pg_temp.k(pg_temp.tryas(u_ss, format('update public.project_tasks set activity_id = %L where id = %L', 'TIZ-GEN-A1-0500', w1u)));
    c := c || ',' || pg_temp.k(pg_temp.tryas(u_ss, format('update public.project_tasks set discipline = %L where id = %L', 'mechanical', a1)));
    c := c || ',' || pg_temp.k(pg_temp.tryas(u_ss, format('update public.project_tasks set area_id = %L where id = %L', aB2, a1)));
    c := c || ',' || pg_temp.k(pg_temp.tryas(u_ss, format('update public.project_tasks set task_name = %L where id = %L', 'T9-A1a yeni ad', a1)));
    e := pg_temp.k(pg_temp.tryrole('service_role', format('update public.project_tasks set activity_id = %L where id = %L', 'TIZ-GEN-A1-0500', w1u)));
    e := e || ',' || pg_temp.k(pg_temp.tryas(null, format('update public.project_tasks set activity_id = %L where id = %L', 'TIZ-GEN-A1-0500', w1u)));
    act := 'admin ' || a || ' | pm ' || b || ' | şş ' || c || ' | service_role,postgres ' || e;
    exp := 'admin D,D,C,C,D,C | pm D | şş D,K,K,OK(1) | service_role,postgres D,D';
    out := out || pg_temp.res('T14 doğrudan INSERT/UPDATE, taklit bayrak, kilit (D=doğrudan yazılamaz C=değiştirilemez K=disiplin/alan kilidi)', exp, act, act = exp);
    -- T14b · WBS değişikliği serbest ve audit'e yazılır
    a := pg_temp.tryas(u_pm, format('update public.project_tasks set wbs_id = %L where id = %L', w, a1));
    n := (select count(*) from public.register_audit where table_name = 'project_tasks' and record_id = a1 and changed_fields ? 'wbs_id');
    act := a || ', audit=' || n || ', id=' || pg_temp.aid(a1);
    out := out || pg_temp.res('T14b ID''li görevde WBS değişikliği (PM)', 'OK(1), audit=1, id=TIZ-GEN-A1-0010', act, act = 'OK(1), audit=1, id=TIZ-GEN-A1-0010');

  -- [2b-hazirlik]
    -- 2a'daki ön atamaların aynısı: A1/general grubunda a1=0010, a2=0020, k1=0030, k3=0040; w1u atanmamış
    a1 := pg_temp.mk('T9-A1a', 'general', aA1, w1, d - 30);
    a2 := pg_temp.mk('T9-A1b', 'general', aA1, w1, d - 20);
    j := pg_temp.asg(u_admin, array[a1, a2], false);
    k1 := pg_temp.mk('T10b-1', 'general', aA1, w, d - 5);
    k3 := pg_temp.mk('T10b-3', 'general', aA1, wn, d - 5);
    j := pg_temp.asg(u_admin, array[k1, k3], false);
    w1u := pg_temp.mk('T14-1', 'general', aA1, w, d - 3);
    act := concat_ws(',', pg_temp.aid(a1), pg_temp.aid(a2), pg_temp.aid(k1), pg_temp.aid(k3), pg_temp.aid(w1u));
    exp := 'TIZ-GEN-A1-0010,TIZ-GEN-A1-0020,TIZ-GEN-A1-0030,TIZ-GEN-A1-0040,∅';
    out := out || pg_temp.res('2b hazırlık (2a ön atamaları)', exp, act, act = exp);

  -- [2b]
    -- ── T15 · genişletilmiş B4 ──
    -- Çağrılar ve okuma ayrı ifadelerde: aynı ifadedeki alt sorgu, ifade başındaki anlık görüntüyü görür
    -- (Oturum 2b, 12.10.2026: okuma çağrılardan önceki değeri gösterdi).
    -- Her çağrı ayrı ifade: sıra bağımlı (numara → disiplin → alan); tek ifadede değerlendirme sırası garanti değil.
    a := pg_temp.tryas(u_pm, format('select public.admin_correct_task_activity_id(%L, %L, %L)', a2, 'TIZ-GEN-A1-0025', 'neden'));
    a := a || ',' || pg_temp.tryas(u_admin, format('select public.admin_correct_task_activity_id(%L, %L, %L)', a2, 'TIZ-GEN-A1-0025', ''));
    a := a || ',' || pg_temp.tryas(u_admin, format('select public.admin_correct_task_activity_id(%L, %L, %L)', a2, 'TIZ-MEC-A1-0025', 'yanlış'));
    a := a || ',' || pg_temp.tryas(u_admin, format('select public.admin_correct_task_activity_id(%L, %L, %L)', a2, 'TIZ-GEN-A1-0025', 'T15 numara'));
    a := a || ',' || pg_temp.tryas(u_admin, format('select public.admin_correct_task_activity_id(%L, %L, %L, %L)', a2, 'TIZ-MEC-A1-0700', 'T15 disiplin', 'mechanical'));
    a := a || ',' || pg_temp.tryas(u_admin, format('select public.admin_correct_task_activity_id(%L, %L, %L, null, %L)', a2, 'TIZ-MEC-B2-0700', 'T15 alan', aB2));
    act := a || ' | ' || (select activity_id || '/' || discipline || '/' || (select area_code from public.project_areas where id = t.area_id)
                   from public.project_tasks t where t.id = a2)
      || ' | audit=' || (select count(*) from public.register_audit where record_id = a2 and reason in ('T15 numara', 'T15 disiplin', 'T15 alan'));
    exp := 'ERR:forbidden,ERR:validation,ERR:validation,OK(1),OK(1),OK(1) | TIZ-MEC-B2-0700/mechanical/B2 | audit=3';
    out := out || pg_temp.res('T15 B4: PM / gerekçesiz / uyumsuz biçim / numara / disiplin / alan', exp, act, act = exp);

    -- ── T16 · yetki ──
    a := pg_temp.asg_err(u_ss, array[w1u], true);
    a := a || ',' || pg_temp.asg_err(u_ss, array[w1u], false);
    a := a || ',' || pg_temp.asg_err(u_muh, array[w1u], true);
    a := a || ',' || pg_temp.asg_err(u_muh, array[w1u], false);
    a := a || ',' || pg_temp.asg_err(u_pm, array[w1u], false);
    act := a || ' ' || pg_temp.aid(w1u);
    exp := 'ERR:forbidden,ERR:forbidden,ERR:forbidden,ERR:forbidden,OK TIZ-GEN-A1-0050';
    out := out || pg_temp.res('T16 şantiye şefi / muhasebe (önizleme, gerçek) / proje yöneticisi', exp, act, act = exp);

    -- ── T17 · hv / scada ve sözlük ──
    h1 := pg_temp.mk('T17-H', 'hv', aA1, w, d - 30);
    q1 := pg_temp.mk('T17-S', 'scada', aA1, w, d - 30);
    j := pg_temp.asg(u_admin, array[h1, q1], false);
    act := pg_temp.aid(h1) || ',' || pg_temp.aid(q1) || ' | '
           || (select string_agg(discipline || '=' || id_code, ',' order by sort_order) from public.task_disciplines);
    exp := 'TIZ-HV-A1-0010,TIZ-SCA-A1-0010 | mechanical=MEC,dc=DC,ac=AC,mv=MV,hv=HV,enh=EIH,civil=CIV,scada=SCA,general=GEN';
    out := out || pg_temp.res('T17 hv/scada kısaltmaları ve 9 satırlık sözlük', exp, act, act = exp);

    -- ── T18 · mevcut akışlar ID'li görevde ──
    ms := pg_temp.mk('T18-M', 'general', aA1, w, d - 30);
    qt := pg_temp.mk('T18-Q', 'general', aA1, w, d - 30, 100);
    j := pg_temp.asg(u_admin, array[ms, qt], false);
    a := pg_temp.tryas(u_pm, format('select public.set_task_milestone_status(%L, %L)', ms, 'devam_ediyor'));
    a := a || ',' || pg_temp.tryas(u_pm, format('select public.add_task_progress(%L, 5, null, current_date)', qt));
    a := a || ',' || pg_temp.tryas(u_pm, format('update public.project_tasks set task_name = %L, notes = %L, planned_end = planned_end + 1 where id = %L', 'T18-Q excel', 'x', qt));
    act := a || ' | ' || pg_temp.aid(ms) || ' ' || (select status::text from public.project_tasks where id = ms)
           || ', ' || pg_temp.aid(qt) || ' %' || (select progress_pct::text from public.project_tasks where id = qt);
    exp := 'OK(1),OK(1),OK(1) | TIZ-GEN-A1-0060 devam_ediyor, TIZ-GEN-A1-0070 %5.00';  -- progress_pct 2 ondalıklı
    out := out || pg_temp.res('T18 kilometre taşı durumu / ilerleme girişi / Excel tarzı güncelleme', exp, act, act = exp);
    -- T18b · kodlu proje ID'li göreviyle silinir (CASCADE)
    a := pg_temp.tryas(u_admin, $q$select public.create_project_with_code('{"id":"ztst-aid-pd","name":"AID silme"}'::jsonb, 'ZAPD')$q$);
    insert into public.project_wbs (project_id, wbs_code, name) values ('ztst-aid-pd', 'W1', 'W1');
    insert into public.project_areas (project_id, area_code, name) values ('ztst-aid-pd', 'A1', 'A1');
    insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, discipline, area_id, wbs_id)
    select 'ztst-aid-pd', 'PD-1', 'PD', 'mekanik', d, d + 5, 'general',
           (select id from public.project_areas where project_id = 'ztst-aid-pd'), (select id from public.project_wbs where project_id = 'ztst-aid-pd')
    returning id into ptid;
    b := pg_temp.asg_err(u_admin, array[ptid], false);
    e := pg_temp.aid(ptid);
    c := pg_temp.tryas(null, $q$delete from public.projects where id = 'ztst-aid-pd'$q$);
    act := a || ', atama ' || b || ' (' || e || '), proje sil ' || c
           || ', kalan görev ' || (select count(*) from public.project_tasks where project_id = 'ztst-aid-pd');
    exp := 'OK(1), atama OK (ZAPD-GEN-A1-0010), proje sil OK(1), kalan görev 0';
    out := out || pg_temp.res('T18b ID''li görevi olan projeyi silme (CASCADE)', exp, act, act = exp);

    -- ── T19 · Ç16 bayrağını kullanan fonksiyonlar ──
    a := (select string_agg(proname, ',' order by proname) from pg_proc
           where pronamespace = 'public'::regnamespace and prosrc like '%fons.activity_id_%');
    b := coalesce((select string_agg(proname, ',') from pg_proc
                    where pronamespace = 'public'::regnamespace and prosrc ~* 'set_config\s*\(\s*[^''[:space:]]'), 'yok');
    act := a || ' | değişken adlı set_config: ' || b || ' | bayrak: ' || coalesce(nullif(current_setting('fons.activity_id_assign', true), ''), 'kapalı');
    exp := 'admin_correct_task_activity_id,assign_activity_ids,fn_project_tasks_identity_guard | değişken adlı set_config: yok | bayrak: off';
    out := out || pg_temp.res('T19 bayrak yalnızca beklenen fonksiyonlarda; atama sonrası kapalı', exp, act, act = exp);

    -- ── T20 · iptal görev hesapları değiştirmiyor (Karar 40) ──
    perform pg_temp.as_user(u_admin);
    m0 := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, status, unit, target_qty)
    values (p, 'T20-X', 'T20 iptal görev', 'panel_montaji', d - 30, d - 5, 'iptal', 'adet', 100)
    returning id into x;
    perform pg_temp.as_user(u_admin);
    mm := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    a := pg_temp.diff(m0, mm);
    b := pg_temp.tryas(u_pm, format('select public.add_task_progress(%L, 5, null, current_date)', x));
    act := 'ekle: ' || a || ' | add_task_progress (PM): ' || b;
    exp := 'ekle: fark yok | add_task_progress (PM): ERR:İptal edilmiş göreve ilerleme girilemez';
    out := out || pg_temp.res('T20 iptal görev eklenir / add_task_progress', exp, act, act = exp);
    out := out || E'\nT20 metrikler: ' || m0;

    -- T20c · şantiye şefi iptal göreve günlük rapordan ilerleme girer → reddedilir, görev iptal kalır, ilerleme değişmez
    a := pg_temp.tryas(u_ss, format('select public.save_daily_report(%L, %L, %L, %L, 0, %L, null, null, %L, %L, %L, %L, %L, %L)',
           p, d + 1, u_ss, 'normal', 'açık', '[]', '[]', '[]', '[]', '[]', jsonb_build_array(jsonb_build_object('task_id', x, 'qty_added', 5))::text));
    b := pg_temp.tryas(u_ss, format('select public.save_daily_report(%L, %L, %L, %L, 0, %L, null, null, %L, %L, %L, %L, %L, %L)',
           p, d + 2, u_ss, 'normal', 'açık', '[]', '[]', '[]', '[]', '[]', '[]'));
    select id into rep from public.daily_reports where project_id = p and report_date = d + 2;
    c := pg_temp.tryas(u_ss, format('insert into public.progress_daily (report_id, task_id, qty_added, source, entered_by) values (%L, %L, 5, %L, %L)',
           rep, x, 'daily_report', u_ss));
    e := pg_temp.tryas(u_ss, format('update public.project_tasks set status = %L where id = %L', 'devam_ediyor', x));
    perform pg_temp.as_user(u_admin);
    mm := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    act := 'rapor: ' || a || ' | boş rapor: ' || b || ' | doğrudan satır: ' || c || ' | yeniden aç (şş): ' || e
           || ' | durum ' || (select status::text from public.project_tasks where id = x)
           || ', ilerleme satırı ' || (select count(*) from public.progress_daily where task_id = x)
           || ' | metrik: ' || pg_temp.diff(m0, mm);
    exp := 'rapor: ERR:İptal edilmiş göreve ilerleme girilemez | boş rapor: OK(1) | doğrudan satır: ERR:İptal edilmiş göreve ilerleme girilemez'
           || ' | yeniden aç (şş): ERR:İptal edilmiş görevi yalnızca admin veya proje yöneticisi yeniden açabilir | durum iptal, ilerleme satırı 0 | metrik: fark yok';
    out := out || pg_temp.res('T20c şantiye şefi iptal göreve rapor/doğrudan ilerleme, yeniden açma', exp, act, act = exp);

    -- T20d · ilerlemesi olan görev iptal edilir: eski rapor aynen yeniden kaydedilir (satır korunur), miktar artırılamaz;
    --        iptal görevi PM yeniden açar. Plan tarihleri ileride (gecikme riski oluşmasın).
    perform pg_temp.as_user(u_admin);
    m0 := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, unit, target_qty)
    values (p, 'T20-Y', 'T20 ilerlemeli görev', 'panel_montaji', d + 1, d + 30, 'adet', 100)
    returning id into x;
    j := jsonb_build_array(jsonb_build_object('task_id', x, 'qty_added', 5));
    -- Sıra bağımlı çağrılar ayrı ifadelerde (önce rapor, sonra iptal; ardından aynı / artırılmış / boş kayıt)
    a := pg_temp.tryas(u_ss, format('select public.save_daily_report(%L, %L, %L, %L, 0, %L, null, null, %L, %L, %L, %L, %L, %L)',
           p, d + 3, u_ss, 'normal', 'açık', '[]', '[]', '[]', '[]', '[]', j::text));
    a := a || ',' || pg_temp.tryas(u_pm, format('update public.project_tasks set status = %L where id = %L', 'iptal', x));
    perform pg_temp.as_user(u_admin);
    mm := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    b := pg_temp.tryas(u_ss, format('select public.save_daily_report(%L, %L, %L, %L, 0, %L, null, null, %L, %L, %L, %L, %L, %L)',
           p, d + 3, u_ss, 'normal', 'açık', '[]', '[]', '[]', '[]', '[]', j::text));
    b := b || ',' || pg_temp.tryas(u_ss, format('select public.save_daily_report(%L, %L, %L, %L, 0, %L, null, null, %L, %L, %L, %L, %L, %L)',
           p, d + 3, u_ss, 'normal', 'açık', '[]', '[]', '[]', '[]', '[]', jsonb_build_array(jsonb_build_object('task_id', x, 'qty_added', 8))::text));
    b := b || ',' || pg_temp.tryas(u_ss, format('select public.save_daily_report(%L, %L, %L, %L, 0, %L, null, null, %L, %L, %L, %L, %L, %L)',
           p, d + 3, u_ss, 'normal', 'açık', '[]', '[]', '[]', '[]', '[]', '[]'));
    c := (select count(*) || '×' || coalesce(sum(qty_added), 0) from public.progress_daily where task_id = x)
         || ' ' || (select status::text || ' %' || progress_pct from public.project_tasks where id = x);
    e := pg_temp.tryas(u_pm, format('update public.project_tasks set status = %L where id = %L', 'devam_ediyor', x));
    act := 'ilerle+iptal: ' || a || ' | iptal sonrası metrik: ' || pg_temp.diff(m0, mm) || ' | aynı/arttır/boş: ' || b
           || ' | ' || c || ' | yeniden aç (PM): ' || e;
    exp := 'ilerle+iptal: OK(1),OK(1) | iptal sonrası metrik: fark yok | aynı/arttır/boş: OK(1),ERR:İptal edilmiş göreve ilerleme girilemez,OK(1)'
           || ' | 1×5 iptal %5.00 | yeniden aç (PM): OK(1)';
    out := out || pg_temp.res('T20d ilerlemeli görev iptal: eski rapor yeniden kaydı, miktar artışı, PM yeniden açar', exp, act, act = exp);
    -- T20b · ID'li görev silinmez, iptal edilir; iptal yalnızca o görevi hesaptan çıkarır
    a := pg_temp.k(pg_temp.tryas(u_pm, format('delete from public.project_tasks where id = %L', a1)));
    b := pg_temp.tryas(u_pm, format('update public.project_tasks set status = %L where id = %L', 'iptal', a1));
    perform pg_temp.as_user(u_admin);
    mm := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    act := a || ', ' || b || ', id=' || pg_temp.aid(a1) || ' | metrik farkı: ' || pg_temp.diff(m0, mm);
    out := out || pg_temp.res('T20b ID''li görevi sil (PM) / iptal et', 'S, OK(1), id korunur | bilgi: iptal edilen görevin etkisi',
      act, act like 'S, OK(1), id=TIZ-GEN-A1-0010 | %');
  -- [SON]
  end;
