-- get_profile_names: anon'a EXECUTE kesinlikle kapatılmalı (authenticated kalır)
revoke execute on function public.get_profile_names(uuid[]) from anon, public;

-- complete_project_manager_purchase_request: içeride auth kontrolü var ama savunma
-- amaçlı anon/public kapatılıyor, authenticated (proje_yoneticisi) kalıyor
revoke execute on function public.complete_project_manager_purchase_request(uuid, uuid) from anon, public;

-- Trigger fonksiyonları: hiçbir rolün RPC olarak doğrudan çağırmasına gerek yok
revoke execute on function public.fn_guard_financial_transaction_requires_procurement_done() from anon, authenticated, public;
revoke execute on function public.fn_sync_invoice_remaining_amount() from anon, authenticated, public;
revoke execute on function public.sync_purchase_request_from_financial_transaction() from anon, authenticated, public;
