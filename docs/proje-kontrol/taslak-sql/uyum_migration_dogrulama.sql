-- ============================================================================
-- UYUM MIGRATION'I — DOĞRULAMA BETİĞİ v2 (TASLAK)
-- Ne zaman: uyum migration'ı uygulandıktan HEMEN SONRA (ve ROLLBACK'li denemede migration'la birlikte).
-- Nasıl: tek DO bloğu; her şeyi dener ve sonunda bilerek hata fırlatır → bütün değişiklikler geri alınır.
--        Sonuç, hata mesajındaki özet satırıdır ("DOGRULAMA SONUCU: OK ...").
-- Neden SQL: G-01 sonrası authenticated register tablolarına yazamıyor, Faz B RPC'si henüz yok.
--        20 eşzamanlı istek tek oturumda denenemez → Faz B'ye kalır (tests/proje-kontrol-uyum.spec.js fixme).
-- Test projeleri: test-izmir-ges-2026 (TIZ), test-kayseri-develi-ges (TKY). Hiçbir şey kalıcı yazılmaz.
-- ============================================================================
do $$
declare
  p  constant text := 'test-izmir-ges-2026';
  p2 constant text := 'test-kayseri-develi-ges';
  v_prefix text;
  got text[] := '{}';
  expected text[];
  n text;
  t text;
  doc_id uuid; drw_doc_id uuid; other_doc_id uuid;
  rev2 uuid;
  flag boolean;
  before_val int; after_val int;
  checks int := 0;
