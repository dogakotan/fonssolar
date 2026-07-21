
alter table public.tickets alter column project_id drop not null;

alter table public.tickets
  add constraint chk_ticket_project
  check (category = 'genel' or project_id is not null);

