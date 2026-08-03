-- project_risks tablosunda hiç DELETE policy'si yoktu (bkz. CLAUDE.md "Bilinen
-- açık noktalar") — Adım4Riskler.jsx'in (proje düzenleme sihirbazı) mevcut
-- riskleri silip yeniden eklemesi gereken durumlarda bu adım sessizce 0 satır
-- siliyordu. Aynı tablodaki authenticated_insert_risks/authenticated_update_risks
-- policy'leriyle birebir aynı deseni (user_has_project_access) kullanır.
CREATE POLICY authenticated_delete_risks
ON public.project_risks
FOR DELETE
USING (user_has_project_access(project_id));
