# Proje Kontrol — canlı şema özeti

Kaynak: canlı veritabanı (`bshhgvdzemgfijkzhcrf`), yalnızca SELECT. Tarih: **07.10.2026**, uyum migration'ı
(`20261007072501`) sonrası. Hiçbir tabloda veri yok; tek istisna `project_register_settings`'teki 4 proje kodu.

**Kısaltmalar:**
- `NN` = NOT NULL; `=` varsayılan değeri gösterir.
- `auth` = `authenticated` rolü.
- **kFK** = kompozit FK `(project_id, x)` → hedef `(project_id, id)`. Bu yapı bağın aynı projede kalmasını veritabanı düzeyinde garanti eder.
- **ON DELETE:** belirtilmemişse NO ACTION.

**Bütün tablolarda ortak olanlar:**
- RLS açık.
- `anon` rolüne hiçbir yetki verilmemiş.
- `project_id text NN` FK → `projects(id)` ON DELETE CASCADE.
- `id` olan her tabloda `UNIQUE (project_id, id)` var; kFK'lerin hedefi budur.

**RLS yardımcıları** (SECURITY DEFINER; `auth` çalıştırabilir):
- `user_has_project_access(pid)`: okuma. `has_project_access`'e delege eder. Muhasebe (`is_manager`) ve proje yöneticisi (`cross_project`) bütün projeleri okur.
- `can_write_project_control(pid)`: `get_my_role() in (admin, proje_yoneticisi, santiye_sefi) AND has_project_access(pid)`.
- `can_manage_project_control(pid)`: `get_my_role() in (admin, proje_yoneticisi) AND has_project_access(pid)`.

---

## 1. Master veri (doğrudan yazılır; G-01 kapsamı dışında)

### project_wbs
| Kolon | Tip / kural |
|---|---|
| id | uuid NN =gen_random_uuid() |
| wbs_code | text NN, CHECK `^[A-Z0-9][A-Z0-9-]*$`, UNIQUE (project_id, wbs_code) |
| parent_id | uuid, kFK → project_wbs ON DELETE RESTRICT; CHECK parent_id ≠ id |
| name | text NN |
| level | smallint NN =1 (trigger hesaplar) |
| discipline, default_owner_role, notes | text (CHECK yok) |
| is_active | boolean NN =true |
| created_by | uuid =auth.uid() (FK yok) |
| created_at, updated_at | timestamptz NN =now() |

