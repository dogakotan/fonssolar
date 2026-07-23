create or replace function public.trg_notify_daily_report()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_project_name text;
  v_author text;
begin
  if new.auto_created_from_progress then
    return new;
  end if;

  select name into v_project_name
  from public.projects
  where id = new.project_id;

  select full_name into v_author
  from public.profiles
  where id = new.created_by;

  insert into public.notifications (
    recipient_id, actor_id, project_id, entity_type, entity_id,
    event_type, title, body
  )
  select
    p.id,
    new.created_by,
    new.project_id,
    'daily_report',
    new.id,
    case when tg_op = 'INSERT' then 'created' else 'status_changed' end,
    coalesce(v_project_name, 'Proje') ||
      case when tg_op = 'INSERT' then ' için günlük rapor girildi' else ' günlük raporu güncellendi' end,
    coalesce(v_author, 'Bir kullanıcı') || ' tarafından ' ||
      new.report_date::text ||
      case when tg_op = 'INSERT' then ' tarihli rapor oluşturuldu.' else ' tarihli rapor güncellendi.' end
  from public.profiles p
  where p.role_key = 'admin'
    and p.id is distinct from new.created_by
  on conflict (recipient_id, entity_type, entity_id)
    where entity_id is not null
  do update set
    actor_id = excluded.actor_id,
    project_id = excluded.project_id,
    event_type = excluded.event_type,
    title = excluded.title,
    body = excluded.body,
    is_read = false,
    read_at = null,
    created_at = now();

  return new;
end;
$function$;

revoke execute on function public.trg_notify_daily_report()
from public, anon, authenticated;
