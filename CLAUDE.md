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
  tablosu kullanımda değil). "İlerleme Girişi" paneli `project_tasks`'tan
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
  paketler (bu tabloda o kolonlar yok, önceden var olan bir çözüm) — bu yüzden
  otomatik açılan ticket'ın `description`'ı, kullanıcı bu ek alanlardan birini
  doldurduysa ham JSON içerir; bilinen bir kozmetik yan etki, ayrı bir görev.
- `SantiyeSefiDashboard.jsx`'teki "Proje İlerlemesi" kartı: tek büyük yüzde +
  tek ilerleme çubuğu (planlanan ilerleme çubuk üstünde dikey işaret çizgisi),
  "Plana göre N puan önde/geride" cümlesi, altta kalem başına yatay bar-listesi.
- Şantiye şefi "Satın Alma" sekmesi sadeleştirilmiş: `<ProjeTabSatinAlma
  siteChiefView />` (KPI/sidebar yok) render edilir, yalnızca **Talepler**
  (`siteChiefView` prop'u listeyi `requested_by === user.id` ile süzer, kendi
  talebi dışında onay/red butonu görmez — `canApprove = isAdmin`) ve **Malzeme
  Listesi** sekmeleri görünür.
- Satın Alma/Malzeme Listesi tabloları (`ProjeTabTalepListesi.jsx`,
  `TabSatinAlmaTalepListesi.jsx`, `ProjeTabFaturaKesilecekler.jsx`) sabit
  iç-scroll kutusu yerine `PAGE_SIZE=10` + ortak `Pager` bileşeni (`‹ 1/2 ›`)
  kullanıyor.
- `ProjeDetay.jsx`'in sekmeleri: Genel Proje, İş Planı, Satın Alma, Finans,
  Ticket, Raporlar, Ekip (ayrı bir "Proje Paneli" sekmesi YOK — 2026-07-16'da
  kısaca eklenip aynı oturumda kullanıcı kararıyla geri alındı, bkz. Tamamlanan
  büyük görevler). Genel Proje (`ProjectOverviewDashboard.jsx`, tek veri kaynağı
  `get_project_by_date`) proje özeti ekranı: Proje Detayları/Genel İlerleme/
  Özet/Hava Durumu KPI kartları, Projenin Gidişatı (milestone şeridi), S-Eğrisi
  (planlanan/gerçekleşen aylık çizgi grafiği), Kategori Bazlı İlerleme, İmalat
  İlerlemesi, Malzeme Kalemleri/Satın Alma, Maliyet Durumu (+ En Büyük 5 Kalem),
  Güncel Ticketlar, Saha Fotoğrafları, **Açık Riskler (Detay)** — `project_risks`
  otomatik risk motorunun `source==='otomatik'` rozetiyle göründüğü uygulamadaki
  **tek** ekran. Kritik yol timeline'ı YOK (kullanıcı kararıyla kapsam dışı
  bırakıldı). İlgili kartlar (S-Eğrisi/Kategori Bazlı İlerleme → İş Planı,
  İmalat İlerlemesi → İş Planı, Maliyet Durumu → Finans, Malzeme Kalemleri →
  Satın Alma, her risk satırı → `rule_code`'a göre İş Planı/Satın Alma) tıklanınca
  ilgili sekmeye (`onGoTab`) geçiyor.

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
`purchase_requests` UPDATE eder — **status'u asla elle set etmez**.
DB tetikleyicisi `trg_auto_advance_pr_to_satin_alindi` (`fn_auto_advance_pr_to_satin_alindi`)
`supplier_id`+`purchase_date` doluyken statüyü otomatik `satin_alindi`'ye
ilerletir. RLS (`pr_update_proje_yoneticisi` policy, `purchase_requests`):
`get_my_role()='proje_yoneticisi'` + `has_project_access` + statü
`onaylandi`/`satin_alindi` olmalı, `with_check` `fn_purchase_request_procurement_fields_only(...)`
ile yalnızca tedarik alanlarına yazabildiğini garanti eder (title/urgency/
category/estimated_amount_excl_vat/requested_by/approved_by/approved_at
dokunulamaz). Sert kilit: `trg_guard_invoice_requires_procurement_done`
(`invoices` BEFORE INSERT) talep hâlâ `onaylandi`'nin öncesindeyse fatura
insert'ini Postgres seviyesinde reddeder — muhasebe bu adımı atlayamaz.
Frontend tarafı: `isAwaitingInvoice()` (`src/utils/satinAlma.js`) artık yalnızca
`satin_alindi` durumunda true döner (`onaylandi` ARTIK YETERLİ DEĞİL) — "Fatura
Oluştur" butonu üç yerde de (`ProjeTabTalepListesi.jsx`, `TabSatinAlmaTalepListesi.jsx`,
`TalepDetayModal.jsx`) bu tek fonksiyona delege ettiği için değişiklik hepsine
otomatik yansıyor. `FaturaOlusturModal.jsx`'te yeni bir `toUserMessage()` DB
guard hatasını Türkçeleştiriyor (bu dosyaya özel, `DailyReportForm.jsx`'teki
`toUserMessage` ile ortak bir modül değil — bkz. Bilinen açık noktalar).
`suppliers` tablosunun tam şeması: `id, name, tax_no, contact, email, phone,
created_at` — frontend hâlâ yalnızca `id, name` okuyor/yazıyor, `TedarikKuyrugu.jsx`
içindeki "+ Yeni" mini-form da yalnızca `name` ile insert ediyor.