- **Trigger:**
  - `trg_project_wbs_guard` (BEFORE INSERT/UPDATE, INVOKER):
    - `level` değerini üst kayıttan hesaplar.
    - Projenin değiştirilmesini engeller.
    - Kullanımdaki (project_tasks'a bağlı) kodun değiştirilmesini engeller.
    - Üst kayıt pasifken alt kaydı aktif tutmayı reddeder.
    - Döngüyü (kendi alt dalına taşımayı) reddeder.
  - `trg_project_wbs_updated_at`.
- **RLS:**
  - Okuma: SELECT `user_has_project_access`.
  - Yazma (INSERT, UPDATE, DELETE): yalnızca admin, ya da proje yöneticisi + `has_project_access`.
- **Yetki:** `auth`: SELECT, INSERT, UPDATE, DELETE, **TRUNCATE, REFERENCES, TRIGGER** (bkz. §6 not 1).

### project_areas
| Kolon | Tip / kural |
|---|---|
| id, area_code, parent_id, name, is_active, notes, created_by, created_at, updated_at | project_wbs ile aynı desen. area_code CHECK aynı, UNIQUE (project_id, area_code), parent kFK RESTRICT |
| area_type | text NN ='diger'; CHECK: genel, ges, pv_blok, inverter_station, mv_feeder, tm, eih_section, depo, laydown, kamp, yol, diger |
| responsible_user | uuid FK profiles ON DELETE SET NULL |

- **Trigger:**
  - `trg_project_areas_guard`: WBS guard'ın aynısı. Tek fark: `level` kolonu yok.
  - `trg_project_areas_updated_at`.
- **RLS:**
  - Okuma: SELECT `user_has_project_access`.
  - INSERT / UPDATE:
    - admin;
    - proje yöneticisi + `has_project_access`;
    - **şantiye şefi yalnızca kendi `profiles.project_id`'sinde**.
  - DELETE: admin, ya da proje yöneticisi + erişim.
- **Yetki:** project_wbs ile aynı (TRUNCATE dahil).

### area_wbs (Alan ↔ WBS çoktan çoğa)
| Kolon | Kural |
|---|---|
| project_id, area_id, wbs_id | hepsi NN; PK (area_id, wbs_id); kFK → project_areas ve project_wbs, **ON DELETE CASCADE** |

- **RLS:**
  - Okuma: SELECT `user_has_project_access`.
  - INSERT / DELETE: project_areas ile aynı (şantiye şefi kendi projesinde).
  - **UPDATE policy'si yok.**
- **Trigger:** yok.
- **Yetki:** `auth` hepsi (TRUNCATE dahil).

## 2. Register tabloları (G-01: `auth` yalnızca SELECT)

Hepsinde ortak olanlar:
- **Policy'ler:** `*_select` `user_has_project_access`. `*_insert` / `*_update` `can_write_project_control`, `*_delete` `can_manage_project_control`. Bu policy'ler **duruyor ama etkisiz**, çünkü yetki yok.
- **Yetki:** `auth: SELECT`.
- **Trigger:** `trg_<tablo>_updated_at`.
- **Bağlar:** `wbs_id` / `area_id` / `task_id` bulunan tablolarda bunlar kFK'dir; project_wbs / project_areas / project_tasks'a gider, NO ACTION.

### documents (doküman kimliği)
| Kolon | Tip / kural |
|---|---|
| document_no | text NN; UNIQUE (project_id, document_no); boş gelirse trigger doldurur |
| title | text NN |
| document_type | text (CHECK **yok**; `'drawing'` değeri DRW numarası ve çizim bağı için anlamlı) |
| discipline | text (CHECK yok) |
| status | text NN ='active'; CHECK active, void |
| wbs_id, area_id, task_id | uuid, kFK |
| created_by | uuid FK profiles SET NULL |
| created_at, updated_at | timestamptz NN |

- **Ek unique:** `(project_id, id, document_type)`. drawings'in 3 kolonlu FK'sinin hedefi budur.
- **Trigger:** `trg_documents_assign_no` (BEFORE INSERT) → `fn_assign_document_no()`. Numara boşsa `document_type='drawing'` için DRW, diğerleri için DOC numarası verir.
- **Yorum:** "tek doküman, çok revizyon; dosya ve revizyon document_revisions'ta".

### document_revisions
| Kolon | Tip / kural |
|---|---|
| document_id | uuid NN; kFK → documents **ON DELETE CASCADE** |
| revision_no | text NN; CHECK `^[A-Z0-9][A-Z0-9.-]{0,9}$`; UNIQUE (document_id, revision_no) |
| revision_status | text NN; CHECK ifr, ifa, ifc, as_built |
| is_current | boolean NN =false; **kısmi unique (document_id) WHERE is_current** (tek güncel revizyon) |
| issue_date | date |
| storage_provider | text; CHECK onedrive, sharepoint, google_drive, supabase_storage, external |
| storage_file_id, file_name, mime_type, notes | text |
| size_bytes | bigint; CHECK ≥ 0 |
| sha256 | text; CHECK `^[0-9a-f]{64}$` |
| created_by | uuid FK profiles SET NULL |
| created_at | timestamptz NN (updated_at **yok**) |

- **İndeks:** (project_id, document_id), (project_id, sha256) WHERE sha256 dolu, (created_by).
- **RLS:** **Yalnızca SELECT policy'si var** (yazma policy'si hiç yok).
- **Trigger:** yok.
- **Not:** `storage_url` yok; PDF metni hiçbir tabloda saklanmıyor.

### drawings (dokümana bire bir uzantı; kendi numarası yok)
| Kolon | Tip / kural |
|---|---|
| document_id | uuid NN; UNIQUE (document_id) |
| document_type | text NN ='drawing'; CHECK = 'drawing' |
| drawing_type | text |
| created_by, created_at, updated_at | — |

- **FK:** `(project_id, document_id, document_type)` → `documents(project_id, id, document_type)`, NO ACTION. Bu yalnızca çizim türündeki dokümana bağlanmayı sağlar. Bağlı bir dokümanın türü de değiştirilemez.
- **Gelen FK:** `rfis.drawing_id`.

