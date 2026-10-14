-- ============================================================================
-- DYB1 / DYB2 aktarımını geri alma — HAZIR, ÇALIŞTIRILMADI (14.10.2026)
-- Aktarım: C:\fons-yedek\veri-kaynak\DYB{1,2}_import.sql (import-project-excel v25 ile aynı satırlar).
-- projects satırı silinince CASCADE ile gidenler: project_tasks, project_risks (otomatik riskler dahil),
--   project_category_weights, project_register_settings (DYB1/DYB2 kodu), project_register_counters,
--   register_status_history, register tabloları, project_wbs/areas, daily_reports, tickets, notifications …
-- Güvenlik: progress_daily (görev), purchase_requests, financial_transactions, procurement_items, agent_reports
--   NO ACTION/RESTRICT. Projeye günlük rapor ilerlemesi, satın alma vb. girilmişse silme hata verip DURUR;
--   bu durumda geri alma artık "veri silme" kararıdır, ayrıca konuşulur.
-- Aşağıdaki koruma, beklenenden fazla bağlı kayıt varsa (aktarım sonrası kullanım) silmeden önce durdurur.
-- ============================================================================
begin;
set local lock_timeout = '3s';

do $g$
declare
  v_t int; v_r int; v_x int;
begin
  select count(*) into v_t from public.project_tasks where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2');
  select count(*) into v_r from public.project_risks where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2');
  select (select count(*) from public.daily_reports where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2'))
       + (select count(*) from public.tickets where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2'))
       + (select count(*) from public.budget_lines where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2'))
       + (select count(*) from public.user_project_access where project_id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2'))
    into v_x;
  -- Aktarımda: 58 + 27 = 85 görev; 25 + 16 manuel + 2 otomatik = 43 risk (risk motoru sonradan değiştirebilir)
  if v_t <> 85 or v_x <> 0 then
    raise exception 'DUR: beklenmeyen bağlı kayıt (görev %, risk %, rapor/ticket/bütçe/erişim %). Geri alma veri silmek olur; önce konuşulmalı.', v_t, v_r, v_x;
  end if;
  raise notice 'Silinecek: 2 proje, % görev, % risk', v_t, v_r;
end
$g$;

delete from public.projects where id in ('isdemir-diyarbakir-arazi-faz1', 'isdemir-diyarbakir-arazi-faz2');

-- Kontrol: 0 olmalı
select (select count(*) from public.projects where id like 'isdemir-diyarbakir-arazi-%') proje,
       (select count(*) from public.project_tasks where project_id like 'isdemir-diyarbakir-arazi-%') gorev,
       (select count(*) from public.project_risks where project_id like 'isdemir-diyarbakir-arazi-%') risk,
       (select count(*) from public.project_register_settings where prefix in ('DYB1', 'DYB2')) kod;

commit;
