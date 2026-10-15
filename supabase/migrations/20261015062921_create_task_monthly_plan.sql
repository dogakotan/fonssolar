create table public.task_monthly_plan (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  task_id uuid not null,
  month date not null check (extract(day from month) = 1),
  planned_qty numeric not null check (planned_qty >= 0),
  source text not null default 'manuel' check (source in ('excel_aylik','hesaplanan','manuel')),
  source_code text,
  source_qty numeric,
  source_unit text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_monthly_plan_task_fk foreign key (project_id, task_id) references public.project_tasks(project_id, id) on delete cascade,
  constraint task_monthly_plan_unique unique (task_id, month)
);

comment on table public.task_monthly_plan is 'Görev bazında aylık planlanan imalat. planned_qty görevin biriminde ve toplamı görevin target_qty değerine eşittir; source_qty/source_unit Excel Aylık İş Planı ham değeridir.';
comment on column public.task_monthly_plan.source is 'excel_aylik: Excel Aylık İş Planından; hesaplanan: gün bazlı orantılı dağıtım; manuel: kullanıcı girişi';

create index task_monthly_plan_project_month_idx on public.task_monthly_plan(project_id, month);

create trigger trg_task_monthly_plan_updated_at
before update on public.task_monthly_plan
for each row execute function public.update_updated_at_column();

alter table public.task_monthly_plan enable row level security;

create policy task_monthly_plan_select on public.task_monthly_plan
for select using (user_has_project_access(project_id));

create policy task_monthly_plan_insert on public.task_monthly_plan
for insert to authenticated with check (
  (get_my_role() = 'admin')
  or ((get_my_role() = 'proje_yoneticisi') and has_project_access(project_id)));

create policy task_monthly_plan_update on public.task_monthly_plan
for update to authenticated using (
  (get_my_role() = 'admin')
  or ((get_my_role() = 'proje_yoneticisi') and has_project_access(project_id)));

create policy task_monthly_plan_delete on public.task_monthly_plan
for delete to authenticated using (
  (get_my_role() = 'admin')
  or ((get_my_role() = 'proje_yoneticisi') and has_project_access(project_id)));

-- Aylık plan vs gerçekleşen (günlük raporlardan), çağıranın RLS'i ile çalışır
create view public.vw_task_monthly_plan_vs_actual with (security_invoker = true) as
with actual as (
  select pd.task_id, date_trunc('month', dr.report_date)::date as month, sum(pd.qty_added) as actual_qty
  from public.progress_daily pd
  join public.daily_reports dr on dr.id = pd.report_id
  where pd.task_id is not null
  group by 1, 2
), keys as (
  select task_id, month from public.task_monthly_plan
  union
  select task_id, month from actual
)
select t.project_id, t.id as task_id, t.task_code, t.task_name, t.group_label, t.category, t.unit,
       t.target_qty, k.month,
       coalesce(mp.planned_qty, 0) as planned_qty,
       coalesce(a.actual_qty, 0) as actual_qty,
       sum(coalesce(mp.planned_qty, 0)) over w as planned_cum,
       sum(coalesce(a.actual_qty, 0)) over w as actual_cum,
       mp.source, mp.note
from keys k
join public.project_tasks t on t.id = k.task_id
left join public.task_monthly_plan mp on mp.task_id = k.task_id and mp.month = k.month
left join actual a on a.task_id = k.task_id and a.month = k.month
window w as (partition by k.task_id order by k.month rows between unbounded preceding and current row);

comment on view public.vw_task_monthly_plan_vs_actual is 'Görev x ay: planlanan, gerçekleşen (progress_daily), kümülatifler. security_invoker: RLS uygulanır.';