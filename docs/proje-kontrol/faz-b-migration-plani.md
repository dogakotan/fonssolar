# Faz B migration'ları — plan ve deneme sonuçları (TASLAK, hiçbiri uygulanmadı)

Tarih: 07.10.2026 · Dal: `faz-a-proje-kontrol` · Tasarım: `tasarim.md` v3 §4.1-4.4, §4.8 · Canlıyla farklar: `v3-uyum-notlari.md`

## 1. Paketler ve dosyalar

Her paket aynı düzende:
- `BÖLÜM A` uygula: tek transaction.
- `BÖLÜM B` geri al: dosya sonunda, yorum içinde.
- `*_dogrulama.sql`: kendini geri alan tek DO bloğu. Gerçek kullanıcılarla `request.jwt.claims` + `SET LOCAL ROLE authenticated` kullanır.
- `tests/proje-kontrol-b*.spec.js`: paket canlıda yoksa kendini atlar.

Değişen canlı nesnelerin anlık görüntüsü: `yedek-faz-b-07-10.sql`.

| Paket | SQL | Doğrulama | Test | Bağımlılık | Durum |
|---|---|---|---|---|---|
| B1 yetki matrisi | `taslak-sql/b1_register_permissions.sql` | `b1_dogrulama.sql` | `proje-kontrol-b1-yetki.spec.js` | — | Onay bekliyor |
| B2 audit, FK indeksleri, G-13 | `taslak-sql/b2_register_audit_indexes.sql` | `b2_dogrulama.sql` | `proje-kontrol-b2-audit.spec.js` | B1 | Onay bekliyor |
| B3 yazma RPC'leri, G-01 kalıcı | `taslak-sql/b3_register_write_rpcs.sql` | `b3_dogrulama.sql` | `proje-kontrol-b3-yazma.spec.js` (+ uyum spec'teki 3 fixme) | B1, B2 | Onay bekliyor |
| B4 Activity ID düzeltme | `taslak-sql/b4_identity_guard_admin_fix.sql` | `b4_dogrulama.sql` | `proje-kontrol-b4-activity.spec.js` | B1, B2 | Onay bekliyor |
| B6 okuma görünümleri ve RPC'leri | `taslak-sql/b6_register_read_rpcs.sql` | `b6_dogrulama.sql` | `proje-kontrol-b6-okuma.spec.js` | B1, B2, B3 | Onay bekliyor |
| B5 doküman deposu | `taslak-sql/b5_document_storage.sql` | `b5_dogrulama.sql` | `proje-kontrol-b5-dosya.spec.js` | B1, B2, B3 | **PATRON ONAYI BEKLİYOR** (Karar 5) |

**Önerilen uygulama sırası:** B1 → B2 → B3 → B4 → B6. B5 patron onayından sonra gelir.

Her adımda şu sıra izlenir:
1. SQL gösterilir ve onay alınır.
2. Hedef tablolarda kilit/aktif sorgu yok mu kontrol edilir.
3. `apply_migration` çalıştırılır; aynı sürümle `supabase/migrations/` dosyası yazılır.
4. İlgili `*_dogrulama.sql` çalıştırılır (sonuç `DOGRULAMA SONUCU: OK …` olmalı).
5. İlgili spec ve tam Playwright seti koşulur.

Hata olursa durulur ve paketin BÖLÜM B'si önerilir.

## 2. Canlı deneme sonuçları (07.10.2026, BEGIN…ROLLBACK)

Yöntem: paket(ler)in BÖLÜM A'sı ve doğrulama betiği tek DO bloğunda çalıştırıldı, blok sonunda zorunlu hatayla geri alındı. Hiçbir migration uygulanmadı.

