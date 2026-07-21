ALTER TABLE public.invoices DROP CONSTRAINT invoices_source_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_source_check
  CHECK (source = ANY (ARRAY['manuel'::text, 'csv'::text, 'hesap_api'::text, 'satin_alma'::text]));

