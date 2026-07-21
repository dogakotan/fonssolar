
create or replace function public.user_has_project_access(p_project_id text)
returns boolean language sql stable security definer set search_path to 'public'
as $$ select public.has_project_access(p_project_id); $$;

