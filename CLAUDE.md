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
  kullanır. `DailyReportForm.jsx` 7 bölümlü liste (Hava/Genel, Personel, Makine,
  Günün İşleri, İlerleme, Fotoğraflar, Notlar) + slide-over panel
  modelinde (masaüstünde ortalanmış sabit kutu, mobilde bottom-sheet); panel
  içi tablolar dikey kart listesi (`CARD_ROW`), yatay scroll değil. Kendi
  taslak otomatik kaydetme/yükleme sistemi var (`daily_report_drafts` tablosu,
  sahiplik bazlı RLS). "Hava kayıplı gün" alanı (`weather_loss_day`) ve serbest
  metin makine türü girişi var (aynı makine türü bir raporda iki kez
  eklenirse `machinery_logs_report_machine_unique` UNIQUE ihlali oluşur —
  **bug (29.07.2026'da bulunup düzeltildi):** `DAILY_REPORT_ERROR_RULES`'daki
  eski `match: ['machinery_logs_status', 'machine']` deseni ANY-eşleşme
  olduğundan (`toUserMessage`/`translateError`, `some()`) unique-ihlali
  metnindeki bare "machine" alt-dizesini de yakalayıp kullanıcıya yanlışlıkla
  "Makine durumu geçersiz. Lütfen listeden seçin." gösteriyordu — gerçek
  Postgres constraint adlarıyla (`machinery_logs_report_machine_unique`/
  `machinery_logs_status_check`) eşleşen iki ayrı, spesifik kural eklendi).
  Rapor sahibi kendi raporunu silebilir.
  "Malzeme Kullanımı" bölümü formda **kasıtlı olarak YOK** (`daily_report_material_usage`
  tablosu kullanımda değil) — **kalıcı karar:** BOM/malzeme kullanımı günlük
  raporun kapsamında değil; geri getirilmesi teklif edilirse önce bu kararı
  hatırlat. "İlerleme Girişi" `project_tasks`'tan (task_id bazlı) beslenir.
  **"Sorunlar" bölümü formdan kaldırıldı (2026-07-29, kullanıcı kararı) — kalıcı
  karar:** artık bir sorun/bloker bildirmek için doğrudan Tickets sekmesinden
  ticket açılır, günlük rapordan sorun girilmez; geri getirilmesi teklif
  edilirse önce bu kararı hatırlat. `daily_report_issues` tablosu, `fn_create_ticket_from_daily_report_issue()`
  trigger'ı ve `save_daily_report`'un `p_issues` parametresi backend'de hâlâ
  duruyor (geriye dönük uyumluluk — eski raporlardaki satırlar `DailyReportForm.jsx`
  tarafından sessizce, değiştirilmeden `p_issues`'a geri gönderilip korunuyor;
  aksi halde RPC'nin id-bazlı silme adımı bunları temizlerdi) ama artık hiçbir
  UI'dan yeni satır eklenmiyor — fiilen dead code, ayrı bir temizlik migration'ı
  gerektirir (henüz yapılmadı). Eski raporlardaki geçmiş "Sorunlar" verisi
  `DailyReportDetail.jsx` (salt okunur detay sayfası) ve Excel/PDF export'ta
  hâlâ görüntüleniyor, `daily_report_issues.description` kolonu `category`/
  `closed_at`/`notes` alanlarını `__ISSUE_META__{json}` öneki ile paketler.
  `daily_reports.notes` kolonu da aynı desende `isg_notes`/`incident_notes`/
  `description` alanlarını `__REPORT_NOTES_META__{json}` öneki ile paketler
  (`reportNotesPayload()`, `DailyReportForm.jsx`) — **bug (29.07.2026'da bulunup
  düzeltildi):** `DailyReportList.jsx`'in "Not" kolonu ve `DailyReportDetail.jsx`'in
  "Genel Notlar" bloğu bu öneki hiç çözmüyordu, ham `__REPORT_NOTES_META__{...}`
  JSON'ı kullanıcıya gösteriyordu — ikisi de `decodeStoredMeta()` ile `description`
  alanını gösterecek şekilde düzeltildi (PDF/Excel export zaten doğru
  çözüyordu, yalnızca bu iki ekran etkilenmişti). **Ayrıca fark edildi, henüz
  düzeltilmedi:** `isg_notes`/`incident_notes` alanları hiçbir yerde
  gösterilmiyor — `DailyReportDetail.jsx` yalnızca paketlenmiş `description`'ı
  "Genel Notlar" olarak gösteriyor, İSG/olay notları için ayrı bir UI yok.
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
  **Bug (29.07.2026'da bulunup düzeltildi):** 2026-07-24'teki bu genişleme
  yalnızca component katmanında (`TabFinans.jsx`/`FaturaDetayModal.jsx`/
  `OnayReddetActions.jsx` içindeki `role==='proje_yoneticisi'` kontrolleri)
  yapılmıştı — `role_allowed_tabs`/`role_sidebar_items`'a `finans` satırı hiç
  eklenmemişti, yani proje yöneticisi sidebar'da "Finans"ı hiç görmüyordu ve
  `index.jsx`'teki `handleTabChange` (`navigation.tabs`'ta olmayan bir sekmeye
  geçişi sessizce engeller) normal tıklamayı engelliyordu — yalnızca bildirim
  deep-link'i (`setActiveTab` bu kontrolü bypass eder) ile erişilebiliyordu.
  `20260729120000_add_finans_nav_for_proje_yoneticisi` migration'ıyla düzeltildi.
  Menü seviyesindeki `TabFinans.jsx`'te muhasebe **Faturalar**/**Genel** 2
  alt-sekmesini görür — Faturalar varsayılan/ilk sekme (`Onay Kuyruğu`/
  `Maliyet Tablosu` yok, bütçe verisine erişimi zaten yok, bkz. RPC katmanı).
  Muhasebenin kendi genel bakışı `TabFinans`'ın İÇİNDE değil, ayrı bir
  üst-seviye sidebar item'ında: `index.jsx`'teki `genel` sekmesi diğer roller
  için `TabGenel` render ederken muhasebe için `MuhasebeGenelOzet.jsx`'i
  render eder (role bazlı dallanma, tab anahtarı aynı — `roles.allowed_tabs/
  sidebar_items/default_tab` muhasebe için de `genel`'i içerir, girişte oraya
  düşer). Bütçe/planlanan RPC'lerine hiç dokunmadan, muhasebenin zaten
  yetkili olduğu üç RPC'den (tüm projeler/durumlar `get_invoices_list`,
  `satin_alindi`/`fatura_bekliyor`/`fatura_onay_bekliyor`'a daralan
  `get_satin_alma_overview_all`, `v_invoice_payment_overview`) istemci
  tarafında özetlenir: 4 KPI kartı (Faturalanacak Talepler, Yönetici
  Onayında, **Ödeme Takvimi** — 2026-07-28'e kadar "Ödeme Bekleyen" idi,
  tıklanınca `finans`'a gitmek yerine artık `OdemeTakvimi.jsx` takvimini
  doğrudan bu sayfada açıyor —, Vadesi Geçen) + Kur Bilgisi kartı tek satırda;
  "Bugün Yapılacaklar" panelindeki her satırın kendi `onAction`'ı ilgili
  faturayı doğrudan açar (`onGoToInvoice`), "Yaklaşan Ödemeler"in linki
  `odemeler`'e gider. KPI kartına tıklamak (takvim hariç) `handleTabChange`
  ile ilgili üst-seviye sekmeye geçer ("Faturalanacak Talepler" → `satin-alma`,
  diğerleri → `finans`) — hedef sekme içindeki alt sekme/durum filtresi
  otomatik ayarlanmaz, kullanıcı elle seçer.

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
bir adım var. **Dokümantasyon düzeltmesi (29.07.2026'da flow denetiminde fark
edildi):** bu adım önceden ayrı bir `TedarikKuyrugu.jsx` bileşeninde
yaşıyordu, ama bu bileşen `02c8af4` commit'iyle (23.07.2026) tamamen
kaldırıldı — gerçek akış artık `ProjeTabSatinAlma.jsx` → `TabSatinAlmaTalepListesi.jsx`
(`fixedStatus="onaylandi"`, "Bekleyen" sekmesi) üzerinden yürüyor,
`canCompleteProcurement = role==='proje_yoneticisi'`. `proje_yoneticisi`
(`cross_project=true`, tüm projelere erişir) `onaylandi` durumundaki talepler
için tek-tık **"Tamamlandı"** butonuyla `complete_project_manager_purchase_request`
RPC'sini çağırır (`supplier_id`/`purchase_date` bu RPC'de hiç toplanmıyor —
bilinen açık nokta, bkz. "Bilinen açık noktalar"). "İptal Et" tıklanınca satır
içi bir gerekçe alanı açılır (`rejectDraft` state, `OnayReddetActions.jsx`'in
"compact" moduyla aynı desen) — **gerekçe girilmeden "İptali Onayla" butonu
disabled kalır** (bug: 29.07.2026'ya kadar bu alan hiç yoktu, talep notsuz
sessizce `iptal`'e çekiliyordu; `TalepDetayModal.jsx`'teki eşdeğer "Reddet"
butonu da aynı şekilde düzeltildi — not alanı önceden yalnızca admin'in
`onay_bekliyor` reddi için gösteriliyordu). Gerekçe `purchase_requests.notes`'a
eklenir (mevcut not varsa altına, `\n` ile). RLS (`purchase_requests_update`,
konsolide tek policy) proje yöneticisinin yalnızca `onaylandi`/`satin_alindi`
durumundaki taleplere ve yalnızca tedarik alanlarına yazmasına izin verir
(`fn_purchase_request_procurement_fields_only()` fonksiyonu title/tutar/
requested_by/approved_by değişmediğini doğrular — eski ayrı
`pr_update_proje_yoneticisi` policy'si kaldırılıp bu fonksiyona konsolide
edilmiş). Sert kilit: `trg_guard_invoice_requires_procurement_done` talep
hâlâ `onaylandi`'nin öncesindeyse fatura insert'ini reddeder — muhasebe bu
adımı atlayamaz.

