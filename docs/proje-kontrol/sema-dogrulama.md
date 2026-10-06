# Proje Kontrol — Faz A şema doğrulaması

Tarih: 2026-10-06 · Kaynak: canlı Supabase (`bshhgvdzemgfijkzhcrf`), yalnızca SELECT ile.
Karşılaştırılan: `docs/proje-kontrol/tasarim.md` (v2), özellikle Bölüm 1 "Başlangıç noktası",
Bölüm 4 "Okuma rehberi", 4.1-4.5, 4.8.

## 0. Önce okunması gereken: canlıda tasarımla çelişen bir Proje Kontrol şeması zaten var

`supabase_migrations.schema_migrations` 05.10.2026 tarihli üç migration gösteriyor:

| Version | Ad | Yerel dosya |
|---|---|---|
| 20261005103850 | faz1_wbs_alan_activity | **yok** |
| 20261005125957 | project_control_phase1_core | **yok** |
| 20261005132810 | project_control_phase1b_hardening | **yok** |

Bunlar canlıya 12 yeni tablo ve mevcut tablolara kolon eklemiş. Tabloların **hepsi boş**
(0 satır) ve `src/`, `tests/`, `supabase/` altında bunları kullanan kod yok (grep ile
doğrulandı). Tasarım dosyası bu durumu bilmiyor: "Faz A'da şema değişmez, ilk migration'lar
Faz B'de başlar" diyor; oysa Faz B'nin bir kısmı farklı adlar ve farklı bir yetki modeliyle
zaten uygulanmış.

| Tasarım (v2) | Canlıda bulunan | Fark |
|---|---|---|
| `wbs` (code, level, parent_id) | `project_wbs` (wbs_code, level, parent_id, is_active, discipline, default_owner_role) | Ad farklı; kompozit FK `(project_id, id)` |
| `areas` (code, wbs_id) | `project_areas` (area_code, parent_id, area_type, responsible_user) + `area_wbs` (çoktan çoğa) | Ad farklı; Area→WBS çoktan çoğa |
| `register_counters(project_id, register_type, last_value)` | `project_register_counters(project_id, register_code, year, last_value)` | Yıl bazlı sayaç |
| Numara biçimi `RFI-DYB-0032` (proje kodu, 4 hane) | `next_register_no()` → `RFI-2026-001` (yıl, 3 hane, **proje kodu yok**) | Biçim çelişiyor; `project_register_settings` yok |
| `register_audit` (old/new jsonb, action, reason) | `register_status_history` (yalnızca status değişimi) | Yalnızca durum geçmişi; alan değişikliği izlenmiyor |
| `record_state`, `source`, `approved_by`, `approved_at` ortak kolonları | **Yok** — her tabloda yalnızca `status` | İki eksenli durum modeli yok |
| `documents` (drive_file_id, sha256, supersedes_id, ai_status, drive_state, registered) | `documents` (document_no, storage_provider, storage_file_id, storage_url, …) | sha256/supersedes/ai_status yok; `storage_provider` CHECK'i `google_drive` diyor, tasarım `gdrive` |
| `drawings` | `drawings` (supersedes_drawing_id, storage_* tekrar) | Kısmen uyumlu |
| `rfis` (raised_by_party, schedule_impact_days, cost_impact, contract_ref, record_state) | `rfis` (raised_by uuid, response, priority `medium`) | Alan seti farklı; priority sözlüğü `medium` vs tasarım `normal` |
| Action = `tickets` genişletmesi (Karar: mevcut genişler) | Ayrı `actions` tablosu | **Tasarım ilkesi "kopyalama, genişlet" ile çelişiyor** |
| `submittals` | `technical_submittals` | Ad farklı |
| `material_approvals` | `material_approvals` + `procurement_items.material_approval_id`, `purchase_requests.material_approval_id` | Ters yönlü FK'ler eklenmiş |
| `decisions` (Faz E) | `decisions` (şimdiden) | Erken |
| `register_permissions`, `register_can()` | **Yok**; yerine `can_write_project_control()` (admin/PM/şantiye şefi) ve `can_manage_project_control()` (admin/PM) | Register × eylem matrisi yok |
| "Yeni tablolara INSERT/UPDATE/DELETE policy yazılmaz, yazma yalnızca RPC" | Her register tablosunda doğrudan INSERT/UPDATE/DELETE policy'si var | **Tasarımın temel güvenlik ilkesiyle çelişiyor** (bkz. guvenlik-bulgulari.md G-01) |
| `project_tasks` + `wbs_id`, `area_id` | + `activity_id`, `wbs_id`, `area_id`, `discipline`, `baseline_start/end`, `primavera_id`, `forecast_start/end`, **`is_critical`** | `is_critical` 03.08.2026'da kullanıcı kararıyla kaldırılmıştı; phase1_core `add column if not exists` ile **geri ekledi** (şu an hiçbir satırda true değil) |
| `project_risks` + register_no, wbs/area/task, source_document_id, approved_by/at | + `wbs_id`, `area_id`, `task_id`, `rfi_id`, `action_id`, `decision_id` | register_no/onay alanları yok |
| `suppliers.supplier_type` (supplier/subcontractor/both) — Faz D'de eklenecek | Kolon **zaten var**, NOT NULL, CHECK `malzeme_ekipman/hizmet/nakliye/diger` | Aynı ad, tamamen farklı anlam; tasarımdaki değerler eklenemez, kolon adı çakışıyor |
| `purchase_requests` köprüsü (Faz D, okuma) | `wbs_id`, `area_id`, `task_id`, `material_approval_id` kolonları eklenmiş | Faz D'den önce, yazılabilir kolonlar |

