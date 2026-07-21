select cron.alter_job(job_id := 1, schedule := '0 6 * * 1-5');

CREATE OR REPLACE FUNCTION public.create_daily_report_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target record;
  v_date_label text;
begin
  v_date_label := extract(day from current_date)::text || ' ' ||
    (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[extract(month from current_date)::int] || ' ' ||
    extract(year from current_date)::text;

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
      v_date_label || ' raporu henüz girilmedi',
      'Günlük saha raporunu girmeyi unutmayın.'
    );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_daily_report_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_date_label text;
begin
  if NEW.report_date = current_date then
    v_date_label := extract(day from current_date)::text || ' ' ||
      (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[extract(month from current_date)::int] || ' ' ||
      extract(year from current_date)::text;

    update notifications
    set event_type = 'resolved',
        title = v_date_label || ' raporu girildi',
        body = null
    where project_id = NEW.project_id
      and entity_type = 'daily_report_reminder'
      and event_type = 'pending'
      and created_at::date = current_date;
  end if;
  return NEW;
end;
$function$;

