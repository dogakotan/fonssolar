-- sync_cost_allocation_from_financial_transaction() bir trigger fonksiyonu
-- (yalnizca financial_transactions INSERT/UPDATE OF status,amount,project_id'de
-- tetiklenir) ama yanlislikla authenticated rolune EXECUTE acik birakilmisti --
-- kardes fonksiyonu sync_cost_allocation_from_invoice() (ayni gun, 2026-07-26'da
-- eklenmis) bu grant'a hic sahip degil. Trigger tetiklenmesi bu grant'a bagli
-- degildir (Postgres trigger fonksiyonlarini rol izin kontrolunden bagimsiz
-- cagirir) -- yalnizca gereksiz dogrudan-cagri (/rest/v1/rpc/...) yolunu kapatir,
-- davranis degismez.
revoke execute on function public.sync_cost_allocation_from_financial_transaction() from public, anon, authenticated;
