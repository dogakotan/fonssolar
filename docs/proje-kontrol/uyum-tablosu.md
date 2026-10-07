# Proje Kontrol — canlı şema ↔ tasarım uyum tablosu

Tarih: 2026-10-07 · Canlı kaynak: 05.10.2026 migration'ları (`canli-05-10-migrations/`, md5 doğrulanmış) +
`pg_policies` / `information_schema` sorguları. Tasarım kaynağı: `tasarim.md` Bölüm 4.1-4.3, 4.8.
**Migration yazılmadı.** "Öneri" sütunu karar değildir; Karar #0 ve alt kararları (Action, numara, revizyon,
Submittal/Material) kullanıcı onayına bağlıdır.

> Not: 05.10 tarihli ayrı bir plan ("Uygulama Kontrol Listesi", claude.ai sohbeti) bu karşılaştırmaya dahil
> DEĞİL — o belge repoda yok. Kullanıcıdan gelen özete göre canlı WBS/Alan yapısı o plana uyuyor; Action'ın
> ayrı tablo ve revizyonun "tek doküman, çok revizyon" olması o planın kararları. Bu iki noktada tasarım.md'nin
> düzeltilmesi gerekebilir; aşağıdaki öneriler buna göre işaretlendi.

## 0. Özet

| Alan | Durum |
|---|---|
| Tablo adları | 12'nin 5'i tasarımla aynı (`documents`, `drawings`, `rfis`, `decisions`, `material_approvals`); 7'si farklı/fazla |
| Ortak sözleşme (4.1) | Canlıda yok: `register_no`, `record_state`, `source`, `approved_*`, `responsible_id`, `source_document_id` |
| Numaralama | Biçim farklı (`RFI-2026-001`); **hata: 1000. kayıtta numara çakışır** (bkz. §3) |
| Yazma modeli | Canlı: doğrudan INSERT/UPDATE/DELETE policy'leri. Tasarım: yalnızca RPC |
| Yetki | Canlı: rol listesi + `has_project_access`. Tasarım: `register_permissions` × `register_can()` |
| Eksik altyapı | `register_permissions`, `register_links`, `register_drafts`, `document_texts`, `project_drive_folders`, `drive_sync_state`, `document_jobs`, `register_status_transitions`, `project_register_settings` |

## 1. Ortak kolon sözleşmesi (tasarım 4.1) — register tablolarında

| Kolon | Canlı | Tasarım | Öneri |
|---|---|---|---|
| id | uuid PK `gen_random_uuid()` + `unique(project_id, id)` | uuid PK | Uyumlu; `(project_id, id)` unique'i koru (kompozit FK'lerin hedefi) |
| project_id | text NOT NULL, FK projects ON DELETE CASCADE | Aynı | Uyumlu |
| Kayıt no | Tabloya özel ad: `document_no`, `drawing_no`, `rfi_no`, `action_no`, `decision_no`, `submittal_no`, `approval_no`; NOT NULL; UNIQUE(project_id, no) — documents/drawings'de `(project_id, no, revision)` | Tek ad `register_no`, UNIQUE(project_id, register_no) | Kolon adları kalabilir (view'da `register_no as …` ile normalize); tasarım 4.4 `vw_reg_<tür>` zaten bunu yapıyor |
| record_state | **yok** | draft / pending_approval / approved / rejected | Ekle (Faz B); taslak/onay modeli bunsuz kurulamaz |
| source | **yok** | manual / ai / import | Ekle |
| wbs_id, area_id | uuid; kompozit FK `(project_id, x)` → `project_wbs` / `project_areas`, ON DELETE **NO ACTION** | uuid FK ON DELETE SET NULL | Canlıyı koru: kompozit FK aynı-proje bütünlüğünü DB'de garanti ediyor. SET NULL istenirse PG15+ `on delete set null (wbs_id)` sütun listesiyle (aksi halde project_id de null'lanır) |
| task_id | Kompozit FK → `project_tasks(project_id, id)`, NO ACTION | FK `project_tasks(id)` SET NULL | Aynı gerekçeyle canlıyı koru |
| discipline | `documents`, `drawings`, `technical_submittals`: serbest text, CHECK yok; `rfis.responsible_discipline` text; diğerlerinde yok | CHECK: mechanical, dc, ac, mv, enh, civil, general | CHECK ekle (Drive klasör eşlemesi buna dayanıyor); `project_wbs.discipline` ile aynı sözlük |
| priority | Yalnız `rfis`, `actions`: low/**medium**/high/critical, varsayılan medium | low/**normal**/high/critical, varsayılan normal | Tek sözlük seç; boş tablolar → bugün değiştirmek ücretsiz. Öneri: canlının `medium`'u (değişiklik daha az) ve tasarımı güncelle — **karar bekliyor** |
| responsible_id | `rfis.assigned_to`, `actions.assigned_to` (+ `actions.responsible` text) | `responsible_id` FK profiles | Ad farkı; view'da normalize. `actions.responsible` serbest metni dış taraf için kalabilir |
| source_document_id | `rfis/drawings/technical_submittals/material_approvals.document_id` | `source_document_id` | Anlam farkı: canlıda "ilişkili doküman", tasarımda "kaydın çıkarıldığı dosya". İkisi ayrı tutulmalı; `source_document_id` ekle |
| created_by | documents, drawings, decisions, actions: var. **rfis** (`raised_by` var), **technical_submittals**, **material_approvals**: yok | Hepsinde | Ekle (dört göz kuralı ve audit için şart) |
| approved_by, approved_at, rejected_reason | yok | Hepsinde | Ekle (record_state ile birlikte) |
| created_at, updated_at | Var; `update_updated_at_column()` trigger'ı | Var | Uyumlu (fonksiyonun anon EXECUTE'u G-08) |

