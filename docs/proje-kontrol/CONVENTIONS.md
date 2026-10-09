# Proje Kontrol — geliştirme kuralları (CONVENTIONS)

Tarih: 09.10.2026. Bu dosya register katmanında (Proje Kontrol) yazılacak her tablo, fonksiyon, migration ve ekran
için geçerlidir. Ayrıntılı tasarım `tasarim.md` (v3), kolon düzeyinde canlı tanım `canli-sema-ozeti.md`.

## 0. Öncelik sırası

1. **Canlı şema** (katalogdan SELECT ile doğrulanan).
2. **`docs/proje-kontrol/` altındaki onaylı kararlar** (CLAUDE.md "Proje Kontrol" bölümündeki Karar 0-10 tablosu).
3. `tasarim.md`.
4. Yeni gelen talimatlar.

Bir talimat 1 ya da 2 ile çelişirse uygulamadan önce çelişkiler madde madde listelenir ve kullanıcıdan onay alınır.
Tasarım canlıyla çelişirse `tasarim.md` düzeltilir, fark `v3-uyum-notlari.md`'ye yazılır.

## 1. Adlandırma

- **Önek yok.** Yeni tablolar mevcut adlandırmaya uyar: `documents`, `rfis`, `decisions`, `project_actions`,
  `technical_submittals`, `material_approvals`; planlananlar `changes`, `claims`, `interfaces`.
  Genel bir adla mevcut bir tabloyla karışma riski varsa `project_` öneki kullanılır (`project_actions`,
  `project_wbs` deseni). `pc_` gibi modül öneki kullanılmaz.
- Kod, kolon ve fonksiyon adları İngilizce `snake_case`; arayüz Türkçe.
- RPC deseni: `get_*` okuma; `save_*`, `create_*` ve eylem fiilleri (`submit_`, `approve_`, `reject_`, `reopen_`,
  `link_`, `unlink_`, `void_`) yazma.
- Görünümler `vw_reg_<tür>` (B6), `security_invoker = on`.
- Register türü anahtarları (`register_permissions.register_type`): `document`, `drawing`, `rfi`, `submittal`,
  `material_approval`, `procurement`, `subcontractor`, `action`, `decision`, `risk`, `change`, `claim`, `ncr`,
  `inspection`, `interface`, `payment`.

## 2. Ortak kolonlar (canlıdaki gibi)

