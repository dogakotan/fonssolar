-- ============================================================================
-- FAZ 1 · ADIM 5 — Ekranların DB parçaları — TASLAK (UYGULANMADI) · 12.10.2026
-- Tasarım: docs/proje-kontrol/faz1-adim5-tasarim.md · Kararlar: CLAUDE.md Karar 44 (güncel), 51-59
-- Bağımlılık: B1 (register_raise), B2 (register_audit), AID (task_disciplines, identity guard, A7
--             save_project_category_weights), Adım 4 (f1_wbs_alan_import.sql). Ayrı migration; Adım 4'ten sonra.
-- Test: önce yerel ortamda, sonra canlıda BEGIN…ROLLBACK + parmak izi (taslak-sql/parmak_izi.sql).
--
-- İçerik:
--   A1 get_project_gantt: görev çıktısına activity_id, discipline, wbs/area id ve kodu (imza aynı, jsonb)
--   A2 iç yardımcılar: fn_wbs_chain_area_state (Karar 38 zinciri), fn_task_keep_reason (görev neden silinemez)
--   A3 save_area_wbs_links (WBS'in alan bağlarını tek işlemde eşitler)
--   A4 set_tasks_classification (toplu disiplin/alan/WBS; önizleme varsayılan)
--   A5 save_project_tasks (sihirbaz Ç-B: id/kod ile eşleşme, çıkarılan görev iptal veya silme; önizleme varsayılan)
--   A6 Ağırlıksız kategori (Karar 56): görev tarafı ve ağırlık tarafı ertelenebilir constraint trigger'ları
--   A7 Ç-6 (Karar 55): şantiye şefi project_areas / area_wbs'te yalnızca okuma
-- Karar 44 güncellemesi (iptal etme de yalnızca admin/PM) f1_aid_activity_id.sql A8b'dedir.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A1 · get_project_gantt: Activity ID, disiplin, WBS ve alan alanları ──
-- Gövde 12.10.2026 canlı tanımının aynısı; yalnızca "-- a5" işaretli satırlar eklendi.
create or replace function public.get_project_gantt(p_project_id text, p_filter_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_scope record;
begin
  select * into v_scope from public.get_project_scope(p_project_id);
  if not v_scope.authorized then
    return jsonb_build_object('authorized', false);
  end if;

  return jsonb_build_object(
    'authorized', true,
    'project', (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'capacity_kwp', p.capacity_kwp,
        'location', p.location, 'start_date', p.start_date, 'target_date', p.target_date
      )
      from public.projects p where p.id = p_project_id
    ),
    'tasks', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pt.id, 'task_code', pt.task_code, 'task_name', pt.task_name,
          'group_label', pt.group_label, 'category', pt.category,
          'sub_category', pt.sub_category,
          'planned_start', pt.planned_start, 'planned_end', pt.planned_end,
          'actual_start', pt.actual_start, 'actual_end', pt.actual_end,
          'duration_days', pt.duration_days,
          'progress_pct', pt.progress_pct, 'status', pt.status,
          'responsible', pt.responsible, 'responsible_role', pt.responsible_role,
          'team_size', pt.team_size,
          'equipment_notes', pt.equipment_notes, 'notes', pt.notes,
          'target_qty', pt.target_qty, 'unit', pt.unit, 'total_progress', pt.total_progress,
          'activity_id', pt.activity_id, 'discipline', pt.discipline,                -- a5
          'wbs_id', pt.wbs_id, 'wbs_code', w.wbs_code,                                -- a5
          'area_id', pt.area_id, 'area_code', a.area_code,                            -- a5
          'risk_severity', (
            select r.severity from public.project_risks r
            where r.project_id = pt.project_id and r.rule_code = 'gorev_gecikmesi'
              and r.subject_ref = pt.task_code and r.status <> 'kapatıldı'
            order by case r.severity when 'kritik' then 4 when 'yüksek' then 3 when 'orta' then 2 when 'düşük' then 1 else 0 end desc
            limit 1
          )
        )
        order by pt.planned_start asc nulls last
      ), '[]'::jsonb)
      from public.project_tasks pt
      left join public.project_wbs w on w.id = pt.wbs_id                              -- a5
      left join public.project_areas a on a.id = pt.area_id                           -- a5
      where pt.project_id = p_project_id
    ),
    'task_progress', (
      select coalesce(jsonb_object_agg(task_id::text, round(avg_pct::numeric, 4)), '{}'::jsonb)
      from (
        select pt.id as task_id,
          avg(least(100.0, coalesce(sums.total_qty, 0.0) / nullif(pt.target_qty::numeric, 0) * 100.0)) as avg_pct
        from public.project_tasks pt
        left join lateral (
          select coalesce(sum(pd.qty_added), 0) as total_qty
          from public.progress_daily pd join public.daily_reports dr on dr.id = pd.report_id
          where pd.task_id = pt.id and dr.report_date <= p_filter_date
        ) sums on true
        where pt.project_id = p_project_id and pt.target_qty > 0
        group by pt.id
      ) tp
    ),
    'context', jsonb_build_object(
      'latest_report', (select jsonb_build_object('report_date', dr.report_date, 'notes', dr.notes) from public.daily_reports dr where dr.project_id = p_project_id order by dr.report_date desc limit 1),
      'latest_purchase', (select jsonb_build_object('id', pr.id, 'title', pr.title, 'status', pr.status, 'created_at', pr.created_at) from public.purchase_requests pr where pr.project_id = p_project_id order by pr.created_at desc limit 1),
      'top_risk', (select to_jsonb(r) from public.project_risks r where r.project_id = p_project_id and r.status <> 'kapatıldı' limit 1)
    )
  );
