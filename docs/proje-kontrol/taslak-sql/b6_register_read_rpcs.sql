-- ============================================================================
-- FAZ B · B6 — register okuma görünümleri ve RPC'leri — TASLAK (UYGULANMADI) · 07.10.2026
-- Plan: docs/proje-kontrol/faz-b-migration-plani.md · Tasarım: tasarim.md §4.4 (Okuma), §4.7
-- Doğrulama: taslak-sql/b6_dogrulama.sql · Anlık görüntü: yeni nesneler + realtime yayın listesi (yedek-faz-b-07-10.sql §B6)
-- Test: tests/proje-kontrol-b6-okuma.spec.js
-- Bağımlılık: B1 (register_can, get_my_register_permissions), B2 (register_audit), B3 (ortak kolonlar, yardımcılar).
--
-- İçerik:
--   * vw_reg_<tür> görünümleri (security_invoker = on → doğrudan sorguda RLS geçerli) ve hepsini birleştiren
--     vw_reg_items: ortak kolonlar (register_type, register_no, title, status, record_state, …, is_overdue) + extra jsonb.
--     Numara tabloya özel kolondan register_no takma adıyla gelir.
--   * get_register_list, get_register_detail, get_register_overview, get_register_audit.
--     SECURITY DEFINER; ilk iş proje erişimi + register_can('view'). Dinamik SQL yok: tür, vw_reg_items'ta
--     register_type sütunuyla seçilir (UNION dalları sabit değerle budanır).
--   * Realtime yayını: 8 register tablosu (RLS realtime'da da geçerli).
--   AI taslak sayısı (overview) Faz C'de register_drafts ile eklenir; search_register_refs Faz C.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A1 · Görünümler ──
create view public.vw_reg_document with (security_invoker = on) as
select 'document'::text as register_type, d.id, d.project_id, d.document_no as register_no, d.title,
       d.status, d.record_state, d.source, null::text as priority, null::date as due_date,
       null::uuid as assigned_to, d.created_by, d.created_at, d.updated_at,
       d.wbs_id, d.area_id, d.task_id, t.task_code, w.wbs_code, a.area_code,
       false as is_overdue,
       jsonb_build_object(
         'document_type', d.document_type, 'discipline', d.discipline, 'drawing_id', g.id,
         'current_revision', case when cr.id is null then null else jsonb_build_object(
           'id', cr.id, 'revision_no', cr.revision_no, 'revision_status', cr.revision_status,
           'issue_date', cr.issue_date, 'file_name', cr.file_name, 'mime_type', cr.mime_type,
           'size_bytes', cr.size_bytes) end) as extra
from public.documents d
left join public.drawings g on g.document_id = d.id
left join lateral (select r.* from public.document_revisions r where r.document_id = d.id and r.is_current limit 1) cr on true
left join public.project_tasks t on t.project_id = d.project_id and t.id = d.task_id
left join public.project_wbs w on w.project_id = d.project_id and w.id = d.wbs_id
left join public.project_areas a on a.project_id = d.project_id and a.id = d.area_id;

create view public.vw_reg_drawing with (security_invoker = on) as
select 'drawing'::text as register_type, g.id, g.project_id, d.document_no as register_no, d.title,
       d.status, d.record_state, d.source, null::text as priority, null::date as due_date,
       null::uuid as assigned_to, g.created_by, g.created_at, g.updated_at,
       d.wbs_id, d.area_id, d.task_id, t.task_code, w.wbs_code, a.area_code,
       false as is_overdue,
       jsonb_build_object(
         'document_id', d.id, 'drawing_type', g.drawing_type, 'discipline', d.discipline,
         'current_revision', case when cr.id is null then null else jsonb_build_object(
           'id', cr.id, 'revision_no', cr.revision_no, 'revision_status', cr.revision_status,
           'issue_date', cr.issue_date, 'file_name', cr.file_name) end) as extra
from public.drawings g
join public.documents d on d.project_id = g.project_id and d.id = g.document_id
left join lateral (select r.* from public.document_revisions r where r.document_id = d.id and r.is_current limit 1) cr on true
left join public.project_tasks t on t.project_id = d.project_id and t.id = d.task_id
left join public.project_wbs w on w.project_id = d.project_id and w.id = d.wbs_id
left join public.project_areas a on a.project_id = d.project_id and a.id = d.area_id;

create view public.vw_reg_rfi with (security_invoker = on) as
select 'rfi'::text as register_type, x.id, x.project_id, x.rfi_no as register_no, x.subject as title,
       x.status, x.record_state, x.source, x.priority, x.due_date,
       x.assigned_to, x.created_by, x.created_at, x.updated_at,
       x.wbs_id, x.area_id, x.task_id, t.task_code, w.wbs_code, a.area_code,
       (x.due_date < current_date and x.status in ('open','under_review')) as is_overdue,
       jsonb_build_object('question', x.question, 'raised_by', x.raised_by, 'raised_date', x.raised_date,
         'answered_date', x.answered_date, 'responsible_discipline', x.responsible_discipline,
         'drawing_id', x.drawing_id, 'document_id', x.document_id, 'decision_id', x.decision_id) as extra
from public.rfis x
left join public.project_tasks t on t.project_id = x.project_id and t.id = x.task_id
left join public.project_wbs w on w.project_id = x.project_id and w.id = x.wbs_id
left join public.project_areas a on a.project_id = x.project_id and a.id = x.area_id;

create view public.vw_reg_action with (security_invoker = on) as
select 'action'::text as register_type, x.id, x.project_id, x.action_no as register_no, x.title,
       x.status, x.record_state, x.source, x.priority, x.due_date,
       x.assigned_to, x.created_by, x.created_at, x.updated_at,
       x.wbs_id, x.area_id, x.task_id, t.task_code, w.wbs_code, a.area_code,
       (x.due_date < current_date and x.status in ('open','in_progress')) as is_overdue,
       jsonb_build_object('source_type', x.source_type, 'responsible', x.responsible, 'completed_at', x.completed_at,
         'rfi_id', x.rfi_id, 'risk_id', x.risk_id, 'decision_id', x.decision_id) as extra
from public.project_actions x
left join public.project_tasks t on t.project_id = x.project_id and t.id = x.task_id
left join public.project_wbs w on w.project_id = x.project_id and w.id = x.wbs_id
left join public.project_areas a on a.project_id = x.project_id and a.id = x.area_id;

create view public.vw_reg_decision with (security_invoker = on) as
select 'decision'::text as register_type, x.id, x.project_id, x.decision_no as register_no, x.title,
       x.status, x.record_state, x.source, null::text as priority, null::date as due_date,
       null::uuid as assigned_to, x.created_by, x.created_at, x.updated_at,
       x.wbs_id, x.area_id, x.task_id, t.task_code, w.wbs_code, a.area_code,
       false as is_overdue,
       jsonb_build_object('decision_date', x.decision_date, 'decision_maker', x.decision_maker,
         'rfi_id', x.rfi_id, 'risk_id', x.risk_id) as extra
from public.decisions x
left join public.project_tasks t on t.project_id = x.project_id and t.id = x.task_id
left join public.project_wbs w on w.project_id = x.project_id and w.id = x.wbs_id
left join public.project_areas a on a.project_id = x.project_id and a.id = x.area_id;

create view public.vw_reg_submittal with (security_invoker = on) as
select 'submittal'::text as register_type, x.id, x.project_id, x.submittal_no as register_no, x.title,
       x.status, x.record_state, x.source, null::text as priority, x.due_date,
       null::uuid as assigned_to, x.created_by, x.created_at, x.updated_at,
       x.wbs_id, x.area_id, x.task_id, t.task_code, w.wbs_code, a.area_code,
       (x.due_date < current_date and x.status in ('submitted','under_review')) as is_overdue,
       jsonb_build_object('discipline', x.discipline, 'supplier_id', x.supplier_id, 'reviewer_id', x.reviewer_id,
         'submitted_date', x.submitted_date, 'reviewed_date', x.reviewed_date, 'revision', x.revision,
         'document_id', x.document_id) as extra
from public.technical_submittals x
left join public.project_tasks t on t.project_id = x.project_id and t.id = x.task_id
left join public.project_wbs w on w.project_id = x.project_id and w.id = x.wbs_id
left join public.project_areas a on a.project_id = x.project_id and a.id = x.area_id;

create view public.vw_reg_material_approval with (security_invoker = on) as
select 'material_approval'::text as register_type, x.id, x.project_id, x.approval_no as register_no, x.material_name as title,
       x.status, x.record_state, x.source, null::text as priority, null::date as due_date,
       null::uuid as assigned_to, x.created_by, x.created_at, x.updated_at,
       x.wbs_id, x.area_id, x.task_id, t.task_code, w.wbs_code, a.area_code,
       false as is_overdue,
       jsonb_build_object('manufacturer', x.manufacturer, 'model', x.model, 'supplier_id', x.supplier_id,
         'submitted_date', x.submitted_date, 'approved_date', x.approved_date, 'revision', x.revision,
         'technical_submittal_id', x.technical_submittal_id, 'document_id', x.document_id) as extra
from public.material_approvals x
left join public.project_tasks t on t.project_id = x.project_id and t.id = x.task_id
left join public.project_wbs w on w.project_id = x.project_id and w.id = x.wbs_id
left join public.project_areas a on a.project_id = x.project_id and a.id = x.area_id;

create view public.vw_reg_items with (security_invoker = on) as
          select * from public.vw_reg_document
union all select * from public.vw_reg_drawing
union all select * from public.vw_reg_rfi
union all select * from public.vw_reg_action
union all select * from public.vw_reg_decision
union all select * from public.vw_reg_submittal
union all select * from public.vw_reg_material_approval;

revoke all on public.vw_reg_document, public.vw_reg_drawing, public.vw_reg_rfi, public.vw_reg_action,
  public.vw_reg_decision, public.vw_reg_submittal, public.vw_reg_material_approval, public.vw_reg_items
  from anon, authenticated;
grant select on public.vw_reg_document, public.vw_reg_drawing, public.vw_reg_rfi, public.vw_reg_action,
  public.vw_reg_decision, public.vw_reg_submittal, public.vw_reg_material_approval, public.vw_reg_items
  to authenticated;

-- ── A2 · Okuma RPC'leri ──
create function public.get_register_list(
  p_project_id text, p_register_type text, p_filters jsonb default '{}'::jsonb,
  p_search text default null, p_sort text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_status text[]; v_state text[]; v_priority text[];
  v_sort text := coalesce(nullif(ltrim(coalesce(p_sort, ''), '-'), ''), 'created_at');
  v_desc boolean := p_sort is null or left(p_sort, 1) = '-';
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_total bigint;
  v_items jsonb;
begin
  if p_register_type not in ('document','drawing','rfi','action','decision','submittal','material_approval') then
    perform public.register_raise('validation', 'Bilinmeyen register türü', jsonb_build_object('register_type', p_register_type));
  end if;
  if p_project_id is null then
    perform public.register_raise('validation', 'Proje seçilmedi', '{"fields":["p_project_id"]}');
  end if;
  if not public.has_project_access(p_project_id) or not public.register_can(p_register_type, 'view') then
    perform public.register_raise('forbidden', 'Bu register''ı görme yetkiniz yok');
  end if;
  if v_sort not in ('register_no','title','status','due_date','created_at','updated_at') then
    perform public.register_raise('validation', 'Geçersiz sıralama', jsonb_build_object('p_sort', p_sort));
  end if;
  -- Filtre değerleri tek değer veya dizi olabilir
  v_status := case when f ? 'status' then array(select jsonb_array_elements_text(
                case jsonb_typeof(f -> 'status') when 'array' then f -> 'status' else jsonb_build_array(f -> 'status') end)) end;
  v_state := case when f ? 'record_state' then array(select jsonb_array_elements_text(
                case jsonb_typeof(f -> 'record_state') when 'array' then f -> 'record_state' else jsonb_build_array(f -> 'record_state') end)) end;
  v_priority := case when f ? 'priority' then array(select jsonb_array_elements_text(
                case jsonb_typeof(f -> 'priority') when 'array' then f -> 'priority' else jsonb_build_array(f -> 'priority') end)) end;

  with base as (
    select v.* from public.vw_reg_items v
    where v.register_type = p_register_type and v.project_id = p_project_id
      and (v_status is null or v.status = any(v_status))
      and (v_state is null or v.record_state = any(v_state))
      and (v_priority is null or v.priority = any(v_priority))
      and (not f ? 'assigned_to' or v.assigned_to = (f ->> 'assigned_to')::uuid)
      and (not f ? 'wbs_id' or v.wbs_id = (f ->> 'wbs_id')::uuid)
      and (not f ? 'area_id' or v.area_id = (f ->> 'area_id')::uuid)
      and (not f ? 'task_id' or v.task_id = (f ->> 'task_id')::uuid)
      and (coalesce((f ->> 'overdue')::boolean, false) = false or v.is_overdue)
      and (coalesce((f ->> 'mine')::boolean, false) = false or v.created_by = auth.uid())
      and (v_search is null or v.register_no ilike '%' || v_search || '%' or v.title ilike '%' || v_search || '%')
  ), page as (
    select b.* from base b
    order by
      case when v_sort = 'register_no' and not v_desc then b.register_no end asc,
      case when v_sort = 'register_no' and v_desc then b.register_no end desc,
      case when v_sort = 'title' and not v_desc then b.title end asc,
      case when v_sort = 'title' and v_desc then b.title end desc,
      case when v_sort = 'status' and not v_desc then b.status end asc,
      case when v_sort = 'status' and v_desc then b.status end desc,
      case when v_sort = 'due_date' and not v_desc then b.due_date end asc nulls last,
      case when v_sort = 'due_date' and v_desc then b.due_date end desc nulls last,
      case when v_sort = 'created_at' and not v_desc then b.created_at end asc,
      case when v_sort = 'created_at' and v_desc then b.created_at end desc,
      case when v_sort = 'updated_at' and not v_desc then b.updated_at end asc,
      case when v_sort = 'updated_at' and v_desc then b.updated_at end desc,
      b.created_at desc, b.id
    limit v_limit offset v_offset
  )
  select (select count(*) from base), coalesce((select jsonb_agg(to_jsonb(p)) from page p), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
exception
  when invalid_text_representation then
    perform public.register_raise('validation', 'Filtre değeri geçersiz', jsonb_build_object('error', sqlerrm));
end $$;

create function public.get_register_detail(p_register_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_rec jsonb;
  v_project text;
  v_doc_id uuid;
  v_links_out jsonb;
  v_links_in jsonb;
  v_revisions jsonb;
  v_perm jsonb;
  v_transitions jsonb;
  v_history jsonb;
begin
  if p_register_type not in ('document','drawing','rfi','action','decision','submittal','material_approval') then
    perform public.register_raise('validation', 'Bilinmeyen register türü', jsonb_build_object('register_type', p_register_type));
  end if;
  select to_jsonb(v) into v_item from public.vw_reg_items v where v.register_type = p_register_type and v.id = p_id;
  v_project := v_item ->> 'project_id';
  if v_item is null or not public.has_project_access(v_project) then
    perform public.register_raise('not_found', 'Kayıt bulunamadı', jsonb_build_object('register_type', p_register_type, 'id', p_id));
  end if;
  if not public.register_can(p_register_type, 'view') then
    perform public.register_raise('forbidden', 'Bu register''ı görme yetkiniz yok');
  end if;

  v_rec := case p_register_type
    when 'document' then (select to_jsonb(x) from public.documents x where x.id = p_id)
    when 'drawing' then (select to_jsonb(x) from public.drawings x where x.id = p_id)
    when 'rfi' then (select to_jsonb(x) from public.rfis x where x.id = p_id)
    when 'action' then (select to_jsonb(x) from public.project_actions x where x.id = p_id)
    when 'decision' then (select to_jsonb(x) from public.decisions x where x.id = p_id)
    when 'submittal' then (select to_jsonb(x) from public.technical_submittals x where x.id = p_id)
    when 'material_approval' then (select to_jsonb(x) from public.material_approvals x where x.id = p_id)
  end || jsonb_build_object('register_no', v_item ->> 'register_no');

  -- Giden bağlar (kaydın kendi kompozit FK kolonları)
  select coalesce(jsonb_agg(jsonb_build_object('to_type', l.to_type, 'to_id', l.to_id, 'column', l.col,
           'register_no', i.register_no, 'title', coalesce(i.title, r.title), 'status', coalesce(i.status, r.status))
           order by l.to_type), '[]'::jsonb)
    into v_links_out
    from (select m.to_type, m.col, (v_rec ->> m.col)::uuid as to_id
          from (values ('rfi','drawing','drawing_id'), ('rfi','document','document_id'), ('rfi','decision','decision_id'),
                       ('action','rfi','rfi_id'), ('action','decision','decision_id'), ('action','risk','risk_id'),
                       ('decision','rfi','rfi_id'), ('decision','risk','risk_id'),
                       ('submittal','document','document_id'),
                       ('material_approval','document','document_id'), ('material_approval','submittal','technical_submittal_id')
               ) m(from_type, to_type, col)
          where m.from_type = p_register_type and v_rec ->> m.col is not null) l
    left join public.vw_reg_items i on i.register_type = l.to_type and i.id = l.to_id
    left join public.project_risks r on l.to_type = 'risk' and r.id = l.to_id
   where public.register_can(l.to_type, 'view');

  -- Gelen bağlar (başka kayıtların bu kayda işaret eden kolonları)
  select coalesce(jsonb_agg(jsonb_build_object('from_type', x.t, 'from_id', x.id, 'register_no', i.register_no,
           'title', i.title, 'status', i.status) order by x.t, i.register_no), '[]'::jsonb)
    into v_links_in
    from (
      select 'rfi'::text t, z.id from public.rfis z where p_register_type = 'drawing' and z.drawing_id = p_id
      union all select 'rfi', z.id from public.rfis z where p_register_type = 'document' and z.document_id = p_id
      union all select 'submittal', z.id from public.technical_submittals z where p_register_type = 'document' and z.document_id = p_id
      union all select 'material_approval', z.id from public.material_approvals z where p_register_type = 'document' and z.document_id = p_id
      union all select 'rfi', z.id from public.rfis z where p_register_type = 'decision' and z.decision_id = p_id
      union all select 'action', z.id from public.project_actions z where p_register_type = 'decision' and z.decision_id = p_id
      union all select 'action', z.id from public.project_actions z where p_register_type = 'rfi' and z.rfi_id = p_id
      union all select 'decision', z.id from public.decisions z where p_register_type = 'rfi' and z.rfi_id = p_id
      union all select 'material_approval', z.id from public.material_approvals z where p_register_type = 'submittal' and z.technical_submittal_id = p_id
    ) x
    join public.vw_reg_items i on i.register_type = x.t and i.id = x.id
   where public.register_can(x.t, 'view');

  -- Revizyonlar (doküman ve çizim)
  v_doc_id := case p_register_type when 'document' then p_id
                                   when 'drawing' then (v_rec ->> 'document_id')::uuid end;
  if v_doc_id is not null then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      into v_revisions from public.document_revisions r where r.document_id = v_doc_id;
  end if;

  v_perm := coalesce(public.get_my_register_permissions(v_project) -> 'registers' -> p_register_type, '{}'::jsonb)
            || jsonb_build_object('can_edit_this',
                 p_register_type <> 'drawing' and public.register_can_edit_row(p_register_type, v_rec));

  select coalesce(jsonb_agg(t.to_status order by t.to_status), '[]'::jsonb) into v_transitions
    from public.register_status_transitions t
   where t.register_type = p_register_type and t.from_status = v_rec ->> 'status'
     and (v_rec ->> 'record_state') = 'approved';

  select coalesce(jsonb_agg(jsonb_build_object('old_status', h.old_status, 'new_status', h.new_status,
           'changed_by', h.changed_by, 'changed_at', h.changed_at) order by h.changed_at desc), '[]'::jsonb)
    into v_history
    from (select * from public.register_status_history h
          where h.record_id = p_id order by h.changed_at desc limit 20) h;

  return jsonb_build_object(
    'record', v_rec, 'item', v_item,
    'links', jsonb_build_object('outgoing', v_links_out, 'incoming', v_links_in),
    'revisions', v_revisions,
    'permissions', v_perm,
    'allowed_status_transitions', v_transitions,
    'status_history', v_history);
end $$;

create function public.get_register_overview(p_project_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if p_project_id is null then
    perform public.register_raise('validation', 'Proje seçilmedi', '{"fields":["p_project_id"]}');
  end if;
  if not public.has_project_access(p_project_id) then
    perform public.register_raise('forbidden', 'Bu projeye erişiminiz yok');
  end if;
  select coalesce(jsonb_object_agg(s.register_type, jsonb_build_object(
           'total', s.total, 'draft', s.draft, 'pending_approval', s.pending, 'open', s.open_cnt, 'overdue', s.overdue)), '{}'::jsonb)
    into v
    from (
      select t.register_type,
             count(i.id) as total,
             count(i.id) filter (where i.record_state = 'draft') as draft,
             count(i.id) filter (where i.record_state = 'pending_approval') as pending,
             count(i.id) filter (where i.status in ('active','open','under_review','in_progress','proposed',
                                                    'draft','submitted','resubmit_required')) as open_cnt,
             count(i.id) filter (where i.is_overdue) as overdue
      from (values ('document'),('drawing'),('rfi'),('action'),('decision'),('submittal'),('material_approval')) t(register_type)
      left join public.vw_reg_items i on i.register_type = t.register_type and i.project_id = p_project_id
      where public.register_can(t.register_type, 'view')
      group by t.register_type
    ) s;
  -- pending_ai_drafts: Faz C'de register_drafts ile doldurulur
  return jsonb_build_object('project_id', p_project_id, 'registers', v, 'pending_ai_drafts', null);
end $$;

create function public.get_register_audit(p_register_type text, p_id uuid, p_limit int default 50, p_before bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare m record; v_project text; v_items jsonb;
begin
  select * into m from public.register_meta(p_register_type);
  select v.project_id into v_project from public.vw_reg_items v where v.register_type = p_register_type and v.id = p_id;
  if v_project is null or not public.has_project_access(v_project) then
    perform public.register_raise('not_found', 'Kayıt bulunamadı', jsonb_build_object('register_type', p_register_type, 'id', p_id));
  end if;
  if not public.register_can(p_register_type, 'view') then
    perform public.register_raise('forbidden', 'Bu register''ı görme yetkiniz yok');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'table_name', a.table_name, 'record_id', a.record_id,
           'action', a.action, 'changed_by', a.changed_by, 'changed_by_name', p.full_name,
           'changed_at', a.changed_at, 'changed_fields', a.changed_fields, 'reason', a.reason) order by a.id desc), '[]'::jsonb)
    into v_items
    from (select * from public.register_audit a
          where a.project_id = v_project
            and (p_before is null or a.id < p_before)
            and ((a.table_name = m.tbl and a.record_id = p_id)
                 or (p_register_type in ('document','drawing') and a.table_name = 'document_revisions'
                     and a.record_id in (select r.id from public.document_revisions r
                                         where r.document_id = case when p_register_type = 'document' then p_id
                                                                    else (select g.document_id from public.drawings g where g.id = p_id) end)))
          order by a.id desc
          limit least(greatest(coalesce(p_limit, 50), 1), 200)) a
    left join public.profiles p on p.id = a.changed_by;
  return jsonb_build_object('items', v_items);
end $$;

revoke all on function public.get_register_list(text, text, jsonb, text, text, int, int) from public, anon;
revoke all on function public.get_register_detail(text, uuid) from public, anon;
revoke all on function public.get_register_overview(text) from public, anon;
revoke all on function public.get_register_audit(text, uuid, int, bigint) from public, anon;
grant execute on function public.get_register_list(text, text, jsonb, text, text, int, int) to authenticated;
grant execute on function public.get_register_detail(text, uuid) to authenticated;
grant execute on function public.get_register_overview(text) to authenticated;
grant execute on function public.get_register_audit(text, uuid, int, bigint) to authenticated;

-- ── A3 · Realtime yayını (RLS realtime aboneliklerinde de uygulanır) ──
do $$
declare t text;
begin
  foreach t in array array['documents','document_revisions','drawings','rfis','project_actions','decisions',
                           'technical_submittals','material_approvals'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL
-- ############################################################################
/*
begin;
do $$
declare t text;
begin
  foreach t in array array['documents','document_revisions','drawings','rfis','project_actions','decisions',
                           'technical_submittals','material_approvals'] loop
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
drop function if exists public.get_register_audit(text, uuid, int, bigint);
drop function if exists public.get_register_overview(text);
drop function if exists public.get_register_detail(text, uuid);
drop function if exists public.get_register_list(text, text, jsonb, text, text, int, int);
drop view if exists public.vw_reg_items;
drop view if exists public.vw_reg_material_approval, public.vw_reg_submittal, public.vw_reg_decision,
  public.vw_reg_action, public.vw_reg_rfi, public.vw_reg_drawing, public.vw_reg_document;
commit;
*/
