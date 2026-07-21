CREATE OR REPLACE FUNCTION fn_sync_project_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_id  text;
  v_progress    integer;
  v_has_weights boolean;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  SELECT EXISTS (
    SELECT 1 FROM project_category_weights WHERE project_id = v_project_id
  ) INTO v_has_weights;

  IF v_has_weights THEN
    SELECT ROUND(
      SUM(w.weight_pct * COALESCE(cat_avg.avg_progress, 0)) / 100
    )::integer
    INTO v_progress
    FROM project_category_weights w
    LEFT JOIN (
      SELECT category, AVG(progress_pct) AS avg_progress
      FROM project_tasks
      WHERE project_id = v_project_id
      GROUP BY category
    ) cat_avg ON cat_avg.category = w.category
    WHERE w.project_id = v_project_id;
  ELSE
    SELECT ROUND(
      SUM(progress_pct * GREATEST(COALESCE(planned_end - planned_start, 1), 1))::numeric
      / NULLIF(SUM(GREATEST(COALESCE(planned_end - planned_start, 1), 1)), 0)
    )::integer
    INTO v_progress
    FROM project_tasks
    WHERE project_id = v_project_id;
  END IF;

  UPDATE projects
  SET progress = COALESCE(v_progress, 0)
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

