# Fons Solar — GES Dashboard

Fons Solar GES (güneş enerji santrali) uçtan uca proje takip sistemi.
Backend Supabase (proje ref `bshhgvdzemgfijkzhcrf`, `eu-central-2`, PostgreSQL 17),
frontend bu repodaki React + Vite (JS, TypeScript değil) uygulaması (`src/`).

Bu dosya projenin **tek** CLAUDE.md'sidir ve sistemin **şu anki** halini anlatır —
tarihli kronolojik log değildir. Mimariyi/şemayı değiştiren her görevden sonra
ilgili bölümü doğrudan güncelle: yeni bilgiyi ekle, geçersiz kalanı çıkar.
"Son değişiklik" bölümü tek istisna: orada da biriktirme yapılmaz, her görev
sonunda üzerine yazılır.

## graphify

Bu projede `graphify-out/` altında god node'lar, community yapısı ve dosyalar
arası ilişkileri içeren bir bilgi grafiği var.

- Kod tabanı sorularında önce `graphify query "<soru>"` çalıştır (graphify-out/graph.json
  varsa). İlişkiler için `graphify path "<A>" "<B>"`, odaklı kavramlar için
  `graphify explain "<kavram>"` — bunlar GRAPH_REPORT.md veya ham grep'ten çok
  daha küçük, kapsamlı bir alt-grafik döndürür.
- `graphify-out/wiki/index.md` varsa geniş gezinme için onu kullan, ham kaynak
  taramaya tercih et.
- `graphify-out/GRAPH_REPORT.md`'yi yalnızca geniş mimari inceleme gerektiğinde
  veya query/path/explain yeterli bağlam sunmadığında oku.
- Kod değiştirdikten sonra `graphify update .` çalıştır (yalnızca AST, API
  maliyeti yok).
- Kullanıcı `/graphify` yazdığında, başka bir şey yapmadan önce Skill tool'unu
  `skill: "graphify"` ile çağır.

## Kesin kurallar

1. **Migration onayı zorunlu.** Hiçbir migration'ı SQL'ini gösterip onay almadan
   `apply_migration` ile uygulama.
2. **Geriye dönük uyumluluk.** Çalışan RPC/trigger bozulmaz. Sıra: yeni yapı/RPC
   eklenir → frontend geçirilir → eski yapı ayrı bir temizlik migration'ıyla kaldırılır.
