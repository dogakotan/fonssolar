# Faz 1 · Adım 2 — canlıda BEGIN…ROLLBACK sonuçları

Tarih: 09.10.2026. Plan: `faz1-adim2-test-plani.md`.
**Durum: Oturum 2'de beklenmeyen sonuç → Oturum 3-4 çalıştırılmadı (kullanıcı kuralı).**

## Ön kontroller (Oturum 0)

| Kontrol | Sonuç |
|---|---|
| `http` / `pg_net` eklentisi | Kurulu değil. Kurulu eklentiler: pg_cron, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp |
| Database Webhooks (`supabase_functions` şeması, `net` trigger'ları) | Yok (0 / 0) |
| Test tablolarındaki 37 trigger + public şemasındaki tüm fonksiyon gövdeleri: http, net.http, webhook, e-posta (smtp/resend/sendgrid/mailgun), dblink, pg_notify | Eşleşme yok. Senkron dış çağrı yok |
| `pg_stat_activity`: idle olmayan bağlantı / 1 dakikadan uzun transaction | 0 / 0 (iki kez kontrol edildi) |
| Parmak izi | Alındı (aşağıda) |

## Çalıştırma biçimi

Her oturum tek bir istekti:

```
set local lock_timeout='3s';
set local statement_timeout='60s';
do $oturum$ … $oturum$;
```

- Postgres çoklu ifadeli isteği örtük tek transaction olarak çalıştırır.
- `DO` bloğu her zaman `raise exception` ile biter. Bu yüzden transaction geri alınır, `COMMIT` yok.
- Etkin ayarlar oturum çıktısında doğrulandı: `lock_timeout=3s`, `statement_timeout=1min`.
- Neden açık `begin; …; rollback;` kullanılmadı: bu araçta ortadaki bir hata sondaki `rollback`'i atlatır ve transaction kilitleri tutarak açık kalabilir.

## Sonuçlar

| Oturum | Test | Beklenen | Gerçekleşen | Durum |
|---|---|---|---|---|
| 1 | B1 doğrulama | OK, seed 64 | OK, 12 kontrol grubu, seed 64 | GEÇTİ |
| 1 | B2 doğrulama | OK | OK, 6 grup, 30 FK indeksi, G-13 kapandı | GEÇTİ |
| 1 | B4 doğrulama | OK | OK, 3 grup | GEÇTİ |
| 1 | F1 doğrulama | OK | OK, 4 grup | GEÇTİ |
| 2 | T1 RFI biçim/artış | RFI-TIZ-NNNN, +1 | RFI-TIZ-0001, RFI-TIZ-0002 | GEÇTİ |
| 2 | T1 DOC/DRW | DOC-TIZ-…, DRW-TIZ-… | DOC-TIZ-0001, DRW-TIZ-0001 | GEÇTİ |
| 2 | T2a admin + ZTST | OK, ayar 1, ağırlık > 0 | OK, ayar=1, ağırlık=10 | GEÇTİ |
| 2 | T2b kodsuz / 1AB / ABCDEF / AB-1 | 4× validation | 4× validation | GEÇTİ |
| 2 | T2b küçük harf `ab` | OK, kod AB | OK, AB | GEÇTİ |
| 2 | T2c kod TIZ / mevcut ID | 2× duplicate | 2× duplicate | GEÇTİ |
| 2 | T2e tanınmayan alan / ID yok | 2× validation | 2× validation | GEÇTİ |
| 2 | T2d şantiye şefi / muhasebe / proje yöneticisi | forbidden, forbidden, OK | aynı | GEÇTİ |
| 2 | T2d bilgi: PM doğrudan `projects` insert | RLS reddi | RLS reddi | GEÇTİ (bugünkü tutarsızlık doğrulandı, Karar 35) |
| 2 | **T2f** kodsuz doğrudan insert + kural anında | validation | `record "old" has no field "project_id"` | **KALDI** |
| 2 | **T2g** TIZ kodunu silme | validation | `record "new" has no field "id"` | **KALDI** |
| 2 | **T2h** kodlu projeyi silme (CASCADE) | OK | `record "old" has no field "project_id"` | **KALDI** |
| 2 | T3 mevcut 4 kod yeni biçimde | 4/4 | 4/4 | GEÇTİ |
| 2 | T4 alan kodu A1 / A-1 | OK, check ihlali | OK, `project_areas_code_format` ihlali | GEÇTİ |
| 2 | T5a ilk atama / değiştirme / NULL | OK, red, red | OK, red, red | GEÇTİ |
| 2 | T5b admin oturumu + bayrakla doğrudan UPDATE | red, değer korunur | red, TIZ-GEN-A1-0010 | GEÇTİ |
| 2 | T5c B4: PM / şantiye şefi / muhasebe | 3× forbidden | 3× forbidden | GEÇTİ |
| 2 | T5c B4: admin gerekçesiz / gerekçeli | validation; OK + audit + yeni değer | validation; OK, audit=1, TIZ-GEN-A1-0040 | GEÇTİ |
| 3 | T6 otomatik risk akışları | — | **çalıştırılmadı** | — |
| 4 | T7-T8 4 rol yetkileri | — | **çalıştırılmadı** | — |

## Bulunan hata (F1 A4)

`fn_require_project_code` içinde:

```sql
v_pid := case when tg_table_name = 'projects' then new.id else old.project_id end;
```

PL/pgSQL bu ifadeyi bütün olarak çözümler; iki daldaki kayıt alanları birlikte aranır.
- `projects` trigger'ında `old.project_id`, `project_register_settings` trigger'ında `new.id` bulunmaz.
- Sonuç: kural hiçbir durumda çalışmıyor, her tetiklenmede yanlış hata veriyor.
- Kural canlıya uygulanmış olsaydı proje oluşturma ve silme (ertelenmiş olduğu için commit anında) tamamen kırılırdı.

**Taslaktaki düzeltme:** `CASE` yerine `IF … ELSE` (her atama yalnızca kendi dalında çözülür). Düzeltilmiş hâl canlıda **denenmedi**. Taslak "yeniden test bekliyor" olarak işaretlendi.

Diğer F1 parçaları (A1-A3) geçti. A4 zaten ayrı migration (Karar 34); bu hata A1-A3'ü etkilemiyor.

## Rollback sonrası doğrulama

Oturum 2'den sonra alınan parmak izi Oturum 0 ile **birebir aynı**:

| Alan | Oturum 0 | Oturum 2 sonrası |
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
| TIZ görev md5, BOM md5 | 6edc06f7…, 355b019c… | aynı |
| bildirim / kategori ağırlığı / proje sayısı | 1229 / 40 / 4 | aynı |
| register + WBS/alan satırları | 0 | 0 |

Oturum 1'den sonra ayrıca nesne kontrolü yapıldı: `register_permissions`, `register_audit` ve `create_project_with_code` yok; prefix kısıtı eski hâlinde.
