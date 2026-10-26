-- Additive fields to match the designed Risk Register
alter table public.project_risks
  add column if not exists risk_owner uuid references public.profiles(id),
  add column if not exists mitigation_due_date date,
  add column if not exists cost_impact numeric,
  add column if not exists cost_currency text not null default 'TRY' check (cost_currency in ('TRY','USD','EUR')),
  add column if not exists time_impact_days integer,
  add column if not exists risk_score integer generated always as (probability * impact) stored;

-- Align write policies with the other registers (project control roles)
drop policy if exists authenticated_insert_risks on public.project_risks;
drop policy if exists authenticated_update_risks on public.project_risks;
drop policy if exists authenticated_delete_risks on public.project_risks;
drop policy if exists project_risks_select on public.project_risks;

create policy project_risks_select on public.project_risks
  for select to authenticated using (user_has_project_access(project_id));
create policy project_risks_insert on public.project_risks
  for insert to authenticated with check (can_write_project_control(project_id));
create policy project_risks_update on public.project_risks
  for update to authenticated
  using (can_write_project_control(project_id))
  with check (can_write_project_control(project_id));
create policy project_risks_delete on public.project_risks
  for delete to authenticated using (can_manage_project_control(project_id));

create index if not exists project_risks_risk_owner_idx on public.project_risks (risk_owner);