end;
$function$;

-- ── A2 · WBS zinciri ve alan (Karar 38) ──
-- 'undefined' = WBS ve üstlerinde hiç alan bağı yok; 'linked' = alan bağ kümesinde; 'not_linked' = küme dolu, alan yok.
create function public.fn_wbs_chain_area_state(p_wbs_id uuid, p_area_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with recursive anc as (
    select w.id, w.parent_id from public.project_wbs w where w.id = p_wbs_id
    union all
    select w.id, w.parent_id from public.project_wbs w join anc on w.id = anc.parent_id
  )
  select case
    when not exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc)) then 'undefined'
    when exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc) and aw.area_id = p_area_id) then 'linked'
    else 'not_linked' end;
$$;
revoke all on function public.fn_wbs_chain_area_state(uuid, uuid) from public, anon, authenticated;

-- Görev silinemezse nedeni (null = silinebilir). progress_daily ve register/satın alma/risk/BOM FK'leri NO ACTION;
-- daily_tasks SET NULL olduğu için engel değil (12.10.2026 canlı FK listesi).
create function public.fn_task_keep_reason(p_task_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.project_tasks t where t.id = p_task_id and t.activity_id is not null) then 'Activity ID''si var'
    when exists (select 1 from public.progress_daily x where x.task_id = p_task_id)
      or exists (select 1 from public.project_tasks t where t.id = p_task_id and coalesce(t.total_progress, 0) > 0) then 'ilerlemesi var'
    when exists (select 1 from public.purchase_requests x where x.task_id = p_task_id) then 'satın alma talebine bağlı'
    when exists (select 1 from public.procurement_items x where x.task_id = p_task_id) then 'malzeme listesine bağlı'
    when exists (select 1 from public.project_risks x where x.task_id = p_task_id) then 'riske bağlı'
    when exists (select 1 from public.documents x where x.task_id = p_task_id)
      or exists (select 1 from public.rfis x where x.task_id = p_task_id)
      or exists (select 1 from public.decisions x where x.task_id = p_task_id)
      or exists (select 1 from public.project_actions x where x.task_id = p_task_id)
      or exists (select 1 from public.technical_submittals x where x.task_id = p_task_id)
      or exists (select 1 from public.material_approvals x where x.task_id = p_task_id) then 'proje kontrol kaydına bağlı'
  end;
$$;
revoke all on function public.fn_task_keep_reason(uuid) from public, anon, authenticated;

-- ── A3 · Bir WBS'in alan bağlarını eşitle ──
-- SECURITY INVOKER: RLS (Ç-6 sonrası yalnızca admin/PM yazar) ve Adım 4 trigger'ları aynen çalışır.
-- register_raise authenticated'a kapalı olduğundan hatalar aynı biçimde doğrudan fırlatılır.
create function public.save_area_wbs_links(p_wbs_id uuid, p_area_ids uuid[])
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_project text;
  v_ids     uuid[];
  v_bad     uuid[];
  v_del     int;
  v_ins     int;
begin
  if coalesce(public.get_my_role(), '') not in ('admin', 'proje_yoneticisi') then
    raise exception using message = 'forbidden', hint = 'Alan-WBS bağlarını yalnızca admin ve proje yöneticisi düzenler';
  end if;
  select w.project_id into v_project from public.project_wbs w where w.id = p_wbs_id;
  if v_project is null then
    raise exception using message = 'not_found', hint = 'WBS bulunamadı',
      detail = jsonb_build_object('wbs_id', p_wbs_id)::text;
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_area_ids, '{}')) as x where x is not null;
  select array_agg(x) into v_bad from unnest(v_ids) as x
   where not exists (select 1 from public.project_areas a where a.id = x and a.project_id = v_project);
  if v_bad is not null then
    raise exception using message = 'validation', hint = 'Alan bu projede yok',
      detail = jsonb_build_object('area_ids', to_jsonb(v_bad))::text;
  end if;

  delete from public.area_wbs aw where aw.wbs_id = p_wbs_id and not (aw.area_id = any (v_ids));
  get diagnostics v_del = row_count;
  insert into public.area_wbs (project_id, area_id, wbs_id)
  select v_project, x, p_wbs_id from unnest(v_ids) as x
   where not exists (select 1 from public.area_wbs aw where aw.wbs_id = p_wbs_id and aw.area_id = x);
  get diagnostics v_ins = row_count;
  return jsonb_build_object('wbs_id', p_wbs_id, 'inserted', v_ins, 'deleted', v_del);
