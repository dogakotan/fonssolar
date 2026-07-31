-- CREATE OR REPLACE FUNCTION ile complete_project_manager_purchase_request'e
-- p_supplier_id parametresi eklerken (20260731070917) eski tek-parametreli
-- imza değiştirilmedi, YANINA ikinci bir overload olarak eklendi — Postgres
-- farklı imzalı fonksiyonları ayrı fonksiyon sayar. Sonuç: yalnızca
-- p_request_id ile RPC çağrısı (varsayılan p_supplier_id da eşleştiği için)
-- "Could not choose the best candidate function" hatasıyla belirsizleşti.
-- Bu proje bu tuzağa daha önce de düşmüştü, bkz. drop_old_create_purchase_request_overload
-- ve drop_stale_single_arg_recompute_auto_risks_overload migration'ları.
DROP FUNCTION public.complete_project_manager_purchase_request(uuid);
