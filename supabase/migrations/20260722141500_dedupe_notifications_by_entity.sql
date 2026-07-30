create unique index if not exists notifications_recipient_entity_unique
  on public.notifications (recipient_id, entity_type, entity_id)
  where entity_id is not null;

create or replace function public.notify_managers(
  p_project_id text, p_actor uuid, p_entity_type text, p_entity_id uuid,
  p_event_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.notifications (
    recipient_id, actor_id, project_id, entity_type, entity_id, event_type, title, body
  )
  select p.id, p_actor, p_project_id, p_entity_type, p_entity_id, p_event_type, p_title, p_body
  from public.profiles p
  join public.roles r on r.key = p.role_key
  where r.is_manager = true and p.id is distinct from p_actor
  on conflict (recipient_id, entity_type, entity_id) where entity_id is not null
  do update set
    actor_id = excluded.actor_id,
    project_id = excluded.project_id,
    event_type = excluded.event_type,
    title = excluded.title,
    body = excluded.body,
    is_read = false,
    read_at = null,
    created_at = now();
end;
$$;

create or replace function public.notify_role(
  p_role_key text, p_actor uuid, p_project_id text, p_entity_type text, p_entity_id uuid,
  p_event_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.notifications (
    recipient_id, actor_id, project_id, entity_type, entity_id, event_type, title, body
  )
  select p.id, p_actor, p_project_id, p_entity_type, p_entity_id, p_event_type, p_title, p_body
  from public.profiles p
  where p.role_key = p_role_key and p.id is distinct from p_actor
  on conflict (recipient_id, entity_type, entity_id) where entity_id is not null
  do update set
    actor_id = excluded.actor_id,
    project_id = excluded.project_id,
    event_type = excluded.event_type,
    title = excluded.title,
    body = excluded.body,
    is_read = false,
    read_at = null,
    created_at = now();
end;
$$;

create or replace function public.notify_user(
  p_user_id uuid, p_actor uuid, p_project_id text, p_entity_type text, p_entity_id uuid,
  p_event_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_user_id is null or p_user_id = p_actor then return; end if;

  insert into public.notifications (
    recipient_id, actor_id, project_id, entity_type, entity_id, event_type, title, body
  )
  values (
    p_user_id, p_actor, p_project_id, p_entity_type, p_entity_id, p_event_type, p_title, p_body
  )
  on conflict (recipient_id, entity_type, entity_id) where entity_id is not null
  do update set
    actor_id = excluded.actor_id,
    project_id = excluded.project_id,
    event_type = excluded.event_type,
    title = excluded.title,
    body = excluded.body,
    is_read = false,
    read_at = null,
    created_at = now();
end;
$$;
