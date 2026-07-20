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

**Frontend artık 19 rolün tamamını tanıyor (2026-07-18'de genişletildi).**
Önceden yalnızca 6 rol (admin, muhasebe, santiye_sefi, muhendis, koordinator,
proje_yoneticisi) `ROLE_TABS`/`ROLE_LABEL`/`Sidebar.jsx`'te tanımlıydı; diğer
13 rolle giren bir kullanıcı sidebar'da yalnızca "Bildirimler"i görüyordu.
Kullanıcıyla birlikte 3 gruba ayrıldı:
- **`koordinator` ile birebir aynı erişim:** `proje_koordinatoru` — `SAHA_ROLES`e
  eklendi (Genel/Projeler/Satın Alma/Tickets), `ROLE_TABS`'ta hiç kaydı yok
  (koordinator/muhendis/admin gibi "kısıtsız" — yalnızca Sidebar görünürlüğü
  gate ediyor, route seviyesinde kısıt yok; bu, mevcut yönetici rollerinin
  hepsinde zaten var olan bir desen, yeni bir açık değil).
- **`maliyet_kontrolcu` (muhasebe+koordinator karışımı):** Genel + Projeler +
  Finans (`Sidebar.jsx`'te bu 3 item'ın `roles` dizisine eklendi), aynı şekilde
  `ROLE_TABS`'ta kısıtsız.
- **11 tek-projeli saha/teknik uzman rolü** (`elektrik_sefi`, `mekanik_sef`,
  `isg_sorumlusu`, `kalite_kontrol_sefi`, `enh_sorumlusu`, `proje_kurulum_sefi`,
  `proje_tasarim_sorumlusu`, `evrak_takip`, `operasyon_sorumlusu`,
  `is_makinesi_operator`, `lojistik_tedarik`) — henüz kendi özel modülleri
  yok (İSG/ENH gibi modüller hâlâ "Hiç yapılmamış modüller"de), bu yüzden
  hepsi `santiye_sefi`'nin genel demetini paylaşıyor: Genel Bakış + İş Planı +
  Satın Alma + Tickets + Bildirimler (`FIELD_SPECIALIST_ROLES` sabiti hem
  `index.jsx`'te hem `Sidebar.jsx`'te ayrı ayrı tanımlı — iki dosya arasında
  paylaşılan bir roller modülü yok, mevcut kod stiliyle tutarlı), ama
  `santiye_sefi`'ye özel Günlük Rapor formu/listesi (`daily-report`/
  `rapor-listesi`) VERİLMEDİ — o bileşenler saha şefine özel. Bu roller
  `ROLE_TABS`'ta kısıtlı (yalnızca bu 5 sekme) ve `ROLE_DEFAULT`'ta `genel`.
  `TabIsPlan`'a `siteChiefView` geçilmiyor (santiye_sefi'ye özel sadeleştirilmiş
  görünüm bu rollere uygulanmıyor, `proje_yoneticisi` ile aynı davranış —
  görev sorumlusu/notlar dahil tam görünüm). `lojistik_tedarik` (`cross_project=true`
  olmasına rağmen) bilinçli olarak diğer saha rolleriyle aynı tek-proje
  (`profiles.project_id`) demetine dahil edildi — kullanıcı "hepsine aynı
  demet" dedi, `proje_yoneticisi`'nin çoklu-proje deseni burada kullanılmadı.
  **Güncel karar (2026-07-20):** Kullanıcı ayrı Kalite Kontrol modülünü istemedi;
  modül frontend'den kaldırıldı. `kalite_kontrol_sefi` yeniden bu jenerik uzman
  demetini kullanıyor ve `FIELD_SPECIALIST_ROLES` içinde kalıyor. Rolün kendisini,
  kullanıcı kayıtlarını veya geçmiş veritabanı verilerini silme.

