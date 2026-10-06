-- ============================================================
-- PROJECT CONTROL — PHASE 1 (additive only, no DROP / no data change)
-- Canonical Activity = public.project_tasks (id uuid PK, activity_id text business key)
-- Yeni tablolarda Activity FK kolonu: task_id (uuid) -> project_tasks(id)
-- ============================================================

-- 0) Composite FK hedefleri için (project_id, id) unique
alter table public.project_tasks add constraint project_tasks_project_id_id_key unique (project_id, id);
alter table public.project_risks add constraint project_risks_project_id_id_key unique (project_id, id);

-- 1) project_tasks: schedule alanları (Primavera hazırlığı; mevcut kolonlar korunur)
alter table public.project_tasks
  add column if not exists forecast_start date,
  add column if not exists forecast_end date,
  add column if not exists is_critical boolean not null default false;
alter table public.project_tasks
  add constraint project_tasks_forecast_order check (forecast_end is null or forecast_start is null or forecast_end >= forecast_start);

-- 2) Yetki yardımcıları (get_my_role + has_project_access üzerine)
create or replace function public.can_write_project_control(p_project_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.get_my_role() in ('admin','proje_yoneticisi','santiye_sefi'), false)
     and public.has_project_access(p_project_id);
$$;

create or replace function public.can_manage_project_control(p_project_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.get_my_role() in ('admin','proje_yoneticisi'), false)
     and public.has_project_access(p_project_id);
$$;

-- 3) Numaralandırma (concurrency-safe, DB seviyesinde)
create table if not exists public.project_register_counters (
  project_id text not null references public.projects(id) on delete cascade,
  register_code text not null,
  year int not null,
  last_value int not null default 0,
  primary key (project_id, register_code, year)
);
alter table public.project_register_counters enable row level security; -- policy yok: yalnızca SECURITY DEFINER fonksiyon erişir

create or replace function public.next_register_no(p_project_id text, p_register text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v int; y int := extract(year from now())::int;
begin
  insert into public.project_register_counters as c (project_id, register_code, year, last_value)
  values (p_project_id, p_register, y, 1)
  on conflict (project_id, register_code, year) do update set last_value = c.last_value + 1
  returning c.last_value into v;
  return p_register || '-' || y || '-' || lpad(v::text, 3, '0');
end $$;
revoke all on function public.next_register_no(text, text) from public, anon, authenticated;

create or replace function public.fn_assign_register_no()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare col text := tg_argv[0]; prefix text := tg_argv[1];
begin
  if coalesce(to_jsonb(new)->>col, '') = '' then
    new := jsonb_populate_record(new, jsonb_build_object(col, public.next_register_no(new.project_id, prefix)));
  end if;
  return new;
end $$;

-- 4) Status geçmişi (kritik registerlar için)
create table if not exists public.register_status_history (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  register_code text not null,
  record_id uuid not null,
  old_status text,
  new_status text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_register_status_history_rec on public.register_status_history (project_id, register_code, record_id, changed_at desc);
alter table public.register_status_history enable row level security;
drop policy if exists register_status_history_select on public.register_status_history;
create policy register_status_history_select on public.register_status_history for select to authenticated using (public.user_has_project_access(project_id));

create or replace function public.fn_log_register_status()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.register_status_history (project_id, register_code, record_id, old_status, new_status, changed_by)
    values (new.project_id, tg_argv[0], new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.register_status_history (project_id, register_code, record_id, old_status, new_status, changed_by)
    values (new.project_id, tg_argv[0], new.id, old.status, new.status, auth.uid());
  end if;
  return null;
end $$;

-- 5) Register tabloları (cross-register FK'ler 7. adımda)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  document_no text not null,
  title text not null,
  document_type text,
  discipline text,
  revision text not null default '00',
  status text not null default 'draft' check (status in ('draft','in_review','approved','issued','superseded','cancelled')),
  wbs_id uuid, area_id uuid, task_id uuid,
  storage_provider text check (storage_provider in ('onedrive','sharepoint','google_drive','supabase_storage','external')),
  storage_file_id text, storage_url text, file_name text, mime_type text,
  issue_date date, effective_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, document_no, revision)
);

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  drawing_no text not null,
  title text not null,
  discipline text,
  drawing_type text,
  revision text not null default '00',
  status text not null default 'draft' check (status in ('draft','in_review','approved','issued_for_construction','as_built','superseded','cancelled')),
  issue_date date,
  wbs_id uuid, area_id uuid, task_id uuid,
  document_id uuid,
  storage_provider text check (storage_provider in ('onedrive','sharepoint','google_drive','supabase_storage','external')),
  storage_file_id text, storage_url text,
  supersedes_drawing_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, drawing_no, revision)
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  decision_no text not null,
  title text not null,
  decision_text text not null,
  decision_date date,
  decision_maker text,
  status text not null default 'proposed' check (status in ('proposed','approved','superseded','cancelled')),
  wbs_id uuid, area_id uuid, task_id uuid,
  rfi_id uuid, risk_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, decision_no)
);

