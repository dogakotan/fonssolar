-- İş Planı revizyonu Faz 1 (veri temeli), adım 3.
-- İsdemir (isdemir-diyarbakir-arazi-faz1, -faz2) için project_wbs'i görevlerin group_label'ından türetir
-- ("›" = alt seviye) ve görevlere wbs_id + discipline yazar. Kaptan Demir ve test projelerine dokunmaz.
--
-- Disiplin (Karar 20 anahtarları): WBS'in disiplini; kategorisi elektrik_ac olan görev 'ac'.
--
-- Yan etki analizi (docs/is-plani-faz1-veri-temeli.md §2): görev UPDATE'i yalnızca wbs_id ve discipline
-- kolonlarını SET eder. trg_sync_project_progress (UPDATE OF progress_pct, planned_start, planned_end) ve
-- trg_tasks_recompute_risks (UPDATE OF planned_end, status) bu kolonlarda tetiklenmez; bildirim üreten
-- trigger project_tasks'ta yok. Çalışan trigger'lar: identity_guard (pasif WBS kontrolü), updated_at,
-- site_chief_guard (oturumsuz bağlamda etkisiz). Aşağıdaki DO bloğu notifications, project_risks,
-- projects ve görevlerin diğer kolonlarının değişmediğini aynı işlemde doğrular; değiştiyse her şey geri alınır.
set local lock_timeout = '3s';

do $mig$
declare
  v_projeler      constant text[] := array['isdemir-diyarbakir-arazi-faz1','isdemir-diyarbakir-arazi-faz2'];
  v_notif_once    bigint;
  v_notif_sonra   bigint;
  v_risk_once     text;
  v_risk_sonra    text;
  v_proje_once    text;
  v_proje_sonra   text;
  v_gorev_once    text;
  v_gorev_sonra   text;
  v_eksik         text;
  v_wbs_n         int;
  v_gorev_n       int;
begin
  if exists (select 1 from project_wbs pw where pw.project_id = any (v_projeler)) then
    raise exception 'İsdemir projelerinde zaten WBS kaydı var; bu migration yalnızca boş başlangıçta çalışır.';
  end if;

  select count(*) into v_notif_once from notifications;
  select md5(coalesce(string_agg(to_jsonb(pr)::text, '|' order by pr.id), '')) into v_risk_once from project_risks pr;
  select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) into v_proje_once from projects p;
  select md5(string_agg((to_jsonb(t) - 'wbs_id' - 'discipline' - 'updated_at')::text, '|' order by t.id))
    into v_gorev_once from project_tasks t;

  -- group_label → WBS eşleştirmesi (iki projede aynı kodlar; kod proje içinde tekil).
  create temp table _wbs_eslesme (
    group_label text primary key,
    wbs_code    text not null,
    wbs_name    text not null,
    parent_code text,
    discipline  text not null,
    sira        int  not null
  ) on commit drop;

  insert into _wbs_eslesme (group_label, wbs_code, wbs_name, parent_code, discipline, sira) values
    ('Mobilizasyon',                     'MOB',       'Mobilizasyon',         null,     'civil',      10),
    ('Mekanik',                          'MEK',       'Mekanik',              null,     'mechanical', 20),
    ('Elektriksel — DC',                 'ELK-DC',    'Elektriksel — DC',     null,     'dc',         30),
    ('Elektriksel — DC › Trafo Merkezi', 'ELK-DC-TM', 'Trafo Merkezi',        'ELK-DC', 'dc',         31),
    ('Elektriksel — OG',                 'ELK-OG',    'Elektriksel — OG',     null,     'mv',         40),
    ('Şalt Sahası',                      'SALT',      'Şalt Sahası',          null,     'mv',         50),
    ('ENH',                              'ENH',       'ENH',                  null,     'enh',        60),
    ('Kamera & Aydınlatma',              'KAM',       'Kamera & Aydınlatma',  null,     'ac',         70),
    ('KABUL',                            'KABUL',     'KABUL',                null,     'general',    80);

  select string_agg(distinct t.project_id || ': ' || coalesce(t.group_label, '<boş>'), '; ')
    into v_eksik
    from project_tasks t
   where t.project_id = any (v_projeler)
     and not exists (select 1 from _wbs_eslesme m where m.group_label = btrim(t.group_label));
  if v_eksik is not null then
    raise exception 'Eşleştirmede olmayan group_label: %', v_eksik;
  end if;

  -- Üst seviye: projede kendisi ya da bir alt dalı kullanılan WBS'ler.
  insert into project_wbs (project_id, wbs_code, name, discipline, parent_id)
  select pr.pid, m.wbs_code, m.wbs_name, m.discipline, null
    from unnest(v_projeler) as pr(pid)
    join _wbs_eslesme m on m.parent_code is null
   where exists (
     select 1 from project_tasks t
       join _wbs_eslesme used on used.group_label = btrim(t.group_label)
      where t.project_id = pr.pid
        and (used.wbs_code = m.wbs_code or used.parent_code = m.wbs_code)
   )
   order by pr.pid, m.sira;

  -- Alt seviye (seviye trigger'la hesaplanır: fn_project_wbs_guard).
  insert into project_wbs (project_id, wbs_code, name, discipline, parent_id)
  select pr.pid, m.wbs_code, m.wbs_name, m.discipline, ust.id
    from unnest(v_projeler) as pr(pid)
    join _wbs_eslesme m on m.parent_code is not null
    join project_wbs ust on ust.project_id = pr.pid and ust.wbs_code = m.parent_code
   where exists (select 1 from project_tasks t where t.project_id = pr.pid and btrim(t.group_label) = m.group_label)
   order by pr.pid, m.sira;

  update project_tasks t
     set wbs_id = w.id,
         discipline = case when t.category = 'elektrik_ac' then 'ac' else m.discipline end
    from _wbs_eslesme m
    join project_wbs w on w.wbs_code = m.wbs_code
   where t.project_id = any (v_projeler)
     and w.project_id = t.project_id
     and btrim(t.group_label) = m.group_label;
  get diagnostics v_gorev_n = row_count;

  select count(*) into v_wbs_n from project_wbs pw where pw.project_id = any (v_projeler);

  if exists (select 1 from project_tasks t where t.project_id = any (v_projeler) and (t.wbs_id is null or t.discipline is null)) then
    raise exception 'WBS veya disiplini boş kalan İsdemir görevi var; geri alındı.';
  end if;

  select count(*) into v_notif_sonra from notifications;
  select md5(coalesce(string_agg(to_jsonb(pr)::text, '|' order by pr.id), '')) into v_risk_sonra from project_risks pr;
  select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) into v_proje_sonra from projects p;
  select md5(string_agg((to_jsonb(t) - 'wbs_id' - 'discipline' - 'updated_at')::text, '|' order by t.id))
    into v_gorev_sonra from project_tasks t;

  if v_notif_once <> v_notif_sonra or v_risk_once <> v_risk_sonra
     or v_proje_once <> v_proje_sonra or v_gorev_once <> v_gorev_sonra then
    raise exception 'Beklenmeyen yan etki (bildirim % → %, risk %, proje %, görev %); geri alındı.',
      v_notif_once, v_notif_sonra, v_risk_once = v_risk_sonra, v_proje_once = v_proje_sonra, v_gorev_once = v_gorev_sonra;
  end if;

  raise notice 'İsdemir WBS: % WBS kaydı, % görev güncellendi; bildirim/risk/proje/görev diğer kolonları değişmedi.', v_wbs_n, v_gorev_n;
end
$mig$;
