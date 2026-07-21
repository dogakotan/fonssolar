UPDATE project_tasks SET category = 'kolon_montaji'
WHERE id IN (
  'cfb0df65-7d2f-41d7-9c87-7f24ec68bf4e',
  '14dcc1d3-aec9-4b17-90bf-216ec88c7ef2',
  '7e4c4164-a080-4256-bbcd-121162a4d66d',
  '9f2257a1-dbf9-4ed9-bd49-b312a6d88a35',
  'a0173e94-03e0-4517-b83f-079a624b2e48'
);

UPDATE project_tasks SET category = 'kiris_montaji'
WHERE id IN (
  'd6e02510-703c-4229-97d0-dcc58dffc908',
  '75b1ef55-23c7-4f78-ac88-1497741f08f0'
);

UPDATE project_tasks SET category = 'asik_montaji'
WHERE id IN (
  'c5cbdc3c-de02-4497-92b0-a9fb39b6cdd2',
  '2421418b-b10b-4fe5-ba1b-5799e6fb817e'
);

UPDATE project_tasks SET category = 'panel_montaji'
WHERE id IN (
  'aacc4f76-113a-477b-80ad-8b9d8b1db4ca',
  '45c8e9c1-3a5f-41ef-a6e2-e91e82c2117b'
);

UPDATE project_tasks SET category = 'kosk_trafo'
WHERE project_id = 'test-izmir-ges-2026'
  AND task_name IN ('Kosk ve Trafo Konumlandirma', 'Trafo Enerjilendirme');