end $$;
revoke all on function public.save_area_wbs_links(uuid, uuid[]) from public, anon;
grant execute on function public.save_area_wbs_links(uuid, uuid[]) to authenticated;

-- ── A4 · Toplu disiplin / alan / WBS atama (Karar 33) ──
-- SECURITY DEFINER (iç yardımcıyı çağırır); yetki ve proje erişimi içeride. Kimlik koruması (Ç16, Karar 39, 51) ve
-- iptal koruması trigger'larda olduğu için DEFINER bunları aşmaz: bayrak açılmaz, get_my_role() çağıranın rolüdür.
-- NULL parametre = o alan değişmez. En fazla 500 görev, tek proje; gerçek çağrı hepsi ya da hiçbiri.
create function public.set_tasks_classification(
  p_task_ids uuid[], p_discipline text default null, p_area_id uuid default null, p_wbs_id uuid default null,
  p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := public.get_my_role();
  v_ids     uuid[];
  v_missing uuid[];
  v_project text;
  v_nproj   int;
  r         record;
  v_errs    jsonb;
  v_warns   jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_disc    text;
  v_area    uuid;
  v_wbs     uuid;
  v_changes text[];
  v_state   text;
  v_err_n   int := 0;
  v_upd_n   int := 0;
  v_msg     text;
begin
  if v_role is null or v_role not in ('admin', 'proje_yoneticisi') then
    perform public.register_raise('forbidden', 'Toplu atamayı yalnızca admin ve proje yöneticisi yapabilir');
  end if;
  if p_discipline is null and p_area_id is null and p_wbs_id is null then
    perform public.register_raise('validation', 'Disiplin, alan veya WBS seçin', '{"fields":["p_discipline","p_area_id","p_wbs_id"]}');
  end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_task_ids, '{}'::uuid[])) as x where x is not null;
  if v_ids is null then
    perform public.register_raise('validation', 'Görev listesi boş', '{"fields":["p_task_ids"]}');
  end if;
  if cardinality(v_ids) > 500 then
    perform public.register_raise('validation', 'Bir çağrıda en fazla 500 görev',
      jsonb_build_object('count', cardinality(v_ids), 'max', 500));
  end if;
  select array_agg(x) into v_missing from unnest(v_ids) as x
   where not exists (select 1 from public.project_tasks t where t.id = x);
  if v_missing is not null then
    perform public.register_raise('not_found', 'Görev bulunamadı', jsonb_build_object('task_ids', to_jsonb(v_missing)));
  end if;
  select count(distinct t.project_id), min(t.project_id) into v_nproj, v_project
    from public.project_tasks t where t.id = any(v_ids);
  if v_nproj > 1 then
    perform public.register_raise('validation', 'Görevler tek bir projeden olmalı', jsonb_build_object('project_count', v_nproj));
  end if;
  if not public.has_project_access(v_project) then
    perform public.register_raise('forbidden', 'Bu projeye erişim yetkiniz yok', jsonb_build_object('project_id', v_project));
  end if;
  if p_discipline is not null and not exists (select 1 from public.task_disciplines d where d.discipline = p_discipline) then
    perform public.register_raise('validation', 'Bilinmeyen disiplin', '{"fields":["p_discipline"]}');
  end if;
  if p_area_id is not null and not exists (select 1 from public.project_areas a
                                            where a.id = p_area_id and a.project_id = v_project and a.is_active) then
    perform public.register_raise('validation', 'Alan bu projede yok veya pasif', '{"fields":["p_area_id"]}');
  end if;
  if p_wbs_id is not null and not exists (select 1 from public.project_wbs w
                                           where w.id = p_wbs_id and w.project_id = v_project and w.is_active) then
    perform public.register_raise('validation', 'WBS bu projede yok veya pasif', '{"fields":["p_wbs_id"]}');
  end if;

  if not p_dry_run then
    perform 1 from public.project_tasks where id = any(v_ids) order by id for update;
  end if;

  for r in
    select t.id, t.task_code, t.task_name, t.activity_id, t.discipline, t.area_id, t.wbs_id
      from public.project_tasks t where t.id = any(v_ids) order by t.task_code, t.id
  loop
    v_errs := '[]'::jsonb;
    v_warns := '[]'::jsonb;
    v_disc := coalesce(p_discipline, r.discipline);
    v_area := coalesce(p_area_id, r.area_id);
    v_wbs  := coalesce(p_wbs_id, r.wbs_id);
    v_changes := array_remove(array[
      case when v_disc is distinct from r.discipline then 'discipline' end,
      case when v_area is distinct from r.area_id then 'area_id' end,
      case when v_wbs is distinct from r.wbs_id then 'wbs_id' end], null);
    if r.activity_id is not null and ('discipline' = any (v_changes) or 'area_id' = any (v_changes)) then
      v_errs := v_errs || jsonb_build_object('code', 'locked',
        'message', 'Activity ID atanmış görevin disiplini ve alanı değiştirilemez (' || r.activity_id || '); düzeltme yalnızca admin');
    end if;
    if v_wbs is not null and v_area is not null and cardinality(v_changes) > 0 then
      v_state := public.fn_wbs_chain_area_state(v_wbs, v_area);
      if v_state = 'not_linked' then
        if r.activity_id is not null then
          v_errs := v_errs || jsonb_build_object('code', 'area_wbs_not_linked',
            'message', 'Alan bu WBS''e (veya üst WBS''lerine) bağlı değil (Karar 38/51)');
        else
          v_warns := v_warns || jsonb_build_object('code', 'area_wbs_not_linked',
            'message', 'Alan bu WBS''e bağlı değil; bu görevde "Kod ata" engellenir');
        end if;
      end if;
    end if;
    if jsonb_array_length(v_errs) > 0 then v_err_n := v_err_n + 1;
    elsif cardinality(v_changes) > 0 then v_upd_n := v_upd_n + 1; end if;
    v_items := v_items || jsonb_build_object(
      'task_id', r.id, 'task_code', r.task_code, 'task_name', r.task_name, 'activity_id', r.activity_id,
      'action', case when jsonb_array_length(v_errs) > 0 then 'error' when cardinality(v_changes) > 0 then 'update' else 'unchanged' end,
      'changes', to_jsonb(v_changes), 'errors', v_errs, 'warnings', v_warns);
  end loop;

  if not p_dry_run then
    if v_err_n > 0 then
      perform public.register_raise('validation', v_err_n || ' görevde atama yapılamaz; hiçbir görev yazılmadı',
        jsonb_build_object('tasks', (select jsonb_agg(e) from jsonb_array_elements(v_items) as e where e ->> 'action' = 'error')));
    end if;
    begin
      update public.project_tasks t
         set discipline = coalesce(p_discipline, t.discipline),
             area_id    = coalesce(p_area_id, t.area_id),
             wbs_id     = coalesce(p_wbs_id, t.wbs_id)
       where t.id in (select (e ->> 'task_id')::uuid from jsonb_array_elements(v_items) as e where e ->> 'action' = 'update');
    exception when others then
      get stacked diagnostics v_msg = message_text;
      perform public.register_raise('validation', 'Yazma sırasında kural ihlali; hiçbir görev yazılmadı: ' || v_msg,
        jsonb_build_object('error', v_msg));
    end;
  end if;

  return jsonb_build_object('project_id', v_project, 'dry_run', p_dry_run, 'items', v_items,
    'summary', jsonb_build_object('total', jsonb_array_length(v_items), 'update', v_upd_n, 'error_count', v_err_n,
      'unchanged', jsonb_array_length(v_items) - v_upd_n - v_err_n,
      'written', case when p_dry_run then 0 else v_upd_n end));
