
create or replace function get_dashboard_summary()
returns json
language sql
security definer
as $$
  select json_build_object(
    'open_tickets',
      (select count(*) from tickets where status = 'açık'),
    'critical_tickets',
      (select count(*) from tickets
       where severity IN ('kritik', 'yüksek') and status <> 'kapatıldı'),
    'total_budget',
      (select coalesce(sum(planned_amount), 0) from budget_lines),
    'spent_amount',
      (select coalesce(sum(amount), 0) from invoices
       where status in ('ödendi', 'yönetici_onayında', 'muhasebe_onayında')),
    'pending_invoices',
      (select count(*) from invoices
       where status in ('yönetici_onayında', 'muhasebe_onayında')),
    'recent_notifications',
      (select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
       from (
         select id, title, severity, status, created_at
         from tickets
         where status <> 'kapatıldı'
         order by created_at desc
         limit 5
       ) t)
  );
$$;

