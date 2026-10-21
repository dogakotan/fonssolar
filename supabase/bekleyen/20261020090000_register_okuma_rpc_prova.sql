-- ============================================================================
-- PROVA — 20261020090000_register_okuma_rpc + 20261020090100_register_navigasyon. Canlıda yalnızca:
--   BEGIN; SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '60s'; <bu blok>; ROLLBACK;
-- Blok sonunda hata fırlatır (her şey geri alınır). Öncesi/sonrası parmak izi: REGISTER_parmak_izi.sql.
-- Bu dosya scratchpad şablonundan üretilir; fonksiyon gövdeleri bekleyen dosyanın birebir kopyası (md5 başlıkta).
--   bekleyen dosya md5: 7839a774be578cc4a09d4dbc50251214   navigasyon md5: eaf6dd76e6ddb1cc61989eb49f382a9e
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
-- ============================================================================
-- Register ekranları (ilk sürüm, yalnızca okuma) — iki okuma fonksiyonu.
-- BEKLEYEN: canlıya uygulanmadı. Uygulanınca supabase/migrations/'a taşınır.
-- Ters SQL: supabase/rollback/20261020090000_register_okuma_rpc.down.sql
-- Prova:    supabase/bekleyen/20261020090000_register_okuma_rpc_prova.sql
--
-- Tasarım:
--   * SECURITY INVOKER: çağıranın yetkisiyle çalışır, tablo RLS'i aynen geçerli. Fonksiyon tablo kuralının
--     izin vermediği satırı ya da kolonu döndüremez (ör. şantiye şefi suppliers'ı okuyamaz → supplier_name null).
--   * Üstüne Karar 6 görüntüleme ("G") matrisi sabit olarak uygulanır. Canlı RLS bugün daha geniş
--     (muhasebe teknik register'ları okuyabiliyor); ekran Karar 6'ya göre daralır.
--     NOT: B1 (register_permissions, register_can) ve B3 (RLS'in kalıcı daraltılması) uygulanınca
--     register_view_allowed() gövdesi register_can(p_register, 'view') ile değiştirilir (iki okuma fonksiyonu
--     matrisi yalnızca oradan okur); o zaman tek kaynak register_permissions olur.
--   * Dinamik SQL yok; register başına sabit sorgu dalı. 'drawing' doküman dalında document_type süzgeci.
--   * Kişi adları dönmez (profiles_select RLS'i engeller); ön yüz get_profile_names() ile çözer.
--   * Risk bu sürümde yok (Satın Alma › Riskler).
-- Kural 10 ön kontrolü: değişkenler v_ önekli; takma adlar t/d/r/s/w/a/k/h/x; kolon adlarıyla çakışmıyor.
-- Yazma yok. Kolon adları 19.10.2026'da canlıdan okundu (wbs_code, area_code, task_code, task_name, suppliers.name).
-- ============================================================================

create or replace function public.register_view_allowed(p_role text, p_register text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- Karar 6, "G" (görüntüleme) kolonu. B1 gelince register_can(p_register, 'view') ile değişir.
  select case
    when p_register in ('document', 'drawing', 'rfi', 'action', 'decision', 'submittal', 'material_approval', 'interface')
      then coalesce(p_role in ('admin', 'proje_yoneticisi', 'santiye_sefi'), false)
    when p_register in ('change', 'claim')
      then coalesce(p_role in ('admin', 'proje_yoneticisi', 'muhasebe'), false)
    else false
  end;
$$;

create or replace function public.get_register_list(p_project_id text, p_register text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if p_project_id is null or not public.has_project_access(p_project_id) then
    return jsonb_build_object('authorized', false);
  end if;
  if not public.register_view_allowed(public.get_my_role(), p_register) then
    return jsonb_build_object('authorized', false);
  end if;

  if p_register = 'rfi' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.rfi_no, 'title', t.subject, 'status', t.status, 'priority', t.priority,
             'raised_date', t.raised_date, 'due_date', t.due_date, 'answered_date', t.answered_date,
             'discipline', t.responsible_discipline, 'raised_by', t.raised_by, 'assigned_to', t.assigned_to,
             'question', t.question, 'description', t.description, 'response', t.response,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.rfi_no desc), '[]'::jsonb)
      into v_rows
      from public.rfis t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register in ('document', 'drawing') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id, 'no', d.document_no, 'title', d.title, 'status', d.status,
             'document_type', d.document_type, 'discipline', d.discipline, 'drawing_type', s.drawing_type,
             'revision_no', r.revision_no, 'revision_status', r.revision_status, 'issue_date', r.issue_date,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', d.created_by, 'created_at', d.created_at, 'updated_at', d.updated_at)
           order by d.document_no desc), '[]'::jsonb)
      into v_rows
      from public.documents d
      left join public.drawings s on s.document_id = d.id
      left join public.document_revisions r on r.document_id = d.id and r.is_current
      left join public.project_wbs w on w.id = d.wbs_id
      left join public.project_areas a on a.id = d.area_id
      left join public.project_tasks k on k.id = d.task_id
     where d.project_id = p_project_id
       and (p_register = 'document' or d.document_type = 'drawing');

  elsif p_register = 'decision' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.decision_no, 'title', t.title, 'status', t.status,
             'decision_date', t.decision_date, 'decision_maker', t.decision_maker, 'decision_text', t.decision_text,
             'rfi_id', t.rfi_id, 'risk_id', t.risk_id,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.decision_no desc), '[]'::jsonb)
      into v_rows
      from public.decisions t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'action' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.action_no, 'title', t.title, 'status', t.status, 'priority', t.priority,
             'responsible', t.responsible, 'assigned_to', t.assigned_to, 'due_date', t.due_date,
             'completed_at', t.completed_at, 'source_type', t.source_type, 'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.action_no desc), '[]'::jsonb)
      into v_rows
      from public.project_actions t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'submittal' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.submittal_no, 'title', t.title, 'status', t.status, 'revision', t.revision,
             'discipline', t.discipline, 'supplier_name', s.name, 'reviewer_id', t.reviewer_id,
             'submitted_date', t.submitted_date, 'due_date', t.due_date, 'reviewed_date', t.reviewed_date,
             'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.submittal_no desc), '[]'::jsonb)
      into v_rows
      from public.technical_submittals t
      left join public.suppliers s on s.id = t.supplier_id
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'material_approval' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.approval_no, 'title', t.material_name, 'status', t.status, 'revision', t.revision,
             'manufacturer', t.manufacturer, 'model', t.model, 'supplier_name', s.name,
             'submitted_date', t.submitted_date, 'approved_date', t.approved_date,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.approval_no desc), '[]'::jsonb)
      into v_rows
      from public.material_approvals t
      left join public.suppliers s on s.id = t.supplier_id
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'change' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.change_no, 'title', t.title, 'status', t.status, 'priority', t.priority,
             'record_state', t.record_state, 'origin', t.origin,
             'cost_estimate', t.cost_estimate, 'currency', t.currency, 'time_impact_days', t.time_impact_days,
             'contract_ref', t.contract_ref, 'assigned_to', t.assigned_to, 'due_date', t.due_date,
             'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.change_no desc), '[]'::jsonb)
      into v_rows
      from public.changes t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'claim' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.claim_no, 'title', t.title, 'status', t.status, 'record_state', t.record_state,
             'notice_type', t.notice_type, 'event_date', t.event_date, 'notice_deadline', t.notice_deadline,
             'notice_sent_at', t.notice_sent_at, 'amount_claimed', t.amount_claimed, 'currency', t.currency,
             'time_claimed_days', t.time_claimed_days, 'contract_ref', t.contract_ref, 'change_id', t.change_id,
             'assigned_to', t.assigned_to, 'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.claim_no desc), '[]'::jsonb)
      into v_rows
      from public.claims t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;

  elsif p_register = 'interface' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'no', t.interface_no, 'title', t.title, 'status', t.status, 'priority', t.priority,
             'record_state', t.record_state, 'interface_type', t.interface_type,
             'party_a', t.party_a, 'party_b', t.party_b, 'assigned_to', t.assigned_to, 'due_date', t.due_date,
             'description', t.description,
             'wbs_code', w.wbs_code, 'wbs_name', w.name, 'area_code', a.area_code, 'area_name', a.name,
             'task_code', k.task_code, 'task_name', k.task_name,
             'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
           order by t.interface_no desc), '[]'::jsonb)
      into v_rows
      from public.interfaces t
      left join public.project_wbs w on w.id = t.wbs_id
      left join public.project_areas a on a.id = t.area_id
      left join public.project_tasks k on k.id = t.task_id
     where t.project_id = p_project_id;
  end if;

  return jsonb_build_object(
    'authorized', true,
    'register', p_register,
    'prefix', (select x.prefix from public.project_register_settings x where x.project_id = p_project_id),
    'rows', coalesce(v_rows, '[]'::jsonb));
