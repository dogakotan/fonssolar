-- ============================================================================
-- FAZ 1 · ADIM 3 — Activity ID üretimi, Ç16 yazma kuralı, iptal görev hesapları — TASLAK (UYGULANMADI) · 09.10.2026
-- Tasarım: docs/proje-kontrol/faz1-adim3-tasarim.md · Kararlar: CLAUDE.md Karar 18, 20, 30, 37-43
-- Doğrulama: taslak-sql/f1_dogrulama.sql (R6-R16) · Testler: f1_adim3_testler_oturum{1b,2}.sql
-- Bağımlılık: B1 (register_raise), B2 (register_audit), B4 (bu dosya B4'ün fonksiyonunu genişletir),
--             F1 A2 (alan kodu tiresiz). Ayrı migration; sıra B4 → Adım 3 (Karar 42).
--
-- İçerik:
--   A1 task_disciplines + project_tasks.discipline FK (Karar 37)
--   A2 activity_id_counters (grup başına son numara; kullanıcı erişimi yok)
--   A3 fn_project_tasks_identity_guard son hali (Ç16 + Karar 39) ve silme koruması (Karar 40)
--   A3b görev tarafında alan-WBS kuralı (Karar 51): ID'li görevde WBS/alan değişikliği Karar 38'e uymalı
--   A4 WBS değişikliği audit'i (Karar 39)
--   A5 assign_activity_ids / assign_activity_id (Karar 18, 38, 41, 43)
--   A6 admin_correct_task_activity_id genişletilmiş (Karar 39; B4'ün 3 parametreli sürümünün yerine)
--   A7 iptal görevleri hesaplardan çıkarma (Karar 40): fn_sync_project_progress, save_project_category_weights,
--      get_project_by_date, get_santiye_dashboard, sync_task_progress_from_daily, add_task_progress,
--      vw_project_progress_summary. İmzalar ve çıktı biçimleri değişmez; yalnızca iptal filtresi eklenir.
--   A8 iptal görev koruması: progress_daily'de iptal göreve yeni ilerleme reddi (günlük rapor dahil), iptal görevi
--      yalnızca admin/proje_yoneticisi yeniden açar, save_daily_report iptal görevin eski satırını korur.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A1 · Disiplin listesi ──
create table public.task_disciplines (
  discipline text primary key,
  id_code    text not null unique,
  label_tr   text not null,
  sort_order smallint not null,
  constraint task_disciplines_key_format check (discipline ~ '^[a-z]+$'),
  constraint task_disciplines_code_format check (id_code ~ '^[A-Z]{2,3}$')
);
comment on table public.task_disciplines is
  'Görev disiplini sözlüğü ve Activity ID kısaltması (Karar 20, 37). Satırları yalnızca migration ekler.';
insert into public.task_disciplines (discipline, id_code, label_tr, sort_order) values
  ('mechanical', 'MEC', 'Mekanik', 1),
  ('dc',         'DC',  'DC Elektrik', 2),
  ('ac',         'AC',  'AC Elektrik', 3),
  ('mv',         'MV',  'OG (MV)', 4),
  ('hv',         'HV',  'YG (HV)', 5),
  ('enh',        'EIH', 'Enerji İletim Hattı', 6),
  ('civil',      'CIV', 'İnşaat', 7),
  ('scada',      'SCA', 'SCADA', 8),
  ('general',    'GEN', 'Genel', 9);

alter table public.task_disciplines enable row level security;
create policy task_disciplines_select on public.task_disciplines for select to authenticated using (true);
revoke all on public.task_disciplines from anon, authenticated;
grant select on public.task_disciplines to authenticated;

-- Mevcut 228 görevde discipline boş; FK boş değere izin verir.
alter table public.project_tasks
  add constraint project_tasks_discipline_fk foreign key (discipline)
  references public.task_disciplines (discipline) on update restrict on delete restrict;
create index idx_project_tasks_discipline on public.project_tasks (discipline) where discipline is not null;

-- ── A2 · Numara sayacı (proje + disiplin + alan) ──
create table public.activity_id_counters (
  project_id text not null references public.projects (id) on delete cascade,
  discipline text not null references public.task_disciplines (discipline),
  area_id    uuid not null,
  last_no    integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (project_id, discipline, area_id),
  constraint activity_id_counters_area_fk foreign key (project_id, area_id)
    references public.project_areas (project_id, id) on delete cascade,
  constraint activity_id_counters_last_no_check check (last_no >= 0)
);
comment on table public.activity_id_counters is
  'Activity ID grubu başına verilen son numara. Yalnızca assign_activity_ids yazar; silinen/düzeltilen numara tekrar kullanılmaz.';
alter table public.activity_id_counters enable row level security;
revoke all on public.activity_id_counters from anon, authenticated;

-- ── A3 · Kimlik koruması: son hali (Ç16, Karar 30, 39, 42) ──
-- Activity ID yalnızca iki yoldan yazılır:
--   * assign_activity_ids  : boş → değer, bayrak fons.activity_id_assign = on
--   * admin_correct_…      : her değişiklik,  bayrak fons.activity_id_fix    = on
-- Bayrak tek başına yetmez: çalışan kullanıcı ilgili SECURITY DEFINER fonksiyonun sahibi olmalı.
-- authenticated / service_role ile yapılan doğrudan yazmada current_user sahibi değildir; bayrak taklit edilse de reddedilir.
create or replace function public.fn_project_tasks_identity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_assign boolean := false;
  v_fix    boolean := false;
begin
  if coalesce(current_setting('fons.activity_id_assign', true), '') = 'on' then
    v_assign := coalesce(current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
                                         where p.oid = to_regprocedure('public.assign_activity_ids(uuid[],boolean)')), false);
  end if;
  if coalesce(current_setting('fons.activity_id_fix', true), '') = 'on' then
    v_fix := coalesce(current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
                                      where p.oid = to_regprocedure('public.admin_correct_task_activity_id(uuid,text,text,text,uuid)')), false);
  end if;

  if tg_op = 'INSERT' then
    if new.activity_id is not null then
      raise exception 'Activity ID doğrudan yazılamaz; "Kod ata" (assign_activity_ids) kullanılır';
    end if;
  else
    if old.activity_id is null and new.activity_id is not null and not (v_assign or v_fix) then
      raise exception 'Activity ID doğrudan yazılamaz; "Kod ata" (assign_activity_ids) kullanılır';
    end if;
    if old.activity_id is not null and new.activity_id is distinct from old.activity_id and not v_fix then
      raise exception 'Atanmış Activity ID değiştirilemez: %', old.activity_id;
    end if;
    if old.activity_id is not null and not v_fix
       and (new.discipline is distinct from old.discipline or new.area_id is distinct from old.area_id) then
      raise exception 'Activity ID atanmış görevin disiplini ve alanı değiştirilemez (%); düzeltme yalnızca admin_correct_task_activity_id ile', old.activity_id;
    end if;
    if old.activity_id is not null and new.project_id is distinct from old.project_id then
      raise exception 'Activity ID atanmış görevin projesi değiştirilemez: %', old.activity_id;
    end if;
  end if;

  if new.wbs_id is not null
     and (tg_op = 'INSERT' or new.wbs_id is distinct from old.wbs_id) then
    if exists (select 1 from public.project_wbs w where w.id = new.wbs_id and not w.is_active) then
      raise exception 'Pasif WBS aktiviteye atanamaz';
    end if;
  end if;
  if new.area_id is not null
     and (tg_op = 'INSERT' or new.area_id is distinct from old.area_id) then
    if exists (select 1 from public.project_areas a where a.id = new.area_id and not a.is_active) then
      raise exception 'Pasif alan aktiviteye atanamaz';
    end if;
  end if;
  return new;
