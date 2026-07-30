-- invoice_id artık zorunlu değil (transaction_id ile birlikte kullanılacak)
ALTER TABLE public.cost_allocations ALTER COLUMN invoice_id DROP NOT NULL;

-- faturasız ödeme bağlantısı
ALTER TABLE public.cost_allocations
  ADD COLUMN transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX cost_allocations_transaction_uidx ON public.cost_allocations(transaction_id);

-- bir satır ya faturadan ya faturasız ödemeden gelir, ikisi birden olamaz
ALTER TABLE public.cost_allocations
  ADD CONSTRAINT cost_allocations_source_xor
  CHECK ((invoice_id IS NOT NULL) <> (transaction_id IS NOT NULL));

-- invoices'daki sync_cost_allocation_from_invoice'un birebir eşi
CREATE OR REPLACE FUNCTION public.sync_cost_allocation_from_financial_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('taslak','iptal') AND NEW.project_id IS NOT NULL THEN
    INSERT INTO cost_allocations (transaction_id, project_id, amount, category, note, allocated_at)
    VALUES (NEW.id, NEW.project_id, NEW.amount, 'diger', 'Faturasız ödeme kaydından otomatik', now())
    ON CONFLICT (transaction_id) DO UPDATE
      SET amount = excluded.amount, project_id = excluded.project_id;
  ELSE
    DELETE FROM cost_allocations WHERE transaction_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_financial_transaction_cost_allocation
  AFTER INSERT OR UPDATE OF status, amount, project_id ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_cost_allocation_from_financial_transaction();

REVOKE EXECUTE ON FUNCTION public.sync_cost_allocation_from_financial_transaction() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_cost_allocation_from_financial_transaction() TO authenticated;
