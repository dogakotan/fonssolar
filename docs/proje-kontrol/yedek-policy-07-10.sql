-- ============================================================================
-- G-01 + G-02/G-03 ÖNCESİ ANLIK GÖRÜNTÜ — geri yükleme betiği
-- Alındığı an: 07.10.2026, canlı pg_policies + information_schema.role_table_grants (salt okunur SELECT).
-- Kapsam: bu iki değişikliğin dokunduğu nesnelerin TAMAMI —
--   * public.daily_report_photos ve public.ticket_attachments üzerindeki bütün policy'ler (6)
--   * storage.objects üzerindeki storage_select ve storage_select_ticket policy'leri (2)
--   * 10 tabloda authenticated yetkileri (G-01'in 8 tablosu + daily_report_photos + ticket_attachments)
--   * public.rfis tablo yorumu (G-01 yorum ekliyor; değişiklik öncesi NULL)
-- Tam şema dökümü (npm run db:backup) DEĞİLDİR; yalnızca bu değişikliklerin geri alınması içindir.
-- Faz B'de veri değiştiren migration'lardan önce db:backup çalışır hale getirilmeli.
-- Çalıştırma: tek transaction; tamamı birlikte çalıştırılır.
-- ============================================================================

begin;

-- ── Policy'ler (pg_policies'ten birebir; roller, permissive, cmd, using, with check) ──

drop policy if exists drp_delete on public.daily_report_photos;
create policy drp_delete on public.daily_report_photos as PERMISSIVE for DELETE to public
  using ((uploaded_by = ( SELECT auth.uid() AS uid)));

drop policy if exists drp_insert on public.daily_report_photos;
create policy drp_insert on public.daily_report_photos as PERMISSIVE for INSERT to public
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

drop policy if exists drp_select on public.daily_report_photos;
create policy drp_select on public.daily_report_photos as PERMISSIVE for SELECT to authenticated
  using (user_can_access_report(report_id));

drop policy if exists ta_delete on public.ticket_attachments;
create policy ta_delete on public.ticket_attachments as PERMISSIVE for DELETE to public
  using ((uploaded_by = ( SELECT auth.uid() AS uid)));

drop policy if exists ta_insert on public.ticket_attachments;
create policy ta_insert on public.ticket_attachments as PERMISSIVE for INSERT to public
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

drop policy if exists ta_select on public.ticket_attachments;
create policy ta_select on public.ticket_attachments as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM tickets t
  WHERE ((t.id = ticket_attachments.ticket_id) AND has_project_access(t.project_id)))));

drop policy if exists storage_select on storage.objects;
create policy storage_select on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'saha-fotolari'::text) AND (EXISTS ( SELECT 1
   FROM daily_report_photos photo
  WHERE ((photo.storage_path = objects.name) AND has_project_access(photo.project_id))))));

drop policy if exists storage_select_ticket on storage.objects;
create policy storage_select_ticket on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'ticket-ekleri'::text) AND (EXISTS ( SELECT 1
   FROM (ticket_attachments attachment
     JOIN tickets ticket ON ((ticket.id = attachment.ticket_id)))
  WHERE ((attachment.storage_path = objects.name) AND (has_project_access(ticket.project_id) OR (ticket.created_by = ( SELECT auth.uid() AS uid)) OR (ticket.assigned_to = ( SELECT auth.uid() AS uid))))))));

-- ── authenticated yetkileri (information_schema.role_table_grants'ten birebir) ──

revoke all on table public.actions from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.actions to authenticated;

revoke all on table public.daily_report_photos from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.daily_report_photos to authenticated;

revoke all on table public.decisions from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.decisions to authenticated;

revoke all on table public.documents from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.documents to authenticated;

revoke all on table public.drawings from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.drawings to authenticated;

revoke all on table public.material_approvals from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.material_approvals to authenticated;

revoke all on table public.register_status_history from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.register_status_history to authenticated;

revoke all on table public.rfis from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.rfis to authenticated;

revoke all on table public.technical_submittals from authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.technical_submittals to authenticated;

revoke all on table public.ticket_attachments from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.ticket_attachments to authenticated;

-- ── Tablo yorumu ──
comment on table public.rfis is null;

commit;
