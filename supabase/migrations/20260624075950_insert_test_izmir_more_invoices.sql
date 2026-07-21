-- Ek faturalar - haftalara dağıtılmış
INSERT INTO invoices (project_id, invoice_no, invoice_date, amount, vat_rate, category, description, status) VALUES
('test-izmir-ges-2026','INV-2026-006','2026-06-01',22500,20,'iscilik','1. Hafta işçilik bordrosu','ödendi'),
('test-izmir-ges-2026','INV-2026-007','2026-06-01',76000,20,'malzeme','Şantiye kurulum malzemeleri','ödendi'),
('test-izmir-ges-2026','INV-2026-008','2026-06-08',18000,20,'diger','Hidrolik çakma makinesi kiralama','ödendi'),
('test-izmir-ges-2026','INV-2026-009','2026-06-08',24500,20,'iscilik','2. Hafta işçilik bordrosu','ödendi'),
('test-izmir-ges-2026','INV-2026-010','2026-06-08',8500,20,'diger','Yakıt 1. hafta','ödendi'),
('test-izmir-ges-2026','INV-2026-011','2026-06-15',26000,20,'iscilik','3. Hafta işçilik bordrosu','ödendi'),
('test-izmir-ges-2026','INV-2026-012','2026-06-15',56000,20,'malzeme','Ek kolon profil malzeme','ödendi'),
('test-izmir-ges-2026','INV-2026-013','2026-06-15',9200,20,'diger','Yakıt 2. hafta','ödendi'),
('test-izmir-ges-2026','INV-2026-014','2026-06-22',28500,20,'iscilik','4. Hafta işçilik bordrosu','muhasebe_onayında'),
('test-izmir-ges-2026','INV-2026-015','2026-06-22',9800,20,'diger','Yakıt 3. hafta','muhasebe_onayında'),
('test-izmir-ges-2026','INV-2026-016','2026-06-23',125000,20,'malzeme','Konstrüksiyon çelik 2. teslimat','yönetici_onayında'),
('test-izmir-ges-2026','INV-2026-017','2026-06-24',45000,20,'iscilik','Rok delgi ek ekip işçilik','bekliyor');

