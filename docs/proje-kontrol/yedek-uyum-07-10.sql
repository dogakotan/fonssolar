-- ============================================================================
-- UYUM MIGRATION'I ÖNCESİ ANLIK GÖRÜNTÜ — geri yükleme betiği
-- Alındığı an: 07.10.2026, canlı katalogdan salt okunur SELECT ile (information_schema.columns,
-- pg_constraint, pg_indexes, pg_trigger, pg_policies, role_table_grants, pg_get_functiondef, proacl).
-- Kapsam: uyum migration'ının (taslak-sql/uyum_migration_taslak.sql) değiştirdiği nesnelerin tamamı —
--   tablolar: actions, documents, drawings, project_register_counters (kolon sırası birebir)
--   bunlara gelen FK'ler: rfis/technical_submittals/material_approvals → documents,
--                         rfis → drawings, project_risks → actions
--   fonksiyonlar: next_register_no (değişiyor), fn_assign_register_no (değişmiyor, referans için)
--   project_tasks.is_critical kolonu
-- Tam şema dökümü DEĞİLDİR. Tablolar boş olduğu için yapı görüntüsü yeterlidir.
--
-- Belgelenen veri durumu (aynı an):
--   actions 0, documents 0, drawings 0, project_register_counters 0, register_status_history 0 satır;
--   project_tasks 228 satır, is_critical = true olan 0 satır (DEFAULT false, NOT NULL, attnum 37).
--   Sorgu: select count(*) filter (where is_critical), count(*) from public.project_tasks;  → 0 | 228
--
-- Ne zaman kullanılır: uyum migration'ı uygulandıktan sonra BÖLÜM B (ters SQL) yetmezse veya
-- kolon sırasının da birebir dönmesi istenirse. Tek transaction; tablolar boş değilse durur.
-- ============================================================================

begin;

do $$
declare n bigint := 0;
begin
  if to_regclass('public.project_actions') is not null then execute 'select count(*) from public.project_actions' into n; end if;
  n := n + (select count(*) from public.documents) + (select count(*) from public.drawings)
         + (select count(*) from public.project_register_counters);
  if to_regclass('public.document_revisions') is not null then
    n := n + (select count(*) from public.document_revisions);
  end if;
  if n > 0 then raise exception 'Geri yükleme durduruldu: % satır var', n; end if;
end $$;

-- ── 1. Migration'ın eklediği nesneleri kaldır ──
drop table if exists public.document_revisions;
drop trigger if exists trg_documents_assign_no on public.documents;

-- ── 2. Gelen FK'leri bırak (tablolar yeniden kurulacak) ──
alter table public.rfis                 drop constraint if exists rfis_document_id_fk;
alter table public.technical_submittals drop constraint if exists technical_submittals_document_id_fk;
alter table public.material_approvals   drop constraint if exists material_approvals_document_id_fk;
alter table public.rfis                 drop constraint if exists rfis_drawing_id_fk;
alter table public.project_risks        drop constraint if exists project_risks_action_id_fk;

drop table if exists public.drawings;
drop table if exists public.documents;
drop table if exists public.project_actions;
drop table if exists public.actions;
drop table if exists public.project_register_counters;
drop table if exists public.project_register_settings;

