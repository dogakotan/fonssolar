-- Keep the role catalog aligned with the four roles supported by the application.
-- All retired roles are unassigned before this migration is applied.
delete from public.roles
where key not in ('admin', 'muhasebe', 'proje_yoneticisi', 'santiye_sefi');
