
-- Eski tabloyu drop et
DROP TABLE IF EXISTS personnel_logs CASCADE;

-- Frontend'in yıkılmaması için uyumluluk view'ı (pivot geri)
-- Mevcut frontend personnel_logs'u (report_id, shift, idari, mekanik, elektrik, yevmiyeci, total) olarak okuyorsa bu view çalışır
CREATE OR REPLACE VIEW personnel_logs AS
SELECT
  report_id,
  shift,
  COALESCE(MAX(count) FILTER (WHERE department = 'idari'),     0) AS idari,
  COALESCE(MAX(count) FILTER (WHERE department = 'mekanik'),   0) AS mekanik,
  COALESCE(MAX(count) FILTER (WHERE department = 'elektrik'),  0) AS elektrik,
  COALESCE(MAX(count) FILTER (WHERE department = 'yevmiyeci'), 0) AS yevmiyeci,
  COALESCE(SUM(count), 0)                                        AS total
FROM personnel_log_entries
GROUP BY report_id, shift;

