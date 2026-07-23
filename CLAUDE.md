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
  Proje Finans sekmesi (`ProjeTabFinans.jsx`) rol bazlı: admin proje içinde
  Genel/Faturalar/Onay Kuyruğu/Maliyet Tablosu görür; proje yöneticisi ve
  diğer roller yalnızca Genel özeti görür.

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

**Fatura iptali/yeniden gönderme:** Onaylanmış bir faturayı yalnızca admin
iptal edebilir (`fn_validate_invoice_status_transition`, `onaylandı →
reddedildi` izinli) — iptalde `cost_allocations` geri alınır, bağlı talep
`onaylandi`'ye döner, `invoice_id` temizlenir (`sync_purchase_request_from_invoice`/
`sync_cost_allocation_from_invoice` trigger'ları). `reddedildi` durumundaki bir
faturayı yalnızca muhasebe düzenleyip yeniden gönderebilir
(`resubmit_rejected_invoice` — onay zincirini `bekliyor`'dan yeniden açar) veya
kalıcı silebilir (`delete_rejected_invoice` — bağlı talebi `satin_alindi`'ye
döndürür, yeniden fatura kesilebilir). "Onay sürecinde reddedilen" ile
"onaylandıktan sonra iptal edilen" aynı DB değerini (`reddedildi`) paylaşır;
`FaturaListesi.jsx`'in Detay modalı `invoice_approvals`'a bakarak bu ikisini
ayırt edip farklı rozet gösterir, liste satırı bu ayrımı yapmaz.

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
   mekanizmanın görünür olduğu tek yer.
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
için Finans salt-okunur, Tickets santiye_sefi ile aynı tam yetkide. Kullanıcı
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
`get_invoices_list`, `get_invoice_approval_queue`. Muhasebe izolasyonu için bu
sonuncuların `_internal` varyantları var (`get_finans_overview_internal`,
`get_finans_overview_all_internal`, `get_purchase_request_detail_internal`,
`get_purchase_requests_list_internal`, `get_satin_alma_overview_all_internal`)
— dış RPC'ler rol kontrolü yapıp muhasebeye yalnızca `satin_alindi`/
`fatura_bekliyor` kapsamını döner, genel finans özetinde `authorized:false`.

**Yazma:** `create_purchase_request_with_items` (tek kalem zorunlu,
`p_requested_by`/`has_project_access` içeride doğrulanır), `save_daily_report`
(`p_issues` id-bazlı upsert — ticket bağlantısı için kritik, bkz. Trigger
zincirleri), `update_procurement_status`, `resubmit_rejected_invoice`,
`delete_rejected_invoice`, `create_procurement_item_change_request`,
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

**Bildirim:** `notify_managers`, `notify_role`, `notify_user` — trigger'lardan
çağrılır, `notifications` tablosuna yazar (RLS: `recipient_id = auth.uid()`,
kullanıcı kendi bildirimini silebilir). `entity_type` değerleri:
`purchase_request`, `invoice`, `ticket`, `daily_report`, `daily_report_reminder`,
`procurement_item_change_request`. `pg_cron` (hafta içi 06:00) →
`create_daily_report_reminders()` / rapor girilince `resolve_daily_report_reminder()`.

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

### Trigger zincirleri (frontend bunları yeniden hesaplamamalı)
- `daily_reports` → `progress_daily` yazımı → `trg_sync_task_progress_from_daily`
  → `project_tasks.progress_pct` günceller → `trg_sync_project_progress`
  (`fn_sync_project_progress()`) → `projects.progress`'e yansır. Kategori
  ağırlığı varsa (`project_category_weights`) ağırlıklı ortalama, yoksa
  süre-ağırlıklı fallback.
- `invoices` INSERT → `create_invoice_approval_chain()` tek adımlı zincir açar
  (`step=1, 'Yönetici Onayı'`, `invoices.status='yönetici_onayında'`) —
  muhasebenin kendi faturasını kendine onaylatan eski "Muhasebe Onayı" adımı
  kaldırıldı. `fn_invoice_approval_cascade` `step_label`'a göre ilerletir;
  ret → `reddedildi`. INSERT/UPDATE ayrıca `sync_purchase_request_from_invoice`
  ile bağlı `purchase_requests.status`/`invoice_id`'yi senkronlar ve
  `trg_invoice_cost_allocation` ile `cost_allocations`'ı günceller.
  `purchase_requests.invoice_id`'ye her yazma `trg_guard_purchase_request_invoice_id`
  ile gerçek `invoices` durumundan yeniden hesaplanır; `invoices.purchase_request_id`
  üzerinde `WHERE status <> 'reddedildi'` kısmi UNIQUE index'i bir talebin tek
  aktif faturası olmasını garanti eder. `ödendi` durumu constraint'te geçerli
  ama onu üretecek bir akış yok (backlog).
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
`invoices.status IN ('onaylandı','ödendi')`, tutar = `total_amount` (KDV dahil).
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

## Son değişiklik

**23.07.2026 — Risk kapanma mantığı onaya bağlandı + Malzeme Listesi/Riskler
tek sayfa oldu.** Önceki görevde eklenen ayrı "Riskler" sekmesi geri alınıp
Malzeme Listesi'ne alt-sekme olarak taşındı (`ProjeTabMalzemeListesi.jsx`
içinde `section` state'i, `ProjeTabRiskler.jsx` aynı kalarak). `ProjeDetay.jsx`
yine 8 sekmeye döndü; Genel Proje'nin "Riskler" kartındaki "Tümünü Gör" linki
artık `goToTab('riskler')` yardımcı fonksiyonuyla Malzeme Listesi sekmesini
açıp içindeki `riskler` alt-sekmesine düşüyor. Riskler tablosunun satır
yüksekliği daraltıldı (`TD height:46`, önceki 64'ten).

Asıl davranış değişikliği `fn_recompute_auto_risks`'te: (1) `gorev_gecikmesi`
riski artık görevin `progress_pct >= 100` olmasıyla (veya `tamamlandi`/`iptal`
durumuyla) kapanıyor — yalnızca plan bitiş tarihinin ileri alınıp "gecikmiş
görünmekten çıkması" artık yetmiyor, risk açık kalmaya devam ediyor. (2)
`malzeme_fazla_talep` riski artık miktar matematiği kendiliğinden düzelse
(örn. fazla talep reddedilse/iptal olsa) bile OTOMATİK kapanmıyor — yalnızca
yeni `p_close_material_risks` parametresi `true` geçildiğinde kapanıyor, bu da
yalnızca iki "yönetici onayı" anında oluyor: satın alma talebi `onaylandi`ya
geçtiğinde (`trg_recompute_risks_from_purchase_request`) veya
`review_procurement_item_change_request` ile bir BOM miktar artışı
onaylandığında. Yeni `project_risks.closed_at` kolonu kapanma anını tutuyor;
`fn_set_risk_closed_at()` BEFORE INSERT/UPDATE trigger'ı bunu hem otomatik hem
manuel kapanışlarda tek noktadan yönetiyor (kapatıldı'ya geçince `now()`,
çıkınca `null`). Canlı testte ayrıca **pre-existing bir hata** bulundu ve
düzeltildi: `requested_qty` hesabındaki `LEFT JOIN ... pr.status NOT IN
('reddedildi','iptal')` filtresi yalnızca `pr.*` kolonlarını null yapıyordu,
`SUM(pri.quantity)` reddedilen taleplerin miktarını hâlâ sayıyordu — `FILTER
(WHERE pr.id IS NOT NULL)` ile düzeltildi. Tüm senaryolar (görev %100/gecikme
ileri alma/malzeme reddi-vs-onayı) test proje `test-izmir-ges-2026`'da canlı
simüle edilip PASS doğrulandı, veriler temizlendi; `get_advisors` yeni bir
uyarı göstermedi.
