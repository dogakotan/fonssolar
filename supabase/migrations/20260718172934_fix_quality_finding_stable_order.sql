CREATE OR REPLACE FUNCTION public.get_quality_inspection_detail(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_project_id text;
BEGIN
  SELECT project_id INTO v_project_id FROM quality_inspections WHERE id = p_id;
  IF v_project_id IS NULL OR NOT has_project_access(v_project_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT to_jsonb(qi) || jsonb_build_object(
    'authorized', true,
    'project_name', proj.name,
    'created_by_name', prf.full_name,
    'findings', COALESCE((
      SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at, f.id)
      FROM quality_inspection_findings f WHERE f.inspection_id = qi.id
    ), '[]'::jsonb)
  ) INTO result
  FROM quality_inspections qi
  LEFT JOIN projects proj ON proj.id = qi.project_id
  LEFT JOIN profiles prf ON prf.id = qi.created_by
  WHERE qi.id = p_id;

  RETURN result;
END;
$function$;