**Faturalı / Faturasız kapatma (2026-07-27):** `satin_alindi` durumundaki bir
talep muhasebe tarafından iki yoldan kapatılabilir — "Fatura Oluştur"
(`FaturaOlusturModal.jsx`) wizard'ının en başında bir **Kayıt Türü** seçici
(Faturalı/Faturasız) var. **Faturalı** (varsayılan) eskisi gibi `invoices`'a
yazar. **Faturasız** — tedarikçiden resmi fatura gelmeyen (nakit/gayriresmi)
alımlar için — aynı talebi `financial_transactions`'a (`purchase_request_id`
bağlantısıyla, yeni eklenen kolon) yazar; KDV kırılımı yok (tek `amount`),
para birimi bilinçli olarak TRY'ye kilitli (talebin kendi tahmini her zaman
TRY). `fn_guard_financial_transaction_requires_procurement_done` (BEFORE
INSERT, `fn_guard_invoice_requires_procurement_done`'ın birebir eşi) talep
`satin_alindi`'de değilse veya proje uyuşmuyorsa reddeder.
`sync_purchase_request_from_financial_transaction` (AFTER INSERT/UPDATE OF
status, `sync_purchase_request_from_invoice`'un eşi) talebi **doğrudan**
`faturasi_kesildi`'ye taşır — invoices'ın aksine burada ara bir yönetici onay
adımı yok (muhasebe zaten direkt giriyor, bkz. "Muhasebe & Finans modülü");
kayıt `iptal` edilirse talep `satin_alindi`'ye geri döner (yeniden
faturalı/faturasız denenebilir). `financial_transactions_purchase_request_id_key`
kısmi unique index'i (`WHERE status <> 'iptal'`) bir talebin en fazla bir aktif
faturasız kapatma kaydı olmasını garanti eder — `invoices.purchase_request_id`
ile aynı "tek aktif kayıt" deseni. Ödeme girişi normal Ödeme Takibi akışından
devam eder (`odeme_bekliyor` varsayılan durumla başlar), `cost_allocations`'a
zaten var olan `trg_financial_transaction_cost_allocation` ile otomatik yansır
— yeni bir maliyet-yansıma mekanizması gerekmedi.

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
  ayrı izinli) — `cost_allocations` geri alınır, bağlı talep `satin_alindi`'ye
  döner (`sync_purchase_request_from_invoice`/`sync_cost_allocation_from_invoice`,
  `invoice_id` null'lanır — talep tekrar "Fatura Oluştur" ile faturalanabilir
  hale gelir, tedarik bilgisi — `supplier_id`/`purchase_date` — korunur, tedarik
  adımı tekrar yapılmaz). **Bug (29.07.2026'da bulunup düzeltildi):** bu fonksiyon
  2026-07-21'deki bir rewrite'ta yanlışlıkla talebi `fatura_onay_bekliyor`'da
  bırakıyordu (muhtemelen INSERT dalıyla kopya-yapıştır hatası) — `reddedildi`
  nihai olduğundan (aşağıya bkz.) talep bu durumda sonsuza kadar donuk kalıyordu,
  ne yeniden faturalanabiliyor ne gerçek bir onay bekliyordu. Faturasız ödemenin
  birebir eşi (`sync_purchase_request_from_financial_transaction`) referans
  alınarak `satin_alindi`'ye düzeltildi (`20260729130000_fix_purchase_request_revert_on_invoice_rejection`).
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
faturanın kendi kalem tablosu yok —, bağlı bir talep varsa Satın Alma Kontrolü
kartı (yoksa sağ sütun hiç render edilmez, tek sütuna daralır — `invoice-detail-grid-single`),
Ödeme Gir modalı) ayrı dosyalarda, tamamı `var(--color-*)`
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
demek. Tek-proje rolleri için `YeniTicketModal.jsx`'teki "Ticket Cinsi"
dropdown'ında "Genel" seçeneği `project_id`'yi NULL'a düşürür (CLAUDE.md'de
önceden bir checkbox olarak geçiyordu, gerçek UI bu dropdown — düzeltildi).
RLS (`tickets_insert`): `created_by = auth.uid() AND has_project_access(project_id)`
(`has_project_access(NULL)` her zaman true, genel ticket'lar etkilenmez).

**Bug (29.07.2026'da bulunup düzeltildi):** `TicketListesi.jsx`'te santiye_sefi
filtresi `project_id = authProjectId` uyguluyordu — Postgres'te bu, `project_id
IS NULL` satırlarını asla eşleştirmez, yani santiye şefinin kendi açtığı genel
ticket'lar kendi listesinde hiç görünmüyordu. `.or('project_id.eq.<id>,project_id.is.null')`'a
çevrildi. RLS (`tickets_select`) zaten yalnızca `created_by=auth.uid()` OLAN
genel ticket'ları döndürüyor (başka bir kullanıcının genel ticket'ı `p.project_id
= tickets.project_id` NULL karşılaştırmasında eşleşmediği için görünmez) —
yani bu değişiklik kapsamı genişletmiyor, yalnızca kullanıcının zaten görmeye
yetkili olduğu kendi genel ticket'larını görünür kılıyor.

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
atanabilir ama bu yalnızca kozmetik/varsayılan; `genel` sekmesinde
`scopeProjectId` boşken (çoklu proje) `TabGenel` admin gibi aggregate
("Tüm Projeler") moduna geçer, ayrı bir proje-seçim ekranı yok (2026-07-21).
**Ölü kod temizliği (29.07.2026):** `index.jsx`'te proje_yoneticisi için
`'is-plani'`'ye özel bir render dalı ve onu destekleyen `pySelectedProjectId`
state'i + `ProjeSecimGerekli` bileşeni vardı — `role_allowed_tabs`/
`role_sidebar_items`'a proje_yoneticisi için hiç `is-plani` eklenmediğinden
(git geçmişi kontrol edildi: `20260723065156_add_role_navigation_matrix`
migration'ı PM'i bilinçli olarak `is-plani` olmadan tanımlıyor — Finans
sidebar bug'ının aksine bu bir regresyon değildi) bu dal fiilen hiç
tetiklenemiyordu, kaldırıldı. `ProjeDetay.jsx`'in iç sekmelerinde proje_yoneticisi
Finans'ta Faturalar/Onay Kuyruğu'nu görüp fatura onaylayabilir (bkz. "Satın
alma akışı" → Fatura onay akışı — 2026-07-24'te Genel-özet-yalnızca'dan
buraya genişledi, Maliyet Tablosu hâlâ admin-only), Tickets santiye_sefi ile
aynı tam yetkide. Kullanıcı oluşturma açık ama Düzenle/Şifre/Sil (`TabKullanicilar.jsx`)
hâlâ `isAdmin`-only. **Proje yönetimi tarafı farklı:** proje şablonuyla proje
ekleme YANINDA mevcut bir projeyi Düzenle/Excel export/Sil de admin ile eşit
(`TabProjeYonetimi.jsx`'teki `canCreateProject = isAdmin || role==='proje_yoneticisi'`
üçünü de kapsar) — bu önceki bir sürümde yanlışlıkla "hâlâ isAdmin-only"
olarak dokümante edilmişti, ama `20260723140000_allow_proje_yoneticisi_edit_project_wizard_tables`/
`20260723140100_allow_proje_yoneticisi_delete_project_cascade` migration'ları
bunu RLS düzeyinde de (yalnızca UI'da değil) bilinçli olarak açtı — kademeli
proje silme `invoices`/`purchase_requests`/`agent_reports`/`procurement_item_*`
tablolarındaki proje yöneticisi DELETE policy'leriyle birlikte tasarlandı
(2026-07-29'da denetimde bu tutarsızlık fark edilip düzeltildi, bkz. "Son
değişiklik" — kodun kendi eski yorumu da yanlıştı, güncellendi).

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
`get_satin_alma_overview_all_internal`'ın `requests` jsonb'i (`MuhasebeSatinAlma.jsx`'in
tek veri kaynağı) 2026-07-27'ye kadar yalnızca id/title/status/tarihler/proje
döndürüyordu — `supplier_id`/`supplier_name`/`estimated_amount_incl_vat`/
`requester_name`/`description` (`request_note`) ve kalemlerde `unit_price`/
`total_price` hiç yoktu, bu yüzden Tedarikçi filtre dropdown'ı hep boştu ve
Onaylanan Tutar hep ₺0 görünüyordu (görünüşte "filtreler çalışmıyor" gibi
algılandı, aslında filtreleme mantığı doğruydu — filtrelenecek gerçek veri
yoktu). Bu alanlar eklendi (2026-07-27). `get_satin_alma_overview_all()`
wrapper'ının muhasebe için daralttığı status listesi 2026-07-28'de
`fatura_onay_bekliyor`'u da kapsayacak şekilde genişletildi — önceden bir
talebin faturası oluşturulur oluşturulmaz (durum `satin_alindi`'den
`fatura_onay_bekliyor`'a geçince) talep `MuhasebeSatinAlma.jsx`'in listesinden
tamamen düşüyordu, muhasebe kendi oluşturduğu faturanın hangi talebe ait
olduğunu Satın Alma ekranından takip edemiyordu. Artık bu durumdaki talepler
listede kalıp **"Onayda"** rozetiyle (mor, `purchase-status.onayda`)
gösteriliyor, "İşlem" kolonunda "Fatura Oluştur" yerine "Görüntüle" çıkıyor
(yeni bir fatura açmasının anlamı yok, zaten biri onay bekliyor) — yeni
veri sızıntısı değil, muhasebe bu faturaları zaten Faturalar sekmesinden
görebiliyordu. **Bu genişletmenin iki yan etkisi 2026-07-28'de fark edilip
düzeltildi** (bkz. "Son değişiklik"): (1) `TalepDetayModal.jsx`'in "Onay
Süreci" adımları `fatura_onay_bekliyor`'u hesaba katmıyordu, "Fatura
Bekleniyor" adımını hâlâ aktif gösteriyordu (oysa fatura zaten oluşturulmuş,
tamamlanmış sayılması gerekir — son adım "Fatura Kesildi" aktif olmalı);
(2) `MuhasebeGenelOzet.jsx`'teki "Faturalanacak Talepler" KPI'ı ve "Bugün
Yapılacaklar"daki "X satın alma talebi fatura bekliyor" satırı aynı
`get_satin_alma_overview_all` sonucunu kullandığından `fatura_onay_bekliyor`
talepleri de sayıp şişiriyordu — bu iki bileşende `pendingRequests`/adım
mantığı `fatura_onay_bekliyor`'u ayrı ele alacak şekilde güncellendi.
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
götürür (`goToProjectTab`). Her satırda bir silme butonu var (`.bildirim-delete`,
`notifications` RLS'i zaten `recipient_id=auth.uid()` kendi kaydını silmeye
izin veriyordu ama 29.07.2026'ya kadar bunu tetikleyecek bir UI yoktu —
düzeltildi, satır artık `<button>` değil `role="button"` bir `<div>`
(nested `<button>` geçersiz HTML olurdu), silme butonu `stopPropagation` ile
satırın kendi `onClick`'ini (kayda gitme) tetiklemeden çalışıyor).
`NotificationBell.jsx`'e kasıtlı olarak silme eklenmedi (o bileşen bilinçli
olarak sade kalıyor, tam yönetim tam sayfada).

### Muhasebe & Finans modülü
Menü seviyesindeki `TabFinans.jsx` altında (proje-içi `ProjeTabFinans.jsx`'ten
ayrı, tüm-projeler görünümü) muhasebe rolü için 2 alt-sekme: **Faturalar**
(varsayılan/ilk sekme — 2026-07-28'e kadar Genel ilkti, kullanıcı isteğiyle
sıra değişti, `TABS`/`useState` başlangıcı `isMuhasebe` dallanıyor), Genel
(admin/proje_yöneticisi Genel/Faturalar/Ödeme Takibi/Onay Kuyruğu +
admin-özel Maliyet Tablosu görür — bkz. "Roller"). Muhasebenin **Genel**
sekmesi kendi içinde iki alt-sekmeye bölünür (`genelSection` state,
`.finans-genel-subtabs` pill toggle — Malzeme Listesi'ndeki Malzeme
Listesi/Riskler alt-sekme deseniyle aynı fikir): **Genel**
(`MuhasebeFinansGenel.jsx` — canlı özet) ve **Detay** (`FinansRaporlari.jsx`
— filtrelenebilir/export edilebilir tarihsel rapor); 2026-07-27'de ikisi tek
sayfada üst-alt istiflenmişti, 2026-07-28'de kullanıcı isteğiyle gerçek bir
alt-sekme ayrımına çevrildi (`raporlar` tab key'i zaten yoktu, `genelSection`
yalnızca bu iki bölüm arasında geçiş yapar, üst-seviye `tab` state'ini
etkilemez). **Ödeme Takibi** ve
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

- **Faturalar** (`FaturaListesi.jsx`/`FaturaDetayModal.jsx`) — onay akışı
  bkz. "Satın alma akışı" → Fatura onay akışı, değişmedi. 2026-07-28'de
  sadeleştirildi: üstteki 4 KPI kartı (Taslak/Yönetici Onayında/Düzeltme/
  Onaylanan) kaldırıldı (durum sekmelerindeki sayaçlarla — `Tümü <b>29</b>`
  vb. — zaten aynı bilgiyi tekrarlıyordu), sekme yazıları kalınlaştırıldı
  (`font:700`, aktifte `800`). Üst-sağdaki buton eskiden "▤ Faturalanacak
  Talepler" yazıp aslında boş "Yeni Fatura" formu açıyordu (bkz. eski "Bilinen
  açık noktalar") — artık **"＋ Fatura / Harcama Ekle"** olarak doğru
  etiketlenip genelleştirilmiş `FaturaOlusturModal.jsx` sihirbazını açıyor
  (bkz. aşağıdaki "Fatura/Harcama Ekle sihirbazı" notu). `FaturaFormModal.jsx`
  artık yalnızca **mevcut** bir faturayı (taslak/düzeltme_bekliyor)
  düzenlemek için kullanılıyor — yeni fatura/harcama oluşturma bu bileşenden
  tamamen ayrıldı.
- **Ödeme Takibi** (`OdemeTakibi.jsx`, muhasebe için `TabOdemeler.jsx` →
  admin/proje_yöneticisi için `TabFinans.jsx` içinden) — hem faturalı
  (`invoices`/`invoice_payments`, `v_invoice_payment_overview` view'ı üzerinden
  vade/ödeme durumu) hem **faturasız ödeme**
  (`financial_transactions`/`financial_transaction_payments`) kayıtlarını TEK
  tabloda, `source` alanıyla ayırt ederek listeler — kullanıcı kararıyla
  (2026-07-26) ayrı bir "Finansal İşlemler" üst-sekmesi olarak KALMAYACAK
  şekilde buraya taşındı. `invoices.status`'un `'ödendi'`,
  `financial_transactions.status`'un `'odendi'` yazması (Türkçe karakter farkı)
  bu ekranda tek bir görüntüleme durumuna (`normalizeStatus`) indirgeniyor.
  2026-07-28'de sadeleştirildi: gereksiz `<h1>`/açıklama ve 4 KPI stat kartı
  kaldırıldı; ayrı "＋ Faturasız Ödeme Ekle" butonu (`FinansalIslemFormModal.jsx`
  açardı) kaldırılıp tek **"＋ Fatura / Harcama Ekle"** butonuna birleştirildi
  — bu buton da genelleştirilmiş `FaturaOlusturModal.jsx` sihirbazını açar
  (Faturalı seçilirse `invoices`'a, Faturasız seçilirse `financial_transactions`'a
  yazar). `FinansalIslemFormModal.jsx` bu birleşmeyle tamamen kullanımdan
  kalktığı için silindi — bir işleme ödeme *girmek* için hâlâ ayrı
  `FinansalIslemOdemeModal.jsx` kullanılıyor (bu değişmedi, o bir "ekleme"
  değil "mevcut kayda ödeme" akışı). "Ödeme Takvimi" ve "Tedarikçiye Ödeme
  Ekle" butonları aynen kaldı (farklı işlevler — biri görünüm, diğeri
  toplu-ödeme dağıtımı, "ekle" birleşmesinin kapsamı dışında).
- **Tedarikçiler** (`TedarikciListesi.jsx`/`TedarikciDetayModal.jsx`) — bakiye/
  geçmiş hem `invoices` hem `financial_transactions`'ı kapsar (`iptal` hariç);
  önceden yalnızca faturalar sayılıyordu, aynı tedarikçiye faturasız yapılan
  ödemeler bakiyeye hiç yansımıyordu (2026-07-26'da düzeltildi). Tedarikçiye
  toplu ödeme sihirbazı (`TedarikciOdemeModal.jsx`, açık faturalara dağıtım)
  bilinçli olarak hâlâ yalnızca fatura bazlı — faturasız ödemenin kendi tekil
  ödeme girişi `FinansalIslemOdemeModal.jsx` üzerinden yapılır.
- **Detay** (`FinansRaporlari.jsx`, üst-seviye sekme değil — "Genel"
  sekmesinin kendi içindeki ikinci alt-sekme, bkz. yukarısı) — proje/tedarikçi/dönem
  bazlı filtrelenebilir rapor + Excel/PDF export. **"Hedef Maliyet" karşılaştırması kasıtlı olarak
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
- **Fatura/Harcama Ekle sihirbazı — tek, genelleştirilmiş bileşen
  (2026-07-28):** `FaturaOlusturModal.jsx` (`src/components/satin-alma/`)
  artık uygulama genelinde "yeni fatura/harcama oluştur" için TEK giriş
  noktası — Satın Alma'daki (`MuhasebeSatinAlma.jsx`) satır bazlı "Fatura
  Oluştur", Satın Alma/Faturalar/Ödemeler sayfalarındaki üst "+ Fatura /
  Harcama Ekle" butonları hepsi bunu açar. 2026-07-26'da bir birleştirme
  denemesi geri alınmıştı (bkz. eski not) çünkü o zamanki `FaturaFormModal`
  wizard UX'ini (talep kartı, "Otomatik Kontroller", tutar-tolerans uyarısı)
  kaybediyordu — bu kez tersi yapıldı: `FaturaOlusturModal`'ın kendisi
  genelleştirildi, basit forma indirgenmedi. `request` prop'u artık
  **opsiyonel**: doluysa (satır bazlı tetikleme) proje/talep sabit ve
  salt-okunur eskisi gibi; boşsa (genel giriş noktaları) sihirbazın en
  başında editable bir "Proje ve Bağlı Talep" kartı açılır — proje seçilebilir,
  `status='satin_alindi'` tüm taleplerden (projeye göre filtrelenmiş) opsiyonel
  bir talep seçilebilir ya da talepsiz "genel harcama" olarak devam edilebilir.
  "Kayıt Türü" (Faturalı/Faturasız) toggle'ı her iki modda da aynı: Faturalı
  `invoices`'a `status='taslak'` + gerekirse `invoice_approvals` insert eder
  (bağlı talep varsa `source='satin_alma'`, yoksa `'manuel'`); Faturasız
  `financial_transactions`'a (bağlı talep varsa `purchase_request_id`'siyle,
  yoksa talepsiz) doğrudan yazar, onay adımı yok. **Ödeme takibi artık ayrı
  bir onay kutusu değil** — ödeme takibi (`requires_payment_tracking`)
  doğrudan Vade Tarihi alanının doluluğundan türetilir (doluysa takibe
  alınır, boşsa fatura onaylanınca peşin kapanır); bağlı talep varsa para
  birimi hâlâ TRY'ye kilitli (talebin `approvedTotal` karşılaştırması TRY),
  bağlı talep yoksa (genel harcama/fatura) TRY/USD/EUR seçilebilir.
  `FaturaFormModal.jsx` artık bu akışın DIŞINDA — yalnızca mevcut bir
  faturayı düzenlemek için kullanılıyor (bkz. "Faturalar" bullet'ı).
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
tutar = `total_amount_try` (KDV dahil, **TRY karşılığı** — 2026-07-27'de USD/EUR
fatura desteğiyle birlikte `total_amount`'tan ayrıldı, bkz. "Çoklu para birimi
desteği"). "Bekleyen" (henüz taahhüt edilmemiş) tanımı:
`status IN ('yönetici_onayında','duzeltme_bekliyor')` — `taslak` henüz
gönderilmediği için hiçbir kovaya girmez.
`get_dashboard_summary.spent_amount`, `get_finans_overview(_all).totalActual`
ve `sum(cost_allocations.amount)` bu tanımla hizalı olmalı — birinde sapma
görülürse regresyon say.

### Çoklu para birimi desteği (fatura oluşturma)
`invoices.currency` (`TRY`/`USD`/`EUR`, üçü de zaten schema'da destekleniyordu)
artık fiilen seçilebilir — `FaturaFormModal.jsx` (bağımsız fatura) ve
`FaturaOlusturModal.jsx` (satın alma talebinden) ikisi de bir Para Birimi
seçici + `src/utils/exchangeRates.js`'teki `fetchDoviz()` (TCMB günlük satış
kuru, `/tcmb-kurlar` proxy'si — `vite.config.js`/`vercel.json`) ile o günün
kurunu gösterir. `invoices.exchange_rate` (TRY faturalarda her zaman 1) +
generated `total_amount_try` (`(amount + amount*vat_rate/100) * exchange_rate`)
kolonları eklendi (`20260727090000_multicurrency_invoice_support` migration'ı).
**Kritik kural:** bütçe/KPI toplayan her yer (`get_dashboard_summary`,
`get_finans_overview(_all)_internal`, `get_invoices_list` stat kartları,
`sync_cost_allocation_from_invoice`, `get_project_by_date`'in Genel Proje
"Özet" kartı) `total_amount`/`amount` değil `total_amount_try` toplar — aksi
halde bir USD faturası TRY faturalarıyla aynı sütunda sessizce toplanır.
Yeni bir yer `SUM(invoices.total_amount)` yazarsa bu bir regresyon — `total_amount_try`
kullanmalı. Ödeme takibi (`paid_amount`/`remaining_amount`/`invoice_payments`)
kapsam dışı bırakıldı — fatura kendi para biriminde kalır, ödeme kurla
dönüştürülmez (kullanıcı seçimi). `FaturaListesi.jsx`/`FaturaDetayModal.jsx`/
`recentActivity` (`formatRecentActivity`) artık `inv.currency`'ye göre
₺/$/€ gösteriyor — hardcoded TRY `Intl.NumberFormat` gördüğün yerde bu bir
regresyon sinyali. `MuhasebeGenelOzet.jsx`'e (Genel Bakış, muhasebe) daha önce
yalnızca admin/proje_yöneticisi'nin `TabFinans.jsx`'te gördüğü `KurCard`
(`ProjeTabFinansYanPanel.jsx`) eklendi — muhasebe artık kendi Genel Bakışında
da güncel USD/EUR kurunu görüyor.
**Bilinçli olarak kapsam dışı bırakıldı** (bkz. "Bilinen açık noktalar"):
Tedarikçi bakiyesi (`TedarikciListesi.jsx`/`TedarikciDetayModal.jsx`) ve
`FinansRaporlari.jsx` toplamları hâlâ ham `total_amount` topluyor — bir
USD/EUR fatura tedarikçi bakiyesine girerse bu ikisi farklı para birimlerini
karıştırabilir. Satın alma talebi (`purchase_requests.currency`) ve faturasız
ödeme (`financial_transactions.currency`) formlarına da para birimi seçici
eklenmedi (kullanıcı kararıyla yalnızca fatura oluşturma kapsamına alındı).

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

- **Tedarikçi bakiyesi/Finans Raporları çoklu para birimini karıştırabilir
  (2026-07-27'de USD/EUR fatura desteğiyle ortaya çıktı).** `TedarikciListesi.jsx`/
  `TedarikciDetayModal.jsx` (bakiye toplamı) ve `FinansRaporlari.jsx` (proje/
  kategori toplamları) hâlâ `record.total_amount`'ı ham topluyor — bir USD/EUR
  fatura bu ekranlara girerse toplam sessizce farklı para birimlerini karıştırır.
  Tam düzeltmesi (ödeme tarihindeki kur farkını da hesaba katan `paid_amount`/
  `remaining_amount` TRY karşılıkları) kapsam dışı bırakıldı — bkz. "Çoklu para
  birimi desteği". Fark edilirse önce bu notu hatırlat.
- **Genel Proje "Özet" kartındaki `spent` hesabı (`ProjectOverviewDashboard.jsx`)
  kanonik "gerçekleşen maliyet" durum setiyle uyumlu değil.** Yalnızca
  `onaylandı/onaylandi/ödendi/odendi/paid/approved` sayıyor,
  `odeme_bekliyor`/`kismen_odendi` dahil değil (bkz. "Gerçekleşen maliyet
  kanonik tanımı" — bu ikisi de sayılmalı). 2026-07-27'de fark edildi, bu
  görevin kapsamı dışında (yalnızca aynı satırdaki para birimi hatası
  düzeltildi) — ayrı bir düzeltme gerektirir.
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
- **Migration tracking boşluğu (Supabase tarafı) — hâlâ açık.** 2026-07-26'da
  fark edildi: `financial_transactions`/`financial_transaction_payments`
  şeması, `v_invoice_payment_overview` security_invoker düzeltmesi,
  `role_allowed_tabs`/`role_sidebar_items` normalizasyonu,
  `harden_database_security_and_indexes` gibi birden fazla migration canlıda
  uygulanmış (tablolar/fonksiyonlar gerçekten var) ama
  `supabase_migrations.schema_migrations`'ta versiyonları YOK — muhtemelen
  migration tooling atlanıp doğrudan SQL editöründen uygulanmış (yerel dosya
  adlarındaki zaman damgaları da gerçek uygulanan versiyonlarla eşleşmiyor,
  ör. yerel `20260724170000_harden_database_security_and_indexes.sql` iken
  canlıda aynı isim `20260724133320` altında kayıtlı). Bu hâlâ düzeltilmedi
  (kapsamı büyük, ayrı bir "migration tracking reconciliation" görevi
  gerektirir). **Ayrı, artık kapatılmış bir git-tracking boşluğu vardı — bkz.
  "Son değişiklik":** bu 16 migration dosyasının kendisi (ve 17 finans/muhasebe
  bileşen dosyası — `OdemeTakibi.jsx`, `MuhasebeGenelOzet.jsx`, `TabOdemeler.jsx`
  vb.) önceki oturumlarda diske yazılmış ama hiç `git add` edilmemişti;
  `supabase/migrations/` altındaki yerel dosyalar artık git'te (Supabase'in
  kendi `schema_migrations` geçmişiyle 1:1 eşleşmiyor olsa da), commit
  edilmemiş dosya sorunu 29.07.2026'da giderildi.





## Son değişiklik

**29.07.2026 — Vercel deployment hatası: commit edilmemiş dosyalar yüzünden
build patlıyordu.** Push sonrası Vercel'de build hatası bildirildi. Kök neden
araştırması: `git status` üzerinde 17 finans/muhasebe bileşeni
(`OdemeTakibi.jsx`, `MuhasebeGenelOzet.jsx`, `MuhasebeSatinAlma.jsx`,
`TabOdemeler.jsx`, `FinansRaporlari.jsx`, `TedarikciListesi.jsx`,
`OnayReddetActions.jsx` vb. — bkz. commit `0e3381c` için tam liste) ve 16
migration dosyası (2026-07-23 ile 2026-07-28 arası) **untracked** çıktı —
önceki oturumlarda diske yazılmış ama hiç `git add` edilmemişlerdi. Zaten
commit edilmiş `TabFinans.jsx`/`index.jsx` gibi dosyalar bu bileşenleri import
ediyordu; yerel çalışma dizininde dosyalar diskte olduğu için `npm run build`
sorunsuz geçiyor, ama Vercel git'ten temiz bir clone çektiği için dosyalar hiç
yoktu. Doğrulama: `/tmp`'e `git clone --no-local` ile HEAD'in temiz bir
kopyası çıkarılıp `npm run build` çalıştırıldı — `Could not resolve
"./components/MuhasebeGenelOzet" from "src/pages/dashboard/index.jsx"`
hatasıyla aynen tekrarlandı (Vercel'in yaşadığı hatanın birebir aynısı).
Tüm 17 bileşen + 16 migration dosyası `git add` ile eklenip (`eslint` önce
temiz olduğu doğrulandı — yalnızca 2 önceden bilinen stil uyarısı, hata yok)
`0e3381c` commit'iyle eklendi; aynı clean-clone yöntemiyle build'in artık
başarıyla geçtiği doğrulanıp push edildi. Bu migration dosyalarının kendisi
zaten canlıda uygulanmış durumdaydı (yeni bir `apply_migration` çağrısı
YAPILMADI, yalnızca var olan yerel SQL dosyaları git'e eklendi) — Supabase'in
kendi `schema_migrations` tracking boşluğu (bkz. "Bilinen açık noktalar")
bundan ayrı, hâlâ çözülmedi. **Ders:** bundan sonra her önemli özellik
tamamlandığında commit atılırken `git status` çıktısında kalan untracked
dosya olmadığı MUTLAKA doğrulanmalı — commit edilen dosyanın import ettiği
her yeni bileşenin de git'e eklendiğinden emin olunmalı, aksi halde yerel
`npm run build` yanıltıcı şekilde yeşil kalırken canlı deploy (Vercel, temiz
clone) sessizce kırılabilir.