end;
$$;

-- Silme koruması (Karar 40). Proje silinirken (CASCADE) proje satırı artık görünmediği için izin verilir.
-- SECURITY DEFINER: proje satırı RLS'ten bağımsız aransın.
create function public.fn_project_tasks_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.activity_id is not null
     and exists (select 1 from public.projects p where p.id = old.project_id) then
    raise exception 'Activity ID atanmış görev silinemez (%); görevi iptal edin (durum: iptal)', old.activity_id;
  end if;
  return old;
end $$;
revoke all on function public.fn_project_tasks_delete_guard() from public, anon, authenticated;

create trigger trg_project_tasks_delete_guard
  before delete on public.project_tasks
  for each row execute function public.fn_project_tasks_delete_guard();

-- A3b · Görev tarafında alan-WBS kuralı (Karar 51; Karar 39'u daraltır). ID'li görevde WBS veya alan değişirse
-- (doğrudan yazma veya B4 alan düzeltmesi) Karar 38'in karma kuralı uygulanır: yeni WBS zincirinde (WBS + üstleri)
-- alan bağı tanımlıysa görevin alanı aralarında olmalı; hiç bağ yoksa serbest. ID'siz görev ve ID'nin temizlendiği
-- B4 çağrısı kontrol dışı.
-- Ayrı trigger, çünkü fn_project_tasks_identity_guard invoker kalmak zorunda (bayrak sahipliği current_user'a bakar);
-- bu kontrol SECURITY DEFINER: RLS bağ satırlarını gizlese de sonuç değişmez. Ad sırası: BEFORE trigger'lar ada göre
-- çalışır; "trg_project_tasks_wbs_area_link_guard" kimlik korumasından sonra gelir, kilit mesajı önce görünür.
create function public.fn_project_tasks_wbs_area_link_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_links boolean;
  v_linked    boolean;
  v_area_code text;
begin
  if new.activity_id is null or new.wbs_id is null or new.area_id is null
     or (new.wbs_id is not distinct from old.wbs_id and new.area_id is not distinct from old.area_id) then
    return new;
  end if;
  with recursive anc as (
    select w.id, w.parent_id from public.project_wbs w where w.id = new.wbs_id
    union all
    select w.id, w.parent_id from public.project_wbs w join anc on w.id = anc.parent_id
  )
  select exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc)),
         exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc) and aw.area_id = new.area_id)
    into v_has_links, v_linked;
  if v_has_links and not v_linked then
    select a.area_code into v_area_code from public.project_areas a where a.id = new.area_id;
    raise exception 'Activity ID''li görevin alanı (%) yeni WBS''e veya üst WBS''lerine bağlı değil (%)', v_area_code, new.activity_id
      using hint = 'Önce Alan-WBS bağını ekleyin ya da bağlı bir alan/WBS seçin (Karar 38)';
  end if;
  return new;
end $$;
revoke all on function public.fn_project_tasks_wbs_area_link_guard() from public, anon, authenticated;

create trigger trg_project_tasks_wbs_area_link_guard
  before update of wbs_id, area_id on public.project_tasks
  for each row execute function public.fn_project_tasks_wbs_area_link_guard();

-- ── A4 · ID'li görevde WBS değişikliği audit'e (Karar 39) ──
create function public.fn_project_tasks_wbs_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.activity_id is not null and new.wbs_id is distinct from old.wbs_id then
    insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
    values (new.project_id, 'project_tasks', new.id, 'update',
            jsonb_build_object('wbs_id', jsonb_build_array(old.wbs_id, new.wbs_id)),
            nullif(current_setting('fons.audit_reason', true), ''));
  end if;
  return null;
end $$;
revoke all on function public.fn_project_tasks_wbs_audit() from public, anon, authenticated;

create trigger trg_project_tasks_wbs_audit
  after update of wbs_id on public.project_tasks
  for each row execute function public.fn_project_tasks_wbs_audit();

