
create or replace function public.get_dashboard_summary(p_project_id text default null::text)
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
       where severity in ('kritik','yüksek') and status <> 'kapatıldı'
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'total_budget',
      (select coalesce(sum(planned_amount), 0) from budget_lines
       where (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'spent_amount',
      (select coalesce(sum(total_amount), 0) from invoices
       where status in ('onaylandı','ödendi')
         and (v_scope.scope_all or project_id = any(v_scope.project_ids))),
    'pending_invoices',
      (select count(*) from invoices
       where status in ('yönetici_onayında','muhasebe_onayında')
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

