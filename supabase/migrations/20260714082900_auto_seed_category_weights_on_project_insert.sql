
-- Gerçek bir bosluk bulundu: project_category_weights sadece Excel import edge function'inda seed ediliyordu.
-- Frontend sihirbazi projeyi dogrudan INSERT ile olusturuyorsa (Excel import disinda) agirliklar hic olusmuyordu
-- ve fn_sync_project_progress sessizce eski sure-agirlikli fallback'e duesyordu. Bunu DB seviyesinde garanti altina aliyoruz.
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
    ('kolon_montaji', 10), ('kiris_montaji', 10), ('asik_montaji', 10), ('panel_montaji', 10),
    ('elektrik_dc', 10), ('elektrik_ac', 10), ('elektrik_og', 10),
    ('kosk_trafo', 5), ('topraklama', 5), ('devreye_alma', 10)
  ) AS w(category, weight_pct)
  WHERE NOT EXISTS (SELECT 1 FROM project_category_weights WHERE project_id = NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_category_weights ON projects;
CREATE TRIGGER trg_seed_default_category_weights
AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION fn_seed_default_category_weights();

