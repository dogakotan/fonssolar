-- ============================================================================
-- B5 DOĞRULAMA — kendini geri alan tek DO bloğu (TASLAK · PATRON ONAYI BEKLİYOR) · 07.10.2026
-- Ön koşul: B1 + B2 + B3 + B5. Gerçek dosya yüklenmez: Storage API'nin yükleme sırasında yazdığı
-- storage.objects satırı, kullanıcı rolüyle (RLS altında) elle eklenir. Bu, INSERT/SELECT/DELETE politikalarını
-- doğrular; Storage API'nin kendisini (boyut sınırı, MIME denetimi) DOĞRULAMAZ — o kısım Playwright testinde.
-- DELETE politikası, protect_objects_delete trigger'ı SQL'den silmeyi engellediği için yalnızca bu blok içinde
-- storage.allow_delete_query=true yapılarak denenir (geri alınır).
-- ============================================================================
do $$
declare
  p  constant text := 'test-izmir-ges-2026';
  p2 constant text := 'test-kayseri-develi-ges';
  u_admin uuid; u_pm uuid; u_ss uuid; u_ss2 uuid; u_muh uuid;
  j jsonb;
  doc1 uuid; rev1 uuid; rev2 uuid; rev3 uuid; rev4 uuid; rev5 uuid;
  path1 text; path3 text; path2 text;
  n int;
  checks int := 0;
  sha1 text := md5('b5-1-' || clock_timestamp()) || md5('b5-1b-' || clock_timestamp());
  sha2 text := md5('b5-2-' || clock_timestamp()) || md5('b5-2b-' || clock_timestamp());
  sha3 text := md5('b5-3-' || clock_timestamp()) || md5('b5-3b-' || clock_timestamp());
  sha4 text := md5('b5-4-' || clock_timestamp()) || md5('b5-4b-' || clock_timestamp());
  sha5 text := md5('b5-5-' || clock_timestamp()) || md5('b5-5b-' || clock_timestamp());
