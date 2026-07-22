alter table public.notifications
  drop constraint if exists notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check
  check (event_type = any (array[
    'created',
    'status_changed',
    'approved',
    'rejected',
    'commented',
    'pending',
    'resolved',
    'processed_by_project_manager',
    'closed_by_project_manager'
  ]));