-- ── A5 · Kod önerme ve atama ──
-- Biçim {PROJE}-{KISALTMA}-{ALAN}-{NNNN}; grup = proje + disiplin + alan; onar artar; 4 haneye kadar sıfır, kırpma yok.
-- Eşzamanlılık: (1) görev satırları id sırasıyla FOR UPDATE, (2) sayaç satırları (disiplin, alan kodu) sırasıyla
-- FOR UPDATE; ikinci çağrı birincinin commit'ini bekler ve onun yazdıklarını görür. Sonraki numara =
-- max(sayaç, gruptaki mevcut en büyük numara) + 10. Benzersizlik indeksi son güvence (çakışırsa 'duplicate').
create function public.assign_activity_ids(p_task_ids uuid[], p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.get_my_role();
  v_ids       uuid[];
  v_missing   uuid[];
  v_project   text;
  v_nproj     int;
  v_prefix    text;
  r           record;
  v_errs      jsonb;
  v_warns     jsonb;
  v_items     jsonb := '[]'::jsonb;
  v_out       jsonb := '[]'::jsonb;
  v_item      jsonb;
  v_has_links boolean;
  v_linked    boolean;
  v_gkey      text;
  v_base      text;
  v_last      int;
  v_max       int;
  v_cur       int;
  v_aid       text;
  v_err_n     int := 0;
  v_warn_n    int := 0;
  v_ok_n      int := 0;
  v_constraint text;
begin
  if v_role is null or v_role not in ('admin', 'proje_yoneticisi') then
    perform public.register_raise('forbidden', 'Activity ID atamasını yalnızca admin ve proje yöneticisi yapabilir');
  end if;

  select array_agg(distinct x) into v_ids
    from unnest(coalesce(p_task_ids, '{}'::uuid[])) as x where x is not null;
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

  if not p_dry_run then
    perform 1 from public.project_tasks where id = any(v_ids) order by id for update;
  end if;

  select s.prefix into v_prefix from public.project_register_settings s where s.project_id = v_project;

  -- 1 · Önkoşullar (hiçbir şey yazılmaz)
  for r in
    select t.id, t.task_code, t.task_name, t.activity_id, t.discipline, t.area_id, t.wbs_id,
           d.id_code, a.area_code, a.is_active as area_active, w.is_active as wbs_active, w.discipline as wbs_discipline
      from public.project_tasks t
      left join public.task_disciplines d on d.discipline = t.discipline
      left join public.project_areas a on a.project_id = t.project_id and a.id = t.area_id
      left join public.project_wbs w on w.project_id = t.project_id and w.id = t.wbs_id
     where t.id = any(v_ids)
     order by t.discipline nulls last, a.area_code nulls last, t.planned_start nulls last, t.task_code, t.id
  loop
    v_errs := '[]'::jsonb;
    v_warns := '[]'::jsonb;
    if v_prefix is null then
      v_errs := v_errs || jsonb_build_object('code', 'project_code_missing', 'message', 'Projenin kodu yok (project_register_settings)');
    end if;
    if r.activity_id is not null then
      v_errs := v_errs || jsonb_build_object('code', 'already_assigned', 'message', 'Activity ID zaten atanmış: ' || r.activity_id);
    end if;
    if r.discipline is null then
      v_errs := v_errs || jsonb_build_object('code', 'discipline_missing', 'message', 'Disiplin eksik');
    elsif r.id_code is null then
      v_errs := v_errs || jsonb_build_object('code', 'discipline_unknown', 'message', 'Bilinmeyen disiplin: ' || r.discipline);
    end if;
    if r.area_id is null then
      v_errs := v_errs || jsonb_build_object('code', 'area_missing', 'message', 'Alan eksik');
    else
      if not r.area_active then
        v_errs := v_errs || jsonb_build_object('code', 'area_inactive', 'message', 'Alan pasif: ' || r.area_code);
      end if;
      if r.area_code !~ '^[A-Z0-9]+$' then
        v_errs := v_errs || jsonb_build_object('code', 'area_code_invalid', 'message', 'Alan kodu yalnızca büyük harf ve rakam içerebilir: ' || r.area_code);
      end if;
    end if;
    if r.wbs_id is null then
      v_errs := v_errs || jsonb_build_object('code', 'wbs_missing', 'message', 'WBS eksik');
    elsif not r.wbs_active then
      v_errs := v_errs || jsonb_build_object('code', 'wbs_inactive', 'message', 'WBS pasif');
    end if;

    -- Karar 38: WBS'te (veya üstlerinde) alan bağı tanımlıysa görevin alanı aralarında olmalı; hiç bağ yoksa uyarı
    if r.wbs_id is not null and r.area_id is not null then
      with recursive anc as (
        select w.id, w.parent_id from public.project_wbs w where w.id = r.wbs_id
        union all
        select w.id, w.parent_id from public.project_wbs w join anc on w.id = anc.parent_id
      )
      select exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc)),
             exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc) and aw.area_id = r.area_id)
        into v_has_links, v_linked;
      if v_has_links and not v_linked then
        v_errs := v_errs || jsonb_build_object('code', 'area_wbs_not_linked',
          'message', 'Alan bu WBS''e (veya üst WBS''lerine) bağlı değil: ' || r.area_code);
      elsif not v_has_links then
        v_warns := v_warns || jsonb_build_object('code', 'area_wbs_undefined',
          'message', 'WBS için alan bağı tanımlanmamış; atama yapılır');
      end if;
    end if;
    if r.wbs_discipline is not null and r.discipline is not null and r.wbs_discipline <> r.discipline then
      v_warns := v_warns || jsonb_build_object('code', 'discipline_wbs_mismatch',
        'message', 'Görev disiplini (' || r.discipline || ') WBS disiplininden (' || r.wbs_discipline || ') farklı');
    end if;

    if jsonb_array_length(v_errs) > 0 then v_err_n := v_err_n + 1; end if;
    if jsonb_array_length(v_warns) > 0 then v_warn_n := v_warn_n + 1; end if;
    v_items := v_items || jsonb_build_object(
      'task_id', r.id, 'task_code', r.task_code, 'task_name', r.task_name,
      'discipline', r.discipline, 'area_id', r.area_id, 'area_code', r.area_code, 'wbs_id', r.wbs_id,
      'id_code', r.id_code, 'activity_id', null, 'errors', v_errs, 'warnings', v_warns);
  end loop;

  if not p_dry_run and v_err_n > 0 then
    perform public.register_raise('validation',
      v_err_n || ' görevde atama yapılamaz; hiçbir görev yazılmadı',
      jsonb_build_object('tasks', (select jsonb_agg(e - 'id_code') from jsonb_array_elements(v_items) as e
                                    where jsonb_array_length(e -> 'errors') > 0)));
  end if;

  -- 2 · Numaralama (önizlemede sayaç yalnızca okunur)
  for v_item in select e from jsonb_array_elements(v_items) with ordinality as x(e, i) order by i loop
    if jsonb_array_length(v_item -> 'errors') = 0 then
      if v_gkey is distinct from (v_item ->> 'discipline') || '|' || (v_item ->> 'area_id') then
        v_gkey := (v_item ->> 'discipline') || '|' || (v_item ->> 'area_id');
        v_base := v_prefix || '-' || (v_item ->> 'id_code') || '-' || (v_item ->> 'area_code') || '-';
        if not p_dry_run then
          insert into public.activity_id_counters (project_id, discipline, area_id, last_no)
          values (v_project, v_item ->> 'discipline', (v_item ->> 'area_id')::uuid, 0)
          on conflict (project_id, discipline, area_id) do nothing;
          select c.last_no into v_last from public.activity_id_counters c
           where c.project_id = v_project and c.discipline = v_item ->> 'discipline'
             and c.area_id = (v_item ->> 'area_id')::uuid
           for update;
        else
          select c.last_no into v_last from public.activity_id_counters c
           where c.project_id = v_project and c.discipline = v_item ->> 'discipline'
             and c.area_id = (v_item ->> 'area_id')::uuid;
        end if;
        select coalesce(max(substring(t.activity_id from char_length(v_base) + 1)::bigint), 0)::int into v_max
          from public.project_tasks t
         where t.project_id = v_project
           and t.activity_id like v_base || '%'
           and substring(t.activity_id from char_length(v_base) + 1) ~ '^[0-9]+$';
        v_cur := greatest(coalesce(v_last, 0), v_max);
      end if;
      v_cur := v_cur + 10;
      v_aid := v_base || case when v_cur >= 1000 then v_cur::text else lpad(v_cur::text, 4, '0') end;
      v_item := jsonb_set(v_item, '{activity_id}', to_jsonb(v_aid));
      v_ok_n := v_ok_n + 1;
      if not p_dry_run then
        update public.activity_id_counters
           set last_no = v_cur, updated_at = now()
         where project_id = v_project and discipline = v_item ->> 'discipline'
           and area_id = (v_item ->> 'area_id')::uuid;
      end if;
    end if;
    v_out := v_out || (v_item - 'id_code');
  end loop;

  -- 3 · Yazma (hepsi ya da hiçbiri)
  if not p_dry_run then
    perform set_config('fons.activity_id_assign', 'on', true);
    begin
      for v_item in select e from jsonb_array_elements(v_out) as e loop
        update public.project_tasks
           set activity_id = v_item ->> 'activity_id'
         where id = (v_item ->> 'task_id')::uuid;
        insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
        values (v_project, 'project_tasks', (v_item ->> 'task_id')::uuid, 'update',
                jsonb_build_object('activity_id', jsonb_build_array(null, v_item ->> 'activity_id')),
                'Activity ID atandı (assign_activity_ids)');
      end loop;
    exception
      when unique_violation then
        perform set_config('fons.activity_id_assign', 'off', true);
        get stacked diagnostics v_constraint = constraint_name;
        perform public.register_raise('duplicate', 'Activity ID çakıştı; hiçbir görev yazılmadı',
          jsonb_build_object('constraint', v_constraint, 'error', sqlerrm));
      when check_violation then
        perform set_config('fons.activity_id_assign', 'off', true);
        get stacked diagnostics v_constraint = constraint_name;
        perform public.register_raise('validation', 'Activity ID biçim kontrolünden geçmedi; hiçbir görev yazılmadı',
          jsonb_build_object('constraint', v_constraint, 'error', sqlerrm));
    end;
    perform set_config('fons.activity_id_assign', 'off', true);
  end if;

  return jsonb_build_object(
    'project_id', v_project,
    'dry_run', p_dry_run,
    'items', v_out,
    'summary', jsonb_build_object(
      'total', jsonb_array_length(v_out), 'ok', v_ok_n, 'error_count', v_err_n, 'warning_count', v_warn_n,
      'assigned', case when p_dry_run then 0 else v_ok_n end),
    'note', case when p_dry_run
              then 'Önizleme: hiçbir şey yazılmadı. Gerçek atamada araya başka bir atama girerse numaralar değişebilir.'
            end);