### Roller (19, `roles` tablosunda tanımlı — `select key, display_name, is_manager, cross_project from roles`)
admin, koordinator, proje_koordinatoru, muhendis, proje_tasarim_sorumlusu,
santiye_sefi, proje_kurulum_sefi, elektrik_sefi, mekanik_sef, isg_sorumlusu,
kalite_kontrol_sefi, lojistik_tedarik, proje_yoneticisi, enh_sorumlusu,
operasyon_sorumlusu, evrak_takip, maliyet_kontrolcu, muhasebe, is_makinesi_operator

`is_manager=true`: admin, koordinator, proje_koordinatoru, maliyet_kontrolcu,
muhasebe (tüm yönetici bildirimlerini alır, `has_project_access` her projeye
izin verir). `cross_project=true`: lojistik_tedarik (tek projeye bağlı değil
ama manager de değil). `proje_yoneticisi` (2026-07-16'da `satin_alma_uzmani`
rolünün yerine geçti) `santiye_sefi` ile aynı mekanizmayla **tek proje**
kapsamlı — `is_manager=false`, `cross_project=false`, `profiles.project_id`/
`user_project_access` üzerinden bağlanır (bkz. Satın alma → tedarik adımı).

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
`ProjectOverviewDashboard.jsx` — tek veri kaynağı; `category_weights` ve `risks` node'ları
`get_project_dashboard`'daki aynı alt sorgulardan, `budget_lines.name` alanı da 2026-07-16'da eklendi),
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
  `title=topic`, `description=description`, `severity=priority` (artık birebir
  aynı 4 değer: düşük/orta/yüksek/kritik), `status` `resolution_status`'tan map
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

### Modül → tablo haritası (29 tablo + 6 view + `notifications`)
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
| Destek / diğer | tickets, ticket_comments, ticket_history, agent_reports, procurement_items |

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
sayfasını okur (tam 7-sayfalık şablonla karıştırılmamalı). Bunun `CAT_MAP`'i
hâlâ eski 10 kategoriyle sınırlı ve `is_critical`'ı okumuyor — bkz. Bilinen
açık noktalar, edge function'daki genel `trSnake` yaklaşımından farklı, ayrı
bir düzeltme gerektiriyor.

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

## Bilinen açık noktalar / ertelenmiş kararlar
- **Otomatik açılan ticket'ların `description`'ı bazen ham JSON içerebilir** —
  `daily_report_issues.description` `category`/`closed_at`/`notes` alanlarını
  `__ISSUE_META__{json}` öneki ile paketliyor (bu tabloda o alanlar için ayrı
  kolon yok); `fn_create_ticket_from_daily_report_issue` bunu olduğu gibi
  ticket'a kopyalıyor. Kullanıcı sorun formunda Kategori/Kapanış Tarihi/Not
  doldurursa ticket'ın açıklaması okunaksız görünür. Düzeltme iki yoldan biri:
  `daily_report_issues`'a yeni kolonlar eklemek (migration) ya da ticket'a
  yalnızca temiz `description`'ı kopyalayıp meta alanları başka bir yerde
  tutmak — kullanıcıyla ayrı görüşülmeli, bu turda kapsam dışı.
- **`tickets.severity`/`TicketListesi.jsx`/`TicketDetayModal.jsx`/`YeniTicketModal.jsx`
  severity haritaları tekrarlı** — üçü de aynı `{düşük,orta,yüksek,kritik}`
  sözlüğünü ayrı ayrı tanımlıyor (ortak bir sabit/dosya yok). `kritik` 2026-07-16'da
  üçüne de eklendi ama tekilleştirme yapılmadı — ileride yeni bir severity
  değeri eklenirse üç dosyanın da güncellenmesi gerekir.
