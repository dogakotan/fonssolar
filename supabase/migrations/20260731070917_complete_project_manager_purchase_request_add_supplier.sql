-- complete_project_manager_purchase_request (proje yöneticisinin tek-tık
-- "Tamamlandı" butonu) supplier_id'ye hiç dokunmuyordu — bkz. CLAUDE.md
-- "Bilinen açık noktalar". Yeni opsiyonel p_supplier_id parametresi ile
-- artık tedarikçi de kaydedilebiliyor (frontend'de opsiyonel bir seçici
-- eklendi — seçilmezse eskisi gibi supplier_id boş kalır, kullanıcı kararı
-- 2026-07-31).
CREATE OR REPLACE FUNCTION public.complete_project_manager_purchase_request(p_request_id uuid, p_supplier_id uuid DEFAULT NULL)
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
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'project_id', v_request.project_id,
    'status', 'satin_alindi'
  );
end;
$function$;
