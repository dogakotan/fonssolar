# Faz 1 · Adım 2 — canlıda BEGIN…ROLLBACK test planı

Tarih: 09.10.2026. Durum: **"başla" onayı bekliyor.**
- **Kapsam:** B1, B2, B4, F1 (proje kodu kuralı, `create_project_with_code`, alan kodu kısıtı).
- **Proje:** TIZ (`test-izmir-ges-2026`, Karar 27). ADN1 ve ADN2'ye dokunulmaz.

## 1. Kurallar (her oturum)

- Her oturum tek bir transaction:

  ```
  begin;
  set local lock_timeout = '3s';
  set local statement_timeout = '60s';
  <taslaklar>;
  <testler>;
  rollback;
  ```

  `commit` hiç yazılmaz.
  - Taslak dosyalarının kendi `begin;` / `commit;` satırları çıkarılır; yalnızca BÖLÜM A gövdesi kullanılır.
  - İkinci emniyet: testler bir `DO` bloğundadır ve sonuçları **her zaman `raise exception`** ile döndürür. Araç işlemi kendiliğinden tamamlamaya çalışsa bile hata, işlemi geri alır.
- Rol taklidi:

  ```
  set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)
  set local role authenticated
  ```

  Her rol için TIZ'e erişimi olan bir test hesabı kullanılır (oturum 0'da id'leri SELECT ile seçilir).
- Hata beklenen denemeler alt işlemde (`begin … exception … end`) çalışır, hata kodu ve mesajı kaydedilir.
- Ertelenmiş kural (F1 A4) yalnızca commit'te çalışır. Testte `set constraints <ad> immediate` ile anında tetiklenir.
- **Sequence'ler:**
  - Mutlak değer kontrol edilmez; yalnızca biçim ve +1 artış kontrol edilir.
  - Register numaraları `project_register_counters` **tablosundan** gelir, rollback ile geri döner.
  - Satın alma testinde `SAT-YYYY-NNN` sequence'i tüketilmesin diye talep açık bir `request_no` (`SAT-TEST-…`) ile yazılır. Oturum 0'da talep tablosunda bir biçim kısıtı olmadığı doğrulanır; varsa plan buna göre değiştirilir.
  - `register_audit_id_seq` taslakla birlikte oluşur ve geri alınır.

## 2. Oturumlar ve sıra

Oturumlar MCP'nin ~95 KB istek sınırı yüzünden bölündü. Her oturum taslakları yeniden uygular (B1 → B2 → B4 → F1, ~43 KB), kendi testlerini çalıştırır ve geri alır.

| # | Oturum | İçerik | Tahmini boyut / DB süresi |
|---|---|---|---|
| 0 | Parmak izi (salt okunur) | Katalog sayımları; ilgili fonksiyon gövdelerinin md5'i; constraint tanımları; trigger'lar; ACL; `project_register_counters`; `pg_sequences.last_value`; TIZ'in risk, talep, rapor ve görev sayıları; test hesabı id'leri; `purchase_requests.request_no` kısıtları | 3 KB / <1 sn |
| 1 | Yapı | 4 taslak + 4 doğrulama betiği (B1 seed 64, B2 audit ve indeksler, B4 guard, F1 kısıtlar) | ~70 KB / <5 sn |
| 2 | Numara, proje kodu, alan kodu, Activity ID, B4 | Aşağıdaki T1-T5 | ~55 KB / <5 sn |
| 3 | Otomatik risk akışları | T6 | ~50 KB / <10 sn |
| 4 | 4 rol yetkileri | T7-T8 | ~55 KB / <5 sn |
| 5 | Rollback sonrası doğrulama (salt okunur) | Oturum 0 parmak izinin aynısı, karşılaştırma | 3 KB / <1 sn |

**Toplam süre:**
- Yazma ve çalıştırma dahil yaklaşık 30-45 dakika.
- Canlı DB'de işlem başına birkaç saniye. Kilitler yalnızca bu saniyeler boyunca tutulur.

## 3. Testler

