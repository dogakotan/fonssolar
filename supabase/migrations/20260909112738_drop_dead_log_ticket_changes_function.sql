-- log_ticket_changes() eski bir trigger fonksiyonuydu (tickets UPDATE'te status/
-- assigned_to/severity değişikliklerini ticket_history'ye loglayıp resolved_at'i
-- set ediyordu) ama hiçbir trigger'a bağlı değildi (ölü kod taramasında bulundu,
-- 09.09.2026) — gerçek log trigger'ı fn_ticket_history(), yerini o almış.
drop function if exists public.log_ticket_changes();