-- ── 3. Tablolar (özgün kolon sırası) ──
create table public.documents (
  id uuid not null default gen_random_uuid(),
  project_id text not null,
  document_no text not null,
  title text not null,
  document_type text,
  discipline text,
  revision text not null default '00'::text,
  status text not null default 'draft'::text,
  wbs_id uuid,
  area_id uuid,
  task_id uuid,
  storage_provider text,
  storage_file_id text,
  storage_url text,
  file_name text,
  mime_type text,
  issue_date date,
  effective_date date,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.documents add constraint documents_pkey primary key (id);
alter table public.documents add constraint documents_project_id_id_key unique (project_id, id);
alter table public.documents add constraint documents_project_id_document_no_revision_key unique (project_id, document_no, revision);
alter table public.documents add constraint documents_status_check check ((status = any (array['draft'::text, 'in_review'::text, 'approved'::text, 'issued'::text, 'superseded'::text, 'cancelled'::text])));
alter table public.documents add constraint documents_storage_provider_check check ((storage_provider = any (array['onedrive'::text, 'sharepoint'::text, 'google_drive'::text, 'supabase_storage'::text, 'external'::text])));
alter table public.documents add constraint documents_project_id_fkey foreign key (project_id) references projects(id) on delete cascade;
alter table public.documents add constraint documents_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table public.documents add constraint documents_wbs_fk foreign key (project_id, wbs_id) references project_wbs(project_id, id);
alter table public.documents add constraint documents_area_fk foreign key (project_id, area_id) references project_areas(project_id, id);
alter table public.documents add constraint documents_task_fk foreign key (project_id, task_id) references project_tasks(project_id, id);

create table public.drawings (
  id uuid not null default gen_random_uuid(),
  project_id text not null,
  drawing_no text not null,
  title text not null,
  discipline text,
  drawing_type text,
  revision text not null default '00'::text,
  status text not null default 'draft'::text,
  issue_date date,
  wbs_id uuid,
  area_id uuid,
  task_id uuid,
  document_id uuid,
  storage_provider text,
  storage_file_id text,
  storage_url text,
  supersedes_drawing_id uuid,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.drawings add constraint drawings_pkey primary key (id);
alter table public.drawings add constraint drawings_project_id_id_key unique (project_id, id);
alter table public.drawings add constraint drawings_project_id_drawing_no_revision_key unique (project_id, drawing_no, revision);
alter table public.drawings add constraint drawings_status_check check ((status = any (array['draft'::text, 'in_review'::text, 'approved'::text, 'issued_for_construction'::text, 'as_built'::text, 'superseded'::text, 'cancelled'::text])));
alter table public.drawings add constraint drawings_storage_provider_check check ((storage_provider = any (array['onedrive'::text, 'sharepoint'::text, 'google_drive'::text, 'supabase_storage'::text, 'external'::text])));
alter table public.drawings add constraint drawings_project_id_fkey foreign key (project_id) references projects(id) on delete cascade;
alter table public.drawings add constraint drawings_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table public.drawings add constraint drawings_wbs_fk foreign key (project_id, wbs_id) references project_wbs(project_id, id);
alter table public.drawings add constraint drawings_area_fk foreign key (project_id, area_id) references project_areas(project_id, id);
alter table public.drawings add constraint drawings_task_fk foreign key (project_id, task_id) references project_tasks(project_id, id);
alter table public.drawings add constraint drawings_document_id_fk foreign key (project_id, document_id) references documents(project_id, id);
alter table public.drawings add constraint drawings_supersedes_drawing_id_fk foreign key (project_id, supersedes_drawing_id) references drawings(project_id, id);

create table public.actions (
  id uuid not null default gen_random_uuid(),
  project_id text not null,
  action_no text not null,
  title text not null,
  description text,
  status text not null default 'open'::text,
  priority text not null default 'medium'::text,
  assigned_to uuid,
  responsible text,
  due_date date,
  completed_at timestamp with time zone,
  source_type text not null default 'manual'::text,
  wbs_id uuid,
  area_id uuid,
  task_id uuid,
  decision_id uuid,
  rfi_id uuid,
  risk_id uuid,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.actions add constraint actions_pkey primary key (id);
alter table public.actions add constraint actions_project_id_id_key unique (project_id, id);
alter table public.actions add constraint actions_project_id_action_no_key unique (project_id, action_no);
alter table public.actions add constraint actions_status_check check ((status = any (array['open'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text])));
alter table public.actions add constraint actions_priority_check check ((priority = any (array['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
alter table public.actions add constraint actions_source_type_check check ((source_type = any (array['manual'::text, 'risk'::text, 'rfi'::text, 'decision'::text, 'meeting'::text, 'inspection'::text, 'ncr'::text, 'other'::text])));
alter table public.actions add constraint actions_project_id_fkey foreign key (project_id) references projects(id) on delete cascade;
alter table public.actions add constraint actions_assigned_to_fkey foreign key (assigned_to) references profiles(id) on delete set null;
alter table public.actions add constraint actions_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table public.actions add constraint actions_wbs_fk foreign key (project_id, wbs_id) references project_wbs(project_id, id);
alter table public.actions add constraint actions_area_fk foreign key (project_id, area_id) references project_areas(project_id, id);
alter table public.actions add constraint actions_task_fk foreign key (project_id, task_id) references project_tasks(project_id, id);
alter table public.actions add constraint actions_rfi_id_fk foreign key (project_id, rfi_id) references rfis(project_id, id);
alter table public.actions add constraint actions_risk_id_fk foreign key (project_id, risk_id) references project_risks(project_id, id);
alter table public.actions add constraint actions_decision_id_fk foreign key (project_id, decision_id) references decisions(project_id, id);

create table public.project_register_counters (
  project_id text not null,
  register_code text not null,
  year integer not null,
  last_value integer not null default 0
);
alter table public.project_register_counters add constraint project_register_counters_pkey primary key (project_id, register_code, year);
alter table public.project_register_counters add constraint project_register_counters_project_id_fkey foreign key (project_id) references projects(id) on delete cascade;

-- ── 4. Gelen FK'ler ──
alter table public.rfis                 add constraint rfis_document_id_fk foreign key (project_id, document_id) references documents(project_id, id);
alter table public.technical_submittals add constraint technical_submittals_document_id_fk foreign key (project_id, document_id) references documents(project_id, id);
alter table public.material_approvals   add constraint material_approvals_document_id_fk foreign key (project_id, document_id) references documents(project_id, id);
alter table public.rfis                 add constraint rfis_drawing_id_fk foreign key (project_id, drawing_id) references drawings(project_id, id);
alter table public.project_risks        add constraint project_risks_action_id_fk foreign key (project_id, action_id) references actions(project_id, id);

-- ── 5. Index'ler (PK/UNIQUE dışındakiler) ──
create index idx_documents_project_status on public.documents using btree (project_id, status);
create index idx_documents_task on public.documents using btree (task_id) where (task_id is not null);
create index idx_documents_wbs on public.documents using btree (wbs_id) where (wbs_id is not null);
create index idx_documents_area on public.documents using btree (area_id) where (area_id is not null);
create index idx_drawings_project_status on public.drawings using btree (project_id, status);
create index idx_drawings_task on public.drawings using btree (task_id) where (task_id is not null);
create index idx_drawings_wbs on public.drawings using btree (wbs_id) where (wbs_id is not null);
create index idx_drawings_area on public.drawings using btree (area_id) where (area_id is not null);
create index idx_actions_project_status on public.actions using btree (project_id, status);
create index idx_actions_task on public.actions using btree (task_id) where (task_id is not null);
create index idx_actions_wbs on public.actions using btree (wbs_id) where (wbs_id is not null);
create index idx_actions_area on public.actions using btree (area_id) where (area_id is not null);
create index idx_actions_due on public.actions using btree (project_id, due_date) where (status = any (array['open'::text, 'in_progress'::text]));

-- ── 6. Trigger'lar ──
create trigger trg_documents_updated_at before update on public.documents for each row execute function update_updated_at_column();
create trigger trg_drawings_updated_at before update on public.drawings for each row execute function update_updated_at_column();
create trigger trg_actions_assign_no before insert on public.actions for each row execute function fn_assign_register_no('action_no', 'ACT');
create trigger trg_actions_status_history after insert or update of status on public.actions for each row execute function fn_log_register_status('action');
create trigger trg_actions_updated_at before update on public.actions for each row execute function update_updated_at_column();

-- ── 7. RLS ve policy'ler (hepsinde RLS açık, FORCE kapalı) ──
alter table public.documents enable row level security;
alter table public.drawings enable row level security;
alter table public.actions enable row level security;
alter table public.project_register_counters enable row level security;  -- bilerek policy yok

create policy documents_select on public.documents for select to authenticated using (user_has_project_access(project_id));
create policy documents_insert on public.documents for insert to authenticated with check (can_write_project_control(project_id));
create policy documents_update on public.documents for update to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy documents_delete on public.documents for delete to authenticated using (can_manage_project_control(project_id));
create policy drawings_select on public.drawings for select to authenticated using (user_has_project_access(project_id));
create policy drawings_insert on public.drawings for insert to authenticated with check (can_write_project_control(project_id));
create policy drawings_update on public.drawings for update to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy drawings_delete on public.drawings for delete to authenticated using (can_manage_project_control(project_id));
create policy actions_select on public.actions for select to authenticated using (user_has_project_access(project_id));
create policy actions_insert on public.actions for insert to authenticated with check (can_write_project_control(project_id));
create policy actions_update on public.actions for update to authenticated using (can_write_project_control(project_id)) with check (can_write_project_control(project_id));
create policy actions_delete on public.actions for delete to authenticated using (can_manage_project_control(project_id));

-- ── 8. Yetkiler (07.10.2026 G-01 sonrası hali: authenticated yalnızca SELECT; anon yok) ──
revoke all on public.documents, public.drawings, public.actions, public.project_register_counters from anon, authenticated;
grant select on public.documents, public.drawings, public.actions to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.documents, public.drawings, public.actions, public.project_register_counters to service_role;

-- ── 9. Yorumlar ──
comment on table public.documents is 'Project Control Document Register. Dosya konumu provider-independent (storage_provider/file_id/url).';
comment on table public.project_register_counters is 'Numaralandırma sayaçları. RLS açık ve bilerek policy YOK; authenticated erişimi yok. Yalnızca SECURITY DEFINER next_register_no() yazar.';

-- ── 10. Fonksiyonlar (pg_get_functiondef birebir; ACL: postgres + service_role EXECUTE) ──
CREATE OR REPLACE FUNCTION public.next_register_no(p_project_id text, p_register text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v int; y int := extract(year from now())::int;
begin
  insert into public.project_register_counters as c (project_id, register_code, year, last_value)
  values (p_project_id, p_register, y, 1)
  on conflict (project_id, register_code, year) do update set last_value = c.last_value + 1
  returning c.last_value into v;
  return p_register || '-' || y || '-' || lpad(v::text, 3, '0');
end $function$;
revoke all on function public.next_register_no(text, text) from public, anon, authenticated;
grant execute on function public.next_register_no(text, text) to service_role;

-- fn_assign_register_no migration'da DEĞİŞMİYOR; referans olarak:
CREATE OR REPLACE FUNCTION public.fn_assign_register_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare col text := tg_argv[0]; prefix text := tg_argv[1];
begin
  if coalesce(to_jsonb(new)->>col, '') = '' then
    new := jsonb_populate_record(new, jsonb_build_object(col, public.next_register_no(new.project_id, prefix)));
  end if;
  return new;
end $function$;
revoke all on function public.fn_assign_register_no() from public, anon, authenticated;
grant execute on function public.fn_assign_register_no() to service_role;

-- ── 11. project_tasks.is_critical (değerlerin hepsi false'tu; kolon sona eklenir, özgün sıra 37) ──
alter table public.project_tasks add column if not exists is_critical boolean not null default false;

commit;
