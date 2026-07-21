CREATE TABLE quality_inspection_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES quality_inspections(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  location text,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'orta' CHECK (severity IN ('düşük','orta','yüksek','kritik')),
  status text NOT NULL DEFAULT 'açık' CHECK (status IN ('açık','devam ediyor','çözüldü')),
  assigned_to text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quality_inspection_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY qif_select ON quality_inspection_findings FOR SELECT
  USING (user_has_project_access(project_id));
CREATE POLICY qif_insert ON quality_inspection_findings FOR INSERT
  WITH CHECK (user_has_project_access(project_id));
CREATE POLICY qif_update ON quality_inspection_findings FOR UPDATE
  USING (user_has_project_access(project_id)) WITH CHECK (user_has_project_access(project_id));
CREATE POLICY qif_delete ON quality_inspection_findings FOR DELETE
  USING (user_has_project_access(project_id));

