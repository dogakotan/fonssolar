-- sync_purchase_request_from_invoice: bir fatura reddedildi'ye geçince (admin
-- iptali) bağlı talebi yanlışlıkla 'fatura_onay_bekliyor'a set ediyordu (2026-07-21
-- migration'ında INSERT dalıyla aynı değer kopyalanmış olmalı) — reddedildi artık
-- nihai bir durum olduğundan (2026-07-24'te resubmit/delete RPC'leri kaldırıldı)
-- talep bu durumda sonsuza kadar donuk kalıyor: ne satin_alindi (yeni fatura
-- kesilemiyor) ne gerçek bir onay bekliyor. Doğru hedef 'satin_alindi' —
-- faturasız ödemenin birebir eşi olan sync_purchase_request_from_financial_transaction
-- iptal durumunda zaten bunu yapıyor (invoice_id null'lanır, guard trigger
-- fn_guard_purchase_request_invoice_id bunu her halükârda yeniden hesaplar).

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
      update public.purchase_requests set invoice_id=null,status='satin_alindi',updated_at=now()
      where id=new.purchase_request_id;
    end if;
  end if;
  return new;
end;
$function$;
