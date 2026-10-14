-- ============================================================================
-- FAZ B · B5 — doküman deposu (Supabase Storage) — TASLAK · ★ PATRON ONAYI BEKLİYOR (Karar 5) ★
-- UYGULANMAYACAK: patron dosya deposunu ve Supabase Pro planını onaylamadan bu dosya canlıya uygulanmaz.
-- ★ DEĞİŞTİRİLDİ (09.10.2026), YENİDEN TEST BEKLİYOR ★ fn_cleanup_stale_document_uploads yalnızca
--   storage_provider = 'supabase_storage' satırlarına daraltıldı (CONVENTIONS.md §5). 07.10'daki BEGIN…ROLLBACK
--   denemesi önceki sürüme aittir; bu sürüm canlıda denenmedi.
-- ★ 14.10.2026: A1'e mevcut revizyonları 'ready' yapan geri doldurma eklendi (Karar 81); yeniden test bekliyor. ★
-- Tarih: 07.10.2026 · Plan: docs/proje-kontrol/faz-b-migration-plani.md · Tasarım: tasarim.md §4.4 (Doküman yükleme), §4.5
-- Doğrulama: taslak-sql/b5_dogrulama.sql · Anlık görüntü: yedek-faz-b-07-10.sql §B5 (storage.objects policy'leri, bucket'lar, cron işleri)
-- Test: tests/proje-kontrol-b5-dosya.spec.js
-- Bağımlılık: B1 (register_can, register_raise), B2 (audit), B3 (save_register_record, set_register_status).
--
-- İçerik:
--   * document_revisions'a upload_status (uploading | ready | aborted), upload_started_at, uploaded_at.
--     Dosya kolonları canlıda zaten var: yol → storage_file_id (storage_provider = 'supabase_storage'),
--     yükleyen → created_by, file_name/mime_type/size_bytes/sha256.
--   * Özel bucket proje-dokumanlari: public değil, tek dosya 50 MB (ücretsiz plan sınırı), izinli türler.
--     Yol: {project_id}/{document_id}/{revision_id}_{güvenli-ad} — ilk klasör proje (G-02/G-03 deseni).
--   * Storage politikaları (G-04'ün bu bucket için çözümü):
--       SELECT: yolu birebir eşleşen revizyon + proje erişimi + register_can('document','view');
--               uploading/aborted dosyayı yalnızca yükleyen görür.
--       INSERT: yalnızca begin_document_upload'ın kullanıcı adına açtığı 'uploading' revizyonun yoluna.
--       UPDATE: yok (kapalı).
--       DELETE: yalnızca kendi uploading/aborted yüklemesi; admin aborted olanları. Hazır (ready) dosya silinemez.
--     NOT (canlıda doğrulandı): storage.objects'te protect_objects_delete trigger'ı SQL'den silmeyi engelliyor.
--     Bu yüzden dosya silme istemcide Storage API'siyle yapılır; veritabanı yalnızca kayıtları yönetir.
--   * RPC'ler: begin_document_upload, complete_document_upload, abort_document_upload, void_document,
--     get_storage_usage (admin), get_stale_uploads (admin).
--   * pg_cron (saatlik): 1 saatten eski uploading → aborted; dosyası depoda olmayan aborted satırlar silinir.
--     Dosyası kalan aborted satırlar get_stale_uploads ile listelenir (tam otomatik silme pg_net + edge function ister).
--   * document_jobs satırı (tasarım 4.4) Faz C'de (C1 tablosu gelince) complete_document_upload'a eklenir.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA (yalnızca patron onayından ve SQL onayından sonra)
-- ############################################################################
begin;

-- ── A1 · document_revisions yükleme durumu ──
alter table public.document_revisions
  add column upload_status text not null default 'uploading',
  add column upload_started_at timestamptz not null default now(),
  add column uploaded_at timestamptz,
  add constraint document_revisions_upload_status_check check (upload_status in ('uploading','ready','aborted'));
-- A1b (14.10.2026, Karar 81): mevcut revizyonlar (panelden girilmiş 'external' linkler; Supabase Storage'a
-- yükleme B5'ten önce yok) hazır sayılır. Kısıt bundan sonra eklenir, yoksa is_current satırlar onu bozar.
-- Saatlik temizlik zaten yalnızca storage_provider = 'supabase_storage' satırlarına bakar.
select set_config('fons.audit_reason', 'B5 geri doldurma: mevcut revizyonlar hazır (Karar 81)', true);
update public.document_revisions
   set upload_status = 'ready', upload_started_at = created_at, uploaded_at = created_at
 where storage_provider is distinct from 'supabase_storage';
select set_config('fons.audit_reason', '', true);
alter table public.document_revisions
  add constraint document_revisions_current_is_ready check (not is_current or upload_status = 'ready');
create unique index document_revisions_storage_path_key on public.document_revisions (storage_file_id)
  where storage_provider = 'supabase_storage';
create index idx_document_revisions_upload_pending on public.document_revisions (upload_started_at)
  where upload_status in ('uploading','aborted');

-- ── A2 · Bucket ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proje-dokumanlari', 'proje-dokumanlari', false, 52428800, array[
  'application/pdf', 'image/png', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/vnd.dwg', 'application/acad', 'application/x-acad', 'application/dwg', 'application/x-dwg'])
on conflict (id) do nothing;

-- ── A3 · Yardımcılar ──
create function public.document_storage_path(p_project_id text, p_document_id uuid, p_revision_id uuid, p_file_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select p_project_id || '/' || p_document_id || '/' || p_revision_id || '_' ||
         left(coalesce(nullif(btrim(regexp_replace(regexp_replace(
           lower(translate(coalesce(p_file_name, ''), 'çğıöşüÇĞİÖŞÜ', 'cgiosucgiosu')),
           '[^a-z0-9._-]+', '-', 'g'), '-{2,}', '-', 'g'), '-.'), ''), 'dosya'), 80);
$$;

create function public.document_upload_allowed(p_file_name text, p_mime text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(substring(coalesce(p_file_name, '') from '\.([A-Za-z0-9]+)$')) in ('pdf','png','jpg','jpeg','docx','xlsx','dwg')
     and coalesce(p_mime, '') in ('application/pdf', 'image/png', 'image/jpeg',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'image/vnd.dwg', 'application/acad', 'application/x-acad', 'application/dwg', 'application/x-dwg');
$$;

-- ── A4 · Yükleme RPC'leri ──
create function public.begin_document_upload(
  p_project_id text, p_document_id uuid, p_meta jsonb,
  p_file_name text, p_size bigint, p_mime text, p_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_doc record;
  v_doc_id uuid := p_document_id;
  v_rev uuid := gen_random_uuid();
  v_path text;
  v_rev_no text;
  v_dup record;
begin
  if v_uid is null then
    perform public.register_raise('forbidden', 'Oturum yok');
  end if;
  if p_project_id is null or not public.has_project_access(p_project_id) then
    perform public.register_raise('forbidden', 'Bu projeye erişiminiz yok');
  end if;
  if coalesce(p_size, 0) <= 0 or p_size > 52428800 then
    perform public.register_raise('validation', 'Dosya boyutu 0 ile 50 MB arasında olmalı', jsonb_build_object('fields', '["p_size"]'::jsonb, 'max_bytes', 52428800));
  end if;
  if not public.document_upload_allowed(p_file_name, p_mime) then
    perform public.register_raise('validation', 'İzin verilmeyen dosya türü (pdf, png, jpg, docx, xlsx, dwg)',
      jsonb_build_object('fields', '["p_file_name","p_mime"]'::jsonb));
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    perform public.register_raise('validation', 'sha256 geçersiz', '{"fields":["p_sha256"]}');
  end if;
  select r.id, r.document_id into v_dup from public.document_revisions r
   where r.project_id = p_project_id and r.sha256 = p_sha256 and r.upload_status <> 'aborted' limit 1;
  if found then
    perform public.register_raise('duplicate', 'Bu dosya bu projede zaten kayıtlı',
      jsonb_build_object('document_id', v_dup.document_id, 'revision_id', v_dup.id));
  end if;

  if v_doc_id is null then
    -- Yeni doküman: kimlik alanları p_meta'dan; doğrulama ve numara save_register_record'da
    v_doc_id := (public.save_register_record('document', p_project_id, null,
                   v_meta - 'revision_no' - 'revision_status' - 'issue_date' - 'notes') ->> 'id')::uuid;
  else
    select d.id, d.project_id, d.status into v_doc from public.documents d where d.id = v_doc_id for update;
    if not found or v_doc.project_id <> p_project_id then
      perform public.register_raise('not_found', 'Doküman bu projede yok');
    end if;
    if v_doc.status <> 'active' then
      perform public.register_raise('invalid_state', 'İptal edilmiş dokümana revizyon eklenemez');
    end if;
    if not public.register_can('document', 'edit') then
      perform public.register_raise('forbidden', 'Revizyon yükleme yetkiniz yok');
    end if;
  end if;

  v_rev_no := coalesce(nullif(btrim(v_meta ->> 'revision_no'), ''),
                'R' || lpad(((select count(*) from public.document_revisions r
                              where r.document_id = v_doc_id and r.upload_status <> 'aborted') + 1)::text, 2, '0'));
  v_path := public.document_storage_path(p_project_id, v_doc_id, v_rev, p_file_name);

  begin
    insert into public.document_revisions (id, project_id, document_id, revision_no, revision_status, is_current,
      issue_date, storage_provider, storage_file_id, file_name, mime_type, size_bytes, sha256, notes, created_by,
      upload_status, upload_started_at)
    values (v_rev, p_project_id, v_doc_id, v_rev_no, coalesce(nullif(v_meta ->> 'revision_status', ''), 'ifr'), false,
      nullif(v_meta ->> 'issue_date', '')::date, 'supabase_storage', v_path, p_file_name, p_mime, p_size, p_sha256,
      nullif(v_meta ->> 'notes', ''), v_uid, 'uploading', now());
  exception when check_violation or unique_violation or invalid_datetime_format then
    perform public.register_raise('validation', 'Revizyon bilgisi geçersiz (revizyon no biçimi, durum veya tekrar eden revizyon no)',
      jsonb_build_object('error', sqlerrm));
  end;

  return jsonb_build_object('document_id', v_doc_id, 'revision_id', v_rev, 'revision_no', v_rev_no,
                            'bucket', 'proje-dokumanlari', 'storage_path', v_path);
end $$;

create function public.complete_document_upload(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rev record; v_size bigint;
begin
  select * into v_rev from public.document_revisions where id = p_revision_id for update;
  if not found or not public.has_project_access(v_rev.project_id) then
    perform public.register_raise('not_found', 'Revizyon bulunamadı');
  end if;
  if v_rev.created_by is distinct from auth.uid() then
    perform public.register_raise('forbidden', 'Yüklemeyi yalnızca başlatan kullanıcı tamamlar');
  end if;
  if v_rev.upload_status <> 'uploading' then
    perform public.register_raise('invalid_state', 'Yükleme bu durumda tamamlanamaz', jsonb_build_object('upload_status', v_rev.upload_status));
  end if;
  select (o.metadata ->> 'size')::bigint into v_size from storage.objects o
   where o.bucket_id = 'proje-dokumanlari' and o.name = v_rev.storage_file_id;
  if not found then
    perform public.register_raise('validation', 'Dosya depoda bulunamadı', '{"reason":"file_missing"}');
  end if;
  if v_size is distinct from v_rev.size_bytes then
    perform public.register_raise('validation', 'Depodaki dosyanın boyutu bildirilenle aynı değil',
      jsonb_build_object('reason', 'size_mismatch', 'expected', v_rev.size_bytes, 'actual', v_size));
  end if;
  -- Kısmi unique index ertelenemez: önce eski güncel revizyon false, sonra yenisi true
  update public.document_revisions set is_current = false
   where document_id = v_rev.document_id and is_current and id <> p_revision_id;
  update public.document_revisions set upload_status = 'ready', uploaded_at = now(), is_current = true
   where id = p_revision_id;
  -- Faz C: burada document_jobs satırı açılır (C1 tablosu gelince)
  return jsonb_build_object('document_id', v_rev.document_id, 'revision_id', p_revision_id, 'is_current', true);
end $$;

create function public.abort_document_upload(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_rev record; v_exists boolean;
begin
  select * into v_rev from public.document_revisions where id = p_revision_id for update;
  if not found or not public.has_project_access(v_rev.project_id) then
    perform public.register_raise('not_found', 'Revizyon bulunamadı');
  end if;
  if v_rev.created_by is distinct from auth.uid() and coalesce(public.get_my_role(), '') <> 'admin' then
    perform public.register_raise('forbidden', 'Yüklemeyi yalnızca başlatan kullanıcı veya admin iptal eder');
  end if;
  if v_rev.upload_status = 'ready' then
    perform public.register_raise('invalid_state', 'Tamamlanmış yükleme iptal edilemez; doküman void edilir');
  end if;
  v_exists := exists (select 1 from storage.objects o where o.bucket_id = 'proje-dokumanlari' and o.name = v_rev.storage_file_id);
  if v_exists then
    -- Dosya depoda: satır aborted kalır, istemci dosyayı Storage API'siyle siler (DELETE policy'si buna izin verir).
    -- İptal edilen satır gerçek revizyon numarasını işgal etmesin diye numarası id'den türetilen yer tutucuya çevrilir
    -- (07.10 denemesinde bulundu: aksi halde sonraki yükleme aynı R0n'yi alıp UNIQUE(document_id, revision_no)'ya takılıyordu).
    update public.document_revisions
       set upload_status = 'aborted', revision_no = 'X' || upper(left(replace(id::text, '-', ''), 8))
     where id = p_revision_id;
  else
    delete from public.document_revisions where id = p_revision_id;
  end if;
  return jsonb_build_object('revision_id', p_revision_id, 'bucket', 'proje-dokumanlari',
                            'storage_path', v_rev.storage_file_id, 'delete_file', v_exists, 'row_deleted', not v_exists);
end $$;

create function public.void_document(p_document_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Yetki, durum geçişi (active → void) ve gerekçe kontrolü set_register_status'ta; dosyalar saklanır
  return public.set_register_status('document', p_document_id, 'void', p_reason);
end $$;

create function public.get_storage_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then
    perform public.register_raise('forbidden', 'Yalnızca admin');
  end if;
  select jsonb_build_object(
    'total_bytes', coalesce(sum((o.metadata ->> 'size')::bigint), 0),
    'buckets', coalesce((select jsonb_object_agg(b.bucket_id, jsonb_build_object('files', b.n, 'bytes', b.bytes))
                         from (select bucket_id, count(*) n, coalesce(sum((metadata ->> 'size')::bigint), 0) bytes
                               from storage.objects group by bucket_id) b), '{}'::jsonb),
    'database_bytes', pg_database_size(current_database()))
    into v
    from storage.objects o;
  return v;
end $$;

create function public.get_stale_uploads()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.get_my_role(), '') <> 'admin' then
    perform public.register_raise('forbidden', 'Yalnızca admin');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('revision_id', r.id, 'project_id', r.project_id, 'document_id', r.document_id,
             'upload_status', r.upload_status, 'upload_started_at', r.upload_started_at,
             'bucket', 'proje-dokumanlari', 'storage_path', r.storage_file_id) order by r.upload_started_at)
    from public.document_revisions r
    where r.storage_provider = 'supabase_storage'
      and (r.upload_status = 'aborted' or (r.upload_status = 'uploading' and r.upload_started_at < now() - interval '1 hour'))
      and exists (select 1 from storage.objects o where o.bucket_id = 'proje-dokumanlari' and o.name = r.storage_file_id)),
    '[]'::jsonb);
end $$;

create function public.fn_cleanup_stale_document_uploads()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_aborted int; v_deleted int;
begin
  perform set_config('fons.audit_reason', 'cron: yarım yükleme temizliği', true);
  update public.document_revisions
     set upload_status = 'aborted', revision_no = 'X' || upper(left(replace(id::text, '-', ''), 8))
   where storage_provider = 'supabase_storage'
     and upload_status = 'uploading' and upload_started_at < now() - interval '1 hour';
  get diagnostics v_aborted = row_count;
  delete from public.document_revisions r
   where r.storage_provider = 'supabase_storage'
     and r.upload_status = 'aborted'
     and not exists (select 1 from storage.objects o where o.bucket_id = 'proje-dokumanlari' and o.name = r.storage_file_id);
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('aborted', v_aborted, 'rows_deleted', v_deleted);
end $$;

-- ── A5 · Storage politikaları (yalnızca bu bucket) ──
create policy proje_dokumanlari_select on storage.objects for select to authenticated
  using (
    bucket_id = 'proje-dokumanlari'
    and exists (
      select 1 from public.document_revisions r
      where r.storage_provider = 'supabase_storage'
        and r.storage_file_id = objects.name
        and r.project_id = (storage.foldername(objects.name))[1]
        and public.has_project_access(r.project_id)
        and public.register_can('document', 'view')
        and (r.upload_status = 'ready' or r.created_by = (select auth.uid()))));

create policy proje_dokumanlari_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proje-dokumanlari'
    and exists (
      select 1 from public.document_revisions r
      where r.storage_provider = 'supabase_storage'
        and r.storage_file_id = objects.name
        and r.project_id = (storage.foldername(objects.name))[1]
        and r.upload_status = 'uploading'
        and r.created_by = (select auth.uid())
        and public.has_project_access(r.project_id)));

create policy proje_dokumanlari_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'proje-dokumanlari'
    and exists (
      select 1 from public.document_revisions r
      where r.storage_provider = 'supabase_storage'
        and r.storage_file_id = objects.name
        and (   (r.created_by = (select auth.uid()) and r.upload_status in ('uploading','aborted'))
             or ((select public.get_my_role()) = 'admin' and r.upload_status = 'aborted'))));
-- UPDATE policy'si bilerek yok.

-- ── A6 · Fonksiyon yetkileri ──
revoke all on function public.document_storage_path(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.document_upload_allowed(text, text) from public, anon;
grant execute on function public.document_upload_allowed(text, text) to authenticated;
revoke all on function public.fn_cleanup_stale_document_uploads() from public, anon, authenticated;
revoke all on function public.begin_document_upload(text, uuid, jsonb, text, bigint, text, text) from public, anon;
revoke all on function public.complete_document_upload(uuid) from public, anon;
revoke all on function public.abort_document_upload(uuid) from public, anon;
revoke all on function public.void_document(uuid, text) from public, anon;
revoke all on function public.get_storage_usage() from public, anon;
revoke all on function public.get_stale_uploads() from public, anon;
grant execute on function public.begin_document_upload(text, uuid, jsonb, text, bigint, text, text) to authenticated;
grant execute on function public.complete_document_upload(uuid) to authenticated;
grant execute on function public.abort_document_upload(uuid) to authenticated;
grant execute on function public.void_document(uuid, text) to authenticated;
grant execute on function public.get_storage_usage() to authenticated;
grant execute on function public.get_stale_uploads() to authenticated;

-- ── A7 · Zamanlanmış temizlik (saatlik, :15'te) ──
select cron.schedule('cleanup-stale-document-uploads', '15 * * * *',
                     'select public.fn_cleanup_stale_document_uploads();');

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL
-- Bucket'ta dosya varsa SQL ile silinemez (protect_delete); önce Storage API/panelden boşaltılır.
-- ############################################################################
/*
begin;
select cron.unschedule('cleanup-stale-document-uploads');
drop policy if exists proje_dokumanlari_select on storage.objects;
drop policy if exists proje_dokumanlari_insert on storage.objects;
drop policy if exists proje_dokumanlari_delete on storage.objects;
drop function if exists public.fn_cleanup_stale_document_uploads();
drop function if exists public.get_stale_uploads();
drop function if exists public.get_storage_usage();
drop function if exists public.void_document(uuid, text);
drop function if exists public.abort_document_upload(uuid);
drop function if exists public.complete_document_upload(uuid);
drop function if exists public.begin_document_upload(text, uuid, jsonb, text, bigint, text, text);
drop function if exists public.document_upload_allowed(text, text);
drop function if exists public.document_storage_path(text, uuid, uuid, text);
drop index if exists public.idx_document_revisions_upload_pending;
drop index if exists public.document_revisions_storage_path_key;
alter table public.document_revisions
  drop constraint if exists document_revisions_current_is_ready,
  drop constraint if exists document_revisions_upload_status_check,
  drop column if exists uploaded_at, drop column if exists upload_started_at, drop column if exists upload_status;
-- Bucket boşsa (yalnızca o zaman; protect_delete trigger'ı nedeniyle Storage API/panelden silinmesi önerilir):
-- Supabase panelinden "proje-dokumanlari" bucket'ını silin.
commit;
*/
