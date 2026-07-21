ALTER TABLE quality_inspection_findings ADD COLUMN ticket_id uuid REFERENCES tickets(id);

CREATE TABLE quality_inspection_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES quality_inspection_findings(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quality_inspection_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY qip_select ON quality_inspection_photos
FOR SELECT USING (user_has_project_access(project_id));

CREATE POLICY qip_insert ON quality_inspection_photos
FOR INSERT WITH CHECK (user_has_project_access(project_id));

CREATE POLICY qip_delete ON quality_inspection_photos
FOR DELETE USING (uploaded_by = (select auth.uid()));

