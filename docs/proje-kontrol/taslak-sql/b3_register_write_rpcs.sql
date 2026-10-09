-- ============================================================================
-- FAZ B · B3 — register yazma RPC'leri + G-01'in kalıcı kurala dönüşmesi — TASLAK (UYGULANMADI) · 07.10.2026
-- Plan: docs/proje-kontrol/faz-b-migration-plani.md · Tasarım: tasarim.md §4.1, §4.3, §4.4
-- Doğrulama: taslak-sql/b3_dogrulama.sql · Anlık görüntü: yedek-faz-b-07-10.sql §B3 (düşen/değişen policy'ler)
-- Test: tests/proje-kontrol-b3-yazma.spec.js (+ proje-kontrol-uyum.spec.js'teki 3 fixme bu paketle açılır)
-- Bağımlılık: B1 (register_permissions, register_can, register_raise), B2 (register_audit — reason için).
--
-- İçerik:
--   A1 Ortak kolonlar (tablolar boş; yalnızca ekleme): record_state, source, approved_by, approved_at,
--      rejected_reason (documents, rfis, project_actions, decisions, technical_submittals, material_approvals);
--      eksik created_by (rfis, technical_submittals, material_approvals);
--      project_register_settings.four_eyes_enabled (Karar 10 AÇIK; varsayılan true).
--   A2 G-01 kalıcı: doğrudan yazma policy'leri düşer; SELECT policy'leri register_can(...,'view') ile daralır
--      (muhasebe 4.3 matrisinde bu register'ları görmüyor → artık okumaz). authenticated zaten yalnızca SELECT.
--   A3 İç yardımcılar (authenticated çalıştıramaz).
--   A4 RPC'ler: save_register_record, submit/approve/reject/reopen_register_record, set_register_status,
--      delete_register_record, link_register_records, unlink_register_records.
--
-- Kurallar (tasarım 4.4):
--   * Kimlik parametreden gelmez (auth.uid()); numara (*_no), record_state, source, created_by, approved_*
--     dışarıdan kabul edilmez → validation.
--   * Yalnızca draft ve rejected kayıt düzenlenir (rejected düzenlenince draft'a döner). Doküman istisna:
--     oluşturulunca approved açılır, void olana kadar kimlik alanları düzenlenebilir (türü değiştirmek,
--     bağlı çizim varsa FK ile reddedilir).
--   * Dört göz: decision (ileride risk, change, claim) kaydını oluşturan kişi onaylayamaz; admin dahil.
--     project_register_settings.four_eyes_enabled = false ise kapalı.
--   * İş durumu (status) yalnızca approved kayıtta ve register_status_transitions'taki geçişlerle değişir.
--   * Hatalar: forbidden, not_found, invalid_state, validation (detail JSON). Başka projenin kaydı not_found.
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A0 · Ön koşul: register tabloları boş (NOT NULL varsayılanlı kolon eklemesi için şart değil ama
--        record_state'in geriye dönük anlamı olmadığından boş olması beklenir) ──
do $$
declare n bigint;
begin
  select (select count(*) from public.documents) + (select count(*) from public.rfis)
       + (select count(*) from public.project_actions) + (select count(*) from public.decisions)
       + (select count(*) from public.technical_submittals) + (select count(*) from public.material_approvals)
    into n;
  if n > 0 then
    raise exception 'B3 durduruldu: register tablolarında % satır var; record_state geri doldurma planı gerekir', n;
  end if;
end $$;

-- ── A1 · Ortak kolonlar ──
alter table public.documents
  add column record_state text not null default 'draft',
  add column source text not null default 'manual',
  add column approved_by uuid references public.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column rejected_reason text,
  add constraint documents_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  add constraint documents_source_check check (source in ('manual','ai','import'));
alter table public.rfis
  add column record_state text not null default 'draft',
  add column source text not null default 'manual',
  add column created_by uuid references public.profiles(id) on delete set null,
  add column approved_by uuid references public.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column rejected_reason text,
  add constraint rfis_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  add constraint rfis_source_check check (source in ('manual','ai','import'));
alter table public.project_actions
  add column record_state text not null default 'draft',
  add column source text not null default 'manual',
  add column approved_by uuid references public.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column rejected_reason text,
  add constraint project_actions_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  add constraint project_actions_source_check check (source in ('manual','ai','import'));
alter table public.decisions
  add column record_state text not null default 'draft',
  add column source text not null default 'manual',
  add column approved_by uuid references public.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column rejected_reason text,
  add constraint decisions_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  add constraint decisions_source_check check (source in ('manual','ai','import'));
alter table public.technical_submittals
  add column record_state text not null default 'draft',
  add column source text not null default 'manual',
  add column created_by uuid references public.profiles(id) on delete set null,
  add column approved_by uuid references public.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column rejected_reason text,
  add constraint technical_submittals_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  add constraint technical_submittals_source_check check (source in ('manual','ai','import'));
alter table public.material_approvals
  add column record_state text not null default 'draft',
  add column source text not null default 'manual',
  add column created_by uuid references public.profiles(id) on delete set null,
  add column approved_by uuid references public.profiles(id) on delete set null,
  add column approved_at timestamptz,
  add column rejected_reason text,
  add constraint material_approvals_record_state_check check (record_state in ('draft','pending_approval','approved','rejected')),
  add constraint material_approvals_source_check check (source in ('manual','ai','import'));

create index idx_documents_approved_by on public.documents (approved_by) where approved_by is not null;
create index idx_rfis_approved_by on public.rfis (approved_by) where approved_by is not null;
create index idx_rfis_created_by on public.rfis (created_by) where created_by is not null;
create index idx_project_actions_approved_by on public.project_actions (approved_by) where approved_by is not null;
create index idx_decisions_approved_by on public.decisions (approved_by) where approved_by is not null;
create index idx_technical_submittals_approved_by on public.technical_submittals (approved_by) where approved_by is not null;
create index idx_technical_submittals_created_by on public.technical_submittals (created_by) where created_by is not null;
create index idx_material_approvals_approved_by on public.material_approvals (approved_by) where approved_by is not null;
create index idx_material_approvals_created_by on public.material_approvals (created_by) where created_by is not null;
-- Onay kutusu ve sayaçlar için
create index idx_rfis_pending on public.rfis (project_id) where record_state = 'pending_approval';
create index idx_project_actions_pending on public.project_actions (project_id) where record_state = 'pending_approval';
create index idx_decisions_pending on public.decisions (project_id) where record_state = 'pending_approval';
create index idx_technical_submittals_pending on public.technical_submittals (project_id) where record_state = 'pending_approval';
create index idx_material_approvals_pending on public.material_approvals (project_id) where record_state = 'pending_approval';

alter table public.project_register_settings
  add column four_eyes_enabled boolean not null default true;
comment on column public.project_register_settings.four_eyes_enabled is
  'Karar 10 (AÇIK): kritik register''larda (decision; ileride risk, change, claim) onaylayan oluşturandan farklı olmalı. false = proje bazında kapalı.';

-- ── A2 · G-01 kalıcı kural: doğrudan yazma policy'leri düşer, okuma register yetkisine bağlanır ──
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
drop policy if exists documents_delete on public.documents;
drop policy if exists drawings_insert on public.drawings;
drop policy if exists drawings_update on public.drawings;
drop policy if exists drawings_delete on public.drawings;
drop policy if exists rfis_insert on public.rfis;
drop policy if exists rfis_update on public.rfis;
drop policy if exists rfis_delete on public.rfis;
drop policy if exists project_actions_insert on public.project_actions;
drop policy if exists project_actions_update on public.project_actions;
drop policy if exists project_actions_delete on public.project_actions;
drop policy if exists decisions_insert on public.decisions;
drop policy if exists decisions_update on public.decisions;
drop policy if exists decisions_delete on public.decisions;
drop policy if exists technical_submittals_insert on public.technical_submittals;
drop policy if exists technical_submittals_update on public.technical_submittals;
drop policy if exists technical_submittals_delete on public.technical_submittals;
drop policy if exists material_approvals_insert on public.material_approvals;
drop policy if exists material_approvals_update on public.material_approvals;
drop policy if exists material_approvals_delete on public.material_approvals;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('document', 'view'));
drop policy if exists document_revisions_select on public.document_revisions;
create policy document_revisions_select on public.document_revisions for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('document', 'view'));
drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('drawing', 'view'));
drop policy if exists rfis_select on public.rfis;
create policy rfis_select on public.rfis for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('rfi', 'view'));
drop policy if exists project_actions_select on public.project_actions;
create policy project_actions_select on public.project_actions for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('action', 'view'));
drop policy if exists decisions_select on public.decisions;
create policy decisions_select on public.decisions for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('decision', 'view'));
drop policy if exists technical_submittals_select on public.technical_submittals;
create policy technical_submittals_select on public.technical_submittals for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('submittal', 'view'));
drop policy if exists material_approvals_select on public.material_approvals;
create policy material_approvals_select on public.material_approvals for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can('material_approval', 'view'));
drop policy if exists register_status_history_select on public.register_status_history;
create policy register_status_history_select on public.register_status_history for select to authenticated
  using (public.user_has_project_access(project_id) and public.register_can(register_code, 'view'));

