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
- Routing: `/login`, `/yetkisiz`, `/dashboard/*` (tek `ProtectedRoute`,
  `ScopeProvider` ile sarmalı — `/dashboard/*` kasıtlı olarak TEK bir wildcard
  route, ayrı `<Route>` girdileri değil; ayrı girdiler olsaydı React bunları
  farklı ağaç konumu sayıp Dashboard'u navigasyon sırasında remount edebilirdi).
  Sayfa bazlı ayrı `<Route>` YOK ama URL artık gerçek görünümü yansıtıyor —
  `src/pages/dashboard/index.jsx` `activeTab`/seçili proje/proje-içi sekmeyi
  `useLocation().pathname`den türetir (`/dashboard/{tab}`,
  `/dashboard/projeler/{projectId}`, `/dashboard/projeler/{projectId}/{projeSekmesi}`),
  `handleTabChange`/`handleSelectProject`/`goToProjectTab` artık doğrudan state
  set ETMEZ, `navigate()` çağırır — state güncellemesi URL değişikliğini dinleyen
  tek bir efekt üzerinden gerçekleşir (browser geri/ileri, `navigate()`, doğrudan
  URL girişi hepsi aynı yoldan geçer, 30.07.2026'da eklendi — öncesinde adres
  çubuğu hep `/dashboard` kalıyordu, yenilemede/geri-ileri'de her zaman Genel
  Bakış'a dönülüyordu). Proje içi sekme değişiklikleri `navigate(..., {replace:true})`
  ile URL'i günceller (geri tuşunu proje-içi her tık için değil, yalnızca
  üst-seviye/proje geçişleri için kullanışlı tutmak amacıyla) — `ProjeDetay.jsx`
  bunun için `onTabChange` callback'i + `initialTab` prop'undaki değişikliklere
  tepki veren bir efekt aldı (ikinci bir bonus: bildirimden gelen bir deep-link
  zaten mount olmuş bir ProjeDetay'ın sekmesini artık düzgün değiştirebiliyor,
  öncesinde yalnızca ilk mount'ta okunuyordu). Her "sayfa" bir `Tab*.jsx` bileşenidir (`TabGenel`, `TabFinans`, `TabSatinAlma`,
  `TabTickets`, `TabKullanicilar`, `TabProjeYonetimi`, `TabSantiyeSefi`,
  `TabIsPlan`, `TabBildirimler`). Bu sayfaların KENDİ İÇİNDEKİ alt-sekmeleri
  (`TabFinans`/`TabSatinAlma`/`TabOdemeler`'in üst sekme çubuğu, `ProjeDetay`'ın
  8 sekmesi + Malzeme Listesi'nin Malzeme/Riskler alt-sekmesi, proje içi
  `ProjeTabFinans`/`ProjeTabSatinAlma`) de aynı `activeTab` deseniyle
  localStorage'da kalıcı (30.07.2026'da eklendi) — bu bileşenler `activeTab`
  değişince unmount/remount olduğundan (React conditional render), öncesinde
  başka bir menüye geçip geri dönmek her seferinde varsayılan alt-sekmeye
  (`genel`/`talepler`/`Genel Proje`) sıfırlıyordu. Menü seviyesindekiler
  (`finans-active-subtab`, `satin-alma-active-subtab`, `odemeler-active-subtab`)
  düz bir localStorage anahtarı kullanır; proje-özel olanlar (`proje-detay-active-tab-*`,
  `proje-detay-malzeme-section-*`, `proje-finans-active-subtab-*`,
  `proje-satin-alma-active-subtab-*`) `projectId` ile sonlandırılmış anahtar
  kullanır ki farklı bir proje açmak yanlışlıkla başka projenin sekmesini miras
  almasın. Açık bir deep-link (`initialTab` prop, ör. bildirimden gelme) her
  zaman persisted değerin önüne geçer; rol bazlı sekmelerde (Finans'ın Onay
  Kuyruğu, Satın Alma'nın Onay Bekleyenler/Bekleyen gibi) persisted değer o rol
  için artık geçerli değilse varsayılana düşülür. Ayrıca `index.jsx`'teki
  `handleTabChange` öncesinde sidebar'daki HER tıklamada (Projeler'in kendisi
  dahil) `showProjectDetail`'i sıfırlıyordu — bu yüzden bir projenin
  içindeyken başka bir menüye geçip "Projeler"e geri dönmek her seferinde
  proje listesine düşüyordu; bu satır kaldırıldı, listeye dönmenin açık yolu
  artık yalnızca `ProjeDetay`'ın kendi "← Projelere Dön" butonu. **Açık detay
  modalları da (02.08.2026'da eklendi) URL'e yansıyor** — satın alma talebi
  (`?talep=`), ticket (`?ticket=`), fatura (`?fatura=`), tedarikçi (`?tedarikci=`)
  detay modallerinin hepsi bu sorgu parametreleriyle kalıcı (`TabSatinAlmaTalepListesi`/
  `MuhasebeSatinAlma`/`TicketListesi`/`FaturaListesi`/`TedarikciListesi`,
  `src/hooks/useUrlSyncedSelection.js` paylaşımlı hook'u üzerinden) —
  öncesinde bir detay modalı açıkken sayfa yenilenince modal sessizce kapanıp
  alttaki listeye dönülüyordu (üst sekme/proje kaybolmuyordu ama "hangi kaydı
  inceliyordum" bilgisi kayboluyordu). `index.jsx`'teki `syncEntityParam`
  yardımcı fonksiyonu mevcut path'i koruyarak yalnızca ilgili parametreyi
  ekler/siler (`{replace:true}`, her aç/kapa history'e girdi eklemesin diye);
  bildirimlerden gelen deep-link'ler (`goToRequest`/`goToTicket`/`goToInvoice`)
  artık `setOpen*Id` + ayrı `navigate()` yerine doğrudan sorgu parametreli
  URL'e gider, `openRequestId` vb. state'i URL'den TEK bir merkezi efekt
  türetir. **Kritik implementasyon notu:** çocuk bileşendeki "seçili id
  değişti, parent'a bildir" efekti basit bir "ilk render'ı atla" sayacıyla
  yazılırsa React StrictMode'un (dev'de) efektleri iki kez çalıştırması bu
  sayacı yanlış tüketip mount anındaki geçici `null` durumunu "gerçek kapanış"
  sanıp deep-link fetch'i bitmeden URL parametresini silebiliyordu — bulunup
  düzeltilen bug, `useUrlSyncedSelection` bu yüzden sayaç yerine "son
  raporlanan değerle karşılaştırma" deseni kullanıyor (StrictMode'un aynı
  değerle gelen tekrar çağrısını doğal olarak filtreler). **Proje detayı
  içindeki eşdeğerler de aynı gün ikinci bir adımda kapsandı** — `ProjeDetay`
  artık `openRequestId`/`openInvoiceId`/`openTicketId` + `onSelected*Change`
  prop'larını alıp kendi Satın Alma/Finans/Tickets alt-sekmelerine
  (`ProjeTabSatinAlma`/`ProjeTabFinans`/`TicketListesi`) iletiyor; URL
  `/dashboard/projeler/{id}/{sekme}?talep=`/`?fatura=`/`?ticket=` şeklinde.
  Burada AYRI bir StrictMode-kaynaklı bug daha bulundu: `ProjeDetay`'ın kendi
  `tab` state'ini `onTabChange` prop'una (→ `navigate(...,{replace:true})`)
  yansıtan efekti her mount'ta (StrictMode'da iki kez) tetikleniyordu — bu da
  bare bir path'e (query string'siz) navigate edip yeni eklenen `?talep=` vb.
  parametreyi sayfa yenilenir yenilenmez siliyordu. `useUrlSyncedSelection`'daki
  aynı "son işlenen değerle karşılaştır" deseni (`lastActedTabRef`) burada da
  uygulanarak düzeltildi.
- Proje-özel görünümler `src/pages/dashboard/components/ProjeTab*.jsx` altında
  (`ProjeDetay.jsx` seçilen projeyi gösterir); genel/tüm-projeler görünümleri
  ayrı `Tab*.jsx` dosyalarında. Finans/Satın Alma bu ikisi arasında alt
  bileşen paylaşıyor (`projectId` opsiyonel prop deseni); Malzeme Listesi (BOM)
  ve `MaliyetOzetTable` bilinçli olarak ayrı bileşenler — birleştirilmeyecek
  (BOM projeye özgü bir kavram, maliyet tablosu farklı bir alan). Ayrı bir
  admin-özel "Maliyet Tablosu" sekmesi (`ProjeTabMaliyetTablosu`/
  `CostBucketTable`) hem menü hem proje içi Finans'ta "Genel" sekmesindeki
  `MaliyetOzetTable`/"Maliyet Kalemi Özeti" ile aynı `costBuckets` verisini
  tekrar gösteriyordu — 30.07.2026'da kullanıcı kararıyla kaldırıldı (dosyalar
  silindi), maliyet dökümü artık tek yerde: Finans > Genel > Maliyet Kalemi
  Özeti.
