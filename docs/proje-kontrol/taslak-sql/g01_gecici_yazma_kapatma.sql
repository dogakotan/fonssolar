-- ============================================================================
-- G-01 · GEÇİCİ ve GERİ ALINABİLİR kapatma — TASLAK, UYGULANMADI (v2, 07.10.2026)
-- Kapsam: YALNIZCA 05.10.2026'da açılan 8 register/geçmiş tablosu. authenticated rolünün
-- INSERT/UPDATE/DELETE yetkisi geri alınır; SELECT, policy'ler, fonksiyonlar, trigger'lar, FK'ler
-- ve veri değişmez.
--
-- v1'den fark: project_wbs, project_areas, area_wbs KAPSAM DIŞI bırakıldı — 05.10 planındaki
-- WBS/Alan ekranı bu master tablolara doğrudan yazacak; onların cross-project yazma durumu
-- ayrıca testle değerlendirildi (bkz. guvenlik-bulgulari.md G-10).
--
-- Ön kontrol (07.10.2026): src/, tests/, scripts/, supabase/functions/ ve commit'lenmemiş 8 dosyada
-- bu tablolara yazan kod yok (yalnızca tests/proje-kontrol-guvenlik.spec.js anon OKUMA denemesi —
-- etkilenmez). Veritabanında bu tablolara yazan RPC/view yok; trigger fonksiyonları
-- (fn_assign_register_no, fn_log_register_status) SECURITY DEFINER olduğu için etkilenmez.
-- 8 tablonun hepsi 0 satır.
--
-- Mevcut GRANT'ler (information_schema.role_table_grants, 06.10.2026):
--   8 tablonun her birinde authenticated: SELECT, INSERT, UPDATE, DELETE (TRUNCATE/REFERENCES/
--   TRIGGER phase1b ile zaten alınmış); anon: yok.
--
-- Uygulama sırası: npm run db:backup → BÖLÜM A → doğrulama sorgusu.
-- ============================================================================


-- ── BÖLÜM A · UYGULA ────────────────────────────────────────────────────────
begin;

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

commit;


-- ── Doğrulama (beklenen: 8 satır, hepsi yalnızca SELECT) ──────────────────────
-- select table_name, string_agg(privilege_type, ',' order by privilege_type) privs
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'authenticated'
--   and table_name in ('documents','drawings','rfis','actions','decisions',
--                      'technical_submittals','material_approvals','register_status_history')
-- group by 1 order by 1;


-- ── BÖLÜM B · GERİ AL (bugünkü GRANT'leri birebir geri verir) ───────────────
-- begin;
--
-- grant insert, update, delete on table
--   public.documents,
--   public.drawings,
--   public.rfis,
--   public.actions,
--   public.decisions,
--   public.technical_submittals,
--   public.material_approvals,
--   public.register_status_history
--   to authenticated;
--
-- comment on table public.rfis is null;   -- rfis'in G-01 öncesi yorumu yoktu (06.10.2026'da doğrulandı)
--
-- commit;
