
-- work_packages.status
ALTER TABLE work_packages DROP CONSTRAINT IF EXISTS work_packages_status_check;
UPDATE work_packages SET status = CASE status
  WHEN 'done'    THEN 'tamamlandı'
  WHEN 'active'  THEN 'aktif'
  WHEN 'pending' THEN 'bekliyor'
  WHEN 'late'    THEN 'gecikmiş'
  ELSE status END;
ALTER TABLE work_packages ADD CONSTRAINT work_packages_status_check
  CHECK (status = ANY (ARRAY['tamamlandı','aktif','bekliyor','gecikmiş']));

-- daily_tasks.type
ALTER TABLE daily_tasks DROP CONSTRAINT IF EXISTS daily_tasks_type_check;
UPDATE daily_tasks SET type = CASE type
  WHEN 'done'    THEN 'tamamlandı'
  WHEN 'planned' THEN 'planlandı'
  ELSE type END;
ALTER TABLE daily_tasks ADD CONSTRAINT daily_tasks_type_check
  CHECK (type = ANY (ARRAY['tamamlandı','planlandı']));

-- procurement_items.priority (Türkçe büyük harf → küçük, manuel map)
ALTER TABLE procurement_items DROP CONSTRAINT IF EXISTS procurement_items_priority_check;
UPDATE procurement_items SET priority = CASE priority
  WHEN 'KRİTİK' THEN 'kritik'
  WHEN 'ÖNEMLİ' THEN 'önemli'
  WHEN 'NORMAL'  THEN 'normal'
  ELSE priority END WHERE priority IS NOT NULL;
ALTER TABLE procurement_items ADD CONSTRAINT procurement_items_priority_check
  CHECK (priority = ANY (ARRAY['kritik','önemli','normal']));

-- procurement_items.status
ALTER TABLE procurement_items DROP CONSTRAINT IF EXISTS procurement_items_status_check;
UPDATE procurement_items SET status = CASE status
  WHEN 'Planlandı'       THEN 'planlandı'
  WHEN 'Sipariş Verildi' THEN 'sipariş verildi'
  WHEN 'Üretimde'        THEN 'üretimde'
  WHEN 'Sevkiyatta'      THEN 'sevkiyatta'
  WHEN 'Sahada'          THEN 'sahada'
  WHEN 'Montajda'        THEN 'montajda'
  WHEN 'Tamamlandı'      THEN 'tamamlandı'
  ELSE status END WHERE status IS NOT NULL;
ALTER TABLE procurement_items ADD CONSTRAINT procurement_items_status_check
  CHECK (status = ANY (ARRAY['planlandı','sipariş verildi','üretimde','sevkiyatta','sahada','montajda','tamamlandı']));

-- schedule_activities.priority
ALTER TABLE schedule_activities DROP CONSTRAINT IF EXISTS schedule_activities_priority_check;
UPDATE schedule_activities SET priority = CASE priority
  WHEN 'KRİTİK' THEN 'kritik'
  WHEN 'ÖNEMLİ' THEN 'önemli'
  WHEN 'NORMAL'  THEN 'normal'
  ELSE priority END WHERE priority IS NOT NULL;
ALTER TABLE schedule_activities ADD CONSTRAINT schedule_activities_priority_check
  CHECK (priority = ANY (ARRAY['kritik','önemli','normal']));

-- schedule_activities.status
ALTER TABLE schedule_activities DROP CONSTRAINT IF EXISTS schedule_activities_status_check;
UPDATE schedule_activities SET status = CASE status
  WHEN 'Bekliyor'     THEN 'bekliyor'
  WHEN 'Devam Ediyor' THEN 'devam ediyor'
  WHEN 'Tamamlandı'   THEN 'tamamlandı'
  WHEN 'Gecikmiş'     THEN 'gecikmiş'
  ELSE status END WHERE status IS NOT NULL;
ALTER TABLE schedule_activities ADD CONSTRAINT schedule_activities_status_check
  CHECK (status = ANY (ARRAY['bekliyor','devam ediyor','tamamlandı','gecikmiş']));

-- projects.status
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
UPDATE projects SET status = CASE status
  WHEN 'active'    THEN 'aktif'
  WHEN 'completed' THEN 'tamamlandı'
  WHEN 'on_hold'   THEN 'beklemede'
  WHEN 'cancelled' THEN 'iptal edildi'
  ELSE status END;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status = ANY (ARRAY['aktif','tamamlandı','beklemede','iptal edildi']));

