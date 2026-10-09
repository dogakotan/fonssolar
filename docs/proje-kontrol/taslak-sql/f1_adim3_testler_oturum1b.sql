  -- Faz 1 · Adım 3 · Oturum 1b — HİÇBİR TASLAK KURULMADAN, bugünkü canlı davranış (09.10.2026)
  --   ÇB  : sihirbazın düzenleme kaydı (ProjeEditWizard/Adim8Tamamlandi) görevleri silip yeniden yazar → ilerlemesi
  --         olan projede ne olur?
  --   İP0 : bugünkü fonksiyonlar iptal görevi hesaplardan çıkarıyor mu? (iptal görev eklenince değişen metrikler)
  declare
    p constant text := 'test-izmir-ges-2026';
    u_admin constant uuid := '72421e18-aad0-45cc-9301-70bf096f7954';
    u_pm constant uuid := '7b69b7da-9d0a-4598-846e-1cb03e562fca';
    e text; c text; n int; npd int; x uuid; m0 text; m1 text; m2 text; st text;
  begin
    create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
    begin
      reset role;
      perform set_config('request.jwt.claims',
        case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
      if p_uid is not null then set local role authenticated; end if;
    end $f$;
    create function pg_temp.res(p_id text, p_exp text, p_act text, p_pass boolean) returns text language sql as $f$
      select E'\n' || p_id || ' | beklenen: ' || p_exp || ' | gerçek: ' || coalesce(p_act, '∅') || ' | ' || case when p_pass then 'GEÇTİ' else 'KALDI' end $f$;
    -- Görev durumunu okuyan hesaplar (admin oturumunda çağrılır)
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

    -- ÇB · sihirbaz düzenleme kaydı: "delete from project_tasks where project_id = …" (proje yöneticisi)
    select count(*) into n from public.project_tasks where project_id = p;
    select count(distinct d.task_id) into npd from public.progress_daily d join public.project_tasks t on t.id = d.task_id where t.project_id = p;
    perform pg_temp.as_user(u_pm);
    begin
      delete from public.project_tasks where project_id = p;
      raise exception 'GERI_AL';
    exception when others then
      get stacked diagnostics c = constraint_name;
      e := case when sqlerrm = 'GERI_AL' then 'silindi (geri alındı)' else sqlerrm || ' [' || coalesce(nullif(c, ''), '-') || ']' end;
    end;
    perform pg_temp.as_user(null);
    out := out || pg_temp.res('ÇB TIZ ' || n || ' görev, ' || npd || ' tanesinde ilerleme var; sihirbaz silme adımı (PM)',
      'hata: progress_daily FK', e, e like '%progress_daily_task_id_fkey%');

    -- İP0 · iptal görev eklenince bugünkü hesaplar
    perform pg_temp.as_user(u_admin);
    m0 := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    insert into public.project_tasks (project_id, task_code, task_name, category, planned_start, planned_end, status, unit, target_qty)
    values (p, 'IP0-X', 'İP0 iptal görev', 'panel_montaji', current_date - 30, current_date - 5, 'iptal', 'adet', 100)
    returning id into x;
    perform pg_temp.as_user(u_admin);
    m1 := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    out := out || E'\nİP0 başlangıç metrikleri: ' || m0;
    out := out || pg_temp.res('İP0a iptal görev eklendi (bugünkü fonksiyonlar)', 'bilgi: değişen metrikler', pg_temp.diff(m0, m1), true);

    -- İP0b · iptal göreve ilerleme (proje yöneticisi, add_task_progress)
    perform pg_temp.as_user(u_pm);
    begin
      perform public.add_task_progress(x, 5, null, current_date);
      e := 'OK';
    exception when others then e := 'ERR:' || sqlerrm; end;
    perform pg_temp.as_user(null);
    st := (select status::text || ' / %' || progress_pct from public.project_tasks where id = x);
    perform pg_temp.as_user(u_admin);
    m2 := pg_temp.metrics(p);
    perform pg_temp.as_user(null);
    out := out || pg_temp.res('İP0b iptal göreve ilerleme (bugün)', 'bilgi', e || ', görev durumu: ' || st || ', metrik farkı: ' || pg_temp.diff(m0, m2), true);
  end;
