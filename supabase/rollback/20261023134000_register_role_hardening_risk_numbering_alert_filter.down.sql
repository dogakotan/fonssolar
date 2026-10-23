-- Geri alma: 20261023134000 register_role_hardening_risk_numbering_alert_filter
-- Hedef: bu migration'ın canlıya aldığı her şeyi, öncesindeki haline döndürmek.
--
-- NOT 1: get_register_list ve get_register_status_history bu migration'da "risk" dalı kazandı.
--        Aşağıda register_view_allowed risk için tekrar false döndürdüğü için o dallara
--        ulaşılamaz; bu iki fonksiyon eski haline döndürülmedi (üst küme, zararsız).
-- NOT 2: risk_no kolonu silinir; geri yüklenirse numaralar created_at sırasıyla yeniden üretilir.
-- NOT 3: Çalıştırmadan önce project_risks, project_register_counters ve
--        register_status_history tablolarını C:\fons-yedek\ altına dışa aktar.

begin;
set local lock_timeout = '3s';

-- 6) Okuma politikaları: yalnızca proje erişimi (migration öncesi hali)
drop policy if exists rfis_select on public.rfis;
create policy rfis_select on public.rfis for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists decisions_select on public.decisions;
create policy decisions_select on public.decisions for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists project_actions_select on public.project_actions;
create policy project_actions_select on public.project_actions for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists document_revisions_select on public.document_revisions;
create policy document_revisions_select on public.document_revisions for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists technical_submittals_select on public.technical_submittals;
create policy technical_submittals_select on public.technical_submittals for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists material_approvals_select on public.material_approvals;
create policy material_approvals_select on public.material_approvals for select to authenticated
  using (user_has_project_access(project_id));

drop policy if exists register_status_history_select on public.register_status_history;
create policy register_status_history_select on public.register_status_history for select to authenticated
  using (user_has_project_access(project_id));

-- 5) Uyarı görünümü: rol filtresiz hali. risk_no'ya bağımlı olduğu için kolondan ÖNCE geri alınmalı.
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

-- 2/3) Risk durum geçmişi, numaralama tetikleyicileri, indeks, kolon, sayaç
drop trigger if exists trg_project_risks_status_history on public.project_risks;
drop trigger if exists trg_project_risks_assign_no on public.project_risks;
drop trigger if exists trg_project_risks_assign_no_auto on public.project_risks;
drop function if exists public.fn_risk_assign_no_after();
drop index if exists public.project_risks_project_risk_no_key;
alter table public.project_risks drop column if exists risk_no;
delete from public.project_register_counters where register_code = 'RSK';
delete from public.register_status_history where register_code = 'risk';

-- 1) register_view_allowed: risk dalı olmadan (migration öncesi hali)
create or replace function public.register_view_allowed(p_role text, p_register text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_register in ('document','drawing','rfi','action','decision','submittal','material_approval','interface')
      then coalesce(p_role in ('admin','proje_yoneticisi','santiye_sefi'), false)
    when p_register in ('change','claim')
      then coalesce(p_role in ('admin','proje_yoneticisi','muhasebe'), false)
    else false
  end;
$$;

commit;
