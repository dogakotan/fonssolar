set local lock_timeout = '3s';

create or replace function public.fn_seed_default_category_weights()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  -- Varsayılan liste 14.10.2026 (Karar 89): 15 kategori, toplam 100; fiziksel olmayanlar %0.
  INSERT INTO project_category_weights (project_id, category, weight_pct)
  SELECT NEW.id, w.category::task_category, w.weight_pct
  FROM (VALUES
    ('kolon_montaji', 10), ('kiris_montaji', 8), ('asik_montaji', 7), ('panel_montaji', 17), ('mekanik', 5),
    ('elektrik_dc', 10), ('elektrik_ac', 10), ('elektrik_og', 8),
    ('kosk_trafo', 5), ('topraklama', 5), ('enh', 7), ('devreye_alma', 8),
    ('mobilizasyon', 0), ('evrak_sureci', 0), ('satin_alma', 0)
  ) AS w(category, weight_pct)
  WHERE NOT EXISTS (SELECT 1 FROM project_category_weights WHERE project_id = NEW.id);
  RETURN NEW;
END;
$function$;
