
CREATE UNIQUE INDEX invoices_active_purchase_request_id_unique
  ON public.invoices (purchase_request_id)
  WHERE purchase_request_id IS NOT NULL AND status <> 'reddedildi';