### rfis
| Kolon | Tip / kural |
|---|---|
| rfi_no | text NN; UNIQUE (project_id, rfi_no); trigger RFI |
| subject, question | text NN |
| description, response, responsible_discipline | text |
| status | text NN ='open'; CHECK open, under_review, answered, closed, rejected |
| priority | text NN ='medium'; CHECK low, medium, high, critical |
| raised_by, assigned_to | uuid FK profiles SET NULL |
| raised_date | date NN =CURRENT_DATE |
| due_date, answered_date | date |
| wbs_id, area_id, task_id | kFK |
| drawing_id, document_id, decision_id | kFK → drawings / documents / decisions |

- **Trigger:**
  - `trg_rfis_assign_no` → `fn_assign_register_no('rfi_no','RFI')`.
  - `trg_rfis_status_history` (AFTER INSERT / UPDATE OF status) → `fn_log_register_status('rfi')`.

### project_actions (eski `actions`)
| Kolon | Tip / kural |
|---|---|
| action_no | text NN; UNIQUE (project_id, action_no); trigger ACT |
| title | text NN |
| description | text |
| status | text NN ='open'; CHECK open, in_progress, done, cancelled |
| priority | text NN ='medium'; CHECK low, medium, high, critical |
| assigned_to | uuid FK profiles SET NULL |
| responsible | text (serbest, dış taraf) |
| due_date | date |
| completed_at | timestamptz |
| source_type | text NN ='manual'; CHECK manual, risk, rfi, decision, meeting, other |
| wbs_id, area_id, task_id | kFK |
| decision_id, rfi_id, risk_id | kFK → decisions / rfis / project_risks |
| created_by | uuid FK profiles SET NULL |

- **İndeks:** (project_id, due_date) WHERE status in (open, in_progress).
- **Trigger:** `assign_no` ('action_no','ACT'), `status_history` ('action'), `updated_at`.
- **Gelen FK:** `project_risks.action_id`.

### decisions
| Kolon | Tip / kural |
|---|---|
| decision_no | text NN; UNIQUE; trigger DEC |
| title, decision_text | text NN |
| decision_date | date |
| decision_maker | text |
| status | text NN ='proposed'; CHECK proposed, approved, superseded, cancelled |
| wbs_id, area_id, task_id | kFK |
| rfi_id, risk_id | kFK → rfis / project_risks |
| created_by | uuid FK profiles SET NULL |

- **Trigger:** `assign_no` ('decision_no','DEC'), `status_history` ('decision'), `updated_at`.
- **Gelen FK:** `rfis.decision_id`, `project_actions.decision_id`, `project_risks.decision_id`.

### technical_submittals
| Kolon | Tip / kural |
|---|---|
| submittal_no | text NN; UNIQUE; trigger TS |
| title | text NN |
| description, discipline | text |
| supplier_id | uuid FK suppliers SET NULL |
| status | text NN ='draft'; CHECK draft, submitted, under_review, approved, approved_with_comments, rejected, resubmit_required |
| submitted_date, due_date, reviewed_date | date |
| reviewer_id | uuid FK profiles SET NULL |
| revision | text NN ='00' |
| wbs_id, area_id, task_id | kFK |
| document_id | kFK → documents |

- **Trigger:** `assign_no` ('submittal_no','TS'), `updated_at`. **Durum geçmişi trigger'ı yok.**
- **created_by:** yok.

### material_approvals
| Kolon | Tip / kural |
|---|---|
| approval_no | text NN; UNIQUE; trigger MA |
| material_name | text NN |
| manufacturer, model | text |
| supplier_id | uuid FK suppliers SET NULL |
| status | text NN ='draft'; CHECK draft, submitted, approved, approved_with_comments, rejected, expired |
| submitted_date, approved_date | date |
| revision | text NN ='00' |
| technical_submittal_id | kFK → technical_submittals |
| wbs_id, area_id, task_id | kFK |
| document_id | kFK → documents |

- **Trigger:** `assign_no` ('approval_no','MA'), `updated_at`. **Durum geçmişi trigger'ı yok.**
- **created_by:** yok.
- **Gelen FK (ters yön):** `procurement_items.material_approval_id`, `purchase_requests.material_approval_id`.

## 3. Geçmiş ve numaralama tabloları