## 2. Altyapı tabloları

| Tasarım | Canlı | Fark | Öneri |
|---|---|---|---|
| `wbs` (code, name, parent_id, level, sort_order) UNIQUE(project_id, code) | `project_wbs` (wbs_code CHECK `^[A-Z0-9][A-Z0-9-]*$`, parent_id kompozit FK RESTRICT, level trigger'la hesaplanır, discipline, default_owner_role, is_active, notes, created_by, updated_at) | Ad; `sort_order` yok; canlıda aktif/pasif + döngü koruması + kullanımdaki kodu kilitleme var | **Canlıyı koru** (05.10 planı, test edildi — bkz. G-10); tasarım.md'yi `project_wbs`'e güncelle; `sort_order` eklenebilir |
| `areas` (code, name, **wbs_id** tekil FK, discipline) | `project_areas` (area_code, parent_id hiyerarşi, area_type CHECK 12 değer, responsible_user, is_active) + `area_wbs` (Area↔WBS çoktan çoğa, kompozit FK CASCADE) | Ad; Area→WBS tekil değil çoğul; `discipline` yok | **Canlıyı koru**; tasarımı `project_areas` + `area_wbs`'e güncelle |
| `project_register_settings` (prefix, pad_width, claim_notice_days) | yok | Proje kodu (DYB) tutulmuyor | Ekle — numara biçimi kararına bağlı |
| `register_counters` (project_id, register_type, last_value) PK(project_id, register_type) | `project_register_counters` (project_id, register_code, **year**, last_value) PK(project_id, register_code, year); RLS açık, policy yok, authenticated yetkisi yok | Yıllık sıfırlama; tablo adı | Biçim kararına göre: yıl kalırsa canlı; yıl kalkarsa `year` sabit 0 veya yeni tablo |
| `register_audit` (old_data/new_data jsonb, action, reason; UPDATE/DELETE yetkisi yok) | `register_status_history` (yalnızca old/new **status**; trigger yalnız rfis/decisions/actions'da) | Alan değişiklikleri ve onay/ret izlenmiyor; documents/drawings/submittals/approvals'ta hiç iz yok; authenticated'da INSERT/UPDATE/DELETE GRANT'i var (policy yok → RLS engelliyor) | `register_audit`'i ayrıca kur (veya genişlet); G-01 taslağı bu tablonun yazma GRANT'ini de alıyor |
| `register_permissions`, `register_status_transitions`, `register_links`, `register_drafts`, `document_texts`, `project_drive_folders`, `drive_sync_state`, `document_jobs` | yok | — | Tasarım M03, M05-M09'daki gibi eklenir (canlıyla çakışma yok) |

## 3. Numaralama

| Konu | Canlı | Tasarım | Öneri |
|---|---|---|---|
| Biçim | `{KOD}-{YIL}-{000}` → `RFI-2026-001` (proje kodu yok) | `{TÜR}-{PROJE}-{0000}` → `RFI-DYB-0032` | **Karar bekliyor** (RFI-DYB-0032 / RFI-DYB-CIV-0032). Proje kodu yokken iki projede aynı numara görünür — raporlarda ve Drive dosya adında karışır |
| Tür kodları | Trigger'la: RFI, DEC, ACT, **TS**, **MA**; `documents`/`drawings` için otomatik numara **yok** (no elle girilir) | DOC, DRW, RFI, SUB, MAT, CHG, CLM, INT, DEC, ACT, RSK | Tasarım kodları; DOC/DRW için de otomatik numara |
| Hane | 3 (`lpad(v, 3, '0')`) | 4 | **HATA:** PostgreSQL `lpad` uzun metni kırpar — `lpad('1000',3,'0') = '100'` (canlıda doğrulandı). Bir proje/yıl/türde 1000. kayıt 100. kayıtla aynı numarayı alır → UNIQUE ihlali → o türde yeni kayıt açılamaz. Düzeltme: `lpad` yerine `to_char`/genişlik kontrolü veya `greatest(length(v::text), pad)` |
| Atomiklik | `insert … on conflict do update … returning` aynı transaction'da | Aynı yöntem, Faz B kapısında eşzamanlılık testi şart | Aynı; request_no deneyimi (CLAUDE.md) nedeniyle 20 eşzamanlı istek testi (T07/T08) |
| Mevcut kayıtlara numara | Atama yok (`tickets`, `project_risks`) | ACT/RSK yeni kayıtlara | Action kararına bağlı |

## 4. Register tabloları — tabloya özel kolonlar ve CHECK'ler

### documents
| Kolon / kural | Canlı | Tasarım | Öneri |
|---|---|---|---|
| Tür | `document_type` text, CHECK yok | `doc_type` CHECK (drawing, rfi, submittal, correspondence, report, contract, minutes, photo, other) | CHECK ekle; Drive klasör şablonu buna bağlı |
| Revizyon | `revision` NOT NULL default `'00'`; UNIQUE(project_id, document_no, revision) | `revision` + `supersedes_id` zinciri, her revizyon ayrı satır | **Karar bekliyor** (05.10 planı: tek doküman çok revizyon, `is_current`). Canlı unique'i iki modele de izin veriyor |
| Dosya konumu | `storage_provider` CHECK (onedrive, sharepoint, google_drive, supabase_storage, external), `storage_file_id`, **`storage_url`**, file_name, mime_type | `storage_provider` (gdrive, supabase), `drive_file_id`, `drive_folder_id`, file_name, mime_type, size_bytes | Canlının sağlayıcı-bağımsız adları iyi (Karar #1 ile çelişmez); **`storage_url` kaldırılmalı veya asla istemciye dönmemeli** — tasarım "tarayıcıya Drive bağlantısı verilmez" |
| Bütünlük | yok | `sha256` + index(project_id, sha256), `size_bytes`, UNIQUE(project_id, drive_file_id) | Ekle (tekrar yükleme 409'u buna dayanıyor) |
| Senkron/AI | yok | `drive_state` (ok, trashed, missing), `ai_status` (pending, processing, done, failed, skipped), `registered` | Ekle (Faz C) |
| Durum | `status` CHECK draft, in_review, approved, issued, superseded, cancelled | active, superseded, void (+ record_state) | Canlının status'u record_state ile örtüşüyor (draft/approved). İki eksenli modele geçilirse status → active/superseded/void |
| Tarihler | issue_date, effective_date | — | Kalabilir |

### drawings
| Kolon / kural | Canlı | Tasarım | Öneri |
|---|---|---|---|
| Bağ | `document_id` (kompozit FK) + ayrıca `storage_provider/file_id/url` | Yalnızca `document_id`; dosya documents'ta | Çift dosya alanını kaldır (tek kaynak ilkesi) |
| Revizyon | `revision`, `supersedes_drawing_id` (kompozit FK); UNIQUE(project_id, drawing_no, revision) | `revision`, `supersedes_id`; aynı unique | Uyumlu (ad farkı) |
| Durum | `status`: draft, in_review, approved, issued_for_construction, as_built, superseded, cancelled | `issue_status`: ifa, ifr, ifc, as_built, superseded | Sözlükler örtüşüyor; IFA/IFR ayrımı canlıda yok — sahada kullanılıyorsa ekle |
| Diğer | discipline, drawing_type, issue_date, created_by | — | Kalabilir |

### rfis
| Kolon / kural | Canlı | Tasarım (`rfi_v1` şeması da buna bağlı) | Öneri |
|---|---|---|---|
| Soru/cevap | subject, question, description, **response** | subject, question, **answer** | Ad farkı; AI şeması view adlarına göre |
| Taraflar | `raised_by` uuid (iç kullanıcı), `assigned_to`, `responsible_discipline` | `raised_by_party` (contractor, owner, subcontractor, engineer) | İkisi farklı şey: iç kişi ≠ soran taraf. `raised_by_party` ekle |
| Tarihler | raised_date (NOT NULL default current_date), due_date, answered_date | raised_at, due_date, answered_at, **closed_at**; CHECK answered_at ≥ raised_at | `closed_at` ve tarih CHECK'i ekle |
| Etki | yok | `schedule_impact_days`, `cost_impact` (none, potential, confirmed), `contract_ref` | Ekle (AI şeması bunları çıkarıyor) |
| Durum | open, under_review, answered, closed, rejected | open, answered, closed, cancelled | Birleştir: `under_review` faydalı; `rejected` vs `cancelled` tek seç |
| Bağlar | drawing_id, document_id, decision_id (kompozit FK) | drawing_id + register_links | Uyumlu; çoktan çoğa bağlar register_links'e |

### actions (Action register)
| Konu | Canlı | Tasarım | Öneri |
|---|---|---|---|
| Model | Ayrı `actions` tablosu (title, description, status open/in_progress/done/cancelled, priority, assigned_to, responsible, due_date, completed_at, source_type CHECK 8 değer, decision/rfi/risk bağları) | `tickets` genişletmesi (register_no, wbs/area/task, source_document_id) | 05.10 planı ayrı tablo diyor ve ticket'ın mevcut akışına dokunmuyor → **ayrı tablo + tasarımı düzelt**; ad (`actions` / `project_actions`) **karar bekliyor**. `source_type`'ta `inspection`, `ncr` var — Karar #6 (pilotta NCR yok) ile tutarlı tut |

### technical_submittals
| Kolon / kural | Canlı | Tasarım (`submittals`) | Öneri |
|---|---|---|---|
| Alanlar | title, description, discipline, supplier_id, submitted_date, due_date, reviewed_date, reviewer_id, revision, document_id | title, **spec_ref**, **submittal_type** (shop_drawing, material, method_statement, test_report, sample), submitted_at, due_date, returned_at, **review_comment**, document_id | Eksikleri ekle; `reviewer_id`/`supplier_id` canlıda fazladan ve faydalı |
| Durum | draft, submitted, under_review, approved, approved_with_comments, rejected, resubmit_required | submitted, approved, approved_with_comments, rejected, resubmit | Canlı daha kapsamlı; koru |
| Ad | `technical_submittals` | `submittals` | Canlı adı koru, tasarımı güncelle (Submittal/Material kararına bağlı) |

### material_approvals
| Kolon / kural | Canlı | Tasarım | Öneri |
|---|---|---|---|
| BOM bağı | **Ters yön**: `procurement_items.material_approval_id`, `purchase_requests.material_approval_id` (+ `technical_submittal_id`) | `material_approvals.procurement_item_id` | Canlı yön: bir onay birden çok kaleme bağlanabilir — mantıklı; ama satın alma tablolarına Faz D'den önce yazılabilir kolon eklenmiş (tasarım "yalnızca okuma köprüsü"). Kolonlar boş; korunabilir, yazma yalnızca RPC'den |
| Alanlar | approval_no, material_name, manufacturer, model, supplier_id, submitted_date, approved_date, revision, technical_submittal_id, document_id | material_name, supplier_id, submittal_id, approved_at, **required_on_site** | `required_on_site` (sahaya gerekli tarih) ekle — gecikme analizi için |
| Durum | draft, submitted, approved, approved_with_comments, rejected, expired | pending, approved, rejected | Canlıyı koru |
| created_by | yok | var | Ekle |

### decisions
| Kolon / kural | Canlı | Tasarım | Öneri |
|---|---|---|---|
| Alanlar | decision_no, title, decision_text, decision_date, decision_maker (text), rfi_id, risk_id | title, decision_text, decided_at, decided_by_text, **supersedes_id** | `supersedes_id` ekle; ad farkları view'da |
| Durum | proposed, approved, superseded, cancelled | proposed, decided, superseded | Birini seç; kritik register (dört göz) |
| Faz | Şimdiden var | Faz E | Boş durması zararsız; UI'ya Faz E'de bağlanır |

### Tasarımda olup canlıda olmayan register'lar
`changes`, `claims`, `interfaces` — yok (tasarım Faz D/E). Çakışma yok.

## 5. Mevcut tablolara eklenenler

| Tablo | Canlı | Tasarım | Öneri |
|---|---|---|---|
| project_tasks | + activity_id (format CHECK, proje içi unique, **bir kez atanınca değiştirilemez — NULL'a da geri alınamaz**), wbs_id, area_id (kompozit FK RESTRICT), discipline, baseline_start/end (**228 satır dolduruldu**), primavera_id, forecast_start/end, **is_critical** (hepsi false); `trg_project_tasks_identity_guard` | wbs_id, area_id (SET NULL) | Koru; `is_critical`'ı kaldır (03.08 kararı, okuyan yok) — ayrı migration, onaya bağlı. activity_id kilidi Excel içe aktarımında dikkate alınmalı |
| project_risks | + wbs_id, area_id, task_id, rfi_id, action_id, decision_id | register_no, wbs/area/task, source_document_id, approved_by/at, source CHECK + 'ai' | Eksik onay alanları Faz D'de; mevcut kolonlar boş, koru |
| purchase_requests | + wbs_id, area_id, task_id, material_approval_id, technical_submittal_id | yok (Faz D köprüsü, register_links ile, yalnızca okuma) | Koru ama satın alma akışı bunlara yazmamalı; köprü kararı Faz D |
| procurement_items | + wbs_id, area_id, task_id, material_approval_id | Ters yönlü FK | Bkz. material_approvals |
| suppliers | `supplier_type` zaten var (malzeme_ekipman, hizmet, nakliye, diger) | Faz D'de `supplier_type` (supplier, subcontractor, both) | **Ad çakışması** — tasarımda farklı ad (ör. `party_type`) kullanılmalı |
| tickets | değişiklik yok | Action için genişletme | Action kararına bağlı |
| notifications | değişiklik yok | `meta` jsonb + entity_type CHECK genişlemesi | Faz C |

## 6. RLS ve yetki

| Konu | Canlı | Tasarım | Öneri |
|---|---|---|---|
| Okuma | `user_has_project_access(project_id)` — muhasebe (`is_manager`) bütün projelerde her register'ı okur | `has_project_access AND register_can(type,'view')` — muhasebe çoğunu göremez | `register_can` eklenince SELECT policy'leri güncellenir |
| Yazma (8 register tablosu) | Doğrudan; insert/update `can_write_project_control` (admin/PM/şantiye şefi), delete `can_manage_project_control` (admin/PM) | Policy yok, yalnızca SECURITY DEFINER RPC | G-01 geçici REVOKE (taslak) → Faz B RPC'leri |
| Yazma (WBS/Alan) | Doğrudan; rol + proje (bkz. G-10: başka projeye yazma yok, testle doğrulandı) | Policy yok | 05.10 planı doğrudan yazmayı öngörüyor → **koru**; tasarım.md'de master veri istisnası olarak yaz |
| Realtime | Yeni tabloların hiçbiri yayında değil | register_drafts, documents, document_jobs + register tabloları | Faz B/C |
