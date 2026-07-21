-- Her kalemden sadece bir tanesini (en yüksek target_qty olan) dashboard'a işaretle
UPDATE progress_items SET dashboard_visible = true, dashboard_order = 1
WHERE id = (SELECT id FROM progress_items WHERE project_id = 'adana-ges-2026' AND name = 'Panel Montaji' ORDER BY target_qty DESC LIMIT 1);

UPDATE progress_items SET dashboard_visible = true, dashboard_order = 2
WHERE id = (SELECT id FROM progress_items WHERE project_id = 'adana-ges-2026' AND name = 'DC Kablo Cekimi' ORDER BY target_qty DESC LIMIT 1);

UPDATE progress_items SET dashboard_visible = true, dashboard_order = 3
WHERE id = (SELECT id FROM progress_items WHERE project_id = 'adana-ges-2026' AND name = 'Asik Montaji' ORDER BY target_qty DESC LIMIT 1);

UPDATE progress_items SET dashboard_visible = true, dashboard_order = 4
WHERE id = (SELECT id FROM progress_items WHERE project_id = 'adana-ges-2026' AND name = 'Kiris Montaji' ORDER BY target_qty DESC LIMIT 1);

UPDATE progress_items SET dashboard_visible = true, dashboard_order = 5
WHERE id = (SELECT id FROM progress_items WHERE project_id = 'adana-ges-2026' AND name = 'Inverter GES Pano' ORDER BY target_qty DESC LIMIT 1);

UPDATE progress_items SET dashboard_visible = true, dashboard_order = 6
WHERE id = (SELECT id FROM progress_items WHERE project_id = 'adana-ges-2026' AND name = 'OG Hucre Montaji' ORDER BY target_qty DESC LIMIT 1);

