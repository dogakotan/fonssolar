-- G-01 (geçici, geri alınabilir): 05.10.2026'da açılan 8 register/geçmiş tablosunda
-- authenticated rolünün INSERT/UPDATE/DELETE yetkisi geri alınır. SELECT, policy'ler,
-- fonksiyonlar, trigger'lar ve veri değişmez. Geri alma: docs/proje-kontrol/taslak-sql/g01_gecici_yazma_kapatma.sql (BÖLÜM B)
-- veya docs/proje-kontrol/yedek-policy-07-10.sql.
revoke insert, update, delete on table
  public.documents,
  public.drawings,
  public.rfis,
  public.actions,
  public.decisions,
  public.technical_submittals,
  public.material_approvals,
  public.register_status_history
  from authenticated;

comment on table public.rfis is
  'G-01 (geçici): authenticated yazma yetkisi geri alındı; bkz. docs/proje-kontrol/taslak-sql/g01_gecici_yazma_kapatma.sql';
