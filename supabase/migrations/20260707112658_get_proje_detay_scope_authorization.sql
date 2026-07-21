CREATE OR REPLACE FUNCTION public.get_proje_detay(p_project_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,

    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    'work_packages', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',           t.id,
          'task_name',    t.task_name,
          'task_code',    t.task_code,
          'name',         t.task_name,
          'category',     t.category,
          'sub_category', t.sub_category,
          'planned_start',t.planned_start,
          'planned_end',  t.planned_end,
          'start_date',   t.planned_start,
          'due_date',     t.planned_end,
          'progress_pct', t.progress_pct,
          'progress',     COALESCE(t.progress_pct, 0),
          'status',       t.status,
          'responsible',  t.responsible,
          'team_size',    t.team_size,
          'notes',        t.notes,
          'project_id',   t.project_id
        ) ORDER BY t.planned_start
      ), '[]'::jsonb)
      FROM project_tasks t
      WHERE t.project_id = p_project_id
    ),

    'progress_summary', (
      SELECT to_jsonb(v)
      FROM vw_project_progress_summary v
      WHERE v.project_id = p_project_id
    )
  );
END;
$function$;

