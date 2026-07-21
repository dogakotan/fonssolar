
UPDATE project_category_weights SET weight_pct = 20 WHERE category = 'panel_montaji';

CREATE OR REPLACE FUNCTION public.fn_seed_default_category_weights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO project_category_weights (project_id, category, weight_pct)
  SELECT NEW.id, w.category::task_category, w.weight_pct
  FROM (VALUES
    ('kolon_montaji', 10), ('kiris_montaji', 10), ('asik_montaji', 10), ('panel_montaji', 20),
    ('elektrik_dc', 10), ('elektrik_ac', 10), ('elektrik_og', 10),
    ('kosk_trafo', 5), ('topraklama', 5), ('devreye_alma', 10)
  ) AS w(category, weight_pct)
  WHERE NOT EXISTS (SELECT 1 FROM project_category_weights WHERE project_id = NEW.id);
  RETURN NEW;
END;
$$;