end $$;

-- Yan panel: durum geçmişi. register_status_history'nin SELECT kuralı yalnızca proje erişimi (şef change/claim
-- geçmişini doğrudan okuyabiliyor); bu fonksiyon önce kaydın kendisini ana tablodan aynı oturumla okur, okuyamazsa
-- ya da matris izin vermezse geçmiş dönmez. Durum geçmişi tetikleyicisi yalnızca rfi, decision, action, change,
-- claim, interface'te var; document, submittal, material_approval için 'tracked': false döner.
create or replace function public.get_register_status_history(p_register text, p_record_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_proje   text;
  v_liste   jsonb;
begin
  if not public.register_view_allowed(public.get_my_role(), p_register) then
    return jsonb_build_object('authorized', false);
  end if;
  if p_register not in ('rfi', 'decision', 'action', 'change', 'claim', 'interface') then
    return jsonb_build_object('authorized', true, 'tracked', false, 'history', '[]'::jsonb);
  end if;

  v_proje := case p_register
    when 'rfi'       then (select t.project_id from public.rfis t where t.id = p_record_id)
    when 'decision'  then (select t.project_id from public.decisions t where t.id = p_record_id)
    when 'action'    then (select t.project_id from public.project_actions t where t.id = p_record_id)
    when 'change'    then (select t.project_id from public.changes t where t.id = p_record_id)
    when 'claim'     then (select t.project_id from public.claims t where t.id = p_record_id)
    when 'interface' then (select t.project_id from public.interfaces t where t.id = p_record_id)
  end;
  if v_proje is null or not public.has_project_access(v_proje) then
    return jsonb_build_object('authorized', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'old_status', h.old_status, 'new_status', h.new_status,
           'changed_by', h.changed_by, 'changed_at', h.changed_at)
           order by h.changed_at, (h.old_status is not null), h.id), '[]'::jsonb)  -- aynı anda yazılan açılış satırı önce
    into v_liste
    from public.register_status_history h
   where h.record_id = p_record_id and h.register_code = p_register;

  return jsonb_build_object('authorized', true, 'tracked', true, 'history', v_liste);