| Deneme | İçerik | Sonuç |
|---|---|---|
| 1 | B1 + B1 doğrulaması | `OK │ B1 │ 12 kontrol grubu │ seed 56 │ geçiş durumları canlı CHECK ile uyumlu` |
| 2 | B1 + B2 (ikisi de dosyadaki haliyle) + iki doğrulama | `OK │ B1 │ 12` · `OK │ B2 │ 6 │ 30 FK indeksi │ G-13 kapandı │ audit yalnızca değişen alan` |
| 3 | B1 + B2 + B3 (B3 dosyadaki haliyle) + B3 doğrulaması | `OK │ B3 │ 9 │ numaralar RFI-TIZ-0001, RFI-TIZ-0002 (boşluksuz) │ çizim DRW-TIZ-0001 │ dört göz ve G-01 kalıcı kural çalışıyor` |
| 4 | B1/B2'nin B4'ün kullandığı kısmı + B4 + B4 doğrulaması | `OK │ B4 │ 3 │ guard doğrudan değişikliği reddediyor, yalnızca admin RPC'si gerekçeyle düzeltiyor` |
| 5 | B1, B2, B3'ün B6'nın kullandığı kısmı + B6 (dosyadaki haliyle) + B6 doğrulaması | `OK │ B6 │ 4 │ liste/detay/özet/audit ve 8 görünüm RLS ile çalışıyor` |
| 6a | B1/B3'ün doküman kısmı + B5 + B5 doğrulaması | **Hata:** iptal edilen revizyon `R03` numarasını tuttuğu için sonraki yükleme de `R03` aldı → `UNIQUE(document_id, revision_no)` ihlali. B5'te düzeltildi (aşağıda) |
| 6b | Aynısı, düzeltilmiş B5 ile | `OK │ B5 │ 6 │ yükleme/tamamlama/iptal, revizyon devri, politika ve temizlik çalışıyor` |

**Parmak izi:**
- Bütün denemelerden önce ve sonra alındı.
- Kapsam: public şemanın kolon, kısıt, indeks, politika, trigger, yetki ve fonksiyon md5'leri; storage politikaları; bucket'lar; realtime yayını; cron işleri; register satır sayıları; proje kodları; görevlerin activity_id'leri.
- Sonuç: **birebir aynı** (62 ilişki, 116 fonksiyon, register satırı 0). Değerler `yedek-faz-b-07-10.sql`'in sonunda.

**Sınır (dürüstçe):**
- Her paketin BÖLÜM A'sı en az bir denemede dosyadaki haliyle çalıştı (yalnızca tam satır yorumlar atıldı).
- 4, 5 ve 6. denemelerde bağımlı paketlerin yalnızca o paketin kullandığı kısmı (aynı tanımlar, kısaltılmış) vardı.
- Altı dosyanın hepsini birden tek blokta uygulama denemesi yapılamadı: istek ~95-110 KB oluyor ve MCP aracı bu boyutta isteği düşürdü ("fetch failed"; sonrasında canlının değişmediği ayrıca kontrol edildi).
- Gerçek uygulama paket paket ve her paketten sonra kendi doğrulamasıyla yapılacağı için bu sınır uygulama sırasında kapanır.

**Denenemeyen:** 20 eşzamanlı numara üretimi tek oturumda denenemez. Bu kontrol `proje-kontrol-b3-yazma.spec.js` ve uyum spec'indeki fixme'de; B3 uygulanınca koşulacak.

## 3. Taslaklarda yapılan seçimler (onayınla değişebilir)

