-- Aylık Satın Alma Planı kalemleri artık gerçek satın alma talebine bağlanabiliyor
-- (kullanıcı kararı, 04.09.2026) — "Planlandı" durumundaki bir kalem için
-- "Talep Oluştur" tıklanınca teklif_toplama aşamasından başlayan gerçek bir
-- purchase_requests kaydı oluşur ve plan kalemi ona bağlanır; sonrasında plan
-- kaleminin durumu artık bağımsız 3 etiket (Planlandı/Sipariş Verildi/Teslim
-- Alındı) değil, bağlı talebin GERÇEK durumunu yansıtır (bkz. ProjeTabAylikPlan.jsx).
alter table procurement_monthly_plan
  add column purchase_request_id uuid references purchase_requests(id) on delete set null;

create index if not exists idx_procurement_monthly_plan_purchase_request_id
  on procurement_monthly_plan(purchase_request_id);

create or replace function public.create_purchase_request_from_monthly_plan(
  p_plan_id uuid,
  p_quantity numeric,
  p_unit text default null,
  p_request_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan record;
  v_request_id uuid;
  v_request_category text;
begin
  select * into v_plan from procurement_monthly_plan where id = p_plan_id;
  if not found then
    raise exception 'Plan kalemi bulunamadı.';
  end if;

  if get_my_role() not in ('admin', 'proje_yoneticisi') then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if not has_project_access(v_plan.project_id) then
    raise exception 'Bu projeye erişim yetkiniz yok.';
  end if;

  if v_plan.purchase_request_id is not null then
    raise exception 'Bu plan kalemi için zaten bir talep oluşturulmuş.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Talep miktarı sıfırdan büyük olmalıdır.';
  end if;

  v_request_category := case when v_plan.kategori = 'Hizmet' then 'hizmet' else 'malzeme' end;

  insert into purchase_requests (
    project_id, title, request_note, status, requested_by, category, request_no
  )
  values (
    v_plan.project_id, v_plan.kalem_adi, p_request_note, 'teklif_toplama', auth.uid(), v_request_category,
    fn_next_purchase_request_no(extract(year from now())::int)
  )
  returning id into v_request_id;

  insert into purchase_request_items (
    request_id, name, quantity, unit, bom_item_id, category
  )
  values (
    v_request_id, v_plan.kalem_adi, p_quantity, coalesce(nullif(p_unit, ''), v_plan.birim, 'Adet'),
    v_plan.procurement_item_id, v_plan.kategori
  );

  update procurement_monthly_plan set purchase_request_id = v_request_id, updated_at = now() where id = p_plan_id;

  return v_request_id;
end;
$function$;

revoke all on function public.create_purchase_request_from_monthly_plan(uuid, numeric, text, text) from public, anon;
grant execute on function public.create_purchase_request_from_monthly_plan(uuid, numeric, text, text) to authenticated;
