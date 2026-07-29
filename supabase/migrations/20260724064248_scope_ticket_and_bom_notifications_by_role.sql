-- Ticket oluşturma bildirimi artık ticket'ı gerçekten yönetebilen rollere gidiyor
-- (admin + proje_yoneticisi, ikisi de tickets sekmesinde tam yetkili) — önceki
-- notify_managers() çağrısı is_manager=true olan HER role (admin + muhasebe)
-- gidiyordu, ama muhasebe'nin roles.allowed_tabs'ında 'tickets' hiç yok; bu
-- bildirimi görse bile tıklayacağı bir yer olmadığından saf gürültüydü.
CREATE OR REPLACE FUNCTION public.trg_notify_ticket_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.notify_role('admin', NEW.created_by, NEW.project_id, 'ticket', NEW.id, 'created',
    'Yeni ticket: ' || NEW.title, 'Kategori: ' || NEW.category || ', Önem: ' || NEW.severity);
  perform public.notify_role('proje_yoneticisi', NEW.created_by, NEW.project_id, 'ticket', NEW.id, 'created',
    'Yeni ticket: ' || NEW.title, 'Kategori: ' || NEW.category || ', Önem: ' || NEW.severity);
  return NEW;
end; $function$;

-- Malzeme listesi (BOM) değişiklik/ekleme taleplerini yalnızca admin onaylayabiliyor
-- (review_procurement_item_change_request admin-only) — notify_managers() burada da
-- muhasebe'ye ulaşıyordu, ama muhasebe'nin roles.allowed_tabs'ında 'projeler' bile yok,
-- Malzeme Listesi'ne hiç erişemiyor. Alıcı admin'e daraltıldı.
CREATE OR REPLACE FUNCTION public.create_procurement_item_change_request(p_procurement_item_id uuid, p_new_planned_qty numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform public.notify_role(
    'admin', auth.uid(), v_project_id, 'procurement_item_change_request', v_id, 'pending',
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

CREATE OR REPLACE FUNCTION public.create_procurement_item_add_request(p_project_id text, p_equipment text, p_unit text, p_category text, p_planned_qty numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform public.notify_role(
    'admin', auth.uid(), p_project_id, 'procurement_item_change_request', v_id, 'pending',
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
