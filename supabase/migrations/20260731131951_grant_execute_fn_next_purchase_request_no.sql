-- GERİYE DÖNÜK YENİDEN İNŞA (04.08.2026) — bkz. 20260724104456 dosyasındaki not.
-- purchase_requests.request_no kolonundaki DEFAULT ifadesi
-- fn_next_purchase_request_no(...) çağırır ve çağıran rolün bağlamında
-- değerlendirilir (SECURITY DEFINER bunu atlamaz) — authenticated'a EXECUTE
-- açılmazsa RPC dışında (ör. doğrudan insert) bu DEFAULT "permission denied"
-- ile başarısız olur.
grant execute on function public.fn_next_purchase_request_no(integer) to authenticated;
