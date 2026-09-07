-- 20260903150000'de eklenen üst-seviye "Teklif/Pazarlık/Sipariş" sidebar
-- sayfası kullanıcı kararıyla geri alındı — süreç ekranı Satın Alma'nın kendi
-- alt-sekmesine (Tüm Talepler/Onay Bekleyenler/Bekleyen'in yanına) geri
-- taşındı, ayrı bir üst-seviye menü öğesi istenmedi. Eski 3 talebin
-- 'teklif_toplama'ya taşınması (aynı migration'ın diğer yarısı) DOKUNULMADAN
-- kalıyor — yalnızca sidebar/tab yetki satırları siliniyor.
delete from public.role_sidebar_items where item_key = 'teklif-pazarlik-siparis';
delete from public.role_allowed_tabs where tab_key = 'teklif-pazarlik-siparis';
