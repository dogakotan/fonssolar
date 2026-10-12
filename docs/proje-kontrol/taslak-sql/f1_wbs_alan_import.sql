-- ============================================================================
-- FAZ 1 · ADIM 4 — WBS / alan bütünlüğü ve Excel import — TASLAK (UYGULANMADI) · 12.10.2026
-- Tasarım: docs/proje-kontrol/faz1-adim4-tasarim.md · Kararlar: CLAUDE.md Karar 38, 45-50
-- Doğrulama: taslak-sql/f1_dogrulama.sql (R17-R26) · Testler: f1_adim4_testler.sql
-- Bağımlılık: B1 (register_raise), B2 (register_audit, fn_register_audit), F1 A2 (alan kodu tiresiz),
--             F1-AID (task_disciplines, activity_id). Ayrı migration; sıra F1-AID → Adım 4.
--
-- İçerik:
--   A1 project_wbs.discipline → task_disciplines FK (Karar 46)
--   A2 Activity ID yardımcıları (SECURITY DEFINER; yalnızca trigger'lar ve import çağırır)
--   A3 fn_project_wbs_guard / fn_project_areas_guard son hali (Karar 48, 49):
--        - ID'li görevin alanı, WBS'i veya üst WBS'i pasifleştirilemez / taşınamaz
--        - aktif alt kaydı olan kayıt pasifleştirilemez (Ç-7)
--        - kod değişikliği: görev kullanıyorsa değiştirilemez (canlı kural aynen)
--      WBS taşınınca alt WBS'lerin level'ı yeniden hesaplanır (Ç-7)
--   A4 Silme koruması: ID'li görevin alanı/WBS'i silinemez (FK RESTRICT'in önünde açık mesaj)
--   A5 area_wbs koruması: Karar 38'i bozan INSERT ve ID'li görevin alanını kümeden çıkaran DELETE reddedilir
--   A6 Audit: project_wbs, project_areas (B2 fn_register_audit), area_wbs (ayrı trigger, kayıt = area_id)
--   A7 import_wbs_areas(p_project_id, p_payload, p_dry_run default true)
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A1 · WBS disiplini sözlüğe bağlı (07.10'da 0 satır) ──
alter table public.project_wbs
  add constraint project_wbs_discipline_fk foreign key (discipline)
  references public.task_disciplines (discipline) on update restrict on delete restrict;
create index idx_project_wbs_discipline on public.project_wbs (discipline) where discipline is not null;

-- ── A2 · Activity ID yardımcıları ──
-- WBS'in kendisi ve alt WBS'lerindeki ID'li görevlerin Activity ID'leri (yoksa NULL)
create function public.fn_wbs_subtree_activity_ids(p_wbs_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with recursive sub as (
    select w.id from public.project_wbs w where w.id = p_wbs_id
    union all
    select w.id from public.project_wbs w join sub on w.parent_id = sub.id
  )
  select array_agg(t.activity_id order by t.activity_id)
    from public.project_tasks t
   where t.wbs_id in (select id from sub) and t.activity_id is not null;
$$;

create function public.fn_area_activity_ids(p_area_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_agg(t.activity_id order by t.activity_id)
    from public.project_tasks t
   where t.area_id = p_area_id and t.activity_id is not null;
$$;

-- Karar 38 ihlalleri: p_wbs_id'nin kendisi ve altındaki ID'li görevlerden, WBS zincirindeki bağ kümesi
-- boş değilken alanı kümede olmayanlar; p_removed_area verilirse alanı o olup artık kümede olmayanlar da.
create function public.fn_aid_area_wbs_violations(p_wbs_id uuid, p_removed_area uuid default null)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tk     record;
  v_has  boolean;
  v_in   boolean;
  v_list text[] := '{}';
begin
  for tk in
    with recursive sub as (
      select w.id from public.project_wbs w where w.id = p_wbs_id
      union all
      select w.id from public.project_wbs w join sub on w.parent_id = sub.id
    )
    select t.activity_id, t.area_id, t.wbs_id
      from public.project_tasks t
     where t.wbs_id in (select id from sub) and t.activity_id is not null
     order by t.activity_id
  loop
    with recursive anc as (
      select w.id, w.parent_id from public.project_wbs w where w.id = tk.wbs_id
      union all
      select w.id, w.parent_id from public.project_wbs w join anc on w.id = anc.parent_id
    )
    select exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc)),
           exists (select 1 from public.area_wbs aw where aw.wbs_id in (select id from anc) and aw.area_id = tk.area_id)
      into v_has, v_in;
    if not v_in and (v_has or tk.area_id = p_removed_area) then
      v_list := v_list || tk.activity_id;
    end if;
  end loop;
  return nullif(v_list, '{}');
end $$;

revoke all on function public.fn_wbs_subtree_activity_ids(uuid) from public, anon, authenticated;
revoke all on function public.fn_area_activity_ids(uuid) from public, anon, authenticated;
revoke all on function public.fn_aid_area_wbs_violations(uuid, uuid) from public, anon, authenticated;

-- ── A3 · Guard'ların son hali ──
-- SECURITY DEFINER: görev ve alt kayıt aramaları çağıranın RLS'inden bağımsız olsun (şantiye şefi dahil).
create or replace function public.fn_project_wbs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_level  smallint;
  parent_active boolean;
  v_aids        text[];
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'WBS kaydının projesi değiştirilemez';
    end if;
    if new.wbs_code <> old.wbs_code
       and exists (select 1 from public.project_tasks t where t.wbs_id = old.id) then
      raise exception 'Kullanımdaki WBS kodu değiştirilemez: %', old.wbs_code;
    end if;
    if old.is_active and not new.is_active then
      v_aids := public.fn_wbs_subtree_activity_ids(old.id);
      if v_aids is not null then
        raise exception 'Activity ID''li görevin WBS''i veya üst WBS''i pasifleştirilemez: % (%)',
          old.wbs_code, array_to_string(v_aids[1:5], ', ');
      end if;
      if exists (select 1 from public.project_wbs c where c.parent_id = old.id and c.is_active) then
        raise exception 'Aktif alt WBS''i olan WBS pasifleştirilemez: %', old.wbs_code;
      end if;
    end if;
    if new.parent_id is distinct from old.parent_id then
      v_aids := public.fn_wbs_subtree_activity_ids(old.id);
      if v_aids is not null then
        raise exception 'Activity ID''li görevin WBS''i veya üst WBS''i taşınamaz: % (%)',
          old.wbs_code, array_to_string(v_aids[1:5], ', ');
      end if;
    end if;
  end if;

  if new.parent_id is null then
    new.level := 1;
  else
    select w.level, w.is_active into parent_level, parent_active
      from public.project_wbs w where w.id = new.parent_id;
    new.level := parent_level + 1;
    if new.is_active and not parent_active then
      raise exception 'Üst WBS pasifken alt WBS aktif olamaz';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      if exists (
        with recursive anc as (
          select id, parent_id from public.project_wbs where id = new.parent_id
          union all
          select w.id, w.parent_id from public.project_wbs w join anc on w.id = anc.parent_id
        )
        select 1 from anc where id = new.id
      ) then
        raise exception 'WBS kendi alt dalına taşınamaz';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fn_project_areas_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_active boolean;
  v_aids        text[];
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'Alan kaydının projesi değiştirilemez';
    end if;
    if new.area_code <> old.area_code
       and exists (select 1 from public.project_tasks t where t.area_id = old.id) then
      raise exception 'Kullanımdaki alan kodu değiştirilemez: %', old.area_code;
    end if;
    if old.is_active and not new.is_active then
      v_aids := public.fn_area_activity_ids(old.id);
      if v_aids is not null then
        raise exception 'Activity ID''li görevin alanı pasifleştirilemez: % (%)',
          old.area_code, array_to_string(v_aids[1:5], ', ');
      end if;
      if exists (select 1 from public.project_areas c where c.parent_id = old.id and c.is_active) then
        raise exception 'Aktif alt alanı olan alan pasifleştirilemez: %', old.area_code;
      end if;
    end if;
    if new.parent_id is distinct from old.parent_id then
      v_aids := public.fn_area_activity_ids(old.id);
      if v_aids is not null then
        raise exception 'Activity ID''li görevin alanı taşınamaz: % (%)',
          old.area_code, array_to_string(v_aids[1:5], ', ');
      end if;
    end if;
  end if;

  if new.parent_id is not null then
    select a.is_active into parent_active
      from public.project_areas a where a.id = new.parent_id;
    if new.is_active and not parent_active then
      raise exception 'Üst alan pasifken alt alan aktif olamaz';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      if exists (
        with recursive anc as (
          select id, parent_id from public.project_areas where id = new.parent_id
          union all
          select a.id, a.parent_id from public.project_areas a join anc on a.id = anc.parent_id
        )
        select 1 from anc where id = new.id
      ) then
        raise exception 'Alan kendi alt dalına taşınamaz';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_project_wbs_guard() from public, anon, authenticated;
revoke all on function public.fn_project_areas_guard() from public, anon, authenticated;

-- Taşınan WBS'in alt WBS'leri: her çocuk güncellenince guard level'ı yeniden hesaplar, zincir aşağı iner.
create function public.fn_project_wbs_level_cascade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.project_wbs c
     set level = new.level + 1
   where c.parent_id = new.id and c.level is distinct from new.level + 1;
  return null;
end $$;
revoke all on function public.fn_project_wbs_level_cascade() from public, anon, authenticated;

create trigger trg_project_wbs_level_cascade
  after update on public.project_wbs
  for each row when (new.level is distinct from old.level)
  execute function public.fn_project_wbs_level_cascade();

-- ── A4 · Silme koruması ──
-- Görevli alan/WBS zaten FK (ON DELETE RESTRICT) ile silinemiyor; bu trigger ID'li görevde açık mesaj verir.
-- Proje silinirken (CASCADE) proje satırı görünmediği için izin verilir (fn_project_tasks_delete_guard deseni).
create function public.fn_project_wbs_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aids text[];
begin
  if exists (select 1 from public.projects p where p.id = old.project_id) then
    select array_agg(t.activity_id order by t.activity_id) into v_aids
      from public.project_tasks t where t.wbs_id = old.id and t.activity_id is not null;
    if v_aids is not null then
      raise exception 'Activity ID''li görevin WBS''i silinemez: % (%)', old.wbs_code, array_to_string(v_aids[1:5], ', ');
    end if;
  end if;
  return old;
end $$;

create function public.fn_project_areas_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aids text[];
begin
  if exists (select 1 from public.projects p where p.id = old.project_id) then
    v_aids := public.fn_area_activity_ids(old.id);
    if v_aids is not null then
      raise exception 'Activity ID''li görevin alanı silinemez: % (%)', old.area_code, array_to_string(v_aids[1:5], ', ');
    end if;
  end if;
  return old;
end $$;
revoke all on function public.fn_project_wbs_delete_guard() from public, anon, authenticated;
revoke all on function public.fn_project_areas_delete_guard() from public, anon, authenticated;

create trigger trg_project_wbs_delete_guard
  before delete on public.project_wbs
  for each row execute function public.fn_project_wbs_delete_guard();
create trigger trg_project_areas_delete_guard
  before delete on public.project_areas
  for each row execute function public.fn_project_areas_delete_guard();

-- ── A5 · area_wbs koruması (Karar 38, 49) ──
-- AFTER ROW: çok satırlı bir INSERT'te bütün satırlar eklendikten sonraki kümeye bakılır (sıra bağımsız).
-- Alan, WBS veya proje silinirken gelen CASCADE silmede kontrol atlanır.
create function public.fn_area_wbs_aid_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aids text[];
begin
  if tg_op in ('DELETE', 'UPDATE')
     and exists (select 1 from public.projects p where p.id = old.project_id)
     and exists (select 1 from public.project_areas a where a.id = old.area_id)
     and exists (select 1 from public.project_wbs w where w.id = old.wbs_id) then
    v_aids := public.fn_aid_area_wbs_violations(old.wbs_id, old.area_id);
    if v_aids is not null then
      raise exception 'Alan-WBS bağı kaldırılamaz: Activity ID''li görevin alanı bağ kümesinden çıkar (%)',
        array_to_string(v_aids[1:5], ', ');
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_aids := public.fn_aid_area_wbs_violations(new.wbs_id, null);
    if v_aids is not null then
      raise exception 'Alan-WBS bağı eklenemez: Activity ID''li görevin alanı WBS''in bağ kümesi dışında kalır, Karar 38 (%)',
        array_to_string(v_aids[1:5], ', ');
    end if;
  end if;
  return null;
end $$;
revoke all on function public.fn_area_wbs_aid_guard() from public, anon, authenticated;

create trigger trg_area_wbs_aid_guard
  after insert or update or delete on public.area_wbs
  for each row execute function public.fn_area_wbs_aid_guard();

-- ── A6 · Audit ──
create trigger trg_project_wbs_audit after insert or update or delete on public.project_wbs
  for each row execute function public.fn_register_audit();
create trigger trg_project_areas_audit after insert or update or delete on public.project_areas
  for each row execute function public.fn_register_audit();

-- area_wbs'te id yok: kayıt = area_id, değişen = wbs_id
create function public.fn_area_wbs_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('fons.audit_reason', true), '');
begin
  if tg_op in ('UPDATE', 'DELETE') then
    insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
    values (old.project_id, 'area_wbs', old.area_id, 'delete',
            jsonb_build_object('wbs_id', jsonb_build_array(old.wbs_id, null)), v_reason);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
    values (new.project_id, 'area_wbs', new.area_id, 'insert',
            jsonb_build_object('wbs_id', jsonb_build_array(null, new.wbs_id)), v_reason);
  end if;
  return null;
end $$;
revoke all on function public.fn_area_wbs_audit() from public, anon, authenticated;

create trigger trg_area_wbs_audit after insert or update or delete on public.area_wbs
  for each row execute function public.fn_area_wbs_audit();

-- ── A7 · Import ──
-- p_payload: {file_name, wbs:[{row,code,name,parent_code,discipline,active,notes}],
--             areas:[{row,code,name,area_type,parent_code,active,notes}], links:[{row,area_code,wbs_code}]}
-- active: true | false | null (null = Evet). Satır numarası Excel satırıdır (veri 4. satırdan).
-- p_project_id NULL: yalnızca şablon ve dosya içi kurallar (önizleme); gerçek import reddedilir.
-- Eşleştirme koda göre; dosyada olmayan kayıt silinmez, not_in_file'da raporlanır. Bağ yalnızca eklenir.
-- Gerçek import: hata veya aid_impact varsa hiçbir şey yazılmaz ('validation'); proje satırı kilitlenir.
create function public.import_wbs_areas(p_project_id text, p_payload jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := public.get_my_role();
  v_file    text := left(coalesce(nullif(btrim(p_payload ->> 'file_name'), ''), 'dosya'), 200);
  v_types   text[] := array['genel','ges','pv_blok','inverter_station','mv_feeder','tm','eih_section',
                            'depo','laydown','kamp','yol','diger'];
  tk        record;
  rw        record;
  v_err_n   int;
  v_aid_n   int;
  v_report  jsonb;
  v_written jsonb;
  v_n1      int := 0;
  v_n2      int := 0;
  v_n3      int := 0;
  v_n4      int := 0;
  v_n5      int := 0;
  v_k       int;
  v_msg     text;
begin
  if v_role is null or v_role not in ('admin', 'proje_yoneticisi') then
    perform public.register_raise('forbidden', 'WBS/alan import''unu yalnızca admin ve proje yöneticisi yapabilir');
  end if;
  if p_project_id is not null then
    if not exists (select 1 from public.projects pr where pr.id = p_project_id) then
      perform public.register_raise('not_found', 'Proje bulunamadı', jsonb_build_object('project_id', p_project_id));
    end if;
    if not public.has_project_access(p_project_id) then
      perform public.register_raise('forbidden', 'Bu projeye erişim yetkiniz yok', jsonb_build_object('project_id', p_project_id));
    end if;
  elsif not p_dry_run then
    perform public.register_raise('validation', 'Proje seçilmeden yalnızca doğrulama (önizleme) yapılabilir');
  end if;
  if jsonb_typeof(coalesce(p_payload -> 'wbs', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'areas', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'links', '[]')) <> 'array' then
    perform public.register_raise('validation', 'Dosya içeriği okunamadı (wbs, areas, links dizi olmalı)');
  end if;

  -- Çalışma tabloları (işlem sonunda düşer). Her çağrıda düşürülüp yeniden kurulur: oturumda aynı adla
  -- önceden açılmış (çağıranın sahibi olduğu) bir geçici tablo yeniden kullanılmaz.
  drop table if exists pg_temp._iwa_w, pg_temp._iwa_a, pg_temp._iwa_l, pg_temp._iwa_e, pg_temp._iwa_fw, pg_temp._iwa_fa;
  create temp table _iwa_w (rn int, code text, name text, parent_code text, discipline text,
    active_raw jsonb, notes text, first_rn int) on commit drop;
  create temp table _iwa_a (rn int, code text, name text, area_type text, parent_code text,
    active_raw jsonb, notes text, first_rn int) on commit drop;
  create temp table _iwa_l (rn int, area_code text, wbs_code text, first_rn int) on commit drop;
  create temp table _iwa_e (sheet text, rn int, err text, field text, message text,
    activity_id text) on commit drop;
  -- Son durum: dosyadaki (ilk geçiş) + dosyada olmayan mevcut kayıtlar
  create temp table _iwa_fw (code text, parent_code text, active boolean, in_file boolean,
    rn int, cur_id uuid, cur_parent_code text, cur_active boolean, depth int) on commit drop;
  create temp table _iwa_fa (code text, parent_code text, active boolean, in_file boolean,
    rn int, cur_id uuid, cur_parent_code text, cur_active boolean, depth int) on commit drop;

  insert into _iwa_w (rn, code, name, parent_code, discipline, active_raw, notes)
  select coalesce((e ->> 'row')::int, o::int + 3), nullif(btrim(e ->> 'code'), ''), nullif(btrim(e ->> 'name'), ''),
         nullif(btrim(e ->> 'parent_code'), ''), nullif(btrim(e ->> 'discipline'), ''), e -> 'active',
         nullif(btrim(e ->> 'notes'), '')
    from jsonb_array_elements(coalesce(p_payload -> 'wbs', '[]')) with ordinality as x(e, o);
  insert into _iwa_a (rn, code, name, area_type, parent_code, active_raw, notes)
  select coalesce((e ->> 'row')::int, o::int + 3), nullif(btrim(e ->> 'code'), ''), nullif(btrim(e ->> 'name'), ''),
         nullif(btrim(e ->> 'area_type'), ''), nullif(btrim(e ->> 'parent_code'), ''), e -> 'active',
         nullif(btrim(e ->> 'notes'), '')
    from jsonb_array_elements(coalesce(p_payload -> 'areas', '[]')) with ordinality as x(e, o);
  insert into _iwa_l (rn, area_code, wbs_code)
  select coalesce((e ->> 'row')::int, o::int + 3), nullif(btrim(e ->> 'area_code'), ''), nullif(btrim(e ->> 'wbs_code'), '')
    from jsonb_array_elements(coalesce(p_payload -> 'links', '[]')) with ordinality as x(e, o);

  update _iwa_w w set first_rn = f.m from (select code, min(rn) m from _iwa_w where code is not null group by code) f where f.code = w.code;
  update _iwa_a a set first_rn = f.m from (select code, min(rn) m from _iwa_a where code is not null group by code) f where f.code = a.code;
  update _iwa_l l set first_rn = f.m
    from (select area_code, wbs_code, min(rn) m from _iwa_l where area_code is not null and wbs_code is not null
          group by area_code, wbs_code) f
   where f.area_code = l.area_code and f.wbs_code = l.wbs_code;

  -- 1 · Şablon kuralları
  insert into _iwa_e (sheet, rn, err, field, message)
  select 'WBS', null::int, 'row_limit', null::text, 'WBS sayfasında en fazla 5000 satır olabilir' from _iwa_w having count(*) > 5000
  union all select 'Alanlar', null::int, 'row_limit', null::text, 'Alanlar sayfasında en fazla 5000 satır olabilir' from _iwa_a having count(*) > 5000
  union all select 'Alan-WBS', null::int, 'row_limit', null::text, 'Alan-WBS sayfasında en fazla 5000 satır olabilir' from _iwa_l having count(*) > 5000;

  insert into _iwa_e (sheet, rn, err, field, message)
  select 'WBS', rn, 'required_missing', 'code', 'WBS kodu boş' from _iwa_w where code is null
  union all select 'WBS', rn, 'required_missing', 'name', 'WBS adı boş' from _iwa_w where name is null
  union all select 'WBS', rn, 'code_format', 'code', 'WBS kodu yalnızca büyük harf, rakam ve tire içerebilir, harf/rakamla başlar: ' || code
              from _iwa_w where code !~ '^[A-Z0-9][A-Z0-9-]*$'
  union all select 'WBS', rn, 'value_invalid', 'active', 'Aktif yalnızca Evet veya Hayır olabilir'
              from _iwa_w where active_raw is not null and jsonb_typeof(active_raw) not in ('boolean', 'null')
  union all select 'WBS', rn, 'discipline_unknown', 'discipline', 'Bilinmeyen disiplin: ' || discipline
              from _iwa_w w where discipline is not null
               and not exists (select 1 from public.task_disciplines d where d.discipline = w.discipline)
  union all select 'WBS', rn, 'duplicate_in_file', 'code', 'WBS kodu dosyada tekrar ediyor: ' || code || ' (ilk satır ' || first_rn || ')'
              from _iwa_w where rn <> first_rn
  union all select 'WBS', rn, 'self_parent', 'parent_code', 'WBS kendi üstü olamaz: ' || code
              from _iwa_w where parent_code = code
  union all select 'Alanlar', rn, 'required_missing', 'code', 'Alan kodu boş' from _iwa_a where code is null
  union all select 'Alanlar', rn, 'required_missing', 'name', 'Alan adı boş' from _iwa_a where name is null
  union all select 'Alanlar', rn, 'code_format', 'code', 'Alan kodu yalnızca büyük harf ve rakam içerebilir (tire yok): ' || code
              from _iwa_a where code !~ '^[A-Z0-9]+$'
  union all select 'Alanlar', rn, 'value_invalid', 'active', 'Aktif yalnızca Evet veya Hayır olabilir'
              from _iwa_a where active_raw is not null and jsonb_typeof(active_raw) not in ('boolean', 'null')
  union all select 'Alanlar', rn, 'value_invalid', 'area_type', 'Geçersiz alan tipi: ' || area_type
              from _iwa_a where area_type is not null and not (area_type = any (v_types))
  union all select 'Alanlar', rn, 'duplicate_in_file', 'code', 'Alan kodu dosyada tekrar ediyor: ' || code || ' (ilk satır ' || first_rn || ')'
              from _iwa_a where rn <> first_rn
  union all select 'Alanlar', rn, 'self_parent', 'parent_code', 'Alan kendi üstü olamaz: ' || code
              from _iwa_a where parent_code = code
  union all select 'Alan-WBS', rn, 'required_missing', 'area_code', 'Alan kodu boş' from _iwa_l where area_code is null
  union all select 'Alan-WBS', rn, 'required_missing', 'wbs_code', 'WBS kodu boş' from _iwa_l where wbs_code is null
  union all select 'Alan-WBS', rn, 'duplicate_in_file', null, 'Alan-WBS çifti dosyada tekrar ediyor: ' || area_code || ' / ' || wbs_code || ' (ilk satır ' || first_rn || ')'
              from _iwa_l where rn <> first_rn;

  -- 2 · Son durum tabloları
  insert into _iwa_fw (code, parent_code, active, in_file, rn)
  select code, parent_code,
         case when jsonb_typeof(active_raw) = 'boolean' then (active_raw)::boolean else true end, true, rn
    from _iwa_w where code is not null and rn = first_rn;
  insert into _iwa_fa (code, parent_code, active, in_file, rn)
  select code, parent_code,
         case when jsonb_typeof(active_raw) = 'boolean' then (active_raw)::boolean else true end, true, rn
    from _iwa_a where code is not null and rn = first_rn;
  if p_project_id is not null then
    update _iwa_fw f set cur_id = w.id, cur_active = w.is_active, cur_parent_code = pw.wbs_code
      from public.project_wbs w left join public.project_wbs pw on pw.id = w.parent_id
     where w.project_id = p_project_id and w.wbs_code = f.code;
    insert into _iwa_fw (code, parent_code, active, in_file, cur_id, cur_parent_code, cur_active)
    select w.wbs_code, pw.wbs_code, w.is_active, false, w.id, pw.wbs_code, w.is_active
      from public.project_wbs w left join public.project_wbs pw on pw.id = w.parent_id
     where w.project_id = p_project_id and not exists (select 1 from _iwa_fw f where f.code = w.wbs_code);
    update _iwa_fa f set cur_id = a.id, cur_active = a.is_active, cur_parent_code = pa.area_code
      from public.project_areas a left join public.project_areas pa on pa.id = a.parent_id
     where a.project_id = p_project_id and a.area_code = f.code;
    insert into _iwa_fa (code, parent_code, active, in_file, cur_id, cur_parent_code, cur_active)
    select a.area_code, pa.area_code, a.is_active, false, a.id, pa.area_code, a.is_active
      from public.project_areas a left join public.project_areas pa on pa.id = a.parent_id
     where a.project_id = p_project_id and not exists (select 1 from _iwa_fa f where f.code = a.area_code);
  end if;

  -- 3 · Hiyerarşi kuralları (dosya + proje birlikte)
  insert into _iwa_e (sheet, rn, err, field, message)
  select 'WBS', f.rn, 'parent_missing', 'parent_code', 'Üst WBS kodu ne dosyada ne projede var: ' || f.parent_code
    from _iwa_fw f where f.in_file and f.parent_code is not null and f.parent_code <> f.code
     and not exists (select 1 from _iwa_fw g where g.code = f.parent_code)
  union all
  select 'Alanlar', f.rn, 'parent_missing', 'parent_code', 'Üst alan kodu ne dosyada ne projede var: ' || f.parent_code
    from _iwa_fa f where f.in_file and f.parent_code is not null and f.parent_code <> f.code
     and not exists (select 1 from _iwa_fa g where g.code = f.parent_code)
  union all
  select 'WBS', f.rn, 'inactive_parent_active_child', 'active', 'Üst WBS pasifken alt WBS aktif olamaz: ' || f.code || ' (üst ' || f.parent_code || ')'
    from _iwa_fw f join _iwa_fw g on g.code = f.parent_code
   where f.in_file and f.active and not g.active
  union all
  select 'Alanlar', f.rn, 'inactive_parent_active_child', 'active', 'Üst alan pasifken alt alan aktif olamaz: ' || f.code || ' (üst ' || f.parent_code || ')'
    from _iwa_fa f join _iwa_fa g on g.code = f.parent_code
   where f.in_file and f.active and not g.active
  union all
  select 'WBS', f.rn, 'deactivate_with_active_children', 'active',
         'Pasifleştirilen WBS''in dosyada olmayan aktif alt kaydı var: ' || f.code || ' (' || string_agg(c.code, ', ' order by c.code) || ')'
    from _iwa_fw f join _iwa_fw c on c.parent_code = f.code and not c.in_file and c.active
   where f.in_file and not f.active
   group by f.rn, f.code
  union all
  select 'Alanlar', f.rn, 'deactivate_with_active_children', 'active',
         'Pasifleştirilen alanın dosyada olmayan aktif alt kaydı var: ' || f.code || ' (' || string_agg(c.code, ', ' order by c.code) || ')'
    from _iwa_fa f join _iwa_fa c on c.parent_code = f.code and not c.in_file and c.active
   where f.in_file and not f.active
   group by f.rn, f.code
  union all
  select 'Alan-WBS', l.rn, 'link_area_missing', 'area_code', 'Alan kodu ne Alanlar sayfasında ne projede var: ' || l.area_code
    from _iwa_l l where l.area_code is not null and not exists (select 1 from _iwa_fa g where g.code = l.area_code)
  union all
  select 'Alan-WBS', l.rn, 'link_wbs_missing', 'wbs_code', 'WBS kodu ne WBS sayfasında ne projede var: ' || l.wbs_code
    from _iwa_l l where l.wbs_code is not null and not exists (select 1 from _iwa_fw g where g.code = l.wbs_code);

  -- Döngü: üst zinciri izlenir, başlangıç koduna geri dönen satırlar raporlanır
  insert into _iwa_e (sheet, rn, err, field, message)
  with recursive walk as (
    select f.rn, f.code as start, f.parent_code as cur, array[f.code] as path
      from _iwa_fw f where f.in_file and f.parent_code is not null and f.parent_code <> f.code
    union all
    select walk.rn, walk.start, g.parent_code, walk.path || walk.cur
      from walk join _iwa_fw g on g.code = walk.cur
     where walk.cur is not null and not (walk.cur = any (walk.path)) and cardinality(walk.path) < 10000
  )
  select distinct 'WBS', rn, 'cycle', 'parent_code', 'WBS hiyerarşisinde döngü: ' || start from walk where cur = start;
  insert into _iwa_e (sheet, rn, err, field, message)
  with recursive walk as (
    select f.rn, f.code as start, f.parent_code as cur, array[f.code] as path
      from _iwa_fa f where f.in_file and f.parent_code is not null and f.parent_code <> f.code
    union all
    select walk.rn, walk.start, g.parent_code, walk.path || walk.cur
      from walk join _iwa_fa g on g.code = walk.cur
     where walk.cur is not null and not (walk.cur = any (walk.path)) and cardinality(walk.path) < 10000
  )
  select distinct 'Alanlar', rn, 'cycle', 'parent_code', 'Alan hiyerarşisinde döngü: ' || start from walk where cur = start;

  -- 4 · Activity ID etkisi (yalnızca projeyle): rapor; asıl koruma trigger'larda
  if p_project_id is not null then
    for tk in
      select t.activity_id, t.area_id, t.wbs_id, a.area_code
        from public.project_tasks t join public.project_areas a on a.id = t.area_id
       where t.project_id = p_project_id and t.activity_id is not null
       order by t.activity_id
    loop
      insert into _iwa_e (sheet, rn, err, field, message, activity_id)
      select 'Alanlar', f.rn, 'aid_impact', 'active', 'Activity ID''li görevin alanı pasifleştirilemez: ' || f.code, tk.activity_id
        from _iwa_fa f where f.in_file and f.code = tk.area_code and f.cur_active and not f.active
      union all
      select 'Alanlar', f.rn, 'aid_impact', 'parent_code', 'Activity ID''li görevin alanı taşınamaz: ' || f.code, tk.activity_id
        from _iwa_fa f where f.in_file and f.code = tk.area_code and f.parent_code is distinct from f.cur_parent_code;

      insert into _iwa_e (sheet, rn, err, field, message, activity_id)
      with recursive anc as (
        select w.id, w.parent_id, w.wbs_code from public.project_wbs w where w.id = tk.wbs_id
        union all
        select w.id, w.parent_id, w.wbs_code from public.project_wbs w join anc on w.id = anc.parent_id
      )
      select 'WBS', f.rn, 'aid_impact', 'active', 'Activity ID''li görevin WBS''i veya üst WBS''i pasifleştirilemez: ' || f.code, tk.activity_id
        from _iwa_fw f join anc on anc.wbs_code = f.code where f.in_file and f.cur_active and not f.active
      union all
      select 'WBS', f.rn, 'aid_impact', 'parent_code', 'Activity ID''li görevin WBS''i veya üst WBS''i taşınamaz: ' || f.code, tk.activity_id
        from _iwa_fw f join anc on anc.wbs_code = f.code where f.in_file and f.parent_code is distinct from f.cur_parent_code;

      -- Karar 38: mevcut bağlar + dosyadaki yeni bağlar; küme doluyken görevin alanı kümede değilse ihlal
      insert into _iwa_e (sheet, rn, err, field, message, activity_id)
      with recursive anc as (
        select w.id, w.parent_id, w.wbs_code from public.project_wbs w where w.id = tk.wbs_id
        union all
        select w.id, w.parent_id, w.wbs_code from public.project_wbs w join anc on w.id = anc.parent_id
      ),
      final_set as (
        select a.area_code from public.area_wbs aw join anc on anc.id = aw.wbs_id
          join public.project_areas a on a.id = aw.area_id
        union
        select l.area_code from _iwa_l l join anc on anc.wbs_code = l.wbs_code where l.rn = l.first_rn
      )
      select 'Alan-WBS', l.rn, 'aid_impact', null,
             'Bağ, Activity ID''li görevin alanını (' || tk.area_code || ') WBS''in bağ kümesi dışında bırakır (Karar 38): '
             || l.area_code || ' / ' || l.wbs_code, tk.activity_id
        from _iwa_l l join anc on anc.wbs_code = l.wbs_code
       where l.rn = l.first_rn and l.area_code <> tk.area_code
         and not exists (select 1 from public.area_wbs aw join public.project_areas a on a.id = aw.area_id
                          where aw.wbs_id = anc.id and a.area_code = l.area_code)
         and not exists (select 1 from final_set s where s.area_code = tk.area_code);
    end loop;
  end if;

  select count(*) filter (where err <> 'aid_impact'), count(*) filter (where err = 'aid_impact')
    into v_err_n, v_aid_n from _iwa_e;

  -- 5 · Rapor
  v_report := jsonb_build_object(
    'project_id', p_project_id,
    'dry_run', p_dry_run,
    'file_name', v_file,
    'errors', coalesce((select jsonb_agg(jsonb_build_object('sheet', sheet, 'row', rn, 'code', err, 'field', field, 'message', message)
                                         order by case sheet when 'WBS' then 1 when 'Alanlar' then 2 else 3 end, rn nulls first, err)
                          from _iwa_e where err <> 'aid_impact'), '[]'),
    'aid_impact', coalesce((select jsonb_agg(jsonb_build_object('sheet', sheet, 'row', rn, 'activity_id', activity_id, 'message', message)
                                             order by case sheet when 'WBS' then 1 when 'Alanlar' then 2 else 3 end, rn, activity_id)
                              from _iwa_e where err = 'aid_impact'), '[]'),
    'items', jsonb_build_object(
      'wbs', coalesce((select jsonb_agg(jsonb_build_object('row', w.rn, 'code', w.code, 'action', x.action, 'changes', x.changes) order by w.rn)
                         from _iwa_w w
                         left join public.project_wbs cw on cw.project_id = p_project_id and cw.wbs_code = w.code
                         left join public.project_wbs pw on pw.id = cw.parent_id
                         cross join lateral (
                           select array_remove(array[
                                    case when cw.name is distinct from w.name then 'name' end,
                                    case when pw.wbs_code is distinct from w.parent_code then 'parent_code' end,
                                    case when cw.discipline is distinct from w.discipline then 'discipline' end,
                                    case when cw.is_active is distinct from coalesce(case when jsonb_typeof(w.active_raw) = 'boolean' then (w.active_raw)::boolean end, true) then 'active' end,
                                    case when cw.notes is distinct from w.notes then 'notes' end], null) as ch) c0
                         cross join lateral (
                           select case when exists (select 1 from _iwa_e e where e.sheet = 'WBS' and e.rn = w.rn and e.err <> 'aid_impact') then 'error'
                                       when cw.id is null then 'insert'
                                       when cardinality(c0.ch) > 0 then 'update' else 'unchanged' end as action,
                                  case when cw.id is not null and cardinality(c0.ch) > 0 then to_jsonb(c0.ch) end as changes) x), '[]'),
      'areas', coalesce((select jsonb_agg(jsonb_build_object('row', a.rn, 'code', a.code, 'action', x.action, 'changes', x.changes) order by a.rn)
                         from _iwa_a a
                         left join public.project_areas ca on ca.project_id = p_project_id and ca.area_code = a.code
                         left join public.project_areas pa on pa.id = ca.parent_id
                         cross join lateral (
                           select array_remove(array[
                                    case when ca.name is distinct from a.name then 'name' end,
                                    case when ca.area_type is distinct from coalesce(a.area_type, 'diger') then 'area_type' end,
                                    case when pa.area_code is distinct from a.parent_code then 'parent_code' end,
                                    case when ca.is_active is distinct from coalesce(case when jsonb_typeof(a.active_raw) = 'boolean' then (a.active_raw)::boolean end, true) then 'active' end,
                                    case when ca.notes is distinct from a.notes then 'notes' end], null) as ch) c0
                         cross join lateral (
                           select case when exists (select 1 from _iwa_e e where e.sheet = 'Alanlar' and e.rn = a.rn and e.err <> 'aid_impact') then 'error'
                                       when ca.id is null then 'insert'
                                       when cardinality(c0.ch) > 0 then 'update' else 'unchanged' end as action,
                                  case when ca.id is not null and cardinality(c0.ch) > 0 then to_jsonb(c0.ch) end as changes) x), '[]'),
      'links', coalesce((select jsonb_agg(jsonb_build_object('row', l.rn, 'area_code', l.area_code, 'wbs_code', l.wbs_code,
                           'action', case when exists (select 1 from _iwa_e e where e.sheet = 'Alan-WBS' and e.rn = l.rn and e.err <> 'aid_impact') then 'error'
                                          when exists (select 1 from public.area_wbs aw
                                                         join public.project_areas a on a.id = aw.area_id and a.area_code = l.area_code
                                                         join public.project_wbs w on w.id = aw.wbs_id and w.wbs_code = l.wbs_code
                                                        where aw.project_id = p_project_id) then 'unchanged'
                                          else 'insert' end) order by l.rn)
                         from _iwa_l l), '[]')),
    'not_in_file', jsonb_build_object(
      'wbs', coalesce((select jsonb_agg(f.code order by f.code) from _iwa_fw f where not f.in_file), '[]'),
      'areas', coalesce((select jsonb_agg(f.code order by f.code) from _iwa_fa f where not f.in_file), '[]'),
      'links', coalesce((select jsonb_agg(jsonb_build_object('area_code', a.area_code, 'wbs_code', w.wbs_code) order by a.area_code, w.wbs_code)
                           from public.area_wbs aw
                           join public.project_areas a on a.id = aw.area_id
                           join public.project_wbs w on w.id = aw.wbs_id
                          where aw.project_id = p_project_id
                            and not exists (select 1 from _iwa_l l where l.area_code = a.area_code and l.wbs_code = w.wbs_code)), '[]')));

  v_report := v_report || jsonb_build_object('summary', jsonb_build_object(
    'wbs', (select jsonb_build_object('insert', count(*) filter (where i ->> 'action' = 'insert'),
                                      'update', count(*) filter (where i ->> 'action' = 'update'),
                                      'unchanged', count(*) filter (where i ->> 'action' = 'unchanged'),
                                      'error', count(*) filter (where i ->> 'action' = 'error'))
              from jsonb_array_elements(v_report -> 'items' -> 'wbs') i),
    'areas', (select jsonb_build_object('insert', count(*) filter (where i ->> 'action' = 'insert'),
                                        'update', count(*) filter (where i ->> 'action' = 'update'),
                                        'unchanged', count(*) filter (where i ->> 'action' = 'unchanged'),
                                        'error', count(*) filter (where i ->> 'action' = 'error'))
                from jsonb_array_elements(v_report -> 'items' -> 'areas') i),
    'links', (select jsonb_build_object('insert', count(*) filter (where i ->> 'action' = 'insert'),
                                        'unchanged', count(*) filter (where i ->> 'action' = 'unchanged'),
                                        'error', count(*) filter (where i ->> 'action' = 'error'))
                from jsonb_array_elements(v_report -> 'items' -> 'links') i),
    'error_count', v_err_n,
    'aid_impact_count', v_aid_n));

  if p_dry_run then
    return v_report || jsonb_build_object('note', 'Önizleme: hiçbir şey yazılmadı.');
  end if;
  if v_err_n > 0 or v_aid_n > 0 then
    perform public.register_raise('validation',
      v_err_n || ' hata, ' || v_aid_n || ' Activity ID etkisi; hiçbir şey yazılmadı',
      jsonb_build_object('errors', v_report -> 'errors', 'aid_impact', v_report -> 'aid_impact'));
  end if;

  -- 6 · Yazma (hepsi ya da hiçbiri). Sıra: üstten alta ekle/güncelle (pasifleştirme hariç), sonra alttan üste pasifleştir.
  perform 1 from public.projects pr where pr.id = p_project_id for update;
  perform set_config('fons.audit_reason', 'WBS/alan import: ' || v_file, true);

  with recursive d as (
    select code, 1 as depth from _iwa_fw where parent_code is null
    union all
    select f.code, d.depth + 1 from _iwa_fw f join d on f.parent_code = d.code
  )
  update _iwa_fw f set depth = d.depth from d where d.code = f.code;
  with recursive d as (
    select code, 1 as depth from _iwa_fa where parent_code is null
    union all
    select f.code, d.depth + 1 from _iwa_fa f join d on f.parent_code = d.code
  )
  update _iwa_fa f set depth = d.depth from d where d.code = f.code;

  begin
    for rw in
      select w.code, w.name, w.parent_code, w.discipline, w.notes, f.active, f.cur_id, f.cur_active
        from _iwa_fw f join _iwa_w w on w.rn = f.rn
       where f.in_file order by f.depth, f.code
    loop
      if rw.cur_id is null then
        insert into public.project_wbs (project_id, wbs_code, name, parent_id, discipline, is_active, notes)
        values (p_project_id, rw.code, rw.name,
                (select x.id from public.project_wbs x where x.project_id = p_project_id and x.wbs_code = rw.parent_code),
                rw.discipline, rw.active, rw.notes);
        v_n1 := v_n1 + 1;
      else
        update public.project_wbs x
           set name = rw.name,
               parent_id = (select y.id from public.project_wbs y where y.project_id = p_project_id and y.wbs_code = rw.parent_code),
               discipline = rw.discipline,
               notes = rw.notes,
               is_active = case when rw.active then true else x.is_active end
         where x.id = rw.cur_id
           and (x.name, x.parent_id, x.discipline, x.notes, x.is_active) is distinct from
               (rw.name, (select y.id from public.project_wbs y where y.project_id = p_project_id and y.wbs_code = rw.parent_code),
                rw.discipline, rw.notes, case when rw.active then true else x.is_active end);
        get diagnostics v_k = row_count;
        v_n2 := v_n2 + v_k;
      end if;
    end loop;
    for rw in
      select f.cur_id from _iwa_fw f where f.in_file and not f.active and f.cur_active order by f.depth desc, f.code
    loop
      update public.project_wbs x set is_active = false where x.id = rw.cur_id;
      v_n2 := v_n2 + 1;
    end loop;

    for rw in
      select a.code, a.name, a.parent_code, coalesce(a.area_type, 'diger') as area_type, a.notes, f.active, f.cur_id
        from _iwa_fa f join _iwa_a a on a.rn = f.rn
       where f.in_file order by f.depth, f.code
    loop
      if rw.cur_id is null then
        insert into public.project_areas (project_id, area_code, name, area_type, parent_id, is_active, notes)
        values (p_project_id, rw.code, rw.name, rw.area_type,
                (select x.id from public.project_areas x where x.project_id = p_project_id and x.area_code = rw.parent_code),
                rw.active, rw.notes);
        v_n3 := v_n3 + 1;
      else
        update public.project_areas x
           set name = rw.name,
               area_type = rw.area_type,
               parent_id = (select y.id from public.project_areas y where y.project_id = p_project_id and y.area_code = rw.parent_code),
               notes = rw.notes,
               is_active = case when rw.active then true else x.is_active end
         where x.id = rw.cur_id
           and (x.name, x.area_type, x.parent_id, x.notes, x.is_active) is distinct from
               (rw.name, rw.area_type, (select y.id from public.project_areas y where y.project_id = p_project_id and y.area_code = rw.parent_code),
                rw.notes, case when rw.active then true else x.is_active end);
        get diagnostics v_k = row_count;
        v_n4 := v_n4 + v_k;
      end if;
    end loop;
    for rw in
      select f.cur_id from _iwa_fa f where f.in_file and not f.active and f.cur_active order by f.depth desc, f.code
    loop
      update public.project_areas x set is_active = false where x.id = rw.cur_id;
      v_n4 := v_n4 + 1;
    end loop;

    insert into public.area_wbs (project_id, area_id, wbs_id)
    select p_project_id, a.id, w.id
      from _iwa_l l
      join public.project_areas a on a.project_id = p_project_id and a.area_code = l.area_code
      join public.project_wbs w on w.project_id = p_project_id and w.wbs_code = l.wbs_code
     where l.rn = l.first_rn
       and not exists (select 1 from public.area_wbs aw where aw.area_id = a.id and aw.wbs_id = w.id);
    get diagnostics v_n5 = row_count;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform set_config('fons.audit_reason', '', true);
    perform public.register_raise('validation', 'Yazma sırasında kural ihlali; hiçbir şey yazılmadı: ' || v_msg,
      jsonb_build_object('error', v_msg));
  end;
  perform set_config('fons.audit_reason', '', true);

  v_written := jsonb_build_object('wbs_inserted', v_n1, 'wbs_updated', v_n2, 'areas_inserted', v_n3,
                                  'areas_updated', v_n4, 'links_inserted', v_n5);
  return v_report || jsonb_build_object('written', v_written);
end $$;
revoke all on function public.import_wbs_areas(text, jsonb, boolean) from public, anon;
grant execute on function public.import_wbs_areas(text, jsonb, boolean) to authenticated;

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL (yalnızca gerekirse; guard'lar 12.10.2026 canlı haline döner)
-- ############################################################################
/*
begin;
drop function if exists public.import_wbs_areas(text, jsonb, boolean);
drop trigger if exists trg_area_wbs_audit on public.area_wbs;
drop trigger if exists trg_project_areas_audit on public.project_areas;
drop trigger if exists trg_project_wbs_audit on public.project_wbs;
drop function if exists public.fn_area_wbs_audit();
drop trigger if exists trg_area_wbs_aid_guard on public.area_wbs;
drop function if exists public.fn_area_wbs_aid_guard();
drop trigger if exists trg_project_areas_delete_guard on public.project_areas;
drop trigger if exists trg_project_wbs_delete_guard on public.project_wbs;
drop function if exists public.fn_project_areas_delete_guard();
drop function if exists public.fn_project_wbs_delete_guard();
drop trigger if exists trg_project_wbs_level_cascade on public.project_wbs;
drop function if exists public.fn_project_wbs_level_cascade();

create or replace function public.fn_project_wbs_guard()
returns trigger language plpgsql security invoker set search_path to 'public' as $function$
declare
  parent_level  smallint;
  parent_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'WBS kaydının projesi değiştirilemez';
    end if;
    if new.wbs_code <> old.wbs_code
       and exists (select 1 from public.project_tasks t where t.wbs_id = old.id) then
      raise exception 'Kullanımdaki WBS kodu değiştirilemez: %', old.wbs_code;
    end if;
  end if;

  if new.parent_id is null then
    new.level := 1;
  else
    select w.level, w.is_active into parent_level, parent_active
      from public.project_wbs w where w.id = new.parent_id;
    new.level := parent_level + 1;
    if new.is_active and not parent_active then
      raise exception 'Üst WBS pasifken alt WBS aktif olamaz';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      if exists (
        with recursive anc as (
          select id, parent_id from public.project_wbs where id = new.parent_id
          union all
          select w.id, w.parent_id from public.project_wbs w join anc on w.id = anc.parent_id
        )
        select 1 from anc where id = new.id
      ) then
        raise exception 'WBS kendi alt dalına taşınamaz';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.fn_project_areas_guard()
returns trigger language plpgsql security invoker set search_path to 'public' as $function$
declare
  parent_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then
      raise exception 'Alan kaydının projesi değiştirilemez';
    end if;
    if new.area_code <> old.area_code
       and exists (select 1 from public.project_tasks t where t.area_id = old.id) then
      raise exception 'Kullanımdaki alan kodu değiştirilemez: %', old.area_code;
    end if;
  end if;

  if new.parent_id is not null then
    select a.is_active into parent_active
      from public.project_areas a where a.id = new.parent_id;
    if new.is_active and not parent_active then
      raise exception 'Üst alan pasifken alt alan aktif olamaz';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      if exists (
        with recursive anc as (
          select id, parent_id from public.project_areas where id = new.parent_id
          union all
          select a.id, a.parent_id from public.project_areas a join anc on a.id = anc.parent_id
        )
        select 1 from anc where id = new.id
      ) then
        raise exception 'Alan kendi alt dalına taşınamaz';
      end if;
    end if;
  end if;
  return new;
end;
$function$;
-- EXECUTE yetkisi değişmez (12.10.2026 canlı: postgres, service_role); CREATE OR REPLACE yetkiyi korur.

drop function if exists public.fn_aid_area_wbs_violations(uuid, uuid);
drop function if exists public.fn_area_activity_ids(uuid);
drop function if exists public.fn_wbs_subtree_activity_ids(uuid);
drop index if exists public.idx_project_wbs_discipline;
alter table public.project_wbs drop constraint if exists project_wbs_discipline_fk;
commit;
*/