### register_status_history
| Kolon | Tip |
|---|---|
| id | uuid NN |
| register_code | text NN ('rfi', 'decision', 'action') |
| record_id | uuid NN (FK yok, çok biçimli) |
| old_status, new_status | text |
| changed_by | uuid (FK yok; auth.uid()) |
| changed_at | timestamptz NN =now() |

- **İndeks:** (project_id, register_code, record_id, changed_at desc).
- **Yazan:** yalnızca `fn_log_register_status` trigger'ı (DEFINER). Yalnızca rfis, decisions ve project_actions'ta bağlı.
- **RLS:** SELECT `user_has_project_access`; başka policy yok.
- **Yetki:** `auth: SELECT`.

### project_register_counters
| Kolon | Tip |
|---|---|
| project_id | text NN |
| register_code | text NN |
| last_value | integer NN =0 |

- **PK:** (project_id, register_code). Yıl yok.
- **Erişim:** RLS açık, policy **yok**; `auth` yetkisi **yok**. Yalnızca DEFINER fonksiyonlar yazar.

### project_register_settings
| Kolon | Tip / kural |
|---|---|
| project_id | text PK, FK projects CASCADE |
| prefix | text NN; CHECK `^[A-Z0-9]{2,6}$`; UNIQUE (prefix) |
| created_at, updated_at | timestamptz NN |

- **Veri:** ADN1 (kaptan-demir-adana-arazi-faz1), ADN2 (…-faz2), TIZ (test-izmir-ges-2026), TKY (test-kayseri-develi-ges).
- **RLS:** yalnızca SELECT `user_has_project_access`.
- **Yetki:** `auth: SELECT`. Yazma yalnızca SQL veya ileride bir RPC ile.
- **Trigger:** `updated_at`.

## 4. Numara fonksiyonları

| Fonksiyon | İmza | Güvenlik | Kim çağırabilir | Davranış |
|---|---|---|---|---|
| `next_register_no` | `(p_project_id text, p_register text) → text` | DEFINER, `search_path=public` | postgres, service_role (anon ve auth **yok**) | Prefix'i settings'ten okur; yoksa `P0001` hatası verir. Sayaç `insert … on conflict do update … returning` ile artar (aynı transaction, boşluksuz). Sonuç `{TÜR}-{PREFIX}-{4 haneye sıfır; ≥10000 olduğu gibi}` |
| `fn_assign_register_no` | trigger, args `(kolon, önek)` | DEFINER | postgres, service_role | Kolon boşsa `next_register_no` ile doldurur; doluysa elle verilen değere dokunmaz |
| `fn_assign_document_no` | trigger | DEFINER | postgres, service_role | documents için: `document_type='drawing'` → DRW, diğerleri DOC |
| `fn_log_register_status` | trigger, arg register_code | DEFINER | postgres, service_role | INSERT'te ve status değişince register_status_history'ye satır yazar |

**Önekler:** RFI, DEC, ACT, TS, MA (trigger argümanı); DOC, DRW (fonksiyon içinde). Her önek proje içinde kendi sırasını tutar.

**Risk:** Numara elle verilirse sayaçla çakışabilir. RPC'ler `*_no` kolonunu girdi olarak almamalı.

## 5. Mevcut tablolara eklenenler (05.10.2026)

### project_tasks
| Kolon | Kural |
|---|---|
| activity_id | text; CHECK NULL ya da `^[A-Z0-9][A-Z0-9-]*$`; kısmi unique (project_id, activity_id) WHERE dolu. Bugün 0/228 dolu |
| wbs_id, area_id | uuid; kFK → project_wbs / project_areas **ON DELETE RESTRICT**; indeksli. Bugün 0/228 dolu |
| discipline | text (CHECK yok) |
| baseline_start, baseline_end | date; CHECK end ≥ start. **228/228 dolu** |
| forecast_start, forecast_end | date; CHECK end ≥ start |
| primavera_id | text |
| (is_critical) | **07.10.2026'da kaldırıldı** |

- **Ek:** `UNIQUE (project_id, id)` (kFK hedefi).
- **`trg_project_tasks_identity_guard`** (BEFORE INSERT/UPDATE, INVOKER):
  1. UPDATE'te `activity_id` önceden doluysa ve değişiyorsa hata verir: "Atanmış Activity ID değiştirilemez". Bu NULL'a geri almayı da kapsar. NULL'dan ilk atamaya izin verir.
  2. `wbs_id` yeni atanıyor ya da değişiyorsa ve hedef WBS pasifse hata verir.
  3. `area_id` için aynı kural, pasif alan.

  Zaten bağlı olan bir WBS/alanın sonradan pasifleşmesi engellenmez; kontrol yalnızca atama anında yapılır.

