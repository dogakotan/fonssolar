create or replace function public.notify_managers(
  p_project_id text, p_actor uuid, p_entity_type text, p_entity_id uuid,
  p_event_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.notifications (recipient_id, actor_id, project_id, entity_type, entity_id, event_type, title, body)
  select p.id, p_actor, p_project_id, p_entity_type, p_entity_id, p_event_type, p_title, p_body
  from public.profiles p
  join public.roles r on r.key = p.role_key
  where r.is_manager = true and p.id is distinct from p_actor;
end;
$$;

create or replace function public.notify_role(
  p_role_key text, p_actor uuid, p_project_id text, p_entity_type text, p_entity_id uuid,
  p_event_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.notifications (recipient_id, actor_id, project_id, entity_type, entity_id, event_type, title, body)
  select p.id, p_actor, p_project_id, p_entity_type, p_entity_id, p_event_type, p_title, p_body
  from public.profiles p
  where p.role_key = p_role_key and p.id is distinct from p_actor;
end;
$$;

create or replace function public.notify_user(
  p_user_id uuid, p_actor uuid, p_project_id text, p_entity_type text, p_entity_id uuid,
  p_event_type text, p_title text, p_body text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_user_id is null or p_user_id = p_actor then return; end if;
  insert into public.notifications (recipient_id, actor_id, project_id, entity_type, entity_id, event_type, title, body)
  values (p_user_id, p_actor, p_project_id, p_entity_type, p_entity_id, p_event_type, p_title, p_body);
end;
$$;

-- daily_reports
create or replace function public.trg_notify_daily_report() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_project_name text; v_author text;
begin
  select name into v_project_name from public.projects where id = NEW.project_id;
  select full_name into v_author from public.profiles where id = NEW.created_by;
  perform public.notify_managers(NEW.project_id, NEW.created_by, 'daily_report', NEW.id, 'created',
    coalesce(v_project_name,'Proje') || ' için günlük rapor girildi',
    coalesce(v_author,'Bir kullanıcı') || ' tarafından ' || NEW.report_date::text || ' tarihli rapor oluşturuldu.');
  return NEW;
end; $$;
create trigger trg_daily_reports_notify after insert on public.daily_reports
for each row execute function public.trg_notify_daily_report();

-- purchase_requests
create or replace function public.trg_notify_purchase_request_insert() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.notify_managers(NEW.project_id, NEW.requested_by, 'purchase_request', NEW.id, 'created',
    'Yeni satın alma talebi: ' || NEW.title, 'Talep durumu: ' || NEW.status);
  return NEW;
end; $$;
create trigger trg_purchase_requests_notify_insert after insert on public.purchase_requests
for each row execute function public.trg_notify_purchase_request_insert();

create or replace function public.trg_notify_purchase_request_status() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_body text;
begin
  if NEW.status is distinct from OLD.status then
    v_body := 'Yeni durum: ' || NEW.status;
    if NEW.status in ('reddedildi','iptal') and NEW.approval_note is not null then
      v_body := v_body || ' — Gerekçe: ' || NEW.approval_note;
    end if;
    perform public.notify_user(NEW.requested_by, NEW.approved_by, NEW.project_id, 'purchase_request', NEW.id,
      'status_changed', 'Talebinizin durumu güncellendi: ' || NEW.title, v_body);
    if NEW.status = 'onaylandi' then
      perform public.notify_role('muhasebe', NEW.approved_by, NEW.project_id, 'purchase_request', NEW.id,
        'approved', 'Fatura eklenecek onaylı talep: ' || NEW.title, 'Onaylanan talep için fatura girişi bekleniyor.');
    end if;
  end if;
  return NEW;
end; $$;
create trigger trg_purchase_requests_notify_status after update on public.purchase_requests
for each row execute function public.trg_notify_purchase_request_status();

-- invoices
create or replace function public.trg_notify_invoice_insert() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.notify_managers(NEW.project_id, NEW.created_by, 'invoice', NEW.id, 'created',
    'Yeni fatura onay bekliyor: ' || NEW.invoice_no, 'Tutar: ' || NEW.amount::text);
  return NEW;
end; $$;
create trigger trg_invoices_notify_insert after insert on public.invoices
for each row execute function public.trg_notify_invoice_insert();

create or replace function public.trg_notify_invoice_status() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_pr_owner uuid;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('onaylandı','reddedildi') then
    perform public.notify_user(NEW.created_by, null, NEW.project_id, 'invoice', NEW.id,
      case when NEW.status='onaylandı' then 'approved' else 'rejected' end,
      'Fatura ' || NEW.invoice_no || ' ' || NEW.status, 'Fatura durumu güncellendi.');
    if NEW.purchase_request_id is not null then
      select requested_by into v_pr_owner from public.purchase_requests where id = NEW.purchase_request_id;
      perform public.notify_user(v_pr_owner, null, NEW.project_id, 'invoice', NEW.id,
        case when NEW.status='onaylandı' then 'approved' else 'rejected' end,
        'Talebinizin faturası ' || NEW.status, 'Fatura no: ' || NEW.invoice_no);
    end if;
  end if;
  return NEW;
end; $$;
create trigger trg_invoices_notify_status after update on public.invoices
for each row execute function public.trg_notify_invoice_status();
comment on function public.trg_notify_invoice_status() is
  'FAZ3''te invoices.status ASCII snake_case''e normalize edilince buradaki onaylandı/reddedildi literalleri de güncellenmeli.';

-- tickets
create or replace function public.trg_notify_ticket_insert() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.notify_managers(NEW.project_id, NEW.created_by, 'ticket', NEW.id, 'created',
    'Yeni ticket: ' || NEW.title, 'Kategori: ' || NEW.category || ', Önem: ' || NEW.severity);
  return NEW;
end; $$;
create trigger trg_tickets_notify_insert after insert on public.tickets
for each row execute function public.trg_notify_ticket_insert();

create or replace function public.trg_notify_ticket_status() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if NEW.status is distinct from OLD.status then
    perform public.notify_user(NEW.created_by, NEW.updated_by, NEW.project_id, 'ticket', NEW.id,
      'status_changed', 'Ticket durumu güncellendi: ' || NEW.title, 'Yeni durum: ' || NEW.status);
  end if;
  return NEW;
end; $$;
create trigger trg_tickets_notify_status after update on public.tickets
for each row execute function public.trg_notify_ticket_status();

-- ticket_comments
create or replace function public.trg_notify_ticket_comment() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_ticket record;
begin
  select created_by, project_id, title into v_ticket from public.tickets where id = NEW.ticket_id;
  perform public.notify_user(v_ticket.created_by, NEW.user_id, v_ticket.project_id, 'ticket', NEW.ticket_id,
    'commented', 'Ticketınıza yorum yapıldı: ' || v_ticket.title, left(NEW.content, 200));
  return NEW;
end; $$;
create trigger trg_ticket_comments_notify after insert on public.ticket_comments
for each row execute function public.trg_notify_ticket_comment();

