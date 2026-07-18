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
- `ProjeDetay.jsx`'in sekmeleri: Genel Proje, İş Planı, Satın Alma, Finans,
  Ticket, Raporlar, Ekip (ayrı bir "Proje Paneli" sekmesi YOK — 2026-07-16'da
  kısaca eklenip aynı oturumda kullanıcı kararıyla geri alındı, bkz. Tamamlanan
  büyük görevler). `ProjeDetay.jsx` kendi seviyesinde artık bir
  `DataStatusBanner`/`RealtimeStatusIndicator` RENDER ETMİYOR (2026-07-17'de
  kaldırıldı — her sekme zaten kendi RPC'sine bağlı kendi banner/indicator'ını
  gösteriyordu, üstte ikinci bir tane sadece tekrar/kayma yaratıyordu; hook
  çağrıları — `refetch` tetiklemesi için — kaldı, yalnızca render silindi).
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
  Riskli/Geciken. Kritik yol CSS/JS kalıntıları temizlendi.
### Satın alma akışı — proje yöneticisi tedarik adımı
Durum zinciri: `talep_olusturuldu → fiyat_girildi → onay_bekliyor → onaylandi
→ satin_alindi → fatura_bekliyor/fatura_onay_bekliyor → faturasi_kesildi`
(+ `reddedildi`/`iptal`). `onaylandi` ile fatura arasına **zorunlu** bir
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

### Malzeme listesi (BOM) planlanan miktar değişiklikleri — İKİ AYRI mekanizma
`procurement_items.planned_qty` iki farklı, birbirinden bağımsız yoldan değişebilir —
ikisini karıştırma:

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

Teoride ikisi aynı anda tetiklenebilir (bir kalem için hem bekleyen bir manuel talep hem
otomatik aşım aynı anda olabilir) — bu durumda manuel talebin `old_planned_qty` anlık görüntüsü
onay anına kadar geçerliliğini yitirmiş olabilir, ama bu nadir bir yarış durumu, ayrıca
kilitlenmedi.

### Roller (19, `roles` tablosunda tanımlı — `select key, display_name, is_manager, cross_project from roles`)
admin, koordinator, proje_koordinatoru, muhendis, proje_tasarim_sorumlusu,
santiye_sefi, proje_kurulum_sefi, elektrik_sefi, mekanik_sef, isg_sorumlusu,
kalite_kontrol_sefi, lojistik_tedarik, proje_yoneticisi, enh_sorumlusu,
operasyon_sorumlusu, evrak_takip, maliyet_kontrolcu, muhasebe, is_makinesi_operator

