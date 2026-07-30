-- Data API, privileged function, private storage and FK index hardening.

-- The application requires an authenticated session. Keep the browser key usable
-- for Auth, but do not expose business relations to the anon database role.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Trigger/internal functions are not public RPC endpoints.
revoke execute on function public.fn_invoice_approval_submitted() from public, anon, authenticated;
revoke execute on function public.fn_invoice_payment_before_insert() from public, anon, authenticated;
revoke execute on function public.fn_invoice_payment_recalc() from public, anon, authenticated;
revoke execute on function public.fn_recompute_auto_risks(text, boolean) from public, anon, authenticated;

alter function public.fn_invoice_payment_before_insert() set search_path = public, pg_temp;
alter function public.fn_invoice_payment_recalc() set search_path = public, pg_temp;

-- Media contains project and ticket information: serve only through authenticated,
-- short-lived signed URLs after Storage RLS has authorized the object.
update storage.buckets
set public = false
where id in ('saha-fotolari', 'ticket-ekleri');

drop policy if exists storage_select on storage.objects;
create policy storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'saha-fotolari'
  and exists (
    select 1
    from public.daily_report_photos photo
    where photo.storage_path = storage.objects.name
      and public.has_project_access(photo.project_id)
  )
);

drop policy if exists storage_select_ticket on storage.objects;
create policy storage_select_ticket
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ticket-ekleri'
  and exists (
    select 1
    from public.ticket_attachments attachment
    join public.tickets ticket on ticket.id = attachment.ticket_id
    where attachment.storage_path = storage.objects.name
      and (
        public.has_project_access(ticket.project_id)
        or ticket.created_by = (select auth.uid())
        or ticket.assigned_to = (select auth.uid())
      )
  )
);

-- Equivalent DELETE authorization in one policy avoids evaluating two permissive
-- policies for every row.
drop policy if exists purchase_requests_delete on public.purchase_requests;
drop policy if exists purchase_requests_owner_delete_unapproved on public.purchase_requests;
create policy purchase_requests_delete
on public.purchase_requests
for delete
to authenticated
using (
  public.get_my_role() = any (array['admin'::text, 'proje_yoneticisi'::text])
  or (
    requested_by = (select auth.uid())
    and lower(replace(coalesce(status, ''), ' ', '_')) = any (
      array[
        ''::text, 'bekliyor'::text, 'beklemede'::text,
        'talep_olusturuldu'::text, 'talep_oluşturuldu'::text,
        'fiyat_girildi'::text, 'onay_bekliyor'::text
      ]
    )
  )
);

-- Add a covering btree index for every public FK that still lacks one.
do $$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      con.conrelid,
      rel.relname as table_name,
      con.conname,
      con.conkey,
      string_agg(quote_ident(att.attname), ', ' order by key_col.ordinality) as columns_sql
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    cross join lateral unnest(con.conkey) with ordinality as key_col(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = key_col.attnum
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and not exists (
        select 1
        from pg_index idx
        where idx.indrelid = con.conrelid
          and idx.indisvalid
          and (idx.indkey::smallint[])[0:cardinality(con.conkey)-1] = con.conkey
      )
    group by con.conrelid, rel.relname, con.conname, con.conkey
  loop
    index_name := left('idx_fk_' || fk.table_name || '_' || md5(fk.conname), 63);
    execute format(
      'create index if not exists %I on public.%I (%s)',
      index_name,
      fk.table_name,
      fk.columns_sql
    );
  end loop;
end
$$;
