create index if not exists idx_projects_procurement_completed_by
  on public.projects (procurement_completed_by)
  where procurement_completed_by is not null;