end $$;
revoke all on function public.assign_activity_ids(uuid[], boolean) from public, anon;
grant execute on function public.assign_activity_ids(uuid[], boolean) to authenticated;

create function public.assign_activity_id(p_task_id uuid, p_dry_run boolean default true)
returns jsonb
language sql
set search_path = public
as $$
  select public.assign_activity_ids(array[p_task_id], p_dry_run);
$$;
revoke all on function public.assign_activity_id(uuid, boolean) from public, anon;
grant execute on function public.assign_activity_id(uuid, boolean) to authenticated;

-- ── A6 · Genişletilmiş B4 (Karar 39) ──
-- 3 parametreli çağrılar varsayılanlar sayesinde aynen çalışır. Yeni ID, görevin (yeni) proje kodu, disiplin
-- kısaltması ve alan koduyla uyumlu olmak zorunda; NULL ID'yi temizler.
drop function public.admin_correct_task_activity_id(uuid, text, text);
create function public.admin_correct_task_activity_id(
  p_task_id uuid, p_new_activity_id text, p_reason text,
  p_discipline text default null, p_area_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task      record;
  v_new       text := nullif(btrim(coalesce(p_new_activity_id, '')), '');
  v_disc      text;
  v_area      uuid;
  v_prefix    text;
  v_code      text;
  v_area_code text;
  v_changes   jsonb := '{}'::jsonb;
  v_constraint text;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then
    perform public.register_raise('forbidden', 'Activity ID düzeltmesini yalnızca admin yapabilir');
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    perform public.register_raise('validation', 'Gerekçe zorunlu', '{"fields":["p_reason"]}');
  end if;
  select t.id, t.project_id, t.activity_id, t.discipline, t.area_id into v_task
    from public.project_tasks t where t.id = p_task_id for update;
  if not found then
    perform public.register_raise('not_found', 'Görev bulunamadı', jsonb_build_object('id', p_task_id));
  end if;
  if p_discipline is not null and not exists (select 1 from public.task_disciplines d where d.discipline = p_discipline) then
    perform public.register_raise('validation', 'Bilinmeyen disiplin', '{"fields":["p_discipline"]}');
  end if;
  if p_area_id is not null and not exists (select 1 from public.project_areas a
                                            where a.project_id = v_task.project_id and a.id = p_area_id) then
    perform public.register_raise('validation', 'Alan bu projede yok', '{"fields":["p_area_id"]}');
  end if;
  v_disc := coalesce(p_discipline, v_task.discipline);
  v_area := coalesce(p_area_id, v_task.area_id);

  if v_new is not null then
    select s.prefix into v_prefix from public.project_register_settings s where s.project_id = v_task.project_id;
    select d.id_code into v_code from public.task_disciplines d where d.discipline = v_disc;
    select a.area_code into v_area_code from public.project_areas a where a.project_id = v_task.project_id and a.id = v_area;
    if v_prefix is null or v_code is null or v_area_code is null then
      perform public.register_raise('validation', 'Activity ID için projenin kodu, görevin disiplini ve alanı dolu olmalı',
        jsonb_build_object('prefix', v_prefix, 'discipline', v_disc, 'area_id', v_area));
    end if;
    if v_new !~ ('^' || v_prefix || '-' || v_code || '-' || v_area_code || '-[0-9]{4,}$') then
      perform public.register_raise('validation', 'Activity ID biçimi görevin proje, disiplin ve alanıyla uyuşmuyor',
        jsonb_build_object('expected', v_prefix || '-' || v_code || '-' || v_area_code || '-NNNN', 'value', v_new));
    end if;
  end if;

  if v_task.activity_id is not distinct from v_new
     and v_task.discipline is not distinct from v_disc
     and v_task.area_id is not distinct from v_area then
    return jsonb_build_object('id', p_task_id, 'activity_id', v_new, 'changed', false);
  end if;

  if v_task.activity_id is distinct from v_new then
    v_changes := v_changes || jsonb_build_object('activity_id', jsonb_build_array(v_task.activity_id, v_new));
  end if;
  if v_task.discipline is distinct from v_disc then
    v_changes := v_changes || jsonb_build_object('discipline', jsonb_build_array(v_task.discipline, v_disc));
  end if;
  if v_task.area_id is distinct from v_area then
    v_changes := v_changes || jsonb_build_object('area_id', jsonb_build_array(v_task.area_id, v_area));
  end if;

  perform set_config('fons.activity_id_fix', 'on', true);
  begin
    update public.project_tasks
       set activity_id = v_new, discipline = v_disc, area_id = v_area
     where id = p_task_id;
  exception when check_violation or unique_violation or foreign_key_violation or raise_exception then
    perform set_config('fons.activity_id_fix', 'off', true);
    get stacked diagnostics v_constraint = constraint_name;
    perform public.register_raise('validation', 'Activity ID düzeltmesi yapılamadı (biçim, çakışma veya pasif alan)',
      jsonb_build_object('constraint', v_constraint, 'error', sqlerrm));
  end;
  perform set_config('fons.activity_id_fix', 'off', true);

  insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
  values (v_task.project_id, 'project_tasks', p_task_id, 'update', v_changes, p_reason);

  return jsonb_build_object('id', p_task_id, 'old_activity_id', v_task.activity_id, 'activity_id', v_new,
                            'discipline', v_disc, 'area_id', v_area, 'changed', true);
end $$;
revoke all on function public.admin_correct_task_activity_id(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.admin_correct_task_activity_id(uuid, text, text, text, uuid) to authenticated;

-- ── A7 · İptal görevleri hesaplardan çıkarma (Karar 40) ──
-- Gövdeler 09.10.2026 canlı tanımlarının birebir aynısıdır; yalnızca "-- iptal" işaretli satırlar eklendi/değişti.

-- Durum değişikliği de proje ilerlemesini yeniden hesaplatır (bugün yalnızca progress_pct/plan tarihleri tetikliyor;
-- görev yalnızca durumu 'iptal' yapılarak iptal edilirse proje ilerlemesi bir sonraki değişikliğe kadar eski kalırdı).
drop trigger trg_sync_project_progress on public.project_tasks;
create trigger trg_sync_project_progress
  after insert or delete or update of progress_pct, planned_start, planned_end, status on public.project_tasks
  for each row execute function public.fn_sync_project_progress();

create or replace function public.fn_sync_project_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_project_id  text;
  v_progress    integer;
  v_has_weights boolean;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  SELECT EXISTS (
    SELECT 1 FROM project_category_weights WHERE project_id = v_project_id
  ) INTO v_has_weights;

  IF v_has_weights THEN
    SELECT ROUND(
      SUM(w.weight_pct * COALESCE(cat_avg.avg_progress, 0)) / 100
    )::integer
    INTO v_progress
    FROM project_category_weights w
    LEFT JOIN (
      SELECT category, AVG(progress_pct) AS avg_progress
      FROM project_tasks
      WHERE project_id = v_project_id
        AND status <> 'iptal'  -- iptal
      GROUP BY category
    ) cat_avg ON cat_avg.category = w.category
    WHERE w.project_id = v_project_id;
  ELSE
    SELECT ROUND(
      SUM(progress_pct * GREATEST(COALESCE(planned_end - planned_start, 1), 1))::numeric
      / NULLIF(SUM(GREATEST(COALESCE(planned_end - planned_start, 1), 1)), 0)
    )::integer
    INTO v_progress
    FROM project_tasks
    WHERE project_id = v_project_id
      AND status <> 'iptal';  -- iptal
  END IF;

  UPDATE projects
  SET progress = COALESCE(v_progress, 0)
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

create or replace function public.save_project_category_weights(p_project_id text, p_weights jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
  v_count integer;
  v_distinct_count integer;
  v_total numeric;
  v_progress integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Oturum gerekli.';
  end if;

  if v_role not in ('admin', 'proje_yoneticisi') then
    raise exception 'Kategori ağırlıklarını değiştirme yetkiniz yok.';
  end if;

  if not public.has_project_access(p_project_id)
     or not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if p_weights is null or jsonb_typeof(p_weights) <> 'array'
     or jsonb_array_length(p_weights) = 0 then
    raise exception 'En az bir kategori ağırlığı gereklidir.';
  end if;

  select count(*), count(distinct x.category), sum(x.weight_pct)
    into v_count, v_distinct_count, v_total
  from jsonb_to_recordset(p_weights) as x(category text, weight_pct numeric);

  if v_count <> v_distinct_count then
    raise exception 'Kategori ağırlıkları yinelenemez.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_weights) as x(category text, weight_pct numeric)
    where x.category is null
       or x.weight_pct is null
       or x.weight_pct < 0
       or x.weight_pct > 100
  ) then
    raise exception 'Her ağırlık 0 ile 100 arasında olmalıdır.';
  end if;

  if abs(coalesce(v_total, 0) - 100) > 0.01 then
    raise exception 'Kategori ağırlıkları toplamı 100 olmalıdır (mevcut toplam: %).', coalesce(v_total, 0);
  end if;

  set constraints trg_check_category_weights_sum deferred;

  delete from public.project_category_weights
  where project_id = p_project_id;

  insert into public.project_category_weights (project_id, category, weight_pct)
  select p_project_id, x.category::public.task_category, x.weight_pct
  from jsonb_to_recordset(p_weights) as x(category text, weight_pct numeric);

  select round(sum(w.weight_pct * coalesce(cat.avg_progress, 0)) / 100)::integer
    into v_progress
  from public.project_category_weights w
  left join (
    select category, avg(progress_pct) as avg_progress
    from public.project_tasks
    where project_id = p_project_id
      and status <> 'iptal'  -- iptal
    group by category
  ) cat on cat.category = w.category
  where w.project_id = p_project_id;

  update public.projects
  set progress = coalesce(v_progress, 0)
  where id = p_project_id;
end;
$$;

create or replace function public.get_project_by_date(p_project_id text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_report_id UUID;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT id INTO v_report_id
  FROM daily_reports
  WHERE project_id = p_project_id
    AND report_date <= p_date
  ORDER BY report_date DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'authorized', true,

    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    'report', (
      SELECT jsonb_build_object(
        'id',             dr.id,
        'report_date',    dr.report_date,
        'weather',        dr.weather,
        'notes',          dr.notes,
        'worker_count',   dr.worker_count,
        'general_status', dr.general_status,
        'creator_name',   COALESCE(pr.full_name, pr.email)
      )
      FROM daily_reports dr
      LEFT JOIN profiles pr ON pr.id = dr.created_by
      WHERE dr.id = v_report_id
    ),

    'personnel', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'shift',      ple.shift,
        'department', ple.department,
        'count',      ple.count
      )), '[]'::jsonb)
      FROM personnel_log_entries ple
      WHERE ple.report_id = v_report_id
    ),

    'machinery', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'machine_type', ml.machine_type,
        'count',        ml.count,
        'status',       ml.status
      )), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = v_report_id
    ),

    'progress_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',            pt.id,
        'name',          pt.task_name,
        'unit',          pt.unit,
        'category',      pt.category,
        'target_qty',    pt.target_qty,
        'total_to_date', COALESCE(sums.total_qty, 0),
        'pct',           ROUND(
                           LEAST(100.0,
                             COALESCE(sums.total_qty, 0.0)
                             / NULLIF(pt.target_qty::numeric, 0) * 100.0
                           )::numeric, 1)
      ) ORDER BY pt.planned_start NULLS LAST), '[]'::jsonb)
      FROM project_tasks pt
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.task_id = pt.id
          AND dr.report_date <= p_date
      ) sums ON TRUE
      WHERE pt.project_id = p_project_id
        AND pt.status <> 'iptal'  -- iptal
    ),

    'overall_pct', (
      SELECT ROUND(COALESCE(
        CASE
          WHEN EXISTS (SELECT 1 FROM project_category_weights WHERE project_id = p_project_id) THEN (
            SELECT SUM(w.weight_pct * COALESCE(cat_avg.avg_progress, 0)) / 100
            FROM project_category_weights w
            LEFT JOIN (
              SELECT pt.category,
                AVG(
                  LEAST(100.0,
                    COALESCE(sums.total_qty, 0.0)
                    / NULLIF(pt.target_qty::numeric, 0) * 100.0
                  )
                ) AS avg_progress
              FROM project_tasks pt
              LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
                FROM progress_daily pd
                JOIN daily_reports dr ON dr.id = pd.report_id
                WHERE pd.task_id = pt.id
                  AND dr.report_date <= p_date
              ) sums ON TRUE
              WHERE pt.project_id = p_project_id
                AND pt.target_qty > 0
                AND pt.status <> 'iptal'  -- iptal
              GROUP BY pt.category
            ) cat_avg ON cat_avg.category = w.category
            WHERE w.project_id = p_project_id
          )
          ELSE (
            SELECT SUM(
              LEAST(100.0,
                COALESCE(sums.total_qty, 0.0)
                / NULLIF(pt.target_qty::numeric, 0) * 100.0
              ) * GREATEST(COALESCE(pt.planned_end - pt.planned_start, 1), 1)
            ) / NULLIF(SUM(GREATEST(COALESCE(pt.planned_end - pt.planned_start, 1), 1)), 0)
            FROM project_tasks pt
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
              FROM progress_daily pd
              JOIN daily_reports dr ON dr.id = pd.report_id
              WHERE pd.task_id = pt.id
                AND dr.report_date <= p_date
            ) sums ON TRUE
            WHERE pt.project_id = p_project_id
              AND pt.target_qty > 0
              AND pt.status <> 'iptal'  -- iptal
          )
        END
      , 0)::numeric, 1)
    ),

    'category_weights', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'category',      w.category,
          'weight_pct',    w.weight_pct,
          'avg_progress',  COALESCE(cat_avg.avg_progress, 0)
        ) ORDER BY w.weight_pct DESC
      ), '[]'::jsonb)
      FROM project_category_weights w
      LEFT JOIN (
        SELECT pt.category,
          AVG(
            LEAST(100.0,
              COALESCE(sums.total_qty, 0.0)
              / NULLIF(pt.target_qty::numeric, 0) * 100.0
            )
          ) AS avg_progress
        FROM project_tasks pt
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
          FROM progress_daily pd
          JOIN daily_reports dr ON dr.id = pd.report_id
          WHERE pd.task_id = pt.id
            AND dr.report_date <= p_date
        ) sums ON TRUE
        WHERE pt.project_id = p_project_id
          AND pt.target_qty > 0
          AND pt.status <> 'iptal'  -- iptal
        GROUP BY pt.category
      ) cat_avg ON cat_avg.category = w.category
      WHERE w.project_id = p_project_id
    ),

    'risks', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',          r.id,
          'title',       r.title,
          'severity',    r.severity,
          'source',      r.source,
          'rule_code',   r.rule_code,
          'subject_ref', r.subject_ref,
          'category',    r.category
        ) ORDER BY
          CASE r.severity
            WHEN 'kritik' THEN 1
            WHEN 'yüksek' THEN 2
            WHEN 'orta'   THEN 3
            WHEN 'düşük'  THEN 4
            ELSE 5
          END,
          r.created_at DESC
      ), '[]'::jsonb)
      FROM project_risks r
      WHERE r.project_id = p_project_id
        AND r.status = 'açık'
    ),

    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',            pt.id,
        'task_code',     pt.task_code,
        'name',          pt.task_name,
        'task_name',     pt.task_name,
        'category',      pt.category,
        'planned_start', pt.planned_start,
        'planned_end',   pt.planned_end,
        'start_date',    pt.planned_start,
        'due_date',      pt.planned_end,
        'actual_start',  pt.actual_start,
        'progress_pct',  pt.progress_pct,
        'progress',      pt.progress_pct,
        'status',        pt.status,
        'responsible',   pt.responsible,
        'team_size',     pt.team_size
      ) ORDER BY pt.planned_start NULLS LAST), '[]'::jsonb)
      FROM project_tasks pt
      WHERE pt.project_id = p_project_id
        AND pt.status <> 'iptal'  -- iptal (S-eğrisi bu listeden hesaplanıyor)
    ),

    'tickets', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',         t.id,
        'title',      t.title,
        'severity',   t.severity,
        'status',     t.status,
        'category',   t.category,
        'created_at', t.created_at
      ) ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM tickets t
      WHERE t.project_id = p_project_id
        AND t.created_at::date <= p_date
        AND t.status <> 'kapatıldı'
      LIMIT 8
    ),

    'purchases', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',        pr.id,
        'title',     pr.title,
        'status',    pr.status,
        'urgency',   pr.urgency,
        'notes',     pr.notes,
        'created_at',pr.created_at
      ) ORDER BY pr.created_at DESC), '[]'::jsonb)
      FROM purchase_requests pr
      WHERE pr.project_id = p_project_id
        AND pr.created_at::date <= p_date
      LIMIT 6
    ),

    'budget_lines', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',             bl.id,
        'category',       bl.category,
        'name',           bl.name,
        'planned_amount', bl.planned_amount
      )), '[]'::jsonb)
      FROM budget_lines bl
      WHERE bl.project_id = p_project_id
    ),

    'invoices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',              inv.id,
        'total_amount',    inv.total_amount,
        'total_amount_try',inv.total_amount_try,
        'currency',        inv.currency,
        'amount',          inv.amount,
        'status',          inv.status,
        'created_at',      inv.created_at,
        'invoice_date',    inv.invoice_date
      )), '[]'::jsonb)
      FROM invoices inv
      WHERE inv.project_id = p_project_id
        AND COALESCE(inv.invoice_date, inv.created_at::date) <= p_date
    ),

    'weather_lost_days', (
      SELECT COUNT(*)
      FROM daily_reports dr
      WHERE dr.project_id = p_project_id
        AND dr.report_date <= p_date
        AND dr.weather IN ('yağmurlu', 'karlı', 'fırtınalı')
    )

  );
