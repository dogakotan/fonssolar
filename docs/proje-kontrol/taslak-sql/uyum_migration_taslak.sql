-- ============================================================================
-- UYUM MIGRATION'I — TASLAK v2 (UYGULANMADI, onay bekliyor) · 07.10.2026
-- Plan ve gerekçeler: docs/proje-kontrol/uyum-migration-plani.md
-- Geri yükleme görüntüsü: docs/proje-kontrol/yedek-uyum-07-10.sql
-- Doğrulama: docs/proje-kontrol/taslak-sql/uyum_migration_dogrulama.sql
--
-- v1'den farklar (kullanıcı yanıtları):
--   * Proje kodları eklendi: ADN1, ADN2, TIZ, TKY
--   * Çizim türündeki dokümanlar DRW, diğerleri DOC öneki alır (yeni fn_assign_document_no)
--   * drawings'in kendi numarası yok (drawing_no kaldırıldı); register numarası documents.document_no
--   * drawings yalnızca document_type = 'drawing' olan dokümana bağlanabilir (3 kolonlu kompozit FK)
--   * project_actions.source_type listesinden inspection ve ncr çıkarıldı
--   * TS / MA önekleri aynen kalır
--
-- Varsayılan yetkiler (pg_default_acl, 07.10.2026): postgres'in açtığı yeni tablolarda authenticated'a
-- TÜM yetkiler, yeni fonksiyonlarda anon + authenticated'a EXECUTE otomatik veriliyor. Bu yüzden her yeni
-- tablo ve fonksiyon için yetkiler aşağıda açıkça geri çekilir; doğrulama betiği bunu kontrol eder.
--
-- BÖLÜM A uygulanır (tek transaction). BÖLÜM B, A'nın tam tersidir; yalnızca geri almak
-- gerekirse ayrı çalıştırılır. Her iki bölüm de etkilenen tablolar boş değilse durur.
-- ============================================================================


-- ############################################################################
-- BÖLÜM A — UYGULA
-- ############################################################################
begin;

-- ── A0 · Ön koşul: tablolar boş olmalı (satır varsa migration durur) ──
do $$
declare n bigint;
begin
  select (select count(*) from public.actions)
       + (select count(*) from public.documents)
       + (select count(*) from public.drawings)
       + (select count(*) from public.project_register_counters)
       + (select count(*) from public.register_status_history)
    into n;
  if n > 0 then
    raise exception 'Uyum migration''ı durduruldu: register tablolarında % satır var (boş olmalıydı)', n;
  end if;
  if exists (select 1 from public.project_tasks where is_critical) then
    raise exception 'Uyum migration''ı durduruldu: project_tasks.is_critical = true olan satır var';
  end if;
end $$;

-- ── A1 · actions → project_actions (Karar 1) ──
-- Yetkiler, FK'ler (project_risks.project_risks_action_id_fk dahil) ve RLS tablo OID'ine bağlıdır,
-- yeniden adlandırmada korunur. Hiçbir fonksiyon/view gövdesi 'actions' adını içermiyor. Realtime'da değil.
alter table public.actions rename to project_actions;

alter table public.project_actions rename constraint actions_pkey                     to project_actions_pkey;
alter table public.project_actions rename constraint actions_project_id_id_key        to project_actions_project_id_id_key;
alter table public.project_actions rename constraint actions_project_id_action_no_key to project_actions_project_id_action_no_key;
alter table public.project_actions rename constraint actions_status_check             to project_actions_status_check;
alter table public.project_actions rename constraint actions_priority_check           to project_actions_priority_check;
alter table public.project_actions rename constraint actions_source_type_check        to project_actions_source_type_check;
alter table public.project_actions rename constraint actions_project_id_fkey          to project_actions_project_id_fkey;
alter table public.project_actions rename constraint actions_assigned_to_fkey         to project_actions_assigned_to_fkey;
alter table public.project_actions rename constraint actions_created_by_fkey          to project_actions_created_by_fkey;
alter table public.project_actions rename constraint actions_wbs_fk                   to project_actions_wbs_fk;
alter table public.project_actions rename constraint actions_area_fk                  to project_actions_area_fk;
alter table public.project_actions rename constraint actions_task_fk                  to project_actions_task_fk;
alter table public.project_actions rename constraint actions_rfi_id_fk                to project_actions_rfi_id_fk;
alter table public.project_actions rename constraint actions_risk_id_fk               to project_actions_risk_id_fk;
alter table public.project_actions rename constraint actions_decision_id_fk           to project_actions_decision_id_fk;

