-- Rol -> sekme/sidebar erişim izinlerini hardcoded src/config/navigation.js
-- yerine DB'den okunur hale getirir. allowed_tabs NULL = kısıtsız (admin
-- gibi tüm sekmelere erişir). Backfill değerleri eski navigation.js ile
-- birebir aynı — davranış değişikliği yok, yalnızca veri kaynağı taşındı.
alter table roles
  add column allowed_tabs text[],
  add column default_tab text,
  add column sidebar_items text[] not null default '{}';

update roles set
  allowed_tabs = null,
  default_tab = null,
  sidebar_items = array['genel','projeler','satin-alma','finans','tickets','bildirimler','proje-ekle','kullanicilar']
where key = 'admin';

update roles set
  allowed_tabs = array['finans','satin-alma','bildirimler'],
  default_tab = 'finans',
  sidebar_items = array['finans','satin-alma','bildirimler']
where key = 'muhasebe';

update roles set
  allowed_tabs = array['genel','projeler','satin-alma','tickets','kullanicilar','proje-ekle','bildirimler'],
  default_tab = 'genel',
  sidebar_items = array['genel','projeler','satin-alma','tickets','bildirimler','proje-ekle','kullanicilar']
where key = 'proje_yoneticisi';

update roles set
  allowed_tabs = array['genel','is-plani','daily-report','rapor-listesi','satin-alma','tickets','bildirimler'],
  default_tab = 'genel',
  sidebar_items = array['genel','is-plani','rapor-listesi','satin-alma','tickets','bildirimler']
where key = 'santiye_sefi';