-- Yazma yetkisi yalnızca service_role'de kalır (G-01 ile authenticated'dan alınmıştı; tekrar teyit)
revoke insert, update, delete, truncate, references, trigger on
  public.documents, public.document_revisions, public.drawings, public.rfis, public.project_actions,
  public.decisions, public.technical_submittals, public.material_approvals, public.register_status_history
  from authenticated, anon;

-- ── A3 · İç yardımcılar ──
create function public.register_meta(p_type text, out tbl text, out no_col text, out has_state boolean)
language plpgsql
immutable
set search_path = public
as $$
begin
  case p_type
    when 'document'          then tbl := 'documents';            no_col := 'document_no';  has_state := true;
    when 'drawing'           then tbl := 'drawings';             no_col := null;           has_state := false;
    when 'rfi'               then tbl := 'rfis';                 no_col := 'rfi_no';       has_state := true;
    when 'action'            then tbl := 'project_actions';      no_col := 'action_no';    has_state := true;
    when 'decision'          then tbl := 'decisions';            no_col := 'decision_no';  has_state := true;
    when 'submittal'         then tbl := 'technical_submittals'; no_col := 'submittal_no'; has_state := true;
    when 'material_approval' then tbl := 'material_approvals';   no_col := 'approval_no';  has_state := true;
    else
      raise exception using message = 'validation', hint = 'Bilinmeyen register türü',
        detail = jsonb_build_object('register_type', p_type)::text, errcode = 'P0001';
  end case;