end $$;

revoke all on function public.register_view_allowed(text, text) from public, anon;
revoke all on function public.get_register_list(text, text) from public, anon;
revoke all on function public.get_register_status_history(text, uuid) from public, anon;
grant execute on function public.register_view_allowed(text, text) to authenticated;
grant execute on function public.get_register_list(text, text) to authenticated;
grant execute on function public.get_register_status_history(text, uuid) to authenticated;

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
-- ============================================================================
-- Register sekmesi — navigasyon verisi (veri migration'ı). BEKLEYEN: canlıya uygulanmadı.
-- Ters SQL: supabase/rollback/20261020090100_register_navigasyon.down.sql
--
-- Dört rolün hepsi Register'da en az bir alt sekme görür (Karar 6, "G"):
--   admin, proje_yoneticisi: 10 register (9 alt sekme; çizim Doküman'da süzgeç)
--   santiye_sefi: Doküman/Çizim, RFI, Karar, Aksiyon, Teknik Sunum, Malzeme Onayı, Arayüz
--   muhasebe: Değişiklik, Hak Talebi
-- admin roles.tabs_unrestricted = true → role_allowed_tabs satırı gerekmez; yalnızca sidebar satırı.
-- order_index rol başına sıradaki boş değer (UNIQUE (role_key, order_index)). Sidebar'daki görünüm sırası
-- Sidebar.jsx'teki öğe dizisinden gelir; order_index yalnızca tekillik için.
-- Ön koşul: 20261020090000_register_okuma_rpc ve ön yüz (TabRegister) aynı anda yayında olmalı; aksi halde
-- menüde görünen sekme "Veri yüklenemedi" gösterir.
-- ============================================================================
insert into public.role_allowed_tabs (role_key, tab_key, order_index)
select x.role_key, 'register',
       coalesce((select max(t.order_index) from public.role_allowed_tabs t where t.role_key = x.role_key), -1) + 1
  from (values ('proje_yoneticisi'), ('santiye_sefi'), ('muhasebe')) as x(role_key)
on conflict (role_key, tab_key) do nothing;

insert into public.role_sidebar_items (role_key, item_key, order_index)
select x.role_key, 'register',
       coalesce((select max(s.order_index) from public.role_sidebar_items s where s.role_key = x.role_key), -1) + 1
  from (values ('admin'), ('proje_yoneticisi'), ('santiye_sefi'), ('muhasebe')) as x(role_key)
on conflict (role_key, item_key) do nothing;

  if (select count(*) from role_sidebar_items x where x.item_key = 'register') <> 4
     or (select string_agg(x.role_key, ',' order by x.role_key) from role_allowed_tabs x where x.tab_key = 'register')
        <> 'muhasebe,proje_yoneticisi,santiye_sefi' then
    raise exception 'K10 navigasyon satırları'; end if;
-- Ters SQL — 20261020090100_register_navigasyon. Yalnızca bu migration'ın eklediği 'register' satırlarını siler;
-- diğer navigasyon satırlarına ve order_index değerlerine dokunmaz.
delete from public.role_sidebar_items where item_key = 'register';
delete from public.role_allowed_tabs where tab_key = 'register';

  select md5(coalesce(string_agg(x.role_key || ':' || x.tab_key || ':' || x.order_index, '|' order by x.role_key, x.tab_key), ''))
       || '/' || (select md5(coalesce(string_agg(y.role_key || ':' || y.item_key || ':' || y.order_index, '|' order by y.role_key, y.item_key), ''))
                  from role_sidebar_items y)
    into s_nav_sonra from role_allowed_tabs x;
  if s_nav_sonra <> s_nav_once then raise exception 'K10 navigasyon ters SQL sonrası farklı'; end if;
  n_ok := n_ok + 1;

  -- K11 ters SQL
-- Ters SQL — 20261020090000_register_okuma_rpc. Üç fonksiyon yeni; önceki hali yok, yalnızca kaldırılır.
-- Başka nesne bu fonksiyonlara bağlı değil (ön yüz çağırır; ters SQL'den önce ön yüzün Register sekmesi
-- kapatılmalı: 20261020090100_register_navigasyon.down.sql).
drop function if exists public.get_register_status_history(text, uuid);
drop function if exists public.get_register_list(text, text);
drop function if exists public.register_view_allowed(text, text);

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
