-- update_procurement_status, procurement_items üzerinde eski (satın alma talebi akışından
-- önceki) bir sipariş-takip tasarımından kalma tek RPC'ydi (order_date/expected_delivery/
-- supplier/notes yazıyordu). Artık bu alanları güncelleyen hiçbir RPC/UI yok — satın alma
-- iş akışı tamamen purchase_requests üzerinden yürüyor. Bu fonksiyon src/'de hiçbir
-- .rpc() çağrısından ya da testten referans almıyordu; dead code olarak kaldırıldı.
DROP FUNCTION IF EXISTS public.update_procurement_status(integer, text, text, date, date, text, text);