end $$;

-- Kullanıcının p_data ile yazabileceği alanlar (beyaz liste). Numara, durum ve kimlik alanları yok.
create function public.register_editable_fields(p_type text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_type
    when 'document' then array['title','document_type','discipline','wbs_id','area_id','task_id']
    when 'drawing'  then array['document_id','drawing_type']
    when 'rfi'      then array['subject','question','description','priority','assigned_to','responsible_discipline',
                               'raised_date','due_date','wbs_id','area_id','task_id','drawing_id','document_id','decision_id']
    when 'action'   then array['title','description','priority','assigned_to','responsible','due_date','source_type',
                               'wbs_id','area_id','task_id','decision_id','rfi_id','risk_id']
    when 'decision' then array['title','decision_text','decision_date','decision_maker','wbs_id','area_id','task_id','rfi_id','risk_id']
    when 'submittal' then array['title','description','discipline','supplier_id','due_date','revision',
                                'wbs_id','area_id','task_id','document_id']
    when 'material_approval' then array['material_name','manufacturer','model','supplier_id','revision','technical_submittal_id',
                                        'wbs_id','area_id','task_id','document_id']
    else array[]::text[] end;
$$;

create function public.register_required_fields(p_type text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_type
    when 'document' then array['title','document_type']
    when 'drawing'  then array['document_id']
    when 'rfi'      then array['subject','question']
    when 'action'   then array['title']
    when 'decision' then array['title','decision_text']
    when 'submittal' then array['title']
    when 'material_approval' then array['material_name']
    else array[]::text[] end;
$$;

-- Kaydı kilitleyerek yükler; yoksa null. Tablo adı yalnızca register_meta beyaz listesinden gelir.
create function public.register_load(p_type text, p_id uuid, p_lock boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v jsonb;
begin
  select * into m from public.register_meta(p_type);
  execute format('select to_jsonb(t) from public.%I t where t.id = $1 %s', m.tbl,
                 case when p_lock then 'for update' else '' end)
    into v using p_id;
  return v;
end $$;

-- Kayıt üzerinde düzenleme hakkı (edit izni + own kapsamı)
create function public.register_can_edit_row(p_type text, p_row jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.register_can(p_type, 'edit')
     and coalesce((select rp.edit_scope = 'all' or (p_row ->> 'created_by') = auth.uid()::text
                   from public.register_permissions rp
                   where rp.role_key = public.get_my_role() and rp.register_type = p_type), false);
$$;

-- Yükle + proje erişimi kontrolü; başka projenin / olmayan kaydı not_found
create function public.register_load_checked(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if p_id is null then
    perform public.register_raise('validation', 'Kayıt seçilmedi', '{"fields":["p_id"]}');
  end if;
  v := public.register_load(p_type, p_id, true);
  if v is null or not public.has_project_access(v ->> 'project_id') then
    perform public.register_raise('not_found', 'Kayıt bulunamadı', jsonb_build_object('register_type', p_type, 'id', p_id));
  end if;
  return v;
end $$;

create function public.register_result(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v jsonb;
begin
  select * into m from public.register_meta(p_type);
  v := public.register_load(p_type, p_id, false);
  if p_type = 'drawing' then
    return jsonb_build_object('id', p_id,
      'register_no', (select d.document_no from public.documents d where d.id = (v ->> 'document_id')::uuid),
      'record_state', null);
  end if;
  return jsonb_build_object('id', p_id, 'register_no', v ->> m.no_col, 'record_state', v ->> 'record_state');
end $$;

-- Hangi bağ hangi kolonla tutulur (register_links yerine kompozit FK kolonları)
create function public.register_link_column(p_from_type text, p_to_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_from_type || '>' || p_to_type
    when 'rfi>drawing' then 'drawing_id'
    when 'rfi>document' then 'document_id'
    when 'rfi>decision' then 'decision_id'
    when 'action>rfi' then 'rfi_id'
    when 'action>decision' then 'decision_id'
    when 'action>risk' then 'risk_id'
    when 'decision>rfi' then 'rfi_id'
    when 'decision>risk' then 'risk_id'
    when 'submittal>document' then 'document_id'
    when 'material_approval>document' then 'document_id'
    when 'material_approval>submittal' then 'technical_submittal_id'
    else null end;
$$;

-- ── A4 · RPC'ler ──
create function public.save_register_record(
  p_register_type text, p_project_id text, p_id uuid default null, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  v_uid uuid := auth.uid();
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_keys text[];
  v_bad text[];
  v_missing text[];
  v_row jsonb;
  v_rec jsonb;
  v_cols text;
  v_set text;
  v_id uuid;
  v_constraint text;
begin
  select * into m from public.register_meta(p_register_type);
  if v_uid is null then
    perform public.register_raise('forbidden', 'Oturum yok');
  end if;
  if p_project_id is null then
    perform public.register_raise('validation', 'Proje seçilmedi', '{"fields":["p_project_id"]}');
  end if;
  if not public.has_project_access(p_project_id) then
    perform public.register_raise('forbidden', 'Bu projeye erişiminiz yok');
  end if;
  if jsonb_typeof(v_data) <> 'object' then
    perform public.register_raise('validation', 'p_data bir nesne olmalı');
  end if;

  v_keys := array(select jsonb_object_keys(v_data));
  v_bad := array(select k from unnest(v_keys) k where not (k = any(public.register_editable_fields(p_register_type))));
  if cardinality(v_bad) > 0 then
    perform public.register_raise('validation', 'Bu alanlar kaydedilemez (numara, durum ve kimlik alanları RPC tarafından yönetilir)',
      jsonb_build_object('fields', to_jsonb(v_bad)));
  end if;
  if p_register_type = 'document' and v_data ? 'document_type'
     and coalesce(v_data ->> 'document_type', '') not in
         ('drawing','rfi','submittal','correspondence','report','contract','minutes','photo','other') then
    perform public.register_raise('validation', 'Geçersiz doküman türü', '{"fields":["document_type"]}');
  end if;

  if p_id is null then
    -- ── Yeni kayıt ──
    if not public.register_can(p_register_type, 'create') then
      perform public.register_raise('forbidden', 'Bu register''da kayıt oluşturma yetkiniz yok');
    end if;
    v_missing := array(select f from unnest(public.register_required_fields(p_register_type)) f
                       where nullif(btrim(coalesce(v_data ->> f, '')), '') is null);
    if cardinality(v_missing) > 0 then
      perform public.register_raise('validation', 'Zorunlu alanlar eksik', jsonb_build_object('fields', to_jsonb(v_missing)));
    end if;

    v_rec := v_data || jsonb_build_object('project_id', p_project_id, 'created_by', v_uid);
    if m.has_state then
      v_rec := v_rec || jsonb_build_object('source', 'manual');
      if p_register_type = 'document' then
        -- Elle açılan doküman doğrudan onaylı (tasarım 4.1)
        v_rec := v_rec || jsonb_build_object('record_state', 'approved', 'approved_by', v_uid, 'approved_at', now());
      else
        v_rec := v_rec || jsonb_build_object('record_state', 'draft');
      end if;
    end if;
    if p_register_type = 'rfi' then
      v_rec := v_rec || jsonb_build_object('raised_by', v_uid);
    end if;

    select string_agg(quote_ident(k), ', ') into v_cols from jsonb_object_keys(v_rec) k;
    begin
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id',
                     m.tbl, v_cols, v_cols, m.tbl)
        into v_id using v_rec;
    exception
      when check_violation or foreign_key_violation or not_null_violation or unique_violation
           or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
        get stacked diagnostics v_constraint = constraint_name;
        perform public.register_raise('validation', 'Kayıt doğrulanamadı',
          jsonb_build_object('error', sqlerrm, 'constraint', v_constraint));
    end;
    return public.register_result(p_register_type, v_id);
  end if;

  -- ── Mevcut kayıt ──
  v_row := public.register_load_checked(p_register_type, p_id);
  if v_row ->> 'project_id' <> p_project_id then
    perform public.register_raise('not_found', 'Kayıt bu projede değil');
  end if;
  if not public.register_can_edit_row(p_register_type, v_row) then
    perform public.register_raise('forbidden', 'Bu kaydı düzenleme yetkiniz yok');
  end if;
  if p_register_type = 'document' then
    if v_row ->> 'status' = 'void' then
      perform public.register_raise('invalid_state', 'İptal edilmiş doküman düzenlenemez');
    end if;
  elsif m.has_state and v_row ->> 'record_state' not in ('draft', 'rejected') then
    perform public.register_raise('invalid_state', 'Yalnızca taslak veya reddedilmiş kayıt düzenlenir',
      jsonb_build_object('record_state', v_row ->> 'record_state'));
  end if;
  v_missing := array(select f from unnest(public.register_required_fields(p_register_type)) f
                     where v_data ? f and nullif(btrim(coalesce(v_data ->> f, '')), '') is null);
  if cardinality(v_missing) > 0 then
    perform public.register_raise('validation', 'Zorunlu alan boşaltılamaz', jsonb_build_object('fields', to_jsonb(v_missing)));
  end if;

  if cardinality(v_keys) > 0 then
    select string_agg(format('%I = r.%I', k, k), ', ') into v_set from unnest(v_keys) k;
    begin
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2',
                     m.tbl, v_set, m.tbl)
        using v_data, p_id;
    exception
      when check_violation or foreign_key_violation or not_null_violation or unique_violation
           or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
        get stacked diagnostics v_constraint = constraint_name;
        perform public.register_raise('validation', 'Kayıt doğrulanamadı',
          jsonb_build_object('error', sqlerrm, 'constraint', v_constraint));
    end;
  end if;
  -- Reddedilen kayıt düzeltilince taslağa döner (tasarım 4.1: rejected → draft)
  if m.has_state and v_row ->> 'record_state' = 'rejected' then
    execute format('update public.%I set record_state = ''draft'' where id = $1', m.tbl) using p_id;
  end if;
  return public.register_result(p_register_type, p_id);
end $$;

create function public.submit_register_record(p_register_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v_row jsonb; v_uid uuid := auth.uid();
begin
  select * into m from public.register_meta(p_register_type);
  if not m.has_state or p_register_type = 'document' then
    perform public.register_raise('validation', 'Bu register onaya gönderilmez', jsonb_build_object('register_type', p_register_type));
  end if;
  v_row := public.register_load_checked(p_register_type, p_id);
  -- Sahibi (oluşturma veya düzenleme izniyle) ya da düzenleme yetkisi olan gönderir
  if not ((v_row ->> 'created_by') = v_uid::text and (public.register_can(p_register_type, 'create') or public.register_can(p_register_type, 'edit')))
     and not public.register_can_edit_row(p_register_type, v_row) then
    perform public.register_raise('forbidden', 'Bu kaydı onaya gönderemezsiniz');
  end if;
  if v_row ->> 'record_state' not in ('draft', 'rejected') then
    perform public.register_raise('invalid_state', 'Yalnızca taslak veya reddedilmiş kayıt onaya gönderilir',
      jsonb_build_object('record_state', v_row ->> 'record_state'));
  end if;
  execute format('update public.%I set record_state = ''pending_approval'', rejected_reason = null where id = $1', m.tbl) using p_id;
  return public.register_result(p_register_type, p_id);
end $$;

create function public.approve_register_record(p_register_type text, p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v_row jsonb; v_uid uuid := auth.uid(); v_four_eyes boolean;
begin
  select * into m from public.register_meta(p_register_type);
  if not m.has_state or p_register_type = 'document' then
    perform public.register_raise('validation', 'Bu register onay akışına girmez', jsonb_build_object('register_type', p_register_type));
  end if;
  v_row := public.register_load_checked(p_register_type, p_id);
  if not public.register_can(p_register_type, 'approve') then
    perform public.register_raise('forbidden', 'Onay yetkiniz yok');
  end if;
  if v_row ->> 'record_state' <> 'pending_approval' then
    perform public.register_raise('invalid_state', 'Yalnızca onay bekleyen kayıt onaylanır',
      jsonb_build_object('record_state', v_row ->> 'record_state'));
  end if;
  if p_register_type in ('decision', 'risk', 'change', 'claim') then
    select coalesce((select s.four_eyes_enabled from public.project_register_settings s
                     where s.project_id = v_row ->> 'project_id'), true) into v_four_eyes;
    if v_four_eyes and (v_row ->> 'created_by') = v_uid::text then
      perform public.register_raise('forbidden', 'Dört göz kuralı: kaydı oluşturan onaylayamaz', '{"rule":"four_eyes"}');
    end if;
  end if;
  perform set_config('fons.audit_reason', coalesce(p_note, ''), true);
  execute format('update public.%I set record_state = ''approved'', approved_by = $2, approved_at = now(), rejected_reason = null where id = $1', m.tbl)
    using p_id, v_uid;
  return public.register_result(p_register_type, p_id);
end $$;

create function public.reject_register_record(p_register_type text, p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v_row jsonb;
begin
  select * into m from public.register_meta(p_register_type);
  if not m.has_state or p_register_type = 'document' then
    perform public.register_raise('validation', 'Bu register onay akışına girmez', jsonb_build_object('register_type', p_register_type));
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    perform public.register_raise('validation', 'Ret gerekçesi zorunlu', '{"fields":["p_reason"]}');
  end if;
  v_row := public.register_load_checked(p_register_type, p_id);
  if not public.register_can(p_register_type, 'approve') then
    perform public.register_raise('forbidden', 'Onay yetkiniz yok');
  end if;
  if v_row ->> 'record_state' <> 'pending_approval' then
    perform public.register_raise('invalid_state', 'Yalnızca onay bekleyen kayıt reddedilir',
      jsonb_build_object('record_state', v_row ->> 'record_state'));
  end if;
  perform set_config('fons.audit_reason', p_reason, true);
  execute format('update public.%I set record_state = ''rejected'', rejected_reason = $2 where id = $1', m.tbl) using p_id, p_reason;
  return public.register_result(p_register_type, p_id);
end $$;

create function public.reopen_register_record(p_register_type text, p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v_row jsonb;
begin
  select * into m from public.register_meta(p_register_type);
  if not m.has_state or p_register_type = 'document' then
    perform public.register_raise('validation', 'Bu register yeniden açılmaz', jsonb_build_object('register_type', p_register_type));
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    perform public.register_raise('validation', 'Yeniden açma gerekçesi zorunlu', '{"fields":["p_reason"]}');
  end if;
  v_row := public.register_load_checked(p_register_type, p_id);
  if not public.register_can(p_register_type, 'approve') then
    perform public.register_raise('forbidden', 'Onay yetkiniz yok');
  end if;
  if v_row ->> 'record_state' <> 'approved' then
    perform public.register_raise('invalid_state', 'Yalnızca onaylı kayıt yeniden açılır',
      jsonb_build_object('record_state', v_row ->> 'record_state'));
  end if;
  perform set_config('fons.audit_reason', p_reason, true);
  execute format('update public.%I set record_state = ''draft'', approved_by = null, approved_at = null where id = $1', m.tbl) using p_id;
  return public.register_result(p_register_type, p_id);
end $$;

create function public.set_register_status(p_register_type text, p_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row jsonb; v_from text; v_uid uuid := auth.uid();
begin
  if p_register_type not in ('document','rfi','action','decision','submittal','material_approval') then
    perform public.register_raise('validation', 'Bu register''ın iş durumu yok', jsonb_build_object('register_type', p_register_type));
  end if;
  v_row := public.register_load_checked(p_register_type, p_id);
  if not public.register_can_edit_row(p_register_type, v_row) then
    perform public.register_raise('forbidden', 'Durum değiştirme yetkiniz yok');
  end if;
  if v_row ->> 'record_state' <> 'approved' then
    perform public.register_raise('invalid_state', 'İş durumu yalnızca onaylı kayıtta değişir',
      jsonb_build_object('record_state', v_row ->> 'record_state'));
  end if;
  v_from := v_row ->> 'status';
  if not exists (select 1 from public.register_status_transitions t
                 where t.register_type = p_register_type and t.from_status = v_from and t.to_status = p_status) then
    perform public.register_raise('invalid_state', 'Bu durum geçişine izin verilmiyor',
      jsonb_build_object('from', v_from, 'to', p_status));
  end if;
  if (p_register_type = 'rfi' and p_status = 'answered') or (p_register_type = 'document' and p_status = 'void') then
    if nullif(btrim(coalesce(p_note, '')), '') is null then
      perform public.register_raise('validation',
        case when p_register_type = 'rfi' then 'Cevap metni zorunlu' else 'İptal gerekçesi zorunlu' end,
        '{"fields":["p_note"]}');
    end if;
  end if;
  perform set_config('fons.audit_reason', coalesce(p_note, ''), true);

  case p_register_type
    when 'document' then
      update public.documents set status = p_status where id = p_id;
    when 'rfi' then
      update public.rfis set status = p_status,
        response = case when p_status = 'answered' then p_note else response end,
        answered_date = case when p_status = 'answered' then current_date
                             when p_status in ('open', 'under_review') then null else answered_date end
      where id = p_id;
    when 'action' then
      update public.project_actions set status = p_status,
        completed_at = case when p_status = 'done' then now() else null end
      where id = p_id;
    when 'decision' then
      update public.decisions set status = p_status,
        decision_date = case when p_status = 'approved' then coalesce(decision_date, current_date) else decision_date end
      where id = p_id;
    when 'submittal' then
      update public.technical_submittals set status = p_status,
        submitted_date = case when p_status = 'submitted' then coalesce(submitted_date, current_date) else submitted_date end,
        reviewed_date = case when p_status in ('approved','approved_with_comments','rejected','resubmit_required') then current_date else reviewed_date end,
        reviewer_id = case when p_status in ('approved','approved_with_comments','rejected','resubmit_required') then v_uid else reviewer_id end
      where id = p_id;
    when 'material_approval' then
      update public.material_approvals set status = p_status,
        submitted_date = case when p_status = 'submitted' then coalesce(submitted_date, current_date) else submitted_date end,
        approved_date = case when p_status in ('approved','approved_with_comments') then current_date else approved_date end
      where id = p_id;
  end case;
  return public.register_result(p_register_type, p_id) || jsonb_build_object('status', p_status);
end $$;

create function public.delete_register_record(p_register_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v_row jsonb; v_no text;
begin
  select * into m from public.register_meta(p_register_type);
  if p_register_type in ('document', 'drawing') then
    perform public.register_raise('invalid_state', 'Doküman ve çizim silinmez; doküman void edilir');
  end if;
  v_row := public.register_load_checked(p_register_type, p_id);
  if not public.register_can(p_register_type, 'delete') then
    perform public.register_raise('forbidden', 'Silme yetkiniz yok');
  end if;
  if v_row ->> 'record_state' not in ('draft', 'rejected') then
    perform public.register_raise('invalid_state', 'Yalnızca taslak veya reddedilmiş kayıt silinir; onaylı kayıt durumuyla iptal edilir',
      jsonb_build_object('record_state', v_row ->> 'record_state'));
  end if;
  v_no := v_row ->> m.no_col;
  begin
    execute format('delete from public.%I where id = $1', m.tbl) using p_id;
  exception when foreign_key_violation then
    perform public.register_raise('invalid_state', 'Kayda başka kayıtlar bağlı; önce bağları kaldırın', jsonb_build_object('error', sqlerrm));
  end;
  return jsonb_build_object('id', p_id, 'register_no', v_no, 'deleted', true);
end $$;

create function public.link_register_records(
  p_project_id text, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v_col text; v_row jsonb; v_constraint text;
begin
  v_col := public.register_link_column(p_from_type, p_to_type);
  if v_col is null then
    perform public.register_raise('validation', 'Bu iki register arasında bağ tanımlı değil',
      jsonb_build_object('from_type', p_from_type, 'to_type', p_to_type));
  end if;
  if p_to_id is null then
    perform public.register_raise('validation', 'Bağlanacak kayıt seçilmedi', '{"fields":["p_to_id"]}');
  end if;
  select * into m from public.register_meta(p_from_type);
  v_row := public.register_load_checked(p_from_type, p_from_id);
  if v_row ->> 'project_id' is distinct from p_project_id then
    perform public.register_raise('not_found', 'Kayıt bu projede değil');
  end if;
  if not public.register_can_edit_row(p_from_type, v_row) then
    perform public.register_raise('forbidden', 'Bu kayda bağ ekleme yetkiniz yok');
  end if;
  if not public.register_can(p_to_type, 'view') then
    perform public.register_raise('forbidden', 'Bağlanacak register''ı görme yetkiniz yok');
  end if;
  perform set_config('fons.audit_reason', 'link:' || p_to_type, true);
  begin
    -- Kompozit FK (project_id, kolon) hedefin aynı projede olmasını zorlar
    execute format('update public.%I set %I = $2 where id = $1', m.tbl, v_col) using p_from_id, p_to_id;
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform public.register_raise('not_found', 'Bağlanacak kayıt bu projede yok', jsonb_build_object('constraint', v_constraint));
  end;
  return jsonb_build_object('from_type', p_from_type, 'from_id', p_from_id, 'to_type', p_to_type, 'to_id', p_to_id, 'column', v_col);
end $$;

create function public.unlink_register_records(
  p_project_id text, p_from_type text, p_from_id uuid, p_to_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare m record; v_col text; v_row jsonb;
begin
  v_col := public.register_link_column(p_from_type, p_to_type);
  if v_col is null then
    perform public.register_raise('validation', 'Bu iki register arasında bağ tanımlı değil',
      jsonb_build_object('from_type', p_from_type, 'to_type', p_to_type));
  end if;
  select * into m from public.register_meta(p_from_type);
  v_row := public.register_load_checked(p_from_type, p_from_id);
  if v_row ->> 'project_id' is distinct from p_project_id then
    perform public.register_raise('not_found', 'Kayıt bu projede değil');
  end if;
  if not public.register_can_edit_row(p_from_type, v_row) then
    perform public.register_raise('forbidden', 'Bu kayıttan bağ kaldırma yetkiniz yok');
  end if;
  perform set_config('fons.audit_reason', 'unlink:' || p_to_type, true);
  execute format('update public.%I set %I = null where id = $1', m.tbl, v_col) using p_from_id;
  return jsonb_build_object('from_type', p_from_type, 'from_id', p_from_id, 'to_type', p_to_type, 'column', v_col);
end $$;

-- ── A5 · Fonksiyon yetkileri ──
revoke all on function public.register_meta(text) from public, anon, authenticated;
revoke all on function public.register_editable_fields(text) from public, anon, authenticated;
revoke all on function public.register_required_fields(text) from public, anon, authenticated;
revoke all on function public.register_load(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.register_can_edit_row(text, jsonb) from public, anon, authenticated;
revoke all on function public.register_load_checked(text, uuid) from public, anon, authenticated;
revoke all on function public.register_result(text, uuid) from public, anon, authenticated;
revoke all on function public.register_link_column(text, text) from public, anon, authenticated;

revoke all on function public.save_register_record(text, text, uuid, jsonb) from public, anon;
revoke all on function public.submit_register_record(text, uuid) from public, anon;
revoke all on function public.approve_register_record(text, uuid, text) from public, anon;
revoke all on function public.reject_register_record(text, uuid, text) from public, anon;
revoke all on function public.reopen_register_record(text, uuid, text) from public, anon;
revoke all on function public.set_register_status(text, uuid, text, text) from public, anon;
revoke all on function public.delete_register_record(text, uuid) from public, anon;
revoke all on function public.link_register_records(text, text, uuid, text, uuid) from public, anon;
revoke all on function public.unlink_register_records(text, text, uuid, text) from public, anon;
grant execute on function public.save_register_record(text, text, uuid, jsonb) to authenticated;
grant execute on function public.submit_register_record(text, uuid) to authenticated;
grant execute on function public.approve_register_record(text, uuid, text) to authenticated;
grant execute on function public.reject_register_record(text, uuid, text) to authenticated;
grant execute on function public.reopen_register_record(text, uuid, text) to authenticated;
grant execute on function public.set_register_status(text, uuid, text, text) to authenticated;
grant execute on function public.delete_register_record(text, uuid) to authenticated;
grant execute on function public.link_register_records(text, text, uuid, text, uuid) to authenticated;
grant execute on function public.unlink_register_records(text, text, uuid, text) to authenticated;

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL (B5/B6 uygulanmışsa önce onlar; tablolarda veri varsa önce veri yedeği)
-- Policy'leri 07.10.2026 haline döndürür (yedek-faz-b-07-10.sql §B3 ile aynı tanımlar).
-- ############################################################################
/*
begin;
drop function if exists public.unlink_register_records(text, text, uuid, text);
drop function if exists public.link_register_records(text, text, uuid, text, uuid);
drop function if exists public.delete_register_record(text, uuid);
drop function if exists public.set_register_status(text, uuid, text, text);
drop function if exists public.reopen_register_record(text, uuid, text);
drop function if exists public.reject_register_record(text, uuid, text);
drop function if exists public.approve_register_record(text, uuid, text);
drop function if exists public.submit_register_record(text, uuid);
drop function if exists public.save_register_record(text, text, uuid, jsonb);
drop function if exists public.register_link_column(text, text);
drop function if exists public.register_result(text, uuid);
drop function if exists public.register_load_checked(text, uuid);
drop function if exists public.register_can_edit_row(text, jsonb);
drop function if exists public.register_load(text, uuid, boolean);
drop function if exists public.register_required_fields(text);
drop function if exists public.register_editable_fields(text);
drop function if exists public.register_meta(text);

-- SELECT policy'leri eski haline
do $$
declare t text;
begin
  foreach t in array array['documents','document_revisions','drawings','rfis','project_actions','decisions',
                           'technical_submittals','material_approvals','register_status_history'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.user_has_project_access(project_id))', t || '_select', t);
  end loop;
  -- Etkisiz yazma policy'leri (G-01 sonrası durum: yetki yok, policy var)
  foreach t in array array['documents','drawings','rfis','project_actions','decisions','technical_submittals','material_approvals'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_project_control(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_project_control(project_id)) with check (public.can_write_project_control(project_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_manage_project_control(project_id))', t || '_delete', t);
  end loop;
end $$;

alter table public.project_register_settings drop column if exists four_eyes_enabled;
drop index if exists public.idx_documents_approved_by, public.idx_rfis_approved_by, public.idx_rfis_created_by,
  public.idx_project_actions_approved_by, public.idx_decisions_approved_by, public.idx_technical_submittals_approved_by,
  public.idx_technical_submittals_created_by, public.idx_material_approvals_approved_by, public.idx_material_approvals_created_by,
  public.idx_rfis_pending, public.idx_project_actions_pending, public.idx_decisions_pending,
  public.idx_technical_submittals_pending, public.idx_material_approvals_pending;
alter table public.documents drop column record_state, drop column source, drop column approved_by, drop column approved_at, drop column rejected_reason;
alter table public.rfis drop column record_state, drop column source, drop column created_by, drop column approved_by, drop column approved_at, drop column rejected_reason;
alter table public.project_actions drop column record_state, drop column source, drop column approved_by, drop column approved_at, drop column rejected_reason;
alter table public.decisions drop column record_state, drop column source, drop column approved_by, drop column approved_at, drop column rejected_reason;
alter table public.technical_submittals drop column record_state, drop column source, drop column created_by, drop column approved_by, drop column approved_at, drop column rejected_reason;
alter table public.material_approvals drop column record_state, drop column source, drop column created_by, drop column approved_by, drop column approved_at, drop column rejected_reason;
commit;
*/
