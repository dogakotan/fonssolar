
create or replace function create_purchase_request_with_items(
  p_project_id   text,
  p_title        text,
  p_urgency      text,
  p_request_note text,
  p_requested_by uuid,
  p_items        jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into purchase_requests (project_id, title, urgency, request_note, status, requested_by)
  values (p_project_id, p_title, p_urgency, p_request_note, 'bekliyor', p_requested_by)
  returning id into v_id;

  insert into purchase_request_items (request_id, name, quantity, unit, unit_price)
  select
    v_id,
    trim(item->>'name'),
    coalesce((item->>'quantity')::numeric, 1),
    coalesce(item->>'unit', 'Adet'),
    nullif(item->>'unit_price', '')::numeric
  from jsonb_array_elements(p_items) as item
  where trim(item->>'name') <> '';

  return v_id;
end;
$$;

