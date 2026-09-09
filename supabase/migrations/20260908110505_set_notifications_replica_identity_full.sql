-- notifications tablosu REPLICA IDENTITY DEFAULT'tu (yalnızca id WAL'a
-- yazılıyordu). NotificationBell.jsx/TabBildirimler.jsx'teki realtime
-- kanalları DELETE olaylarını recipient_id=eq.<id> filtresiyle dinliyor —
-- ama DELETE'te eski satırın yalnızca birincil anahtarı mevcut olduğundan
-- (recipient_id yok) bu filtre hiç değerlendirilemiyordu, açık bir sekme
-- bir bildirim silindiğinde bunu asla öğrenemiyordu (sayfa yenilenene kadar
-- listede/rozette görünmeye devam ediyordu). FULL ile eski satırın tüm
-- kolonları WAL'a yazılır, filtre doğru çalışır. Davranış değişikliği yok.
alter table public.notifications replica identity full;