create table if not exists public.rfis (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  rfi_no text not null,
  subject text not null,
  question text not null,
  description text,
  status text not null default 'open' check (status in ('open','under_review','answered','closed','rejected')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  raised_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  responsible_discipline text,
  raised_date date not null default current_date,
  due_date date, answered_date date,
  response text,
  wbs_id uuid, area_id uuid, task_id uuid,
  drawing_id uuid, document_id uuid, decision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, rfi_no)
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  action_no text not null,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  assigned_to uuid references public.profiles(id) on delete set null,
  responsible text,
  due_date date, completed_at timestamptz,
  source_type text not null default 'manual' check (source_type in ('manual','risk','rfi','decision','meeting','inspection','ncr','other')),
  wbs_id uuid, area_id uuid, task_id uuid,
  decision_id uuid, rfi_id uuid, risk_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, action_no)
);

create table if not exists public.technical_submittals (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  submittal_no text not null,
  title text not null,
  description text,
  discipline text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','submitted','under_review','approved','approved_with_comments','rejected','resubmit_required')),
  submitted_date date, due_date date, reviewed_date date,
  reviewer_id uuid references public.profiles(id) on delete set null,
  revision text not null default '00',
  wbs_id uuid, area_id uuid, task_id uuid,
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, submittal_no)
);

create table if not exists public.material_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  approval_no text not null,
  material_name text not null,
  manufacturer text, model text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','approved_with_comments','rejected','expired')),
  submitted_date date, approved_date date,
  revision text not null default '00',
  technical_submittal_id uuid,
  wbs_id uuid, area_id uuid, task_id uuid,
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, approval_no)
);

-- 6) Mevcut tabloları genişlet (nullable, geriye dönük uyumlu)
alter table public.project_risks
  add column if not exists wbs_id uuid, add column if not exists area_id uuid, add column if not exists task_id uuid,
  add column if not exists rfi_id uuid, add column if not exists action_id uuid, add column if not exists decision_id uuid;
alter table public.purchase_requests
  add column if not exists wbs_id uuid, add column if not exists area_id uuid, add column if not exists task_id uuid,
  add column if not exists material_approval_id uuid, add column if not exists technical_submittal_id uuid;
alter table public.procurement_items
  add column if not exists wbs_id uuid, add column if not exists area_id uuid, add column if not exists task_id uuid,
  add column if not exists material_approval_id uuid;

-- 7) Foreign key'ler (hepsi project_id sınırlı composite FK)
do $$
declare t text; r text; parts text[];
begin
  -- WBS / Area / Activity (task)
  foreach t in array array['documents','drawings','decisions','rfis','actions','technical_submittals','material_approvals','project_risks','purchase_requests','procurement_items'] loop
    execute format('alter table public.%I add constraint %I foreign key (project_id, wbs_id) references public.project_wbs(project_id, id)', t, t||'_wbs_fk');
    execute format('alter table public.%I add constraint %I foreign key (project_id, area_id) references public.project_areas(project_id, id)', t, t||'_area_fk');
    execute format('alter table public.%I add constraint %I foreign key (project_id, task_id) references public.project_tasks(project_id, id)', t, t||'_task_fk');
  end loop;

  -- Register'lar arası: tablo|kolon|hedef tablo
  foreach r in array array[
    'drawings|document_id|documents','drawings|supersedes_drawing_id|drawings',
    'rfis|drawing_id|drawings','rfis|document_id|documents','rfis|decision_id|decisions',
    'decisions|rfi_id|rfis','decisions|risk_id|project_risks',
    'actions|rfi_id|rfis','actions|risk_id|project_risks','actions|decision_id|decisions',
    'project_risks|rfi_id|rfis','project_risks|action_id|actions','project_risks|decision_id|decisions',
    'technical_submittals|document_id|documents',
    'material_approvals|technical_submittal_id|technical_submittals','material_approvals|document_id|documents',
    'purchase_requests|material_approval_id|material_approvals','purchase_requests|technical_submittal_id|technical_submittals',
    'procurement_items|material_approval_id|material_approvals'
  ] loop
    parts := string_to_array(r, '|');
    execute format('alter table public.%I add constraint %I foreign key (project_id, %I) references public.%I(project_id, id)', parts[1], parts[1]||'_'||parts[2]||'_fk', parts[2], parts[3]);
  end loop;
