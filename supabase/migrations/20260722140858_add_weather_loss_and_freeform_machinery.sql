alter table public.daily_reports
  add column if not exists weather_loss_day boolean not null default false;

alter table public.machinery_logs
  drop constraint if exists machinery_logs_machine_type_check;

comment on column public.daily_reports.weather_loss_day is
  'True when the report date is recorded as a full weather-loss day.';
