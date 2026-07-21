update project_tasks
set status = 'tamamlandi'
where id in (
  '129adcaa-fb2e-40f7-aeae-03a44a0cf9f2', -- Santiye Kurulumu
  'afb399bc-9fcc-4f7e-8aee-4e2cf1a16864', -- Arazi Tesviye
  '7d6442e2-7846-4df9-8b37-28911cb37a5b', -- Ulasim Yollari
  '75b1ef55-23c7-4f78-ac88-1497741f08f0'  -- Kiris Montaji F1
);

