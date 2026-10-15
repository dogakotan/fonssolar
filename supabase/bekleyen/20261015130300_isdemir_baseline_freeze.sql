-- !!! AYRI ONAY ADIMI — "teklif planı dondurma". Faz 1'de YAZILDI, ÇALIŞTIRILMADI. !!!
-- Kullanıcı açıkça "baseline'ı dondur / uygula" demeden apply_migration ile uygulanmaz.
--
-- İsdemir (isdemir-diyarbakir-arazi-faz1, -faz2) görevlerinde baseline_start/baseline_end ← planned_start/planned_end.
-- Kaptan Demir, Kayseri (TKY) ve İzmir (TIZ) baseline'larına dokunmaz (WHERE yalnızca iki proje).
--
-- Ön koşullar (biri tutmazsa hiçbir şey yazılmaz):
--   1) Karar İP-2: her görevin aylık plan toplamı (task_monthly_plan.planned_qty) target_qty'ye eşit.
--      Kontrol sorgusu aşağıda ayrıca, salt okunur hâliyle de var (docs/is-plani-faz1-veri-temeli.md §7).
--   2) Baseline daha önce dondurulmamış (iki projede baseline_* tamamen boş). Yeniden dondurma ayrı karar.
--   3) Görevlerin plan tarihleri dolu.
-- Trigger etkisi: baseline_* kolonları trg_sync_project_progress ve trg_tasks_recompute_risks'in
-- UPDATE OF listesinde yok; bildirim/risk/ilerleme üretmez (aşağıda aynı işlemde doğrulanır).
set local lock_timeout = '3s';

do $mig$
declare
  v_projeler    constant text[] := array['isdemir-diyarbakir-arazi-faz1','isdemir-diyarbakir-arazi-faz2'];
  v_uyumsuz     text;
  v_notif_once  bigint;
  v_notif_sonra bigint;
  v_risk_once   text;
  v_risk_sonra  text;
  v_proje_once  text;
  v_proje_sonra text;
  v_n           int;
begin
  -- 1) İP-2: aylık plan toplamı = hedef miktar
  select string_agg(format('%s/%s (hedef %s, aylık toplam %s)', k.project_id, k.task_code, k.target_qty, k.aylik_toplam), '; ' order by k.project_id, k.task_code)
    into v_uyumsuz
    from (
      select t.project_id, t.task_code, t.target_qty, coalesce(sum(mp.planned_qty), 0) as aylik_toplam
        from project_tasks t
        left join task_monthly_plan mp on mp.task_id = t.id
       where t.project_id = any (v_projeler)
         and t.status <> 'iptal'
       group by t.id, t.project_id, t.task_code, t.target_qty
    ) k
   where coalesce(k.target_qty, 0) <> k.aylik_toplam;
  if v_uyumsuz is not null then
    raise exception 'Baseline dondurulamaz (İP-2): aylık plan toplamı hedefle eşit değil: %', v_uyumsuz;
  end if;

  -- 2) Daha önce dondurulmamış
  if exists (select 1 from project_tasks t where t.project_id = any (v_projeler)
              and (t.baseline_start is not null or t.baseline_end is not null)) then
    raise exception 'İsdemir baseline''ı zaten dolu; yeniden dondurma ayrı bir karar gerektirir.';
  end if;

  -- 3) Plan tarihleri dolu
  if exists (select 1 from project_tasks t where t.project_id = any (v_projeler) and t.status <> 'iptal'
              and (t.planned_start is null or t.planned_end is null)) then
    raise exception 'Plan tarihi boş görev var; baseline dondurulamaz.';
  end if;

  select count(*) into v_notif_once from notifications;
  select md5(coalesce(string_agg(to_jsonb(pr)::text, '|' order by pr.id), '')) into v_risk_once from project_risks pr;
  select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) into v_proje_once from projects p;

  update project_tasks t
     set baseline_start = t.planned_start,
         baseline_end   = t.planned_end
   where t.project_id = any (v_projeler);
  get diagnostics v_n = row_count;

  select count(*) into v_notif_sonra from notifications;
  select md5(coalesce(string_agg(to_jsonb(pr)::text, '|' order by pr.id), '')) into v_risk_sonra from project_risks pr;
  select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) into v_proje_sonra from projects p;
  if v_notif_once <> v_notif_sonra or v_risk_once <> v_risk_sonra or v_proje_once <> v_proje_sonra then
    raise exception 'Beklenmeyen yan etki; geri alındı.';
  end if;

  raise notice 'İsdemir baseline donduruldu: % görev.', v_n;
end
$mig$;
