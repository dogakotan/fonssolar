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
  (task_id bazlı) beslenir.
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

### Roller (19, `roles` tablosunda tanımlı — `select key, display_name, is_manager, cross_project from roles`)
admin, koordinator, proje_koordinatoru, muhendis, proje_tasarim_sorumlusu,
santiye_sefi, proje_kurulum_sefi, elektrik_sefi, mekanik_sef, isg_sorumlusu,
kalite_kontrol_sefi, lojistik_tedarik, satin_alma_uzmani, enh_sorumlusu,
operasyon_sorumlusu, evrak_takip, maliyet_kontrolcu, muhasebe, is_makinesi_operator

`is_manager=true`: admin, koordinator, proje_koordinatoru, maliyet_kontrolcu,
muhasebe (tüm yönetici bildirimlerini alır, `has_project_access` her projeye
izin verir). `cross_project=true`: satin_alma_uzmani, lojistik_tedarik (tek
projeye bağlı değil ama manager de değil).

**Bilinen fark:** Frontend hâlâ yalnızca 6 rolü tanıyor (`ROLE_TABS`/`ROLE_LABEL`
`src/pages/dashboard/index.jsx`, nav `Sidebar.jsx`) — admin, muhasebe,
santiye_sefi, muhendis, koordinator, satin_alma_uzmani. Diğer 13 rolle giren
bir kullanıcı kısıtsız `TabGenel` görür ama sidebar'da o rol için tanımlı nav
item'ı yoksa gezinemez.

### RPC katmanı (canlı)

**Okuma:** `get_dashboard_summary(p_project_id)`, `get_project_gantt(p_project_id, p_filter_date)`,
`get_project_dashboard(p_project_id, p_effective_date)`, `get_daily_report_detail(p_report_id)`,
`get_daily_reports_list(p_project_id, p_start_date, p_end_date, p_page, p_page_size)`,
`get_proje_detay(p_project_id)`, `get_santiye_dashboard(p_project_id, p_today)`, `get_project_by_date(p_project_id, p_date)`,
`get_satin_alma_overview(p_project_id)`, `get_satin_alma_overview_all()`,
`get_finans_overview(p_project_id, p_as_of_date)`, `get_finans_overview_all(p_as_of_date)`,
`get_delayed_tasks_scoped(p_project_id)`, `get_my_role()`, `get_my_projects()`.

