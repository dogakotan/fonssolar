ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.purchase_requests
  ADD CONSTRAINT purchase_requests_category_check
  CHECK (category IS NULL OR category IN ('malzeme', 'hizmet'));