3. **Anahtarlar.** `.env` yalnızca `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
   `service_role` frontend'de asla kullanılmaz.
4. **Dil/adlandırma.** Arayüz Türkçe. Kod/kolon/fonksiyon adları İngilizce
   snake_case. Tarihler `YYYY-MM-DD`. Para: sayı + ayrı `currency`/`vat_rate` kolonu.
   RPC deseni: `get_*` (okuma), `save_*`/`create_*` (yazma).
5. **RLS.** Rol kontrolü `get_my_role()` (SECURITY DEFINER) üzerinden yapılır —
   `profiles` tablosunu RLS altında doğrudan sorgulamak recursion yaratır.
   Proje erişimi merkezi olarak `has_project_access(p_project_id)` üzerinden
   kontrol edilir (`user_has_project_access`/`user_can_access_report` buna delege eder).
6. **Atomiklik.** Çoklu tabloya yazan formlar tek RPC ile atomik olmalı
   (`save_daily_report`, `create_purchase_request_with_items` deseni).
7. Şema değişikliğinde kullanıcıya `fons_solar_sistem_dokumantasyonu.docx` ve
   `fons_solar_veritabani_dokumantasyonu.docx` dosyalarının güncellenmesi gerektiğini hatırlat (varsa).

### Kod tarama notu — supabase.from() sayımı
`grep -rn "supabase\.from(" src/` **tek satırlık** desendir ve kodda zincirleme
çağrının `supabase` ile `.from(` farklı satırlara bölündüğü durumları
(`supabase\n  .from('table')`) kaçırır. `supabase.from()` taraması yapılırken
**çok satırlı** bir desen kullanılmalı: Grep tool'da `pattern: "supabase\\s*\\.\\s*from\\("`
+ `multiline: true`, veya kabuktan `rg -U --multiline-dotall 'supabase\s*\.\s*from\('`.
Tek satırlık sonuçlara güvenip "kalan iş listesi tam" sonucuna varma.

### Veri modeli değişikliğinden sonra tam tarama
Bir tablo/kolon kaldırılıp yerine başka bir modele geçilince, yalnızca ilk
bulunan yeri düzeltmek yetmez — aynı eski deseni okuyan başka client-side kod
parçaları genelde vardır, sessizce donmuş veri göstermeye devam ederler. Eski
adın tüm `src/` ağacında grep'i + DB tarafında `pg_proc.prosrc ilike '%eski_ad%'`
taraması (fonksiyon gövdeleri opak metin, `pg_depend`/view bağımlılığı bunları
YAKALAMAZ) + kaldırılan kolonu/tabloyu gerçekten YAZAN bir akışın (yalnızca
okuma değil) Playwright/gerçek RPC çağrısıyla uçtan uca testi şart. `CREATE OR
REPLACE FUNCTION`'ın hatasız dönmesi, içindeki tablo/kolon referanslarının hâlâ
geçerli olduğunu KANITLAMAZ — bu kontrol yalnızca ilk çağrıda yapılır.

---

## Sistem mimarisi (güncel referans)

### Frontend yapısı
- Routing düz: `/login`, `/yetkisiz`, `/dashboard` (tek `ProtectedRoute`,
  `ScopeProvider` ile sarmalı). Sayfa bazlı route YOK — `src/pages/dashboard/index.jsx`
  içinde `activeTab` state'i (localStorage'da saklanır) ile sekme değiştirilir;
  her "sayfa" bir `Tab*.jsx` bileşenidir (`TabGenel`, `TabFinans`, `TabSatinAlma`,
  `TabTickets`, `TabKullanicilar`, `TabProjeYonetimi`, `TabSantiyeSefi`,
  `TabIsPlan`, `TabBildirimler`).
- Proje-özel görünümler `src/pages/dashboard/components/ProjeTab*.jsx` altında
  (`ProjeDetay.jsx` seçilen projeyi gösterir); genel/tüm-projeler görünümleri
  ayrı `Tab*.jsx` dosyalarında. Finans/Satın Alma bu ikisi arasında alt
  bileşen paylaşıyor (`projectId` opsiyonel prop deseni); Malzeme Listesi (BOM)
  ve `MaliyetOzetTable`/`ProjeTabMaliyetTablosu` bilinçli olarak ayrı bileşenler
  — birleştirilmeyecek (BOM projeye özgü bir kavram, ikinci çift özet/detaylı
  görünüm farkı).
- Auth: `src/context/AuthContext.jsx` — `get_my_role()`/`get_my_projects()`
  RPC'lerinden ve `roles` tablosundan `role`, `isAdmin`, `isMuhasebe`, `projectId`,
  `roleLabel`, `isManager`, `navigation` (`{tabs, defaultTab, sidebarItems}`)
  sağlar. `isAdmin` KESİNLİKLE `role === 'admin'` olmalı. Kapsam seçici
  (`src/context/ScopeContext.jsx`) yönetici rollerine tek-proje/Tüm Projeler
  geçişi sağlar; header'daki global proje seçici kasıtlı olarak yok — tek
  projeli kullanıcıda kapsam otomatik çözülür.
- Rol → sekme/sidebar erişimi **DB-tabanlı**: `roles.allowed_tabs`
  (NULL = kısıtsız)/`default_tab`/`sidebar_items` kolonlarından okunur,
  `AuthContext` login'de bu satırı çekip `navigation` olarak context'e koyar;
  `Sidebar.jsx`/`index.jsx`/`TabBildirimler.jsx` buradan okur. Yeni bir rol
  eklemek/bir rolün erişimini değiştirmek yalnızca `roles` tablosunda bir
  güncelleme gerektirir, kod değişikliği gerekmez.
- Veri çekme: ortak `src/hooks/useDashboardData.js` (loading/refreshing/error +
  visibilitychange'de tazeleme) ve `src/hooks/useRealtimeRefresh.js` (ekran
  başına tek Supabase Realtime kanalı, 2sn debounce, 60sn polling yedeği) —
  yeni bir dashboard ekranı yazılıyorsa önce bunları kullan. Kendi ham
  sorgusunu koşan liste bileşenleri (`*TalepListesi.jsx` gibi) üst bileşenin
  realtime kanalına dahil değildir — üst bileşen bir `refreshKey` state'i
  tutup realtime callback'inde bump ederek alt bileşenin de yeniden
  çekmesini sağlar (`TabSatinAlma.jsx`/`ProjeTabSatinAlma.jsx` bu deseni kullanır).
- Saha ekranları (`SantiyeSefiDashboard.jsx`, `DailyReportForm.jsx`,
  `DailyReportList.jsx`) mobil öncelikli — santiye_sefi rolü telefondan
  kullanır. `DailyReportForm.jsx` 9 bölümlü liste (Hava/Genel, Personel, Makine,
  Günün İşleri, İlerleme, Sorunlar, Fotoğraflar, Notlar) + slide-over panel
  modelinde (masaüstünde ortalanmış sabit kutu, mobilde bottom-sheet); panel
  içi tablolar dikey kart listesi (`CARD_ROW`), yatay scroll değil. Kendi
  taslak otomatik kaydetme/yükleme sistemi var (`daily_report_drafts` tablosu,
  sahiplik bazlı RLS). "Hava kayıplı gün" alanı (`weather_loss_day`) ve serbest
  metin makine türü girişi var. Rapor sahibi kendi raporunu silebilir.
  "Malzeme Kullanımı" bölümü formda **kasıtlı olarak YOK** (`daily_report_material_usage`
  tablosu kullanımda değil) — **kalıcı karar:** BOM/malzeme kullanımı günlük
  raporun kapsamında değil; geri getirilmesi teklif edilirse önce bu kararı
  hatırlat. "İlerleme Girişi" `project_tasks`'tan (task_id bazlı) beslenir.
  "Sorunlar" bölümündeki her satır `daily_report_issues`'a `save_daily_report`'un
  `p_issues`'una id-bazlı upsert ile yazılır (bkz. Trigger zincirleri) — satır
  otomatik bir ticket'a bağlıysa tıklanabilir bir durum rozeti gösterir, tıklamak
  Tickets sekmesine geçip o ticket'ı doğrudan açar (`openTicketId` state zinciri,
  `index.jsx` → `TabTickets` → `TicketListesi`). `daily_report_issues.description`
  kolonu ayrıca `category`/`closed_at`/`notes` alanlarını `__ISSUE_META__{json}`
  öneki ile paketler (bu tabloda o kolonlar yok) — round-trip için tabloda
  olduğu gibi kalır, ama otomatik açılan ticket'a kopyalanırken önek soyulur.
- `ProjeDetay.jsx`'in 8 sekmesi: Genel Proje, İş Planı, Satın Alma, Malzeme
  Listesi, Finans, Ticket, Raporlar, Ekip — sekme bazlı rol gizleme yok, her
  role görünür (Finans proje_yoneticisi için salt-okunur, Tickets tam yetkili).
  Malzeme Listesi sekmesi kendi içinde iki alt-sekmeye ayrılır (`ProjeTabMalzemeListesi.jsx`
  içindeki yerel `section` state'i): **Malzeme Listesi** (BOM/`ProjeTabFaturaKesilecekler.jsx`)
  ve **Riskler** (`ProjeTabRiskler.jsx`) — ikisi tek sayfa, çünkü malzeme fazla
  talebi riski doğrudan BOM'dan doğuyor. Riskler alt-sekmesi hem manuel hem
  otomatik tüm riskleri satın alma talep listesiyle aynı temada (tablo + `Pager`,
  satır boyu diğer listelerden daha dar — `TD height:46`) satır satır listeler,
  satıra tıklamak açıklama/aksiyon/olasılık-etki + kapanma tarihini gösteren bir
  modal açar (otomatik risklerde ilgili sekmeye — İş Planı/Satın Alma — giden bir
  buton da içerir). Genel Proje (`ProjectOverviewDashboard.jsx`, tek veri kaynağı
  `get_project_by_date`) düzeni: üstte Proje Detayları/Genel İlerleme/
  Özet/Hava Durumu kartları; orta satırda eşit iki kart — **Projenin Gidişatı**
  (S-eğrisi çizgi grafiği) ve **Kategori Bazlı İlerleme** (yatay bullet/progress
  liste, plan işareti kırmızı). Alt grid 3 kolon: Günlük Rapor Özeti, Malzeme
  Kalemleri/Satın Alma, Maliyet Durumu, Güncel Ticketlar, Riskler, Saha
  Fotoğrafları (Ticketlar/Riskler 4'lü sayfalama — `Pager` + `*_PAGE_SIZE=4`,
  `slice(0,5)` değil). Risk severity frontend'de kural bazlı normalize edilir:
  `gorev_gecikmesi` 7+ gün gecikmişse `kritik`, azsa `orta`; `malzeme_fazla_talep`
  `yüksek`; diğerlerinde kayıttaki severity. Durum rozetleri (hem bu karttaki
  hem Riskler alt-sekmesindeki) tek tema kullanır: pill/arkaplan değil, nokta +
  kalın renkli metin (satın alma talep listesindeki `RiskBadge` — Uygun/Riskli/
  Listede Yok — ile aynı görsel dil). Kartın "Tümünü Gör" linki `ProjeDetay.jsx`'teki
  `goToTab('riskler')` yardımcı fonksiyonu üzerinden Malzeme Listesi sekmesini AÇIP
  içindeki `malzemeSection` state'ini `'riskler'`ye çeker (kendi başına bir üst-seviye
  sekme değil); kart yalnızca `source==='otomatik'` riskleri gösterir (manuel riskler
  kartta filtrelenir — bilinçli, kompakt tutmak için), Riskler alt-sekmesi ise hepsini
  gösterir. Proje Excel içe/dışa aktar yalnızca Proje Yönetimi sayfasında; proje
  detayının "Proje Excelini İndir" butonu tüm proje-erişimli rollerde görünür.
- Şantiye şefi "Satın Alma" sekmesi sadeleştirilmiş (`<ProjeTabSatinAlma
  siteChiefView />`, KPI/sidebar yok): yalnızca **Talepler** (`requested_by === user.id`
  ile süzülü, onay/red butonu yok) ve **Malzeme Listesi**.
  Satın Alma/Malzeme Listesi tabloları `PAGE_SIZE=10` + ortak `Pager` bileşeni
  kullanır (iç-scroll kutusu değil).
  İş Planı (`TabIsPlan.jsx`) kritik yol görselleştirmesi kullanmaz: plan bitiş
  tarihi geçmiş ve görev tamamlanmamışsa `Riskli`, aksi halde `Normal`. KPI
  şeridi 3 kart: Toplam Görev, Devam Eden, Riskli/Geciken.
  Proje Finans sekmesi (`ProjeTabFinans.jsx`) rol bazlı: admin ve proje
  yöneticisi (`canApprove = isAdmin || role==='proje_yoneticisi'`) proje içinde
  Genel/Faturalar/Onay Kuyruğu görür — proje yöneticisi artık fatura onay
  akışındaki "Yönetici" olduğundan bu erişim 2026-07-24'te açıldı (önceden
  yalnızca Genel özeti görürdü). Maliyet Tablosu (bütçe verisi) hâlâ yalnızca
  admin'e özel. Diğer roller yalnızca Genel özeti görür.
  Menü seviyesindeki `TabFinans.jsx`'te muhasebe hâlâ yalnızca `Faturalar`
  alt-sekmesini görür (`Genel`/`Onay Kuyruğu`/`Maliyet Tablosu` yok — bütçe
  verisine erişimi zaten yok, bkz. RPC katmanı). Muhasebenin kendi genel
  bakışı `TabFinans`'ın İÇİNDE değil, ayrı bir üst-seviye sidebar item'ında:
  `index.jsx`'teki `genel` sekmesi diğer roller için `TabGenel` render
  ederken muhasebe için `MuhasebeGenelOzet.jsx`'i render eder (role bazlı
  dallanma, tab anahtarı aynı — `roles.allowed_tabs/sidebar_items/default_tab`
  muhasebe için de `genel`'i içerir, girişte oraya düşer). Bütçe/planlanan
  RPC'lerine hiç dokunmadan, muhasebenin zaten yetkili olduğu iki RPC'den
  (tüm projeler/durumlar `get_invoices_list`, `satin_alindi`/`fatura_bekliyor`'a
  daralan `get_satin_alma_overview_all`) istemci tarafında özetlenir:
  faturalanacak talep sayısı, yönetici onayındaki/reddedilen/bu ay onaylanan
  fatura sayısı+tutarı, son faturalar listesi. KPI kartına tıklamak
  `handleTabChange` ile ilgili üst-seviye sekmeye geçer ("Faturalanacak
  Talepler" → `satin-alma`, diğerleri → `finans`) — hedef sekme içindeki alt
  sekme/durum filtresi otomatik ayarlanmaz, kullanıcı elle seçer.

### Satın alma akışı
Durum zinciri: `talep_olusturuldu → fiyat_girildi → onay_bekliyor → onaylandi
→ satin_alindi → fatura_bekliyor/fatura_onay_bekliyor → faturasi_kesildi`
(+ `reddedildi`/`iptal`). `fatura_bekliyor` pratikte hiç üretilmez (yalnızca
DB constraint'in izin verdiği ama hiçbir RPC'nin yazmadığı bir değer, savunma
amaçlı frontend gruplama listelerinde duruyor) — fatura oluşturulunca durum
tek hamlede `fatura_onay_bekliyor`'a düşer ve muhasebe (adım 1) + yönetici
(adım 2) onaylarının ikisinde de aynen kalır, yalnızca adım 2 onaylanınca
`faturasi_kesildi`'ye geçer. Bu yüzden `fatura_bekliyor`/`fatura_onay_bekliyor`
UI'da bilinçli olarak aynı metni ("Fatura Bekleniyor") gösterir.

**Tek kalem kuralı:** bir satın alma talebi yalnızca tek bir kalem içerebilir
— `create_purchase_request_with_items` RPC'sinde ve tablo trigger'ında
(eşzamanlı ikinci kalem eklemeye karşı da) zorunlu kılınır.

**Proje yöneticisi tedarik adımı:** `onaylandi` ile fatura arasında zorunlu
bir adım var. `proje_yoneticisi` (artık `cross_project=true`, tüm projelere
erişir) kendi `ProjeTabSatinAlma.jsx` içindeki **"Tedarik"** alt-sekmesinden
(`TedarikKuyrugu.jsx`, `canManageProcurement = isAdmin || role==='proje_yoneticisi'`)
`onaylandi` durumundaki talepleri işler: `supplier_id` + `purchase_date`
girip doğrudan `purchase_requests` UPDATE eder — DB tetikleyicisi
(`trg_auto_advance_pr_to_satin_alindi`) statüyü otomatik `satin_alindi`'ye
ilerletir, status elle set edilmez. İstisna: tedarikçi bulunamazsa "İptal Et"
(zorunlu gerekçe) statüyü doğrudan `iptal`'e çeker — `satin_alindi`'ye geçmiş
bir talep artık iptal edilemez. RLS (`pr_update_proje_yoneticisi`) yalnızca
tedarik alanlarına yazmaya izin verir (title/tutar/requested_by/approved_by
dokunulamaz). Sert kilit: `trg_guard_invoice_requires_procurement_done`
talep hâlâ `onaylandi`'nin öncesindeyse fatura insert'ini reddeder — muhasebe
bu adımı atlayamaz. `TedarikKuyrugu.jsx`'ten proje yöneticisi doğrudan yeni
talep de açabilir; bu sekme her zaman tüm-projeler modunda çalışır.

**Fatura onay akışı (tek onaylayıcı — "Yönetici" = proje_yoneticisi):**
Ayrı bir muhasebe departmanı yok — muhasebe fatura girme/ödeme işini yapar,
gerçek onay **proje yöneticisinden** geçer (admin da aynı yetkiyle aksiyon
alabilir, gözetim/acil durum için). Durum zinciri: `taslak → yönetici_onayında
→ {onaylandı | odeme_bekliyor ↔ kismen_odendi ↔ ödendi | duzeltme_bekliyor →
yönetici_onayında | reddedildi}`. `bekliyor` yalnızca `invoices.status`'un
DEFAULT'u/geçici bir ara değer — kalıcı olarak hiçbir faturada görünmez.
`odeme_bekliyor`/`kismen_odendi`/`ödendi` üçlüsü arasındaki geçiş tek yönlü
değil — `invoice_payments` satırı eklenip/iptal edilip `fn_invoice_payment_recalc`
(bkz. aşağıdaki "Ödeme girişi") `paid_amount`'a göre ileri geri taşıyabilir
(2026-07-26'da `fn_validate_invoice_status_transition`'a bu üçü arasındaki tüm
geçişler admin/muhasebe için eklendi — daha önce yalnızca `odeme_bekliyor→ödendi`
tek adımı izinliydi, kısmi ödeme her zaman istisna fırlatıyordu, bkz. "Son
değişiklik").
- **Taslak:** muhasebe "Taslak Kaydet" yapınca `invoices`'a `status='taslak'`
  yazılır, `invoice_approvals`'a hiç dokunulmaz — henüz kimseye bildirim gitmez.
- **Onaya Gönder:** `invoice_approvals`'a `step=1, step_label='Yönetici Onayı',
  status='bekliyor'` INSERT edilir — `fn_invoice_approval_submitted` (AFTER
  INSERT, SECURITY DEFINER) bunu yakalayıp `invoices.status='yönetici_onayında'`
  yapar ve proje yöneticisine bildirim atar (`notify_role('proje_yoneticisi', ...)`).
  Frontend **asla** `invoices.status`'u burada elle set etmez.
- **Yönetici onaylar/reddeder/düzeltme ister:** frontend yalnızca
  `invoice_approvals.status`'u günceller (`onaylandı`/`reddedildi`/
  `duzeltme_istendi`, not zorunlu son ikisinde) — `fn_invoice_approval_cascade`
  (AFTER UPDATE, SECURITY DEFINER) bunu `invoices.status`'a cascade eder:
  onayda `requires_payment_tracking=true` ise `odeme_bekliyor`, `false` ise
  doğrudan `onaylandı`; reddet → `reddedildi` (**nihai**, kurtarma yok);
  düzeltme iste → `duzeltme_bekliyor`.
- **Düzeltme sonrası yeniden gönderim:** muhasebe faturayı düzenler, AYNI
  `invoice_approvals` satırını `duzeltme_istendi → bekliyor`'a UPDATE eder
  (yeni satır AÇILMAZ) — cascade bunu tekrar `yönetici_onayında`'ya çeker.
- **Ödeme girişi:** tek satırlık `payment_date`/`payment_note` değil — ayrı bir
  `invoice_payments` tablosu (çoklu kısmi ödeme, para birimi, yöntem, referans no,
  iptal desteği). `odeme_bekliyor`/`kismen_odendi` bir faturada muhasebe/admin
  "Ödeme Ekle" (`OdemeEkleModal.jsx`) ile `invoice_payments`'a satır ekler —
  `fn_invoice_payment_before_insert` (BEFORE INSERT) tutarın `remaining_amount`'ı
  aşmadığını ve faturanın gerçekten ödeme aşamasında olduğunu doğrular,
  `fn_invoice_payment_recalc` (AFTER INSERT/DELETE/UPDATE OF is_cancelled)
  `paid_amount`/`remaining_amount`'ı yeniden hesaplayıp `invoices.status`'u
  `paid_amount`'a göre `odeme_bekliyor`/`kismen_odendi`/`ödendi` arasında taşır
  (bu bir `invoice_approvals` olayı değil, cascade devrede değil). Bir ödeme
  `OdemeIptalModal` ile iptal edilebilir (`is_cancelled=true`, silinmez) — bu da
  aynı recalc'i tetikleyip durumu geri düşürebilir. `remaining_amount` ayrıca
  `trg_sync_invoice_remaining_amount` (AFTER INSERT/UPDATE OF amount, vat_rate,
  paid_amount ON invoices) ile her zaman `total_amount - paid_amount`'a senkron
  tutulur — 2026-07-26'da bulunan bug: bu trigger olmadan `remaining_amount`
  fatura oluşturulduğunda hiç set edilmiyordu (DEFAULT 0), bu yüzden HİÇBİR
  faturaya (kısmi ya da tam) ilk ödeme girilemiyordu, bkz. "Son değişiklik".
- **İptal (admin-only):** `onaylandı` VEYA `odeme_bekliyor` bir faturayı admin
  `reddedildi`'ye çekebilir (`fn_validate_invoice_status_transition`'da ayrı
  ayrı izinli) — `cost_allocations` geri alınır, bağlı talep `onaylandi`'ye
  döner (`sync_purchase_request_from_invoice`/`sync_cost_allocation_from_invoice`).
  `reddedildi` **nihai** bir durum — ne admin ne muhasebe onu geri açabilir
  (eski `resubmit_rejected_invoice`/`delete_rejected_invoice` RPC'leri bu
  yüzden 2026-07-24'te kaldırıldı; "yanlışlıkla reddedilen bir faturayı
  düzeltme" ihtiyacı artık `duzeltme_bekliyor` durumuyla karşılanıyor —
  yönetici reddetmeden önce düzeltme istemeli).
- Tüm bu geçişlerin rol×durum matrisi tek yerde: `fn_validate_invoice_status_transition`
  (trigger, `invoices` BEFORE UPDATE). `invoice_approvals` üzerindeki RLS
  (`invoice_approvals_update`) kaba taneli rol kontrolü yapar (admin/
  proje_yoneticisi/muhasebe) — hangi rolün hangi spesifik geçişi yapabildiği
  bu trigger'da merkezi.

**Faturalar liste teması:** `FaturaListesi.jsx` Satın Alma talep listesiyle
(`TabSatinAlmaTalepListesi.jsx`) aynı görsel dili kullanır — sabit satır/başlık
yüksekliği (`ROW_HEIGHT=64`/`HEADER_HEIGHT=24`), yapışkan (`sticky`) başlık,
`var(--color-*)` token'ları, durum için nokta+kalın-metin rozeti (pill/arkaplan
değil — `StatusDot`, `StatusBadge.jsx`'teki paylaşılan `INVOICE_STATUS`/`TONE`
haritasından türetilir) ve ortak `Pager` bileşeni. Üstte `get_invoices_list`'in
`stats` alanından 4 kart (Onay Bekleyen/Düzeltme Bekleyen/Bu Ay Onaylanan —
olay bazlı, `invoice_approvals.reviewed_at`'tan/Ödeme Bekleyen), altında sekme
çubuğu (Tümü/Taslak/Onay Bekleyen/Düzeltme Bekleyen/Onaylanan/Ödeme Bekleyen/
Ödendi — `Reddedildi` yalnızca Durum dropdown'undan seçilir, kendi sekmesi yok).
"İşlem" kolonu statü+role göre değişir (Düzenle/Gönder, İncele, Ödeme Gir,
İptal Et, Görüntüle) — `FaturaFormModal.jsx` (taslak/düzeltme düzenleme +
"Taslak Kaydet"/"Onaya Gönder", ödeme-takibi switch'i, inline "+ yeni
tedarikçi") ve `FaturaDetayModal.jsx` (breadcrumb + oluşturan bilgisi, 4 üst
kart, Fatura Bilgileri, Bağlı Talebin Kalemleri tablosu — `purchase_request_items`'tan,
faturanın kendi kalem tablosu yok —, Satın Alma Kontrolü kartı, tek adımlı
Onay Süreci, Ödeme Gir modalı) ayrı dosyalarda, tamamı `var(--color-*)`
token'larıyla. Onayla/Düzeltme İste/Reddet UI'ı tek paylaşımlı
`OnayReddetActions.jsx`'te iki `layout` varyantıyla: `compact` (`OnayKuyrugu.jsx`
tablo satırı — butona tıklayınca yalnızca o aksiyon için küçük not alanı açılır)
ve `full` (`FaturaDetayModal.jsx` — referans mockup'a birebir: tek paylaşımlı
"İşlem Notları" kutusu her zaman görünür, üç buton da her zaman görünür,
Düzeltme İste/Reddet not doluymadan disabled). Fatura oluşturan kişinin adı
(`invoice.creator.full_name`) `get_invoices_list`'e eklenen additive join'den
gelir — `profiles_select` RLS'i (`admin OR auth.uid()=id`) client-side bir
sorguyla başka birinin adını okumayı engellediğinden, bildirimlerden deep-link
ile açılan (RPC'siz) yol dışında bu join zorunlu.

**Talep tipleri:** `malzeme` / `hizmet` / `diger` (üçü de tam sınıflandırma/risk
mantığına sahip — `diger` risk durumu `listede_yok`, BOM eşleşmesi aranmaz).
BOM aşım (Malzeme Miktar Kontrol) uyarı kutusu yalnızca `type === 'Malzeme'`de
gösterilir.

### Malzeme listesi (BOM) planlanan miktar değişiklikleri — ÜÇ AYRI mekanizma
`procurement_items.planned_qty` üç farklı, birbirinden bağımsız yoldan değişir:

1. **Otomatik/sessiz:** Bir satın alma talebi bir BOM kalemi için planlanandan
   fazla miktar isteyip onaylanınca `fn_apply_approved_material_excess()`
   `planned_qty`'yi otomatik yükseltir, farkı `procurement_item_adjustments`'a
   yazar — onay adımı gerektirmez, talebin kendi onayı yeterli. Talep
   reddedilir/iptal olursa `fn_rollback_material_excess()` bu delta'yı geri
   alır. `ProjeTabFaturaKesilecekler.jsx`'teki yeşil "+X onaylı" rozeti bu
   mekanizmanın görünür olduğu tek yer. Bu üçünü çağıran
   `trg_recompute_risks_from_purchase_request()` (bir talep `onaylandi`'ye her
   taşındığında tetiklenir) SECURITY DEFINER olmalı — kardeş fonksiyonların
   (`fn_apply_approved_material_excess`/`fn_recompute_auto_risks`) EXECUTE
   yetkisi yalnızca postgres/service_role'de, `authenticated`'da yok; trigger
   SECURITY INVOKER kalırsa gerçek bir admin onayı "permission denied" ile
   tamamen başarısız olur — 2026-07-26'da bulunup düzeltilen bug, bkz. "Son
   değişiklik".
2. **Bilinçli/onaylı:** Proje yöneticisi/admin "Düzenle" butonuyla bir kalemin
   planlanan miktarını doğrudan değiştirmek isteyebilir —
   `create_procurement_item_change_request` RPC'siyle `procurement_item_change_requests`'e
   `bekliyor` bir satır düşer, `planned_qty` henüz değişmez. Yalnızca admin
   `review_procurement_item_change_request` ile onaylayınca gerçekten güncellenir.
   Bir kalem için bekleyen bir talep varken ikinci talep açılamaz (RPC + unique
   index seviyesinde de reddedilir).
3. **Yeni malzeme ekleme:** "+ Yeni Malzeme" butonu `create_procurement_item_add_request`
   RPC'siyle aynı tabloya `procurement_item_id=NULL` + `new_equipment`/`new_unit`/
   `new_category` ile bir satır düşürür; admin onaylayınca `INSERT INTO
   procurement_items` ile kalem gerçekten listeye eklenir.

İkisi/üçü aynı anda tetiklenebilir (bir kalem için hem bekleyen manuel talep
hem otomatik aşım) — bu durumda `review_procurement_item_change_request`
onay anında güncel `planned_qty`'yi talebin `old_planned_qty` anlık
görüntüsüyle karşılaştırır; aradan otomatik aşım (veya başka bir onay)
geçtiyse onayı sessizce ezmek yerine açık hatayla reddeder, admin talebi
reddedip güncel miktarla yeniden değerlendirmek zorunda kalır.

`procurement_items`'ta `status`/`priority`/`order_date`/`expected_delivery`/
`actual_delivery`/`supplier`/`notes`/`updated_by`/`received_by`/`received_date`
kolonları satın alma talebi akışından ÖNCEKİ bir sipariş-takip tasarımından
kalma — hiçbir güncel RPC/UI artık bunlara yazmıyor (onları güncelleyen tek
RPC olan `update_procurement_status` dead code olarak kaldırıldı), bazılarında
eski/donmuş veri hâlâ duruyor ama kolonlar bilinçli olarak silinmedi. Malzeme
Listesi artık yalnızca `planned_qty` ile takip ediliyor. Bu alanlara dayanan
yeni bir özellik istenirse önce bu notu hatırlat.

### Ticket oluşturma — genel vs proje bazlı
`tickets.project_id` nullable — `NULL` "genel" (projeye bağlı olmayan) ticket
demek. Tek-proje rolleri için `YeniTicketModal.jsx`'te "Genel ticket olarak aç"
checkbox'ı `project_id`'yi NULL'a düşürür. RLS (`tickets_insert`):
`created_by = auth.uid() AND has_project_access(project_id)` (`has_project_access(NULL)`
her zaman true, genel ticket'lar etkilenmez).

### Roller (4, `roles` tablosunda tanımlı — `select key, display_name, is_manager, cross_project, allowed_tabs, default_tab, sidebar_items from roles`)
admin, muhasebe, proje_yoneticisi, santiye_sefi.

`profiles.role_key`'in `roles(key)`'e FK'si var (`ON UPDATE CASCADE`) — yalnızca
bu 4 rol bir profile atanabilir. (`profiles_role_key_check` CHECK constraint'i
eski, daha geniş bir 19 değerlik listeyi hâlâ metin olarak içeriyor ama FK ondan
daha sıkı, gerçek kısıt FK'dir — eski roller yeniden aktifleştirilirse önce
`roles` tablosuna satır eklenmesi gerekir.)

`is_manager=true`: admin, muhasebe (tüm yönetici bildirimlerini alır,
`has_project_access` her projeye izin verir). `cross_project=true`:
proje_yoneticisi (tüm projelere erişir, `get_project_scope`/`has_project_access`
üzerinden). proje_yoneticisi hâlâ bir "ev projesi"ne (`profiles.project_id`)
atanabilir ama bu yalnızca kozmetik/varsayılan; `genel`/`satin-alma` üst-seviye
sekmelerinde `ScopeContext`'in otomatik çözemediği çoklu-proje durumunda
`index.jsx`'teki yerel `pySelectedProjectId` state'i + `ProjeSecimGerekli`
ekranı devreye girer. `ProjeDetay.jsx`'in iç sekmelerinde proje_yoneticisi
Finans'ta Faturalar/Onay Kuyruğu'nu görüp fatura onaylayabilir (bkz. "Satın
alma akışı" → Fatura onay akışı — 2026-07-24'te Genel-özet-yalnızca'dan
buraya genişledi, Maliyet Tablosu hâlâ admin-only), Tickets santiye_sefi ile
aynı tam yetkide. Kullanıcı
oluşturma ve proje şablonuyla proje ekleme (`isAdmin || role==='proje_yoneticisi'`)
açık; Düzenle/Şifre/Sil ve Düzenle/Excel export/Sil hâlâ `isAdmin`-only.

Rol → sekme/sidebar erişimi `roles.allowed_tabs`/`default_tab`/`sidebar_items`
kolonlarından okunur (bkz. Frontend yapısı) — `src/config/navigation.js` diye
bir dosya artık yok.

### RPC katmanı (canlı)

**Okuma:** `get_dashboard_summary`, `get_project_gantt`, `get_daily_report_detail`,
`get_daily_reports_list`, `get_proje_detay`, `get_santiye_dashboard`,
`get_project_by_date(p_project_id, p_date)` — Genel Proje sekmesinin tek veri
kaynağı; `risks`/`category_weights.avg_progress`/`overall_pct` tarih-farkında
(`progress_daily`'i `p_date`'e kadar toplar), `risks` hem manuel hem otomatik
açık riskleri döner (kategori filtresi frontend'de). `get_satin_alma_overview(_all)`
— `pending_changes` alanı (bekleyen BOM miktar değişikliği talepleri).
`get_finans_overview(_all)`, `get_delayed_tasks_scoped`, `get_my_role`,
`get_my_projects`. Liste/detay RPC'leri: `get_purchase_requests_list` (dual
mode — `p_project_id` NULL ise menü/tüm-projeler), `get_purchase_request_detail`,
`get_invoices_list` (`stats` alanında liste sayfasının 4 stat kartı — Onay
Bekleyen/Düzeltme Bekleyen/Bu Ay Onaylanan (olay bazlı, `invoice_approvals`
üzerinden)/Ödeme Bekleyen —, `invoices` alanında `projects(name)`/
`purchase_requests(title)` join'leri), `get_invoice_approval_queue`
(`yonetici_kuyrugu` — gate rolü artık `proje_yoneticisi`/admin, eskiden
muhasebe/admin'di). Muhasebe izolasyonu için bu
sonuncuların `_internal` varyantları var (`get_finans_overview_internal`,
`get_finans_overview_all_internal`, `get_purchase_request_detail_internal`,
`get_purchase_requests_list_internal`, `get_satin_alma_overview_all_internal`)
— dış RPC'ler rol kontrolü yapıp muhasebeye yalnızca `satin_alindi`/
`fatura_bekliyor` kapsamını döner, genel finans özetinde `authorized:false`.

**Yazma:** `create_purchase_request_with_items` (tek kalem zorunlu,
`p_requested_by`/`has_project_access` içeride doğrulanır), `save_daily_report`
(`p_issues` id-bazlı upsert — ticket bağlantısı için kritik, bkz. Trigger
zincirleri), `create_procurement_item_change_request`,
`review_procurement_item_change_request`, `create_procurement_item_add_request`,
`save_project_category_weights` (proje sihirbazındaki kategori ağırlıkları,
tüm dağılımı tek transaction'da değiştirir), `set_project_procurement_completed`
(proje sihirbazının tedarik/teslimat Faz 1 onayı, yalnızca proje_yoneticisi).

**Yetki/kapsam çekirdeği:** `get_project_scope(p_project_id)` — tüm dual-scope
RPC'lerin ortak yetki katmanı (`is_manager OR cross_project OR
user_has_project_access OR profiles.project_id`); `anon`/`authenticated`'a
EXECUTE kapalı, yalnızca başka SECURITY DEFINER fonksiyonlardan çağrılır.
`has_project_access(p_project_id)` — kanonik proje-erişim kontrolü.
`user_has_project_access`/`user_can_access_report` — RLS'te kullanılan ince
katmanlar, ikisi de buna delege eder.

**Bildirim:** `notify_managers` (tüm `is_manager=true` rollere — bugün yalnızca
admin+muhasebe), `notify_role` (tek role), `notify_user` (tek kullanıcıya) —
trigger'lardan çağrılır, `notifications` tablosuna yazar (RLS:
`recipient_id = auth.uid()`, kullanıcı kendi bildirimini silebilir).
`notify_managers` "her yönetici görsün" için değil, gerçekten `is_manager=true`
olan rollere göndermek içindir — bir bildirim türünü hangi rollerin
GÖREBİLECEĞİ/aksiyon alabileceği ile `is_manager` bayrağı birebir örtüşmüyorsa
(örn. tickets'ı yöneten `proje_yoneticisi` `is_manager=false`, tickets'a hiç
erişemeyen `muhasebe` `is_manager=true`) `notify_managers` yanlış araçtır —
ilgili roller için ayrı ayrı `notify_role` çağırılmalı (bkz. ticket
oluşturma/BOM değişiklik-ekleme talebi trigger'ları, hangi rolün o entity_type'ı
gerçekten görüp aksiyon alabildiğine göre `admin`/`proje_yoneticisi`'ye
daraltıldı). Yeni bir bildirim tetikleyicisi eklerken önce alıcı rolün
`roles.allowed_tabs`'ında ilgili sekmenin gerçekten var olduğunu doğrula.
`entity_type` değerleri: `purchase_request`, `invoice`, `ticket`,
`daily_report`, `daily_report_reminder`, `procurement_item_change_request`.
`pg_cron` (hafta içi 06:00) → `create_daily_report_reminders()` / rapor
girilince `resolve_daily_report_reminder()`.

Yeni bir RPC yazılırken bu projede fonksiyonlar varsayılan olarak `anon`/`PUBLIC`'e
de execute yetkisi alıyor — hassas yazma/okuma RPC'lerinde `REVOKE ... FROM
PUBLIC, anon` kontrolü unutulmamalı.

### Bildirim sistemi
Header'daki basit özet `NotificationBell.jsx` (kasıtlı sade), tam sayfa
`TabBildirimler.jsx` — filtre çipleri, tarih grupları (Bugün/Dün/Bu Hafta/Daha
Eski), tip ikonları, satın alma/ticket bildirimlerinde yatay onay-süreci
göstergesi (`ApprovalStepsHorizontal.jsx`, `satinAlma.js`'teki
`buildApprovalSteps()`'e dayanır). Yönetici rolleri (`isManager`) fatura
bildirimlerinde ek olarak "Adım X/2: ..." özeti görür. Bir bildirime tıklamak
ilgili kaydı doğrudan açar (ticket/günlük rapor/satın alma talebi/fatura —
her biri için `index.jsx`'te ayrı `open*Id` state zinciri); malzeme değişikliği
bildirimi için tek kayıt modalı yok, ilgili projenin Malzeme Listesi sekmesine
götürür (`goToProjectTab`).

### Muhasebe & Finans modülü
Menü seviyesindeki `TabFinans.jsx` altında (proje-içi `ProjeTabFinans.jsx`'ten
ayrı, tüm-projeler görünümü) muhasebe rolü için 3 alt-sekme: Genel, Faturalar,
Raporlar (admin/proje_yöneticisi Genel/Faturalar/Ödeme Takibi/Onay Kuyruğu +
admin-özel Maliyet Tablosu görür — bkz. "Roller"). **Ödeme Takibi** ve
**Tedarikçiler** muhasebe için `TabFinans.jsx`'te DEĞİL — ayrı, üst-seviye bir
sidebar öğesi olan **`TabOdemeler.jsx`**'te (`activeTab==='odemeler'`,
`roles.allowed_tabs`/`sidebar_items`'da yalnızca muhasebe'de var,
`Sidebar.jsx`'in kendi `items` dizisinde "Finans"tan hemen sonra hardcoded
bir girdi — yeni bir sidebar key'i eklemek `roles` tablosu güncellemesi
YETMİYOR, `Sidebar.jsx`'e ikon/label eklenmesi de gerekiyor). Bu ayrım
2026-07-26'da, muhasebenin günlük işinin ağırlıklı kısmının bu ikisi olması
nedeniyle yapıldı — admin/proje_yöneticisi için kapsam DEĞİŞMEDİ, onlar Ödeme
Takibi'ni hâlâ Finans içinde görüyor (Tedarikçiler hiç onlarda yok).
`MuhasebeFinansGenel.jsx`'teki "Ödeme takibine git" linki bu yüzden
`TabFinans`'ın kendi `tab` state'ini değil, `index.jsx`'ten geçirilen
`onNavigateTop` (=`handleTabChange`) ile üst-seviye `activeTab`'ı değiştirir.
Bu modülün büyük kısmı (Ödeme Takibi, Tedarikçiler, Raporlar, ayrıca muhasebeye
özel `MuhasebeFinansGenel.jsx`) 2026-07-26'da fark edildi — CLAUDE.md'de hiç
dokümante edilmemişti, başka bir oturum/araçla eklenmiş olmalı (bkz. "Bilinen
açık noktalar" → migration tracking boşluğu).

- **Faturalar** (`FaturaListesi.jsx`/`FaturaDetayModal.jsx`/`FaturaFormModal.jsx`)
  — bkz. "Satın alma akışı" → Fatura onay akışı, bu bölüm değişmedi.
- **Ödeme Takibi** (`OdemeTakibi.jsx`, muhasebe için `TabOdemeler.jsx` →
  admin/proje_yöneticisi için `TabFinans.jsx` içinden) — hem faturalı
  (`invoices`/`invoice_payments`, `v_invoice_payment_overview` view'ı üzerinden
  vade/ödeme durumu) hem **faturasız ödeme**
  (`financial_transactions`/`financial_transaction_payments`) kayıtlarını TEK
  tabloda, `source` alanıyla ayırt ederek listeler — kullanıcı kararıyla
  (2026-07-26) ayrı bir "Finansal İşlemler" üst-sekmesi olarak KALMAYACAK
  şekilde buraya taşındı. "Faturasız Ödeme Ekle" butonu
  `FinansalIslemFormModal.jsx`'i açar (basitleştirilmiş: tek "faturasız ödeme"
  kaydı, eski 6 kategorili `masraf/avans/hakediş/vergi-harç/personel/diğer`
  dropdown'u ve sonradan-faturayla-eşleştirme özelliği kaldırıldı — DB kolonu
  `transaction_type` hâlâ var ama sabit `'diger'` yazılıyor); ödeme girişi
  `FinansalIslemOdemeModal.jsx`. `invoices.status`'un `'ödendi'`,
  `financial_transactions.status`'un `'odendi'` yazması (Türkçe karakter farkı)
  bu ekranda tek bir görüntüleme durumuna (`normalizeStatus`) indirgeniyor.
- **Tedarikçiler** (`TedarikciListesi.jsx`/`TedarikciDetayModal.jsx`) — bakiye/
  geçmiş hem `invoices` hem `financial_transactions`'ı kapsar (`iptal` hariç);
  önceden yalnızca faturalar sayılıyordu, aynı tedarikçiye faturasız yapılan
  ödemeler bakiyeye hiç yansımıyordu (2026-07-26'da düzeltildi). Tedarikçiye
  toplu ödeme sihirbazı (`TedarikciOdemeModal.jsx`, açık faturalara dağıtım)
  bilinçli olarak hâlâ yalnızca fatura bazlı — faturasız ödemenin kendi tekil
  ödeme girişi `FinansalIslemOdemeModal.jsx` üzerinden yapılır.
- **Raporlar** (`FinansRaporlari.jsx`) — proje/tedarikçi/dönem bazlı filtrelenebilir
  rapor + Excel/PDF export. **"Hedef Maliyet" karşılaştırması kasıtlı olarak
  YOK**: `budget_lines` RLS'i (`budget_lines_select`) yalnızca `admin`/
  `proje_yoneticisi`'ne izinli, muhasebe için bu sorgu sessizce boş dönüyordu
  (2026-07-26 öncesi haliyle "Hedef Maliyet" sütunu muhasebede hep ₺0
  gösteriyordu — hem bozuk hem muhasebenin izolasyon prensibine aykırıydı).
  Yönetici hedef/gerçekleşen karşılaştırmasını zaten kendi Maliyet Tablosu
  sekmesinden (`get_finans_overview(_all)` → `cost_allocations`, kanonik
  kaynak) görüyor. Bu rapor bunun yerine muhasebenin zaten yetkili olduğu
  faturalı+faturasız toplam/ödenen/kalan karşılaştırmasını gösterir.
- **Genel** (`MuhasebeFinansGenel.jsx`) — muhasebenin kendi günlük özeti (aylık
  nakit çıkışı, borç dağılımı, proje bazlı harcama, kritik ödemeler); admin/
  proje_yöneticisi'nin gördüğü `TabGenel`'den ayrı, kendi ad-hoc hesaplamasını
  kullanır (`get_finans_overview` RPC'sine bağlı değil) — bkz. "Frontend
  yapısı" → Proje Finans sekmesi notu.
- **Fatura oluşturma iki ayrı bileşen, BİLİNÇLİ olarak birleştirilmedi**:
  `FaturaFormModal.jsx` (Faturalar sekmesinden serbest/bağımsız fatura) ve
  `FaturaOlusturModal.jsx` (satın alma talebinden tetiklenen, kendi görsel adım
  sihirbazı — talep bilgisi kartı, "Otomatik Kontroller" listesi, tutar-tolerans
  uyarısı). İlk bakışta kod tekrarı gibi görünüyor ama ikincisi gerçekte daha
  zengin, amaca özel bir UX — 2026-07-26'da birleştirme denendi, ikincisinin
  basit bir forma indirgenmesinin işlevsel kayıp (checks/wizard UX) olacağı
  görülüp geri alındı. İkisi de aynı temel deseni kullanıyor: `invoices` insert
  `status='taslak'` ile, ardından `invoice_approvals`'a `step=1 'Yönetici
  Onayı' 'bekliyor'` insert/upsert.
- **`cost_allocations.transaction_id`** (2026-07-26 eklendi) — faturasız
  ödemelerin de "gerçekleşen maliyet"e yansıması için `invoice_id`'nin yanına
  eklenen ikinci, birbirini dışlayan kaynak kolonu (`cost_allocations_source_xor`
  CHECK — bir satır ya faturadan ya faturasız ödemeden gelir). `invoice_id`
  artık NOT NULL değil. `fn_sync_cost_allocation_from_financial_transaction()`
  (`sync_cost_allocation_from_invoice`'un birebir eşi, SECURITY DEFINER —
  aynı RLS-bypass ihtiyacı, `cost_allocations` admin-only) `financial_transactions.status`
  `taslak`/`iptal` dışındaysa ve `project_id` doluysa upsert eder, `category`
  hep `'diger'` (kanonik 3'lü Malzeme/Hizmet/Diğer seti bozulmuyor). Bu tek
  trigger sayesinde `get_finans_overview(_all)`/Maliyet Tablosu faturasız
  ödemeleri de otomatik kapsıyor, ayrı bir RPC değişikliği gerekmedi.
  **Bulunan yan bug:** `fn_sync_cost_allocation_project_id()` (invoice_id'den
  project_id'yi senkronlayan önceden var olan trigger) `invoice_id` NULL
  olduğunda `SELECT ... INTO`'nun satır bulamayıp hedefi NULL yapması yüzünden
  faturasız ödemenin doğru yazdığı `project_id`'yi sessizce eziyordu — `IF
  NEW.invoice_id IS NOT NULL THEN` guard'ı eklenerek düzeltildi.

### Trigger zincirleri (frontend bunları yeniden hesaplamamalı)
- `daily_reports` → `progress_daily` yazımı → `trg_sync_task_progress_from_daily`
  → `project_tasks.progress_pct` günceller → `trg_sync_project_progress`
  (`fn_sync_project_progress()`) → `projects.progress`'e yansır. Kategori
  ağırlığı varsa (`project_category_weights`) ağırlıklı ortalama, yoksa
  süre-ağırlıklı fallback.
- `invoice_approvals` INSERT (ilk gönderim, `step=1, step_label='Yönetici
  Onayı', status='bekliyor'`) → `fn_invoice_approval_submitted()` (SECURITY
  DEFINER) `invoices.status='yönetici_onayında'` yapar + proje yöneticisine
  bildirim atar. `invoice_approvals` UPDATE (yönetici onaylar/reddeder/düzeltme
  ister, ya da muhasebe düzeltme sonrası aynı satırı `bekliyor`'a döndürür) →
  `fn_invoice_approval_cascade()` (SECURITY DEFINER) `invoices.status`'u
  cascade eder (bkz. "Satın alma akışı" → Fatura onay akışı). Her ikisi de
  SECURITY DEFINER — invoker proje_yoneticisi/muhasebe `invoices_update`
  RLS'inde (yalnızca admin/muhasebe) olmadığından, DEFINER olmazsa cascade
  sessizce 0 satır günceller (2026-07-24'te bulunan bug, bkz. Son değişiklik).
  INSERT/UPDATE ayrıca `sync_purchase_request_from_invoice` ile bağlı
  `purchase_requests.status`/`invoice_id`'yi senkronlar (yönetici onayladığı
  an — `onaylandı`/`odeme_bekliyor`/`kismen_odendi`/`ödendi`'nin herhangi
  birine geçtiğinde — talep `faturasi_kesildi`'ye taşınır; 2026-07-26'ya kadar
  yalnızca `onaylandı`/`ödendi` bu geçişi tetikliyordu, ödeme takipli bir
  fatura onaylandığında bağlı talep ödeme tamamen bitene kadar yanlışlıkla
  `fatura_onay_bekliyor` görünmeye devam ediyordu, bkz. "Son değişiklik") ve
  `trg_invoice_cost_allocation` ile `cost_allocations`'ı günceller (actual =
  `onaylandı`/`odeme_bekliyor`/`kismen_odendi`/`ödendi`).
  `financial_transactions` (faturasız ödeme) INSERT/UPDATE OF `status,amount,project_id`
  → `trg_financial_transaction_cost_allocation` aynı `cost_allocations`'ı
  `transaction_id` üzerinden besler (bkz. "Muhasebe & Finans modülü") — iki
  kaynak `cost_allocations_source_xor` CHECK'iyle birbirini dışlar.
  `purchase_requests.invoice_id`'ye her yazma `trg_guard_purchase_request_invoice_id`
  ile gerçek `invoices` durumundan yeniden hesaplanır; `invoices.purchase_request_id`
  üzerinde `WHERE status <> 'reddedildi'` kısmi UNIQUE index'i bir talebin tek
  aktif faturası olmasını garanti eder.
  `invoices_status_check`: `taslak`/`yönetici_onayında`/`duzeltme_bekliyor`/
  `onaylandı`/`odeme_bekliyor`/`kismen_odendi`/`ödendi`/`reddedildi` (8 değer,
  `kismen_odendi` 2026-07-24'te `invoice_payment_tracking_partial_payments`
  migration'ıyla eklendi). `bekliyor` column DEFAULT'u/geçici bir ara değer,
  kalıcı olarak hiçbir faturada görünmez. Tüm rol×geçiş matrisi `fn_validate_invoice_status_transition`'da
  merkezi (bkz. "Satın alma akışı" → Fatura onay akışı) — bir data migration'ın
  bu tabloya durum yazması gerekirse trigger'ı geçici `DISABLE`/`ENABLE
  TRIGGER` ile atlatmak gerekir (rol kontrolü olmayan bir bağlamda, ör.
  migration tooling, hiçbir geçişe izin vermez).
- `purchase_requests` UPDATE → `handle_purchase_request_approval()`.
- `tickets` UPDATE → `fn_ticket_history()` → `ticket_history`'ye otomatik log.
- `daily_report_issues` INSERT (yalnızca `ticket_id` NULL olan yeni satırlarda)
  → `fn_create_ticket_from_daily_report_issue()`: `tickets`'a yeni satır açar
  (`__ISSUE_META__` öneki soyularak temiz `description` yazılır), id
  `NEW.ticket_id`'ye kaydedilir. Sonraki UPDATE'lerde `resolution_status`
  değişirse `fn_sync_ticket_status_from_daily_report_issue()` bağlı ticket'ın
  `status`'unu **tek yönlü** günceller (Tickets sayfasından değiştirmek geri
  etkilemez). `save_daily_report` bu tabloda id-bazlı upsert yapar (delete+reinsert
  DEĞİL) — aksi halde her kayıtta mükerrer ticket açılırdı.
- Yukarıdaki tablolar + `daily_reports`/`purchase_requests`/`invoices`/`tickets`/
  `ticket_comments` INSERT/status değişimi → bildirim trigger'ları.

### "Gerçekleşen maliyet" kanonik tanımı
`invoices.status IN ('onaylandı','odeme_bekliyor','kismen_odendi','ödendi')`
(2026-07-24'te `odeme_bekliyor` eklendi — onaylanmış ama ödeme takipli
faturaların dinlenme durumu, onay anında maliyet gerçekleşmiş sayılır, ödemenin
girilmesini beklemez; `kismen_odendi` kısmi ödeme özelliğiyle birlikte eklenmiş
ama bu kanonik sete 2026-07-26'ya kadar hiç eklenmemişti — bkz. "Son değişiklik"),
tutar = `total_amount` (KDV dahil). "Bekleyen" (henüz taahhüt edilmemiş) tanımı:
`status IN ('yönetici_onayında','duzeltme_bekliyor')` — `taslak` henüz
gönderilmediği için hiçbir kovaya girmez.
`get_dashboard_summary.spent_amount`, `get_finans_overview(_all).totalActual`
ve `sum(cost_allocations.amount)` bu tanımla hizalı olmalı — birinde sapma
görülürse regresyon say.

### İlerleme hesaplama modeli
İlerleme tek kaynaktan, `project_tasks` üzerinden yürüyor: `target_qty`, `unit`,
`total_progress`, `progress_pct`, `dashboard_visible`, `dashboard_order`.
Günlük raporda girilen miktar `progress_daily` (task_id bazlı) satırına yazılır,
trigger zinciriyle `project_tasks`'a ve oradan `projects.progress`'e yansır.
Proje bazlı kategori ağırlıkları `project_category_weights(project_id, category,
weight_pct)` tablosunda — proje sihirbazındaki "Kategori Ağırlıkları" adımı +
`save_project_category_weights` RPC'siyle düzenlenir.

### Kritik yol ve otomatik risk motoru
`project_tasks.is_critical` (boolean) — kritik yol bilgisi görev satırının
kendisinde. `task_category` enum'u 15 değer (10 eski kategori + montaj alt
kırılımı: kolon/kiriş/aşık/panel montajı, köşk trafo).

`project_risks` elle girilebildiği gibi `fn_recompute_auto_risks(p_project_id,
p_close_material_risks default false)` ile de otomatik oluşur/kapanır: (1) plan
bitiş tarihi geçmiş + tamamlanmamış görev → şiddet gecikme gün sayısına göre;
(2) bir BOM kalemi için satın alma talepleri toplamı planlanan miktarı aşarsa.
Tetikleyiciler `project_tasks`/`purchase_requests`/`purchase_request_items`/
`daily_reports` üzerinde. **Kapanma koşulları kasıtlı olarak asimetrik:**
`gorev_gecikmesi` görevin `progress_pct >= 100` olmasıyla (veya durumu
`tamamlandi`/`iptal` olunca) kapanır — yalnızca plan bitiş tarihinin ileri
alınıp "gecikmiş görünmekten çıkması" yetmez, risk açık kalmaya devam eder.
`malzeme_fazla_talep` ise miktar tekrar plan sınırına düşse bile OTOMATİK
kapanmaz — yalnızca `p_close_material_risks=true` geçildiğinde kapanır, bu da
yalnızca iki "yönetici onayı" anında olur: satın alma talebi `onaylandi`ya
geçtiğinde (`trg_recompute_risks_from_purchase_request`) veya
`review_procurement_item_change_request` ile bir BOM miktar artışı
onaylandığında. Bir talebin reddedilmesi/iptali gibi diğer olaylarda risk
yalnızca yeniden değerlendirilir (gerekirse yeni bir aşım için AÇILIR) ama
mevcut açık risk kapanmaz — kapanma kararı yöneticinin onayına bağlı,
matematiğin kendiliğinden düzelmesine değil. `project_risks.closed_at`
(timestamptz) kapanma anını tutar; `fn_set_risk_closed_at()` BEFORE INSERT/UPDATE
trigger'ı bunu hem otomatik hem manuel (sihirbaz üzerinden durum değiştirme)
kapanışlarda tek noktadan yönetir — status `kapatıldı`'ya geçince `now()` yazar,
`kapatıldı`'dan çıkınca `null`'a döner (yeniden açılma). `project_risks`
kolonları: `source` (`manuel`/`otomatik`), `rule_code`
(`gorev_gecikmesi`/`malzeme_fazla_talep`/null), `subject_ref`, `category`
(`is_kalemi`/`satin_alma`/`diger`). Risklerin göründüğü iki yer: Genel Proje
sekmesindeki özet kart (yalnızca `source==='otomatik'`, satıra tıklamak
`rule_code`'a göre İş Planı/Satın Alma sekmesine götürür) ve Malzeme Listesi
sekmesinin Riskler alt-sekmesi (hem manuel hem otomatik, tam liste + detay modalı).

Risk girişi yalnızca proje **düzenleme** akışında var, **oluşturmada yok**
(yeni projede henüz görev/satın alma verisi olmadığından anlamsız) —
`YeniProjeWizard.jsx` 5 adım (Riskler yok), `ProjeEditWizard.jsx` 6 adım
(Riskler dahil).

### Modül → tablo haritası (34 tablo + 6 view + `notifications`)
| Modül | Tablolar |
|---|---|
| Proje yönetimi | projects, project_tasks, project_category_weights, project_risks |
| Günlük saha raporlama | daily_reports, daily_tasks, personnel_log_entries, machinery_logs, daily_report_photos, daily_report_issues, daily_report_material_usage (kullanımda değil), daily_report_drafts |
| İmalat ilerlemesi | progress_daily |
| Satın alma | purchase_requests, purchase_request_items, purchase_request_status_log |
| Fatura ve maliyet | invoices, invoice_approvals, suppliers, budget_lines, cost_allocations |
| Kullanıcı yönetimi | roles, profiles, user_project_access, user_management_audit |
| Bildirim | notifications |
| Destek / diğer | tickets, ticket_comments, ticket_history, ticket_attachments, agent_reports, procurement_items, procurement_item_adjustments, procurement_item_change_requests |

View'lar (hepsi `security_invoker=on`): `project_cost_summary`, `personnel_logs`,
`vw_delayed_tasks`, `vw_monthly_progress`, `vw_project_progress_summary`,
`vw_weekly_progress`.

**Kalite kontrol modülü denendi ve kullanıcı kararıyla tamamen kaldırıldı** —
ilgili tablolar/RPC'ler/trigger'lar DB'den silindi. Yeniden eklenmesi teklif
edilirse önce bu kararı hatırlat.

### Excel şablonu / proje sihirbazı
Statik indirilebilir şablon `fons-solar-proje-sablonu.xlsx` (`public/excel/`),
hiçbir kod tarafından üretilmiyor — kullanıcı indirip doldurup Proje
Yönetimi'nden tekrar yüklüyor. 7 sayfa: Proje Bilgileri, İş Kalemleri, Kategori
Ağırlıkları (salt okunur/referans), Riskler (yalnızca mevcut proje güncellemesinde
okunur, yeni projede parse edilmez), Bütçe, Malzeme Listesi, Kullanım Kılavuzu.

`import-project-excel`/`export-project-excel` edge fonksiyonları (Deno, bu
repoda değil, Supabase'de deploy edili) bu 7 sayfayı parse eder/üretir;
frontend yalnızca `src/utils/projectExcelBridge.js` üzerinden ince bir köprü.
Kategori eşleme sabit bir liste değil, Türkçe etiketi `snake_case`'e çevirir;
risk kategorisi ise sabit 3 değerlik bir sözlük.

Proje oluşturma/düzenleme sihirbazı (`YeniProjeWizard.jsx`/`ProjeEditWizard.jsx`):
İş Kalemleri → Kategori Ağırlıkları → Riskler (yalnızca düzenlemede) → Tedarik
(yalnızca proje_yoneticisi "Tamamladım" onayı, Faz 1 — tedarikçi/teslimat
detay takibi Faz 2'ye ertelendi) → Bütçe → Tamamlandı. "Yeni Proje" butonu
birincil akış olarak Excel şablonu yükler; küçük bir "Manuel doldur" bağlantısı
sihirbazı da açar (bu ikincil yoldaki mini-importer hâlâ eski kategori setiyle
sınırlı).

### Test ortamı
5 profil, 2 proje: "Ege Enerji İzmir GES – TEST" ve "Kayseri Develi GES".
Canlı müşteri verisi yok. `tests/*.spec.js` + `playwright.config.js` — kalıcı
Playwright regresyon suite'i (`npm run test:e2e`), kimlik bilgileri `.env.test`'te
(gitignore'da). **Credential değerleri (şifre/token) hiçbir zaman chat metnine
yazılmaz.** Admin test hesabının `profiles.id`'si değişebilir — `select id from
profiles where role_key='admin'` ile doğrula.

---

## Tamamlanan büyük görevler (özet)

Kronolojik detay tutulmuyor — yalnızca sistemin bugünkü haline giden büyük
kilometre taşları, teknik ayrıntı için ilgili "Sistem mimarisi" alt bölümüne bak.

- Supabase RPC migrasyonu: ham `.from()` sorgularının büyük kısmı `get_*`/
  `save_*`/`create_*` RPC desenine taşındı; kalan liste "Frontend yapısı"nda.
  Genel/rol-kilitli sayfalar (Finans, Satın Alma) ile proje-özel `ProjeTab*`
  arasındaki gerçek kod tekrarı büyük ölçüde tek bileşende birleştirildi
  (opsiyonel `projectId` prop deseni).
  Yerel testte doğrulanan sahte çiftler birleştirilmedi (bkz. Frontend yapısı).
- Canlı veri altyapısı: `get_project_scope` üzerinden yetkilendirme, `ScopeContext`
  + `useDashboardData`, P0 tablolara Realtime (`useRealtimeRefresh`), kalıcı
  Playwright regresyon suite'i.
  RLS sertleştirme turları: initplan sarmalama, çakışan permissive policy
  birleştirme, birkaç no-op `WITH CHECK`/eksik `has_project_access` açığı
  (satın alma, ticket, projects tablolarında) kapatıldı.
- Günlük rapor sistemi: form panel-navigasyonuna geçirildi, taslak otomatik
  kaydetme, hava kaybı takibi, id-bazlı `p_issues` upsert + otomatik ticket
  bağlantısı, PDF (Roboto Unicode font, dinamik makine adları).
- İlerleme hesaplama modeli tekilleştirildi: eski `progress_items` tablosu
  kaldırıldı, tek kaynak `project_tasks`/`progress_daily`; proje geneli
  ilerleme kategori-ağırlıklı hale geldi.
- Proje şablonu v6 + otomatik risk motoru: `is_critical` kolonu + genişletilmiş
  kategori seti, ayrı kritik-yol/checklist tabloları kaldırıldı, `project_risks`
  otomatik kural motoruna geçti.
- Satın alma/finans iş akışı: proje yöneticisi tedarik adımı, tek kalem kuralı,
  fatura tekilliği/iptal-yeniden gönderme akışı, BOM planlanan miktar
  değişikliği (3 mekanizma), muhasebe veri-katmanı izolasyonu, "Diğer" talep
  tipi — hepsi gerçek RPC/write ile uçtan uca Playwright doğrulamalı.
  Kalite kontrol modülü denenip kullanıcı kararıyla tamamen geri alındı.
- Bildirim sistemi: tekilleştirme, canlı durum rozetleri, yatay onay-süreci
  göstergesi, tıklayınca ilgili kaydı doğrudan açma, günlük rapor hatırlatma
  cron job'ı.
- Rol/izin sistemi: 19 role genişletilip sonra kullanıcı kararıyla 4 aktif role
  (admin/muhasebe/proje_yoneticisi/santiye_sefi) indirildi; sekme/sidebar
  erişimi hardcoded dosyadan `roles` tablosuna taşındı (bkz. Roller bölümü).
- Ticket sistemi: durum/workflow aşamaları standartlaştırıldı, proje
  yöneticisine işleme/kapatma/iptal yetkisi, sahibinin açık ticket'ını
  silebilmesi, günlük rapor/kalite bulgusu → otomatik ticket tetikleyicileri.
- Kullanıcı/proje yönetimi: kategori ağırlıkları arayüzü, tedarik/teslimat
  Faz 1 onayı, kullanıcı yönetimi audit tablosu, `create-user`/
  `import-project-excel` edge fonksiyonlarına rol kontrolü.
- Repo hijyeni: ölü bileşenler (`TicketStats.jsx`, eski `ProjectDashboard`,
  `RealtimeStatusIndicator`), kullanılmayan CSS, orphan DB nesneleri
  (`work_packages`, `schedule_activities`, `vw_bom_tracking`, kalite kontrol
  kalıntıları) düzenli olarak temizlendi. Bundle optimizasyonu (route bazlı
  `React.lazy`, font asset'i statik dosyaya taşındı).

## Bilinen açık noktalar / ertelenmiş kararlar

- ~~`FaturaOlusturModal.jsx` kullanılamıyordu~~ **düzeltildi (2026-07-27) —**
  bkz. "Son değişiklik". `complete_project_manager_purchase_request` RPC'si
  (proje yöneticisinin "Tamamlandı" butonu, tedarik adımı) `supplier_id`'ye hiç
  dokunmuyor (yalnızca `purchase_date`/`purchased_by` yazıyor — eski,
  kaldırılmış `TedarikKuyrugu.jsx`'in muhtemelen ayrı bir form alanıyla topladığı
  bu bilgi, yerine gelen tek-tık akışta hiç toplanmıyor), bu yüzden onaylanıp
  tedarik edilen HER talepte `purchase_requests.supplier_id` null kalıyor.
  `FaturaOlusturModal.jsx`'in `canSave`'i `form.supplier_id` gerektirdiğinden
  ama formda tedarikçi seçecek alan olmadığından "Taslak Kaydet"/"Devam Et"
  kalıcı disabled kalıyordu — `FaturaFormModal.jsx`'teki tedarikçi seçici +
  "+ yeni tedarikçi" deseni buraya da eklendi (tedarik adımına dokunulmadı,
  kullanıcı kararıyla wizard tarafı tercih edildi). Gerçek tarayıcıda
  doğrulandı: tedarikçi seçilince buton aktifleşiyor, fatura `taslak` olarak
  kaydediliyor, console hatası yok.
- **`FaturaListesi.jsx`'teki üst-sağ buton etiketi ile davranışı uyuşmuyor
  olabilir:** buton "▤ Faturalanacak Talepler" yazıyor ama `onClick`'i
  `setEditingInvoice(null); setShowForm(true)` — yani gerçekte Satın Alma'daki
  "Faturalanacak Talepler" kuyruğuna gitmiyor, doğrudan boş "Yeni Fatura"
  formunu açıyor. Bu görev kapsamında yalnızca fark edildi (test bu davranışı
  kullanarak `FaturaFormModal`'ı başarıyla açtı), düzeltilmedi/onaylanmadı —
  kasıtlı bir "hızlı ekle" kısayolu mu yoksa yanlış etiket mi belirsiz.
- **`tests/procurement-workflow.spec.js` ve birkaç `procurement-*`/`accounting-scope`
  testi eski akışa göre yazılmış, güncellenmedi.** 2026-07-26'da satın
  alma→fatura akışı uçtan uca test edilirken fark edildi: bu spec'ler kaldırılmış
  RPC'leri (`resubmit_rejected_invoice`/`delete_rejected_invoice`), eski
  `invoices.status='bekliyor'` insert'ini (artık `invoices_status_check`'te yok,
  akış `taslak`'tan başlıyor) ve proje yöneticisinin Finans'ta Faturalar/Onay
  Kuyruğu'nu görmediği eski dar erişimi varsayıyor — hepsi 2026-07-24'teki
  tek-onaylayıcı geçişi ve erişim genişletmesiyle geçersiz kaldı. Bu görev
  kapsamında düzeltilmedi (ayrı bir "test suite'i güncel akışa taşı" görevi
  gerektirir), yalnızca fark edilip not düşüldü — bu spec'lerin başarısızlığını
  yeni bir regresyon sanma.
- **Tedarik/teslimat Faz 2 — henüz yapılmadı.** Proje sihirbazındaki tedarik
  adımı bilinçli olarak Faz 1'e (yalnız proje_yoneticisi "Tamamladım" onayı)
  sadeleştirildi. Tedarikçi, sipariş/teslimat tarihi, eksik/hasarlı teslimat
  takibi gibi detaylar Faz 2 kapsamına ertelendi.
- **DB-SEC-006 (leaked password protection):** Supabase Free plan'da
  desteklenmiyor, Pro plan gerektiriyor — teknik değil, ödeme kararı bekliyor.
- **Realtime ölçek notu:** Mevcut 2 test projesi ölçeğinde sorun yok;
  Supabase'in önerdiği Broadcast-from-database'e geçiş ileride gündeme
  gelebilir.
- Manuel proje sihirbazı yolundaki client-side mini-importer
  (`src/utils/projectExcelImport.js`) hâlâ eski, daha dar bir kategori setiyle
  sınırlı — ikincil yol olduğu için düşük öncelikli.
- **`project_risks` tablosunda DELETE policy'si yok** (admin dahil hiçbir rol
  için) — Riskler sihirbaz adımının (`Adim4Riskler.jsx`) mevcut riskleri
  silip yeniden eklemesi gereken durumlarda bu adım sessizce 0 satır siler.
  Henüz kimse fark etmedi/rapor etmedi; fark edilirse önce bu notu hatırlat.
- **Migration `20260724072957_invoice_flow_single_approver_with_revision_and_payment_tracking`
  yerel dosyası eksik.** Bu görev sırasında canlıda uygulanmış ama
  `supabase/migrations/` altında karşılığı olmadığı fark edildi (muhasebe
  ayrı bir oturum/araçla doğrudan uygulamış olmalı) — `taslak`/
  `duzeltme_bekliyor`/`odeme_bekliyor` durumları, `requires_payment_tracking`/
  `payment_date`/`payment_note` kolonları ve `fn_invoice_approval_submitted`/
  `fn_invoice_approval_cascade`'in ilk sürümü bu migration'la geldi. Üstüne
  düzeltme migration'ı (`20260724081031`) eklendi ama orijinali hâlâ yerel
  dosya olarak yok — fark edilirse (`schema_migrations` ile `supabase/migrations/`
  karşılaştırması) geriye dönük eklenmesi gerekebilir.
- **Faturalar mobil kart görünümü yok.** Brief mobilde tablo yerine kart
  listesi istiyordu; zaman kısıtı nedeniyle yalnızca `overflow-x:auto` ile
  yatay scroll fallback'i bırakıldı (diğer bazı tablolarla aynı, ama brief'in
  istediği tam kart deneyimi değil).
- **Migration tracking boşluğu — 20260724150000 ile 20260724170000 arası daha
  geniş bir aralıkta tekrarlandı.** 2026-07-26'da fark edildi: `financial_transactions`/
  `financial_transaction_payments` şeması, `v_invoice_payment_overview`
  security_invoker düzeltmesi, `role_allowed_tabs`/`role_sidebar_items`
  normalizasyonu, `harden_database_security_and_indexes` gibi birden fazla
  migration canlıda uygulanmış (tablolar/fonksiyonlar gerçekten var) ama
  `supabase_migrations.schema_migrations`'ta versiyonları YOK — muhtemelen
  migration tooling atlanıp doğrudan SQL editöründen uygulanmış (yerel dosya
  adlarındaki zaman damgaları da gerçek uygulanan versiyonlarla eşleşmiyor,
  ör. yerel `20260724170000_harden_database_security_and_indexes.sql` iken
  canlıda aynı isim `20260724133320` altında kayıtlı). Bu görev bunu düzeltmedi
  (kapsamı büyük, ayrı bir "migration tracking reconciliation" görevi
  gerektirir) — yalnızca üstüne yeni, düzgün-tracked migration'lar eklendi
  (`20260726162840`, `20260726163329`). Yerel dosyalar canlı state'i doğru
  yansıtıyor, sadece `schema_migrations` geçmişiyle 1:1 eşleşmiyor.

## Son değişiklik

**27.07.2026 (devam 2) — "Fatura Oluştur" wizard'ına tedarikçi seçici eklendi,
bug tamamen düzeltildi.**

Bir önceki UI test turunda bulunan bug (`FaturaOlusturModal.jsx`'in kalıcı
disabled kalması, çünkü tedarik adımı hiçbir zaman `purchase_requests.
supplier_id`'yi set etmiyor ve wizard'da onu seçecek bir alan yoktu)
kullanıcıya soruldu — "wizard'a tedarikçi seçici ekle" tercih edildi (tedarik
adımına geri dönüş yerine). `FaturaOlusturModal.jsx`'in "Fatura Bilgileri"
kartına, `FaturaFormModal.jsx`'teki ile birebir aynı desende (dropdown +
"+ Yeni tedarikçi" inline mini-form) bir Tedarikçi alanı eklendi — "Bağlı Satın
Alma Talebi" kartındaki salt-okunur Tedarikçi önizlemesi buna bağlı olarak
otomatik güncelleniyor (`selectedSupplier` zaten `form.supplier_id`'den
türüyordu, dokunulmadı). Gerçek tarayıcıda (muhasebe hesabıyla, gerçek bir
onaylanmış+tedarik edilmiş talep üzerinden) doğrulandı: tedarikçi seçilmeden
"Taslak Kaydet" disabled, seçilince aktif, fatura `taslak` durumunda doğru
`supplier_id` ile kaydediliyor, console hatası yok. Lint clean. Test verisi
temizlendi (bu arada yine `procurement_item_adjustments` FK'si yüzünden 2 test
talebi silinemedi, aynı düzeltme uygulanıp `AC Kablo 3x185mm2` BOM kalemi
tekrar 11100'e geri alındı).

**27.07.2026 (devam) — Aynı akış gerçek tarayıcıda (Playwright, 4 rolle) tekrar
test edildi; 4 backend düzeltmesi UI üzerinden doğrulandı + 2 yeni bulgu.**

Önceki 4 backend düzeltmesi (kismen_odendi, satın alma onay yetkisi,
remaining_amount, purchase_request senkronu) commit edildikten sonra kullanıcı
"tüm flowları dene" dedi — bu kez gerçek tarayıcıda, 4 farklı rolle
(admin/proje_yöneticisi/muhasebe/santiye_şefi), UI tıklamalarıyla. Sonuç: 6/6
adım (talep onayı, tedarik tamamlama, bağımsız fatura oluşturma, Onay
Kuyruğu'ndan onaylama, kısmi+tam ödeme girişi) console hatası olmadan geçti —
4 backend fix'i gerçek kullanıcı aksiyonlarıyla da doğrulandı (ör. onay
sonrası `remaining_amount=600` doğru başlıyor, kısmi ödeme `kismen_odendi`'ye
sorunsuz geçiyor).

Ayrıca 2 yeni bulgu ortaya çıktı (bkz. "Bilinen açık noktalar", ikisi de
düzeltilmedi — kullanıcı onayı bekliyor):
1. **`FaturaOlusturModal.jsx` ("Fatura Oluştur" wizard'ı) kullanılamıyor** —
   tedarik adımı (`complete_project_manager_purchase_request`) `supplier_id`'yi
   hiç set etmiyor, wizard'da tedarikçi seçecek alan da yok, "Taslak
   Kaydet"/"Devam Et" kalıcı disabled. Canlıda "Faturalanacak Talepler"
   kuyruğundaki 8/8 satır Tedarikçi kolonunda "—" gösteriyor.
2. `FaturaListesi.jsx`'teki "▤ Faturalanacak Talepler" butonu aslında "Yeni
   Fatura" formunu açıyor (etiket/davranış uyuşmazlığı, düşük öncelik).

Test verisi (UITEST_*/E2E_* öneklerinde) temizlendi — bu arada önceki oturumun
E2E script'lerinden kalan 32 test satın alma talebinin `procurement_item_
adjustments` FK'si yüzünden silinemediği fark edildi (kendi kendine yol açtığım
bir temizlik bug'ı: cleanup fonksiyonu delete hatalarını kontrol etmiyordu),
`AC Kablo 3x185mm2` BOM kaleminin `planned_qty`'si gerçek/legacy aşım kaydı
(delta 92) korunarak orijinal değerine (11100) geri alındı.

**27.07.2026 — Satın alma→fatura akışı uçtan uca test edildi; ödeme takibi
sisteminde biri komple bloke eden 4 gerçek bug bulunup düzeltildi.**

Kullanıcı "satın almadan faturaya kadar sistemi test et" dedi. Statik analizle
(trigger/fonksiyon tanımları okunarak) ve ardından gerçek RLS-uyumlu test
kullanıcılarıyla canlı bir uçtan uca script (satın alma→onay→tedarik→fatura→
onay→ödeme, 5 senaryo: tam ödeme, kısmi ödeme, ödeme iptali, ret/düzeltme,
ödeme takipsiz yol) çalıştırılarak 4 ayrı, gerçek, canlıda hâlâ etkili bug
bulundu — hepsi onaylı migration'larla düzeltildi (`20260726220354`,
`20260726221002`, `20260726221400`, `20260726221529`):

1. **Kısmi ödeme (`kismen_odendi`) hiç çalışmıyordu.** Bu durum
   `invoices_status_check`'e `invoice_payment_tracking_partial_payments`
   migration'ıyla (2026-07-24) eklenmiş ama 5 tüketiciden hiçbiri
   güncellenmemişti: `fn_validate_invoice_status_transition` bu durumla ilgili
   hiçbir geçişe izin vermiyordu (ilk kısmi ödeme her zaman istisna fırlatıp
   geri alınıyordu), `sync_cost_allocation_from_invoice` kısmen ödenmiş bir
   faturanın `cost_allocations` kaydını silecekti, `get_finans_overview(_all)_internal`
   ve `get_dashboard_summary` "gerçekleşen" toplamlarında bu durumu hiç
   saymıyordu. Beşi de aynı 3 değerlik sete `kismen_odendi` eklenerek düzeltildi.
2. **Satın alma talebi onaylanamıyordu (daha kritik, akışın en başında).**
   `trg_recompute_risks_from_purchase_request()` (bir talep `onaylandi`'ye her
   taşındığında tetiklenir, gerçek "Onayla" butonunun kullandığı yol) SECURITY
   INVOKER'dı ama `fn_apply_approved_material_excess()`/`fn_recompute_auto_risks()`'i
   çağırıyordu — bu ikisinin EXECUTE yetkisi yalnızca postgres/service_role'de,
   `authenticated`'da yoktu. Sonuç: gerçek bir admin/proje_yöneticisi talebi
   onaylamaya çalıştığında "permission denied for function
   fn_apply_approved_material_excess" ile başarısız oluyordu — kardeş
   fonksiyonların (`_from_purchase_item`/`_from_daily_report`/`_from_task`)
   hepsi zaten SECURITY DEFINER, yalnızca bu biri unutulmuştu. SECURITY
   DEFINER yapılarak düzeltildi.
3. **Hiçbir faturaya (kısmi ya da tam) ilk ödeme girilemiyordu.**
   `invoices.remaining_amount` sıradan bir kolon (DEFAULT 0) — fatura
   oluşturulduğunda/onaylandığında hiç set edilmiyordu, yalnızca
   `fn_invoice_payment_recalc` (bir ödeme eklenince/iptal edilince) güncelliyordu.
   `fn_invoice_payment_before_insert`'ün "ödeme tutarı kalanı aşamaz" kontrolü
   bu yüzden hep `remaining_amount=0`'a göre çalışıp HER ilk ödemeyi
   reddediyordu. Yeni `trg_sync_invoice_remaining_amount` (AFTER INSERT/UPDATE
   OF amount, vat_rate, paid_amount) `remaining_amount`'ı her zaman
   `total_amount - paid_amount` olarak senkron tutacak şekilde eklendi, mevcut
   satırlar backfill edildi.
4. **Fatura onaylanınca bağlı satın alma talebi hemen `faturasi_kesildi`'ye
   geçmiyordu.** `sync_purchase_request_from_invoice` yalnızca `onaylandı`/`ödendi`
   durumlarında bu geçişi tetikliyordu — ödeme takipli bir fatura onaylanınca
   (`odeme_bekliyor`) fatura gerçekte onaylanmış olmasına rağmen bağlı talep
   ödeme tamamen bitene kadar Satın Alma listesinde yanlışlıkla "Fatura Onayda"
   görünmeye devam ediyordu (kilitleyici değil, kendiliğinden düzeliyordu ama
   yanıltıcıydı). Statü listesine `odeme_bekliyor`/`kismen_odendi` eklenerek
   düzeltildi.

Dördü de canlı DB'de gerçek RLS-uyumlu test kullanıcılarıyla (admin/muhasebe/
proje_yöneticisi/santiye_sefi) yeniden doğrulandı — 5/5 senaryo geçti. Ayrıca
ilgili Playwright suite'i (`purchase-single-item`, `purchase-risk-classification`,
`procurement-security`, `procurement-role-acceptance`, `procurement-two-initiators`,
`procurement-concurrency`, `accounting-scope`) çalıştırıldı: 22 geçti, 6
başarısız oldu — hepsi bugünkü düzeltmelerden ÖNCE de zaten bozuk olan, eski
akışa göre yazılmış stale testler (bkz. "Bilinen açık noktalar"), bugünkü
değişikliklerin yol açtığı yeni bir regresyon değil. `procurement-workflow.spec.js`
hiç çalıştırılmadı (zaten kaldırılmış RPC'lere bağımlı, tamamen stale).
CLAUDE.md'nin "Fatura onay akışı"/"Trigger zincirleri"/"Gerçekleşen maliyet
kanonik tanımı" bölümleri de bu görevde ortaya çıkan gerçek `invoice_payments`
sistemini (daha önce hiç dokümante edilmemiş tek-satır `payment_date`/
`payment_note` varsayımı yanlıştı) yansıtacak şekilde güncellendi. Geçici test
script'i silindi, hiçbir şey commit edilmedi.

**27.07.2026 — Ödemeler, muhasebe için Finans'tan ayrı, üst-seviye bir sidebar
öğesine çıkarıldı.**

Kullanıcı "ödemeler'i menü kısmına koysak, içinde ödemeler ve tedarikçi
listesi olsa" dedi. Netleştirilen kapsam: yalnızca muhasebe (admin/proje
yöneticisi Ödeme Takibi'ni hâlâ Finans içinde görüyor, kapsamları değişmedi).
Yeni `TabOdemeler.jsx` (Ödeme Takibi + Tedarikçiler alt-sekmeleri, kendi proje
filtresi) eklendi; `Sidebar.jsx`'e "Ödemeler" ikonu/label'ı ile yeni bir
hardcoded `items` girdisi eklendi (roller tablosu güncellemesi tek başına
yetmiyor — sidebar key'leri kod tarafında da tanımlı); onaylı migration'la
`role_allowed_tabs`/`role_sidebar_items`'a yalnızca `muhasebe` için `odemeler`
satırı eklendi. `TabFinans.jsx`'ten muhasebenin Ödeme Takibi/Tedarikçiler
sekmeleri kaldırıldı (3 sekmeye indi: Genel/Faturalar/Raporlar);
`MuhasebeFinansGenel.jsx`'in "Ödeme takibine git" linki artık `TabFinans`'a
yeni eklenen `onNavigateTop` prop'u (index.jsx'ten `handleTabChange`) ile
üst-seviye sekmeye geçiyor. Playwright ile bulunup düzeltilen bir bug: yeni
`activeTab==='odemeler'` değerinin `index.jsx`'teki header-title `TABS`
haritasında karşılığı yoktu, `TABS[activeTab].title` `undefined.title`
okuyup tüm Dashboard'u çökertiyordu — eklendi. Muhasebe + admin hesaplarıyla
uçtan uca doğrulandı, console hatası yok.

**26.07.2026 — Muhasebe & Finans kullanıcısı tek, tutarlı deneyime indirildi:
"Finansal İşlemler" ayrı sekmesi kaldırıldı, faturasız ödeme kavramı
sadeleştirilip Ödeme Takibi'ne taşındı, gerçekten maliyete yansıması
sağlandı.**

Kullanıcı "kullanıcıları ve sayfalarını incele, sadeleştirmemiz gereken
yerler neler" diye sordu. İnceleme sırasında `TabFinans.jsx`'in commit
edilmemiş 4 yeni alt-sekme (Finansal İşlemler, Ödeme Takibi, Tedarikçiler,
Raporlar — hiçbiri CLAUDE.md'de yoktu) içerdiği ortaya çıktı; kod okuma +
canlı DB sorgulama ile şu somut sorunlar doğrulandı: `financial_transactions`
(faturasız masraf/avans/hakediş/vergi-harç/personel) hiçbir şekilde
"gerçekleşen maliyet"e yansımıyordu (yalnızca `invoices` `cost_allocations`'ı
besliyordu); `FinansRaporlari.jsx`'teki "Hedef Maliyet" sütunu muhasebe için
hep ₺0 dönüyordu (`budget_lines` RLS'i muhasebeyi kapsamıyor — kasıtlı izolasyon,
ama sütun yine de gösteriliyordu); iki paralel ödeme tablosu (`invoice_payments`/
`financial_transaction_payments`); tedarikçi bakiyesi yalnızca faturaları
sayıyordu. Kullanıcının kararı: "faturasız ödemeler kalsın çünkü bunlar da
maliyete yansıyacak, onun dışındakiler (ayrı sekme, kategori seti, fatura
eşleştirme özelliği) gidebilir."

Onaylı migration'larla (`20260726162840`, `20260726163329`) `cost_allocations`'a
`transaction_id` eklendi (`invoice_id` ile birbirini dışlayan CHECK,
`invoice_id` artık NOT NULL değil) ve `sync_cost_allocation_from_invoice`'un
birebir eşi bir trigger faturasız ödemeleri de aynı tabloya yazdı (SECURITY
DEFINER — test sırasında hem bunun hem de önceden var olan, invoice_id NULL'ken
project_id'yi sessizce ezen `fn_sync_cost_allocation_project_id` bug'ının
bulunup düzeltilmesi gerekti, bkz. "Muhasebe & Finans modülü"). Frontend:
`TabFinans.jsx`'ten `islemler` sekmesi kaldırıldı; `OdemeTakibi.jsx` hem
faturalı hem faturasız kayıtları tek tabloda birleştirdi (`source` alanı);
`FinansalIslemFormModal.jsx` 6 kategoriden tek sade "Faturasız Ödeme" kaydına
indirgendi (proje seçimi zorunlu kılındı — maliyete yansıması için şart);
`FinansalIslemler.jsx`/`FinansalIslemFaturaModal.jsx` silindi;
`TedarikciDetayModal.jsx`/`TedarikciListesi.jsx` bakiye/geçmiş hesabına
`financial_transactions`'ı da kattı; `FinansRaporlari.jsx`'ten bozuk "Hedef
Maliyet" kaldırılıp yerine muhasebenin yetkili olduğu faturalı+faturasız
toplam/ödenen/kalan karşılaştırması kondu.

Ayrı bir keşif: `FaturaOlusturModal.jsx`'in de (satın alma → fatura kesme)
başka bir oturumda zaten kendi görsel adım-sihirbazına (Otomatik Kontroller,
tutar-tolerans uyarısı) yeniden yazıldığı görüldü — `FaturaFormModal.jsx` ile
"birleştirme" planı, işlevsel kayıp (çalışan, amaca özel UX'in basit forma
indirgenmesi) olacağı için bilinçli olarak iptal edildi, dokunulmadı. Ayrıca
canlı DB'de `20260724150000`–`20260724170000` aralığında migration tracking
boşluğu tespit edildi (bkz. "Bilinen açık noktalar") — bu görev kapsamında
düzeltilmedi, yalnızca not düşüldü.

**Önceki görev — 24.07.2026 — Faturalar modülü tek-onaylayıcı ("Yönetici" =
proje yöneticisi) akışına geçirildi: taslak, düzeltme döngüsü, isteğe bağlı
ödeme takibi, 3 sayfa baştan yazıldı.**

Kullanıcı ayrıntılı bir brief verdi: şirkette ayrı muhasebe departmanı yok,
muhasebe fatura girme/ödeme işini yapıyor, gerçek onay proje yöneticisinden
geçmeli (klasik "muhasebe onayı → yönetici onayı" iki adımına gerek yok).
Brief "DB tarafı zaten hazır ve canlı" dedi — doğrulandı ama **yarım doğru**
çıktı: şema (7 durumlu `invoices_status_check`, `requires_payment_tracking`/
`payment_date`/`payment_note` kolonları, `fn_invoice_approval_submitted`/
`fn_invoice_approval_cascade` trigger'ları) canlıda gerçekten vardı
(migration `20260724072957` — yerel dosyası eksik, bkz. "Bilinen açık
noktalar") ama bunun gerektirdiği davranış değişiklikleri hiç yapılmamıştı:
- Ölü eski trigger (`invoice_approval_chain_trigger`/`create_invoice_approval_chain`)
  hâlâ her INSERT'te faturayı zorla `yönetici_onayında`'ya itiyordu — `taslak`
  akışını tamamen imkânsız kılıyordu.
- `fn_invoice_approval_submitted`/`fn_invoice_approval_cascade` `SECURITY
  INVOKER` idi — proje yöneticisi onayladığında/reddettiğinde/düzeltme
  istediğinde, cascade'in `invoices` UPDATE'i invoker (proje_yoneticisi)
  olarak `invoices_update` RLS'ine (yalnızca admin/muhasebe) takılıp
  **sessizce 0 satır güncelliyordu** — en ciddi bulgu, hiçbir hata mesajı
  yoktu.
- `fn_validate_invoice_status_transition` hâlâ eski 5-durumlu tasarımın
  izin listesini ve admin-only onaylayıcı rolünü kullanıyordu — yeni
  akışın neredeyse tüm geçişleri reddediliyordu.
- `invoice_approvals_update` RLS yalnızca admin'e izinliydi; `get_invoice_approval_queue`
  yalnızca muhasebe/admin'e kapılıydı — yeni onaylayıcı proje_yoneticisi'ye
  hiçbir şey görünmüyordu.
- "Gerçekleşen maliyet" filtreleri (`get_dashboard_summary`,
  `get_finans_overview(_all)_internal`, `sync_cost_allocation_from_invoice`)
  yeni `odeme_bekliyor` durumunu (onaylanmış-ama-ödeme-bekleyen) hiç
  saymıyordu — bu faturalar hem "gerçekleşen" hem "bekleyen" bütçeden
  kayboluyordu.

Düzeltme migration'ı (`20260724081031_invoice_workflow_single_approver_backend_fix`,
onaylı, tam SQL gösterilip onaylandı) bunların hepsini kapattı + ek olarak
`get_invoices_list`'e `stats` alanı (4 stat kartı için) ve
`projects(name)`/`purchase_requests(title)` join'leri eklendi (ikinci küçük
migration, `20260724081831`). Kullanıcının 4 açık soruya cevapları: proje
yöneticisi onayı yalnızca proje-içi Finans sekmesinden (çapraz-proje ayrı
ekran yok); "+yeni tedarikçi" basit inline mini-form; Onayla/Reddet UI tek
paylaşımlı bileşene (`OnayReddetActions.jsx`) indirildi; reddedilen fatura
artık **nihai** — eski `resubmit_rejected_invoice`/`delete_rejected_invoice`
RPC'leri (ve `FaturaDetayModal`'daki "kurtarma" UI'ı) kaldırıldı.

Frontend tarafı: `ProjeTabFinans.jsx`/`OnayKuyrugu.jsx` rol kapısı
`canApprove = isAdmin || role==='proje_yoneticisi'`'ye genişledi (Maliyet
Tablosu hâlâ admin-only); `StatusBadge.jsx`'e `taslak`/`duzeltme_bekliyor`/
`odeme_bekliyor` eklendi; `FaturaListesi.jsx` baştan yazıldı (stat kartları +
sekme çubuğu + zenginleştirilmiş tablo); `FaturaDetayModal.jsx` ve
`FaturaFormModal.jsx` ayrı dosyalara çıkarıldı/baştan yazıldı (tek adımlı
onay süreci kartı, Satın Alma Kontrolü kartı, Ödeme Gir modalı, Taslak
Kaydet/Onaya Gönder ayrımı, ödeme-takibi switch'i); `FaturaOlusturModal.jsx`
(satın alma talebinden fatura kesme) aynı taslak→gönder iki adımına geçirildi.

Uçtan uca Playwright ile doğrulandı (backend REST client + gerçek tarayıcı,
brief'in 8 test senaryosunun tamamı): taslak kaydet (bildirim yok) → onaya
gönder (proje yöneticisine bildirim gitti) → onayla (ödeme takipli →
`odeme_bekliyor`, ödeme takipsiz → doğrudan `onaylandı`) → düzeltme iste
(aynı `invoice_approvals` satırı yeniden kullanılıp `yönetici_onayında`'ya
döndü, yeni satır açılmadı) → reddet (nihai, muhasebe aksiyon alamıyor,
`reddedildi→taslak` geçişi trigger tarafından reddedildi) → ödeme gir.
Proje yöneticisi hesabıyla canlı ekran görüntüsü: proje içi Finans'ta artık
Faturalar/Onay Kuyruğu görünüyor, Onay Kuyruğu'nda Onayla/Düzeltme İste/
Reddet butonları gerçek bir faturada tıklanabilir. 28/29 kontrol geçti (tek
"başarısız" — `ProjeDetay.jsx`'te bu görevle ilgisiz, önceden var olan bir
React dev-mode stil uyarısı). Lint clean.

Bilinçli olarak kapsam dışı bırakılanlar (bkz. "Bilinen açık noktalar"):
mobil kart görünümü (yalnızca yatay scroll fallback'i var), vade yaklaşan
fatura hatırlatma cron'u (brief'in kendi notuyla MVP dışı), eksik yerel
migration dosyasının geriye dönük eklenmesi.

**Aynı gün ek — Fatura Detayı kullanıcının verdiği referans mockup'a göre
yeniden tasarlandı.** İlk sürüm işlevsel ama mockup'la görsel/yapısal olarak
hizalı değildi. Eklenenler: breadcrumb ("Faturalar / FTR-..."), oluşturan
kişi + tarih alt yazısı, "Bağlı Talebin Kalemleri" tablosu (`purchase_request_items`'tan
— faturanın kendi kalem tablosu yok), Satın Alma Kontrolü'nde yeşil/turuncu
daire ikonlu kontrol satırları, tek adımlı Onay Süreci vertical layout'a
geçti. `OnayReddetActions.jsx`'e `layout='full'` varyantı eklendi (tek
paylaşımlı "İşlem Notları" kutusu + her zaman görünür Onayla/Düzeltme İste/
Reddet butonları — mockup'ın interaksiyon modeli, `OnayKuyrugu.jsx` hâlâ eski
`compact` varyantı kullanıyor). Renkler hardcoded hex'ten `var(--color-*)`
token'larına geçirildi (projenin kendi teması, mockup'ın renkleri değil).
Yol açtığı 2 küçük ek keşif: (1) `invoices.created_by` hiçbir zaman
FaturaFormModal/FaturaOlusturModal tarafından set edilmiyordu (DB'de de
DEFAULT yok) — düzeltildi, ikisi de artık `useAuth().user.id`'yi yazıyor;
(2) `profiles_select` RLS'i (`admin OR auth.uid()=id`) oluşturan adının
başka bir kullanıcı tarafından client-side okunmasını engelliyordu —
`get_invoices_list`'e yalnızca `full_name`'i expose eden bir `creator` join'i
eklendi (`20260724103253`). Playwright ile proje yöneticisi hesabıyla
canlı doğrulandı (ekran görüntüsü mockup'la örtüşüyor), lint clean, ilgisiz
`ProjeDetay.jsx` uyarısı dışında console hatası yok.

**Önceki görev — Faturalar sayfası "komple düzenleme": ölü iki-adımlı onay
kalıntıları temizlendi + 6 kilitlenmiş fatura kurtarıldı.**

Kullanıcı önceki temalaştırma görevinden sonra "muhasebe onayında ne alaka"
diyerek daha derin bir sorun işaret etti. Araştırma gerçek bir veri bugu
ortaya çıkardı: `invoices` tablosunda 2026-07-20'deki tek-adımlı onay
zincirine geçişten ÖNCE oluşturulmuş 6 fatura hâlâ eski iki-adımlı zincirle
(`step=1 "Muhasebe Onayı"`, `step=2 "Yönetici Onayı"`, ikisi de `bekliyor`)
takılıydı, `invoices.status` hâlâ `bekliyor`/`muhasebe_onayında`'da duruyordu
— ama UI'daki HER aksiyon kontrolü (`canApproveHere` vb.) yalnızca
`status==='yönetici_onayında'`'yı kontrol ettiğinden bu 6 fatura admin için
de kalıcı olarak aksiyonsuzdu (onaylanamaz/reddedilemez). Ayrıca
`get_invoice_approval_queue` RPC'si hâlâ `muhasebe_kuyrugu` ve
`kapanan_faturalar` diye iki dal hesaplayıp döndürüyordu — `OnayKuyrugu.jsx`
(tek çağıran yer) ikisini de hiç okumuyordu, tamamen ölü hesaplama.

Düzeltme (migration `fatura_sayfasi_komple_temizlik`, onaylı):
1. 6 fatura tek-adımlı modele geri-dolduruldu (`invoice_approvals` silinip
   `step=1 "Yönetici Onayı" bekliyor` olarak yeniden yazıldı,
   `invoices.status='yönetici_onayında'` — `create_invoice_approval_chain`'in
   yeni faturalar için ürettiğiyle birebir aynı şekil). Artık normal,
   aksiyon alınabilir faturalar (Onay Kuyruğu'nda Onayla/Reddet ile
   doğrulandı). Bu UPDATE `fn_validate_invoice_status_transition`'ı geçici
   `DISABLE`/`ENABLE TRIGGER` ile atlattı (trigger'ın izin verdiği geçiş
   listesinde `muhasebe_onayında` kaynak durumu hiç yok — ayrıca bunun da
   ölü olduğunun kanıtı).
2. `invoices_status_check`'ten `muhasebe_onayında` kaldırıldı (bkz. "Trigger
   zincirleri").
3. `get_invoice_approval_queue`'dan ölü `muhasebe_kuyrugu`/`kapanan_faturalar`
   dalları kaldırıldı, yalnızca `yonetici_kuyrugu` kaldı.
4. `get_finans_overview_internal`/`_all_internal`/`get_dashboard_summary`'deki
   "pending" `status IN (...)` filtrelerinden `muhasebe_onayında` çıkarıldı
   (davranış değişmedi, yalnızca hiç eşleşmeyen dal temizlendi).
5. Frontend: `StatusBadge.jsx`'teki `INVOICE_STATUS`'tan `muhasebe_onayında`
   kaldırıldı (bunun yüzünden Faturalar filtre dropdown'unda hep-boş-dönen
   "Muhasebe Onayında" seçeneği vardı — asıl şikayet buydu), eksik olan
   `ödendi` etiketi eklendi (14 gerçek faturada bu durum var ama daha önce
   hiç etiketi yoktu, ham metne düşüyordu); `finans.js`'teki `STATUS_ACTIVITY`
   ve bir `ProjeTabFinansYanPanel.jsx` yorumundaki aynı ölü referans temizlendi.

Playwright ile admin hesabıyla doğrulandı: filtre dropdown artık
`Bekliyor/Yönetici Onayında/Onaylandı/Reddedildi/Ödendi` (Muhasebe Onayında
yok), 6 fatura Faturalar listesinde "Yönetici Onayında" gösteriyor, Onay
Kuyruğu'nda hepsi Onayla/Reddet butonlarıyla listeleniyor, console hatası yok.

**Önceki görev — Faturalar listesi Satın Alma temasına geçirildi.**

Kullanıcı "fatura sayfasını satınalma gibi bi temada revize edelim" dedi.
`FaturaListesi.jsx` kendi bespoke stilini kullanıyordu (hardcoded hex renkler
`#E5E7EB`/`#6B7280`/`#111827`/`#185FA5`, pill-stil durum rozeti, özel
Önceki/Sonraki sayfalama, sabit olmayan satır yüksekliği) — `TabSatinAlmaTalepListesi.jsx`
ise projedeki kurulu tema: `var(--color-*)` token'ları, sabit satır/başlık
yüksekliği + yapışkan başlık, nokta+kalın-metin durum rozeti, paylaşılan
`Pager`. Düzeltme: `FaturaListesi.jsx`'in liste/tablo kısmı bu temaya
geçirildi (bkz. "Sistem mimarisi" → Faturalar liste teması notu); ayrıca yerel
`STATUS_BADGE` objesi (zaten `StatusBadge.jsx`'teki `INVOICE_STATUS`'un birebir
kopyası) kaldırılıp paylaşılan haritaya bağlandı — tek kaynak, gelecekte iki
yerde ayrı ayrı güncellenme riski kalmadı. Menü modunda redundant "Detay"
butonu/İŞLEM kolonu da kaldırıldı (satır zaten tıklanabilir). Modallar
(Fatura Ekle/Detay/İptal) dokunulmadı — yalnızca liste/tablo kabuğu ve durum
rozeti değişti. Admin hesabıyla hem menü modu (Finans → Faturalar) hem proje
modu (proje içi Finans → Faturalar, İŞLEM kolonu/İptal Et butonu dahil)
Playwright ile görsel olarak doğrulandı, console hatası yok.

**Önceki görev — Bildirim alıcıları role göre daraltıldı/tamamlandı.**

Kullanıcı "bildirimlerini kullanıcıya göre düzenle" dedi; netleştirince istek
"her rol yalnızca kendi işiyle ilgili bildirim türlerini görsün/alsın" oldu.
`notify_managers()` (tüm `is_manager=true` rollere — admin+muhasebe — birden
gönderen fonksiyon) kullanan 3 trigger/RPC incelendi: ikisinde `is_manager`
bayrağı ile "bu bildirim türünü gerçekten kim yönetebilir" birbirinden
kopmuştu. (1) `trg_notify_ticket_insert`: yeni ticket bildirimi admin+muhasebe'ye
gidiyordu, ama muhasebe'nin `roles.allowed_tabs`'ında `tickets` hiç yok (saf
gürültü) — üstelik tickets'ı artık tam yetkiyle yöneten `proje_yoneticisi`
(`is_manager=false`) hiç bildirim almıyordu. (2)
`create_procurement_item_change_request`/`create_procurement_item_add_request`:
BOM değişiklik/ekleme talebi bildirimi de admin+muhasebe'ye gidiyordu, ama bu
talepleri yalnızca admin onaylayabiliyor (`review_procurement_item_change_request`
admin-only) ve muhasebe'nin `projeler` sekmesi bile yok — Malzeme Listesi'ne hiç
erişemiyor. Düzeltme: her üç fonksiyonda `notify_managers()` yerine hedef role
göre ayrı `notify_role()` çağrıları — ticket oluşturma artık `admin` +
`proje_yoneticisi`'ye, BOM talepleri yalnızca `admin`'e gidiyor (migration
`20260724064248_scope_ticket_and_bom_notifications_by_role`). Diğer tüm
bildirim tetikleyicileri (fatura/satın alma durum değişiklikleri, günlük rapor
hatırlatması) zaten ya `notify_user` ile tek kişiye ya da doğru role
hedefliydi — değiştirilmedi. Frontend'de değişiklik gerekmedi:
`TabBildirimler.jsx`/`NotificationBell.jsx` filtre çipleri zaten yalnızca
kullanıcının GERÇEKTEN aldığı bildirim türlerine göre oluşuyor
(`presentTypes`), bu yüzden alıcı listesi düzelince arayüz otomatik düzeldi.
DB'de gerçek bir ticket insert edilip alıcıların admin+proje_yoneticisi (2
kişi) olduğu, muhasebe'ye hiç gitmediği doğrulandı, test verisi temizlendi.

