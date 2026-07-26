-- sync_purchase_request_from_invoice() yalnızca invoice status 'onaylandı'/'ödendi'
-- olunca bağlı purchase_requests'i 'faturasi_kesildi'ye taşıyordu. Ama tek-onaylayıcı
-- akışında yönetici onayladığında (requires_payment_tracking=true faturalarda) status
-- 'odeme_bekliyor'a (sonra kısmi ödemede 'kismen_odendi'ye) düşüyor — fatura aslında
-- onaylanmış olmasına rağmen bağlı talep ödeme tamamen bitene kadar yanlışlıkla
-- 'fatura_onay_bekliyor' (Satın Alma listesinde "Fatura Onayda") görünmeye devam
-- ediyordu. Statü listesine odeme_bekliyor/kismen_odendi ekleniyor.

CREATE OR REPLACE FUNCTION public.sync_purchase_request_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.purchase_request_id is null then return new; end if;
  if tg_op = 'INSERT' then
    update public.purchase_requests set invoice_id=new.id,status='fatura_onay_bekliyor',updated_at=now()
    where id=new.purchase_request_id;
  elsif tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status in ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi') then
      update public.purchase_requests set status='faturasi_kesildi',updated_at=now()
      where id=new.purchase_request_id;
    elsif new.status='reddedildi' then
      update public.purchase_requests set invoice_id=new.id,status='fatura_onay_bekliyor',updated_at=now()
      where id=new.purchase_request_id;
    end if;
  end if;
  return new;
end;
$function$;
