create extension if not exists pg_cron;

create or replace function public.create_daily_report_reminders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_target record;
begin
  for v_target in
    select distinct p.id as profile_id, pr.project_id
    from profiles p
    join lateral (
      select p.project_id as project_id
      union
      select upa.project_id from user_project_access upa where upa.user_id = p.id
    ) pr on pr.project_id is not null
    where p.role_key = 'santiye_sefi'
  loop
    if exists (
      select 1 from daily_reports
      where project_id = v_target.project_id and report_date = current_date
    ) then
      continue;
    end if;

    if exists (
      select 1 from notifications
      where recipient_id = v_target.profile_id
        and project_id = v_target.project_id
        and entity_type = 'daily_report_reminder'
        and event_type = 'pending'
        and created_at::date = current_date
    ) then
      continue;
    end if;

    perform notify_user(
      v_target.profile_id, null, v_target.project_id,
      'daily_report_reminder', gen_random_uuid(), 'pending',
      'Bugünkü rapor henüz girilmedi',
      'Günlük saha raporunu girmeyi unutmayın.'
    );
  end loop;
end;
$$;

create or replace function public.resolve_daily_report_reminder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.report_date = current_date then
    update notifications
    set event_type = 'resolved',
        title = 'Bugünkü rapor girildi',
        body = null
    where project_id = NEW.project_id
      and entity_type = 'daily_report_reminder'
      and event_type = 'pending'
      and created_at::date = current_date;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_resolve_daily_report_reminder on daily_reports;
create trigger trg_resolve_daily_report_reminder
after insert or update on daily_reports
for each row execute function public.resolve_daily_report_reminder();

select cron.schedule(
  'daily-report-reminders',
  '0 6 * * *',
  $$select public.create_daily_report_reminders();$$
);

