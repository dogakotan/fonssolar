-- 1. Mevcut kaydı F1 olarak sabitle
update progress_items
set name = 'Kolon Cakimi F1',
    target_qty = 1900,
    total_progress = 1900,
    updated_at = now()
where id = 'f1000001-0000-0000-0000-000000000004';

-- 2. F2 için yeni kalem oluştur
insert into progress_items (project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
select 'test-kayseri-develi-ges', 'mekanik', 'Kolon Cakimi F2', 'adet', 1900, 157,
       coalesce((select max(order_index) from progress_items where project_id = 'test-kayseri-develi-ges'), 0) + 1,
       'a0173e94-03e0-4517-b83f-079a624b2e48';

-- 3. F2 task'ının progress_pct'sini trigger üzerinden yeniden hesaplat
update progress_items
set total_progress = total_progress
where task_id = 'a0173e94-03e0-4517-b83f-079a624b2e48';

