
create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.ticket_attachments enable row level security;

create policy ta_select on public.ticket_attachments for select using (true);
create policy ta_insert on public.ticket_attachments for insert with check (auth.uid() is not null);
create policy ta_delete on public.ticket_attachments for delete using (uploaded_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('ticket-ekleri', 'ticket-ekleri', true)
on conflict (id) do nothing;

create policy storage_select_ticket on storage.objects for select using (bucket_id = 'ticket-ekleri');
create policy storage_insert_ticket on storage.objects for insert with check (bucket_id = 'ticket-ekleri' and auth.uid() is not null);
create policy storage_delete_ticket on storage.objects for delete using (bucket_id = 'ticket-ekleri' and auth.uid() is not null);