- **Satın alma/finans liste ekranları RPC kullanmıyor:** `TabSatinAlmaTalepListesi.jsx`,
  `ProjeTabTalepListesi.jsx`, `FaturaListesi.jsx`, `OnayKuyrugu.jsx`,
  `ProjeTabFaturaListesi.jsx`, `ProjeTabOnayKuyrugu.jsx` kendi ham sorgularını
  koşuyor, halbuki karşılığı olan `get_satin_alma_overview*`/`get_finans_overview*`
  zaten mevcut. Güvenlik acil değil (RLS zaten proje bazlı), tutarlılık işi.
  Realtime yansıması `refreshKey` bump deseniyle (bkz. Frontend yapısı)
  telafi edildi, ama kalıcı çözüm (ham sorguyu RPC'ye taşımak) hâlâ yapılmadı.
- **Genel (rol-kilitli) Satın Alma/Finans sayfaları ile `ProjeTab*` arasında
  ~2300 satır kod tekrarı** (`FaturaListesi`↔`ProjeTabFaturaListesi`,
  `OnayKuyrugu`↔`ProjeTabOnayKuyrugu`, `MaliyetTablosu`↔`ProjeTabMaliyetTablosu`,
  `TalepListesi`↔`ProjeTabTalepListesi`, `FaturaKesilecekler`↔`ProjeTabFaturaKesilecekler`).
  Genel sayfalar ölü kod DEĞİL — `proje_yoneticisi`/`muhasebe` rolleri için tek
  arayüz. Birleştirme planı netleşmiş ama kullanıcı isteğiyle ertelendi, açıkça
  istenmeden yapma. Detaylı 5 fazlı teknik plan (hangi dosya hangi prop'la
  birleşecek, sıra) `C:\Users\fonss\Claude\Projects\Fons Solar\satin-alma-finans-birlestirme-cc-prompt.md`
  dosyasında duruyor — iş gündeme gelirse oradan devam edilebilir.
- **Frontend 6/19 rolü tanıyor** (yukarı bkz.) — `ROLE_TABS`/`ROLE_LABEL`/`Sidebar.jsx`
  genişletilmeli, idealde `roles` tablosundan okunan bir izin matrisiyle.
- **`toUserMessage()` üç ayrı dosyada bağımsız tanımlı** — `DailyReportForm.jsx`,
  `FaturaOlusturModal.jsx` (2026-07-16'da eklendi), ikisi de kendi if/includes
  zincirini tekrarlıyor, ortak bir `src/utils/errors.js` yok. Yeni bir modülde
  Postgres hata çevirisi gerekirse ya bu ikisinden birine benzer yerel bir
  fonksiyon eklenir ya da bu üçü ortak bir util'e çıkarılır (kullanıcıyla
  görüşülmeden yapılmamalı, kapsamı büyütür).
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
- **Excel şablonu (`src/utils/projectExcelImport.js`) `is_critical` ve 5 yeni
  kategoriyi taşımıyor** — `CAT_MAP` hâlâ eski 10 kategoriyle sınırlı
  (`kolon_montaji`/`kiris_montaji`/`asik_montaji`/`panel_montaji`/`kosk_trafo`
  yok, bunlar Excel'den okunursa `'mekanik'`e düşer), `parseIsKalemleri()`
  `is_critical`'ı Excel'den okumuyor (`toBoolTR()` yardımcı fonksiyonu var ama
  burada kullanılmıyor). UI tarafı (`Adim2IsKalemleri.jsx`) zaten doğru — sorun
  yalnızca Excel import/export köprüsünde, round-trip veri kaybına yol açar.
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
- **`DailyReportForm.jsx`'e BOM seçimi UI'sı bağlanmadı** — `daily_report_material_usage.bom_item_id`
  FK şema seviyesinde hazır (FAZ5), form alanına henüz eklenmedi.
- **`profiles.role` / `profiles.role_key` iki ayrı kolon** — FAZ1 denetiminde
  tutarsız bulunmuştu (5 kayıttan 3'ü), düzeltildiğine dair kayıt yok — yeni
  bir görev bu alana değiyorsa önce `select id, role, role_key from profiles`
  ile doğrula.
- **RLS temizliği bekliyor:** `procurement_items`/`schedule_activities`/
  `quality_inspections`/`work_packages` hâlâ `USING(true)` (rol/proje kısıtı yok); `profiles`/
  `purchase_requests` üzerinde eski+yeni politika birikimi (`multiple_permissive_policies`)
  var. Acil değil, ileride bir RLS temizlik migration'ında ele alınmalı.
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
**16.07.2026 (4) — `project_risks`'e Kategori kolonu; risk girişi proje oluşturmadan kaldırıldı.**

Kullanıcı otomatik risk motorunun koşullarını sorup "proje oluştururken risk
eklemek mantıktan çıkıyor" dedi — netleştirme sonucu: risk girişi yalnızca
proje DÜZENLEME akışında kalsın (proje yöneticisi sahada gördüğü bir sorunu
loglar), oluşturmada tamamen kalksın; ayrıca riskleri İş Kalemi/Satın Alma/Diğer
diye 3 kategoriye ayıralım. Kullanıcı bu planı "Cowork" adlı başka bir
sistemin incelemesinden geçirip 3 düzeltmeyle geri getirdi: (1) `category`
için `manuel` yerine `diger` kullan (source kolonuyla isim çakışması), (2)
migration'dan önce project_risks'te bir RLS allow-list guard'ı olup olmadığını
kontrol et, (3) Excel'de yeni kolon mevcut F/G formüllerini kaydırmaması için
sona (J) eklenmeli. Nokta 2'yi kendim doğruladım (guard yok, sadece
`user_has_project_access` kontrolü var — Cowork'ün varsayımının aksine ek bir
migration adımı gerekmedi); nokta 1 ve 3'ü uyguladım.

**DB (2 migration, onaylı):** `project_risks.category` kolonu
(`is_kalemi`/`satin_alma`/`diger`, backfill: 11 `gorev_gecikmesi`→`is_kalemi`,
64 manuel→`diger`) + `fn_recompute_auto_risks()` artık otomatik risk
oluştururken `category`'yi de dolduruyor.

**Sihirbaz:** `Adim4Riskler.jsx`'e Kategori dropdown'ı eklendi.
`YeniProjeWizard.jsx`'ten Riskler adımı tamamen çıkarıldı (6→5 adım) —
`WizardStepper.jsx` ve `Adim8Tamamlandi.jsx`'e bunun için `labels`/`steps`
prop'u eklendi (varsayılan = eski 6 adımlık dizi, `ProjeEditWizard.jsx`
değişmeden çalışmaya devam ediyor). Bu arada `Adim8Tamamlandi.jsx`'in
hardcoded `STEPS` dizisinin yalnızca görüntüleme değil GERÇEK KAYIT
mantığını da sürdüğü fark edildi — düzeltilmeseydi yeni 5-adımlı akışta
Tedarik verisi `project_risks` tablosuna yazılacaktı ve Bütçe hiç
kaydedilmeyecekti (gerçek bir bug, zamanında yakalandı).

**Excel + edge fonksiyonlar (prod deploy):** `template_builder.ts`'e Riskler
sayfasına J (Kategori) kolonu + dropdown eklendi; `export-project-excel`
(v8→v9) bunu yazıyor; `import-project-excel` (v7→v8) proje YENİ oluşturuluyorsa
Riskler sayfasını hiç okumuyor, güncellemede okuyup `category`'yi
`riskCategoryToCode()` ile eşliyor. Statik `public/excel/fons-solar-proje-sablonu.xlsx`
dosyasına da aynı J kolonu eklendi — `xlsx` paketi (bu projenin gerçek
bağımlılığı) açılır liste desteklemediği için `exceljs` geçici olarak
(`--no-save`) kurulup iş bitince kaldırıldı, `package.json`/`package-lock.json`
değişmedi.

Doğrulama: `npx vite build` hatasız. Gerçek edge fonksiyon çağrısıyla uçtan
uca doğrulama (geçici test projesi + gerçek admin oturumu, Excel dosyası
`exceljs` ile bellekte oluşturulup `import-project-excel`'e POST edildi):
yeni proje oluşturulurken Riskler sayfası atlandı (log doğrulandı) ama
otomatik risk motoru YİNE DE çalıştı (test görevinin planlı bitişi geçmişti)
ve doğru `category='is_kalemi'` ile risk oluşturdu — Migration 2'yi de bonus
doğruladı; aynı proje güncellenirken Riskler satırı gerçekten aktarıldı,
`category='is_kalemi'` doğru eşlendi. Playwright ile ayrıca: Yeni Proje
sihirbazında (Manuel doldur) Riskler adımı yok, Proje Düzenle'de Kategori
seçici var. Tüm test verisi/dosyaları temizlendi.

Commit'lenmedi. Repo hâlâ origin/main'in ilerisinde; bu turun + bu oturumdaki
önceki turların (Genel Proje redesign, günlük rapor↔ticket bağlantısı, satın
alma proje yöneticisi tedarik katmanı, .md temizliği + Excel şablonu yeniden
adlandırma/entegrasyonu — bkz. Tamamlanan büyük görevler) commit'lenmemiş
çalışma-alanı değişiklikleri birikmiş durumda. Kullanıcı henüz elle test
etmedi, hepsini birlikte kontrol edecek.