| Kolon | Kural |
|---|---|
| `id` | `uuid` PK, `gen_random_uuid()` |
| `project_id` | `text NOT NULL`, FK `projects(id) ON DELETE CASCADE`. `has_project_access(NULL)` true döndüğü için NULL olamaz. Her tabloda `UNIQUE (project_id, id)` |
| Numara | **Tabloya özel ad**: `document_no`, `rfi_no`, `action_no`, `decision_no`, `submittal_no`, `approval_no` (yeni tablolarda `change_no`, `claim_no`, `interface_no`). `NOT NULL`, `UNIQUE (project_id, <no>)`, trigger doldurur. Okuma görünümleri ve RPC'ler bunu `register_no` takma adıyla döndürür; kolon yeniden adlandırılmaz |
| `title` (ya da tabloya özel başlık: `subject`, `material_name`) | `text NOT NULL` |
| `status` | Register'a özel iş durumu, tabloya özel CHECK listesi |
| `record_state` | `draft`, `pending_approval`, `approved`, `rejected`; varsayılan `draft`. Bugün canlıda yok, B3 ekler |
| `source` | `manual`, `ai`, `import`; varsayılan `manual`. B3 ekler |
| `priority` | Yalnızca gereken tabloda: `low`, `medium`, `high`, `critical`; varsayılan `medium` |
| `assigned_to` | `uuid` FK `profiles(id) ON DELETE SET NULL`. Dış taraf için ayrıca serbest metin `responsible` (project_actions deseni) |
| `due_date` | `date`, yalnızca terminli register'larda |
| `wbs_id`, `area_id`, `task_id` | `uuid`, **kompozit FK** `(project_id, x)` → hedef `(project_id, id)`, `ON DELETE NO ACTION`; aynı proje veritabanında garanti edilir. "Activity" = `project_tasks` satırı; kodu `project_tasks.activity_id` |
| `created_by` | `uuid` FK `profiles(id) ON DELETE SET NULL` (eksik olan tablolarda B3 ekler) |
| `approved_by`, `approved_at`, `rejected_reason` | B3 ekler |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()`; `updated_at` trigger ile |

**Kullanılmayanlar:** `record_no`, `owner_id`, `deleted_at`.
- Silme yalnızca `draft` ve `rejected` kayıtta yapılır.
- Onaylı kayıt silinmez; iş durumuyla iptal edilir (`cancelled`, `void`, `superseded`). Soft-delete kolonu yok.
- Doküman ve çizim hiç silinmez, `void` edilir.

Mevcut tablolar (`project_risks`, `suppliers`, `purchase_requests`, `invoices`) kendi sözlüklerini korur (Türkçe
durum değerleri dahil). Fark RPC ve görünüm katmanında normalleştirilir; mevcut kolonlar yeniden adlandırılmaz.

## 3. Numaralama (Karar 2, canlıda)

- Biçim `{TÜR}-{PROJE_KODU}-{SIRA}`, örnek `RFI-ADN1-0007`. Yıl ve disiplin yok; sıra 4 haneye kadar sıfırla doldurulur, kırpılmaz.
- Proje kodu `project_register_settings.prefix`'te. Kodu olmayan projede kayıt açılamaz (açık hata).
- Sayaç `project_register_counters`. Numara yalnızca `next_register_no` ve trigger ile üretilir; RPC'ler numarayı dışarıdan kabul etmez.
- Önekler: DOC, DRW, RFI, TS, MA, DEC, ACT. Yeni register'ın öneki migration'ında tanımlanır.

## 4. Yetki ve RLS

- **Roller:** admin, muhasebe, proje_yoneticisi, santiye_sefi. Yetki matrisi yalnızca bu 4 rol için yazılır; yeni rol açılmaz (agent rolleri Faz E, Karar 9).
- Rol `get_my_role()` (SECURITY DEFINER) ile bulunur; RLS içinde `profiles` doğrudan sorgulanmaz.
- Proje erişimi `has_project_access(project_id)`, register yetkisi `register_can(register_type, action)` → `register_permissions` (B1).
- `santiye_sefi`'nin "yalnızca kendi kaydı" kuralı `edit_scope = 'own'` ile veridedir.
- **RLS şablonu:**

  ```sql
  alter table public.<tablo> enable row level security;
  create policy <tablo>_select on public.<tablo> for select to authenticated
    using (public.has_project_access(project_id) and public.register_can('<tür>', 'view'));
  -- INSERT/UPDATE/DELETE policy'si yok; yazma yalnızca SECURITY DEFINER RPC ile.
  ```

- **Yeni tablolarda** `pg_default_acl` geniş yetki verir; açıkça geri alınır:

  ```sql
  revoke all on public.<tablo> from anon, authenticated;
  grant select on public.<tablo> to authenticated;
  ```

  Sequence'lerde de aynı yapılır.
- **Her fonksiyonda:**
  - `security definer`, `set search_path = public`;
  - `revoke execute … from public, anon`;
  - `grant execute … to authenticated` yalnızca istemci çağıracaksa. Trigger fonksiyonlarında `authenticated` da çıkarılır.
- Kimlik parametreden alınmaz, `auth.uid()` kullanılır.
- Hata sözleşmesi `register_raise(code, message, detail)`. Kodlar: `forbidden`, `not_found`, `invalid_state`, `validation`, `duplicate`, `review_required`, `budget_exceeded`.
- Dört göz kuralı (risk, change, claim, decision): `project_register_settings.four_eyes_enabled`. Karar 10 açık.
- Arayüz butonları `get_my_register_permissions` ile gizler. Asıl güvenlik RLS ve RPC'dedir.
- `service_role` frontend'de asla kullanılmaz.

## 5. Dosyalar (Karar 5 ve ek not)

**Karar 5 (değişmedi, patron onayı bekliyor):** Dosyalar Supabase Storage'da, özel `proje-dokumanlari` bucket'ında
tutulur. Kullanıcı onlara Fons içindeki klasörlü gezginden ve süreli imzalı adresle ulaşır. Dosyanın içeriği
veritabanına konmaz; dokümanın tam metni de kalıcı saklanmaz (`document_texts` yok).

**Ek not (09.10.2026): dosya bağlantısı sağlayıcıdan bağımsız.** Şirket Microsoft 365'e geçiyor. SharePoint ileride
şema değiştirilmeden eklenebilmeli. Bu ek, Karar 5'i tersine çevirmez: varsayılan ve tek etkin sağlayıcı Supabase
Storage'dır.

- **Dosya bağlantısı tek yerde tutulur:** `document_revisions`. Register kayıtları dosyaya `document_id` üzerinden bağlanır.
  - Yeni register tablolarına `file_url`, `storage_path` gibi kolon açılmaz.
  - Mevcut modüllerdeki dosya kolonlarına (`invoices.invoice_document_url`, `financial_transactions.document_url`, `purchase_requests.photo_url` / `delivery_document_url`, `purchase_offers.storage_path`) dokunulmaz.
- **Sağlayıcı alanı canlıda zaten var:** `document_revisions.storage_provider`.
  - CHECK: `supabase_storage`, `sharepoint`, `external`, `onedrive`, `google_drive`.
  - Senin listendeki `url`'nin canlıdaki karşılığı **`external`**. Canlı geçerli olduğu için yeni değer eklenmez.
  - `onedrive` ve `google_drive` CHECK'te duruyor ama kullanılmaz.

| `storage_provider` | `storage_file_id` içeriği | Diğer kolonlar |
|---|---|---|
| `supabase_storage` | Bucket içi yol `{project_id}/{document_id}/{revision_id}_{güvenli-ad}` (B5) | `file_name`, `mime_type`, `size_bytes`, `sha256` zorunlu; `upload_status` begin/complete akışıyla |
| `sharepoint` | SharePoint/Graph öğe kimliği (`driveId:itemId`). Biçim geçiş anında kesinleşir | `file_name`, `mime_type`; `size_bytes`/`sha256` varsa |
| `external` | Tam `https://` adresi | `file_name` |