| # | Konu | Seçim | Neden |
|---|---|---|---|
| S1 | santiye_sefi "yalnızca kendi kaydı" kuralı | `register_permissions.edit_scope` (all/own), kodda sabit değil | Matris değişince kod değişmesin (tasarım 4.3) |
| S2 | Yetki değerleri | Tasarım 4.3 matrisi seed edildi | Karar 6 **AÇIK**: değerler öneri; `set_register_permission` (yalnızca admin) ile değişir |
| S3 | İş durumu geçişleri | Canlı CHECK listelerine göre 40 geçiş (`register_status_transitions`) | Tasarımda liste yoktu. Doğrulama her durumun canlı CHECK'te olduğunu kontrol ediyor |
| S4 | Dört göz | `project_register_settings.four_eyes_enabled` (varsayılan **true**); bugün yalnızca decision için (risk/change/claim tabloları Faz D) | Karar 10 **AÇIK** |
| S5 | register_links | Kurulmadı. Bağ/çöz RPC'leri mevcut kompozit FK kolonlarını yazar (11 çift) | Canlı yapı aynı projeyi DB'de garanti ediyor |
| S6 | register_audit.project_id | FK yok | Proje silinirken zincirleme silinen kayıtların audit satırı FK'ye takılıp proje silmeyi engellemesin |
| S7 | Doküman | Elle açılan doküman doğrudan `approved`; silinmez, void edilir; kimlik alanları void olana kadar düzenlenebilir | Tasarım 4.1 |
| S8 | RFI cevabı | `set_register_status('rfi', id, 'answered', p_note)`: p_note cevap metni olur (zorunlu) | Tasarımdaki imzada cevap alanı yoktu |
| S9 | Okuma izni | B3, 9 tablonun SELECT policy'sine `register_can(…,'view')` ekler → **muhasebe register'ları artık okumaz** (4.3'te "yok") | Tasarım 4.3 |
| S10 | Dosya yolu | `document_revisions.storage_file_id` (storage_provider = supabase_storage), yükleyen `created_by` | Kolonlar canlıda zaten var; ikinci kolon açılmadı |
| S11 | Aborted revizyon | Numara `X` + id'nin ilk 8 hanesine çevrilir | Deneme 6a'daki çakışma |
| S12 | Dosya silme | Kullanıcı yalnızca kendi uploading/aborted dosyasını; admin aborted olanları siler. Ready dosya silinemez | Storage SQL'den silmeyi engelliyor (`protect_objects_delete`); silme Storage API ile yapılmak zorunda |
| S13 | pg_cron | Saatlik (:15): 1 saatten eski uploading → aborted; dosyası olmayan aborted satır silinir. Dosyası kalanlar `get_stale_uploads` (admin) ile listelenir | Tam otomatik silme için pg_net + edge function gerekir (pg_net kurulu değil) — karar Faz B |
| S14 | Bucket boyutu | 50 MB (`file_size_limit`), izinli türler pdf, png, jpg, docx, xlsx, dwg | Ücretsiz plan tek dosya sınırı; Pro'ya geçilirse değiştirilebilir |
| S15 | B4 guard | Bayrak (`fons.activity_id_fix`) + "çağıran bağlam düzeltme fonksiyonunun sahibi" şartı | authenticated/service_role doğrudan UPDATE'te bayrakla bile geçemez (denemede doğrulandı) |

## 4. Bilinen sınırlar ve açık noktalar

- **Test verisi temizliği:**
  - Doküman ve çizim RPC ile silinemiyor, onaylı doküman yalnızca void ediliyor.
  - Ready dosya hiçbir kullanıcı tarafından silinemiyor.
  - B5 testleri İzmir test projesinde void doküman ve dosya bırakır. Bunlar için periyodik bir admin temizliği (SQL + Storage paneli) gerekir.
  - RFI/aksiyon/karar testleri temizlenir (yeniden aç + admin silme). Sayaçlar geri sarılmaz.
- **`can_write_project_control` / `can_manage_project_control`:** B3'ten sonra hiçbir policy kullanmaz. Ayrı bir temizlik migration'ıyla kaldırılabilir (ekle-geçir-kaldır kuralı).
- **Bildirimler:** B3 bildirim üretmez. Register bildirimleri (entity_type register_record/register_draft) Faz C (C2).
- **Liste sıralaması:** `register_no` metin sıralaması `…-9999` ile `…-10000` arasında doğal sırayı bozar. Gerekirse sayısal sıra kolonu eklenir.
- **Doğrulanamadı:**
  - Bucket `file_size_limit` 50 MB'ın ücretsiz plandaki fiili davranışı.
  - DWG dosyalarının tarayıcının gönderdiği MIME türü. İstemci `contentType`'ı açıkça vermeli.

## 5. Onayınla uygulanacak SQL dosyaları

- `taslak-sql/b1_register_permissions.sql` (BÖLÜM A)
- `taslak-sql/b2_register_audit_indexes.sql` (BÖLÜM A)
- `taslak-sql/b3_register_write_rpcs.sql` (BÖLÜM A)
- `taslak-sql/b4_identity_guard_admin_fix.sql` (BÖLÜM A)
- `taslak-sql/b6_register_read_rpcs.sql` (BÖLÜM A)
- `taslak-sql/b5_document_storage.sql` (BÖLÜM A): **yalnızca patron onayından sonra**
