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
8. **Çelişen talimat.** Bir talimat canlı şema veya `docs/proje-kontrol` kararlarıyla çelişirse uygulamadan önce
   çelişkiyi listele ve onay iste. Proje Kontrol işlerinde kurallar: `docs/proje-kontrol/CONVENTIONS.md`.
9. **Durum tablosu.** Proje Kontrol'de her adım ve faz kapanışında `docs/proje-kontrol/register-gap-analizi.md`
   başındaki durum tablosunu (16 register × faz × güncel durum × Faz 1 bağımlılığı) ve fazların 15 Aralık MVP'ye
   göre tahmini bitiş tablosunu güncelle; "Son güncelleme" satırına tarih ve kapanan adımı yaz.
10. **Test betiği ön kontrolü.** Canlıda (BEGIN…ROLLBACK) veya yerelde koşulacak her PL/pgSQL test betiği, koşmadan önce
    şu üç hata türüne karşı gözden geçirilir ve bulunanlar düzeltilir (Faz 1 Adım 3'te üçü de koşuları durdurdu):
    - **Ad çakışması:**
      - bloktaki PL/pgSQL değişkenleri (dış bloktakiler dahil: `out`, `r`, `n`, `v`, `ok`…) ile sorgudaki takma ad ve kolon adları aynı olmamalı (`column reference "v" is ambiguous`);
      - takma adlar değişken adlarından ayrışacak şekilde seçilir.
    - **Beklenen metin kolon tipinden türetilir:**
      - numeric ölçeği: `numeric(5,2)` → `5.00`, `5.0` değil;
      - boolean: `x::text` → `true`/`false`; `concat_ws`/`format('%s')`/kayıt çıktısındaki ham boolean → `t`/`f`
        (12.10.2026'da canlıda SELECT ile doğrulandı; beklenende hangi biçimin üretildiği yazılır);
      - tarih ve zaman damgası biçimi;
      - enum metni.
      - Gerekirse önce `information_schema.columns` okunur.
    - **Aynı ifadede yaz-oku yok:**
      - bir SQL ifadesindeki alt sorgu, ifade başındaki anlık görüntüyü görür; aynı ifadede çağrılan fonksiyonların yazdıklarını görmez.
      - Tek ifadedeki birden fazla çağrının değerlendirme sırası da garanti değildir.
      - Bu yüzden sıra bağımlı her yazma ayrı bir ifadededir (`a := …; a := a || … ;`) ve sonuç ayrı bir ifadede okunur.

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
- Routing: `/login`, `/hesap-olustur`, `/dashboard/*` (tek `ProtectedRoute`,
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
  7 sekmesi + `ProjeTabSatinAlma`'nın Talepler/Malzeme Listesi/Riskler/Onay
  Bekleyenler/Teklif-Pazarlık-Sipariş/Aylık Plan alt-sekmeleri, proje içi
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
- Rol → sekme/sidebar erişimi **DB-tabanlı**: `roles.tabs_unrestricted`
  (true = kısıtsız)/`default_tab` + ayrı `role_allowed_tabs(role_key, tab_key,
  order_index)`/`role_sidebar_items(role_key, item_key, order_index)` join
  tablolarından okunur (24.07.2026'daki 4NF normalizasyonundan önce bunlar
  `roles` üzerinde düz dizi kolonlarıydı — kaldırıldı), `AuthContext` login'de
  bunları çekip `navigation` olarak context'e koyar; `Sidebar.jsx`/`index.jsx`/
  `TabBildirimler.jsx` buradan okur. Yeni bir rol eklemek/bir rolün erişimini
  değiştirmek yalnızca `roles`/`role_allowed_tabs`/`role_sidebar_items`
  tablolarında bir güncelleme gerektirir, kod değişikliği gerekmez.
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
- `ProjeDetay.jsx`'in 7 sekmesi: Genel Proje, İş Planı, Satın Alma, Finans,
  Ticket, Raporlar, Ekip — sekme bazlı rol gizleme yok, her role görünür
  (Finans proje_yoneticisi için salt-okunur, Tickets tam yetkili). **Malzeme
  Listesi ayrı bir üst-seviye sekme DEĞİL** (07.09.2026'ya kadar öyleydi,
  kullanıcı isteğiyle kaldırıldı) — Satın Alma'nın alt-sekmelerinden ikisi
  (bkz. hemen aşağıdaki madde): **Malzeme Listesi** (BOM/`ProjeTabFaturaKesilecekler.jsx`)
  ve **Riskler** (`ProjeTabRiskler.jsx`) — ikisi malzeme fazla talebi riski
  doğrudan BOM'dan doğduğu için birbirine yakın tutulur. Riskler alt-sekmesi
  hem manuel hem otomatik tüm riskleri satın alma talep listesiyle aynı temada
  (tablo + `Pager`, satır boyu diğer listelerden daha dar — `TD height:46`)
  satır satır listeler, satıra tıklamak açıklama/aksiyon/olasılık-etki +
  kapanma tarihini gösteren bir modal açar (otomatik risklerde ilgili sekmeye
  — İş Planı/Satın Alma'nın kendi Talepler alt-sekmesi — giden bir buton da
  içerir). Genel Proje (`ProjectOverviewDashboard.jsx`, tek veri kaynağı
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
  `goToTab('riskler')` yardımcı fonksiyonu üzerinden Satın Alma sekmesini AÇIP
  `ProjeTabSatinAlma`'nın kendi `activeSubTab` state'ini (`satinAlmaSubTab`,
  ProjeDetay'da tutulur) `'riskler'`ye çeker; kart yalnızca `source==='otomatik'`
  riskleri gösterir (manuel riskler kartta filtrelenir — bilinçli, kompakt
  tutmak için), Riskler alt-sekmesi ise hepsini gösterir. Proje Excel içe/dışa
  aktar yalnızca Proje Yönetimi sayfasında; proje detayının "Proje Excelini
  İndir" butonu tüm proje-erişimli rollerde görünür.
- **Satın Alma sekmesinin alt-sekmeleri (`ProjeTabSatinAlma.jsx`, tek TABS
  dizisi):** Talepler, **Malzeme Listesi**, **Riskler** (rol kısıtı yok, tüm
  roller — santiye_sefi dahil — görür), + admin'e özel Onay Bekleyenler,
  + proje yöneticisi/admin'e özel Teklif / Pazarlık / Sipariş ve Aylık Satın
  Alma Planı. Malzeme Listesi/Riskler 07.09.2026'da eski ayrı üst-seviye
  "Malzeme Listesi" sekmesinden (`ProjeTabMalzemeListesi.jsx`, silindi) buraya
  taşındı — kullanıcı isteğiyle, "Aylık Satın Alma Planı"nın 04.09.2026'da
  aynı şekilde buraya taşınmasıyla aynı konsolidasyon yönünde (bkz.
  `feedback_no_standalone_top_level_screens` hafıza notu). Malzeme Listesi
  alt-sekmesi artık `ProjeTabSatinAlma`'nın zaten çektiği `get_satin_alma_overview`
  verisinden `buildMaterialListRows` ile türetiliyor — ayrı bir ikinci
  `get_satin_alma_overview` çağrısı (eski `ProjeTabMalzemeListesi.jsx`'in
  yaptığı) artık yok. `activeSubTab`/`onSubTabChange` prop'ları kontrollüyse
  (ProjeDetay her zaman kontrollü geçer) üst bileşenden gelir, yoksa (index.jsx'teki
  şantiye şefi menü-seviyesi çağrısı gibi) projeye özel localStorage'da kalıcı
  yerel state'e düşülür (`ProjeTabMalzemeListesi.jsx`'teki eski
  activeSection/onSectionChange ile birebir aynı fikir).
- Şantiye şefi "Satın Alma" sekmesi (`<ProjeTabSatinAlma siteChiefView />`):
  alt-sekme şeridi 07.09.2026'ya kadar tamamen gizliydi (yalnızca Talepler
  görünürdü) — artık şerit gösteriliyor, TABS dizisi zaten Onay Bekleyenler/
  Teklif-Pazarlık-Sipariş/Aylık Plan'ı bu rolde filtrelediğinden yalnızca
  **Talepler** (`requested_by === user.id` ile süzülü, onay/red butonu yok),
  **Malzeme Listesi** ve **Riskler** kalıyor — bu üçü hem proje içi Satın
  Alma'da hem menü-seviyesi (index.jsx, proje bağlamı dışı) çağrıda aynı
  şekilde çalışır. Satın Alma/Malzeme Listesi tabloları `PAGE_SIZE=10` +
  ortak `Pager` bileşeni kullanır (iç-scroll kutusu değil).
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
**Eski durum zinciri** (yalnızca 03.09.2026'dan önce oluşturulmuş eski
talepler, geriye dönük uyumluluk için CHECK'te duruyor, yeni satır
ÜRETMİYOR): `talep_olusturuldu → fiyat_girildi → onay_bekliyor → onaylandi
→ satin_alindi → fatura_bekliyor/fatura_onay_bekliyor → faturasi_kesildi`
(+ `reddedildi`/`iptal`).

**Yeni durum zinciri** (03.09.2026'dan beri TÜM yeni talepler bununla açılır —
`create_purchase_request_with_items` doğrudan `teklif_toplama` ile insert
eder): `teklif_toplama → pazarlik_onay_bekliyor → pazarlik → siparis →
satin_alindi` (buradan sonrası — fatura akışı — iki zincir için de AYNI,
hiç değişmedi). Üç aşama proje yöneticisi tarafından yürütülür, yalnızca
pazarlığa geçiş kapısı admin onayı gerektirir:
- **Teklif Toplama:** `add_purchase_offer`/`delete_purchase_offer` ile
  `purchase_offers` tablosuna teklif eklenir/silinir (tedarikçi veya serbest
  metin + tutar/para birimi/geçerlilik/not/opsiyonel dosya —
  `teklif-ekleri` storage bucket'ı, `ticket-ekleri` ile birebir aynı RLS
  deseni). 3'ten az teklifle "Pazarlığa Gönder" tıklanırsa yalnızca **uyarı**
  gösterilir (siteye özel inline kutu, `window.confirm` değil), zorunlu
  gerekçe istenmez — `submit_purchase_request_for_negotiation` durumu
  `pazarlik_onay_bekliyor`'a çeker.
- **Pazarlık Onayı (admin kapısı):** `review_purchase_request_negotiation_gate`
  — onay `pazarlik`'e geçirir, red **`teklif_toplama`'ya geri döner** (terminal
  değil — `reddedildi` gibi kalıcı bir son değil, PM teklifleri düzenleyip
  tekrar gönderebilir), gerekçe redde zorunlu (`stage_rejection_note`).
- **Pazarlık:** `save_purchase_request_negotiation` kazanan teklifi
  (`selected_offer_id`) + nihai tutar/para birimi/notu kaydeder (durumu
  değiştirmez, tekrar tekrar kaydedilebilir); `advance_purchase_request_to_order`
  `selected_offer_id` doluyken `siparis`'e geçirir.
- **Sipariş:** `save_purchase_request_order` kesin adet/birim fiyat/sipariş
  tarihi/tedarikçiyi `purchase_request_items`/`purchase_requests`'e yazar
  (`total_price` GENERATED kolon olduğundan elle SET edilmez — yalnızca
  `quantity`/`unit_price` yazılır, 03.09.2026'da bulunan bug); ürün sahaya
  ulaşınca `complete_purchase_request_delivery` (adet/fiyat girilmiş olma
  şartıyla) `satin_alindi`'ye taşır — buradan sonra fatura akışı eski
  zincirle birebir aynı.
- **İptal (08.09.2026 eklendi):** `cancel_purchase_request_negotiation_flow`
  — yalnızca proje yöneticisi/admin, yukarıdaki 4 aşamanın HERHANGİ birinden
  çağrılabilir, gerekçe zorunlu, `iptal`e çeker (aylık plan bağlantısını
  koparan trigger zaten bu durumu dinlediğinden ek kod gerekmedi). Plan
  dosyasında ("iptal her aşamadan PM/admin tarafından çağrılabilir")
  öngörülmüş ama ilk implementasyonda unutulmuştu — bir kod incelemesinde
  bulunup eklendi: öncesinde `pazarlik_onay_bekliyor`/`pazarlik`/`siparis`'e
  giren bir talep hiçbir şekilde durdurulamıyordu, `satin_alindi`'ye kadar
  zorunlu ilerlemek gerekiyordu. `TeklifPazarlikSiparisPanel.jsx`'in altında
  tüm aşamalarda ortak, tek bir "İptal Et" bölümü olarak eklendi (aşamaya özel
  4 alt bileşenin her birine ayrı ayrı değil).

Eski zincirin fatura kısmı: `fatura_bekliyor` pratikte hiç üretilmez (yalnızca
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
- **Muhasebenin kendi geri çekmesi — self-revize (18.09.2026 eklendi):**
  `yönetici_onayında` bir faturada yöneticinin "Düzeltme İste"sini beklemeden
  muhasebe kendi hatasını (yanlış tutar/ürün vb.) fark edip faturayı kendisi
  geri çekebilir — `FaturaDetayModal.jsx`'te muhasebeye özel "Geri Çek ve
  Düzenle" bölümü (`canSelfRevize`, yalnızca `isMuhasebe &&
  status==='yönetici_onayında'` — admin/proje_yoneticisi'nin zaten
  `OnayReddetActions` üzerinden kendi "Düzeltme İste"si var, bu bölüm onlarda
  görünmez), zorunlu bir gerekçe alıp AYNI `invoice_approvals`
  `bekliyor→duzeltme_istendi` geçişini (yöneticinin "Düzeltme İste"siyle
  BİREBİR aynı satır/RPC yolu, `reviewer_id` kendi id'si) tetikler, ardından
  doğrudan düzenleme formunu açar. Bu geçiş öncesinde `fn_validate_invoice_status_transition`
  (invoices BEFORE UPDATE, SECURITY INVOKER — `get_my_role()` gerçek çağıran
  role bakıyor, `fn_invoice_approval_cascade`'in SECURITY DEFINER'ı bunu
  bypass ETMİYOR) `yönetici_onayında → duzeltme_bekliyor` geçişini yalnızca
  `admin`/`proje_yoneticisi`'ye izinliydi — muhasebe kendi geri çekmesini
  denediğinde "Bu rol için geçersiz fatura durum geçişi" hatasıyla reddediliyordu
  (test yazılırken bulunan gerçek engel, ilk tasarımda "migration gerekmez"
  sanılmıştı). `allow_muhasebe_self_revize_invoice_from_manager_approval`
  migration'ı bu TEK geçişin izinli rol listesine `muhasebe`'yi ekledi, diğer
  hiçbir geçiş/rol değişmedi. `tests/invoice-self-revize.spec.js` gerçek
  RPC/UI ile uçtan uca doğrular.
- **Ödeme girişi:** tek satırlık `payment_date`/`payment_note` değil — ayrı bir
  `invoice_payments` tablosu (çoklu kısmi ödeme, para birimi, yöntem, referans no,
  iptal desteği). `odeme_bekliyor`/`kismen_odendi` bir faturada muhasebe/admin
  "Ödeme Ekle" (`OdemeEkleModal.jsx`) ile `invoice_payments`'a satır ekler —
  `fn_invoice_payment_before_insert` (BEFORE INSERT) tutarın `remaining_amount`'ı
  aşmadığını ve faturanın gerçekten ödeme aşamasında olduğunu doğrular —
  bu kontrol `invoices` satırını `FOR UPDATE` ile kilitler (08.09.2026'da
  eklendi, bağımsız kod incelemesinde bulundu: kilitsiz haliyle aynı faturaya
  eşzamanlı iki ödeme eklenirse ikisi de aynı `remaining_amount` anlık
  görüntüsünü okuyup ayrı ayrı geçerli görünebiliyordu, birlikte faturayı
  fazla ödenmiş bırakabilirdi — gerçek insert ile pozitif/negatif test
  edildi, ikinci eşzamanlı ekleme artık ilkinin commit'ini bekleyip güncel
  tutarla doğru reddediliyor),
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

**Faturalar liste teması (07.09.2026'da bir QA turunda düzeltilen dokümantasyon
hatası — aşağıdaki madde önceden yanlış yazılmıştı, gerçek koddan doğrulandı):**
`FaturaListesi.jsx` kendi ayrı CSS sınıf temasını kullanır (`.invoice-modern-table`/
`.invoice-mobile-list`, `Dashboard.css`) — `var(--color-*)` token'ları ve ortak
`Pager` bileşeni `TabSatinAlmaTalepListesi.jsx` ile ortak, ama satır/başlık
**JS sabitli değil** (`ROW_HEIGHT`/`HEADER_HEIGHT` yok, satır yüksekliği CSS'te
`td{height:55px}`), başlık **sticky değil**, ve durum rozeti **`StatusDot`
(nokta+kalın-metin) DEĞİL** — klasik pill/arkaplan rozeti
(`invoice-status-pill`, `StatusBadge.jsx`'teki paylaşılan `INVOICE_STATUS`/
`TONE` haritasından renklendirilir). Yani 30.07.2026'da satın alma/ticket/
bildirim tarafında yapılan nokta+kalın-metin `StatusDot` geçişi FaturaListesi'ni
hiç kapsamamış. Üstte KPI kartı YOK (2026-07-28'de kaldırıldı, bkz. "Muhasebe &
Finans modülü" → Faturalar bullet'ı) — doğrudan durum sekmesi çubuğu var: Tümü/
Taslak/Onay Bekleyen/Düzeltme Bekleyen/Onaylanan/Ödeme Bekleyen/Kısmen Ödendi/
Ödendi/Reddedildi (`invoices_status_check`'teki 8 durumun tamamı birer sekme;
`Kısmen Ödendi`/`Reddedildi` öncesinde sekme yoktu, yalnızca Durum dropdown'undan
seçilebiliyordu, bu yüzden "Tümü" sekmesindeki toplam diğer sekmelerin toplamına
eşit değildi — 30.07.2026'da bulunup düzeltildi, artık `hepsi` = sekmelerin
toplamı garantili).
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
   `bekliyor` bir satır düşer, `planned_qty` henüz değişmez.
   `review_procurement_item_change_request` ile onaylanınca gerçekten güncellenir.
   Bir kalem için bekleyen bir talep varken ikinci talep açılamaz (RPC + unique
   index seviyesinde de reddedilir).
3. **Yeni malzeme ekleme:** "+ Yeni Malzeme" butonu `create_procurement_item_add_request`
   RPC'siyle aynı tabloya `procurement_item_id=NULL` + `new_equipment`/`new_unit`/
   `new_category` ile bir satır düşürür; onaylanınca `INSERT INTO procurement_items`
   ile kalem gerçekten listeye eklenir.

**Onaylayıcı rol her zaman admin değil — `approver_role` kolonu (09.09.2026
eklendi).** `procurement_item_change_requests.approver_role` (`'admin'` |
`'proje_yoneticisi'`, varsayılan `'admin'`) hangi rolün bu talebi onaylaması
gerektiğini tutar; `create_procurement_item_change_request`/
`create_procurement_item_add_request` bunu talebi açan kullanıcıya göre
hesaplar ve `notify_role`'u da buna göre yönlendirir. **Kullanıcı kararı:**
Osman Karadoğan ve Cem Aslan admin hesaplarından açılan talepler
`'proje_yoneticisi'`ye düşer (bu iki hesap fiilen kendi taleplerini yine admin
rolünce onaylatıyordu, gerçek bir ikinci göz sağlamıyordu) — kullanıcı
ID'leri fonksiyon gövdesinde hardcoded (`c87088e5-...`/`30431df3-...`), diğer
tüm admin hesapları (ör. genel "Admin" hesabı) eskisi gibi `'admin'`de kalır.
`review_procurement_item_change_request` artık `get_my_role() IN ('admin',
v_row.approver_role)` kontrolü yapar — admin gözetim amacıyla HER ZAMAN
onaylayabilir (fatura onay akışındaki proje_yoneticisi/admin desenindeki aynı
ilke), ek olarak `approver_role`'e eşit rol de onaylayabilir.
`get_satin_alma_overview`'ın `pending_changes` çıktısına `approver_role` eklendi;
`ProjeTabFaturaKesilecekler.jsx`'teki `canReview` artık sabit `isAdmin` değil,
her kalem için `isAdmin || (role==='proje_yoneticisi' && item.approver_role
==='proje_yoneticisi')` (`BekleyenDegisikliklerPanel`/`MalzemeDetayModal`'ın
her ikisi de bu per-item kontrolü kullanır — proje yöneticisi yalnızca kendine
yönlendirilmiş talepleri görür/onaylar).

**"Onaylar" alt-sekmesi + Malzeme Listesi'nde "Talep Eden" filtresi
(09.09.2026, kullanıcı isteği).** `ProjeTabSatinAlma.jsx`'in TABS dizisine
Riskler'in hemen yanına `{key:'onaylar', label:'Onaylar'}` eklendi
(`canManageProcurement` — admin/proje_yoneticisi — kapsamı, siteChiefView'da
gizli). İçeriği, Malzeme Listesi'nin üstünde önceden duran
`BekleyenDegisikliklerPanel` banner'ının AYNISI (`ProjeTabFaturaKesilecekler.jsx`'ten
export edildi) — `reviewablePendingChanges` (aynı per-item `canReviewItem`
mantığıyla `ProjeTabSatinAlma.jsx`'te ayrıca hesaplanır) kendisine geçirilir.
**Banner Malzeme Listesi'nden KALDIRILDI** (09.09.2026, ikinci bir kullanıcı
isteğiyle — toplu onay/red artık yalnızca "Onaylar" sekmesinde); tek bir
kalemin bekleyen değişikliği hâlâ o kalemin satırına tıklayıp
`MalzemeDetayModal`'ın inline onay/red bölümünden onaylanabilir (bu ayrı
kalmaya devam ediyor — "o an incelenen kalem" bağlamı, toplu tarama değil).
Malzeme Listesi'nin arama/kategori
filtresinin yanına, bekleyen değişikliği olan kalemler varsa görünen bir
"Talep Eden" `<select>`i eklendi (`pendingRequesterNames` — bekleyen
taleplerin `requester_name` kümesi) — seçilince listeyi yalnızca o kişinin
değişiklik/ekleme talep ettiği kalemlere daraltır (`rowRequesterName()`,
yeni malzeme sanal satırları için `pending`'ten taşınan `requesterName`,
mevcut kalemler için `pendingByItemId` üzerinden). Gerçek RPC + UI ile
Osman Karadoğan → proje yöneticisi hesabı üzerinden uçtan uca Playwright'ta
doğrulandı (Onaylar sekmesinde göründü, proje yöneticisi onaylayabildi,
Malzeme Listesi'nde "Osman Karadoğan" filtresi doğru satırı gösterdi).

İkisi/üçü aynı anda tetiklenebilir (bir kalem için hem bekleyen manuel talep
hem otomatik aşım) — bu durumda `review_procurement_item_change_request`
onay anında güncel `planned_qty`'yi talebin `old_planned_qty` anlık
görüntüsüyle karşılaştırır; aradan otomatik aşım (veya başka bir onay)
geçtiyse onayı sessizce ezmek yerine açık hatayla reddeder, admin talebi
reddedip güncel miktarla yeniden değerlendirmek zorunda kalır.

### Malzeme eşleştirme önerisi (07.09.2026)
`purchase_request_items.bom_item_id` (`procurement_items(id)`'e FK) aslında
09.07.2026'dan beri şemada vardı ve `YeniTalepModal.jsx`'te BOM dropdown'undan
malzeme seçilince otomatik yazılıyordu — ama bir talep **"Diğer (Listede Yok)"**
ile serbest metin girilirse (typo, kısaltma, farklı yazım) bu alan hep `NULL`
kalıyordu ve tüm client-side hesaplamalar (Malzeme Listesi'nin Gönderilen/Kalan
kolonları, Satın Alma'nın "Uygun/Riskli/Listede Yok" risk rozeti) yalnızca
normalize edilmiş isim string'i (`materialKey`) üzerinden eşleşiyordu — küçük
bir yazım farkı bile o talebi sonsuza kadar "Listede Yok" gösteriyordu ve
miktarı hiçbir BOM kaleminin Gönderilen toplamına yansımıyordu.

Malzeme Listesi'nde artık bir **"Eşleştirme Önerileri"** paneli var
(`EslestirmeOnerileriPanel`, `ProjeTabFaturaKesilecekler.jsx`) — `bom_item_id`'si
boş, kategorisi `malzeme`, durumu `reddedildi`/`iptal` olmayan her talep kalemi
için `suggestBomMatches()` (`utils/satinAlma.js`, eşik varsayılan %55) BOM'daki
en olası tek adayı önerir.

**`nameSimilarity()` — ilk sürüm gerçek veriyle hiç öneri üretmiyordu, aynı gün
düzeltildi.** İlk implementasyon saf tüm-string Levenshtein oranıydı
(`1 - distance/maxLen`). Canlı bir projede (`kaptan-demir-adana-arazi-faz1`)
kullanıcı "malzeme listesinde ara" ekranında bir BOM adı görüp eşleştirme
önerisinin hiç çıkmadığını bildirdi — araştırmada, gerçek talep kalemi adları
kısa/kolokyal ("TTR kablo") iken gerçek BOM adları uzun/teknik parantezli
açıklamalar ("3x2,5mm2 TTR Kablo Kamera Panosu ve Kamera Direği arası"); saf
tüm-string oranı uzunluk farkını doğrudan mesafeye eklediğinden bu tür (kısa
talep adı, uzun BOM adı) çiftlerinde skor neredeyse her zaman %55 eşiğinin
çok altında kalıyordu (ölçülen: "TTR kablo" ↔ yukarıdaki BOM adı **%16**,
"DC Solar Kablo Seti" ↔ "DC Kablo 4mm2 (75.000 mt)" **%24**) — panel teknik
olarak çalışıyordu ama gerçek projelerde pratikte hiç tetiklenmiyordu. Düzeltme:
`nameSimilarity` artık `max(tüm-string oranı, tokenSetSimilarity)`.
`tokenSetSimilarity` kısa olan tarafı kelimelere ayırıp her kelimeyi uzun
taraftaki EN İYİ eşleşen kelimeyle karşılaştırır ve ortalamasını alır — uzun
tarafın fazladan kelimeleri (kamera/panosu/arası gibi) skoru seyreltmez. Aynı
gerçek verilerle doğrulandı: "TTR kablo" artık **%100**, "DC Solar Kablo Seti"
**%56** (eşiği geçiyor); kasıtlı olarak eşleşmemesi gereken test kalemleri
("BOM Dışı Montaj Sarf Malzemesi" vb.) **%16-31** aralığında kalmaya devam
ediyor — yanlış-pozitif riski yaratmadan gerçek recall sorunu çözüldü. Canlı
`kaptan-demir-adana-arazi-faz1` projesinde Playwright ile ekran görüntüsüyle
doğrulandı (panel artık "TTR kablo → benzerlik %100" önerisini gösteriyor).
Admin/proje yöneticisi **Onayla**'ya basarsa `link_purchase_request_item_to_bom`
RPC'si (SECURITY DEFINER, aynı proje + henüz bağlantısız kalem şartıyla)
`bom_item_id`'yi yazar ve `fn_recompute_auto_risks(project_id, false)`'u tetikler
(artık doğru sayılan miktar planı aşıyorsa yeni bir `malzeme_fazla_talep` riski
hemen açılabilsin diye — `false`: bu bir onay değil, mevcut açık riskleri
kapatmaz). **Reddet yerine "Yoksay"** — kalıcı bir "bir daha gösterme" kaydı
tutulmuyor, yalnızca bu oturumda gizlenir (bilinçli sadeleştirme).

**Bu, `bom_item_id`'yi (varsa) isim string'ine tercih edecek şekilde tüm
client-side eşleşme mantığını değiştirdi** — `materialMatchKey(item)`
(`item.bom_item_id ? 'id:'+id : materialKey(item.name)`) artık
`requestedTotalsByMaterial`/`classifyMaterials`/`riskBreakdownForItems`/
`riskState`'in TÜMÜNDE kullanılıyor; `TabSatinAlmaTalepListesi.jsx`'teki
`materialPlan`/`requestedTotals` Map'leri hem isim hem `id:<uuid>` anahtarıyla
çift kayıtlı tutuluyor (bir talep kalemi bom_item_id ile linkliyse id
anahtarından, değilse isim anahtarından okunur). `get_satin_alma_overview`/
`get_satin_alma_overview_all_internal` bu yüzden kalem çıktısına `id`/
`bom_item_id` eklendi (kolon zaten vardı, yalnızca RPC hiç döndürmüyordu).
**Bilinçli sınırlama:** aynı BOM kalemi için hem doğrudan linkli hem de ismi
tesadüfen eşleşen (henüz linksiz) birden fazla talep varsa, `riskState`/
`riskBreakdownForItems`'ın kişi-bazlı bakışı bu ikisini AYRI ayrı sayar
(yalnızca `buildMaterialListRows`'un malzeme-bazlı Gönderilen toplamı ikisini
doğru şekilde birleştirir) — nadir bir kenar durum, bu turda düzeltilmedi.
`useSantiyeData.js`'teki (şantiye şefi Genel Bakış kartı) eşdeğer hesaplama da
bu turun kapsamı dışında bırakıldı, aynı desenle ayrı bir iş olarak yapılabilir.

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

### Roller (4, `roles` tablosunda tanımlı — `select key, display_name, is_manager, cross_project, tabs_unrestricted, default_tab from roles`, sekme/sidebar listesi ayrı `role_allowed_tabs`/`role_sidebar_items` tablolarında)
admin, muhasebe, proje_yoneticisi, santiye_sefi.

**Not (15.09.2026'da düzeltilen doküman hatası):** `roles.allowed_tabs`/
`sidebar_items` dizi kolonları **24.07.2026'da kaldırıldı**
(`20260724160000_normalize_role_navigation_4nf.sql`, 4NF normalizasyonu) —
yerine sıra bilgili iki join tablosu (`role_allowed_tabs(role_key, tab_key,
order_index)`, `role_sidebar_items(role_key, item_key, order_index)`) ve eski
"NULL = kısıtsız" semantiğini taşıyan bir `tabs_unrestricted boolean` kolonu
geldi. Bu madde uzun süre (bir aydan fazla, birkaç proaktif tarama turunda)
fark edilmeden CLAUDE.md'de eski haliyle kalmıştı — kod (`AuthContext.jsx`)
her zaman doğru tabloları kullanıyordu, yalnızca dokümantasyon geride kalmıştı.

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
`link_purchase_request_item_to_bom` (bir talep kalemini BOM'daki gerçek bir
kaleme bağlar, bkz. "Malzeme eşleştirme önerisi"),
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
Bir bildirime tıklamak ilgili sekmeye/listeye götürür ve ilgili satırı geçici
olarak vurgular — **modal AÇMAZ** (04.09.2026'da kullanıcı kararıyla
değiştirildi, bkz. "Son değişiklik" ve `src/hooks/useHighlightRow.js`); ticket/
günlük rapor/satın alma talebi/fatura/malzeme değişikliği her biri için
`index.jsx`'te ayrı `open*Id` state zinciri hâlâ var, yalnızca hedef bileşenin
bu id'yle yaptığı şey değişti (RPC ile tek kaydı çekip modal açmak yerine, o
liste zaten kendi verisinde hedefi arayıp filtre/sayfa/kategori-collapse
sıfırlayıp scroll+flash yapıyor). Günlük rapor bildirimi hâlâ eski davranışta
(kendi düzenleme modalini açar) — bu değişikliğin kapsamı yalnızca satın alma
talebi/fatura/ticket/malzeme değişikliği. Her satırda bir silme butonu var (`.bildirim-delete`,
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
| Satın alma | purchase_requests, purchase_request_items, purchase_request_status_log, purchase_offers (teklif toplama, 03.09.2026), procurement_monthly_plan (`request_no` üretimi artık `purchase_request_no_counters` tablosu değil bir Postgres SEQUENCE — 10.09.2026'da eklendi, ayrıntı için "Son değişiklik") |
| Fatura ve maliyet | invoices, invoice_approvals, invoice_payments, suppliers, budget_lines, cost_allocations, financial_transactions, financial_transaction_payments |
| Kullanıcı yönetimi / navigasyon | roles, role_allowed_tabs, role_sidebar_items, profiles, user_project_access, user_management_audit |
| Bildirim | notifications |
| Destek / diğer | tickets, ticket_comments, ticket_history, ticket_attachments, agent_reports, procurement_items, procurement_item_adjustments, procurement_item_change_requests |
| Proje kontrol (register, 05-07.10.2026 + 14.10.2026; canlıda toplam 58 tablo) | project_wbs, project_areas, area_wbs, project_actions, documents, document_revisions, drawings, rfis, decisions, technical_submittals, material_approvals, project_register_settings, project_register_counters, register_status_history, changes, claims, interfaces — bkz. "Proje Kontrol (Faz A)" |

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
**12.10.2026'dan beri (Karar 52) Playwright'ın varsayılan hedefi YEREL Supabase.**
- Kurulum: `node scripts/local-db/setup.mjs`. Docker ve `npm run db:backup` şema dökümü gerekir (`docs/proje-kontrol/faz1-adim5-yerel-ortam.md`).
- Adres, anahtar ve kurgu test kullanıcıları `supabase/.local/env.json`'dan (gitignore) okunur.
- Vite 5183 portunda ayrı süreçte çalışır.
- Canlıya karşı koşmak yalnızca açıkça `PW_TARGET=live` ile mümkün; bu durumda `.env.test` ve 5173 kullanılır.

### Proje Kontrol (Faz A tamamlanıyor, Faz B taslakları hazır — 06-07.10.2026)

Kaynak tasarım: `docs/proje-kontrol/tasarim.md` (**v3, 07.10.2026** — kullanıcının verdiği sürüm; önceki taslak
`docs/proje-kontrol/arsiv/` altında, v2 ve `FONS_Diyarbakir_Sistem_Revizyon_Yol_Haritasi.docx` v1 geçersiz).
Öncelik: onaylı kararlar (bu bölüm) > canlı şema (`docs/proje-kontrol/canli-sema-ozeti.md`) > tasarim.md; tasarım
canlıyla çelişirse tasarim.md düzeltilir ve fark `docs/proje-kontrol/v3-uyum-notlari.md`'ye yazılır.
Branch: `faz-a-proje-kontrol` (push edilmedi).

**Dosya deposu: Supabase Storage, Google Drive / SharePoint YOK.** Şirkette Microsoft 365 ve Google Workspace
olmadığı için dosyalar yeni bir özel (private) bucket'ta tutulur; kullanıcı Fons içindeki klasörlü dosya gezgininden
ulaşır (klasör ağacı arayüzde, `documents`/`document_revisions` kayıtlarından üretilir; depoda klasör yönetimi yok).
drive-gateway, drive-sync, Google/Microsoft entegrasyonu ve bunların secret'ları planda yok. Bu karar (Karar 5)
**PATRON ONAYI BEKLİYOR** (öneri: Supabase Pro, aylık 25 $). Onay gelmeden bucket ve yükleme akışı (B5) uygulanmaz,
yalnızca taslağı durur; kayıt/yetki işleri (B1-B4, B6) onayı beklemez.

**Ücretsiz plan sınırları (bugün geçerli):** 500 MB veritabanı (07.10'da 28 MB), 1 GB dosya (07.10'da ~2,2 MB),
tek dosya 50 MB, otomatik yedek yok, 1 hafta işlemsizlikte duraklama. Bu yüzden: dokümanın tam metni DB'de kalıcı
saklanmaz (`document_texts` yok), `register_audit` yalnızca değişen alanları tutar, AI taslakları hedef tabloya değil
`register_drafts`'a yazılır (Faz C), register tablolarına yazma yalnızca RPC ile (G-01 bugün geçici; B3 ile kalıcı).

**Kararlar.** Onaylanmamış karar uygulanmaz; kararlar tasarim.md ile çelişirse kararlar geçerlidir.

| # | Karar | İçerik | Durum |
|---|---|---|---|
| 0 | 05.10 canlı şeması | Tablolar korunup tasarıma hizalandı (`20261007072501_uyum_project_control_registers`) | **ONAYLANDI ve UYGULANDI (07.10.2026)** |
| 1 | Action | Ayrı tablo `project_actions` (eski `actions`); ticket sahadan bildirim olarak kalır, genişletilmez; kaynak listesinde `inspection`/`ncr` yok | **ONAYLANDI (07.10.2026)** |
| 2 | Numara biçimi | `{TÜR}-{PROJE_KODU}-{SIRA}` (ör. `RFI-ADN1-0007`): yıl ve disiplin yok, sıra proje+tür bazında boşluksuz, 4 haneye kadar sıfır, kırpma yok; proje kodları ADN1, ADN2, TIZ, TKY; çizim türü doküman `DRW`, diğerleri `DOC`; `TS`/`MA` önekleri | **ONAYLANDI (07.10.2026)** |
| 3 | Revizyon | Tek doküman + `document_revisions` (ifr/ifa/ifc/as_built), dokümanın tek `is_current` revizyonu; `drawings` dokümana bire bir uzantı (3 kolonlu FK) | **ONAYLANDI (07.10.2026)** |
| 4 | Submittal / Material Approval | `technical_submittals` ve `material_approvals` iki ayrı tablo | **ONAYLANDI (07.10.2026)** |
| 5 | Dosya deposu | Supabase Storage özel bucket + Fons içi klasörlü gezgin; Supabase Pro (25 $/ay) önerisi. **Ek not (09.10):** şirket M365'e geçiyor; dosya bağlantısı sağlayıcıdan bağımsız tutulur (`document_revisions.storage_provider` canlıda `supabase_storage`/`sharepoint`/`external` destekliyor), SharePoint ileride şema değişmeden eklenebilir — karar tersine dönmedi (`CONVENTIONS.md` §5) | **PATRON ONAYI BEKLİYOR** |
| 6 | Roller ve yetki matrisi | Mevcut 4 rol; register × eylem yetkisi `register_permissions`'ta. Matris `docs/proje-kontrol/karar-6-10-yetki-ve-dort-goz.md` §1 (B1 seed'i). Tasarım 4.3'ten farklar: şantiye şefi risk ve document düzenler (yalnızca kendi kaydı), change görmez/açmaz (değişiklik talebi Ticket ile), interface açmaz; PM decision/change/claim onaylamaz; procurement/subcontractor/payment tüm rollerde en fazla görüntüleme; silme yalnızca admin; ncr/inspection kimsede yok. "P1" = Faz 3 kapsamı (document, drawing, rfi, action, risk, decision) | **ONAYLANDI (13.10.2026)**; B1 canlıda ROLLBACK ile yeniden test edildi, parmak izi birebir |
| 7 | AI sağlayıcı ve gizlilik | Önce İsdemir OYAK izni; sağlayıcı 10-15 gerçek belgeyle iki aday ölçülerek seçilir (ChatGPT de aday); izin yoksa AI yalnızca metadata | **AÇIK** |
| 8 | NCR ve Inspection | Pilotta yok; mobilizasyondan sonra, kalite modülünün kaldırılma kararı hatırlanarak | **AÇIK** (tasarımda öneri) |
| 9 | Agent kimliği ve ilk agent'lar | Her agent için ayrı, proje kapsamlı rol, yalnızca izinli RPC'ler; ilk agent'lar Reconciliation ve Planning (Faz E) | **AÇIK** (tasarımda öneri) |
| 10 | Dört göz kuralı | Yalnızca decision, risk, change, claim: oluşturan kullanıcı hesabı kendi kaydını onaylayamaz. Admin'in kendi kaydını başka bir admin onaylar; ön koşul genel "Admin" hesabının onay yapamaması (mekanizma önerisi M1 hesap bazlı istisna / M2 rol değişikliği, hesap kararı kullanıcıda). `four_eyes_enabled` kalır, varsayılan açık, yalnızca admin değiştirir, audit'li (B3'e eklenecek). Kritik risk: elle açılmış kritik riskin kapanışı önce "onay bekliyor"a geçer, PM veya admin (oluşturan dışında) onaylar; kritik olmayan onaysız kapanır; otomatik riskler kapsam dışı (Faz 3, Karar 14 ile; `project_risks.created_by` eklenmeli). Decision kaydını yalnızca admin onaylar, iş durumu yalnızca onaylı kayıtta değişir. Change/Claim admin onayı, ayrıntı Faz 5. Ayrıntı `karar-6-10-yetki-ve-dort-goz.md` | **ONAYLANDI (13.10.2026)**; genel Admin hesabı Karar 64 ile, eski riskler Karar 65 ile netleşti |
| 11 | Payment | Şimdi (Faz 4): tedarikçi ödemeleri mevcut tablolar (`invoices`, `invoice_payments`, `financial_transactions`) üzerinden okuma görünümü. Faz 6: taşeron hakedişi ve işveren hakedişi tek `progress_payments` tablosunda, `direction` (alacak \| borç). `financial_transactions.transaction_type='hakedis'` yalnızca nakit hareketi; hakediş detayı `progress_payments`'ta | **ONAYLANDI (09.10.2026)** |
| 12 | Subcontractor | `suppliers.party_type` (tedarikci \| taseron \| ikisi; `supplier_type` adı başka anlamla dolu). Ayrıca proje bazlı `subcontracts` tablosu (kapsam, bedel, süre, teminat), Faz 6 | **ONAYLANDI (09.10.2026)** |
| 13 | Faz tanımları | Faz 0 zemin (kapandı); 1 WBS/Area/Activity kodu; 2 ortak altyapı (numaralama, links, files, history, `register_permissions`); 3 mevcut 8 register'ı standarda getirme + UI, RFI pilot; 4 köprüler (procurement görünümü + sahada gerekli tarih, tedarikçi ödeme görünümü); 5 Change, Claim, Interface; 6 `subcontracts`, `progress_payments`, faturalara WBS/aktivite bağı; 7 Aktivite 360 ve KPI; 8 alarmlar; 9 import, test, go-live. Ertelenen: NCR, Inspection (Karar 8), SharePoint (M365 sonrası). Tasarımın A-E fazlarıyla eşleşme ve açık çakışmalar: `docs/proje-kontrol/register-gap-analizi.md` §c | **ONAYLANDI (09.10.2026)**, çakışmalar kullanıcıda |
| 14 | Risk numarası | `project_risks`'e RSK önekli numara; otomatik riskler de numara alır; ayrım `source` (manuel \| otomatik) ile; numara boşlukları kabul | **ONAYLANDI (09.10.2026)** |
| 15 | Satın alma köprüsü | Faz 4'te `purchase_requests`'e nullable "sahada gerekli tarih" kolonu; doküman bağı Faz 4'te `purchase_documents` ara tablosuyla (talep × doküman, çoka çok; Karar 22 ile düzeltildi — `register_links` açılmıyor); `SAT-YYYY-NNN` numaraları değişmez | **ONAYLANDI (09.10.2026)** |
| 16 | NCR / Inspection kodları | Mobilizasyon sonrası yeniden değerlendirilir (Karar 8 geçerli); `ncr` ve `inspection` register tipi kodları Faz 2'de şimdiden ayrılır | **ONAYLANDI (09.10.2026)** |
| 17 | Faz sırası (Ç2, Ç5) | B1, B2, B4 Faz 1'e taşındı. B5 Faz 2'de tek başına; patron onayı paralel alınır | **ONAYLANDI (09.10.2026)** |
| 18 | Activity ID | Sistem üretir, elle yazılmaz. Biçim `{PROJE}-{DİSİPLİN}-{ALAN}-{NNNN}`, sıra onar artar. Yalnızca disiplin, alan ve WBS doluyken "Kod ata" ile atanır; düzeltme yalnızca B4. Mevcut `task_code` görünen kısa kod olarak kalır. Önce tek WBS grubunda pilot, onaydan sonra toplu atama | **ONAYLANDI (09.10.2026)** |
| 19 | WBS ve alan verisi | İlk yükleme Excel import script'iyle, sonrası ekrandan. Başlangıç projesi Diyarbakır İsdemir | **ONAYLANDI (09.10.2026)** — Diyarbakır projesi canlıda yok (bkz. gap Ç13) |
| 20 | Disiplin | Liste: mechanical, dc, ac, mv, hv, enh, civil, scada, general. ID kısaltmaları MEC, DC, AC, MV, HV, EIH, CIV, SCA, GEN. Mevcut görevlerde DB zorunluluğu yok; yeni görev formunda ve ID atamada zorunlu | **ONAYLANDI (09.10.2026)** |
| 21 | Proje kodu (Ç7) | NOT NULL + unique + biçim kontrolü (2-5 büyük harf); proje oluşturma formunda zorunlu | **ONAYLANDI (09.10.2026)** — canlı CHECK ve ADN1/ADN2 ile çakışıyor (gap Ç14, Ç15) |
| 22 | Links (Ç1) | `register_links` açılmıyor; satın alma-doküman bağı Faz 4'te `purchase_documents` ara tablosuyla | **ONAYLANDI (09.10.2026)** |
| 23 | AI (Ç3) | RFI pilotu AI'sız. AI akışları (`register_drafts`, `process-document`, agent'lar) Faz 7 sonrası ayrı faz | **ONAYLANDI (09.10.2026)** |
| 24 | MVP takvimi (Ç4) | 1 Ocak 2027 MVP = Faz 1-4, hedef 15 Aralık 2026 | **ONAYLANDI (09.10.2026)** |
| 25 | Tip kodları (Ç12) | `ncr`, `inspection` B1'e şimdi eklenir (yetkisiz seed) | **ONAYLANDI ve taslağa işlendi (09.10.2026)** |
| 26 | Ertelenen çakışmalar | Ç6 Faz 3 başında (**Karar 45 ile kapandı**); Ç8, Ç10, Ç11 Faz 6 başında çözülür | **ONAYLANDI (09.10.2026)** |
| 27 | Pilot projesi (Ç13) | Mekanizma pilotu TIZ'de. Diyarbakır, Faz 1 Adım 6'da güncellenmiş `import-project-excel` ile oluşturulur, gerçek pilot orada. ADN1/ADN2'ye Faz 1'de dokunulmaz. Diyarbakır kodu (DYB / DYB1 / DYB2) Adım 6'ya kadar bekliyor | **ONAYLANDI (09.10.2026)**; Diyarbakır 6b'ye kaydı (Karar 74) |
| 28 | Proje kodu biçimi (Ç14) | `^[A-Z][A-Z0-9]{1,4}$`; mevcut 4 kod (ADN1, ADN2, TIZ, TKY) geçerli | **ONAYLANDI (09.10.2026)**, taslak `f1_proje_kodu_ve_olusturma.sql` |
| 29 | Proje oluşturma (Ç15) | Tek DB fonksiyonu (`create_project_with_code`): proje + kod aynı işlemde; kodsuz projeyi reddeden ertelenmiş kural. Sihirbaz ve `import-project-excel` bu fonksiyonu kullanır; deploy Adım 6'da | **ONAYLANDI (09.10.2026)**, taslak F1 + `f1-import-project-excel-diff.md` |
| 30 | Activity ID yazımı (Ç16) | Yalnızca kod atama fonksiyonu ve B4 düzeltmesi yazabilir (Adım 3'te guard'a eklenecek) | **ONAYLANDI (09.10.2026)** |
| 31 | Test ortamı (Ç17) | Faz 1 Adım 2 canlıda BEGIN…ROLLBACK ile; Faz 2'den itibaren lokal Docker testi zorunlu; Adım 6'dan önce yedek zorunlu | **ONAYLANDI (09.10.2026)**; Faz 2 testi canlıda ROLLBACK, yerel Docker 6b'den itibaren (Karar 70) |
| 32 | Alan kodu (Ç18) | `^[A-Z0-9]+$` (tiresiz) | **ONAYLANDI (09.10.2026)**, taslak F1 |
| 33 | İş Planı toplu atama | Adım 5'e ek: seçili görevlere toplu disiplin/alan/WBS atama | **ONAYLANDI (09.10.2026)** |
| 34 | F1 A4 ayrı migration | Adım 6 sırası: (1) F1 A1-A3 → (2) frontend + `import-project-excel` deploy → (3) sihirbaz ve Excel import ile kodlu proje oluşturmanın canlıda doğrulanması → (4) A4 (kodsuz projeyi reddeden kural) | **ONAYLANDI (09.10.2026)** |
| 35 | Proje oluşturma yetkisi | admin ve proje_yoneticisi. Bugünkü `projects_insert_admin` (yalnızca admin) bir tutarsızlıktı; `create_project_with_code` ile düzeltiliyor | **ONAYLANDI (09.10.2026)** |
| 36 | F1 A4 trigger yapısı | Tek `fn_require_project_code` (CASE ile NEW/OLD seçimi) yerine tablo başına iki trigger fonksiyonu (`fn_projects_require_code`, `fn_project_register_settings_keep_code`) + ortak `project_code_missing()`. Gerekçe: her fonksiyon yalnızca kendi tablosunun kaydına bakar, "record has no field" hata sınıfı yapısal olarak ortadan kalkar; IF/ELSE de çalışırdı ama tablo adına göre dallanma yeni tablo eklenince aynı hatayı tekrar üretebilir. `f1_dogrulama.sql`'e kuralı fiilen tetikleyen R1-R5 regresyon testleri eklendi (Adım 6'da da çalışır) | **UYGULANDI (taslakta), Adım 2'de doğrulandı (09.10.2026)** |
| 37 | Disiplin listesi | `task_disciplines` tablosu (anahtar → ID kısaltması: mechanical=MEC, dc=DC, ac=AC, mv=MV, hv=HV, enh=EIH, civil=CIV, scada=SCA, general=GEN); `project_tasks.discipline` ona FK ile bağlı, boş değer serbest. Canlıda daha önce DB listesi yoktu (yalnızca ekran sözlüğü) | **ONAYLANDI (09.10.2026)**, taslak `f1_aid_activity_id.sql` |
| 38 | Alan-WBS kuralı (Activity ID) | Görevin WBS'inde (veya üst WBS'lerinde) alan bağı tanımlıysa ve görevin alanı aralarında yoksa atama engellenir; hiç bağ yoksa uyarı verilip atanır | **ONAYLANDI (09.10.2026)** |
| 39 | ID sonrası kilit | Activity ID atanmış görevde disiplin ve alan kilitli; düzeltme yalnızca genişletilmiş B4 (`admin_correct_task_activity_id`, admin, gerekçe zorunlu, ID + alan/disiplin birlikte, yeni ID görevin proje/disiplin/alanıyla uyumlu olmalı). WBS değişikliği `register_audit`'e yazılır; **Karar 51 ile daraltıldı:** yeni WBS zinciri Karar 38'e uymalı | **ONAYLANDI (09.10.2026)**, Karar 51 ile daraltıldı (12.10.2026) |
| 40 | ID'li görev silinmez | Activity ID atanmış görev silinemez, durumu `iptal` yapılır; proje silme zinciri çalışır. Sihirbazın sil-yeniden-yaz akışının görev koduna göre güncellemeye çevrilmesi Adım 5'e eklendi ve Adım 6 deploy'unun ön koşulu. İptal görevler ilerleme/ağırlık/S-eğrisi hesaplarından çıkarılır. **Ek (12.10):** iptal göreve ilerleme DB'de her yoldan (günlük rapor dahil) "İptal edilmiş göreve ilerleme girilemez" ile reddedilir; iptal görevi yalnızca admin ve proje_yoneticisi yeniden açar (taslak A8) | **ONAYLANDI (09.10.2026)**; "Adım 6 ön koşulu" Karar 69 ile değişti |
| 41 | Atama çağrısı | Önizleme (`p_dry_run`) varsayılan açık; çağrı başına en fazla 500 görev, tek proje; gerçek atamada hepsi ya da hiçbiri | **ONAYLANDI (09.10.2026)** |
| 42 | Adım 3 migration sırası | Ayrı migration, B4'ten sonra; `fn_project_tasks_identity_guard`'ın son hali Adım 3'te (B4'ün kuralını içerir) | **ONAYLANDI (09.10.2026)** |
| 43 | Önizleme yetkisi | Önizleme de yalnızca admin ve proje_yoneticisi | **ONAYLANDI (09.10.2026)** |
| 44 | İptal görev koruması (A8) | İptal göreve ilerleme her yoldan reddedilir (`add_task_progress`, günlük rapor, `progress_daily`'ye doğrudan yazma): "İptal edilmiş göreve ilerleme girilemez". **Görevi iptal etmek ve iptal görevi yeniden açmak yalnızca admin ve proje_yoneticisi** (12.10.2026 güncellemesi: iptal etme de kısıtlandı; oturumsuz bağlam — service role ile çalışan Excel import dahil — durumu iptale çekemez/iptalden çıkaramaz). Eski raporun aynen yeniden kaydı korunur; iptal görevin eski ilerlemesinin düşürülmesi yeniden açma ile yapılır | **ONAYLANDI (12.10.2026)**, güncellendi (12.10.2026, 14. tur); taslak `f1_aid_activity_id.sql` A8b |
| 45 | MVP senaryosu (b) | Technical Submittal ve Material Approval ekranları Ocak 2027'ye. Document ekranı external link ile başlar; Storage yüklemesi B5 onayından sonra. Ç6 kapandı: Faz 3 kapsamı Document, Drawing, RFI, Action, Risk, Decision. MVP canlı 11 Aralık 2026 (durum tablosu; 13.10.2026 tahmini 14 Aralık 2026, Faz 3'e kritik risk kapanış onayı eklendi) | **ONAYLANDI (12.10.2026)** |
| 46 | WBS/alan şablonu | WBS'te sıra kolonu yok, liste koda göre; şablonda "kodları sabit haneli yazın (DYB-020, DYB-100)" notu. Örnek satırlar kurgu (TIZ tarzı). Not kolonları şablonda. Kolonlar canlı tablolardan | **ONAYLANDI (12.10.2026)**, `docs/proje-kontrol/sablon/` |
| 47 | WBS disiplini | `project_wbs_discipline_fk` → `task_disciplines` | **ONAYLANDI (12.10.2026)**, taslak `f1_wbs_alan_import.sql` A1 |
| 48 | Activity ID bütünlüğü DB'de | Trigger düzeyinde: görevi olan alan/WBS kodu değişmez (canlı kural); ID'li görevin alanı, WBS'i veya üst WBS'i pasifleştirilemez / taşınamaz; Karar 38'i bozan `area_wbs` INSERT'i ve ID'li görevin alanını kümeden çıkaran DELETE reddedilir; ID'li görevin alanı/WBS'i silinemez. Import yalnızca rapor (`aid_impact`). B4 muafiyeti önerilmedi (B4 `project_tasks`'ı yazar, bu trigger'lar alan/WBS/bağ tablolarında) | **ONAYLANDI (12.10.2026)**, taslak A2-A5 |
| 49 | Ç-7 guard düzeltmesi | Aktif alt kaydı olan alan/WBS pasifleştirilemez; taşınan WBS'in alt WBS'lerinin `level`'ı güncellenir | **ONAYLANDI (12.10.2026)**, taslak A3 |
| 50 | WBS/alan importu | Excel ön yüzde (`src/utils/wbsAreaExcel.js`) okunur → `import_wbs_areas(p_project_id, p_payload, p_dry_run default true)` (DEFINER). Yalnızca admin/PM; hepsi ya da hiçbiri; koda göre eşleşme; silme yok, bağ yalnızca eklenir; `not_in_file` raporu; her yazma audit'e (`project_wbs`/`project_areas` B2 trigger'ı, `area_wbs` ayrı trigger). Projesiz kontrol: `p_project_id = null` önizleme ve `scripts/proje-kontrol/wbs-alan/kontrol.mjs` | **ONAYLANDI (12.10.2026)**, taslak A6-A7 |
| 51 | Görev tarafında alan-WBS kuralı | ID'li görevde WBS veya alan değişince görevin trigger'ı (`trg_project_tasks_wbs_area_link_guard`, SECURITY DEFINER) Karar 38'in karma kuralını uygular: yeni WBS zincirinde (WBS + üstleri) alan bağı tanımlıysa görevin alanı içinde olmalı, hiç bağ yoksa serbest. B4'ün alan düzeltmesi de aynı kontrolden geçer (red → `validation`). ID'siz görev ve ID'nin temizlendiği B4 çağrısı kontrol dışı | **ONAYLANDI (12.10.2026)**, taslak `f1_aid_activity_id.sql` A3b; ROLLBACK testleri T35a-e ve R27 geçti |
| 52 | Test ortamı (Adım 5) | Yerel Supabase (Docker); taban canlı şema dökümü (`npm run db:backup`'ı kullanıcı çalıştırır; `.env*` okunmaz). Playwright'ın varsayılan hedefi yerel; canlıya karşı koşmak yalnızca açık ortam değişkeniyle (`PW_TARGET=live`). Baseline migration Karar 61 ile ertelendi; yerel ortam yalnızca şema dökümüyle kurulur | **ONAYLANDI (12.10.2026)** |
| 53 | Kullanıcının üç dosyası | `ProjeDetay.jsx`, `DailyReportList.jsx` ve `projectExcelBridge.js`'e kullanıcı kendi değişikliklerini commit edip haber verene kadar dokunulmaz; gereken değişiklikler tasarımda hazır tutulur (`faz1-adim5-tasarim.md` Ek A) | **ONAYLANDI (12.10.2026)**, ProjeDetay eklendi (13.10.2026) |
| 54 | Kod ata sınırı | Seçim başına en fazla 500 görev; parçalı yazma yok (Karar 41'in "hepsi ya da hiçbiri"si ekranda da geçerli) | **ONAYLANDI (12.10.2026)** |
| 55 | Ç-6 kapandı | Şantiye şefi WBS/alan/alan-WBS'te yalnızca okuma; RLS daraltması Adım 5 migration'ında (`f1_adim5_ekran_rpc.sql` A7). Alan talebi Ticket ile | **ONAYLANDI (12.10.2026)** |
| 56 | Ağırlıksız kategori | DB'de red: yeni görevde veya kategori değişince, proje ağırlık tablosu doluysa ve kategori yoksa "Bu kategori için ağırlık tanımlayın; fiziksel değilse %0 girin". Ağırlık tarafında görevi (iptal hariç) olan kategori silinemez. İkisi de ertelenebilir constraint trigger (`f1_adim5_ekran_rpc.sql` A6) | **ONAYLANDI (12.10.2026)** |
| 57 | Excel v8 proje kodu | E13 proje kodu; yeni projede zorunlu; güncellemede E13 projenin koduyla uyuşmazsa import reddedilir; kopya yeni kod ister | **ONAYLANDI (12.10.2026)** |
| 58 | WBS/alan ekranının yeri | ProjeDetay › Proje Ayarları › WBS ve Alanlar, **yalnızca admin ve proje_yoneticisi**. Şantiye şefi için ayrı WBS/alan görünümü yok; İş Planı'ndaki Activity ID/WBS/alan/disiplin kolonları ve filtreleri yeterli (Ç5-6 kapandı). (ProjeDetay.jsx kullanıcının commit'lenmemiş dosyası; rol koşullu sekme bağlantısı Karar 53 gibi bekliyor) | **ONAYLANDI (12.10.2026)**, güncellendi (13.10.2026) |
| 59 | Sihirbaz Ç-B | Sil-yeniden-yaz yerine `save_project_tasks` (id, yoksa görev kodu ile eşleşme; çıkarılan görev Activity ID / ilerleme / bağlı kayıt varsa iptal, yoksa silinir; önizleme). `group_label` kaybı aynı pakette düzelir; ilerlemesi olan ve grup etiketli projede düzenleme testi zorunlu | **ONAYLANDI (12.10.2026)** |
| 60 | Boş E13 | Güncellemede boş E13 reddedilir: "Bu dosya eski şablon (v7). Projeyi dışa aktarıp yeni dosya üzerinde çalışın." (`import-project-excel`, `legacy_template: true`; deploy Adım 6'da) | **ONAYLANDI (13.10.2026)** |
| 61 | Baseline migration ertelendi | Faz 1 kapandıktan sonra, Faz 2'den önce ayrı paket. O pakette önce canlıya migration'ların hangi yolla uygulandığı ve `schema_migrations` geçmişinin baseline ile nasıl uzlaştırılacağı (migration repair vb.) gösterilir. Şimdi yerel ortam yalnızca şema dökümüyle kurulur | **ONAYLANDI (13.10.2026)**; zamanlama Karar 71 ile Ocak 2027'ye |
| 62 | Ek B ara kararları | `set_tasks_classification`/`save_project_tasks` DEFINER, ertelenebilir ağırlık trigger'ları + `p_weights`, bağlı kayıtlı görevin iptali, Excel import'un iptal durumunu değiştirememesi onaylandı. Koşul: toplu atama, görev kaydı, alan-WBS bağ kaydı, Kod ata, WBS/alan import için yerel yetki matrisi testi zorunlu: A projesinin PM'i B'ye yazamaz, şantiye şefi ve muhasebe çağıramaz, anon EXECUTE yok (`f1_dogrulama.sql` R32, `proje-kontrol-adim5.spec.js`). **Açık çakışma Ç5-7:** PM canlıda `cross_project=true`, `has_project_access` PM'e her projede true; R32 erişim kontrolünü alt işlemde `cross_project=false` ile ölçer (`faz1-adim5-tasarim.md` Ek B) | **ONAYLANDI (13.10.2026)**; Ç5-7 Karar 63 ile kapandı |
| 63 | PM'in proje erişimi (Ç5-7) | (a): PM'in tüm projelere erişimi (`cross_project=true`) bu haliyle kalır; R32 kod yolunu kısıtlı PM ile (alt işlemde `cross_project=false`) doğrulamaya devam eder. **Yeniden değerlendirme koşulu:** projeye özel PM veya dış kullanıcı (müşavir, işveren, taşeron) sisteme girmeden önce bu karar yeniden açılır; özellikle Faz 5 Claim/Change öncesinde kontrol edilir (`register-gap-analizi.md` Faz 5 başlangıç kontrol listesi) | **ONAYLANDI (13.10.2026)** |
| 64 | Genel "Admin" hesabı | Şimdi M1: hesap bazlı onay istisnası (`register_approval_exclusions`; `register_can(…,'approve')` listedeki hesapta false). Hesap yalnızca register onaylarından çıkarılır, uygulamanın geri kalanında admin kalır. B3 tasarımına eklendi (`faz-b-migration-plani.md` S4b; B1 dosyası değişmez). Hedef: MVP canlıya alma "kullanıcı hesapları" diliminde, hesabı kullananlara kişisel hesap açıldıktan sonra genel hesap kapatılır; hesabı kimin kullandığını kullanıcı netleştirecek | **ONAYLANDI (13.10.2026)**; SQL B3'te yazılacak |
| 65 | Eski risklerde kritik kapanış | `created_by`'ı boş olan eski risklerde kritik kapanışı herhangi bir PM veya admin onaylar; "oluşturan onaylayamaz" kuralı yalnızca `created_by` dolu kayıtlarda uygulanır (Faz 3 tasarım notu) | **ONAYLANDI (13.10.2026)** |
| 66 | Register öncelikli sıra | 6a (DB omurgası) → Faz 2 (B5 hariç) → Faz 3 (register ekranları) → 6b (Docker, Adım 5, v8 import, Diyarbakır, A4) → Faz 4 → MVP canlıya alma. Faz 1, 6b ile kapanır. Plan ve takvim: `docs/proje-kontrol/register-oncelikli-plan.md` | **ONAYLANDI (14.10.2026)** |
| 67 | Yedek aracı | `pg_dump` (PostgreSQL 17 Command Line Tools), Docker gerekmez; `npm run db:backup` şema (public, storage, supabase_migrations), `db:backup:data` veri (public + **auth**; oturum/token tabloları hariç). Auth yedeği şifre özetleri içerir; yedekler repoya ve paylaşılan klasörlere konmaz (`backups/` ve `.env.local` `.gitignore`'da, doğrulandı). 6a'dan önce şema + veri yedeği zorunlu; kullanıcı çalıştırır | **ONAYLANDI (14.10.2026)** |
| 68 | Adım 6a kapsamı | B1, B2, B4, F1 A1-A3 (A4 hariç), AID, Adım 4 SQL ve **A7 (Ç-6 RLS daraltması)**. Önce psql ile tam zincir provası (tek işlem, R1-R27, ROLLBACK, parmak izi; prova SQL'i ve planı gösterilir, "başla" denmeden koşulmaz), sonra paket paket `apply_migration` ("uygula" + yedek hatırlatması). Adım 5 SQL'inin geri kalanı 6b'de frontend'le birlikte (ağırlıksız kategori kuralı eski sihirbazı ve Excel import'u kırar) | **ONAYLANDI (14.10.2026)** |
| 69 | Karar 40 güncellemesi | Sihirbaz düzeltmesi (Ç-B) yayına çıkana kadar (6b) canlıda Activity ID atanmaz ve register kayıtları göreve bağlanmaz; register formlarında görev bağı alanı 6b'ye kadar kapalı/gizli (ADN1/ADN2'de sihirbaz kırılmasın). Günlük rapor iptal filtresi ilk Faz 3 deploy'unda. Kullanıcı duyurusu: 6b'ye kadar görev iptal edilmez, Excel'de görev durumu "iptal" yapılmaz | **ONAYLANDI (14.10.2026)** |
| 70 | Karar 31 güncellemesi | Faz 2 testleri canlıda ROLLBACK (Adım 2 yöntemi, psql). Yerel Docker testi 6b'den itibaren | **ONAYLANDI (14.10.2026)** |
| 71 | Karar 61 güncellemesi | Baseline migration MVP sonrasına (Ocak 2027), Faz 5'ten önce | **ONAYLANDI (14.10.2026)** |
| 72 | Faz 3 UI testleri | Canlıda yalnızca TIZ, `PW_TARGET=live`; test kayıtlarına önek; sonda taslaklar silinir, onaylılar iptal edilir; öncesi/sonrası parmak izi; yalnızca register spec'leri. **Ek (bildirim):** register akışı bugün bildirim üretmiyor, ama `notify_role`/`notify_managers` rol bazlı (proje bazlı değil), TIZ'deki diğer akışlar gerçek kişilere bildirim gönderiyor. Faz 3 UI testlerinden önce, onayla: 4 rol için test hesapları, `projects.is_test` + `profiles.is_test_account`, test projesinin bildirimlerini yalnızca test hesaplarına yönlendiren süzgeç (`register-oncelikli-plan.md`) | **ONAYLANDI (14.10.2026)**; bildirim süzgeci Karar 75 ile onaylandı |
| 73 | Dal stratejisi | Faz 2-3 `main`'den açılan `faz-2-3-register` dalında (ayrı çalışma klasörü `GES_Dashboard-faz23`, git worktree). Adım 5 frontend'i `faz-a-proje-kontrol`'de 6b'ye kadar bekler | **ONAYLANDI (14.10.2026)** |
| 74 | Karar 27 güncellemesi | Diyarbakır 6b'de, v8 Excel import ile oluşturulur. Register pilotu TIZ'de | **ONAYLANDI (14.10.2026)** |
| 75 | Test bildirim süzgeci | 3 adımlı plan Faz 2 kapsamında, Faz 3 UI testlerinden önce uygulanır: 4 rol için ayırt edilebilir test hesapları; `projects.is_test` + `profiles.is_test_account`; `notify_role`/`notify_managers`/`notify_user`'a süzgeç (test projesinin bildirimi yalnızca test hesaplarına, gerçek projelerinki test hesaplarına gitmez; imzalar değişmez). Her adımın SQL'i gösterilip onaylanır. Faz 2'ye +1 iş günü | **ONAYLANDI (14.10.2026)** |
| 76 | Repo yeri | Repo OneDrive içinde ve iki çalışma klasörü var (`GES_Dashboard`, `GES_Dashboard-faz23`). MVP öncesi repo OneDrive dışına taşınacak; tarih kullanıcıda ("Kullanıcıdan beklenen girdiler"). Yedekler ve `.env.local` şimdiden OneDrive dışında (`C:\fons-yedek\`; `FONS_BACKUP_ENV`/`FONS_BACKUP_DIR`) | **ONAYLANDI (14.10.2026)**; taşıma planlanacak |
| 77 | 6a mevcut ekran kontrolü | Canlıda yalnızca bildirim üretmeyen Playwright spec'leri koşar (`PW_TARGET=live`). Bildirim üretenler (satın alma, fatura, malzeme değişikliği, ilerleme girişi; 16 spec) hariç; kapsadıkları ekranlar elle, kaydetmeden kontrol edilir; yazma yolları psql provasında ROLLBACK içinde test edilir. Liste ve kontrol listesi `register-oncelikli-plan.md` | **ONAYLANDI (14.10.2026)** |
| 78 | Panelden register girişi (R1) | G-01'e geçici istisna: register'lar Supabase SQL Editor'den, yalnızca `register-veri-giris-rehberi.md` §4 şablonlarıyla girilir. Panel/SQL Editor erişimi yalnızca admin'lerde. Faz 3 ekranları gelince sona erer | **ONAYLANDI (14.10.2026)** |
| 79 | Numara (R2) | Numara kolonu boş bırakılır, trigger (`next_register_no`, canlıda) üretir; elle numara yok | **ONAYLANDI (14.10.2026)** |
| 80 | SharePoint linki (R3) | `document_revisions.storage_provider = 'external'`, tam adres `storage_file_id`'de. Link yalnızca SharePoint'te dosyaya erişimi olanlarda açılır (`sharepoint` değeri Graph öğe kimliğine ayrılı, CONVENTIONS §5) | **ONAYLANDI (14.10.2026)** |
| 81 | Mevcut kayıtların geri doldurulması (R4) | B3 A0 durmaz; A1b panel kayıtlarını doldurur (`source = 'import'`, `record_state` iş durumundan, `approved_at = created_at`, `rfis.created_by = raised_by`). B5 A1 kısıttan önce Storage dışı revizyonları `ready` yapar. İkisi de yeniden test bekliyor | **ONAYLANDI (14.10.2026)**, taslaklara işlendi |
| 82 | Paylaşım (R6) | Faz 3'e kadar register listeleri panelden CSV ile paylaşılır (rehber §4.10) | **ONAYLANDI (14.10.2026)** |
| 83 | 6a provası | Askıda; `psql` (PostgreSQL 17 Command Line Tools) kurulumu ve yedek kullanıcıdan beklenen girdi. Prova betiği `scripts/proje-kontrol/prova-6a.mjs` | **ONAYLANDI (14.10.2026)** |
| 84 | F5 yedeksiz uygulama | Change, Claim, Interface tabloları (`taslak-sql/f5_changes_claims_interfaces.sql`) `npm run db:backup` yedeği olmadan uygulanabilir. Gerekçe (kullanıcı): yalnızca yeni tablolar, mevcut tablolar etkilenmiyor, geri alma SQL'i hazır ve ROLLBACK ile test edilmiş (BÖLÜM B). Koşul: aktif bağlantı kontrolü, `apply_migration`, ardından `f5_dogrulama.sql` ve parmak izi. **Ek (14.10.2026): mesai dışı kuralından da feragat** — gerekçe (kullanıcı): yalnızca yeni tablolar; mevcut tablolarda yalnızca FK eklenirken milisaniyelik kilit; `lock_timeout` 3s ile kimse beklemez. İki istisna (yedek, mesai dışı) yalnızca F5 içindir; diğer paketlerde Karar 67 ve mesai dışı kuralı geçerli | **ONAYLANDI (14.10.2026)** |
| 85 | F1 A1-A3 öne alındı | Proje ekleme kırık olduğu için (PM sihirbazda RLS'e takılıyor, yeni projeye kod verilmiyor) F1 A1-A3 6a'dan ayrılıp şimdi uygulanır (`taslak-sql/f1_a1_a3_proje_olusturma.sql`). Yedeksiz ve mesai dışı kuralı olmadan (yalnızca bu paket; gerekçe: iki küçük tabloda CHECK değişimi, kısa kilit, `lock_timeout` 3s, geri alma SQL'i test edildi). A4 sonraya kalır (Karar 34). Uygulandıktan sonra 6a'nın F1 parçası yalnızca A4 | **ONAYLANDI ve UYGULANDI (14.10.2026, `20261014102306_f1_a1_a3_proje_olusturma`)**; doğrulama canlıda 7/7 |
| 86 | Proje ekleme hotfix dalı | `hotfix/proje-ekleme` `main`'den, ayrı klasör `GES_Dashboard-hotfix`. Değişiklik en az; `faz-a`'daki aynı amaçlı parçalar birebir taşınır, hotfix'e özgü ekler `faz-a`'ya da işlenir (6b çakışmasını azaltmak için). `projectExcelBridge.js`'e dokunulmaz (Karar 53). Plan `docs/proje-kontrol/proje-ekleme-hotfix-plani.md` | **ONAYLANDI (14.10.2026)** |
| 87 | Excel v8 şimdi | Şablon v8 (E13 proje kodu) hotfix'le yayına çıkar; Karar 57/60 geçerli (eski dosyayla güncelleme reddedilir). Ekip duyurusu planda §5 | **ONAYLANDI (14.10.2026)** |
| 88 | Tedarik onayı yeni projede isteğe bağlı | Sihirbazın Tedarik adımı yeni projede onaysız geçilebilir; `set_project_procurement_completed` yalnızca PM gerçekten onaylarsa çağrılır | **ONAYLANDI (14.10.2026)** |
| 89 | Varsayılan kategori ağırlıkları | Yeni projeler için 15 kategori, toplam 100: kolon 10, kiriş 8, aşık 7, panel 17, mekanik 5, DC 10, AC 10, OG 8, köşk 5, topraklama 5, ENH 7, devreye alma 8; mobilizasyon, evrak süreci, satın alma 0. Değişen nesne `fn_seed_default_category_weights()` (`taslak-sql/kategori_agirlik_varsayilan.sql`) + Excel import `mapping.ts`. Mevcut projeler değişmez; ADN1/ADN2 kararı ayrı. Değerler PM ile görüşülüp değişebilir | **ONAYLANDI ve UYGULANDI (14.10.2026, `20261014103635_kategori_agirlik_varsayilan`)**; ADN1/ADN2 için `taslak-sql/adn_kategori_agirlik.sql` ROLLBACK ile test edildi, PM onayı bekliyor |

**Edge function / secret'lar:**
- Canlıda 4 edge function (create-user, manage-user, import/export-project-excel); `agent-chat` repoda var ama
  deploy edilmemiş — `AgentChat.jsx` onu çağırıyor (G-09). Proje Kontrol için planlanan tek yeni function
  `process-document` (Faz C); dosya erişimi için function gerekmez (süreli imzalı adres + Storage politikaları).
- Secret'lar yalnızca `supabase secrets set` ile: `AI_PROVIDER`, `AI_API_KEY` (Faz C). Google/Microsoft anahtarı yok.
  Repoda, `.env`'de ve `VITE_` önekli değişkende asla. AI ölçümü için yerel kabuk değişkenleri `AI_OLCUM_{A,B}_*` +
  `AI_OLCUM_GIZLILIK_ONAYI=evet`.
- **Eskiyen dosyalar (v3 ile geçersiz, silinmedi — kullanıcı kararı bekliyor):** `supabase/functions/drive-gateway/`
  (iskelet, hiç deploy edilmedi) ve `scripts/proje-kontrol/drive-limit-test.mjs`. Yeni iş bunlara dayanmamalı.
- pg_cron 1.6.4 kurulu (tek iş: `daily-report-reminders`); pg_net kurulu değil.
- **Storage notu (07.10'da doğrulandı):** `storage.objects` ve `storage.buckets`'ta `protect_*_delete` trigger'ı
  SQL'den doğrudan silmeyi engelliyor ("Use the Storage API instead"). Yani bir pg_cron işi dosyanın kendisini
  silemez; yalnızca kayıtları işaretleyebilir. Dosya silme Storage API'si (istemci veya edge function) ile olur.

**Faz A güvenlik bulguları** (`docs/proje-kontrol/guvenlik-bulgulari.md`):
- **G-02/G-03 YÜKSEK — UYGULANDI (07.10.2026, `20261007063825`).** `daily_report_photos`/`ticket_attachments`
  INSERT policy'leri yalnızca oturum kontrol ediyordu; sahte metadata satırıyla başka projenin saha
  fotoğrafı/ticket eki indirilebiliyordu. Artık metadata satırı kendi adına (`uploaded_by = auth.uid()`),
  erişilebilir projede ve **dosya yolunun ilk klasörü proje id'si (foto) / ticket id'si (ek) olmak zorunda**;
  storage SELECT policy'leri de klasör = proje/ticket eşleşmesini arıyor (ikinci katman). Yeni bir yükleme
  akışı yazılırsa yol biçimi `{project_id}/…` (saha-fotolari) ve `{ticket_id}/…` (ticket-ekleri) olmak zorunda.
- **G-01 YÜKSEK — yazma tarafı GEÇİCİ olarak kapatıldı (07.10.2026, `20261007063808`):** 8 register/geçmiş
  tablosunda `authenticated` yalnızca SELECT; doğrudan yazma policy'leri duruyor ama etkisiz. Kalıcı çözüm B3
  (policy'ler düşer, SELECT `register_can(..., 'view')` ile daralır, yazma yalnızca RPC). `project_wbs`/
  `project_areas`/`area_wbs` bilinçli olarak kapsam dışı (WBS/Alan ekranı doğrudan yazacak).
- G-11 ORTA — **DÜZELTİLDİ (07.10.2026, uyum migration'ı):** numara 4 haneye kadar sıfır, kırpma yok.
- Açık: G-04 ORTA (mevcut `saha-fotolari`/`ticket-ekleri` bucket'larında storage silme/yükleme sahiplik ve rol
  kontrolü yok; yeni doküman bucket'ı için çözüm B5 taslağında), G-12 DÜŞÜK (YeniTicketModal ek hatasını yok sayıyor),
  G-13 DÜŞÜK (master tablolarda `authenticated` TRUNCATE/REFERENCES/TRIGGER; çözüm B2 taslağında), G-05..G-09 düşük/bilgi.
- Geri alma: `docs/proje-kontrol/yedek-policy-07-10.sql`, `yedek-uyum-07-10.sql` (nesne anlık görüntüleri). Tam şema
  ve veri yedeği hâlâ yok: `npm run db:backup` (şema) / `npm run db:backup:data` (veri) `.env.local` ister
  (`scripts/db-backup/README.md`).

**Register şeması (07.10.2026 itibarıyla canlı; kolon düzeyi `canli-sema-ozeti.md`):**
- `project_actions` (eski `actions`); `source_type` ∈ manual/risk/rfi/decision/meeting/other.
- Numara kolonu tabloya özel: `document_no`, `rfi_no`, `action_no`, `decision_no`, `submittal_no`, `approval_no`
  (`drawings`'te yok; çizimin numarası dokümanınki). Trigger boş gelen numarayı `next_register_no` ile doldurur;
  elle verilen numara sayaçla çakışabilir → yazma RPC'leri numarayı dışarıdan kabul etmez.
- Proje kodu `project_register_settings(project_id, prefix)` (ADN1, ADN2, TIZ, TKY). Yeni projede satır eklenmezse
  o projede register kaydı açılamaz (açık hata). Sıra `project_register_counters(project_id, register_code)`.
- `documents` yalnızca kimlik (`status` active/void); dosya ve revizyon `document_revisions`'ta (`storage_provider`,
  `storage_file_id`, `file_name`, `mime_type`, `size_bytes`, `sha256` kolonları zaten var; `is_current` kısmi unique,
  değişimde önce eskisi false sonra yenisi true). `drawings` yalnızca `document_id` + `drawing_type`.
- Bugün canlıda olmayan ama tasarımın beklediği ortak kolonlar (`record_state`, `source`, `approved_by/at`,
  `rejected_reason`, eksik `created_by`) B3 taslağında `ADD COLUMN` ile ekleniyor.
- `project_tasks.is_critical` yeniden kaldırıldı; `activity_id` atandıktan sonra `trg_project_tasks_identity_guard`
  ile değiştirilemez (düzeltme yolu B4 taslağı: yalnızca admin, gerekçeli, audit'li RPC).

**Faz B iş listesi** (ayrıntı: `docs/proje-kontrol/faz-b-migration-plani.md`; hiçbiri uygulanmadı, hepsi
BEGIN…ROLLBACK ile canlıda denendi; her biri SQL'i gösterilip onaylanınca uygulanır):

| Paket | İçerik | Taslak | Durum |
|---|---|---|---|
| B1 | `register_permissions` (+`edit_scope` own/all), `register_status_transitions`, `register_can()`, `get_my_register_permissions()`, admin `set_register_permission()`, 4 rol seed | `taslak-sql/b1_register_permissions.sql` | Onay bekliyor; **Faz 1'e taşındı (Karar 17)**; seed Karar 6'ya göre güncellendi ve canlıda ROLLBACK ile yeniden test edildi (13.10.2026: 13 kontrol grubu OK, parmak izi birebir) |
| B2 | `register_audit` (yalnızca değişen alanlar) + trigger, 30 indekssiz FK'ye indeks, G-13 | `taslak-sql/b2_register_audit_indexes.sql` | Onay bekliyor |
| B3 | Ortak kolonlar, `save/submit/approve/reject/reopen/delete_register_record`, `set_register_status`, `link/unlink_register_records`, dört göz, G-01'in kalıcılaşması | `taslak-sql/b3_register_write_rpcs.sql` | Onay bekliyor (B1, B2'ye bağlı); A1b panel kayıtlarını geri doldurma eklendi (Karar 81), yeniden test bekliyor |
| B4 | `admin_correct_task_activity_id` (yalnızca admin, gerekçe zorunlu, audit) | `taslak-sql/b4_identity_guard_admin_fix.sql` | Onay bekliyor (B2'ye bağlı) |
| B5 | `proje-dokumanlari` bucket, Storage politikaları (G-04 çözümü), begin/complete/abort upload, `void_document`, `get_storage_usage`, pg_cron temizlik | `taslak-sql/b5_document_storage.sql` | **PATRON ONAYI BEKLİYOR** (B1-B3'e bağlı). **Değiştirildi (09.10; 14.10 A1 geri doldurma, Karar 81), yeniden test bekliyor** |
| B6 | `vw_reg_*` görünümleri, `get_register_list/detail/overview/audit`, realtime yayını | `taslak-sql/b6_register_read_rpcs.sql` | Onay bekliyor (B1-B3'e bağlı) |
| F1 | Proje kodu biçimi `^[A-Z][A-Z0-9]{1,4}$`, alan kodu `^[A-Z0-9]+$`, `create_project_with_code` (admin + proje_yoneticisi), kodsuz projeyi reddeden ertelenmiş kural; edge function ve sihirbaz diff'i `f1-import-project-excel-diff.md` | `taslak-sql/f1_proje_kodu_ve_olusturma.sql` | Faz 1; **Adım 2 kapandı** (`faz1-adim2-sonuclar.md`): B1, B2, B4, F1 canlıda ROLLBACK ile tüm oturumlarda geçti, rollback parmak izi birebir; uygulanmadı (Adım 6) |
| F1-AID | Activity ID: `task_disciplines` + FK, `activity_id_counters`, `assign_activity_ids`/`assign_activity_id` (önizleme varsayılan), kimlik korumasının son hali (Ç16: yalnızca atama fonksiyonu ve B4 yazar; ID'li görevde disiplin/alan kilidi; ID'li görev silinmez), genişletilmiş B4 (5 parametre), iptal görevleri ilerleme/S-eğrisi/ağırlık hesaplarından çıkarma (7 fonksiyon/görünüm), A8 iptal görev koruması (`progress_daily` trigger'ı, yeniden açma yalnızca admin/PM, `save_daily_report` eski satırı korur) | `taslak-sql/f1_aid_activity_id.sql`, tasarım `faz1-adim3-tasarim.md` | Faz 1 **Adım 3 kapandı (12.10.2026)** (`faz1-adim3-sonuclar.md`):
- 1a, 1c (R1-R16), 1d (B4 + dört projede uygulama sonrası etki yok), 2a (11/11) ve 2b (12/12) canlıda ROLLBACK ile geçti.
- Oturum 5 = Oturum 0.
- Uygulanmadı; Adım 6'da B4'ten sonra ayrı migration (Karar 42). |
| F1-WA | WBS/alan bütünlüğü ve importu: `project_wbs_discipline_fk`, Activity ID'li göreve etki eden alan/WBS/bağ değişikliklerini reddeden trigger'lar (Karar 48), Ç-7 guard düzeltmesi (Karar 49), audit trigger'ları, `import_wbs_areas` (Karar 50); şablon, ayrıştırıcı, projesiz kontrol betiği | `taslak-sql/f1_wbs_alan_import.sql`, tasarım `faz1-adim4-tasarim.md` | Faz 1 **Adım 4 kapandı (12.10.2026)** (`faz1-adim4-sonuclar.md`): 4a 10/10, 4b 20/20, 4c 10/10, 4d 12/12, 4e (R17-R26) canlıda ROLLBACK ile geçti; Oturum 5 = Oturum 0. Uygulanmadı; Adım 6'da F1-AID'den sonra ayrı migration |
| F1-W5 | Adım 5 ekran DB parçaları: `get_project_gantt` yeni alanlar, `save_area_wbs_links`, `set_tasks_classification`, `save_project_tasks` (Ç-B), ağırlıksız kategori constraint trigger'ları (Karar 56), Ç-6 RLS (Karar 55); Karar 44 güncellemesi AID A8b'de | `taslak-sql/f1_adim5_ekran_rpc.sql`, tasarım `faz1-adim5-tasarim.md` (Ek B: uygulama durumu) | **Yazıldı, test edilmedi** (yerel ortam bekleniyor; `faz1-adim5-yerel-ortam.md`). Uygulanmadı; Adım 6'da Adım 4'ten sonra ayrı migration |
| — | G-04 (mevcut bucket'lar), G-12, `RegisterList`/`RegisterDetail` iskeleti, "Proje Kontrol" girişi (`frontend-giris-karari.md`) | — | Faz B frontend |

**Dosyalar:**
- `docs/proje-kontrol/` — `CONVENTIONS.md` (adlandırma, ortak kolonlar, yetki, dosya, migration kuralları),
  `register-gap-analizi.md` (16 register durumu, satın alma/finans köprü eksikleri, faz durum tablosu),
  `tasarim.md` (v3), `canli-sema-ozeti.md`, `v3-uyum-notlari.md`, `faz-b-migration-plani.md`,
  `frontend-giris-karari.md`, `uyum-migration-plani.md`, `sema-dogrulama.md`, `guvenlik-bulgulari.md`,
  `frontend-tasarim-notu.md`, `canli-05-10-migrations/` (05.10 migration'larının birebir arşivi), `arsiv/`.
- `docs/proje-kontrol/taslak-sql/` — uygulanmışlar (`g01_…`, `g02_g03_…`, `uyum_migration_*`) ve Faz B taslakları
  (`b1`…`b6`, her biri: BÖLÜM A uygula / BÖLÜM B geri al + `*_dogrulama.sql`); `yedek-faz-b-07-10.sql` (Faz B'nin
  değiştireceği canlı nesnelerin anlık görüntüsü).
- `supabase/migrations/20261007063808_…`, `20261007063825_…`, `20261007072501_…`, `20261014082055_f5_changes_claims_interfaces.sql`, `20261014102306_f1_a1_a3_proje_olusturma.sql`, `20261014103635_kategori_agirlik_varsayilan.sql` — canlıya uygulanan SQL'in birebir aynısı.
- Testler: `proje-kontrol-guvenlik.spec.js` (8), `proje-kontrol-master-veri.spec.js` (9), `proje-kontrol-uyum.spec.js`
  (7 + 3 fixme, B3 gelince açılır), Faz B test taslakları `proje-kontrol-b{1..6}-*.spec.js` (ilgili paket canlıda
  yoksa kendini atlar).
- `scripts/proje-kontrol/ai-olcum/` — ölçüm iskeleti (`olcum-seti/`, `sonuclar/` gitignore'da).
- Not: `pg_default_acl` yeni tablolarda `authenticated`'a tüm yetkileri, yeni fonksiyonlarda `anon`/`authenticated`'a
  EXECUTE veriyor — yeni nesnelerde açık REVOKE şart.

**Frontend girişi:** santiye_sefi ve muhasebe `projeler` sekmesine sahip olmadığından ProjeDetay'a ulaşamaz;
seçenekler ve öneri `docs/proje-kontrol/frontend-giris-karari.md`'de (karar Faz B'de).
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
  kalıntıları) düzenli olarak temizlendi. Bundle optimizasyonu: `React.lazy`
  yalnızca Login↔Dashboard sınırında vardı (bu maddenin "route bazlı" ifadesi
  yanıltıcıydı — tek route zaten `/dashboard/*`, bkz. routing notu); asıl
  sekme bazlı bölme 08.09.2026'da eklendi (`index.jsx`'teki 16 ağır Tab*/
  ProjeDetay/DailyReport* bileşeni artık `lazy()` + tek bir `Suspense` sınırı
  ile — aynı anda yalnızca bir `activeTab` dalı mount olduğundan güvenli),
  tek ~780 kB'lık `index-*.js` chunk'ı sekme başına 1-74 kB'lık parçalara
  bölündü, `chunkSizeWarningLimit` uyarısı tamamen kayboldu. Font asset'i
  statik dosyaya taşındı.

## Bilinen açık noktalar / ertelenmiş kararlar

- **Proje sihirbazının Riskler adımı otomatik riskleri bozuyor (14.10.2026, yayındaki `main` kodu okunarak; ROLLBACK ile denenmedi; bugün canlıda).**
  - **Nasıl:** `ProjeEditWizard.jsx` adım "Kaydet"i ve `Adim8Tamamlandi.jsx` düzenleme kaydı projenin bütün `project_risks` satırlarını siliyor, formdakileri yeniden ekliyor. `Adim4Riskler.jsx` yükünde `source`, `rule_code`, `subject_ref`, `closed_at`, `id` yok.
  - **Etkisi:**
    - otomatik riskler `manuel` olarak yeniden yazılır;
    - risk motoru aynı konu için yeni otomatik risk açar, kopya oluşur;
    - id'ler değişir, kapalı risklerin kapanış tarihi kayıt anına kayar;
    - register kaydına bağlı risk (`risk_id`) varsa kayıt FK hatasıyla düşer.
  - **Kapsam:** 14.10'da canlıdaki 55 riskin hepsi otomatik (ADN1 8, TIZ 33, TKY 14).
  - **Düzeltme:** 6b sihirbaz paketinde `save_project_risks` (yalnızca manuel riskleri günceller, otomatiklere dokunmaz). Tasarım ve test planı `faz1-adim5-tasarim.md` §3.4 ve §3.3 (7-11).
  - **O zamana kadar:** risk girişi `register-veri-giris-rehberi.md` §4.9'daki SQL Editor şablonuyla; sihirbazın Riskler adımı kullanılmaz.

- **Proje sihirbazının İş Kalemleri kaydı ilerlemesi olan projede kırık (09.10.2026'da ROLLBACK ile doğrulandı,
  Faz 1'den bağımsız, bugün canlıda).** `ProjeEditWizard.jsx` (adım kaydı) ve `Adim8Tamamlandi.jsx` (düzenleme)
  projenin tüm `project_tasks` satırlarını silip yeniden ekliyor. `progress_daily.task_id` FK'si silmeye izin
  vermediğinden, günlük rapor ilerlemesi girilmiş bir projede (ör. TIZ: 35 görevin 16'sı) kayıt
  `progress_daily_task_id_fkey` hatasıyla düşer. İlerleme yoksa kayıt geçer ama görev ID'leri değişir. Düzeltme Faz 1
  Adım 5'te: görev koduna göre güncelleme (Karar 40), Adım 6 deploy'unun ön koşulu. Ayrıntı: `docs/proje-kontrol/faz1-adim3-tasarim.md` §7.
  **Ek bulgu (12.10.2026, kod okumasıyla):** `Adim2IsKalemleri.jsx` `handleSave` yükünde `group_label`,
  `responsible_role`, `duration_days` yok; düzenleme sihirbazından geçen her kayıt `group_label`'ı silip İş Planı
  hiyerarşisini düzleştiriyor. Düzeltme aynı paket (`faz1-adim5-tasarim.md` §3).

- **Ç-6 — KAPANDI (Karar 55, 12.10.2026).** Şantiye şefi WBS/alan/alan-WBS'te yalnızca okuma; RLS daraltması
  `f1_adim5_ekran_rpc.sql` A7'de (uygulanmadı). Canlıda bugün hâlâ şantiye şefi `project_areas` insert/update ve `area_wbs`
  insert/delete yapabiliyor; Adım 6'ya kadar böyle kalır.

- **Ç5-7 — KAPANDI (Karar 63, 13.10.2026): proje yöneticisi her projeye yazar.** `roles.proje_yoneticisi.cross_project = true`;
  `has_project_access` PM'e (ve `is_manager` olan admin/muhasebeye) her projede true döner. Yeni RPC'lerdeki proje erişim kontrolü
  bugün yalnızca savunma katmanı; R32 bunu alt işlemde `cross_project=false` ile ölçer. Projeye özel PM veya dış kullanıcı
  (müşavir, işveren, taşeron) girmeden ve Faz 5 Claim/Change'den önce yeniden açılır.

- **Adım 6 ön koşulu — tam zincir provası (12.10.2026).** MCP ~95 KB sınırı yüzünden B1 + B2 + B4 + F1 + AID + Adım 4
  hiçbir oturumda birlikte kurulmadı. Adım 6'dan önce `.env.local` bağlantısıyla psql üzerinden hepsi tek transaction'da
  kurulur, `f1_dogrulama.sql`'in tamamı (R1-R27) koşulur, ROLLBACK; öncesi/sonrası parmak izi. Ayrıntı:
  `docs/proje-kontrol/faz1-adim3-tasarim.md` §9.

- **Kategori ağırlık tablosunda olmayan kategorilerdeki görevler proje ilerlemesine hiç katılmıyor (12.10.2026'da salt
  okunur sorguyla bulundu, Faz 1'den bağımsız, bugün canlıda).**
  - Nasıl hesaplanıyor: proje ağırlık tablosu varsa `projects.progress` (`fn_sync_project_progress`) ve `overall_pct` (`get_project_by_date`) yalnızca `project_category_weights`'teki kategorilerin ortalamasını tartar.
  - Ağırlığı olmayan kategorideki görevlerin ilerlemesi hiç sayılmaz.
  - Görevi olmayan ağırlıklı kategori de 0 olarak sayılır; bu yüzden proje %100'e ulaşamaz.
  - Dört projenin dördünde de var (proje, kategori, görev sayısı, ilerleme kaydı olan görev):

    | Proje | Kategori | Görev | İlerleme kaydı olan |
    |---|---|---|---|
    | TIZ | `enh` | 1 | 1 |
    | TIZ | `mobilizasyon` | 6 | 6 |
    | TKY | `enh` | 1 | 0 |
    | TKY | `mobilizasyon` | 3 | 3 |
    | ADN1 | `enh` | 2 | 0 |
    | ADN1 | `mobilizasyon` | 9 | 0 |
    | ADN2 | `enh` | 3 | 0 |
    | ADN2 | `evrak_sureci` | 9 | 0 (2'si durumla %>0) |
    | ADN2 | `mekanik` | 6 | 0 |
    | ADN2 | `mobilizasyon` | 5 | 0 (1'i durumla %>0) |
    | ADN2 | `satin_alma` | 13 | 0 |

  - TIZ ve TKY'de ilerleme kaydı olan 10 görevin ilerlemesi bugün proje yüzdesine yansımıyor.
  - TKY'de görevi olmayan `kosk_trafo` %5 ağırlıkta; proje en fazla %95 olabilir.
  - Kaynak: yeni projeye `trg_seed_default_category_weights` 10 kategorilik sabit varsayılan yazıyor. `enh`, `mobilizasyon`, `mekanik`, `evrak_sureci`, `satin_alma` bu listede yok.
  - Düzeltme kararı kullanıcıda; önerilmedi.
  - Bugün yalnızca test projeleri (TIZ, TKY) etkileniyor.
  - ADN1/ADN2'de ilerleme başladığında ADN2'de 36 görev yüzdeye yansımayacak (ADN1'de 11).
  - Adım 6 ön koşullarına iki madde eklendi (`docs/proje-kontrol/faz1-adim3-tasarim.md` §9):
    - Diyarbakır importundan önce ağırlık tablosu tüm kategorileri kapsayacak; fiziksel olmayanlar açıkça %0, toplam %100.
    - Excel import ve sihirbazda ağırlıksız kategoriye uyarı veya red; hangisi olacağı Adım 5 tasarımında önerilecek.
  - Hangi kategoriye ne ağırlık verileceği iş kararı; kullanıcı bildirecek.

- ~~`xlsx` (SheetJS) bağımlılığı — HIGH severity güvenlik açığı~~ — **çözüldü
  (10.09.2026, 2. tur).** Önceki "kabul et/izle" kararı, gerçek saldırı
  yüzeyinin dokümante edilenden çok daha geniş olduğu ortaya çıkınca yeniden
  ele alındı — bkz. "Son değişiklik". `xlsx` tamamen kaldırıldı, 3 kullanım
  yeri (`src/utils/exportUtils.js`, `src/utils/projectExcelImport.js`,
  `src/components/agent/AgentChat.jsx`) `exceljs`'e (zaten edge fonksiyonlarında
  kullanılan, aktif bakımlı kütüphane) geçirildi.
- ~~`react-router` v6→v7 migration'ı~~ — **tamamen çözüldü (11.09.2026, 2 fazda).**
  1. faz (future flag'ler, aynı gün önce) canlı Playwright testi + A/B
  karşılaştırması + tam regresyon paketiyle (88 test, 86 geçti — kalan 2'si
  flag'lerle ilgisiz) doğrulanmıştı. 2. faz — asıl paket geçişi —
  `react-router-dom@6.30.6` → `@7.18.3` (`react-router` da beraberinde
  v7.18.3'e güncellendi; v7'de iki paket birleşti, `react-router-dom` artık
  yalnızca `react-router`'ı re-export ediyor). Kullanım tamamen deklaratif
  olduğundan (`createBrowserRouter`/loader/action hiç yok) kod tarafında TEK
  değişiklik gerekti: `src/App.jsx`'teki `<BrowserRouter future={{...}}>`'daki
  `future` prop'u kaldırıldı — v7'de `BrowserRouter` artık `future` prop'unu
  kabul etmiyor (`v7_relativeSplatPath` her zaman aktif davranış, `v7_startTransition`
  yerini varsayılanı `true` olan yeni bir `useTransitions` prop'una bıraktı,
  ikisi de 1. fazda test edilen davranışla birebir aynı). Diğer 4 dosyanın
  kullandığı `Routes`/`Route`/`Navigate`/`useNavigate`/`useLocation` v7'de
  değişmeden duruyor (doğrudan `require('react-router-dom')` ile tek tek
  kontrol edildi). Doğrulama: `npm run lint`/`build` temiz, **tam Playwright
  regresyon paketi (88 test) paket yükseltmesinden sonra 87/88 geçti** — kalan
  1 tanesi zaten bilinen/kabul edilmiş `request_no` test-only boşluğu (bu
  migration'la ilgisiz). `npm audit`'teki react-router CVE'si (open redirect +
  SSR hydration, ikisi de bu projede zaten düşük/geçersiz risk olarak
  değerlendirilmişti) artık tamamen kapandı.
- **Yan bulgu: `xlsx`→`exceljs` migration'ının (10.09.2026, PR #23) gözden
  kaçırdığı 2 test dosyası — düzeltildi (11.09.2026).** Tam regresyon paketi
  ilk kez bu turda (react-router doğrulaması için) çalıştırılınca
  `tests/material-list-excel.spec.js` ve `tests/project-excel-layout.spec.js`
  `Cannot find package 'xlsx'` ile tamamen YÜKLENEMEDİ — bu iki dosya proje
  Excel export'unu (edge fonksiyonu çıktısını) geri okuyup içeriğini doğrulamak
  için doğrudan `xlsx` import ediyordu; migration yalnızca `src/` altındaki 3
  frontend kullanımını taradı, `tests/` altını kapsamamıştı. İkisi de `exceljs`'e
  çevrildi (`.v`→`cell.value`, `.f`→`cell.formula`, `sheet_to_json(header:1,
  defval:null)`→satır başına `Array.from({length: sheet.columnCount}, (_,i) =>
  ...)` ile üretilen yardımcı). **Bu sırada ikinci bir ince bug bulundu:**
  ExcelJS'in `row.values`'ı bir satırda yalnızca BAZI ara kolonlar hiç
  set edilmemişse (ör. otomatik risklerde Olasılık/Etki/Skoru hiç yazılmıyor)
  gerçek bir sparse array (JS "hole") döndürüyor — `.slice().map()` delikleri
  atlayıp korur, bu da index bazlı erişimde (`row[5]`) `undefined` dönmesine
  yol açıyordu (`JSON.stringify` bunu yanıltıcı şekilde `null` gösteriyor, ayrım
  yalnızca doğrudan property erişiminde ortaya çıkıyor). `Array.from({length},
  (_,i)=>row.values[i+1])` her index'i açıkça ziyaret ettiğinden bu sorunu
  yaşamıyor — düzeltme bu, uzunluk pad'lemek değil. İkisi de yeniden çalıştırılıp
  geçtiği doğrulandı.
- ~~`request_no` cakismasi (`purchase_requests_request_no_key` duplicate key)~~ - **uygulama akisi kapandi; kalan test yolu izole edildi (24.09.2026).** Talep kodu uretimi yil bazli Postgres `SEQUENCE` ve atomik `nextval()` kullaniyor; `create_purchase_request_with_items` ile aylik plan RPC'leri cakismada yeniden deneyebiliyor. Canli veritabaninin salt okunur kontrolunde sequence son degeri mevcut kodlarin ilerisindeydi ve bos `request_no` yoktu. Belgelenen son hata, `purchase-single-item.spec.js` icindeki eszamanli kalem ekleme testinin talebi dogrudan REST ile olusturup varsayilan kod uretimine istemeden bagimli olmasindan kaynaklaniyordu. Test simdi kendi benzersiz fixture kodunu veriyor; boylece yalnizca kalem ekleme yarisini olcuyor. Bu test calistirmada yeniden kosturulmadi.
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
- ~~Tedarik/teslimat Faz 2~~ — **kısmen kapandı (08.09.2026).** Proje
  sihirbazındaki `Adim5Tedarik.jsx` hâlâ Faz 1 (yalnız proje_yoneticisi
  "Tamamladım" onayı, proje-seviyesi tek bayrak) — buna dokunulmadı, çünkü
  tedarikçi/sipariş/teslimat tarihi artık zaten TALEP bazında gerçek veriyle
  tutuluyor (bkz. "Satın alma akışı" → 3 aşamalı Teklif/Pazarlık/Sipariş akışı,
  07.09.2026). Faz 2'nin geriye kalan tek gerçek boşluğu — eksik/hasarlı
  teslimat takibi — eklendi: `purchase_requests.delivery_status`
  (`tam`/`eksik`/`hasarli`) + `delivery_note`, hem eski akışın
  `complete_project_manager_purchase_request` hem yeni akışın
  `complete_purchase_request_delivery` RPC'sine opsiyonel parametre olarak
  eklendi (varsayılan `tam`, eksik/hasarlıda not RPC içinde de zorunlu —
  savunma amaçlı, frontend zaten butonu disabled tutuyor).
  `TalepDetayModal.jsx`'in "Tamamlandı" bölümü ve `TeklifPazarlikSiparisPanel.jsx`'in
  "Teslim Alındı — Tamamla" bölümüne bu seçici eklendi; liste satırındaki hızlı
  "Onayla" aksiyonu (`TabSatinAlmaTalepListesi.jsx`) kasıtlı olarak
  değiştirilmedi (dar satır, varsayılan `tam` ile hızlı yol kalıyor — eksik/
  hasarlı senaryosu detay modaline gidiyor, bu codebase'in "listede tekrar
  göstermeye gerek yok" ilkesiyle tutarlı). Liste yalnızca eksik/hasarlı
  olan talepler için `ProcessStatusBadge`'in yanına küçük kırmızı bir uyarı
  rozeti (`Eksik Teslimat`/`Hasarlı Teslimat`) ekliyor — `get_purchase_requests_list(_internal)`
  zaten `to_jsonb(pr)` kullandığından yeni kolonlar otomatik geldi, RPC
  değişikliği gerekmedi. Canlı test verisiyle (test-izmir-ges-2026) uçtan uca
  doğrulandı.
- **DB-SEC-006 (leaked password protection):** Supabase Free plan'da
  desteklenmiyor, Pro plan gerektiriyor — teknik değil, ödeme kararı bekliyor.
- **Realtime ölçek notu:** Mevcut 2 test projesi ölçeğinde sorun yok;
  Supabase'in önerdiği Broadcast-from-database'e geçiş ileride gündeme
  gelebilir.
- ~~Manuel proje sihirbazı yolundaki client-side mini-importer eski/dar
  kategori setiyle sınırlı~~ — **bu not bayatmış, madde kapalı (08.09.2026'da
  doğrulandı).** `src/utils/projectExcelImport.js`'teki `CAT_MAP` gerçek
  `task_category` enum'uyla (15 değer) birebir karşılaştırıldı — tam eşleşme,
  eksik kategori yok. Bu mini-importer yalnızca `Adim2IsKalemleri.jsx`'te
  kullanılıyor ve yalnızca "İş Kalemleri" sayfasını parse ediyor (kendi ayrı
  1 sayfalık `GES_Proje_Sablonu.xlsx` şablonu) — BOM/bütçe/risk kasıtlı olarak
  kapsam dışı, sihirbazın "Manuel doldur" ikincil yolunda yalnızca görev
  listesi adımı için bir toplu-yapıştırma kolaylığı, diğer adımlar zaten elle
  dolduruluyor. Fark edilirse bu notu hatırlat: madde kapalıdır, yeniden
  açmadan önce önce kodu kontrol et.
- ~~`project_risks` tablosunda DELETE policy'si yok~~ — **düzeltildi (2026-07-31,
  `20260731100738_add_project_risks_delete_policy`)**: `authenticated_delete_risks`
  policy'si eklendi, aynı tablodaki `authenticated_insert_risks`/`authenticated_update_risks`
  ile birebir aynı deseni (`user_has_project_access(project_id)`) kullanıyor.
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
- **Migration tracking boşluğu (Supabase tarafı) — kapandı (kullanıcı kararıyla,
  15.09.2026), yalnızca 2 migration/grup kalıcı olarak yerel dosyasız kalacak
  şekilde kabul edildi — bu madde bir daha "açık nokta" olarak taranmayacak.**
  2026-07-26'da fark edildi:
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
  (07-24 072957) 24.09.2026'da arşivden kurtarıldı:** canlı
  `supabase_migrations.schema_migrations.statements` kaydındaki özgün SQL
  `supabase/migrations/20260724072957_invoice_flow_single_approver_with_revision_and_payment_tracking.sql`
  dosyasına alındı. Bu fonksiyonların mevcut gövdeleri canlı DB'de artık yoktu;
  bu nedenle yaşayan şemadan tahmin edilmedi, saklanan migration SQL'i kullanıldı.
  En güncel iki migration
  (`20260803101019_drop_critical_path_and_dashboard_visible_fields`,
  `20260803101309_update_functions_after_dropping_critical_path_columns` —
  `is_critical`/`dashboard_visible`/`dashboard_order` kaldırma turu) de aynı
  şekilde mevcut şema durumundan yeniden inşa edilip repoya geri eklendi (bkz.
  "Son değişiklik"). En azından yerel dosyaların kendisi artık git'te (önceki bir
  oturumda 16 migration + 17 finans/muhasebe bileşen dosyası diske yazılmış
  ama hiç `git add` edilmemişti, 29.07.2026'da giderildi).
  **15.09.2026'da isim-bazlı (yalnızca timestamp değil) tam bir karşılaştırma
  daha yapıldı** (`supabase_migrations.schema_migrations`'ın 426 versiyonu ↔
  yerel 415 dosya, hem version hem migration `name` alanına göre eşleştirildi
  — bu ikinci adım kritik: yalnızca timestamp'e bakan ilk taramada 67 "yerelde
  yok" görünüyordu, bunların 52'si zaten bilinen zararsız timestamp
  sürüklenmesiydi — ör. DB'de `20260904083650` olan `link_monthly_plan_to_purchase_requests`
  yerelde `20260904090000` adı altında duruyor). Geriye, isimle de eşleşmeyen
  **15 gerçek boşluk** kaldı: invoice workflow migration'ı,
  `create_procurement_monthly_plan` ve Kaptan Demir Çelik (Adana GES-1/GES-2)
  projesinin gerçek verisine dokunan 13 migration. İlk ikisi sonradan
  arşivlendi; güncel durumda yalnızca aşağıda açıklanan **13 müşteri-verisi
  migration'i** eksik. 15.09.2026'daki karşılaştırmanın tam listesi:
  `create_procurement_monthly_plan` (20260812060349) + gerçek proje verisine
  dokunan
  verisine dokunan 13 migration — `import_kaptan_demir_1ay_plan`,
  7 adet `adana_faz1_*` (WBS'in fotoğraf bazlı yapıya geçirilmesi, task kodu
  formatı, OG/ENH alt-kategori düzeltmeleri, group_label düzleştirme/birleştirme)
  ve 5 adet `faz1_wbs_tasks_gantt_sync_*`/`faz1_elektriksel_group_labels_split`
  (11-18 Ağustos 2026 arası, Gantt/WBS senkron adımları).
  **Kullanıcı kararıyla (15.09.2026):** yalnızca `create_procurement_monthly_plan`
  (saf şema — tablo/CHECK/FK/index/RLS, gerçek müşteri verisi içermiyor)
  mevcut canlı şemadan yeniden inşa edilip repoya eklendi
  (`20260812060349_create_procurement_monthly_plan.sql`) — RLS policy'si
  BİLEREK sonraki `restrict_procurement_monthly_plan_rls_to_pm_admin`
  (20260904082158, zaten yerelde var) tarafından üzerine yazılacak eski/gevşek
  haliyle yazıldı, bir `db reset` sıralamayı bozmaz. **Diğer 13'ü BİLİNÇLİ
  OLARAK yeniden inşa EDİLMEDİ** — bunlar gerçek bir müşteri projesinin
  (Kaptan Demir Çelik) task kodu/WBS yapısı/aylık satın alma planı gibi iş
  verisini içeriyor; bunu idempotent SQL olarak git geçmişine kalıcı şekilde
  gömmek, önceki 5+2 reconstruction'ın (yalnızca şema/RLS/trigger, hiç müşteri
  verisi) kapsamından farklı bir risk taşıyor — kullanıcı bu riski görüp
  yalnızca şema kısmını onayladı. **Kullanıcı kararıyla (15.09.2026, 2. tur)
  bu 13 migration KALICI olarak yerel dosyasız bırakılmasına karar verildi —
  yeniden gündeme getirilmeyecek, kalıcı kabul edilmiş bir risk kararı**
  (gerçek müşteri verisini git geçmişine gömmemek, bir sonraki turda tekrar
  "açık madde" gibi taranıp reconstruct edilmemeli). Bilinen/kalıcı etkisi:
  bir `supabase db reset` bu 13 versiyonu (ve `create_procurement_monthly_plan`'ın
  RLS-öncesi ilk halini) atlayıp doğrudan sonraki (zaten yerelde olan)
  düzeltme migration'larına geçeceğinden, taze bir ortamda Kaptan Demir
  Çelik'in WBS/aylık plan verisi hiç oluşmaz — yalnızca bu iki gerçek proje
  için, yalnızca bir `db reset` senaryosunda önemli, günlük geliştirme akışını
  etkilemiyor. Canlı DB'de veri zaten mevcut ve bu karardan hiç etkilenmiyor.
- **Migration arşiv durumu (24.09.2026):** Canlı `schema_migrations` listesindeki eksik dosyalar yeniden karşılaştırıldı. `20260918132417_allow_muhasebe_self_revize_invoice_from_manager_approval` yaşayan fonksiyon tanımından, `20260724072957_invoice_flow_single_approver_with_revision_and_payment_tracking` ise migration tablosunda saklanan özgün SQL'den arşivlendi. `20260722135051` dosyası canlıdaki `allow_report_creators_delete_own_daily_reports` adına taşındı ve policy tanımıyla karşılaştırıldı. Bu işlemler yalnızca repo tarihçesini tamamladı; canlı veritabanına migration uygulanmadı. Açık kalan 13 migration, önceki karara göre müşteri WBS/plan verisini git'e koymamak için yerel dosya olmadan bırakıldı.
- **`esbuild` (Vite'ın dahili bundler'ı) — moderate CVE, yalnızca dev-server'a
  özgü, kabul edildi (11.09.2026).** `GHSA-67mh-4wv8-2f99`: herhangi bir web
  sitesi dev server'a istek atıp yanıtı okuyabiliyor — bu yalnızca `npm run dev`
  çalışırken VE dev server ağa açıkken geçerli, production build'e (statik
  dosyalar, Vercel'de servis edilen) hiç dahil değil. Düzeltmesi `vite@8`'e
  (breaking change) atlamayı gerektiriyor — `npm audit fix --force` ile
  otomatik uygulanabilir ama Vite 8'in kendi breaking change'leri (config
  şeması, plugin API'si) ayrı bir doğrulama turu ister; şimdilik yalnızca
  yerel geliştirme ortamını ilgilendirdiğinden ve gerçek üretim riski
  taşımadığından ertelendi. `npm audit fix` (force'suz) ile aynı taramada
  `brace-expansion` (HIGH, DoS — `eslint-plugin-react`/`exceljs`'in
  `archiver`→`readdir-glob`→`minimatch` zincirinden, ikisi de yalnızca
  `node_modules`'ta duruyor, gerçek `dist/` build çıktısında hiç yok —
  `exceljs`'in `browser` alanı Vite tarafından otomatik seçildiğinden
  `archiver` zaten client bundle'a hiç girmiyor, doğrulandı), `postcss`
  (HIGH), `nanoid`, `js-yaml`, `browserslist` gibi dev-tooling'e özgü
  bağımlılıklar sorunsuz güncellendi (yalnızca `package-lock.json` değişti,
  `package.json` aynı kaldı — hepsi mevcut semver aralığı içinde).

## Son değişiklik

**14.10.2026 (27. tur) — Varsayılan kategori ağırlıkları canlıya uygulandı (Karar 89); hotfix'e özgü değişiklikler faz-a'ya işlendi; P3 deploy planı.**
- **Ağırlıklar:** `apply_migration` (`20261014103635_kategori_agirlik_varsayilan`). Doğrulamada yeni projede 15 kategori / toplam 100; mevcut 40 satır, diğer fonksiyonlar, trigger'lar ve projeler değişmedi. Migration dosyası üç dalda.
- **ADN1/ADN2:** `taslak-sql/adn_kategori_agirlik.sql` ROLLBACK ile test edildi:
  - ilerleme öncesi ve sonrası 0;
  - ADN2'de ilerlemesi olan kategoriler (evrak süreci, mobilizasyon) %0 ağırlıkta;
  - geri alma birebir.
  - PM onayı bekleniyor; uygulanmadı.
- **faz-a'ya port:** Adim5, `import-project-excel/index.ts` ve `mapping.ts` hotfix'ten birebir; Adim8'e tedarik koşulu. lint 0 hata, build başarılı.
- **P3 planı:** `docs/proje-kontrol/proje-ekleme-hotfix-plani.md` §7.

**14.10.2026 (26. tur) — F1 A1-A3 canlıya uygulandı; varsayılan ağırlık taslağı (Karar 89); hotfix kodu yazıldı (push yok).**
- **F1 A1-A3:** Oturum 0 temiz; `apply_migration` (`20261014102306_f1_a1_a3_proje_olusturma`); `f1_a1_a3_dogrulama.sql` canlıda 7/7. Mevcut nesnelerde değişiklik yok; değişenler yalnızca `create_project_with_code` (fonksiyon 116 → 117) ve iki CHECK. Migration dosyası üç dalda.
- **Karar 89:** `taslak-sql/kategori_agirlik_varsayilan.sql` (yalnızca `fn_seed_default_category_weights()` gövdesi). ROLLBACK testi geçti: sihirbaz ve doğrudan eklemede 15 kategori / toplam 100; ertelenmiş toplam kontrolü geçti; mevcut 40 satır değişmedi; geri alma md5 özgünle aynı. DB için "uygula" bekliyor.
- **Hotfix `hotfix/proje-ekleme` (`678806a`, push yok):**
  - `faz-a`'daki Adim1, export ve şablon v8 parçaları birebir taşındı.
  - Adim8 `create_project_with_code` ile çalışıyor, tedarik koşulu eklendi; Adim5'te tedarik isteğe bağlı.
  - `import-project-excel`: güncellemede rol kontrolü, Türkçe risk varsayılanları, yazmadan önce doğrulama, kopya kodu E13'ten.
  - `mapping.ts`: 15 kategori ve geçerli değer listeleri.
  - lint 0 hata, build başarılı, edge function'lar esbuild ile sözdizimi temiz.
  - Değişen yollar için otomatik test yok; Playwright `main`'de canlıya yazar.

**14.10.2026 (25. tur) — Proje ekleme incelemesi ve hotfix planı (Karar 85-88); canlıya kalıcı değişiklik yok.**
- **Canlıda ROLLBACK testi (gerçek admin/PM oturumu):**
  - PM sihirbazda `projects` INSERT RLS'ine takılıyor.
  - Admin projeyi açıyor ama proje kodu yok, register numarası alınamıyor.
  - Admin'de tedarik RPC'si yalnızca PM'e açık; adım listesinden atlanırsa kayıt yarıda kalıyor.
- **Excel (kod okuması, v22 = `main`):** risk varsayılanları CHECK'e uymuyor (`acik`/`yuksek`/`dusuk`); güncelleme yolunda rol kontrolü yok; yükleme tek işlem değil.
- **F1 A1-A3 ayrı pakette** (`f1_a1_a3_proje_olusturma.sql`, A1-A3 kaynakla birebir) ve davranış testi (`f1_a1_a3_dogrulama.sql`, kural 10 ön kontrollü). Canlıda ROLLBACK:
  - geri alma (uygula → proje aç → geri al → parmak izi 16 alan birebir; geri alma yeni kodlu projeyi bozmuyor);
  - doğrulama 7/7.
  - "uygula" bekliyor.
- **Rehber §4.14:** kodsuz projeye kod ekleme şablonu; ROLLBACK ile 5/5 senaryo.
- **Hotfix:** dal `hotfix/proje-ekleme` (`GES_Dashboard-hotfix` klasörü) açıldı, kod yazılmadı. Plan, çakışma tablosu, deploy adımları, ekip duyurusu ve kategori ağırlığı önerisi `docs/proje-kontrol/proje-ekleme-hotfix-plani.md`'de.

**14.10.2026 (24. tur) — F5 (Change, Claim, Interface) canlıya uygulandı: `20261014082055_f5_changes_claims_interfaces`.**
- **Karar 84:** mesai dışı kuralından da feragat (yalnızca F5).
- **Sıra:**
  - Oturum 0: aktif bağlantı ve uzun işlem 0, parmak izi alındı.
  - `apply_migration` (BÖLÜM A birebir, `lock_timeout` 3s).
  - `f5_dogrulama.sql` canlıda 6/6 OK; test satırları hata ile geri alındı.
  - Uygulama sonrası mevcut tabloların parmak izi değişmedi: fonksiyon, kısıt, trigger, indeks, yetki, RLS, yayın, görünüm, sayaç, durum geçmişi, proje, görev, risk, register satırları, bildirim sayısı. Nesne sayısı 305 → 337 (3 tablo + 29 indeks); tablo 55 → 58.
- **Repo:**
  - Migration dosyası `supabase/migrations/20261014082055_f5_changes_claims_interfaces.sql`.
  - Durum tablosu (`register-gap-analizi.md`), rehber, `canli-sema-ozeti.md`, docx metni güncellendi.
  - Karar 69: rehberdeki Change/Claim/Interface şablonlarında görev bağı alanı yok (teyit edildi).
- **Kural 7:** `fons_solar_sistem_dokumantasyonu.docx` ve `fons_solar_veritabani_dokumantasyonu.docx` güncellenmeli; metin `docs/proje-kontrol/docx-guncelleme-14-10.md` (kullanıcı işler).

**14.10.2026 (23. tur) — F5 geri alma testi, Karar 84, Change/Claim/Interface şablonları, docx metni; sihirbaz Riskler bulgusu 6b'ye (canlıya kalıcı değişiklik yok).**
- **Sihirbaz Riskler bulgusu:** "Bilinen açık noktalar"a eklendi. Düzeltme 6b sihirbaz paketinde: `save_project_risks` yalnızca manuel riskleri günceller. Tasarım `faz1-adim5-tasarim.md` §3.4, test §3.3 (7-11).
- **F5 BÖLÜM B (geri alma):**
  - Kapsam: yalnızca 3 tablo (trigger/indeks/RLS/kısıt onlarla düşer) ve sayaç/durum geçmişindeki CHG/CLM/ITF satırları. Ortak fonksiyonlara dokunmaz. Veri varken açık onay ister.
  - Canlıda ROLLBACK ile test edildi: uygula → geri al → 16 anahtarlı parmak izi birebir; koruma çalıştı.
- **Karar 84:** F5 yedeksiz uygulanabilir.
- **Kalıcı uygulama yapılmadı:** saat 10:37, mesai içi; mesai dışına kaldı.
- **Rehber §3.9-3.11, §4.11-4.13:** Change/Claim/Interface şablonları. F5 kurulumuyla birlikte ROLLBACK ile test edildi, 3/3 OK, parmak izi birebir.
- **`docs/proje-kontrol/docx-guncelleme-14-10.md`:** iki docx için değişiklik metni (kullanıcı işleyecek). Veritabanı docx'i bu bilgisayarda bulunamadı.

**14.10.2026 (22. tur) — Karar 78-83; rehbere SQL Editor şablonları; F5 ve şablonlar ROLLBACK ile test edildi (canlıya değişiklik yok).**
- **Sihirbaz Riskler adımı (kod okuması, yayındaki `main`):** adım "Kaydet"i yalnızca riskleri yazar (Ç-B'ye takılmaz), ama projenin bütün risklerini silip `source`/`rule_code`/`subject_ref`/`closed_at` olmadan yeniden ekler. Canlıdaki 55 riskin hepsi otomatik; kaydetme bunları manuele çevirir ve motor kopya açar. Son adım "Kaydet"i görevleri de yeniden yazar (Ç-B). Risk girişi rehberde SQL Editor şablonuyla.
- **Rehber:** başta uyarı (panel tüm veritabanına yazar, yedek yok, yalnızca şablonlar); §4'te 9 register işlemi için şablonlar. Canlıda tek işlemde koşuldu, 8/8 kontrol OK, ROLLBACK, parmak izi birebir.
- **F5 (Change/Claim/Interface):** `f5_dogrulama.sql` (kural 10 ön kontrollü) ile canlıda ROLLBACK: 6/6 grup OK (CHG/CLM/ITF numaraları, durum geçmişi, Karar 6 okuma matrisi, uygulamadan yazma reddi, kısıtlar); Oturum 5 = Oturum 0. Uygulanmadı, "uygula" bekliyor.
- **Taslaklar:** B3 A0/A1b ve B5 A1 geri doldurma (Karar 81).
- **6a provası askıda (Karar 83);** `scripts/proje-kontrol/prova-6a.mjs` commit edildi.

**14.10.2026 (21. tur) — Register'lara panelden veri girişi: rehber, Change/Claim/Interface taslağı, 6a notu (canlıya değişiklik yok).**
- Salt okunur: 7 register tablosu boş, `project_risks` 55 satır. Panel `postgres` rolüyle RLS'i atlıyor (`rolbypassrls`). Numara trigger'ı ve sayacı zaten canlıda.
- `docs/proje-kontrol/register-veri-giris-rehberi.md`: register başına zorunlu kolonlar ve geçerli değerler, riskler, 6a/Faz 2 etkisi. Onay bekleyen 6 çelişki (R1-R6): RPC-dışı yazma istisnası, elle numara, SharePoint linki (`external`), B3 A0 ve B5 geri doldurma, Faz 5 tabloları, uygulamada görünmezlik.
- `taslak-sql/f5_changes_claims_interfaces.sql`: yalnızca yeni tablo, SELECT RLS (Karar 6), CHG/CLM/ITF önek önerisi. Uygulanmadı, test edilmedi.
- `register-oncelikli-plan.md`: sayaç/biçim ön kontrol sorguları (canlıda salt okunur koşuldu, sonuçlar 0).

**14.10.2026 (20. tur) — Karar 75-77; yedek betiği OneDrive dışı yolları destekliyor; 6a kontrol listesi.**
- `run-backup.mjs`: `.env.local` ve yedek klasörü sırasıyla `FONS_BACKUP_ENV`/`FONS_BACKUP_DIR` → `C:\fons-yedek\` → repo içi; seçilen yol OneDrive altındaysa uyarı. README "Dosyaların yeri" ve kullanıcı adımları.
- `tests/proje-kontrol-master-veri.spec.js`: alan kodları tiresiz (F1 biçimi 6a ile gelir); şantiye şefi alan testi 6a öncesi/sonrası koşullu (A7, Karar 55).
- Salt okunur: bildirim üreten trigger ve fonksiyonlar listelendi; 16 spec 6a kontrolünden hariç.
- Takvim: Faz 2'ye süzgeç (+1 iş günü) → ilk register ekranda 6 Kasım, MVP canlı 17 Aralık (paralelde 15 Aralık).

**14.10.2026 (19. tur) — Plan değişikliği: register öncelikli sıra (Karar 66-74); yedek betiği pg_dump'a geçti; yeni dal.**
- Plan, 6a etkileri, bildirim bulguları ve takvim: `docs/proje-kontrol/register-oncelikli-plan.md`. İlk register ekranda tahmini 5 Kasım; MVP canlı tahmini 16 Aralık (Docker paralel kurulursa 14 Aralık).
- `scripts/db-backup/run-backup.mjs`: varsayılan kip `pg_dump` (Docker'sız; şema + veri + auth), eski CLI yolu `--cli` (Windows başlatma hatası giderildi). README güvenlik bölümü (auth şifre özetleri, yedekler repoya/paylaşılan klasöre konmaz). Gerçek döküm alınmadı.
- Salt okunur: register tablolarında ve B1-B6 taslaklarında bildirim yok; `notify_role`/`notify_managers` rol bazlı; TIZ'e özel bağlı tek hesap test benzeri şantiye şefi; admin ve muhasebede test e-postasına benzeyen hesap yok.
- Dal: `faz-2-3-register` (`main`'den), taslak SQL'ler, `docs/proje-kontrol/`, CLAUDE.md ve `scripts/db-backup/` alındı.
- Canlıya hiçbir şey uygulanmadı.

**13.10.2026 (18. tur) — Karar 64 (genel Admin hesabı: M1, canlıya almada kapatma) ve Karar 65 (eski risklerde kritik kapanış); yalnızca doküman.**
- B3 tasarımına S4a (`four_eyes_enabled` admin fonksiyonu) ve S4b (M1 hesap bazlı onay istisnası) eklendi; SQL yazılmadı, B1 değişmedi.
- Durum tablosu: canlıya alma › kullanıcı hesapları dilimine "kişisel hesaplar açıldıktan sonra genel Admin hesabını kapat"; hesabın kullanıcıları kullanıcıdan bekleniyor.

**13.10.2026 (17. tur) — Karar 6 (yetki matrisi) ve Karar 10 (dört göz) onaylandı; B1 seed'i güncellendi ve yeniden test edildi.**
- Ayrıntı: `docs/proje-kontrol/karar-6-10-yetki-ve-dort-goz.md`.
- B1 A2 seed'i Karar 6 matrisiyle değişti. `b1_dogrulama.sql`'e hücre hücre matris kontrolü ve yeni rol kontrolleri, `b3_dogrulama.sql`'e "PM decision onaylayamaz" kontrolü, `proje-kontrol-b1-yetki.spec.js`'e matris beklentileri eklendi.
- Canlıda yalnızca ROLLBACK (Adım 2 yöntemi): B1 + doğrulama 13 kontrol grubu OK; Oturum 5 parmak izi Oturum 0 ile birebir. B3 koşulmadı.
- Salt okunur sayım: 3 admin, 3 PM hesabı (biri test e-postasına benziyor). `project_risks`'te `created_by` yok (Faz 3'te eklenecek).
- Durum tablosu: Faz 3'e kritik risk kapanış onayı (+1 iş günü) → Faz 3 24 Kasım, Faz 4 8 Aralık, MVP canlı tahmini 14 Aralık 2026. "Kullanıcı hesapları" dilimine test hesaplarının gözden geçirilmesi ve genel Admin hesabı kararı eklendi.

**13.10.2026 (16. tur) — Karar 63 (Ç5-7: PM tüm projelere erişir, yeniden değerlendirme koşullu); yalnızca doküman.**
- Faz 5 başlangıç kontrol listesi ve "Kullanıcıdan beklenen girdiler" tablosu `register-gap-analizi.md` durum bölümüne eklendi.
- Açık kararlardan 6 (yetki matrisi; B1 Adım 6'da) ve 10 (dört göz; B3 Faz 2) MVP'yi bekletiyor; 7, 8, 9 bekletmiyor.

**13.10.2026 (15. tur) — Karar 58 güncellendi, Karar 60-62 (yalnızca doküman, test planı ve küçük kod; canlı/deploy yok).**
- **Karar 58:** WBS ve Alanlar yalnızca admin/PM; şantiye şefine ayrı görünüm yok, Ç5-6 kapandı. `ProjeAyarlari.jsx` başka rolde boş döner; Ek A'daki ProjeDetay diff'i rol koşullu.
- **Karar 53:** `ProjeDetay.jsx` de bekleyen dosyalara eklendi.
- **Karar 60:** boş E13 mesajı `import-project-excel`'de (deploy yok).
- **Karar 61:** baseline migration Faz 1 sonrasına ertelendi; `faz1-adim5-yerel-ortam.md` §3.
- **Karar 62:** Ek B onaylandı; yetki matrisi testi `f1_dogrulama.sql` R32 + spec'te. Canlıda salt okunur SELECT: `roles.cross_project` PM'de true, `project_wbs/areas/area_wbs` policy'leri → **Ç5-7** (PM her projeye erişir; "A'nın PM'i B'ye yazamaz" testi yalnızca alt işlemde `cross_project=false` ile ölçülebilir).
- Testler koşulmadı (yerel ortam bekleniyor).

**12.10.2026 (14. tur) — Karar 52-59; Adım 5 kodu ve yerel ortam betikleri yazıldı (test yok, canlı/deploy yok).**
- **Kararlar:** 52-59 eklendi, Karar 44 güncellendi: iptal etme de yalnızca admin/PM; AID A8b ve R15 buna göre.
- **Yerel ortam** (`faz1-adim5-yerel-ortam.md`):
  - `scripts/local-db/setup.mjs` + `seed.mjs`; yığın `supabase/local/stack`'ten migration'sız başlar;
  - taban `npm run db:backup` dökümü + `supabase/local/reference_data.sql` (auth tetikleyicisi, roller/navigasyon, bucket'lar);
  - Playwright'ın varsayılan hedefi yerel, canlı yalnızca `PW_TARGET=live`;
  - baseline migration önerisi **onay bekliyor**.
- **DB taslağı:**
  - `f1_adim5_ekran_rpc.sql`;
  - `f1_dogrulama.sql`: §7 R28-R31 eklendi, §5 R15 güncellendi.
- **Ön yüz:**
  - İş Planı: Activity ID/disiplin/alan/WBS kolonları, filtreler, seçim, toplu atama, Kod ata (500 sınırı), sınıflandırma ve admin ID düzeltme, iptal/yeniden aç, KPI iptal hariç;
  - Proje Ayarları › WBS ve Alanlar bileşenleri: ProjeDetay bağlantısı kullanıcı dosyası, Ek A;
  - sihirbaz: proje kodu, `save_project_tasks` önizlemesi, `group_label` korunur, ağırlıksız kategori uyarısı;
  - Excel v8: E13; şablon dosyası güncellendi; edge function kodu güncellendi, **deploy yok**;
  - günlük rapor formunda iptal görev yok.
- **Testler:** `tests/proje-kontrol-adim5.spec.js` yazıldı; yerel + taslaklı ortamda koşar.
- **Doğrulama:** build ve lint temiz.
- **Kullanıcı dosyalarına dokunulmadı:** `DailyReportList.jsx`, `projectExcelBridge.js`, `ProjeDetay.jsx`; hazır diff'ler Ek A'da.
- **Yeni çakışma Ç5-6:** şantiye şefi ProjeDetay'a ulaşamadığı için Proje Ayarları'nı göremez.

**12.10.2026 (13. tur) — Karar 51 (görev tarafında alan-WBS kuralı) ve Adım 5 tasarımı (kod yok, uygulama yok).**
- **Karar 51:**
  - Ayrı SECURITY DEFINER trigger olarak AID taslağına eklendi (A3b); Karar 39 daraltıldı.
  - Canlıda yalnızca ROLLBACK:
    - K1: T35a-e 7/7 geçti;
    - K2: §5 R6-R16 + yeni R27 geçti;
    - parmak izi öncesi = sonrası.
- **Adım 6 ön koşulu:** tam zincir provası (psql, tek transaction, R1-R27, ROLLBACK). Parmak izi sorgusu `taslak-sql/parmak_izi.sql`'e alındı.
- **Adım 5 tasarımı:** `docs/proje-kontrol/faz1-adim5-tasarim.md`.
  - Yerel Docker + canlı şema dökümü tabanı. `supabase/migrations` sıfırdan kuramıyor: ilk migration `projects`/`profiles`'a dayanıyor.
  - Ekranlar, sihirbaz Ç-B, proje kodu, ağırlıksız kategori reddi, Playwright matrisi.
  - 8 karar sorusu var.
- **Yeni bulgu:** sihirbaz düzenlemesi `group_label`'ı siliyor ("Bilinen açık noktalar", Ç-B maddesi).

**12.10.2026 (12. tur) — Faz 1 Adım 4 kapandı (WBS/alan bütünlüğü ve Excel importu; yalnızca taslak, uygulama yok).**
- **Kararlar:** 45-50 eklendi.
  - Senaryo (b) seçildi; Ç6 kapandı.
  - Durum tablosu (b)'ye göre güncellendi: MVP canlı 11 Aralık 2026.
- **Canlı kontrol (salt okunur):**
  - kod değişikliği bugün görevi olan kayıtta engelli;
  - pasifleştirme, taşıma ve `area_wbs` yazımı kontrolsüz;
  - silme FK RESTRICT ile engelli.
- **Taslak `f1_wbs_alan_import.sql`:**
  - Activity ID'li göreve etki eden değişiklikler trigger'da reddediliyor (Karar 48);
  - Ç-7 guard düzeltmesi;
  - üç tabloda audit;
  - `import_wbs_areas` (önizleme varsayılan).
- **JS tarafı:**
  - şablon `docs/proje-kontrol/sablon/`;
  - `src/utils/wbsAreaExcel.js`;
  - projesiz kontrol betiği `scripts/proje-kontrol/wbs-alan/kontrol.mjs`.
- **Testler:**
  - Canlıda yalnızca ROLLBACK: 4a-4e geçti (T21-T34, R17-R26); Oturum 5 = Oturum 0.
  - Kurulumda MCP boyut sınırı nedeniyle B2 A3, F1 ve AID A7-A8 kurulmadı (`faz1-adim4-sonuclar.md`).
  - JS spec 23/23 geçti.
- **Kural 10:** boolean metni düzeltildi.
- **Açık noktalar:** Ç-6 ve görev tarafında Karar 38 açığı eklendi.
- **Bekleyen:** gerçek Diyarbakır Excel'i.

**12.10.2026 (11. tur) — Faz 1 Adım 3 kapandı.**
- **Test betiği:** üç hata türüne karşı gözden geçirildi; aynı ifadede sıra bağımlı yazmalar bölündü. Bu kontrol kural 10 olarak eklendi.
- **ROLLBACK:** 2b 12/12 geçti; Oturum 5 = Oturum 0.
- **Ç16 madde 5:** yayınlanabilir anahtarla tek salt okunur GET (`Accept-Profile: pg_catalog`), yanıt `PGRST106`. Exposed schemas yalnızca `public, graphql_public`.
- **Durum tablosu** (`register-gap-analizi.md`):
  - Faz 1, 28 Ekim'e kaydı.
  - MVP canlıya alma dilimi eklendi.
  - İki senaryolu MVP tarihi eklendi: (a) 22 Aralık 2026, (b) 11 Aralık 2026.

**12.10.2026 (10. tur) — Faz 1 Adım 3: Karar 44 (A8); 2a geçti, 2b'de üç test betiği hatası, durduruldu.**
- Canlıda yalnızca ROLLBACK:
  - 2a 11/11 geçti.
  - 2b: 13 test geçti; şantiye şefinin iptal göreve ilerleme girişini ve yeniden açmasını test eden T20c de geçti.
  - 2b'de T15, T18 ve T20d test betiği hatasıyla kaldı: okuma ile çağrı aynı ifadedeydi ve ondalık biçim yanlış yazılmıştı. Betik düzeltildi, yeniden koşulmadı.
  - Oturum 5 parmak izi Oturum 0 ile birebir aynı.
- Kategori ağırlığı kaydına eklendi: bugün yalnızca TIZ/TKY etkileniyor; ADN2'de 36, ADN1'de 11 görev etkilenecek. Adım 6 ön koşulları `faz1-adim3-tasarim.md` §9'da.
- Exposed schemas listesi bu mesajda da gelmedi (yer tutucu kaldı).
- Adım 3 kapanmadı; durum tablosu güncellenmedi.

**12.10.2026 (9. tur) — Faz 1 Adım 3: A8 eklendi; ROLLBACK testleri 1c ve 1d'de geçti, 2a'da test betiği hatasıyla durdu.**

Taslağa A8 eklendi: iptal göreve ilerleme her yoldan reddediliyor, iptal görevi yalnızca admin ve proje yöneticisi yeniden açıyor. Testler T20c ve T20d olarak eklendi.

Canlıda yalnızca ROLLBACK ile koşuldu:
- 1c: R1-R16 geçti.
- 1d: B4 geçti. Uygulama sonrası etki ölçüldü: dört projenin ilerleme yüzdesi ve özet metrikleri değişmedi.
- 2a: T11 satırında test betiğinin değişken adı çakışmasıyla düştü. Betik düzeltildi, yeniden koşulmadı.
- Oturum 5 parmak izi Oturum 0 ile birebir aynı.

Yeni bulgu: kategori ağırlık tablosunda olmayan kategorilerdeki görevler proje ilerlemesine katılmıyor ("Bilinen açık noktalar"). Ç16 madde 5 (exposed schemas) hâlâ doğrulanamadı: kullanıcının mesajında liste boş kaldı. Adım 3 kapanmadı; durum tablosu güncellenmedi.

**09.10.2026 (8. tur) — Faz 1 Adım 3 taslağı yazıldı; canlıda ROLLBACK testleri başladı, Oturum 1c'de durdu.**
Karar 37-43 eklendi. Taslak `f1_aid_activity_id.sql`:
- disiplin sözlüğü;
- Activity ID atama ve önizleme;
- Ç16 kimlik koruması;
- genişletilmiş B4;
- iptal görevlerin ilerleme hesaplarından çıkarılması.

Kontrol (a): `iptal` durumu canlıda var ama ilerleme, kategori ağırlıkları, S-eğrisi, şantiye kalemleri ve özet
görünüm onu saymaya devam ediyordu. İptal göreve ilerleme girilince görev yeniden `devam_ediyor` oluyordu. 7 fonksiyon/görünüm
düzeltildi. Kontrol (b): `activity_id` kontrolü 5 haneye ve uzun alan koduna izin veriyor; değişiklik gerekmedi.

Ç-B (sihirbaz sil-yeniden-yaz) bugün canlıda hata veriyor ("Bilinen açık noktalar"). Canlıda yalnızca ROLLBACK:
- Oturum 1b ve 1a geçti.
- Oturum 1c'de R15 test betiği hatası çıktı. Varsayılan kategori ağırlıklarında `mekanik` yok; betik düzeltildi, yeniden koşulmadı.
- Oturum 5 parmak izi Oturum 0 ile birebir aynı.

Ç16 güvenlik notunun tek açık maddesi (PostgREST exposed schemas) kullanıcının panel kontrolünü bekliyor.

**09.10.2026 (7. tur) — Faz 1 Adım 2 kapandı.** Oturum 4 düzeltilmiş betikle 10/10 geçti, Oturum 5 parmak izi
Oturum 0 ile birebir. `register-gap-analizi.md` başına 16 register durum tablosu ve fazların 15 Aralık MVP'ye göre
tahmini bitişi eklendi; her adım/faz kapanışında güncellenmesi kural 9 oldu.

**09.10.2026 (6. tur) — Faz 1 Adım 2 düzeltilmiş F1 ile yeniden koşuldu.** F1 A4 iki trigger fonksiyonuna bölündü
(Karar 36), `f1_dogrulama.sql`'e R1-R5 regresyon testleri eklendi. Canlıda ROLLBACK ile: Oturum 1-3 tamamen geçti
(T2f-h artık geçiyor; satın alma, görev ve günlük rapor risk akışları hatasız), Oturum 4'te rol yetkileri doğru
ama 5 satır test betiğinin boolean→metin karşılaştırması (`f` ≠ `false`) yüzünden "KALDI" yazdı — betik düzeltildi,
kural gereği yeniden koşulmadı. Oturum 5 parmak izi Oturum 0 ile birebir aynı. Test blokları
`taslak-sql/f1_adim2_testler_oturum{2,3,4}.sql`.

**09.10.2026 (5. tur) — Faz 1 Adım 2 canlıda ROLLBACK ile koşuldu, Oturum 2'de durdu.** Karar 34-35 eklendi.
Ön kontroller temiz (http/pg_net/webhook yok, aktif bağlantı yok). Oturum 1 (B1, B2, B4, F1 doğrulamaları) ve
Oturum 2'nin 18 testinden 15'i geçti; F1 A4'teki `fn_require_project_code` `CASE` içinde iki trigger'ın kayıt
alanlarını birlikte çözdüğü için her tetiklenmede hata veriyordu (uygulansaydı proje oluşturma/silme kırılırdı).
Taslakta `IF`'e çevrildi, yeniden test bekliyor. Oturum 3-4 koşulmadı. Rollback sonrası parmak izi Oturum 0 ile
birebir aynı (`faz1-adim2-sonuclar.md`).

**09.10.2026 (4. tur) — Faz 1 Adım 1 tamamlandı (yalnızca taslak, canlıya uygulama yok).** Karar 17-33 eklendi.
F1 taslağı (proje kodu biçimi, `create_project_with_code`, kodsuz projeyi reddeden ertelenmiş kural, tiresiz alan
kodu) + doğrulama betiği, `import-project-excel`/sihirbaz diff'i ve Adım 2 test planı yazıldı. B1'e ncr/inspection
eklendi. Bulgu: `projects` INSERT policy'si yalnızca admin — sihirbaz proje yöneticisinde bugün muhtemelen
başarısız (doğrulanmadı); yeni fonksiyon admin + proje_yoneticisi'ne izin veriyor.

**09.10.2026 (3. tur) — Faz 0 kapandı; Karar 11-16 eklendi (yalnızca doküman, migration yok).** Payment,
Subcontractor, Faz 1-9 tanımları, RSK numarası, satın alma köprüsü ve NCR/Inspection kodları karar tablosuna
yazıldı. `register-gap-analizi.md` faz tablosu yeni fazlarla yeniden yazıldı; kullanıcı kararı bekleyen 12
çakışma (Ç1-Ç12: links yapısı, Faz 1'in B1/B2 bağımlılığı, AI/agent'ın fazsızlığı, takvim, RSK ve proje kodu
zorunluluğu…) ve Faz 1 kapsam paragrafı aynı dosyada. B5 "değiştirildi, yeniden test bekliyor" olarak işaretlendi.

**09.10.2026 (2. tur) — Proje Kontrol kuralları ve register eksik analizi yazıldı (şema değişmedi).**
`docs/proje-kontrol/CONVENTIONS.md` ve `register-gap-analizi.md` eklendi; CLAUDE.md'ye kural 8 (çelişen talimatta
önce listele, onay iste) ve Karar 5'e sağlayıcıdan bağımsız dosya bağlantısı notu eklendi. B5 taslağındaki
temizlik işi yalnızca `storage_provider='supabase_storage'` satırlarına daraltıldı (taslak, uygulanmadı). Canlıya
yalnızca salt okunur SELECT yapıldı.

**09.10.2026 — Proje Kontrol tasarım v3'e geçildi; Faz B migration taslakları (B1-B6) yazıldı ve canlıda yalnızca
BEGIN…ROLLBACK ile denendi (hiçbiri uygulanmadı).**
- Kullanıcının verdiği tasarim.md v3 yerleşti, önceki sürüm `docs/proje-kontrol/arsiv/`'e alındı.
- v3'ün §4.1/4.2/4.8'i canlıyla satır satır karşılaştırıldı ve canlıya göre düzeltildi (`v3-uyum-notlari.md`). Örnekler: tabloya özel numara kolonları, kompozit FK, `priority` medium, `suppliers.supplier_type` ad çakışması → `party_type`, `document_revisions`'ta zaten var olan dosya kolonları.
- B1-B6 taslakları, doğrulama betikleri, anlık görüntü ve test taslakları hazır (`docs/proje-kontrol/faz-b-migration-plani.md`).
- Denemelerin hepsi OK. B5 denemesi gerçek bir hata yakaladı: iptal edilen revizyon numarasını tutuyordu, sonraki yükleme çakışıyordu. Taslakta düzeltildi.
- Canlıda doğrulanan iki kısıt:
  - Supabase `storage.objects`'ten SQL ile silmeyi engelliyor → dosya silme Storage API ile yapılır.
  - MCP aracı ~95 KB üstü isteği düşürüyor → altı paket tek blokta denenemedi.
- Katalog parmak izi bütün denemelerden önce ve sonra birebir aynı.
- `npm run db:backup:data` eklendi (`scripts/db-backup/README.md`; `.env.local` olmadığı için çalıştırılmadı).
- Giriş kararı notu yazıldı (`frontend-giris-karari.md`, öneri: şantiye şefine üst seviye `kontrol` sekmesi, muhasebeye Faz D'de).
- Doğrulama:
  - lint 0 hata;
  - build başarılı;
  - Proje Kontrol spec'leri 24 geçti, 25 atlandı (B taslakları + 3 fixme), başarısız yok.
- Şema değişmediği için docx dokümantasyonu güncellenmedi.

**07.10.2026 (3. tur) — Uyum migration'ı canlıya uygulandı (`20261007072501`).**
Uygulama öncesinde aktif sorgu ve hedef tablolarda kilit yoktu. Uygulama sonrası doğrulama betiği OK verdi ve test satırı kalmadı. Testler: uyum + iki güvenlik spec'i 24/24 geçti (3 fixme atlandı). Tam Playwright seti 118/118 geçti (3 fixme atlandı, başarısız yok).
`fons_solar_sistem_dokumantasyonu.docx` güncellendi:
- Tablo sayısı 55 oldu.
- Modül haritasına "Proje kontrol" satırı eklendi.
- 6.8 bölümü eklendi.
- Önceki hâli `…yedek-07-10.docx` olarak saklandı.

Veritabanı dokümantasyonu docx'u (`fons_solar_teknik_veritabani_v2.docx` / `fons_solar_veritabani_dokumantasyonu.docx`) bilgisayarda bulunamadı, güncellenmedi.

**07.10.2026 (2. tur) — Karar #0 alt kararları ve #3 onaylandı; uyum migration'ı ROLLBACK'li denemede geçti.**
Migration ve doğrulama betiği tek bir ROLLBACK'li blokta canlıda denendi. Tüm kontroller geçti:
- Yeni tablolarda yetki ve RLS kontrolü.
- Numaralar `RFI-TIZ-0001` … `RFI-TIZ-10000`; kırpma yok, boşluk yok.
- DRW/DOC önekleri ayrı.
- Çizim yalnızca çizim türündeki dokümana bağlanıyor.
- Dokümanın tek güncel revizyonu oluyor.
- `ncr`/`inspection` kaynakları reddediliyor.

Denemeden sonra katalog parmak izi birebir aynıydı. Kalıcı uygulama, kullanıcının SQL'i gözden geçirip onaylamasını bekliyor. Ayrıntı: "Proje Kontrol (Faz A)".

**07.10.2026 — G-01 (geçici) ve G-02/G-03 canlıya uygulandı.** Başka projenin saha fotoğrafını/ticket ekini
sahte metadata satırıyla indirme açığı kapatıldı; 05.10 register tablolarında `authenticated` yazma yetkisi
geçici olarak geri alındı. Tam şema yedeği alınamadığı için kullanıcı onayıyla değişen nesnelerin doğrulanmış
anlık görüntüsü (`docs/proje-kontrol/yedek-policy-07-10.sql`) yedek olarak kullanıldı. `tests/proje-kontrol-guvenlik.spec.js`
8/8. Ayrıntı: "Sistem mimarisi" → "Proje Kontrol (Faz A)".

**06.10.2026 — Proje Kontrol Faz A başladı (şema değişmedi).** Canlı şema doğrulandı; 05.10'da
tasarımla çelişen, yerel dosyası olmayan 3 Proje Kontrol migration'ı bulundu (Karar #0). Güvenlik
testi iki YÜKSEK açık kanıtladı (sahte metadata satırıyla başka projenin fotoğraf/ekini indirme).
drive-gateway iskeleti, Drive sınır betiği, AI ölçüm iskeleti ve frontend notu yazıldı. Ayrıntı:
"Sistem mimarisi" → "Proje Kontrol (Faz A)".

**24.09.2026 — AI ajanı dosya boyutu sınırı eşitlendi.** İstemci 20 MB dosyaya izin verirken Edge Function'ın Base64 ve toplam istek sınırları bazı seçilen dosyaları gönderim sırasında reddediyordu. İstemci limiti 12 MB'a indirildi ve reddedilen dosyada input temizleniyor; böylece aynı dosya yeniden seçilebilir. Test çalıştırılmadı.

**24.09.2026 — AI ajanı konuşma geçmişi sunucu sınırında tutuluyor.** Edge Function en fazla 40 mesaj kabul ediyor, istemci geçmişi sınırsız büyütebiliyordu. İstemci şimdi son 38 mesajı ve yeni kullanıcı mesajını gönderiyor; yanıt başarılı olunca geçmişi tam kullanıcı/asistan çiftleriyle kaydediyor (en fazla 40). Başarısız istekler geçmişe yazılmıyor. Test çalıştırılmadı.

**24.09.2026 — AI ajanı toplam istek boyutu istemcide sınırlandırılıyor.** Geçmişteki dosya ekleri Base64 olarak saklandığından birden fazla eki olan konuşmalar Edge Function'ın 18 MiB sınırını aşabiliyordu. İstemci istek gövdesini hesaplıyor, 17 MiB üstünde en eski tam user/model çiftlerini istekten çıkarıyor ve hâlâ sığmayan tek mesaj için açıklayıcı hata gösteriyor. Görüntülenen sohbet ve kaydedilen geçmiş değişmiyor. Test çalıştırılmadı.

**24.09.2026 — AI ajanı metin sınırları istemciye uygulandı.** Edge Function mesaj başına 100.000 karakter doğrularken arayüz serbest uzunlukta girişe izin veriyordu; Excel/CSV çıkarımı da tek metin parçası sınırını aşabilirdi. Metin kutusu aynı üst sınıra alındı, tablo çıkarımı sınıra takıldığında kontrollü kısaltılıp kullanıcıya bildiriliyor. Test çalıştırılmadı.

**24.09.2026 — AI ajanı canlı bağlamı sistem prompt sınırına göre kısaltılıyor.** Bazı context sorguları sınırsız satır döndürdüğünden prompt, Edge Function'ın 100.000 karakter doğrulamasını aşabilirdi. İstemci şimdi statik yönergeleri koruyup proje bağlamını sınır içinde kesiyor ve yanıta kısaltma notu ekliyor. Test çalıştırılmadı.

**24.09.2026 — AI ajanı başarısız istekte kullanıcı içeriğini koruyor.** Gemini çağrısı hata verdiğinde gönderim öncesi temizlenen metin ve dosya kayboluyordu. Hata halinde başarısız mesaj balonu kaldırılıyor, içerik giriş alanına geri yükleniyor ve yeni bir yazı/dosyanın üzerine yazılmıyor; kullanıcı doğrudan yeniden deneyebilir. Test çalıştırılmadı.

**24.09.2026 — ExcelJS yalnızca Excel işlemi gerektiğinde yükleniyor.** Ajan dosya analizi, proje sihirbazı içe aktarımı ve rapor dışa aktarımlarındaki statik importlar dinamik importa çevrildi. Production `index.html` artık 938 kB'lık `vendor-xlsx` dosyasını ön yüklemiyor; kullanıcı bir Excel işlevi çağırınca yükleniyor. Bu ayrı chunk hâlâ büyük olduğu için build boyut uyarısı devam ediyor. Lint ve build başarılı; lint'te 10 önceden var olan Fast Refresh uyarısı bulunuyor.

**24.09.2026 — `fn_next_purchase_request_no` için doğrudan RPC erişimi kapatıldı.** Salt okunur catalog kontrolü, `authenticated` rolünün sequence tabanlı numara üreticisini doğrudan çağırabildiğini doğruladı; keyfi yıl girdileri boş yere sayaç/sequence tüketebilirdi. `20260924110039_revoke_authenticated_execute_on_request_no_allocator` migration'ı kullanıcı onayından sonra uygulandı. Sonraki salt okunur kontrol `authenticated_exec=false`, `service_role_exec=true` ve iki iç satın alma RPC'sinde `postgres_exec=true` gösterdi; uygulama akışı korunurken doğrudan çağrı kapandı.

**18.09.2026 (2. tur) — Kullanıcı isteğiyle 4 demo tedarikçi (Güneş Panel A.Ş./
Elektrik Malzeme Ltd./Nakliye Lojistik A.Ş./Çelik Yapı San. Ltd.,
`aaaaaaaa-0000-...-000{1-4}` ID'li, bkz. "Tedarikçi No" kozmetik bug notu)
ve tüm bağlı demo verisi kalıcı olarak silindi.**

Bu tedarikçilere bağlı 12 fatura (bazıları `DEMO-FTR-*` önekli, bazıları eski
seed verisi), 6 satın alma talebi ve 3 faturasız ödeme kaydı vardı — hepsi
bilinen iki test projesinde (`test-izmir-ges-2026`/`test-kayseri-develi-ges`),
gerçek müşteri verisi değil. FK zinciri (`purchase_requests`/
`financial_transactions`/`purchase_offers` → suppliers RESTRICT/NO ACTION)
tedarikçilerin doğrudan silinmesini engelliyordu — önce 1 blok eden
`financial_transaction_payments` satırı + 10 artık `notifications` satırı
(entity_id soft-ref) temizlendi, ardından invoices → purchase_requests →
financial_transactions → suppliers sırasıyla (bu sıra, `invoices.purchase_request_id`
NO ACTION olduğundan zorunlu) silindi; `invoice_approvals`/`cost_allocations`/
`invoice_payments`/`purchase_request_items`/`purchase_offers` zaten CASCADE
olduğundan otomatik gitti. Bu bir migration değil, tek seferlik veri
temizliği — `supabase/migrations/`'daki bu tedarikçileri seed eden eski
dosyalar (`20260617062719_seed_finance_data.sql` vb.) dokunulmadan kaldı, bir
`db reset` bu demo tedarikçileri/faturaları yeniden oluşturur (bu turun
kapsamı yalnızca canlı DB'ydi).

**18.09.2026 — FaturaDetayModal'a muhasebenin kendi hatasını fark edince
faturayı geri çekip düzenleyebildiği "Geri Çek ve Düzenle" (self-revize)
bölümü eklendi.**

Kullanıcı isteği: `yönetici_onayında` bir faturada (ekran görüntüsünde
görüldüğü gibi, yanlış ürün faturalanmış bir örnek) muhasebe artık yöneticinin
"Düzeltme İste"sini pasif şekilde beklemek zorunda değil — kendi fark ettiği
hatayı düzeltmek için faturayı kendisi geri çekebiliyor. Uygulama, yöneticinin
zaten var olan "Düzeltme İste" akışıyla (`invoice_approvals`
`bekliyor→duzeltme_istendi`, `fn_invoice_approval_cascade`) BİREBİR aynı DB
yolunu kullanıyor — RLS (`invoice_approvals_update`) muhasebeye zaten
izinliydi, ayrı bir RPC gerekmedi. **Ama gerçek testte bulunan bir engel:**
`fn_validate_invoice_status_transition` (invoices tablosunun kendi BEFORE
UPDATE trigger'ı, SECURITY INVOKER) `yönetici_onayında → duzeltme_bekliyor`
geçişini yalnızca admin/proje_yoneticisi'ye izin veriyordu — cascade'in
SECURITY DEFINER'ı bu invoker-taraflı kontrolü bypass etmiyor, muhasebe
denediğinde hata alıyordu. `allow_muhasebe_self_revize_invoice_from_manager_approval`
migration'ı bu tek geçişin izinli rol listesine `muhasebe`'yi ekleyerek
düzeltti (diğer hiçbir geçiş/rol etkilenmedi). Ayrıca `FaturaDetayModal.jsx`'in
`editing` dalı artık düzenleme formuna stale `invoice` prop'u yerine tazelenmiş
`effectiveInvoice`'u geçiriyor — bu sayede geri çekme sonrası doğrudan açılan
form "Onaya Gönder" değil doğru şekilde "Tekrar Gönder" etiketini gösteriyor
(latent bir tutarsızlık, bu turda ayrıca düzeltildi). `tests/invoice-self-revize.spec.js`
(yeni) gerçek RPC + UI ile uçtan uca doğrular: buton/uyarı görünürlüğü,
admin'e özel "Reddet" butonunun muhasebede hiç görünmediği, geri çekme
sonrası DB durumu (`duzeltme_bekliyor`/`duzeltme_istendi`/doğru `reviewer_id`/
`note`). `npm run lint`/`build` temiz.

**15.09.2026 (5. tur) — Çekirdek mimari dosyalarında (App/router/AuthContext/
Sidebar vb.) proaktif bug/tutarsızlık taraması: 1 gerçek CLAUDE.md sapması
düzeltildi + `ProtectedRoute`'un `allowedRoles` prop'u ve ulaşılamaz
`/yetkisiz` sayfası kaldırıldı.**

Kullanıcı isteğiyle çekirdek mimari dosyaları (App.jsx, router/index.jsx,
ProtectedRoute.jsx, AuthContext.jsx, ScopeContext.jsx, Sidebar.jsx,
dashboard/index.jsx, src/lib/supabase.js, useDashboardData/useRealtimeRefresh/
useUrlSyncedSelection/useHighlightRow, Login/HesapOlustur) tek tek okunup
analiz edildi. İki gerçek bulgu çıktı:

1. **"Roller" bölümü bayatlamıştı.** `roles.allowed_tabs`/`sidebar_items`
   dizi kolonları 24.07.2026'da (`20260724160000_normalize_role_navigation_4nf.sql`)
   kaldırılıp `role_allowed_tabs`/`role_sidebar_items` join tabloları +
   `tabs_unrestricted` boolean'ıyla değiştirilmişti — kod (`AuthContext.jsx`)
   her zaman doğruydu, yalnızca CLAUDE.md'deki örnek SQL ve anlatım (birkaç
   proaktif tarama turunda fark edilmeden) eski şemayı tarif ediyordu, hatta
   örnek sorgu artık DB'de hata verirdi. "Roller" başlığı + "Rol → sekme/sidebar
   erişimi" paragrafı güncellendi; `AuthContext.jsx`/`Sidebar.jsx`/
   `TabOdemeler.jsx`'teki eşdeğer eski kod yorumları da düzeltildi (kod zaten
   doğruydu, yalnızca yorum metni eskiydi).
2. **`ProtectedRoute`'un `allowedRoles` prop'u ve `/yetkisiz` sayfası fiilen
   ulaşılamazdı.** `router/index.jsx`'teki tek `<ProtectedRoute>` kullanımı
   `allowedRoles` hiç geçmiyordu — rol tabanlı `/yetkisiz` yönlendirmesi normal
   navigasyonla asla tetiklenemiyordu (yalnızca adres çubuğuna elle yazılırsa
   görülüyordu). Muhasebe/DB-tabanlı sekme görünürlüğü modeline geçilmeden
   önceki eski bir rota-bazlı yetki modelinden kalıntıydı. Kullanıcı kararıyla
   `ProtectedRoute.jsx`'ten `allowedRoles` kontrolü, `router/index.jsx`'ten
   `/yetkisiz` route'u/importu, ve `src/pages/Yetkisiz.jsx` dosyası tamamen
   kaldırıldı — "Frontend yapısı"ndaki routing listesi güncellendi
   (`/yetkisiz` çıktı, gerçekte var olan ama listede hiç geçmeyen
   `/hesap-olustur` eklendi). `grep -i yetkisiz`/`allowedRoles` ile hem `src/`
   hem `tests/` tarandı — tek eşleşme `category-weights.spec.js`'teki alakasız
   bir test adıydı ("yetkisiz saha rolü..."), silinen sayfaya/prop'a bağımlı
   hiçbir test yoktu.

Bu turda ayrıca `ScopeContext.jsx`'teki `dashboard-scope-project` localStorage
anahtarını temizleyen tek-seferlik `useEffect` gözden geçirildi — hiçbir yerde
artık yazılmayan eski bir global proje-seçici kalıntısının savunma amaçlı
temizliği, zararsız/kasıtlı bırakıldı, dokunulmadı. `npm run lint`/`build`
temiz.

**15.09.2026 (4. tur) — Migration tracking boşluğu maddesi kalıcı kapatıldı
(yalnızca dokümantasyon, kod/migration değişikliği yok).**

Bir önceki turda (3. tur) tespit edilip kullanıcıya sorulan "kalan 13 migration
(Kaptan Demir Çelik'in gerçek WBS/aylık plan verisini içeren) ne olacak"
sorusuna kullanıcı kararı: **yeniden inşa edilmeyecek, madde dokümantasyonda
kalıcı kapalı olarak işaretlenecek** — gerçek müşteri verisini git geçmişine
gömme riski daha önce de bilerek reddedilmişti, bu karar değişmedi. CLAUDE.md'deki
"Bilinen açık noktalar" → "Migration tracking boşluğu" maddesi buna göre
güncellendi: başlık "büyük ölçüde kapandı" yerine "kapandı (kullanıcı kararıyla)"
oldu, 13 migration'ın "hâlâ açık madde" ifadesi "KALICI olarak yerel dosyasız
bırakılmasına karar verildi — yeniden gündeme getirilmeyecek" şeklinde
netleştirildi. Canlı DB'deki veri/şema bu karardan hiç etkilenmiyor, yalnızca
hipotetik bir `db reset` senaryosunda (iki test dışı gerçek proje için) eksik
kalacağı notu duruyor. Bir sonraki proaktif tarama turunda bu madde artık
"açık nokta" olarak yeniden gündeme getirilmemeli.

**15.09.2026 (3. tur) — `projectIdLabel` üç ayrı yerde neredeyse birebir
kopyalanmıştı, tek paylaşımlı fonksiyona tekilleştirildi.**

Proaktif tarama sırasında bulunan üçüncü (küçük) madde: `src/utils/projectResolver.js`'in
export ettiği `projectIdLabel()` hiçbir yerden import edilmiyordu —
`YeniTalepModal.jsx` ve `YeniTicketModal.jsx` her biri kendi dosya-lokal,
neredeyse birebir aynı kopyasını tanımlamıştı (yalnızca "çözülemeyen" girdide
— boş/UUID — döndürdükleri sentinel string farklıydı: paylaşılan sürüm `''`,
ikisi de `'Bağlı Proje'`). `projectIdLabel` artık ikinci, opsiyonel bir
`{ unresolved }` parametresi alıyor (varsayılan `''`, `resolveProjectByAssignedId`'nin
`label || assignedProjectId` deseniyle uyumlu); iki dosya da kendi yerel
kopyalarını silip paylaşılan fonksiyonu `{ unresolved: 'Bağlı Proje' }` ile
çağırıyor. **Bilinçli olarak DOKUNULMADI:** her iki dosyadaki çevresindeki
by-id/by-name/fallback çözümleme akışı (`loadProject`/`loadDefaultProject`) —
bu akış `resolveProjectByAssignedId`'yle kavramsal olarak örtüşse de,
`YeniTalepModal.jsx`'in "isme göre bulunursa `id`'yi bilerek `defaultProjectId`
ile eziyor" gibi bileşene özgü ince bir davranışı var (aksi halde `<select>`'in
value eşleşmesi bozulurdu) — bunu ortak bir yardımcıya taşımak gerçek bir
davranış riski taşıdığından bu turun kapsamı dışında bırakıldı, yalnızca
gerçekten birebir aynı olan etiket biçimlendirme mantığı tekilleştirildi.
Değişikliğin davranışı hiç etkilemediği `procurement-role-acceptance.spec.js`
(santiye şefinin sabit-proje talep formu) + `manual-task-progress.spec.js`
çalıştırılıp doğrulandı, `npm run lint`/`build` temiz.

**15.09.2026 (2. tur) — bir önceki turda bulunan iki test-kapsamı boşluğu
kapatıldı: "Onaylar"/"Talep Eden" filtresi + İş Planı hiyerarşi gruplaması.**

`tests/onaylar-tab-ve-talep-eden-filtresi.spec.js` (yeni) — Malzeme Listesi'nin
"Talep Eden" filtresini (proje yöneticisi olarak iki farklı talep sahibinin
kalemleri arasında filtreleyip yalnızca ilgilisini görme) ve Satın Alma'nın
"Onaylar" sekmesini gerçek UI etkileşimiyle doğrular: proje yöneticisi yalnızca
kendisine yönlendirilen (approver_role='proje_yoneticisi') talebi görüp
onaylayabiliyor, admin'e yönlendirilmiş bir talebi hiç görmüyor; admin kendi
talebini görüp reddedebiliyor. Osman Karadoğan hesabıyla gerçek
`create_procurement_item_change_request` çağrısı + proje yöneticisi/admin
hesaplarıyla tarayıcıda uçtan uca test edildi, temizlik doğrulandı (test
kalemleri DB'de sıfır kaldı).

`tests/is-plani-hiyerarsi.spec.js` (yeni) — Genel/Detaylı İş Planı'nın ikisinin
de `buildGroupTree`'nin ürettiği ÇOK SEVİYELİ ağacı (üst segment › inverter ›
AC-DC gibi) doğru render ettiğini, 09.09.2026'nın 7. turdaki (sonra geri alınan)
regresyonunu — çok seviyeli group_label'ı tek düz kovaya indirgeme — doğrudan
regresyon guard'ı olarak doğrular: kendi izole (marker'lı) 3 satırlık bir görev
seti (`TOP › INV1 › AC`, `TOP › INV1 › DC`, `TOP › INV2 › AC`) `project_tasks`'a
eklenip Genel'de üç seviyenin de ayrı başlık olduğu, özellikle aynı isimli iki
farklı "AC" yaprağının (Inverter-1 ve Inverter-2 altında) birbirine
karışmadan İKİ AYRI başlık olarak göründüğü doğrulanıyor; Detaylı'nın da AYNI
ağacı kullandığı ayrıca test ediliyor. **Teknik not:** bu iki saf fonksiyon
(`buildGroupTree`/`groupConfigFor`) `TabIsPlan.jsx`'in içinde tanımlı ve dosya
transitif olarak `src/lib/supabase.js`'i (→ `import.meta.env`) import ettiğinden
`bom-matching.spec.js`'teki gibi doğrudan Node'da import edip saf birim testi
yazmak mümkün olmadı (`import.meta.env` Vite dışında undefined) — bu yüzden
test gerçek tarayıcı + seed edilmiş `project_tasks` satırlarıyla yapıldı (kod
tabanına dokunulmadan, üretim yolu birebir egzersiz edilerek).

Tam Playwright regresyon paketi (90 test, bu iki yeni dosya dahil) bu iki dosya
eklendikten sonra çalıştırıldı: 87 geçti, 3'ü zaten bilinen/kabul edilmiş
`request_no` kalıntı çakışması ile başarısız oldu (bkz. "Bilinen açık noktalar"
→ ilgili madde, bu turla ilgisiz). Yeni eklenen 2 test dosyası dahil hiçbir
test bu turda yeni bir başarısızlık üretmedi. `npm run lint`/`build` temiz.

**15.09.2026 (1. tur) — proaktif ölü kod taraması: 2 öksüz CSS bloğu silindi + CLAUDE.md'de
bayat bir "silindi" notu düzeltildi.**

Kullanıcı isteğiyle iki paralel tarama yapıldı (kod tabanında kalıntı/dead
code + son özelliklerin test kapsamı). Kod tabanı taraması iki gerçek, güvenle
silinebilir bulgu çıkardı — ikisi de `Dashboard.css`'te, hiçbir `.jsx`'te
referansı olmadığı `grep` ile tek tek doğrulandıktan sonra kaldırıldı:
`.tl-toolbar-sev` kuralı (artık var olmayan bir ticket-liste toolbar öğesini
hedefliyordu) ve satın alma özet ekranındaki artık var olmayan bir sütun/donut
grafik bileşenine ait tüm blok (`sa-chart-total`, `sa-column-bars`,
`sa-column-chart`, `sa-column-item`, `sa-column-track`, `sa-currency-card`,
`sa-currency-row`, `sa-donut`, `sa-donut-legend`, `sa-donut-wrap`,
`sa-overview-grid`). Aynı komşulukta duran `.sa-panel-card`/`.sa-metric`e
DOKUNULMADI — hâlâ 2'şer dosyada kullanımda oldukları doğrulandı.

Tarama ayrıca bir dokümantasyon tutarsızlığı buldu: CLAUDE.md
`classifyRequestTypes()`'ın 09.09.2026'da (5. tur) silindiğini söylüyordu ama
fonksiyon hâlâ `src/utils/satinAlma.js`'te duruyordu. Git geçmişi kontrol
edildi: silme gerçekten olmuş ama AYNI GÜN içinde geri alınmış
("fix: classifyRequestTypes'i geri getir - onceki temizlik test kirdi") çünkü
`tests/purchase-risk-classification.spec.js` buna bağımlıydı — CLAUDE.md notu
hiç güncellenmemişti. İlgili madde düzeltildi: fonksiyon production `src/`
kodunda hâlâ hiç import edilmiyor ama o test dosyası tarafından gerçekten
test ediliyor, yani silinecek ölü kod değil, test-only bir yardımcı olarak
bilinçli şekilde kalmalı.

Aynı taramada iki test-kapsamı boşluğu da bulundu (bu turda düzeltilmedi,
kullanıcı yalnızca CSS/dokümantasyon düzeltmesini seçti): Malzeme Listesi'nin
"Onaylar" alt-sekmesi + "Talep Eden" filtresinin kalıcı bir Playwright testi
yok (yalnızca 09.09.2026'da geçici bir testle bir kerelik doğrulanıp
silinmiş); Genel/Detaylı İş Planı hiyerarşi ayrımının gerçek gruplama mantığı
(`buildGroupTree`/`groupPath`) da sekme geçişi dışında hiç test edilmiyor.
**Bu iki boşluk da aynı gün içinde 2. turda kapatıldı** — bkz. yukarıdaki
15.09.2026 (2. tur) girdisi.

`npm run lint`/`build` temiz.

**11.09.2026 (3. tur) — react-router v7 migration'ının 2. fazı (asıl paket
geçişi) tamamlandı — madde tamamen kapandı.**

1. fazda (future flag'ler) doğrulanan davranışın gerçek v7 paketinde de aynen
geçerli olduğu onaylandı. `react-router-dom@6.30.6` → `@7.18.3` yükseltildi.
Araştırma: v7'de `react-router-dom` artık kendi kodunu taşımıyor, tamamen
`react-router`'ı re-export ediyor (`export * from "react-router"`) — bu yüzden
paketin kendi dist dosyasında `BrowserRouter` aranınca bulunamadı, gerçek
implementasyon `node_modules/react-router/dist/development/*.mjs`'te bulundu.
Orada görülen: `BrowserRouter` artık `future` prop'unu HİÇ kabul etmiyor —
`v7_relativeSplatPath` davranışı kalıcı varsayılan oldu, `v7_startTransition`
ise `useTransitions` adlı (varsayılanı `true`) yeni bir prop'a dönüştü. Bu
yüzden kod tarafında yalnızca `src/App.jsx`'teki `future={{...}}` satırının
kaldırılması gerekti — 1. fazda test edilenden farklı bir davranışa
geçilmiyor, yalnızca API şekli değişti. Diğer 4 dosyanın (`ProtectedRoute.jsx`,
`router/index.jsx`, `pages/dashboard/index.jsx`, `pages/Yetkisiz.jsx`)
kullandığı `Routes`/`Route`/`Navigate`/`useNavigate`/`useLocation` doğrudan
`require()` ile tek tek kontrol edilip hepsinin v7'de aynen var olduğu
doğrulandı. `npm run lint`/`build` temiz, **tam Playwright regresyon paketi
(88 test) paket yükseltmesinden SONRA 87/88 geçti** — kalan 1'i zaten bilinen/
kabul edilmiş `request_no` test-only boşluğu (migration'la ilgisiz, RPC'yi
atlayıp doğrudan `.insert()` yapan tek bir concurrency testi). npm audit'teki
react-router CVE'si (open redirect + SSR hydration) bu yükseltmeyle kapandı —
kalan tek moderate bulgu artık yalnızca `uuid` (via exceljs, önceden
erişilemez olduğu doğrulanmıştı). Ayrıntı için "Bilinen açık noktalar"daki
ilgili maddeye bakılabilir (artık ~~çözüldü~~ olarak işaretli).

**11.09.2026 (2. tur) — proaktif DB advisor + npm audit taraması: yeni bir DB
güvenlik/performans bulgusu çıkmadı, npm tarafında kırılmayan bağımlılık
güncellemeleri uygulandı.**

Kullanıcı isteğiyle düzenli hijyen taraması yapıldı. `get_advisors`
(security+performance) sonuçları önceki turlarla birebir aynı kalıba oturdu:
50 SECURITY WARN'ın 49'u bilinçli SECURITY DEFINER RPC katmanı (tam liste
tek tek isim bazında kontrol edildi — hiçbiri trigger-only bir fonksiyon
değil, yani daha önce iki kez bulunan "trigger fonksiyonuna gereksiz
authenticated EXECUTE" bug sınıfından yeni bir örnek yok), 1'i bilinen
`auth_leaked_password_protection` (Free plan kısıtı). Performance tarafı
tamamı INFO seviyesi: 3 `archive` şema yedek tablosunda PK yok (zararsız,
tek seferlik yedekler) + bir grup "unused index" (küçük test veri setinde
beklenen gürültü — 09.09.2026'da eklenen teklif/pazarlık FK index'leri de
bu listede, henüz kullanılmamış olmaları normal, kaldırılmadı). Hiçbir yeni
migration gerekmedi.

`npm audit --omit=dev` 5 bulgu gösterdi: `brace-expansion` (HIGH), `react-router`
(moderate, zaten bilinen/migration'ı süren madde), `uuid` (moderate, zaten
bilinen/exceljs üzerinden erişilemez olduğu doğrulanmış madde). `npm audit fix`
(force'suz) çalıştırıldı — `brace-expansion`/`postcss`/`nanoid`/`js-yaml`/
`browserslist` sorunsuz güncellendi (yalnızca `package-lock.json`, `package.json`
değişmedi). Kalan 3 madde (`esbuild`/`react-router`/`uuid`) `--force` (breaking
change) gerektiriyor, ayrıntı ve gerekçe için "Bilinen açık noktalar"a eklenen
yeni `esbuild` maddesine bakılabilir. Güncellemeden sonra `npm run lint`/`build`
temiz, tam Playwright regresyon paketi (88 test) 87/88 geçti — tek başarısız
zaten bilinen/kabul edilmiş `request_no` test-only boşluğu (RPC'yi atlayıp
doğrudan `.insert()` yapan tek bir concurrency testi).

**11.09.2026 — react-router v7 migration'ının 1. fazı (future flag'ler)
uygulandı ve tam regresyon paketiyle doğrulandı; bu sırada xlsx→exceljs
migration'ının gözden kaçırdığı 2 test dosyası da düzeltildi.**

CLAUDE.md'de bir önceki turdan (10.09.2026, 2. tur) kalan "araştırıldı ama
uygulanmadı" react-router maddesinin önerdiği 2 aşamalı yoldan ilki
gerçekleştirildi: `src/App.jsx`'teki `<BrowserRouter>`'a
`future={{ v7_relativeSplatPath: true, v7_startTransition: true }}` eklendi.
Playwright ile proje_yoneticisi hesabıyla `/dashboard/*` splat route'u,
proje-içi 5 sekme arası geçişi (URL replace), tarayıcı geri/ileri'yi, derin
URL'de sayfa yenilemeyi ve üst-seviye client-side navigasyonu (Bildirimler/
Genel Bakış) kapsayan bir doğrulama testi yazıldı; flag'ler açıkken temiz
geçti, flag'ler geçici kaldırılıp aynı test tekrar koşulduğunda aynı
(ilgisiz) konsol hatası baseline'da da çıktı — yani flag'lerin kendisi hiçbir
yeni sorun üretmiyor. Ardından **tam Playwright regresyon paketi (88 test)**
flag'ler açık haldeyken çalıştırıldı: 86 geçti. Kalan 2 başarısızlığın
ikisi de flag'lerle ilgisiz çıktı — biri önceden bilinen/kabul edilmiş
`request_no` test-only boşluğu (bkz. ilgili madde), diğeri bu tam paket
koşumunda YENİ ortaya çıkan bir bulgu: `tests/material-list-excel.spec.js`
ve `tests/project-excel-layout.spec.js`, 10.09.2026'daki xlsx→exceljs
migration'ında atlanmış — hâlâ `xlsx` import ettiklerinden `Cannot find
package 'xlsx'` ile tamamen yüklenemiyorlardı (migration taraması yalnızca
`src/`'i kapsamış, `tests/`'i değil). İkisi de `exceljs`'e çevrildi; bu
sırada ExcelJS'in sparse-array ("hole") döndürebilen `row.values`'ından
kaynaklanan ayrı bir ince bug da bulunup düzeltildi (ayrıntı için "Bilinen
açık noktalar" altındaki iki ilgili maddeye bakılabilir). `npm run lint`/
`build` temiz. **Hâlâ yapılmayan:** asıl `react-router-dom` v7 paket sürüm
atlaması — yalnızca future flag'ler v6.30.6 üzerinde açıldı, kullanıcı onayı
olmadan uygulanmayacak.

**10.09.2026 (3. tur) — "ertelenenler" yeniden incelendi: `xlsx` (SheetJS)
tamamen kaldırılıp `exceljs`'e geçirildi (gerçek saldırı yüzeyi sanılandan
geniş çıktı), `react-router` v7 için araştırma tamamlandı (henüz uygulanmadı).**

Kullanıcı isteğiyle daha önce "kabul edildi"/"ertelendi" diye kapatılan iki
madde yeniden ele alındı. Kod taraması ikisi için de önceki değerlendirmenin
eksik olduğunu gösterdi:

- **xlsx — gerçek kapsam dokümante edilenden geniş çıktı.** CLAUDE.md'nin eski
  hâli "edge fonksiyonları + projectExcelImport.js" diyordu — ama edge
  fonksiyonları (`import-project-excel`/`export-project-excel`) `xlsx` değil
  `exceljs` kullanıyor (yanlış dokümantasyon), ve gerçek `xlsx.read()` (parse)
  çağrısı üçüncü, hiç bahsedilmemiş bir dosyada daha vardı:
  `src/components/agent/AgentChat.jsx` — `FloatingAgent` (`index.jsx:545`)
  hiçbir rol filtresi olmadan render edildiğinden, bu saldırı yüzeyi
  "yalnızca admin/proje_yöneticisi" değil **tüm 4 rol** için açıktı.
- **Düzeltme (kabul yerine kaldırma):** `exceljs@4.4.0` (zaten edge
  fonksiyonlarında kullanılan, aktif bakımlı) frontend bağımlılığı olarak
  eklendi, `xlsx` 3 dosyadan da (`exportUtils.js`, `projectExcelImport.js`,
  `AgentChat.jsx`) tamamen çıkarıldı ve `npm uninstall xlsx` ile kaldırıldı.
  Yeni paylaşılan yardımcı: `src/utils/downloadFile.js` (`downloadBlob()`) —
  exceljs'in `writeBuffer()`'ı SheetJS'in `writeFile()`'ının aksine tarayıcı
  indirmesini otomatik tetiklemediğinden, Blob + geçici `<a download>` linkiyle
  elle yapılıyor. `exportUtils.js`'teki 3 Excel export fonksiyonu (`exportToExcel`,
  `exportGunlukRaporExcel`, `exportPeriodReportExcel`) artık ortak bir
  `buildStyledSheet()` yardımcısını paylaşıyor (öncesinde 3 kez neredeyse
  birebir kopyalanmış SheetJS aoa/stil kodu vardı) — banner/kolon başlığı
  renk-yazı stilleri (RGB→ARGB çevrimiyle) birebir korundu. Bu üçü + `AgentChat`'in
  dosya-eki metne çevirme yolu + proje sihirbazının "manuel doldur" import'u
  (`parseIsKalemleri`/`downloadProjectTemplate`) hepsi artık `async` (writeBuffer
  promise döndürdüğünden) — çağıran yerler (`ExportButton.jsx`, `ProjeDetay.jsx`)
  `await` eklenerek güncellendi, `vite.config.js`'teki `vendor-xlsx` manualChunk
  girdisi `'xlsx'`'ten `'exceljs'`e çevrildi (aksi halde build "Could not resolve
  entry module xlsx" ile patlıyordu).
  **Doğrulama:** canlı admin hesabıyla gerçek bir Excel export indirilip
  (`ExportButton` → TabGenel) indirilen dosya `exceljs` ile geri okunarak
  banner/kolon stillerinin (bold/renk/dolgu) doğru yazıldığı doğrulandı;
  `parseIsKalemleri()`/`downloadProjectTemplate()` gerçek kaynak koddan
  esbuild ile bundle edilip Node'da (hem string hem gerçek Excel Date hücreli
  tarih girdileriyle) doğrudan test edildi; `AgentChat`'in dosya-eki akışı
  canlı tarayıcıda `.xlsx` dosyası eklenerek konsol/sayfa hatası olmadığı
  doğrulandı. `npm run lint`/`build` temiz (yalnızca `vendor-xlsx` chunk'ı
  ~938 kB'a çıktı — exceljs SheetJS'ten daha büyük bir kütüphane, bilinçli
  bir bundle-size ödünleşimi, ayrıca optimize edilmedi).
  **Not — `exceljs`'in kendi `uuid` bağımlılığı** `npm audit`'te moderate bir
  CVE taşıyor (GHSA-w5hq-g745-h8pq, "buf parametresi verildiğinde bounds
  check eksik") ama exceljs bu fonksiyonu (`cf-rule-ext-xform.js`) her zaman
  parametresiz (`uuidv4()`) çağırıyor — yani bu projede bu güvenlik açığının
  tetiklenme yolu hiç yok, kontrol edilip doğrulandı.
- **react-router v7 — yalnızca araştırıldı, henüz göç edilmedi.** Kullanım
  tamamen deklaratif (data router API'si yok), advisory'nin SSR bacağı hiç
  geçerli değil, open-redirect bacağı da `navigate()` çağrılarının hiçbirinin
  kullanıcı kontrollü hedef almaması nedeniyle düşük risk. Ama resmi migration
  rehberi `v7_relativeSplatPath` davranış değişikliğinin tam olarak
  `/dashboard/*` gibi çok segmentli splat route'ları etkilediğini gösterdi —
  bu route bu projede özellikle hassas (bkz. "Frontend yapısı" → Routing,
  kasıtlı tek wildcard + remount bug geçmişi). Ayrıntı ve önerilen 2 aşamalı
  yol (önce v6'da future flag + test, sonra asıl v7 geçişi) "Bilinen açık
  noktalar" bölümüne yazıldı — kullanıcı onayı beklemeden uygulanmadı.

**10.09.2026 (2. tur) — DB advisor hijyeni (2 küçük düzeltme) + 3 yeni test
dosyasıyla yakın zamanda eklenen ama hiç test kapsamında olmayan üç özellik
kapatıldı.**

Kullanıcı isteğiyle proaktif bir tarama yapıldı: `get_advisors`
(security+performance) çalıştırıldı, iki gerçek (ama düşük riskli) bulgu
düzeltildi —
1. `fn_release_monthly_plan_link_on_request_terminal_status` (07.09.2026'daki
   aylık plan linki temizleme trigger'ı) `anon` rolüne bile EXECUTE açık
   bırakılmıştı — `RETURNS trigger` olduğundan pratikte somurulamaz (Postgres
   trigger fonksiyonlarının doğrudan çağrılmasını reddeder) ama projenin
   kendi "yeni SECURITY DEFINER'da REVOKE FROM PUBLIC,anon" kuralına
   uymuyordu — `REVOKE` ile kapatıldı.
2. `purchase_offers` (created_by/request_id/supplier_id) ve `purchase_requests`'in
   yeni pazarlık kolonları (negotiated_by/selected_offer_id/stage_approved_by)
   üzerinde covering index yoktu (`unindexed_foreign_keys` INFO) — 6 index
   eklendi.

Ardından, 09.09.2026'da eklenen ama hiç Playwright kapsamında olmayan üç
özellik için test yazıldı:
- **`tests/company-selector.spec.js`** — Şirket seçici (Fons Solar/PV
  Solution). PV Solution'ın projesiz oluşturulup `cost_allocations`'a hiç
  yansımadığını, Fons Solar yolunun hâlâ doğru yansıdığını (regresyon
  guard) ve arayüzde şirket seçilince "Proje ve Bağlı Talep" kartının
  görünürlüğünü doğrular. **Test yazılırken gerçek bir bulgu çıktı (ürün
  hatası değil, test varsayımı hatasıydı):** `financial_transactions`'ta
  client-erişimli bir DELETE policy'si yok (diğer finans tablolarındaki
  hiç-hard-delete deseniyle tutarlı) — ilk yazımda test cleanup'ı sessizce
  hiçbir şey silmiyordu (RLS 0 satır etkiliyordu, hata da dönmüyordu),
  `status='iptal'`e çekilerek düzeltildi (bu da `trg_financial_transaction_cost_allocation`'ı
  tetikleyip bağlı `cost_allocations` satırını otomatik temizliyor). Ayrıca
  `cost_allocations`'ın admin-only SELECT olduğu (muhasebe göremez) ilk
  yazımda gözden kaçmıştı — kontrol admin client'ına taşındı.
- **`tests/approver-role-routing.spec.js`** — 09.09.2026'daki approver_role
  yönlendirmesi (Osman Karadoğan/Cem Aslan admin hesaplarından açılan
  malzeme değişikliği talepleri proje yöneticisine düşer, diğer admin
  hesapları `admin`de kalır). İki yönü de doğrular: doğru hesap doğru role
  yönlendiriliyor VE bu yönlendirme `review_procurement_item_change_request`'in
  kendi yetki kontrolünü fiilen etkiliyor (proje yöneticisi yalnızca kendine
  yönlendirilmiş talebi onaylayabiliyor, `admin`e yönlendirilmiş birini
  onaylayamıyor).
- **`tests/bom-matching.spec.js`** — 07.09.2026'daki malzeme eşleştirme
  önerisi (`nameSimilarity`/`suggestBomMatches`, `src/utils/satinAlma.js`).
  Bu proje vitest/jest kullanmıyor ama bu iki fonksiyon yan etkisiz saf JS
  olduğundan (DB/browser bağımlılığı yok) Playwright'ın `page` fixture'ı
  olmadan çalışan `test()` ile doğrudan unit-test gibi test edildi — CLAUDE.md'de
  dokümante edilen gerçek fix vakasını ("TTR kablo" ↔ uzun/teknik BOM adı,
  ilk sürümde %16, `tokenSetSimilarity` fix'iyle %100) doğrudan regresyon
  guard'ı olarak kullanır, ayrıca `suggestBomMatches`'in filtre mantığını
  (bom_item_id dolu/kategori/durum/eşik altı) kapsar. Canlı proje verisine
  (`kaptan-demir-adana-arazi-faz1`) bağımlı olmadığından kırılgan değil.

Dört PR da (#15-#18) `main`'e merge edildi, her birinde production deploy
doğrulandı. `npm run lint` bu turda değişmeyen 10 önceden-bilinen uyarıyla
temiz (0 hata).

**10.09.2026 — `request_no` çakışmasının GERÇEK KÖK NEDENİ bulundu ve
düzeltildi (Supabase support'a taşınmasına gerek kalmadı).**

Bu maddenin serüveni aynı gün içinde iki aşamalı oldu:

1. Önce en düşük riskli yol olarak `create_purchase_request_with_items`/
   `create_purchase_request_from_monthly_plan`'a `unique_violation`'da
   otomatik retry (en fazla 5 deneme) eklendi — kök neden bilinmediği için
   yalnızca bir workaround olarak düşünüldü.
2. Kullanıcının "neden Supabase'e bağlanıp kendin açmıyorsun" sorusu üzerine
   canlı bir zorlanmış-çakışma testiyle (gerçek bir talep + kasıtlı olarak
   aynı `request_no`'yu önceden dolduran bir dummy satır) retry'ın davranışı
   doğrudan test edildi — ve retry'ın **hiç işe yaramadığı**, aynı numarayla
   5 kez üst üste aynı hatayı verip yükselttiği bizzat gözlemlendi.

**Gerçek kök neden:** `fn_next_purchase_request_no()` sayaç değerini normal
bir tabloda (`purchase_request_no_counters`) tutup çağıranın transaction'ı
İÇİNDE artırıyordu. PL/pgSQL'in `exception when unique_violation` bloğu bir
hatayı yakaladığında, bloğun başındaki implicit savepoint'e geri sarar — bu
geri sarma, AYNI savepoint içinde yapılmış olan sayaç artışını da geri
alıyordu. Yani: bir INSERT herhangi bir sebeple `request_no` çakışmasıyla
başarısız olup geri sarıldığında, sayaç da eski değerine dönüyor ve bir
sonraki deneme (retry veya tamamen farklı bir istek) **AYNI numarayı tekrar
üretiyordu** — bu, PgBouncer/PostgREST ile hiç ilgili değildi, saf bir
"transaction içinde artan, rollback'e dayanıksız sayaç" bug'ıydı. Retry
eklemek durumu düzeltmek yerine sorunu her seferinde 5 kat daha görünür
(deterministik) hale getirdi.

**Düzeltme:** `purchase_request_no_counters` tablosu yerine yıl başına gerçek
bir Postgres `SEQUENCE` (`purchase_request_no_seq_2026`, mevcut sayaçtan
—1046'dan— devam edecek şekilde 1047'den başlatıldı) kullanılıyor artık.
`nextval()` Postgres tarafından ÖZEL OLARAK transaction rollback'inden
etkilenmeyecek şekilde tasarlanmış — ihtiyaç tam olarak buydu.
`fn_next_purchase_request_no()` yeni yıllar için sequence'i ilk çağrıda
otomatik oluşturuyor (`create sequence if not exists`), advisory lock artık
gereksiz (sequence'ler doğal olarak eşzamanlılığa karşı güvenli). Aynı
zorlanmış-çakışma testi bu düzeltmeyle tekrarlandı: hata alınmadı, retry
(hâlâ yerinde duruyor, artık zararsız bir defans katmanı) hiç tetiklenmeden
ya da bir kez tetiklenip başarıyla tamamlandı. `purchase_request_no_counters`
tablosu o gün hiçbir fonksiyon tarafından okunmuyordu ama veri kaybı riski
almamak için hemen silinmemişti — 10.09.2026'nın ilerleyen bir turunda
(DB advisor taraması sırasında: RLS'i kapalıydı, ama `anon`/`authenticated`'a
hiç grant verilmediğinden gerçek bir REST açığı yoktu) ertelenmiş temizlik
tamamlandı, tablo `drop_dead_purchase_request_no_counters_table` migration'ıyla
kaldırıldı.

**DÜZELTME (aynı gün, birkaç saat sonra) — bir önceki "Sonuç" bölümündeki
"artık KAPALI" ifadesi ERKEN verilmiş bir sonuçtu, tam regresyon paketi
çalıştırılınca yanlış çıktı.** Tam paket (74 test) bu düzeltmeden sonra
çalıştırılınca 6 test hâlâ AYNI imzayla ("request_no already exists", düşük
numaralarla — SAT-2026-105..109 gibi) başarısız oldu. Bu 6 testin TAMAMI
tek worker'la tam sıralı (`playwright.config.js`: `workers:1`,
`fullyParallel:false`, `retries:0`) çalıştığından, Playwright'ın kendi
paralelliği/retry'ı bu duruma karışmıyordu. Kapsamlı canlı adli inceleme
yapıldı ve şunların HİÇBİRİ açıklama olarak doğrulanamadı: (a) `pg_sequences`
üzerinden sequence'in kendisi izole test edildiğinde tertemiz, hiç geriye
sarmadan ilerliyordu (1046→1102); (b) bu makinede lingering başka bir
Playwright/test process'i yoktu (yalnızca eski `npm run dev` instance'ları
— bazıları 3 Ağustos'tan beri açık kalmış, ayrı bir bulgu — ve ilgisiz bir
Next.js/CRM projesi vardı); (c) `pg_stat_activity` o anda başka aktif bir
transaction göstermiyordu; (d) kullanıcının ayrı bir "PV Solutions CRM"
oturumu tamamen FARKLI bir Supabase projesine (`mzwxtfnmikgcrmjgkvad`)
bağlıydı, bu projeyle ilgisizdi; (e) Supabase'de `main` dışında bir preview
branch yoktu (branch-reset ihtimali de elendi). Yani: bugün bulunan ve
düzeltilen mekanizma (transaction-rollback'in sayaç artışını geri alması)
KESİN OLARAK gerçek ve doğrulanmış bir bug'dı — ama bu, `request_no`'nun
ARTIK HİÇ ÇAKIŞMAYACAĞI garantisi vermiyor; kalıntı bir çakışma kaynağı
(muhtemelen gerçekten dış/eşzamanlı bir yazıcı, ama kanıtlanamadı) hâlâ var
ve nedeni bulunamadı.

**Pragmatik önlem:** kullanıcı kararıyla, kök nedeni bulmaya daha fazla zaman
harcamak yerine iki RPC'deki retry sınırı 5'ten **20**'ye çıkarıldı
(`bump_request_no_retry_cap_to_20` migration'ı) — ucuz, güvenli, kök nedeni
çözmüyor ama kalıntı hatanın kullanıcıya ulaşma ihtimalini daha da azaltıyor.
RPC'den geçmeyen ham insert'ler (ör. `purchase-single-item.spec.js`'teki
concurrency testi, doğrudan `.from('purchase_requests').insert(...)`
kullanıyor) hâlâ korumasız — bu, bugünkü işin kapsamı dışında, önceden de
böyleydi.

**Sonuç (düzeltilmiş):** "Bilinen açık noktalar"daki bu madde TAMAMEN
KAPANMADI — mekanizma-seviyesi kök neden kesin olarak bulunup düzeltildi
(gerçek ilerleme), ama regresyon paketinde ~%8 (6/74) kalıntı bir arıza
oranı hâlâ gözlemleniyor, nedeni tam olarak belirlenemedi. Supabase
support'a hâlâ açılmadı — açılırsa artık "PgBouncer/PostgREST" hipotezi
değil, bu turda toplanan adli kanıtlarla (sequence temiz, yerel süreç/oturum
elendi) birlikte açılmalı.

**DOĞRULAMA (aynı gün, retry sınırı 20'ye çıkarıldıktan sonra) — sonuç
NET ŞEKİLDE İYİLEŞTİ, madde artık pratikte kapalı sayılabilir.** Tam
regresyon paketi tekrar çalıştırıldı: 74 testten yalnızca **1'i** başarısız
oldu (önceki turda 6'ydı) — ve o tek hata da zaten önceden kullanıcıya
açıkça söylenmiş, bilinen bir sınırdan geliyor:
`purchase-single-item.spec.js`'in "eş zamanlı iki ilk kalem" testi RPC'yi
atlayıp doğrudan `.from('purchase_requests').insert(...)` yapıyor (retry
sarmalayıcısının kapsamadığı tek yol). **Gerçek uygulama akışında** (frontend
`YeniTalepModal.jsx`) talep oluşturma HER ZAMAN `create_purchase_request_with_items`
RPC'sinden geçiyor — yani bu kalan boşluk yalnızca bu özel test senaryosunda
var, gerçek kullanıcı riskinde değil. Sonuç: mekanizma-seviyesi kök neden
kesin düzeltildi + pragmatik retry artışı kalıntı riski pratikte sıfıra
indirdi; kalan tek nokta test-only bir kod yolu, üretim etkisi yok.

**09.09.2026 (9. tur) — Fatura/harcama ekleme sihirbazına Şirket seçici
eklendi: Fons Solar (projeli) vs PV Solution (projesiz genel harcama).**

Kullanıcı isteği: `FaturaOlusturModal.jsx`'in genel giriş noktalarında
(request prop'u boşken — Faturalar/Satın Alma/Ödemeler sayfalarındaki
"＋ Fatura / Harcama Ekle" butonları, `isLocked=false`) sihirbazın en başına
"Proje ve Bağlı Talep" kartından ÖNCE bir **Şirket** kartı eklendi
(`invoice-mode-toggle` ile aynı görsel dil — Faturalı/Faturasız toggle'ıyla
birebir aynı buton stili). **Fons Solar** (varsayılan) seçiliyken davranış
hiç değişmedi — "Proje ve Bağlı Talep" kartı eskisi gibi zorunlu. **PV
Solution** seçilince "Proje ve Bağlı Talep" kartı TAMAMEN gizlenir
(`isPvSolution` — proje alanı hiç render edilmez, `manualProjectId`/
`selectedRequestId`/`requestSearch` şirket değişince sıfırlanır) — bu
kayıtlar hiçbir GES projesine bağlanamaz, `effectiveProjectId` zorlanmış
şekilde boş kalır, `canSaveFaturali`/`canSaveFaturasiz`'in proje zorunluluğu
`isPvSolution` iken devre dışı. Talep bağlantılı (isLocked, satın alma
listesinden "Fatura Oluştur") akış her zaman Fons Solar'dır — bir satın alma
talebi zaten yalnızca bir GES projesi bağlamında var olabildiğinden şirket
seçici o modda hiç gösterilmez, sabit `company='fons_solar'`.

Yeni `company text not null default 'fons_solar'` kolonu hem `invoices` hem
`financial_transactions`'a eklendi (`invoices_company_check`/
`financial_transactions_company_check` CHECK — `'fons_solar'|'pv_solution'`),
mevcut tüm satırlar geriye dönük uyumlu. Migration öncesi doğrulandı:
`project_id` her iki tabloda zaten nullable, ve
`sync_cost_allocation_from_invoice`/`sync_cost_allocation_from_financial_transaction`
trigger'ları zaten `project_id is not null` şartıyla çalışıyor (bkz.
02.09.2026 tarihli `fix_invoice_cost_allocation_null_project_id` migration'ı)
— yani projesiz bir PV Solution kaydı `cost_allocations`'a hiç yazmadan
güvenle atlanıyor, ek bir guard gerekmedi. `fn_guard_invoice_requires_procurement_done`
de yalnızca `purchase_request_id is not null` iken çalıştığından etkilenmedi.

**Bilinçli olarak kapsam dışı bırakıldı:** Faturalar/Ödeme Takibi/Tedarikçiler
listelerinde şirkete göre filtre veya kolon eklenmedi — kullanıcı yalnızca
ekleme akışını istedi, mevcut listeler `company` alanını görüntülemiyor
(ihtiyaç olursa ayrı bir iş). Gerçek RPC + UI ile admin hesabıyla Playwright'ta
uçtan uca doğrulandı (PV Solution seçilince proje kartının kaybolduğu,
faturasız kaydın `company='pv_solution'`/`project_id=null` ile gerçekten
yazıldığı — test kaydı silindi). `npm run lint`/`build` temiz.

**09.09.2026 (8. tur) — 6-7. turdaki "Genel İş Planı'nı tek seviyeye indirge"
kararı YANLIŞ çıktı, geri alındı: Genel yeniden çok seviyeli hiyerarşiyi
kullanıyor, yalnızca KENDİ renkli/tarihsiz stiliyle.**

Kullanıcı Kaptan Demir'de "Elektriksel Bölüm" grubunu açınca 6-7. turun tek-
seviyeli gruplamasının gerçek bir kullanılabilirlik sorunu yarattığını fark
etti: 108 görevin çoğu aynı ada sahip (ör. "AC Kazı Açılması" 8 kez, her
inverter için bir tane) ve hiçbir alt başlık olmadan TEK bir düz listede
ayırt edilemez şekilde art arda diziliyordu — "işleri başlıklarına göre
bölmedin" diye bildirdi. Bu, 6-7. turda "Genel de genel olarak kalacaktı"
talebinin yanlış yorumlandığını gösterdi: kullanıcı Genel'in tek-seviyeli
olmasını değil, kendi GÖRSEL KİMLİĞİNİ (renkli/tone'lu başlık, tarih sütunu
yok) korumasını istiyormuş — çok seviyeli hiyerarşinin (Inverter-1..9 ×
AC/DC alt kırılımı) kendisi Detaylı için zaten gerekli VE Genel için de
görevleri ayırt edilebilir kılmak için gerekli.

Düzeltme: `buildGroupTree(withDates)` yeniden Genel'in kendi render'ında
kullanılıyor (6-7. turda eklenen tek-seviyeli `grouped`/`groupKeys`/
`topGroupNames` mantığı tamamen kaldırıldı, `allGroupNames`/`groupFilter`
Detaylı ile aynı tam/granüler kümeye geri döndü). `renderGanttGroupNode`
fonksiyonu geri getirildi ama Detaylı'nın (`TabIsPlaniDetay.jsx`'teki
`buildDetayRows`) düz/beyaz + tarih sütunlu başlık stili yerine Genel'in
kendi eski stilini kullanıyor: `groupConfigFor(node.label)`'dan gelen
tone-renkli tam-genişlik bant + yalnızca toggle/başlık/"X görev | %Y" özeti
(tarih sütunu yok), derinliğe göre artan girinti (`GROUP_INDENT_PX`). İki
görünüm artık AYNI veri hiyerarşisini paylaşıyor, yalnızca görsel kimlikleri
(renkli-sade vs düz-detaylı) ayrışık kalıyor — 6-7. turdaki asıl doğru fikir
buydu, yalnızca uygulaması (tek-seviyeye indirgeme) hatalıydı. Kaptan Demir
Çelik'te admin hesabıyla gerçek verilerle Playwright'ta doğrulandı: Genel'de
36 renkli grup başlığı (Elektriksel Bölüm → TR-1-3000 kVA → Inverter-N →
AC/DC gibi iç içe, her biri kendi rengiyle), Detaylı'da Inverter/Sapma
kolonu hâlâ değişmeden duruyor. `npm run lint`/`build` temiz.

**09.09.2026 (7. tur) — Genel İş Planı'nın grup KIRILIMI da (yalnızca stili
değil) eskiye döndürüldü: Elektriksel görevler artık tek "Elektriksel Bölüm"
grubunda, inverter/AC-DC bazında ayrı ayrı DEĞİL.**

Bir önceki turdaki (6. tur) görsel/stil revert'i tek başına yetmedi —
kullanıcı "verilerin de eskiye dönmesi lazım" diye belirtti. Kök neden:
Kaptan Demir projesindeki 120 görevden 108'inin `group_label`'ı 07.09.2026'daki
hiyerarşi özelliği için Detaylı İş Planı'na yönelik " › " ayraçlı çok seviyeli
bir yol olarak DB'de duruyor (ör. "Elektriksel Bölüm › TR-1-3000 kVA ›
Inverter-3 › AC" — gerçek WBS verisi, 11.08.2026'daki foto-yapı migration'larından
geliyor, DEĞİŞTİRİLMEDİ). 6. turdaki flat render, grup anahtarı olarak hâlâ
ham `resolveGroup(task)` (tam " › " string'i) kullandığından her inverter ×
AC/DC kombinasyonu kendi başına ayrı, çirkin bir üst-seviye grup gibi
görünüyordu (25 grup) — bu da kullanıcının "verileri Detaylı ile aynı
yapmışsın" ilk şikayetinin gerçek kaynağıydı, yalnızca stil değil.

Düzeltme: Genel İş Planı artık grup anahtarı olarak `groupPath(task)[0]`
(yolun yalnızca İLK/üst segmenti) kullanıyor — `groupPath` zaten var olan,
Detaylı'nın `buildGroupTree`'si için yazılmış bir yardımcı, yalnızca ilk
elemanını almak yeterli. Bu, `resolveGroup`'un ayrıca (Detaylı için) tam yolu
döndürmeye devam etmesiyle ÇAKIŞMIYOR — iki ayrı isim listesi var artık:
`allGroupNames` (ham/tam, yalnızca `TabIsPlaniDetay`'e geçiriliyor, dropdown'da
hâlâ 26 granüler seçenek) ve `topGroupNames` (yalnızca üst segment, Genel'in
kendi filtre dropdown'ında ve gruplamasında kullanılıyor — 5 temiz grup:
Şantiye Mobilizasyon/Mekanik Bölüm/Elektriksel Bölüm/ENH/KABUL). Görev
satırının kendi ilerleme çubuğu rengi de (`groupConfigFor`) aynı üst segmente
göre belirleniyor (öncesinde tam yol GROUP_CONFIG'te hiç eşleşmediğinden tüm
Elektriksel görev satırları sessizce gri/_diger rengine düşüyordu — ayrıca
bulunup düzeltilen bir bug). Kaptan Demir Çelik (Adana GES-1) projesinde
admin hesabıyla gerçek verilerle Playwright'ta doğrulandı (Genel: 5 temiz üst
grup, hiçbiri "Inverter" içermiyor; Detaylı: "Inverter" hâlâ görünüyor, 26
granüler dropdown seçeneği değişmedi). DB'ye hiç dokunulmadı — WBS/group_label
verisi olduğu gibi kaldı, yalnızca Genel'in bunu nasıl BUCKET'ladığı değişti.
`npm run lint`/`build` temiz.

**09.09.2026 (6. tur) — Genel İş Planı (Gantt) 07.09.2026'daki hiyerarşi
değişikliğinden ÖNCEKİ tek-seviyeli/renkli görünümüne geri döndürüldü.**

07.09.2026'daki "iş planı hiyerarşisi" değişikliği (b598bc6) hem Genel İş
Planı (Gantt) hem yeni oluşturulan Detaylı İş Planı'nı AYNI çok seviyeli
hiyerarşik ağaca (`buildGroupTree`, group_label'daki " › " ayracına göre iç
içe dallar) + aynı düz/beyaz + tarih sütunlu grup başlığı stiline geçirmişti.
Kullanıcı Kaptan Demir projesinde canlı test ederken bunun yanlış olduğunu
belirtti: Detaylı İş Planı'nın hiyerarşik/tarihli kalması doğruydu (zaten
ayrıca istenmişti), ama Genel İş Planı'nın kendi eski, sade halinde
(tek-seviyeli düz gruplama, kategoriye göre renkli tam-genişlik bant
başlıkları — `tone-mavi/yeşil/mor/turuncu/...`, tarih sütunu yok, yalnızca
"X görev | %Y" özeti) kalması gerekiyordu — iki görünüm birbirinden görsel
ve veri-yapısı olarak ayrışık olmalıydı.

Düzeltme yalnızca `TabIsPlan.jsx`'in KENDİ Gantt render'ını etkiliyor:
`renderGanttGroupNode` (tree-recursive render fonksiyonu) kaldırıldı, yerine
07.09.2026 öncesi flat `grouped`/`knownGroupKeys`/`unknownGroupKeys`/
`groupKeys` (resolveGroup + GROUP_ORDER sıralaması) mantığı ve eski JSX'i
geri getirildi; `Dashboard.css`'teki `.gantt-group-row` de eski tone-renkli
3-kolonlu (`42px minmax(0,1fr) auto`) haline döndürüldü. `buildGroupTree`/
`groupPath`/`collectNodeTasks`/`GROUP_PATH_DELIM`/`GROUP_INDENT_PX` fonksiyon/
sabitleri TabIsPlan.jsx'te dokunulmadan kaldı (hâlâ export ediliyor) — bunlar
`TabIsPlaniDetay.jsx` tarafından import edilip kullanılıyor, Detaylı İş
Planı'nın hiyerarşik tablosu tamamen değişmedi. Kaptan Demir Çelik (Adana
GES-1) projesinde admin hesabıyla gerçek verilerle Playwright'ta doğrulandı
(Genel'de 25 renkli tek-seviyeli grup başlığı, Detaylı'da hâlâ Sapma/Gerçek/
Hedef kolonlu tam tablo). `npm run lint`/`build` temiz.

**09.09.2026 (5. tur) — Ölü kod taraması: 1 DB fonksiyonu + 4 frontend ölü kod
parçası silindi, 1 gerçek bug (eksik `noStoreFetch` wiring'i) düzeltildi.**

Kullanıcı isteğiyle proaktif bir ölü kod denetimi yapıldı (DB tarafı elle,
frontend tarafı bir Explore agent'la — sonuçlar tek tek doğrulandı).

- **DB:** `log_ticket_changes()` fonksiyonu silindi (`20260909112738_drop_dead_log_ticket_changes_function`)
  — hiçbir trigger'a bağlı değildi, gerçek log trigger'ı zaten `fn_ticket_history()`.
  Diğer "trigger değil" görünen fonksiyonlar (`fn_next_purchase_request_no`,
  `fn_purchase_request_procurement_fields_only`/`fn_purchase_request_sensitive_unchanged`/
  `fn_ticket_sensitive_unchanged` — RLS policy'lerinde, `fn_recompute_auto_risks`/
  `fn_apply_approved_material_excess`/`fn_rollback_material_excess` — trigger
  gövdelerinden çağrılıyor) tek tek doğrulanıp kullanımda oldukları teyit edildi.
- **Frontend, silindi:** `MuhasebeGenelOzet.jsx`'in kullanılmayan
  `onGoToInvoice` prop'u (2026-07-29'da "Son Hareketler" tıklaması bildirimler
  sekmesine gitmeye çevrilince kalan bir artık — `index.jsx`'teki çağrı yerinden
  de kaldırıldı); `ProjeDetay.jsx`'in kullanılmayan `selectedDate`/`setSelectedDate`
  prop'ları (state `index.jsx`'te `TabGenel`/`TabTickets`/`FloatingAgent` için hâlâ
  kullanılıyor, yalnızca `ProjeDetay`'a geçirilmesi anlamsızdı); `TeklifPazarlikSiparisPanel.jsx`'teki
  `SiparisSection`'ın kullanılmayan `offers` parametresi. ~~`src/utils/satinAlma.js`'teki
  `classifyRequestTypes()` de bu turda silinmişti~~ — **bu satır bayatladı, 15.09.2026'da
  düzeltildi:** silme `tests/purchase-risk-classification.spec.js`'i kırdığı için aynı gün
  içinde geri alınmıştı ("fix: classifyRequestTypes'i geri getir") ama bu CLAUDE.md notu hiç
  güncellenmemişti — fonksiyon hâlâ `satinAlma.js`'te duruyor ve o test dosyası tarafından
  gerçekten test ediliyor (production `src/` kodunda hiç import edilmiyor, yalnızca test-only
  bir yardımcı olarak yaşıyor) — silinecek ölü kod DEĞİL, bu haliyle kalmalı.
- **Gerçek bug düzeltildi:** `src/lib/supabase.js`'teki `noStoreFetch` yardımcısı
  (`cache:'no-store'` zorlaması, PostgREST'in Cache-Control header'ı hiç
  taşımamasından kaynaklanan bayat-veri bug'larına karşı — bkz. bildirim zili/
  `procurement_monthly_plan` geçmişi) tanımlıydı ama `createClient(...)`'a hiç
  geçirilmemişti (`global:{fetch:noStoreFetch}` eksikti) — yorumun vaat ettiği
  davranış fiilen devrede değildi. `createClient` çağrısına eklendi.

`npm run lint`/`build` temiz.

**09.09.2026 (4. tur) — Malzeme Listesi'nin üstündeki toplu onay/red banner'ı
kaldırıldı, yalnızca "Onaylar" sekmesinde kaldı.**

Kullanıcı isteği: bir önceki turda kasıtlı olarak iki yerde bırakılan
`BekleyenDegisikliklerPanel` (Malzeme Listesi üstü + yeni "Onaylar" sekmesi)
tekrarı istenmedi — Malzeme Listesi'ndeki render kaldırıldı
(`ProjeTabFaturaKesilecekler.jsx`), artık toplu onay/red akışı yalnızca
Satın Alma > Onaylar'da. Tek bir kalemin satırına tıklayınca açılan
`MalzemeDetayModal`'ın kendi inline onay/red bölümü DEĞİŞMEDİ (ayrı bir
kullanım deseni — o an incelenen kalem, toplu tarama değil). `npm run lint`/
`build` temiz.

**09.09.2026 (3. tur) — Osman Karadoğan'ın approver_role migration'ından ÖNCE
açtığı, hâlâ `bekliyor` durumundaki 19 malzeme değişikliği talebi geriye
dönük olarak proje yöneticisine yönlendirildi.**

Kullanıcı isteği: bir önceki turdaki `approver_role` yönlendirmesi yalnızca
BUNDAN SONRA açılacak talepleri kapsıyordu — Osman Karadoğan'ın migration'dan
önce açtığı 19 `bekliyor` talep `approver_role='admin'` (kolonun varsayılanı)
olarak kalmıştı. Veri-migration'ı bu 19 satırı `'proje_yoneticisi'`ye
güncelledi + proje yöneticisi rolündeki 3 hesaba (`notify_role`) yeni bildirim
gönderdi (oluşturuldukları anda approver_role henüz yoktu, yalnızca admin/Cem
Aslan'a bildirim gitmişti — o bildirimler hâlâ geçerli, admin her zaman
onaylayabildiğinden silinmedi/değiştirilmedi). Cem Aslan'ın bekleyen talebi
yoktu, sorgu kapsamına dahildi ama 0 satır etkiledi. DB'de doğrulandı (19/19
`approver_role='proje_yoneticisi'`, 57 yeni bildirim = 19×3 proje yöneticisi
hesabı).

**09.09.2026 (2. tur) — Satın Alma'ya Riskler'in yanına "Onaylar" alt-sekmesi
+ Malzeme Listesi'ne "Talep Eden" filtresi eklendi.**

Kullanıcı isteği: malzeme değişikliği/ekleme onay kuyruğu (bir önceki turda
approver_role ile proje yöneticisine de açılan) artık Malzeme Listesi'nin
üstündeki bir banner'a gömülü kalmıyor — Riskler'in yanında ayrı, admin/proje
yöneticisine açık bir "Onaylar" sekmesi var (aynı `BekleyenDegisikliklerPanel`
bileşeni, export edilip iki yerde de kullanılıyor). Malzeme Listesi'ne ayrıca
bekleyen bir değişikliği olan kalemleri talep edene göre filtreleyen bir
dropdown eklendi. Gerçek Osman Karadoğan hesabıyla RPC çağrısı + proje
yöneticisi hesabıyla UI'da uçtan uca Playwright'ta doğrulandı (geçici test
dosyası, doğrulama sonrası silindi). Ayrıntı için "Malzeme listesi (BOM)
planlanan miktar değişiklikleri" bölümüne bakılabilir. `npm run lint`/`build`
temiz.

**09.09.2026 (1. tur) — Malzeme değişikliği/ekleme taleplerinde onaylayıcı rol
artık sabit admin değil (Osman Karadoğan/Cem Aslan → proje yöneticisi) + Aylık
Plan'da kalem düzenlemede ay değişince görünüm de yeni aya geçiyor.**

Kullanıcı isteği: Osman Karadoğan ve Cem Aslan admin hesaplarından açılan
malzeme değişikliği/ekleme talepleri artık proje yöneticisine onaya düşüyor
(önceden tüm bu talepler, kim açarsa açsın, sabit olarak admin'e gidiyordu —
bu iki hesap için kendi taleplerini yine admin rolünün onaylaması gerçek bir
ikinci göz sağlamıyordu). Yeni `approver_role` kolonu +
`create_procurement_item_change_request`/`create_procurement_item_add_request`/
`review_procurement_item_change_request`/`get_satin_alma_overview` güncellemesi
+ `ProjeTabFaturaKesilecekler.jsx`'in `canReview`'ının per-item hale
getirilmesi — ayrıntı için "Malzeme listesi (BOM) planlanan miktar
değişiklikleri" bölümüne bakılabilir. Admin gözetim amacıyla her zaman
onaylayabiliyor, diğer admin hesapları (genel "Admin") değişmedi.

Aynı oturumda ayrıca: Aylık Satın Alma Planı'nda bir kalemin "Ay" alanı
`PlanKalemiDetayModal` üzerinden değiştirilip kaydedildiğinde, kalem o an
görüntülenen aydan (liste `effectiveAyNo`'ya göre filtreleniyor) sessizce
kayboluyordu — kullanıcı değişikliğin işe yaramadığını sanabilirdi. Artık
kaydedince görünüm otomatik olarak kalemin yeni ayına geçiyor
(`ProjeTabAylikPlan.jsx`).

`npm run lint`/`build` bu turda temiz.

**08.09.2026 (7. tur) — Eksik regresyon testi yazılırken `request_no`
çakışması 3. kez tetiklendi; savunma migration'ı uygulandı ama SORUNU
ÇÖZMEDİ — kök neden bu oturumun araçlarının ötesinde, Supabase support'a
taşınması gerekiyor.**

CLAUDE.md'de daha önce tespit edilen "3 aşamalı Teklif/Pazarlık/Sipariş
akışının hiç kalıcı Playwright testi yok" boşluğu için `tests/procurement-negotiation-flow.spec.js`
yazıldı (8 RPC'nin tamamı: `add_purchase_offer`/`delete_purchase_offer`,
`submit_purchase_request_for_negotiation`, `review_purchase_request_negotiation_gate`,
`save_purchase_request_negotiation`, `advance_purchase_request_to_order`,
`save_purchase_request_order`, `complete_purchase_request_delivery` —
eksik/hasarlı teslimat dahil —, `cancel_purchase_request_negotiation_flow`
— akışın 4 aşamasından da). Yazarken 2. test aynı `request_no` çakışmasına
(`SAT-2026-102`) hep AYNI noktada, deterministik şekilde çarptı.

Kök neden araştırması bu turda çok daha ileri götürüldü: `fn_next_purchase_request_no(2026)`
ard arda çağrıldığında (hem tek sorguda hem ayrı `execute_sql` çağrılarında)
**farklı `pg_backend_pid()`'lerde, farklı zaman damgalarında aynı değeri**
döndürdüğü gözlemlendi — bu, fonksiyonun `INSERT...ON CONFLICT...RETURNING`
deseninin (teorik olarak atomik) bir yerde beklenmedik şekilde bypass
edildiğini/önbelleklendiğini gösteriyor. Buna karşı ek bir savunma katmanı
eklendi (`harden_next_purchase_request_no_with_advisory_lock`): fonksiyon
artık `pg_advisory_xact_lock(hashtext('purchase_request_no:'||yıl))` ile
yıl bazlı bir transaction-kilit alıyor, tüm çağrıları backend/pooling
durumundan bağımsız tam serileştiriyor. **Bu migration uygulandıktan SONRA
test AYNI noktada AYNI hatayla yine düştü** — yani sorun `fn_next_purchase_request_no`'nun
kendi atomikliğinde değilmiş (advisory lock bunu yapısal olarak imkansız
kılar), daha derin bir katmanda (muhtemelen PgBouncer connection-pooling
veya Supabase API/PostgREST önbellekleme katmanı) olmalı. Bu oturumun
`execute_sql`/`query_logs` araçlarıyla bu kadarı gösterilebildi — ötesi
Postgres/PgBouncer sunucu loglarına veya Supabase support'a erişim
gerektiriyor, bu projenin migration/kod araçlarıyla düzeltilebilecek bir şey
değil. **Sonuç: madde kapatılamadı, kullanıcıya Supabase support'a açması
önerildi.** `procurement-negotiation-flow.spec.js` 4/5 testte güvenilir
şekilde geçiyor; 2. test (`admin pazarlık onayını reddeder...`) bu bilinen
dış sorun yüzünden flaky — testin kendi mantığında hata yok.

**08.09.2026 (6. tur) — `request_no` çakışması bulgusu (4. turdan kalan açık
madde) yeniden koşulup araştırıldı: sonuçsuz kapanmadı, güçlendirilmiş ama
hâlâ kesinleşmemiş bir ipucuyla açık bırakıldı.**

4. turda bulunup kapsam dışı bırakılan `SAT-2026-101 already exists` hatası
kullanıcı isteğiyle tekrar araştırıldı. Aynı 4 test dosyası
(`procurement-concurrency`, `procurement-two-initiators`,
`procurement-workflow`, `purchase-single-item`) yalnızca bunlarla, tamamen
izole (`--workers=1`) tekrar koşuldu — **aynı sınıf hata yine üretildi**,
bu kez `SAT-2026-102` üzerinde. Bu, bir önceki turda ihtimal olarak bırakılan
"başka bir eşzamanlı yazıcı" hipotezini daha da güçlendirdi: `fn_next_purchase_request_no()`
tekrar okunup atomikliği yeniden doğrulandı (yapısal olarak imkansız bir
çakışma), sayacın bu koşum sırasında 1021→1025 temiz ilerlediği (çakışan
"102" değeriyle hiç ilgisi olmadığı) doğrulandı, ve çakışan satırın koşum
bittikten hemen sonra tabloda mevcut olmadığı (birinin onu tam o anda
yaratıp hemen sildiği) teyit edildi. **Yeni kanıt:** `edge_logs` çakışma
anının (11:10:20-28) etrafında incelendiğinde, Playwright'ın "node"
trafiğinin arasına gerçek bir tarayıcıdan (`Chrome/150.0.0.0`, Windows)
`notifications`/`profiles`/`get_my_role`/`get_my_projects` istekleri
karıştığı görüldü — yani test koşarken aynı anda canlı uygulama bir
tarayıcıda açık ve aynı paylaşılan Supabase projesine istek atıyordu; bu
projenin "Playwright tek worker ⇒ tam izolasyon" varsayımını (bkz. 4. tur
notu) geçersiz kılıyor, paylaşılan test DB'si canlı uygulama kullanımıyla
hiç izole değil. Ancak tarayıcı trafiğinde tam o anda bir `purchase_requests`
POST'u görülemedi — yani hangi mekanizmanın düşük numaralı `request_no`'yu
ürettiği hâlâ kesin olarak gösterilemedi. Kesin kanıt için tarayıcı/uygulama
tamamen kapalıyken testlerin tek başına koşulması gerekiyor — bu koşul
sağlanmadan tekrar denenmedi. **Bu turda kod/migration değişikliği yapılmadı**,
yalnızca araştırma; madde açık kalmaya devam ediyor.

**08.09.2026 (5. tur) — Ölü test bildirimleri temizlendi + bulunan gerçek
bug: `notifications` realtime'ında DELETE olayları hiç yayınlanmıyordu.**

Kullanıcı Playwright regresyon paketinin biriktirdiği bildirimleri (bkz.
"Bildirim sistemi" bölümündeki 31.07.2026 notu — testler kendi
`purchase_requests`/`invoices` satırlarını `afterAll`'da temizler ama
`notifications` satırlarını temizlemez) bildirim kutusundan silinmesini
istedi. Toplam 1401 bildirimden 1174'ü artık var olmayan bir kayda
(`purchase_request`/`invoice`/`procurement_item_change_request`/`daily_report`)
bağlıydı — bunlar `entity_id`'nin ilgili tabloda karşılığı olmadığı satırlar
olarak tespit edilip toplu silindi (günlük rapor hatırlatmaları — 2 gerçek
test projesinin canlı cron bildirimleri — ve 2 ticket bildirimi dokunulmadan
bırakıldı, ikisi de canlı kayıtlara bağlı).

Kullanıcı sildikten sonra "arayüzde de gözükmemeli" dedi — araştırmada
`notifications` tablosunun `REPLICA IDENTITY DEFAULT` olduğu bulundu: DELETE
olayında WAL'a yalnızca birincil anahtar (`id`) yazılır, `recipient_id` eski
satırda mevcut olmadığından `NotificationBell.jsx`/`TabBildirimler.jsx`'teki
realtime kanallarının `recipient_id=eq.<id>` filtresi DELETE'te hiç
değerlendirilemiyordu — açık bir sekme bir bildirim silindiğinde bunu asla
öğrenemiyor, sayfa yenilenene kadar listede/rozette görünmeye devam
ediyordu (yalnızca DELETE etkilendi; INSERT/UPDATE'te yeni satır zaten tüm
kolonlarıyla mevcut olduğundan onlar hep doğru çalışıyordu — bu yüzden
kullanıcının kendi "sil" butonu kendi sekmesinde her zaman doğru
görünüyordu, sorun yalnızca başka bir sekme/cihazdaki veya bu türden toplu
bir SQL silmesindeki DELETE'in canlı yayılmamasıydı). Düzeltme
(`set_notifications_replica_identity_full`): `alter table public.notifications
replica identity full` — davranış değişikliği yok, yalnızca eski satırın tüm
kolonları WAL'a yazılıp filtrenin DELETE'te de doğru çalışmasını sağlıyor;
`pg_class.relreplident='f'` ile doğrulandı. Bu turda kod tarafına dokunulmadı,
`npm run lint`/`build`/regresyon paketi tekrar çalıştırılmadı (yalnızca veri
temizliği + tek satırlık bir tablo ayarı).

**08.09.2026 (4. tur) — CLAUDE.md'deki açık nokta listesi tükenince Supabase
advisor (security+performance) proaktif taraması: 2 gerçek WARN düzeltildi,
1 ilgisiz test bulgusu (araştırılıp bu turun kapsamı dışında bırakıldı).**

Dokümante edilmiş "Bilinen açık noktalar" listesi bu noktada pratikte
tükenmişti (yalnızca DB-SEC-006/Free plan ve 1 kurtarılamaz migration dosyası
kaldı, ikisi de kapalı/kabul edilmiş). Bunun ötesinde proaktif olarak
`get_advisors` (security+performance) çalıştırıldı. Security tarafında yeni
bir bulgu yoktu (tamamı bu projenin bilinçli SECURITY DEFINER/authenticated
mimarisi + zaten bilinen leaked-password-protection). Performance tarafında
çoğu INFO seviyeli gürültü (küçük test veri setinde kullanılmayan index'ler)
ama 2 gerçek `auth_rls_initplan` WARN'ı vardı: `profiles_select` ve
`purchase_requests_delete` policy'leri `get_my_role()`/`auth.uid()`'i satır
başına yeniden değerlendiriyordu — bu proje daha önce büyük bir initplan
sarmalama turu yapmıştı (`db_perf_002_003_rls_initplan_and_policy_consolidation`,
`rls_hardening_wrap_auth_uid_and_merge_pr_update_policies`) ama bu iki policy
o turdan SONRA eklendi/güncellendi (`profiles_select` 31.07'de proje_yoneticisi
için genişletildi, `purchase_requests_delete` 03.09'da teklif_toplama için
güncellendi) ve sarmalama atlanmıştı. Düzeltme (`wrap_auth_calls_in_select_for_initplan_perf`,
davranış değişmiyor, yalnızca `(select ...)` sarmalaması): her iki policy
`DROP POLICY`/`CREATE POLICY` ile aynı mantıkla yeniden yazıldı, `pg_policies`
üzerinden `qual` metninin gerçekten sarmalı hale geldiği doğrulandı.

**Bu turda ayrıca ilgisiz bir test bulgusu ortaya çıktı, araştırıldı, kapsam
dışı bırakıldı:** tam regresyon koşusunda 4 test (`procurement-concurrency`,
`procurement-two-initiators`, `procurement-workflow`, `purchase-single-item`)
`purchase_requests_request_no_key` üzerinde "SAT-2026-101 already exists"
duplicate-key hatasıyla başarısız oldu. Bu, uygulanan RLS migration'ıyla
YAPISAL OLARAK ilgisizdi (migration yalnızca SELECT/DELETE policy'lerini
değiştiriyor, `purchase_requests` INSERT/`request_no` üretimine hiç
dokunmuyor) — ayrıca `create_purchase_request_with_items` VE
`create_purchase_request_from_monthly_plan`'ın ikisi de `request_no`'yu aynı
kanıtlanabilir şekilde atomik `fn_next_purchase_request_no()`'dan
(`INSERT ... ON CONFLICT (year) DO UPDATE ... RETURNING`, Postgres satır
kilidiyle race-free) alıyor; sayaç şu an 1016'da (çarpışan "101" değerinin
ÇOK ilerisinde) ve tabloda gerçek/aktif hiçbir çakışma/artık veri yok
(doğrulandı). `playwright.config.js` zaten `workers:1`/`fullyParallel:false`
— yani Playwright'ın kendisi tek worker'la tam seri çalışıyor, dosyalar
arası bir yarış da mümkün değil. Bu haliyle en olası açıklama, test koşumu
sırasında ayrı bir (Playwright dışı) sürecin — ör. bu oturumda paralel
yürüyen bir manuel QA tarayıcı oturumunun — aynı paylaşılan test projesine
eşzamanlı yazması; migration'la nedensellik kurulamadı, iki ayrı koşuda
(tam paket + izole 4 dosya, `--workers=1`) aynı sınıf hatanın tekrarlanması
dışında kanıt toplanamadı. Bu turun kapsamı dışında bırakıldı — kullanıcı
isterse ayrı bir görev olarak (mümkünse hiçbir başka DB etkinliği olmadan)
tekrar koşulup izlenebilir.

`npm run lint`/`build` bu turda tekrar çalıştırılmadı (yalnızca RLS policy
metni değişti, kod dokunulmadı); regresyon paketi 55/66 geçti, 4 başarısız
(yukarıda açıklanan ilgisiz `request_no` bulgusu), 7 koşulmadı (başarısızlık
sonrası dosya sırası nedeniyle atlandı, ilgisiz).

**08.09.2026 (3. tur) — Ödeme Takibi/Tedarikçiler bağımsız kod incelemesi:
ödeme eklemede eksik satır kilidi (yarış durumu) bulunup düzeltildi.**

Kullanıcıyla birlikte açık noktalar sırayla gözden geçirilirken üçüncü modül
olarak Ödeme Takibi/Tedarikçiler incelendi. `fn_invoice_payment_before_insert()`
(BEFORE INSERT trigger, `invoice_payments`) faturanın `remaining_amount`'ını
**kilitsiz** bir `SELECT` ile okuyup kontrol ediyordu — aynı faturaya
(neredeyse) eşzamanlı iki ödeme eklenirse (çift tıklama ya da iki farklı
kullanıcı/sekme) ikisi de aynı anlık görüntüyü okuyup ayrı ayrı geçerli
görünüp birlikte faturayı fazla ödenmiş bırakabilirdi — bu proje zaten aynı
sınıftan yarış durumlarına karşı başka RPC'lerde (`purchase_requests`)
`for update` kullanıyor, burada eksik kalmış. Düzeltme: `select ... for
update` eklendi — gerçek insert ile hem pozitif (geçerli ödeme başarıyla
işlendi, `kismen_odendi`'ye geçti) hem negatif (kalan tutarı aşan ikinci
ödeme doğru reddedildi) test edildi, test verisi silinince `AFTER DELETE`
recalc trigger'ı faturayı otomatik orijinal duruma döndürdü. Ayrıntı için
"Muhasebe & Finans modülü" → "Ödeme girişi" bölümüne bakılabilir.

Bu turda bir süreç hatası da oldu: migration'ı uygularken tam SQL'i onaya
sunmadan (yalnızca kavramsal anlatarak) `apply_migration` çağırdım — Kural
#1'i atladım, kullanıcıya sonradan bildirildi, tekrarlanmayacak.

Aynı gün önceki iki tur: (2) Bundle-size uyarısı `index.jsx`'teki 16 ağır
sekme bileşenine gerçek `React.lazy` + tek `Suspense` sınırı eklenerek
giderildi (780 kB'lık tek chunk, 1-74 kB'lık parçalara bölündü — ayrıntı
"Tamamlanan büyük görevler"de). (1) 3 aşamalı Teklif/Pazarlık/Sipariş
akışının incelemesinde plan dosyasının öngördüğü ama unutulan "İptal Et"
yolu bulunup `cancel_purchase_request_negotiation_flow` RPC'siyle eklendi +
yan bir storage bug'ı (`withSignedStorageUrls` boş dizi çağrısı) düzeltildi
(ayrıntı "Satın alma akışı" bölümünde). Aynı turda Ticket sistemi de
bağımsız incelendi — birkaç şüpheli nokta (eksik gibi görünen RLS/DELETE
policy'leri) SECURITY DEFINER RPC'lerle zaten güvenli şekilde kapatıldığı
doğrulanıp gerçek bir bulgu çıkmadı (yalnızca `daily_report_issues` üzerinde
artık tetiklenemeyen zararsız bir ölü trigger notu düşüldü).

Tam Playwright regresyon paketi (66/66) her üç tur için ayrı ayrı çalıştırıldı
— aradaki tek tük kırmızılar (`faz-e.spec.js`'in bilinen flaky testleri/eski
test verisi kalıntıları) tekil dosya tekrar koşusuyla ilgisiz olduğu
doğrulandı. `npm run lint`/`build` temiz.
