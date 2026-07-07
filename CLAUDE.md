## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

---

## Fons Solar — sistem ve refactor kuralları

Bu proje Fons Solar GES (güneş enerji santrali) uçtan uca proje takip sistemidir.
Backend Supabase (proje ref `bshhgvdzemgfijkzhcrf`, `eu-central-2`, PostgreSQL 17),
frontend bu repodaki React + Vite (JS, TypeScript değil) uygulaması (`src/`).

Detaylı denetim bulguları için bkz. `DENETIM_RAPORU.md` (FAZ 1 çıktısı).

### Kesin kurallar
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
   Proje erişimi için `user_has_project_access(project_id)` / `user_can_access_report(report_id)`.
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

### Mevcut frontend yapısı (gerçek durum, FAZ 0 keşfi)
- Routing düz: `/login`, `/yetkisiz`, `/dashboard` (tek `ProtectedRoute`). Sayfa
  bazlı route YOK — `src/pages/dashboard/index.jsx` içinde `activeTab` state'i
  (localStorage'da saklanır) ile sekme değiştirilir; her "sayfa" aslında bir
  `Tab*.jsx` bileşenidir (`TabGenel`, `TabFinans`, `TabSatinAlma`, `TabTickets`,
  `TabKullanicilar`, `TabProjeYonetimi`, `TabSantiyeSefi`).
- Proje-özel görünümler `src/pages/dashboard/components/ProjeTab*.jsx` altında
  (`ProjeDetay.jsx` seçilen projeyi gösterir); genel/tüm-projeler görünümleri
  ayrı `Tab*.jsx` dosyalarında — bazı modüllerde (Finans, Satın Alma) bu ikisi
  aynı alt bileşenleri paylaşır (örn. `ProjeTabFinans*` bileşenleri hem tekil
  proje hem `get_finans_overview_all` ile genel sayfada kullanılıyor), bazılarında
  (Genel/TabGenel, Proje Yönetimi) tamamen ayrı, birbirini tekrar eden kod var.
  bkz. DENETIM_RAPORU.md §C.
- Auth: `src/context/AuthContext.jsx` — `role`, `isAdmin`, `projectId` sağlar.
  `isAdmin` KESİNLİKLE `role === 'admin'` olmalı (önceki bir hata `role === null`
  durumunu da admin sayıyordu, düzeltildi).
- Saha ekranları (`SantiyeSefiDashboard.jsx`, `DailyReportForm.jsx`,
  `DailyReportList.jsx`) mobil öncelikli olmalı — santiye_sefi rolü telefondan kullanır.

### Doğrulanmış RPC katmanı (34 fonksiyon, `execute_sql` ile doğrulandı)
**Okuma:** `get_dashboard_summary()`, `get_project_overview(p_project_id, p_start_date, p_end_date)`,
`get_project_gantt(p_project_id, p_filter_date)`, `get_project_dashboard(p_project_id, p_effective_date)`,
`get_daily_report_detail(p_report_id)`, `get_daily_reports_list(p_project_id, p_start_date, p_end_date, p_page, p_page_size)`,
`get_proje_detay(p_project_id)`, `get_santiye_dashboard(p_project_id, p_today)`, `get_project_by_date(p_project_id, p_date)`,
`get_satin_alma_overview(p_project_id)`, `get_satin_alma_overview_all()`,
`get_finans_overview(p_project_id, p_as_of_date)`, `get_finans_overview_all(p_as_of_date)`, `get_my_role()`

**Yazma:** `create_purchase_request_with_items(p_project_id, p_title, p_urgency, p_request_note, p_requested_by, p_items, p_category)`,
`save_daily_report(p_project_id, p_report_date, p_created_by, p_general_status, p_worker_count, p_weather, p_weather_note, p_notes, p_personnel, p_machinery, p_progress)`,
`increment_progress_total(p_item_id, p_qty)`

**Yetki yardımcıları:** `get_my_role()`, `user_can_access_report(p_report_id)`, `user_has_project_access(p_project_id)`

**Trigger zincirleri (frontend bunları yeniden hesaplamamalı):**
- `daily_reports` → `progress_daily` INSERT/UPDATE/DELETE → `update_task_progress_pct()` + `sync_progress_item_total()` → `progress_items.total_progress`, `project_tasks.progress_pct` otomatik güncellenir → `fn_sync_project_progress()` ile `projects` seviyesine yansır.
- `invoices` INSERT → `create_invoice_approval_chain()` → status'u `muhasebe_onayında` yapar + `invoice_approvals` step1 açar. `invoice_approvals` step onaylanınca (`fn_invoice_approval_cascade`) step2 açılır / `invoices.status` `yönetici_onayında` → `ödendi` ilerler.
- `invoices` INSERT/UPDATE → `sync_purchase_request_from_invoice()` → bağlı `purchase_requests.status`'unu senkronlar (`fatura_onay_bekliyor` → `faturasi_kesildi`).
- `purchase_requests` UPDATE → `handle_purchase_request_approval()`.
- `tickets` UPDATE → `fn_ticket_history()` → `ticket_history`'ye otomatik log.

### Roller (19, `roles` tablosunda tanımlı — `select key, display_name from roles`)
admin, koordinator, proje_koordinatoru, muhendis, proje_tasarim_sorumlusu,
santiye_sefi, proje_kurulum_sefi, elektrik_sefi, mekanik_sef, isg_sorumlusu,
kalite_kontrol_sefi, lojistik_tedarik, satin_alma_uzmani, enh_sorumlusu,
operasyon_sorumlusu, evrak_takip, maliyet_kontrolcu, muhasebe, is_makinesi_operator

**ÖNEMLİ:** RLS politikaları bu 19 rolün çoğunu zaten kullanıyor (örn. `budget_lines_select`
→ admin/muhasebe/proje_koordinatoru; `suppliers_select` → +maliyet_kontrolcu).
Frontend şu an yalnızca 6 rolü tanıyor (admin, muhasebe, santiye_sefi, muhendis,
koordinator, satin_alma_uzmani) — bkz. DENETIM_RAPORU.md §C, öncelik 2.

### Test verisi
5 profil, 2 proje: "Ege Enerji İzmir GES – TEST" (`test-izmir-ges-2026`) ve
"Kayseri Develi GES" (`test-kayseri-develi-ges`). Canlı müşteri verisi yok.

### Modül → tablo haritası (34 tablo + 7 view, doğrulandı)
| Modül | Tablolar |
|---|---|
| Proje yönetimi | projects, project_tasks, work_packages, critical_path_items, critical_path_predecessors, schedule_activities, project_risks |
| Günlük saha raporlama | daily_reports, daily_tasks, personnel_log_entries, machinery_logs, daily_report_photos, daily_report_issues, daily_report_material_usage |
| İmalat ilerlemesi | progress_items, progress_daily |
| Satın alma (7 adım) | purchase_requests, purchase_request_items, purchase_request_status_log |
| Fatura ve maliyet | invoices, invoice_approvals, suppliers, budget_lines, cost_allocations |
| Teknik kontrol | mechanical_checklist, electrical_checklist, quality_inspections |
| Kullanıcı yönetimi | roles, profiles, user_project_access |
| Destek / diğer | tickets, ticket_comments, ticket_history, agent_reports, procurement_items |

View'lar: `project_cost_summary`, `personnel_logs`, `vw_delayed_tasks`, `vw_monthly_progress`,
`vw_progress_timeline`, `vw_project_progress_summary`, `vw_weekly_progress` — **hepsi
SECURITY DEFINER** (RLS bypass eder, bkz. DENETIM_RAPORU.md §B öncelik 1).
