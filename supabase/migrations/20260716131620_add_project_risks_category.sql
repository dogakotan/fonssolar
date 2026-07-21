
ALTER TABLE project_risks ADD COLUMN category text;

UPDATE project_risks SET category = CASE
  WHEN rule_code = 'gorev_gecikmesi'     THEN 'is_kalemi'
  WHEN rule_code = 'malzeme_fazla_talep' THEN 'satin_alma'
  ELSE 'diger'
END;

ALTER TABLE project_risks
  ALTER COLUMN category SET DEFAULT 'diger',
  ALTER COLUMN category SET NOT NULL,
  ADD CONSTRAINT project_risks_category_check
    CHECK (category = ANY (ARRAY['is_kalemi', 'satin_alma', 'diger']));

