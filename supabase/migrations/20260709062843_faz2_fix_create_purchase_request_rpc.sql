
create or replace function public.create_purchase_request_with_items(
  p_project_id text,
  p_title text,
  p_urgency text,
  p_request_note text,
  p_requested_by uuid,
  p_items jsonb,
  p_category text default null
)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_id uuid;
begin
  insert into purchase_requests (project_id, title, urgency, request_note, status, requested_by, category)
  values (p_project_id, p_title, p_urgency, p_request_note, 'talep_olusturuldu', p_requested_by, coalesce(p_category, 'diger'))
  returning id into v_id;

  insert into purchase_request_items (request_id, name, quantity, unit, unit_price, bom_item_id)
  select
    v_id,
    trim(item->>'name'),
    coalesce((item->>'quantity')::numeric, 1),
    coalesce(item->>'unit', 'Adet'),
    nullif(item->>'unit_price', '')::numeric,
    nullif(item->>'bom_item_id', '')::uuid
  from jsonb_array_elements(p_items) as item
  where trim(item->>'name') <> '';

  return v_id;
end;
$function$;