**Yazma:** `create_purchase_request_with_items(p_project_id, p_title, p_urgency, p_request_note, p_requested_by, p_items, p_category)`,
`save_daily_report(p_project_id, p_report_date, p_created_by, p_general_status, p_worker_count, p_weather, p_weather_note, p_notes, p_personnel, p_machinery, p_progress, p_daily_tasks, p_materials, p_issues, p_task_progress)`
— tek overload (eski 11/14 parametreli overload'lar kaldırıldı). `p_progress`
artık gövdece kullanılmıyor (geriye dönük DEFAULT'lu param); ilerleme yalnızca
`p_task_progress: [{task_id, qty_added, note}]` ile giriliyor. `update_procurement_status(...)`.

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
eklenen 3 kolon: `source` (`'manuel'|'otomatik'`), `rule_code`
(`'gorev_gecikmesi'|'malzeme_fazla_talep'|null`), `subject_ref` (görev kodu ya
da BOM kalem id'si). Koşul düzelince risk kendiliğinden `'kapatıldı'` olur —
frontend'de bunları elle kapatan bir buton YOK (hiç risk yönetim ekranı yok,
bkz. Bilinen açık noktalar), o yüzden "otomatik risklerde kapat butonunu gizle"
gibi bir UI kararı da gerekmiyor.

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
Örnek şablon dosyası `fons-solar-proje-sablonu-v6.xlsx` (`public/excel/`) —
tek "İş Kalemleri" sayfası (ayrı "İlerleme Kalemleri" sayfası yok), Birim,
Hedef Miktar, Dashboard Göster, Dashboard Sıra kolonları `project_tasks`'ın
karşılığı kolonlarına eşleniyor. `template_builder.ts` (Deno, `export-project-excel`/
`import-project-excel` edge fonksiyonları, v7) ve istemci tarafı basit sihirbaz
şablonu (`src/utils/projectExcelImport.js`) ikisi de bu tek-sayfa modelde;
frontend Excel üretmiyor, edge fonksiyonlarla ilgilenmesi gerekmiyor. Proje
oluşturma/düzenleme sihirbazı 6 adım: İş Kalemleri (Adım 2, ilerleme hedefi +
kategori dropdown'ı 15 değer + "Kritik Yol" checkbox'ı da burada) → Riskler →
Tedarik → Bütçe → Tamamlandı. Ayrı bir "Kritik Yol" adımı YOK (eskiden
`critical_path_items`'a yazan `Adim7KritikYol.jsx` vardı, tablo DB'den
kaldırılınca dosyayla birlikte silindi).

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

## Bilinen açık noktalar / ertelenmiş kararlar
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
  Genel sayfalar ölü kod DEĞİL — `satin_alma_uzmani`/`muhasebe` rolleri için tek
  arayüz. Birleştirme planı netleşmiş ama kullanıcı isteğiyle ertelendi, açıkça
  istenmeden yapma.
- **Frontend 6/19 rolü tanıyor** (yukarı bkz.) — `ROLE_TABS`/`ROLE_LABEL`/`Sidebar.jsx`
  genişletilmeli, idealde `roles` tablosundan okunan bir izin matrisiyle.
- **Kalite denetimi modülü hiç arayüzü yok** — `quality_inspections` tablosu
  var (0 satır, RLS `USING(true)`, rol/proje kısıtı yok), sıfırdan yazılması
  gerekiyor. (`mechanical_checklist`/`electrical_checklist` tabloları — aynı
  gruptaki mekanik/elektrik checklist'ler — DB'den tamamen kaldırıldı, bu artık
  onlar için geçerli değil.)
- **`work_packages`, `schedule_activities` yetim tablolar** — hiçbir dosyada
  kullanılmıyor, şema var arayüz/veri yok. (`critical_path_predecessors` aynı
  gruptaydı, artık DB'de yok.)
- **`TabGenel.jsx` iki ayrı bileşen barındırıyor** — `ProjectListView` ("Genel
  Bakış" sekmesinde görünen, `get_dashboard_summary`/`get_delayed_tasks_scoped`
  kullanan özet ekran) ve `ProjectDashboard` (Kritik Yol KPI'sı, S-Eğrisi,
  kategori ağırlıkları breakdown'ı, Kalite kartı, Açık Riskler detay kartı —
  `get_project_dashboard`'ın tek tüketicisi). `TabGenel`'in varsayılan export'u
  `projectId` prop'u doluysa `ProjectDashboard`'ı render ediyor. Bu ikisi farklı
  yollardan erişiliyor: `ProjectListView`'a "Genel Bakış" sekmesinden
  (`scopeProjectId` ile), `ProjectDashboard`'a ise `ProjeDetay.jsx`'in **"Proje
  Paneli"** sekmesinden (`<TabGenel projectId={projectId} filterDate={filterDate} />`)
  ulaşılıyor — `ProjeDetay.jsx`'in kendi "Genel Proje" sekmesi (`ProjectOverviewDashboard`)
  farklı, daha sade bir özet gösterir; ikisi kasıtlı olarak yan yana duruyor,
  birleştirilmedi. (Bu bileşen daha önce hiçbir yerden mount edilmiyordu —
  2026-07-14'te "Proje Paneli" sekmesiyle bağlandı. O sırada iki gerçek bug da
  düzeltildi: kritik yol zaman çizelgesi RPC'nin döndürdüğü `task_code`/`task_name`
  yerine eski `path_code`/`activity_name` okuyordu; "Genel İlerleme" donut'u
  kanonik `projects.progress` yerine kendi item-bazlı basit ortalamasını
  hesaplıyordu — artık `data.project.progress` kullanıyor, diğer ekranlarla
  aynı sayıyı gösteriyor.)
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
**DB sağlamlık denetiminde DB-NF-003/004/005 ele alındı.**

**DB-NF-003 (fatura↔satın alma çift yönlü ilişki) — düzeltildi.**
`invoices.purchase_request_id` (tek gerçek kaynak, yalnızca
`FaturaOlusturModal.jsx` INSERT'te yazıyor) ile `purchase_requests.invoice_id`
(tamamen `sync_purchase_request_from_invoice()` trigger'ıyla aynalanan alan)
arasındaki aynalamayı hiçbir DB constraint'i garanti etmiyordu. Eklenen:
`fn_guard_purchase_request_invoice_id()` + `trg_guard_purchase_request_invoice_id`
(`BEFORE UPDATE OF invoice_id ON purchase_requests`) — kolona yapılan HER
yazma gerçek `invoices` durumundan yeniden hesaplanıp üzerine yazılıyor, drift
artık imkansız. Migration: `db_nf_003_invoice_purchase_request_link_integrity`.
Yol boyunca kendi hatam: önerdiğim "aynı anda yalnızca bir aktif fatura" kısmi
unique index'i zaten DB-INT-003'te (2026-07-14) eklenmişti
(`invoices_active_purchase_request_id_unique`) — mevcut migration geçmişini
taramadan yeni SQL önerdim, mükerrer index oluşup ayrı bir migration'la
(`db_nf_003_drop_duplicate_active_invoice_index`) geri alındı (bkz. memory
`feedback_check_migrations_before_new_constraint`). Test: gerçek PR+fatura ile
(A) ikinci aktif fatura → unique violation, (B) ret sonrası yeniden faturalama
akışı bozulmadı, (C) `invoice_id`'ye bozuk değer yazımı guard trigger'la
self-heal etti; test verisi temizlendi.

**DB-NF-004 (türetilmiş finans alanları) — audit dosyasının yanlış pozitifi,
yapılacak iş yoktu.** `invoices.vat_amount`/`total_amount` ve
`purchase_request_items.total_price` zaten orijinal şemadan beri (2026-06-17)
`GENERATED ALWAYS AS` kolonu — gerçek INSERT ile doğrulandı (Postgres açık
değer yazımını reddediyor). Frontend'in üç yazma noktası da bu alanları hiç
göndermiyor.

**DB-NF-005 (procurement_items.quantity text sorunu) — DB kısmı kullanıcı
kararıyla ertelendi, ama araştırma sırasında aktif bir veri kaybı hatası bulunup
düzeltildi.** `Adim5Tedarik.jsx` (proje sihirbazı "Tedarik" adımı, hem yeni
proje hem `ProjeEditWizard` düzenleme akışı) `procurement_items` payload'ında
yalnızca `quantity` (text) gönderiyordu, kanonik `planned_qty` (numeric) hiç
yazılmıyordu — bu alanı senkronlayan hiçbir trigger da yok. Sonuç: sihirbazın
"Tedarik" adımını açıp kaydetmek (değer değiştirmeden bile) o projenin TÜM BOM
kalemlerinin `planned_qty`'sini sessizce NULL'a düşürüyordu (`directSave`/
`Adim8Tamamlandi.jsx` önce siliyor sonra bu eksik payload'ı ekliyor) —
Satın Alma Riski hesabını (`classifyMaterials`/`riskState`) ve
`get_satin_alma_overview*`'ı bozacaktı. Düzeltme: `Adim5Tedarik.jsx`'e
`planned_qty: r.quantity ? toNumber(r.quantity) : null` eklendi. Gerçek
tarayıcıda (admin, İzmir, ProjeEditWizard → Tedarik → Kaydet) test edildi,
save sonrası `planned_qty` DB'de korunduğu doğrulandı.

**procurement_items ölü teslimat kolonları/durum değerleri temizlendi.**
Kullanıcı tedarik/teslimat takibiyle şu an ilgilenmediğini belirtti; grep ile
`shortage_notes`/`damage_notes` kolonlarının ve `kısmi_teslim`/`hasarlı` status
değerlerinin frontend'de hiç okunmadığı/yazılmadığı (0 satırda veri) doğrulandı.
Migration: `db_nf_005_drop_unused_procurement_delivery_fields` — iki kolon
DROP edildi, `procurement_items_status_check` 7 değerden 5'e daraltıldı.
Formdaki "Durum" dropdown'ına ve teslimat tarihi alanlarına kasıtlı
dokunulmadı — kullanıcı bu akışı ayrı bir görevde baştan tasarlayacak (bkz.
Bilinen açık noktalar).

**DB-PERF-002/003 (RLS initplan + çakışan permissive politikalar) tamamlandı —
denetimin son maddesi.** Resmi Supabase advisor kapsamıyla sınırlı tutuldu
(kullanıcı kararı): 38 policy/15 tabloda `auth.uid()` çağrıları
`(select auth.uid())` ile sarmalandı (`get_my_role()`/`has_project_access()`
gibi özel fonksiyonlar — advisor'ın raporlamadığı ek ~67 policy — kapsam dışı
bırakıldı). 6 çakışan-permissive-policy çifti birleştirildi
(agent_reports/profiles/purchase_requests×2/roles/user_project_access).
`projects`/`roles`'ta admin'in `ALL` yetkisi `SELECT`'e körü körüne OR'lanmadı
(bu, admin olmayanlara yanlışlıkla yazma yetkisi sızdırırdı) — 3 ayrı
yazma-komutu policy'sine bölündü, net yetkiler birebir korundu. Migration:
`db_perf_002_003_rls_initplan_and_policy_consolidation`. `get_advisors`
sonrası 0 initplan/çakışma kaldı; Playwright tam paket (admin + santiye_sefi
gerçek girişli Test A dahil) geçti.

Playwright tam regresyon paketi çalıştırıldı: test A ilk seferinde kapsam-seçici
zamanlama nedeniyle flaky başarısız oldu, izole tekrar denemede geçti
(değişikliklerle ilgisiz); test B bilinen flaky sorunuyla beklenen şekilde
başarısız oldu; kalan 5 test (procurement_items temizliği ve RLS migration'ı
sonrası da dahil) geçti. **Commit/push yapılmadı** — bu oturumdaki DB
değişiklikleri migration olarak canlıda, repo tarafında yalnızca CLAUDE.md +
`Adim5Tedarik.jsx`.

**Denetim dosyasının kendisi de tam olarak güncellendi** (kullanıcı isteğiyle:
"denetim dosyasında yapmadığımız şey kalmasın"): her maddenin durumu
(DB-NF-003/004/005, DB-PERF-002/003) doğrulanmış detaylarla işaretlendi;
Bölüm 9'daki Faz 0-4 checklist'i madde madde gerçek kanıtla (migration/test/
kod okuması) doğrulanıp işaretlendi; Bölüm 12'deki "Yeniden İnceleme Şablonu"
gerçek ölçülmüş sayılarla dolduruldu (advisor + doğrudan SQL); Bölüm 11'e
değişiklik günlüğü kayıtları eklendi.

**Bu tarama sırasında yeni, canlı bir güvenlik açığı bulunup düzeltildi
(DB-SEC-002-FOLLOWUP):** `get_project_dashboard` RPC'sinin gövdesinde HİÇ
proje-erişim kontrolü yoktu — DB-SEC-002'nin orijinal "riskli örnekler"
listesinde bu açıkça vardı ama 2026-07-14'teki grant-revoke turu yalnızca
"kim çağırabilir" (anon EXECUTE) sorununu kapatmış, fonksiyonun kendi içindeki
kontrol eksikliğini atlamıştı (CLAUDE.md'de de yalnızca bir not olarak
bırakılmıştı). Sonuç: herhangi bir `authenticated` kullanıcı, erişimi olmayan
bir projenin `p_project_id`'siyle bu RPC'yi çağırıp bütçe/fatura/risk/personel
verisini görebiliyordu. Diğer proje-bazlı RPC'lerin kullandığı
`get_project_scope`/`authorized` deseni eklendi (migration:
`db_sec_007_add_project_scope_check_to_get_project_dashboard`), mevcut
alanlar/mantık aynen korundu. Gerçek girişle test edildi: admin İzmir VE
Kayseri'yi görebildi; İzmir'e bağlı santiye_sefi Kayseri'nin dashboard'unu
çağırınca `authorized:false` + veri yok, kendi projesini normal gördü.
Frontend (`TabGenel.jsx`) zaten `|| []`/`|| null` kullandığından çökme yok.

**Denetim durumu:** `fons-solar-veritabani-saglamlik-denetimi.md`'deki tüm
P0/P1/P2 maddeleri artık ya Doğrulandı ya bilinçli olarak ertelendi/kapsam
dışı — geriye yalnızca DB-SEC-006 (leaked password protection) kaldı.
Kullanıcı Dashboard'dan denedi, Supabase "Pro plan ve üzeri gerekiyor"
diyerek reddetti (proje Free plan'da) — Claude Code kapsamı dışı olmanın
ötesinde, plan yükseltmesi olmadan teknik olarak imkansız. Kullanıcı bunu
kısıt olarak kabul etti, denetim dosyasında böyle belgelendi.
