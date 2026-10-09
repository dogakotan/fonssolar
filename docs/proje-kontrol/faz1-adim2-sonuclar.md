# Faz 1 · Adım 2 — canlıda BEGIN…ROLLBACK sonuçları

Tarih: 09.10.2026. Plan: `faz1-adim2-test-plani.md`.
- **Test blokları:** `taslak-sql/f1_adim2_testler_oturum{2,3,4}.sql`. Her oturum = B1 + B2 + B4 + F1'in BÖLÜM A'sı + test bloğu.
- **Durum:**
  - 1. çalıştırma: Oturum 2'de F1 A4 hatası bulundu, durduruldu.
  - 2. çalıştırma: F1 düzeltildi, Oturum 1-3 tamamen geçti. Oturum 4'te 5 satır test betiğindeki karşılaştırma hatası yüzünden "KALDI" yazdı; veritabanı davranışı beklenenle aynı. Kural gereği Oturum 4 yeniden çalıştırılmadı.
  - Oturum 5 (rollback doğrulaması) çalıştırıldı ve geçti.

## Ön kontroller (Oturum 0)

| Kontrol | Sonuç |
|---|---|
| `http` / `pg_net` eklentisi | Kurulu değil. Kurulu eklentiler: pg_cron, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp |
| Database Webhooks (`supabase_functions` şeması, `net` trigger'ları) | Yok |
| Test tablolarındaki 37 trigger + public şemasındaki tüm fonksiyon gövdeleri: http, webhook, e-posta, dblink, pg_notify | Eşleşme yok |
| `pg_stat_activity`: idle olmayan bağlantı / 1 dakikadan uzun transaction | Her çalıştırmadan önce 0 / 0 |

## Çalıştırma biçimi

Her oturum tek istekti:

```
set local lock_timeout='3s';
set local statement_timeout='60s';
do $oturum$ … $oturum$;
```

- Postgres çoklu ifadeli isteği örtük tek transaction olarak çalıştırır.
- `DO` bloğu her zaman `raise exception` ile biter. Bu yüzden transaction geri alınır; `COMMIT` yok.
- Etkin ayarlar her oturum çıktısında görüldü: `lock_timeout=3s`, `statement_timeout=1min`.

## F1 düzeltmesi (Karar 36)

`fn_require_project_code` (tek fonksiyon, `CASE` ile tabloya göre NEW/OLD seçimi) her tetiklenmede
`record "old"/"new" has no field …` hatası veriyordu.

Yeni yapı:
- `fn_projects_require_code` (yalnızca `new.id`);
- `fn_project_register_settings_keep_code` (yalnızca `old.project_id`);
- ortak kontrol `project_code_missing(text)`.

Her trigger fonksiyonu yalnızca kendi tablosunun kaydına baktığı için bu hata sınıfı yapısal olarak ortadan kalktı.

`f1_dogrulama.sql`'e kuralı fiilen tetikleyen R1-R5 regresyon testleri eklendi:
- **R1:** kodsuz proje;
- **R2:** kodu silme;
- **R3:** kodlu projeyi silme;
- **R4:** kodlu projenin adını güncelleme;
- **R5:** mevcut projeyi güncelleme.

Her test kendi alt işleminde çalışır ve geri alınır. Adım 6'da canlı doğrulamada da çalışır; A4 henüz uygulanmamışsa A4 kısmını atlar ve bunu açıkça yazar.

## Sonuçlar (2. çalıştırma)

| Oturum | Test | Beklenen | Gerçekleşen | Durum |
|---|---|---|---|---|
| 1 | B1 doğrulama | OK, seed 64 | OK, 12 grup | GEÇTİ |
| 1 | B2 doğrulama | OK | OK, 6 grup, 30 FK indeksi, G-13 | GEÇTİ |
| 1 | B4 doğrulama | OK | OK, 3 grup | GEÇTİ |
| 1 | F1 doğrulama (R1-R5 dahil) | OK | OK, 5 grup, "A4 var, R1-R5 regresyon geçti" | GEÇTİ |
| 2 | T1 RFI biçim/artış | RFI-TIZ-NNNN, +1 | RFI-TIZ-0001, RFI-TIZ-0002 | GEÇTİ |
| 2 | T1 DOC/DRW | DOC-TIZ-…, DRW-TIZ-… | DOC-TIZ-0001, DRW-TIZ-0001 | GEÇTİ |
| 2 | T2a admin + ZTST | OK, ayar 1, ağırlık > 0 | OK, ayar=1, ağırlık=10 | GEÇTİ |
| 2 | T2b kodsuz / 1AB / ABCDEF / AB-1 | 4× validation | 4× validation | GEÇTİ |
| 2 | T2b küçük harf `ab` | OK, kod AB | OK, AB | GEÇTİ |
| 2 | T2c kod TIZ / mevcut ID | 2× duplicate | 2× duplicate | GEÇTİ |
| 2 | T2e tanınmayan alan / ID yok | 2× validation | 2× validation | GEÇTİ |
| 2 | T2d şantiye şefi / muhasebe / proje yöneticisi | forbidden, forbidden, OK | aynı | GEÇTİ |
| 2 | T2d bilgi: PM doğrudan `projects` insert | RLS reddi | RLS reddi | GEÇTİ |
| 2 | **T2f** kodsuz doğrudan insert | validation | validation | **GEÇTİ** |
| 2 | **T2g** TIZ kodunu silme | validation | validation | **GEÇTİ** |
| 2 | **T2h** kodlu projeyi silme (CASCADE) | OK | OK | **GEÇTİ** |
| 2 | T3 mevcut 4 kod yeni biçimde | 4/4 | 4/4 | GEÇTİ |
| 2 | T4 alan kodu A1 / A-1 | OK, check ihlali | OK, `project_areas_code_format` | GEÇTİ |
| 2 | T5a ilk atama / değiştirme / NULL | OK, red, red | OK, red, red | GEÇTİ |
| 2 | T5b admin oturumu + bayrakla doğrudan UPDATE | red, değer korunur | red, TIZ-GEN-A1-0010 | GEÇTİ |
| 2 | T5c B4: PM / şantiye şefi / muhasebe | 3× forbidden | 3× forbidden | GEÇTİ |
| 2 | T5c B4: admin gerekçesiz / gerekçeli | validation; OK + audit | validation; OK, audit=1, TIZ-GEN-A1-0040 | GEÇTİ |
| 3 | T6a satın alma: kalem ekleme / admin onayı | hata yok | OK, OK | GEÇTİ |
| 3 | T6a etkiler | malzeme riski açılır, planlı miktar artar | malzeme riski=1, planlı 12→50, düzeltme kaydı=1 | GEÇTİ |
| 3 | T6b görev gecikmesi (bitiş geçmişe) | hata yok, gecikme riski +1 | OK, 28→29 | GEÇTİ |
| 3 | T6c günlük rapor (şantiye şefi, `save_daily_report`) | hata yok, ilerleme +1, görev ilerlemesi artar | OK, ilerleme satırı 7→8, görev 43→48, proje %13→13 | GEÇTİ |
| 4 | T7 admin: WBS / alan / alan-WBS | tümü OK, bağ güncelleme yetkisiz | aynı | GEÇTİ |
| 4 | T7 proje_yoneticisi | admin ile aynı | aynı | GEÇTİ |
| 4 | T7 santiye_sefi | WBS yazamaz; kendi projesinde alan ve bağ yazar, TKY'de yazamaz | aynı | GEÇTİ |
| 4 | T7 muhasebe | yalnızca okur | aynı (okuma 3 satır) | GEÇTİ |
| 4 | T7 authenticated TRUNCATE/REFERENCES/TRIGGER/area_wbs UPDATE | hepsi false | `f,f,f,f` | KALDI* |
| 4 | T8a admin: okuma 64, doğrudan yazma yok, `set_register_permission` OK, rfi haritası VCEAD, ncr/inspection `register_can` false | aynı | sayı/yazma/set/harita aynı; ncr/inspection `f,f,f,f` | KALDI* |
| 4 | T8a proje_yoneticisi (set → forbidden, rfi VCEA) | aynı | aynı; ncr/inspection `f,f,f,f` | KALDI* |
| 4 | T8a santiye_sefi (set → forbidden, rfi VCE + own) | aynı | aynı; ncr/inspection `f,f,f,f` | KALDI* |
| 4 | T8a muhasebe (set → forbidden, rfi yetkisi yok) | aynı | aynı; ncr/inspection `f,f,f,f` | KALDI* |
| 4 | T8b ncr/inspection satırları | 8 satır, 0 yetkili | 8 satır, 0 yetkili | GEÇTİ |

**\* KALDI'nın sebebi test betiği.**
- Betik boolean değerleri `concat_ws` ile metne çeviriyordu. PostgreSQL bunları `t`/`f` olarak yazar; beklenen metin ise `false` olarak yazılmıştı.
- Gerçekleşen değerlerin hepsi `f` (false), yani beklenen davranış.
- Betik `::text` ile düzeltildi (`true`/`false` üretir), ama Oturum 4 kullanıcı kuralı gereği yeniden çalıştırılmadı.

## T2f-h: düzeltme öncesi / sonrası

| Test | 1. çalıştırma (CASE'li tek fonksiyon) | 2. çalıştırma (iki fonksiyon) |
|---|---|---|
| T2f kodsuz doğrudan insert | `record "old" has no field "project_id"` — KALDI | `validation` — GEÇTİ |
| T2g TIZ kodunu silme | `record "new" has no field "id"` — KALDI | `validation` — GEÇTİ |
| T2h kodlu projeyi silme | `record "old" has no field "project_id"` — KALDI | `OK` — GEÇTİ |
| F1 doğrulama R1-R5 (yeni) | — | 5/5 geçti |

## Rollback sonrası doğrulama (Oturum 5)

| Alan | Oturum 0 | Oturum 5 |
|---|---|---|
| rels / fns | 305 / 116 | 305 / 116 |
| fn_md5 | f407b1ae55d6dd8e03a2ad0323e358a9 | aynı |
| con_md5 | da4a943f042fa849cb0a94001eeb8435 | aynı |
| trg_md5 | 96adaed5e55462895e2ce45b14cee9e5 | aynı |
| idx_md5 | dc76fda3063eab2d31b81f61d2aa8229 | aynı |
| acl_md5 | c88e6f07990b0cb54ccf429e579e1c25 | aynı |
| pol_md5 | ea925bc7bf0f85d4c39726aa3ffe6cd2 | aynı |
| pub_md5 (realtime) | d833e79a4649984b1da566f431e1d29d | aynı |
| sayaçlar | [] | [] |
| sequence'ler | purchase_request_no_seq_2026=3251, user_management_audit_id_seq=65 | aynı |
| projects / settings md5 | 02359618… / e49cdb76… | aynı |
| TIZ risk md5 / sayı | 9ed7743a… / 33 | aynı |
| TIZ talep / rapor / ilerleme satırı | 8 / 26 / 122 | aynı |
| TIZ görev md5 / BOM md5 | 6edc06f7… / 355b019c… | aynı (planlı miktar 12'de) |
| bildirim / kategori ağırlığı / proje sayısı | 1229 / 40 / 4 | aynı |
| register + WBS/alan satırları | 0 | 0 |
| test projeleri (`ztst*`, `zzf1*`) / `SAT-TEST-F1*` talebi | — | 0 / 0 |
| `procurement_item_adjustments` | (Oturum 0'da ölçülmedi) | 1 satır, 23.07.2026 tarihli (eski veri; testin kaydı değil) |
