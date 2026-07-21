drop index if exists public.invoices_active_purchase_request_id_unique;

create unique index invoices_purchase_request_id_unique
on public.invoices (purchase_request_id)
where purchase_request_id is not null;

create or replace function public.fn_guard_invoice_requires_procurement_done()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_status text;
  v_project_id text;
begin
  if new.purchase_request_id is not null then
    select status, project_id
      into v_status, v_project_id
    from public.purchase_requests
    where id = new.purchase_request_id
    for update;

    if not found then
      raise exception 'Satın alma talebi bulunamadı.';
    end if;

    if v_status <> 'satin_alindi' then
      raise exception 'Bu talep fatura eklemeye uygun değil (mevcut durum: %).', v_status;
    end if;

    if new.project_id is distinct from v_project_id then
      raise exception 'Fatura projesi satın alma talebinin projesiyle aynı olmalıdır.';
    end if;
  end if;

  return new;
end;
$function$;

