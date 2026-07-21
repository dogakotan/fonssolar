
-- Trigger fonksiyonu
create or replace function fn_ticket_history()
returns trigger
language plpgsql
security definer
as $$
declare
  v_changed_by uuid;
begin
  -- updated_by varsa onu kullan, yoksa created_by'a düş
  v_changed_by := coalesce(NEW.updated_by, NEW.created_by);

  if NEW.status        is distinct from OLD.status then
    insert into ticket_history(ticket_id, changed_by, field, old_value, new_value)
    values (NEW.id, v_changed_by, 'status', OLD.status, NEW.status);
  end if;

  if NEW.severity      is distinct from OLD.severity then
    insert into ticket_history(ticket_id, changed_by, field, old_value, new_value)
    values (NEW.id, v_changed_by, 'severity', OLD.severity, NEW.severity);
  end if;

  if NEW.assigned_to   is distinct from OLD.assigned_to then
    insert into ticket_history(ticket_id, changed_by, field, old_value, new_value)
    values (NEW.id, v_changed_by, 'assigned_to',
            OLD.assigned_to::text, NEW.assigned_to::text);
  end if;

  if NEW.title         is distinct from OLD.title then
    insert into ticket_history(ticket_id, changed_by, field, old_value, new_value)
    values (NEW.id, v_changed_by, 'title', OLD.title, NEW.title);
  end if;

  if NEW.description   is distinct from OLD.description then
    insert into ticket_history(ticket_id, changed_by, field, old_value, new_value)
    values (NEW.id, v_changed_by, 'description', OLD.description, NEW.description);
  end if;

  if NEW.category      is distinct from OLD.category then
    insert into ticket_history(ticket_id, changed_by, field, old_value, new_value)
    values (NEW.id, v_changed_by, 'category', OLD.category, NEW.category);
  end if;

  if NEW.location      is distinct from OLD.location then
    insert into ticket_history(ticket_id, changed_by, field, old_value, new_value)
    values (NEW.id, v_changed_by, 'location', OLD.location, NEW.location);
  end if;

  return NEW;
end;
$$;

-- Varsa eski trigger'ı düşür, temiz kur
drop trigger if exists trg_ticket_history on tickets;

create trigger trg_ticket_history
after update on tickets
for each row
execute function fn_ticket_history();

