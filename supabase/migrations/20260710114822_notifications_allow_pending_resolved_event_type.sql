alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check
  check (event_type = any (array['created'::text, 'status_changed'::text, 'approved'::text, 'rejected'::text, 'commented'::text, 'pending'::text, 'resolved'::text]));

