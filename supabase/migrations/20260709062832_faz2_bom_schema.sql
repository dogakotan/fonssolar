
alter table public.procurement_items
  add column planned_qty numeric;

update public.procurement_items
  set planned_qty = quantity::numeric
  where quantity ~ '^[0-9]+(\.[0-9]+)?$';

alter table public.purchase_request_items
  add column bom_item_id uuid references public.procurement_items(id);

alter table public.purchase_requests
  drop constraint purchase_requests_category_check;

alter table public.purchase_requests
  add constraint purchase_requests_category_check
  check (category is null or category = any (array['malzeme','hizmet','diger']));

update public.purchase_requests
  set category = 'diger'
  where category is null;

