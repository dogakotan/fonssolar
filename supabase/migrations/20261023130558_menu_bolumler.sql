-- Menü bölümleri + register menü öğeleri (adım 1/2). Eski tek "register" öğesi bu adımda KALIR;
-- yeni sayfalar canlıda doğrulanınca MENU_register_kaldir.sql ile kaldırılır.
-- Geri alma: MENU_bolumler.down.sql
--
-- Canlıdaki ön yüz (main, 22.10.2026) menüyü kendi sabit listesinden çizip role_sidebar_items'ı yalnızca
-- süzgeç olarak kullanıyor: register-* anahtarlarını tanımadığı için görmez, order_index değişikliği de
-- sırayı etkilemez. Bu adım yayındaki ekranı değiştirmez.
--
-- Görünürlük register_view_allowed() ile aynı (Karar 6 "G"); risk: admin, proje yöneticisi, şantiye şefi.
-- Admin'de role_allowed_tabs satırı yok (tabs_unrestricted) — yalnızca menü satırı eklenir.

set local lock_timeout = '3s';

-- 1. Bölümler (yalnızca okunur)
create table public.sidebar_sections (
  section_key text primary key,
  label       text    not null,
  order_index integer not null unique check (order_index >= 0)
);

alter table public.sidebar_sections enable row level security;
create policy sidebar_sections_read on public.sidebar_sections for select to authenticated using (true);
revoke all on public.sidebar_sections from public, anon, authenticated;
grant select on public.sidebar_sections to authenticated;

insert into public.sidebar_sections (section_key, label, order_index) values
  ('proje',            'Proje',                1),
  ('proje-kontrol',    'Proje kontrol',        2),
  ('dokuman',          'Doküman ve teknik',    3),
  ('ticari',           'Ticari',               4),
  ('satinalma-finans', 'Satın alma ve finans', 5),
  ('iletisim',         'İletişim',             6),
  ('yonetim',          'Yönetim',              7);

-- 2. Menü öğesinin bölümü (boş = bölümsüz, en üstte)
alter table public.role_sidebar_items
  add column section_key text references public.sidebar_sections (section_key) on update cascade on delete set null;

-- 3. Öğe → bölüm ve genel sıra; yeni register öğelerinin rolleri
create temp table _menu (item_key text primary key, section_key text, pos integer not null, roles text[]) on commit drop;
insert into _menu (item_key, section_key, pos, roles) values
  ('genel',                      null,               0,  null),
  ('projeler',                   'proje',            10, null),
  ('is-plani',                   'proje',            11, null),
  ('rapor-listesi',              'proje',            12, null),
  ('register-rfi',               'proje-kontrol',    20, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-action',            'proje-kontrol',    21, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-decision',          'proje-kontrol',    22, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-risk',              'proje-kontrol',    23, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-interface',         'proje-kontrol',    24, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-document',          'dokuman',          30, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-drawing',           'dokuman',          31, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-submittal',         'dokuman',          32, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-material-approval', 'dokuman',          33, array['admin', 'proje_yoneticisi', 'santiye_sefi']),
  ('register-change',            'ticari',           40, array['admin', 'proje_yoneticisi', 'muhasebe']),
  ('register-claim',             'ticari',           41, array['admin', 'proje_yoneticisi', 'muhasebe']),
  ('satin-alma',                 'satinalma-finans', 50, null),
  ('finans',                     'satinalma-finans', 51, null),
  ('odemeler',                   'satinalma-finans', 52, null),
  ('tickets',                    'iletisim',         60, null),
  ('bildirimler',                'iletisim',         61, null),
  ('proje-ekle',                 'yonetim',          70, null),
  ('kullanicilar',               'yonetim',          71, null),
  ('register',                   null,               99, null);  -- eski öğe, adım 2'de kalkar

-- 3a. Yeni menü öğeleri (sıra aşağıda yeniden hesaplanır; geçici olarak 1000+)
insert into public.role_sidebar_items (role_key, item_key, order_index, section_key)
select r.role_key, m.item_key, 1000 + m.pos, m.section_key
  from _menu m
  cross join lateral unnest(m.roles) as r(role_key)
 where m.roles is not null;

-- 3b. Mevcut öğelerin bölümü
update public.role_sidebar_items s
   set section_key = m.section_key
  from _menu m
 where m.item_key = s.item_key and m.roles is null;

-- 3c. Sıra: bölüm sırasına göre 0'dan. UNIQUE(role_key, order_index) ara adımda çakışmasın diye önce kaydırılır.
update public.role_sidebar_items set order_index = order_index + 2000;
update public.role_sidebar_items s
   set order_index = o.n
  from (
    select s2.role_key, s2.item_key,
           (row_number() over (partition by s2.role_key order by coalesce(m.pos, 1000), s2.order_index) - 1)::int as n
      from public.role_sidebar_items s2
      left join _menu m on m.item_key = s2.item_key
  ) o
 where o.role_key = s.role_key and o.item_key = s.item_key;

-- 4. Sayfa erişimi (admin hariç; mevcut sıranın sonuna)
insert into public.role_allowed_tabs (role_key, tab_key, order_index)
select r.role_key, m.item_key,
       (select coalesce(max(t.order_index), -1) from public.role_allowed_tabs t where t.role_key = r.role_key)
         + row_number() over (partition by r.role_key order by m.pos)
  from _menu m
  cross join lateral unnest(m.roles) as r(role_key)
 where m.roles is not null and r.role_key <> 'admin';