| # | Test | Beklenen |
|---|---|---|
| T1 | Numara üretimi (postgres bağlamında TIZ'e 2 RFI, 1 doküman, 1 çizim türü doküman) | `^RFI-TIZ-\d{4,}$`, ikinci RFI = birinci + 1; `DOC-TIZ-…`, `DRW-TIZ-…` |
| T2a | `create_project_with_code`, admin, geçerli kod (`ZTST`) | Proje + ayar satırı oluşur; kategori ağırlıkları trigger'ı çalışır |
| T2b | Kodsuz, küçük harf (`ab` → AB büyütülür), rakamla başlayan (`1AB`), 6 karakter (`ABCDEF`), tireli (`AB-1`) | Kodsuz, `1AB`, `ABCDEF`, `AB-1` → `validation`; `ab` kabul edilir (AB) |
| T2c | Var olan kod (`TIZ`), var olan proje ID'si | `duplicate` |
| T2d | santiye_sefi ve muhasebe çağırır | `forbidden`; proje_yoneticisi çağırır → başarılı |
| T2e | Tanınmayan alan (`{"foo":1}`) | `validation` |
| T2f | admin doğrudan `projects` insert (kodsuz) + `set constraints … immediate` | `validation` (kodsuz proje reddi) |
| T2g | TIZ'in ayar satırını silme + immediate | `validation` |
| T3 | Mevcut 4 projenin kodu yeni biçime uyuyor | 4/4 |
| T4 | Alan kodu `A1` kabul, `A-1` red | check_violation |
| T5a | Activity ID: TIZ görevine NULL → `TIZ-GEN-A1-0010` (postgres), sonra başka değere UPDATE | İkinci UPDATE reddedilir. Not: NULL'dan ilk atamanın kısıtlanması Adım 3'te (Karar 30) |
| T5b | authenticated bağlamında `set_config('fons.activity_id_fix','on')` + UPDATE | Reddedilir (bayrak tek başına yetmez) |
| T5c | `admin_correct_task_activity_id`: admin + gerekçe; admin gerekçesiz; proje_yoneticisi; santiye_sefi; muhasebe | Admin + gerekçe başarılı, `register_audit`'e satır yazılır; diğerleri `validation` / `forbidden` |
| T6a | Satın alma: TIZ'de BOM kalemi planını aşan talep (açık `request_no`) + kalem + `onaylandi`'ye geçiş | Hata yok; `malzeme_fazla_talep` riski açılır ya da güncellenir (önce/sonra sayısı raporlanır) |
| T6b | Görev: TIZ'de tamamlanmamış bir görevin `planned_end`'i geçmişe çekilir | Hata yok; `gorev_gecikmesi` riski açılır |
| T6c | Günlük rapor: santiye_sefi (ya da admin) olarak `save_daily_report` ile TIZ'e rapor + ilerleme | Hata yok; ilerleme zinciri (`project_tasks` → `projects.progress`) ve risk yeniden hesabı çalışır |
| T7 | 4 rol × WBS / alan / alan-WBS: select, insert, update, delete; `has_table_privilege` TRUNCATE/REFERENCES/TRIGGER | admin, proje_yoneticisi: WBS yazar. santiye_sefi: yalnızca kendi projesinde alan ve alan-WBS yazar, WBS yazamaz. muhasebe: yalnızca okur. TRUNCATE/REFERENCES/TRIGGER hepsinde false (G-13) |
| T8a | 4 rol × `register_permissions`: select, doğrudan insert, `set_register_permission`, `get_my_register_permissions('test-izmir-ges-2026')`, `register_can` örnekleri | Herkes okur; doğrudan yazma reddedilir; `set_register_permission` yalnızca admin; harita tasarım 4.3 ile aynı |
| T8b | `ncr` ve `inspection` satırları | 8 satır, hiçbir rolde hiçbir yetki true değil; `register_can('ncr', …)` her rolde false |

T6 notu: Faz 1 taslakları `project_risks`'e numara eklemiyor (RSK Faz 3'te, Karar 14). Bu test B2 (yeni indeksler) ve B4 (guard) sonrası canlı risk akışlarının bozulmadığını doğrular.

## 4. Kilitler

Kilitler yalnızca oturum süresince (birkaç saniye) tutulur. Bekleme 3 saniyeyi geçerse oturum kendiliğinden düşer (`lock_timeout`).

| Kilit | Tablolar | Etki |
|---|---|---|
| ACCESS EXCLUSIVE (ALTER constraint) | `project_register_settings`, `project_areas` | Okuma dahil bekler. İkisi de küçük, `project_areas` boş |
| SHARE ROW EXCLUSIVE (CREATE TRIGGER) | `projects` (F1 constraint trigger); boş 8 register tablosu (B2 audit trigger'ları) | `projects`'e yazma (ör. ilerleme trigger'ının `projects.progress` güncellemesi) oturum bitene kadar bekler |
| SHARE (CREATE INDEX) | `purchase_requests`, `procurement_items`, `project_risks` + boş register tabloları | Bu tablolara yazma oturum bitene kadar bekler (satın alma talebi oluşturma, risk yeniden hesabı) |
| ACL değişimi (REVOKE) | `project_wbs`, `project_areas`, `area_wbs` | Kısa |
| Satır kilitleri | TIZ'in test edilen görev, talep, rapor ve risk satırları; `projects` TIZ satırı | Yalnızca TIZ |
| Fonksiyon değişimi | `fn_project_tasks_identity_guard` (B4) | Diğer oturumlar eski gövdeyi görmeye devam eder |

Öneri: oturumları mesai dışında ya da sistem kullanılmıyorken çalıştırmak. Kullanıcı etkisi en fazla birkaç saniyelik bekleme.

## 5. Rollback sonrası doğrulama (oturum 5)

Oturum 0 parmak izinin birebir aynı olması beklenir:
- Yeni nesneler yok: `register_permissions`, `register_audit`, `create_project_with_code`, trigger'lar.
- Kısıt tanımları eski hâlinde.
- Guard gövdesinin md5'i aynı.
- ACL aynı.
- Sayaçlar aynı.
- `ZTST` projesi yok.
- TIZ risk, talep, rapor ve görev sayıları aynı.

Sequence `last_value` farkları ayrıca raporlanır; beklenen fark yok.

## 6. Bilinen sınırlar

- MCP aracı tek istekte ~95 KB'tan büyük gövdeyi düşürüyor. Oturumlar bu yüzden bölündü.
- Rol taklidi JWT claim'leriyle yapılıyor; PostgREST katmanı devre dışı. Gerçek istemci yolu Adım 5'teki Playwright testleriyle doğrulanacak.
- Ertelenmiş kural commit'te çalışacağı için testte `immediate` ile zorlanıyor. Gerçek commit davranışı canlıda ancak uygulamadan sonra görülür.
