-- Düzeltme: bir önceki migration'ın eklediği procurement_monthly_plan.purchase_request_id
-- kolonu, purchase_requests tablosunda ZATEN var olan ama hiç kullanılmayan
-- procurement_plan_id kolonuyla (başka/eski bir oturumdan kalma) aynı iki tablo
-- arasında ikinci bir ilişki yaratıyordu — bu da PostgREST'in
-- procurement_monthly_plan.select('*, purchase_requests(...)') embed'inde
-- "more than one relationship was found" hatası vermesine yol açtı (canlı
-- Playwright testinde bulundu). Kendi yeni kolonumuzu geri alıp, zaten var olan
-- purchase_requests.procurement_plan_id'yi kullanıyoruz — gereksiz ikinci bir
-- yapı bırakmamak için.
alter table procurement_monthly_plan drop column purchase_request_id;

-- Tekilliği (bir plan kalemi en fazla bir aktif talebe bağlanabilir) hem RPC hem
-- DB seviyesinde garanti etmek için düz index yerine benzersiz (unique) index.
drop index if exists idx_purchase_requests_procurement_plan;
create unique index if not exists idx_purchase_requests_procurement_plan_id_unique
  on purchase_requests(procurement_plan_id) where procurement_plan_id is not null;

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

  if exists (select 1 from purchase_requests where procurement_plan_id = p_plan_id) then
    raise exception 'Bu plan kalemi için zaten bir talep oluşturulmuş.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Talep miktarı sıfırdan büyük olmalıdır.';
  end if;

  v_request_category := case when v_plan.kategori = 'Hizmet' then 'hizmet' else 'malzeme' end;

  insert into purchase_requests (
    project_id, title, request_note, status, requested_by, category, request_no, procurement_plan_id
  )
  values (
    v_plan.project_id, v_plan.kalem_adi, p_request_note, 'teklif_toplama', auth.uid(), v_request_category,
    fn_next_purchase_request_no(extract(year from now())::int), p_plan_id
  )
  returning id into v_request_id;

  insert into purchase_request_items (
    request_id, name, quantity, unit, bom_item_id, category
  )
  values (
    v_request_id, v_plan.kalem_adi, p_quantity, coalesce(nullif(p_unit, ''), v_plan.birim, 'Adet'),
    v_plan.procurement_item_id, v_plan.kategori
  );

  return v_request_id;
end;
$function$;

revoke all on function public.create_purchase_request_from_monthly_plan(uuid, numeric, text, text) from public, anon;
grant execute on function public.create_purchase_request_from_monthly_plan(uuid, numeric, text, text) to authenticated;
