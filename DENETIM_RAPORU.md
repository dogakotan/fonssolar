# Fons Solar — Frontend/Backend Denetim Raporu (FAZ 1)

Bu rapor değişiklik içermez, yalnızca mevcut durumun tespitidir. Kaynaklar:
tüm `src/` kaynak dosyaları (grep taraması, 47 dosyada 162 doğrudan `supabase.from()`
çağrısı + 14 `supabase.rpc()` çağrısı bulundu), Supabase şema/trigger/RLS/advisor
çıktıları (`execute_sql`, `get_advisors`).

## Öncelik Sıralı Özet

| # | Bulgu | Kategori | Bölüm |
|---|---|---|---|
| 1 | `save_daily_report` RPC'si var ama **hiç çağrılmıyor** — günlük rapor kaydı 9+ ham sorguyla, atomik olmadan, `progress_items.total_progress`'u trigger'la çakışacak şekilde elle güncelleyerek yapılıyor | Veri bütünlüğü riski | A |
| 2 | `profiles.role` ve `profiles.role_key` iki ayrı kolon, **5 kayıttan 3'ünde tutarsız** (admin kullanıcısının `role`'ü "santiye_sefi" görünüyor) | Veri bütünlüğü riski | B |
| 3 | `profiles` tablosunda `profiles_all_authenticated` politikası — **her authenticated kullanıcı herhangi bir profili (rol dahil) güncelleyebilir**, yetki yükseltme riski | Güvenlik/RLS boşluğu | B |
| 4 | 29 SECURITY DEFINER RPC hem `authenticated` hem **`anon` rolüne** execute yetkisi veriyor; `get_finans_overview_all`, `get_dashboard_summary` gibi fonksiyonların içinde rol/proje bazlı ek kontrol yok | Güvenlik/RLS boşluğu | B |
| 5 | `procurement_items`, `schedule_activities`, `electrical_checklist`, `mechanical_checklist`, `quality_inspections`, `work_packages` — RLS **`USING (true)`**, herhangi bir rol/proje kısıtı yok | Güvenlik/RLS boşluğu | B |
| 6 | 7 view (`vw_*`, `project_cost_summary`, `personnel_logs`) **SECURITY DEFINER** tanımlı (Supabase lint ERROR seviyesi) | Güvenlik/RLS boşluğu | B |
| 7 | Frontend yalnızca **6 rolü** tanıyor (Sidebar/ROLE_TABS/ROLE_LABEL), DB'de **19 rol** tanımlı ve RLS bu 19 rolün çoğunu zaten kullanıyor → 13 rolle giren kullanıcı boş sidebar + kısıtsız Genel Bakış görür | Güvenlik/RLS boşluğu + Eksik ekran | B, C |
| 8 | Teknik kontrol modülü (mekanik/elektrik/kalite checklist) **hiç arayüzü yok**, tablolar boş | Eksik ekran | C |
| 9 | `work_packages`, `schedule_activities`, `critical_path_predecessors` hiçbir dosyada kullanılmıyor — yetim tablolar | Eksik ekran / temizlik | C |
| 10 | Aynı ekranın (Fatura Listesi, Onay Kuyruğu) **3 farklı kopyası** var (genel + proje-özel + bazen 3.), kod tekrarı ve tutarsız davranış riski | Kozmetik / bakım | A, C |
| 11 | `TabGenel.jsx` (1823 satır) periyodik özet Excel raporu için 9 tabloyu istemcide okuyup JS'de topluyor (bütçe kullanımı, ortalama ilerleme, makine kullanım oranı) | Sorgu taşıma | A |
| 12 | `purchase_requests.category` (`malzeme`/`hizmet`) ile `invoices.category` (`malzeme`/`iscilik`/`diger`) aynı kavram için farklı sözlük kullanıyor | Domain tutarsızlığı | B |
| 13 | `daily_report_issues/material_usage/photos.project_id` — `report_id` üzerinden zaten türetilebilir, trigger'sız kopya kolon; tutarlılık tamamen uygulama koduna bağlı | Domain tutarsızlığı | B |

---

## A) Frontend Sorgu ve Mantık Envanteri

