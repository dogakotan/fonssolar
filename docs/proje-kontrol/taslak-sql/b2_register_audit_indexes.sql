-- ============================================================================
-- FAZ B · B2 — register_audit + FK indeksleri + G-13 — TASLAK (UYGULANMADI, onay bekliyor) · 07.10.2026
-- Plan: docs/proje-kontrol/faz-b-migration-plani.md · Tasarım: tasarim.md §4.2 A (register_audit), §4.8
-- Doğrulama: taslak-sql/b2_dogrulama.sql · Anlık görüntü: yedek-faz-b-07-10.sql §B2 (master tablo yetkileri)
-- Test: tests/proje-kontrol-b2-audit.spec.js
--
-- İçerik:
--   * register_audit: yalnızca değişen alanlar ({kolon: [eski, yeni]}); silmede satırın son hali;
--     ekleme satırı yalnızca "insert" olayıdır (satırın kendisi tabloda zaten var, ikinci kopya tutulmaz).
--     Gerekçe metni RPC'lerin set_config('fons.audit_reason', …, true) ile verdiği değerden gelir.
--     project_id'de FK yok (bkz. v3-uyum-notlari.md: proje silmeyi engellememek için).
--   * fn_register_audit trigger'ı 8 tabloda (documents, document_revisions, drawings, rfis,
--     project_actions, decisions, technical_submittals, material_approvals).
--   * register_type_of_table(): tablo adı → register türü (RLS ve okuma RPC'leri kullanır).
--   * 30 indekssiz FK kolonuna kısmi indeks (07.10.2026 canlı taramasıyla bulunan liste).
--   * G-13: project_wbs, project_areas, area_wbs'te authenticated'ın TRUNCATE, REFERENCES, TRIGGER
--     yetkisi ve policy'si olmayan area_wbs UPDATE yetkisi geri alınır.
-- Bağımlılık: B1 (register_can, RLS policy'sinde).
-- ============================================================================

-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A1 · Tablo türü eşlemesi ──
create function public.register_type_of_table(p_table text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_table
    when 'documents' then 'document'
    when 'document_revisions' then 'document'
    when 'drawings' then 'drawing'
    when 'rfis' then 'rfi'
    when 'project_actions' then 'action'
    when 'decisions' then 'decision'
    when 'technical_submittals' then 'submittal'
    when 'material_approvals' then 'material_approval'
    else null end;
$$;
revoke all on function public.register_type_of_table(text) from public, anon;
grant execute on function public.register_type_of_table(text) to authenticated;

-- ── A2 · register_audit ──
create table public.register_audit (
  id             bigint generated always as identity primary key,
  project_id     text not null,
  table_name     text not null,
  record_id      uuid not null,
  action         text not null,
  changed_by     uuid default auth.uid(),
  changed_at     timestamptz not null default now(),
  changed_fields jsonb,
  reason         text,
  constraint register_audit_action_check check (action in ('insert','update','delete'))
);
comment on table public.register_audit is
  'Register değişiklik izi: yalnızca değişen alanlar. Satırı yalnızca fn_register_audit yazar; UPDATE/DELETE yetkisi kimsede yok. project_id ve changed_by kasıtlı olarak FK değil (kayıt ve kullanıcıdan uzun yaşar).';
create index idx_register_audit_record on public.register_audit (project_id, table_name, record_id, changed_at desc);
create index idx_register_audit_changed_by on public.register_audit (changed_by) where changed_by is not null;

alter table public.register_audit enable row level security;
create policy register_audit_select on public.register_audit
  for select to authenticated
  using (
    public.user_has_project_access(project_id)
    and (public.register_type_of_table(table_name) is null
         or public.register_can(public.register_type_of_table(table_name), 'view'))
  );

revoke all on public.register_audit from anon, authenticated;
revoke insert, update, delete, truncate on public.register_audit from service_role;
grant select on public.register_audit to authenticated;
revoke all on sequence public.register_audit_id_seq from anon, authenticated;

create function public.fn_register_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changes jsonb;
  v_reason text := nullif(current_setting('fons.audit_reason', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
    values (new.project_id, tg_table_name, new.id, 'insert', null, v_reason);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k))
      into v_changes
      from jsonb_object_keys(v_new) as k
     where k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k);
    if v_changes is not null then
      insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
      values (new.project_id, tg_table_name, new.id, 'update', v_changes, v_reason);
    end if;
  else
    insert into public.register_audit (project_id, table_name, record_id, action, changed_fields, reason)
    values (old.project_id, tg_table_name, old.id, 'delete', to_jsonb(old), v_reason);
  end if;
  return null;
end $$;
revoke all on function public.fn_register_audit() from public, anon, authenticated;

create trigger trg_documents_audit after insert or update or delete on public.documents
  for each row execute function public.fn_register_audit();
create trigger trg_document_revisions_audit after insert or update or delete on public.document_revisions
  for each row execute function public.fn_register_audit();
create trigger trg_drawings_audit after insert or update or delete on public.drawings
  for each row execute function public.fn_register_audit();
create trigger trg_rfis_audit after insert or update or delete on public.rfis
  for each row execute function public.fn_register_audit();
create trigger trg_project_actions_audit after insert or update or delete on public.project_actions
  for each row execute function public.fn_register_audit();
create trigger trg_decisions_audit after insert or update or delete on public.decisions
  for each row execute function public.fn_register_audit();
create trigger trg_technical_submittals_audit after insert or update or delete on public.technical_submittals
  for each row execute function public.fn_register_audit();
create trigger trg_material_approvals_audit after insert or update or delete on public.material_approvals
  for each row execute function public.fn_register_audit();

-- ── A3 · İndekssiz FK kolonları (30) ──
-- Kompozit FK'lerde (project_id, x) hedefin silinmesi/güncellenmesi x üzerinden aranır; tek kolon yeterli.
-- drawings (project_id, document_id, document_type) FK'si UNIQUE(document_id) ile zaten karşılanıyor.
create index idx_decisions_created_by on public.decisions (created_by) where created_by is not null;
create index idx_decisions_rfi_id on public.decisions (rfi_id) where rfi_id is not null;
create index idx_decisions_risk_id on public.decisions (risk_id) where risk_id is not null;
create index idx_documents_created_by on public.documents (created_by) where created_by is not null;
create index idx_drawings_created_by on public.drawings (created_by) where created_by is not null;
create index idx_material_approvals_document_id on public.material_approvals (document_id) where document_id is not null;
create index idx_material_approvals_technical_submittal_id on public.material_approvals (technical_submittal_id) where technical_submittal_id is not null;
create index idx_material_approvals_supplier_id on public.material_approvals (supplier_id) where supplier_id is not null;
create index idx_procurement_items_area_id on public.procurement_items (area_id) where area_id is not null;
create index idx_procurement_items_material_approval_id on public.procurement_items (material_approval_id) where material_approval_id is not null;
create index idx_procurement_items_wbs_id on public.procurement_items (wbs_id) where wbs_id is not null;
create index idx_project_actions_assigned_to on public.project_actions (assigned_to) where assigned_to is not null;
create index idx_project_actions_created_by on public.project_actions (created_by) where created_by is not null;
create index idx_project_actions_decision_id on public.project_actions (decision_id) where decision_id is not null;
create index idx_project_actions_rfi_id on public.project_actions (rfi_id) where rfi_id is not null;
create index idx_project_actions_risk_id on public.project_actions (risk_id) where risk_id is not null;
create index idx_project_risks_action_id on public.project_risks (action_id) where action_id is not null;
create index idx_project_risks_decision_id on public.project_risks (decision_id) where decision_id is not null;
create index idx_project_risks_rfi_id on public.project_risks (rfi_id) where rfi_id is not null;
create index idx_purchase_requests_area_id on public.purchase_requests (area_id) where area_id is not null;
create index idx_purchase_requests_technical_submittal_id on public.purchase_requests (technical_submittal_id) where technical_submittal_id is not null;
create index idx_purchase_requests_wbs_id on public.purchase_requests (wbs_id) where wbs_id is not null;
create index idx_rfis_assigned_to on public.rfis (assigned_to) where assigned_to is not null;
create index idx_rfis_decision_id on public.rfis (decision_id) where decision_id is not null;
create index idx_rfis_document_id on public.rfis (document_id) where document_id is not null;
create index idx_rfis_drawing_id on public.rfis (drawing_id) where drawing_id is not null;
create index idx_rfis_raised_by on public.rfis (raised_by) where raised_by is not null;
create index idx_technical_submittals_document_id on public.technical_submittals (document_id) where document_id is not null;
create index idx_technical_submittals_reviewer_id on public.technical_submittals (reviewer_id) where reviewer_id is not null;
create index idx_technical_submittals_supplier_id on public.technical_submittals (supplier_id) where supplier_id is not null;

-- ── A4 · G-13: master tablolarda gereksiz yetkiler ──
revoke truncate, references, trigger on public.project_wbs, public.project_areas, public.area_wbs from authenticated;
revoke update on public.area_wbs from authenticated;  -- area_wbs'te UPDATE policy'si yok; yetki etkisizdi

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL (yalnızca gerekirse; B3/B4/B6 uygulanmışsa önce onlar geri alınır)
-- ############################################################################
/*
begin;
drop trigger if exists trg_documents_audit on public.documents;
drop trigger if exists trg_document_revisions_audit on public.document_revisions;
drop trigger if exists trg_drawings_audit on public.drawings;
drop trigger if exists trg_rfis_audit on public.rfis;
drop trigger if exists trg_project_actions_audit on public.project_actions;
drop trigger if exists trg_decisions_audit on public.decisions;
drop trigger if exists trg_technical_submittals_audit on public.technical_submittals;
drop trigger if exists trg_material_approvals_audit on public.material_approvals;
drop function if exists public.fn_register_audit();
drop table if exists public.register_audit;          -- audit satırları da gider; önce veri yedeği alın
drop function if exists public.register_type_of_table(text);

drop index if exists public.idx_decisions_created_by, public.idx_decisions_rfi_id, public.idx_decisions_risk_id,
  public.idx_documents_created_by, public.idx_drawings_created_by,
  public.idx_material_approvals_document_id, public.idx_material_approvals_technical_submittal_id,
  public.idx_material_approvals_supplier_id, public.idx_procurement_items_area_id,
  public.idx_procurement_items_material_approval_id, public.idx_procurement_items_wbs_id,
  public.idx_project_actions_assigned_to, public.idx_project_actions_created_by,
  public.idx_project_actions_decision_id, public.idx_project_actions_rfi_id, public.idx_project_actions_risk_id,
  public.idx_project_risks_action_id, public.idx_project_risks_decision_id, public.idx_project_risks_rfi_id,
  public.idx_purchase_requests_area_id, public.idx_purchase_requests_technical_submittal_id,
  public.idx_purchase_requests_wbs_id, public.idx_rfis_assigned_to, public.idx_rfis_decision_id,
  public.idx_rfis_document_id, public.idx_rfis_drawing_id, public.idx_rfis_raised_by,
  public.idx_technical_submittals_document_id, public.idx_technical_submittals_reviewer_id,
  public.idx_technical_submittals_supplier_id;

-- G-13 geri: 07.10.2026 durumu (yedek-faz-b-07-10.sql §B2)
grant truncate, references, trigger on public.project_wbs, public.project_areas, public.area_wbs to authenticated;
grant update on public.area_wbs to authenticated;
commit;
*/
