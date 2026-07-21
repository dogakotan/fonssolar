ALTER TABLE quality_inspections ADD COLUMN created_by uuid REFERENCES profiles(id);