alter index public.idx_actions_project_status rename to idx_project_actions_project_status;
alter index public.idx_actions_task           rename to idx_project_actions_task;
alter index public.idx_actions_wbs            rename to idx_project_actions_wbs;
alter index public.idx_actions_area           rename to idx_project_actions_area;
alter index public.idx_actions_due            rename to idx_project_actions_due;

alter trigger trg_actions_assign_no      on public.project_actions rename to trg_project_actions_assign_no;
alter trigger trg_actions_status_history on public.project_actions rename to trg_project_actions_status_history;
alter trigger trg_actions_updated_at     on public.project_actions rename to trg_project_actions_updated_at;

alter policy actions_select on public.project_actions rename to project_actions_select;
alter policy actions_insert on public.project_actions rename to project_actions_insert;
alter policy actions_update on public.project_actions rename to project_actions_update;
alter policy actions_delete on public.project_actions rename to project_actions_delete;

-- Kaynak listesi: inspection ve ncr çıkar (kalite modülü kararla kaldırılmıştı; Karar #6)
alter table public.project_actions drop constraint project_actions_source_type_check;
alter table public.project_actions add constraint project_actions_source_type_check
  check (source_type in ('manual', 'risk', 'rfi', 'decision', 'meeting', 'other'));

comment on table public.project_actions is
  'Action register (Karar 1, 07.10.2026). Ticket sahadan bildirim olarak kalır; aksiyon takibi burada.';

-- ── A2 · Numaralama: {TÜR}-{PROJE_KODU}-{SIRA} (Karar 2, G-11) ──
create table public.project_register_settings (
  project_id text primary key references public.projects(id) on delete cascade,
  prefix     text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_register_settings_prefix_format check (prefix ~ '^[A-Z0-9]{2,6}$'),
  constraint project_register_settings_prefix_key unique (prefix)
);
alter table public.project_register_settings enable row level security;
create policy project_register_settings_select on public.project_register_settings
  for select to authenticated using (public.user_has_project_access(project_id));
create trigger trg_project_register_settings_updated_at before update on public.project_register_settings
  for each row execute function public.update_updated_at_column();
revoke all on public.project_register_settings from public, anon, authenticated;
grant select on public.project_register_settings to authenticated;
comment on table public.project_register_settings is
  'Register numarasındaki proje kodu (RFI-DYB-0032 içindeki DYB). Yazma yalnızca admin/SQL veya Faz B RPC.';

insert into public.project_register_settings (project_id, prefix) values
  ('kaptan-demir-adana-arazi-faz1', 'ADN1'),
  ('kaptan-demir-adana-arazi-faz2', 'ADN2'),
  ('test-izmir-ges-2026',           'TIZ'),
  ('test-kayseri-develi-ges',       'TKY');

alter table public.project_register_counters drop constraint project_register_counters_pkey;
alter table public.project_register_counters drop column year;
alter table public.project_register_counters add constraint project_register_counters_pkey primary key (project_id, register_code);

-- İmza, SECURITY DEFINER ve yetkiler (postgres + service_role) korunur: create or replace ACL'yi değiştirmez.
-- 4 haneye kadar sıfır doldurur; 10000 ve üstü KIRPILMAZ. Sayaç kaydı ekleyen transaction içinde artar.
create or replace function public.next_register_no(p_project_id text, p_register text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v int; v_prefix text;
begin
  select s.prefix into v_prefix from public.project_register_settings s where s.project_id = p_project_id;
  if v_prefix is null then
    raise exception 'Proje kodu tanımlı değil (project_register_settings): %', p_project_id
      using errcode = 'P0001';
  end if;
  insert into public.project_register_counters as c (project_id, register_code, last_value)
  values (p_project_id, p_register, 1)
  on conflict (project_id, register_code) do update set last_value = c.last_value + 1
  returning c.last_value into v;
  return p_register || '-' || v_prefix || '-' ||
         case when v < 10000 then lpad(v::text, 4, '0') else v::text end;
end $function$;

-- documents numarası: çizim türü DRW, diğerleri DOC (her önek kendi sırasında)
create function public.fn_assign_document_no()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if coalesce(new.document_no, '') = '' then
    new.document_no := public.next_register_no(
      new.project_id,
      case when new.document_type = 'drawing' then 'DRW' else 'DOC' end);
  end if;
  return new;
end $function$;
revoke all on function public.fn_assign_document_no() from public, anon, authenticated;
grant execute on function public.fn_assign_document_no() to service_role;

create trigger trg_documents_assign_no before insert on public.documents
  for each row execute function public.fn_assign_document_no();

-- ── A3 · Revizyon modeli: documents (kimlik) + document_revisions (Karar 3) ──
alter table public.documents drop constraint documents_project_id_document_no_revision_key;
alter table public.documents drop constraint documents_storage_provider_check;
alter table public.documents
  drop column revision,
  drop column storage_provider,
  drop column storage_file_id,
  drop column storage_url,
  drop column file_name,
  drop column mime_type,
  drop column issue_date,
  drop column effective_date;
alter table public.documents add constraint documents_project_id_document_no_key unique (project_id, document_no);
-- drawings'in 3 kolonlu FK'sinin hedefi
alter table public.documents add constraint documents_project_id_id_document_type_key unique (project_id, id, document_type);
alter table public.documents drop constraint documents_status_check;
alter table public.documents alter column status set default 'active';
alter table public.documents add constraint documents_status_check check (status in ('active', 'void'));
comment on table public.documents is
  'Doküman kimliği (Karar 3: tek doküman, çok revizyon). Dosya ve revizyon bilgisi document_revisions''ta. '
  'document_type = ''drawing'' olanlar DRW, diğerleri DOC numarası alır.';

create table public.document_revisions (
  id               uuid primary key default gen_random_uuid(),
  project_id       text not null references public.projects(id) on delete cascade,
  document_id      uuid not null,
  revision_no      text not null,
  revision_status  text not null,
  is_current       boolean not null default false,
  issue_date       date,
  storage_provider text,
  storage_file_id  text,
  file_name        text,
  mime_type        text,
  size_bytes       bigint,
  sha256           text,
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint document_revisions_project_id_id_key unique (project_id, id),
  constraint document_revisions_document_id_revision_no_key unique (document_id, revision_no),
  constraint document_revisions_document_fk foreign key (project_id, document_id)
    references public.documents(project_id, id) on delete cascade,
  constraint document_revisions_revision_no_format check (revision_no ~ '^[A-Z0-9][A-Z0-9.-]{0,9}$'),
  constraint document_revisions_status_check check (revision_status in ('ifr', 'ifa', 'ifc', 'as_built')),
  constraint document_revisions_storage_provider_check check (storage_provider is null or storage_provider in
    ('onedrive', 'sharepoint', 'google_drive', 'supabase_storage', 'external')),
  constraint document_revisions_size_check check (size_bytes is null or size_bytes >= 0),
  constraint document_revisions_sha256_format check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')
);
-- Tek güncel revizyon (kısmi unique; ertelenemez — RPC önce eskisini false, sonra yenisini true yapar)
create unique index document_revisions_one_current on public.document_revisions (document_id) where is_current;
create index idx_document_revisions_project_document on public.document_revisions (project_id, document_id);
create index idx_document_revisions_sha256 on public.document_revisions (project_id, sha256) where sha256 is not null;
create index idx_document_revisions_created_by on public.document_revisions (created_by) where created_by is not null;
alter table public.document_revisions enable row level security;
create policy document_revisions_select on public.document_revisions
  for select to authenticated using (public.user_has_project_access(project_id));
revoke all on public.document_revisions from public, anon, authenticated;
grant select on public.document_revisions to authenticated;
comment on table public.document_revisions is
  'Doküman revizyonları (Karar 3). PDF tam metni burada ya da başka tabloda KALICI tutulmaz (Karar 6).';

-- drawings: documents'a bağlı uzantı; kendi numarası yok (register no = documents.document_no).
alter table public.drawings drop constraint drawings_supersedes_drawing_id_fk;
alter table public.drawings drop constraint drawings_wbs_fk;
alter table public.drawings drop constraint drawings_area_fk;
alter table public.drawings drop constraint drawings_task_fk;
alter table public.drawings drop constraint drawings_document_id_fk;
alter table public.drawings drop constraint drawings_project_id_drawing_no_revision_key;
alter table public.drawings drop constraint drawings_status_check;
alter table public.drawings drop constraint drawings_storage_provider_check;
drop index public.idx_drawings_project_status;
drop index public.idx_drawings_task;
drop index public.idx_drawings_wbs;
drop index public.idx_drawings_area;
alter table public.drawings
  drop column drawing_no,
  drop column title,
  drop column discipline,
  drop column revision,
  drop column status,
  drop column issue_date,
  drop column wbs_id,
  drop column area_id,
  drop column task_id,
  drop column storage_provider,
  drop column storage_file_id,
  drop column storage_url,
  drop column supersedes_drawing_id;
alter table public.drawings alter column document_id set not null;
-- Yalnızca çizim türündeki dokümana bağlanır: sabit 'drawing' değerli kolon + 3 kolonlu kompozit FK.
-- Doküman türü sonradan değiştirilmek istenirse FK (NO ACTION) bunu da engeller.
alter table public.drawings add column document_type text not null default 'drawing';
alter table public.drawings add constraint drawings_document_type_check check (document_type = 'drawing');
alter table public.drawings add constraint drawings_document_fk foreign key (project_id, document_id, document_type)
  references public.documents(project_id, id, document_type);
alter table public.drawings add constraint drawings_document_id_key unique (document_id);
comment on table public.drawings is
  'documents''a bağlı çizim uzantısı (Karar 3). Yalnızca document_type = ''drawing'' dokümana bağlanır; '
  'numarası documents.document_no (DRW-…), dosya ve revizyon document_revisions''ta.';

-- ── A4 · project_tasks.is_critical kaldırılır (Karar 5; 03.08.2026 kararı) ──
-- Bağımlılık taraması (07.10.2026): view, matview, fonksiyon gövdesi, index, policy, trigger, CHECK yok;
-- tek bağımlılık kendi DEFAULT'u. src/, supabase/functions/, tests/, scripts/ içinde kullanım yok.
alter table public.project_tasks drop column is_critical;

commit;


-- ############################################################################
-- BÖLÜM B — GERİ AL (A'nın tersi; yalnızca gerekirse, ayrı çalıştırılır)
-- Tablolar hâlâ boşsa kayıpsızdır (project_register_settings'teki 4 kod satırı hariç — onlar silinir).
-- ############################################################################
/*
begin;

do $$
declare n bigint;
begin
  select (select count(*) from public.project_actions)
       + (select count(*) from public.documents)
       + (select count(*) from public.document_revisions)
       + (select count(*) from public.drawings)
       + (select count(*) from public.project_register_counters)
       + (select count(*) from public.register_status_history)
    into n;
  if n > 0 then
    raise exception 'Geri alma durduruldu: register tablolarında % satır var', n;
  end if;
end $$;

-- B4 · is_critical geri (değerler hep false'tu)
alter table public.project_tasks add column is_critical boolean not null default false;

-- B3 · drawings eski haline
alter table public.drawings drop constraint drawings_document_id_key;
alter table public.drawings drop constraint drawings_document_fk;
alter table public.drawings drop constraint drawings_document_type_check;
alter table public.drawings drop column document_type;
alter table public.drawings alter column document_id drop not null;
alter table public.drawings
  add column drawing_no text not null,
  add column title text not null,
  add column discipline text,
  add column revision text not null default '00',
  add column status text not null default 'draft',
  add column issue_date date,
  add column wbs_id uuid,
  add column area_id uuid,
  add column task_id uuid,
  add column storage_provider text,
  add column storage_file_id text,
  add column storage_url text,
  add column supersedes_drawing_id uuid;
alter table public.drawings add constraint drawings_status_check check (status = any (array['draft','in_review','approved','issued_for_construction','as_built','superseded','cancelled']));
alter table public.drawings add constraint drawings_storage_provider_check check (storage_provider = any (array['onedrive','sharepoint','google_drive','supabase_storage','external']));
alter table public.drawings add constraint drawings_project_id_drawing_no_revision_key unique (project_id, drawing_no, revision);
alter table public.drawings add constraint drawings_document_id_fk foreign key (project_id, document_id) references public.documents(project_id, id);
alter table public.drawings add constraint drawings_wbs_fk foreign key (project_id, wbs_id) references public.project_wbs(project_id, id);
alter table public.drawings add constraint drawings_area_fk foreign key (project_id, area_id) references public.project_areas(project_id, id);
alter table public.drawings add constraint drawings_task_fk foreign key (project_id, task_id) references public.project_tasks(project_id, id);
alter table public.drawings add constraint drawings_supersedes_drawing_id_fk foreign key (project_id, supersedes_drawing_id) references public.drawings(project_id, id);
create index idx_drawings_project_status on public.drawings using btree (project_id, status);
create index idx_drawings_task on public.drawings using btree (task_id) where (task_id is not null);
create index idx_drawings_wbs on public.drawings using btree (wbs_id) where (wbs_id is not null);
create index idx_drawings_area on public.drawings using btree (area_id) where (area_id is not null);
comment on table public.drawings is null;

-- B3 · document_revisions kaldır, documents eski haline
drop table public.document_revisions;
alter table public.documents drop constraint documents_project_id_id_document_type_key;
alter table public.documents drop constraint documents_status_check;
alter table public.documents alter column status set default 'draft';
alter table public.documents add constraint documents_status_check check (status = any (array['draft','in_review','approved','issued','superseded','cancelled']));
alter table public.documents drop constraint documents_project_id_document_no_key;
alter table public.documents
  add column revision text not null default '00',
  add column storage_provider text,
  add column storage_file_id text,
  add column storage_url text,
  add column file_name text,
  add column mime_type text,
  add column issue_date date,
  add column effective_date date;
alter table public.documents add constraint documents_storage_provider_check check (storage_provider = any (array['onedrive','sharepoint','google_drive','supabase_storage','external']));
alter table public.documents add constraint documents_project_id_document_no_revision_key unique (project_id, document_no, revision);
comment on table public.documents is 'Project Control Document Register. Dosya konumu provider-independent (storage_provider/file_id/url).';
-- Not: eklenen kolonlar sona gelir (özgün sıra değil); birebir sıra için yedek-uyum-07-10.sql.

-- B2 · numaralama eski haline
drop trigger trg_documents_assign_no on public.documents;
drop function public.fn_assign_document_no();
alter table public.project_register_counters drop constraint project_register_counters_pkey;
alter table public.project_register_counters add column year integer not null;
alter table public.project_register_counters add constraint project_register_counters_pkey primary key (project_id, register_code, year);
create or replace function public.next_register_no(p_project_id text, p_register text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v int; y int := extract(year from now())::int;
begin
  insert into public.project_register_counters as c (project_id, register_code, year, last_value)
  values (p_project_id, p_register, y, 1)
  on conflict (project_id, register_code, year) do update set last_value = c.last_value + 1
  returning c.last_value into v;
  return p_register || '-' || y || '-' || lpad(v::text, 3, '0');
end $function$;
drop table public.project_register_settings;

-- B1 · project_actions → actions
comment on table public.project_actions is null;
alter table public.project_actions drop constraint project_actions_source_type_check;
alter table public.project_actions add constraint project_actions_source_type_check
  check (source_type = any (array['manual','risk','rfi','decision','meeting','inspection','ncr','other']));
alter policy project_actions_select on public.project_actions rename to actions_select;
alter policy project_actions_insert on public.project_actions rename to actions_insert;
alter policy project_actions_update on public.project_actions rename to actions_update;
alter policy project_actions_delete on public.project_actions rename to actions_delete;
alter trigger trg_project_actions_assign_no      on public.project_actions rename to trg_actions_assign_no;
alter trigger trg_project_actions_status_history on public.project_actions rename to trg_actions_status_history;
alter trigger trg_project_actions_updated_at     on public.project_actions rename to trg_actions_updated_at;
alter index public.idx_project_actions_project_status rename to idx_actions_project_status;
alter index public.idx_project_actions_task           rename to idx_actions_task;
alter index public.idx_project_actions_wbs            rename to idx_actions_wbs;
alter index public.idx_project_actions_area           rename to idx_actions_area;
alter index public.idx_project_actions_due            rename to idx_actions_due;
alter table public.project_actions rename constraint project_actions_pkey                     to actions_pkey;
alter table public.project_actions rename constraint project_actions_project_id_id_key        to actions_project_id_id_key;
alter table public.project_actions rename constraint project_actions_project_id_action_no_key to actions_project_id_action_no_key;
alter table public.project_actions rename constraint project_actions_status_check             to actions_status_check;
alter table public.project_actions rename constraint project_actions_priority_check           to actions_priority_check;
alter table public.project_actions rename constraint project_actions_source_type_check        to actions_source_type_check;
alter table public.project_actions rename constraint project_actions_project_id_fkey          to actions_project_id_fkey;
alter table public.project_actions rename constraint project_actions_assigned_to_fkey         to actions_assigned_to_fkey;
alter table public.project_actions rename constraint project_actions_created_by_fkey          to actions_created_by_fkey;
alter table public.project_actions rename constraint project_actions_wbs_fk                   to actions_wbs_fk;
alter table public.project_actions rename constraint project_actions_area_fk                  to actions_area_fk;
alter table public.project_actions rename constraint project_actions_task_fk                  to actions_task_fk;
alter table public.project_actions rename constraint project_actions_rfi_id_fk                to actions_rfi_id_fk;
alter table public.project_actions rename constraint project_actions_risk_id_fk               to actions_risk_id_fk;
alter table public.project_actions rename constraint project_actions_decision_id_fk           to actions_decision_id_fk;
alter table public.project_actions rename to actions;

commit;
*/
