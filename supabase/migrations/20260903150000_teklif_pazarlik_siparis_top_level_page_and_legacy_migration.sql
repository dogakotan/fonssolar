-- Kullanıcı isteğiyle: Teklif/Pazarlık/Sipariş süreci Satın Alma'nın alt-
-- sekmesinden kendi üst-seviye sidebar sayfasına taşınıyor (admin + proje
-- yöneticisi). Frontend tarafı ProjeTabSatinAlma.jsx/TabSatinAlma.jsx'teki
-- 'surec' alt-sekmesini kaldırıp yeni TabTeklifPazarlikSiparis.jsx'i
-- 'teklif-pazarlik-siparis' tab/sidebar anahtarıyla ekliyor (Sidebar.jsx'e
-- de ikon/label eklendi — roles tablosu güncellemesi tek başına yeterli
-- değil).
--
-- admin tabs_unrestricted=true olduğundan role_allowed_tabs'a satır
-- gerekmiyor, yalnızca role_sidebar_items'a ekleniyor. proje_yoneticisi'ne
-- her ikisi de ekleniyor. order_index yalnızca (role_key, order_index)
-- UNIQUE kısıtını sağlamak için var — Sidebar.jsx'teki görsel sıra kendi
-- sabit items[] dizisinden geliyor, bu sayı hiçbir görünür sırayı etkilemiyor
-- (mevcut en yüksek order_index'lerin üstüne eklendi: admin sidebar 0-7,
-- proje_yoneticisi sidebar/tabs 0-6 + finans=10).
insert into public.role_sidebar_items (role_key, item_key, order_index) values
  ('admin', 'teklif-pazarlik-siparis', 8),
  ('proje_yoneticisi', 'teklif-pazarlik-siparis', 11);

insert into public.role_allowed_tabs (role_key, tab_key, order_index) values
  ('proje_yoneticisi', 'teklif-pazarlik-siparis', 11);

-- ============================================================
-- Eski akıştan kalan talepler (talep_olusturuldu — 3 aşamalı akış devreye
-- girmeden ÖNCE, 02.09.2026'da oluşturulmuş, teklif verisi hiç yok) yeni
-- sürece taşınıyor: doğrudan yönetici onayında beklemek yerine teklif
-- toplama aşamasından başlıyorlar. trg_notify_purchase_request_status'un
-- 'teklif_toplama' dalı yalnızca old.status='pazarlik_onay_bekliyor'
-- geçişini bildirdiğinden (bu UPDATE'te tetiklenmez), proje yöneticisine
-- insert trigger'ıyla birebir aynı metinle manuel bildirim atılıyor.
-- ============================================================
do $$
declare
  r record;
begin
  for r in
    update public.purchase_requests
    set status = 'teklif_toplama'
    where status = 'talep_olusturuldu'
    returning id, title, requested_by, project_id
  loop
    perform public.notify_role('proje_yoneticisi', r.requested_by, r.project_id, 'purchase_request', r.id, 'created',
      'Yeni satın alma talebi: '||r.title, 'Teklif toplama aşamasında.');
  end loop;
end $$;