Bu değişiklik yalnızca sidebar görünürlüğü/üst-seviye sekme yönlendirmesi —
`ProjeDetay.jsx`'in iç sekmeleri zaten `role !== 'proje_yoneticisi'` gibi
permissive kontroller kullandığından (bkz. `canViewFinanceAndTickets`) yeni
roller "Projeler" sekmesinden bir projeye girdiklerinde otomatik doğru
çalışıyor, ayrı bir değişiklik gerekmedi. Kalıcı/ideal çözüm hâlâ
`roles` tablosundan okunan bir izin matrisi olurdu (bkz. Bilinen açık
noktalar) — bu tur hızlı, dosya-içi bir genişletme.

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
`has_project_access` OR `profiles.project_id` fallback); `anon`/`authenticated`'a
EXECUTE kapalı, yalnızca başka SECURITY DEFINER fonksiyonlardan çağrılır.
`has_project_access(p_project_id)` — kanonik proje-erişim kontrolü (is_manager
OR cross_project OR profiles.project_id OR user_project_access).
`user_has_project_access(p_project_id)`/`user_can_access_report(p_report_id)` —
RLS politikalarında kullanılan ince katmanlar, ikisi de artık yukarıdakilere delege eder.

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
  gerektiren 4 madde (bkz. Bilinen açık noktalar):** risk severity (3 farklı
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

## Bilinen açık noktalar / ertelenmiş kararlar
- **"A1-devam" — status/severity map çakışmaları (2026-07-19'da bulundu, ayrı
  oturum gerektiriyor, bkz. Tamamlanan büyük görevler → Master plan A1):**
  (1) Risk severity (`project_risks.severity`) 3 bağımsız yerde temsil ediliyor
  (`Adim4Riskler.jsx` dropdown, `ProjectOverviewDashboard.jsx`'in `RISK_BADGE`/
  `SEV_BORDER`'ı) — hiçbiri `ticketSeverity.js`'in `SEVERITY_META`'sıyla senkron
  değil, `RISK_BADGE`'in S-eğrisi grafiğinde nasıl tüketildiği henüz incelenmedi.
  (2) Satın alma statüsü: `StatusBadge.jsx`'in `PR_STATUS`'ü (tone-bazlı) ile
  `TalepDetayModal.jsx`'in yerel `STATUS_META`'sı (hex-bazlı) farklı renk/etiket
  veriyor — hangisinin kazanacağı görsel/iş kararı gerektiriyor. (3) Ticket
  statüsü: aynı şekilde `StatusBadge.jsx`'in `TK_STATUS`'ü ile
  `TicketDetayModal.jsx`'in yerel `STATUS`'ü arasında `iptal_edildi` tutarsızlığı
  var. (4) Günlük rapor genel durumu (`DailyReportForm.jsx`/`DailyReportList.jsx`/
  `ProjectOverviewDashboard.jsx` arasında 3 farklı tanım, `DailyReportList.jsx`'te
  büyük/küçük harf duplicate key bug'ı) — `daily_reports.general_status`'un DB
  constraint'i henüz doğrulanmadı.
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
- **Frontend artık 19/19 rolü tanıyor (2026-07-18'de kapandı, yukarı bkz. Roller
  bölümü)** — ama hâlâ hardcoded `ROLE_TABS`/`ROLE_LABEL`/`Sidebar.jsx` dizileri
  ile yönetiliyor, `roles` tablosundan okunan gerçek bir izin matrisi DEĞİL.
  10 saha/teknik rolü (kalite_kontrol_sefi artık kendi modülüne kavuştu, bkz.
  Tamamlanan büyük görevler → Kalite denetimi modülü) hâlâ aynı jenerik demeti
  paylaşıyor (Genel/İş Planı/Satın Alma/Tickets) — İSG/ENH gibi modüller
  yazılınca bu rollerin erişimi yeniden gözden geçirilmeli.
  (`mechanical_checklist`/`electrical_checklist` tabloları — aynı gruptaki
  mekanik/elektrik checklist'ler — DB'den tamamen kaldırıldı, bu artık onlar
  için geçerli değil.)
- **`vw_bom_tracking` view'ı hiç kullanılmıyor** — DB'de tanımlı (`over_requested`
  dahil tam mantık var), otomatik risk motoru aynı işi kendi ayrı sorgusuyla
  yapıyor. Silinebilir ya da risk motoru buna geçirilebilir, acil değil.
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

**20.07.2026 — Kullanıcı tercihi: ayrı Kalite Kontrol modülü istenmiyor.**

Kullanıcı, uygulamadaki ayrı “Kalite Kontrol” bölümünü istemediğini belirtti. Bu
nedenle modülün menü/proje detayı girişleri ve yalnız bu modüle ait frontend kodu
kaldırıldı. Yeni bir Kalite Kontrol ekranı veya menü girişi kullanıcı açıkça
yeniden istemedikçe eklenmemeli. Mevcut `kalite_kontrol_sefi` rolü ve geçmiş
veritabanı yapıları/verileri bu karardan ayrı tutuldu ve korunuyor.

---

**19.07.2026 (20) — Master plan A1 (proje statüsü map konsolidasyonu) kapatıldı, sıralı devam kararı alındı.**

A0-GÖREV 2'nin ardından ("(19)", artık Tamamlanan büyük görevler'de, push edildi)
kullanıcı kalan master plan maddelerinde (A1/A3/A7/F1-F4/FD2/D3/D4) **"sırayla
git"** dedi — yani sıradaki her maddeyi tek tek, kendi keşif→plan→onay→uygula
döngüsüyle işlemeye başla. İlk madde A1 için 2 Explore agent'ıyla güncel durum
tam tarandı: planın 17.07'de bahsettiği kopyaların bir kısmı 18.07'deki
birleştirmede zaten kapanmıştı, ama tarama planın hiç bilmediği 10 status/severity
map domaini + gerçek çakışmalar ortaya çıkardı (bkz. Tamamlanan büyük görevler →
Master plan A1). Kapsam bilinçli olarak **proje statüsüne** daraltıldı (DB
constraint'iyle 4 değer doğrulandı), geri kalan 4 alt-madde "A1-devam" olarak
Bilinen açık noktalar'a not edildi.

Yeni `src/utils/projectStatus.js` (`PROJECT_STATUS_META`) — `TabGenel.jsx`/
`TabProjeler.jsx`/`TabProjeYonetimi.jsx` buradan besleniyor (saf refactor commit'i,
Playwright ile 3 ekranda rozet metni/rengi birebir aynı doğrulandı), ayrı bir
commit'te `ProjectOverviewDashboard.jsx`'in yanlış/eksik `STATUS_LABEL`'ı (DB'de
olmayan `askida`/`gecikti` değerleri, eksik `iptal edildi`) düzeltildi — test
verisiyle (Kayseri projesi geçici `iptal edildi`) doğrulanıp geri alındı. `npx
vite build`/`npx eslint src` her commit sonrası temiz, `tests/faz-e.spec.js`
regresyon (F testi) PASS. 2 commit yapıldı (`8e4d95b` refactor, `d6545a2` bugfix),
push için onay istenecek.

Sıradaki madde: A3 (rol/menü tek kaynak, `src/config/navigation.js`).
