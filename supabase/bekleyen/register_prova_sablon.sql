-- ============================================================================
-- PROVA — 20261020090000_register_okuma_rpc + 20261020090100_register_navigasyon. Canlıda yalnızca:
--   BEGIN; SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '60s'; <bu blok>; ROLLBACK;
-- Blok sonunda hata fırlatır (her şey geri alınır). Öncesi/sonrası parmak izi: REGISTER_parmak_izi.sql.
-- Bu dosya scratchpad şablonundan üretilir; fonksiyon gövdeleri bekleyen dosyanın birebir kopyası (md5 başlıkta).
--   bekleyen dosya md5: @@MIG_MD5@@   navigasyon md5: @@NAV_MD5@@
--
-- PROVA 19.10.2026 13:44 UTC: tek işlem + ROLLBACK, lock_timeout 3s, statement_timeout 60s;
--   "PROVA SONUCU: OK 11 kontrol | matris 4 rol × 10 register: 30 yetkili / 10 yetkisiz | muhasebe doğrudan SELECT ile
--   7 teknik register görüyor, fonksiyonda 0 | şef tedarikçi adı null | RFI geçmişi 2 satır";
--   REGISTER_parmak_izi öncesi (13:42) / sonrası (13:44) birebir. MCP ile koşulan metinde yalnızca yorum satırları
--   çıkarıldı (boyut); fonksiyon gövdeleri ve kontroller bu dosyayla aynı.
--
-- Kurgu veri (işlem içinde, geri alınır): TIZ'de 10 register tablosuna birer kayıt (+ çizim türünde ikinci
-- doküman, güncel revizyon), RFI'da bir durum değişikliği (geçmiş satırı), tedarikçili teknik sunum/malzeme onayı.
-- Roller: admin, proje yöneticisi, TIZ'e bağlı şantiye şefi, muhasebe (profiles'tan ilk hesap).
--
-- Kontroller:
--   K1  Matris: 4 rol × 10 register için authorized, Karar 6 beklentisiyle birebir (beklenti bu dosyada sabit).
--   K2  Yetkili her çağrı TIZ kurgu kaydını döndürür; proje öneki 'TIZ'.
--   K3  Tablo kuralını aşmaz: yetkili her (rol, register) için dönen id kümesi = aynı rolün doğrudan SELECT ile
--       gördüğü id kümesi (RLS) — fazlası yok.
--   K4  Şantiye şefi tedarikçi adını almaz (suppliers RLS) — admin alır.
--   K5  Muhasebe: canlı RLS teknik register'ları doğrudan SELECT'e açıyor (kurgu kayıtlar görünüyor) ama fonksiyon
--       8 teknik register'da authorized=false; Değişiklik/Hak Talebi'nde kayıt döner.
--   K6  Proje erişimi: şantiye şefi başka projede authorized=false; proje id boşsa authorized=false.
--   K7  Geçmiş: admin RFI geçmişinde 2 satır (açılış + durum değişikliği); şef Değişiklik geçmişini doğrudan
--       SELECT ile görebiliyor ama fonksiyon false; muhasebe Arayüz geçmişinde false; Doküman tracked=false.
--   K8  Yetkiler: üç fonksiyonda anon/PUBLIC EXECUTE yok, authenticated var; iki okuma fonksiyonu SECURITY INVOKER.
--   K9  'drawing' yalnızca çizim türündeki dokümanı, 'document' ikisini döndürür.
--   K10 Navigasyon: admin yalnızca sidebar; PM/şef/muhasebe sekme + sidebar; ters SQL sonrası iki tablonun
--       satır kümesi ÖNCE ile birebir.
--   K11 Ters SQL: üç fonksiyon kalkar.
-- Kural 10 ön kontrolü:
--   * Değişkenler c_/u_/n_/s_/j_/r_/i_/b_ önekli; geçici tablolar _beklenti(rol, reg, izin), _sonuc(rol, reg, cikti);
--     sorgularda x/y/z takma adları; değişken adlarıyla çakışmıyor.
--   * Karşılaştırmalar boolean ve jsonb ile; metin biçimine bağlı değil (authorized jsonb boolean → ::boolean).
--   * Her çağrı ayrı ifadede; sonuçlar ayrı ifadede okunur. Fixture yazımları ayrı ifadelerde, okumalar sonra.
--   * NOT NULL kolonlar 19.10.2026'da canlıdan okundu; numaralar tetikleyiciyle atanır (kolon verilmez).
-- ============================================================================
do $prova$
declare
  c_tiz constant text := 'test-izmir-ges-2026';
  c_diger text;
  u_admin uuid; u_pm uuid; u_ss uuid; u_muh uuid;
  i_sup uuid; i_doc uuid; i_drw uuid; i_rfi uuid; i_chg uuid; i_itf uuid;
  r_x record; r_y record;
  j_out jsonb;
  n_ok int := 0; n_say int;
  s_nav_once text; s_nav_sonra text;
  b_vis boolean;
