-- fn_sync_cost_allocation_project_id, invoice_id'den project_id senkronluyordu ama
-- invoice_id NULL olan (faturasız ödeme) satırlarda project_id'yi de yanlışlıkla
-- NULL'a çekiyordu (SELECT ... INTO satır bulamayınca hedefi NULL yapar). Guard eklendi.
CREATE OR REPLACE FUNCTION public.fn_sync_cost_allocation_project_id()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT project_id INTO NEW.project_id FROM invoices WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$function$;
