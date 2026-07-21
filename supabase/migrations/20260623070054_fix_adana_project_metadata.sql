
-- Adana GES projesini Excel'deki gerçek teknik verilerle güncelle
UPDATE projects SET
  name          = 'Adana GES',
  capacity_kwp  = 13284,        -- 13.284 MWp DC (Excel: dc_power_kwp)
  capacity_kwe  = 11500,        -- 11.5 MWe AC (Excel: ac_power_kwe)
  location      = 'Adana / Saimbeyli',  -- Excel: city + district
  start_date    = '2026-07-01', -- Excel: start_date
  target_date   = '2026-12-31', -- Excel: target_end_date
  total_days    = 184,          -- 1 Temmuz → 31 Aralık
  status        = 'beklemede',  -- Excel: beklemede (henüz başlamadı)
  progress      = 0
WHERE id = 'adana-ges-001';