**Önceki görev — Muhasebe'ye özel "Genel Bakış" sidebar sekmesi eklendi.**

Kullanıcı önce muhasebeye kendi işine özel bir genel bakış istedi
(faturalanacak talepler, yönetici onayındakiler gibi) — ilk denemede bu
`TabFinans.jsx`'in içine bir alt-sekme olarak eklendi (RPC/migration
gerektirmeyen, en az invaziv yol). Kullanıcı ardından bunu ayrı bir menü
item'ı olarak istedi ("menude yeni bir bar aç"), bu yüzden tasarım
değiştirildi: `MuhasebeGenelOzet.jsx` `TabFinans`'tan çıkarılıp `index.jsx`'te
`genel` sekmesinin muhasebe için render ettiği bileşen oldu (`TabGenel`'in
role bazlı alternatifi, bkz. "Sistem mimarisi" → Proje Finans sekmesi notu);
`TabFinans.jsx` eski haline (yalnızca `Faturalar`) döndürüldü. Rol → sekme
erişimi tamamen `roles` tablosundan okunduğundan (bkz. "Frontend yapısı"),
bunun için bir migration şart oldu: `roles.allowed_tabs`/`sidebar_items`'a
`genel` eklendi, `default_tab` `finans`'tan `genel`'e çekildi (migration
`20260724063015_add_genel_tab_for_muhasebe`) — kod tarafında yalnızca
`index.jsx`'e bir render dalı eklemek yetmiyordu. KPI verisi hâlâ aynı iki
zaten-yetkili RPC'den (`get_invoices_list`, `get_satin_alma_overview_all`)
istemci tarafında özetleniyor, bütçe RPC'lerine dokunulmadı. Playwright ile
muhasebe test hesabıyla uçtan uca doğrulandı: sidebar sırası (Genel Bakış →
Satın Alma → Finans → Bildirimler), girişte doğrudan Genel Bakış'a düşme,
"Faturalanacak Talepler" kartı → Satın Alma sekmesi, diğer kartlar → Finans
sekmesi, console hatası yok.