### Diğer tablolara eklenen FK kolonları (hepsi kFK, NO ACTION, bugün hepsi boş)
| Tablo | Kolonlar → hedef |
|---|---|
| project_risks | wbs_id → project_wbs, area_id → project_areas, task_id → project_tasks, rfi_id → rfis, action_id → project_actions, decision_id → decisions |
| purchase_requests | wbs_id, area_id, task_id, material_approval_id → material_approvals, technical_submittal_id → technical_submittals |
| procurement_items | wbs_id, area_id, task_id, material_approval_id → material_approvals |

- **İndeks:** project_risks'te task/wbs/area kısmi indeksli. purchase_requests'te task ve material_approval, procurement_items'ta task.
- **Not:** `suppliers.supplier_type` zaten var. CHECK değerleri malzeme_ekipman, hizmet, nakliye, diger; tasarımdaki aynı adlı kolonla çakışıyor.
- **Realtime:** Bu bölümdeki tabloların hiçbiri realtime yayınında değil.

## 6. Gözlemler (doğrulanmış)

1. **Master tablolarda gereksiz yetki:** project_wbs, project_areas ve area_wbs'te `auth` rolünün **TRUNCATE, REFERENCES, TRIGGER** yetkisi var. Register tablolarında 05.10'daki 3. migration bunları almıştı; master tablolarda alınmamış.
   - TRUNCATE RLS'e takılmaz.
   - PostgREST TRUNCATE'i dışarı açmadığı için uygulama üzerinden kullanılamaz.
   - Yine de geri alınması önerilir (düşük; G-13 adayı).
2. **İndekssiz FK'ler:**
   - Tek kolonlu kişi/tedarikçi FK'leri: created_by (documents, drawings, decisions, project_actions), assigned_to (rfis, project_actions), raised_by (rfis), reviewer_id ve supplier_id (technical_submittals), supplier_id (material_approvals).
   - Register'lar arası kFK'ler: rfis.drawing_id/document_id/decision_id, project_actions.rfi_id/risk_id/decision_id, decisions.rfi_id/risk_id, technical_submittals.document_id, material_approvals.document_id/technical_submittal_id.

   İndeksli olanlar yalnızca wbs/area/task kFK'leri. Tasarımın "her FK'ye indeks" kuralına aykırı. Veri olmadığı için şu an etkisi yok.
3. **Etkisiz yazma policy'leri:** 8 register tablosunda doğrudan yazma policy'leri duruyor ama yetki olmadığı için etkisiz. Kalıcı çözüm: Faz B'de bu policy'leri düşürmek ve yazmayı RPC'ye taşımak.
4. **Eksik iz alanları:** technical_submittals ve material_approvals'ta `created_by` yok ve durum geçmişi tutulmuyor.

---

## 7. tasarim.md ile farklar (Bölüm 4.1, 4.2, 4.8 ↔ canlı)

