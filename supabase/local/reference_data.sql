-- Yerel ortam: şema dökümünün (supabase db dump) almadığı, uygulamanın çalışması için gereken parçalar.
-- Kişisel veri yok; yapılandırma ve referans verisi (12.10.2026 canlıdan salt okunur SELECT ile alındı).
-- Idempotent: tekrar çalıştırılabilir. Yalnızca yerel veritabanına uygulanır (scripts/local-db/setup.mjs).

-- 1 · Auth tetikleyicisi: auth şeması döküme girmez; public.handle_new_user() dökümde var, trigger'ı yok.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2 · Roller ve navigasyon (role_allowed_tabs / role_sidebar_items)
insert into public.roles (key, display_name, description, is_manager, cross_project, default_tab, tabs_unrestricted) values
  ('admin', 'Sistem Yöneticisi', 'Tüm sisteme tam erişim', true, false, null, true),
  ('muhasebe', 'Muhasebe', 'Fatura, ödeme ve mali raporlar', true, false, 'genel', false),
  ('proje_yoneticisi', 'Proje Yöneticisi', 'Onaylanan satın alma taleplerinde tedarikçi seçimi ve satın alma/teslimat takibi; kendi projesinin satın alma ve fatura sürecini izler.', false, true, 'genel', false),
  ('santiye_sefi', 'Şantiye Şefi', 'Günlük saha operasyonu, iş güvenliği, ekip yönetimi, kalite kontrol', false, false, 'genel', false)
on conflict (key) do nothing;

insert into public.role_allowed_tabs (role_key, tab_key, order_index)
select v.r, v.t, v.o from (values
  ('muhasebe','genel',0), ('muhasebe','finans',1), ('muhasebe','satin-alma',2), ('muhasebe','bildirimler',3), ('muhasebe','odemeler',10),
  ('proje_yoneticisi','genel',0), ('proje_yoneticisi','projeler',1), ('proje_yoneticisi','satin-alma',2), ('proje_yoneticisi','tickets',3),
  ('proje_yoneticisi','kullanicilar',4), ('proje_yoneticisi','proje-ekle',5), ('proje_yoneticisi','bildirimler',6), ('proje_yoneticisi','finans',10),
  ('santiye_sefi','genel',0), ('santiye_sefi','is-plani',1), ('santiye_sefi','daily-report',2), ('santiye_sefi','rapor-listesi',3),
  ('santiye_sefi','satin-alma',4), ('santiye_sefi','tickets',5), ('santiye_sefi','bildirimler',6)
) as v(r, t, o)
where not exists (select 1 from public.role_allowed_tabs x where x.role_key = v.r and x.tab_key = v.t);

insert into public.role_sidebar_items (role_key, item_key, order_index)
select v.r, v.t, v.o from (values
  ('admin','genel',0), ('admin','projeler',1), ('admin','satin-alma',2), ('admin','finans',3), ('admin','tickets',4),
  ('admin','bildirimler',5), ('admin','proje-ekle',6), ('admin','kullanicilar',7),
  ('muhasebe','genel',0), ('muhasebe','finans',1), ('muhasebe','satin-alma',2), ('muhasebe','bildirimler',3), ('muhasebe','odemeler',10),
  ('proje_yoneticisi','genel',0), ('proje_yoneticisi','projeler',1), ('proje_yoneticisi','satin-alma',2), ('proje_yoneticisi','tickets',3),
  ('proje_yoneticisi','bildirimler',4), ('proje_yoneticisi','proje-ekle',5), ('proje_yoneticisi','kullanicilar',6), ('proje_yoneticisi','finans',10),
  ('santiye_sefi','genel',0), ('santiye_sefi','is-plani',1), ('santiye_sefi','rapor-listesi',2), ('santiye_sefi','satin-alma',3),
  ('santiye_sefi','tickets',4), ('santiye_sefi','bildirimler',5)
) as v(r, t, o)
where not exists (select 1 from public.role_sidebar_items x where x.role_key = v.r and x.item_key = v.t);

-- 3 · Storage bucket'ları (hepsi özel). Storage policy'lerinin dökümde olup olmadığı ilk dökümde kontrol edilecek
--     (doğrulanamadı); yoksa bu dosyaya eklenir.
insert into storage.buckets (id, name, public) values
  ('saha-fotolari', 'saha-fotolari', false),
  ('ticket-ekleri', 'ticket-ekleri', false),
  ('teklif-ekleri', 'teklif-ekleri', false)
on conflict (id) do nothing;