END;
$$;

create or replace function public.get_santiye_dashboard(p_project_id text, p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_project jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT to_jsonb(p.*) INTO v_project
  FROM projects p
  WHERE p.id = p_project_id;

  RETURN jsonb_build_object(
    'authorized', true,
    'project', v_project,
    'today_report', (
      SELECT to_jsonb(r)
      FROM (
        SELECT id, report_date, general_status, worker_count, weather, weather_note, notes, created_at
        FROM daily_reports
        WHERE project_id = p_project_id AND report_date = p_today
        LIMIT 1
      ) r
    ),
    'recent_reports', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.report_date DESC, r.created_at DESC)
      FROM (
        SELECT id, report_date, general_status, worker_count, weather, weather_note, notes, created_at
        FROM daily_reports
        WHERE project_id = p_project_id
        ORDER BY report_date DESC, created_at DESC
        LIMIT 30
      ) r
    ), '[]'::jsonb),
    'progress_summary', (
      SELECT to_jsonb(s)
      FROM vw_project_progress_summary s
      WHERE s.project_id = p_project_id
      LIMIT 1
    ),
    'progress_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'name', task_name,
        'unit', unit,
        'target_qty', target_qty,
        'total_progress', total_progress,
        'category', category,
        'task_id', id
      ) ORDER BY planned_start NULLS LAST)
      FROM project_tasks
      WHERE project_id = p_project_id AND target_qty > 0
        AND status <> 'iptal'  -- iptal
    ), '[]'::jsonb)
  );
