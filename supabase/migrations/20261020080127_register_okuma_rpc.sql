-- ============================================================================
-- Register ekranları (ilk sürüm, yalnızca okuma) — iki okuma fonksiyonu.
-- BEKLEYEN: canlıya uygulanmadı. Uygulanınca supabase/migrations/'a taşınır.
-- Ters SQL: supabase/rollback/20261020090000_register_okuma_rpc.down.sql
-- Prova:    supabase/bekleyen/20261020090000_register_okuma_rpc_prova.sql
--
-- Tasarım:
--   * SECURITY INVOKER: çağıranın yetkisiyle çalışır, tablo RLS'i aynen geçerli. Fonksiyon tablo kuralının
--     izin vermediği satırı ya da kolonu döndüremez (ör. şantiye şefi suppliers'ı okuyamaz → supplier_name null).
--   * Üstüne Karar 6 görüntüleme ("G") matrisi sabit olarak uygulanır. Canlı RLS bugün daha geniş
--     (muhasebe teknik register'ları okuyabiliyor); ekran Karar 6'ya göre daralır.
--     NOT: B1 (register_permissions, register_can) ve B3 (RLS'in kalıcı daraltılması) uygulanınca
--     register_view_allowed() gövdesi register_can(p_register, 'view') ile değiştirilir (iki okuma fonksiyonu
--     matrisi yalnızca oradan okur); o zaman tek kaynak register_permissions olur.
--   * Dinamik SQL yok; register başına sabit sorgu dalı. 'drawing' doküman dalında document_type süzgeci.
--   * Kişi adları dönmez (profiles_select RLS'i engeller); ön yüz get_profile_names() ile çözer.
--   * Risk bu sürümde yok (Satın Alma › Riskler).
-- Kural 10 ön kontrolü: değişkenler v_ önekli; takma adlar t/d/r/s/w/a/k/h/x; kolon adlarıyla çakışmıyor.
-- Yazma yok. Kolon adları 19.10.2026'da canlıdan okundu (wbs_code, area_code, task_code, task_name, suppliers.name).
-- ============================================================================

create or replace function public.register_view_allowed(p_role text, p_register text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- Karar 6, "G" (görüntüleme) kolonu. B1 gelince register_can(p_register, 'view') ile değişir.
  select case
    when p_register in ('document', 'drawing', 'rfi', 'action', 'decision', 'submittal', 'material_approval', 'interface')
      then coalesce(p_role in ('admin', 'proje_yoneticisi', 'santiye_sefi'), false)
    when p_register in ('change', 'claim')
      then coalesce(p_role in ('admin', 'proje_yoneticisi', 'muhasebe'), false)
    else false
  end;
$$;

create or replace function public.get_register_list(p_project_id text, p_register text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if p_project_id is null or not public.has_project_access(p_project_id) then
    return jsonb_build_object('authorized', false);
  end if;
  if not public.register_view_allowed(public.get_my_role(), p_register) then
    return jsonb_build_object('authorized', false);
  end if;

  if p_register = 'rfi' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.rfi_no, 'title', t.subject, 'status', t.status, 'priority', t.priority,
             'raised_date', t.raised_date, 'due_date', t.due_date, 'answered_date', t.answered_date,
             'discipline', t.responsible_discipline, 'raised_by', t.raised_by, 'assigned_to', t.assigned_to,
             'question', t.question, 'description', t.description, 'response', t.response,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.rfi_no desc), '[]'::jsonb)
      into v_rows
      from public.rfis t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register in ('document', 'drawing') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'no', d.document_no, 'title', d.title, 'status', d.status,
             'document_type', d.document_type, 'discipline', d.discipline, 'drawing_type', s.drawing_type,
             'revision_no', r.revision_no, 'revision_status', r.revision_status, 'issue_date', r.issue_date,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', d.created_by, 'created_at', d.created_at, 'updated_at', d.updated_at)
           order by d.document_no desc), '[]'::jsonb)
      into v_rows
      from public.documents d
      left join public.drawings s on s.document_id = d.id
      left join public.document_revisions r on r.document_id = d.id and r.is_current
      left join public.project_wbs w on w.id = d.wbs_id
      left join public.project_areas a on a.id = d.area_id
      left join public.project_tasks k on k.id = d.task_id
     where d.project_id = p_project_id
       and (p_register = 'document' or d.document_type = 'drawing');

  elsif p_register = 'decision' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.decision_no, 'title', t.title, 'status', t.status,
             'decision_date', t.decision_date, 'decision_maker', t.decision_maker, 'decision_text', t.decision_text,
             'rfi_id', t.rfi_id, 'risk_id', t.risk_id,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.decision_no desc), '[]'::jsonb)
      into v_rows
      from public.decisions t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'action' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.action_no, 'title', t.title, 'status', t.status, 'priority', t.priority,
             'responsible', t.responsible, 'assigned_to', t.assigned_to, 'due_date', t.due_date,
             'completed_at', t.completed_at, 'source_type', t.source_type, 'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.action_no desc), '[]'::jsonb)
      into v_rows
      from public.project_actions t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'submittal' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.submittal_no, 'title', t.title, 'status', t.status, 'revision', t.revision,
             'discipline', t.discipline, 'supplier_name', s.name, 'reviewer_id', t.reviewer_id,
             'submitted_date', t.submitted_date, 'due_date', t.due_date, 'reviewed_date', t.reviewed_date,
             'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.submittal_no desc), '[]'::jsonb)
      into v_rows
      from public.technical_submittals t
      left join public.suppliers s on s.id = t.supplier_id
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'material_approval' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.approval_no, 'title', t.material_name, 'status', t.status, 'revision', t.revision,
             'manufacturer', t.manufacturer, 'model', t.model, 'supplier_name', s.name,
             'submitted_date', t.submitted_date, 'approved_date', t.approved_date,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.approval_no desc), '[]'::jsonb)
      into v_rows
      from public.material_approvals t
      left join public.suppliers s on s.id = t.supplier_id
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'change' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.change_no, 'title', t.title, 'status', t.status, 'priority', t.priority,
             'record_state', t.record_state, 'origin', t.origin,
             'cost_estimate', t.cost_estimate, 'currency', t.currency, 'time_impact_days', t.time_impact_days,
             'contract_ref', t.contract_ref, 'assigned_to', t.assigned_to, 'due_date', t.due_date,
             'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.change_no desc), '[]'::jsonb)
      into v_rows
      from public.changes t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'claim' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.claim_no, 'title', t.title, 'status', t.status, 'record_state', t.record_state,
             'notice_type', t.notice_type, 'event_date', t.event_date, 'notice_deadline', t.notice_deadline,
             'notice_sent_at', t.notice_sent_at, 'amount_claimed', t.amount_claimed, 'currency', t.currency,
             'time_claimed_days', t.time_claimed_days, 'contract_ref', t.contract_ref, 'change_id', t.change_id,
             'assigned_to', t.assigned_to, 'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.claim_no desc), '[]'::jsonb)
      into v_rows
      from public.claims t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'interface' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.interface_no, 'title', t.title, 'status', t.status, 'priority', t.priority,
             'record_state', t.record_state, 'interface_type', t.interface_type,
             'party_a', t.party_a, 'party_b', t.party_b, 'assigned_to', t.assigned_to, 'due_date', t.due_date,
             'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.interface_no desc), '[]'::jsonb)
      into v_rows
      from public.interfaces t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;
  end if;

  return jsonb_build_object(
    'authorized', true,
    'register', p_register,
    'prefix', (select x.prefix from public.project_register_settings x where x.project_id = p_project_id),
    'rows', coalesce(v_rows, '[]'::jsonb));
