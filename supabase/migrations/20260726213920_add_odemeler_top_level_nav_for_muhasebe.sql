-- Ödemeler'i Finans'tan ayrı, üst-seviye bir sidebar/sekme öğesi olarak
-- yalnızca muhasebe rolüne ekler (Ödeme Takibi + Tedarikçiler buraya taşınıyor).
-- order_index=10 seçildi (mevcut satırlar 0-3 aralığında) — Sidebar.jsx görüntüleme
-- sırasını kendi sabit dizisinden alıyor, order_index'i yalnızca üyelik/izin
-- kontrolü için okuyor — bu yüzden mevcut satırları kaydırmaya gerek yok.

INSERT INTO role_allowed_tabs (role_key, tab_key, order_index) VALUES ('muhasebe', 'odemeler', 10);
INSERT INTO role_sidebar_items (role_key, item_key, order_index) VALUES ('muhasebe', 'odemeler', 10);
