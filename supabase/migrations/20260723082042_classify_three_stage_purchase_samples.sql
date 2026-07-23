-- Each project keeps its three workflow stages while also demonstrating the
-- three BOM outcomes: Riskli, Uygun and Listede Yok.

-- Pending samples exceed their BOM plan and are Riskli.
UPDATE public.purchase_request_items
SET quantity = 650
WHERE request_id = 'a1000000-0000-4000-8000-000000000001';

UPDATE public.purchase_request_items
SET quantity = 11000
WHERE request_id = 'b1000000-0000-4000-8000-000000000001';

-- Processing samples stay below their BOM plan and are Uygun.
UPDATE public.purchase_request_items
SET quantity = 250
WHERE request_id = 'a1000000-0000-4000-8000-000000000002';

UPDATE public.purchase_request_items
SET quantity = 1500
WHERE request_id = 'b1000000-0000-4000-8000-000000000002';

-- Completed samples deliberately use materials outside the BOM.
UPDATE public.purchase_requests
SET title = 'BOM Dışı Saha Sarf Malzemesi Talebi',
    request_note = 'Kayseri projesi malzeme listesinde bulunmayan örnek talep.',
    updated_at = now()
WHERE id = 'a1000000-0000-4000-8000-000000000003';

UPDATE public.purchase_request_items
SET name = 'BOM Dışı Saha Sarf Malzemesi',
    quantity = 10,
    unit = 'adet',
    bom_item_id = NULL
WHERE request_id = 'a1000000-0000-4000-8000-000000000003';

UPDATE public.purchase_requests
SET title = 'BOM Dışı Montaj Sarf Malzemesi Talebi',
    request_note = 'İzmir projesi malzeme listesinde bulunmayan örnek talep.',
    updated_at = now()
WHERE id = 'b1000000-0000-4000-8000-000000000003';

UPDATE public.purchase_request_items
SET name = 'BOM Dışı Montaj Sarf Malzemesi',
    quantity = 12,
    unit = 'adet',
    bom_item_id = NULL
WHERE request_id = 'b1000000-0000-4000-8000-000000000003';