begin
  create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    reset role;
    perform set_config('request.jwt.claims',
      case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    if p_uid is not null then set local role authenticated; end if;
  end $f$;
  create or replace function pg_temp.cagir(p_uid uuid, p_sql text) returns jsonb language plpgsql as $f$
  declare v_out jsonb;
  begin
    perform pg_temp.as_user(p_uid);
    execute p_sql into v_out;
    perform pg_temp.as_user(null);
    return v_out;
  end $f$;

  select x.id into u_admin from profiles x where x.role_key = 'admin' order by x.id limit 1;
  select x.id into u_pm    from profiles x where x.role_key = 'proje_yoneticisi' order by x.id limit 1;
  select x.id into u_ss    from profiles x where x.role_key = 'santiye_sefi' and x.project_id = c_tiz order by x.id limit 1;
  select x.id into u_muh   from profiles x where x.role_key = 'muhasebe' order by x.id limit 1;
  select x.id into c_diger from projects x where x.id <> c_tiz order by x.id limit 1;
  select x.id into i_sup   from suppliers x order by x.id limit 1;
  if u_admin is null or u_pm is null or u_ss is null or u_muh is null or c_diger is null or i_sup is null then
    raise exception 'ön koşul: test kullanıcıları/proje/tedarikçi bulunamadı';
  end if;
  if (pg_temp.cagir(u_ss, format('select to_jsonb(has_project_access(%L))', c_diger)))::boolean then
    raise exception 'ön koşul: şantiye şefinin % projesine erişimi var (K6 anlamsız)', c_diger;
  end if;

  -- Navigasyon ÖNCE
  select md5(coalesce(string_agg(x.role_key || ':' || x.tab_key || ':' || x.order_index, '|' order by x.role_key, x.tab_key), ''))
       || '/' || (select md5(coalesce(string_agg(y.role_key || ':' || y.item_key || ':' || y.order_index, '|' order by y.role_key, y.item_key), ''))
                  from role_sidebar_items y)
    into s_nav_once from role_allowed_tabs x;

  -- ══ kurgu veri (postgres olarak) ══
  insert into documents (project_id, title, document_type, discipline) values (c_tiz, 'PROVA-REG doküman', 'specification', null)
    returning id into i_doc;
  insert into documents (project_id, title, document_type, discipline) values (c_tiz, 'PROVA-REG çizim', 'drawing', null)
    returning id into i_drw;
  insert into drawings (project_id, document_id) values (c_tiz, i_drw);
  insert into document_revisions (project_id, document_id, revision_no, revision_status, is_current)
    values (c_tiz, i_doc, '00', 'ifr', true);
  insert into rfis (project_id, subject, question) values (c_tiz, 'PROVA-REG RFI', 'Soru?') returning id into i_rfi;
  update rfis set status = 'under_review' where id = i_rfi;
  insert into decisions (project_id, title, decision_text) values (c_tiz, 'PROVA-REG karar', 'Metin');
  insert into project_actions (project_id, title) values (c_tiz, 'PROVA-REG aksiyon');
  insert into technical_submittals (project_id, title, supplier_id) values (c_tiz, 'PROVA-REG sunum', i_sup);
  insert into material_approvals (project_id, material_name, supplier_id) values (c_tiz, 'PROVA-REG malzeme', i_sup);
  insert into changes (project_id, title, cost_estimate) values (c_tiz, 'PROVA-REG değişiklik', 1000) returning id into i_chg;
  insert into claims (project_id, title, notice_type, event_date) values (c_tiz, 'PROVA-REG hak talebi', 'time', current_date);
  insert into interfaces (project_id, title, party_a, party_b) values (c_tiz, 'PROVA-REG arayüz', 'Mekanik', 'Elektrik')
    returning id into i_itf;

  -- ══ kurulum: bekleyen dosyanın gövdesi birebir ══
@@MIGRATION@@
  -- ══ kurulum sonu ══

  create temp table _rol (rol text, uid uuid) on commit drop;
  insert into _rol values ('admin', u_admin), ('pm', u_pm), ('ss', u_ss), ('muh', u_muh);
  create temp table _reg (reg text, tablo text) on commit drop;
  insert into _reg values ('document', 'documents'), ('drawing', 'documents'), ('rfi', 'rfis'), ('decision', 'decisions'),
    ('action', 'project_actions'), ('submittal', 'technical_submittals'), ('material_approval', 'material_approvals'),
    ('change', 'changes'), ('claim', 'claims'), ('interface', 'interfaces');
  -- Karar 6 "G" beklentisi (fonksiyondan bağımsız, elle yazıldı)
  create temp table _beklenti (rol text, reg text, izin boolean) on commit drop;
  insert into _beklenti select x.rol, y.reg,
    case when y.reg in ('change', 'claim') then x.rol in ('admin', 'pm', 'muh') else x.rol in ('admin', 'pm', 'ss') end
    from _rol x cross join _reg y;
  create temp table _sonuc (rol text, reg text, cikti jsonb) on commit drop;

  for r_x in select x.rol, x.uid from _rol x loop
    for r_y in select y.reg from _reg y loop
      insert into _sonuc values (r_x.rol, r_y.reg,
        pg_temp.cagir(r_x.uid, format('select get_register_list(%L, %L)', c_tiz, r_y.reg)));
    end loop;
  end loop;

  -- K1
  if exists (select 1 from _sonuc x join _beklenti y on y.rol = x.rol and y.reg = x.reg
              where (x.cikti->>'authorized')::boolean is distinct from y.izin) then
    raise exception 'K1 matris farklı: %', (select string_agg(x.rol || '/' || x.reg || '=' || (x.cikti->>'authorized'), ', ')
      from _sonuc x join _beklenti y on y.rol = x.rol and y.reg = x.reg where (x.cikti->>'authorized')::boolean is distinct from y.izin);
  end if;
  if exists (select 1 from _sonuc x where (x.cikti->>'authorized')::boolean is not true and x.cikti <> '{"authorized": false}'::jsonb) then
    raise exception 'K1 yetkisiz çağrı veri taşıyor'; end if;
  n_ok := n_ok + 1;

  -- K2
  if exists (select 1 from _sonuc x where (x.cikti->>'authorized')::boolean
              and (x.cikti->>'prefix' is distinct from 'TIZ'
                   or not exists (select 1 from jsonb_array_elements(x.cikti->'rows') z where z->>'title' like 'PROVA-REG%')
                   or exists (select 1 from jsonb_array_elements(x.cikti->'rows') z where z->>'no' is null))) then
    raise exception 'K2 kurgu kayıt/önek eksik'; end if;
  n_ok := n_ok + 1;

  -- K3 dönen id kümesi = aynı rolün doğrudan SELECT ile gördüğü id kümesi
  for r_x in select x.rol, x.uid, y.reg, y.tablo, s.cikti from _rol x
               join _sonuc s on s.rol = x.rol join _reg y on y.reg = s.reg
              where (s.cikti->>'authorized')::boolean loop
    j_out := pg_temp.cagir(r_x.uid, format(
      'select coalesce(jsonb_agg(t.id order by t.id), ''[]''::jsonb) from public.%I t where t.project_id = %L %s',
      r_x.tablo, c_tiz, case when r_x.reg = 'drawing' then 'and t.document_type = ''drawing''' else '' end));
    if j_out is distinct from (select coalesce(jsonb_agg(z->'id' order by z->>'id'), '[]'::jsonb)
                                 from jsonb_array_elements(r_x.cikti->'rows') z) then
      raise exception 'K3 % / % fonksiyon ≠ doğrudan SELECT: % vs %', r_x.rol, r_x.reg, r_x.cikti->'rows', j_out;
    end if;
  end loop;
  n_ok := n_ok + 1;

  -- K4
  for r_y in select y.reg from _reg y where y.reg in ('submittal', 'material_approval') loop
    if exists (select 1 from _sonuc x, jsonb_array_elements(x.cikti->'rows') z
                where x.rol = 'ss' and x.reg = r_y.reg and z->>'supplier_name' is not null) then
      raise exception 'K4 şef % tedarikçi adını aldı', r_y.reg; end if;
    if not exists (select 1 from _sonuc x, jsonb_array_elements(x.cikti->'rows') z
                    where x.rol = 'admin' and x.reg = r_y.reg and z->>'supplier_name' is not null) then
      raise exception 'K4 admin % tedarikçi adını almadı', r_y.reg; end if;
  end loop;
  n_ok := n_ok + 1;

  -- K5
  n_say := 0;
  for r_y in select y.reg, y.tablo from _reg y where y.reg not in ('change', 'claim', 'interface') loop
    j_out := pg_temp.cagir(u_muh, format('select to_jsonb(count(*)) from public.%I t where t.project_id = %L', r_y.tablo, c_tiz));
    if (j_out)::int > 0 then n_say := n_say + 1; end if;
  end loop;
  if n_say <> 7 then raise exception 'K5 beklenen: muhasebe 7 teknik register''ı doğrudan SELECT ile görüyor; görülen %', n_say; end if;
  if exists (select 1 from _sonuc x where x.rol = 'muh' and x.reg not in ('change', 'claim')
              and (x.cikti->>'authorized')::boolean) then
    raise exception 'K5 muhasebe teknik register aldı'; end if;
  if (select count(*) from _sonuc x where x.rol = 'muh' and x.reg in ('change', 'claim')
         and jsonb_array_length(x.cikti->'rows') >= 1) <> 2 then
    raise exception 'K5 muhasebe Değişiklik/Hak Talebi almadı'; end if;
  n_ok := n_ok + 1;

  -- K6
  if pg_temp.cagir(u_ss, format('select get_register_list(%L, %L)', c_diger, 'rfi')) <> '{"authorized": false}'::jsonb
     or pg_temp.cagir(u_admin, 'select get_register_list(null, ''rfi'')') <> '{"authorized": false}'::jsonb
     or pg_temp.cagir(u_admin, format('select get_register_list(%L, %L)', c_tiz, 'risk')) <> '{"authorized": false}'::jsonb then
    raise exception 'K6 proje erişimi/bilinmeyen register kontrolü'; end if;
  n_ok := n_ok + 1;

  -- K7
  j_out := pg_temp.cagir(u_admin, format('select get_register_status_history(%L, %L)', 'rfi', i_rfi));
  if (j_out->>'tracked')::boolean is not true or jsonb_array_length(j_out->'history') <> 2
     or j_out->'history'->1->>'new_status' <> 'under_review' then
    raise exception 'K7 admin RFI geçmişi: %', j_out; end if;
  j_out := pg_temp.cagir(u_ss, format('select to_jsonb(count(*)) from register_status_history h where h.record_id = %L', i_chg));
  if (j_out)::int < 1 then raise exception 'K7 ön koşul: şef değişiklik geçmişini doğrudan göremiyor (beklenen: görüyor)'; end if;
  if pg_temp.cagir(u_ss, format('select get_register_status_history(%L, %L)', 'change', i_chg)) <> '{"authorized": false}'::jsonb
     or pg_temp.cagir(u_muh, format('select get_register_status_history(%L, %L)', 'interface', i_itf)) <> '{"authorized": false}'::jsonb then
    raise exception 'K7 şef/muhasebe geçmiş süzgeci'; end if;
  j_out := pg_temp.cagir(u_ss, format('select get_register_status_history(%L, %L)', 'document', i_doc));
  if (j_out->>'tracked')::boolean is not false then raise exception 'K7 doküman tracked: %', j_out; end if;
  n_ok := n_ok + 1;

  -- K8
  if exists (select 1 from (values ('public.register_view_allowed(text,text)'), ('public.get_register_list(text,text)'),
                                   ('public.get_register_status_history(text,uuid)')) as x(f)
              where has_function_privilege('anon', x.f, 'EXECUTE')
                 or not has_function_privilege('authenticated', x.f, 'EXECUTE')
                 or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                             where p.oid = x.f::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')) then
    raise exception 'K8 EXECUTE yetkileri'; end if;
  if exists (select 1 from pg_proc p where p.oid in ('public.get_register_list(text,text)'::regprocedure,
               'public.get_register_status_history(text,uuid)'::regprocedure) and p.prosecdef) then
    raise exception 'K8 SECURITY DEFINER olmamalı'; end if;
  n_ok := n_ok + 1;

  -- K9
  if (select jsonb_array_length(x.cikti->'rows') from _sonuc x where x.rol = 'admin' and x.reg = 'drawing') <> 1
     or (select x.cikti->'rows'->0->>'id' from _sonuc x where x.rol = 'admin' and x.reg = 'drawing') <> i_drw::text
     or (select jsonb_array_length(x.cikti->'rows') from _sonuc x where x.rol = 'admin' and x.reg = 'document') <> 2
     or not exists (select 1 from _sonuc x, jsonb_array_elements(x.cikti->'rows') z
                     where x.rol = 'admin' and x.reg = 'document' and z->>'revision_status' = 'ifr') then
    raise exception 'K9 çizim süzgeci/güncel revizyon'; end if;
  n_ok := n_ok + 1;

  -- K10 navigasyon
@@NAVIGATION@@
  if (select count(*) from role_sidebar_items x where x.item_key = 'register') <> 4
     or (select string_agg(x.role_key, ',' order by x.role_key) from role_allowed_tabs x where x.tab_key = 'register')
        <> 'muhasebe,proje_yoneticisi,santiye_sefi' then
    raise exception 'K10 navigasyon satırları'; end if;
@@NAVIGATION_DOWN@@
  select md5(coalesce(string_agg(x.role_key || ':' || x.tab_key || ':' || x.order_index, '|' order by x.role_key, x.tab_key), ''))
       || '/' || (select md5(coalesce(string_agg(y.role_key || ':' || y.item_key || ':' || y.order_index, '|' order by y.role_key, y.item_key), ''))
                  from role_sidebar_items y)
    into s_nav_sonra from role_allowed_tabs x;
  if s_nav_sonra <> s_nav_once then raise exception 'K10 navigasyon ters SQL sonrası farklı'; end if;
  n_ok := n_ok + 1;

  -- K11 ters SQL
@@MIGRATION_DOWN@@
  if to_regprocedure('public.get_register_list(text,text)') is not null
     or to_regprocedure('public.get_register_status_history(text,uuid)') is not null
     or to_regprocedure('public.register_view_allowed(text,text)') is not null then
    raise exception 'K11 ters SQL fonksiyonları kaldırmadı'; end if;
  n_ok := n_ok + 1;

  raise exception 'PROVA SONUCU: OK % kontrol | matris 4 rol × 10 register: % yetkili / % yetkisiz | muhasebe doğrudan SELECT ile % teknik register görüyor, fonksiyonda 0 | şef tedarikçi adı null | RFI geçmişi 2 satır',
    n_ok,
    (select count(*) from _sonuc x where (x.cikti->>'authorized')::boolean),
    (select count(*) from _sonuc x where not (x.cikti->>'authorized')::boolean),
    n_say;
end $prova$;
