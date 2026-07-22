create or replace function public.project_manager_update_ticket_status(
  p_ticket_id uuid,
  p_new_status text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if (select auth.uid()) is null or public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlem yalnızca proje yöneticisi tarafından yapılabilir.';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;

  if not found or not public.has_project_access(v_ticket.project_id) then
    raise exception 'Ticket bulunamadı veya bu projeye erişim yetkiniz yok.';
  end if;

  if not (
    (v_ticket.status = any (array['gönderildi', 'açık']) and p_new_status = 'işlemde')
    or (v_ticket.status = 'işlemde' and p_new_status = 'kapatıldı')
    or (v_ticket.status = any (array['gönderildi', 'açık', 'işlemde']) and p_new_status = 'iptal_edildi')
  ) then
    raise exception 'Geçersiz ticket durum geçişi: % -> %', v_ticket.status, p_new_status;
  end if;

  update public.tickets
  set status = p_new_status,
      updated_by = (select auth.uid()),
      updated_at = now(),
      resolved_at = case when p_new_status = any (array['kapatıldı', 'iptal_edildi']) then now() else null end
  where id = p_ticket_id;
end;
$$;

revoke execute on function public.project_manager_update_ticket_status(uuid, text) from public, anon;
grant execute on function public.project_manager_update_ticket_status(uuid, text) to authenticated;

alter table public.notifications
  drop constraint if exists notifications_event_type_check;

alter table public.notifications
  add constraint notifications_event_type_check
  check (event_type = any (array[
    'created', 'status_changed', 'approved', 'rejected', 'commented', 'pending', 'resolved',
    'processed_by_project_manager', 'closed_by_project_manager', 'cancelled_by_project_manager'
  ]));

create or replace function public.trg_notify_ticket_status() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor_name text;
  v_actor_role text;
begin
  if NEW.status is distinct from OLD.status then
    perform public.notify_user(NEW.created_by, NEW.updated_by, NEW.project_id, 'ticket', NEW.id,
      'status_changed', 'Ticket durumu güncellendi: ' || NEW.title, 'Yeni durum: ' || NEW.status);

    select full_name, role_key into v_actor_name, v_actor_role
    from public.profiles where id = NEW.updated_by;

    if v_actor_role = 'proje_yoneticisi' and NEW.status = 'işlemde' then
      perform public.notify_role('admin', NEW.updated_by, NEW.project_id, 'ticket', NEW.id,
        'processed_by_project_manager', coalesce(v_actor_name, 'Proje yöneticisi') || ' tarafından işleme alındı', 'Ticket: ' || NEW.title);
    elsif v_actor_role = 'proje_yoneticisi' and NEW.status = 'kapatıldı' then
      perform public.notify_role('admin', NEW.updated_by, NEW.project_id, 'ticket', NEW.id,
        'closed_by_project_manager', coalesce(v_actor_name, 'Proje yöneticisi') || ' tarafından talep kapatıldı', 'Ticket: ' || NEW.title);
    elsif v_actor_role = 'proje_yoneticisi' and NEW.status = 'iptal_edildi' then
      perform public.notify_role('admin', NEW.updated_by, NEW.project_id, 'ticket', NEW.id,
        'cancelled_by_project_manager', coalesce(v_actor_name, 'Proje yöneticisi') || ' tarafından talep iptal edildi', 'Ticket: ' || NEW.title);
    end if;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.trg_notify_ticket_status() from public, anon, authenticated;
