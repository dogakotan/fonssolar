CREATE TABLE project_category_weights (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  category task_category not null,
  weight_pct numeric not null check (weight_pct >= 0 and weight_pct <= 100),
  created_at timestamptz not null default now(),
  unique(project_id, category)
);

alter table project_category_weights enable row level security;

create policy project_category_weights_select on project_category_weights
  for select
  using (has_project_access(project_id));

