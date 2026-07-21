CREATE OR REPLACE FUNCTION public.get_my_projects()
 RETURNS TABLE(id text, name text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name
  FROM public.projects p
  CROSS JOIN public.get_project_scope(NULL) s
  WHERE s.scope_all OR p.id = ANY(s.project_ids)
  ORDER BY p.name;
$function$;

