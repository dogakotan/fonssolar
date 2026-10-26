-- ===== 1) register_view_allowed: add risk (admin, proje_yoneticisi, santiye_sefi) =====
create or replace function public.register_view_allowed(p_role text, p_register text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_register in ('document','drawing','rfi','action','decision','submittal','material_approval','interface','risk')
      then coalesce(p_role in ('admin','proje_yoneticisi','santiye_sefi'), false)
    when p_register in ('change','claim')
      then coalesce(p_role in ('admin','proje_yoneticisi','muhasebe'), false)
    else false
  end;
$$;

-- ===== 2) Risk numbering (RSK) =====
alter table public.project_risks add column if not exists risk_no text;

-- manual / ai / import risks: number before insert
drop trigger if exists trg_project_risks_assign_no on public.project_risks;
create trigger trg_project_risks_assign_no
  before insert on public.project_risks
  for each row when (new.source is distinct from 'otomatik')
  execute function public.fn_assign_register_no('risk_no', 'RSK');

-- automatic risks are upserted (ON CONFLICT DO UPDATE): number only rows that were really inserted
create or replace function public.fn_risk_assign_no_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.project_risks
     set risk_no = public.next_register_no(new.project_id, 'RSK')
   where id = new.id and risk_no is null;
  return null;
end $$;
revoke all on function public.fn_risk_assign_no_after() from public, anon, authenticated;

drop trigger if exists trg_project_risks_assign_no_auto on public.project_risks;
create trigger trg_project_risks_assign_no_auto
  after insert on public.project_risks
  for each row when (new.source = 'otomatik')
  execute function public.fn_risk_assign_no_after();

-- backfill existing risks in creation order, per project
do $$
declare r record;
begin
  for r in select id, project_id from public.project_risks where risk_no is null order by project_id, created_at, id loop
    update public.project_risks set risk_no = public.next_register_no(r.project_id, 'RSK') where id = r.id;
  end loop;
end $$;

create unique index if not exists project_risks_project_risk_no_key
  on public.project_risks (project_id, risk_no) where risk_no is not null;

-- status history for risks
drop trigger if exists trg_project_risks_status_history on public.project_risks;
create trigger trg_project_risks_status_history
  after insert or update of status on public.project_risks
  for each row execute function public.fn_log_register_status('risk');

-- ===== 3) get_register_status_history: add risk =====
create or replace function public.get_register_status_history(p_register text, p_record_id uuid)
returns jsonb language plpgsql stable set search_path to 'public' as $function$
declare
  v_proje   text;
  v_liste   jsonb;
begin
  if not public.register_view_allowed(public.get_my_role(), p_register) then
    return jsonb_build_object('authorized', false);
  end if;
  if p_register not in ('rfi','decision','action','change','claim','interface','submittal','material_approval','document','risk') then
    return jsonb_build_object('authorized', true, 'tracked', false, 'history', '[]'::jsonb);
  end if;

  v_proje := case p_register
    when 'rfi'               then (select t.project_id from public.rfis t where t.id = p_record_id)
    when 'decision'          then (select t.project_id from public.decisions t where t.id = p_record_id)
    when 'action'            then (select t.project_id from public.project_actions t where t.id = p_record_id)
    when 'change'            then (select t.project_id from public.changes t where t.id = p_record_id)
    when 'claim'             then (select t.project_id from public.claims t where t.id = p_record_id)
    when 'interface'         then (select t.project_id from public.interfaces t where t.id = p_record_id)
    when 'submittal'         then (select t.project_id from public.technical_submittals t where t.id = p_record_id)
    when 'material_approval' then (select t.project_id from public.material_approvals t where t.id = p_record_id)
    when 'document'          then (select t.project_id from public.documents t where t.id = p_record_id)
    when 'risk'              then (select t.project_id from public.project_risks t where t.id = p_record_id)
  end;
  if v_proje is null or not public.has_project_access(v_proje) then
    return jsonb_build_object('authorized', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'old_status', h.old_status, 'new_status', h.new_status,
           'changed_by', h.changed_by, 'changed_at', h.changed_at)
           order by h.changed_at, (h.old_status is not null), h.id), '[]'::jsonb)
    into v_liste
    from public.register_status_history h
   where h.record_id = p_record_id and h.register_code = p_register;

  return jsonb_build_object('authorized', true, 'tracked', true, 'history', v_liste);
end $function$;