`is_manager=true`: admin, koordinator, proje_koordinatoru, maliyet_kontrolcu,
muhasebe (tüm yönetici bildirimlerini alır, `has_project_access` her projeye
izin verir). `cross_project=true`: lojistik_tedarik, **proje_yoneticisi**
(2026-07-17'de `false`'tan `true`'ya çevrildi — kullanıcı proje yöneticisinin
admin gibi tüm projeleri görebilmesini istedi; `lojistik_tedarik` ile aynı
mekanizma: manager değil ama tek projeye kilitli değil). `proje_yoneticisi`
(2026-07-16'da `satin_alma_uzmani` rolünün yerine geçti) hâlâ bir "ev projesi"ne
(`profiles.project_id`) atanabilir ama bu artık yalnızca kozmetik/varsayılan —
`has_project_access` zaten `cross_project=true` ile her projeye izin veriyor.
Frontend tarafı (`index.jsx`, 2026-07-17 içinde iki aşamada değişti — önce
benim tek satırlık `scopeProjectId` bağlantım, sonra kullanıcının kendi
genişletmesi): `ROLE_TABS.proje_yoneticisi` artık `['genel', 'projeler',
'is-plani', 'satin-alma', 'bildirimler']` (eskiden yalnızca
`['satin-alma','bildirimler']`) — bu rol artık admin gibi **Projeler**
sekmesinden proje listesini gezip bir projeye tıklayınca o projenin tam
`ProjeDetay` görünümüne (kendi iç sekmeleri: Genel/İş Planı/Satın Alma/
Finans/Ticket/Raporlar/Ekip) girebiliyor. Üst seviyede `finans`/`tickets`
sekmeleri bu rol için hâlâ kapalı (`role !== 'proje_yoneticisi'` guard'ı) —
yalnızca `ProjeDetay` içinden, tek bir proje bağlamında erişilebiliyorlar.
`genel`/`is-plani`/`satin-alma` üst-seviye sekmeleri `scopeProjectId`
(`ScopeContext`) kullanıyor; header'daki global proje seçici `<select>`
(`showAllOption`/`scopeProjects`/`setScopeProjectId`) kullanıcı tarafından
kasıtlı olarak kaldırıldı (bkz. Genel Proje bölümündeki not). **Bug + düzeltme
(2026-07-17, aynı gün):** header seçicisi kalkınca çok projeli bir
`proje_yoneticisi` (artık `cross_project=true`) için bu üç sekmede
`scopeProjectId` hiç set edilemiyordu (tek projeli kullanıcıda `ScopeContext`
otomatik çözüyordu, ama proje_yoneticisi artık 3+ projeye erişebiliyor) —
ekran sonsuza kadar "Yükleniyor…" durumunda kalıyordu, Playwright ile canlı
tespit edildi. İlk düzeltme denemesi `useScope()`'tan var olmayan bir
`setScopeProjectId` çağırdığı için `onSelect is not a function` hatası verdi —
kullanıcının `ScopeContext.jsx` sadeleştirmesi (header seçicisi kalkınca)
`setScopeProjectId`/`showAllOption`'ı TAMAMEN kaldırmış, `scopeProjectId`
artık `projects.length === 1 ? projects[0].id : null` şeklinde sabit türetilen,
override edilemeyen bir değer. Kesin düzeltme: ortak `ScopeContext`'e hiç
dokunulmadan, `index.jsx` içinde yalnızca `role === 'proje_yoneticisi'` için
yerel bir state (`pySelectedProjectId`/`setPySelectedProjectId`) eklendi;
`scopeProjectId` bu rol için `contextScopeProjectId || pySelectedProjectId`
olarak hesaplanıyor. `ProjeSecimGerekli` bileşeni (`scopeProjectId` boş ve
birden fazla proje varsa devreye girer — Projeler sekmesi DEĞİL, o zaten kendi
listesini gösteriyordu) bu yerel state'i `onSelect` ile dolduruyor. Diğer
rollerin (admin/manager) `scopeProjectId=null` = "Tüm Projeler" davranışına
DOKUNULMADI. Playwright ile 2. denemede tam PASS doğrulandı (konsol hatası yok,
proje seçimi → Genel/İş Planı/Satın Alma verisi doğru yükleniyor).

**Bilinen fark:** Frontend hâlâ yalnızca 6 rolü tanıyor (`ROLE_TABS`/`ROLE_LABEL`
`src/pages/dashboard/index.jsx`, nav `Sidebar.jsx`) — admin, muhasebe,
santiye_sefi, muhendis, koordinator, proje_yoneticisi. Diğer 13 rolle giren
bir kullanıcı kısıtsız `TabGenel` görür ama sidebar'da o rol için tanımlı nav
item'ı yoksa gezinemez.

### RPC katmanı (canlı)

**Okuma:** `get_dashboard_summary(p_project_id)`, `get_project_gantt(p_project_id, p_filter_date)`,
`get_project_dashboard(p_project_id, p_effective_date)` (frontend'den artık HİÇ çağrılmıyor —
bkz. Bilinen açık noktalar), `get_daily_report_detail(p_report_id)`,
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
`get_satin_alma_overview(p_project_id)`, `get_satin_alma_overview_all()`,
`get_finans_overview(p_project_id, p_as_of_date)`, `get_finans_overview_all(p_as_of_date)`,
`get_delayed_tasks_scoped(p_project_id)`, `get_my_role()`, `get_my_projects()`.

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

**Yetki/kapsam çekirdeği:** `get_project_scope(p_project_id)` — tüm dual-scope
(tek proje/Tüm Projeler) RPC'lerin ortak yetki katmanı (`roles.is_manager` OR
`has_project_access` OR `profiles.project_id` fallback); `anon`/`authenticated`'a
EXECUTE kapalı, yalnızca başka SECURITY DEFINER fonksiyonlardan çağrılır.
`has_project_access(p_project_id)` — kanonik proje-erişim kontrolü (is_manager
OR cross_project OR profiles.project_id OR user_project_access).
`user_has_project_access(p_project_id)`/`user_can_access_report(p_report_id)` —
RLS politikalarında kullanılan ince katmanlar, ikisi de artık yukarıdakilere delege eder.
`get_project_dashboard` de artık diğer proje-bazlı RPC'lerle aynı
`get_project_scope`/`authorized` desenini kullanıyor (2026-07-16'da eklendi —
daha önce hiç yetki kontrolü yoktu, herhangi bir authenticated kullanıcı
erişimi olmayan bir projenin verisini görebiliyordu).

**Bildirim:** `notify_managers(...)`, `notify_role(...)`, `notify_user(...)` —
`daily_reports`/`purchase_requests`/`invoices`/`tickets`/`ticket_comments`
INSERT/status trigger'larından çağrılır, `notifications` tablosuna yazar
(RLS: `recipient_id = auth.uid()`, realtime publication'da). UI:
`src/components/ui/NotificationBell.jsx`. `pg_cron` (jobid=1, `0 6 * * 1-5` —
yalnızca hafta içi) → `create_daily_report_reminders()`: o gün `daily_reports`
girilmemiş her `santiye_sefi` için `entity_type='daily_report_reminder'`/
`event_type='pending'` bildirimi ekler (başlıkta günün tarihi). Rapor girilince
`trg_resolve_daily_report_reminder` → `resolve_daily_report_reminder()` aynı
satırı `event_type='resolved'` yapar. UI rengi (`reminderTone()`): okunmamış+
pending sarı, okunmuş+pending normal, resolved yeşil.

**Trigger zincirleri (frontend bunları yeniden hesaplamamalı):**
- `daily_reports` → `progress_daily` INSERT/UPDATE/DELETE → `trg_sync_task_progress_from_daily`
  (`sync_task_progress_from_daily()`) → `project_tasks.total_progress`/`progress_pct`
  günceller → bu UPDATE `trg_sync_project_progress` (`fn_sync_project_progress()`)
  tetikler → `projects.progress`'e yansır. Proje için `project_category_weights`'te
  satır varsa (`category` → `weight_pct`) `Σ(weight_pct/100 × kategori_ortalama(progress_pct))`
  kullanılır (kategori içi basit AVG), satır yoksa süre-ağırlıklı (planned_start/
  planned_end) eski formüle düşer.
- `invoices` INSERT → `create_invoice_approval_chain()` → status'u `muhasebe_onayında` yapar + `invoice_approvals` step1 açar; `fn_invoice_approval_cascade` **tek yazan kaynak** olarak ilerletir: step1 onayı → step2 açar + `yönetici_onayında`; step2 onayı → `onaylandı` (frontend artık `invoices.status`'a ikinci bir yazma yapmıyor, bkz. DB-WF-001); herhangi bir adımda ret → `reddedildi`. `ödendi` durumu constraint'te geçerli ama onu üretecek bir akış yok (backlog). INSERT/UPDATE ayrıca `sync_purchase_request_from_invoice()` ile bağlı `purchase_requests.status`/`invoice_id`'sini senkronlar (reddedilince `invoice_id=NULL`, yeniden fatura kesilebilir) ve (onaylandı/ödendi → upsert, reddedildi → sil) `trg_invoice_cost_allocation` ile `cost_allocations`'ı günceller. `purchase_requests.invoice_id`'ye yapılan HER yazma `trg_guard_purchase_request_invoice_id` ile gerçek `invoices` durumundan yeniden hesaplanır (drift/manuel bozulma imkansız) ve `invoices.purchase_request_id` üzerinde `WHERE status <> 'reddedildi'` kısmi UNIQUE index'i bir talebin aynı anda yalnızca bir aktif faturası olmasını DB seviyesinde garanti eder.
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
| Proje yönetimi | projects, project_tasks, project_category_weights, work_packages¹, schedule_activities¹, project_risks |
| Günlük saha raporlama | daily_reports, daily_tasks, personnel_log_entries, machinery_logs, daily_report_photos, daily_report_issues, daily_report_material_usage |
| İmalat ilerlemesi | progress_daily |
| Satın alma (7 adım) | purchase_requests, purchase_request_items, purchase_request_status_log |
| Fatura ve maliyet | invoices, invoice_approvals, suppliers, budget_lines, cost_allocations |
| Teknik kontrol¹ | quality_inspections |
| Kullanıcı yönetimi | roles, profiles, user_project_access |
| Bildirim | notifications |
| Destek / diğer | tickets, ticket_comments, ticket_history, agent_reports, procurement_items, procurement_item_adjustments, procurement_item_change_requests |

¹ Yetim/arayüzsüz — bkz. Bilinen açık noktalar. (`critical_path_items`,
`critical_path_predecessors`, `mechanical_checklist`, `electrical_checklist`
tabloları DB'den tamamen kaldırıldı — artık yetim değil, yok.)

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
  `NotificationBell`), BOM takibi (`vw_bom_tracking`, `bom_item_id`), Finans/
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
  `DataStatusBanner`/`RealtimeStatusIndicator`'ı render etmesi yüzünden Genel
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

## Bilinen açık noktalar / ertelenmiş kararlar
- **Satın alma/finans liste ekranları RPC kullanmıyor:** `TabSatinAlmaTalepListesi.jsx`,
  `components/finans/FaturaListesi.jsx`, `components/finans/OnayKuyrugu.jsx`,
  `ProjeTabFaturaKesilecekler.jsx`, `ProjeTabMaliyetTablosu.jsx` kendi ham
  sorgularını koşuyor, halbuki karşılığı olan
  `get_satin_alma_overview*`/`get_finans_overview*` zaten mevcut. Güvenlik acil
  değil (RLS zaten proje bazlı), tutarlılık işi. Realtime yansıması `refreshKey`
  bump deseniyle (bkz. Frontend yapısı) telafi edildi, ama kalıcı çözüm (ham
  sorguyu RPC'ye taşımak) hâlâ yapılmadı.
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
- **Frontend 6/19 rolü tanıyor** (yukarı bkz.) — `ROLE_TABS`/`ROLE_LABEL`/`Sidebar.jsx`
  genişletilmeli, idealde `roles` tablosundan okunan bir izin matrisiyle.
- **Kalite denetimi modülü hiç arayüzü yok** — `quality_inspections` tablosu
  var (0 satır, RLS `USING(true)`, rol/proje kısıtı yok), sıfırdan yazılması
  gerekiyor. (`mechanical_checklist`/`electrical_checklist` tabloları — aynı
  gruptaki mekanik/elektrik checklist'ler — DB'den tamamen kaldırıldı, bu artık
  onlar için geçerli değil.)
- **`work_packages` yetim tablo, `schedule_activities` yarı-yetim** —
  `work_packages` gerçekten hiçbir dosyada kullanılmıyor (frontend'deki
  `wps`/"work_packages" değişkeni kafa karıştırıcı bir isimlendirme: `get_proje_detay`
  RPC'sinin `work_packages` JSON node'u aslında `project_tasks`'tan geliyor, gerçek
  `work_packages` tablosuna hiç dokunmuyor). `schedule_activities` ise teknik olarak
  okunuyor (`agentContext.js:106`, her zaman boş dönen bir sorgu) ve proje silme
  akışında (`TabProjeYonetimi.jsx`) temizleniyor — ama hiçbir UI'da render edilmiyor,
  pratikte hâlâ kullanılmayan bir tablo. (`critical_path_predecessors` aynı
  gruptaydı, artık DB'de yok.)
- **`vw_bom_tracking` view'ı hiç kullanılmıyor** — DB'de tanımlı (`over_requested`
  dahil tam mantık var), otomatik risk motoru aynı işi kendi ayrı sorgusuyla
  yapıyor. Silinebilir ya da risk motoru buna geçirilebilir, acil değil.
- **Genel Proje kartlarındaki personel/makine sayıları ile günlük rapor
  export'u farklı kaynaklardan besleniyor** (teyit gerekli) —
  `ProjectOverviewDashboard.jsx`/`TabGenel.jsx` `get_project_dashboard`/
  `get_project_by_date`'in `personnel`/`machinery` node'larından (en son rapor
  bazlı) besleniyor; `exportDailyReport`/`exportPeriodicReport` ham
  `personnel_log_entries`/`machinery_logs` sorgusu yapıyor (seçili rapor/dönem
  için). Muhtemelen kasıtlı ("güncel durum" vs "geçmişe dönük rapor") ama
  doğrulanmadı.
- **`profiles.role` / `profiles.role_key` iki ayrı kolon** — FAZ1 denetiminde
  tutarsız bulunmuştu (5 kayıttan 3'ü), düzeltildiğine dair kayıt yok — yeni
  bir görev bu alana değiyorsa önce `select id, role, role_key from profiles`
  ile doğrula.
- **RLS temizliği bekliyor:** `schedule_activities`/`quality_inspections`/`work_packages`
  hâlâ `USING(true)` (rol/proje kısıtı yok) — **not (2026-07-17): `procurement_items` bu
  listeden çıkarıldı**, malzeme miktarı onay akışı için yapılan taramada zaten
  `has_project_access(project_id)` politikasıyla korunduğu görüldü, önceki not yanlıştı.
  `profiles`/`purchase_requests` üzerinde eski+yeni politika birikimi
  (`multiple_permissive_policies`) var. Acil değil, ileride bir RLS temizlik
  migration'ında ele alınmalı.
- **Realtime ölçek notu:** P0 tablolarında `REPLICA IDENTITY FULL` var (DELETE/UPDATE
  RLS'i için gerekliydi). Supabase üretim ölçeğinde Broadcast-from-database'e
  geçişi öneriyor — bu projenin ölçeğinde (2 test projesi) şimdilik gerekmiyor,
  ileride gündeme gelirse bu kararı birlikte gözden geçir.
- **`get_project_dashboard` RPC'si artık hiçbir yerden çağrılmıyor** — onu
  kullanan tek bileşen (`TabGenel.jsx`'in `ProjectDashboard` alt bileşeni)
  2026-07-16'da silindi (bkz. Tamamlanan büyük görevler). RPC'nin kendisi
  DB'de duruyor (silinmedi — bu bir migration kararı, ayrıca istenmeden
  yapılmadı), `get_project_by_date`'ten fazladan alanları var (`inspections`,
  `pending_pr`, `open_tickets`, ayrı `personnel`/`machinery` şekli) ama
  hiçbiri artık okunmuyor. İleride ya silinmeli (temizlik migration'ı) ya da
  gerçek bir ihtiyaç çıkarsa yeniden bir ekrana bağlanmalı.
- **Proje sihirbazında ilerleme kategori ağırlıkları düzenlenemiyor** —
  `project_category_weights` yalnızca SQL ile yönetiliyor, sihirbaza/ayarlar
  ekranına bir düzenleme arayüzü eklenmedi.
- **`Adim5Tedarik.jsx`'in "Durum" akışı yeniden tasarlanacak (kullanıcı kararı,
  henüz yapılmadı).** Kullanıcı tedarik/teslimat takibiyle şu an ilgilenmiyor;
  `procurement_items`'ta hiç kullanılmayan `shortage_notes`/`damage_notes`
  kolonları ve `kısmi_teslim`/`hasarlı` status değerleri kaldırıldı (2026-07-16),
  ama formdaki mevcut 5 durumlu (`planlandı`/`sipariş_verildi`/`teslim_edildi`/
  `iptal`/`gecikmiş`) Durum dropdown'ı ve teslimat tarihi alanları (Sipariş
  Tarihi/Beklenen Teslimat) kasıtlı olarak dokunulmadan bırakıldı — bu akış
  "o kısma gelince baştan" tasarlanacak, kendiliğinden sadeleştirme yapma.

---

## Son değişiklik

**18.07.2026 (9) — Genel/ProjeTab liste bileşenleri birleştirmesi (refactor).**

CLAUDE.md'nin "Bilinen açık noktalar" listesindeki, kullanıcı isteğiyle ertelenmiş
kod-tekrarı maddesiyle bu turda devam edildi. Ayrı bir `refactor/birlesik-list-bilesenleri`
branch'inde, eski 5 fazlı plan dosyası (`satin-alma-finans-birlestirme-cc-prompt.md`)
temel alınarak ama önce 3 paralel Explore agent'ıyla güncel kod hâli doğrulanarak
3 fazda yürütüldü (her fazın kendi commit'i var):

1. `components/finans/FaturaListesi.jsx` — artık opsiyonel `projectId`/`filterDate`
   alıyor; `projectId` yokken menü davranışı (tüm projeler, serbest proje seçici,
   Detay→onay zinciri modalı), doluyken proje davranışı (yalnız o proje, kilitli
   seçici, doğrudan "İptal Et"). `ProjeTabFaturaListesi.jsx` silindi.
2. `components/finans/OnayKuyrugu.jsx` — opsiyonel `projectId`; doluyken 3. bir
   "Tamamlanan/İptal Edilen" bölümü (son 20 fatura) ek olarak render ediliyor,
   yönetici bölümünün admin başlığı da moda göre değişiyor ("Yönetici Onay
   Kuyruğu" vs "Fatura Onay Bekleyenler"). `ProjeTabOnayKuyrugu.jsx` silindi.
3. `TabSatinAlmaTalepListesi.jsx` (+ sarmalayıcı `TabSatinAlmaOnayKuyrugu.jsx`) —
   opsiyonel `filterDate`/`siteChiefView` eklendi; PROJE kolonu ve proje-bazlı
   malzeme planı gruplaması (`groupByProjectId`) yalnızca `projectId` yokken,
   `filterDate`/tekil malzeme planı state'i ve `siteChiefView` süzmesi yalnızca
   `projectId` doluyken devrede. `ProjeTabTalepListesi.jsx` ve
   `ProjeTabSaOnayKuyrugu.jsx` silindi.

Süreçte CLAUDE.md'nin eski notunun **yanlış** olduğu ortaya çıktı: listelenen
5 çiftten yalnızca yukarıdaki 3'ü gerçek kopyaydı.
`MaliyetOzetTable`/`ProjeTabMaliyetTablosu` kasıtlı olarak farklı iki bileşen
(özet vs. filtre+export'lu detaylı görünüm, ikisi de her iki ekranda kullanılıyor),
`ProjeTabFaturaKesilecekler.jsx` (Malzeme Listesi/BOM) menü seviyesinde hiç
karşılığı yok (BOM projeye özgü, tasarım gereği yalnızca proje kapsamlı) — ikisi
de birleştirilmedi, "Bilinen açık noktalar" buna göre düzeltildi.

Doğrulama: her fazdan sonra `npx vite build` + `npx eslint src` temiz (0 hata).
`npm run test:e2e` (`tests/faz-e.spec.js`) hem değişiklik öncesi hem sonrası
çalıştırıldı — ikisinde de aynı tek hata (test A, `select[title="Görüntülenecek
proje kapsamı"]` bulamıyor); bu, header'daki global proje seçicinin
2026-07-17'de kaldırılmasından kalma **önceden var olan, bu refactor'den
bağımsız** bir test/kod uyumsuzluğu — testin kendisi güncellenmedi (kapsam
dışı), yalnızca not edildi. Tarayıcıdan gerçek elle gezinme bu oturumda
(headless ortam) yapılamadı; kullanıcı sonrasında 4 ekranı (Menü→Finans,
Menü→Satın Alma, Proje→Finans, Proje→Satın Alma) kendisi gezip **görsel
olarak bozukluk olmadığını teyit etti**.

Branch `refactor/birlesik-list-bilesenleri` main'e merge edilip push'landı
(`19df2ab..68ad6a8`). Görev kapandı.
