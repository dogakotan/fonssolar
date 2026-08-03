-- Kök neden: request_no NOT NULL ama kolon seviyesinde DEFAULT'u yoktu —
-- yalnızca create_purchase_request_with_items RPC'si içeride açıkça üretip
-- yazıyordu. Üretim kodunda RPC dışında purchase_requests'e insert eden bir
-- yer yok, ama tests/purchase-single-item.spec.js eşzamanlılık senaryosunu
-- test etmek için RPC'yi bypass edip doğrudan insert yapıyor — bu 30.07.2026
-- request_no migration'ından beri kırıktı (tam regresyon koşumunda bulundu).
-- Savunma amaçlı: kolona da aynı sayaç fonksiyonunu çağıran bir DEFAULT
-- eklendi. RPC davranışını değiştirmez (RPC request_no'yu insert listesinde
-- açıkça veriyor, DEFAULT yalnızca kolon atlanırsa devreye girer).
alter table public.purchase_requests
  alter column request_no set default public.fn_next_purchase_request_no(extract(year from now())::int);

-- DEFAULT ifadesi insert eden rolün (authenticated) bağlamında değerlendirilir —
-- fonksiyon SECURITY DEFINER olsa da çağırma yetkisi ayrı bir kontrol, ve
-- authenticated'a hiç EXECUTE verilmemişti (yalnızca RPC'nin içinden postgres
-- bağlamında çağrılıyordu). Doğrudan bir insert'te DEFAULT tetiklenince
-- "permission denied for function" hatası veriyordu — grant eklendi. Güvenli:
-- fonksiyon yalnızca sıradaki SAT-YYYY-XXX kodunu üretip sayacı artırıyor.
grant execute on function public.fn_next_purchase_request_no(int) to authenticated;
