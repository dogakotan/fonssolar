# Fons Solar — GES Dashboard

Fons Solar GES (güneş enerji santrali) uçtan uca proje takip sistemi.
Backend Supabase (proje ref `bshhgvdzemgfijkzhcrf`, `eu-central-2`, PostgreSQL 17),
frontend bu repodaki React + Vite (JS, TypeScript değil) uygulaması (`src/`).

Bu dosya projenin **tek** CLAUDE.md'sidir. Hem sabit kuralları hem de sistemin
güncel mimarisini tutar. **Tarihli kronolojik log TUTMA** — mimariyi/şemayı
değiştiren her görevden sonra ilgili bölümü ("Sistem mimarisi" veya "Bilinen
açık noktalar") doğrudan güncelle: yeni bilgiyi ekle, geçersiz kalanı çıkar.
Bu dosya her zaman sistemin **şu anki** halini anlatmalı, geçmişteki
değişikliklerin arşivini değil. "Son değişiklik" bölümü tek istisna: orada da
biriktirme yapılmaz, her görev sonunda üzerine yazılır (bir önceki kayıt silinir).

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
  her "sayfa" aslında bir `Tab*.jsx` bileşenidir (`TabGenel`, `TabFinans`,
  `TabSatinAlma`, `TabTickets`, `TabKullanicilar`, `TabProjeYonetimi`,
  `TabSantiyeSefi`, `TabIsPlan`, `TabBildirimler`).
- Proje-özel görünümler `src/pages/dashboard/components/ProjeTab*.jsx` altında
  (`ProjeDetay.jsx` seçilen projeyi gösterir); genel/tüm-projeler görünümleri
  ayrı `Tab*.jsx` dosyalarında — bazı modüllerde (Finans, Satın Alma) bu ikisi
  aynı alt bileşenleri paylaşır, bazılarında tamamen ayrı, birbirini tekrar
  eden kod var (bkz. Bilinen açık noktalar).
- Auth: `src/context/AuthContext.jsx` — `get_my_role()`/`get_my_projects()`
  RPC'lerinden `role`, `isAdmin`, `projectId` sağlar. `isAdmin` KESİNLİKLE
  `role === 'admin'` olmalı. Kapsam seçici (`src/context/ScopeContext.jsx`,
  header'da) yönetici rollerine tek-proje/Tüm Projeler geçişi sağlar.
- Veri çekme: ortak `src/hooks/useDashboardData.js` (loading/refreshing/error +
  visibilitychange'de tazeleme) ve `src/hooks/useRealtimeRefresh.js` (ekran
  başına tek Supabase Realtime kanalı, 2sn debounce, 60sn polling yedeği) —
  yeni bir dashboard ekranı yazılıyorsa önce bunları kullan, ham `useEffect`
  tekrarlama. Kendi ham sorgusunu koşan liste bileşenleri (`*TalepListesi.jsx`
  gibi) üst bileşenin realtime kanalına dahil değildir — üst bileşen bir
  `refreshKey` state'i tutup realtime callback'inde bump ederek, alt bileşenin
  `useEffect` bağımlılığına ekleyerek kendi verisini de yeniden çekmesini sağlar
  (`TabSatinAlma.jsx`/`ProjeTabSatinAlma.jsx` bu deseni kullanıyor).
- Saha ekranları (`SantiyeSefiDashboard.jsx`, `DailyReportForm.jsx`,
  `DailyReportList.jsx`) mobil öncelikli olmalı — santiye_sefi rolü telefondan
  kullanır. `DailyReportForm.jsx` 9 bölümlü liste (Hava/Genel, Personel, Makine,
  Günün İşleri, İlerleme, Sorunlar, Fotoğraflar, Notlar) + slide-over panel
  (masaüstünde ortalanmış sabit kutu, mobilde bottom-sheet) modelinde; her
  panelin kendi İptal (state snapshot'a döner) / Kaydet ve Kapat davranışı var.
  Panel içi tablolar yatay scroll yerine dikey kart listesi (`CARD_ROW`).
  "Malzeme Kullanımı" bölümü formda YOK (kaldırıldı, `daily_report_material_usage`
  tablosu kullanımda değil) — **kalıcı karar (2026-07-17 teyit edildi):** BOM/malzeme
  kullanımı günlük raporun kapsamında OLMAYACAK, şantiye şefi kullanılan malzemeyi
  günlük raporla girmeyecek; bu bir "unutulmuş iş" değil, bilinçli kapsam dışı
  bırakma — geri getirilmesi teklif edilirse önce bu kararı hatırlat. "İlerleme
  Girişi" paneli `project_tasks`'tan
  (task_id bazlı) beslenir. "Sorunlar" bölümündeki her satır `daily_report_issues`'a
  `save_daily_report`'un `p_issues`'una yazılır (bkz. RPC katmanı) — satırın
  `id`/`ticket_id`'si state'te korunur (`newIssueRow()`/prefill), satır
  otomatik bir ticket'a bağlıysa altında tıklanabilir bir "🎫 Ticket açıldı —
  durum: …" rozeti gösterilir (`issueTicketInfo` state'i, tek seferlik
  `tickets` sorgusuyla doldurulur). Rozete tıklamak `onGoToTicket` prop'uyla
  `index.jsx`'e kadar akar: rapor modalı kapanır, Tickets sekmesine geçilir,
  `openTicketId` state'i `TabTickets` → `TicketListesi`'ne kadar iletilir ve
  o ticket'ın detay modalı doğrudan açılır (liste filtrelenmez, doğrudan açılır
  — daha güvenilir). `daily_report_issues.description` alanı ayrıca
  `category`/`closed_at`/`notes` alanlarını `__ISSUE_META__{json}` öneki ile
  paketler (bu tabloda o kolonlar yok, önceden var olan bir çözüm) — bu paket
  `daily_report_issues` tablosunda olduğu gibi kalır (round-trip için gerekli),
  ama `fn_create_ticket_from_daily_report_issue()` artık ticket'a kopyalarken
  öneki soyup yalnızca temiz `description` alanını yazıyor (2026-07-17'de
  düzeltildi — önceden ham JSON ticket'a sızıyordu, bkz. Trigger zincirleri).
- `SantiyeSefiDashboard.jsx`'teki "Proje İlerlemesi" kartı: tek büyük yüzde +
  tek ilerleme çubuğu (planlanan ilerleme çubuk üstünde dikey işaret çizgisi),
  "Plana göre N puan önde/geride" cümlesi, altta kalem başına yatay bar-listesi.
- Şantiye şefi "Satın Alma" sekmesi sadeleştirilmiş: `<ProjeTabSatinAlma
  siteChiefView />` (KPI/sidebar yok) render edilir, yalnızca **Talepler**
  (`siteChiefView` prop'u listeyi `requested_by === user.id` ile süzer, kendi
  talebi dışında onay/red butonu görmez — `canApprove = isAdmin`) ve **Malzeme
  Listesi** sekmeleri görünür.
- Satın Alma/Malzeme Listesi tabloları (`TabSatinAlmaTalepListesi.jsx`,
  `ProjeTabFaturaKesilecekler.jsx`) sabit iç-scroll kutusu yerine `PAGE_SIZE=10`
  + ortak `Pager` bileşeni (`‹ 1/2 ›`) kullanıyor.
- `ProjeDetay.jsx`'in sekmeleri (8 — bu not önceden 7 diyordu, Malzeme Listesi'ni
  atlıyordu): Genel Proje, İş Planı, Satın Alma, Malzeme Listesi, Finans,
  Ticket, Raporlar, Ekip. 2026-07-20'ye kadar Finans/Ticket yalnızca
  `proje_yoneticisi` için gizliydi (bkz. Roller bölümü) — artık hiçbir rol
  için sekme bazlı bir gizleme yok, hepsi ProjeDetay'a girebilen her role
  görünüyor (ayrı bir "Proje Paneli" sekmesi YOK — 2026-07-16'da
  kısaca eklenip aynı oturumda kullanıcı kararıyla geri alındı, bkz. Tamamlanan
  büyük görevler). `ProjeDetay.jsx` kendi seviyesinde artık bir
  `DataStatusBanner` render etmiyor (2026-07-17'de kaldırıldı — her sekme zaten
  kendi RPC'sine bağlı kendi banner'ını gösteriyordu, üstte ikinci bir tane sadece
  tekrar/kayma yaratıyordu; hook çağrıları `refetch` tetiklemesi için kaldı).
  Artık hiçbir ekranda kullanılmayan `RealtimeStatusIndicator` bileşeni ve yalnız
  bu bileşenin tükettiği realtime durum state'leri 2026-07-22'de tamamen silindi;
  realtime yenileme, debounce ve polling yedeği aynen korunuyor.
  Genel Proje (`ProjectOverviewDashboard.jsx`, tek veri kaynağı
  `get_project_by_date`) proje özeti ekranı güncel düzeni: üstte Proje Detayları /
  Genel İlerleme / Günlük-Haftalık-Aylık Özet / Hava Durumu kartları; orta satırda
  eşit iki kart olarak **Projenin Gidişatı** ve **Kategori Bazlı İlerleme** bulunur.
  Projenin Gidişatı artık milestone şeridi değil S-eğrisi çizgi grafiğidir; grafik
  başlığı ve hover tooltip'i güncel toplam `plannedPct` / `avgReportProgress` değerini
  gösterir, geçmiş ay noktaları yalnızca çizginin eğilimini oluşturur. Kategori Bazlı
  İlerleme `BarChart` kullanmaz; kategori adı + gerçekleşen progress bar + gerçekleşen
  yüzde + plan yüzdesi + sapma satırlarından oluşan yatay bullet/progress listedir ve
  kart içinde scroll eder; plan işareti kırmızı `var(--color-danger)` ile gösterilir.
  Alt grid 3 kolon düzenindedir: Günlük Rapor Özeti, Malzeme Kalemleri/Satın Alma,
  Maliyet Durumu, Güncel Ticketlar, Riskler, Saha Fotoğrafları. Güncel Ticketlar ve
  Riskler `slice(0,5)` ile eş satır yüksekliğinde gösterilir; Riskler kartında açıklama
  yazısı yoktur. Risk severity frontend'de otomatik kural bazlı normalize edilir:
  `gorev_gecikmesi` 7+ gün gecikmişse `kritik`, daha azsa `orta`;
  `malzeme_fazla_talep` `yüksek`; diğer risklerde kayıt üzerindeki severity kullanılır.
  Saha Fotoğrafları artık alt grid'in içinde üçüncü kart olarak yer alır, ayrı tam
  genişlik kart değildir. Maliyet Durumu iç scroll kullanmaz; En Büyük 5 Kalem doğrudan
  kart içinde listelenir. Proje Excel içe/dışa aktar butonları Proje Detay > Genel'den
  kaldırıldı; bu yetenek yalnızca Proje Yönetimi sayfasında kalır. **Header'daki global
  proje seçici kaldırıldı** (2026-07-17, kullanıcının kendi düzenlemesi); çok projeli
  kullanıcılarda görünmeyen eski localStorage kapsamı temizlenir, tek projeli
  kullanıcıda otomatik proje kapsamı korunur — çok projeli bir kullanıcı (ör.
  `cross_project=true` olan `proje_yoneticisi`) artık `genel`/`is-plani`/`satin-alma`
  üst-seviye sekmelerinde belirli bir projeye kilitlenmiyor, proje seçimi **Projeler**
  sekmesi üzerinden yapılıyor (bkz. Roller bölümü).
  İş Planı (`TabIsPlan.jsx`) kritik yol (`is_critical`) görselleştirmesi kullanmaz:
  plan bitiş tarihi geçmiş ve görev tamamlanmamış/iptal değilse görev `Riskli`, aksi
  halde `Normal` kabul edilir. KPI şeridi 3 karttır: Toplam Görev, Devam Eden,
  Riskli/Geciken. Kritik yol CSS/JS kalıntıları temizlendi. Proje Finans sekmesi
  (`ProjeTabFinans.jsx`) rol bazlıdır: `admin` proje içinde Genel/Faturalar/Onay
  Kuyruğu/Maliyet Tablosu alt-sekmelerini görür; proje yöneticisi ve diğer roller
  yalnızca Genel finans özetini görür. Üst-seviye Finans ekranındaki proje filtresi
  ve aynı admin/muhasebe akışları ayrıca korunur. Proje detayının sağ üst eylem
  grubundaki **Proje Excelini İndir** butonu tüm proje-erişimli rollerde görünür ve
  canlı `export-project-excel` fonksiyonundan güncel proje XLSX'ini indirir.
### Satın alma akışı — proje yöneticisi tedarik adımı
Durum zinciri: `talep_olusturuldu → fiyat_girildi → onay_bekliyor → onaylandi
→ satin_alindi → fatura_bekliyor/fatura_onay_bekliyor → faturasi_kesildi`
(+ `reddedildi`/`iptal`). **`fatura_bekliyor` pratikte hiçbir zaman üretilmiyor**
(2026-07-20'de tam akış canlı test edilirken doğrulandı — `sync_purchase_request_from_invoice`
fatura INSERT'inde durumu doğrudan `fatura_onay_bekliyor`'a geçiriyor, `fatura_bekliyor`
yalnızca DB constraint'inin izin verdiği ama hiçbir fonksiyon/RPC'nin hiç yazmadığı bir
değer — CHECK constraint'te durduğu için frontend'in tüm gruplama listelerinde
(`normalizeStatus`, `INVOICE_FLOW_STATUSES`, `buildApprovalSteps` vb.) savunma amaçlı
yer alıyor). Gerçek akışta fatura oluşturulunca (`onaylandi`'den `satin_alindi`'ye geçmiş
bir talepte) durum tek hamlede `fatura_onay_bekliyor`'a düşüyor ve muhasebenin (adım 1)
VE yöneticinin (adım 2) onay adımlarının İKİSİNDE de aynen kalıyor — invoice kendi
`invoice_approvals` zincirinde ilerlerken `purchase_requests.status` değişmiyor, yalnızca
adım 2 (yönetici) onaylanıp `invoices.status='onaylandı'` olunca `faturasi_kesildi`'ye
geçiyor. Bu yüzden `PR_STATUS.fatura_bekliyor` ve `PR_STATUS.fatura_onay_bekliyor`
(`StatusBadge.jsx`) + `satinAlma.js`'in `statusLabel()`'ı **aynı metni** ("Fatura
Bekleniyor") gösterecek şekilde bilinçli olarak eşitlendi (2026-07-20) — Satın Alma
ekranında muhasebenin mi yöneticinin mi sırada olduğu görünmüyor/önemli değil, tek
mesaj "fatura süreci bekleniyor".

**Tam akış 2026-07-20'de gerçek RPC/write'larla uçtan uca doğrulandı** (talep oluşturma
→ yönetici onayı → BOM aşım otomatik `planned_qty` güncellemesi → proje yöneticisi
tedarik girişi → muhasebe fatura oluşturma → muhasebe onayı (adım 1) → yönetici onayı
(adım 2) → `cost_allocations`) — hepsi trigger zincirinin tasarlandığı gibi çalıştı,
DB tarafında **hiçbir bug bulunmadı**. Ama bu doğrulama sırasında **kritik bir frontend
erişim açığı** ortaya çıktı ve düzeltildi: **muhasebe rolünün `navigation.js`'te
`satin-alma` sekmesi hiç yoktu** — muhasebenin ulaşabildiği TEK fatura oluşturma ekranı
Finans'taki "+ Fatura Ekle" (`FaturaEkleModal`, `FaturaListesi.jsx` içinde) hiçbir
`purchase_request_id` set etmiyor (bağımsız/`source='manual'` bir fatura oluşturuyor) —
muhasebe bir satın alma talebine BAĞLI fatura hiç kesemiyordu, akış `satin_alindi`'de
sonsuza kadar takılı kalırdı. `TabSatinAlmaTalepListesi.jsx`'in `canInvoice = isMuhasebe`
kontrolü (talebe bağlı "Fatura Oluştur" butonu, doğru `purchase_request_id`'yi set eden
`FaturaOlusturModal`'ı açıyor) zaten doğru kurulmuştu, yalnızca hiç ulaşılamıyordu.
Düzeltme: `navigation.js`'te `muhasebe.tabs`/`sidebarItems`'a `'satin-alma'` eklendi —
`TabSatinAlma.jsx` zaten `canApprove`/`canCreate`'i admin'e/diğer rollere kilitlediğinden
muhasebe bu sekmede yalnızca "Fatura Oluştur" butonunu görür, onay/oluşturma yetkisi
sızmaz. `onaylandi` ile fatura arasına **zorunlu** bir
tedarik adımı girdi (2026-07-16): `proje_yoneticisi` rolü (tek proje kapsamlı,
`santiye_sefi` ile aynı `profiles.project_id` mekanizması) kendi projesindeki
`onaylandi` durumundaki talepleri yeni **"Tedarik"** alt-sekmesinden işler —
bu AYRI bir sidebar sayfası DEĞİL (ilk denemede öyle yapılmıştı, kullanıcı
"proje içinde olsun" diyerek geri çevirdi): `ProjeTabSatinAlma.jsx`'e eklenen
bir sekme (`TedarikKuyrugu.jsx` bileşeni, `canManageProcurement = isAdmin ||
role==='proje_yoneticisi'` iken görünür) — hem admin `Projeler → [proje] →
Satın Alma` üzerinden herhangi bir projede görür, hem `proje_yoneticisi`
kendi tek-proje kilitli `satin-alma` sekmesinde (`procurementManagerView`
prop'u varsayılan aktif sekmeyi `'tedarik'` yapar, KPI/döviz sidebar'ını
gizler — `siteChiefView` ile aynı desende). `TedarikKuyrugu.jsx` işler:
`supplier_id` +
`purchase_date` (zorunlu), `delivery_date`/`received_by_name`/
`delivery_document_url` (opsiyonel, dosya varsa `ticket-ekleri` bucket'ına
`tedarik/{request_id}/...` path'iyle yüklenir) girip doğrudan
`purchase_requests` UPDATE eder — normal akışta status'u elle set etmez.
DB tetikleyicisi `trg_auto_advance_pr_to_satin_alindi` (`fn_auto_advance_pr_to_satin_alindi`)
`supplier_id`+`purchase_date` doluyken statüyü otomatik `satin_alindi`'ye
ilerletir. **İstisna (2026-07-17):** `onaylandi` aşamasında tedarikçi
bulunamazsa "Tedarik Bekleyenler" satırındaki **"İptal Et"** butonu
(`TedarikIptalModal`, zorunlu gerekçe alanı) `status`'u doğrudan `iptal`'e
set eder — bu tek istisnai durumda status elle yazılır. RLS
(`pr_update_proje_yoneticisi` policy, `purchase_requests`):
`get_my_role()='proje_yoneticisi'` + `has_project_access` + statü
`onaylandi`/`satin_alindi` olmalı, `with_check` `fn_purchase_request_procurement_fields_only(...)`
ile yalnızca tedarik alanlarına yazabildiğini garanti eder (title/urgency/
category/estimated_amount_excl_vat/requested_by/approved_by/approved_at
dokunulamaz); statü geçişi olarak yalnızca `onaylandi→{onaylandi,satin_alindi,iptal}`
ve `satin_alindi→satin_alindi` (kendi kendine, teslimat alanı güncellemesi
için) kabul eder — `satin_alindi`'ye geçmiş bir talep artık iptal edilemez.
Sert kilit: `trg_guard_invoice_requires_procurement_done`
(`invoices` BEFORE INSERT) talep hâlâ `onaylandi`'nin öncesindeyse fatura
insert'ini Postgres seviyesinde reddeder — muhasebe bu adımı atlayamaz.

**Fatura onayından sonra iptal (2026-07-17):** `fn_validate_invoice_status_transition()`
artık `onaylandı → reddedildi` geçişine de izin veriyor (öncesinde yalnızca
`onaylandı → ödendi` vardı). Bu, var olan `sync_cost_allocation_from_invoice`
(reddedildi'de `cost_allocations` siler) ve `sync_purchase_request_from_invoice`
(reddedildi'de bağlı talebi `onaylandi`'ye döndürüp `invoice_id`'yi temizler,
yeniden fatura kesilebilir) trigger'larını olduğu gibi tekrar kullanıyor — yeni
bir mantık eklenmedi, yalnızca bu geçişin önündeki validator engeli kaldırıldı.
UI: `components/finans/FaturaListesi.jsx` (tek bileşen, `projectId` yokken Detay
modalının altında, doluyken ayrı bir İŞLEMLER sütununda) `onaylandı`
durumundaki faturalarda admin/muhasebe'ye "İptal Et" (onay adımlı) gösteriyor.
Fatura statüsünde "onay sürecinde reddedilen" ile "onaylandıktan sonra iptal
edilen" aynı DB değerini (`reddedildi`) paylaşıyor —
`FaturaListesi.jsx`'in (menü modu) Detay modalı bunu `invoice_approvals`'ta step 2'nin
gerçekten `onaylandı` olarak kapanıp kapanmadığına bakarak ayırt edip farklı bir
rozet ("İptal Edildi (Onay Sonrası)") gösteriyor; liste satırındaki rozet bu
ayrımı yapmıyor (her satır için ayrı sorgu gerektirirdi), hep "Reddedildi" yazar.

`TalepDetayModal.jsx`'teki "Malzeme Miktar Kontrol" (BOM aşım) uyarı kutusu
(2026-07-17) artık yalnızca `type === 'Malzeme'` olan taleplerde render ediliyor
— önceden hizmet taleplerinde de gösteriliyordu, ama BOM eşleşmesi hiç
olmadığından rakamlar hep 0/"Uygun" çıkıyor, kutu yalnızca gereksiz yer
kaplıyordu. `riskState()`/`classifyMaterials()` (`src/utils/satinAlma.js`)
zaten kategoriye göre doğru hesaplıyordu, değişen yalnızca bu tek görünürlük
koşulu.
Frontend tarafı: `isAwaitingInvoice()` (`src/utils/satinAlma.js`) artık yalnızca
`satin_alindi` durumunda true döner (`onaylandi` ARTIK YETERLİ DEĞİL) — "Fatura
Oluştur" butonu iki yerde de (`TabSatinAlmaTalepListesi.jsx`, `TalepDetayModal.jsx`)
bu tek fonksiyona delege ettiği için değişiklik hepsine otomatik yansıyor. `FaturaOlusturModal.jsx`'teki `toUserMessage()` DB guard
hatasını Türkçeleştiriyor — artık `src/utils/errors.js`'teki ortak
`toUserMessage(error, {rules, fallback})`'a delege ediyor (2026-07-17'de
tekilleştirildi, bkz. Tamamlanan büyük görevler).
`suppliers` tablosunun tam şeması: `id, name, tax_no, contact, email, phone,
created_at` — frontend hâlâ yalnızca `id, name` okuyor/yazıyor, `TedarikKuyrugu.jsx`
içindeki "+ Yeni" mini-form da yalnızca `name` ile insert ediyor.

**"Diğer" kategorisi tam üçüncü talep tipi oldu (2026-07-21):** Önceden satın alma
talepleri fiilen yalnızca `malzeme`/`hizmet` ayrımını biliyordu (`category='diger'`
DB constraint'inde vardı ama frontend'in hiçbir sınıflandırma/risk/etiket mantığı
onu tanımıyordu, `requestType()`/`riskState()` onu `hizmet`e düşürüyordu).
`YeniTalepModal.jsx`'e "Diğer" seçeneği eklendi (seçilince alan etiketi "Talep
açıklaması" olur, BOM/malzeme alanı hiç gösterilmez); `satinAlma.js`'in
`requestType()`/`riskState()`'i `diger`'i ayrı bir dal olarak tanıyor (BOM
eşleşmesi hiç aranmaz, risk durumu doğrudan `listede_yok` — malzeme değil,
"Listede Yok" rozeti hizmet talepleri gibi hep "Uygun" göstermek yerine daha
doğru bir mesaj). `TabSatinAlmaTalepListesi.jsx`/`TalepDetayModal.jsx`'in tip
etiketleri (`requestType()` çağıran yerel kopyalar) ve `FaturaOlusturModal.jsx`'in
kategori eşlemesi (`requestCategoryToInvoiceCategory` — eskiden hizmet için yanlışlıkla
`iscilik` yazıyordu, DB constraint'i `hizmet` bekliyor, düzeltildi) buna göre
güncellendi.

**Proje yöneticisi Tedarik Kuyruğu'ndan doğrudan yeni talep açabiliyor + bu sekme
artık her zaman tüm-projeler modunda (2026-07-21):** `TedarikKuyrugu.jsx`'e "+ Yeni
Satın Alma Talebi" butonu eklendi (`YeniTalepModal`'ı `availableProjects={projects}`
ile açar — proje seçici `ScopeContext`'in zaten yüklediği listeden gelir, `projects`
tablosuna raw sorgu atılmaz, bkz. Bilinen açık noktalar'daki `projects_select` RLS
notu). Varsayılan durum filtresi `all`'dan `onaylandi`'ye çekildi (ekran açılır
açılmaz işlem bekleyen talepler görünsün diye) ve başlık "Proje Yöneticisindeki
Talepler"den kanonik "Onay Kuyruğu"na çevrildi (`ProjeTabSatinAlma.jsx`'in
`procurementManagerView` sekme etiketiyle de eşleşsin diye). `index.jsx`'teki
üst-seviye "Satın Alma" sekmesi artık proje yöneticisi için `ProjeTabSatinAlma`'ya
`projectId` olarak her zaman `null` geçiyor (eskiden `scopeProjectId` geçiyordu) —
yani bu sekme artık admin'inki gibi koşulsuz tüm-projeler agregat modunda, tekli
proje seçimine hiç düşmüyor; `procurementManagerView` iken sekme çubuğu da tamamen
gizleniyor (tek sekme olduğu için gereksizdi).

**Reddedilen fatura artık silinmek zorunda değil — düzenlenip yeniden onaya
gönderilebiliyor (2026-07-21, DB tarafı önceki bir turda uygulanmış, bu turda
frontend'e bağlandı):** İki yeni RPC, `resubmit_rejected_invoice(p_invoice_id)`
ve `delete_rejected_invoice(p_invoice_id)` — ikisi de `SECURITY DEFINER`,
`get_my_role() IN ('admin','muhasebe')` kontrolü + yalnızca `status='reddedildi'`
faturalarda çalışır, `REVOKE ... FROM PUBLIC/anon` (yalnızca `authenticated`
çalıştırabilir, rol kontrolü fonksiyon içinde). `resubmit_rejected_invoice`
faturanın eski `invoice_approvals` satırlarını silip tek adımlı zinciri
(`step=1, 'Yönetici Onayı', 'bekliyor'`) yeniden açar, `invoices.status`'u
`yönetici_onayında`'ya çeker ve admin'e bildirim yollar; `delete_rejected_invoice`
faturayı kalıcı siler ve bağlı `purchase_requests`'i `invoice_id=NULL`/
`status='satin_alindi'`'ye döndürür (yeniden fatura kesilebilir — reddedilirken
zaten aynı şeyi yapan `sync_purchase_request_from_invoice` trigger'ıyla aynı
sonuç, burada RPC içinde elle tekrarlanıyor çünkü DELETE trigger'ı tetiklemiyor).
UI: `FaturaDetayModal`'da (`components/finans/FaturaListesi.jsx`) `reddedildi`
durumundaki bir faturada admin/muhasebe artık "Düzenle ve Yeniden Gönder" (fatura
no/tarih/tutar/KDV/kategori/açıklama alanlarını günceller, ardından RPC'yi çağırır)
veya "Faturayı Sil" (onaylı, `window.confirm`) görüyor. `tests/procurement-workflow.spec.js`
(yeni Playwright dosyası) bu akışı + tam satın alma→tedarik→fatura→onay zincirini
gerçek RPC/write'larla uçtan uca doğruluyor (2/2 PASS).

### Malzeme listesi (BOM) planlanan miktar değişiklikleri — ÜÇ AYRI mekanizma
`procurement_items.planned_qty` üç farklı, birbirinden bağımsız yoldan değişebilir —
karıştırma:

1. **Otomatik/sessiz (önceden vardı, dokümante edilmemişti):** Bir satın alma talebi bir
   BOM kalemi için planlanandan fazla miktar isteyip onaylanınca, `fn_apply_approved_material_excess()`
   (`create_purchase_request_with_items`/onay akışı içinden çağrılır) `planned_qty`'yi
   otomatik olarak istenen toplama yükseltir ve farkı `procurement_item_adjustments`
   (`project_id, procurement_item_id, purchase_request_id, delta_qty, reversed_at`) tablosuna
   yazar — bu bir onay adımı GEREKTİRMEZ, talebin kendi onayı yeterli sayılır. Talep
   reddedilir/iptal olursa `fn_rollback_material_excess()` bu delta'yı geri alır
   (`reversed_at` set edilir, `planned_qty` düşürülür). `ProjeTabFaturaKesilecekler.jsx`'teki
   yeşil "+X onaylı" rozeti bu mekanizmanın görünür olduğu tek yer
   (`get_satin_alma_overview(_all)`'ın `added_qty`/`added_via_count` alanları).
2. **Bilinçli/onaylı (2026-07-17'de eklendi):** Proje yöneticisi (ya da admin) "Malzeme
   Listesi" sekmesindeki "Düzenle" butonuyla bir kalemin planlanan miktarını **doğrudan**
   değiştirmek isteyebilir (talep açmadan) — bu, `create_procurement_item_change_request(p_procurement_item_id, p_new_planned_qty, p_note)`
   RPC'siyle `procurement_item_change_requests` tablosuna `bekliyor` durumunda bir satır
   düşürür (`notify_managers` ile yöneticilere bildirim gider), `planned_qty` HENÜZ değişmez.
   Yalnızca admin `review_procurement_item_change_request(p_id, p_approve, p_review_note)`
   ile onaylayınca `planned_qty` (+ eski `quantity` text alanı senkron) gerçekten güncellenir
   ve talebi açana `notify_user` ile sonuç bildirilir; reddedilirse hiçbir şey değişmez.
   Bir kalem için bekleyen bir talep varken ikinci bir talep açılamaz (frontend "Düzenle"
   butonunu devre dışı bırakır — DB seviyesinde bir kısıt yok, yalnızca UI engeli).
   `ProjeTabFaturaKesilecekler.jsx` bu akışın hem talep-açma hem admin-onay UI'sini barındırır
   (üstte "Bekleyen Miktar Değişiklikleri" paneli, satırda turuncu "Onay bekliyor: X→Y" rozeti).
3. **Yeni malzeme ekleme (2026-07-21'de eklendi — önceden hiç yoktu, bkz. Bilinen açık
   noktalar'daki eski not artık kapandı):** "Malzeme Listesi" sekmesindeki "+ Yeni Malzeme"
   butonu (proje_yoneticisi/admin) **önceden** `YeniTalepModal`'ı `newMaterialMode` ile açıp
   aslında BOM'a hiç bağlanmayan (`bom_item_id: null`) normal bir satın alma talebi
   oluşturuyordu — onaylanıp faturalansa bile Malzeme Listesi'nde yeni bir kalem hiç
   görünmüyordu (isim yanıltıcıydı). Artık kendi RPC'si var:
   `create_procurement_item_add_request(p_project_id, p_equipment, p_unit, p_category,
   p_planned_qty, p_note)` — mekanizma 2 ile AYNI `procurement_item_change_requests`
   tablosuna, ama `procurement_item_id = NULL` + yeni `new_equipment`/`new_unit`/
   `new_category` kolonlarıyla `bekliyor` bir satır düşürür (tabloya `CHECK` kısıtı:
   `procurement_item_id` dolu XOR `new_equipment` dolu). Admin `review_procurement_item_change_request`
   ile onaylayınca (aynı RPC, dallanmış): `procurement_item_id` doluysa eskisi gibi
   `UPDATE procurement_items`, NULL ise `INSERT INTO procurement_items` (yeni kalem
   gerçekten listeye eklenir). Yeni bileşen `YeniMalzemeEkleModal` (`ProjeTabFaturaKesilecekler.jsx`
   içinde, `MiktarDuzenleModal` ile aynı desende) bu RPC'yi çağırır; `YeniTalepModal.jsx`'in
   artık kullanılmayan `newMaterialMode` prop'u tamamen kaldırıldı (dead code temizliği).
   **Aynı turda ayrı bir görüntüleme bug'ı da düzeltildi:** `BekleyenDegisikliklerPanel`
   `item.procurement_items?.equipment`/`.unit` okuyordu ama `get_satin_alma_overview`'ın
   `pending_changes` alanı hiç böyle iç içe bir `procurement_items` nesnesi döndürmüyor
   (düz `equipment`/`unit` alanları var) — panel her zaman jenerik "Malzeme: X→Y" metni
   gösteriyordu, gerçek malzeme adı hiçbir zaman görünmüyordu; artık düz alanlar okunuyor
   ve `is_new` bayrağıyla yeni-kalem talepleri "Yeni Malzeme: X — Y birim" olarak ayrı
   gösteriliyor. `get_satin_alma_overview`'ın `pending_changes` node'u da `equipment`/`unit`
   için `COALESCE(procurement_items.equipment, new_equipment)` fallback'ine ve `is_new`
   alanına genişletildi.

Teoride ikisi/üçü aynı anda tetiklenebilir (bir kalem için hem bekleyen bir manuel talep hem
otomatik aşım aynı anda olabilir) — bu durumda manuel talebin `old_planned_qty` anlık görüntüsü
onay anına kadar geçerliliğini yitirmiş olabilir, ama bu nadir bir yarış durumu, ayrıca
kilitlenmedi.

### Ticket oluşturma — genel vs proje bazlı
`tickets.project_id` nullable — `NULL` "genel" (belirli bir projeye bağlı olmayan) ticket
anlamına gelir. `YeniTicketModal.jsx`'te tek-proje rolleri (santiye_sefi + tüm
`FIELD_SPECIALIST_ROLES`) için `hasFixedProject` her zaman true olduğundan **2026-07-21'e
kadar** proje seçici hiç render edilmiyordu ve `project_id` her zaman kullanıcının kendi
projesine sabitleniyordu — "Ticket Cinsi: Genel" seçmek yalnızca `category` kolonunu
etkiliyordu, `project_id`'yi hiç NULL yapmıyordu; yani bu roller UI üzerinden gerçek bir
genel ticket asla açamıyordu. Düzeltildi: `hasFixedProject` true iken yeni bir "Genel ticket
olarak aç (belirli bir projeye bağlı olmasın)" checkbox'ı (`openAsGeneral` state) eklendi,
işaretlenince `effectiveProjectId` NULL'a düşüyor ve Proje/Lokasyon satırları "Genel
(projeye bağlı değil)" gösteriyor.

**Aynı denetimde bulunan RLS açığı (2026-07-21, migration ile kapatıldı):** `tickets_insert`
policy'si yalnızca `auth.uid() IS NOT NULL` kontrol ediyordu — `project_id`/`created_by` hiç
doğrulanmıyordu (2026-07-20'de `purchase_requests_insert`'te kapatılan no-op check'in aynısı,
burada gözden kaçmıştı). Artık `created_by = auth.uid() AND has_project_access(project_id)`
(`has_project_access(NULL)` her zaman true döndüğünden genel ticket'lar etkilenmiyor).
Aynı turda `create_purchase_request_with_items` RPC'sine de savunma katmanı eklendi —
`SECURITY DEFINER` olduğu için `purchase_requests_insert` RLS'ini tamamen bypass ediyordu,
`p_project_id`/`p_requested_by` hiç doğrulanmıyordu (yalnızca UI kilitliyordu); artık
fonksiyon içinde `p_requested_by = auth.uid()` ve `has_project_access(p_project_id)`
kontrol ediliyor. **Ayrıca bu denetim sırasında `get_advisors` ile bağımsız bir bulgu daha
çıktı:** `create_procurement_item_change_request`/`review_procurement_item_change_request`
(2026-07-17'de eklenmişti) hiç `REVOKE ... FROM PUBLIC, anon` almamıştı — `anon` (oturum
açmamış) rolü bile bu iki hassas yazma RPC'sini çağırabiliyordu; bu turda kapatıldı.

### Roller (4, `roles` tablosunda tanımlı — `select key, display_name, is_manager, cross_project, allowed_tabs, default_tab, sidebar_items from roles`)
admin, muhasebe, proje_yoneticisi, santiye_sefi.

**2026-07-22'de 19 rolden 4'e indirildi** (`prune_roles_to_active_four`
migration'ı) — `profiles.role_key`'in `roles(key)`'e **FK**'si olduğu için
(`profiles_role_key_fkey`, `ON UPDATE CASCADE`) artık yalnızca bu 4 rol bir
profile atanabilir; `profiles_role_key_check` CHECK constraint'i hâlâ eski
19 değerlik listeyi metin olarak içeriyor ama FK ondan daha sıkı olduğundan
CHECK yanıltıcı/geçersiz kalmış durumda — gerçek kısıt FK'dir. Canlı veride
(6 profil) de yalnızca bu 4 rol kullanılıyor. Eski 19-rol genişletmesinin
(`koordinator`, `proje_koordinatoru`, `muhendis`, `maliyet_kontrolcu` + 11
saha/teknik uzman rolü: `elektrik_sefi`, `mekanik_sef`, `isg_sorumlusu`,
`kalite_kontrol_sefi`, `enh_sorumlusu`, `proje_kurulum_sefi`,
`proje_tasarim_sorumlusu`, `evrak_takip`, `operasyon_sorumlusu`,
`is_makinesi_operator`, `lojistik_tedarik`) tüm frontend izleri (eski
`FIELD_SPECIALIST_ROLES` sabiti ve buna bağlı ölü `index.jsx` render dalı
dahil) 2026-07-23'te temizlendi — bu roller yeniden aktifleştirilirse önce
`roles` tablosuna satır eklenmesi (display_name/is_manager/cross_project/
allowed_tabs/default_tab/sidebar_items) gerekir.

`is_manager=true`: admin, muhasebe (tüm yönetici bildirimlerini alır,
`has_project_access` her projeye izin verir). `cross_project=true`:
proje_yoneticisi (tüm projelere erişir, `get_project_scope`/
`has_project_access` üzerinden — bkz. RPC katmanı → "Yetki/kapsam çekirdeği").
proje_yoneticisi hâlâ bir "ev projesi"ne (`profiles.project_id`) atanabilir
ama bu yalnızca kozmetik/varsayılan; `genel`/`satin-alma` üst-seviye
sekmelerinde `ScopeContext`'in otomatik çözemediği çoklu-proje durumunda
`index.jsx`'teki yerel `pySelectedProjectId` state'i + `ProjeSecimGerekli`
ekranı devreye girer. `ProjeDetay.jsx`'in iç sekmelerinde proje_yoneticisi
için Finans salt-okunur, Tickets santiye_sefi ile aynı tam yetkide.

**Rol → sekme/sidebar erişimi artık DB-tabanlı (2026-07-23, önceki "hardcoded
navigation.js" açık noktası kapandı):** `src/config/navigation.js` (hardcoded
`NAVIGATION[role]` sabiti + `FIELD_SPECIALIST_ROLES`/`MANAGER_ROLES`/
`ROLE_LABEL`) tamamen kaldırıldı. `roles` tablosuna 3 kolon eklendi:
`allowed_tabs text[]` (NULL = kısıtsız, admin gibi tüm sekmelere erişir),
`default_tab text` (rol değişince zorla geçilecek sekme, NULL = zorlama yok),
`sidebar_items text[]` (Sidebar'da görünecek nav item key'leri) — 4 rolün
değerleri eski `navigation.js` ile birebir aynı (davranış değişikliği yok,
yalnızca veri kaynağı taşındı). `roles` tablosu zaten `authenticated` için
tam okunabilir (`roles_read_all` policy, `qual: true`) — ayrı bir RPC
gerekmedi, `AuthContext.jsx` `get_my_role()`'den gelen role_key ile `roles`
satırını doğrudan `.from('roles').select(...)` ile çekiyor. Context'e üç yeni
alan eklendi: `navigation: {tabs, defaultTab, sidebarItems}`, `roleLabel`
(eski hardcoded `ROLE_LABEL` map'inin yerine `roles.display_name`),
`isManager` (eski hardcoded `MANAGER_ROLES` dizisinin yerine
`roles.is_manager`). `Sidebar.jsx`, `index.jsx`, `TabBildirimler.jsx` artık
bunları `useAuth()`'tan okuyor. Yeni bir rol eklendiğinde/bir rolün sekme
erişimi değiştiğinde artık tek yer `roles` tablosudur — kod değişikliği
gerekmez. Migration: `add_role_navigation_matrix`; `procurement-role-acceptance.spec.js`
(4 rolün ekran kabulü) dahil tam Playwright paketi 60/60 geçti.

### RPC katmanı (canlı)

**Okuma:** `get_dashboard_summary(p_project_id)`, `get_project_gantt(p_project_id, p_filter_date)`,
`get_daily_report_detail(p_report_id)`,
`get_daily_reports_list(p_project_id, p_start_date, p_end_date, p_page, p_page_size)`,
`get_proje_detay(p_project_id)`, `get_santiye_dashboard(p_project_id, p_today)`,
`get_project_by_date(p_project_id, p_date)` (`ProjeDetay.jsx`'in "Genel Proje" sekmesinin —
`ProjectOverviewDashboard.jsx` — tek veri kaynağı; `budget_lines.name` alanı 2026-07-16'da
eklendi. `overall_pct` ve `category_weights.avg_progress` 2026-07-17'de tarih-farkında
hale getirildi — önceden `overall_pct` basit bir `AVG(project_tasks.progress_pct)` idi
[tarihten bağımsız, her zaman "şimdi"yi gösteriyordu] ve `category_weights.avg_progress`
da aynı şekilde canlı `progress_pct` okuyordu; ikisi de artık `fn_sync_project_progress()`
ile BİREBİR aynı karar ağacını kullanıyor [kategori ağırlığı varsa ağırlıklı ortalama,
yoksa süre-ağırlıklı fallback] ama `progress_pct` yerine `progress_daily`'i `p_date`'e
kadar toplayarak yeniden hesaplıyor — tarih navigasyonunda geçmişe gidince "Genel
İlerleme" ve "Kategori Bazlı İlerleme" artık gerçekten o güne göre değişiyor. `risks`
node'u `category` alanını da döndürüyor (önceden dönmüyordu, kategori rozeti hep "Diğer"e
düşüyordu) ve artık `source` filtresi YOK — hem manuel hem otomatik açık riskler dönüyor,
"yalnızca otomatik göster" kararı frontend'de `ProjectOverviewDashboard.jsx`'in
`source==='otomatik'` filtresiyle uygulanıyor),
`get_satin_alma_overview(p_project_id)` (`pending_changes` alanı 2026-07-18'de eklendi —
`procurement_item_change_requests`'ten `status='bekliyor'` satırları + `profiles`/`procurement_items`
join'iyle `requester_name`/`equipment`/`unit`; yalnızca tek-proje varyantında, `_all()`'a
eklenmedi çünkü Malzeme Listesi menü seviyesinde hiç yok — `ProjeTabMalzemeListesi.jsx`
`ProjeTabFaturaKesilecekler.jsx`'e bunu `pendingChanges`/`onPendingChanged` prop'uyla geçiriyor,
bileşenin kendi ham `procurement_item_change_requests` sorgusu kaldırıldı),
`get_satin_alma_overview_all()`,
`get_finans_overview(p_project_id, p_as_of_date)`, `get_finans_overview_all(p_as_of_date)`,
`get_delayed_tasks_scoped(p_project_id)`, `get_my_role()`, `get_my_projects()`.
**Liste/detay RPC'leri (2026-07-18'de eklendi — `get_satin_alma_overview*`/`get_finans_overview*`
yalnızca özet/agregat döndürdüğü için tam tablo/kuyruk görünümleri bunlara taşınamadı, ayrı,
dar amaçlı RPC'ler yazıldı):** `get_purchase_requests_list(p_project_id, p_filter_date,
p_only_pending)` (`TabSatinAlmaTalepListesi.jsx`; `p_project_id` NULL ise menü modu — tüm
erişilebilir projeler + `project_name`, doluysa proje modu + tarih filtresi; her satırda
`to_jsonb(purchase_requests satırı)` + `items` (`purchase_request_items`) + `requester_name`),
`get_purchase_request_detail(p_id)` (`TalepDetayModal.jsx`'in kendi detay sorgusu — aynı satır
şekli + `suppliers.name`), `get_invoices_list(p_project_id, p_filter_date)`
(`components/finans/FaturaListesi.jsx`), `get_invoice_approval_queue(p_project_id)`
(`components/finans/OnayKuyrugu.jsx` — `muhasebe_kuyrugu`/`yonetici_kuyrugu`/`kapanan_faturalar`
alanları, rol bazlı doldurma sunucu tarafında `get_my_role()` ile yapılıyor). Dördü de
`SECURITY DEFINER` + yalnızca `authenticated`'a `GRANT EXECUTE` (bu projede yeni fonksiyonlar
varsayılan olarak `anon`/`PUBLIC`'e de execute yetkisi alıyor — bu 4'ünde fark edilip
`REVOKE`'landı, yeni bir RPC yazılırken bu kontrol tekrar yapılmalı). Bu RPC'ler yalnızca OKUMA
taşıyor — `updateStatus`/`handleAction`/`handleCancel` gibi tek-tablo yazmalar hâlâ frontend'den
doğrudan `.update()`/`.insert()` ile yapılıyor (DB trigger'ları kademeleri yönetiyor, kural #6
yalnızca çok-tablolu yazmalar için RPC şartı koyuyor).

**Kalite denetimi RPC'leri (2026-07-18'de eklendi, bkz. Tamamlanan büyük görevler):**
`get_quality_inspections_list(p_project_id, p_filter_date)` (`get_purchase_requests_list`
ile aynı dual-mode desen — `KaliteKontrolListesi.jsx`, her satırda `finding_count`/`open_count`),
`get_quality_inspection_detail(p_id)` (`DenetimDetayModal.jsx` — tam `findings[]` listesi,
`ORDER BY f.created_at, f.id` — aynı transaction içinde art arda eklenen bulgular Postgres'in
transaction-sabit `now()`'ı yüzünden aynı `created_at`'ı alabiliyor, `f.id` tiebreaker'ı
görüntüleme sırasının kararsız/rastgele olmasını önlüyor; her finding'e ayrıca `ticket_id` +
`photos[]` — `quality_inspection_photos`'tan `id, storage_path, caption, uploaded_by, created_at`,
aynı `created_at, id` tiebreaker'ı — dahil, 2026-07-19'da eklendi, bkz. foto+ticket görevi).
İkisi de `REVOKE ... FROM PUBLIC, anon`.

**`save_quality_inspection` artık id-bazlı upsert (2026-07-19'da değiştirildi):** önceden
bulgular her kayıtta delete+reinsert ediliyordu (bkz. Bilinen açık noktalar'daki eski not,
artık geçersiz) — bu, foto/ticket bağlantısı eklenince iki soruna yol açacaktı: (1) her
düzenlemede INSERT tetiklenip mükerrer ticket açılması, (2) `quality_inspection_photos`'un
`finding_id`'ye `ON DELETE CASCADE` FK'si yüzünden fotoğrafların sessizce silinmesi. Artık
`daily_report_issues`'daki gibi id-bazlı: `p_findings` öğeleri opsiyonel `id` taşıyor, `id`
yoksa INSERT (trigger tetiklenir), `id` varsa UPDATE (severity dahil, ama INSERT olmadığı için
ticket tekrar açılmaz — severity sonradan yükseltilirse geriye dönük ticket AÇILMAZ, bilinçli
asimetri, `daily_report_issues`'ta da aynısı var), payload'da id'si olmayan mevcut satırlar
silinir (bağlı fotoğrafları da CASCADE ile gider — bulgu formdan kaldırılınca beklenen davranış).

**Yazma:** `create_purchase_request_with_items(p_project_id, p_title, p_urgency, p_request_note, p_requested_by, p_items, p_category)`,
`save_daily_report(p_project_id, p_report_date, p_created_by, p_general_status, p_worker_count, p_weather, p_weather_note, p_notes, p_personnel, p_machinery, p_progress, p_daily_tasks, p_materials, p_issues, p_task_progress)`
— tek overload (eski 11/14 parametreli overload'lar kaldırıldı). `p_progress`
artık gövdece kullanılmıyor (geriye dönük DEFAULT'lu param); ilerleme yalnızca
`p_task_progress: [{task_id, qty_added, note}]` ile giriliyor.
`p_issues: [{id?, topic, priority, assigned_to, description, resolution_status}]`
— diğer alt tablolardan (personel/makine/görev/ilerleme) FARKLI olarak
delete+reinsert değil, **id-bazlı upsert**: `id` yoksa yeni sorun (INSERT,
`fn_create_ticket_from_daily_report_issue` tetiklenip ticket açar), `id` varsa
güncelleme (ticket_id korunur, mükerrer ticket açılmaz), payload'da id'si
olmayan mevcut satırlar silinir. Frontend (`DailyReportForm.jsx`) `get_daily_report_detail`'den
gelen `issues[].id`'yi state'te saklayıp geri göndermek ZORUNDA — göndermezse
her kayıtta yeni ticket açılır (bkz. Trigger zincirleri). `update_procurement_status(...)`.
`save_quality_inspection(p_project_id, p_inspection_date, p_inspector, p_category, p_created_by,
p_id?, p_result, p_notes, p_findings)` — `p_id` NULL ise yeni denetim, doluysa güncelleme;
`p_findings` (bulgu/punch-list satırları) `save_daily_report`'un personel/makine alt tabloları
gibi delete+reinsert (id-bazlı upsert DEĞİL — bu modülde ticket bağlantısı yok, id korumaya
gerek yok). `update_quality_finding_status(p_finding_id, p_status)` — tek-tablo, listeden/detaydan
hızlı durum değiştirme (kural #6 kapsamı dışı).

**Yetki/kapsam çekirdeği:** `get_project_scope(p_project_id)` — tüm dual-scope
(tek proje/Tüm Projeler) RPC'lerin ortak yetki katmanı (`roles.is_manager` OR
`roles.cross_project` OR `user_has_project_access` OR `profiles.project_id`
fallback); `anon`/`authenticated`'a EXECUTE kapalı, yalnızca başka SECURITY
DEFINER fonksiyonlardan çağrılır. **2026-07-21'e kadar `cross_project`'ı hiç
kontrol etmiyordu** — yalnızca `is_manager` (scope_all için) ve tek-proje
sorgularında `user_has_project_access`/`profiles.project_id` bakıyordu; bu yüzden
`proje_yoneticisi`/`lojistik_tedarik` gibi cross_project=true ama is_manager=false
rollerde `get_my_projects()` ve bu fonksiyona delege eden TÜM RPC'ler
(`get_dashboard_summary`, `get_finans_overview*`, `get_satin_alma_overview*`,
`get_purchase_requests_list`, `get_invoices_list`, `get_invoice_approval_queue`
vb.) yalnızca kullanıcının `profiles.project_id`'deki tek "ev projesi"ni +
`user_project_access`'te elle tanımlı satırları görüyordu — cross_project'in
vaat ettiği "tüm projelere eriş" hiç gerçekleşmiyordu (proje_yoneticisi test
hesabı yalnızca İzmir'i görüyor, Kayseri hiç görünmüyordu; yeni bir proje
eklense o da görünmeyecekti). `has_project_access(p_project_id)` (tek-proje
kontrolü) bu kontrolü zaten doğru yapıyordu, yalnızca aggregate/`get_project_scope`
tarafı eksikti. Düzeltildi: fonksiyona `v_cross_project` eklendi, hem
`p_project_id IS NOT NULL` dalında hem `ELSIF v_is_manager` (→ artık
`v_is_manager OR v_cross_project`) dalında `is_manager`'la aynı şekilde
kullanılıyor — cross_project roller artık is_manager rolleriyle birebir aynı
"tüm projelere eriş" davranışını alıyor.
`has_project_access(p_project_id)` — kanonik proje-erişim kontrolü (is_manager
OR cross_project OR profiles.project_id OR user_project_access).
`user_has_project_access(p_project_id)`/`user_can_access_report(p_report_id)` —
RLS politikalarında kullanılan ince katmanlar, ikisi de artık yukarıdakilere delege eder.

**Bildirim:** `notify_managers(...)`, `notify_role(...)`, `notify_user(...)` —
`daily_reports`/`purchase_requests`/`invoices`/`tickets`/`ticket_comments`/
`procurement_item_change_requests` INSERT/status trigger'larından çağrılır,
`notifications` tablosuna yazar (RLS: `recipient_id = auth.uid()`, realtime
publication'da). `entity_type` değerleri: `purchase_request`, `invoice`,
`ticket`, `daily_report`, `daily_report_reminder`, `procurement_item_change_request`.
UI: header'daki basit özet `src/components/ui/NotificationBell.jsx` (kasıtlı
olarak basit tutuluyor — bkz. aşağı), tam sayfa
`src/pages/dashboard/components/TabBildirimler.jsx` (2026-07-20'de zenginleştirildi).
`pg_cron` (jobid=1, `0 6 * * 1-5` — yalnızca hafta içi) → `create_daily_report_reminders()`:
o gün `daily_reports` girilmemiş her `santiye_sefi` için
`entity_type='daily_report_reminder'`/`event_type='pending'` bildirimi ekler
(başlıkta günün tarihi). Rapor girilince `trg_resolve_daily_report_reminder` →
`resolve_daily_report_reminder()` aynı satırı `event_type='resolved'` yapar.
UI rengi (`reminderTone()`): okunmamış+pending sarı, okunmuş+pending normal,
resolved yeşil.

**`TabBildirimler.jsx` — canlı durum + rol bazlı detay + doğrudan kayıt açma
(2026-07-20):** Her bildirim satırı artık `purchase_request`/`ticket`'a ek
olarak `invoice`/`procurement_item_change_request` için de "Şu an: ..." canlı
durum rozeti gösteriyor (`src/components/ui/StatusBadge.jsx`'in `Badge` bileşeni
+ domain haritaları — `PR_STATUS`/`TK_STATUS`'a ek olarak yeni `INVOICE_STATUS`/
`PROCUREMENT_CHANGE_STATUS` export'ları, hepsi `BADGE_MAP[entity_type]` ile
seçiliyor). **Yalnızca yönetici rollerinde** (`src/config/navigation.js`'in yeni
`MANAGER_ROLES` sabiti — `roles.is_manager=true` kümesiyle birebir: admin/
koordinator/maliyet_kontrolcu/muhasebe/proje_koordinatoru) fatura bildirimlerinde
ek olarak `invoice_approvals`'tan hesaplanan "Adım X/2: <adım adı>" özeti
gösteriliyor — saha rolleri yalnızca düz durum rozetini görür. Bir bildirime
tıklamak artık yalnızca ilgili sekmeye geçmiyor, **doğrudan kaydı açıyor**:
ticket (mevcut `openTicketId`/`goToTicket` mekanizması reuse edildi), günlük
rapor (mevcut `openReportModal`), satın alma talebi (yeni `openRequestId`/
`onOpenedRequest` — `TabSatinAlmaTalepListesi.jsx`'e eklendi, ticket'taki
`useEffect` deseninin birebir kopyası, `get_purchase_request_detail` RPC'sini
kullanır, `TabSatinAlma.jsx`/`ProjeTabSatinAlma.jsx` üzerinden iletilir —
`ProjeTabSatinAlma` kendi iç sekmesini `'talepler'`e zorlar çünkü
`procurementManagerView` varsayılan olarak `'tedarik'`de açılıyor), fatura
(yeni `openInvoiceId`/`onOpenedInvoice` — `FaturaListesi.jsx`'e eklendi,
`get_invoices_list`'in tek-id varyantı olmadığından doğrudan
`invoices.select('*, suppliers(name)').eq('id',...)` kullanır — RLS
doğrulandı, `admin`/`muhasebe`/`proje_koordinatoru`'ye koşulsuz izin veriyor).
`procurement_item_change_request`'in tek kayıt detay modalı hiç yok (yalnızca
bir malzemenin TÜM geçmişini gösteren `MalzemeGecmisiModal` var) — bu tip için
tıklamak yeni `goToProjectTab(id, tab)` (`index.jsx`) ile ilgili projenin
ProjeDetay'ına, `initialTab` prop'uyla (yeni, `ProjeDetay.jsx`'e eklendi)
doğrudan Malzeme Listesi sekmesiyle açık şekilde götürüyor — tam kayıt değil
ama en azından doğru yere gider (bilinçli, dar kapsamlı bir çözüm).
`NotificationBell.jsx` kullanıcı kararıyla kasıtlı olarak dokunulmadı, basit kaldı.
RLS/migration gerekmedi — tamamen frontend, mevcut RPC'ler/tablolar kullanıldı.

**Görsel yeniden tasarım + yatay onay süreci göstergesi (2026-07-20, ayrı bir tur):**
Yukarıdaki fonksiyonel zenginleştirmenin ardından kullanıcı sayfanın **görünümünün**
de düz bir liste kalmaması gerektiğini belirtti. Eklenenler (Dashboard.css'e yeni
`.bildirim-*` sınıfları): Tümü/Okunmamış/tip bazlı filtre çipleri (`ENTITY_META`
haritasından — sayım rozetli), Bugün/Dün/Bu Hafta/Daha Eski tarih grup başlıkları
(`dateBucket()`), her tipin kendi ikonuyla (🎫🛒🧾📋⏰📦) kart satırları, hover'lı
zemin geçişleri, ikonlu boş/yükleniyor durumları. Ayrıca kullanıcı `TalepDetayModal.jsx`'in
dikey "Onay Süreci" stepper'ını (5 adım: Talep Oluşturuldu → Yönetici Onayı →
Tedarikçi/Satın Alma → Fatura Bekleniyor → Fatura Kesildi) örnek gösterip bunun
**yatay** halini bildirimlerde istedi — dikey modale hiç dokunulmadı (git log ile
doğrulandı), yalnızca aynı 5 adım/karar mantığı `satinAlma.js`'e `buildApprovalSteps()`
olarak tekilleştirilip yeni `src/components/ui/ApprovalStepsHorizontal.jsx`
(dot+çizgi+etiket, adım sayısını `--approval-steps-count` CSS custom property'siyle
alıyor ki 3 ve 5 adımlı kullanımların ikisinde de çizgi doğru hizalansın) ile yatay
render edildi; `purchase_request` bildirimlerinde artık düz rozet yerine bu gösterge
var. Aynı istek ticket'a da uygulandı — `TabBildirimler.jsx` içinde yerel
`buildTicketSteps()` (3 adım: Gönderildi → İşlemde → Kapatıldı, `iptal_edildi`
ortadaki adımı kırmızı "İptal Edildi" olarak işaretler) eklendi, `TicketDetayModal.jsx`
değişmedi. Fatura ve malzeme değişikliği bildirimleri hâlâ düz `Badge` kullanıyor
(fatura zaten kendi "Adım X/2" özetine sahip, malzeme değişikliği tek adımlı).
Bu tur ayrıca gerçek bir bulguyu da kapattı: `StatusBadge.jsx`'in `PR_STATUS`
haritası DB'nin 10 durumluk `purchase_requests_status_check`'inin yalnızca 7'sini
tanıyordu — `fiyat_girildi`/`onay_bekliyor`/`fatura_bekliyor` eksikti, bu 3 durumdaki
bir talep Badge'in fallback'ine düşüp ham enum metni gösteriyordu. Artık 10/10.
(Bu düzeltme yalnızca `StatusBadge.jsx`'in kendi haritasını genişletti — `TalepDetayModal.jsx`'in
yerel `STATUS_META`'sıyla, ticket'ın `StatusBadge.jsx` `TK_STATUS`'üyle
`TicketDetayModal.jsx`'in yerel `STATUS`'ü arasındaki tutarsızlık hâlâ "A1-devam"
kapsamında açık, bkz. Bilinen açık noktalar.)

**Trigger zincirleri (frontend bunları yeniden hesaplamamalı):**
- `daily_reports` → `progress_daily` INSERT/UPDATE/DELETE → `trg_sync_task_progress_from_daily`
  (`sync_task_progress_from_daily()`) → `project_tasks.total_progress`/`progress_pct`
  günceller → bu UPDATE `trg_sync_project_progress` (`fn_sync_project_progress()`)
  tetikler → `projects.progress`'e yansır. Proje için `project_category_weights`'te
  satır varsa (`category` → `weight_pct`) `Σ(weight_pct/100 × kategori_ortalama(progress_pct))`
  kullanılır (kategori içi basit AVG), satır yoksa süre-ağırlıklı (planned_start/
  planned_end) eski formüle düşer.
- `invoices` INSERT → `create_invoice_approval_chain()` → **2026-07-20'de tek adıma indirildi**:
  artık `invoice_approvals`'a doğrudan `step=1, step_label='Yönetici Onayı', status='bekliyor'`
  açar ve `invoices.status`'u doğrudan `yönetici_onayında` yapar — eski "Muhasebe Onayı"
  (adım 1) self-onay adımı kaldırıldı (kullanıcı: muhasebenin kendi girdiği faturayı
  kendine onaylatması gereksizdi, doğrudan yöneticiye düşmeli). `fn_invoice_approval_cascade`
  **tek yazan kaynak** olarak ilerletir — artık adım NUMARASINA değil `step_label`'a bakıyor:
  `step_label='Muhasebe Onayı'` olan (yalnızca 2026-07-20'den ÖNCE oluşturulmuş, hâlâ eski
  2 adımlı zincirde olan) bir onay `onaylandı` olursa step 2 `'Yönetici Onayı'` açılıp
  `yönetici_onayında`'ya geçilir; başka her `step_label` (yeni tek adımlı akışın kendisi VEYA
  eski akışın step 2'si) onaylanınca doğrudan `onaylandı`. Herhangi bir adımda ret →
  `reddedildi`. `fn_validate_invoice_status_transition` da `bekliyor → yönetici_onayında`
  doğrudan geçişine izin verecek şekilde güncellendi (eskiden yalnızca `bekliyor →
  muhasebe_onayında → yönetici_onayında` sırası vardı). Frontend tarafında `OnayKuyrugu.jsx`'in
  "Muhasebe Onay Kuyruğu" bölümü kaldırıldı (artık hiçbir yeni fatura orada durmuyor);
  onay/red aksiyonu artık sabit bir `step` numarasına değil `status='bekliyor'` olan satıra
  yazıyor (adım numarası faturaya göre 1 ya da 2 olabildiğinden). `FaturaListesi.jsx`'in
  "onaylandıktan sonra iptal edildi" ayrımı da (`cancelledAfterApproval`) artık sabit
  `step===2` yerine "TÜM onay adımları onaylandı" kontrolüne geçirildi — adım sayısından
  bağımsız çalışıyor. **`ödendi` durumu constraint'te geçerli ama onu üretecek bir akış yok**
  (backlog). INSERT/UPDATE ayrıca `sync_purchase_request_from_invoice()` ile bağlı
  `purchase_requests.status`/`invoice_id`'sini senkronlar (reddedilince `invoice_id=NULL`,
  yeniden fatura kesilebilir) ve (onaylandı/ödendi → upsert, reddedildi → sil)
  `trg_invoice_cost_allocation` ile `cost_allocations`'ı günceller. `purchase_requests.invoice_id`'ye
  yapılan HER yazma `trg_guard_purchase_request_invoice_id` ile gerçek `invoices` durumundan
  yeniden hesaplanır (drift/manuel bozulma imkansız) ve `invoices.purchase_request_id`
  üzerinde `WHERE status <> 'reddedildi'` kısmi UNIQUE index'i bir talebin aynı anda
  yalnızca bir aktif faturası olmasını DB seviyesinde garanti eder.

  **Ayrı bulgu — `FaturaListesi.jsx`'in "+ Fatura Ekle" (`FaturaEkleModal`) butonu şimdiye
  kadar hiç çalışmamış olmalıydı:** `source: 'manual'` (İngilizce) yazıyordu ama
  `invoices_source_check` constraint'i yalnızca `'manuel'` (Türkçe) kabul ediyor — her
  denemede ham Postgres constraint hatası alınırdı (DB'de tek bir `source='manual'` satırı
  yok, doğrulandı). Tek kelime düzeltildi.

  **Ayrı, düzeltilmeyen bulgu — 3 eski/seed test faturasında (`INV-2026-004`, `INV-2026-014`,
  `INV-2026-015`) tutarsız veri:** `invoices.status='muhasebe_onayında'` olmasına rağmen
  `invoice_approvals`'da HEM step1 (bekliyor) HEM step2 (bekliyor) satırı zaten var — normal
  akışta bu imkansız bir kombinasyon (step2 yalnızca step1 onaylanınca açılır). Muhtemelen
  ilk seed/demo verisi yüklenirken tetikleyiciler bypass edilip elle INSERT edilmiş. Bu 3
  fatura artık ne eski ne yeni akışta düzgün ilerleyemez (adım 1'i onaylamaya çalışmak step2
  UNIQUE constraint'ine çarpar) — canlı müşteri verisi olmadığından acil değil ama bir gün
  ele alınmalı (ya elle `invoice_approvals` temizlenip yeniden başlatılmalı ya da bu 3 test
  satırı tamamen silinmeli).
- `purchase_requests` UPDATE → `handle_purchase_request_approval()`.
- `tickets` UPDATE → `fn_ticket_history()` → `ticket_history`'ye otomatik log.
- `daily_report_issues` INSERT (yalnızca `ticket_id` henüz NULL olan gerçek yeni
  satırlarda) → `fn_create_ticket_from_daily_report_issue()`: `tickets`'a
  `title=topic`, `description` = `NEW.description`'daki `__ISSUE_META__{json}`
  öneki varsa soyulup yalnızca temiz `description` alanı (2026-07-17'de
  düzeltildi — önceden ham JSON ticket'a kopyalanıyordu), `severity=priority`
  (artık birebir aynı 4 değer: düşük/orta/yüksek/kritik), `status` `resolution_status`'tan map
  (açık→gönderildi, devam ediyor→işlemde, çözüldü→kapatıldı), `created_by`=raporu
  giren, `assigned_to`=serbest metin isimden `profiles.full_name` eşleşmesi
  varsa — otomatik açılan ticket'ın id'si `NEW.ticket_id`'ye yazılır. Sonraki
  `daily_report_issues` UPDATE'lerinde `resolution_status` değişirse
  `fn_sync_ticket_status_from_daily_report_issue()` bağlı ticket'ın `status`'unu
  (ve `çözüldü` ise `resolved_at`'ını) otomatik günceller — **tek yönlü**,
  Tickets sayfasından ticket durumunu değiştirmek `daily_report_issues`'u geri
  etkilemez. `save_daily_report` RPC'si bu tabloda diğer alt tablolardan farklı
  olarak delete+reinsert YERİNE id-bazlı upsert yapar (bkz. RPC katmanı →
  `save_daily_report`) — bu ayrım kasıtlı, aksi halde her kayıtta mükerrer
  ticket açılırdı.
- `quality_inspection_findings` INSERT (2026-07-19'da eklendi, `daily_report_issues`
  zincirinin birebir aynısı ama filtreli) → `fn_create_ticket_from_quality_finding()`:
  yalnızca `severity IN ('yüksek','kritik')` ise çalışır (düşük/orta bulgular hiç ticket
  açmaz — `daily_report_issues`'tan FARKI budur, o her sorun için ticket açar).
  `title='Kalite Bulgusu' || (' — '||location)`, `description=NEW.description` (bu
  tabloda `__ISSUE_META__` paketleme YOK, severity/status/assigned_to zaten gerçek
  kolon), `category='genel'` (tickets'ın `category` CHECK'i yalnızca genel/elektrik/
  mekanik'e izin veriyor, "kalite" diye bir değer yok), `severity=NEW.severity`,
  `status` `NEW.status`'tan map (açık→gönderildi, devam ediyor→işlemde, çözüldü→kapatıldı),
  `created_by`=denetimi oluşturan, `assigned_to`=serbest metin eşleşmesi. Sonraki
  `quality_inspection_findings` UPDATE'lerinde `status` değişirse
  `fn_sync_ticket_status_from_quality_finding()` bağlı ticket'ın `status`'unu senkronlar
  (tek yönlü, `daily_report_issues` deseniyle birebir aynı). **Bilinçli asimetri:**
  severity sonradan yükseltilirse (örn. orta→kritik) geriye dönük ticket AÇILMAZ —
  yalnızca INSERT tetikler (`daily_report_issues`'ta da aynı kısıtlama var).
- Yukarıdaki tablolar + `daily_reports`/`purchase_requests`/`invoices`/`tickets`/`ticket_comments` INSERT/status değişimi → bildirim trigger'ları (bkz. yukarı).

**"Gerçekleşen maliyet" kanonik tanımı:** `invoices.status IN ('onaylandı','ödendi')`,
tutar = `total_amount` (KDV dahil). `get_dashboard_summary.spent_amount`,
`get_finans_overview(_all).totalActual` ve `sum(cost_allocations.amount)` bu
tanımla hizalı olmalı — birinde sapma görülürse regresyon say.

### İlerleme hesaplama modeli
`progress_items` tablosu YOK (kaldırıldı) — ilerleme tek kaynaktan, `project_tasks`
üzerinden yürüyor: `target_qty`, `unit`, `total_progress`, `progress_pct`,
`dashboard_visible`, `dashboard_order` kolonları `project_tasks`'ta. Günlük
raporda girilen miktar `progress_daily` (task_id bazlı, `item_id` kolonu hâlâ
şemada ama kullanılmıyor/FK'siz kalan bir kalıntı) satırına yazılır, yukarıdaki
trigger zinciriyle `project_tasks`'a ve oradan `projects.progress`'e yansır.
Proje bazlı kategori ağırlıkları `project_category_weights(project_id, category,
weight_pct)` tablosunda — RLS yalnızca SELECT (`has_project_access`), yazma
arayüzü yok, şimdilik yalnızca SQL ile yönetiliyor (ayrı bir görev: proje
sihirbazına ağırlık düzenleme ekranı eklemek).

### Kritik yol ve otomatik risk motoru
`project_tasks.is_critical` (boolean, default false) — eskiden ayrı
`critical_path_items`/`critical_path_predecessors` tablolarında tutulan
"kritik yol" bilgisi artık görev satırının kendisinde. `task_category` enum'u
15 değer: eski 10 (`mobilizasyon, mekanik, elektrik_dc, elektrik_ac,
elektrik_og, topraklama, enh, devreye_alma, evrak_sureci, satin_alma`) + montaj
alt kırılımı 5 (`kolon_montaji, kiris_montaji, asik_montaji, panel_montaji,
kosk_trafo`). Görev formu (`Adim2IsKalemleri.jsx`) her ikisini de destekler.

`project_risks` artık sadece elle girilmiyor — `fn_recompute_auto_risks(p_project_id)`
iki kuralı otomatik değerlendirip upsert/kapatma yapar: (1) plan bitiş tarihi
geçmiş + tamamlanmamış görev → şiddet `is_critical`/gecikme gün sayısına göre
otomatik belirlenir; (2) bir BOM kalemi (`procurement_items`) için satın alma
talepleri toplamı planlanan miktarı aşarsa. Tetikleyiciler:
`trg_recompute_risks_from_task` (`project_tasks`), `trg_recompute_risks_from_purchase_request`/
`_purchase_item` (`purchase_requests`/`purchase_request_items`),
`trg_recompute_risks_from_daily_report` (`daily_reports`). `project_risks`'e
eklenen kolonlar: `source` (`'manuel'|'otomatik'`), `rule_code`
(`'gorev_gecikmesi'|'malzeme_fazla_talep'|null`), `subject_ref` (görev kodu ya
da BOM kalem id'si), ve `category` (`'is_kalemi'|'satin_alma'|'diger'`,
2026-07-16'da eklendi — `source`'un `'manuel'` değeriyle karışmaması için
kasıtlı olarak `'manuel'` değil `'diger'` kullanılıyor). `fn_recompute_auto_risks()`
otomatik risk oluştururken `category`'yi `rule_code`'a göre otomatik dolduruyor
(`gorev_gecikmesi`→`is_kalemi`, `malzeme_fazla_talep`→`satin_alma`); manuel
girişte kullanıcı `Adim4Riskler.jsx`'teki bir dropdown'dan seçiyor. Koşul
düzelince risk kendiliğinden `'kapatıldı'` olur — frontend'de bunları elle
kapatan bir buton YOK, o yüzden "otomatik risklerde kapat butonunu gizle" gibi
bir UI kararı da gerekmiyor. Risklerin görünür olduğu yer `ProjeDetay.jsx`'in
**"Genel Proje"** sekmesindeki "Açık Riskler (Detay)" kartı
(`ProjectOverviewDashboard.jsx`, `get_project_by_date`'in `risks` node'u) —
`source==='otomatik'` olanlarda "Sistem tarafından tespit edildi" rozeti
gösterir, satıra tıklayınca `rule_code`'a göre İş Planı/Satın Alma sekmesine
gider (bkz. Frontend yapısı → `ProjeDetay.jsx` sekmeleri).

**Risk girişi yalnızca proje DÜZENLEME akışında var, oluşturmada YOK**
(2026-07-16 kararı) — yeni oluşturulan bir projede henüz görev/satın alma
verisi olmadığı için ne otomatik motor bir şey üretebilir ne de manuel risk
girişi anlamlı olur. `YeniProjeWizard.jsx`'ten `Adim4Riskler` adımı tamamen
çıkarıldı (5 adım: Proje Bilgileri → İş Kalemleri → Tedarik → Bütçe →
Tamamlandı), `ProjeEditWizard.jsx`'te aynen kaldı (6 adım, Riskler dahil).
`WizardStepper.jsx` ve `Adim8Tamamlandi.jsx` artık `labels`/`steps` prop'u
alıyor (varsayılan = eski 6 adımlık dizi, `ProjeEditWizard.jsx` değişmeden
çalışır) — `YeniProjeWizard.jsx` kendi 5 adımlık dizisini geçiyor. Excel
tarafında da aynı kural: `import-project-excel` edge fonksiyonu (v8) yeni
proje oluştururken "Riskler" sayfasını hiç okumuyor, yalnızca mevcut projeye
güncelleme yaparken okuyor (`isNewProject` kontrolü, `project_category_weights`
seed mantığıyla aynı desende ama ters yönde).

### Modül → tablo haritası (31 tablo + 6 view + `notifications`)
| Modül | Tablolar |
|---|---|
| Proje yönetimi | projects, project_tasks, project_category_weights, project_risks |
| Günlük saha raporlama | daily_reports, daily_tasks, personnel_log_entries, machinery_logs, daily_report_photos, daily_report_issues, daily_report_material_usage |
| İmalat ilerlemesi | progress_daily |
| Satın alma (7 adım) | purchase_requests, purchase_request_items, purchase_request_status_log |
| Fatura ve maliyet | invoices, invoice_approvals, suppliers, budget_lines, cost_allocations |
| Kalite denetimi | quality_inspections, quality_inspection_findings, quality_inspection_photos |
| Kullanıcı yönetimi | roles, profiles, user_project_access |
| Bildirim | notifications |
| Destek / diğer | tickets, ticket_comments, ticket_history, agent_reports, procurement_items, procurement_item_adjustments, procurement_item_change_requests |

View'lar (hepsi `security_invoker=on`): `project_cost_summary`, `personnel_logs`,
`vw_delayed_tasks`, `vw_monthly_progress`, `vw_project_progress_summary`,
`vw_weekly_progress`.

### Excel şablonu / proje sihirbazı
Örnek/indirilebilir şablon dosyası `fons-solar-proje-sablonu.xlsx` (`public/excel/`,
2026-07-16'da `-v6` sürüm eki kaldırılarak yeniden adlandırıldı — `TabProjeYonetimi.jsx`'in
`PROJECT_TEMPLATE_FILE` sabiti buna göre güncellendi). Statik bir dosya, hiçbir
kod tarafından ÜRETİLMİYOR — kullanıcı bunu indirip doldurup `TabProjeYonetimi.jsx`'ten
tekrar yüklüyor (`import-project-excel` edge fonksiyonu). 7 sayfa: **Proje
Bilgileri** (`projects`), **İş Kalemleri** (`project_tasks` — Kategori/Alt
Kategori/Birim/Hedef Miktar/Dashboard Göster/Dashboard Sıra/Kritik mi?),
**Kategori Ağırlıkları** (`project_category_weights`, SALT OKUNUR — Excel'den
okunmuyor, yalnızca referans/görüntüleme; yeni projede DB trigger'ı seed
ediyor), **Riskler** (`project_risks` — A-I asıl veri, **J = Kategori**
[`İş Kalemi`/`Satın Alma`/`Diğer`, 2026-07-16'da eklendi] dropdown'lu; bu sayfa
yalnızca MEVCUT proje güncellemesinde okunuyor, yeni proje oluşturmada
`import-project-excel` bu sayfayı hiç parse etmiyor — bkz. "Kritik yol ve
otomatik risk motoru"), **Bütçe** (`budget_lines` — A-D kolonları gerçek veri,
sağdaki "Kategori Rehberi"/"Bütçe Özeti (Otomatik)" paneli (G-K kolonları,
2026-07-16'da eklendi) yalnızca görsel referans/Excel formülü, import'a dahil
değil), **Malzeme Listesi** (`procurement_items`), **📘 Kullanım Kılavuzu**
(DB eşlemesi yok, yalnızca doldurma rehberi).

`import-project-excel` (v8) / `export-project-excel` (v9) edge fonksiyonları
(Deno, kaynak kodu bu repoda değil — yalnızca Supabase'de deploy edili, `get_edge_function`
ile incelenebilir) bu 7 sayfayı parse ediyor/üretiyor; frontend yalnızca ince
bir köprüden (`src/utils/projectExcelBridge.js`) çağırıyor, kendi Excel
üretmiyor/parse etmiyor. Kategori eşleme (`mapping.ts`'teki `taskCategoryToCode`)
sabit bir liste DEĞİL — Türkçe etiketi doğrudan `snake_case`'e çeviriyor
(`trSnake`), bu yüzden yeni kategori eklendiğinde edge function'da değişiklik
gerekmiyor. Risk kategorisi (`riskCategoryToCode`/`RISK_CAT_TO_LABEL`) ise
sabit 3 değerlik bir sözlük (İş Kalemi/Satın Alma/Diğer ↔ is_kalemi/satin_alma/diger),
`trSnake` kullanmıyor. Statik `public/excel/` dosyasındaki J kolonu (Kategori)
elle, `exceljs` ile (proje bağımlılığı değil — `npm install --no-save exceljs`
ile geçici kurulup iş bitince kaldırıldı) mevcut dosyaya eklendi; `xlsx` paketi
(bu projenin gerçek bağımlılığı) açılır liste (data validation) yazmayı
desteklemiyor, o yüzden bu tek seferlik düzenleme için `exceljs` gerekti.

Bundan AYRI bir ikinci akış: istemci tarafı basit sihirbaz mini-importer'ı
(`src/utils/projectExcelImport.js`) — yalnızca proje sihirbazının Adım 2 (İş
Kalemleri) adımında toplu görev satırı yüklemek için, yalnızca "İş Kalemleri"
sayfasını okur (tam 7-sayfalık şablonla karıştırılmamalı). `CAT_MAP`'i 2026-07-17'de
5 yeni kategoriyle (kolon/kiriş/aşık/panel montajı, köşk trafo) genişletildi ve
`parseIsKalemleri()` artık `is_critical`'ı ("Kritik mi?"/"Kritik Yol" başlıklarından,
`toBoolTR()` ile) okuyor — edge function'daki genel `trSnake` yaklaşımından hâlâ
farklı (sabit bir eşleme listesi), ama artık veri kaybı yok. Kendi
`downloadProjectTemplate()`'ı da "Kritik mi?" kolonunu içerecek şekilde güncellendi.

Proje oluşturma/düzenleme sihirbazı (`YeniProjeWizard.jsx`/`ProjeEditWizard.jsx`)
6 adım: İş Kalemleri (Adım 2, ilerleme hedefi + kategori dropdown'ı 15 değer +
"Kritik Yol" checkbox'ı da burada) → Riskler → Tedarik → Bütçe → Tamamlandı.
Ayrı bir "Kritik Yol" adımı YOK (eskiden `critical_path_items`'a yazan
`Adim7KritikYol.jsx` vardı, tablo DB'den kaldırılınca dosyayla birlikte silindi).

**`TabProjeYonetimi.jsx`'te "Yeni Proje" butonu artık birincil akış olarak
Excel şablonu yükleme akışını açıyor** (2026-07-16'da değiştirildi, kullanıcı
kararıyla): tıklanınca doğrudan dosya seçici açılır (`handleImportClick` →
`import-project-excel` edge fonksiyonu), eskisi gibi manuel sihirbazı
açmıyor. Manuel sihirbaz TAMAMEN kaldırılmadı — küçük, ikincil bir "Manuel
doldur" bağlantısı (`setView('new')`) hâlâ `YeniProjeWizard.jsx`'i açıyor.
Aynı desen boş-liste durumundaki "+ İlk Projeyi Ekle" butonuna da uygulandı.
"Şablon İndir" butonu (statik dosya, `PROJECT_TEMPLATE_FILE`) değişmedi —
kullanıcı önce şablonu indirip doldurmalı, sonra "Yeni Proje"yle yükler.
**Not:** Manuel sihirbaz yolu seçilirse, sihirbazın Adım 2'sindeki client-side
mini-importer (`src/utils/projectExcelImport.js`) hâlâ eski 10 kategoriyle
sınırlı ve `is_critical`'ı okumuyor (bkz. Bilinen açık noktalar) — bu artık
ikincil bir yol olduğu için öncelik düştü ama düzeltilmedi.

### Test ortamı
5 profil, 2 proje: "Ege Enerji İzmir GES – TEST" (`test-izmir-ges-2026`) ve
"Kayseri Develi GES" (`test-kayseri-develi-ges`). Canlı müşteri verisi yok.
`tests/faz-e.spec.js` + `playwright.config.js` + `tests/helpers.js` — kalıcı
Playwright regresyon suite'i (`npm run test:e2e`), kimlik bilgileri `.env.test`'te
(gitignore'da). **Credential değerleri (şifre/token) hiçbir zaman chat metnine
yazılmaz** — test hesabı olsa bile, canlı Supabase projesine gerçek erişimi var.
Admin test hesabının `profiles.id`'si zaman zaman değişti — körü körüne eski
id'ye güvenme, `select id from profiles where role_key='admin'` ile doğrula.
`faz-e.spec.js` test B (fatura INSERT/DELETE realtime) bilinen, önceden var olan
bir sorun — kararsız/flaky, ilgisiz değişikliklerde de başarısız olabilir.
`proje_yoneticisi` test hesabı 2026-07-17'de yenilendi: eski `satinalma@fonssolar.com`
silinip yerine `projeyoneticisi.test@fonssolar.com` oluşturuldu (kimlik bilgisi
`.env.test`'teki `TEST_PROJEYONETICISI_EMAIL`/`TEST_PROJEYONETICISI_PASSWORD`),
`test-izmir-ges-2026` projesine bağlı — rol hâlâ mimaride tek proje kapsamlı
(`is_manager=false`, `cross_project=false`), admin gibi tüm projeleri görmüyor.
Eski hesap silinirken kalıcı test verisi fixture'ı olan INV-2026-018/"DC Solar
Kablo Tedariki — Blok C [TEST VERİSİ]" satırının `price_entered_by`/`purchased_by`
alanları NULL'a çekildi (FK engeliydi, satırın kendisi silinmedi — bkz. Satın
Alma/Finans Test Verisi notu).

---

## Tamamlanan büyük görevler (kronolojik)
- **Refactor planı (7/7 adım):** `.gitignore` hijyeni, `get_dashboard_summary`,
  `ticket_history`/`invoice_approvals` trigger'ları, `create_purchase_request_with_items`,
  `save_daily_report` RPC'ye geçiş.
- **Supabase RPC migrasyonu:** ~100 doğrudan `.from()` sorgusunun büyük kısmı
  RPC'ye taşındı (kalan liste aşağıda "bilinen açık noktalar"da).
- **Canlı veri görevi (8/8 dilim + Faz D + Faz E):** Tüm dashboard RPC'leri
  `get_project_scope` üzerinden yetkilendirildi, kapsam seçici (`ScopeContext`)
  + ortak `useDashboardData` hook'una bağlandı; P0 tablo kümesine Realtime
  eklendi (`useRealtimeRefresh`, debounce'lu); Playwright regresyon suite'i
  (`tests/faz-e.spec.js`) kalıcı altyapı olarak eklendi.
- **FAZ1-5 iş akışları:** Bildirim sistemi (`notifications` + trigger'lar +
  `NotificationBell`), BOM takibi (`vw_bom_tracking` — 2026-07-20'de hiç
  kullanılmadığı için kaldırıldı, bkz. Tamamlanan büyük görevler, `bom_item_id`
  kolonu hâlâ geçerli), Finans/
  maliyet netleştirme (kanonik "gerçekleşen" tanımı + `cost_allocations`
  otomatik senkron), Ticket düzeltmeleri (`project_id` nullable, `ticket_attachments`),
  Günlük rapor müşteri export'u (`buildPeriodReportData` + Roboto Unicode PDF
  fontu — Türkçe karakter hatası düzeltildi).
- **Güvenlik kapatmaları:** `profiles_all_authenticated` (rol yükseltme açığı),
  view'larda anon RLS bypass (`security_invoker=on`), `user_has_project_access`
  → `has_project_access` kanonik delegasyonu.
- **"İş kalemi"/"ilerleme kalemi" tekilleştirme + kategori-ağırlıklı ilerleme:**
  `progress_items` tablosu tamamen kaldırıldı, ilerleme tek kaynaktan
  `project_tasks`/`progress_daily` üzerinden yürüyor; proje geneli ilerleme
  yüzdesi süre-ağırlıklıdan proje-bazlı kategori ağırlıklarına (`project_category_weights`)
  geçirildi; Excel şablonu ve proje sihirbazı buna göre tek sayfaya/7 adıma
  indirildi (bkz. Sistem mimarisi → İlerleme hesaplama modeli, Excel şablonu).
- **Proje şablonu v6 + otomatik risk motoru cutover:** `is_critical` kolonu +
  5 yeni kategori, `critical_path_items`/`critical_path_predecessors`/
  `mechanical_checklist`/`electrical_checklist` tablolarının DB'den kaldırılması
  ve `project_risks` otomatik risk motorunun (`fn_recompute_auto_risks` +
  trigger'lar) frontend'e yansıtılması (bkz. Sistem mimarisi → Kritik yol ve
  otomatik risk motoru).
- **DB sağlamlık denetimi kapatıldı** (`fons-solar-veritabani-saglamlik-denetimi.md`,
  Downloads'ta — artık onaysız doğrudan düzenlenebilir bir yaşayan doküman):
  DB-NF-003 (fatura↔satın alma link guard trigger'ı), DB-NF-004 (yanlış
  pozitifti, zaten `GENERATED ALWAYS`), DB-NF-005 (ölü teslimat kolonları
  temizlendi + sihirbazın `planned_qty` veri kaybı hatası düzeltildi, DB kısmı
  ertelendi), DB-PERF-002/003 (RLS initplan sarmalama + çakışan policy
  birleştirme, 38 policy/15 tablo), DB-SEC-002-FOLLOWUP (`get_project_dashboard`'a
  eksik olan proje-erişim kontrolü eklendi — canlı bir yetki açığıydı). Geriye
  yalnızca DB-SEC-006 kaldı (leaked password protection, Supabase Free plan'da
  desteklenmiyor, Pro plan gerektiriyor — ödeme kararı, teknik olarak
  yapılamaz).
- **`ProjectDashboard` ölü kodunun tasfiyesi + değerli parçalarının "Genel Proje"ye taşınması:**
  v6 prompt doğrulamasında bulunan "categoryWeights render edilmiyor" bulgusu
  araştırılırken `TabGenel.jsx`'in `ProjectDashboard` alt bileşeninin (`projectId`
  dolu geldiğinde render edilen dal) **hiç mount edilmediği** ortaya çıktı
  (commit `94024c4`'ün "Proje Paneli sekmesi bağlandı" iddiası yanlıştı, o
  commit `ProjeDetay.jsx`'e hiç dokunmamıştı). İlk denemede `ProjeDetay.jsx`'e
  gerçek bir "Proje Paneli" sekmesi eklenip bağlandı, ama kullanıcı bunu
  istemedi ("ekstradan proje paneli sayfası açmaya gerek yok") — bunun yerine
  kartların, zaten kullanılan **"Genel Proje"** sekmesine (`ProjectOverviewDashboard.jsx`)
  sayfanın kendi temasına uygun şekilde taşınmasını istedi, kritik yol
  timeline'ından vazgeçildiğini belirtti ve kartların ilgili sekmelere
  tıklama ile gitmesini istedi.

  Sonuç: "Proje Paneli" sekmesi geri alındı; `TabGenel.jsx`'in `ProjectDashboard`
  fonksiyonu ve yalnızca ona özel yardımcıları (`Ring`, `DualRing`, `buildScurve`,
  `TimelineStrip`, kullanılmayan recharts import'ları) **tamamen silindi**
  (`TabGenel` artık yalnızca `ProjectListView`'ı render ediyor — bkz. `get_project_dashboard`
  RPC'sinin artık hiç çağrılmadığı not, Bilinen açık noktalar). Değerli parçalar
  `ProjectOverviewDashboard.jsx`'e taşındı/genişletildi: S-Eğrisi grafiği (yeni),
  Kategori Bazlı İlerleme (önceki turdan), "İş Kalemleri Takibi" → "İmalat
  İlerlemesi" olarak genişletildi (4 yerine tüm kalemler, iç scroll), "Maliyet
  Durumu"na "En Büyük 5 Kalem" listesi eklendi, "Açık Riskler (Detay)" kartı
  (yeni — otomatik risk motorunun `source==='otomatik'` rozetinin uygulamadaki
  **tek** göründüğü yer). İlgili RPC (`get_project_by_date`) `risks` node'u ve
  `budget_lines.name` alanıyla genişletildi (2 küçük additive migration,
  onaylı). Kartlara `onGoTab` ile ilgili sekmeye (İş Planı/Finans/Satın Alma)
  tıklama-geçiş eklendi; risk satırları `rule_code`'a göre hedef sekmeyi seçiyor.
  Playwright ile İzmir projesinde tüm yeni kartlar + "Proje Paneli" sekmesinin
  gerçekten kaldırıldığı + risk tıklamasının İş Planı'na gittiği doğrulandı;
  `faz-e.spec.js` test A bozulma göstermedi (test B önceden bilinen flaky).
- **Günlük rapor "Sorun" girişi ↔ Tickets otomatik bağlantısı (frontend tarafı):**
  Backend (trigger'lar, `tickets.severity`'ye `kritik` eklenmesi, `daily_report_issues.ticket_id`,
  `save_daily_report`'un `p_issues` için id-bazlı upsert'e geçmesi) ayrı bir
  oturumda yapılıp SQL ile doğrulanmıştı (bkz. Trigger zincirleri, RPC katmanı).
  Bu turda frontend tarafı tamamlandı: `DailyReportForm.jsx` artık `issues[].id`'yi
  prefill'de koruyor ve kaydederken geri gönderiyor (aksi halde her kayıtta
  mükerrer ticket açılıyordu); bağlı ticket varsa tıklanabilir bir rozet
  gösteriyor (Tickets sekmesine geçip o ticket'ı doğrudan açıyor — `index.jsx`'te
  yeni `openTicketId`/`goToTicket`, `TabTickets`/`TicketListesi`'ne kadar
  iletiliyor). `tickets.severity`'nin yeni `kritik` değeri `TicketListesi.jsx`,
  `TicketDetayModal.jsx`, `YeniTicketModal.jsx`'teki severity seçici/rozet/sıralama
  haritalarına eklendi (üçü de ayrı ayrı, ortak bir sabit yok — kod tekrarı,
  gelecekte tekilleştirilebilir). Playwright ile uçtan uca doğrulandı: yeni
  sorun girişi gerçek bir ticket açıyor (severity/status doğru), aynı raporu
  değiştirmeden tekrar kaydetmek mükerrer ticket açmıyor (id dedup çalışıyor),
  resolution_status değişince ticket status'u senkron oluyor, rozete tıklama
  doğru ticket'ı açıyor, kritik severity hatasız kaydediliyor; `faz-e.spec.js`
  test A bozulma göstermedi. **Bilinen kozmetik yan etki:** `daily_report_issues.description`
  kolonu `category`/`closed_at`/`notes` alanlarını `__ISSUE_META__{json}` öneki
  ile paketliyor (bu tabloda o alanlar için ayrı kolon yok, önceden var olan bir
  çözüm) — kullanıcı bu ek alanlardan birini doldurursa otomatik açılan
  ticket'ın `description`'ı ham JSON içerir; ayrı bir görev (yeni kolon
  eklemek ya da encoding'i kaldırmak) gerektirir, bu turda kapsam dışı bırakıldı.
- **Satın alma akışına "Proje Yöneticisi Tedarik" katmanı:** Backend (rol
  değişimi `satin_alma_uzmani`→`proje_yoneticisi`, `purchase_requests`'e
  tedarik kolonları, `trg_auto_advance_pr_to_satin_alindi`,
  `trg_guard_invoice_requires_procurement_done`, `pr_update_proje_yoneticisi`
  RLS policy'si) ayrı bir oturumda yapılıp SQL ile doğrulanmıştı. Bu turda
  frontend tarafı tamamlandı: `satin_alma_uzmani` string'i `src/` ağacından
  tamamen kaldırıldı (`TabKullanicilar.jsx`, `index.jsx`, `Sidebar.jsx`,
  `ProjeDetay.jsx` — `proje_yoneticisi` artık `PROJE_BAZLI` grubunda, tek
  proje kapsamlı); yeni **"Tedarik Kuyruğu"** ekranı eklendi
  (`TedarikKuyrugu.jsx`, `admin` + `proje_yoneticisi` görür); `isAwaitingInvoice()`
  artık yalnızca `satin_alindi`'de true dönüyor (bkz. Satın alma akışı);
  `FaturaOlusturModal.jsx`'e DB guard hatasını Türkçeleştiren bir `toUserMessage()`
  eklendi; `TalepDetayModal.jsx`'in onay-süreci timeline'ına "Tedarikçi / Satın
  Alma Bilgisi" adımı eklendi. Playwright ile uçtan uca doğrulandı (admin +
  scope selector üzerinden İzmir projesi): yeni bir `onaylandi` talebi
  "Tedarik Bekleyenler"de görünüyor, "+ Yeni" tedarikçi ekleyip kaydedince
  talep DB tetikleyicisiyle otomatik `satin_alindi`'ye geçiyor ve "Tamamlanan"
  sekmesine düşüyor, Satın Alma sekmesinde bu talep için artık "Fatura Oluştur"
  butonu görünüyor (önceden `onaylandi`'de de görünürdü, artık değil). Test
  verisi (geçici `purchase_request`/`suppliers` satırları) temizlendi.
- **Genel Proje ekranı ikinci geçiş — kullanıcı geri bildirimlerinden 10 madde +
  yol boyunca bulunan 5 gerçek bug:** `ProjeDetay.jsx` + her sekmenin kendi
  `DataStatusBanner`/realtime göstergesini render etmesi yüzünden Genel
  Proje'ye girince "Canlı"/"Güncelleniyor" ikişer kez görünüyordu — üst
  seviyedeki (`ProjeDetay.jsx`) kaldırıldı, sekmeye özel olan kaldı (kullanıcı
  ayrıca kendi elle düzenlemesiyle `ProjectOverviewDashboard.jsx`'teki
  indicator'ı da tamamen kaldırdı, bu ekranda artık hiç yok). "Projenin
  Gidişatı" milestone şeridi kartı tamamen silindi, ismi S-Eğrisi kartına
  taşındı; S-Eğrisi + Kategori Bazlı İlerleme yan yana (`project-mid-grid`,
  kategori sayısı ≤8'se `recharts BarChart`, değilse eski liste+scroll).
  Maliyet Durumu sadeleştirildi. Malzeme Kalemleri'nin durum rozeti ham enum
  metni gösteriyordu (`fatura_onay_bekliyor`, `talep_olusturuldu` vb.) —
  kaynağın `procurement_items` değil `purchase_requests` olduğu anlaşılınca
  `src/utils/satinAlma.js`'teki kanonik `statusLabel()`/`normalizeStatus()`'a
  bağlandı (Günlük Özet'teki "Bekleyen Satın Alma" sayacı da aynı yanlış
  `status==='bekliyor'` tam-eşleşmesini kullanıyordu, aynı fonksiyonla
  düzeltildi). Güncel Ticketlar'daki sabit-yükseklik scroll kutusu az kayıtla
  altta boşluk bırakıyordu — `slice(0,5)`'e geçildi. Riskler kartında `source:
  'manuel'` 34 adet YİNELENEN mock veri vardı (Excel-import test turlarından
  kalma, `project_risks`'ten `DELETE ... WHERE source='manuel'` ile temizlendi
  — hepsi test verisiydi, gerçek kullanıcı girişi yoktu); kart artık kompakt
  bottom-grid hücresi, her satırda kategori + kural rozeti var. Saha
  Fotoğrafları ile Riskler'in yeri değiştirildi (fotoğraflar artık tam
  genişlik, büyük thumbnail). "İmalat İlerlemesi" kartı kullanıcı kararıyla
  kaldırıldı (hesabı `project_tasks.target_qty`/`progress_daily`'den geliyordu,
  proje-bağımsız genel bir kural vardı ama kullanıcı yine de kaldırmayı seçti).

  **RPC düzeltmeleri (`get_project_by_date`, 2 migration, onaylı):** (1) `risks`
  node'u `category` alanını hiç döndürmüyordu — kategori rozeti her zaman
  "Diğer"e düşüyordu, eklendi; `source='otomatik'` filtresi de kaldırıldı
  (kullanıcı: RPC tüm açık riskleri dönsün, "yalnızca otomatik" kararı frontend
  filtresinde kalsın). (2) Daha ciddi bulgu: "Genel İlerleme" ring'i tarih
  filtresine hiç tepki vermiyordu — `avgReportProgress` her zaman canlı
  `projects.progress` kolonunu önceliklendiriyordu (tarih-farkında
  `overall_pct`'i yalnızca o null ise kullanıyordu, ki hiçbir zaman null
  değil). Kullanıcı iki düzeltme daha istedi: `category_weights.avg_progress`
  da aynı canlı-değer sorununu taşıyordu (`AVG(project_tasks.progress_pct)`,
  tarihten bağımsız) — hem o hem `overall_pct` artık `fn_sync_project_progress()`
  ile BİREBİR aynı karar ağacını (kategori ağırlıklı/süre-ağırlıklı) kullanıyor,
  ama `progress_pct` yerine `progress_daily`'i `p_date`'e kadar toplayarak.
  Frontend'de `avgReportProgress`'in öncelik sırası da çevrildi (tarih-farkında
  değer önce, canlı kolon yalnızca yedek). Playwright ile doğrulandı: bugün
  %24, 2026-06-01'e (ilerleme girilmemiş bir tarih) gidince %0.

  **Ayrı görev — otomatik ticket description sızıntısı da bu oturumda
  kapatıldı:** `fn_create_ticket_from_daily_report_issue()` artık
  `daily_report_issues.description`'daki `__ISSUE_META__{json}` önekini
  soyup yalnızca temiz açıklamayı ticket'a yazıyor (`daily_report_issues`
  tablosundaki encoding'in kendisi değişmedi, yalnızca ticket'a kopyalanan
  değer). Gerçek satır INSERT edilip ticket'ın `description`'ının temiz
  çıktığı doğrulandı, test verisi silindi.

  Tüm değişiklikler Playwright ile (viewport büyütülüp tam sayfa ekran
  görüntüsü alınarak) görsel doğrulandı, `npx vite build` her adımda hatasız.
- **`tickets.severity` haritası tekilleştirildi:** yeni `src/utils/ticketSeverity.js`
  — `SEVERITY_META` ({bg,color,label} sözlüğü), `SEVERITY_ORDER` (sıralama
  için), `SEVERITY_OPTIONS` (select dropdown'ları için `{value,label}` dizisi).
  `TicketListesi.jsx`/`TicketDetayModal.jsx` artık kendi kopyalarını tutmuyor,
  `YeniTicketModal.jsx`'in Aciliyet select'i hardcoded `<option>`'lar yerine
  `SEVERITY_OPTIONS.map(...)` kullanıyor. Yeni bir severity değeri eklenirse
  yalnızca bu tek dosya güncellenir. (`DailyReportForm.jsx`'teki `PRIORITY_OPTIONS`
  ve `DailyReportDetail.jsx`'teki `PRIORITY_COLORS` — `daily_report_issues.priority`
  için, farklı bir alan/ekran — kasıtlı olarak bu tekilleştirmenin kapsamı
  dışında bırakıldı, aynı 4 değeri kullanıyor ama ayrı bir görev.)
- **`toUserMessage()` tekilleştirildi:** yeni `src/utils/errors.js` —
  `toUserMessage(error, {rules, fallback})`. Ortak kural (RLS/yetki hatası →
  "Bu işlem için yetkiniz yok.") tek yerde sabit; her çağıran kendi özel
  kurallarını (`rules: [{match, message}]`) ve varsayılan mesajını (`fallback`,
  string ya da `(error) => string`) parametre olarak geçiyor. Düzeltme
  sırasında CLAUDE.md'nin daha önce yakalamadığı **üçüncü** bir kopya bulundu:
  `TedarikKuyrugu.jsx`'in kendi `toUserMessage()`'ı (backlog notu yalnızca
  `DailyReportForm.jsx`/`FaturaOlusturModal.jsx`'i biliyordu) — üçü de artık
  ortak fonksiyona delege ediyor, yerel `toUserMessage()` sarmalayıcıları ince
  birer parametre-geçiş fonksiyonu olarak kaldı (çağıran taraflar değişmedi).
- **Satın alma akışına iki iptal noktası + BOM kutusu kategori düzeltmesi
  eklendi:** Kullanıcının anlattığı uçtan uca akış (santiye şefi talep →
  yönetici onayı → proje yöneticisi tedarik → muhasebe fatura → yönetici fatura
  onayı → maliyet tablosu) büyük ölçüde zaten kurulu çıktı, yalnızca 3 gerçek
  boşluk vardı. (1) `TalepDetayModal.jsx`'teki "Malzeme Miktar Kontrol" (BOM
  aşım) kutusu artık yalnızca `type === 'Malzeme'` taleplerde gösteriliyor —
  hizmet taleplerinde BOM eşleşmesi zaten hep 0/"Uygun" çıktığından kutu
  anlamsız yer kaplıyordu (bkz. Satın alma akışı). (2) `TedarikKuyrugu.jsx`'e
  "İptal Et" eklendi — proje yöneticisi tedarikçi bulamazsa `onaylandi`
  aşamasındaki talebi zorunlu gerekçe notuyla `iptal` yapabiliyor. Bunun için
  `fn_purchase_request_procurement_fields_only` migration'ı gerekti (1 migration,
  onaylı) — ilk önerilen SQL, `pr.status = p_status` eşitliği yüzünden
  `trg_auto_advance_pr_to_satin_alindi`'nin (BEFORE trigger, WITH CHECK'ten önce
  çalışır) `onaylandi→satin_alindi` otomatik geçişini kıracaktı; kullanıcı
  bunu tespit edip düzeltilmiş SQL'i (durum geçişini `pr.status`'a göre değil
  `p_status`'un mevcut duruma göre nereye gidebileceğine göre dallandıran hali)
  verdi, o SQL uygulandı. (3) Muhasebe artık `onaylandı` bir faturayı da iptal
  edebiliyor (`fn_validate_invoice_status_transition`'a `onaylandı→reddedildi`
  geçişi eklendi, 1 migration, onaylı) — bu tek satır yeterliydi çünkü
  `sync_cost_allocation_from_invoice`/`sync_purchase_request_from_invoice`
  zaten `reddedildi`ye göre cost_allocations'ı silip talebi `onaylandi`'ye
  geri döndürüyordu, yeni bir mantık yazılmadı. UI: `FaturaListesi.jsx` Detay
  modalında ve `ProjeTabFaturaListesi.jsx`'te yeni bir İŞLEMLER sütununda
  "İptal Et" (onay adımlı). "Onay sürecinde reddedilen" ile "onaylandıktan
  sonra iptal edilen" aynı DB değerini (`reddedildi`) paylaştığından
  `FaturaListesi.jsx`'in Detay modalı `invoice_approvals`'ta step 2'nin
  gerçekten tamamlanıp tamamlanmadığına bakarak ayrı bir rozet gösteriyor
  ("İptal Edildi (Onay Sonrası)"); liste satırı bu ayrımı yapmıyor (bkz. Satın
  alma akışı). `npx vite build` hatasız; Playwright ile 3 senaryo da (tedarik
  iptali, fatura iptali, BOM kutusu kategori ayrımı) uçtan uca PASS doğrulandı.
- **Malzeme listesi (BOM) planlanan miktar değişikliği + yönetici onayı
  eklendi (2026-07-17):** Yöneticiden gelen istek üzerine — proje başında
  belirlenen malzeme miktarlarını (`procurement_items.planned_qty`) artık
  proje yöneticisi tek taraflı değiştiremiyor, değişiklik admin onayına
  düşüyor. Yeni tablo `procurement_item_change_requests` + 2 RPC
  (`create_procurement_item_change_request`, `review_procurement_item_change_request`)
  + `notifications.entity_type` genişletmesi (3 migration, hepsi onaylı).
  Bu işi yaparken CLAUDE.md'de hiç dokümante edilmemiş, önceden var olan
  ayrı bir mekanizma (`procurement_item_adjustments` — onaylı satın alma
  talebi planlanandan fazlaysa `planned_qty`'yi sessizce otomatik yükselten
  denetim izi) keşfedildi ve şimdi dokümante edildi (bkz. Sistem mimarisi →
  "Malzeme listesi (BOM) planlanan miktar değişiklikleri"); iki mekanizma
  çakışmıyor, birlikte çalışıyor. Frontend: `ProjeTabFaturaKesilecekler.jsx`
  (Malzeme Listesi sekmesi) hem proje yöneticisi/admin için "Düzenle" akışını
  hem admin için "Bekleyen Miktar Değişiklikleri" onay panelini barındırıyor.
  Bu görev, go-live'a 5 gün kala (`cc-master-uygulama-plani.md`, A0-A9 planı
  dolu, Salı akşamı özellik dondurması var) kullanıcının bilinçli kararıyla
  plana ek bir oturum olarak sıkıştırıldı. Playwright doğrulaması sırasında
  ayrı, gerçek bir regresyon bulundu ve aynı oturumda kapatıldı — bkz. Roller
  bölümündeki `proje_yoneticisi` frontend notu (`ProjeSecimGerekli` +
  `pySelectedProjectId` yerel state fix'i). Nihai durum: talep açma, admin
  onayı, `planned_qty` güncellemesi, bildirim, proje seçici — hepsi Playwright
  ile uçtan uca PASS.
- **Genel Proje/İş Planı frontend düzenlemesi (kullanıcının kendi çalışması,
  2026-07-17):** Header'daki global proje seçici kaldırıldı (çok projeli
  kullanıcılarda görünmeyen eski localStorage kapsamı temizlenir, tek projeli
  kullanıcıda otomatik kapsam korunur — bkz. Roller/Satın alma bölümlerindeki
  ilgili notlar). `ProjeDetay.jsx`'teki proje Excel güncelle/indir butonları
  kaldırıldı, bu yetenek yalnızca Proje Yönetimi sayfasında kaldı.
  `ProjectOverviewDashboard.jsx` yeniden dengelendi (Projenin Gidişatı/Kategori
  Bazlı İlerleme eş kartlar, S-eğrisi tooltip'i özet kartla aynı metrikten
  besleniyor, Riskler/Maliyet sadeleşti). `TabIsPlan.jsx` kritik yol
  mantığından çıkarıldı (basit gecikme kuralı: `Riskli`/`Normal`), KPI şeridi
  3 karta indirildi, ölü kod temizlendi.
- **Genel/ProjeTab liste bileşenleri birleştirmesi (2026-07-18):** Menü (tüm
  projeler) ile proje detayı (tek proje) için ayrı yazılmış kopya liste
  bileşenleri tek bileşende birleştirildi — `components/finans/FaturaListesi.jsx`
  (`projectId`/`filterDate` opsiyonel; `projectId` yokken menü davranışı/Detay
  modalı, doluyken proje davranışı/doğrudan "İptal Et"), `components/finans/OnayKuyrugu.jsx`
  (`projectId` opsiyonel; doluyken ek "Tamamlanan/İptal Edilen" 3. bölüm),
  `TabSatinAlmaTalepListesi.jsx` + sarmalayıcı `TabSatinAlmaOnayKuyrugu.jsx`
  (`filterDate`/`siteChiefView` opsiyonel; PROJE kolonu ve proje-bazlı malzeme
  planı gruplaması yalnızca menü modunda). `ProjeTabFaturaListesi.jsx`,
  `ProjeTabOnayKuyrugu.jsx`, `ProjeTabTalepListesi.jsx`, `ProjeTabSaOnayKuyrugu.jsx`
  silindi. Süreçte CLAUDE.md'nin bu konudaki eski notunun **yanlış** olduğu
  ortaya çıktı: listelenen 5 çiftten yalnızca bu 3'ü gerçek kopyaydı —
  `MaliyetOzetTable`/`ProjeTabMaliyetTablosu` kasıtlı olarak farklı iki bileşen
  (özet vs. filtre+export'lu detaylı görünüm), `ProjeTabFaturaKesilecekler.jsx`
  (Malzeme Listesi/BOM) menü seviyesinde hiç karşılığı yok — ikisi de
  birleştirilmedi. `refactor/birlesik-list-bilesenleri` branch'i main'e merge
  edilip push'landı (`19df2ab..68ad6a8`), kullanıcı 4 ekranı elle gezip görsel
  teyit etti; `tests/faz-e.spec.js` test A önceden var olan, bu işten bağımsız
  bir hata (header'daki proje seçicisinin 2026-07-17'de kaldırılmasından kalma).
- **Kalan ham-sorgulu liste ekranları RPC'ye taşındı (2026-07-18):** Bileşen
  birleştirmesinin ardından "Satın alma/finans liste ekranları RPC kullanmıyor"
  maddesi tamamen kapatıldı. Önce dar kapsamlı bir pilot (`ProjeTabFaturaKesilecekler.jsx` →
  `get_satin_alma_overview`'a additive `pending_changes` alanı, bkz. RPC katmanı),
  ardından kullanıcı kararıyla kalan 3 bileşen için 4 yeni RPC yazıldı
  (`get_purchase_requests_list`, `get_purchase_request_detail`, `get_invoices_list`,
  `get_invoice_approval_queue` — detay RPC katmanında). `TabSatinAlmaTalepListesi.jsx`
  + ondan açılan `TalepDetayModal.jsx`'in kendi ayrı detay sorgusu, `components/finans/FaturaListesi.jsx`,
  `components/finans/OnayKuyrugu.jsx` bu RPC'leri kullanacak şekilde güncellendi;
  tüm yazma (`update`/`insert`) çağrıları DEĞİŞMEDEN kalındı (kural #6 yalnızca
  çok-tablolu yazmalar için RPC şartı koyuyor, DB trigger'ları zaten kademeleri
  yönetiyor). Migration'lar sırasında bir güvenlik tutarsızlığı bulundu ve
  düzeltildi: bu projede yeni fonksiyonlar varsayılan olarak `anon`/`PUBLIC`'e de
  execute yetkisi alıyormuş (kardeş RPC'ler `get_satin_alma_overview` vb.'de bu
  zaten `REVOKE` edilmişti) — 4 yeni RPC için de `REVOKE ... FROM PUBLIC, anon`
  migration'ı uygulandı. `FaturaEkleModal`/`YeniTalepModal` dropdown sorguları ve
  `FaturaDetayModal`'ın on-demand `invoice_approvals` sorgusu bilinçli olarak
  kapsam dışı bırakıldı (küçük/jenerik, "liste ekranı" şikayetinin konusu değil).
  Her migration sonrası `get_advisors` kontrol edildi, her faz sonrası
  `npx vite build`/`npx eslint src` temiz (0 hata), `grep` ile hiçbir hedef
  dosyada okuma amaçlı ham `.from()` sorgusu kalmadığı doğrulandı, RPC'ler
  `execute_sql` ile gerçek proje verisiyle test edildi. Tarayıcıdan elle uçtan
  uca test bu oturumda yapılamadı (headless ortam) — kullanıcının Satın Alma
  (talepler + detay + onay/red + fatura oluştur) ve Finans (faturalar + onay
  kuyruğu + kapanan faturalar) ekranlarını hem menü hem proje modunda ilk
  fırsatta test etmesi gerekiyor.
- **Frontend rol tanıma 6→19 genişletildi (2026-07-18):** `ROLE_TABS`/`ROLE_LABEL`
  (`src/pages/dashboard/index.jsx`) ve nav görünürlüğü (`Sidebar.jsx`) artık
  `roles` tablosundaki tüm 19 rolü tanıyor (bkz. Roller bölümü — 3 grup:
  `proje_koordinatoru`→koordinator ile aynı, `maliyet_kontrolcu`→Genel+Projeler+Finans,
  11 saha/teknik rolü→`FIELD_SPECIALIST_ROLES` ortak demeti: Genel+İş Planı+
  Satın Alma+Tickets+Bildirimler, santiye_sefi'nin Günlük Rapor formu hariç).
  Yalnızca sidebar görünürlüğü + `is-plani` için yeni bir render dalı eklendi —
  `ProjeDetay.jsx`'in iç sekmeleri zaten permissive olduğundan değişmedi.
  `TabSatinAlma.jsx`'teki artık yanlış olan bir yorum (`TabSatinAlmaTalepListesi
  ham sorgu koşuyor` diyordu, RPC migrasyonundan kalma) da düzeltildi.
- **Kalite denetimi modülü — temel kapsam (2026-07-18):** Daha önce hiç arayüzü
  olmayan `quality_inspections` tablosu (0 satır) artık gerçek bir modül:
  `created_by` kolonu eklendi, yeni `quality_inspection_findings` (punch list
  satırları — konum/açıklama/şiddet/durum/sorumlu/çözülme tarihi) tablosu +
  RLS'i, 4 RPC (`save_quality_inspection`, `update_quality_finding_status`,
  `get_quality_inspections_list`, `get_quality_inspection_detail` — hepsi
  `REVOKE ... FROM PUBLIC, anon`). Frontend: `src/components/kalite-kontrol/`
  altında tek bir `KaliteKontrolListesi.jsx` (menü/proje modu opsiyonel
  `projectId`/`filterDate` ile, bu oturumun Task 1'inden öğrenilen "baştan tek
  bileşen" dersiyle) + `DenetimDetayModal.jsx` (bulgu durumu hızlı değiştirme)
  + `YeniDenetimModal.jsx` (oluştur/düzenle, dinamik bulgu satırları). Şiddet
  için yeni sözlük yazılmadı, `src/utils/ticketSeverity.js` reuse edildi.
  `kalite_kontrol_sefi` artık jenerik `FIELD_SPECIALIST_ROLES` demetinden
  ayrıldı — kendi `ROLE_TABS` kaydı (Genel+İş Planı+Satın Alma+**Kalite
  Kontrol**+Tickets+Bildirimler) + Sidebar'da özel nav item + `ProjeDetay.jsx`'e
  yeni "Kalite Kontrol" sekmesi (admin/koordinator/muhendis için, İş Planı ile
  aynı desen). Test sırasında bulunup düzeltilen küçük bir bug: aynı transaction
  içinde art arda eklenen bulgular Postgres'in transaction-sabit `now()`'ı
  yüzünden aynı `created_at`'ı alabiliyordu, bu da bulgu listesi sırasının
  sayfa yenilemeleri arasında kararsız/rastgele görünmesine yol açıyordu —
  `get_quality_inspection_detail`'in `ORDER BY`'ına `f.id` tiebreaker'ı eklendi.
  Playwright ile (izmir test hesabının `role_key`'i geçici `kalite_kontrol_sefi`ye
  çekilerek) uçtan uca doğrulandı: sidebar doğru sekmeleri gösteriyor, denetim +
  2 bulgu oluşturma, bulgu durumu "çözüldü" yapma kalıcı, admin'in `ProjeDetay`
  içinden aynı veriyi görmesi — hepsi PASS; test verisi silindi, rol geri alındı.
  **Kapsam dışı bırakıldı (bilinçli, ayrı gelecek görev — foto+ticket kısmı
  2026-07-19'da tamamlandı, bkz. aşağıdaki madde):** denetim sonucu için ayrı
  bir onay/imza zinciri hâlâ yok.
- **Kalite Kontrol foto yükleme + otomatik ticket bağlantısı (2026-07-19):**
  Kalite Denetimi modülünün "temel kapsam" turunda bilinçli ertelenen iki parça
  tamamlandı. Foto: yeni `quality_inspection_photos` tablosu (bulgu/finding
  bazlı — `daily_report_photos` deseniyle birebir aynı, `finding_id` FK'si
  `ON DELETE CASCADE`), mevcut `saha-fotolari` bucket'ı reuse edildi (yeni
  bucket açılmadı), path `{project_id}/kalite-kontrolu/{finding_id}/{timestamp}_
  {isim}` — ilk segment `project_id` olduğu için bucket'ın mevcut
  `storage_delete` policy'sindeki `foldername(name)[1]` kontrolüyle otomatik
  uyumlu, yeni bir storage policy gerekmedi. Yükleme/silme `DailyReportForm.jsx`
  ile aynı stil: RPC değil, doğrudan `supabase.storage`/`.from()` (tek tablo
  yazma, kural #6 kapsamı dışı); silme yetkisi yalnızca yükleyene ait
  (`daily_report_photos`'un `drp_delete` deseniyle birebir aynı, admin dahil
  başkası silemez). Ticket: `quality_inspection_findings`'e `ticket_id` kolonu +
  2 yeni trigger (`fn_create_ticket_from_quality_finding`/
  `fn_sync_ticket_status_from_quality_finding` — bkz. Trigger zincirleri) ile
  yalnızca `yüksek`/`kritik` severity'li bulgular otomatik ticket açıyor
  (`daily_report_issues`'tan farklı olarak düşük/orta hiç ticket açmaz).
  `DenetimDetayModal.jsx`'e `daily_report_issues` ile birebir aynı "🎫 Ticket
  açıldı →" rozeti eklendi (tam navigasyon: tıklanınca Tickets sekmesine geçip
  ticket'ı doğrudan açıyor) — bunun için `index.jsx`'teki mevcut `goToTicket`
  generic olarak yeniden kullanıldı, `ProjeDetay.jsx`'e ise kendi lokal tab
  state'ine uygun ayrı bir `goToTicketLocal`/`ktOpenTicketId` eklendi (ikisi de
  `KaliteKontrolListesi`/`DenetimDetayModal`'a yeni `onGoToTicket` prop'uyla akıyor).
  Bu iki özelliğin ön koşulu olarak `save_quality_inspection` RPC'si delete+reinsert'ten
  `daily_report_issues` deseniyle id-bazlı upsert'e geçirildi (bkz. RPC katmanı) —
  aksi halde her düzenlemede mükerrer ticket açılır, fotoğraflar CASCADE ile
  sessizce silinirdi. `execute_sql` ile doğrudan doğrulandı: yüksek severity
  bulguya ticket açılıyor, aynı bulgunun severity'si sonradan yükseltilirse
  (var olan id ile UPDATE) geriye dönük ticket AÇILMIYOR (bilinçli asimetri),
  status "çözüldü" yapılınca ticket "kapatıldı" oluyor, tekrarlı save mükerrer
  ticket üretmiyor. Playwright ile (izmir hesabı geçici `kalite_kontrol_sefi`ye
  çekilerek) uçtan uca doğrulandı: düşük+yüksek bulgulu denetim oluşturma,
  yalnızca yüksek bulguda ticket rozeti görünmesi, foto yükleme/thumbnail
  gösterimi, rozete tıklayınca Tickets sekmesine geçip doğru ticket'ın
  açılması — PASS; test verisi (denetim, bulgular, storage dosyası, ticket)
  silindi, rol geri alındı. `get_advisors` migration sonrası yeni uyarı
  göstermedi (trigger fonksiyonlarının `anon_security_definer_function_executable`
  uyarısı — bu iki fonksiyon da 2026-07-19'daki "A0-GÖREV 2 kapatıldı" işinde
  `REVOKE`'landı, aşağıya bkz. — **"fiilen istismar edilemez, kabul edilmiş
  gürültü" notu YANLIŞTI**, REVOKE ile temizce kapatılabiliyormuş). `npx vite
  build`/`npx eslint src` temiz, `tests/faz-e.spec.js` regresyonu yeni sorun
  göstermedi (bilinen A/B/D hatası aynen duruyor, header proje seçicisinin
  kaldırılmasından kalma).
- **Go-live master planından A0-GÖREV 2 kapatıldı (2026-07-19):** Kullanıcının
  harici `cc-master-uygulama-plani.md` dosyası okunup kod tabanıyla çapraz
  kontrol edildiğinde bu maddenin hâlâ açık olduğu (17.07'de planlanmış ama hiç
  uygulanmamış) doğrudan DB sorgusuyla doğrulandı. İki parça: (1) 4 trigger
  fonksiyonunun (`fn_auto_advance_pr_to_satin_alindi`, `fn_create_ticket_from_daily_report_issue`,
  `fn_guard_invoice_requires_procurement_done`, `fn_sync_ticket_status_from_daily_report_issue`)
  REST'e açık `EXECUTE`'u kapatıldı — **önemli bulgu:** bu 4 fonksiyon `PUBLIC`
  role'üne granted'mış (`REVOKE ... FROM anon, authenticated` tek başına
  yetmedi, `anon`/`authenticated` `PUBLIC` üzerinden miras alıyordu — düzeltme
  `REVOKE ... FROM PUBLIC` ile yapıldı, aynı proje-özel davranış Kalite Kontrol
  RPC'lerinde de daha önce görülmüştü). (2) 16 fonksiyona `SET search_path =
  public` eklendi (`function_search_path_mutable` advisor uyarısı) — yalnızca
  4'ü zaten set edilmişti, geri kalan 12'si (`fn_guard_purchase_request_invoice_id`,
  `create_invoice_approval_chain`, `get_my_role`, `save_daily_report`,
  `create_purchase_request_with_items` dahil) hiç set edilmemişti. Bu iş
  sırasında ayrıca bugün eklenen Kalite Kontrol trigger'ları
  (`fn_create_ticket_from_quality_finding`/`fn_sync_ticket_status_from_quality_finding`)
  da aynı desende (ama bunlar `PUBLIC` değil doğrudan `anon`/`authenticated`'a
  granted'mış) kapatıldı. `execute_sql` ile doğrudan doğrulandı (gerçek satırlar
  insert/update edilerek): REVOKE sonrası tüm 6 trigger hâlâ normal şekilde
  ateşleniyor — `daily_report_issues`→ticket açma/senkron, `purchase_requests`
  auto-advance (`onaylandi`→`satin_alindi`), `fn_guard_invoice_requires_procurement_done`
  (erken fatura girişini Türkçe hatayla reddediyor), `quality_inspection_findings`→ticket
  açma — hepsi PASS, test verisi silindi. `get_advisors`(security) bu fonksiyonların
  hepsinin `anon`/`authenticated_security_definer_function_executable` listesinden
  düştüğünü, `function_search_path_mutable` sorgusu da proconfig'in artık boş
  olmadığını doğruladı. `npx vite build` temiz (frontend dosyası değişmedi,
  yalnızca DB migration'ları). **Master plandaki A0-GÖREV 3 (ölü RPC kontrolü —
  `get_project_overview`/`get_project_progress_export`) zaten sorun değilmiş:**
  DB'de bu isimde fonksiyon hiç yok.
- **Master plan A1 (proje statüsü map konsolidasyonu, daraltılmış kapsam,
  2026-07-19):** Plandaki A1 maddesi 17.07'de yazılmıştı; 18.07'deki büyük
  birleştirme turunda hedeflerinin bir kısmı zaten farklı isimlerle kapanmıştı
  (ticket severity → `ticketSeverity.js`, satın alma → `satinAlma.js`, kalite
  denetimi → `qualityInspection.js`). Güncel durum 2 Explore agent'ıyla tam
  taranınca planın hiç bahsetmediği **10 ayrı status/severity map domaini**
  bulundu, bir kısmı gerçek çakışma (aynı domain iki farklı dosyada iki farklı
  renk/etiket seti). Hepsini tek oturumda birleştirmek riskli olacağından yalnızca
  **proje statüsü** (`projects.status`, DB constraint'iyle doğrulanmış 4 değer:
  aktif/tamamlandı/beklemede/iptal edildi) bu oturumda kapatıldı, 2 ayrı commit'te:
  (1) saf refactor — yeni `src/utils/projectStatus.js` (`PROJECT_STATUS_META`),
  `TabGenel.jsx`/`TabProjeler.jsx`/`TabProjeYonetimi.jsx`'in birbirinden bağımsız
  duran renk map'lerini buradan besler hale geldi, davranış değişikliği yok
  (Playwright ile 3 ekranda rozet metni/rengi öncesi-sonrası aynı doğrulandı) —
  `TabProjeYonetimi.jsx`'in "İptal Edildi" etiketi (diğerlerinde "İptal") kasıtlı
  olarak yerel bırakıldı, birleştirilmedi; (2) ayrı bug-fix commit'i —
  `ProjectOverviewDashboard.jsx`'in `STATUS_LABEL`'ı DB'de hiç var olmayan
  `askida`/`gecikti` değerlerini listeliyordu ve gerçek `iptal edildi`'yi hiç
  içermiyordu (muhtemelen görev/task status'uyla karışmış eski bir kopyala-yapıştır
  hatası) — iptal edilmiş bir proje "Genel Proje" ekranında ham `iptal edildi`
  metnini gösteriyordu, artık doğru 4 değerden okuyor. Test verisiyle (Kayseri
  projesi geçici `iptal edildi` yapılıp) Playwright ile doğrulandı, sonra geri alındı.

  **"A1-devam" — bulunan ama bilinçli kapsam dışı bırakılan, ayrı bir oturum
  gerektiren 4 madde (2026-07-20'de kapatıldı, bkz. aşağıdaki ilgili girdi):** risk severity (3 farklı
  yerde, birbirinden ve `ticketSeverity.js`'den bağımsız), satın alma statüsü
  çakışması (`StatusBadge.jsx`'in `PR_STATUS`'ü ile `TalepDetayModal.jsx`'in
  yerel `STATUS_META`'sı farklı renk/etiket veriyor), ticket statüsü çakışması
  (`StatusBadge.jsx`'in `TK_STATUS`'ü ile `TicketDetayModal.jsx`'in yerel
  `STATUS`'ü arasında `iptal_edildi` tutarsızlığı), günlük rapor genel durumu
  (3 farklı tanım + `DailyReportList.jsx`'te büyük/küçük harf duplicate key bug'ı).
- **3 orphan/kullanılmayan DB nesnesi temizlendi (2026-07-18):** Bağımlılık
  taraması (Explore agent + doğrudan `pg_proc`/`pg_constraint` sorgusu) üçünün
  de güvenle silinebilir olduğunu doğruladı, kullanıcı onayıyla migration
  uygulandı: `DROP TABLE work_packages` (0 satır, hiçbir dosyada/RPC'de/
  trigger'da referansı yoktu), `DROP TABLE schedule_activities` (0 satır;
  eşlik eden kod temizliği: `agentContext.js`'in `ctxIsPlan()` fonksiyonundan
  her zaman boş dönen sorgu + "Aktivite Planı" bölümü kaldırıldı,
  `TabProjeYonetimi.jsx`'in `PROJECT_DELETE_TABLES` dizisinden çıkarıldı),
  `DROP FUNCTION get_project_dashboard(text, date)` (onu kullanan tek bileşen
  2026-07-16'da zaten silinmişti, RPC'nin kendisi bu turda kaldırıldı).
  `npx vite build`/`npx eslint src` temiz, `get_advisors` yeni bir uyarı
  göstermedi.
- **RLS sertleştirme — `auth_rls_initplan` + `multiple_permissive_policies`
  (2026-07-18):** CLAUDE.md'nin "`profiles`/`purchase_requests` üzerinde eski+yeni
  politika birikimi var" iddiası `get_advisors`(performance) + `pg_policies` ile
  doğrulanırken **yanlış çıktı** — `profiles`'ta hiç birikim/çakışma yok (her
  action için tam 1 politika, zaten `(select auth.uid())` sarmalı). Gerçek sorun
  yalnızca `purchase_requests`'in `UPDATE`'inde 2 permissive politikaydı
  (`pr_update`, `pr_update_proje_yoneticisi` — muhasebetli DB-PERF-002/003
  denetimi kapandıktan SONRA, "Proje Yöneticisi Tedarik" görevinde eklenmiş).
  Ayrıca 7 politika ham `auth.uid()` kullanıyordu (`(select auth.uid())` sarmalı
  yok): `projects.projects_select`, `purchase_requests.purchase_requests_select`,
  `purchase_request_items.{pr_items_select,pr_items_insert,pr_items_update,pr_items_delete}`,
  `procurement_item_change_requests.picr_insert`. Tek migration'da: 7 politika
  `ALTER POLICY` ile sarmalandı (matematiksel olarak birebir aynı, davranış
  değişikliği yok), `purchase_requests`'in 2 UPDATE politikası `DROP` edilip
  `USING (A OR B)` / `WITH CHECK (A_check OR B_check)` şeklinde tek
  `purchase_requests_update` politikasında birleştirildi (permissive politikalar
  zaten OR'lanarak değerlendirildiğinden matematiksel olarak birebir aynı — yalnızca
  politika sayısı azaldı). `get_advisors` migration sonrası bu 8 uyarının (1
  `multiple_permissive_policies` + 7 `auth_rls_initplan`) hepsinin kalktığını
  doğruladı. Playwright ile uçtan uca doğrulandı (santiye_sefi talep oluşturur →
  admin onaylar [merged policy'nin admin dalı] → proje_yoneticisi `TedarikKuyrugu`'ndan
  `satin_alindi`'ye ilerletir [merged policy'nin proje_yoneticisi dalı] — üçü de
  PASS); test verisi silindi. Frontend dosyası değişmedi (yalnızca DB migration).
- **Repo hijyeni + Kalite Kontrol modülü kaldırma + Finans sadeleştirme + Master
  plan A3 (2026-07-20):** Oturum başında working tree'de commit edilmemiş, önceki
  bir oturumdan kalma A7 işleri (vercel.json güvenlik header'ları, `scripts/db-backup/`
  günlük yedekleme scripti, `src/utils/imageCompression.js` — foto yükleme
  noktalarında client-side sıkıştırma) + ayrı bir `AuthContext`/`getProjects`
  bugfix'i (çok projeli/`cross_project` rollerde ana proje ataması ve `projects`
  RLS'inin gösteremediği projelerin `get_project_by_date` ile tamamlanması)
  bulundu; kullanıcı onayıyla mantıksal 4 ayrı commit'e bölündü. Oturum sırasında
  kullanıcı eşzamanlı olarak editörde iki ayrı değişiklik daha yaptı (onlar da
  ayrı commit'lendi): (1) ayrı **Kalite Kontrol modülünün tamamen kaldırılması**
  (kullanıcı kararı — `KaliteKontrolListesi.jsx`/`DenetimDetayModal.jsx`/
  `YeniDenetimModal.jsx`/`qualityInspection.js` silindi, Sidebar/ProjeDetay/index.jsx
  nav girişleri kaldırıldı, `kalite_kontrol_sefi` jenerik saha demetine geri döndü —
  o gün DB'ye dokunulmamıştı, orphan RPC/tablolar 2026-07-20'de A1-devam sonrası
  ayrı bir migration'la temizlendi, bkz. Tamamlanan büyük görevler → ilgili girdi);
  (2) **Finans
  sadeleştirmesi** (`FaturaListesi.jsx` satır tıklaması artık doğrudan detay
  modalını açıyor, `OnayKuyrugu.jsx` yalnızca fiilen bekleyen faturaları
  gösterecek şekilde filtrelendi + "Tamamlanan/İptal Edilen" bölümü kaldırıldı,
  `ProjeTabFinans.jsx` sekme çubuğu inline style'dan `.finans-tabs`/`.finans-tab`
  CSS sınıflarına taşındı).

  Ardından **Master plan A3** (rol/menü tek kaynak) uygulandı: keşifte
  `index.jsx`'in `ROLE_TABS`/`ROLE_DEFAULT`'ı ile `Sidebar.jsx`'in per-item
  `roles` dizileri karşılaştırıldı, 19 rolün tamamında tutarsızlık bulunmadı
  (tek latent bulgu `is-plani` render boşluğu, bkz. Bilinen açık noktalar — kural
  gereği davranış değiştirilmeden olduğu gibi taşındı). Yeni `src/config/navigation.js`
  (`NAVIGATION[role] = {tabs, defaultTab, sidebarItems}`, `FIELD_SPECIALIST_ROLES`/
  `ROLE_LABEL` de buraya taşındı) — `index.jsx` ve `Sidebar.jsx` artık yalnızca
  buradan okuyor. `npx vite build`/`npx eslint src` her adımda temiz. **SEN kabul
  testi bekleniyor** (headless ortamda yapılamadı): yönetici + şantiye şefi +
  proje yöneticisi ile login → sidebar/tab'lar öncekiyle birebir aynı olmalı.
  7 commit yapıldı, henüz push edilmedi (onay bekliyor).
- **A5 (Muhasebe/Finans rol ekranı) sırasında bulunan 2 RLS açığı kapatıldı
  (2026-07-20, 2 migration, ikisi de onaylı):** (1) `purchase_requests_insert`
  policy'sinin `WITH CHECK`'i `(auth.uid() IS NOT NULL) OR (...)` şeklindeydi —
  ilk dal her authenticated istekte true olduğundan bu bir no-op'tu: herhangi bir
  rol herhangi bir proje için sahte satın alma talebi doğrudan `.insert()` ile
  oluşturabiliyordu (uygulamanın kendisi bunu hiç yapmıyor — `create_purchase_request_with_items`
  SECURITY DEFINER olduğundan bu policy'yi görmüyor — ama RLS son savunma
  hattıdır, "UI kullanmıyor" güvenlik değildir). Düzeltme: `requested_by =
  (select auth.uid()) AND has_project_access(project_id)`. (2) `pr_items_insert`
  policy'si `admin` ile birlikte `muhasebe`'ye de herhangi bir projenin
  `purchase_request_items`'ına yazma izni veriyordu, UI'da hiç kullanılmıyordu —
  `muhasebe` policy'den çıkarıldı. `get_advisors`(security) migration'lar
  sonrası yeni uyarı göstermedi, `pg_policy` ile her ikisi de doğrulandı.
  Frontend dosyası değişmedi.
- **Proje yöneticisi + muhasebe sayfa erişimi genişletmesi (2026-07-20, Plan mode
  ile tasarlandı):** Kullanıcıyla birlikte "hangi rol neyi görmeli" netleştirildi.
  (1) `ProjeDetay.jsx`'in `canViewFinanceAndTickets = role !== 'proje_yoneticisi'`
  guard'ı kaldırıldı — proje_yoneticisi artık bir projenin içinde Finans'ı
  **salt-okunur** (fatura ekleyemez/onaylayamaz/iptal edemez), Tickets'ı ise
  **santiye_sefi ile aynı tam yetkide** görüyor (bkz. Roller bölümü). Bu
  değişikliği güvenli yapabilmek için keşifte 3 gerçek bug bulunup aynı
  commit'te düzeltildi: `FaturaListesi.jsx`'in "+ Fatura Ekle" butonu hiç rol
  kontrolü olmadan render ediliyordu (`canAct = isAdmin || isMuhasebe`'ye
  bağlandı); `OnayKuyrugu.jsx`'in Yönetici Onay Kuyruğu'ndaki `readonly={isMuhasebe}`
  proje_yoneticisi için `false`'a eşitleniyordu yani çalışmayacak Onayla/Reddet
  butonları render ediliyordu (`readonly={!isAdmin}` yapıldı); `TicketListesi.jsx`'in
  `fetchTickets`'ı proje_yoneticisi'ni genel `else` dalına (yalnız kendi açtığı
  ticket) düşürüyordu, projenin diğer ticket'larını hiç göstermiyordu (`propProjectId`'ye
  göre süzen ayrı bir dal eklendi). Bu düzeltmeler yan etki olarak
  `maliyet_kontrolcu`/`koordinator`/`muhendis`/`proje_koordinatoru` gibi "kısıtsız"
  rollerin de daha önce yanlışlıkla görebildiği (ama RLS'in zaten reddettiği)
  fatura/onay butonlarını doğru şekilde gizledi. (2) Muhasebe'ye ayrı bir
  "Projeler" sekmesi açmak yerine mevcut üst seviye `TabFinans.jsx`'e bir proje
  filtresi (`<select>`, `getProjects()` ile doldurulur) eklendi — boşken
  (varsayılan) `get_finans_overview_all` ile bugünküyle birebir aynı "tüm
  projeler" davranışı, bir proje seçilince `get_finans_overview(p_project_id,...)`'a
  geçip `FaturaListesi`/`OnayKuyrugu`'ya `projectId` iletiliyor (ikisi de zaten
  bu prop'u destekliyordu). Bu filtre admin için de görünür (bileşen paylaşılı,
  saf katkı). Muhasebe'ye Satın Alma görünürlüğü **eklenmedi** (bilinçli karar —
  fatura ekleme formundaki tedarikçi/talep seçici yeterli). RLS/migration
  gerekmedi — tamamen UI değişikliği, arka planda zaten var olan yetki sınırlarına
  (invoices/invoice_approvals yalnızca admin/muhasebe, tickets created_by/admin)
  dayanıyor. `npx eslint src`/`npx vite build` temiz (21 pre-existing warning,
  0 yeni). **SEN kabul testi bekleniyor** (headless ortamda yapılamadı): proje
  yöneticisi ile bir projeye girip Finans/Tickets'ın doğru göründüğünü, muhasebe
  ile üst seviye Finans'ta proje filtresinin çalıştığını doğrula.
- **Bildirimler sayfası (`TabBildirimler.jsx`) zenginleştirmesi (Plan mode ile
  tasarlandı, aynı oturumda uygulandı, 5 commit):** bkz. Sistem mimarisi →
  "Bildirim" bölümündeki ayrıntılı not için tam teknik özet. Kısaca: (1)
  `src/components/ui/StatusBadge.jsx`'e `INVOICE_STATUS`/`PROCUREMENT_CHANGE_STATUS`
  eklendi, canlı durum rozeti artık fatura/malzeme değişikliği taleplerini de
  kapsıyor; (2) yeni `MANAGER_ROLES` (`navigation.js`) ile yönetici rolleri
  faturanın onay zincirinde hangi adımda olduğunu ek olarak görüyor; (3) her
  bildirim tipi artık tıklanınca doğrudan kaydı açıyor (ticket/günlük rapor
  mevcut mekanizmaları reuse etti; satın alma talebi ve fatura için
  `TabSatinAlmaTalepListesi.jsx`/`FaturaListesi.jsx`'e ticket'takiyle aynı
  desende yeni `openRequestId`/`openInvoiceId` prop'ları eklendi; malzeme
  miktarı değişikliği taleplerinin tek kayıt modalı olmadığından bu tip için
  `ProjeDetay.jsx`'e yeni `initialTab` prop'uyla projenin Malzeme Listesi
  sekmesine götürülüyor). `NotificationBell.jsx` kullanıcı kararıyla kasıtlı
  dokunulmadı. RLS/migration gerekmedi. `npx eslint src`/`npx vite build` her
  commit sonrası temiz.
- **Bildirimler görsel yeniden tasarım + yatay onay süreci göstergesi +
  "is-plani" boş ekran riski kapatıldı (2026-07-20):** bkz. Sistem mimarisi →
  "Bildirim" bölümündeki ayrıntılı not (filtre çipleri, tarih grupları, ikonlu
  satırlar, `ApprovalStepsHorizontal.jsx` ile satın alma/ticket bildirimlerinde
  yatay 5/3 adımlı süreç göstergesi, `PR_STATUS`'a eksik 3 durum eklendi). Ayrıca
  aşağıda "Bilinen açık noktalar"da duran latent "is-plani" render boşluğu
  kapatıldı: `index.jsx`'teki "Kısıtlı roller → başlangıç sekmesi" `useEffect`'i
  artık `NAVIGATION[role]?.defaultTab` yoksa (kısıtsız roller — admin/koordinator/
  proje_koordinatoru/muhendis/maliyet_kontrolcu) `activeTab === 'is-plani'` olup
  olmadığını da kontrol edip `'genel'`e düşürüyor — paylaşımlı bir cihazda önceki
  rolden `localStorage`'da kalan bu değer artık boş ekrana yol açmıyor. Dar
  kapsamlı, tek koşullu bir düzeltme (yalnızca `is-plani`); diğer sekmelerin
  (`finans`/`tickets` gibi permissive render koşullu ama sidebar'da görünmeyen
  kombinasyonların) davranışına dokunulmadı — kasıtlı, ayrı bir konu.
- **"A1-devam" kapatıldı (2026-07-20, Plan Mode ile tasarlandı, 4 commit):** 3
  paralel Explore ajanı + doğrudan DB sorgularıyla (constraint tanımları + gerçek
  veri dağılımı) 4 alt-madde tam doğrulanıp boyutuna göre ayrı ayrı düzeltildi.
  (1) **Ticket statüsü**: `StatusBadge.jsx`'in `TK_STATUS`'ü 5 değerden yalnızca
  4'ünü tanıyordu (`iptal_edildi` eksikti, yalnızca `SantiyeSefiDashboard.jsx`
  etkileniyordu) — tek satır eklendi. Ayrıca `TicketDetayModal.jsx`/`TicketListesi.jsx`'in
  birebir aynı yerel `STATUS`/`CATEGORY` hex haritaları (zaten 5/5 doğruydu, saf DRY
  ihlaliydi) yeni `src/utils/ticketStatus.js`'e (`ticketSeverity.js` deseniyle)
  taşındı. (2) **Risk severity**: gerçek bug tek satırdı —
  `ProjectOverviewDashboard.jsx`'teki `RISK_BADGE.orta` `yüksek` ile aynı `amber`
  rengi kullanıyordu, aynı dosyadaki `SEV_BORDER.orta` ise ayrı gri — `RISK_BADGE.orta`
  `'gray'` yapıldı, ikisi artık tutarlı. `Adim4Riskler.jsx`'in dropdown'ı zaten
  renksiz (diğer severity dropdown'larıyla aynı desen), dokunulmadı. (3) **Günlük
  rapor genel durumu**: SQL ile doğrulandı — DB'de yalnızca `normal`/`dikkat`/`kritik`
  var, `DailyReportList.jsx`'in 9 anahtarlı `STATUS_COLORS`'undaki 6 tanesi
  (`İyi`/`Normal`/`Gecikme Var`/`Durduruldu`/`iyi`/`sorunlu`) tamamen ölü kod —
  silindi. `ProjectOverviewDashboard.jsx`'in `periodSpecific` bloğu metin ve renk
  için birbirinden bağımsız iki ayrı ternary kullanıyordu (bugün 3 değerle
  tesadüfen tutarlı, kırılgan) — yeni `StatusBadge.jsx` export'u `DAILY_REPORT_STATUS`
  (normal/dikkat/kritik) artık her ikisinin de tek kaynağı. (4) **Satın alma
  statüsü** (en büyük parça — 6 farklı temsil bulundu): `StatusBadge.jsx`'in
  `PR_STATUS`'ü (bu oturumda zaten 10/10'a tamamlanmıştı) tek kayıpsız kaynak
  olarak seçildi; `TalepDetayModal.jsx` (yerel `STATUS_META`+`Badge`),
  `TabSatinAlmaTalepListesi.jsx`'in `FlowBadge`'i (`satin_alindi`/`fatura_bekliyor`
  ayrımını kaybediyordu), `TedarikKuyrugu.jsx`'in ikili ternary'si (`satin_alindi`
  sonrası 4 durumun tümünü tek etikete topluyordu), `ProjeTabFaturaKesilecekler.jsx`'in
  renksiz ham enum metni — hepsi `PR_STATUS`'a geçirildi. `satinAlma.js`'in
  `normalizeStatus`/`statusLabel`'ı (iş mantığı katmanı — `isAwaitingInvoice`,
  `buildApprovalSteps` vb. buna bağımlı) kasıtlı olarak DOKUNULMADI, kapsam dışı
  tutuldu. **Bilinçli görünür etki:** `TedarikKuyrugu.jsx`'in "Muhasebeye
  yönlendirildi" gibi ekrana özel bağlamsal ifadeleri kanonik etikete (ör. "Satın
  Alındı") döndü — anlam kaybı yok, yalnızca ekrana özel vurgu azaldı. `npx eslint
  src`/`npx vite build` her commit sonrası temiz (26 warning — StatusBadge.jsx'e
  her yeni export eklendiğinde beklenen +1 `react-refresh/only-export-components`
  uyarısı dışında yeni hata yok). Migration/RLS gerekmedi (tamamen salt-okunur
  render katmanı).
- **Orphan Kalite Kontrol RPC/tablo/trigger'ları + kullanılmayan `vw_bom_tracking`
  view'ı silindi (2026-07-20, 1 migration, onaylı):** Kalite Kontrol modülünün
  geri gelmeyeceği netleşince `get_quality_inspections_list`,
  `get_quality_inspection_detail`, `save_quality_inspection`,
  `update_quality_finding_status`, `fn_create_ticket_from_quality_finding`,
  `fn_sync_ticket_status_from_quality_finding` + `quality_inspections`/
  `quality_inspection_findings`/`quality_inspection_photos` (3'ü de 0 satır,
  veri kaybı yok) kalıcı olarak kaldırıldı. `vw_bom_tracking` da aynı migration'da
  silindi — otomatik risk motoru (`fn_recompute_auto_risks`'in "malzeme_fazla_talep"
  kuralı) zaten aynı karşılaştırmayı (istenen vs planlanan miktar) kendi ayrı,
  daha basit sorgusuyla yapıyordu, view'a hiç bağlı değildi; motor DEĞİŞMEDİ,
  yalnızca kullanılmayan view kaldırıldı. `get_advisors` (security+performance)
  migration sonrası yeni uyarı göstermedi.
- **Kullanıcının kendi testinde bulduğu 3 gerçek bug kapatıldı — proje yöneticisi
  tedarik akışı (2026-07-20 akşamı, feature freeze sonrası bug-fix turu):**
  Bugün oluşturulan test verisiyle kullanıcı canlı test ederken bulundu. (1)
  `TedarikKuyrugu.jsx`'in durum filtresi dropdown'ı eski bağlamsal etiketler
  kullanıyordu ("İşlem Bekliyor"/"Muhasebeye Yönlendirildi") — aynı ekrandaki
  satır rozeti ise bu oturumdaki PR_STATUS tekilleştirmesinden beri kanonik
  etiketleri ("Onaylandı"/"Satın Alındı") gösteriyordu, aynı durum için iki
  farklı metin ("iki tane durum" şikayeti). Dropdown artık `PR_STATUS`'un aynı
  etiketlerini kullanıyor. (2) `purchase_requests_select` RLS policy'si
  (`purchase_requests_update`'in aksine) `has_project_access()`/`cross_project`
  modelini hiç kullanmıyordu — yalnızca admin/muhasebe, talebi açan kişi, veya
  `profiles.project_id` birebir eşleşmesiyle izin veriyordu; `proje_yoneticisi`
  (cross_project=true) bu yüzden yalnızca kendi ev projesindeki talepleri
  görebiliyordu, cross_project ile kazandığı diğer projelere erişim SELECT'te
  hiç uygulanmıyordu (1 migration, onaylı — policy `has_project_access(project_id)
  OR requested_by = auth.uid()` olarak yeniden yazıldı). (3) Asıl kullanıcı
  şikayeti: proje yöneticisinin üst-seviye "Satın Alma" sekmesi (`index.jsx`)
  `cross_project=true` olmasına rağmen `ScopeContext`'in çok-projeli
  kullanıcılarda boş döndürdüğü `scopeProjectId` yüzünden `ProjeSecimGerekli`
  ekranına düşüp TEK bir projeye kilitleniyordu (bir kez seçilince session
  boyunca değiştirilemiyordu) — "admin gibi tüm projeleri görme" beklentisiyle
  çelişiyordu. Düzeltme: `TedarikKuyrugu.jsx` artık `projectId` opsiyonel —
  boşken (proje yöneticisi çok projeli modu) filtresiz sorgu çalışıyor (RLS
  zaten erişilebilir projelerle sınırlıyor), yeni bir PROJE kolonu proje adını
  gösteriyor (isimler `ScopeContext`'in zaten `get_my_projects()` RPC'siyle
  yüklediği listeden prop olarak geçiliyor — `projects` tablosuna RAW sorgu
  YAPILMIYOR, çünkü `projects_select` policy'si de aynı eski has_project_access-siz
  modeli kullanıyor, bkz. Bilinen açık noktalar). `index.jsx`'teki
  `ProjeSecimGerekli` zorunluluğu yalnızca `satin-alma` sekmesi için kaldırıldı
  (genel/is-plani sekmelerindeki tekli proje seçimine kasıtlı olarak
  dokunulmadı, ayrı kapsam). Realtime de aggregate moda uyarlandı:
  `ProjeTabSatinAlma`'nın `useRealtimeRefresh`'i artık `projectId` boşken
  filtresiz (RLS zaten sınırlıyor) dinliyor ve `refreshKey`'i `TedarikKuyrugu`'ya
  da iletiyor (önceden yalnızca `TabSatinAlmaTalepListesi`/`TabSatinAlmaOnayKuyrugu`
  alıyordu) — iki kullanıcı aynı anda çalışırken proje yöneticisinin ekranı artık
  diğer kullanıcıların onay/tedarik işlemlerini otomatik yansıtıyor.

  **Ek tur — kullanıcının "akış tam uygulanmıyor" uyarısı üzerine tam uçtan uca
  doğrulama (2026-07-20, aynı akşam):** Gerçek bir test talebi (`create_purchase_request_with_items`
  RPC, BOM'a bağlı Malzeme kalemi, planlanandan fazla miktar) oluşturulup 6 adımın
  (talep→yönetici onayı→BOM aşım otomatik `planned_qty` güncellemesi→proje yöneticisi
  tedarik girişi→muhasebe fatura oluşturma→2 adımlı fatura onayı→`cost_allocations`)
  HER birinde gerçek write yapılıp SQL ile doğrulandı — trigger zincirinde hiçbir bug
  yok. Ama bu turda **kritik bir erişim açığı** bulundu: muhasebe `navigation.js`'te
  hiç `satin-alma` sekmesine sahip değildi, Finans'taki tek fatura ekleme yolu
  (`FaturaEkleModal`) `purchase_request_id` set etmiyordu — muhasebe bir talebe BAĞLI
  fatura hiç kesemiyordu (bkz. Sistem mimarisi → "Satın alma akışı" için tam detay).
  Düzeltildi: `navigation.js`'e `muhasebe.tabs`/`sidebarItems`'a `satin-alma` eklendi.
  Ayrıca kullanıcının "fatura bekliyor/fatura onay bekliyor farklı yazılıyor, kafa
  karıştırıyor" uyarısı üzerine `fatura_bekliyor`'un pratikte hiç üretilmediği
  doğrulandı, iki durumun (`fatura_bekliyor`/`fatura_onay_bekliyor`) etiketi
  `StatusBadge.jsx` + `satinAlma.js`'te "Fatura Bekleniyor" olarak eşitlendi. Ayrı
  olarak `onaylandi` durumunun etiketi de "Onaylandı"dan "Proje Yöneticisinde"ye
  çevrildi (aynı gün, daha önceki bir alt-turda) — kullanıcı talebin şu an kimin
  elinde olduğunu görmek istedi, "geçmiş" değil "şu anki adım" anlatan bir etiket
  istendi; tone `success`'ten `warning`'e çekildi. Hizmet/Diğer tipi taleplerde BOM
  kontrolünün hiç uygulanmadığı da kod okumasıyla doğrulandı (`YeniTalepModal.jsx`
  yalnızca Malzeme kategorisinde `bom_item_id` set ediyor, `fn_apply_approved_material_excess`
  yalnızca dolu `bom_item_id`'li kalemler üzerinde döngüye giriyor — yapısal garanti,
  ayrı bir kod yolu gerekmiyor). Tüm test verisi (11 purchase_request, 3 invoice +
  approvals + cost_allocations, 4 ticket, 4 risk, 2 procurement_item_change_request —
  biri 2026-07-18'den kalma temizlenmemiş bir Playwright kalıntısıymış, o da bu turda
  temizlendi) silindi, `procurement_items.planned_qty` test öncesi değerine
  (10400.25) geri alındı. `PROCUREMENT_CHANGE_STATUS.onaylandi` (farklı domain —
  BOM miktar değişikliği onayı, gerçekten bitmiş bir durum) ve `INVOICE_STATUS.onaylandı`
  (fatura onayı, farklı tablo) kasıtlı olarak "Onaylandı" kaldı, dokunulmadı.
  `get_advisors` yeni uyarı göstermedi, `npx eslint src`/`npx vite build` temiz.

## Bilinen açık noktalar / ertelenmiş kararlar
- **Onaylanmış fatura iptali tutarsızlığı kapatıldı (2026-07-21):** Menü ve
  proje modunda onaylı faturayı yalnız admin iptal eder. İptalde fatura
  `reddedildi` olur, maliyet kaydı geri alınır ve muhasebeye düşer. Yalnız
  muhasebe düzenleyip yeniden gönderir veya siler; silmede bağlı satın alma
  `satin_alindi` (fatura bekleyen) durumuna ve `invoice_id=null` haline döner,
  yeni fatura olmadan tamamlanamaz. Migration:
  `unify_admin_invoice_cancel_accounting_recovery`; DB/iş akışı + gerçek
  yönetici/muhasebe ekran kabulü dahil tam regresyon 50/50 PASS.
- **Proje Excel export şablon tutarsızlığı kapatıldı (2026-07-21):**
  `export-project-excel` v12, statik şablondaki Bütçe G:K "Kategori Rehberi" ve
  "Bütçe Özeti (Otomatik)" panelini kategori `SUMIF`, genel toplam ve kalem sayısı
  formülleriyle üretiyor. Kategori Ağırlıkları `TOPLAM` satırı/formülü artık
  projenin gerçek ağırlık satırı sayısına göre dinamik. Formüllere cached sonuç
  eklendiği için Excel dışındaki XLSX okuyucuları da hücreleri görüyor. Canlı
  indirilen XLSX düzen testi + mevcut malzeme onay/export regresyonu 4/4 PASS.
- **`projects` tablosunun SELECT RLS boşluğu kapatıldı (2026-07-22):**
  `projects_select`, rol kurallarını elle
  tekrar etmek yerine kanonik `has_project_access(id)` helper'ını kullanacak.
  Böylece `cross_project=true` roller (`proje_yoneticisi`, `lojistik_tedarik`)
  raw `.from('projects')` sorgusunda tüm proje kapsamını görebilecek; atanmış
  proje ve `user_project_access` izolasyonu olan saha rolleri yalnız kendi
  kapsamını görmeye devam edecek. Migration:
  `align_projects_select_with_canonical_scope`; regresyon testi
  `procurement-security.spec.js` içinde hem cross-project görünürlüğünü hem
  şantiye şefinin yabancı proje izolasyonunu kapsıyor. Migration canlıya
  uygulandı; satın alma güvenlik paketi kategori ağırlığı testleriyle birlikte
  toplam 8/8 geçti.
- **Genel (rol-kilitli) Satın Alma/Finans sayfaları ile `ProjeTab*` arasındaki
  kod tekrarı büyük ölçüde giderildi (2026-07-18):** `FaturaListesi`↔
  `ProjeTabFaturaListesi`, `OnayKuyrugu`↔`ProjeTabOnayKuyrugu`, `TalepListesi`
  (`TabSatinAlmaTalepListesi`)↔`ProjeTabTalepListesi` (+ onay kuyruğu
  sarmalayıcıları `TabSatinAlmaOnayKuyrugu`↔`ProjeTabSaOnayKuyrugu`) tek
  bileşende birleştirildi — proje kopyaları silindi, kanonik bileşen artık
  opsiyonel `projectId`/`filterDate` (+ `TalepListesi` için `siteChiefView`)
  prop'u alıyor: prop yoksa menü (tüm projeler) davranışı, doluysa proje
  davranışı, birebir korunarak. Bu görev öncesinde CLAUDE.md'de listelenen
  **5 çiftten 2'sinin aslında kopya olmadığı** ortaya çıktı — düzeltildi:
  `MaliyetOzetTable`/`ProjeTabMaliyetTablosu` kasıtlı olarak farklı iki
  bileşen (özet vs. filtre+export'lu detaylı görünüm, ikisi de her iki ekranda
  kullanılıyor), `ProjeTabFaturaKesilecekler.jsx` (Malzeme Listesi/BOM onay
  akışı) menü seviyesinde hiç karşılığı yok — BOM projeye özgü bir kavram,
  tasarım gereği yalnızca proje kapsamlı. İkisi de birleştirilmedi/birleştirilmeyecek.
  Eski 5 fazlı teknik plan dosyası (`C:\Users\fonss\Claude\Projects\Fons Solar\satin-alma-finans-birlestirme-cc-prompt.md`)
  artık tarihsel referans, güncel değil.
- **Rol/izin matrisi DB-tabanlı hale getirildi, roller 4'e indirildi (2026-07-22/23'te
  kapandı, yukarı bkz. Roller bölümü)** — önceki `src/config/navigation.js`
  (hardcoded `NAVIGATION[role]`) tamamen kaldırıldı, `roles` tablosundaki
  `allowed_tabs`/`default_tab`/`sidebar_items` kolonlarından okunuyor.
  (`mechanical_checklist`/`electrical_checklist` tabloları — eski 19-rol
  döneminden kalma mekanik/elektrik checklist'ler — DB'den tamamen kaldırıldı.)
- **Genel Proje kartlarındaki personel/makine sayıları ile dönem export'u
  farklı kaynaklardan besleniyor — DOĞRULANDI, kasıtlı (2026-07-18):**
  `ProjectOverviewDashboard.jsx` `get_project_by_date`'in `personnel`/`machinery`
  node'larından besleniyor — bu RPC seçili tarihe kadarki **en son TEK günlük
  raporun** (`ORDER BY report_date DESC LIMIT 1`) personel/makine kayıtlarını
  döner, yani "o tarih itibarıyla anlık durum". `ProjeDetay.jsx`'teki
  `buildPeriodReportData`/`exportSelectedDailyReportExcel`/`exportSelectedDailyReportPDF`
  ise seçilen tarih aralığındaki/raporundaki `personnel_log_entries`/
  `machinery_logs` satırlarını toplar — "dönem toplamı" ya da "o rapora özel".
  İki farklı metrik, iki farklı amaç (anlık durum vs kümülatif rapor), bug
  DEĞİL — madde kapandı.
- **`profiles.role` / `profiles.role_key` iki ayrı kolon — ARTIK GEÇERSİZ
  (2026-07-18'de doğrulandı):** `profiles` tablosunda `role` kolonu hiç yok
  (bir noktada kaldırılmış), yalnızca `role_key` var; frontend zaten tutarlı
  şekilde yalnızca `role_key` okuyor/yazıyor (`TabKullanicilar.jsx` dahil).
  Eski FAZ1 denetim notu artık tarihsel, madde kapandı.
- **Realtime ölçek notu:** P0 tablolarında `REPLICA IDENTITY FULL` var (DELETE/UPDATE
  RLS'i için gerekliydi). Supabase üretim ölçeğinde Broadcast-from-database'e
  geçişi öneriyor — bu projenin ölçeğinde (2 test projesi) şimdilik gerekmiyor,
  ileride gündeme gelirse bu kararı birlikte gözden geçir.
- **Proje sihirbazı kategori ağırlıkları arayüzü tamamlandı (2026-07-22):**
  Yeni proje ve proje düzenleme akışlarında İş Kalemleri'nin
  hemen ardından “Kategori Ağırlıkları” adımı var. Yeni projede görev
  kategorilerine eşit ve toplamı tam %100 olan başlangıç dağılımı hazırlanıyor;
  düzenlemede mevcut `project_category_weights` satırları yükleniyor. Frontend
  0–100 aralığını ve toplam %100 kuralını doğruluyor. Yetki kontrollü
  `save_project_category_weights` RPC'si tüm dağılımı tek transaction'da
  değiştiriyor, DB constraint'i ara durumda bozulmuyor ve proje ilerlemesini
  yeniden hesaplıyor. RPC yalnız admin/proje_yoneticisi + proje erişimiyle
  çalışıyor; PUBLIC/anon EXECUTE kapalı. Migration canlıya uygulandı. Geçersiz
  toplamın atomik reddi, saha rolünün yetkisizliği ve geçerli dağılımın kaydı
  3/3; projects RLS/satın alma güvenlik paketiyle birlikte toplam 8/8 geçti.
  Security/performance advisor taramasında bu değişiklikten kaynaklanan yeni
  tablo/index uyarısı yok; RPC, kasıtlı ve iç rol/proje kontrolleri olan
  authenticated SECURITY DEFINER uç noktası olduğu için advisor'ın genel
  SECURITY DEFINER uyarı listesinde görünür.
- **Proje sihirbazı tedarik/teslimat adımı Faz 1'e sadeleştirildi (2026-07-22):**
  Bu süreç sistem dışında ve yalnızca `proje_yoneticisi` sorumluluğunda
  ilerler. `Adim5Tedarik.jsx` artık ayrıntılı kalem formu göstermez; proje
  yöneticisi sadece **"Tamamladım"** onayı verir. Onay `projects` tablosundaki
  `procurement_completed`, `procurement_completed_at`, `procurement_completed_by`
  alanlarına, rol ve proje erişimi kontrol edilen
  `set_project_procurement_completed` RPC'siyle yazılır. Admin ve diğer roller
  onay veremez. Tedarikçi, sipariş tarihi, beklenen/gerçek teslimat tarihi,
  ayrıntılı durum, açıklama/not, eksik ve hasarlı teslimat takibi **Faz 2**
  kapsamına taşındı. Eski `procurement_items` kolonları geriye dönük
  uyumluluk için korunur ancak bu sihirbaz adımı artık onları okumaz/yazmaz.
  Aynı durum `ProjeDetay → Genel Proje` ekranındaki Proje Detayları kartında
  herkese salt-okunur görünür; henüz tamamlanmadıysa yalnızca
  `proje_yoneticisi` burada **"Tamamladım"** butonunu görür ve onay verebilir.

---

## Son değişiklik

**23.07.2026 — Rol/izin matrisi DB-tabanlı hale getirildi, hardcoded `navigation.js`
kaldırıldı.** Bu iş sırasında beklenmedik bir bulgu çıktı: `roles` tablosu
2026-07-22'de (`prune_roles_to_active_four` migration'ı, önceden CLAUDE.md'ye
hiç yansımamıştı) zaten 19 rolden 4'e (`admin`, `muhasebe`, `proje_yoneticisi`,
`santiye_sefi`) indirilmişti — `profiles.role_key`'in `roles(key)`'e FK'si
olduğu için diğer 15 rol artık hiçbir profile atanamıyor. Buna göre kapsam
yalnızca bu 4 rolle sınırlandırıldı (kullanıcı onayıyla).

Migration `add_role_navigation_matrix`: `roles` tablosuna `allowed_tabs text[]`
(NULL = kısıtsız), `default_tab text`, `sidebar_items text[]` kolonları eklendi,
4 rol için eski `navigation.js` değerleriyle birebir aynı veri backfill edildi
(davranış değişikliği yok). `roles` zaten `authenticated`'a tam okunabilir
olduğundan yeni bir RPC gerekmedi. `AuthContext.jsx` artık `get_my_role()`'den
sonra `roles` satırını çekip context'e `navigation`/`roleLabel`/`isManager`
ekliyor; `Sidebar.jsx`/`index.jsx`/`TabBildirimler.jsx` bunları `useAuth()`'tan
okuyor. `src/config/navigation.js` (hardcoded `NAVIGATION`/`FIELD_SPECIALIST_ROLES`/
`MANAGER_ROLES`/`ROLE_LABEL`) tamamen silindi; `index.jsx`'teki artık
ulaşılamaz `FIELD_SPECIALIST_ROLES` render dalı da kaldırıldı. `npx eslint src`
0 hata, `npx vite build` temiz, tam Playwright paketi (`procurement-role-acceptance.spec.js`
dahil) 60/60 geçti. CLAUDE.md'nin "Roller" bölümü de bu turda 19-rol
anlatısından 4-rol güncel duruma indirgendi (155→52 satır).

## Önceki değişiklik

**21.07.2026 (üçüncü tur — bir önceki oturumun kaydı kaybolduktan sonra durum
tespiti + working tree'de yarım kalan bir dördüncü tur bulunup tamamlandı,
commit edildi. Henüz push edilmedi.** Oturum başında `git status` ile 10
commit'in origin'e push edilmemiş olduğu + working tree'de committed olmayan,
CLAUDE.md'nin bu noktaya kadar hiç bahsetmediği ek bir iş bulundu (muhtemelen
chat kesildiğinde yarım kalan kısım tam olarak buydu). DB tarafına bakılınca bu
işin aslında tamamlanmış olduğu ortaya çıktı — 2 migration zaten uygulanmıştı
(`harden_purchase_invoice_workflow_v2`, `fix_workflow_notification_event_types`),
yalnızca frontend commit'i eksikti. Doğrulama: `npx eslint src` (0 hata, 25
pre-existing warning), `npx vite build` temiz, yeni `tests/procurement-workflow.spec.js`
2/2 PASS, `tests/faz-e.spec.js` test A bilinen önceden var olan hata (regresyon
değil) dışında sorunsuz. Bulunanlar 4 ayrı commit'e bölündü:

1. **"Diğer" kategorisi tam üçüncü talep tipi oldu** — önceden yalnızca
   Malzeme/Hizmet ayrımı vardı, `category='diger'` DB'de var olmasına rağmen
   frontend onu hiç tanımıyordu (`requestType()`/`riskState()` hep hizmete
   düşürüyordu). `YeniTalepModal.jsx`, `satinAlma.js`, `TabSatinAlmaTalepListesi.jsx`,
   `TalepDetayModal.jsx`, `FaturaOlusturModal.jsx` (+ `iscilik`→`hizmet` yazım
   düzeltmesi) güncellendi (bkz. Sistem mimarisi → "Satın alma akışı").
2. **Proje yöneticisi Tedarik Kuyruğu'ndan doğrudan yeni talep açabiliyor +
   bu sekme artık her zaman tüm-projeler modunda** — `TedarikKuyrugu.jsx`'e
   "+ Yeni Satın Alma Talebi" butonu, varsayılan filtre `onaylandi`, başlık
   "Onay Kuyruğu"; `index.jsx`'teki üst-seviye Satın Alma artık proje
   yöneticisi için koşulsuz `projectId=null` (agregat), tekli proje seçimine
   hiç düşmüyor (bkz. Sistem mimarisi → "Satın alma akışı").
3. **Reddedilen fatura silinmek zorunda değil — düzenlenip yeniden onaya
   gönderilebiliyor** — yeni RPC'ler `resubmit_rejected_invoice`/
   `delete_rejected_invoice` (DB'de zaten vardı, REVOKE'lı), `FaturaDetayModal`'a
   "Düzenle ve Yeniden Gönder"/"Faturayı Sil" eklendi (bkz. Sistem mimarisi →
   "Satın alma akışı"). Son karar: onaylı faturayı yalnız yönetici iptal eder;
   iptal edilen faturayı yalnız muhasebe düzenleyip yeniden gönderir veya siler.
   Menü/proje modu aynı kurala bağlandı. Yönetici global Finans ekranından
   iptal, muhasebe iptal edilen faturada düzenle/yeniden gönder/sil seçenekleri
   gerçek tarayıcıda doğrulandı; tam regresyon 50/50 test geçti.
4. **Proje-özel Finans rol bazlı sadeleştirildi** — proje yöneticisi ve diğer
   roller için yalnızca "Genel" görünüm kalır; admin için proje bağlamındaki
   Faturalar/Onay Kuyruğu/Maliyet Tablosu geri getirildi. Admin ve proje yöneticisi
   ayrımı gerçek tarayıcıda 2/2 PASS.

Ayrıca working tree'de duran, CLAUDE.md'nin zaten "yapıldı" dediği ama hiç
commit edilmemiş 3 parça da bu turda commit'lendi (kod değişikliği yok, yalnızca
gecikmiş commit): navigasyondan proje_yöneticisi için `finans`/`is-plani`
sekmelerinin çıkarılması, genel ticket checkbox'ı, kullanıcı/proje oluşturma
yetkisi genişletmesi (Kullanıcılar + Proje Yönetimi) — üçü de bir önceki
"ikinci tur" özetinde zaten anlatılmıştı, bkz. aşağı.

**SEN kabul testi bekleniyor (bu tur + ikinci tur, ikisi de aynı anda push
edilmemiş durumda):** aşağıdaki "ikinci tur" maddesinin kabul testi listesine
ek olarak — muhasebe/proje_yöneticisi hesabıyla "Diğer" kategorisiyle talep
açma, proje yöneticisi hesabıyla Tedarik Kuyruğu'ndan "+ Yeni Satın Alma
Talebi" ile talep açma, reddedilen bir faturayı düzenleyip yeniden gönderme +
ayrı birini silme, üst-seviye Finans'ın proje-özel Finans'ın yerini gerçekten
tuttuğunu doğrula.

**Sıradaki adım:** Kabul testi geçerse bu turun + ikinci turun + ilk turun
(toplam 3 tur, hepsi aynı gün) tüm commit'lerinin push'u birlikte yapılacak,
sonra go-live hazırlıklarına (A8 — bkz. `cc-master-uygulama-plani.md`) devam
edilecek.

---

**21.07.2026 (ikinci tur, aynı gün) — Şantiye şefi + proje yöneticisi rolleri
kullanıcının kendi anlattığı davranış tarifine göre uçtan uca denetlendi (5
paralel Explore ajanı + DB/edge function okuması), bulunan gerçek bug'lar
düzeltildi. Henüz commit/push edilmedi.** Kullanıcı iki rolün tam olması
gereken davranışını tarif etti (şantiye şefi: yalnızca kendi projesi, genel+
proje-özel ticket, günlük rapor, foto yükleme; proje yöneticisi: tüm
projeler, seçtiği proje için talep, malzeme listesinde miktar/yeni malzeme
ekleme, kullanıcı oluşturma, proje şablonuyla proje ekleme, tedarik→muhasebe
yönlendirme) ve "Supabase'deki her şeyi kontrol et, düzelt" dedi.

**Bulunan ve düzeltilen gerçek bug'lar (3 migration + 1 ek REVOKE migration'ı
+ 2 edge function deploy + 6 frontend dosyası, hepsi onaylandıktan sonra
uygulandı):**

1. **`tickets_insert` RLS'i hiç proje/kullanıcı doğrulamıyordu** (yalnızca
   `auth.uid() IS NOT NULL`) — `created_by = auth.uid() AND has_project_access(project_id)`
   olarak sıkılaştırıldı (bkz. Sistem mimarisi → "Ticket oluşturma").
2. **`create_purchase_request_with_items` RPC'si `p_project_id`/`p_requested_by`'ı
   hiç doğrulamıyordu** — `SECURITY DEFINER` olduğu için RLS'i tamamen bypass
   ediyordu, yalnızca UI kilitliyordu. Fonksiyona `has_project_access(p_project_id)`
   + `p_requested_by = auth.uid()` kontrolü eklendi.
3. **Şantiye şefi (ve tüm tek-proje rolleri) UI'dan gerçek bir "genel" ticket
   hiç açamıyordu** — `YeniTicketModal.jsx`'te proje seçici sabit-projeli
   roller için hiç render edilmiyordu. Yeni "Genel ticket olarak aç" checkbox'ı
   eklendi (bkz. Sistem mimarisi → "Ticket oluşturma").
4. **"Yeni Malzeme Ekle" akışı hiçbir zaman çalışmıyordu** — buton aslında
   BOM'a hiç bağlanmayan bir satın alma talebi açıyordu (onaylansa/faturalansa
   bile Malzeme Listesi'nde yeni kalem hiç görünmüyordu). Gerçek bir akış
   kuruldu: yeni RPC `create_procurement_item_add_request` + `procurement_item_change_requests`
   şemasına `new_equipment`/`new_unit`/`new_category` + `review_procurement_item_change_request`
   NULL-id dalında gerçek `INSERT` yapacak şekilde genişletildi (bkz. Sistem
   mimarisi → "Malzeme listesi (BOM) — ÜÇ AYRI mekanizma", mekanizma 3).
5. **Aynı ekranda ayrı bir görüntüleme bug'ı:** Bekleyen Değişiklikler paneli
   var olmayan bir alanı (`item.procurement_items?.equipment`) okuyup her
   zaman jenerik "Malzeme: X→Y" gösteriyordu — düzeltildi, gerçek malzeme adı
   artık görünüyor.
6. **`get_advisors` ile bağımsız bulunan bir gap:** `create_procurement_item_change_request`/
   `review_procurement_item_change_request` (2026-07-17'den beri) hiç
   `REVOKE ... FROM PUBLIC, anon` almamıştı — `anon` (oturumsuz) rol bile bu
   hassas yazma RPC'lerini çağırabiliyordu. Kapatıldı.
7. **Kullanıcı bu turda "proje yöneticisi kullanıcı oluşturabilsin, proje
   şablonuyla proje ekleyebilsin" isteğini netleştirdi** — bu, önceki turda
   (aynı gün, ilk tur) Kullanıcılar/Proje Yönetimi'ne uygulanan "tamamen
   salt-okunur" kararını KISMEN geçersiz kıldı: `TabKullanicilar.jsx`'te
   "+ Kullanıcı Ekle" ve `TabProjeYonetimi.jsx`'te "Yeni Proje"/Excel import/
   "Manuel doldur" artık `isAdmin || role==='proje_yoneticisi'`; Düzenle/Şifre/
   Sil ve Düzenle/Excel export/Sil hâlâ `isAdmin`-only. Sunucu tarafı da
   uyumlu hâle getirildi: `create-user` edge function'ı önceden sertçe
   `role_key!=='admin'` reddediyordu (frontend'i açsam bile proje_yoneticisi
   hiç kullanıcı oluşturamazdı) — artık admin+proje_yoneticisi kabul ediyor,
   ama `role_key==='admin'` atamasını hâlâ yalnızca admin'e kilitliyor (yetki
   yükseltme koruması). **`import-project-excel`'de ise tam tersi bir bulgu
   çıktı:** yeni proje oluşturma dalında (`isNewProject`) hiçbir rol kontrolü
   yoktu — herhangi bir authenticated kullanıcı (santiye_sefi dahil) API
   üzerinden yeni proje oluşturabiliyordu; admin+proje_yoneticisi'ye kilitlendi.

**Denetlenip "zaten doğru" bulunan alanlar (değişiklik yapılmadı):** santiye
şefi'nin dashboard/satın alma/ticket kapsamı (`get_project_scope`,
`get_santiye_dashboard`, `get_purchase_requests_list`, `purchase_requests_select`/
`_update`, `tickets_select`), foto yükleme storage policy'leri
(`daily_report_photos`/`ticket_attachments` — path'te `project_id`, `has_project_access`
ile gate'li), proje yöneticisi'nin satın alma/tedarik akışı (`TedarikKuyrugu.jsx`,
`purchase_requests_insert`, birleşik `purchase_requests_update`, "satin-alma"
sekmesinin çoklu-proje serbest modu) — dünkü `get_project_scope` cross_project
düzeltmesinin gerçekten işe yaradığı doğrulandı.

**Ayrıca denetlenip düşük öncelikli/ertelenmiş bulundu:** proje şablonu Excel
export'unun statik indirilebilir şablonla görsel tutarsızlığı (Bütçe Özeti
paneli export'ta yok, Kategori Ağırlıkları TOPLAM formülü sabit aralığa
yazılıyor) — veri kaybı değil, düzeltilmedi (bkz. Bilinen açık noktalar).

`npx eslint src` (0 hata, 25 pre-existing warning, sıfır yeni) ve `npx vite
build` temiz. Her migration sonrası `get_advisors`(security) kontrol edildi,
son taramada yeni uyarı yok (yalnızca kabul edilmiş, önceden var olan
uyarılar + bu turda zaten REVOKE ile kapatılan 2 fonksiyon kalıcı olarak
listeden düştü).

**SEN kabul testi bekleniyor** (headless ortamda yapılamadı): santiye_sefi
hesabıyla — genel ticket açma (yeni checkbox), kendi proje dışına talep/ticket
sızmadığını; proje_yoneticisi hesabıyla — Malzeme Listesi'nde "+ Yeni Malzeme"
ile gerçekten yeni bir kalem eklenip admin onayından sonra listede göründüğünü,
Kullanıcılar'da "+ Kullanıcı Ekle"nin çalıştığını (admin rolü seçeneğinin
listede olmadığını), Proje Yönetimi'nde "Yeni Proje" ile Excel import'un
çalıştığını (Düzenle/Excel/Sil'in hâlâ görünmediğini) doğrula. Admin/muhasebe
hesaplarıyla regresyon: önceki davranış birebir aynı kalmalı.

**Sıradaki adım:** Kabul testi geçerse bu turun + bugünkü ilk turun (proje
yöneticisi sayfa görünürlüğü + `get_project_scope` cross_project düzeltmesi)
tüm commit'lerinin push'u birlikte yapılacak, sonra go-live hazırlıklarına
(A8 — bkz. `cc-master-uygulama-plani.md`) devam edilecek.

### 21 Temmuz 2026 — Satın alma faturası yarış testleri

- Kullanıcı kararıyla satın alma faturasında PDF/JPG belge yükleme özelliği
  kaldırıldı; `invoice_document_url` zorunlu değildir. Fatura yalnız form
  alanlarıyla oluşturulur.
- `disable_purchase_invoice_document_storage` migration'ı ile belge Storage
  politikaları ve DB belge zorunluluğu kaldırıldı. Boş `fatura-belgeleri`
  bucket'ı da Storage'ın korumalı silme ayarı yalnız transaction kapsamında
  açılarak kaldırıldı; son doğrulamada bucket sayısı 0.
- E2E fatura fixture'ları yeniden belgesiz akışı kullanıyor. Çift fatura,
  çakışan admin kararı, çakışan PM kararı ve çakışan fatura kararı kapsandı.
- Satın alma/rol/RLS/bildirim/malzeme regresyon paketi: **36/36 geçti**.
  Üretim derlemesi ve Graphify güncellemesi başarılı. Advisor taramasında bu
  migration kaynaklı yeni uyarı yok; önceden mevcut genel uyarılar devam ediyor.
- `procurement-role-acceptance.spec.js` ile gerçek tarayıcıda dört rol kabulü
  eklendi: şantiye şefinde bağlı proje seçili/kilitli, proje yöneticisinde tüm
  projeler arasından zorunlu seçim, yöneticide satın alma ve finans onayları,
  muhasebede yalnız Faturalar görünümü ve belge alanının yokluğu. **4/4 geçti**.

### 21 Temmuz 2026 — Güvenlik testi bildirim temizliği

- Canlı veritabanında önceki güvenlik testlerinden kalan toplam 21 yetim
  `E2E_SECURITY_` bildirimi ve başarısız doğrulamanın bıraktığı tek test talebi
  kontrollü SQL ile temizlendi; son kontrolde bildirim ve talep sayıları **0/0**.
- Kök neden, `notifications` tablosunda DELETE RLS politikasının bulunmamasıydı;
  istemci silme çağrıları hata vermeden sıfır satır etkiliyordu.
- `allow_users_to_delete_own_notifications` migration'ı ile authenticated
  kullanıcıların yalnızca `recipient_id = auth.uid()` olan kendi bildirimlerini
  silebilmesi sağlandı. Başka kullanıcıların bildirimleri erişilebilir değildir.
- `procurement-security.spec.js` temizliği admin, muhasebe, şantiye şefi ve proje
  yöneticisi istemcilerinin kendi test bildirimlerini, bağlı test kayıtları
  silinmeden önce kaldıracağı şekilde güncellendi. Tam güvenlik paketi **4/4 geçti**;
  ardından canlı artık kontrolü tekrar **0 bildirim / 0 talep / 0 fatura** verdi.
- Migration sonrası Supabase security/performance advisor taramasında bu değişiklikten
  kaynaklanan yeni bir uyarı bulunmadı; önceden bilinen genel uyarılar devam ediyor.
