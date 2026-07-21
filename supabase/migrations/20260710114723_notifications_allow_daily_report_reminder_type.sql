alter table public.notifications drop constraint notifications_entity_type_check;
alter table public.notifications add constraint notifications_entity_type_check
  check (entity_type = any (array['purchase_request'::text, 'invoice'::text, 'ticket'::text, 'daily_report'::text, 'daily_report_reminder'::text]));