**SharePoint ya da adres bağlamak için gerekenler (şema değişmez):**
- Ayrı bir RPC (öneri: `link_external_revision`). Satırı doğrudan `upload_status = 'ready'` ile açar.
- Erişim yetkisi yine `register_can('document','view')`. SharePoint'te ayrıca dosyanın kendi paylaşım izni gerekir.

**B5'in diğer sağlayıcılara dokunmaması:**
- Benzersiz yol indeksi, Storage politikaları ve `get_stale_uploads` yalnızca `storage_provider = 'supabase_storage'` satırlarında çalışır.
- Zamanlanmış temizlik işi bu kuralı ihlal ediyordu; 09.10'da taslakta aynı filtreyle düzeltildi.

## 6. Migration akışı

- Her şema değişikliği bir migration dosyasıyla yapılır. Ad: `supabase/migrations/YYYYMMDDHHMMSS_ad.sql`; uygulanan SQL'in birebir aynısı.
- Taslaklar `docs/proje-kontrol/taslak-sql/` altında durur:
  - BÖLÜM A: uygula, tek transaction.
  - BÖLÜM B: geri al.
  - Ayrı bir `*_dogrulama.sql`.
- **Supabase ücretsiz plan, branching yok.** Bu yüzden:
  - Canlıya yalnızca salt okunur SELECT ve `BEGIN … ROLLBACK` denemesi yapılır. Denemeden önce ve sonra katalog parmak izi karşılaştırılır.
  - **Canlıya uygulamadan önce:**
    1. Kullanıcıya tam SQL gösterilir ve onay istenir (CLAUDE.md kural 1).
    2. Yedek hatırlatılır: `npm run db:backup` (şema) ve veri değiştiren migration'larda `npm run db:backup:data`. İkisi de `scripts/db-backup/.env.local` ister; Claude bu dosyayı okumaz.
    3. Değişen nesnelerin anlık görüntüsü `docs/proje-kontrol/yedek-*.sql` olarak hazırlanır.
- Migration'lar yalnızca ekler. Sıra: yeni yapı → frontend geçişi → ayrı temizlik migration'ı.
- Kontrol listesi: `tasarim.md` §4.8.
- `CREATE OR REPLACE`'in hatasız dönmesi yeterli kanıt değildir. Gerçek RPC çağrısıyla duman testi yapılır.

## 7. Ücretsiz plan sınırları

- 500 MB veritabanı, 1 GB dosya, tek dosya 50 MB.
- Otomatik yedek yok; 1 hafta işlem olmazsa proje duraklar.
- Bu yüzden:
  - `register_audit` yalnızca değişen alanları tutar.
  - AI taslakları `register_drafts`'a yazılır (Faz C).
  - Doküman metni saklanmaz.

## 8. Frontend

- Register ekranları yalnızca RPC çağırır; ham `.from()` kullanılmaz.
- Tek `RegisterList` / `RegisterDetail` ve `registerConfig.js` yazılır (`src/components/proje-kontrol/` önerisi).
- Giriş noktası: `frontend-giris-karari.md` (öneri A, onay bekliyor).
- URL: `?register=&kayit=` (`useUrlSyncedSelection`).
- Yeni bildirim türü eklenirken alıcı rolün hedef sekmeyi görebildiği doğrulanır.

## 9. Dokümantasyon

- Klasör yalnızca `docs/proje-kontrol/`; yeni klasör açılmaz.
- Şema değişikliğinden sonra güncellenecekler:
  - CLAUDE.md "Proje Kontrol" bölümü;
  - `canli-sema-ozeti.md`;
  - kullanıcıya docx dokümantasyon hatırlatması.
