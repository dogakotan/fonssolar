-- "Teklif / Pazarlık / Sipariş" 03.09.2026'da ayrı bir üst-seviye sidebar sayfası
-- olarak eklenmişti (bkz. 20260903180000_teklif_pazarlik_siparis_sidebar_page.sql) —
-- kullanıcı kararıyla 07.09.2026'da menüden kaldırılıyor. Sayfa/kod (TabTeklifPazarlikSiparis.jsx,
-- Sidebar.jsx'teki item tanımı, index.jsx'teki render) bilinçli olarak SİLİNMİYOR —
-- yalnızca role_sidebar_items/role_allowed_tabs satırları kaldırılıyor, Sidebar.jsx
-- görünürlüğü tamamen bu tablolardan okuduğundan bu tek başına yeterli
-- (bkz. ProjeTabSatinAlma.jsx'teki proje-içi "surec" alt-sekmesi zaten korunuyor,
-- kullanıcılar Teklif/Pazarlık/Sipariş sürecine oradan erişmeye devam ediyor).
delete from public.role_sidebar_items where item_key = 'teklif-pazarlik-siparis';
delete from public.role_allowed_tabs where tab_key = 'teklif-pazarlik-siparis';