-- ===== 4) get_register_list: add risk branch (same output shape) =====
create or replace function public.get_register_list(p_project_id text, p_register text)
returns jsonb language plpgsql stable set search_path to 'public' as $function$
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

  elsif p_register = 'risk' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.risk_no, 'title', t.title, 'status', t.status,
             'priority', t.severity, 'severity', t.severity, 'category', t.category,
             'probability', t.probability, 'impact', t.impact, 'risk_score', t.risk_score,
             'mitigation', t.mitigation, 'mitigation_due_date', t.mitigation_due_date,
             'risk_owner', t.risk_owner, 'cost_impact', t.cost_impact, 'cost_currency', t.cost_currency,
             'time_impact_days', t.time_impact_days, 'source', t.source, 'description', t.description,
             'due_date', t.mitigation_due_date,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.risk_score desc nulls last, t.created_at desc), '[]'::jsonb)
      into v_rows
      from public.project_risks t
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
end $function$;

-- ===== 5) v_register_alerts: role filter per register =====
create or replace view public.v_register_alerts
with (security_invoker = true) as
select r.project_id, 'rfi_overdue'::text as alert_type, 'rfi'::text as register_code, r.id as record_id,
       r.rfi_no as record_no, r.subject as title, r.due_date,
       (current_date - r.due_date) as days_overdue, r.priority as severity
from public.rfis r
where public.register_view_allowed(public.get_my_role(), 'rfi')
  and r.status in ('open','under_review') and r.due_date is not null and r.due_date < current_date
union all
select d.project_id, 'decision_overdue', 'decision', d.id, d.decision_no, d.title, d.decision_due_date,
       (current_date - d.decision_due_date), 'high'
from public.decisions d
where public.register_view_allowed(public.get_my_role(), 'decision')
  and d.status = 'proposed' and d.decision_due_date is not null and d.decision_due_date < current_date
union all
select a.project_id, 'action_overdue', 'action', a.id, a.action_no, a.title, a.due_date,
       (current_date - a.due_date), a.priority
from public.project_actions a
where public.register_view_allowed(public.get_my_role(), 'action')
  and a.status in ('open','in_progress') and a.due_date is not null and a.due_date < current_date
union all
select c.project_id, 'claim_notice_due', 'claim', c.id, c.claim_no, c.title, c.notice_deadline,
       (current_date - c.notice_deadline), 'critical'
from public.claims c
where public.register_view_allowed(public.get_my_role(), 'claim')
  and c.status = 'notice_due' and c.notice_deadline is not null and c.notice_deadline <= current_date + 7
union all
select p.project_id, 'critical_material_due', 'procurement', p.id, p.request_no, p.title, p.required_on_site_date,
       (current_date - p.required_on_site_date), 'critical'
from public.purchase_requests p
where p.is_critical and p.delivery_date is null and p.status <> 'reddedildi'
  and p.required_on_site_date is not null and p.required_on_site_date <= current_date + 30
union all
select k.project_id, 'risk_mitigation_overdue', 'risk', k.id, k.risk_no, k.title, k.mitigation_due_date,
       (current_date - k.mitigation_due_date),
       case k.severity when 'kritik' then 'critical' when 'yüksek' then 'high' when 'orta' then 'medium' else 'low' end
from public.project_risks k
where public.register_view_allowed(public.get_my_role(), 'risk')
  and k.status = 'açık' and k.mitigation_due_date is not null and k.mitigation_due_date < current_date;

revoke all on public.v_register_alerts from anon;
grant select on public.v_register_alerts to authenticated;

-- ===== 6) Read policies: role-aware (project_risks intentionally left as is: existing screens read it) =====
drop policy if exists rfis_select on public.rfis;
create policy rfis_select on public.rfis for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'rfi'));

drop policy if exists decisions_select on public.decisions;
create policy decisions_select on public.decisions for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'decision'));

drop policy if exists project_actions_select on public.project_actions;
create policy project_actions_select on public.project_actions for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'action'));

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'document'));

drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'drawing'));

drop policy if exists document_revisions_select on public.document_revisions;
create policy document_revisions_select on public.document_revisions for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'document'));

drop policy if exists technical_submittals_select on public.technical_submittals;
create policy technical_submittals_select on public.technical_submittals for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'submittal'));

drop policy if exists material_approvals_select on public.material_approvals;
create policy material_approvals_select on public.material_approvals for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), 'material_approval'));

drop policy if exists register_status_history_select on public.register_status_history;
create policy register_status_history_select on public.register_status_history for select to authenticated
  using (user_has_project_access(project_id) and register_view_allowed((select get_my_role()), register_code));