
CREATE OR REPLACE FUNCTION get_proje_detay(
  p_project_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(

    -- 1. Proje detayları (tüm kolonlar)
    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    -- 2. İş paketleri — getWorkPackages() ile aynı yapı + aliases
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

    -- 3. İlerleme özeti (view)
    'progress_summary', (
      SELECT to_jsonb(v)
      FROM vw_project_progress_summary v
      WHERE v.project_id = p_project_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_proje_detay(TEXT) TO authenticated;

