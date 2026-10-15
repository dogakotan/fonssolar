-- ============================================================================
-- F5 DOĞRULAMA — Change, Claim, Interface (TASLAK) · 14.10.2026
-- Ne zaman: f5_changes_claims_interfaces.sql BÖLÜM A ile aynı işlemde (ROLLBACK'li deneme) ya da uygulamadan sonra.
-- Nasıl: gerçek kullanıcılarla (request.jwt.claims + SET LOCAL ROLE authenticated) dener, sonunda bilerek hata
-- fırlatır → hiçbir şey kalıcı olmaz. Sonuç hata mesajındaki "DOGRULAMA SONUCU: OK …" satırıdır.
-- Kural 10 ön kontrolü:
--   * değişkenler v_/u_/p_ önekli; sorgularda kolon adlarıyla (status, change_no, project_id…) çakışan değişken yok;
--   * beklenen metinler text kolonlardan (numara biçimi CHG-TIZ-0001; sayaç integer karşılaştırılır; boolean yok);
--   * her yazma ayrı ifade; okuma (count) sonraki ifadede. INSERT … RETURNING kendi satırının trigger sonrası halini döndürür.
-- Not: sayaç ve durum geçmişi satırları mevcut tablolara yazılır; ROLLBACK ile geri alınır.
-- ============================================================================
do $$
declare
  p_tiz constant text := 'test-izmir-ges-2026';
  p_tky constant text := 'test-kayseri-develi-ges';
  u_admin uuid; u_pm uuid; u_ss uuid; u_muh uuid;
  v_chg1 uuid; v_chg2 uuid; v_chg_tky uuid; v_clm uuid; v_itf uuid; v_itf_tky uuid;
  v_no text;
  v_n int;
  v_exp text;
  checks int := 0;
begin
  create or replace function pg_temp.f5_as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    reset role;
    perform set_config('request.jwt.claims',
      case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    if p_uid is not null then set local role authenticated; end if;
  end $f$;
  create or replace function pg_temp.f5_as_anon() returns void language plpgsql as $f$
  begin
    reset role;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
  end $f$;
  create or replace function pg_temp.f5_expect_err(p_sql text, p_like text) returns void language plpgsql as $f$
  declare v_err text; v_ok boolean := false;
  begin
    begin execute p_sql; exception when others then v_ok := true; v_err := sqlerrm; end;
    if not v_ok then raise exception 'BEKLENMEDIK BASARI: %', p_sql; end if;
    if v_err not like p_like then raise exception 'BEKLENMEDIK HATA (% beklendi): % | %', p_like, v_err, p_sql; end if;
  end $f$;
  create or replace function pg_temp.f5_count(p_tbl text) returns int language plpgsql as $f$
  declare v_c int;
  begin
    execute format('select count(*) from public.%I', p_tbl) into v_c;
    return v_c;
  end $f$;

  select id into u_admin from public.profiles where role_key = 'admin' order by id limit 1;
  select id into u_pm from public.profiles where role_key = 'proje_yoneticisi' order by id limit 1;
  select id into u_ss from public.profiles where role_key = 'santiye_sefi' and project_id = p_tiz order by id limit 1;
  select id into u_muh from public.profiles where role_key = 'muhasebe' order by id limit 1;
  if u_admin is null or u_pm is null or u_ss is null or u_muh is null then
    raise exception 'test kullanıcıları bulunamadı';
  end if;

  -- ── T1 · Katalog: tablolar, RLS, policy, trigger, yetki ──
  select count(*) into v_n from pg_class
   where relnamespace = 'public'::regnamespace and relname in ('changes','claims','interfaces') and relrowsecurity;
  if v_n <> 3 then raise exception 'T1 RLS açık tablo sayısı 3 değil: %', v_n; end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename in ('changes','claims','interfaces');
  if v_n <> 3 then raise exception 'T1 policy sayısı 3 değil: %', v_n; end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename in ('changes','claims','interfaces') and cmd <> 'SELECT';
  if v_n <> 0 then raise exception 'T1 SELECT dışı policy var: %', v_n; end if;
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname in ('changes','claims','interfaces') and c.relnamespace = 'public'::regnamespace and not tg.tgisinternal;
  if v_n <> 9 then raise exception 'T1 trigger sayısı 9 değil: %', v_n; end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('changes','claims','interfaces')
     and grantee = 'authenticated' and privilege_type <> 'SELECT';
  if v_n <> 0 then raise exception 'T1 authenticated''ta SELECT dışı yetki: %', v_n; end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('changes','claims','interfaces') and grantee = 'anon';
  if v_n <> 0 then raise exception 'T1 anon''da yetki var: %', v_n; end if;
  checks := checks + 1;

  -- ── T2 · Numara (postgres/panel bağlamı; numara kolonu boş) ──
  perform pg_temp.f5_as_user(null);
  insert into public.changes (project_id, title) values (p_tiz, 'F5 test change 1') returning id, change_no into v_chg1, v_no;
  if v_no <> 'CHG-TIZ-0001' then raise exception 'T2 change numarası: %', v_no; end if;
  insert into public.changes (project_id, title, origin, cost_estimate) values (p_tiz, 'F5 test change 2', 'design_change', 1250.50)
    returning id, change_no into v_chg2, v_no;
  if v_no <> 'CHG-TIZ-0002' then raise exception 'T2 ikinci change numarası: %', v_no; end if;
  insert into public.changes (project_id, title) values (p_tky, 'F5 test change TKY') returning id, change_no into v_chg_tky, v_no;
  if v_no <> 'CHG-TKY-0001' then raise exception 'T2 proje bazlı sayaç: %', v_no; end if;
  insert into public.claims (project_id, title, notice_type, event_date, change_id)
    values (p_tiz, 'F5 test claim', 'both', date '2026-10-01', v_chg1) returning id, claim_no into v_clm, v_no;
  if v_no <> 'CLM-TIZ-0001' then raise exception 'T2 claim numarası: %', v_no; end if;
  insert into public.interfaces (project_id, title, party_a, party_b)
    values (p_tiz, 'F5 test interface', 'Fons Solar', 'TEDAŞ') returning id, interface_no into v_itf, v_no;
  if v_no <> 'ITF-TIZ-0001' then raise exception 'T2 interface numarası: %', v_no; end if;
  insert into public.interfaces (project_id, title, party_a, party_b)
    values (p_tky, 'F5 test interface TKY', 'Fons Solar', 'İşveren') returning id, interface_no into v_itf_tky, v_no;
  if v_no <> 'ITF-TKY-0001' then raise exception 'T2 TKY interface numarası: %', v_no; end if;
  select last_value into v_n from public.project_register_counters where project_id = p_tiz and register_code = 'CHG';
  if v_n is distinct from 2 then raise exception 'T2 CHG sayacı 2 değil: %', v_n; end if;
  checks := checks + 1;

  -- ── T3 · Kısıtlar: claim başka projedeki change'e bağlanamaz; bitiş tarihi olaydan önce olamaz ──
  perform pg_temp.f5_expect_err(format(
    'insert into public.claims (project_id, title, notice_type, event_date, change_id) values (%L, %L, %L, %L, %L)',
    p_tiz, 'F5 yanlış proje', 'cost', '2026-10-01', v_chg_tky), '%claims_change_fk%');
  perform pg_temp.f5_expect_err(format(
    'insert into public.claims (project_id, title, notice_type, event_date, notice_deadline) values (%L, %L, %L, %L, %L)',
    p_tiz, 'F5 tarih', 'time', '2026-10-10', '2026-10-01'), '%claims_deadline_after_event%');
  perform pg_temp.f5_expect_err(format(
    'insert into public.changes (project_id, title, status) values (%L, %L, %L)', p_tiz, 'F5 durum', 'onaylandi'),
    '%changes_status_check%');
  checks := checks + 1;

  -- ── T4 · Durum geçmişi ──
  select count(*) into v_n from public.register_status_history
   where register_code = 'change' and record_id = v_chg1 and old_status is null and new_status = 'identified';
  if v_n <> 1 then raise exception 'T4 change ilk geçmiş satırı: %', v_n; end if;
  update public.changes set status = 'submitted' where id = v_chg1;
  select count(*) into v_n from public.register_status_history
   where register_code = 'change' and record_id = v_chg1 and old_status = 'identified' and new_status = 'submitted';
  if v_n <> 1 then raise exception 'T4 change durum değişikliği geçmişe yazılmadı: %', v_n; end if;
  update public.changes set description = 'yalnızca açıklama' where id = v_chg1;
  select count(*) into v_n from public.register_status_history where register_code = 'change' and record_id = v_chg1;
  if v_n <> 2 then raise exception 'T4 durum dışı güncelleme geçmişe yazıldı: %', v_n; end if;
  select count(*) into v_n from public.register_status_history
   where register_code = 'claim' and record_id = v_clm and new_status = 'notice_due';
  if v_n <> 1 then raise exception 'T4 claim geçmişi: %', v_n; end if;
  select count(*) into v_n from public.register_status_history
   where register_code = 'interface' and record_id = v_itf and new_status = 'open';
  if v_n <> 1 then raise exception 'T4 interface geçmişi: %', v_n; end if;
  checks := checks + 1;

  -- ── T5 · Okuma yetkisi (Karar 6): beklenen satır sayısı changes/claims/interfaces ──
  -- Test satırları: changes TIZ 2 + TKY 1, claims TIZ 1, interfaces TIZ 1 + TKY 1.
  perform pg_temp.f5_as_user(u_admin);
  v_exp := pg_temp.f5_count('changes') || '/' || pg_temp.f5_count('claims') || '/' || pg_temp.f5_count('interfaces');
  if v_exp <> '3/1/2' then raise exception 'T5 admin görünürlüğü: % (beklenen 3/1/2)', v_exp; end if;
  perform pg_temp.f5_as_user(u_pm);
  v_exp := pg_temp.f5_count('changes') || '/' || pg_temp.f5_count('claims') || '/' || pg_temp.f5_count('interfaces');
  if v_exp <> '3/1/2' then raise exception 'T5 PM görünürlüğü: % (beklenen 3/1/2)', v_exp; end if;
  perform pg_temp.f5_as_user(u_muh);
  v_exp := pg_temp.f5_count('changes') || '/' || pg_temp.f5_count('claims') || '/' || pg_temp.f5_count('interfaces');
  if v_exp <> '3/1/0' then raise exception 'T5 muhasebe görünürlüğü: % (beklenen 3/1/0)', v_exp; end if;
  perform pg_temp.f5_as_user(u_ss);
  v_exp := pg_temp.f5_count('changes') || '/' || pg_temp.f5_count('claims') || '/' || pg_temp.f5_count('interfaces');
  if v_exp <> '0/0/1' then raise exception 'T5 şantiye şefi görünürlüğü: % (beklenen 0/0/1, yalnızca TIZ)', v_exp; end if;
  perform pg_temp.f5_as_anon();
  perform pg_temp.f5_expect_err('select count(*) from public.changes', '%permission denied%');
  perform pg_temp.f5_expect_err('select count(*) from public.claims', '%permission denied%');
  perform pg_temp.f5_expect_err('select count(*) from public.interfaces', '%permission denied%');
  checks := checks + 1;

  -- ── T6 · Uygulama kullanıcıları yazamaz (admin ve şantiye şefi; INSERT/UPDATE/DELETE) ──
  perform pg_temp.f5_as_user(u_admin);
  perform pg_temp.f5_expect_err(format('insert into public.changes (project_id, title) values (%L, %L)', p_tiz, 'F5 yazma'), '%permission denied%');
  perform pg_temp.f5_expect_err(format('update public.changes set title = %L where id = %L', 'x', v_chg2), '%permission denied%');
  perform pg_temp.f5_expect_err(format('delete from public.changes where id = %L', v_chg2), '%permission denied%');
  perform pg_temp.f5_expect_err(format('insert into public.claims (project_id, title, notice_type, event_date) values (%L, %L, %L, %L)', p_tiz, 'F5 yazma', 'cost', '2026-10-01'), '%permission denied%');
  perform pg_temp.f5_expect_err(format('update public.claims set title = %L where id = %L', 'x', v_clm), '%permission denied%');
  perform pg_temp.f5_expect_err(format('delete from public.claims where id = %L', v_clm), '%permission denied%');
  perform pg_temp.f5_expect_err(format('insert into public.interfaces (project_id, title, party_a, party_b) values (%L, %L, %L, %L)', p_tiz, 'F5 yazma', 'A', 'B'), '%permission denied%');
  perform pg_temp.f5_expect_err(format('update public.interfaces set title = %L where id = %L', 'x', v_itf), '%permission denied%');
  perform pg_temp.f5_expect_err(format('delete from public.interfaces where id = %L', v_itf), '%permission denied%');
  perform pg_temp.f5_as_user(u_ss);
  perform pg_temp.f5_expect_err(format('insert into public.interfaces (project_id, title, party_a, party_b) values (%L, %L, %L, %L)', p_tiz, 'F5 yazma', 'A', 'B'), '%permission denied%');
  perform pg_temp.f5_expect_err(format('update public.interfaces set title = %L where id = %L', 'x', v_itf), '%permission denied%');
  perform pg_temp.f5_as_user(null);
  select count(*) into v_n from public.changes where title = 'x' or title = 'F5 yazma';
  if v_n <> 0 then raise exception 'T6 yetkisiz yazma kalıcı oldu: %', v_n; end if;
  checks := checks + 1;

  raise exception 'DOGRULAMA SONUCU: OK | F5 | % kontrol grubu | numara CHG/CLM/ITF, durum geçmişi, Karar 6 okuma, uygulamadan yazma yok', checks;
end $$;