| Nesne | Tasarımda | Canlıda |
|---|---|---|
| **4.1 ortak sözleşme** | | |
| Kayıt no kolonu | tek ad `register_no`, UNIQUE (project_id, register_no) | tabloya özel ad: document_no, rfi_no, action_no, decision_no, submittal_no, approval_no; her biri UNIQUE (project_id, x). drawings'te yok |
| record_state | draft / pending_approval / approved / rejected | yok (hiçbir tabloda) |
| source | manual / ai / import | yok |
| wbs_id, area_id, task_id FK | `FK(id)`, ON DELETE SET NULL | kFK (project_id, x), NO ACTION (project_tasks'ta RESTRICT) |
| discipline | CHECK mechanical, dc, ac, mv, enh, civil, general | serbest text, CHECK yok (documents, technical_submittals, project_tasks, project_wbs); rfis'te `responsible_discipline` |
| priority | low / **normal** / high / critical, varsayılan normal | low / **medium** / high / critical, varsayılan medium (rfis, project_actions; diğerlerinde kolon yok) |
| responsible_id | FK profiles | rfis ve project_actions'ta `assigned_to` (+ project_actions.responsible text); diğerlerinde yok |
| source_document_id | "kaydın çıkarıldığı dosya" | yok. Var olan `document_id` "ilişkili doküman" anlamında (rfis, technical_submittals, material_approvals) |
| created_by | hepsinde | rfis (raised_by var), technical_submittals, material_approvals'ta yok |
| approved_by, approved_at, rejected_reason | hepsinde | yok |
| Numara biçimi | {TÜR}-{PROJE}-{SIRA}, 4 hane | aynı; ≥10000 kırpılmıyor |
| Tür kodları | DOC, DRW, RFI, SUB, MAT, CHG, CLM, INT, DEC; ACT (tickets), RSK (project_risks) | DOC, DRW, RFI, **TS**, **MA**, DEC, **ACT (project_actions)**; CHG/CLM/INT/RSK yok |
| Sayaç tablosu | register_counters (project_id, register_type) | project_register_counters (project_id, register_code) |
| Proje kodu | project_register_settings (prefix, **pad_width**, **claim_notice_days**) | project_register_settings (prefix, created_at, updated_at); pad_width ve claim_notice_days yok, prefix ayrıca UNIQUE |
| **4.2 A. altyapı** | | |
| wbs | `wbs` (code, name, parent_id, level, **sort_order**) | `project_wbs` (wbs_code, name, parent_id kFK RESTRICT, level trigger'la, discipline, default_owner_role, is_active, notes, created_by); sort_order yok; guard trigger var |
| areas | `areas` (code, name, **wbs_id tekil FK**, discipline) | `project_areas` (area_code, parent_id hiyerarşi, area_type CHECK 12 değer, responsible_user, is_active) + `area_wbs` çoktan çoğa; discipline yok |
| register_permissions | var | yok |
| register_audit | old_data/new_data jsonb (satırın tamamı) | yok; yalnızca register_status_history (durum değişikliği, 3 tabloda). Karar 6: audit yalnızca değişen alanları tutacak |
| register_links | var | yok (yerine tablolarda doğrudan kFK bağları) |
| register_drafts | var | yok |
| document_texts | PDF metni kalıcı | yok; **Karar 6 gereği kurulmayacak** |
| project_drive_folders, drive_sync_state, document_jobs, register_status_transitions | var | yok |
| **4.2 B. register'lar** | | |
| documents (dosya alanları) | revision, supersedes_id, storage_provider (gdrive, supabase), drive_file_id, drive_folder_id, file_name, mime_type, size_bytes, sha256 tek satırda | documents yalnızca kimlik; dosya/revizyon alanları `document_revisions`'ta (Karar 3); supersedes_id yerine `is_current`; storage_provider değerleri onedrive/sharepoint/google_drive/supabase_storage/external; drive_folder_id yok |
| documents.doc_type | `doc_type` CHECK 9 değer | `document_type`, CHECK yok |
| documents durum | active / superseded / void | active / void (superseded revizyon düzeyinde) |
| documents ek alanlar | drive_state, ai_status, registered; UNIQUE (project_id, drive_file_id) | yok |
| document_revisions | yok (tasarımda yok) | var: revision_no, revision_status (ifr/ifa/ifc/as_built), is_current (tek), sha256, size_bytes, storage_* |
| drawings | drawing_no, title, revision, supersedes_id, issue_status; UNIQUE (project_id, drawing_no, revision) | yalnızca document_id (UNIQUE) + drawing_type + document_type='drawing'; numara/revizyon/durum documents ve document_revisions'ta |
| rfis | answer, raised_by_party, raised_at, answered_at, closed_at, schedule_impact_days, cost_impact, contract_ref; durum open/answered/closed/cancelled; CHECK answered_at ≥ raised_at | response, raised_by (iç kullanıcı), assigned_to, responsible_discipline, raised_date, answered_date, description, document_id, decision_id, wbs/area/task; durum open/under_review/answered/closed/**rejected**; closed_at, etki alanları ve tarih CHECK'i yok |
| submittals | `submittals`: spec_ref, submittal_type, returned_at, review_comment; durum submitted/approved/approved_with_comments/rejected/resubmit | `technical_submittals`: description, discipline, supplier_id, reviewer_id, reviewed_date, revision; durum + draft, under_review, `resubmit_required`; spec_ref/submittal_type/review_comment yok |
| material_approvals | procurement_item_id, submittal_id, approved_at, required_on_site; durum pending/approved/rejected | manufacturer, model, technical_submittal_id, approved_date, revision; durum draft/submitted/approved/approved_with_comments/rejected/expired; BOM bağı ters yönde (procurement_items/purchase_requests.material_approval_id); required_on_site yok |
| decisions | decided_at, decided_by_text, supersedes_id; durum proposed/decided/superseded | decision_date, decision_maker, rfi_id, risk_id; durum proposed/**approved**/superseded/cancelled; supersedes_id yok |
| Action | tickets genişletmesi (register_no, ACT) | ayrı `project_actions` tablosu (Karar 0.1); tickets değişmedi |
| changes, claims, interfaces | var | yok |
| **4.2 C. mevcut tablolara eklemeler** | | |
| project_tasks | wbs_id, area_id (SET NULL) | wbs_id, area_id (kFK RESTRICT) + activity_id (kilitli), discipline, baseline_*, forecast_*, primavera_id |
| tickets | register_no, wbs_id, area_id, task_id, source_document_id | değişiklik yok |
| project_risks | register_no, wbs/area/task, source_document_id, approved_by/at, source CHECK + ai | wbs/area/task + rfi_id, action_id, decision_id (kFK); register_no/onay alanları/source genişlemesi yok |
| suppliers | supplier_type (supplier, subcontractor, both) | `supplier_type` zaten başka anlamla var (malzeme_ekipman, hizmet, nakliye, diger) → ad çakışması |
| purchase_requests, procurement_items | yok (Faz D'de yalnızca okuma köprüsü) | wbs/area/task + material_approval_id (+ technical_submittal_id) kFK kolonları var, boş |
| notifications | meta jsonb, entity_type genişlemesi | değişiklik yok |
| Realtime | register_drafts, documents, document_jobs, register tabloları | hiçbiri yayında değil |
| Yazma modeli | hiçbir yeni tabloda doğrudan yazma policy'si yok, yalnızca RPC | register tablolarında yazma policy'leri var ama G-01 ile yetki yok (etkisiz); master tablolar (wbs/areas/area_wbs) doğrudan yazılabilir |
| **4.8 migration listesi** | | |
| M01 register_wbs_areas | Faz B, wbs/areas + project_tasks kolonları | **yapıldı (farklı adla)**: 20261005103850 faz1_wbs_alan_activity |
| M02 register_audit_infra | register_audit, fn_register_audit | yapılmadı; yalnızca register_status_history (05.10). Karar 6'ya göre yeniden tasarlanmalı |
| M03 register_permissions | register_permissions, register_can, transitions | yapılmadı; yetki şimdilik can_write/can_manage_project_control |
| M04 register_numbering | settings, counters, next_register_no | **yapıldı**: 20261005125957 + 20261007072501 (biçim/kırpma düzeltmesi) |
| M05 documents_core | documents, document_texts, project_drive_folders, drive_sync_state, view'lar, liste RPC'leri, realtime | kısmen: documents + document_revisions var; document_texts kurulmayacak; drive tabloları, view'lar, RPC'ler, realtime yok |
| M06 registers_drawings_rfis_links | drawings, rfis, register_links, view'lar | kısmen: drawings, rfis var; register_links ve view'lar yok |
| M07–M10 | ai_runs, document_jobs, register_drafts, yazma ve taslak RPC'leri, notifications | yapılmadı |
| M11 tickets_register_columns | tickets'a register_no | **gereksiz** (Action ayrı tablo) |
| M12 submittals_material_approvals | iki tablo | **tablolar var** (05.10); view, geçiş seed'i yok |
| M13 changes_claims | — | yapılmadı |
| M14 project_risks_register_extension | — | kısmen: FK kolonları var; register_no/onay/source yok |
| M15 suppliers_type_and_links | supplier_type | yapılmadı; ad çakışması çözülmeli |
| M16 interfaces_decisions | iki tablo | decisions var (05.10); interfaces yok |
| M17–M18 | agent, köprü view'ları | yapılmadı |
| Geri alış kuralı | her uygulamadan önce `npm run db:backup` | db:backup henüz çalışmıyor; 07.10 değişikliklerinde nesne anlık görüntüsü kullanıldı |
