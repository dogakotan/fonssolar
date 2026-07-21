
-- ADIM 5: personnel_logs normalize et (1NF düzeltme)
-- Yeni yapı: (report_id, shift, department, count) — repeating group yok

-- Yeni normalize tablo
CREATE TABLE personnel_log_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  shift      TEXT NOT NULL CHECK (shift = ANY (ARRAY['mühendis', 'usta', 'işçi'])),
  department TEXT NOT NULL CHECK (department = ANY (ARRAY['idari', 'mekanik', 'elektrik', 'yevmiyeci'])),
  count      INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  UNIQUE (report_id, shift, department)
);

-- RLS
ALTER TABLE personnel_log_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ple_select_auth"  ON personnel_log_entries FOR SELECT  USING (auth.role() = 'authenticated');
CREATE POLICY "ple_insert_auth"  ON personnel_log_entries FOR INSERT  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "ple_update_auth"  ON personnel_log_entries FOR UPDATE  USING (auth.role() = 'authenticated');
CREATE POLICY "ple_delete_auth"  ON personnel_log_entries FOR DELETE  USING (auth.role() = 'authenticated');

-- Mevcut veriyi yeni tabloya taşı (unpivot)
INSERT INTO personnel_log_entries (report_id, shift, department, count)
SELECT report_id, shift, 'idari',      idari      FROM personnel_logs WHERE idari      > 0
UNION ALL
SELECT report_id, shift, 'mekanik',    mekanik    FROM personnel_logs WHERE mekanik    > 0
UNION ALL
SELECT report_id, shift, 'elektrik',   elektrik   FROM personnel_logs WHERE elektrik   > 0
UNION ALL
SELECT report_id, shift, 'yevmiyeci',  yevmiyeci  FROM personnel_logs WHERE yevmiyeci  > 0;

