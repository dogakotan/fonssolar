-- get_dashboard_summary'nin open_tickets sayacı yalnızca status='açık' sayıyordu.
-- ticketStatus.js'teki kanonik STATUS_META (liste/filtre/Bildirimler'in kaynağı)
-- 'gönderildi' ve 'açık'ı aynı "Açık" etiketi altında birleştiriyor — dashboard
-- bu ikinci ham değeri hiç saymadığından "Bekleyen Onaylar" kartındaki Ticket
-- sayacı gerçek "Açık" toplamından (açık+gönderildi) düşük çıkıyordu.

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_project_id text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_scope record;
begin
  select * into v_scope from get_project_scope(p_project_id);

  return json_build_object(
    'authorized', v_scope.authorized,
    'open_tickets',
      (select count(*) from tickets
       where status in ('açık','gönderildi') and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
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
