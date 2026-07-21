
-- =====================================================
-- ENUM: Görev kategorileri
-- =====================================================
CREATE TYPE task_category AS ENUM (
  'mobilizasyon',
  'mekanik',
  'elektrik_dc',
  'elektrik_ac',
  'elektrik_og',
  'topraklama',
  'enh',
  'devreye_alma'
);

-- =====================================================
-- ENUM: Görev durumları
-- =====================================================
CREATE TYPE task_status AS ENUM (
  'beklemede',
  'devam_ediyor',
  'tamamlandi',
  'askida',
  'iptal'
);

-- =====================================================
-- TABLO: project_tasks
-- =====================================================
CREATE TABLE project_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  task_code         TEXT NOT NULL,
  task_name         TEXT NOT NULL,

  category          task_category NOT NULL,
  sub_category      TEXT,

  planned_start     DATE NOT NULL,
  planned_end       DATE NOT NULL,
  duration_days     INTEGER GENERATED ALWAYS AS (planned_end - planned_start) STORED,

  actual_start      DATE,
  actual_end        DATE,

  progress_pct      NUMERIC(5,2) DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  status            task_status NOT NULL DEFAULT 'beklemede',

  responsible       TEXT,
  team_size         INTEGER,
  equipment         TEXT,
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, task_code)
);

-- =====================================================
-- TABLO: critical_path_items
-- =====================================================
CREATE TABLE critical_path_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  path_code         TEXT NOT NULL,
  activity_name     TEXT NOT NULL,
  predecessor_codes TEXT,

  planned_start     DATE NOT NULL,
  planned_end       DATE NOT NULL,
  duration_days     INTEGER GENERATED ALWAYS AS (planned_end - planned_start) STORED,

  actual_start      DATE,
  actual_end        DATE,

  is_critical       BOOLEAN NOT NULL DEFAULT TRUE,
  status            task_status NOT NULL DEFAULT 'beklemede',
  progress_pct      NUMERIC(5,2) DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),

  responsible       TEXT,
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, path_code)
);

-- =====================================================
-- updated_at trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_project_tasks_updated_at
  BEFORE UPDATE ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_critical_path_updated_at
  BEFORE UPDATE ON critical_path_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INDEX
-- =====================================================
CREATE INDEX idx_project_tasks_project_id   ON project_tasks(project_id);
CREATE INDEX idx_project_tasks_status       ON project_tasks(status);
CREATE INDEX idx_project_tasks_category     ON project_tasks(category);
CREATE INDEX idx_project_tasks_planned_start ON project_tasks(planned_start);

CREATE INDEX idx_critical_path_project_id  ON critical_path_items(project_id);
CREATE INDEX idx_critical_path_status      ON critical_path_items(status);

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_path_items ENABLE ROW LEVEL SECURITY;

-- project_tasks: herkes okur
CREATE POLICY "project_tasks_select" ON project_tasks
  FOR SELECT TO authenticated USING (true);

-- project_tasks: admin her şeyi yazar; santiye_sefi kendi projesine
CREATE POLICY "project_tasks_insert" ON project_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'santiye_sefi'
      AND project_id = (SELECT project_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "project_tasks_update" ON project_tasks
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'admin'
    OR (
      get_my_role() = 'santiye_sefi'
      AND project_id = (SELECT project_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "project_tasks_delete" ON project_tasks
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- critical_path_items: herkes okur, sadece admin yazar
CREATE POLICY "critical_path_select" ON critical_path_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "critical_path_insert" ON critical_path_items
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "critical_path_update" ON critical_path_items
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

CREATE POLICY "critical_path_delete" ON critical_path_items
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

