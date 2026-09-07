-- save_purchase_request_order, purchase_request_items.total_price'ı elle
-- SET etmeye çalışıyordu — bu kolon GENERATED ALWAYS AS (quantity *
-- COALESCE(unit_price,0)) STORED, Postgres elle yazmayı reddediyor
-- ("column total_price can only be updated to DEFAULT"). Gerçek RPC
-- çağrısıyla Playwright'ta test edilirken bulundu. Düzeltme: total_price
-- artık hiç SET edilmiyor, generated kolon quantity/unit_price'tan otomatik
-- hesaplanıyor.
create or replace function public.save_purchase_request_order(
  p_request_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_order_date date default null,
  p_supplier_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  select * into v_request from public.purchase_requests where id = p_request_id for update;
  if not found then
    raise exception 'Satın alma talebi bulunamadı.';
  end if;

  if not public.has_project_access(v_request.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_request.status <> 'siparis' then
    raise exception 'Yalnızca sipariş aşamasındaki talepler için sipariş bilgisi kaydedilebilir.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır.';
  end if;

  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Birim fiyat sıfır veya daha büyük olmalıdır.';
  end if;

  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Seçilen tedarikçi bulunamadı.';
  end if;

  update public.purchase_request_items
  set quantity = p_quantity,
      unit_price = p_unit_price
  where request_id = p_request_id;

  update public.purchase_requests
  set order_date = coalesce(p_order_date, order_date, current_date),
      supplier_id = coalesce(p_supplier_id, supplier_id),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id);
end;
$function$;
