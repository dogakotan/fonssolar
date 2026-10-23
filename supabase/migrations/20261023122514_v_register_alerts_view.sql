create or replace view public.v_register_alerts
with (security_invoker = true) as
select r.project_id, 'rfi_overdue'::text as alert_type, 'rfi'::text as register_code, r.id as record_id,
       r.rfi_no as record_no, r.subject as title, r.due_date,
       (current_date - r.due_date) as days_overdue, r.priority as severity
from public.rfis r
where r.status in ('open','under_review') and r.due_date is not null and r.due_date < current_date
union all
select d.project_id, 'decision_overdue', 'decision', d.id, d.decision_no, d.title, d.decision_due_date,
       (current_date - d.decision_due_date), 'high'
from public.decisions d
where d.status = 'proposed' and d.decision_due_date is not null and d.decision_due_date < current_date
union all
select a.project_id, 'action_overdue', 'action', a.id, a.action_no, a.title, a.due_date,
       (current_date - a.due_date), a.priority
from public.project_actions a
where a.status in ('open','in_progress') and a.due_date is not null and a.due_date < current_date
union all
select c.project_id, 'claim_notice_due', 'claim', c.id, c.claim_no, c.title, c.notice_deadline,
       (current_date - c.notice_deadline), 'critical'
from public.claims c
where c.status = 'notice_due' and c.notice_deadline is not null and c.notice_deadline <= current_date + 7
union all
select p.project_id, 'critical_material_due', 'procurement', p.id, p.request_no, p.title, p.required_on_site_date,
       (current_date - p.required_on_site_date), 'critical'
from public.purchase_requests p
where p.is_critical and p.delivery_date is null and p.status <> 'reddedildi'
  and p.required_on_site_date is not null and p.required_on_site_date <= current_date + 30
union all
select k.project_id, 'risk_mitigation_overdue', 'risk', k.id, null, k.title, k.mitigation_due_date,
       (current_date - k.mitigation_due_date),
       case k.severity when 'kritik' then 'critical' when 'yüksek' then 'high' when 'orta' then 'medium' else 'low' end
from public.project_risks k
where k.status = 'açık' and k.mitigation_due_date is not null and k.mitigation_due_date < current_date;

revoke all on public.v_register_alerts from anon;
grant select on public.v_register_alerts to authenticated;