Ek (06.10.2026, 2. tur): üç migration'ın SQL'i `canli-05-10-migrations/` altında birebir arşivlendi (md5
eşleşti). `git log --all` (commit mesajı + `-S` ile tablo/fonksiyon adı), stash, worktree ve disk
taramasında iz yok. `faz1_wbs_alan_activity` başlığındaki "additive only" ifadesine rağmen
`project_tasks`'ın 228 satırının tamamında `baseline_start/end = planned_start/end` yazıyor (veri
güncellemesi). Bağımlılık: hiçbir view/RPC kullanmıyor; yalnızca kendi trigger yardımcıları
(`next_register_no`, `fn_assign_register_no`, `fn_log_register_status`, `fn_project_*_guard`) ve
mevcut tablolardan 14 gelen FK (`project_tasks`, `project_risks`, `purchase_requests`,
`procurement_items` → `project_wbs`/`project_areas`/`rfis`/`actions`/`decisions`/`material_approvals`/
`technical_submittals`; tüm bu kolonlar şu an boş). `trg_project_tasks_identity_guard` canlı
`project_tasks` tablosunun her INSERT/UPDATE'inde çalışıyor (yalnızca wbs/area/activity doluysa etkili).
`is_critical`: 228 satırın 0'ında true; hiçbir fonksiyon, view, trigger veya `src/` kodu okumuyor.

Bu durum Faz B'den önce bir karar gerektiriyor (bkz. CLAUDE.md "Proje Kontrol (Faz A)" →
Karar #0 önerisi). Faz A kapsamında hiçbir şey değiştirilmedi.

## 1. Tasarımın varsayımları ve doğrulama sonucu

