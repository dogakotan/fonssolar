# Faz 1 · Adım 3 — canlıda BEGIN…ROLLBACK sonuçları

Tarih: 09.10.2026. Tasarım: `faz1-adim3-tasarim.md`. Yöntem Adım 2 ile aynıdır (`faz1-adim2-sonuclar.md`):
- her oturumdan önce açık bağlantı kontrolü;
- `lock_timeout = 3s`, `statement_timeout = 60s`;
- her oturum tek bir DO bloğu; blok her zaman hatayla biter, `COMMIT` yok.

**Durum: Oturum 1c'de beklenmeyen bir sonuç çıktı, durduruldu.** Sebep test betiğiydi; taslağın davranışında hata
görülmedi. Betik düzeltildi. Kural gereği yeniden koşulmadı; Oturum 1c, 1d, 2a, 2b onay bekliyor.

## Oturum planı

MCP isteği ~95 KB üstünü kabul etmediği için oturumlar bölündü. Betikler, taslaklardan yorum ve satır başı boşlukları
atılarak üretilir.

| Oturum | İçerik | Boyut |
|---|---|---|
| 0 | Bağlantı kontrolü + parmak izi | — |
| 1b | Hiçbir taslak kurulmadan bugünkü davranış: Ç-B ve iptal hesapları (İP0) | 4,5 KB |
| 1a | B1 + B2 + B4 + F1 + Adım 3 kurulur; B1, B2 doğrulama | 85 KB |
| 1c | Aynı kurulum; F1 doğrulama (R1-R16) | 86 KB |
| 1d | B1 + B2 + B4 + F1 kurulur; B4 doğrulama (Adım 3'ten önce); Adım 3 kurulur; B4 doğrulama yeniden | 78 KB |
| 2a | Tam kurulum; T9-T14b | 87 KB |
| 2b | Tam kurulum; 2a ön atamaları + T15-T20 | 85 KB |
| 5 | Parmak izi (Oturum 0 ile karşılaştırma) | — |

## Sonuçlar

| Oturum | Test | Beklenen | Gerçekleşen | Durum |
|---|---|---|---|---|
| 0 | Bağlantı / uzun işlem; eklentiler | 0 / 0; http, pg_net yok | 0 / 0; pg_cron, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp | GEÇTİ |
| 1b | ÇB sihirbaz silme adımı (PM, TIZ: 35 görev, 16'sında ilerleme) | `progress_daily` FK hatası | `progress_daily_task_id_fkey` ihlali | GEÇTİ (sorun doğrulandı) |
| 1b | İP0a iptal görev eklenince (bugünkü fonksiyonlar) | bilgi | kategori ağırlıkları değişti; S-eğrisi görev sayısı, ilerleme kalemleri, şantiye kalemleri ve özet toplamı 35→36 / 16→17 | bilgi |
| 1b | İP0b iptal göreve ilerleme (`add_task_progress`, PM) | bilgi | kabul edildi; görev `devam_ediyor`a döndü. Proje ilerlemesi 13→14, `overall_pct` 23,7→24,2, geciken 20→21, açık otomatik risk 28→29 | bilgi |
| 1a | 5 taslağın kurulumu | hatasız | hatasız | GEÇTİ |
| 1a | B1 doğrulama | OK, seed 64 | OK, 12 grup | GEÇTİ |
| 1a | B2 doğrulama | OK | OK, 6 grup, 30 FK indeksi, G-13 | GEÇTİ |
| 1c | F1 doğrulama R1-R14, R16 | OK | R15'e kadar hata yok | — |
| 1c | **R15** iptal: silme reddi, iptal sonrası proje ilerlemesi, proje silme | `silinemez`, ilerleme 50, proje silindi | `silinemez`, **ilerleme 0**, proje silindi | **KALDI (betik hatası)** |
| 5 | Parmak izi | Oturum 0 ile aynı | Birebir aynı (aşağıda) | GEÇTİ |

**R15'in sebebi:**
- `projects`'e eklenen her yeni projeye `trg_seed_default_category_weights` 10 kategorilik varsayılan ağırlık yazar. Bu listede `mekanik` yok.
- R-testlerinin geçici projesindeki görevler `mekanik` kategorisindeydi; ağırlıklı ilerleme bu yüzden her durumda 0 çıkıyordu.
- Sonuç olarak test iptal filtresini ölçemiyordu. Taslağın davranışında hata görülmedi: silme reddedildi, proje silme zinciri çalıştı.
- **Düzeltme:** fixture görevleri `panel_montaji` kategorisinde (ağırlık %20). Beklenen ilerleme 10 (%20 × ortalama %50, iptal görev hariç). İptal filtresi olmasa sonuç 5 çıkar; test artık ikisini ayırt ediyor.

## Parmak izi (Oturum 0 ve Oturum 5)

| Alan | Oturum 0 | Oturum 5 |
|---|---|---|
| tablo-ilişki / fonksiyon sayısı | 305 / 116 | 305 / 116 |
| fn_md5 | f407b1ae55d6dd8e03a2ad0323e358a9 | aynı |
| con / trg / idx / acl / pol / pub md5 | da4a943f… / 96adaed5… / dc76fda3… / c88e6f07… / ea925bc7… / d833e79a… | aynı |
| view_md5 | 09101f97307793e521b89c8c926b92bf | aynı |
| sayaçlar / sequence'ler | [] / 3251, 65 | aynı |
| projeler / ayarlar md5 | 02359618… / e49cdb76… | aynı |
| TIZ görev md5 (Activity ID, disiplin, durum, ilerleme dahil) | 88ce20ed… | aynı |
| TIZ risk md5 / sayı | 9ed7743a… / 33 | aynı |
| TIZ talep / rapor / ilerleme satırı | 8 / 26 / 122 | aynı |
| tüm görev / ID-disiplin-WBS-alan dolu görev | 228 / 0 | aynı |
| bildirim / tüm rapor / kategori ağırlığı / proje | 1229 / 85 / 40 / 4 | aynı |
| register + WBS/alan satırı / yeni nesne / test projesi | 0 / 0 / — | 0 / 0 / 0 |
| idle olmayan bağlantı | 0 | 0 |
