-- Eski sync_pr_to_cost() bozuktu: var olmayan pr_items tablosuna ve kullanılmayan
-- cost_allocations tablosuna yazıyordu (frontend zaten maliyeti invoices'tan direkt okuyor).
-- purchase_request_id hiç dolmadığı için hiç patlamamıştı; şimdi gerçek bağlantı kurulunca çökerdi.
DROP TRIGGER IF EXISTS invoice_pr_cost_sync ON public.invoices;
DROP FUNCTION IF EXISTS public.sync_pr_to_cost();

-- Satın alma talebi <-> fatura durumunu otomatik senkronlar:
--   fatura oluşturulunca (purchase_request_id set edilerek)  -> talep 'faturada'
--   fatura tam onaylanınca (status='onaylandı')               -> talep 'faturasi_kesildi' (maliyet tablosuna yansır)
--   fatura ödenince (status='ödendi')                         -> talep 'tamamlandi'
--   fatura reddedilince (status='reddedildi')                 -> talep tekrar 'onaylandi', link temizlenir (yeniden fatura kesilebilsin)
CREATE OR REPLACE FUNCTION public.sync_purchase_request_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.purchase_request_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE public.purchase_requests
    SET invoice_id = NEW.id, status = 'faturada', updated_at = now()
    WHERE id = NEW.purchase_request_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'onaylandı' THEN
      UPDATE public.purchase_requests SET status = 'faturasi_kesildi', updated_at = now() WHERE id = NEW.purchase_request_id;
    ELSIF NEW.status = 'ödendi' THEN
      UPDATE public.purchase_requests SET status = 'tamamlandi', updated_at = now() WHERE id = NEW.purchase_request_id;
    ELSIF NEW.status = 'reddedildi' THEN
      UPDATE public.purchase_requests SET status = 'onaylandi', invoice_id = NULL, updated_at = now() WHERE id = NEW.purchase_request_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER invoice_sync_purchase_request
AFTER INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_request_from_invoice();

