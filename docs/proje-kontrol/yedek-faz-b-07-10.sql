-- ============================================================================
-- FAZ B — DEĞİŞECEK CANLI NESNELERİN ANLIK GÖRÜNTÜSÜ · 07.10.2026 (canlı katalogdan, yalnızca SELECT)
-- Amaç: B1-B6 uygulandıktan sonra bir şey ters giderse nesneleri 07.10.2026 haline döndürmek.
-- Tam şema/veri yedeği DEĞİLDİR (bkz. scripts/db-backup/README.md). Her paketin kendi BÖLÜM B'si (geri al)
-- önce denenir; bu dosya, o bölümlerin hedeflediği "önceki hal"in kanıtıdır.
-- Bu dosyayı bir bütün olarak çalıştırmayın; ilgili bölümü seçip kullanın.
-- B1 ve B6 yalnızca YENİ nesne ekler (mevcut nesneye dokunmaz); geri almaları kendi BÖLÜM B'leri.
-- ============================================================================


-- ── §B2 · Master tablo yetkileri (G-13 öncesi) ──────────────────────────────
-- authenticated: project_wbs, project_areas, area_wbs = DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- service_role : aynı üç tablo = hepsi (değişmiyor)
-- Geri yükleme:
-- grant truncate, references, trigger on public.project_wbs, public.project_areas, public.area_wbs to authenticated;
-- grant update on public.area_wbs to authenticated;
-- B2'nin eklediği 30 indeks ve register_audit için B2 BÖLÜM B.


