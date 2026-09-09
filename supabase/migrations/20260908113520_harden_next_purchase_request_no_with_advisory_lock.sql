-- fn_next_purchase_request_no() teorik olarak atomik (INSERT...ON CONFLICT
-- DO UPDATE...RETURNING) ama 08.09.2026'da gozlemlenen bir anomalide farkli
-- Postgres backend'lerinde (farkli pg_backend_pid()), farkli zaman
-- damgalarinda ayni degeri dondurdugu goruldu (bkz. CLAUDE.md "Son
-- degisiklik" — SAT-2026-101/102 cakismalari, Playwright regresyon
-- testlerinde tekrarlanan duplicate key hatalari). Kesin kok neden
-- (PgBouncer transaction-pooling / Supabase API katmani onbellegi olabilir)
-- bu oturumdaki araclarla kesinlestirilemedi. Ek savunma katmani olarak yil
-- bazli bir transaction-kilit eklendi — davranis degismiyor, tum caginlari
-- (ayni backend/pooling durumundan bagimsiz) tam olarak serilelestiriyor.
create or replace function public.fn_next_purchase_request_no(p_year integer)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_next int;
begin
  perform pg_advisory_xact_lock(hashtext('purchase_request_no:' || p_year::text));

  insert into public.purchase_request_no_counters (year, last_value)
  values (p_year, 1)
  on conflict (year) do update set last_value = purchase_request_no_counters.last_value + 1
  returning last_value into v_next;

  return 'SAT-' || p_year || '-' || lpad(v_next::text, 3, '0');
end;
$function$;