end $$;

-- 8) RLS, updated_at, index (yeni register tabloları)
do $$
declare t text;
begin
  foreach t in array array['documents','drawings','decisions','rfis','actions','technical_submittals','material_approvals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.user_has_project_access(project_id))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_project_control(project_id))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_project_control(project_id)) with check (public.can_write_project_control(project_id))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_manage_project_control(project_id))', t||'_delete', t);

    execute format('drop trigger if exists %I on public.%I', 'trg_'||t||'_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()', 'trg_'||t||'_updated_at', t);

    execute format('create index if not exists %I on public.%I (project_id, status)', 'idx_'||t||'_project_status', t);
    execute format('create index if not exists %I on public.%I (task_id) where task_id is not null', 'idx_'||t||'_task', t);
    execute format('create index if not exists %I on public.%I (wbs_id) where wbs_id is not null', 'idx_'||t||'_wbs', t);
    execute format('create index if not exists %I on public.%I (area_id) where area_id is not null', 'idx_'||t||'_area', t);
  end loop;
end $$;

create index if not exists idx_rfis_due on public.rfis (project_id, due_date) where status in ('open','under_review');
create index if not exists idx_actions_due on public.actions (project_id, due_date) where status in ('open','in_progress');
create index if not exists idx_project_risks_task on public.project_risks (task_id) where task_id is not null;
create index if not exists idx_project_risks_wbs on public.project_risks (wbs_id) where wbs_id is not null;
create index if not exists idx_project_risks_area on public.project_risks (area_id) where area_id is not null;
create index if not exists idx_purchase_requests_task on public.purchase_requests (task_id) where task_id is not null;
create index if not exists idx_procurement_items_task on public.procurement_items (task_id) where task_id is not null;
create index if not exists idx_purchase_requests_material_approval on public.purchase_requests (material_approval_id) where material_approval_id is not null;

-- 9) Otomatik numara + status geçmişi trigger'ları
create trigger trg_rfis_assign_no before insert on public.rfis for each row execute function public.fn_assign_register_no('rfi_no','RFI');
create trigger trg_decisions_assign_no before insert on public.decisions for each row execute function public.fn_assign_register_no('decision_no','DEC');
create trigger trg_actions_assign_no before insert on public.actions for each row execute function public.fn_assign_register_no('action_no','ACT');
create trigger trg_technical_submittals_assign_no before insert on public.technical_submittals for each row execute function public.fn_assign_register_no('submittal_no','TS');
create trigger trg_material_approvals_assign_no before insert on public.material_approvals for each row execute function public.fn_assign_register_no('approval_no','MA');

create trigger trg_rfis_status_history after insert or update of status on public.rfis for each row execute function public.fn_log_register_status('rfi');
create trigger trg_decisions_status_history after insert or update of status on public.decisions for each row execute function public.fn_log_register_status('decision');
create trigger trg_actions_status_history after insert or update of status on public.actions for each row execute function public.fn_log_register_status('action');

comment on column public.project_tasks.activity_id is 'Canonical Activity iş kodu (text, proje içinde unique). Register tablolarında FK olarak project_tasks.id (task_id) kullanılır.';
comment on table public.documents is 'Project Control Document Register. Dosya konumu provider-independent (storage_provider/file_id/url).';