end $$;

-- Yan panel: durum geçmişi. register_status_history'nin SELECT kuralı yalnızca proje erişimi (şef change/claim
-- geçmişini doğrudan okuyabiliyor); bu fonksiyon önce kaydın kendisini ana tablodan aynı oturumla okur, okuyamazsa
-- ya da matris izin vermezse geçmiş dönmez. Durum geçmişi tetikleyicisi yalnızca rfi, decision, action, change,
-- claim, interface'te var; document, submittal, material_approval için 'tracked': false döner.
create or replace function public.get_register_status_history(p_register text, p_record_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_proje   text;
  v_liste   jsonb;
begin
  if not public.register_view_allowed(public.get_my_role(), p_register) then
    return jsonb_build_object('authorized', false);
  end if;
  if p_register not in ('rfi', 'decision', 'action', 'change', 'claim', 'interface') then
    return jsonb_build_object('authorized', true, 'tracked', false, 'history', '[]'::jsonb);
  end if;

  v_proje := case p_register
    when 'rfi'       then (select t.project_id from public.rfis t where t.id = p_record_id)
    when 'decision'  then (select t.project_id from public.decisions t where t.id = p_record_id)
    when 'action'    then (select t.project_id from public.project_actions t where t.id = p_record_id)
    when 'change'    then (select t.project_id from public.changes t where t.id = p_record_id)
    when 'claim'     then (select t.project_id from public.claims t where t.id = p_record_id)
    when 'interface' then (select t.project_id from public.interfaces t where t.id = p_record_id)
  end;
  if v_proje is null or not public.has_project_access(v_proje) then
    return jsonb_build_object('authorized', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'old_status', h.old_status, 'new_status', h.new_status,
           'changed_by', h.changed_by, 'changed_at', h.changed_at)
           order by h.changed_at, (h.old_status is not null), h.id), '[]'::jsonb)  -- aynı anda yazılan açılış satırı önce
    into v_liste
    from public.register_status_history h
   where h.record_id = p_record_id and h.register_code = p_register;

  return jsonb_build_object('authorized', true, 'tracked', true, 'history', v_liste);
end $$;

revoke all on function public.register_view_allowed(text, text) from public, anon;
revoke all on function public.get_register_list(text, text) from public, anon;
revoke all on function public.get_register_status_history(text, uuid) from public, anon;
grant execute on function public.register_view_allowed(text, text) to authenticated;
grant execute on function public.get_register_list(text, text) to authenticated;
grant execute on function public.get_register_status_history(text, uuid) to authenticated;
