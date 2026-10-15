# Uyum migration'ı — plan (TASLAK, uygulanmadı)

Tarih: 2026-10-07 · Dal: `faz-a-proje-kontrol`
Amaç: 05.10'da canlıya gelen boş register şemasını onaylanan kararlara hizalamak.
Kaynaklar: canlı katalog (yalnızca SELECT, 07.10.2026), `uyum-tablosu.md`, `canli-05-10-migrations/`, `tasarim.md`.
Kararlar `tasarim.md` ile çelişirse **kararlar** geçerlidir.

| Dosya | İçerik |
|---|---|
| `taslak-sql/uyum_migration_taslak.sql` | BÖLÜM A uygula (tek transaction) · BÖLÜM B geri al (yorum satırı içinde) |
| `yedek-uyum-07-10.sql` | Değişen nesnelerin özgün tanımları; tabloları özgün kolon sırasıyla yeniden kurar |
| `taslak-sql/uyum_migration_dogrulama.sql` | Uygulamadan hemen sonra çalıştırılacak, kendini geri alan doğrulama bloğu |
| `tests/proje-kontrol-uyum.spec.js` | Yetki ve ad testleri. Migration yoksa kendini atlar; yazma gerektiren 3 test `fixme` |

**v2 (07.10.2026, kullanıcı yanıtlarından sonra):**
- Proje kodları eklendi: ADN1, ADN2, TIZ, TKY.
- Önekler: çizim türü dokümanlar DRW, diğerleri DOC.
- `drawings`'in kendi numarası kaldırıldı. Çizimler yalnızca çizim türündeki dokümana bağlanabiliyor (3 kolonlu FK).
- Aksiyon kaynak listesinden `inspection`/`ncr` çıkarıldı. `TS`/`MA` önekleri kaldı.
- Yeni tablo ve fonksiyonların yetkileri doğrulama betiğinde kontrol ediliyor.
- G-01 geri alma betikleri yeni ada uyumlu hale getirildi.

**Canlı deneme (07.10.2026):** BÖLÜM A ve doğrulama betiği tek bir DO bloğunda çalıştırıldı. Blok sonunda zorunlu hatayla geri alındı. Deneme bloğu dosyalardan üretildi; iki fark var:
- Bazı yorum satırları çıkarıldı.
- `do $$ … end $$` blokları iç içe `begin … end` bloğa çevrildi.

Sonuç:
`DOGRULAMA SONUCU: OK | yetki/RLS kontrolü 6 tablo | numaralar=RFI-TIZ-0001,RFI-TIZ-0009,RFI-TIZ-0010,RFI-TIZ-0999,RFI-TIZ-1000,RFI-TIZ-1001,RFI-TIZ-9999,RFI-TIZ-10000 | DRW/DOC ayrı | çizim türü bağı zorunlu | tek is_current | ncr/inspection red`.

