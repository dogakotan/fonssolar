UPDATE project_tasks SET group_label = CASE task_code
  -- Şantiye Mobilizasyon
  WHEN 'M0'  THEN 'Şantiye Mobilizasyon'
  WHEN 'M0a' THEN 'Şantiye Mobilizasyon'
  WHEN 'M0b' THEN 'Şantiye Mobilizasyon'
  WHEN 'M0c' THEN 'Şantiye Mobilizasyon'
  WHEN 'M0d' THEN 'Şantiye Mobilizasyon'
  WHEN 'M0e' THEN 'Şantiye Mobilizasyon'
  -- Mekanik Bölüm
  WHEN 'M1' THEN 'Mekanik Bölüm'
  WHEN 'M2' THEN 'Mekanik Bölüm'
  WHEN 'M3' THEN 'Mekanik Bölüm'
  WHEN 'M4' THEN 'Mekanik Bölüm'
  WHEN 'M5' THEN 'Mekanik Bölüm'
  WHEN 'M6' THEN 'Mekanik Bölüm'
  -- Elektriksel — DC
  WHEN 'E1' THEN 'Elektriksel — DC'
  WHEN 'E2' THEN 'Elektriksel — DC'
  WHEN 'E3' THEN 'Elektriksel — DC'
  WHEN 'E4' THEN 'Elektriksel — DC'
  WHEN 'E5' THEN 'Elektriksel — DC'
  -- Elektriksel — AC
  WHEN 'E6'  THEN 'Elektriksel — AC'
  WHEN 'E7'  THEN 'Elektriksel — AC'
  WHEN 'E8'  THEN 'Elektriksel — AC'
  WHEN 'E9'  THEN 'Elektriksel — AC'
  WHEN 'E10' THEN 'Elektriksel — AC'
  -- Elektriksel — OG
  WHEN 'E11' THEN 'Elektriksel — OG'
  WHEN 'E12' THEN 'Elektriksel — OG'
  WHEN 'E13' THEN 'Elektriksel — OG'
  WHEN 'E14' THEN 'Elektriksel — OG'
  WHEN 'E15' THEN 'Elektriksel — OG'
  WHEN 'E16' THEN 'Elektriksel — OG'
  WHEN 'E17' THEN 'Elektriksel — OG'
  -- Topraklama
  WHEN 'T1' THEN 'Topraklama'
  WHEN 'T2' THEN 'Topraklama'
  -- ENH
  WHEN 'N1' THEN 'ENH'
  WHEN 'N2' THEN 'ENH'
  -- Devreye Alma
  WHEN 'D1' THEN 'Devreye Alma'
  WHEN 'D2' THEN 'Devreye Alma'
  WHEN 'D3' THEN 'Devreye Alma'
  ELSE group_label
END
WHERE project_id = 'adana-ges-2026';

