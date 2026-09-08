-- Tedarik/Teslimat Faz 2: eksik/hasarlı teslimat takibi. Tedarikçi/sipariş/
-- teslimat tarihi zaten talep bazında var (Teklif/Pazarlık/Sipariş akışı) —
-- burada eklenen tek şey, talep tamamlanırken (satin_alindi'ye geçişte)
-- teslimatın tam mı eksik mi hasarlı mı olduğunu ve varsa açıklamasını
-- kaydetmek.

-- 1) Şema: teslimat durumu/notu
ALTER TABLE public.purchase_requests
  ADD COLUMN delivery_status text,
  ADD COLUMN delivery_note text;

ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('tam', 'eksik', 'hasarli'));

-- 2) complete_project_manager_purchase_request: p_delivery_status/p_delivery_note eklenir
DROP FUNCTION IF EXISTS public.complete_project_manager_purchase_request(uuid, uuid);

CREATE FUNCTION public.complete_project_manager_purchase_request(
  p_request_id uuid,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_delivery_status text DEFAULT 'tam',
  p_delivery_note text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi tamamlayabilir.';
  end if;

  if p_delivery_status not in ('tam', 'eksik', 'hasarli') then
    raise exception 'Geçersiz teslimat durumu.';
  end if;

  if p_delivery_status <> 'tam' and coalesce(trim(p_delivery_note), '') = '' then
    raise exception 'Eksik veya hasarlı teslimatta açıklama zorunludur.';
  end if;

  select * into v_request
  from public.purchase_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'onaylandi' then
    raise exception 'Yalnızca proje yöneticisinde bekleyen talepler tamamlanabilir.';
  end if;

  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Seçilen tedarikçi bulunamadı.';
  end if;

  update public.purchase_requests
  set status = 'satin_alindi',
      purchase_date = coalesce(purchase_date, current_date),
      purchased_by = v_actor,
      supplier_id = coalesce(p_supplier_id, supplier_id),
      delivery_status = p_delivery_status,
      delivery_note = nullif(trim(p_delivery_note), ''),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'project_id', v_request.project_id,
    'status', 'satin_alindi'
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_project_manager_purchase_request(uuid, uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_project_manager_purchase_request(uuid, uuid, text, text) FROM PUBLIC, anon;

-- 3) complete_purchase_request_delivery: p_delivery_status/p_delivery_note eklenir
DROP FUNCTION IF EXISTS public.complete_purchase_request_delivery(uuid);

CREATE FUNCTION public.complete_purchase_request_delivery(
  p_request_id uuid,
  p_delivery_status text DEFAULT 'tam',
  p_delivery_note text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_request public.purchase_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if public.get_my_role() <> 'proje_yoneticisi' then
    raise exception 'Bu işlemi yalnızca proje yöneticisi yapabilir.';
  end if;

  if p_delivery_status not in ('tam', 'eksik', 'hasarli') then
    raise exception 'Geçersiz teslimat durumu.';
  end if;

  if p_delivery_status <> 'tam' and coalesce(trim(p_delivery_note), '') = '' then
    raise exception 'Eksik veya hasarlı teslimatta açıklama zorunludur.';
  end if;

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'siparis' then
    raise exception 'Yalnızca sipariş aşamasındaki talepler teslim alınarak tamamlanabilir.';
  end if;

  if not exists (
    select 1 from public.purchase_request_items
    where request_id = p_request_id and coalesce(unit_price, 0) > 0
  ) then
    raise exception 'Tamamlamadan önce sipariş adet/fiyat bilgisini kaydetmelisiniz.';
  end if;

  update public.purchase_requests
  set status = 'satin_alindi',
      purchase_date = coalesce(purchase_date, current_date),
      purchased_by = v_actor,
      delivery_status = p_delivery_status,
      delivery_note = nullif(trim(p_delivery_note), ''),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'project_id', v_request.project_id, 'status', 'satin_alindi');
end;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_purchase_request_delivery(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_purchase_request_delivery(uuid, text, text) FROM PUBLIC, anon;
