
alter table public.purchase_requests
  drop constraint purchase_requests_project_id_fkey;

alter table public.purchase_requests
  add constraint purchase_requests_project_id_fkey
  foreign key (project_id)
  references public.projects(id)
  on delete restrict;

alter table public.purchase_requests
  alter column project_id set not null;

create or replace function public.create_purchase_request_with_items(
  p_project_id text,
  p_title text,
  p_urgency text,
  p_request_note text,
  p_requested_by uuid,
  p_items jsonb,
  p_category text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if p_requested_by is distinct from auth.uid() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if p_project_id is null or btrim(p_project_id) = '' then
    raise exception 'Proje seçimi zorunludur.';
  end if;

  if not exists (
    select 1
    from public.projects
    where id = p_project_id
  ) then
    raise exception 'Seçilen proje bulunamadı.';
  end if;

  if not public.has_project_access(p_project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  insert into public.purchase_requests (
    project_id, title, urgency, request_note, status, requested_by, category
  )
  values (
    p_project_id, p_title, p_urgency, p_request_note,
    'talep_olusturuldu', p_requested_by, coalesce(p_category, 'diger')
  )
  returning id into v_id;

  insert into public.purchase_request_items (
    request_id, name, quantity, unit, unit_price, bom_item_id
  )
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

