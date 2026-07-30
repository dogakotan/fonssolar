-- invoices.remaining_amount sıradan bir kolon (DEFAULT 0) ve yalnızca
-- fn_invoice_payment_recalc() (bir ödeme eklenince/iptal edilince) tarafından
-- güncelleniyordu — fatura oluşturulduğunda/onaylandığında hiç set edilmiyordu.
-- Sonuç: fn_invoice_payment_before_insert()'ün "ödeme tutarı kalanı aşamaz"
-- kontrolü remaining_amount=0'a göre çalışıp HER faturanın ilk ödemesini
-- reddediyordu (kısmi ödemeden bağımsız, tam ödeme dahil). Yeni trigger
-- remaining_amount'ı her zaman total_amount - paid_amount olarak senkron
-- tutuyor; ayrıca mevcut satırlar tek seferlik backfill ile düzeltiliyor.

CREATE OR REPLACE FUNCTION public.fn_sync_invoice_remaining_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.invoices
    set remaining_amount = NEW.total_amount - NEW.paid_amount
    where id = NEW.id
      and remaining_amount is distinct from (NEW.total_amount - NEW.paid_amount);
  return NEW;
end;
$function$;

CREATE TRIGGER trg_sync_invoice_remaining_amount
  AFTER INSERT OR UPDATE OF amount, vat_rate, paid_amount ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_invoice_remaining_amount();

UPDATE public.invoices
  SET remaining_amount = total_amount - paid_amount
  WHERE remaining_amount IS DISTINCT FROM (total_amount - paid_amount);