### A.1 — En kritik bulgu: Günlük rapor kaydı `save_daily_report`'u kullanmıyor

`src/components/daily-report/DailyReportForm.jsx`, `handleSave()` (satır 506-660+):

1. `daily_reports` — `upsert()` (satır 514-527)
2. `personnel_log_entries` — `delete()` + `insert()` (534-547)
3. `machinery_logs` — `delete()` + `insert()` (550-560)
4. `daily_tasks` — `delete()` + `insert()` (563-576)
5. `progress_daily` — `delete()` + `insert()`, **ayrıca `progress_items.total_progress`'u JS'de hesaplayıp `update()` ile elle yazıyor** (579-598)
6. `daily_report_material_usage` — `delete()` + `insert()` (601-618), `project_id`'yi `effectiveProjectId`'den elle dolduruyor
7. `daily_report_photos` — storage upload + `insert()` (621-637), `project_id` yine elle
8. `daily_report_issues` — `delete()` + `insert()` (640-654), `project_id` yine elle

**Sorunlar:**
- Backend'de tam olarak bu işi tek çağrıda yapmak için `save_daily_report(p_project_id, p_report_date, p_created_by, p_general_status, p_worker_count, p_weather, p_weather_note, p_notes, p_personnel, p_machinery, p_progress)` RPC'si **zaten var** — hiçbir dosyada `supabase.rpc('save_daily_report', ...)` çağrısı yok, yani **hiç kullanılmıyor**.
- 9 ayrı ağ çağrısı bir transaction'da değil; adım 5 ile 8 arası herhangi biri patlarsa (`throw`) rapor yarım kalır — `daily_reports` satırı ve önceki adımlar commit olmuş, sonrakiler yok.
- `progress_items.total_progress`, `progress_daily` tablosundaki `sync_progress_item_total()` trigger'ı tarafından da otomatik hesaplanıyor (progress_daily INSERT/UPDATE/DELETE'te). Bu kod hem triggerdan ÖNCE elle `total_progress`'u güncelliyor (590-592) hem de hemen ardından `progress_daily` insert ediyor (596) — trigger da aynı satırı tekrar güncelliyor. İki mekanizma aynı sonuca varıyorsa şu an sorun gizli kalıyor, ama delta hesabı (`newQty - oldQty`) ile trigger'ın kendi SUM mantığı farklı senaryolarda (örn. aynı gün iki kez düzenleme, silinen satırlar) **farklı sonuç üretebilir**. `increment_progress_total(p_item_id, p_qty)` RPC'si de bu iş için var ve kullanılmıyor.
- `save_daily_report`'un `p_progress` parametresi muhtemelen `{item_id, qty}` listesi bekliyor; RPC'nin gövdesini incelemeden FAZ 3'te bire bir eşleşip eşleşmediği doğrulanmalı.

**Not — DailyReportList.jsx ve ProjeDetay.jsx'te de tekrar:** `src/pages/DailyReportList.jsx` (`buildReportExcelById`, satır 237-282) ve `src/pages/dashboard/components/ProjeDetay.jsx` (satır 624-891) günlük rapor **detayını** Excel/PDF export ve görüntüleme için tekrar tekrar aynı 7-8 tabloyu ham sorguyla çekiyor — oysa `get_daily_report_detail(p_report_id)` RPC'si tam bu işi yapıyor ve `DailyReportDetail.jsx`'te zaten kullanılıyor. Aynı veriye 3 farklı yoldan ulaşan 3 ayrı kod bloğu var.

### A.2 — Dosya bazlı tam envanter

