-- Replace legacy overview fixtures with one sample for each site-chief stage
-- in both test projects.
WITH rollback_totals AS (
  SELECT procurement_item_id, SUM(delta_qty) AS total_delta
  FROM public.procurement_item_adjustments
  WHERE purchase_request_id = '66e3e526-362d-479b-a338-95884d06d3af'
    AND reversed_at IS NULL
  GROUP BY procurement_item_id
)
UPDATE public.procurement_items pi
SET planned_qty = GREATEST(0, pi.planned_qty - rt.total_delta),
    quantity = GREATEST(0, pi.planned_qty - rt.total_delta)::text,
    updated_at = now()
FROM rollback_totals rt
WHERE pi.id = rt.procurement_item_id;

DELETE FROM public.procurement_item_adjustments WHERE purchase_request_id IN (
  '03a7f2d4-e8a3-4331-9834-e55cec6b5c51', '3b8b96e5-270b-43ec-a4a8-c3d7cefe8c9c',
  '5ceaf2f1-303d-4d61-8cd2-a3bb643e607e', '66e3e526-362d-479b-a338-95884d06d3af',
  'dad710d0-e2b5-4b49-a275-b2428dc23e98', 'eb3ae02a-a343-4af3-8e9e-2840aeffc209',
  'f6890441-6b2c-4e2d-8b01-b988c9f861c5'
);
DELETE FROM public.invoices WHERE purchase_request_id IN (
  '03a7f2d4-e8a3-4331-9834-e55cec6b5c51', '3b8b96e5-270b-43ec-a4a8-c3d7cefe8c9c',
  '5ceaf2f1-303d-4d61-8cd2-a3bb643e607e', '66e3e526-362d-479b-a338-95884d06d3af',
  'dad710d0-e2b5-4b49-a275-b2428dc23e98', 'eb3ae02a-a343-4af3-8e9e-2840aeffc209',
  'f6890441-6b2c-4e2d-8b01-b988c9f861c5'
);
DELETE FROM public.purchase_requests WHERE id IN (
  '03a7f2d4-e8a3-4331-9834-e55cec6b5c51', '3b8b96e5-270b-43ec-a4a8-c3d7cefe8c9c',
  '5ceaf2f1-303d-4d61-8cd2-a3bb643e607e', '66e3e526-362d-479b-a338-95884d06d3af',
  'dad710d0-e2b5-4b49-a275-b2428dc23e98', 'eb3ae02a-a343-4af3-8e9e-2840aeffc209',
  'f6890441-6b2c-4e2d-8b01-b988c9f861c5'
);

INSERT INTO public.purchase_requests (
  id, project_id, requested_by, title, urgency, status, category, request_note,
  approved_by, approved_at, supplier_id, purchase_date, purchased_by, created_at, updated_at
) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'test-kayseri-develi-ges', 'e1e76bb3-cdcb-44d2-b4d9-e4f0e45667d1', 'DC Kablo MC4 Konnektör Talebi', 'normal', 'talep_olusturuldu', 'malzeme', 'Kayseri projesi için yeni oluşturulan satın alma talebi.', NULL, NULL, NULL, NULL, NULL, now() - interval '2 hours', now() - interval '2 hours'),
  ('a1000000-0000-4000-8000-000000000002', 'test-kayseri-develi-ges', 'e1e76bb3-cdcb-44d2-b4d9-e4f0e45667d1', 'Panel Montaj Vidası Talebi', 'acil', 'onaylandi', 'malzeme', 'Kayseri projesinde işleme alınan satın alma talebi.', '72421e18-aad0-45cc-9301-70bf096f7954', now() - interval '1 hour', NULL, NULL, NULL, now() - interval '3 hours', now() - interval '1 hour'),
  ('a1000000-0000-4000-8000-000000000003', 'test-kayseri-develi-ges', 'e1e76bb3-cdcb-44d2-b4d9-e4f0e45667d1', 'Rok Delgi Matkap Ucu Talebi', 'çok_acil', 'satin_alindi', 'malzeme', 'Kayseri projesinde satın alma işlemi tamamlanan talep.', '72421e18-aad0-45cc-9301-70bf096f7954', now() - interval '2 hours', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, '7b69b7da-9d0a-4598-846e-1cb03e562fca', now() - interval '4 hours', now()),
  ('b1000000-0000-4000-8000-000000000001', 'test-izmir-ges-2026', 'acc38be0-b60f-4789-8747-b576cae4b802', 'AC Kablo 3x185mm2 Talebi', 'normal', 'talep_olusturuldu', 'malzeme', 'İzmir projesi için yeni oluşturulan satın alma talebi.', NULL, NULL, NULL, NULL, NULL, now() - interval '2 hours', now() - interval '2 hours'),
  ('b1000000-0000-4000-8000-000000000002', 'test-izmir-ges-2026', 'acc38be0-b60f-4789-8747-b576cae4b802', 'DC Kablo 4mm2 Talebi', 'acil', 'onaylandi', 'malzeme', 'İzmir projesinde işleme alınan satın alma talebi.', '72421e18-aad0-45cc-9301-70bf096f7954', now() - interval '1 hour', NULL, NULL, NULL, now() - interval '3 hours', now() - interval '1 hour'),
  ('b1000000-0000-4000-8000-000000000003', 'test-izmir-ges-2026', 'acc38be0-b60f-4789-8747-b576cae4b802', 'Çelik Konstrüksiyon Sistemi Talebi', 'çok_acil', 'satin_alindi', 'malzeme', 'İzmir projesinde satın alma işlemi tamamlanan talep.', '72421e18-aad0-45cc-9301-70bf096f7954', now() - interval '2 hours', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, '7b69b7da-9d0a-4598-846e-1cb03e562fca', now() - interval '4 hours', now());

INSERT INTO public.purchase_request_items (request_id, name, quantity, unit, unit_price, bom_item_id) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'DC Kablo MC4 Konnektör', 25, 'adet', 0, '6ee3fa19-9e86-4250-a550-6b9e62767954'),
  ('a1000000-0000-4000-8000-000000000002', 'Panel Montaj Vidası', 250, 'adet', 0, '84e86de4-a5d9-4ce2-ad6c-f61a32fce5e4'),
  ('a1000000-0000-4000-8000-000000000003', 'Rok Delgi Matkap Ucu', 5, 'adet', 0, '720ba69a-b744-4d7d-a1aa-cfb9631c3b28'),
  ('b1000000-0000-4000-8000-000000000001', 'AC Kablo 3x185mm2', 500, 'mt', 0, '939928af-12d0-4997-88ea-a0dec356bcc6'),
  ('b1000000-0000-4000-8000-000000000002', 'DC Kablo 4mm2 (75.000 mt)', 1500, 'mt', 0, 'dabee9e7-6c97-4adf-8125-4a94c16799e1'),
  ('b1000000-0000-4000-8000-000000000003', 'Çelik Konstrüksiyon Sistemi', 1, 'lot', 0, '23a15407-a3b5-469e-ab9c-b042f39baf4a');
