# Fons Solar — GES Dashboard

Fons Solar GES (güneş enerji santrali) uçtan uca proje takip sistemi.
Backend Supabase (proje ref `bshhgvdzemgfijkzhcrf`, `eu-central-2`, PostgreSQL 17),
frontend bu repodaki React + Vite (JS, TypeScript değil) uygulaması (`src/`).

Bu dosya projenin **tek** CLAUDE.md'sidir (önceden hem kök dizinde hem
`.claude/` altında ayrı ayrı vardı, 2026-07-13'te tekilleştirildi). Hem sabit
kuralları hem de sistemin güncel durumunu tutar — **"Sistem Durumu" bölümünü
şema/mimari değiştiren her görevin sonunda güncelle**, eskimiş satırları silip
yeniden yaz (kronolojik arşiv değil, güncel anlık durum).

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
   kontrol edilir (`user_has_project_access`/`user_can_access_report` artık
   buna delege eder — bkz. Sistem Durumu).
6. **Atomiklik.** Çoklu tabloya yazan formlar tek RPC ile atomik olmalı
   (`save_daily_report`, `create_purchase_request_with_items` deseni).
7. Şema değişikliğinde kullanıcıya `fons_solar_sistem_dokumantasyonu.docx` ve
   `fons_solar_veritabani_dokumantasyonu.docx` dosyalarının güncellenmesi gerektiğini hatırlat (varsa).

### Kod tarama notu — supabase.from() sayımı
`grep -rn "supabase\.from(" src/` **tek satırlık** desendir ve kodda zincirleme
çağrının `supabase` ile `.from(` farklı satırlara bölündüğü durumları
(`supabase\n  .from('table')`) kaçırır — canlı veri görevinin Dilim 8
kapanışında bu yüzden 162 yerine gerçek sayının 221 olduğu ortaya çıktı.
Bundan sonra `supabase.from()` taraması yapılırken **çok satırlı** bir desen
kullanılmalı: Grep tool'da `pattern: "supabase\\s*\\.\\s*from\\("` +
`multiline: true`, veya kabuktan `rg -U --multiline-dotall 'supabase\s*\.\s*from\('`.
Tek satırlık sonuçlara güvenip "kalan iş listesi tam" sonucuna varma.

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
  eden kod var (bkz. Sistem Durumu → bilinen açık noktalar).
