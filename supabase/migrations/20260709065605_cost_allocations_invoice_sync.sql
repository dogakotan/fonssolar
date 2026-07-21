
create unique index if not exists cost_allocations_invoice_uidx on cost_allocations(invoice_id);

create or replace function public.sync_cost_allocation_from_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if NEW.status in ('onaylandı','ödendi') then
    insert into cost_allocations (invoice_id, project_id, amount, category, note, allocated_at)
    values (NEW.id, NEW.project_id, NEW.total_amount, NEW.category, 'Fatura onayından otomatik', now())
    on conflict (invoice_id) do update
      set amount = excluded.amount, category = excluded.category, project_id = excluded.project_id;
  else
    delete from cost_allocations where invoice_id = NEW.id;
  end if;
  return NEW;
end; $$;

create trigger trg_invoice_cost_allocation
after insert or update of status, total_amount on invoices
for each row execute function public.sync_cost_allocation_from_invoice();

insert into cost_allocations (invoice_id, project_id, amount, category, note, allocated_at)
select id, project_id, total_amount, category, 'Geriye dönük yükleme', coalesce(updated_at, created_at, now())
from invoices where status in ('onaylandı','ödendi')
on conflict (invoice_id) do nothing;

