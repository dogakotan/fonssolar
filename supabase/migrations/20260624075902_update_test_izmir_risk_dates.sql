-- Riskleri farklı haftalara dağıt
UPDATE project_risks SET created_at = '2026-06-01 08:00:00+00' WHERE id = '44fbce12-5e0a-403a-b69f-59b90e30d4a5'; -- EDAS - proje başında
UPDATE project_risks SET created_at = '2026-06-01 08:30:00+00' WHERE id = '94dbbda0-b7f5-4f42-a749-53d55de3aa9f'; -- Panel sevkiyat - proje başında
UPDATE project_risks SET created_at = '2026-06-08 09:00:00+00' WHERE id = '08dbc3bf-3ac1-4ee4-9678-6bd84c0f0379'; -- Hava - 2. hafta
UPDATE project_risks SET created_at = '2026-06-08 09:30:00+00' WHERE id = '44f900e1-4e16-419f-8a59-50c0536edf6a'; -- Rok kayası - 2. hafta (sondaj başlayınca fark edildi)
UPDATE project_risks SET created_at = '2026-06-15 10:00:00+00' WHERE id = '934eaa03-586d-4a21-b5a4-daa56cf65c4f'; -- İnverter - 3. hafta
UPDATE project_risks SET created_at = '2026-06-15 10:30:00+00' WHERE id = '867df764-1c26-4347-8334-a269013387ae'; -- İşçi - 3. hafta
UPDATE project_risks SET created_at = '2026-06-19 11:00:00+00' WHERE id = '04425182-5f1f-4b19-bcfe-cb59ad327a57'; -- Arazi erişim - 4. hafta
UPDATE project_risks SET created_at = '2026-06-22 11:30:00+00' WHERE id = 'bb4c9b64-d276-426d-a1e4-37df5e336776'; -- ENH güzergah - bu hafta

