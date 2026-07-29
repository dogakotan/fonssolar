-- Proje yöneticisi tek onaylayıcı olarak fatura onay kuyruğuna (Finans sekmesi
-- içindeki Onay Kuyruğu) normal navigasyonla erişebilsin diye 'finans'
-- role_allowed_tabs/role_sidebar_items'a eklenir — daha önce yalnızca bildirim
-- deep-link'i (setActiveTab bypass) ile erişilebiliyordu, handleTabChange
-- normal tıklamayı navigation.tabs'ta olmadığı için sessizce engelliyordu.
-- order_index=10 seçildi (mevcut satırlar 0-6 aralığında), mevcut satırları
-- kaydırmaya gerek yok (bkz. 20260726213920 aynı desen, odemeler/muhasebe için).

INSERT INTO role_allowed_tabs (role_key, tab_key, order_index) VALUES ('proje_yoneticisi', 'finans', 10);
INSERT INTO role_sidebar_items (role_key, item_key, order_index) VALUES ('proje_yoneticisi', 'finans', 10);
