# tasarim.md v3 ↔ canlı şema uyum notları

Tarih: 07.10.2026 · Kaynak: `tasarim.md` v3 (kullanıcının verdiği sürüm) ile `canli-sema-ozeti.md` ve canlı katalog
(yalnızca SELECT). Kural: canlı şema tasarımla çelişirse canlı geçerlidir; tasarim.md düzeltildi.

Karşılaştırılan bölümler: 4.1 (4.2'nin dayandığı ortak sözleşme), 4.2, 4.8. Aynı çelişki başka bölümde de geçiyorsa
orası da düzeltildi (son grup).

Canlıdan ayrıca doğrulananlar (07.10.2026):
- edge function sayısı: 4;
- pg_cron 1.6.4 kurulu, pg_net yok;
- `storage.objects` için doğrudan silme engeli;
- indekssiz FK listesi;
- `pg_default_acl`.

## 4.1 Ortak sözleşme

| Nesne | Tasarımda | Canlıda | Yapılan düzeltme |
|---|---|---|---|
| Numara kolonu | Tek ad `register_no`, UNIQUE(project_id, register_no) | Tabloya özel ad: document_no, rfi_no, action_no, decision_no, submittal_no, approval_no; drawings'te yok | Satır "tabloya özel ad" olarak yazıldı. Görünümler ve RPC'ler `register_no` takma adıyla döndürür (B6). Kolonlar yeniden adlandırılmaz |
| record_state, source | Ortak kolon olarak var sayılıyor | Hiçbir tabloda yok | "Canlıda yok, B3 ekler" notu |
| wbs_id, area_id, task_id | FK(id), ON DELETE SET NULL | Kompozit FK (project_id, x) → (project_id, id), NO ACTION | Kompozit FK ve NO ACTION olarak düzeltildi |
| discipline | CHECK: mechanical, dc, ac, mv, enh, civil, general | Serbest metin, CHECK yok; rfis'te `responsible_discipline` | "Serbest metin, liste ekran sözlüğü" olarak düzeltildi |
| priority | low, **normal**, high, critical; varsayılan normal | low, **medium**, high, critical; varsayılan medium; yalnızca rfis ve project_actions'ta var | medium olarak düzeltildi (4.7 etiket sözlüğü dahil: medium → Orta) |
| responsible_id | FK profiles | `assigned_to` (rfis, project_actions); project_actions'ta ayrıca serbest metin `responsible` | Satır `assigned_to` oldu |
| source_document_id | Ortak kolon | Yok; var olan `document_id` "ilişkili doküman" anlamında | "Faz C (C1) ile eklenir" notu |
| created_by | Hepsinde | rfis, technical_submittals ve material_approvals'ta yok | "B3 ekler" notu |
| approved_by, approved_at, rejected_reason | Hepsinde | Yok | "B3 ekler" notu |
| updated_at | Hepsinde | document_revisions'ta yok | Not eklendi |

## 4.2 A. Altyapı tabloları

| Nesne | Tasarımda | Canlıda | Yapılan düzeltme |
|---|---|---|---|
| project_wbs / project_areas / area_wbs | "UNIQUE(project_id, kod)" | `wbs_code` / `area_code`; üst kayıt kompozit FK RESTRICT; guard trigger'ları | Kolon adları, RESTRICT ve guard eklendi |
| project_tasks eklemeleri | wbs_id, area_id, activity_id, baseline | Bunlara ek olarak discipline, forecast_start/end, primavera_id; wbs/area kompozit FK RESTRICT | Eksik kolonlar eklendi (4.2 A ve C) |
| project_register_settings | "proje kodu" | Kolon adı `prefix`, ayrıca UNIQUE | Ad ve UNIQUE yazıldı. B3'ün `four_eyes_enabled` eklemesi not edildi |
| project_register_counters | "proje, tür, sayaç" | project_id, register_code, last_value | Kolon adları yazıldı |
| register_status_history | "Durum geçmişi" | Trigger yalnızca rfis, decisions, project_actions'ta; TS/MA'da yok | Not eklendi |
| register_permissions | 5 boolean | Yok (yeni) | Değişmedi. `edit_scope` (all/own) eklendi: santiye_sefi "yalnızca kendi kaydı" kuralı verinin içinde (B1 taslağındaki seçim) |
| register_audit | project_id (FK ima ediliyor) | Yok (yeni) | project_id'de FK konmadı. Neden: proje silinirken zincirleme silinen register kayıtlarının audit satırı, silinmekte olan projeye FK ile bağlanırsa proje silme başarısız olur. id bigint |
| register_links | Çok biçimli bağ tablosu (FK yok) | Yok; bağlar tablolardaki kompozit FK kolonlarıyla tutuluyor (aynı proje DB'de garanti) | "Kurulmuyor (şimdilik)". link/unlink RPC'leri mevcut kolonları yazar. 4.4'teki imzalar buna göre değişti (relation ve link id yok) |

## 4.2 B. Register tabloları

| Nesne | Tasarımda | Canlıda | Yapılan düzeltme |
|---|---|---|---|
| documents.doc_type | `doc_type`, 9 değer | `document_type`, CHECK yok | Ad düzeltildi. Değer listesi B3 RPC'sinde doğrulanır |
| documents durum | (belirtilmemiş) | active / void | Yazıldı |
| document_revisions dosya alanları | "Faz B'de eklenecek: storage_path, file_name, mime_type, size_bytes, sha256, upload_status, uploaded_by" | file_name, mime_type, size_bytes, sha256 (CHECK 64 hex), storage_provider (CHECK 5 değer), storage_file_id, notes, created_by **zaten var** | B5 yalnızca upload_status ve zaman damgalarını ekler. Yol `storage_file_id`'de (storage_provider = supabase_storage), yükleyen `created_by`'da. Aynı anlamda ikinci kolon açılmaz |
| drawings | "Çizim türü, saha ve BOQ etkisi" | Yalnızca drawing_type (+ document_id UNIQUE, document_type='drawing') | Saha/BOQ etkisinin canlıda olmadığı yazıldı |
| rfis | raised_by_party, schedule_impact_days, cost_impact, contract_ref; status open/answered/closed/cancelled | Bu dört alan yok. description, response, raised_by, assigned_to, responsible_discipline, raised_date, answered_date, document_id, decision_id var. Status open/under_review/answered/closed/**rejected** | Canlı kolonlar ve status listesi yazıldı. Eksik dört alan "Faz C (C1), rfi_v1 şemasıyla" olarak işaretlendi |
| project_actions | "sorumlu, termin, kaynak, öncelik, durum" | assigned_to + responsible; status open/in_progress/done/cancelled; rfi_id, risk_id, decision_id | Canlı kolonlar yazıldı |
| decisions | status proposed/**decided**/superseded | status proposed/**approved**/superseded/**cancelled**; decision_maker serbest metin; rfi_id, risk_id | Düzeltildi |
| technical_submittals | spec referansı, tür, dönüş tarihi | Spec ve tür yok. reviewed_date, reviewer_id, supplier_id, revision, document_id var. Status 7 değer (draft, …, resubmit_required) | Düzeltildi |
| material_approvals | procurement_items bağı, sahada gerekli tarih | Bağ ters yönde (procurement_items/purchase_requests.material_approval_id); sahada gerekli tarih yok; manufacturer, model, technical_submittal_id var; status 6 değer | Düzeltildi |

## 4.2 C. Mevcut tablolara eklemeler

| Nesne | Tasarımda | Canlıda | Yapılan düzeltme |
|---|---|---|---|
| project_risks, purchase_requests, procurement_items | "CANLI (boş)", 14 FK | Tablolar dolu, eklenen kolonlar boş. 15 kompozit FK (6 + 5 + 4) | "Kolonlar boş", 15 FK ve dağılımı |
| suppliers | `supplier_type` (supplier, subcontractor, both) | `supplier_type` zaten var, başka anlamla (malzeme_ekipman, hizmet, nakliye, diger) | Yeni kolon adı `party_type` (4.2 C ve 4.8 D3) |

## 4.8 Migration listesi

| Nesne | Tasarımda | Canlıda | Yapılan düzeltme |
|---|---|---|---|
| 05.10 ve 07.10 sürümleri | 6 satır YAPILDI | `list_migrations` ile aynı sürüm ve adlar (20261005103850, …125957, …132810, 20261007063808, …063825, …072501) | Değişiklik yok |
| B1 | permissions, register_can, transitions | — | B1 taslağının içeriği yazıldı (edit_scope, set_register_permission, seed) |
| B2 | audit, FK indeksleri, G-13 (TRUNCATE) | Master tablolarda authenticated'ın TRUNCATE yetkisinin yanı sıra REFERENCES, TRIGGER ve (policy'si olmayan) area_wbs UPDATE yetkisi de var | G-13 kapsamı genişletildi. İndeks sayısı 30 |
| B3 | Yazma RPC'leri | record_state vb. kolonlar canlıda yok | Ortak kolonların B3'te eklendiği yazıldı |
| B5 | "document_revisions dosya alanları" | Dosya kolonları zaten var; SQL'den dosya silinemez | "upload_status ve zaman damgaları" ve get_stale_uploads yazıldı |
| B6 | görünümler, list/detail/overview, realtime | — | get_register_audit eklendi (B2 audit'ini okuyan RPC başka pakette yoktu) |
| D3 | suppliers.supplier_type | Ad dolu | party_type |

## Diğer bölümlerde düzeltilen aynı çelişkiler

| Bölüm | Tasarımda | Canlıda | Yapılan düzeltme |
|---|---|---|---|
| Bölüm 1, Sistem değişiklikleri | Edge function "5 adet: agent-chat, …" | 4 adet; agent-chat deploy edilmemiş | Düzeltildi |
| 4.4 set_register_status | p_note yalnızca not | RFI cevabı için ayrı alan yok | RFI answered'da p_note = response (zorunlu). Yan tarih alanlarını RPC doldurur |
| 4.4 link/unlink | relation, link id | Bağ tablosu yok | İmzalar kolon tabanlı hale getirildi |
| 4.5 Storage politikaları ve temizlik | "UPDATE/DELETE kapalı; pg_cron dosyaları siler" | `protect_objects_delete` trigger'ı SQL'den silmeyi engelliyor | DELETE yalnızca kendi uploading/aborted yüklemesine açık. pg_cron yalnızca kayıtları işaretler/siler. Kalan dosyalar get_stale_uploads + Storage API ile silinir. Tam otomatik silme için pg_net + edge function kararı Faz B'ye bırakıldı |
| 4.5 Genişletilebilirlik | "file_provider, file_url tutulabilir" | storage_provider + storage_file_id zaten var | Düzeltildi |
| 4.6 rfi_v1 drawing_no | `drawings.drawing_no` ile eşleşir | drawings'te numara yok | Çizim türündeki dokümanın document_no'su |
| 4.6 Planning agent | "is_critical" | Kolon 07.10'da kaldırıldı | Gecikme ve plan sapması (baseline/forecast) |
| 4.7 etiketler | RFI status cancelled; priority normal | under_review/rejected; medium | Düzeltildi |
| 4.9 T20, T29 | Cron dosyayı siler; "92 test" | Yukarıdaki silme engeli; 118 test | Düzeltildi |

## Doğrulanamayanlar

- Supabase Pro planının güncel fiyatı ve kotaları (100 GB dosya vb.) bu oturumda doğrulanmadı. Tasarımdaki rakamlar kullanıcının verdiği değerlerdir.
- Ücretsiz planın "tek dosya 50 MB" sınırı. Bucket'ın `file_size_limit` değeri plan üst sınırını aşarsa Storage'ın nasıl davrandığı doğrulanamadı. B5 taslağı 50 MB yazar.
- `canli-sema-ozeti.md` §7 v3'ten önceki tasarım sürümüyle karşılaştırma yapar. v3 için geçerli karşılaştırma bu dosyadır.
