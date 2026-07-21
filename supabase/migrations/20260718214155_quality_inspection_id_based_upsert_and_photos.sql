CREATE OR REPLACE FUNCTION public.save_quality_inspection(p_project_id text, p_inspection_date date, p_inspector text, p_category text, p_created_by uuid, p_id uuid DEFAULT NULL::uuid, p_result text DEFAULT 'beklemede'::text, p_notes text DEFAULT NULL::text, p_findings jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_finding jsonb;
  v_finding_id uuid;
BEGIN
  IF NOT has_project_access(p_project_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO quality_inspections (project_id, inspection_date, inspector, category, result, notes, created_by)
    VALUES (p_project_id, p_inspection_date, p_inspector, p_category, p_result, p_notes, p_created_by)
    RETURNING id INTO v_id;
  ELSE
    UPDATE quality_inspections
    SET inspection_date = p_inspection_date, inspector = p_inspector, category = p_category, result = p_result, notes = p_notes
    WHERE id = p_id AND project_id = p_project_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('authorized', false);
    END IF;
  END IF;

  DELETE FROM quality_inspection_findings
  WHERE inspection_id = v_id
    AND id NOT IN (
      SELECT nullif(f->>'id', '')::uuid
      FROM jsonb_array_elements(COALESCE(p_findings, '[]'::jsonb)) f
      WHERE nullif(f->>'id', '') IS NOT NULL
    );

  FOR v_finding IN SELECT jsonb_array_elements(COALESCE(p_findings, '[]'::jsonb))
  LOOP
    v_finding_id := nullif(v_finding->>'id', '')::uuid;
    IF v_finding_id IS NULL THEN
      INSERT INTO quality_inspection_findings
        (inspection_id, project_id, location, description, severity, status, assigned_to, resolved_at)
      VALUES (
        v_id, p_project_id, v_finding->>'location', v_finding->>'description',
        COALESCE(v_finding->>'severity', 'orta'), COALESCE(v_finding->>'status', 'açık'),
        v_finding->>'assigned_to',
        CASE WHEN COALESCE(v_finding->>'status', 'açık') = 'çözüldü' THEN now() ELSE NULL END
      );
    ELSE
      UPDATE quality_inspection_findings
      SET location = v_finding->>'location',
          description = v_finding->>'description',
          severity = COALESCE(v_finding->>'severity', 'orta'),
          status = COALESCE(v_finding->>'status', 'açık'),
          assigned_to = v_finding->>'assigned_to',
          resolved_at = CASE WHEN COALESCE(v_finding->>'status', 'açık') = 'çözüldü' THEN now() ELSE NULL END
      WHERE id = v_finding_id AND inspection_id = v_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('authorized', true, 'id', v_id);
END;
$function$;

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
      SELECT jsonb_agg(
        to_jsonb(f) || jsonb_build_object(
          'photos', COALESCE((
            SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at, p.id)
            FROM quality_inspection_photos p WHERE p.finding_id = f.id
          ), '[]'::jsonb)
        )
        ORDER BY f.created_at, f.id
      )
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

