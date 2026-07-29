-- Muhasebe için ayrı "Genel Bakış" sidebar item'ı açıldı (bkz. MuhasebeGenelOzet.jsx) —
-- rol → sekme/sidebar erişimi tamamen roles tablosundan okunduğundan (bkz. CLAUDE.md
-- "Frontend yapısı"), kod tarafında yalnızca index.jsx'e bir render dalı eklemek yetmiyor,
-- bu satırın güncellenmesi gerekiyor. default_tab da 'genel'e çekildi (önceden 'finans'),
-- artık diğer rollerle aynı desende girişte genel bakışa düşüyor.
UPDATE roles SET
  allowed_tabs = ARRAY['genel','finans','satin-alma','bildirimler'],
  sidebar_items = ARRAY['genel','finans','satin-alma','bildirimler'],
  default_tab = 'genel'
WHERE key = 'muhasebe';