begin
  -- ── 1. Katalog: adlar, RLS, yetkiler, policy'ler, fonksiyon yetkileri ──
  if to_regclass('public.actions') is not null then raise exception 'eski actions tablosu hâlâ var'; end if;
  if to_regclass('public.project_actions') is null then raise exception 'project_actions yok'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'project_tasks' and column_name = 'is_critical') then
    raise exception 'project_tasks.is_critical hâlâ var';
  end if;

  foreach t in array array['project_register_settings', 'document_revisions', 'project_actions',
                           'documents', 'drawings', 'project_register_counters'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'RLS kapalı: %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'anon yetkisi var: %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'authenticated yazma/ek yetkisi var: %', t;
    end if;
    checks := checks + 1;
  end loop;
  -- Okuma: sayaç hariç hepsinde authenticated SELECT olmalı
  foreach t in array array['project_register_settings', 'document_revisions', 'project_actions', 'documents', 'drawings'] loop
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'authenticated SELECT yok: %', t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.project_register_counters', 'SELECT') then
    raise exception 'authenticated sayaç tablosunu okuyabiliyor';
  end if;
  -- Yeni tablolarda yalnızca SELECT policy'si
  if exists (select 1 from pg_policies where schemaname = 'public'
             and tablename in ('project_register_settings', 'document_revisions') and cmd <> 'SELECT') then
    raise exception 'yeni tablolarda SELECT dışında policy var';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename in ('project_register_settings', 'document_revisions') and cmd = 'SELECT') <> 2 then
    raise exception 'yeni tablolarda beklenen 2 SELECT policy''si yok';
  end if;
  -- Numara fonksiyonları doğrudan çağrılamaz
  foreach t in array array['public.next_register_no(text,text)', 'public.fn_assign_document_no()',
                           'public.fn_assign_register_no()'] loop
    if has_function_privilege('anon', t, 'EXECUTE') or has_function_privilege('authenticated', t, 'EXECUTE') then
      raise exception 'anon/authenticated EXECUTE yetkisi var: %', t;
    end if;
  end loop;

  -- ── 2. Proje kodları ──
  if (select count(*) from public.project_register_settings
      where (project_id, prefix) in (('kaptan-demir-adana-arazi-faz1', 'ADN1'), ('kaptan-demir-adana-arazi-faz2', 'ADN2'),
                                     ('test-izmir-ges-2026', 'TIZ'), ('test-kayseri-develi-ges', 'TKY'))) <> 4 then
    raise exception 'proje kodları eksik/hatalı';
  end if;
  select prefix into v_prefix from public.project_register_settings where project_id = p;

  -- Kod tanımsız proje → açık hata
  flag := false;
  begin
    perform public.next_register_no('olmayan-proje-dogrulama', 'RFI');
  exception when sqlstate 'P0001' then flag := true;
  end;
  if not flag then raise exception 'kod tanımsız projede numara üretildi'; end if;

  -- ── 3. Numara biçimi: 1., 9., 10., 999., 1000., 1001., 9999., 10000. kayıt ──
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;
  update public.project_register_counters set last_value = 8    where project_id = p and register_code = 'RFI';
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;
  update public.project_register_counters set last_value = 998  where project_id = p and register_code = 'RFI';
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;
  update public.project_register_counters set last_value = 9998 where project_id = p and register_code = 'RFI';
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;
  insert into public.rfis (project_id, rfi_no, subject, question) values (p, '', 'DOGRULAMA', 'q') returning rfi_no into n; got := got || n;

  expected := array['0001', '0009', '0010', '0999', '1000', '1001', '9999', '10000'];
  for i in 1..array_length(expected, 1) loop
    if got[i] <> 'RFI-' || v_prefix || '-' || expected[i] then
      raise exception 'numara hatası: % beklendi, % geldi', 'RFI-' || v_prefix || '-' || expected[i], got[i];
    end if;
  end loop;
  if (select count(distinct rfi_no) from public.rfis where project_id = p and subject = 'DOGRULAMA') <> 8 then
    raise exception 'numara çakışması';
  end if;

  -- Proje bazında ayrı sıra: Kayseri'nin ilk RFI'si 0001 ve TKY
  insert into public.rfis (project_id, rfi_no, subject, question) values (p2, '', 'DOGRULAMA', 'q') returning rfi_no into n;
  if n <> 'RFI-TKY-0001' then raise exception 'proje bazında sıra hatalı: %', n; end if;

  -- Boşluksuz: başarısız insert sayacı ilerletmez
  select last_value into before_val from public.project_register_counters where project_id = p and register_code = 'RFI';
  begin
    insert into public.rfis (project_id, rfi_no, subject, question, status) values (p, '', 'DOGRULAMA', 'q', 'GECERSIZ');
  exception when check_violation then null;
  end;
  select last_value into after_val from public.project_register_counters where project_id = p and register_code = 'RFI';
  if before_val <> after_val then raise exception 'boşluk: sayaç % → % ilerledi', before_val, after_val; end if;

  -- ── 4. Doküman önekleri: çizim DRW, diğerleri DOC, ayrı sıralar ──
  insert into public.documents (project_id, document_no, title, document_type) values (p, '', 'DOGRULAMA', 'report')
    returning id, document_no into doc_id, n;
  if n <> 'DOC-' || v_prefix || '-0001' then raise exception 'DOC numarası beklenmedik: %', n; end if;
  other_doc_id := doc_id;
  insert into public.documents (project_id, document_no, title, document_type) values (p, '', 'DOGRULAMA', 'drawing')
    returning id, document_no into drw_doc_id, n;
  if n <> 'DRW-' || v_prefix || '-0001' then raise exception 'DRW numarası beklenmedik: %', n; end if;

  -- ── 5. drawings yalnızca çizim türündeki dokümana bağlanır ──
  flag := false;
  begin
    insert into public.drawings (project_id, document_id) values (p, other_doc_id);
  exception when foreign_key_violation then flag := true;
  end;
  if not flag then raise exception 'çizim, çizim olmayan dokümana bağlandı'; end if;
  insert into public.drawings (project_id, document_id, drawing_type) values (p, drw_doc_id, 'layout');
  flag := false;
  begin
    insert into public.drawings (project_id, document_id) values (p, drw_doc_id);
  exception when unique_violation then flag := true;
  end;
  if not flag then raise exception 'aynı dokümana ikinci çizim bağlandı'; end if;
  flag := false;
  begin
    update public.documents set document_type = 'report' where id = drw_doc_id;
  exception when foreign_key_violation then flag := true;
  end;
  if not flag then raise exception 'çizime bağlı dokümanın türü değiştirilebildi'; end if;

  -- ── 6. document_revisions: tek is_current, proje sınırı ──
  insert into public.document_revisions (project_id, document_id, revision_no, revision_status, is_current)
    values (p, drw_doc_id, 'R00', 'ifr', true);
  insert into public.document_revisions (project_id, document_id, revision_no, revision_status, is_current)
    values (p, drw_doc_id, 'R01', 'ifc', false) returning id into rev2;
  flag := false;
  begin
    update public.document_revisions set is_current = true where id = rev2;
  exception when unique_violation then flag := true;
  end;
  if not flag then raise exception 'ikinci is_current reddedilmedi'; end if;
  update public.document_revisions set is_current = false where document_id = drw_doc_id and revision_no = 'R00';
  update public.document_revisions set is_current = true where id = rev2;
  if (select count(*) from public.document_revisions where document_id = drw_doc_id and is_current) <> 1 then
    raise exception 'is_current değişimi hatalı';
  end if;
  flag := false;
  begin
    insert into public.document_revisions (project_id, document_id, revision_no, revision_status)
      values (p2, drw_doc_id, 'R09', 'ifr');
  exception when foreign_key_violation then flag := true;
  end;
  if not flag then raise exception 'başka projeye revizyon bağlandı'; end if;

  -- ── 7. project_actions: numara ACT, ncr/inspection reddedilir ──
  insert into public.project_actions (project_id, action_no, title) values (p, '', 'DOGRULAMA') returning action_no into n;
  if n <> 'ACT-' || v_prefix || '-0001' then raise exception 'ACT numarası beklenmedik: %', n; end if;
  foreach t in array array['ncr', 'inspection'] loop
    flag := false;
    begin
      insert into public.project_actions (project_id, action_no, title, source_type) values (p, '', 'DOGRULAMA', t);
    exception when check_violation then flag := true;
    end;
    if not flag then raise exception 'source_type % kabul edildi', t; end if;
  end loop;

  raise exception 'DOGRULAMA SONUCU: OK | yetki/RLS kontrolü % tablo | numaralar=% | DRW/DOC ayrı | çizim türü bağı zorunlu | tek is_current | ncr/inspection red (hepsi geri alındı)',
    checks, array_to_string(got, ',');
end $$;