END;
$$;

-- Savunma katmanı: iptal göreve yeni ilerleme A8'deki progress_daily trigger'ıyla reddedilir; yine de bir satır
-- değişirse (ör. azaltma/silme) durum 'iptal' kalır, görev "canlanmaz". Hesaplar iptal görevi dışarıda bırakır.
create or replace function public.sync_task_progress_from_daily()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_task_id   uuid;
  v_target    numeric;
  v_completed numeric;
  v_pct       numeric;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);
  IF v_task_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(qty_added), 0)
    INTO v_completed
    FROM progress_daily
   WHERE task_id = v_task_id;

  SELECT target_qty INTO v_target FROM project_tasks WHERE id = v_task_id;

  IF v_target IS NULL OR v_target = 0 THEN
    v_pct := 0;
  ELSE
    v_pct := LEAST(ROUND((v_completed / v_target) * 100, 1), 100);
  END IF;

  UPDATE project_tasks
     SET total_progress = v_completed,
         progress_pct   = v_pct,
         status = CASE
                    WHEN status = 'iptal'::task_status THEN status  -- iptal
                    WHEN v_pct >= 100 THEN 'tamamlandi'::task_status
                    WHEN v_pct > 0    THEN 'devam_ediyor'::task_status
                    ELSE status
                  END,
         actual_start = CASE
                    WHEN v_pct > 0 AND actual_start IS NULL THEN CURRENT_DATE
                    ELSE actual_start
                  END,
         updated_at = now()
   WHERE id = v_task_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

