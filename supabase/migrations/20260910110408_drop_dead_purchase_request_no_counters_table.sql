-- purchase_request_no_counters tablosu 10.09.2026'daki request_no
-- duzeltmesinden beri (sequence-tabanli fn_next_purchase_request_no) hicbir
-- fonksiyon/kod tarafindan okunmuyordu; RLS'i kapaliydi ama anon/authenticated'a
-- hic grant verilmemis oldugundan gercek bir REST acigi yoktu. O turda "veri
-- kaybi riski almamak icin silinmedi, ayri bir temizlik migration'ina birakildi"
-- notuyla ertelenmisti - bu migration o ertelenmis temizligi kapatir.
drop table if exists public.purchase_request_no_counters;
