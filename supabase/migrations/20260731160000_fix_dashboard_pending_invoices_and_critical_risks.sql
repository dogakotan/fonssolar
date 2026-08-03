-- Kök neden 1: get_dashboard_summary.pending_invoices hâlâ eski geniş tanımı
-- (status IN ('yönetici_onayında','duzeltme_bekliyor')) kullanıyordu — bu
-- alan TabGenel.jsx'teki "Bekleyen Onaylar" kartının "Fatura" satırını
-- besliyor. Onay Kuyruğu (get_invoice_approval_queue) ve Faturalar listesinin
-- "Onay Bekleyen" sekmesi (get_invoices_list.stats.onayBekleyen) yalnızca
-- 'yönetici_onayında'yı saydığından, Genel Bakış üçüncü bir farklı sayı
-- (10 vs 9) gösteriyordu. Daraltıldı.
--
-- Kök neden 2: TabGenel.jsx'teki "Kritik Risk" KPI satırı project_risks
-- tablosundan değil, critical_tickets'tan (ticket şiddeti) besleniyordu —
-- yanlış etiketlenmişti ("proje" birimiyle birlikte gösteriliyordu ama aslında
-- ticket sayısıydı). Yeni bir critical_risks alanı eklendi (severity='kritik'
-- AND status='açık', project_risks üzerinden, aynı proje kapsamıyla).
create or replace function public.get_dashboard_summary(p_project_id text DEFAULT NULL::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_scope record;
begin
  select * into v_scope from get_project_scope(p_project_id);

  return json_build_object(
    'authorized', v_scope.authorized,
    'open_tickets',
      (select count(*) from tickets
       where status = 'açık' and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'critical_tickets',
      (select count(*) from tickets
       where severity = 'kritik' and status <> 'kapatıldı'
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'critical_risks',
      (select count(*) from project_risks
       where severity = 'kritik' and status = 'açık'
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'total_budget',
      (select coalesce(sum(planned_amount), 0) from budget_lines
       where (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'spent_amount',
      (select coalesce(sum(total_amount_try), 0) from invoices
       where status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi')
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'pending_invoices',
      (select count(*) from invoices
       where status = 'yönetici_onayında'
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'recent_notifications',
      (select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
       from (
         select id, title, severity, status, created_at
         from tickets
         where status <> 'kapatıldı' and (v_scope.scope_all or project_id = any(v_scope.project_ids))
         order by created_at desc
         limit 5
       ) t)
  );
end;
$function$;