| # | Tasarımdaki iddia (yer) | Canlıda | Sonuç |
|---|---|---|---|
| 1 | `projects.id` text (4 Okuma rehberi) | text NOT NULL | doğrulandı |
| 2 | Kullanıcı kimliği uuid; `profiles.id` uuid | uuid NOT NULL | doğrulandı |
| 3 | `project_risks.id` uuid (varsayım) | uuid NOT NULL | doğrulandı |
| 4 | `procurement_items.id` uuid (varsayım) | uuid NOT NULL | doğrulandı |
| 5 | `project_tasks.id` uuid, UNIQUE(project_id, task_code) | `project_tasks_project_id_task_code_key` var | doğrulandı |
| 6 | `suppliers.id`, `tickets.id` uuid | uuid | doğrulandı |
| 7 | `notifications.entity_id` uuid; entity_type/event_type CHECK'li | entity_id uuid **NOT NULL**; CHECK'ler var (entity_type 6 değer, event_type 10 değer) | doğrulandı (not: entity_id NOT NULL; yeni register_draft bildirimleri uuid'li taslak id'si vermeli) |
| 8 | `notifications.meta` yok (Faz C'de eklenecek) | yok | doğrulandı |
| 9 | `roles.key` text PK, 4 aktif rol | admin, proje_yoneticisi, santiye_sefi, muhasebe | doğrulandı |
| 10 | `has_project_access(p_project_id text)` NULL için true | gövde `p_project_id is null or …` | doğrulandı |
| 11 | `has_project_access` kullanıcıya çağrılabilir (drive-gateway için) | anon EXECUTE yok, authenticated EXECUTE var | doğrulandı |
| 12 | `get_my_role()` SECURITY DEFINER | evet, STABLE; anon yok, authenticated var | doğrulandı |
| 13 | `notify_role` proje kapsamını daraltıyor mu? (4.7, açık nokta 5) | **Daraltmıyor**: `where p.role_key = p_role_key` — projeden bağımsız, o roldeki herkese gider | yanlış varsayılabilir → bulgu G-04 |
| 14 | `notify_user` | Tek kullanıcıya; proje kontrolü yok (çağıran sorumlu) | doğrulandı (not) |
| 15 | `schedule_activities` silindi (Bölüm 1) | `to_regclass` NULL | doğrulandı |
| 16 | "40 tablo, 7 view" (Bölüm 1) | 53 tablo, 7 view | **yanlış** — 41 eski tablo (CLAUDE.md'deki "40 tablo + notifications") + 05.10 migration'larının 12 tablosu = 53 |
| 17 | "422 migration" (Bölüm 1) | `schema_migrations`: 434 satır | **yanlış** (güncel değil) |
| 18 | "5 edge function: agent-chat, create-user, export/import-project-excel, manage-user" | Canlıda **4** adet: create-user, manage-user, import-project-excel, export-project-excel. `agent-chat` repoda var ama **deploy edilmemiş** | **yanlış** |
| 19 | Bucket'lar private (24.07) | saha-fotolari, ticket-ekleri, teklif-ekleri: `public=false` | doğrulandı |
| 20 | `save_daily_report` ve `tickets_insert` auth.uid() + has_project_access ile korunuyor | `save_daily_report`: `p_created_by is distinct from auth.uid()` → hata; rol + `has_project_access` kontrolü var; anon EXECUTE yok | doğrulandı (tickets_insert testle doğrulandı, bkz. güvenlik spec) |
| 21 | `create_purchase_request_with_items` kimliği auth.uid() ile doğruluyor | `p_requested_by is distinct from auth.uid()` → hata; anon EXECUTE yok | doğrulandı |
| 22 | pg_cron var | pg_cron 1.6.4 kurulu; 1 iş (`daily-report-reminders`, hafta içi 06:00) | doğrulandı |
| 23 | pg_net var mı? (4.5 drive-sync tetikleme) | **Kurulu değil**; `pg_available_extensions`'ta mevcut (kurulabilir) | belirsiz → kurulum kararı gerekir (şema değişikliği, Faz A'da yapılmadı) |
| 24 | pgvector yok (Bölüm 1) | `vector` kurulu değil, kurulabilir | doğrulandı |
| 25 | Realtime yayını | daily_reports, invoices, notifications, progress_daily, project_tasks, purchase_requests, tickets (7 tablo) | doğrulandı (yeni register tabloları yayında değil) |
| 26 | "register, WBS, Area, doküman ve genel audit kaydı yok" (Bölüm 1) | WBS/Area/documents/rfis/… **var** (boş); genel audit yok | **yanlış** (bkz. Bölüm 0) |
| 27 | `suppliers`'a Faz D'de `supplier_type` eklenecek (4.2-C) | Kolon zaten var, farklı sözlükle | **yanlış** — tasarım bu kolon adını kullanamaz; ör. `party_type` gibi başka bir ad gerekir |
| 28 | `project_risks.source` CHECK manuel/otomatik | `manuel`, `otomatik` | doğrulandı |
| 29 | `project_tasks.is_critical` yok (Planning agent `is_critical` kullanacak — 4.6) | Kolon geri eklenmiş, tümü false | çelişkili — tasarım 4.6 zaten `is_critical`'a atıf yapıyor; CLAUDE.md'ye göre kullanıcı kararıyla kaldırılmıştı |
| 30 | Yeni tablo FK'leri text `project_id` | 05.10 tabloları `project_id text NOT NULL` | doğrulandı |

## 2. Ham çıktılar (özet)

**Bölüm 4.8 sorgusu** (5 tablo) — kolon listesi:

- `projects`: id text!, name, capacity_kwp, capacity_kwe, location, total_days, start_date, target_date, created_at, status!, progress int!, project_type, storage_kwh, panel_*/inverter_*/battery_*, procurement_completed!, procurement_completed_at, procurement_completed_by uuid
- `profiles`: id uuid!, full_name!, email, created_at, role_key!, project_id text
- `project_risks`: id uuid!, project_id text!, title!, description, severity!, probability, impact, mitigation, status!, created_at!, updated_at!, source!, rule_code, subject_ref, category!, closed_at, wbs_id, area_id, task_id, rfi_id, action_id, decision_id
- `procurement_items`: id uuid!, project_id text, item_no, category, equipment!, spec_ref, quantity text, unit, standard, brand_criteria, warranty_years, responsible, lead_time_days, updated_at, planned_qty numeric, wbs_id, area_id, task_id, material_approval_id
- `notifications`: id!, recipient_id!, actor_id, project_id text, entity_type!, entity_id uuid!, event_type!, title!, body, is_read!, read_at, created_at!

(`!` = NOT NULL.) Ek: `procurement_items.project_id` **nullable** — tasarımın "yeni tablolarda project_id NOT NULL" kuralı mevcut tabloyu kapsamıyor, Material Approval köprüsünde dikkate alınmalı.

**Ek tablolar:** `suppliers` (supplier_type NOT NULL, currency, status), `tickets` (project_id **nullable** — genel ticket), `project_tasks` (yukarıda).

**Fonksiyonlar:** `has_project_access`, `user_has_project_access` (delegasyon), `get_project_scope` (authenticated EXECUTE yok — doğru), `notify_role` / `notify_user` / `notify_managers` (SECURITY DEFINER, authenticated EXECUTE yok — doğru; yalnızca trigger'lardan).

**Storage policy'leri:** `storage.objects` üzerinde 9 policy. SELECT policy'leri satır tablosuna (daily_report_photos / ticket_attachments / purchase_offers) bağlanıyor ve `has_project_access` arıyor. INSERT/DELETE policy'leri `{public}` rolüne yazılı ama `auth.uid() IS NOT NULL` şartı var. Ayrıntı: guvenlik-bulgulari.md.

## 3. Doğrulanamayanlar

- 05.10.2026 migration'larını **kimin, hangi oturumdan** uyguladığı — `schema_migrations` bu bilgiyi tutmuyor. Yerel dosya olmadığı için başka bir makinede/oturumda yazılmış olmalı; git geçmişinde iz yok.
- `agent-chat`'in neden canlıda olmadığı (hiç deploy edilmemiş mi, silinmiş mi) — edge function listesi geçmiş tutmuyor.
