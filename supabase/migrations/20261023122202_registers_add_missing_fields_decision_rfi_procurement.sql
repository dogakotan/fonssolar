-- Decision register: deadline + impact
alter table public.decisions
  add column if not exists decision_due_date date,
  add column if not exists cost_impact numeric,
  add column if not exists cost_currency text not null default 'TRY' check (cost_currency in ('TRY','USD','EUR')),
  add column if not exists time_impact_days integer;

-- RFI register: impact flags
alter table public.rfis
  add column if not exists has_time_impact boolean not null default false,
  add column if not exists has_cost_impact boolean not null default false;

-- Procurement (purchase_requests): schedule-linked dates
alter table public.purchase_requests
  add column if not exists required_on_site_date date,
  add column if not exists planned_fat_date date,
  add column if not exists planned_shipment_date date,
  add column if not exists eta_date date,
  add column if not exists is_critical boolean not null default false;

-- Support "overdue / due soon" queries
create index if not exists decisions_due_idx on public.decisions (project_id, decision_due_date) where status = 'proposed';
create index if not exists purchase_requests_ros_idx on public.purchase_requests (project_id, required_on_site_date) where required_on_site_date is not null;