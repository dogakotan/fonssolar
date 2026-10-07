-- ============================================================================
-- UYUM MIGRATION'I — DOĞRULAMA BETİĞİ (TASLAK, çalıştırılmadı)
-- Ne zaman: uyum migration'ı uygulandıktan HEMEN SONRA, onayla, bir kez.
-- Nasıl: tek DO bloğu; her şeyi dener ve sonunda bilerek hata fırlatır → bütün değişiklikler geri alınır.
--        Sonuç, hata mesajının içindeki özet satırıdır ("DOGRULAMA SONUCU: ...").
-- Neden SQL: G-01 sonrası authenticated register tablolarına yazamıyor ve Faz B RPC'si
--        (save_register_record) henüz yok; Playwright tarafında bu testler test.fixme bekliyor
--        (tests/proje-kontrol-uyum.spec.js). 20 eşzamanlı istek tek oturumda denenemez → Faz B'ye kalır.
-- Test projesi: test-izmir-ges-2026 (gerçek müşteri projesine yazılmaz; zaten geri alınır).
-- ============================================================================
do $$
declare
  p constant text := 'test-izmir-ges-2026';
  v_prefix text;
  got text[] := '{}';
  expected text[];
  n text;
  doc_id uuid;
  rev2 uuid;
  second_current_rejected boolean := false;
  gapless_ok boolean;
  before_val int; after_val int;
begin
  -- Proje kodu: tanımlıysa onu kullan, değilse geçici 'ZZT' (geri alınacak)
  select prefix into v_prefix from public.project_register_settings where project_id = p;
  if v_prefix is null then
    v_prefix := 'ZZT';
    insert into public.project_register_settings (project_id, prefix) values (p, v_prefix);
  end if;

  -- Kod tanımsız proje → açık hata (kayıt açılmamalı)
  declare missing_rejected boolean := false;
  begin
    begin
      perform public.next_register_no('test-kayseri-develi-ges-YOK', 'RFI');
    exception when sqlstate 'P0001' then missing_rejected := true;
    end;
    if not missing_rejected then raise exception 'beklenmedik: kod tanımsız projede numara üretildi'; end if;
  end;

  -- 1., 9., 10., 999., 1000., 1001., 9999., 10000. kayıt (sayaç ara değerlere elle taşınır)
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

  expected := array['0001','0009','0010','0999','1000','1001','9999','10000'];
  for i in 1..array_length(expected, 1) loop
    if got[i] <> 'RFI-' || v_prefix || '-' || expected[i] then
      raise exception 'numara hatası: % beklendi, % geldi', 'RFI-' || v_prefix || '-' || expected[i], got[i];
    end if;
  end loop;
  if (select count(distinct rfi_no) from public.rfis where project_id = p and subject = 'DOGRULAMA') <> 8 then
    raise exception 'numara çakışması';
  end if;

  -- Boşluksuz: başarısız insert sayacı ilerletmemeli (aynı transaction'da geri alınır)
  select last_value into before_val from public.project_register_counters where project_id = p and register_code = 'RFI';
  begin
    insert into public.rfis (project_id, rfi_no, subject, question, status) values (p, '', 'DOGRULAMA', 'q', 'GECERSIZ');
  exception when check_violation then null;
  end;
  select last_value into after_val from public.project_register_counters where project_id = p and register_code = 'RFI';
  gapless_ok := before_val = after_val;
  if not gapless_ok then raise exception 'boşluk: başarısız insert sayacı % → % ilerletti', before_val, after_val; end if;

  -- Tür bazında ayrı sıra: ilk DOC numarası 0001
  insert into public.documents (project_id, document_no, title) values (p, '', 'DOGRULAMA') returning id, document_no into doc_id, n;
  if n <> 'DOC-' || v_prefix || '-0001' then raise exception 'DOC numarası beklenmedik: %', n; end if;

  -- document_revisions: ikinci is_current reddedilir; doğru sırayla değiştirme çalışır
  insert into public.document_revisions (project_id, document_id, revision_no, revision_status, is_current)
    values (p, doc_id, 'R00', 'ifr', true);
  insert into public.document_revisions (project_id, document_id, revision_no, revision_status, is_current)
    values (p, doc_id, 'R01', 'ifc', false) returning id into rev2;
  begin
    update public.document_revisions set is_current = true where id = rev2;
  exception when unique_violation then second_current_rejected := true;
  end;
  if not second_current_rejected then raise exception 'ikinci is_current reddedilmedi'; end if;
  update public.document_revisions set is_current = false where document_id = doc_id and revision_no = 'R00';
  update public.document_revisions set is_current = true where id = rev2;
  if (select count(*) from public.document_revisions where document_id = doc_id and is_current) <> 1 then
    raise exception 'is_current değişimi hatalı';
  end if;

  -- Başka projenin dokümanına revizyon bağlanamaz (kompozit FK)
  begin
    insert into public.document_revisions (project_id, document_id, revision_no, revision_status)
      values ('test-kayseri-develi-ges', doc_id, 'R09', 'ifr');
    raise exception 'beklenmedik: başka projeye revizyon bağlandı';
  exception when foreign_key_violation then null;
  end;

  raise exception 'DOGRULAMA SONUCU: OK | numaralar=% | bosluksuz=% | ikinci_is_current_red=% (geri alındı)',
    array_to_string(got, ','), gapless_ok, second_current_rejected;
end $$;
