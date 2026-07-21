ALTER TABLE public.roles ADD COLUMN is_manager boolean NOT NULL DEFAULT false;

UPDATE public.roles SET is_manager = true
WHERE key IN ('admin', 'koordinator', 'proje_koordinatoru', 'muhasebe', 'maliyet_kontrolcu');

