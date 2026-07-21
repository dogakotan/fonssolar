CREATE OR REPLACE FUNCTION public.get_quality_inspections_list(p_project_id text DEFAULT NULL, p_filter_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT jsonb_build_object(
    'authorized', true,
    'inspections', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(qi) || jsonb_build_object(
          'project_name', proj.name,
          'finding_count', (SELECT count(*) FROM quality_inspection_findings f WHERE f.inspection_id = qi.id),
          'open_count', (SELECT count(*) FROM quality_inspection_findings f WHERE f.inspection_id = qi.id AND f.status <> 'çözüldü')
        )
        ORDER BY qi.inspection_date DESC, qi.created_at DESC
      )
      FROM quality_inspections qi
      LEFT JOIN projects proj ON proj.id = qi.project_id
      WHERE
        CASE
          WHEN p_project_id IS NOT NULL THEN
            qi.project_id = p_project_id
            AND qi.inspection_date <= COALESCE(p_filter_date, CURRENT_DATE)
          ELSE
            (v_scope.scope_all OR qi.project_id = ANY(v_scope.project_ids))
        END
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_quality_inspections_list(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quality_inspections_list(text, date) TO authenticated;

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
      SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at)
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

REVOKE EXECUTE ON FUNCTION public.get_quality_inspection_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quality_inspection_detail(uuid) TO authenticated;