Deneme öncesi ve sonrası katalog parmak izi karşılaştırıldı (kolonlar, kısıtlar, index, policy, trigger, yetki, fonksiyon md5'leri, yorumlar, satır sayıları). Hepsi **birebir aynı**; canlı değişmedi. **Kalıcı uygulama yapılmadı.**

## 0. Ön koşul (SQL'de kontrol ediliyor)

Aşağıdaki değerler 07.10.2026'da sorgulandı:

| Tablo | Satır |
|---|---|
| actions, documents, drawings, rfis, decisions, technical_submittals, material_approvals | 0 |
| project_register_counters, register_status_history | 0 |
| project_tasks | 228, **`is_critical = true` olan 0** |

Migration'ın ilk adımı (A0) bu tabloların boş olduğunu, ayrıca hiçbir görevde `is_critical = true` olmadığını kontrol eder. Biri tutmazsa migration hata verip durur.

## 1. Değişiklik listesi (uygulama sırasıyla)

### A1 · Yeniden adlandırma: `actions` → `project_actions` (Karar 1) — güvenli

| Nesne | Bugün | Hedef | Neden | Risk |
|---|---|---|---|---|
| Tablo | `actions` | `project_actions` | Karar 1; `actions` çok genel bir ad | Düşük. Hiçbir fonksiyon, view ya da `src/` kodu bu adı kullanmıyor (`pg_proc.prosrc`, `pg_views`, grep). Tablo realtime yayınında değil |
| 15 kısıt (pkey, 2 unique, 3 check, 3 profil/proje FK, 6 kompozit FK) | `actions_*` | `project_actions_*` | Ad tutarlılığı | Yok. PK ve unique index'leri kısıtla birlikte yeniden adlanır |
| 5 index | `idx_actions_*` | `idx_project_actions_*` | Aynı | Yok |
| 3 trigger (numara, durum geçmişi, updated_at) | `trg_actions_*` | `trg_project_actions_*` | Aynı | Trigger argümanları değişmiyor: `'action_no','ACT'` ve `register_status_history.register_code = 'action'` |
| 4 policy | `actions_select/insert/update/delete` | `project_actions_*` | Aynı | Gövdeler aynı kalıyor |
| Gelen FK | `project_risks.project_risks_action_id_fk` | Değişmez | FK tablo OID'ine bağlı | Yok |
| Yetkiler (G-01 sonrası authenticated yalnızca SELECT) | — | Değişmez | OID'e bağlı | Yok |

Bundan sonra eski adı kullanan iki betik bozulur ve güncellenmeleri gerekir:
- `taslak-sql/g01_gecici_yazma_kapatma.sql` (BÖLÜM B)
- `yedek-policy-07-10.sql`

İkisi de `public.actions` adını kullanıyor. Uygulanmış `20261007063808` migration'ı geçmiş kayıt olduğundan ona dokunulmaz.

### A2 · Numaralama `{TÜR}-{PROJE_KODU}-{SIRA}` (Karar 2, G-11)

| Nesne | Bugün | Hedef | Neden | Risk |
|---|---|---|---|---|
| Proje kodu | **Yok.** `projects`'te kod kolonu ve ayar tablosu yok; `projects.id` metin slug'ı (`test-izmir-ges-2026`) | Yeni `project_register_settings(project_id PK, prefix)`. Prefix 2-6 büyük harf/rakam ve projeler arasında **benzersiz** | Kodun bir yerde tutulması gerekiyor. `tasarim.md` bu tablonun en küçük hâlini öngörüyor; böylece `projects` tablosuna (Excel içe/dışa aktarım, sihirbaz) dokunulmuyor | Kod tanımlanmamış bir projede kayıt açılırsa `next_register_no` açık bir hata verir ve kayıt açılmaz. Prefix'ler elle girilmeli (bkz. §8) |
| `project_register_counters` | PK `(project_id, register_code, year)` | `year` kolonu kalkar; PK `(project_id, register_code)` | Numarada yıl yok; sıra proje ve tür bazında | Tablo boş, kayıp yok |
| `next_register_no()` | `TÜR-YIL-` + `lpad(v,3)`; **1000. kayıtta `'100'` üretiyor** (G-11) | `TÜR-PREFIX-` + 4 hane; 10000 ve üstü olduğu gibi | Karar 2 ve G-11 | İmza, SECURITY DEFINER ve yetkiler (yalnızca postgres ile service_role) aynı kalıyor (`create or replace` yetkiyi korur) |
| `documents` numarası | Otomatik numara yok | `trg_documents_assign_no` → `DOC` | Doküman da register | Bkz. açık soru S1 (çizimler DRW mi almalı?) |
| Tür kodları | RFI, DEC, ACT, TS, MA | Değişmez | Karar 4 "submittal/material tablolarına dokunma" diyor. `tasarim.md` ise SUB/MAT kullanıyor | Bkz. açık soru S2 |

**Boşluksuzluk:** Sayaç, kaydı ekleyen transaction'ın içinde artıyor. Insert başarısız olur ya da geri alınırsa sayaç da geri alınır, numara boşa gitmez. Doğrulama betiği bunu da deniyor.

Boşluk yalnızca iki durumda oluşur:
- **Kayıt silinirse.** Faz B'de silme yerine `void` kullanılmalı.
- **Numara elle verilirse.** `fn_assign_register_no` yalnızca boş gelen numarayı dolduruyor. Elle `RFI-DYB-0005` girilirse, sayaç 5'e geldiğinde unique ihlali olur ve o türde kayıt açılamaz.

Bugün G-01 yüzünden kimse doğrudan yazamıyor. Faz B RPC'leri `register_no`'yu girdi olarak **kabul etmemeli** (risk R3).

**Eşzamanlılık:** `insert … on conflict do update … returning` aynı satırı kilitler, bu yüzden eşzamanlı istekler sıraya girer. `request_no` sorununun nedeni farklıydı: retry, `exception` bloğu içinde geri alınan sayaç artışını tekrar kullanıyordu. `next_register_no`'da retry yok. 20 eşzamanlı istek testi, yazma yolu (Faz B RPC) gelince çalıştırılacak.

### A3 · Revizyon modeli: tek doküman, çok revizyon (Karar 3)

**`documents` kolonlarının paylaşımı:**

| Kolon | Karar | Not |
|---|---|---|
| id, project_id, document_no, title, document_type, discipline, wbs_id, area_id, task_id, created_by, created_at, updated_at | **documents'ta kalır** | Dokümanın kimliği |
| status | Kalır, **anlamı değişir**: `draft/in_review/approved/issued/superseded/cancelled` → `active/void` (varsayılan active) | İnceleme ve onay durumu revizyona geçti (IFR/IFA/IFC/As-Built); "superseded" artık `is_current = false` ile anlaşılıyor |
| revision | → `document_revisions.revision_no` | |
| storage_provider, storage_file_id, file_name, mime_type | → `document_revisions` | Her revizyon ayrı dosya |
| issue_date, effective_date | → `document_revisions.issue_date` | Yayın tarihi revizyona ait. `effective_date` taşınmıyor: aynı anlamda, kullanan yok |
| storage_url | **Kaldırılır, taşınmaz** | Tasarım: tarayıcıya Drive bağlantısı verilmez; dosya yalnızca drive-gateway üzerinden açılır |
| UNIQUE(project_id, document_no, revision) | → UNIQUE(project_id, document_no) | Bir numara tek doküman |

**Yeni tablo `document_revisions`:**
- **Kolonlar:** id, project_id, document_id, revision_no, revision_status (`ifr`/`ifa`/`ifc`/`as_built`), is_current, issue_date, storage_provider, storage_file_id, file_name, mime_type, size_bytes, sha256, notes, created_by, created_at.
- **Kurallar:**
  - Kompozit FK `(project_id, document_id)` ON DELETE CASCADE. Revizyon başka projenin dokümanına bağlanamaz.
  - UNIQUE(document_id, revision_no).
  - Kısmi unique index `document_revisions_one_current (document_id) WHERE is_current`: her dokümanın tek güncel revizyonu olur.
- **İndeksler:** proje+doküman, proje+sha256 (tekrar yükleme kontrolü için), created_by.
- **Yetki:** RLS SELECT `user_has_project_access`. authenticated yalnızca SELECT, anon hiçbir şey; G-01 ile aynı model.

**`drawings` (documents'a bağlı küçük uzantı, v2):**
- **Kalanlar:** id, project_id, `document_id` (artık NOT NULL ve UNIQUE: dokümanla bire bir), drawing_type, created_by, timestamps.
- **Kendi numarası yok:** `drawing_no` kaldırıldı. Çizimin numarası dokümanın numarası: `DRW-…`.
- **Tür bağı:** Yeni bir `document_type` kolonu var. NOT NULL, varsayılan `'drawing'`, `CHECK (= 'drawing')`. Bununla birlikte 3 kolonlu bir FK kuruluyor: `(project_id, document_id, document_type)` → `documents(project_id, id, document_type)`. FK'nin hedefi için `documents`'a yeni bir UNIQUE eklendi.
- **Sonuç:** Çizim yalnızca çizim türündeki dokümana bağlanabilir. Bağlı bir dokümanın türü sonradan değiştirilemez (FK NO ACTION). Denemede ikisi de doğrulandı.
- **Çıkanlar:** title, discipline, revision, status, issue_date, wbs/area/task, storage_*, supersedes_drawing_id. Bunlar documents ya da document_revisions'ta duruyor (tek kaynak ilkesi).
- `rfis.drawing_id` FK'si değişmiyor.

| Risk | Açıklama |
|---|---|
| R1 | Kısmi unique index ertelenemez. Güncel revizyonu değiştiren RPC önce eskisini `false`, sonra yenisini `true` yapmalı; tek bir UPDATE ile iki satırı değiştirmek de hata verebilir |
| R2 | ~~Çizim, çizim olmayan dokümana bağlanabilir~~. v2'de 3 kolonlu FK ile zorlanıyor (denemede doğrulandı) |

### A4 · `project_tasks.is_critical` kaldırma (Karar 5) — en son

| Kontrol (07.10.2026) | Sonuç |
|---|---|
| View / materialized view | yok |
| Fonksiyon gövdesi (`prosrc ilike '%is_critical%'`) | yok |
| Index, policy, CHECK, trigger tanımı (`UPDATE OF` listesi dahil) | yok |
| `pg_depend` | Yalnızca kendi DEFAULT'u |
| `src/`, `supabase/functions/`, `tests/`, `scripts/`, `public/` | Yok (yalnızca eski migration'lar ve dokümanlar) |
| Veri | 228 satırın hepsi `false` |

Risk düşük. Tablo realtime yayınında, ancak kolon listesi tanımlanmamış; kolonun düşmesi aboneliği bozmaz. Komut tabloyu kısa süre `ACCESS EXCLUSIVE` kilitler.

**Doğrulanamadı:** Excel şablonundaki (`public/excel/…xlsx`) hücre içerikleri ikili dosya olduğundan grep'le taranamadı. Ancak 03.08'de P/Q/R sütunları zaten kaldırılmıştı (CLAUDE.md).

## 2. Depolama (Karar 6: 500 MB veritabanı, 1 GB dosya)

| Konu | Bugün | Değerlendirme |
|---|---|---|
| Veritabanı | 27 MB. En büyük tablo `notifications` (1,7 MB) | Geniş pay var |
| `register_status_history` | Yalnızca durum değişince bir satır (~150 bayt, metin/jsonb yok) | Şişme riski yok. 3 tabloda (RFI, karar, aksiyon) trigger var; günde 100 değişiklikle bile yılda ~5 MB |
| Diğer geçmiş tabloları | `ticket_history` (alan bazlı old/new metin), `purchase_request_status_log`, `user_management_audit`: hepsi < 100 kB, jsonb yok | Risk yok |
| Planlanan `register_audit` (`tasarim.md`) | `old_data`/`new_data` jsonb, **satırın tamamı** | Karar 6 ile çelişiyor. Faz B'de "yalnızca değişen alanlar" (`changed jsonb`: `{alan: [eski, yeni]}`) olarak tasarlanmalı. Bu migration'da yok |
| Planlanan `document_texts` | PDF tam metni kalıcı | Karar 6 gereği **kurulmuyor**. Bu migration'da da yok. Metin çıkarma geçici olacak (job sırasında bellekte, AI'dan sonra atılır) |
| `document_revisions` | Yalnızca meta (dosya Drive'da) | Satır başına < 1 kB, risk yok |

## 3. Riskler (özet)

| # | Risk | Önlem |
|---|---|---|
| R1 | `is_current` değişiminde sıra hatası | RPC'de önce false, sonra true; doğrulama betiği deniyor |
| R2 | Çizim, çizim olmayan dokümana bağlanabilir | Faz B RPC kontrolü veya trigger |
| R3 | Elle verilen numara sayaçla çakışır | Faz B RPC'leri `register_no` almaz |
| R4 | ~~Rename sonrası G-01 geri alma betikleri `actions` adını kullanıyor~~ | v2'de güncellendi: `yedek-policy-07-10.sql` ve g01 BÖLÜM B adı `to_regclass` ile kendisi seçiyor |
| R5 | Prefix'i tanımlanmamış projede register kaydı açılamaz | Bilinçli; §8'de prefix'ler girilir |
| R6 | Söz dizimi canlıda denenmedi | Onaydan sonra önce ROLLBACK'li deneme |
| R7 | `documents.status` anlamı değişiyor | Tablo boş ve kullanan kod yok |
| R8 | BÖLÜM B kolon sırasını birebir geri getirmez | Gerekirse `yedek-uyum-07-10.sql` kullanılır |

## 4. Kapsam dışı (bu turda yazılmadı)

- `register_permissions`, `register_audit`, `register_links`, Faz B RPC'leri, edge function'lar, frontend.
- `project_wbs` / `project_areas` / `area_wbs`: zaten var, olduğu gibi kullanılacak.
- `technical_submittals` / `material_approvals`: Karar 4 gereği dokunulmadı.
- `tasarim.md`'nin güncellenmesi: kullanıcı ayrıca gönderecek.

## 5. Sorular — yanıtlandı (07.10.2026)

- **S1:** Çizim türündeki dokümanlar `DRW`, diğerleri `DOC`. `drawings`'in kendi numarası yok. → v2'ye işlendi (`fn_assign_document_no`).
- **S2:** `TS` / `MA` kalır.
- **S3:** `inspection` ve `ncr` kaynak listesinden çıkar. → v2'ye işlendi.

## 6. Geri alınabilirlik

- **BÖLÜM B (ters SQL):** Tablolar hâlâ boşsa kayıpsızdır; boş değilse durur.
- **`yedek-uyum-07-10.sql`:** Katalogdan alınan özgün tanımlarla tabloları özgün kolon sırasıyla yeniden kurar ve gelen FK'leri tekrar bağlar. Tam şema dökümü değildir. Bu migration için yeterli, çünkü tablolar boş ve `is_critical` değerlerinin hepsi `false`.

## 7. Uygulama sırası (onaydan sonra)

1. Taslağın BÖLÜM A'sını ROLLBACK'li bir denemede çalıştır: tek DO bloğu, sonunda bilerek hata fırlatılır, değişiklikler geri alınır. Söz dizimi ve bağımlılık hatalarını yakalamak için.
2. BÖLÜM A'yı uygula; aynı version ile `supabase/migrations/` altına dosya yaz.
3. `uyum_migration_dogrulama.sql`'i çalıştır. Sonuç `DOGRULAMA SONUCU: OK …` olmalı; blok kendini geri alır.
4. Testleri çalıştır:
   - `tests/proje-kontrol-uyum.spec.js` (7 test geçmeli, 3'ü fixme)
   - `proje-kontrol-guvenlik.spec.js` ve `proje-kontrol-master-veri.spec.js`
   - Tam Playwright seti
5. G-01 geri alma betiklerinde `actions` adını `project_actions` olarak güncelle (R4). CLAUDE.md'yi güncelle. docx dokümantasyonu hatırlatmasını yap.

## 8. Uygulamadan önce kullanıcının yapması gerekenler (v1 listesi; 1-3 tamamlandı, 4 yapıldı)

1. **Proje kodlarını belirle.** Her proje için 2-6 karakter (büyük harf/rakam), projeler arasında benzersiz. Canlıdaki 4 proje:
   - `kaptan-demir-adana-arazi-faz1` (Adana GES-1)
   - `kaptan-demir-adana-arazi-faz2` (Adana GES-2)
   - `test-izmir-ges-2026`
   - `test-kayseri-develi-ges`

   Diyarbakır projesi canlıda henüz yok (DYB onun için ayrılabilir). Kodlar migration'dan sonra ayrı bir `insert into project_register_settings` ile girilir; SQL'i ayrıca gösterilip onaylanır.
2. **S1-S3'ü yanıtla.** Uygulamayı engellemez, ama S1/S2 yanıtı trigger argümanını değiştirebilir; şimdi karara bağlanırsa tek seferde yapılır.
3. **SQL dosyalarını oku ve onayla.**
   - `taslak-sql/uyum_migration_taslak.sql`
   - `yedek-uyum-07-10.sql`
   - `taslak-sql/uyum_migration_dogrulama.sql`
4. **ROLLBACK'li denemeye ayrıca izin ver.** Bu turdaki kural yalnızca SELECT'ti.