- Auth: `src/context/AuthContext.jsx` — `get_my_role()`/`get_my_projects()`
  RPC'lerinden `role`, `isAdmin`, `projectId` sağlar. `isAdmin` KESİNLİKLE
  `role === 'admin'` olmalı. Kapsam seçici (`src/context/ScopeContext.jsx`,
  header'da) yönetici rollerine tek-proje/Tüm Projeler geçişi sağlar.
- Veri çekme: ortak `src/hooks/useDashboardData.js` (loading/refreshing/error +
  visibilitychange'de tazeleme) ve `src/hooks/useRealtimeRefresh.js` (ekran
  başına tek Supabase Realtime kanalı, 2sn debounce, 60sn polling yedeği) —
  yeni bir dashboard ekranı yazılıyorsa önce bunları kullan, ham `useEffect`
  tekrarlama.
- Saha ekranları (`SantiyeSefiDashboard.jsx`, `DailyReportForm.jsx`,
  `DailyReportList.jsx`) mobil öncelikli olmalı — santiye_sefi rolü telefondan
  kullanır. `DailyReportForm.jsx` 2026-07-13'te 9 bölümlü liste + slide-over
  panel (masaüstü sağdan / mobil bottom-sheet) modeline geçirildi.

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

### RPC katmanı (canlı, `execute_sql` ile 2026-07-13'te doğrulandı)

**Okuma:** `get_dashboard_summary(p_project_id)`, `get_project_overview(p_project_id, p_start_date, p_end_date)`,
`get_project_gantt(p_project_id, p_filter_date)`, `get_project_dashboard(p_project_id, p_effective_date)`,
`get_daily_report_detail(p_report_id)`, `get_daily_reports_list(p_project_id, p_start_date, p_end_date, p_page, p_page_size)`,
`get_proje_detay(p_project_id)`, `get_santiye_dashboard(p_project_id, p_today)`, `get_project_by_date(p_project_id, p_date)`,
`get_satin_alma_overview(p_project_id)`, `get_satin_alma_overview_all()`,
`get_finans_overview(p_project_id, p_as_of_date)`, `get_finans_overview_all(p_as_of_date)`,
`get_delayed_tasks_scoped(p_project_id)`, `get_my_role()`, `get_my_projects()`,
`get_project_progress_export(p_project_id, p_period)` (bkz. açık noktalar — artık çağrılmıyor).

**Yazma:** `create_purchase_request_with_items(p_project_id, p_title, p_urgency, p_request_note, p_requested_by, p_items, p_category)`,
`save_daily_report(p_project_id, p_report_date, p_created_by, p_general_status, p_worker_count, p_weather, p_weather_note, p_notes, p_personnel, p_machinery, p_progress, p_daily_tasks, p_materials, p_issues)`
(eski 11 parametreli overload hâlâ DB'de duruyor, kullanılmıyor — bkz. açık noktalar),
`increment_progress_total(p_item_id, p_qty)`, `update_procurement_status(...)`.

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
`src/components/ui/NotificationBell.jsx`.

**Trigger zincirleri (frontend bunları yeniden hesaplamamalı):**
- `daily_reports` → `progress_daily` INSERT/UPDATE/DELETE → `update_task_progress_pct()` + `sync_progress_item_total()` → `progress_items.total_progress`, `project_tasks.progress_pct` otomatik güncellenir → `fn_sync_project_progress()` ile `projects` seviyesine yansır.
- `invoices` INSERT → `create_invoice_approval_chain()` → status'u `muhasebe_onayında` yapar + `invoice_approvals` step1 açar; step onaylanınca (`fn_invoice_approval_cascade`) step2 → `yönetici_onayında` → `ödendi` ilerler. INSERT/UPDATE ayrıca `sync_purchase_request_from_invoice()` ile bağlı `purchase_requests.status`'unu senkronlar ve (onaylandı/ödendi → upsert, reddedildi → sil) `trg_invoice_cost_allocation` ile `cost_allocations`'ı günceller.
- `purchase_requests` UPDATE → `handle_purchase_request_approval()`.
- `tickets` UPDATE → `fn_ticket_history()` → `ticket_history`'ye otomatik log.
- Yukarıdaki dört tablo + `daily_reports`/`purchase_requests`/`invoices`/`tickets`/`ticket_comments` INSERT/status değişimi → bildirim trigger'ları (bkz. yukarı).
- `pg_cron` (jobid=1, `0 6 * * 1-5` — yalnızca hafta içi) → `create_daily_report_reminders()`:
  o gün `daily_reports` girilmemiş her `santiye_sefi` için `notifications`'a
  `entity_type='daily_report_reminder'`/`event_type='pending'` satırı ekler
  (başlıkta günün tarihi). `daily_reports` INSERT/UPDATE trigger'ı
  (`trg_resolve_daily_report_reminder` → `resolve_daily_report_reminder()`)
  o günün raporu girilince aynı satırı `event_type='resolved'` yapar. UI
  rengi (`NotificationBell.jsx`/`TabBildirimler.jsx` → `reminderTone()`):
  okunmamış+pending sarı, okunmuş+pending normal, resolved yeşil.

**"Gerçekleşen maliyet" kanonik tanımı:** `invoices.status IN ('onaylandı','ödendi')`,
tutar = `total_amount` (KDV dahil). `get_dashboard_summary.spent_amount`,
`get_finans_overview(_all).totalActual` ve `sum(cost_allocations.amount)` bu
tanımla hizalı olmalı — birinde sapma görülürse regresyon say.

### Modül → tablo haritası (34 tablo + 7 view + `notifications`)
| Modül | Tablolar |
|---|---|
| Proje yönetimi | projects, project_tasks, work_packages¹, critical_path_items, critical_path_predecessors¹, schedule_activities¹, project_risks |
| Günlük saha raporlama | daily_reports, daily_tasks, personnel_log_entries, machinery_logs, daily_report_photos, daily_report_issues, daily_report_material_usage |
| İmalat ilerlemesi | progress_items, progress_daily |
| Satın alma (7 adım) | purchase_requests, purchase_request_items, purchase_request_status_log |
| Fatura ve maliyet | invoices, invoice_approvals, suppliers, budget_lines, cost_allocations |
| Teknik kontrol¹ | mechanical_checklist, electrical_checklist, quality_inspections |
| Kullanıcı yönetimi | roles, profiles, user_project_access |
| Bildirim | notifications |
| Destek / diğer | tickets, ticket_comments, ticket_history, agent_reports, procurement_items |

¹ Yetim/arayüzsüz — bkz. Sistem Durumu → bilinen açık noktalar.

View'lar: `project_cost_summary`, `personnel_logs`, `vw_delayed_tasks`, `vw_monthly_progress`,
`vw_progress_timeline`, `vw_project_progress_summary`, `vw_weekly_progress` —
2026-07-09'da `security_invoker=on` verildi (önceden hepsi SECURITY DEFINER'dı,
anon RLS bypass açığı kapatıldı).

### Test ortamı
5 profil, 2 proje: "Ege Enerji İzmir GES – TEST" (`test-izmir-ges-2026`) ve
"Kayseri Develi GES" (`test-kayseri-develi-ges`). Canlı müşteri verisi yok.
`tests/faz-e.spec.js` + `playwright.config.js` + `tests/helpers.js` — kalıcı
Playwright regresyon suite'i (`npm run test:e2e`), kimlik bilgileri `.env.test`'te
(gitignore'da). **Credential değerleri (şifre/token) hiçbir zaman chat metnine
yazılmaz** — test hesabı olsa bile, canlı Supabase projesine gerçek erişimi var.
Admin test hesabının `profiles.id`'si zaman zaman değişti — körü körüne eski
id'ye güvenme, `select id from profiles where role_key='admin'` ile doğrula.

---

## Sistem Durumu (sürekli güncellenir — en son buradan devam et)

### En son değişiklik
**2026-07-13 — "İş kalemi"/"ilerleme kalemi" tekilleştirme görevinin son iki parçası
tamamlandı: Excel şablonu birleştirme + `progress_items` temizlik migration'ı.
`progress_items` tablosu artık DB'de yok — tekilleştirme görevi tamamen kapandı.**

**Excel şablonu birleştirme (frontend + 2 edge function):**
- `template_builder.ts` (v4 detaylı proje şablonu, `export-project-excel`/`import-project-excel`
  edge fonksiyonlarının paylaştığı dosya): ayrı "İlerleme Kalemleri" sayfası tamamen kaldırıldı,
  "İş Kalemleri" sayfasına 4 kolon eklendi (N=Birim, O=Hedef Miktar, P=Dashboard Göster,
  Q=Dashboard Sıra — `project_tasks`'ın Migration A/B'de zaten sahip olduğu kolonlar).
  Sonraki adımlar (Riskler/Bütçe/Kritik Yol/Malzeme Listesi/Checklist) Adım 3-8'den Adım
  3-7'ye kaydı, "Kullanım Kılavuzu" sayfası buna göre güncellendi.
- `export-project-excel`/`import-project-excel` (Deno edge functions, `progress_items`
  fetch/upsert'i tamamen kaldırıldı, İş Kalemleri satırına unit/target_qty/dashboard_visible/
  dashboard_order eklendi) — her ikisi de deploy edildi (v4), Kayseri projesiyle canlı
  export→re-import round-trip testi yapıldı: `project_tasks: {inserted:0, updated:14}`,
  DB state export öncesi/sonrası birebir aynı.
- İstemci tarafı basit sihirbaz şablonu (`src/utils/projectExcelImport.js`): `parseIsKalemleri`
  ve `parseIlerlemeBilgileri` tek fonksiyonda birleşti (aynı 4 yeni alan eklendi),
  `downloadProjectTemplate()` tek sayfaya indirildi.
- Proje oluşturma/düzenleme sihirbazı: `Adim3IlerlemeBilgileri.jsx` **tamamen silindi**;
  `Adim2IsKalemleri.jsx`'e Birim/Hedef Miktar/Dashboard Sırası/Dashboard'da Göster alanları
  eklendi (her görev kartının altına "Ölçülebilir İlerleme Hedefi (opsiyonel)" bölümü olarak).
  `WizardStepper.jsx`/`YeniProjeWizard.jsx`/`ProjeEditWizard.jsx`/`Adim8Tamamlandi.jsx` 8
  adımdan 7 adıma yeniden numaralandırıldı (Riskler/Tedarik/Bütçe/Kritik Yol/Tamamlandı
  4→3, 5→4, 6→5, 7→6, 8→7 kaydı; her adımın kendi `<h3>Adım N —...` başlığı da güncellendi).
  Playwright ile Kayseri projesini düzenleme modunda açıp doğrulandı: stepper doğru 7 adımı
  gösteriyor, İş Kalemleri kartlarında yeni alanlar mevcut satır verisiyle (örn. mevcut
  target_qty/unit) doğru render ediyor.

**Temizlik migration'ı (2 ayrı migration, ikisi de kullanıcı onayıyla, aradaki bağımlılık
hatası nedeniyle):** Migration 1 önce başarısız oldu (`update_task_progress_from_item()`
düşürülmeye çalışılırken `progress_items` üzerindeki `trg_progress_item_update_task` hâlâ
ona bağımlıydı — plpgsql gövdeleri opak olduğu için CASCADE bunu önceden düşürmüyordu, sıra
düzeltilip tekrar denendi: önce tablo `CASCADE` ile düşürülüp bağımlı trigger'ı da beraber
götürsün, SONRA fonksiyonlar). İkinci deneme `increment_progress_total()` için yanlış
imza yüzünden başarısız oldu (`(uuid, numeric)` imzası varmış, parametresiz sanılmıştı) —
düzeltilip üçüncü denemede başarıyla uygulandı. **Onay öncesi kullanıcının istediği bağımlılık
taraması** (`pg_depend` + `information_schema.view_table_usage`) `vw_progress_timeline`'ın
gerçekten `progress_items`'a katalog-seviyesinde bağımlı olduğunu doğruladı — CASCADE ile
düştü, ama onu kullanan tek iki fonksiyon (`get_project_overview`, `get_project_progress_export`)
zaten önceden doğrulanmış orphan RPC'lerdi, canlı hiçbir etkisi olmadı.

Uygulanan: `get_daily_report_detail()` güncellendi (`progress` bloğu artık salt `project_tasks`
okuyor — `progress_items` LEFT JOIN kaldırıldı; `materials` bloğu `progress_item_id`/
`progress_items` referansı kaldırıldı) → `daily_report_material_usage.progress_item_id`
kolonu (FK'siyle) düşürüldü → `progress_daily` üzerindeki 3 eski (zaten disabled) trigger
(`trg_progress_daily_update_task`, `trg_set_task_actual_start`, `trg_sync_item_total`)
kaldırıldı → `progress_items` tablosu `CASCADE` ile düşürüldü (`progress_daily.item_id`
KOLONU kalır, sadece FK constraint'i gider — geçmiş veri korundu; `trg_progress_item_update_task`
ve `vw_progress_timeline` beraber gitti) → 4 eski trigger fonksiyonu
(`update_task_progress_pct`, `sync_progress_item_total`, `update_task_progress_from_item`,
`fn_set_task_actual_start`) + 2 dead fonksiyon (`sync_progress_total`,
`increment_progress_total(uuid,numeric)`) düşürüldü → eski `save_daily_report` overload'ları
(11 parametreli VE 14 parametreli — ikisi de, 11'lisi keşif sırasında ek bulunmuştu) düşürüldü.

**Migration sonrası bulunan ve hemen düzeltilen bir regresyon:** Playwright ile günlük
rapor gönderme akışı test edilirken canlı (15 parametreli) `save_daily_report` **400
hatasıyla kırıldı** — `daily_report_material_usage` insert bloğu hâlâ (artık düşürülmüş)
`progress_item_id` kolonuna yazmaya çalışıyordu (INSERT'in kolon listesi statik SQL'de sabit,
`p_materials` boş gönderilse bile Postgres kolonun var olmadığını görüp tüm ifadeyi reddediyor).
Ayrı bir onayla (kullanıcı "yes") acil düzeltme migration'ı uygulandı: aynı fonksiyon,
materyal-insert bloğundan yalnızca `progress_item_id` kolonu/değeri çıkarıldı, geri kalan
her şey birebir aynı. Sonrasında hem günlük rapor gönderme (network response 200, hata yok)
hem `get_daily_report_detail` (gerçek authenticated RPC çağrısıyla — bir raporun 15
`progress` satırı `project_tasks`'tan doğru nested `progress_items` JSON'ı üretti; `materials`
bloğu da hatasız boş dizi döndü) Playwright/Node script ile doğrulandı. Test artığı boş
günlük rapor satırı temizlendi.

**Ek düzeltme (aynı oturumda, tabloyu düşürmeden önce):** `TabProjeYonetimi.jsx`'in proje
silme akışındaki `SUB_TABLES` dizisinden `'progress_items'` çıkarıldı (yoksa proje silme
artık var olmayan bir tabloyu silmeye çalışıp hata verirdi). Ayrıca 3 dosyadaki
(`useSantiyeData.js`, `DailyReportDetail.jsx`, `ProjectOverviewDashboard.jsx`) Realtime
subscription dizilerinden de `'progress_items'` çıkarıldı (tablo `supabase_realtime`
publication'ından zaten otomatik düştüğü için anlamsız kalmıştı).

**Tekilleştirme görevi artık TAMAMEN kapandı** — `progress_items` tablosu, ona bağlı 4 eski
trigger, 2 dead fonksiyon, eski 2 `save_daily_report` overload'ı ve `vw_progress_timeline`
DB'de yok; canlı akışın hiçbir yeri artık bu isimlere değmiyor. `mcp__claude_ai_Supabase__list_migrations`
ile migration geçmişi: Migration A/B/C (önceki oturum) → kategori-ağırlıklı ilerleme (bu
oturum, önceki kayıt) → Excel/wizard cutover → temizlik migration'ı → save_daily_report
düzeltmesi.

### Önceki değişiklik
**2026-07-13 — Proje geneli ilerleme yüzdesi süre-ağırlıklıdan kategori-ağırlıklıya
geçirildi (`project_category_weights` + `fn_sync_project_progress()` rewrite) — ayrıca
bu iş sırasında `progress_items`/`progress_daily.item_id` üzerinde 6 dosyada donmuş
client-side veri tekrarı bulunup düzeltildi.**

**Backend (5 migration, sırayla uygulandı):** (1) `task_category` enum'una
`kolon_montaji, kiris_montaji, asik_montaji, panel_montaji, kosk_trafo` eklendi
(ayrı transaction, aynı migration'da kullanılmadı). (2) Yeni tablo
`project_category_weights(project_id, category, weight_pct)` — RLS: yalnızca
`has_project_access` ile **SELECT** (yazma arayüzü yok, şimdilik yalnızca SQL ile
yönetiliyor — ayrı bir görev). (3) İki test projesindeki `mekanik` görevleri 4 alt
kategoriye ayrıldı (`Kolon Noktalama/Rok Delgi Islemi/Kolon Cakim Islemi→kolon_montaji`,
`Kiris Montaji→kiris_montaji`, `Asik Montaji→asik_montaji`, `Panel Montaji→panel_montaji`)
+ İzmir'deki "Kosk ve Trafo Konumlandirma"/"Trafo Enerjilendirme" `elektrik_og`'dan
`kosk_trafo`'ya taşındı (Kayseri'de trafo aşamasına gelinmediği için o kategori orada
boş kaldı — kasıtlı, kullanıcı onaylı). (4) İki proje için 10'ar satır ağırlık seed'i
girildi (toplam %100: panel_montaji 20, kolon/kiris/asik/elektrik_dc/ac/og/devreye_alma
10'ar, kosk_trafo/topraklama 5'er; mobilizasyon/enh/evrak_sureci/satin_alma hesaba
dahil değil — satır yok). (5) `fn_sync_project_progress()` yeniden yazıldı: proje için
`project_category_weights`'te satır varsa `Σ(weight_pct/100 × kategori_ortalama(progress_pct))`
(kategori içi basit `AVG`, süre ağırlıklı değil — kullanıcı onayı, veri seti küçük),
satır yoksa eski süre-ağırlıklı formüle fallback. **Kritik düzeltme:** ilk yazımda
`SECURITY DEFINER` unutulmuştu (orijinal fonksiyon bu attribute'a sahipti, `CREATE OR
REPLACE` miras almadığı için sessizce `SECURITY INVOKER`'a düşüyordu — `project_category_weights`
RLS'i invoker bağlamında sağlanmayabileceğinden ağırlıklar tanımlıyken bile sessizce
fallback'e düşme riski vardı); kullanıcı bunu yakaladı, eklendi. Elle hesap ile
doğrulandı: İzmir %11, Kayseri %22 (trigger `UPDATE ... SET progress_pct = progress_pct`
no-op'uyla yeniden ateşlenip DB'de teyit edildi).

**Yan bulgu — kritik, ayrı bir kapsam genişlemesiyle düzeltildi:** Playwright ile
"Tüm Projeler" ekranını (`TabGenel.jsx`) kontrol ederken yeni %11/%22 yerine eski
%57/%49 görüldü. Kök neden: `TabGenel.jsx`'in `applyReportProgress()` fonksiyonu
`projects.progress` kolonunu hiç okumuyordu, kendi client-side hesabını doğrudan
`progress_items` + `progress_daily.item_id` üzerinden yapıyordu — bu satırlar önceki
oturumdaki `DailyReportForm.jsx` cutover'ından beri (`item_id` NULL, `task_id` dolu)
hiç güncellenmiyor, donmuş veri gösteriyordu. `applyReportProgress()` tamamen
kaldırıldı, `getProjects()` zaten `projects.progress`'i döndürdüğü için ekran artık
onu doğrudan kullanıyor (not: `selectedDate`/"Tarih Seç" filtresi artık ilerleme
sütununu etkilemiyor — bu kolon her zaman "güncel" `projects.progress`'i gösteriyor,
tarih filtresi sadece proje listesini süzüyor). Aynı desen (`progress_items`/
`item_id` üzerinden client-side yeniden hesap) grep ile tarandı, 5 dosyada daha
bulundu ve hepsi `project_tasks`/`progress_daily.task_id`'ye geçirildi (Migration
A'nın `progress_daily.task_id` backfill'i 330/330 satırı kapsadığı için — yani hem
eski hem yeni satırlarda artık `task_id` her zaman dolu — coalesce gerekmedi, doğrudan
değiştirildi): `TabGenel.jsx` (`getProgressTotalsByDate`, `exportDailyReport`,
`exportPeriodicReport` — üç ayrı müşteri Excel export fonksiyonu), `TabIsPlan.jsx`
(Gantt'ta seçili görevin "bugünkü katkı %"si), `ProjeDetay.jsx` (`buildPeriodReportData`
müşteri dönem raporu, `getProgressTotalsUntil`, `exportSelectedDailyReportExcel`,
`handleExport` günlük PDF/Excel — dördü de), `DailyReportList.jsx`
(`buildReportExcelById`), `agentContext.js` (AI sohbet asistanının `ctxGenel`/`ctxIsPlan`
context özetleri — kullanıcı asistana ilerleme sorduğunda artık donmuş sayı
söylemeyecek). **Kontrol edilip DOKUNULMAYAN (RPC katmanında zaten doğru veya kapsam
dışı):** `DailyReportDetail.jsx`/`DailyReportList.jsx`'in `get_daily_report_detail`
RPC'den gelen `progress_items` alanı (Migration C'de zaten `COALESCE(pi.x, pt.x)` ile
düzeltilmişti, JSON key adı geriye dönük uyumluluk için aynı bırakılmış — bug değil),
`ProjectOverviewDashboard.jsx`/`useSantiyeData.js`/`SantiyeSefiDashboard.jsx` (RPC
üzerinden geliyor, zaten migrasyonlu), `TabProjeYonetimi.jsx` (proje silme cascade'i,
hesap yapmıyor). **Bilinçli olarak dokunulmayan bir tasarım noktası:**
`exportPeriodicReport`'taki `avgProgressPct` (periyodik Excel raporunun G11 hücresi)
veri kaynağı düzeltildi ama **yöntemi** (basit ortalama, tarihe göre süzülmüş) yeni
kategori-ağırlıklı formülle DEĞİŞTİRİLMEDİ — `projects.progress` her zaman "güncel"
olduğu için geçmişe dönük periyot raporlarında doğrudan kullanılamaz, bu rapor için
tarih-kapsamlı bir ağırlıklı hesap ayrı bir tasarım kararı gerektirir, kullanıcıya
sorulmadan seçilmedi. **Zaten bilinen, bugün DOKUNULMAYAN (Excel şablonu birleştirme
görevinin kapsamında):** proje oluşturma sihirbazı (`Adim3IlerlemeBilgileri.jsx`,
`ProjeEditWizard.jsx`, `Adim8Tamamlandi.jsx`) hâlâ tamamen eski `progress_items`
modelinde çalışıyor (yeni proje için ilerleme kalemi girişi/düzenlemesi) — bu ayrı,
daha büyük bir tasarım kararı gerektiriyor (yeni projeler artık `project_tasks`
üzerinden mi ilerleme kalemi alacak, "Adım 2 — İş Kalemleri" ile "Adım 3 — İlerleme
Kalemleri" birleşecek mi), bilerek dokunulmadı.

Playwright ile "Tüm Projeler" ekranı doğrulandı: fix sonrası İzmir %11, Kayseri %22
gösteriyor (fix öncesi %57/%49'du). Ayrıca mevcut regresyon suite'i (`tests/faz-e.spec.js`)
çalıştırıldı: 1/7 test (B — fatura INSERT/DELETE realtime) başarısız, ama bu bugünkü
değişikliklerle **ilgisiz** — dokunulan hiçbir dosya invoices/finans akışına değmiyor,
hata `git status` ile doğrulandı (sadece progress/ilerleme dosyaları değişti). Bu test
ayrı olarak incelenmeli, muhtemelen bu oturumdan önce de var olan bir sorun.

### Önceki değişiklik
**2026-07-13 — "İş kalemi"/"ilerleme kalemi" tekilleştirme görevi: frontend cutover
tamamlandı, ana akış artık uçtan uca `project_tasks` üzerinden çalışıyor.**
`DailyReportForm.jsx`'in "İlerleme Girişi" paneli artık `progress_items` yerine
`project_tasks`'tan besleniyor (`select id, task_name, unit, target_qty,
total_progress, category, planned_start ... gt('target_qty', 0)`, `task_name`→`name`
alias'lanıyor — rendering kodu `item.id/.name/.unit/.target_qty/.total_progress`
okuduğu için başka değişiklik gerekmedi). Kayıt yüklerken `existingQtys` artık
`e.task_id` ile anahtarlanıyor (`e.item_id` değil). Kaydetme akışı yeni 15 parametreli
`save_daily_report`'u `p_task_progress: [{task_id,qty_added,note}]` ile çağırıyor
(`p_progress` artık hiç gönderilmiyor, yeni overload'da defaultlu). Playwright ile
uçtan uca doğrulandı: `izmir.test` ile bir göreve (Kolon Cakim Islemi) +7 birim
girildi → panel içi canlı önizleme (193.0→200.0) doğru → "Raporu Gönder" sonrası
"Genel Bakış" dashboard'ı (`get_santiye_dashboard`, yeni RPC) sayfa yenilenmeden
`%6`/`200/3.200 adet` gösterdi → DB'de `project_tasks.total_progress=200,
progress_pct=6.30` (yeni trigger doğru hesapladı) → raporu tekrar açınca "Bugün"
alanı `7` olarak doğru pre-fill oldu (task_id-keyed) → rapor silinip trigger'ın
DELETE yolu da doğru şekilde 193/6.00'a geri döndürdü. **Bulunan (migration'dan
bağımsız, önceden de var olan) küçük eksik:** kalem notları (`itemNotes`) rapor
yeniden açıldığında hiç restore edilmiyor — bu `item_id`/`task_id` değişikliğinden
önce de aynıydı, regresyon değil, ayrı bir iyileştirme adayı.

**Tekilleştirme görevinin durumu:** Migration A/B/C + frontend cutover tamamlandı;
canlı akış artık `progress_items`'a hiç yazmıyor/okumuyor. **Kalan (kullanıcı ayrıca
onaylayınca yapılacak, bu turun kapsamı dışı):** (1) Excel şablonu — "İş Kalemleri"/
"İlerleme Kalemleri" sayfalarının birleştirilmesi + `import-project-excel`/
`export-project-excel` edge fonksiyonlarının (ve ayrı wizard importer'ı
`projectExcelImport.js`'in) güncellenmesi; (2) temizlik migration'ı — `progress_items`
tablosunu, eski 4 trigger fonksiyonunu (`update_task_progress_pct`,
`sync_progress_item_total`, `update_task_progress_from_item`, `fn_set_task_actual_start`)
+ dead `sync_progress_total()`/`increment_progress_total()`'ı, eski 14 parametreli
`save_daily_report` overload'ını, `daily_report_material_usage.progress_item_id` FK'sını
ve `get_daily_report_detail`'in `materials` bloğundaki `progress_items` JOIN'ini kaldırmak.

**2026-07-13 — Tekilleştirme görevi: Migration C uygulandı (5 canlı okuyucu RPC
project_tasks'a yönlendirildi) — sadece frontend cutover kaldı.** `get_santiye_dashboard`,
`get_project_by_date`, `get_project_dashboard`, `get_project_gantt`, `get_daily_report_detail`
(hepsi gerçek çağrı yerlerinden doğrulanmış canlı RPC'ler — `get_project_overview` gerçek
orphan olduğu için, `get_project_progress_export`/`vw_progress_timeline` zaten kullanılmadığı
için dışarıda bırakıldı) artık `progress_items` yerine `project_tasks`'ı okuyor. Her
fonksiyon için `diff` ile doğrulandı: yalnızca `progress_items`'a değen blok değişti,
WHERE/ORDER BY koşulları bit-bit korundu (`get_santiye_dashboard`'daki `order_index`→
`planned_start` sıralama değişikliği hariç — bilinçli, çünkü `project_tasks`'ta
`order_index` yok; etkisi sıfır çünkü tüketen tek yer `SantiyeSefiDashboard.jsx`
zaten client-side kendi sıralamasını yapıp RPC sırasını atıyor).
`get_daily_report_detail`'in `progress` bloğu hem `progress_items` hem `project_tasks`'a
`COALESCE` ile LEFT JOIN yapıyor (eski item_id-bazlı + yeni task_id-bazlı satırları
birlikte destekler) — ama `materials` bloğu hâlâ salt `progress_item_id` üzerinden
`progress_items`'a bağlı, kasıtlı olarak dokunulmadı (Malzeme Kullanımı özelliği zaten
formdan kaldırılmıştı, yeni yazma olmayacak) — **temizlik migration'ının kapsamına
eklenmeli**, `progress_items` düşürülürken bu fonksiyon da güncellenmeli.
**Yan bulgu (bu migration'ın kapsamı dışı, dokunulmadı):** `get_project_dashboard`'da
`get_project_scope`/`has_project_access` gibi bir yetki kontrolü hiç yok — diğer
proje-bazlı RPC'lerin hepsinde bu kontrol var, burada neden eksik olduğu ayrı bir
inceleme gerektirir. **Sıradaki adım:** `DailyReportForm.jsx`'in "İlerleme Girişi"
panelini `progress_items` yerine `project_tasks`'tan besleyip yeni 15 parametreli
`save_daily_report`'u (`p_task_progress`) çağıracak şekilde güncellemek, sonra
Playwright ile uçtan uca doğrulamak — bkz. bir önceki kayıt (Migration B).

**2026-07-13 — Tekilleştirme görevi: Migration B uygulandı (konsolide trigger + yeni
`save_daily_report` overload'ı) — RPC/frontend cutover henüz sürüyor.**
`progress_daily.item_id` nullable yapıldı (yeni task_id-bazlı satırlar item_id'siz
yazılacak). `project_tasks`'a `dashboard_visible`/`dashboard_order` eklendi + backfill
edildi — **önemli düzeltme:** `get_project_dashboard` CLAUDE.md'de "orphan" olarak
işaretliydi ama gerçek kod taramasında `TabGenel.jsx`'in bunu çağırıp `progress_items`
alanını (dashboard_visible filtresiyle) gerçekten kullandığı görüldü — o not yanlıştı,
düzeltildi (bkz. aşağıdaki madde). Yeni `sync_task_progress_from_daily()` trigger'ı +
`trg_sync_task_progress_from_daily` (progress_daily AFTER INSERT/UPDATE/DELETE) eklendi;
eski 4 trigger (`trg_progress_daily_update_task`, `trg_sync_item_total`,
`trg_set_task_actual_start`, `trg_progress_item_update_task`) **disable edildi** (fonksiyonlara
dokunulmadı, temizlik migration'ında kaldırılacak). `save_daily_report`'un yeni 15
parametreli overload'ı eklendi (`p_task_progress: [{task_id,qty_added,note}]`) — eski 14
parametreli overload'a dokunulmadı. Canlı test: `save_daily_report` çağrısı ile bir
task'a +2 birim eklendi (93→95, progress_pct 93.00→95.00), sonra rapor silindi ve
tetikleyicinin DELETE yolu da doğru şekilde 93/93.00'a geri döndürdü — tam round-trip
doğrulandı. **Henüz TAMAMLANMADI:** 5 canlı okuyucu RPC (`get_santiye_dashboard`,
`get_project_by_date`, `get_project_dashboard`, `get_project_gantt`,
`get_daily_report_detail` — hepsi gerçek çağrı yerlerinden doğrulandı) hâlâ
`progress_items`'ı okuyor ve `DailyReportForm.jsx` hâlâ eski 14 parametreli RPC'yi
çağırıyor — bunlar aynı oturumda, boşluksuz tamamlanacak (bkz. bir sonraki kayıt).

**2026-07-13 — "İş kalemi"/"ilerleme kalemi" tekilleştirme görevi başladı — Migration A
uygulandı (`progress_unify_migration_a_project_tasks_columns`).** Amaç: şantiye şefinin
günlük raporda ilerlemeyi ayrı bir `progress_items` tablosu yerine doğrudan Gantt'taki
`project_tasks` kalemine göre girmesi; `progress_items` tamamen kalkacak. Keşif adımında
27 `progress_items` satırının **tamamı** tam 1 task_id'ye bağlıydı (çoklu-kalem birleştirme
kararı gerekmedi) ve hiçbiri orphan değildi. Migration A (additive, kırmaz):
`project_tasks`'a `target_qty numeric`, `unit text`, `total_progress numeric default 0`
eklendi + `progress_items`'tan backfill edildi; `total_progress` **`progress_items.total_progress`'ten
kopyalanmadı**, her task_id için `progress_daily.qty_added` SUM'ından yeniden hesaplandı
(kaynak-doğru veri) — doğrulamada 27 kalemden yalnızca 1'i (Kolon Cakimi F1, Kayseri)
marjinal farklıydı (1900→2057, %100 cap'i nedeniyle görsel etkisi yoktu), gerçek sistemik
bir çift-sayım hatası değilmiş. `progress_daily`'ye nullable `task_id uuid` eklenip
`progress_items.task_id` üzerinden 330/330 satır backfill edildi (0 null kaldı).
**Migration sırasında dormant bir prod hatası keşfedildi:** `update_task_progress_from_item()`
(progress_items'ın `total_progress` UPDATE'inde tetiklenen, Migration B'de zaten
kaldırılması planlanan 4 eski trigger'dan biri) `status = 'bekliyor'::task_status`
karşılaştırması yapıyor ama gerçek enum'da (`beklemede, devam_ediyor, tamamlandi, askida,
iptal`) `'bekliyor'` diye bir değer yok — yazım hatası. Muhtemelen test verisi trigger'lar
devre dışıyken seed edildiği için şimdiye kadar hiç gerçek bir UPDATE bu trigger'ı
tetiklememişti; Migration A'nın `progress_daily.task_id` backfill'i ilk kez tetikleyince
ortaya çıktı. Migration A'nın kapsamını bozmamak için bu trigger backfill UPDATE'i
sırasında geçici `DISABLE TRIGGER`/`ENABLE TRIGGER` ile atlatıldı, fonksiyonun kendisine
dokunulmadı — Migration A sonrası sistem davranışı öncekiyle birebir aynı (bu fonksiyon
hâlâ etkin ve hâlâ bu haliyle bozuk, tıpkı migration öncesi gibi). Migration B bu
fonksiyonu (ve 3 diğerini) kalıcı olarak devre dışı bırakıp tek bir yeni trigger'la
değiştirecek — kullanıcı onayı bekleniyor, henüz uygulanmadı.

**2026-07-13 — `TalepDetayModal.jsx`'te hardcode edilmiş test kullanıcı adı
fallback'i düzeltildi.** `requester` değişkeni `req.profiles?.full_name` vb.
hiçbiri dolmadığında jenerik bir yer tutucu yerine sabit `'santiyesefi.test'`
metnine düşüyordu (muhtemelen geliştirme sırasında o hesapla test edilirken
unutulmuş bir debug kalıntısı) — `requested_by` boş olan HERHANGİ bir talepte
"Oluşturan"/"Talep Oluşturuldu" alanları yanlışlıkla bu test hesabına ait
gösteriliyordu. `'—'` (diğer bileşenlerdeki `requesterName()` fallback'iyle
aynı) ile değiştirildi. Admin hesabıyla `requested_by IS NULL` olan bir talep
üzerinde Playwright ile doğrulandı.

**2026-07-13 — Kayseri test projesinde 13 satın alma talebinin `requested_by`'ı
NULL'dı, `siteChiefView` filtresiyle test verisi tutarsızlığı ortaya çıktı.**
`santiyesefi.test` hesabı (Kayseri'deki tek santiye_sefi, `test-kayseri-develi-ges`)
"Talepler" listesinde 0 kayıt görüyordu çünkü `test-kayseri-develi-ges` projesindeki
13 talebin hiçbirinde `requested_by` set edilmemişti (muhtemelen toplu seed script'i
sırasında atlanmış). Kod/filtre mantığı doğruydu (bkz. bir alttaki kayıt) — kullanıcı
onayıyla 13 talebin tümü `santiyesefi.test`'in id'sine (`e1e76bb3-cdcb-44d2-b4d9-e4f0e45667d1`)
`UPDATE` edildi, doğrulandı (13/13). İzmir test projesindeki talepler zaten doğru
atanmıştı, etkilenmedi.

**2026-07-13 — Şantiye şefi artık satın alma taleplerini onaylayamıyor, sadece
kendi oluşturduklarını görüyor.** Önceden "Onayla/Reddet" butonları
`ProjeTabTalepListesi.jsx`/`TabSatinAlmaTalepListesi.jsx`'te rol farkı
gözetmeden herkese görünüyordu (bu iki dosyanın CLAUDE.md'de önceden not
edilmiş açık noktasıydı) — halbuki "Onay Bekleyenler" sekmesi zaten `isAdmin`'e
kilitli. Her iki dosyaya da `canApprove = isAdmin` eklendi; onay/red butonları
artık yalnızca admin'e görünüyor, diğer roller için "Bekliyor" durumundaki
taleplerde İŞLEM/FATURA kolonunda boş bir "—" var (DURUM kolonunda hâlâ
"Bekliyor" rozeti görünüyor — durumu görmeye devam ediyorlar, aksiyon alamıyorlar).
Ayrıca `ProjeTabTalepListesi.jsx`'e yeni bir `siteChiefView` filtresi eklendi
(`ProjeTabSatinAlma.jsx` üzerinden `siteChiefView` prop'uyla taşınıyor) —
`true` olduğunda liste `request.requested_by === user.id` ile süzülüyor, yani
şantiye şefi kendi projesindeki diğer kişilerin (varsa) taleplerini değil
sadece kendi oluşturduklarını görüyor. Admin/proje-detay görünümünde
(`siteChiefView` yok) hâlâ projedeki tüm talepler + onay/red görünüyor —
Playwright ile hem şantiye şefi (2/2 kendi talebi, 0 onay butonu) hem admin
(8 onay/8 red butonu, tüm 13 talep) tarafında doğrulandı.

**2026-07-13 — "Malzeme Listesi" tablosu da aynı sayfalama desenine geçti.**
`ProjeTabFaturaKesilecekler.jsx`'teki (Satın Alma → Malzeme Listesi sekmesi,
hem admin'in proje-detay görünümünde hem şantiye şefinin sadeleştirilmiş
görünümünde kullanılıyor) `VISIBLE_ROWS=6`+`maxHeight` iç-scroll kutusu bir
önceki değişiklikle aynı `PAGE_SIZE=10` + `Pager` deseniyle değiştirildi.
Playwright ile doğrulandı: test projesinde tam 10 malzeme kaydı olduğu için
tek sayfa var, `Pager` (zaten `totalPages<=1` ise gizleniyor) doğru şekilde
görünmüyor — 10'dan fazla kayıtlı bir projede otomatik "1/2" olarak çıkacak.

**2026-07-13 — Satın Alma talep tablosu sabit 6-7 satırlık iç-scroll kutusundan
gerçek sayfalamaya geçti.** `ProjeTabTalepListesi.jsx`/`TabSatinAlmaTalepListesi.jsx`'teki
`VISIBLE_ROWS`+`maxHeight` (satır başına dikey scrollbar) kaldırıldı; yerine
`PAGE_SIZE=10` ile dilimlenmiş sayfalar + `SantiyeSefiDashboard.jsx`'teki
"Taleplerim"/"Son Raporlar" listelerinde zaten kullanılan `Pager` bileşeni
(`‹ 1/2 ›` stili) eklendi — filtre/refreshKey değiştiğinde sayfa 1'e döner.
Playwright ile doğrulandı: 13 kayıtlı test verisinde sayfa 1'de 10, sayfa
2'de 3 satır, "İleri" butonu çalışıyor.

**2026-07-13 — Şantiye şefi "Satın Alma" sekmesi artık sadeleştirilmiş, proje-bazlı
görünüm kullanıyor.** `Dashboard/index.jsx`'te santiye_sefi rolü için `<TabSatinAlma />`
(çok-projeli, KPI+sidebar'lı, satin_alma_uzmani/muhasebe'ye özel genel sayfa) yerine
`<ProjeTabSatinAlma projectId={projectId} siteChiefView />` render ediliyor —
`ProjeTabSatinAlma.jsx`'e `TabIsPlan`'daki `siteChiefView` deseniyle aynı yeni bir prop
eklendi, `true` olduğunda KPI stat kartları + tedarik/dağılım/döviz sidebar'ı
(`sa-overview-grid`) ve gereksiz döviz kur çağrısı atlanıyor. Sonuç: santiye şefi artık
sadece iki sekme görüyor — **Talepler** (kendi oluşturduğu satın alma talepleri) ve
**Malzeme Listesi** (`ProjeTabFaturaKesilecekler` — planlanan/gönderilen/gönderilmesi
gereken miktar tablosu); "Onay Bekleyenler" zaten `isAdmin` şartına bağlı olduğu için
ek değişiklik gerekmedi. Playwright ile doğrulandı, konsol hatası yok. (Talepler
listesindeki satır başı "Onayla/Reddet" butonlarının rol farkı gözetmeden
herkese görünmesi sorunu sonraki bir değişiklikle giderildi — bkz. yukarıdaki
"Şantiye şefi artık satın alma taleplerini onaylayamıyor" kaydı.)

**2026-07-13 — Günlük rapor hatırlatması hafta içine sınırlandı + bildirim renk/tarih
düzeltmesi, Şantiye Şefi "Proje İlerlemesi" kartı sadeleştirildi.** `cron.job`
(jobid=1, `create_daily_report_reminders()`'i tetikliyordu) schedule'ı
`0 6 * * *`'ten `0 6 * * 1-5`'e çekildi (`cron.alter_job`) — artık hafta sonu
hatırlatma bildirimi oluşturulmuyor. `create_daily_report_reminders()` ve
`resolve_daily_report_reminder()` fonksiyonları güncellenip bildirim
başlığına günün tarihi eklendi (örn. "13 Temmuz 2026 raporu henüz girilmedi" →
rapor girilince "...raporu girildi"). Frontend tarafında `NotificationBell.jsx`/
`TabBildirimler.jsx`'teki `reminderTone()` üç duruma ayrıldı: okunmamış+pending
→ sarı, okunmuş+pending → normal (renksiz), resolved → yeşil — önceden
okunma durumu hiç dikkate alınmıyordu, bildirim okunsa bile rapor girilene kadar
sarı kalıyordu. Ayrıca `SantiyeSefiDashboard.jsx`'teki "Proje İlerlemesi" kartı
("cidden anlaşılır değil" geri bildirimi) yeniden tasarlandı: üstte donut yerine
tek büyük yüzde + tek ilerleme çubuğu (planlanan ilerleme artık ayrı mini-bar
değil, aynı çubuğun üstünde dikey bir işaret çizgisi), ham "+3%" varyans rozeti
yerine "Plana göre N puan önde/geride" cümlesi; alttaki kalem grid'i (54px
donut'lar) yatay bar-listesine çevrildi, mobilde (`≤480px`, `Dashboard.css`
`.pi-item-row`) isim üstte tam genişlik + bar alt satıra sarıyor (önceden isim
tek satırda çok kısa kesiliyordu). Playwright ile hem mobil hem masaüstü
görünüm doğrulandı.

**2026-07-13 — Satın Alma talep listeleri artık Realtime'a bağlı.**
`TabSatinAlmaTalepListesi.jsx`/`ProjeTabTalepListesi.jsx` kendi ham
`purchase_requests` sorgusunu koştuğu için üst bileşenin Realtime aboneliği
bu listeye hiç yansımıyordu (kullanıcı canlı bir talep/fatura güncellemesini
sayfa yenilemeden göremiyordu). `TabSatinAlma.jsx`/`ProjeTabSatinAlma.jsx`'a
eklenen bir `refreshKey` state'i, Realtime callback'inde bump edilip alt
bileşenin `useEffect` bağımlılığına eklendi — böylece parent'ın kanalı
tetiklendiğinde çocuk da kendi verisini yeniden çeker. Gerçek SQL UPDATE +
Playwright ile doğrulandı (ayrıntı: Bilinen açık noktalar → "Satın alma/finans
liste ekranları RPC kullanmıyor"). Ayrıca aynı oturumda Izmir test projesinde
kalıcı bir satın alma→fatura test verisi oluşturuldu (bkz. proje hafızası
`project_test_data_satin_alma_finans_dongusu`).

**2026-07-13 — `DailyReportForm.jsx` navigasyonu yeniden tasarlandı, Malzeme
Kullanımı bölümü kaldırıldı.** Kaydırmalı tek-sayfa formdan, 8 bölümlü liste
(Hava/Genel, Personel, Makine, Günün İşleri, İlerleme, Sorunlar, Fotoğraflar,
Notlar) + panel (masaüstünde ortalanmış kutu, mobilde bottom-sheet) modeline
geçirildi. Her panelin kendi İptal (state snapshot'a geri döner) / Kaydet ve
Kapat (paneli kapatır, checkmark günceller) davranışı var. Kullanıcı isteğiyle
"Malzeme Kullanımı" bölümü (state, panel, `p_materials` RPC parametresi) formdan
tamamen çıkarıldı — `save_daily_report`'un `p_materials` parametresi DEFAULT
`'[]'::jsonb` olduğu için migration gerekmedi, `daily_report_material_usage`
tablosu ve eski veriler dokunulmadı. `save_daily_report` çağrısı ve meta-encode
mantığı (isg_notes/incident_notes/sorun detayları) birebir korundu. Bu
değişikliklerle `Dashboard.css`'teki pozisyonel (`nth-child`) ve ölü CSS
(`.gr-action-tiles`, `.ss-bottom-grid`) temizlendi. Panel kutusu ilk halinde
sağdan açılan tam-yükseklik bir şerit olarak kayıyordu ("sekmenin yanında
çıkıyor" geri bildirimi üzerine) — masaüstünde ortalanmış, yuvarlak köşeli,
sabit yükseklikte bir kutuya (`.gr-drawer` fade/scale-in) çevrildi. Sorunlar ve
İlerleme Girişi panellerindeki geniş tablolar (yatay kaydırma gerektiriyordu,
"bu kaydırma stilini kullanmayalım" geri bildirimi) dikey, kalem/sorun başına
bir kart listesine (`CARD_ROW`) dönüştürüldü — artık hiçbir panelde yatay
scrollbar yok.

### Tamamlanan büyük görevler (kronolojik)
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
  4 view'da anon RLS bypass (`security_invoker=on`), `user_has_project_access`
  → `has_project_access` kanonik delegasyonu (10 dosyanın doğrudan sorguladığı
  `project_tasks`/`progress_items`/`project_risks` etkileniyordu).

### Bilinen açık noktalar / ertelenmiş kararlar
- **`get_project_overview` gerçekten orphan (17 alan, hiçbir frontend çağrı yeri yok)** —
  birleştirme kararı var (`ProjeDetay.jsx`'in Genel Proje sekmesine taşınacak) ama
  uygulanmadı. **Düzeltme (2026-07-13):** `get_project_dashboard` bu satırda daha önce
  yanlışlıkla "orphan" olarak işaretlenmişti — 2026-07-13'teki tekilleştirme görevinde
  gerçek kod taramasıyla (`grep` + çağrı yeri doğrulama) `TabGenel.jsx`'in bunu
  çağırdığı ve `progress_items`/`dashboard_visible` alanını gerçekten render ettiği
  kanıtlandı (bkz. Sistem Durumu → en son değişiklik). **Canlı**, orphan değil —
  ileride "orphan RPC" taraması yapılırken bu ikisini karıştırmayın.
- **Satın alma/finans liste ekranları RPC kullanmıyor:** `TabSatinAlmaTalepListesi.jsx`,
  `ProjeTabTalepListesi.jsx`, `FaturaListesi.jsx`, `OnayKuyrugu.jsx`,
  `ProjeTabFaturaListesi.jsx`, `ProjeTabOnayKuyrugu.jsx` kendi ham sorgularını
  koşuyor, halbuki karşılığı olan `get_satin_alma_overview*`/`get_finans_overview*`
  zaten mevcut. Güvenlik acil değil (RLS zaten proje bazlı), tutarlılık işi.
  **2026-07-13'te bunun somut bir belirtisi düzeltildi:** `TabSatinAlmaTalepListesi.jsx`/
  `ProjeTabTalepListesi.jsx` kendi ham sorgusunu koştuğu için üst bileşenin
  (`TabSatinAlma.jsx`/`ProjeTabSatinAlma.jsx`) Realtime aboneliği (`overview` state'ini
  tazeliyordu) liste tablosuna hiç yansımıyordu — kullanıcı canlı bir satın alma
  talebi/fatura güncellemesini listede görmüyordu. Kalıcı çözüm (ham sorguyu RPC'ye
  taşımak) hâlâ yapılmadı ama üst bileşenin realtime callback'i artık bir
  `refreshKey` state'ini de bump ediyor, alt bileşen bunu `useEffect` bağımlılığına
  ekleyip kendi `fetchData()`'sını da tetikliyor — Playwright ile doğrulandı (gerçek
  SQL UPDATE sonrası sayfa yenilenmeden ~10-15sn içinde liste güncellendi, aynı gecikme
  Faz E'nin realtime testlerinde de gözlemlenmişti, altyapı sorunu değil).
- **Genel (rol-kilitli) Satın Alma/Finans sayfaları ile `ProjeTab*` arasında
  ~2300 satır kod tekrarı** (`FaturaListesi`↔`ProjeTabFaturaListesi`,
  `OnayKuyrugu`↔`ProjeTabOnayKuyrugu`, `MaliyetTablosu`↔`ProjeTabMaliyetTablosu`,
  `TalepListesi`↔`ProjeTabTalepListesi`, `FaturaKesilecekler`↔`ProjeTabFaturaKesilecekler`).
  Genel sayfalar ölü kod DEĞİL — `satin_alma_uzmani`/`muhasebe` rolleri için tek
  arayüz. Birleştirme planı netleşmiş ama kullanıcı isteğiyle ertelendi, açıkça
  istenmeden yapma.
- **Frontend 6/19 rolü tanıyor** (yukarı bkz.) — `ROLE_TABS`/`ROLE_LABEL`/`Sidebar.jsx`
  genişletilmeli, idealde `roles` tablosundan okunan bir izin matrisiyle.
- **Teknik kontrol modülü (mekanik/elektrik/kalite checklist) hiç arayüzü yok** —
  tablolar var (`mechanical_checklist`, `electrical_checklist`, `quality_inspections`),
  0 satır, RLS `USING(true)` (rol/proje kısıtı yok), sıfırdan yazılması gerekiyor.
- **`work_packages`, `schedule_activities`, `critical_path_predecessors` yetim tablolar** —
  hiçbir dosyada kullanılmıyor, şema var arayüz/veri yok.
- **`DailyReportForm.jsx`'e BOM seçimi UI'sı bağlanmadı** — `daily_report_material_usage.bom_item_id`
  FK şema seviyesinde hazır (FAZ5), form alanına henüz eklenmedi.
- **`get_project_overview`/`get_project_progress_export` RPC'leri artık ÇALIŞMIYOR** (2026-07-13
  temizlik migration'ından sonra) — ikisi de `vw_progress_timeline`'ı okuyordu, o view
  `progress_items` tablosuyla birlikte `CASCADE` ile düştü. Çağrılırlarsa hata verirler.
  Zaten önceden doğrulanmış orphan RPC'lerdi (hiçbir frontend çağrı yeri yok — müşteri
  export'u `ProjeDetay.jsx`'teki client-side `buildPeriodReportData` kullanıyor), o yüzden
  canlı bir etkisi yok — ama artık "gereksiz ama zararsız" değil, "bozuk ve ölü" durumdalar.
  Drop edilmeleri ayrı bir küçük temizlik migration'ı gerektirir, kullanıcı kararı bekliyor.
- **`profiles.role` / `profiles.role_key` iki ayrı kolon** — FAZ1 denetiminde
  tutarsız bulunmuştu (5 kayıttan 3'ü), sonraki oturumlarda düzeltildiğine dair
  kayıt yok — yeni bir görev bu alana değiyorsa önce `select id, role, role_key
  from profiles` ile doğrula.
- **RLS temizliği bekliyor:** `procurement_items`/`schedule_activities`/
  `electrical_checklist`/`mechanical_checklist`/`quality_inspections`/
  `work_packages` hâlâ `USING(true)` (rol/proje kısıtı yok); `profiles`/
  `purchase_requests` üzerinde eski+yeni politika birikimi (`multiple_permissive_policies`)
  var. Acil değil, ileride bir RLS temizlik migration'ında ele alınmalı.
- **Realtime ölçek notu:** P0 tablolarında `REPLICA IDENTITY FULL` var (DELETE/UPDATE
  RLS'i için gerekliydi). Supabase üretim ölçeğinde Broadcast-from-database'e
  geçişi öneriyor — bu projenin ölçeğinde (2 test projesi) şimdilik gerekmiyor,
  ileride gündeme gelirse bu kararı birlikte gözden geçir.
