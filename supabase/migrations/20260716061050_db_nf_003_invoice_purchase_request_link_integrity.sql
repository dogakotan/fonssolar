
-- 1) Bir talebin ayni anda yalnizca bir aktif (reddedilmemis) faturasi olabilir
CREATE UNIQUE INDEX invoices_purchase_request_id_active_key
  ON public.invoices (purchase_request_id)
  WHERE purchase_request_id IS NOT NULL AND status <> 'reddedildi';

-- 2) purchase_requests.invoice_id her yazmada gercek invoices durumundan yeniden hesaplanir
CREATE OR REPLACE FUNCTION public.fn_guard_purchase_request_invoice_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    NEW.invoice_id := (
      SELECT id FROM public.invoices
      WHERE purchase_request_id = NEW.id AND status <> 'reddedildi'
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_purchase_request_invoice_id
  BEFORE UPDATE OF invoice_id ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_purchase_request_invoice_id();

