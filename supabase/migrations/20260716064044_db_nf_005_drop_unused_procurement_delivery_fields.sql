
ALTER TABLE public.procurement_items
  DROP COLUMN shortage_notes,
  DROP COLUMN damage_notes;

ALTER TABLE public.procurement_items
  DROP CONSTRAINT procurement_items_status_check;

ALTER TABLE public.procurement_items
  ADD CONSTRAINT procurement_items_status_check
  CHECK (status = ANY (ARRAY['planlandı'::text, 'sipariş_verildi'::text, 'teslim_edildi'::text, 'iptal'::text, 'gecikmiş'::text]));

