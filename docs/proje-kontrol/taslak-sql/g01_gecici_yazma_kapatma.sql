-- ============================================================================
-- G-01 · GEÇİCİ ve GERİ ALINABİLİR kapatma — TASLAK, UYGULANMADI
-- Kapsam: 05.10.2026 migration'larının açtığı 11 tablo (project_register_counters'ta authenticated
-- yetkisi zaten yok). authenticated rolünün YAZMA yetkileri (INSERT/UPDATE/DELETE + RLS'i atlayan
-- TRUNCATE ve gereksiz REFERENCES/TRIGGER) geri alınır.
--
-- Neden REVOKE, policy DROP değil: policy'lere, fonksiyonlara, trigger'lara, FK'lere ve veriye
-- dokunulmaz; geri alma bugünkü GRANT'leri birebir geri vermektir (aşağıdaki BÖLÜM B). Karar #0
-- kapanınca (koru/kaldır) bu geçici durum kalıcı çözümle değiştirilir.
--
-- Değişmeyenler: SELECT (okuma) olduğu gibi kalır — G-01'in okuma tarafı (muhasebe'nin tüm
-- projeleri okuyabilmesi) bu taslağın kapsamı dışında. service_role ve postgres etkilenmez;
-- SECURITY DEFINER trigger fonksiyonları (fn_assign_register_no, fn_log_register_status) çalışmaya
-- devam eder. Tablolar boş (12/12 tabloda 0 satır, 06.10.2026) ve src/, tests/ (güvenlik spec'i
-- hariç), supabase/functions/ bunlara yazmıyor → kullanıcıya görünür etki beklenmiyor.
--
-- Mevcut GRANT'ler (06.10.2026, information_schema.role_table_grants):
--   documents, drawings, rfis, actions, decisions, technical_submittals, material_approvals,
--   register_status_history       → authenticated: SELECT, INSERT, UPDATE, DELETE
--   project_wbs, project_areas, area_wbs
--                                 → authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   project_register_counters     → authenticated: yok
--   anon                          → 12 tablonun hiçbirinde yok
-- ============================================================================


-- ── BÖLÜM A · UYGULA ────────────────────────────────────────────────────────
begin;

revoke insert, update, delete on table
  public.documents, public.drawings, public.rfis, public.actions, public.decisions,
  public.technical_submittals, public.material_approvals, public.register_status_history
  from authenticated;

revoke insert, update, delete, truncate, references, trigger on table
  public.project_wbs, public.project_areas, public.area_wbs
  from authenticated;

comment on table public.rfis is
  'G-01 (06.10.2026): authenticated yazma yetkisi GEÇİCİ olarak geri alındı; bkz. docs/proje-kontrol/taslak-sql/g01_gecici_yazma_kapatma.sql';

commit;


-- ── Doğrulama (uygulamadan sonra; beklenen: yalnızca SELECT satırları) ────────
-- select table_name, string_agg(privilege_type, ',' order by privilege_type) privs
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'authenticated'
--   and table_name in ('project_wbs','project_areas','area_wbs','documents','drawings','rfis','actions',
--                      'decisions','technical_submittals','material_approvals','register_status_history')
-- group by 1 order by 1;
--
-- Davranış testi (test projesinde, admin JWT'siyle; beklenen: 42501 permission denied):
--   insert into rfis (project_id, subject, question) values ('test-izmir-ges-2026','x','x');
-- Not: bu insert başarılı olursa project_register_counters'a bir sayaç satırı yazar — testi
-- yalnızca yetkinin GERÇEKTEN kapalı olduğu doğrulandıktan sonra, beklenen-hata olarak çalıştırın.


-- ── BÖLÜM B · GERİ AL (bugünkü GRANT'leri birebir geri verir) ───────────────
-- begin;
--
-- grant insert, update, delete on table
--   public.documents, public.drawings, public.rfis, public.actions, public.decisions,
--   public.technical_submittals, public.material_approvals, public.register_status_history
--   to authenticated;
--
-- grant insert, update, delete, truncate, references, trigger on table
--   public.project_wbs, public.project_areas, public.area_wbs
--   to authenticated;
--
-- comment on table public.rfis is null;
--
-- commit;