begin
  reset role;
  create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    reset role;
    perform set_config('request.jwt.claims',
      case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    if p_uid is not null then set local role authenticated; end if;
  end $f$;
  create or replace function pg_temp.expect_err(p_sql text, p_code text) returns text language plpgsql as $f$
  declare e text; ok boolean := false;
  begin
    begin execute p_sql; exception when others then ok := true; e := sqlerrm; end;
    if not ok then raise exception 'BEKLENMEDIK BASARI: %', p_sql; end if;
    if p_code is not null and e not like p_code then
      raise exception 'BEKLENMEDIK HATA (% beklendi): % | %', p_code, e, p_sql;
    end if;
    return e;
  end $f$;

  select id into u_admin from public.profiles where role_key = 'admin' order by id limit 1;
  select id into u_pm from public.profiles where role_key = 'proje_yoneticisi' order by id limit 1;
  select id into u_ss from public.profiles where role_key = 'santiye_sefi' and project_id = p limit 1;
  select id into u_ss2 from public.profiles where role_key = 'santiye_sefi' and project_id = p2 limit 1;
  select id into u_muh from public.profiles where role_key = 'muhasebe' order by id limit 1;

  -- ── 1. Katalog ──
  if not exists (select 1 from storage.buckets where id = 'proje-dokumanlari' and not public and file_size_limit = 52428800) then
    raise exception 'bucket yok, public veya sınırı yanlış';
  end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'proje_dokumanlari_%';
  if n <> 3 then raise exception 'bucket politikası sayısı 3 olmalıydı: %', n; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'
             and coalesce(qual, '') || coalesce(with_check, '') like '%proje-dokumanlari%') then
    raise exception 'bucket için UPDATE politikası var';
  end if;
  if not exists (select 1 from cron.job where jobname = 'cleanup-stale-document-uploads') then raise exception 'cron işi yok'; end if;
  if has_function_privilege('authenticated', 'public.fn_cleanup_stale_document_uploads()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.document_storage_path(text,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'iç fonksiyon dışarıya açık';
  end if;
  checks := checks + 1;

  -- ── 2. Yeni doküman + ilk revizyon (santiye şefi) ──
  perform pg_temp.as_user(u_ss);
  j := public.begin_document_upload(p, null, '{"title":"B5 test dokümanı","document_type":"report"}',
                                    'Rapor Ü ş.pdf', 1000, 'application/pdf', sha1);
  doc1 := (j ->> 'document_id')::uuid; rev1 := (j ->> 'revision_id')::uuid; path1 := j ->> 'storage_path';
  if path1 not like p || '/' || doc1 || '/' || rev1 || '_rapor-u-s.pdf' or j ->> 'revision_no' <> 'R01' then
    raise exception 'yükleme başlangıcı yanlış: %', j;
  end if;
  perform pg_temp.expect_err(format('select public.complete_document_upload(%L)', rev1), 'validation');  -- dosya yok
  insert into storage.objects (bucket_id, name, metadata) values ('proje-dokumanlari', path1, '{"size":1000}');
  perform pg_temp.expect_err(format('insert into storage.objects (bucket_id, name, metadata) values (%L, %L, %L)',
    'proje-dokumanlari', p || '/' || doc1 || '/baska.pdf', '{"size":1}'), 'new row violates row-level security%');
  j := public.complete_document_upload(rev1);
  if not exists (select 1 from public.document_revisions where id = rev1 and is_current and upload_status = 'ready') then
    raise exception 'complete güncel revizyonu ayarlamadı';
  end if;
  select count(*) into n from storage.objects where name = path1;
  if n <> 1 then raise exception 'yükleyen kendi dosyasını göremiyor'; end if;
  perform pg_temp.expect_err(format('select public.begin_document_upload(%L, null, %L, %L, 10, %L, %L)', p, '{"title":"x","document_type":"report"}', 'a.pdf', 'application/pdf', sha1), 'duplicate');
  perform pg_temp.expect_err(format('select public.begin_document_upload(%L, null, %L, %L, 10, %L, %L)', p, '{"title":"x","document_type":"report"}', 'a.txt', 'text/plain', sha2), 'validation');
  perform pg_temp.expect_err(format('select public.begin_document_upload(%L, null, %L, %L, 62914560, %L, %L)', p, '{"title":"x","document_type":"report"}', 'a.pdf', 'application/pdf', sha2), 'validation');
  perform pg_temp.expect_err(format('select public.begin_document_upload(%L, %L, %L, %L, 10, %L, %L)', p, doc1, '{}', 'b.pdf', 'application/pdf', sha2), 'forbidden');
  checks := checks + 1;

  -- ── 3. Başka projenin kullanıcısı ve muhasebe ──
  perform pg_temp.as_user(u_ss2);
  select count(*) into n from storage.objects where name = path1;
  if n <> 0 then raise exception 'başka projenin kullanıcısı dosyayı görüyor'; end if;
  perform pg_temp.expect_err(format('insert into storage.objects (bucket_id, name, metadata) values (%L, %L, %L)',
    'proje-dokumanlari', path1 || '.kopya', '{"size":1}'), 'new row violates row-level security%');
  perform pg_temp.expect_err(format('select public.begin_document_upload(%L, null, %L, %L, 10, %L, %L)', p, '{"title":"x","document_type":"report"}', 'a.pdf', 'application/pdf', sha2), 'forbidden');
  perform pg_temp.as_user(u_muh);
  select count(*) into n from storage.objects where name = path1;
  if n <> 0 then raise exception 'muhasebe (document view yok) dosyayı görüyor'; end if;
  checks := checks + 1;

  -- ── 4. İkinci revizyon (proje yöneticisi), boyut uyuşmazlığı, iptaller ──
  perform pg_temp.as_user(u_pm);
  j := public.begin_document_upload(p, doc1, '{"revision_status":"ifa"}', 'rev2.pdf', 2000, 'application/pdf', sha2);
  rev2 := (j ->> 'revision_id')::uuid; path2 := j ->> 'storage_path';
  if j ->> 'revision_no' <> 'R02' then raise exception 'ikinci revizyon numarası yanlış: %', j; end if;
  insert into storage.objects (bucket_id, name, metadata) values ('proje-dokumanlari', path2, '{"size":2000}');
  perform public.complete_document_upload(rev2);
  if (select count(*) from public.document_revisions where document_id = doc1 and is_current) <> 1
     or not (select is_current from public.document_revisions where id = rev2) then
    raise exception 'güncel revizyon devri yanlış';
  end if;
  j := public.begin_document_upload(p, doc1, '{}', 'rev3.pdf', 3000, 'application/pdf', sha3);
  rev3 := (j ->> 'revision_id')::uuid; path3 := j ->> 'storage_path';
  insert into storage.objects (bucket_id, name, metadata) values ('proje-dokumanlari', path3, '{"size":10}');
  perform pg_temp.expect_err(format('select public.complete_document_upload(%L)', rev3), 'validation');
  j := public.abort_document_upload(rev3);
  if (j ->> 'delete_file')::boolean is not true or (select upload_status from public.document_revisions where id = rev3) <> 'aborted'
     or (select revision_no from public.document_revisions where id = rev3) not like 'X%' then
    raise exception 'dosyalı iptal yanlış: %', j;
  end if;
  rev4 := (public.begin_document_upload(p, doc1, '{}', 'rev4.pdf', 4000, 'application/pdf', sha4) ->> 'revision_id')::uuid;
  j := public.abort_document_upload(rev4);
  if (j ->> 'row_deleted')::boolean is not true or exists (select 1 from public.document_revisions where id = rev4) then
    raise exception 'dosyasız iptal satırı silmedi: %', j;
  end if;
  checks := checks + 1;

  -- ── 5. DELETE politikası (yalnızca bu blokta protect_delete atlanarak) ──
  perform set_config('storage.allow_delete_query', 'true', true);
  perform pg_temp.as_user(u_ss2);
  delete from storage.objects where bucket_id = 'proje-dokumanlari' and name = path3;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'başka kullanıcı iptal edilmiş dosyayı sildi'; end if;
  perform pg_temp.as_user(u_pm);
  delete from storage.objects where bucket_id = 'proje-dokumanlari' and name = path2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'hazır (ready) dosya silinebildi'; end if;
  delete from storage.objects where bucket_id = 'proje-dokumanlari' and name = path3;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'yükleyen kendi iptal ettiği dosyayı silemedi'; end if;
  perform set_config('storage.allow_delete_query', 'false', true);
  checks := checks + 1;

  -- ── 6. Zamanlanmış temizlik, admin RPC'leri, void ──
  rev5 := (public.begin_document_upload(p, doc1, '{}', 'rev5.pdf', 5000, 'application/pdf', sha5) ->> 'revision_id')::uuid;
  perform pg_temp.expect_err('select public.get_stale_uploads()', 'forbidden');
  perform pg_temp.expect_err('select public.get_storage_usage()', 'forbidden');
  reset role;
  update public.document_revisions set upload_started_at = now() - interval '2 hours' where id = rev5;
  j := public.fn_cleanup_stale_document_uploads();
  if (j ->> 'aborted')::int < 1 or (j ->> 'rows_deleted')::int < 1 or exists (select 1 from public.document_revisions where id in (rev3, rev5)) then
    raise exception 'temizlik işi beklenen satırları işlemedi: %', j;
  end if;
  perform pg_temp.as_user(u_admin);
  j := public.get_storage_usage();
  if (j ->> 'total_bytes')::bigint < 3000 then raise exception 'kullanım raporu yanlış: %', j; end if;
  if jsonb_typeof(public.get_stale_uploads()) <> 'array' then raise exception 'get_stale_uploads dizi döndürmedi'; end if;
  perform pg_temp.as_user(u_pm);
  j := public.void_document(doc1, 'yanlış proje');
  perform pg_temp.expect_err(format('select public.begin_document_upload(%L, %L, %L, %L, 10, %L, %L)', p, doc1, '{}', 'c.pdf', 'application/pdf', md5('c') || md5('d')), 'invalid_state');
  perform pg_temp.as_user(u_ss);
  select count(*) into n from storage.objects where name = path1;
  if n <> 1 then raise exception 'void sonrası dosya saklanmadı'; end if;
  perform pg_temp.as_user(null);
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | B5 | % kontrol grubu | yükleme/tamamlama/iptal, revizyon devri, politika ve temizlik çalışıyor', checks;
end $$;