-- ── §B3 · Register tablolarının policy'leri (G-01 sonrası, B3 öncesi) ────────
-- Yetkiler (B3 değiştirmiyor, yalnızca teyit ediyor): 9 tabloda authenticated = SELECT; service_role = hepsi; anon = yok.
-- project_register_settings kolonları: project_id, prefix, created_at, updated_at (B3 four_eyes_enabled ekler).
/*
create policy decisions_delete on public.decisions as PERMISSIVE for DELETE to authenticated using (can_manage_project_control(project_id));
create policy decisions_insert on public.decisions as PERMISSIVE for INSERT to authenticated with check (can_write_project_control(project_id));
create policy decisions_select on public.decisions as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy decisions_update on public.decisions as PERMISSIVE for UPDATE to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy document_revisions_select on public.document_revisions as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy documents_delete on public.documents as PERMISSIVE for DELETE to authenticated using (can_manage_project_control(project_id));
create policy documents_insert on public.documents as PERMISSIVE for INSERT to authenticated with check (can_write_project_control(project_id));
create policy documents_select on public.documents as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy documents_update on public.documents as PERMISSIVE for UPDATE to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy drawings_delete on public.drawings as PERMISSIVE for DELETE to authenticated using (can_manage_project_control(project_id));
create policy drawings_insert on public.drawings as PERMISSIVE for INSERT to authenticated with check (can_write_project_control(project_id));
create policy drawings_select on public.drawings as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy drawings_update on public.drawings as PERMISSIVE for UPDATE to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy material_approvals_delete on public.material_approvals as PERMISSIVE for DELETE to authenticated using (can_manage_project_control(project_id));
create policy material_approvals_insert on public.material_approvals as PERMISSIVE for INSERT to authenticated with check (can_write_project_control(project_id));
create policy material_approvals_select on public.material_approvals as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy material_approvals_update on public.material_approvals as PERMISSIVE for UPDATE to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy project_actions_delete on public.project_actions as PERMISSIVE for DELETE to authenticated using (can_manage_project_control(project_id));
create policy project_actions_insert on public.project_actions as PERMISSIVE for INSERT to authenticated with check (can_write_project_control(project_id));
create policy project_actions_select on public.project_actions as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy project_actions_update on public.project_actions as PERMISSIVE for UPDATE to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy register_status_history_select on public.register_status_history as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy rfis_delete on public.rfis as PERMISSIVE for DELETE to authenticated using (can_manage_project_control(project_id));
create policy rfis_insert on public.rfis as PERMISSIVE for INSERT to authenticated with check (can_write_project_control(project_id));
create policy rfis_select on public.rfis as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy rfis_update on public.rfis as PERMISSIVE for UPDATE to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy technical_submittals_delete on public.technical_submittals as PERMISSIVE for DELETE to authenticated using (can_manage_project_control(project_id));
create policy technical_submittals_insert on public.technical_submittals as PERMISSIVE for INSERT to authenticated with check (can_write_project_control(project_id));
create policy technical_submittals_select on public.technical_submittals as PERMISSIVE for SELECT to authenticated using (user_has_project_access(project_id));
create policy technical_submittals_update on public.technical_submittals as PERMISSIVE for UPDATE to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
*/
-- Yardımcı fonksiyonlar (B3 değiştirmez, policy'ler düştükten sonra kullanılmaz kalır; ayrı temizlik kararı):
-- can_write_project_control(text): get_my_role() in (admin, proje_yoneticisi, santiye_sefi) AND has_project_access(p)
-- can_manage_project_control(text): get_my_role() in (admin, proje_yoneticisi) AND has_project_access(p)


-- ── §B4 · fn_project_tasks_identity_guard (B4 öncesi gövde, INVOKER, search_path=public) ──
/*
create or replace function public.fn_project_tasks_identity_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and old.activity_id is not null
     and new.activity_id is distinct from old.activity_id then
    raise exception 'Atanmış Activity ID değiştirilemez: %', old.activity_id;
  end if;

  if new.wbs_id is not null
     and (tg_op = 'INSERT' or new.wbs_id is distinct from old.wbs_id) then
    if exists (select 1 from public.project_wbs w where w.id = new.wbs_id and not w.is_active) then
      raise exception 'Pasif WBS aktiviteye atanamaz';
    end if;
  end if;
  if new.area_id is not null
     and (tg_op = 'INSERT' or new.area_id is distinct from old.area_id) then
    if exists (select 1 from public.project_areas a where a.id = new.area_id and not a.is_active) then
      raise exception 'Pasif alan aktiviteye atanamaz';
    end if;
  end if;
  return new;
end;
$function$;
*/


-- ── §B5 · Storage ve cron (B5 öncesi) ──────────────────────────────────────
-- Bucket'lar: saha-fotolari (private, 10 MB, görsel MIME listesi), teklif-ekleri (private), ticket-ekleri (private).
--   proje-dokumanlari YOK.
-- storage.objects policy'leri (B5 bunlara dokunmaz, yalnızca proje_dokumanlari_* ekler):
--   storage_select / storage_insert / storage_delete           (saha-fotolari)
--   storage_select_ticket / storage_insert_ticket / storage_delete_ticket (ticket-ekleri)
--   storage_select_teklif / storage_insert_teklif / storage_delete_teklif (teklif-ekleri)
-- storage.objects ve storage.buckets'ta protect_*_delete trigger'ları var (SQL'den silme engelli).
-- cron.job: daily-report-reminders | 0 6 * * 1-5 | select public.create_daily_report_reminders();
-- document_revisions kısıtları (B5 öncesi):
--   document_revisions_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
--   document_revisions_document_fk: FOREIGN KEY (project_id, document_id) REFERENCES documents(project_id, id) ON DELETE CASCADE
--   document_revisions_document_id_revision_no_key: UNIQUE (document_id, revision_no)
--   document_revisions_pkey: PRIMARY KEY (id)
--   document_revisions_project_id_fkey: FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
--   document_revisions_project_id_id_key: UNIQUE (project_id, id)
--   document_revisions_revision_no_format: CHECK ((revision_no ~ '^[A-Z0-9][A-Z0-9.-]{0,9}$'::text))
--   document_revisions_sha256_format: CHECK (((sha256 IS NULL) OR (sha256 ~ '^[0-9a-f]{64}$'::text)))
--   document_revisions_size_check: CHECK (((size_bytes IS NULL) OR (size_bytes >= 0)))
--   document_revisions_status_check: CHECK ((revision_status = ANY (ARRAY['ifr','ifa','ifc','as_built'])))
--   document_revisions_storage_provider_check: CHECK (storage_provider IS NULL OR storage_provider = ANY (ARRAY['onedrive','sharepoint','google_drive','supabase_storage','external']))


-- ── §B6 · Realtime yayını (B6 öncesi) ──────────────────────────────────────
-- supabase_realtime: public.daily_reports, public.invoices, public.notifications, public.progress_daily,
--                    public.project_tasks, public.purchase_requests, public.tickets
-- (register tablolarının hiçbiri yayında değil; B6 BÖLÜM B yalnızca kendi eklediklerini çıkarır)


-- ── Deneme öncesi/sonrası katalog parmak izi (07.10.2026, BEGIN…ROLLBACK denemelerinin hepsinden sonra aynı) ──
-- rel_count=62 cols=e3aefd087d1ea2778bd2915eb68f1d6b cons=4895e2f44e32298d4261c6ca1eac494a idx=f20b780233afdf78bd4d89d41cbc0d57
-- pol=c9c0e0743422b1ef7c39cdfeddd28108 trg=7576be76662ea6e98d5d97b915cbc5e0 grants=a346cef8e7e36a0e047b8596b4bffb31
-- fn=fbdb261e87e3650dd082d927f07cd2ef fn_count=116 buckets=633a2f90c509b6dead9076feff28c344 pub=d833e79a4649984b1da566f431e1d29d
-- cron=3cfe32816f7d71f124012e79c53fbf9c storage_objects=6 register_rows=0 tasks=b7644bee11544e22b95bcd78cf0c9a67
