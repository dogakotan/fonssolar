
alter table public.procurement_item_change_requests
  add constraint picr_new_planned_qty_positive
  check (new_planned_qty is not null and new_planned_qty > 0);

create unique index picr_one_pending_per_item
  on public.procurement_item_change_requests(procurement_item_id)
  where status = 'bekliyor' and procurement_item_id is not null;

create unique index procurement_items_project_equipment_unique
  on public.procurement_items(project_id, lower(btrim(equipment)));

create unique index picr_pending_new_equipment_unique
  on public.procurement_item_change_requests(project_id, lower(btrim(new_equipment)))
  where status = 'bekliyor' and procurement_item_id is null;

create or replace function public.create_procurement_item_change_request(
  p_procurement_item_id uuid,
  p_new_planned_qty numeric,
  p_note text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_project_id text;
  v_old_qty numeric;
  v_id uuid;
begin
  if p_new_planned_qty is null or p_new_planned_qty <= 0 then
    raise exception 'Planlanan miktar sıfırdan büyük olmalıdır.';
  end if;

  select project_id, planned_qty into v_project_id, v_old_qty
  from public.procurement_items
  where id = p_procurement_item_id;

  if v_project_id is null then
    raise exception 'Malzeme kalemi bulunamadı';
  end if;

  if not public.has_project_access(v_project_id)
     or public.get_my_role() not in ('admin', 'proje_yoneticisi') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if exists (
    select 1
    from public.procurement_item_change_requests
    where procurement_item_id = p_procurement_item_id
      and status = 'bekliyor'
  ) then
    raise exception 'Bu malzeme için zaten onay bekleyen bir değişiklik talebi var.';
  end if;

  insert into public.procurement_item_change_requests (
    procurement_item_id, project_id, old_planned_qty,
    new_planned_qty, note, requested_by
  ) values (
    p_procurement_item_id, v_project_id, v_old_qty,
    p_new_planned_qty, p_note, auth.uid()
  )
  returning id into v_id;

  perform public.notify_managers(
    v_project_id, auth.uid(), 'procurement_item_change_request', v_id, 'pending',
    'Malzeme miktarı değişikliği onay bekliyor',
    format(
      'Planlanan miktar %s → %s olarak değiştirilmek isteniyor.',
      coalesce(v_old_qty::text, '—'),
      p_new_planned_qty::text
    )
  );

  return v_id;
end;
$function$;

create or replace function public.create_procurement_item_add_request(
  p_project_id text,
  p_equipment text,
  p_unit text,
  p_category text,
  p_planned_qty numeric,
  p_note text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_equipment text;
  v_id uuid;
begin
  if not public.has_project_access(p_project_id)
     or public.get_my_role() not in ('admin', 'proje_yoneticisi') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  v_equipment := trim(p_equipment);
  if coalesce(v_equipment, '') = '' then
    raise exception 'Malzeme adı zorunludur.';
  end if;

  if p_planned_qty is null or p_planned_qty <= 0 then
    raise exception 'Planlanan miktar sıfırdan büyük olmalıdır.';
  end if;

  if exists (
    select 1
    from public.procurement_items
    where project_id = p_project_id
      and lower(btrim(equipment)) = lower(btrim(v_equipment))
  ) then
    raise exception 'Bu projede aynı isimde bir malzeme zaten bulunuyor.';
  end if;

  if exists (
    select 1
    from public.procurement_item_change_requests
    where project_id = p_project_id
      and procurement_item_id is null
      and status = 'bekliyor'
      and lower(btrim(new_equipment)) = lower(btrim(v_equipment))
  ) then
    raise exception 'Bu malzeme için zaten onay bekleyen bir ekleme talebi var.';
  end if;

  insert into public.procurement_item_change_requests (
    procurement_item_id, project_id, old_planned_qty,
    new_planned_qty, note, requested_by,
    new_equipment, new_unit, new_category
  ) values (
    null, p_project_id, null,
    p_planned_qty, p_note, auth.uid(),
    v_equipment, nullif(trim(p_unit), ''), nullif(trim(p_category), '')
  )
  returning id into v_id;

  perform public.notify_managers(
    p_project_id, auth.uid(), 'procurement_item_change_request', v_id, 'pending',
    'Yeni malzeme ekleme talebi onay bekliyor',
    format(
      '%s (%s %s) malzeme listesine eklenmek isteniyor.',
      v_equipment,
      p_planned_qty::text,
      coalesce(nullif(trim(p_unit), ''), '')
    )
  );

  return v_id;
end;
$function$;

