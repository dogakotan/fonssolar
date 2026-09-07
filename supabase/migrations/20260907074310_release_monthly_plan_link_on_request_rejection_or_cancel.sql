-- Aylık Satın Alma Planı'nda bir kalemin bağlı talebi reddedilse/iptal olsa bile
-- procurement_monthly_plan.purchase_requests embed'i (purchase_requests.procurement_plan_id
-- FK'sinin ters yönü) hep o reddedilmiş/iptal talebe işaret etmeye devam ediyordu —
-- create_purchase_request_from_monthly_plan RPC'sinin kendi "zaten bir talep
-- oluşturulmuş" kontrolü ile idx_purchase_requests_procurement_plan_id_unique
-- kısmi UNIQUE index'i bu talebin STATUS'üne bakmadığından, kullanıcı reddedilen
-- bir kalem için tekrar "Talep Oluştur" diyemiyordu (07.09.2026'da kullanıcı
-- tarafından bulundu). Fatura reddi/iptalinde zaten kullanılan desenle aynı
-- şekilde: talep reddedildi/iptal olduğunda bağlantı (procurement_plan_id)
-- otomatik koparılır — geçmiş talep silinmez, yalnızca plan kalemiyle bağı
-- kopar ve kalem yeniden "Planlandı" + "Talep Oluştur" durumuna döner.
create or replace function public.fn_release_monthly_plan_link_on_request_terminal_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.procurement_plan_id is not null
     and NEW.status in ('reddedildi', 'iptal')
     and OLD.status is distinct from NEW.status then
    NEW.procurement_plan_id := null;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_release_monthly_plan_link_on_terminal_status on purchase_requests;
create trigger trg_release_monthly_plan_link_on_terminal_status
  before update of status on purchase_requests
  for each row execute function public.fn_release_monthly_plan_link_on_request_terminal_status();

-- Zaten reddedilmiş/iptal olup hâlâ bir plan kalemine bağlı kalan eski talepler
update purchase_requests
set procurement_plan_id = null
where procurement_plan_id is not null
  and status in ('reddedildi', 'iptal');