end $$;
revoke all on function public.set_tasks_classification(uuid[], text, uuid, uuid, boolean) from public, anon;
grant execute on function public.set_tasks_classification(uuid[], text, uuid, uuid, boolean) to authenticated;

-- ── A5 · Sihirbaz görev kaydı (Ç-B, Karar 40, 59) ──
-- p_tasks projenin TAM görev listesidir (dizi). Her öğe: isteğe bağlı id + aşağıdaki beyaz listedeki kolonlar.
-- Eşleşme: id varsa id (projede olmalı), yoksa task_code. Güncellemede yalnızca öğede bulunan kolonlar yazılır;
-- öğede olmayan kolon (ör. group_label) korunur. activity_id, project_id, duration_days (generated) yazılmaz.
-- Listede olmayan mevcut görev: Activity ID'si veya ilerlemesi (progress_daily satırı ya da total_progress > 0) varsa
-- iptal edilir, yoksa silinir. Günlük rapor ilerlemesi olan görevde total_progress/progress_pct öğeden yazılmaz.
-- p_weights doluysa kategori ağırlıkları da aynı işlemde kaydedilir (save_project_category_weights); ağırlıksız
-- kategori kontrolü (A6) commit anına ertelenir, böylece sıra bağımlılığı olmaz.
-- Önizleme varsayılan; gerçek kayıt hepsi ya da hiçbiri. Yalnızca admin ve proje yöneticisi.
create function public.save_project_tasks(p_project_id text, p_tasks jsonb, p_dry_run boolean default true,
                                          p_weights jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := public.get_my_role();
  v_cols    constant text[] := array['task_code','task_name','category','sub_category','group_label','planned_start',
    'planned_end','actual_start','actual_end','status','responsible','responsible_role','team_size','equipment_notes',
    'notes','unit','target_qty','total_progress','progress_pct','discipline','area_id','wbs_id','baseline_start',
    'baseline_end','primavera_id','forecast_start','forecast_end'];
  v_wcats   text[];
  e         jsonb;
  v_rn      int;
  v_item    jsonb;
  v_unknown text[];
  v_id      uuid;
  v_code    text;
  v_old     public.project_tasks;
  v_new     public.project_tasks;
  v_has_pd  boolean;
  v_errs    jsonb;
  v_warns   jsonb;
  v_changes text[];
  v_action  text;
  v_state   text;
  v_msg     text;
  v_err_n   int;
  v_report  jsonb;
  rw        record;
begin
  if v_role is null or v_role not in ('admin', 'proje_yoneticisi') then
    perform public.register_raise('forbidden', 'Görev listesini yalnızca admin ve proje yöneticisi kaydedebilir');
  end if;
  if not exists (select 1 from public.projects pr where pr.id = p_project_id) then
    perform public.register_raise('not_found', 'Proje bulunamadı', jsonb_build_object('project_id', p_project_id));
  end if;
  if not public.has_project_access(p_project_id) then
    perform public.register_raise('forbidden', 'Bu projeye erişim yetkiniz yok', jsonb_build_object('project_id', p_project_id));
  end if;
  if jsonb_typeof(coalesce(p_tasks, 'null')) <> 'array' then
    perform public.register_raise('validation', 'Görev listesi okunamadı (dizi olmalı)');
  end if;
  if jsonb_array_length(p_tasks) > 5000 then
    perform public.register_raise('validation', 'En fazla 5000 görev', jsonb_build_object('count', jsonb_array_length(p_tasks)));
  end if;
  if p_weights is not null and jsonb_typeof(p_weights) <> 'array' then
    perform public.register_raise('validation', 'Kategori ağırlıkları okunamadı (dizi olmalı)');
  end if;

  -- Ağırlıksız kategori kontrolünün kümesi: p_weights verildiyse o, yoksa projenin tablosu; tablo boşsa kontrol yok
  if p_weights is not null then
    select array_agg(x ->> 'category') into v_wcats from jsonb_array_elements(p_weights) as x;
  else
    select array_agg(w.category::text) into v_wcats from public.project_category_weights w where w.project_id = p_project_id;
  end if;

  if not p_dry_run then
    perform 1 from public.projects pr where pr.id = p_project_id for update;
    perform 1 from public.project_tasks t where t.project_id = p_project_id order by t.id for update;
  end if;

  drop table if exists pg_temp._spt;
  create temp table _spt (rn int, task_id uuid, task_code text, action text, changes text[],
                          errors jsonb, warnings jsonb, new_row jsonb) on commit drop;

  for e, v_rn in select x.e, x.o::int from jsonb_array_elements(p_tasks) with ordinality as x(e, o) loop
    v_errs := '[]'::jsonb;
    v_warns := '[]'::jsonb;
    v_changes := '{}';
    v_id := null;
    v_old := null;
    v_new := null;
    v_has_pd := false;
    if jsonb_typeof(e) <> 'object' then
      insert into _spt values (v_rn, null, null, 'error', null,
        jsonb_build_array(jsonb_build_object('code', 'value_invalid', 'message', 'Satır nesne değil')), '[]', null);
      continue;
    end if;
    select coalesce(jsonb_object_agg(k.key, k.value), '{}') into v_item from jsonb_each(e) as k where k.key = any (v_cols);
    select array_agg(k.key order by k.key) into v_unknown from jsonb_each(e) as k
     where not (k.key = any (v_cols)) and k.key not in ('id', 'project_id');
    if v_unknown is not null then
      v_warns := v_warns || jsonb_build_object('code', 'unknown_fields', 'message', 'Tanınmayan alanlar yok sayıldı: ' || array_to_string(v_unknown, ', '));
    end if;
    v_code := nullif(btrim(coalesce(e ->> 'task_code', '')), '');
    if v_code is null then
      v_errs := v_errs || jsonb_build_object('code', 'task_code_missing', 'message', 'Görev kodu zorunlu');
    else
      v_item := v_item || jsonb_build_object('task_code', v_code);
    end if;

    if nullif(e ->> 'id', '') is not null then
      begin
        v_id := (e ->> 'id')::uuid;
      exception when others then
        v_id := null;
      end;
      select t.* into v_old from public.project_tasks t where t.id = v_id and t.project_id = p_project_id;
      if v_old.id is null then
        v_errs := v_errs || jsonb_build_object('code', 'id_not_found', 'message', 'Görev bu projede yok (id)');
      end if;
    elsif v_code is not null then
      select t.* into v_old from public.project_tasks t where t.project_id = p_project_id and t.task_code = v_code;
    end if;

    begin
      if v_old.id is not null then
        v_new := jsonb_populate_record(v_old, v_item);
      else
        v_new := jsonb_populate_record(null::public.project_tasks, v_item || jsonb_build_object('project_id', p_project_id));
      end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_errs := v_errs || jsonb_build_object('code', 'value_invalid', 'message', 'Geçersiz değer: ' || v_msg);
    end;

    if v_new.project_id is not null or v_old.id is not null then
      if v_old.id is null then
        if v_new.task_name is null or btrim(v_new.task_name) = '' or v_new.category is null
           or v_new.planned_start is null or v_new.planned_end is null then
          v_errs := v_errs || jsonb_build_object('code', 'required_missing',
            'message', 'Yeni görevde ad, kategori, plan başlangıç ve plan bitiş zorunlu');
        end if;
      else
        v_has_pd := exists (select 1 from public.progress_daily pd where pd.task_id = v_old.id);
        if v_has_pd and (v_new.total_progress is distinct from v_old.total_progress
                         or v_new.progress_pct is distinct from v_old.progress_pct) then
          v_new.total_progress := v_old.total_progress;
          v_new.progress_pct := v_old.progress_pct;
          v_warns := v_warns || jsonb_build_object('code', 'progress_from_reports',
            'message', 'Görevin ilerlemesi günlük raporlardan geliyor; girilen miktar yok sayıldı');
        end if;
        select array_agg(c order by c) into v_changes from unnest(v_cols) as c
         where (to_jsonb(v_new) -> c) is distinct from (to_jsonb(v_old) -> c);
        v_changes := coalesce(v_changes, '{}');
        if v_old.activity_id is not null
           and (v_new.discipline is distinct from v_old.discipline or v_new.area_id is distinct from v_old.area_id) then
          v_errs := v_errs || jsonb_build_object('code', 'locked',
            'message', 'Activity ID atanmış görevin disiplini ve alanı değiştirilemez (' || v_old.activity_id || ')');
        end if;
        if v_old.activity_id is not null and v_new.wbs_id is not null and v_new.area_id is not null
           and (v_new.wbs_id is distinct from v_old.wbs_id or v_new.area_id is distinct from v_old.area_id) then
          v_state := public.fn_wbs_chain_area_state(v_new.wbs_id, v_new.area_id);
          if v_state = 'not_linked' then
            v_errs := v_errs || jsonb_build_object('code', 'area_wbs_not_linked',
              'message', 'Activity ID''li görevin alanı yeni WBS''e bağlı değil (Karar 51)');
          end if;
        end if;
      end if;
      if v_wcats is not null and v_new.category is not null and coalesce(v_new.status::text, '') <> 'iptal'
         and (v_old.id is null or v_new.category is distinct from v_old.category)
         and not (v_new.category::text = any (v_wcats)) then
        v_errs := v_errs || jsonb_build_object('code', 'category_weight_missing',
          'message', 'Bu kategori için ağırlık tanımlayın; fiziksel değilse %0 girin: ' || v_new.category);
      end if;
    end if;

    v_action := case when jsonb_array_length(v_errs) > 0 then 'error'
                     when v_old.id is null then 'insert'
                     when cardinality(v_changes) > 0 then 'update'
                     else 'unchanged' end;
    insert into _spt values (v_rn, v_old.id, v_code, v_action,
      case when v_action = 'update' then v_changes end, v_errs, v_warns,
      case when v_action in ('insert', 'update') then to_jsonb(v_new) end);
  end loop;

  -- Listede iki kez geçen kod veya id
  update _spt s set action = 'error',
         errors = s.errors || jsonb_build_object('code', 'duplicate_in_payload', 'message', 'Görev kodu listede tekrar ediyor: ' || s.task_code)
   where s.task_code in (select task_code from _spt where task_code is not null group by task_code having count(*) > 1);
  update _spt s set action = 'error',
         errors = s.errors || jsonb_build_object('code', 'duplicate_in_payload', 'message', 'Aynı görev listede iki kez var')
   where s.task_id in (select task_id from _spt where task_id is not null group by task_id having count(*) > 1);

  select count(*) into v_err_n from _spt where action = 'error';

  v_report := jsonb_build_object(
    'project_id', p_project_id,
    'dry_run', p_dry_run,
    'items', coalesce((select jsonb_agg(jsonb_build_object('row', rn, 'task_id', task_id, 'task_code', task_code,
               'action', action, 'changes', to_jsonb(changes), 'errors', errors, 'warnings', warnings) order by rn) from _spt), '[]'),
    'removed', coalesce((
      select jsonb_agg(jsonb_build_object('task_id', t.id, 'task_code', t.task_code, 'task_name', t.task_name,
               'activity_id', t.activity_id,
               'action', case when kr.reason is null then 'delete'
                              when t.status = 'iptal' then 'keep_cancelled'
                              else 'cancel' end,
               'reason', kr.reason)
             order by t.task_code)
        from public.project_tasks t
        cross join lateral (select public.fn_task_keep_reason(t.id) as reason) kr
       where t.project_id = p_project_id
         and not exists (select 1 from _spt s where s.task_id = t.id)), '[]'));
  v_report := v_report || jsonb_build_object('summary', jsonb_build_object(
    'insert', (select count(*) from _spt where action = 'insert'),
    'update', (select count(*) from _spt where action = 'update'),
    'unchanged', (select count(*) from _spt where action = 'unchanged'),
    'error_count', v_err_n,
    'cancel', (select count(*) from jsonb_array_elements(v_report -> 'removed') x where x ->> 'action' = 'cancel'),
    'delete', (select count(*) from jsonb_array_elements(v_report -> 'removed') x where x ->> 'action' = 'delete')));

  if p_dry_run then
    return v_report || jsonb_build_object('note', 'Önizleme: hiçbir şey yazılmadı.');
  end if;
  if v_err_n > 0 then
    perform public.register_raise('validation', v_err_n || ' satırda hata; hiçbir görev yazılmadı',
      jsonb_build_object('items', (select jsonb_agg(x) from jsonb_array_elements(v_report -> 'items') x where x ->> 'action' = 'error')));
  end if;

  begin
    set constraints public.trg_project_tasks_category_weight_guard, public.trg_project_category_weights_keep_used deferred;
    if p_weights is not null then
      perform public.save_project_category_weights(p_project_id, p_weights);
    end if;
    for rw in select s.task_id, s.new_row from _spt s where s.action = 'update' order by s.rn loop
      v_new := jsonb_populate_record(null::public.project_tasks, rw.new_row);
      update public.project_tasks t set
        task_code = v_new.task_code, task_name = v_new.task_name, category = v_new.category,
        sub_category = v_new.sub_category, group_label = v_new.group_label,
        planned_start = v_new.planned_start, planned_end = v_new.planned_end,
        actual_start = v_new.actual_start, actual_end = v_new.actual_end, status = v_new.status,
        responsible = v_new.responsible, responsible_role = v_new.responsible_role, team_size = v_new.team_size,
        equipment_notes = v_new.equipment_notes, notes = v_new.notes, unit = v_new.unit, target_qty = v_new.target_qty,
        total_progress = v_new.total_progress, progress_pct = v_new.progress_pct, discipline = v_new.discipline,
        area_id = v_new.area_id, wbs_id = v_new.wbs_id, baseline_start = v_new.baseline_start,
        baseline_end = v_new.baseline_end, primavera_id = v_new.primavera_id,
        forecast_start = v_new.forecast_start, forecast_end = v_new.forecast_end
       where t.id = rw.task_id;
    end loop;
    for rw in select s.new_row from _spt s where s.action = 'insert' order by s.rn loop
      v_new := jsonb_populate_record(null::public.project_tasks, rw.new_row);
      insert into public.project_tasks (project_id, task_code, task_name, category, sub_category, group_label,
        planned_start, planned_end, actual_start, actual_end, status, responsible, responsible_role, team_size,
        equipment_notes, notes, unit, target_qty, total_progress, progress_pct, discipline, area_id, wbs_id,
        baseline_start, baseline_end, primavera_id, forecast_start, forecast_end)
      values (p_project_id, v_new.task_code, v_new.task_name, v_new.category, v_new.sub_category, v_new.group_label,
        v_new.planned_start, v_new.planned_end, v_new.actual_start, v_new.actual_end,
        coalesce(v_new.status, 'beklemede'), v_new.responsible, v_new.responsible_role, v_new.team_size,
        v_new.equipment_notes, v_new.notes, v_new.unit, v_new.target_qty, coalesce(v_new.total_progress, 0),
        coalesce(v_new.progress_pct, 0), v_new.discipline, v_new.area_id, v_new.wbs_id,
        v_new.baseline_start, v_new.baseline_end, v_new.primavera_id, v_new.forecast_start, v_new.forecast_end);
    end loop;
    update public.project_tasks t set status = 'iptal'
     where t.id in (select (x ->> 'task_id')::uuid from jsonb_array_elements(v_report -> 'removed') x where x ->> 'action' = 'cancel');
    delete from public.project_tasks t
     where t.id in (select (x ->> 'task_id')::uuid from jsonb_array_elements(v_report -> 'removed') x where x ->> 'action' = 'delete');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform public.register_raise('validation', 'Kayıt sırasında kural ihlali; hiçbir görev yazılmadı: ' || v_msg,
      jsonb_build_object('error', v_msg));
  end;
  return v_report || jsonb_build_object('written', true);
end $$;
revoke all on function public.save_project_tasks(text, jsonb, boolean, jsonb) from public, anon;
grant execute on function public.save_project_tasks(text, jsonb, boolean, jsonb) to authenticated;

-- ── A6 · Ağırlıksız kategori (Karar 56) ──
-- Görev tarafı: yeni görevde veya kategori değişince, projenin ağırlık tablosu doluysa ve kategori orada yoksa red.
-- İptal görev kontrol dışı. Ertelenebilir (başlangıçta anında): save_project_tasks ağırlıkla birlikte yazarken
-- commit anına erteler. Mevcut eksik kategorili görevler dokunulmadıkça etkilenmez.
create function public.fn_project_tasks_category_weight_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.category is not distinct from old.category then
    return null;
  end if;
  if new.status = 'iptal' then
    return null;
  end if;
  if not exists (select 1 from public.project_tasks t where t.id = new.id and t.category = new.category) then
    return null;  -- satır sonradan silinmiş veya kategori yeniden değişmiş (ertelenmiş kontrol)
  end if;
  if exists (select 1 from public.project_category_weights w where w.project_id = new.project_id)
     and not exists (select 1 from public.project_category_weights w
                      where w.project_id = new.project_id and w.category = new.category) then
    raise exception 'Bu kategori için ağırlık tanımlayın; fiziksel değilse %%0 girin: %', new.category
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.fn_project_tasks_category_weight_guard() from public, anon, authenticated;

create constraint trigger trg_project_tasks_category_weight_guard
  after insert or update of category on public.project_tasks
  deferrable initially immediate
  for each row execute function public.fn_project_tasks_category_weight_guard();

-- Ağırlık tarafı: görevi (iptal hariç) olan kategorinin satırı silinemez / başka kategoriye çevrilemez.
-- save_project_category_weights tabloyu silip yeniden yazdığı için kontrol commit anında (başlangıçta ertelenmiş).
-- Proje silinirken (CASCADE) proje satırı görünmediği için izin verilir.
create function public.fn_project_category_weights_keep_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if tg_op = 'UPDATE' and new.category is not distinct from old.category and new.project_id is not distinct from old.project_id then
    return null;
  end if;
  if not exists (select 1 from public.projects p where p.id = old.project_id) then
    return null;
  end if;
  if exists (select 1 from public.project_category_weights w where w.project_id = old.project_id and w.category = old.category) then
    return null;
  end if;
  select count(*) into v_n from public.project_tasks t
   where t.project_id = old.project_id and t.category = old.category and t.status <> 'iptal';
  if v_n > 0 then
    raise exception 'Görevi olan kategori ağırlık tablosundan çıkarılamaz: % (% görev); fiziksel değilse %%0 girin', old.category, v_n
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
revoke all on function public.fn_project_category_weights_keep_used() from public, anon, authenticated;

create constraint trigger trg_project_category_weights_keep_used
  after delete or update of category, project_id on public.project_category_weights
  deferrable initially deferred
  for each row execute function public.fn_project_category_weights_keep_used();

-- ── A7 · Ç-6 (Karar 55): şantiye şefi WBS/alan/alan-WBS'te yalnızca okuma ──
-- Policy ifadeleri 12.10.2026 canlı tanımlarıyla aynı; yalnızca santiye_sefi dalı çıkarıldı. SELECT policy'leri değişmez.
alter policy project_areas_insert on public.project_areas
  with check (((( select get_my_role()) = 'admin'::text)
               or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))));
