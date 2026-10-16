CREATE OR REPLACE FUNCTION public.get_profile_names(p_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.id = ANY(p_ids)
    AND EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE (t.created_by = p.id OR t.updated_by = p.id)
        AND public.has_project_access(t.project_id)
    );
$$;