- Auth: `src/context/AuthContext.jsx` — `get_my_role()`/`get_my_projects()`
  RPC'lerinden ve `roles` tablosundan `role`, `isAdmin`, `isMuhasebe`, `projectId`,
  `roleLabel`, `isManager`, `navigation` (`{tabs, defaultTab, sidebarItems}`)
  sağlar. `isAdmin` KESİNLİKLE `role === 'admin'` olmalı. Kapsam seçici
  (`src/context/ScopeContext.jsx`) yönetici rollerine tek-proje/Tüm Projeler
  geçişi sağlar; header'daki global proje seçici kasıtlı olarak yok — tek
  projeli kullanıcıda kapsam otomatik çözülür. `loading` yalnızca İLK oturum
  çözümlemesinde `true`'ya çekilir (`hasResolvedOnce` ref) — `supabase.auth.
  onAuthStateChange` rutin arka plan token yenilemelerinde de tetiklendiğinden,
  bu guard olmadan HER yenilemede `loading=true` oluyor, `ProtectedRoute.jsx`
  bunu görüp tüm Dashboard ağacını unmount edip "Yükleniyor…" gösteriyordu —
  kullanıcı farkında olmadan `activeTab`/proje detayı/form ilerlemesi gibi tüm
  local state sıfırlanıp varsayılan sekmeye atılıyordu (özellikle uzun süren
  bir formda, ör. proje sihirbazı, arka planda bir yenileme olursa fark
  ediliyordu — 2026-07-30'da bulunan bug). Artık sonraki oturum olaylarında
  profil sessizce arka planda güncelleniyor, `loading` tekrar tetiklenmiyor.
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
  eklenirse `machinery_logs_report_machine_unique` UNIQUE ihlali oluşur.
  `DAILY_REPORT_ERROR_RULES`'da (`toUserMessage`/`translateError`) bu iki durum
  gerçek Postgres constraint adlarıyla (`machinery_logs_report_machine_unique`/
  `machinery_logs_status_check`) ayrı ayrı eşleşir — ortak bir "machine"
  alt-dizesi kullanılmaz, çünkü `some()` ANY-eşleşme yaptığından bare bir
  "machine" deseni unique-ihlalini de yanlışlıkla "makine durumu geçersiz"
  olarak gösterirdi. Rapor sahibi kendi raporunu silebilir.
  "Malzeme Kullanımı" bölümü formda **kasıtlı olarak YOK** (`daily_report_material_usage`
  tablosu kullanımda değil) — **kalıcı karar:** BOM/malzeme kullanımı günlük
  raporun kapsamında değil; geri getirilmesi teklif edilirse önce bu kararı
  hatırlat. "İlerleme Girişi" `project_tasks`'tan (task_id bazlı) beslenir.
  **"Sorunlar" bölümü formdan kaldırıldı (2026-07-29, kullanıcı kararı) — kalıcı
  karar:** artık bir sorun/bloker bildirmek için doğrudan Tickets sekmesinden
  ticket açılır, günlük rapordan sorun girilmez; geri getirilmesi teklif
  edilirse önce bu kararı hatırlat. **Dead code temizliği yapıldı (04.08.2026):**
  `save_daily_report`'un `p_issues` parametresi ve `fn_create_ticket_from_daily_report_issue()`
  INSERT trigger'ı kaldırıldı (`20260804091950_remove_dead_daily_report_issues_write_path`)
  — `DailyReportForm.jsx`'teki `issues` state'i, `issueDescription()`/`ISSUE_META_PREFIX`
  ve RPC çağrısındaki `p_issues` alanı da eşzamanlı temizlendi. `daily_report_issues`
  TABLOSU ve içindeki veri KORUNDU (silinmedi) — yalnızca yazı yolu kaldırıldı,
  tablo artık salt-okunur bir arşiv. Eski raporlardaki geçmiş "Sorunlar" verisi
  `DailyReportDetail.jsx` (salt okunur detay sayfası) ve Excel/PDF export'ta
  hâlâ görüntüleniyor (bu okuma yolu değişmedi), `daily_report_issues.description`
  kolonu `category`/`closed_at`/`notes` alanlarını `__ISSUE_META__{json}` öneki
  ile paketlemeyi sürdürüyor (yalnızca decode ediliyor, artık hiç encode
  edilmiyor).
  `daily_reports.notes` kolonu da aynı desende `isg_notes`/`incident_notes`/
  `description` alanlarını `__REPORT_NOTES_META__{json}` öneki ile paketler
  (`reportNotesPayload()`, `DailyReportForm.jsx`) — `DailyReportList.jsx`'in
  "Not" kolonu ve `DailyReportDetail.jsx`'in "Genel Notlar" bloğu bu öneki
  `decodeStoredMeta()` ile çözüp yalnızca `description` alanını gösterir (ham
  `__REPORT_NOTES_META__{...}` JSON'ı asla ekrana yazılmamalı — PDF/Excel
  export zaten bu deseni kullanır). **Hâlâ açık:** `isg_notes`/`incident_notes`
  alanları hiçbir yerde gösterilmiyor — `DailyReportDetail.jsx` yalnızca
  paketlenmiş `description`'ı "Genel Notlar" olarak gösteriyor, İSG/olay
  notları için ayrı bir UI yok.
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
  Genel/Faturalar/Onay Kuyruğu görür (2026-07-24'te proje yöneticisine açıldı;
  `20260729120000_add_finans_nav_for_proje_yoneticisi` migration'ı `finans`'ı
  `role_allowed_tabs`/`role_sidebar_items`'a da ekledi — component-katmanı
  yetkisi tek başına yeterli değil, DB navigasyon satırı olmadan sidebar'da
  hiç görünmez, bkz. `handleTabChange`'in izin-listesi dışı sekmeleri sessizce
  engellemesi). Diğer roller yalnızca Genel özeti görür.
  Menü seviyesindeki `TabFinans.jsx`'te muhasebe **Faturalar**/**Genel** 2
  alt-sekmesini görür — Faturalar varsayılan/ilk sekme (`Onay Kuyruğu` yok,
  bütçe verisine erişimi zaten yok, bkz. RPC katmanı).
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
  "Bugün Yapılacaklar" (2026-07-29'da yeniden tanımlandı — kullanıcı kararı)
  artık doğrudan faturalanmayı bekleyen satın alma taleplerinin listesi
  (`pendingRequests`, en son onaylanan/güncellenen en üstte); her satırın
  "Fatura Oluştur" aksiyonu `satin-alma` sekmesine götürür (eskiden fatura
  onayı/vadesi geçen/düzeltme bekleyen gibi karışık bir "görev" listesiydi).
  "Yaklaşan Ödemeler" artık top-4 yerine **bu takvim ayı** içinde vadesi olan
  tüm ödemeleri listeler — vadesi geçmiş olanlar da dahil (kullanıcı isteğiyle
  29.07.2026'da genişletildi; overdue satırlar "X gün gecikti" etiketiyle
  gösterilir, negatif gün sayısı ham gösterilmez). "Son Hareketler" üç
  kaynağı (gelen talep/`pendingRequests`, yönetici onayında bekleyen faturalar/
  `approval`, ödeme bekleyen faturalar/`waiting`) tek kronolojik akışta en son
  sıraya göre birleştirir — bir satıra tıklamak artık ilgili kaydı değil,
  doğrudan `bildirimler` sekmesini açar (eskiden `onGoToInvoice`/`finans`'a
  giderdi, artık tıklanan öğe bir "kayıt detayı" değil bir "aktivite girişi").
  KPI kartına tıklamak (takvim hariç) `handleTabChange`
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

**`TalepDetayModal.jsx`'te Onayla/Reddet zincir-durduran bug (31.07.2026'da
Chrome extension ile canlıda test edilirken bulundu, düzeltildi):**
`normalizeStatus()` (`utils/satinAlma.js`) gerçek DB değerlerinden üçünü
(`talep_olusturuldu`/`fiyat_girildi`/`onay_bekliyor`) tek bir görüntü-kovası
olan `'bekliyor'`ya indirger (yalnızca UI etiketlemesi için) — ama
`updateStatus()`'un iyimser-kilit ön-koşulu (`.eq('status', expectedStatus)`)
bu normalize edilmiş `'bekliyor'` değerini DOĞRUDAN DB filtresi olarak
kullanıyordu. `'bekliyor'` DB'de asla yazılmaz (`purchase_requests_status_check`
bunu reddeder) — yani filtre hiçbir zaman eşleşmiyor, "Onayla" ve "Reddet"
her ikisi de `updatedRequest` boş dönüp "Talep artık bu işlem için uygun
değil" hatası veriyordu, tüm yeni taleplerde. `TabSatinAlmaTalepListesi.jsx`'in
liste-satırı onay/red akışı etkilenmedi (orada böyle bir ön-koşul filtresi
hiç yok). Var olan `procurement-role-acceptance.spec.js` testi yalnızca
"Onayla" butonunun GÖRÜNÜR olduğunu doğruluyordu, gerçekten tıklayıp durumun
değiştiğini hiç kontrol etmiyordu — bu yüzden regresyon suite'i bunu
yakalamamıştı. Düzeltme: `expectedStatus = canReview ? req.status : 'onaylandi'`
— normalize edilmiş kovayı değil, o an yüklenmiş olan HAM `req.status`'u
ön-koşul olarak kullanır (canReview zaten normalize edilmiş status
`'bekliyor'` olduğunda true olduğundan, `req.status` garanti o 3 ham değerden
biridir).

`TabSatinAlmaTalepListesi.jsx`'in (Bekleyenler/Satın Alma listesi, hem menü
hem proje modu, hem site şefi görünümü) **İŞLEM DURUMU** kolonu 30.07.2026'da
sadeleştirildi — eskiden `ApprovalStepsHorizontal.jsx` ile 5 adımlı (site
şefinde 3 adımlı) yatay bir onay-süreci göstergesiydi (nokta+9.5px etiket
dizisi, 300-420px genişlik); artık aynı satırdaki UYGUNLUK kolonundaki
`RiskBadge` ile aynı görsel dilde (`ProcessStatusBadge`, dosya-lokal) tek
nokta+kalın-metin rozeti — durum filtresindeki etiketle birebir aynı metin.
Süreç adımları zaten `TalepDetayModal.jsx`'te dikey stepper olarak duruyor,
listede tekrar göstermeye gerek yoktu (kullanıcı isteği). `buildApprovalSteps()`
(`satinAlma.js`) bu değişiklikle dead code kaldığından kaldırıldı.
`TicketListesi.jsx`'in kendi İŞLEM DURUMU kolonu da 30.07.2026'da aynı desene
(dosya-lokal `TicketStatusBadge`) geçirildi — bu ikisiyle `ApprovalStepsHorizontal.jsx`
tamamen dead code kaldığından silindi. Aynı nokta+kalın-metin dili artık
`Badge.jsx`'ten `export function StatusDot({ map, value, prefix })` ile üçüncü
bir yerde daha kullanılıyor: `TabBildirimler.jsx`'in bir bildirimdeki canlı
durumu (`BADGE_MAP` üzerinden) gösterdiği satır, eskiden pill-stil `<Badge>`
kullanıyordu, artık `<StatusDot>` — aynı `map`/`value` girdisini alıp yalnızca
sunumu değiştirir. `TicketListesi.jsx`'in az önce bahsedilen `TICKET_STATUS_META`'sı
`gönderildi`/`açık`'ı **"Gönderildi"** etiketleyip kanonik `utils/ticketStatus.js`'teki
`STATUS_META`'dan (Bildirimler/`TicketDetayModal`/durum filtre dropdown'unun
kullandığı, aynı iki değeri **"Açık"** etiketleyen kaynak) sapmıştı — Bildirimler
bir ticket'ı "Açık" gösterirken liste aynı ticket'ı "Gönderildi" gösteriyordu
(30.07.2026'da bulunup "Açık"a tekilleştirildi; `TicketDetayModal.jsx`'teki
3 adımlı dikey süreç göstergesindeki `{key:'gonderildi', label:'Gönderildi'}`
buna dahil değil — o bir geçmiş-zaman süreç adımı, "mevcut durum" rozeti değil).

**Ticket "Oluşturan"/"Son işlem" alanları (30.07.2026):** `TicketListesi.jsx`/
`TicketDetayModal.jsx`/`SiteChiefTicketDetayModal.jsx` `created_by`/`updated_by`
için başka bir kullanıcının `profiles.full_name`'ini doğrudan client-side
(embed veya ayrı `.from('profiles')` sorgusu) okumaya çalışıyordu —
`profiles_select` RLS'i (bkz. "Roller") admin/proje_yoneticisi/kendi satırı
dışındakileri engellediğinden, santiye_sefi (Tickets'ta tam yetkili) kendi
açmadığı bir ticket'ı görüntülediğinde bu alanlar sessizce boş geliyordu. Yalnızca
`id`+`full_name` döndüren dar kapsamlı `get_profile_names(uuid[])` RPC'si
eklendi (SECURITY DEFINER, email/rol gibi hassas alanları açığa çıkarmıyor —
`profiles_select`'i genel gevşetmeye gerek kalmadı), 3 dosya ortak
`src/utils/profileNames.js` yardımcısına geçirildi. (21 ticket'tan 7'sinde
`created_by` DB'de gerçekten NULL — eski seed verisi, kurtarılamaz, "—"
göstermesi doğru davranış.)

**Talep kodu (`request_no`):** `purchase_requests.request_no` gerçek, UNIQUE,
sunucu tarafında `create_purchase_request_with_items` içinde atomik yıl-bazlı
bir sayaçla (`purchase_request_no_counters` + `fn_next_purchase_request_no()`)
üretilir (`SAT-2026-001`, `SAT-2026-002`...). Öncesinde bu kod DB'de hiç yoktu
— 4 farklı frontend dosyası (`TabSatinAlmaTalepListesi`/`TalepDetayModal`/
`MuhasebeSatinAlma`/`FaturaOlusturModal`) bunu bağımsız olarak talebin UUID'sinin
son 3-4 hex karakterinden türetiyordu (yalnızca ~4096 kombinasyon → farklı
taleplerde aynı kod tekrarlanıyordu, 30.07.2026'da bulunup düzeltildi). Frontend
tarafı artık tek bir `src/utils/purchaseRequestNo.js` yardımcısını kullanıyor
(`request.request_no` her zaman dolu geliyor, eski UUID-türetme yalnızca
teorik bir son-çare fallback). `get_satin_alma_overview`/`get_satin_alma_overview_all_internal`
çıktısına `request_no` eklendi; `get_purchase_requests_list`/`get_purchase_request_detail`
zaten `to_jsonb(pr)` kullandığından otomatik geliyor. Kolonun kendisinde de
(31.07.2026'da eklendi) `fn_next_purchase_request_no(...)` çağıran bir DEFAULT
var — RPC zaten `request_no`'yu insert listesinde açıkça verdiğinden bu DEFAULT
gerçek akışta hiç tetiklenmez, yalnızca RPC dışında (ör. test/araç) doğrudan
bir insert olursa NOT NULL hatası yerine doğru sıradaki kodu üretsin diye
savunma amaçlı eklendi (`fn_next_purchase_request_no`'ya `authenticated` EXECUTE
yetkisi de bu nedenle eklendi — DEFAULT ifadesi çağıran rolün bağlamında
değerlendirilir, fonksiyon SECURITY DEFINER olması bunu atlamaz).

**Tek kalem kuralı:** bir satın alma talebi yalnızca tek bir kalem içerebilir
— `create_purchase_request_with_items` RPC'sinde ve tablo trigger'ında
(eşzamanlı ikinci kalem eklemeye karşı da) zorunlu kılınır.

**Yeni Talep formu — "Bu ayın planından seç" kaldırıldı, kategori-önce
malzeme filtresi eklendi (18.08.2026):** `YeniTalepModal.jsx`'teki aylık
plandan kalem seçme bölümü (`procurement_monthly_plan` sorgusu + ilgili
state/handler'lar) tamamen kaldırıldı — kullanıcı isteğiyle. Yerine, Tip
alanının hemen altında (Malzeme seçilmeden ÖNCE) bir **Kategori** dropdown'u
eklendi (`MALZEME_KATEGORI_OPTS`, `ProjeTabFaturaKesilecekler.jsx`'ten
import — BOM'un "Yeni Malzeme Ekle" formuyla aynı sabit liste: Mobilizasyon/
Hizmet/İş makineleri/Güvenlik/Elektrik/Mekanik/Hırdavat/Diğer). Bu, malzeme
seçildikten SONRA bilgi amaçlı gösterilen bir alan değil — tersine, kategori
seçilince Malzeme dropdown'undaki liste o kategoriye göre daralıyor
(`filteredMaterialOptions`, `procurement_items.category` client-side filtre);
kategori boş ("Tüm Kategoriler") bırakılırsa liste filtresiz kalır. Kategori
değişince önceki malzeme seçimi sıfırlanır (artık listede olmayabilir).
Listeden bir malzeme seçilirse (filtre boşken) kategori kalemin kendi
`procurement_items.category`'sinden otomatik türer; "Diğer (Listede Yok)" ile
serbest metin girilirse zaten seçilmiş olan kategori korunur. Bu değer
`purchase_request_items.category` (yeni kolon,
`20260818100000_add_category_to_purchase_request_items` migration'ı) kolonuna
`create_purchase_request_with_items`'ın `p_items[0].material_category` alanı
üzerinden yazılır — RPC imzası değişmedi, uçtan uca DB'de doğrulandı.
**Not:** bazı eski BOM kayıtlarında `category` NULL (10 kayıt, test-izmir-ges-2026
projesinde) — o projede bir kategori filtrelenince liste boş çıkabilir, bu
veri eksikliği, UI bug'ı değil. `get_purchase_request_detail` (`to_jsonb(pri)`)
bu alanı otomatik döndürür; `get_satin_alma_overview*` kalemleri elle
`jsonb_build_object` ile kurduğundan bu alanı henüz döndürmüyor — bugüne kadar
hiçbir ekran bunu göstermiyor, yalnızca kayıt altına alınıyor.

**Proje yöneticisi tedarik adımı:** `onaylandi` ile fatura arasında zorunlu
bir adım var — akış `ProjeTabSatinAlma.jsx` → `TabSatinAlmaTalepListesi.jsx`
(`fixedStatus="onaylandi"`, "Bekleyen" sekmesi) üzerinden yürüyor,
`canCompleteProcurement = role==='proje_yoneticisi'` (bu adım önceden ayrı bir
`TedarikKuyrugu.jsx` bileşenindeydi, `02c8af4` commit'iyle 23.07.2026'da
kaldırıldı). `proje_yoneticisi`
(`cross_project=true`, tüm projelere erişir) `onaylandi` durumundaki talepler
için **"Tamamlandı"** butonuyla `complete_project_manager_purchase_request`
RPC'sini çağırır — `purchase_date` otomatik (bugün), `supplier_id` ise
2026-07-31'den beri tıklanınca açılan opsiyonel bir tedarikçi seçiciyle
(`completeDraft` state, `rejectDraft`'la aynı satır-içi desen; boş geçilebilir).
"İptal Et" tıklanınca satır
içi bir gerekçe alanı açılır (`rejectDraft` state, `OnayReddetActions.jsx`'in
"compact" moduyla aynı desen) — **gerekçe girilmeden "İptali Onayla" butonu
disabled kalır** (`TalepDetayModal.jsx`'teki eşdeğer "Reddet" butonu da aynı
kuralı uygular). Gerekçe `purchase_requests.notes`'a
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
  doğrudan `onaylandı` (bu dalda `paid_amount = total_amount` da yazılır —
  31.07.2026'da eklendi, bkz. aşağıdaki not) ; reddet → `reddedildi` (**nihai**,
  kurtarma yok); düzeltme iste → `duzeltme_bekliyor`.
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
  adımı tekrar yapılmaz — `sync_purchase_request_from_invoice` talebi doğru
  şekilde `satin_alindi`'ye çeker, `fatura_onay_bekliyor`'da bırakmaz
  (`20260729130000_fix_purchase_request_revert_on_invoice_rejection` migration'ı,
  faturasız ödemenin eşi `sync_purchase_request_from_financial_transaction`
  referans alınarak yazıldı). `reddedildi` **nihai** bir durum — ne admin ne muhasebe onu geri açabilir
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
Kısmen Ödendi/Ödendi/Reddedildi — `invoices_status_check`'teki 8 durumun tamamı
birer sekme; `Kısmen Ödendi`/`Reddedildi` öncesinde sekme yoktu, yalnızca Durum
dropdown'undan seçilebiliyordu, bu yüzden "Tümü" sekmesindeki toplam diğer
sekmelerin toplamına eşit değildi — 30.07.2026'da bulunup düzeltildi, artık
`hepsi` = sekmelerin toplamı garantili).
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
tablo satırı — Reddet tıklanınca satır içi küçük bir not alanı açılır; Düzeltme
İste ise 30.07.2026'dan beri satır içi değil ayrı bir box/modal
(`DuzeltmeIsteModal`, dosya-lokal) açar — kullanıcı isteğiyle, "sadece bir input
açılması" yerine gerçek bir diyalog) ve `full` (`FaturaDetayModal.jsx` — referans
mockup'a birebir: tek paylaşımlı "İşlem Notları" kutusu her zaman görünür, üç
buton da her zaman görünür, Düzeltme İste/Reddet not doluymadan disabled).
**Düzeltme İste → muhasebeye bildirim (30.07.2026):** `fn_invoice_approval_cascade`
öncesinde yalnızca `invoices.status`'u `duzeltme_bekliyor`'a çekiyordu, muhasebeye
hiç bildirim gitmiyordu (yönetici onayladığında/reddettiğinde de hâlâ gitmiyor —
yalnızca bu üçünün en "aksiyon gerektiren" hali için eklendi) — artık
`notify_role('muhasebe', ...)` çağrısı da bu dalda çalışıyor, bildirim notu
`invoice_approvals.note`'tan gelir. Fatura oluşturan kişinin adı
(`invoice.creator.full_name`) `get_invoices_list`'e eklenen additive join'den
gelir — `profiles_select` RLS'i (`admin OR auth.uid()=id`) client-side bir
sorguyla başka birinin adını okumayı engellediğinden, bildirimlerden deep-link
ile açılan (RPC'siz) yol dışında bu join zorunlu.

**Talep tipleri:** `malzeme` / `hizmet` / `diger` (üçü de tam sınıflandırma/risk
mantığına sahip — `diger` risk durumu `listede_yok`, BOM eşleşmesi aranmaz).
BOM aşım (Malzeme Miktar Kontrol) uyarı kutusu yalnızca `type === 'Malzeme'`de
gösterilir.

**Talep aşamasında tutar ₺0 — kasıtlı, bug değil (31.07.2026'da QA'da soruldu,
teyit edildi):** `YeniTalepModal.jsx`'te birim fiyat alanı YOK —
`create_purchase_request_with_items`'a `unit_price` hiç gönderilmiyor,
`purchase_request_items.unit_price`/`total_price` talep oluşturulduğunda
`0`/`null` kalır. Fiyat/tutar bilgisi yalnızca fatura kesme aşamasında
(`FaturaOlusturModal.jsx`) gerçek olarak giriliyor — bu yüzden `MuhasebeSatinAlma.jsx`'in
"Onaylanan Tutar" kolonu, henüz faturalanmamış bir talepte ₺0 gösterir; bu bir
hesaplama/veri kaybı hatası değil, tasarım gereği (tahmini tutar yakalama
istenirse talep formuna opsiyonel bir alan eklemek ayrı bir özellik işi).

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

**`procurement_items`'taki eski sipariş-takip kolonları kaldırıldı (04.08.2026).**
`status`/`priority`/`order_date`/`expected_delivery`/`actual_delivery`/
`supplier`/`notes`/`updated_by`/`received_by`/`received_date` satın alma
talebi akışından ÖNCEKİ bir sipariş-takip tasarımından kalmaydı (`update_procurement_status`
zaten dead code olarak kaldırılmıştı) — `20260804091411_drop_unused_procurement_order_tracking_columns`
ile `DROP COLUMN` edildi. Malzeme Listesi artık yalnızca `planned_qty` ile
takip ediliyor. **Bağımlılık taraması eksikti — canlıda gerçek bir kesinti
yarattı, aynı gün düzeltildi:** `get_satin_alma_overview`/
`get_satin_alma_overview_all_internal` fonksiyonları `procurement_items`
çıktısında hâlâ `'status', pi.status` alanı döndürüyordu; bu iki fonksiyon
DROP COLUMN öncesi taramada gözden kaçmıştı (regex/`ilike` taraması yalnızca
`pg_proc.prosrc`'te değil `pg_get_functiondef` çıktısında da arama
gerektiriyordu — ikisi arasında fark olmamalıydı ama ilk tur bu iki
fonksiyonu yakalamamıştı). Sonuç: proje_yoneticisi rolünde Satın Alma sayfası
"Veri yüklenemedi" ile tamamen kırıldı (`get_satin_alma_overview_all` 400,
Postgres log'unda `column pi.status does not exist`). `20260804094500_fix_satin_alma_overview_dropped_status_column`
ile her iki fonksiyondan da `'status', pi.status,` satırı kaldırılarak
düzeltildi (frontend — `ProjeTabMalzemeListesi`/`ProjeTabFaturaKesilecekler`/
`ProjeTabSatinAlma`/`TabSatinAlma` — bu alanı hiç okumuyordu, grep ile
doğrulandı). **Ders:** bir kolonu DROP etmeden önceki bağımlılık taraması
yalnızca `prosrc ilike` değil, gerçek çalıştırılabilir bir smoke-test
(`select fn(...)` çağrısı) ile de doğrulanmalı — statik metin taraması
`SELECT jsonb_agg(jsonb_build_object(...))` gibi çok satırlı/iç içe
ifadelerde alan adını atlayabiliyor. Bu alanlara dayanan yeni bir özellik
istenirse önce bu notu hatırlat.

### Ticket oluşturma — genel vs proje bazlı
`tickets.project_id` nullable — `NULL` "genel" (projeye bağlı olmayan) ticket
demek. Tek-proje rolleri için `YeniTicketModal.jsx`'teki "Ticket Cinsi"
dropdown'ında "Genel" seçeneği `project_id`'yi NULL'a düşürür (CLAUDE.md'de
önceden bir checkbox olarak geçiyordu, gerçek UI bu dropdown — düzeltildi).
RLS (`tickets_insert`): `created_by = auth.uid() AND has_project_access(project_id)`
(`has_project_access(NULL)` her zaman true, genel ticket'lar etkilenmez).

`TicketListesi.jsx`'in santiye_sefi filtresi `.or('project_id.eq.<id>,project_id.is.null')`
kullanır — düz `.eq(authProjectId)`'ye "sadeleştirilirse" `project_id IS NULL`
satırları (santiye şefinin kendi açtığı genel ticket'lar) Postgres'te asla
eşleşmez, sessizce listeden düşer. RLS (`tickets_select`) zaten yalnızca
`created_by=auth.uid()` OLAN genel ticket'ları döndürüyor (başka bir
kullanıcının genel ticket'ı `NULL` karşılaştırmasında eşleşmediği için
görünmez) — yani `.or()` kapsamı genişletmiyor, yalnızca kullanıcının zaten
görmeye yetkili olduğu kendi genel ticket'larını görünür kılıyor.

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
`TabGenel`'in "Tarih Seç" bileşeni (`ProjectListView`) altındaki Projeler
tablosu iki katmanlı filtrelenir: (1) satır gizleme — `project.created_at <=
seçilenTarih` (bu proje o tarihte var mıydı), (2) **İlerleme** kolonu — seçilen
tarihteki gerçek ilerleme, `ProjeDetay`'ın kendi tarih-farkında kaynağı
(`get_project_by_date(p_project_id, p_date).overall_pct`) her görünür proje
için ayrı ayrı çağrılarak elde edilir. Öncesinde yalnızca (1) vardı ve İlerleme
her zaman GÜNCEL/canlı `projects.progress` değerini gösteriyordu — test
projeleri haftalar önce oluşturulduğundan (1) neredeyse hiç görünür etki
yaratmıyordu, bu yüzden "tarih filtresi bir şey yapmıyor" izlenimi veriyordu
(30.07.2026'da bulunup düzeltildi).
`ProjeDetay.jsx`'in iç sekmelerinde proje_yoneticisi Finans'ta Faturalar/Onay
Kuyruğu'nu görüp fatura onaylayabilir (bkz. "Satın alma akışı" → Fatura onay
akışı), Tickets santiye_sefi ile aynı tam yetkide. Kullanıcı oluşturma açık ama Düzenle/Şifre/Sil (`TabKullanicilar.jsx`)
hâlâ `isAdmin`-only. `TabKullanicilar.jsx` `profiles` tablosunu doğrudan
client-side sorguluyor — `profiles_select` RLS'i öncesinde yalnızca
`admin OR auth.uid()=id`'ye izinliydi, bu yüzden proje_yoneticisi olarak giriş
yapan biri sayfada yalnızca KENDİ satırını görüyordu (veri modelinde kopukluk
yoktu, salt görünürlük izni eksikti — 30.07.2026'da bulunup düzeltildi).
`profiles_select` artık `get_my_role() IN ('admin','proje_yoneticisi') OR
auth.uid()=id`; INSERT/UPDATE hâlâ admin-only. **Proje yönetimi tarafı farklı:** proje şablonuyla proje
ekleme YANINDA mevcut bir projeyi Düzenle/Excel export/Sil de admin ile eşit
(`TabProjeYonetimi.jsx`'teki `canCreateProject = isAdmin || role==='proje_yoneticisi'`
üçünü de kapsar) — bu RLS düzeyinde de açık (`20260723140000_allow_proje_yoneticisi_edit_project_wizard_tables`/
`20260723140100_allow_proje_yoneticisi_delete_project_cascade`), kademeli
proje silme `invoices`/`purchase_requests`/`agent_reports`/`procurement_item_*`
tablolarındaki proje yöneticisi DELETE policy'leriyle birlikte çalışır.

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
tek veri kaynağı) `supplier_id`/`supplier_name`/`estimated_amount_incl_vat`/
`requester_name`/`description` (`request_note`) + kalemlerde `unit_price`/
`total_price` döndürür — Tedarikçi filtre dropdown'ı ve Onaylanan Tutar bu
alanlara bağlı. `get_satin_alma_overview_all()` wrapper'ının muhasebe için
daralttığı status listesi `fatura_onay_bekliyor`'u da kapsar: fatura
oluşturulur oluşturulmaz talep listeden düşmez, **"Onayda"** rozetiyle (mor,
`purchase-status.onayda`) listede kalır, "İşlem" kolonunda "Görüntüle" çıkar
(yeni bir fatura açmanın anlamı yok, zaten biri onay bekliyor). Bu durumu ayrı
ele alan iki yer daha var: `TalepDetayModal.jsx`'in "Onay Süreci" adımlarında
son adım ("Fatura Kesildi" değil, fatura zaten oluşturulduğu için) aktif
gösterilir; `MuhasebeGenelOzet.jsx`'teki "Faturalanacak Talepler" KPI'ı ve
"Bugün Yapılacaklar" listesi bu durumdaki talepleri saymaz/karıştırmaz.
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
`purchase_requests_select` RLS'i (ham `.from('purchase_requests')` sorguları
için) muhasebeyi de aynı iki duruma sınırlıyordu — ama bir fatura oluşturulduğu
ANDA (`sync_purchase_request_from_invoice`, INSERT dalı) talebin durumu
otomatik `fatura_onay_bekliyor`'a atlar, bu değer o kümede yoktu; muhasebe
kendi oluşturduğu faturanın bağlı olduğu talebi bir dakika sonra bile
göremiyordu (`FaturaDetayModal.jsx`'in "Bağlı Talep" kartı hep "—" gösteriyordu
— veri doğruydu, `invoices.purchase_request_id` her zaman doluydu, sorun
yalnızca RLS'teydi). 31.07.2026'da `fatura_onay_bekliyor`/`faturasi_kesildi` de
eklendi (`20260731180000`) — talep hâlâ `talep_olusturuldu`/`fiyat_girildi`/
`onay_bekliyor`/`onaylandi` aşamasındaysa muhasebe izolasyonu değişmedi.

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
katmanlar, ikisi de buna delege eder. `get_profile_names(p_ids uuid[])` —
yalnızca `id`+`full_name` döndüren dar bir SECURITY DEFINER yardımcı
(`authenticated`'a EXECUTE açık) — `profiles_select` RLS'i başka bir
kullanıcının adını client-side okumayı engellediği durumlarda (bkz. "Ticket
sistemi" → Oluşturan/Son işlem notu) kullanılır; email/rol gibi hassas alanları
açığa çıkarmadığından `profiles_select`'i genel gevşetmeye tercih edilir.

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
Eski), tip ikonları, satın alma/ticket/fatura bildirimlerinde canlı durum
rozeti (`liveStatus`, `BADGE_MAP`/`Badge.jsx`) — bu rozet 30.07.2026'da
pill-stil `<Badge>`'ten nokta+kalın-metin `<StatusDot>`'a geçirildi (bkz.
"Satın alma akışı" altındaki not), aynı `BADGE_MAP`/`map`/`value` girdisini
kullanır. Yönetici rolleri
(`isManager`) fatura bildirimlerinde ek olarak "Adım X/2: ..." özeti görür.
Bir bildirime tıklamak
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
olarak sade kalıyor, tam yönetim tam sayfada). Zilin okunmamış rozeti (`unread`)
öncesinde yalnızca son `.limit(30)` kaydı üzerinden hesaplanıyordu — toplam
bildirim 30'u aşınca (yoğun bir hesapta kolayca olur) rozet, `TabBildirimler.jsx`'in
kendi (aynı `dedupeNotifications` ile ama `limit(200)` kullanan) sayımından
düşük çıkıyordu (31.07.2026'da bulunup düzeltildi — bell de artık `limit(200)`
üzerinden aynı dedup'ı uyguluyor, açılır listede yalnızca ilk 30'u gösteriyor).
Ayrıca not: Playwright regresyon suite'i her koşulduğunda admin/proje
yöneticisine gerçek `notify_*` bildirimleri gider (test verisi ama gerçek
trigger yolu) — testler kendi `purchase_requests`/`invoices` satırlarını
`afterAll`'da temizler ama `notifications` satırlarını temizlemez, bu yüzden
zamanla yüzlerce "ölü" (bağlı olduğu kayıt artık yok) bildirim birikir; bulunduğunda
(31.07.2026'da 776 satır) toplu silindi — düzenli test koşumu yapan bir CI/oturum
bunu periyodik olarak tekrar temizlemeyi düşünmeli, otomatik bir mekanizma yok.

**Rol-farkında click-through (30.07.2026).** Bir bildirimin `entity_type`'ı
her zaman alıcının rolünün erişebildiği bir sekmeye karşılık gelmiyor —
`notify_*` çağrıları alıcı rolü seçerken hedef sekmenin o rolün
`role_allowed_tabs`'ında olup olmadığını kontrol etmiyor (DB katmanı bunu
bilmiyor). Bu yüzden click-through fonksiyonları (`index.jsx`'teki
`goToInvoice()`/`goToReport()`) kendi içlerinde `navigation.tabs`'a bakıp
gerekirse alıcının erişebildiği bir sekmeye/kayda düşüyor (`goToInvoice`:
`finans` yoksa RPC'yle bağlı satın alma talebine; `goToReport`: proje bilgisi
varsa ilgili projenin Raporlar sekmesine, yoksa eski düzenleme modaline).
Yeni bir bildirim türü eklenirken bu kontrol atlanırsa bildirim "ölü" (okunur
ama tıklanınca hiçbir yere gitmeyen) kalır — `handleTabChange` izin
listesinde olmayan bir sekmeye sessizce no-op döner, hata fırlatmaz, bu
yüzden fark edilmesi zordur.

### Muhasebe & Finans modülü
Menü seviyesindeki `TabFinans.jsx` altında (proje-içi `ProjeTabFinans.jsx`'ten
ayrı, tüm-projeler görünümü) muhasebe rolü için 2 alt-sekme: **Faturalar**
(varsayılan/ilk sekme — 2026-07-28'e kadar Genel ilkti, kullanıcı isteğiyle
sıra değişti, `TABS`/`useState` başlangıcı `isMuhasebe` dallanıyor), Genel
(admin/proje_yöneticisi Genel/Faturalar/Ödeme Takibi/Onay Kuyruğu görür —
bkz. "Roller"). Muhasebenin **Genel**
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
  ödeme girişi `FinansalIslemOdemeModal.jsx` üzerinden yapılır. Liste satırındaki
  "Tedarikçi No" (gerçek `tax_no` alanından AYRI, salt görsel bir kısa referans
  — `String(id).slice(...)`) `id`'nin İLK 8 karakterini kullanıyordu; 4 demo
  tedarikçinin UUID'si kasıtlı olarak `aaaaaaaa-0000-...-000{1,2,3,4}` deseniyle
  oluşturulduğundan hepsinin "Tedarikçi No"su aynı ("AAAAAAAA") görünüyordu —
  gerçek `tax_no` kolonu DB'de her zaman doğruydu, sorun yalnızca bu kozmetik
  etiketti. UUID'nin SONUNDAN 8 karakter almaya çevrildi (31.07.2026).
- **Detay** (`FinansRaporlari.jsx`, üst-seviye sekme değil — "Genel"
  sekmesinin kendi içindeki ikinci alt-sekme, bkz. yukarısı) — proje/tedarikçi/dönem
  bazlı filtrelenebilir rapor + Excel/PDF export. **"Hedef Maliyet" karşılaştırması kasıtlı olarak
  YOK**: `budget_lines` RLS'i (`budget_lines_select`) yalnızca `admin`/
  `proje_yoneticisi`'ne izinli, muhasebe için bu sorgu sessizce boş dönüyordu
  (2026-07-26 öncesi haliyle "Hedef Maliyet" sütunu muhasebede hep ₺0
  gösteriyordu — hem bozuk hem muhasebenin izolasyon prensibine aykırıydı).
  Yönetici hedef/gerçekleşen karşılaştırmasını zaten kendi Finans > Genel
  sekmesindeki Maliyet Kalemi Özeti tablosundan (`get_finans_overview(_all)`
  → `cost_allocations`, kanonik kaynak) görüyor. Bu rapor bunun yerine
  muhasebenin zaten yetkili olduğu
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
  Bu talep seçici 2026-07-29'da arama kutulu bir combobox'a çevrildi (düz
  `<select>` yerine) — talep sayısı arttıkça düz dropdown'da bulmak zorlaştığı
  için kullanıcı isteğiyle; başlık+proje adına göre client-side filtreler,
  seçim yapılınca input alanı salt-okunur şekilde seçilen talebi gösterir
  (kendi bileşen-lokal state'i, paylaşılan bir combobox bileşeni yok).
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
  **"Peşin kapanır" vaadi 31.07.2026'ya kadar gerçekte tutmuyordu** —
  `fn_invoice_approval_cascade`'in `requires_payment_tracking=false` dalı
  `invoices.status`'u `onaylandı`'ya çekiyordu ama `paid_amount`'a hiç
  dokunmuyordu; `remaining_amount` sonsuza kadar tam tutarda kalıp
  `v_invoice_payment_overview`/Tedarikçi bakiyesinde kalıcı "açık borç" gibi
  görünüyordu, hiçbir ödeme ekranında da (bilerek, `odeme_bekliyor`/
  `kismen_odendi`/`ödendi` dışında olduğu için) hiç çıkmıyordu — fatura fiilen
  ödeme takibi sisteminden askıda kalıyordu. Düzeltildi: bu dalda
  `paid_amount = total_amount` da yazılıyor, `trg_sync_invoice_remaining_amount`
  bunu `remaining_amount=0`'a indiriyor (`20260731180000`). Bu inceleme sırasında
  ayrı, daha eski bir veri bug'ı da bulundu: `requires_payment_tracking=true`
  olduğu halde `onaylandı`'da askıda kalmış 3 fatura (INV-2026-016/
  INV-KAY-2026-006/INV-KAY-2026-010, toplam ₺975.600, `2026-07-24`teki
  `odeme_bekliyor` ayrımından önceki seed veri — bugünkü cascade mantığıyla bu
  kombinasyon asla üretilemez) `odeme_bekliyor`'a taşındı (`20260731190000`).
  `OdemeTakibi.jsx` artık `onaylandı` durumundaki faturaları da çekiyor ve
  dosya-lokal `normalizeStatus`'ta `onaylandı → odendi`ye eşliyor — peşin
  fatura "Ödendi" sekmesinde (Ödeme Ekle'siz, sadece Görüntüle ile) görünür;
  bu eşleme yalnızca yukarıdaki 3 faturanın düzeltilmesinden SONRA güvenli
  (aksi halde gerçekte ödenmemiş faturaları da "Ödendi" gösterirdi).
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
  trigger sayesinde `get_finans_overview(_all)`/Maliyet Kalemi Özeti faturasız
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
  üzerinde `WHERE status <> 'reddedildi'` kısmi UNIQUE index'i (`invoices_active_purchase_request_id_unique`)
  bir talebin tek aktif faturası olmasını garanti eder — **2026-07-21'deki
  `harden_purchase_invoice_singleton_and_stage_guard` migration'ı bunu yanlışlıkla
  koşulsuz bir index'e (`invoices_purchase_request_id_unique`) çevirmişti**, bu da
  reddedilen HER faturanın bağlı talebi kalıcı olarak faturalanamaz hale
  getiriyordu (talep otomatik `satin_alindi`'ye dönüyor ama ikinci fatura denemesi
  "duplicate key" ile başarısız oluyordu) — 2026-07-31'de gerçek RPC zinciriyle
  uçtan uca test edilirken bulunup düzeltildi
  (`20260731082255_restore_partial_active_invoice_per_purchase_request_unique_index`).
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

**Özet istatistik ile detay ekranı arasında iki farklı tanımı birleştirme
hatası (30.07.2026'da bulunup düzeltildi):** `get_dashboard_summary.critical_tickets`
`severity IN ('kritik','yüksek')` sayıyordu — Tickets listesinde bu ikisi ayrı,
ayrı renkte iki seviye olduğundan Genel Bakış'taki "Kritik Ticket" sayısı
gerçek kritik sayısından fazla çıkıyordu; artık yalnızca `severity='kritik'`.
Aynı şekilde `get_finans_overview_internal`/`get_finans_overview_all_internal`'daki
`quickFacts.pendingCount/pendingAmount` ("Onay Bekleyen Fatura" kartı, Finans →
Genel) `status IN ('yönetici_onayında','duzeltme_bekliyor')` kullanıyordu — Onay
Kuyruğu (`get_invoice_approval_queue`) ve Faturalar listesinin "Onay Bekleyen"
sekmesi (`get_invoices_list.stats.onayBekleyen`) yalnızca `yönetici_onayında`'yı
saydığından üçü uyuşmuyordu. Aynı RPC'lerde zaten dar/doğru bir hesaplama vardı
(`v_ai_yonetici_count/amount`, yan paneldeki `actionItems.yoneticiOnayi`'nde
kullanılıyordu) — yalnızca `quickFacts` bunu kullanmıyordu, şimdi kullanıyor.
`kpi.pendingCount/pendingAmount` (bütçe `availableBudget` hesabında ve kenar
çubuğunun "taahhüt edilmiş tutar" grafiğinde kullanılıyor — orada geniş tanım
doğru) kasıtlı olarak DEĞİŞTİRİLMEDİ. Genel ders: bir özet ekranı ile onun
"detayına git" hedefindeki ekran aynı durum kümesini SAYIYORMUŞ gibi görünüp
farklı durum listeleri kullanabiliyor — yeni bir özet kartı eklenirken hedef
ekranın gerçek filtresiyle birebir karşılaştırılmalı. **Üçüncü bir yer daha
vardı** (31.07.2026'da ikinci bir QA turunda bulundu): `get_dashboard_summary.pending_invoices`
(TabGenel.jsx'in "Bekleyen Onaylar" kartındaki "Fatura" satırı) da aynı geniş
tanımı (`yönetici_onayında`+`duzeltme_bekliyor`) kullanıyordu — üç yer üç farklı
sayı (10/9/7) gösteriyordu; bu da `yönetici_onayında`'ya daraltıldı, artık üçü
de aynı sayıyı gösteriyor.

**"Kritik Risk" yanlış etiketleme (31.07.2026'da bulunup düzeltildi):**
`TabGenel.jsx`'in "Proje Özeti" KPI kartındaki "Kritik Risk" alt-satırı
`project_risks`'ten değil `critical_tickets`'tan (ticket şiddeti) besleniyordu
— "proje" birimiyle birlikte gösterilen bu sayı aslında bir TICKET sayısıydı,
gerçek risk sayısıyla hiç ilgisi yoktu (Riskler alt-sekmesindeki/Genel Proje'deki
gerçek risk kartıyla karşılaştırıldığında role/ekrana göre "tutarsız" görünmesinin
sebebi buydu). `get_dashboard_summary`'ye gerçek `critical_risks` alanı eklendi
(`project_risks` üzerinden `severity='kritik' AND status='açık'`, aynı proje
kapsamıyla), KPI kartı buna geçirildi; `criticalTickets` KPI-2'deki doğru
etiketli "Kritik Ticket" satırında (yalnızca proje_yoneticisi'nde görünür)
olduğu gibi kalıyor.

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
kullanmalı. `FaturaListesi.jsx`/`FaturaDetayModal.jsx`/`recentActivity`
(`formatRecentActivity`) artık `inv.currency`'ye göre ₺/$/€ gösteriyor —
hardcoded TRY `Intl.NumberFormat` gördüğün yerde bu bir regresyon sinyali.
`MuhasebeGenelOzet.jsx`'e (Genel Bakış, muhasebe) daha önce yalnızca
admin/proje_yöneticisi'nin `TabFinans.jsx`'te gördüğü `KurCard`
(`ProjeTabFinansYanPanel.jsx`) eklendi — muhasebe artık kendi Genel Bakışında
da güncel USD/EUR kurunu görüyor.

**Ödeme anında kur yakalama (18.08.2026) — `paid_amount`/`remaining_amount`
artık TRY'ye çevriliyor.** Önceki kısıtlama ("ödeme takibi kapsam dışı,
`paid_amount`/`remaining_amount` faturanın kendi para biriminde kalır") tam
kapatıldı. `invoice_payments.exchange_rate` (ödeme günündeki TCMB kuru,
`OdemeEkleModal.jsx`/`TedarikciOdemeModal.jsx`'te `fetchDoviz()` ile otomatik
çekilir, TRY'de her zaman 1) + generated `amount_try` kolonları eklendi
(`invoice_payment_try_conversion` migration'ı); `invoices.paid_amount_try`/
`remaining_amount_try` (düz, `paid_amount`/`remaining_amount` ile aynı
desende `fn_invoice_payment_recalc()` tarafından bakımı yapılan kolonlar)
eklendi, `v_invoice_payment_overview` bu ikisini de döndürüyor.
`TedarikciListesi.jsx`/`TedarikciDetayModal.jsx`/`FinansRaporlari.jsx`'teki
"Ödenen"/"Kalan" KPI toplamları artık `paid_amount_try`/`remaining_amount_try`
kullanıyor (açık kayıt satırlarının KENDİSİ hâlâ kendi para biriminde
gösterilir — yalnızca üstteki toplamlar TRY'ye çevrilir). **Bilinçli tasarım
kararı:** kur kaynağı ödeme GÜNÜNÜN kuru (fatura oluşturma anındaki sabit
`exchange_rate` değil) — gerçek nakit çıkışını yansıtır, ama bu yüzden
`total_amount_try` (fatura anı kuru) ile `paid_amount_try` (ödeme anı kuru)
farklı günlerin kurlarını karıştırabilir; bu, gerçekçi bir muhasebe
sadeleştirmesi (realized/unrealized kur farkı ayrı izlenmiyor), regresyon değil.

**Aynı turda kapatılan ek bir risk — ödeme para birimi artık faturayla
kilitli.** `OdemeEkleModal.jsx`'te önceden ödeme için faturanın para
biriminden BAĞIMSIZ bir "Para Birimi" dropdown'u vardı; ne frontend
(`amount > remaining` ham karşılaştırma) ne de DB trigger'ı
(`fn_invoice_payment_before_insert`/`fn_invoice_payment_recalc`, ikisi de
`sum(amount)`/tutar karşılaştırmasını para birimi kontrolü yapmadan ham
sayıyla yapıyordu) bunun fatura currency'siyle eşleştiğini doğruluyordu —
biri yanlışlıkla farklı bir birim seçip ödeme girerse `paid_amount`/
`remaining_amount`/durum sessizce bozulabilirdi (canlıda gerçekleşmiş bir
mismatch YOKTU, kontrol edildi — yalnızca açık bir risk). Düzeltme: seçici
kaldırıldı, ödeme her zaman faturanın kendi para biriminde (salt-okunur alan)
girilir; `fn_invoice_payment_before_insert`'e ayrıca DB katmanında da
`NEW.currency <> invoices.currency` reddeden bir savunma eklendi (defense-in-depth).
Aynı sınıftan İKİNCİ bir örnek `TedarikciOdemeModal.jsx`'te (tedarikçiye toplu
ödeme dağıtım sihirbazı) de bulundu — tek bir "Para Birimi" seçilip birden
fazla faturaya dağıtılabiliyordu; orada da seçici kaldırılıp para birimi
seçilen tedarikçinin açık faturalarından otomatik türetiliyor, farklı para
biriminden faturalar o dağıtımdan otomatik hariç tutulup kullanıcıya
bilgilendirme notu gösteriliyor (bir tedarikçinin TÜM açık faturaları aynı
para biriminde olduğu sürece bu ayrım kullanıcıya hiç görünmez — bugüne kadar
canlıda hep böyleydi, yalnızca 1 adet USD faturası var ve o hiç "açık" duruma
geçmemişti).

**Bilinçli olarak hâlâ kapsam dışı:** satın alma talebi
(`purchase_requests.currency`) ve faturasız ödeme (`financial_transactions.currency`)
formlarına para birimi seçici eklenmedi (kullanıcı kararıyla yalnızca fatura
oluşturma/ödeme akışı kapsamına alındı, `financial_transactions.currency`
pratikte hep TRY).

### İlerleme hesaplama modeli
İlerleme tek kaynaktan, `project_tasks` üzerinden yürüyor: `target_qty`, `unit`,
`total_progress`, `progress_pct`. Proje sihirbazının İş Kalemleri adımında
(`Adim2IsKalemleri.jsx`) her görev için **Takip Türü: Durum | İlerleme** seçilir
(03.08.2026'da eklendi, önceki "% İlerleme" + "Durum" + ayrı "Ölçülebilir
İlerleme Hedefi" bölümünün sadeleştirilmiş hali) — **Durum** seçilirse yalnızca
durum dropdown'u (beklemede/devam ediyor/tamamlandı/askıda/iptal) gösterilir,
`target_qty=0` kalır (bkz. `set_task_milestone_status` RPC, "İş akışı" ilerideki
not); **İlerleme** seçilirse Birim + Hedef Miktar + Ne Kadar Yapıldı girilir,
durum/yüzde bunlardan türetilir (kullanıcı elle durum seçmez). `target_qty > 0`
olan görevler `TabIsPlan.jsx`'te "+ İlerleme Gir" ile miktar bazlı, olmayanlar
"Durum Güncelle" dropdown'uyla (`MilestoneStatusControl`) takip edilir —
`deriveTaskStatusAt()` bu ayrımı `target_qty`'ye göre yapar, milestone
görevlerin durumuna tarih/yüzde tahminiyle hiç dokunmaz (03.08.2026'da bulunan
bug: öncesinde bu fonksiyon milestone görevlerde de durumu ezip kullanıcının
seçtiği durumu tabloya hiç yansıtmıyordu). Günlük raporda girilen miktar
`progress_daily` (task_id bazlı) satırına yazılır, trigger zinciriyle
`project_tasks`'a ve oradan `projects.progress`'e yansır. Proje bazlı kategori
ağırlıkları `project_category_weights(project_id, category, weight_pct)`
tablosunda — proje sihirbazındaki "Kategori Ağırlıkları" adımı +
`save_project_category_weights` RPC'siyle düzenlenir.

**Kaldırılan alanlar (03.08.2026):** `project_tasks.dashboard_visible`/
`dashboard_order` — bir görevi "öne çıkan" işaretleyip sıralı göstermek için
tasarlanmıştı, tek okuyucusu olan `get_project_dashboard` RPC'si hiçbir
frontend dosyasından çağrılmıyordu (muhtemelen `progress_items` → `project_tasks`
tekilleştirme refactor'ünde tüketen ekran kaldırılmış ama giriş alanı wizard'da
kalmış) — kolonlar + wizard'daki "Dashboard'da göster"/"Dashboard Sırası"
alanları kaldırıldı. `project_tasks.is_critical` de aynı turda kaldırıldı,
bkz. altındaki not.

### Otomatik risk motoru
`task_category` enum'u 15 değer (10 eski kategori + montaj alt kırılımı:
kolon/kiriş/aşık/panel montajı, köşk trafo).

`project_risks` elle girilebildiği gibi `fn_recompute_auto_risks(p_project_id,
p_close_material_risks default false)` ile de otomatik oluşur/kapanır: (1) plan
bitiş tarihi geçmiş + tamamlanmamış görev → şiddet **yalnızca gecikme gün
sayısına göre** (8+ gün kritik, 4-7 gün yüksek, altı orta — 03.08.2026'ya kadar
`project_tasks.is_critical` bayrağı şiddeti bir kademe daha yükseltiyordu,
kullanıcı kararıyla kaldırıldı: Gantt'ta zaten görsel bir "kritik yol" vurgusu
yoktu — bkz. aşağıdaki not —, wizard'daki "Kritik Yol" checkbox'ı yalnızca bu
şiddet hesabını besliyordu ve kafa karıştırıcı bulundu; `is_critical` kolonu +
`get_project_gantt` çıktısındaki alan + trigger'ın `UPDATE OF` sütun listesi
birlikte kaldırıldı); (2) bir BOM kalemi için satın alma talepleri toplamı
planlanan miktarı aşarsa.
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

### Modül → tablo haritası (40 tablo + 7 view + `notifications`, 31.07.2026'da canlı şemayla doğrulandı)
| Modül | Tablolar |
|---|---|
| Proje yönetimi | projects, project_tasks, project_category_weights, project_risks |
| Günlük saha raporlama | daily_reports, daily_tasks, personnel_log_entries, machinery_logs, daily_report_photos, daily_report_issues, daily_report_material_usage (kullanımda değil), daily_report_drafts |
| İmalat ilerlemesi | progress_daily |
| Satın alma | purchase_requests, purchase_request_items, purchase_request_status_log, purchase_request_no_counters (`request_no` üretimi için yıl-bazlı sayaç, 30.07.2026) |
| Fatura ve maliyet | invoices, invoice_approvals, invoice_payments, suppliers, budget_lines, cost_allocations, financial_transactions, financial_transaction_payments |
| Kullanıcı yönetimi / navigasyon | roles, role_allowed_tabs, role_sidebar_items, profiles, user_project_access, user_management_audit |
| Bildirim | notifications |
| Destek / diğer | tickets, ticket_comments, ticket_history, ticket_attachments, agent_reports, procurement_items, procurement_item_adjustments, procurement_item_change_requests |

View'lar (hepsi `security_invoker=on`): `project_cost_summary`, `personnel_logs`,
`v_invoice_payment_overview`, `vw_delayed_tasks`, `vw_monthly_progress`,
`vw_project_progress_summary`, `vw_weekly_progress`.

**Kalite kontrol modülü denendi ve kullanıcı kararıyla tamamen kaldırıldı** —
ilgili tablolar/RPC'ler/trigger'lar DB'den silindi. Yeniden eklenmesi teklif
edilirse önce bu kararı hatırlat.

### Excel şablonu / proje sihirbazı
Statik indirilebilir şablon `fons-solar-proje-sablonu.xlsx` (`public/excel/`),
hiçbir kod tarafından üretilmiyor — kullanıcı indirip doldurup Proje
Yönetimi'nden tekrar yüklüyor. 7 sayfa: Proje Bilgileri, İş Kalemleri, Kategori
Ağırlıkları (salt okunur/referans), Riskler (yalnızca mevcut proje güncellemesinde
okunur, yeni projede parse edilmez), Bütçe, Malzeme Listesi, Kullanım Kılavuzu.

`import-project-excel`/`export-project-excel` edge fonksiyonları (Deno,
Supabase'de deploy edili, kaynakları `supabase/functions/` altında — ikisi de
artık repoda takip ediliyor, `import-project-excel` 30.07.2026'ya kadar yalnızca
canlıda deploy edili olup yerel karşılığı yoktu) bu 7 sayfayı parse eder/üretir;
frontend yalnızca `src/utils/projectExcelBridge.js` üzerinden ince bir köprü.
Kategori eşleme sabit bir liste değil, Türkçe etiketi `snake_case`'e çevirir;
risk kategorisi ise sabit 3 değerlik bir sözlük. Sayfa içi satır taraması
(`rows()` helper'ı) başlık satırının HEMEN ALTINDAN başlar — İş Kalemleri/
Riskler/Malzeme Listesi'nde başlık 4. satırda (veri 5'ten başlar) ama Bütçe
sayfasında başlık 5. satırda (veri 6'dan başlar); bu ikisi ayrı `startRow`
parametresiyle ayrıştırılmıştır — aynı sabit satırdan başlanırsa Bütçe'nin
başlık satırının kendisi ("Kategori"/"Kalem Adı"/₺0) geçerli bir kalem sanılıp
her yüklemede eklenir (30.07.2026'da bulunup düzeltilen bug).

**`is_critical`/`dashboard_visible`/`dashboard_order` kaldırılınca Excel yükleme
sessizce kırılmıştı (03.08.2026'da bulunup düzeltildi).** Bu üç kolon
`project_tasks`'tan düşürülürken (bkz. "Otomatik risk motoru" ve "Son
değişiklik" geçmişi) `import-project-excel`/`export-project-excel` edge
fonksiyonları ve statik `fons-solar-proje-sablonu.xlsx` şablonu güncellenmemişti
— İş Kalemleri sayfasının P/Q/R sütunları (Dashboard Göster/Sıra, Kritik mi?)
hâlâ bu kolonlara okuyup/yazıyordu, yani birincil "Yeni Proje" Excel akışındaki
HER görev insert/update'i artık var olmayan bir koloma yazmaya çalışıp "column
does not exist" ile başarısız oluyordu (proje satırı ve kategori ağırlıkları
önce yazıldığından proje listede görünüyordu, yalnızca görevler hiç
işlenmiyordu — "sanki yapıyor ama hata var" şeklinde fark edildi). Düzeltme:
her iki edge fonksiyondan da bu 3 alan çıkarıldı (redeploy edildi), şablon
dosyasından P/Q/R sütunları ve ilgili data validation'lar temizlendi, Kullanım
Kılavuzu sayfası ve versiyon banner'ı **Şablon v7**'ye güncellendi. Yeni bir
kolon kaldırma/ekleme yapılırken bu iki edge fonksiyon + statik şablon +
`src/utils/projectExcelImport.js` (ikincil "Manuel doldur" mini-importer)
DÖRDÜNÜN de senkron güncellenmesi gerektiği unutulmamalı — biri atlanırsa aynı
sınıf regresyon tekrarlanır.

**Proje ID çakışması — "Yeni Proje" akışı (30.07.2026):** `import-project-excel`
`mode` parametresi alır (`ask`/`update`/`duplicate`). İlk denemede (`mode=ask`,
frontend'in varsayılanı) Excel'deki Proje ID (E5) zaten bir projeye aitse
fonksiyon HİÇBİR ŞEY YAZMADAN `409 {conflict:true, existing_id, existing_name}`
döner; `TabProjeYonetimi.jsx` bunu yakalayıp kullanıcıya bir seçim modalı
gösterir: **"Mevcut projeyi güncelle"** (`mode=update`, eskisi gibi o projeye
yazar) veya **"Yeni bir kopya olarak yükle"** (`mode=duplicate` — ID'ye
otomatik `-kopya`/`-kopya-2`... eki eklenip gerçekten yeni, bağımsız bir proje
oluşturulur, isim de `(Kopya)` son ekini alır; Riskler sayfası da bu modda
okunur çünkü kopya aslında dolu bir projenin Excel'i, "yeni/boş proje" değil).
Öncesinde "Yeni Proje" butonu aynı ID'yle tekrar yüklendiğinde kullanıcıya HİÇ
sormadan sessizce mevcut projeyi güncelliyordu — kullanıcı yeni bir proje
oluşturduğunu sanıp listede göremeyince fark edilen bug.

Proje oluşturma/düzenleme sihirbazı (`YeniProjeWizard.jsx`/`ProjeEditWizard.jsx`):
İş Kalemleri → Kategori Ağırlıkları → Riskler (yalnızca düzenlemede) → Tedarik
(yalnızca proje_yoneticisi "Tamamladım" onayı, Faz 1 — tedarikçi/teslimat
detay takibi Faz 2'ye ertelendi) → Bütçe → Tamamlandı. "Yeni Proje" butonu
birincil akış olarak Excel şablonu yükler; küçük bir "Manuel doldur" bağlantısı
sihirbazı da açar (bu ikincil yoldaki mini-importer hâlâ eski kategori setiyle
sınırlı). Gerçek DB yazımı (`projects` insert/update + tüm adım tablolarının
toplu insert'i) yalnızca son adımda (`Adim8Tamamlandi.jsx`'in "Kaydet"i) olur —
öncesindeki adımlar salt `stepsResult` state'inde birikir (ProjeEditWizard'ın
adım-bazlı "Kaydet" butonu hariç, o `directSave()` ile o adımı hemen DB'ye yazar).

**Taslak otomatik kaydetme (03.08.2026):** Sihirbaz içindeyken herhangi bir
adım/sayfa geçişinde (WizardStepper'dan başka bir adıma tıklama, ya da Proje
Yönetimi'nden tamamen başka bir sekmeye geçip TabProjeYonetimi'nin unmount
olması) o ana kadar girilenler kaybolmasın diye `src/utils/projectWizardDraft.js`
üzerinden tarayıcı `localStorage`'ına yazılır (DB'ye YAZILMAZ — `daily_report_drafts`'ın
DB-bazlı taslak deseninden kasıtlı olarak farklı, burada cross-device kalıcılığa
gerek yok). Her adım bileşeni (`Adim1ProjeBilgileri`…`Adim6Butce`) artık bir
`onDraftChange` prop'u alıp kendi ham (henüz doğrulanmamış/commit edilmemiş)
state'ini her değişiklikte üst bileşene bildiriyor — bu, WizardStepper'daki adım
linklerinin `onSelect`'i doğrudan `setStep` çağırıp mevcut adımın "Devam"/"Kaydet"
akışını (validasyon + `onDone`) hiç tetiklemeden komponenti unmount etmesi
yüzünden gerekli: aksi halde bir adımda yazıp doğrudan başka bir adıma tıklamak
o adımdaki değişiklikleri sessizce siliyordu. Taslak anahtarı yeni projede sabit
(`ges-project-wizard-draft:new`), düzenlemede projeye özel
(`ges-project-wizard-draft:edit:<projectId>`). Sihirbaz açılışında bir taslak
bulunursa sarı bir bilgi şeridi ("Kaydedilmemiş bir taslak bulundu, devam
ediliyor" + "Taslağı Sil ve Baştan Başla" linki) gösterilir; taslak sihirbaz
başarıyla tamamlandığında veya "İptal" ile çıkıldığında temizlenir, yalnızca
sayfa/sekme değişip geri dönüldüğünde kalıcı olması amaçlanıyor. Düzenleme
modunda DB'den taze veri çeken adımlar (İş Kalemleri/Riskler/Bütçe — Kategori
Ağırlıkları zaten öyleydi) artık bir taslak zaten varsa bu fetch'i atlıyor
(aksi halde taslaktaki değişiklikler o adıma her dönüşte DB'deki eski haliyle
ezilirdi) — bunun bilinen dengesi: aynı projede uzun süre (günler) açık kalmış
eski bir taslak, o aradaki başka bir DB değişikliğini (örn. başka biri Excel'den
güncelledi) o adım için geçici olarak gizleyebilir; "Taslağı Sil ve Baştan
Başla" bu durumun kaçış yolu.

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
- Bildirim sistemi: tekilleştirme, canlı durum rozetleri (nokta+kalın-metin
  `StatusDot`), tıklayınca ilgili kaydı doğrudan açma (rol-farkında
  click-through), günlük rapor hatırlatma cron job'ı.
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

- ~~Tedarikçi bakiyesi/Finans Raporları — `paid_amount`/`remaining_amount`
  TRY'ye çevrilmiyordu~~ — **tam çözüldü (18.08.2026).** Önceki kısmi düzeltme
  (2026-07-31) yalnızca `total_amount_try`'yi kapsıyordu; şimdi `paid_amount`/
  `remaining_amount` de TRY karşılıklarıyla (`paid_amount_try`/
  `remaining_amount_try`) hesaplanıyor. Ayrıntı için "Çoklu para birimi
  desteği" → "Ödeme anında kur yakalama" bölümüne bak.
- **`complete_project_manager_purchase_request` RPC'si — düzeltildi (2026-07-31).**
  Artık opsiyonel bir `p_supplier_id` parametresi alıyor ve `supplier_id`'yi de
  yazıyor. `TabSatinAlmaTalepListesi.jsx`'teki "Tamamlandı" butonu artık tek
  tık değil — tıklanınca satır içinde `rejectDraft`'la aynı desende bir
  tedarikçi `<select>`i açılır (kullanıcı kararıyla **opsiyonel**: "Tedarikçisiz
  devam et" seçeneğiyle boş geçilebilir, akış tıkanmaz). Tedarikçi listesi bu
  bileşende yalnızca proje yöneticisi için bir kereliğine çekilir (`suppliers`
  tablosu, RLS zaten proje yöneticisine açık). `FaturaOlusturModal.jsx`'teki
  tedarikçi seçici hâlâ aynı şekilde çalışıyor (fatura kendi `supplier_id`'sini
  ayrıca alır) — bu ikisi birbirini geçersiz kılmaz, ikinci bir fırsat.
  ~~Kalan tutarsızlık: `TalepDetayModal.jsx`'in kendi "Tamamlandı" butonu bu
  tedarikçi seçiciyi içermiyordu~~ — **düzeltildi (18.08.2026):**
  `TalepDetayModal.jsx`'e de aynı opsiyonel tedarikçi `<select>`'i (aynı
  "Tedarikçisiz devam et" varsayılanı) eklendi, `updateStatus()` artık
  `p_supplier_id`'yi RPC'ye iletiyor. Uçtan uca gerçek RPC çağrısıyla
  doğrulandı (test verisi geçici olarak tamamlanıp `supplier_id`/`status`
  yazıldığı teyit edildikten sonra orijinal `onaylandi`/`NULL` haline
  SQL'le geri alındı).
- **Eski `procurement-*`/`accounting-scope`/`faz-e` testleri — DÜZELTİLDİ (2026-07-31).**
  `tests/procurement-workflow.spec.js`, `procurement-security.spec.js`,
  `procurement-two-initiators.spec.js`, `procurement-role-acceptance.spec.js`,
  `procurement-concurrency.spec.js`, `accounting-scope.spec.js`, `faz-e.spec.js`
  (B/C testleri) 2026-07-24'teki tek-onaylayıcı geçişinden ve erişim
  genişletmesinden önce yazılmıştı — kaldırılmış RPC'leri (`resubmit_rejected_invoice`/
  `delete_rejected_invoice`), eski `invoices.status='bekliyor'` insert'ini (invoice
  insert'inin `invoice_approvals` satırını otomatik oluşturduğu varsayımı — artık
  oluşturmuyor, "Onaya Gönder" ayrı bir adım), proje yöneticisinin Finans'ta
  Faturalar/Onay Kuyruğu'nu görmediği eski dar erişimi, ve silinmiş
  `ApprovalStepsHorizontal.jsx`'in CSS class'ını varsayıyorlardı. Hepsi güncel
  akışa göre yeniden yazıldı, artık hepsi geçiyor. Bu tarama sırasında gerçek bir
  **production bug** da bulundu ve düzeltildi (aşağıya bkz.).
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
- ~~`project_risks` tablosunda DELETE policy'si yok~~ — **düzeltildi (2026-07-31,
  `20260731100738_add_project_risks_delete_policy`)**: `authenticated_delete_risks`
  policy'si eklendi, aynı tablodaki `authenticated_insert_risks`/`authenticated_update_risks`
  ile birebir aynı deseni (`user_has_project_access(project_id)`) kullanıyor.
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
- ~~Faturalar mobil kart görünümü yok~~ — **bu not bayatmış, düzeltildi
  (2026-07-31).** Gerçek kod zaten tam bir mobil kart görünümüne sahip:
  `FaturaListesi.jsx`'te `.invoice-mobile-list` (article kartları) JSX'i +
  `Dashboard.css`'te `@media (max-width:900px)` altında `.invoice-table-wrap{display:none}`/
  `.invoice-mobile-list{display:grid}` — 390px genişlikte Playwright'ta canlı
  doğrulandı (tablo gizli, 10 kart doğru render). Bu madde ne zaman/kim
  tarafından eklendiğinden bağımsız CLAUDE.md'de hiç güncellenmemişti (bkz.
  "Migration tracking boşluğu" — bu projede kod ile doküman arasında böyle bir
  gecikme daha önce de görülmüş). Fark edilirse bu notu hatırlat: madde
  kapalıdır, yeniden açmadan önce önce kodu kontrol et.
- **Migration tracking boşluğu (Supabase tarafı) — büyük ölçüde kapandı,
  yalnızca 1 migration gerçekten kurtarılamaz.** 2026-07-26'da fark edildi:
  `financial_transactions`/`financial_transaction_payments` şeması,
  `v_invoice_payment_overview` security_invoker düzeltmesi,
  `role_allowed_tabs`/`role_sidebar_items` normalizasyonu,
  `harden_database_security_and_indexes` gibi birden fazla migration canlıda
  uygulanmış (tablolar/fonksiyonlar gerçekten var) ama
  `supabase_migrations.schema_migrations`'ta versiyonları YOK — muhtemelen
  migration tooling atlanıp doğrudan SQL editöründen uygulanmış (yerel dosya
  adlarındaki zaman damgaları da gerçek uygulanan versiyonlarla eşleşmiyor,
  ör. yerel `20260724170000_harden_database_security_and_indexes.sql` iken
  canlıda aynı isim `20260724133320` altında kayıtlı). 2026-08-04'te
  `list_migrations` ile tam bir karşılaştırma yapıldı: ~40 migration'da yalnızca
  bu tür zararsız timestamp sürüklenmesi var; 6 migration'ın (07-24/07-30
  tarihli) hiç yerel dosyası yoktu — bunlardan 5'i (`invoice_payment_tracking_partial_payments`,
  `extend_suppliers_for_accounting_profile`, `add_get_invoice_linked_purchase_request`,
  `notify_muhasebe_on_duzeltme_istendi`, `grant_execute_fn_next_purchase_request_no`)
  mevcut canlı şema durumundan (tablo/trigger/fonksiyon/grant hâlâ yaşıyor)
  **idempotent** olarak (`IF NOT EXISTS`/`CREATE OR REPLACE`/drop+recreate
  constraint) yeniden inşa edilip repoya eklendi — tarihi SQL'in birebir aynısı
  garantisi yok, ama bir `db reset`'te aynı nihai duruma ulaştırır ve sonraki
  gerçek yerel dosyalarla (`fix_kismen_odendi_status_omissions` vb.) çakışmaz.
  **`invoice_flow_single_approver_with_revision_and_payment_tracking`
  (07-24 072957) kalıcı olarak kurtarılamaz** — bunu düzelten sonraki migration
  (`20260724081031_invoice_workflow_single_approver_backend_fix`, yerelde zaten
  var) `create_invoice_approval_chain()`/`trg_notify_invoice_insert()` gibi
  fonksiyonları DROP ediyor; bu fonksiyonların orijinal gövdesi artık ne canlı
  DB'de ne de hiçbir dosyada var — yeniden yazılırsa uydurma olur, kullanıcı
  kararıyla bu tek migration açık madde olarak bırakıldı. En güncel iki migration
  (`20260803101019_drop_critical_path_and_dashboard_visible_fields`,
  `20260803101309_update_functions_after_dropping_critical_path_columns` —
  `is_critical`/`dashboard_visible`/`dashboard_order` kaldırma turu) de aynı
  şekilde mevcut şema durumundan yeniden inşa edilip repoya geri eklendi (bkz.
  "Son değişiklik"). En azından yerel dosyaların kendisi artık git'te (önceki bir
  oturumda 16 migration + 17 finans/muhasebe bileşen dosyası diske yazılmış
  ama hiç `git add` edilmemişti, 29.07.2026'da giderildi).




## Son değişiklik

**18.08.2026 — Ödemede TRY dönüşümü + para birimi mismatch riski kapatıldı
(migration onaylı).**

"Bilinen açık noktalar"daki kalan büyük madde kapatıldı: `invoice_payments`e
ödeme günündeki TCMB kurunu yakalayan `exchange_rate` + generated `amount_try`
kolonları, `invoices`e `paid_amount_try`/`remaining_amount_try` (düz,
`fn_invoice_payment_recalc()` tarafından bakımı yapılan) kolonlar eklendi
(`invoice_payment_try_conversion` migration'ı, kullanıcı onayıyla uygulandı).
`TedarikciListesi.jsx`/`TedarikciDetayModal.jsx`/`FinansRaporlari.jsx`'teki
"Ödenen"/"Kalan" KPI toplamları artık bu TRY alanlarını kullanıyor. Ayrıntı
"Çoklu para birimi desteği" → "Ödeme anında kur yakalama" bölümünde.

İnceleme sırasında beklenenden ciddi bir ek risk bulundu: `OdemeEkleModal.jsx`'te
ödeme, faturanın kendi para biriminden BAĞIMSIZ seçilebiliyordu — ne frontend
ne de DB trigger'ları (`fn_invoice_payment_before_insert`/`_recalc`) bunu
kontrol ediyordu, yanlış seçilirse `paid_amount` sessizce bozulabilirdi
(canlıda gerçekleşmiş bir örnek yoktu, kontrol edildi). Kullanıcı onayıyla
seçici tamamen kaldırılıp ödeme faturanın para birimine kilitlendi, DB
trigger'ına da aynı kontrol savunma amaçlı eklendi. Aynı sınıftan ikinci bir
örnek `TedarikciOdemeModal.jsx`'te (toplu ödeme dağıtımı) bulunup aynı
şekilde düzeltildi — para birimi artık seçilen tedarikçinin açık
faturalarından türüyor, farklı birimden faturalar dağıtımdan otomatik
hariç tutuluyor.

Uçtan uca doğrulama: gerçek bir test USD faturası (leftover audit kaydı,
demo veri değil) geçici olarak `odeme_bekliyor` durumuna alınıp UI'dan
$100 ödeme girildi — `exchange_rate`/`amount_try`/`paid_amount_try`/
`remaining_amount_try`'nin doğru hesaplandığı `execute_sql` ile teyit edildi,
`TedarikciDetayModal.jsx`'in KPI toplamının doğru TRY karşılığını gösterdiği
Playwright ile görsel olarak doğrulandı, ardından fatura orijinal
`taslak`/sıfırlanmış haline SQL'le geri alındı. `TedarikciOdemeModal.jsx`
için de para birimi kilidinin göründüğü canlı ekran görüntüsüyle doğrulandı.
`npm run lint`/`npm run build` temiz.

Bu görevden önce, aynı oturumda ayrıca iki küçük düzeltme yapıldı:
1. **`TalepDetayModal.jsx`'e tedarikçi seçici eklendi** — proje detayı
   içinden bir talep "Tamamlandı" ile tamamlandığında (liste-satırı akışının
   aksine) tedarikçi seçme imkânı yoktu, RPC'ye her zaman `p_supplier_id=NULL`
   gidiyordu. Aynı opsiyonel `<select>` deseni eklendi, `updateStatus`'a
   ikinci parametre olarak geçirildi; gerçek RPC çağrısıyla uçtan uca
   doğrulanıp test verisi orijinal haline geri alındı.
2. **Genel Bakış "Toplam Güç" kırpılma düzeltmesi** — `TabGenel.jsx`'in
   "Proje Özeti" kartındaki bu satır, diğer kardeş satırlardan farklı olarak
   nowrap+ellipsis+`flexShrink:0` taşıyıp "Toplam G…" şeklinde kırpılıyordu;
   bu satıra özel stil kaldırıldı. Ardından aynı sınıftan başka bir tutarsızlık
   olup olmadığı 19 dosyada tarandı — bulunamadı (kalan tüm ellipsis
   kullanımları ya paylaşımlı render'dan ya gerçek değişken kullanıcı
   verisinden). `.genel-kpi-grid`'in 6 kolonlu grid'i kasıtlı — dokunulmadı.
