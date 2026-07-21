insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'fatura-belgeleri',
  'fatura-belgeleri',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "invoice_documents_accounting_upload" on storage.objects;
create policy "invoice_documents_accounting_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fatura-belgeleri'
  and public.get_my_role() = 'muhasebe'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "invoice_documents_authorized_read" on storage.objects;
create policy "invoice_documents_authorized_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fatura-belgeleri'
  and public.get_my_role() in ('admin', 'muhasebe')
);

drop policy if exists "invoice_documents_owner_delete" on storage.objects;
create policy "invoice_documents_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fatura-belgeleri'
  and public.get_my_role() = 'muhasebe'
  and owner_id = auth.uid()::text
);

create or replace function public.fn_guard_invoice_requires_procurement_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_project_id text;
begin
  if new.purchase_request_id is not null then
    select status, project_id
      into v_status, v_project_id
    from public.purchase_requests
    where id = new.purchase_request_id
    for update;

    if not found then
      raise exception 'Satın alma talebi bulunamadı.';
    end if;

    if v_status <> 'satin_alindi' then
      raise exception
        'Bu talep fatura eklemeye uygun değil (mevcut durum: %).',
        v_status;
    end if;

    if new.project_id is distinct from v_project_id then
      raise exception
        'Fatura projesi satın alma talebinin projesiyle aynı olmalıdır.';
    end if;

    if nullif(trim(new.invoice_document_url), '') is null then
      raise exception 'Satın alma faturası belgesi zorunludur.';
    end if;

    if not exists (
      select 1
      from storage.objects
      where bucket_id = 'fatura-belgeleri'
        and name = new.invoice_document_url
    ) then
      raise exception 'Yüklenen fatura belgesi bulunamadı.';
    end if;
  end if;

  return new;
end;
$$;

