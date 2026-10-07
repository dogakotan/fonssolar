-- G-02/G-03: sahte metadata satırıyla başka projenin saha fotoğrafını / ticket ekini okuma açığını kapatır.
-- Kanıt ve ROLLBACK'li deneme: docs/proje-kontrol/guvenlik-bulgulari.md. Geri alma: docs/proje-kontrol/yedek-policy-07-10.sql.

-- ── G-02 · saha fotoğrafları ──
drop policy if exists drp_insert on public.daily_report_photos;
create policy drp_insert on public.daily_report_photos
  for insert to authenticated
  with check (
    daily_report_photos.uploaded_by = (select auth.uid())
    and daily_report_photos.project_id is not null
    and public.has_project_access(daily_report_photos.project_id)
    and split_part(daily_report_photos.storage_path, '/', 1) = daily_report_photos.project_id
    and (
      daily_report_photos.report_id is null
      or exists (
        select 1 from public.daily_reports dr
        where dr.id = daily_report_photos.report_id
          and dr.project_id = daily_report_photos.project_id
      )
    )
  );

drop policy if exists storage_select on storage.objects;
create policy storage_select on storage.objects
  for select to authenticated
  using (
    objects.bucket_id = 'saha-fotolari'
    and exists (
      select 1 from public.daily_report_photos photo
      where photo.storage_path = objects.name
        and photo.project_id = (storage.foldername(objects.name))[1]
        and public.has_project_access(photo.project_id)
    )
  );

-- ── G-03 · ticket ekleri ──
drop policy if exists ta_insert on public.ticket_attachments;
create policy ta_insert on public.ticket_attachments
  for insert to authenticated
  with check (
    ticket_attachments.uploaded_by = (select auth.uid())
    and split_part(ticket_attachments.storage_path, '/', 1) = ticket_attachments.ticket_id::text
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_attachments.ticket_id
    )
  );

drop policy if exists storage_select_ticket on storage.objects;
create policy storage_select_ticket on storage.objects
  for select to authenticated
  using (
    objects.bucket_id = 'ticket-ekleri'
    and exists (
      select 1
      from public.ticket_attachments attachment
      join public.tickets ticket on ticket.id = attachment.ticket_id
      where attachment.storage_path = objects.name
        and attachment.ticket_id::text = (storage.foldername(objects.name))[1]
        and (
          public.has_project_access(ticket.project_id)
          or ticket.created_by = (select auth.uid())
          or ticket.assigned_to = (select auth.uid())
        )
    )
  );

-- ── Ek savunma: iki tabloda UPDATE policy'si yok; GRANT da geri çekilir ──
revoke update, truncate on public.daily_report_photos, public.ticket_attachments from authenticated;
