CREATE OR REPLACE FUNCTION public.save_quality_inspection(
  p_project_id text,
  p_inspection_date date,
  p_inspector text,
  p_category text,
  p_created_by uuid,
  p_id uuid DEFAULT NULL,
  p_result text DEFAULT 'beklemede',
  p_notes text DEFAULT NULL,
  p_findings jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_finding jsonb;
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
    SET inspection_date = p_inspection_date,
        inspector = p_inspector,
        category = p_category,
        result = p_result,
        notes = p_notes
    WHERE id = p_id AND project_id = p_project_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('authorized', false);
    END IF;
  END IF;

  DELETE FROM quality_inspection_findings WHERE inspection_id = v_id;

  FOR v_finding IN SELECT jsonb_array_elements(COALESCE(p_findings, '[]'::jsonb))
  LOOP
    INSERT INTO quality_inspection_findings
      (inspection_id, project_id, location, description, severity, status, assigned_to, resolved_at)
    VALUES (
      v_id,
      p_project_id,
      v_finding->>'location',
      v_finding->>'description',
      COALESCE(v_finding->>'severity', 'orta'),
      COALESCE(v_finding->>'status', 'açık'),
      v_finding->>'assigned_to',
      CASE WHEN COALESCE(v_finding->>'status', 'açık') = 'çözüldü' THEN now() ELSE NULL END
    );
  END LOOP;

  RETURN jsonb_build_object('authorized', true, 'id', v_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_quality_inspection(text, date, text, text, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quality_inspection(text, date, text, text, uuid, uuid, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_quality_finding_status(p_finding_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project_id text;
BEGIN
  SELECT project_id INTO v_project_id FROM quality_inspection_findings WHERE id = p_finding_id;
  IF v_project_id IS NULL OR NOT has_project_access(v_project_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  UPDATE quality_inspection_findings
  SET status = p_status,
      resolved_at = CASE WHEN p_status = 'çözüldü' THEN now() ELSE NULL END
  WHERE id = p_finding_id;

  RETURN jsonb_build_object('authorized', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_quality_finding_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_quality_finding_status(uuid, text) TO authenticated;