| Dosya | Satır | Tablo(lar) / işlem | Mevcut/önerilen RPC |
|---|---|---|---|
| `components/satin-alma/FaturaOlusturModal.jsx` | 35, 44 | suppliers(select), invoices(insert) | `create_invoice_from_purchase_request(...)` |
| `components/satin-alma/YeniTalepModal.jsx` | 80, 89, 101, 120 | procurement_items(select), **projects×3 (id→name resolver deseni)** | `get_purchase_request_form_options(p_project_id)`; resolver deseni kaldırılmalı |
| `components/satin-alma/TalepDetayModal.jsx` | 118 | purchase_requests(update — onay/red) | `update_purchase_request_status(p_request_id, p_status, p_note)` (adım sırası kontrolü RPC'ye taşınmalı) |
| `components/finans/FaturaListesi.jsx` | 34, 48 | suppliers(select), invoices(insert) | `create_manual_invoice(...)` — FaturaOlusturModal ile birleştir |
| `components/agent/AgentChat.jsx` | 305 | agent_reports(insert) | `create_agent_report(...)` (düşük öncelik) |
| `components/daily-report/DailyReportForm.jsx` | 269-293, 534-654 | 8 tablo (bkz. A.1) | **`save_daily_report` zaten var, kullan** |
| `components/tickets/TicketDetayModal.jsx` | 140, 149 | tickets(update), ticket_comments(insert) | `update_ticket_status(p_ticket_id, p_status, p_comment)` |
| `components/tickets/TicketListesi.jsx` | 65, 72 | aynısı (TicketDetayModal ile kod tekrarı) | aynı |
| `components/finans/OnayKuyrugu.jsx` | 224-234 | invoices(select — onay kuyruğu) | `get_invoice_approval_queue()` |
| `components/tickets/TicketStats.jsx` | 15-18 | tickets — 4× ayrı count sorgusu | `get_ticket_stats()` |
| `pages/DailyReportList.jsx` | 237-282 | 10 tablo (export) | `get_daily_report_detail` kullanılmalı (A.1) |
| `components/tickets/YeniTicketModal.jsx` | 44-78 | **projects id→name resolver tekrarı**, tickets(insert) | resolver kaldır, `create_ticket(...)` |
| `components/agent/agentContext.js` | 46-236 | 8 farklı tablo (AI bağlam toplama) | `get_agent_context(p_project_id, p_date)` |
| `pages/dashboard/wizard/Adim2-8*.jsx`, `ProjeEditWizard.jsx` | çeşitli | project_tasks, progress_items, project_risks, procurement_items, budget_lines, critical_path_items | `get_project_wizard_data` + `create_project_full` (Adim8 zaten tek seferde topluca yazıyor, doğal RPC adayı) |
| `pages/dashboard/components/ProjeDetay.jsx` | 94-120, 624-891 | profiles(proje şefi atama), + günlük rapor detayı tekrarı | `assign_project_lead(...)`, `get_daily_report_detail` kullan |
| `pages/dashboard/components/ProjeTabFaturaListesi.jsx` | 33-47 | FaturaListesi ile **birebir kod tekrarı** (3. kopya) | tek bileşene indir |
| `pages/dashboard/components/ProjeTabTalepListesi.jsx` | 152 | procurement_items(select) | `get_satin_alma_overview`'a dahil et |
| `pages/dashboard/components/ProjeTabOnayKuyrugu.jsx` | 176-206 | OnayKuyrugu ile **birebir kod tekrarı** (project_id filtreli) | `get_invoice_approval_queue(p_project_id)` |
| `pages/dashboard/components/TabGenel.jsx` | 305, 362, 763, 872-1017 | get_dashboard_summary ✓, purchase_requests(raw), get_project_dashboard ✓, **9 tablo + JS agregasyon (bütçe/ilerleme/makine oranı)** | `get_project_period_report(p_project_id, p_start_date, p_end_date)` |
| `pages/dashboard/components/TabKullanicilar.jsx` | 149-376 | profiles(update — rol/proje atama, doğrudan), projects(select) | Edge Function (`manage-user`) ya da `update_user_role_and_project(...)` RPC — şu an rol ataması RLS'in `profiles_all_authenticated` boşluğundan geçiyor (bkz. B) |
| `pages/dashboard/components/TabProjeYonetimi.jsx` | 199-753 | 12+ tablo, proje **silme 7 ayrı `.delete()`** ile sırayla | `delete_project_cascade(p_project_id)` (tek transaction) |
| `pages/dashboard/components/TabTickets.jsx` | 16 | projects(select — dropdown) | mevcut `get_dashboard_summary`'e proje listesi eklenebilir |

### A.3 — Gömülü sabit listeler (DB lookup ile çakışan)

- **Roller:** `roles` tablosu 19 kayıt + `display_name` (Türkçe) içeriyor, RLS politikaları bunu referans alıyor. Frontend'de `ROLE_LABEL` (`pages/dashboard/index.jsx`), `ROLE_TABS`, `Sidebar.jsx`'teki her nav item'ın `roles: [...]` dizisi — hepsi **kod içinde sabit, sadece 6 rolü kapsıyor**, `roles` tablosuna hiç sorgu atılmıyor.
- **Durum/kategori etiketleri:** `STATUS_META`/`PR_STATUS`/`PR_URGENCY`/`TK_STATUS`/`TK_SEVERITY` (`SantiyeSefiDashboard.jsx`), `CATEGORY_META` (`utils/finans.js`), `STATUS_META` (`TalepDetayModal.jsx`, `ProjeTabTalepListesi.jsx`, `TabSatinAlmaTalepListesi.jsx`) — hepsi renk/etiket eşlemesi için kod içinde sabit obje. Bu **kabul edilebilir** bir desen (DB'de zaten CHECK constraint ile sabit değer kümeleri var, ayrı bir lookup tablosu yok) — ama roller için durum farklı, çünkü `roles` tablosu zaten var ve kullanılmıyor.

---

## B) 4NF Denetimi

### Kritik / sorunlu bulgular

| Tablo | Bulgu | Sınıf |
|---|---|---|
| `profiles` | **`role` VE `role_key` iki ayrı kolon**, 5 kayıttan 3'ü tutarsız (doğrulandı: `select id, role, role_key from profiles`). RLS/`get_my_role()` `role_key`'i kullanıyor, `role` ölü/yanıltıcı veri. | 3NF ihlali / veri bütünlüğü — **SORUNLU, trigger yok** |
| `daily_report_issues`, `daily_report_material_usage`, `daily_report_photos` | `project_id` kolonu var, ama `report_id → daily_reports.project_id` üzerinden zaten türetilebilir. **Senkron trigger yok** — uygulama kodu (`DailyReportForm.jsx`) `effectiveProjectId`'yi elle her insert'e basıyor. RLS bu kopya kolona dayandığı için (`dri_select` vb.) `report_id` ile `project_id` tutarsız olursa erişim kontrolü yanlış karar verebilir. | 3NF ihlali (transitive bağımlılık) — **SORUNLU, trigger yok** |
| `purchase_requests.category` (`malzeme`/`hizmet`) vs `invoices.category` (`malzeme`/`iscilik`/`diger`) | Aynı kavramsal boyut (harcama türü) için iki farklı sözlük. Bu oturumda Finans↔Satın Alma bağlantısı kurulurken bu uyumsuzlukla karşılaşıldı (`sync_purchase_request_from_invoice` iki farklı domain'i köprülüyor). | Domain/sözlük tutarsızlığı |
| `progress_items.category` (CHECK, 11 değer, serbest metin) vs `project_tasks.category` (native `enum`, kısmen farklı değer kümesi) | Aynı fiziksel iş kategorisi iki farklı mekanizma ve kısmen farklı değerlerle tutuluyor. | Domain tutarsızlığı |
| `purchase_requests` | 30 kolon — talep + fiyat + onay + teslimat + fatura bilgisi tek satırda. 4NF ihlali değil (hepsi `id`'ye bağımlı, çok değerli bağımsız bağımlılık yok) ama sürecin her adımında çoğu alan NULL kalıyor. Audit trail ayrı tabloda (`purchase_request_status_log`) tutulması **iyi tasarım**. | Bilgi notu, ihlal değil |

### Bilinçli / trigger ile tutarlı denormalizasyon (İHLAL DEĞİL)

- `progress_items.total_progress` ← `sync_progress_item_total()` trigger (progress_daily üzerinden)
- `project_tasks.progress_pct` ← `update_task_progress_pct()` / `update_task_progress_from_item()` trigger
- `projects` seviyesi ilerleme ← `fn_sync_project_progress()` trigger
- `invoices.vat_amount`, `invoices.total_amount` ← Postgres **GENERATED ALWAYS AS** kolonlar (trigger bile gerekmiyor, DB seviyesinde garanti)
- `purchase_requests.invoice_id`, `.status` ← `sync_purchase_request_from_invoice()` trigger

Bu 5 kalem doğru şekilde trigger/generated-column ile korunuyor. Tek istisna:
**`DailyReportForm.jsx`'in `progress_items.total_progress`'u trigger'la aynı anda elle güncellemesi** (bkz. A.1) — şema doğru tasarlanmış, uygulama kodu bunu ihlal ediyor.

### Güvenlik/RLS bulguları (Supabase advisor + manuel `pg_policies` incelemesi)

- **7 ERROR:** Tüm view'lar (`project_cost_summary`, `personnel_logs`, `vw_delayed_tasks`, `vw_monthly_progress`, `vw_progress_timeline`, `vw_weekly_progress`, `vw_project_progress_summary`) **SECURITY DEFINER** — view sahibinin izinleriyle çalışıyor, sorguyu yapan kullanıcının RLS'i uygulanmıyor. `project_cost_summary` ve `personnel_logs`'un hiçbir frontend dosyasında veya bilinen RPC'de kullanılmadığı görüldü — **muhtemelen yetim/legacy view**.
- **58 WARN** (`authenticated_security_definer_function_executable` + `anon_security_definer_function_executable`): 29 SECURITY DEFINER fonksiyon hem `authenticated` hem **`anon`** rolüne EXECUTE yetkisi veriyor. `get_finans_overview_all()`, `get_dashboard_summary()` gibi fonksiyonların gövdesinde `auth.uid()`/rol kontrolü YOK — sadece SECURITY DEFINER olarak RLS'i bypass edip tüm veriyi döndürüyorlar. Anon key ile (giriş yapmadan) bu RPC'ler çağrılabiliyor olabilir — **doğrulanmalı ve gerekirse `REVOKE EXECUTE ... FROM anon` + fonksiyon içine `IF auth.uid() IS NULL THEN RAISE EXCEPTION` eklenmelidir.**
- **`profiles_all_authenticated`** politikası (`cmd: ALL`, `qual`/`with_check`: `auth.role() = 'authenticated'`) — herhangi bir giriş yapmış kullanıcı herhangi bir profili (kendi rolü dahil) değiştirebilir. Postgres RLS politikaları OR'lanır (permissive); bu politika tek başına diğer tüm kısıtlayıcı `profiles` politikalarını (`Admin profil günceller` vb.) anlamsız kılıyor.
- **11 WARN `rls_policy_always_true`**: `procurement_items` (`allow_all_procurement`), `schedule_activities` (`allow_all_schedule`), `electrical_checklist`, `mechanical_checklist`, `quality_inspections`, `project_risks` (insert/update), `progress_items` (authenticated insert/update), `work_packages`, `purchase_request_status_log` — `USING (true)` / `WITH CHECK (true)`, rol veya proje kısıtı yok.
- **39 WARN `multiple_permissive_policies`**: özellikle `profiles` ve `purchase_requests` üzerinde eski ve yeni politikalar üst üste birikmiş (örn. `purchase_requests`'te hem "Project team creates/reads assigned..." hem `pr_insert`/`pr_select` aynı anda var) — zamanla yama üstüne yama RLS yazılmış, temizlik gerekiyor.
- `user_project_access` tablosu **0 satır** — many-to-many proje erişim mekanizması hiç kullanılmamış, gerçek erişim modeli tamamen `profiles.project_id` (tek proje) üzerinden yürüyor.
- `public_bucket_allows_listing` (1 WARN) ve `auth_leaked_password_protection` (1 WARN) — Storage bucket'ı public listelemeye izin veriyor; Supabase Auth'un sızmış şifre koruması kapalı.
- Performans tarafında (bilgi amaçlı, düşük öncelik): 50 `unindexed_foreign_keys`, 41 `auth_rls_initplan` (RLS politikalarında `auth.uid()` her satırda yeniden değerlendiriliyor, `(select auth.uid())` yapılmamış) — veri hacmi arttıkça önemli, şu an (~çift haneli satır sayıları) etkisi yok.

---

## C) Arayüz Eksikleri (8 Modül Karşılaştırması)

| Modül | Durum |
|---|---|
| **Proje yönetimi** | `TabProjeYonetimi.jsx` (CRUD + wizard) mevcut ama tamamen ham sorgu. `project_risks` sadece wizard'da düzenlenebiliyor, ayrı bir risk yönetim ekranı yok. **`work_packages`, `schedule_activities`, `critical_path_predecessors` hiçbir dosyada kullanılmıyor** — şema var, arayüz yok, veri yok (yetim). |
| **Günlük saha raporlama** | Arayüz var ve olgun (`DailyReportForm`, `DailyReportList`, `DailyReportDetail`) ama kayıt akışı RPC'yi atlıyor (bkz. A.1) — en yüksek öncelikli düzeltme. |
| **İmalat ilerlemesi** | `progress_items`/`progress_daily` günlük rapor formu içine gömülü, ayrı bir "İmalat İlerleme" ekranı yok (TabGenel/ProjeDetay içinde özet gösteriliyor). Fonksiyonel ama dağınık. |
| **Satın alma (7 adım)** | Arayüz var (`TabSatinAlma`, `ProjeTabSatinAlma`, modallar), `create_purchase_request_with_items` kullanılıyor (iyi). Ama onay/durum güncelleme hâlâ ham `update()` (A.2). Aynı liste bileşeninin 2-3 kopyası var. |
| **Fatura ve maliyet** | En olgun modül — `get_finans_overview`/`get_finans_overview_all` bu oturumda kapsamlı yeniden tasarlandı. Yine de fatura **ekleme** ve **onay kuyruğu** ham sorgu + 3 kopya kod. |
| **Teknik kontrol** (mechanical/electrical checklist, quality_inspections) | **Hiç arayüz yok.** Tablolar 0 satır, RLS tamamen açık (`USING true`), frontend'de hiçbir `supabase.from(...)` referansı yok. Modül dokümantasyonda var, kodda yok — sıfırdan yazılması gerekiyor. |
| **Kullanıcı yönetimi** | `TabKullanicilar.jsx` var ama yalnızca 6/19 rolü destekliyor, `user_project_access` (çoklu proje erişimi) arayüzü yok, rol ataması Edge Function yerine doğrudan tablo güncelleme (ve bu tablo RLS'i zayıf, bkz. B). |
| **Destek / diğer** | `tickets` olgun. `ticket_comments` sınırlı (RLS sadece 5 role okuma/yazma izni veriyor — kasıtlı mı belirsiz, doğrulanmalı). `agent_reports` sadece anlık sohbette insert ediliyor, geçmiş rapor listeleme ekranı yok. `procurement_items` satın alma talep formunda referans olarak okunuyor, kendi başına bir "tedarik takip" ekranı yok. |

### Rol bazlı erişim guard'ı — ayrı bir bulgu (yüksek öncelik)

`dashboard/index.jsx`'te `ROLE_TABS` yalnızca `muhasebe`, `satin_alma_uzmani`, `santiye_sefi` için sekme kısıtlıyor. Bu üçü dışındaki **herhangi bir rol** (koordinatör dahil 15 rol) sınırsız `TabGenel` (tam admin görünümü) görür; ayrıca `Sidebar.jsx`'teki nav item'ların `roles` dizisi bu 15 rolün hiçbirini içermediği için **sidebar boş** kalır — kullanıcı içerik görür ama gezinemez. Genel amaçlı bir `RoleGuard` bileşeni ve `ROLE_TABS`'ın 19 rolü kapsayacak şekilde genişletilmesi (idealde `roles` tablosundan okunan bir izin matrisiyle) gerekiyor.

---

## Onay Beklentisi

Bu rapor bir tespit dokümanıdır, hiçbir değişiklik yapılmadı. FAZ 2'ye (4NF
düzeltmeleri — öncelik: profiles.role/role_key birleştirme, profiles RLS
açığının kapatılması, SECURITY DEFINER fonksiyon/view erişim kontrolü) geçmeden
önce yukarıdaki öncelik listesini ve migration planını onayınıza sunacağım.
