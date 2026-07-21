CREATE OR REPLACE FUNCTION public.get_project_scope(p_project_id text DEFAULT NULL)
 RETURNS TABLE(scope_all boolean, project_ids text[], authorized boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_manager  boolean;
  v_own_project text;
  v_scope_all   boolean := false;
  v_authorized  boolean := true;
  v_project_ids text[] := '{}';
BEGIN
  SELECT COALESCE(r.is_manager, false) INTO v_is_manager
  FROM public.roles r WHERE r.key = get_my_role();

  v_own_project := (SELECT project_id FROM public.profiles WHERE id = auth.uid());

  IF p_project_id IS NOT NULL THEN
    IF v_is_manager
       OR user_has_project_access(p_project_id)
       OR p_project_id = v_own_project
    THEN
      v_project_ids := ARRAY[p_project_id];
    ELSE
      v_project_ids := '{}';
      v_authorized  := false;
    END IF;
  ELSIF v_is_manager THEN
    v_scope_all := true;
  ELSE
    SELECT COALESCE(array_agg(id), '{}') INTO v_project_ids
    FROM public.projects
    WHERE user_has_project_access(id) OR id = v_own_project;
  END IF;

  RETURN QUERY SELECT v_scope_all, v_project_ids, v_authorized;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_project_scope(text) FROM PUBLIC, anon, authenticated;

