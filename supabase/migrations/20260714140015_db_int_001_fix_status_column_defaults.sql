
ALTER TABLE public.projects ALTER COLUMN status SET DEFAULT 'aktif';
ALTER TABLE public.procurement_items ALTER COLUMN status SET DEFAULT 'planlandı';
ALTER TABLE public.schedule_activities ALTER COLUMN status SET DEFAULT 'bekliyor';
ALTER TABLE public.work_packages ALTER COLUMN status SET DEFAULT 'bekliyor';

