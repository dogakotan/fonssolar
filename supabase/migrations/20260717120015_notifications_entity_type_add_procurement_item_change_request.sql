ALTER TABLE public.notifications DROP CONSTRAINT notifications_entity_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type = ANY (ARRAY['purchase_request','invoice','ticket','daily_report','daily_report_reminder','procurement_item_change_request']));

