-- ============================================================================
-- G-02 + G-03 · Sahte metadata satırıyla başka projenin dosyasını okuma açığı — TASLAK, UYGULANMADI
-- Kanıt: tests/proje-kontrol-guvenlik.spec.js son iki test (İzmir şantiye şefi Kayseri fotoğrafını
-- ve ticket ekini indirebildi). Ayrıntı: docs/proje-kontrol/guvenlik-bulgulari.md.
--
-- Ön kontrol (07.10.2026, canlı):
--   daily_report_photos: 5 satır, 5'inde split_part(storage_path,'/',1) = project_id, uploaded_by boş yok,
--                        report_id'si başka projeyi gösteren satır yok → yeni kurala hepsi uyuyor.
--   ticket_attachments:  0 satır.
--   Yazan kod: DailyReportForm.jsx:768 (yol `${projectId}/${tarih}/…`, uploaded_by = user.id)
--              YeniTicketModal.jsx:112 (yol `${ticketId}/…`, uploaded_by = user.id) → ikisi de uyuyor.
-- Değişmeyenler: storage INSERT/DELETE policy'leri, bucket'lar, okuma (SELECT) policy'leri
--   daily_report_photos/ticket_attachments tablolarında, dosyaların kendisi.
-- Uygulama sırası: npm run db:backup → tek transaction → tests/proje-kontrol-guvenlik.spec.js (8/8 beklenir).
-- ============================================================================

begin;

-- ── G-02 · saha fotoğrafları ────────────────────────────────────────────────

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

-- ── G-03 · ticket ekleri ────────────────────────────────────────────────────

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

-- ── Ek savunma (07.10.2026 v2) ───────────────────────────────────────────────
-- İki tabloda UPDATE policy'si YOK → RLS bugün de her UPDATE'i reddediyor (kayıt ekleyip sonra
-- storage_path'i başka projenin dosyasına çevirme yolu kapalı). Yine de GRANT duruyor; ileride biri
-- "permissive" bir UPDATE policy'si eklerse yol açılmasın diye yetkiyi de geri çekiyoruz.
-- src/'de bu iki tabloyu UPDATE eden kod yok (07.10.2026 grep). TRUNCATE RLS'i atlar; PostgREST'ten
-- erişilemez ama gereksiz.
revoke update, truncate on public.daily_report_photos, public.ticket_attachments from authenticated;

commit;


-- ── GERİ AL (bugünkü canlı policy'leri birebir geri yükler; 07.10.2026 pg_policies'ten) ──
-- Not: canlıda drp_insert ve ta_insert `to public` tanımlı (authenticated değil) — v1 taslağındaki
-- geri alma bunu yanlış yazıyordu, v2'de düzeltildi.
-- begin;
-- grant update, truncate on public.daily_report_photos, public.ticket_attachments to authenticated;
-- drop policy if exists drp_insert on public.daily_report_photos;
-- create policy drp_insert on public.daily_report_photos
--   for insert to public with check ((select auth.uid()) is not null);
-- drop policy if exists storage_select on storage.objects;
-- create policy storage_select on storage.objects
--   for select to authenticated
--   using (bucket_id = 'saha-fotolari' and exists (
--     select 1 from public.daily_report_photos photo
--     where photo.storage_path = objects.name and public.has_project_access(photo.project_id)));
-- drop policy if exists ta_insert on public.ticket_attachments;
-- create policy ta_insert on public.ticket_attachments
--   for insert to public with check ((select auth.uid()) is not null);
-- drop policy if exists storage_select_ticket on storage.objects;
-- create policy storage_select_ticket on storage.objects
--   for select to authenticated
--   using (bucket_id = 'ticket-ekleri' and exists (
--     select 1 from public.ticket_attachments attachment
--     join public.tickets ticket on ticket.id = attachment.ticket_id
--     where attachment.storage_path = objects.name
--       and (public.has_project_access(ticket.project_id)
--            or ticket.created_by = (select auth.uid())
--            or ticket.assigned_to = (select auth.uid()))));
-- commit;