Aynı taramada, önceki göreve ait bir migration dosya adı da düzeltildi:
`remove_dead_muhasebe_onayi_action_item` dosyası `20260723180000` olarak
kaydedilmişti ama Supabase'e uygulanan gerçek versiyon `20260723145253`'tü
(muhtemelen migration mcp tool'la adla uygulanıp dosya sonradan farklı bir
zaman damgasıyla elle yazılmıştı) — dosya adı uygulanmış versiyonla eşleşecek
şekilde yeniden adlandırıldı.

Bir önceki görevde ayrıca: Muhasebe sayfaları görevine göre daraltıldı
(`TabSatinAlma.jsx`/`TabSatinAlmaTalepListesi.jsx` sekme/liste başlığı artık
"Faturalanacak Talepler", durum filtresi dropdown'u yerine sabit açıklama
metni) + `get_finans_overview_internal`/`_all_internal`'daki hiçbir akıştan
üretilmeyen ölü `actionItems.muhasebeOnayi` alanı kaldırıldı (eski iki-adımlı
onay zincirindeki "Muhasebe Onayı" adımı kalktığından beri her zaman "0
fatura · ₺0" dönen donmuş bir metrikti).

Daha önceki görevde ayrıca: Genel Bakış rozetleri (`ProjectOverviewDashboard.jsx`)
risklerle aynı `DotBadge` temasına geçirildi (bu sırada `red_edildi`/`reddedildi`
anahtar uyuşmazlığından "Red Edildi"nin sessizce gri gösterildiği hata
düzeltildi); Malzeme Listesi'ne `has_history` alanına bağlı kırmızı "!" işareti
ve tek, tarihe-sıralı bir değişiklik geçmişi kutusu eklendi (yalnızca onaylı
değişiklikler/geri alınmamış fazla satın alma eklemeleri — reddedilenler
listelenmiyor); ölü `aggregateMaterialsAcrossProjects` ve `update_procurement_status`
RPC'si kaldırıldı; AI sohbet context builder'ındaki (`agentContext.js`) donmuş
`procurement_items` alanları ve `created_at`'i olmayan bir tabloya uygulanan
sessiz-başarısız tarih filtresi düzeltildi.