alter policy project_areas_update on public.project_areas
  using (((( select get_my_role()) = 'admin'::text)
          or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))))
  with check (((( select get_my_role()) = 'admin'::text)
               or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))));
alter policy area_wbs_insert on public.area_wbs
  with check (((( select get_my_role()) = 'admin'::text)
               or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))));
alter policy area_wbs_delete on public.area_wbs
  using (((( select get_my_role()) = 'admin'::text)
          or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))));

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL (yalnızca gerekirse)
-- ############################################################################
/*
begin;
-- A7: şantiye şefi dalını geri ekle (12.10.2026 canlı tanımları)
alter policy project_areas_insert on public.project_areas
  with check (((( select get_my_role()) = 'admin'::text)
               or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))
               or ((( select get_my_role()) = 'santiye_sefi'::text)
                   and (project_id = ( select p.project_id from profiles p where (p.id = ( select auth.uid())))))));
alter policy project_areas_update on public.project_areas
  using (((( select get_my_role()) = 'admin'::text)
          or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))
          or ((( select get_my_role()) = 'santiye_sefi'::text)
              and (project_id = ( select p.project_id from profiles p where (p.id = ( select auth.uid())))))))
  with check (((( select get_my_role()) = 'admin'::text)
               or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))
               or ((( select get_my_role()) = 'santiye_sefi'::text)
                   and (project_id = ( select p.project_id from profiles p where (p.id = ( select auth.uid())))))));
alter policy area_wbs_insert on public.area_wbs
  with check (((( select get_my_role()) = 'admin'::text)
               or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))
               or ((( select get_my_role()) = 'santiye_sefi'::text)
                   and (project_id = ( select p.project_id from profiles p where (p.id = ( select auth.uid())))))));
alter policy area_wbs_delete on public.area_wbs
  using (((( select get_my_role()) = 'admin'::text)
          or ((( select get_my_role()) = 'proje_yoneticisi'::text) and has_project_access(project_id))
          or ((( select get_my_role()) = 'santiye_sefi'::text)
              and (project_id = ( select p.project_id from profiles p where (p.id = ( select auth.uid())))))));
-- A6
drop trigger if exists trg_project_category_weights_keep_used on public.project_category_weights;
drop function if exists public.fn_project_category_weights_keep_used();
drop trigger if exists trg_project_tasks_category_weight_guard on public.project_tasks;
drop function if exists public.fn_project_tasks_category_weight_guard();
-- A5-A2
drop function if exists public.save_project_tasks(text, jsonb, boolean, jsonb);
drop function if exists public.set_tasks_classification(uuid[], text, uuid, uuid, boolean);
drop function if exists public.save_area_wbs_links(uuid, uuid[]);
drop function if exists public.fn_task_keep_reason(uuid);
drop function if exists public.fn_wbs_chain_area_state(uuid, uuid);
-- A1: get_project_gantt'ın 12.10.2026 canlı gövdesi (bu dosyadaki A1'den "-- a5" satırları çıkarılmış hali)
commit;
*/
