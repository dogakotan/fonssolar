
-- Örnek tedarikçiler
INSERT INTO public.suppliers (id, name, tax_no, email, phone) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Güneş Panel A.Ş.',      '1234567890', 'info@gunespanel.com',   '0212 000 0001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Elektrik Malzeme Ltd.',  '2345678901', 'info@elektrikmal.com',  '0212 000 0002'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Nakliye Lojistik A.Ş.', '3456789012', 'info@nakliye.com',      '0212 000 0003'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Çelik Yapı San. Ltd.',   '4567890123', 'info@celikyapi.com',    '0212 000 0004');

-- Bütçe kalemleri (Kaptan Uşak GES)
INSERT INTO public.budget_lines (project_id, category, name, planned_amount, order_index) VALUES
  ('kaptan-usak-ges', 'malzeme',  'PV Panel',                  8500000, 1),
  ('kaptan-usak-ges', 'malzeme',  'İnverter & Trafo',          2200000, 2),
  ('kaptan-usak-ges', 'malzeme',  'DC/AC Kablo',                850000, 3),
  ('kaptan-usak-ges', 'malzeme',  'Çelik Konstrüksiyon',        950000, 4),
  ('kaptan-usak-ges', 'hizmet',   'Mekanik Montaj İşçiliği',    600000, 5),
  ('kaptan-usak-ges', 'hizmet',   'Elektrik Montaj İşçiliği',   450000, 6),
  ('kaptan-usak-ges', 'nakliye',  'Malzeme Nakliyesi',          180000, 7),
  ('kaptan-usak-ges', 'ekipman',  'İş Makinesi Kiralama',       220000, 8);

-- Örnek faturalar (trigger otomatik onay zinciri oluşturacak)
INSERT INTO public.invoices (id, project_id, supplier_id, invoice_no, invoice_date, due_date, amount, vat_rate, category, description, status, source) VALUES
  (
    'bbbbbbbb-0000-0000-0000-000000000001',
    'kaptan-usak-ges',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'FTR-2025-001', '2025-03-15', '2025-04-15',
    4250000, 20, 'malzeme', 'PV Panel - 1. Parti (5096 adet)',
    'onaylandı', 'manuel'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'kaptan-usak-ges',
    'aaaaaaaa-0000-0000-0000-000000000004',
    'FTR-2025-002', '2025-04-10', '2025-05-10',
    950000, 20, 'malzeme', 'Çelik Konstrüksiyon Malzemesi',
    'onaylandı', 'manuel'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000003',
    'kaptan-usak-ges',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'FTR-2025-003', '2025-05-20', '2025-06-20',
    620000, 20, 'malzeme', 'DC/AC Kablo - 1. Sevkiyat',
    'yönetici_onayında', 'manuel'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000004',
    'kaptan-usak-ges',
    'aaaaaaaa-0000-0000-0000-000000000003',
    'FTR-2025-004', '2025-06-01', '2025-07-01',
    95000, 20, 'nakliye', 'Malzeme Nakliyesi - Haziran',
    'muhasebe_onayında', 'manuel'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000005',
    'kaptan-usak-ges',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'FTR-2025-005', '2025-06-10', '2025-07-10',
    4250000, 20, 'malzeme', 'PV Panel - 2. Parti (5096 adet)',
    'bekliyor', 'manuel'
  );

-- Onaylanan faturalar için maliyet tahsisi
INSERT INTO public.cost_allocations (invoice_id, project_id, amount, category, note) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'kaptan-usak-ges', 4250000, 'malzeme',  'PV Panel 1. parti'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'kaptan-usak-ges',  950000, 'malzeme',  'Çelik konstrüksiyon');