create or replace function public.add_task_progress(p_task_id uuid, p_qty numeric, p_note text default null, p_report_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_task public.project_tasks%rowtype;
  v_report_id uuid;
  v_report_was_submitted boolean := false;
  v_current_total numeric;
  v_project_name text;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  v_role := public.get_my_role();
  if v_role not in ('santiye_sefi', 'proje_yoneticisi') then
    raise exception 'İlerleme girişi yalnızca şantiye şefi ve proje yöneticisi tarafından yapılabilir.';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'İlerleme miktarı sıfırdan büyük olmalıdır.';
  end if;

  select * into v_task
  from public.project_tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'İş kalemi bulunamadı.';
  end if;

  if not public.has_project_access(v_task.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_task.status = 'iptal' then  -- iptal
    raise exception 'İptal edilmiş göreve ilerleme girilemez';
  end if;

  if coalesce(v_task.target_qty, 0) <= 0 then
    raise exception 'Bu iş kalemi için ölçülebilir ilerleme hedefi tanımlanmamış.';
  end if;

  select coalesce(sum(pd.qty_added), 0)
  into v_current_total
  from public.progress_daily pd
  where pd.task_id = p_task_id;

  if v_current_total + p_qty > v_task.target_qty
     and nullif(btrim(p_note), '') is null then
    raise exception 'Hedef aşımı için açıklama girmeniz gerekir.';
  end if;

  select dr.id, not dr.auto_created_from_progress
  into v_report_id, v_report_was_submitted
  from public.daily_reports dr
  where dr.project_id = v_task.project_id
    and dr.report_date = p_report_date
  for update;

  if v_report_id is null then
    insert into public.daily_reports (
      project_id, report_date, created_by, weather, general_status,
      worker_count, auto_created_from_progress
    )
    values (
      v_task.project_id, p_report_date, v_actor, 'açık', 'normal',
      0, true
    )
    returning id into v_report_id;
  else
    update public.daily_reports
    set updated_at = now()
    where id = v_report_id;
  end if;

  insert into public.progress_daily (
    report_id, task_id, qty_added, note, source, entered_by
  )
  values (
    v_report_id, p_task_id, p_qty, nullif(btrim(p_note), ''), 'manual', v_actor
  )
  on conflict (report_id, task_id, entered_by)
    where source = 'manual' and task_id is not null and entered_by is not null
  do update set
    qty_added = public.progress_daily.qty_added + excluded.qty_added,
    note = case
      when excluded.note is null then public.progress_daily.note
      when public.progress_daily.note is null then excluded.note
      else public.progress_daily.note || ' · ' || excluded.note
    end;

  select name into v_project_name
  from public.projects
  where id = v_task.project_id;

  select full_name into v_actor_name
  from public.profiles
  where id = v_actor;

  insert into public.notifications (
    recipient_id, actor_id, project_id, entity_type, entity_id,
    event_type, title, body
  )
  select
    p.id,
    v_actor,
    v_task.project_id,
    'daily_report',
    v_report_id,
    'status_changed',
    case
      when v_report_was_submitted then coalesce(v_project_name, 'Proje') || ' günlük raporu güncellendi'
      else coalesce(v_project_name, 'Proje') || ' iş planına ilerleme girildi'
    end,
    coalesce(v_actor_name, 'Bir kullanıcı') || ' tarafından ' ||
      v_task.task_name || ' iş kalemine ' ||
      trim(to_char(p_qty, 'FM9999999990D99')) || ' ' || coalesce(v_task.unit, 'birim') ||
      ' ilerleme eklendi.'
  from public.profiles p
  where p.role_key = 'admin'
    and p.id is distinct from v_actor
  on conflict (recipient_id, entity_type, entity_id)
    where entity_id is not null
  do update set
    actor_id = excluded.actor_id,
    project_id = excluded.project_id,
    event_type = excluded.event_type,
    title = excluded.title,
    body = excluded.body,
    is_read = false,
    read_at = null,
    created_at = now();

  return jsonb_build_object(
    'report_id', v_report_id,
    'task_id', p_task_id,
    'qty_added', p_qty,
    'report_updated', v_report_was_submitted
  );
end;
$$;

create or replace view public.vw_project_progress_summary
with (security_invoker = on) as
 SELECT p.id AS project_id,
    p.name AS project_name,
    p.start_date,
    p.target_date,
    p.status,
    p.progress AS actual_progress_pct,
        CASE
            WHEN ((p.start_date IS NULL) OR (p.target_date IS NULL)) THEN (0)::numeric
            WHEN (CURRENT_DATE <= p.start_date) THEN (0)::numeric
            WHEN (CURRENT_DATE >= p.target_date) THEN (100)::numeric
            ELSE round(((((CURRENT_DATE - p.start_date))::numeric / (NULLIF((p.target_date - p.start_date), 0))::numeric) * (100)::numeric))
        END AS planned_progress_pct,
    count(pt.id) FILTER (WHERE (pt.status <> 'iptal'::task_status)) AS total_tasks,  -- iptal
    count(pt.id) FILTER (WHERE (pt.status = 'tamamlandi'::task_status)) AS completed_tasks,
    count(pt.id) FILTER (WHERE (pt.status = 'devam_ediyor'::task_status)) AS active_tasks,
    count(pt.id) FILTER (WHERE ((pt.planned_end < CURRENT_DATE) AND (pt.status <> ALL (ARRAY['tamamlandi'::task_status, 'iptal'::task_status])))) AS delayed_tasks,
    (p.target_date - CURRENT_DATE) AS days_remaining,
    (CURRENT_DATE - p.start_date) AS days_elapsed
   FROM (projects p
     LEFT JOIN project_tasks pt ON ((pt.project_id = p.id)))
  GROUP BY p.id, p.name, p.start_date, p.target_date, p.status, p.progress;

-- ── A8 · İptal görev koruması ──
-- Bugün iptal göreve ilerleme yalnızca add_task_progress'te reddediliyor (A7). Günlük rapor (save_daily_report) ve
-- progress_daily'ye doğrudan yazma (pd_insert/pd_update: rapor sahibi) yolu açık; şantiye şefi project_tasks_update ile
-- iptal görevi yeniden açabiliyor. Kurallar tablo trigger'ında, böylece her yazma yolunu kapsar.

-- A8a · iptal göreve yeni ilerleme yok: yeni satır, başka göreve taşıma veya miktar artışı reddedilir.
-- Azaltma ve silme serbest (düzeltme; rapor/proje silme zinciri çalışır).
create function public.fn_progress_daily_cancelled_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.task_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.task_id is not distinct from old.task_id
     and coalesce(new.qty_added, 0) <= coalesce(old.qty_added, 0) then
    return new;
  end if;
  if exists (select 1 from public.project_tasks where id = new.task_id and status = 'iptal') then
    raise exception 'İptal edilmiş göreve ilerleme girilemez'
      using errcode = 'check_violation', hint = 'Görevi yeniden açmak için admin veya proje yöneticisine başvurun.';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_progress_daily_cancelled_guard() from public, anon, authenticated;

create trigger trg_progress_daily_cancelled_guard
  before insert or update of task_id, qty_added on public.progress_daily
  for each row execute function public.fn_progress_daily_cancelled_guard();

-- A8b · iptal görevi yalnızca admin ve proje_yoneticisi yeniden açar (iptal etmeye dokunulmaz).
-- Oturumsuz bağlam (postgres/service_role, get_my_role() boş) de reddedilir.
create function public.fn_project_tasks_reopen_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'iptal' and new.status is distinct from 'iptal'
     and coalesce(public.get_my_role(), '') not in ('admin', 'proje_yoneticisi') then
    raise exception 'İptal edilmiş görevi yalnızca admin veya proje yöneticisi yeniden açabilir'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_project_tasks_reopen_guard() from public, anon, authenticated;

create trigger trg_project_tasks_reopen_guard
  before update of status on public.project_tasks
  for each row execute function public.fn_project_tasks_reopen_guard();

-- A8c · save_daily_report: rapor her kayıtta progress_daily satırlarını silip yeniden yazıyor. A8a tek başına,
-- iptal görev satırı olan eski bir raporun aynen yeniden kaydını da reddederdi. Bu yüzden iptal görevin mevcut satırı
-- silinmez (dondurulur) ve aynı miktarla gelirse yeniden yazılmaz; farklı miktar veya yeni satır A8a'ya takılır.
-- Gövde 09.10.2026 canlı tanımının birebir aynısıdır; yalnızca "-- iptal" işaretli satırlar eklendi.
create or replace function public.save_daily_report(p_project_id text, p_report_date date, p_created_by uuid, p_general_status text, p_worker_count integer, p_weather text, p_weather_note text, p_notes text, p_personnel jsonb, p_machinery jsonb, p_progress jsonb DEFAULT '[]'::jsonb, p_daily_tasks jsonb DEFAULT '[]'::jsonb, p_materials jsonb DEFAULT '[]'::jsonb, p_task_progress jsonb DEFAULT '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rid uuid;
  v_role text;
begin
  if p_created_by is distinct from auth.uid() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  v_role := public.get_my_role();
  if v_role not in ('admin', 'santiye_sefi', 'proje_yoneticisi') then
    raise exception 'Günlük rapor kaydetme yetkiniz yok.';
  end if;

  if not public.has_project_access(p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  insert into public.daily_reports (
    project_id, report_date, created_by,
    general_status, worker_count, weather, weather_note, notes,
    auto_created_from_progress, updated_at
  )
  values (
    p_project_id, p_report_date, p_created_by,
    p_general_status, p_worker_count, p_weather,
    nullif(p_weather_note, ''), nullif(p_notes, ''),
    false, now()
  )
  on conflict (project_id, report_date) do update set
    created_by                 = excluded.created_by,
    general_status             = excluded.general_status,
    worker_count                = excluded.worker_count,
    weather                    = excluded.weather,
    weather_note               = excluded.weather_note,
    notes                      = excluded.notes,
    auto_created_from_progress = false,
    updated_at                 = now()
  returning id into v_rid;

  delete from public.personnel_log_entries where report_id = v_rid;
  insert into public.personnel_log_entries (report_id, shift, department, count)
  select v_rid, item->>'shift', item->>'department', (item->>'count')::integer
  from jsonb_array_elements(p_personnel) as item
  where (item->>'count')::integer > 0;

  delete from public.machinery_logs where report_id = v_rid;
  insert into public.machinery_logs (report_id, machine_type, count, status, notes)
  select v_rid, item->>'machine_type', (item->>'count')::integer,
         item->>'status', nullif(item->>'notes', '')
  from jsonb_array_elements(p_machinery) as item
  where (item->>'count')::integer > 0;

  delete from public.progress_daily
  where report_id = v_rid and source = 'daily_report'
    and not exists (select 1 from public.project_tasks t  -- iptal
                    where t.id = progress_daily.task_id and t.status = 'iptal');  -- iptal

  insert into public.progress_daily (
    report_id, task_id, qty_added, note, source, entered_by
  )
  select v_rid, (item->>'task_id')::uuid, (item->>'qty_added')::numeric,
         nullif(item->>'note', ''), 'daily_report', p_created_by
  from jsonb_array_elements(p_task_progress) as item
  where coalesce((item->>'qty_added')::numeric, 0) > 0
    and not exists (select 1 from public.progress_daily pd  -- iptal
                    join public.project_tasks t on t.id = pd.task_id and t.status = 'iptal'  -- iptal
                    where pd.report_id = v_rid and pd.source = 'daily_report'  -- iptal
                      and pd.task_id = (item->>'task_id')::uuid  -- iptal
                      and pd.qty_added = (item->>'qty_added')::numeric);  -- iptal

  delete from public.daily_tasks where report_id = v_rid;
  insert into public.daily_tasks (report_id, type, description, order_index)
  select v_rid, item->>'type', item->>'description',
         coalesce((item->>'order_index')::integer, 0)
  from jsonb_array_elements(p_daily_tasks) as item
  where nullif(item->>'description', '') is not null;

  delete from public.daily_report_material_usage where report_id = v_rid;
  insert into public.daily_report_material_usage (
    report_id, project_id, material_name, quantity_used, unit, description, reason
  )
  select v_rid, p_project_id, item->>'material_name',
         coalesce((item->>'quantity_used')::numeric, 0),
         coalesce(nullif(item->>'unit', ''), 'Adet'),
         nullif(item->>'description', ''), nullif(item->>'reason', '')
  from jsonb_array_elements(p_materials) as item
  where nullif(item->>'material_name', '') is not null;

  return v_rid;
end;
$function$;

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL (yalnızca gerekirse)
-- ############################################################################
/*
begin;
-- A7: Adım 6'da uygulamadan hemen önce alınan anlık görüntü çalıştırılır (yedek-faz1-adim3-<tarih>.sql:
--     pg_get_functiondef ile fn_sync_project_progress, save_project_category_weights, get_project_by_date,
--     get_santiye_dashboard, sync_task_progress_from_daily, add_task_progress, save_daily_report ve
--     vw_project_progress_summary tanımı).
drop trigger if exists trg_project_tasks_reopen_guard on public.project_tasks;
drop function if exists public.fn_project_tasks_reopen_guard();
drop trigger if exists trg_progress_daily_cancelled_guard on public.progress_daily;
drop function if exists public.fn_progress_daily_cancelled_guard();
drop trigger if exists trg_sync_project_progress on public.project_tasks;
create trigger trg_sync_project_progress
  after insert or delete or update of progress_pct, planned_start, planned_end on public.project_tasks
  for each row execute function public.fn_sync_project_progress();

-- A6: B4'ün 3 parametreli sürümüne dönüş (b4_identity_guard_admin_fix.sql BÖLÜM A'daki gövde)
drop function if exists public.admin_correct_task_activity_id(uuid, text, text, text, uuid);
-- → b4_identity_guard_admin_fix.sql'deki "create function public.admin_correct_task_activity_id(uuid, text, text)" bloğu + grant'ları

drop function if exists public.assign_activity_id(uuid, boolean);
drop function if exists public.assign_activity_ids(uuid[], boolean);

drop trigger if exists trg_project_tasks_wbs_audit on public.project_tasks;
drop function if exists public.fn_project_tasks_wbs_audit();
drop trigger if exists trg_project_tasks_wbs_area_link_guard on public.project_tasks;
drop function if exists public.fn_project_tasks_wbs_area_link_guard();
drop trigger if exists trg_project_tasks_delete_guard on public.project_tasks;
drop function if exists public.fn_project_tasks_delete_guard();
-- A3: guard'ı B4 haline döndür (b4_identity_guard_admin_fix.sql BÖLÜM A'daki fn_project_tasks_identity_guard gövdesi)

drop table if exists public.activity_id_counters;
-- A1: atanmış Activity ID'ler ve görev disiplinleri kalır; yalnızca FK ve sözlük kalkar
alter table public.project_tasks drop constraint if exists project_tasks_discipline_fk;
drop index if exists public.idx_project_tasks_discipline;
drop table if exists public.task_disciplines;
commit;
*/
