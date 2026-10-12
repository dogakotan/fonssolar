# Faz 1 · Adım 3 — canlıda BEGIN…ROLLBACK sonuçları

Tarih: 09.10.2026. Tasarım: `faz1-adim3-tasarim.md`. Yöntem Adım 2 ile aynıdır (`faz1-adim2-sonuclar.md`):
- her oturumdan önce açık bağlantı kontrolü;
- `lock_timeout = 3s`, `statement_timeout = 60s`;
- her oturum tek bir DO bloğu; blok her zaman hatayla biter, `COMMIT` yok.

**Durum (12.10.2026, ikinci koşu): 2a 11/11 geçti; 2b'de 3 test KALDI, üçü de test betiği hatası. Durduruldu.**
- T15: B4 çağrıları beklenen sonuçları döndürdü (`forbidden, validation, validation, OK, OK, OK`), ama okuma aynı SQL ifadesindeydi ve çağrılardan önceki anlık görüntüyü gördü. Aynı fonksiyonun davranışı 1c R16'da ayrı ifadelerle geçmişti.
- T18 ve T20d: `progress_pct` 2 ondalıklı (`%5.00`); beklenen metin `%5.0` yazılmıştı.
- Betik düzeltildi. Kural gereği yeniden koşulmadı; 2b onay bekliyor.
- İstenen T20c geçti: şantiye şefinin iptal göreve rapor ve doğrudan ilerleme girişi reddedildi, yeniden açması da reddedildi. Görev iptal kaldı, metrik farkı yok.
- Oturum 5 parmak izi Oturum 0 ile birebir aynı.
- Adım 3 kapanmadı.

**Önceki durum (12.10.2026, ilk koşu): Oturum 2a'da beklenmeyen bir hata çıktı, durduruldu.**
- 1c (tekrar) ve 1d geçti; kontrol 3 dahil.
- 2a, T11 satırında test betiğinin kendi hatasıyla düştü. Oturumun dış bloğundaki `v` değişkeni, sorgudaki `v` takma adıyla çakıştı: `column reference "v" is ambiguous`.
- Hata sorgu çalışırken çıktığı için hiçbir test sonucu dönmedi; T9-T10b de görülmedi.
- Betik düzeltildi. Kural gereği yeniden koşulmadı; 2a ve 2b onay bekliyor.
- Oturum 5 parmak izi Oturum 0 ile birebir aynı.
- Adım 3 kapanmadı.

09.10.2026'daki ilk koşu (Oturum 0, 1b, 1a, 1c'de R15 betik hatası, 5) aşağıda.

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

### 12.10.2026 koşusu (taslağa A8 eklendikten sonra)

| Oturum | Test | Beklenen | Gerçekleşen | Durum |
|---|---|---|---|---|
| 0 | Bağlantı / uzun işlem; parmak izi | 0 / 0; 09.10 ile aynı | 0 / 0; şema ve TIZ verisi aynı, yalnızca bildirim 1229→1231 (canlı kullanım) | GEÇTİ (yeni taban) |
| 1c | 5 taslak kurulumu (A8 dahil); F1 doğrulama | `OK`, R1-R16 | `OK \| F1 \| 7 kontrol grubu \| A4 var, R1-R5 geçti \| AID var, R6-R16 geçti` (R15 `progress=10`, A8 trigger/yetki katalog kontrolü) | GEÇTİ |
| 1d | B4 doğrulama (Adım 3'ten önce) | OK | `OK \| B4 \| 3 kontrol grubu` | GEÇTİ |
| 1d | **Kontrol 3 — uygulama sonrası etki**: 4 projede ilerleme, overall_pct, kategori ağırlık özeti, S-eğrisi/ilerleme kalemi/şantiye/özet görev sayıları; Adım 3'ten önce ve sonra, ikisinde de yeniden hesaplatılarak | değişmez | ADN1 0→0, 0,0→0,0 · ADN2 0→0, 0,0→0,0 · TIZ 13→13, 23,7→23,7 · TKY 27→27, 27,2→27,2; ağırlık özetleri ve görev sayıları aynı; kayıtlı = yeniden hesaplanan | GEÇTİ |
| 1d | B4 doğrulama (Adım 3'ten sonra) | genişletilmiş B4'e yönlendirme | aynen | GEÇTİ |
| 2a | T9-T14b | — | **Test betiği hatası** (T11, `v` takma adı); sonuç dönmedi | **DURDU** |
| 5 | Parmak izi | 12.10 Oturum 0 ile aynı | birebir aynı; Adım 3 nesnesi 0, test projesi 0 | GEÇTİ |

### 12.10.2026 ikinci koşu (2a/2b)

| Oturum | Test | Sonuç |
|---|---|---|
| 0 | Bağlantı / parmak izi | 0 / 0; 12.10 tabanıyla aynı · GEÇTİ |
| 2a | T9, T9b (9990→10000), T9c (40 karakter), T10, T10 gerçek atama + bilinmeyen disiplin, T10b, T11, T12, T13, T14 (Ç16: admin `D,D,C,C,D,C`, PM `D`, şş `D,K,K,OK`, service_role/postgres `D,D`), T14b | **11/11 GEÇTİ** |
| 2b | 2b hazırlık, T16, T17, T18b, T19, T20, **T20c**, T20b (bilgi) | GEÇTİ |
| 2b | T15 | **KALDI (betik)**: dönüş kodları beklenen gibi; okuma aynı ifadede eski anlık görüntüyü gördü (`TIZ-GEN-A1-0020/general/A1`, audit=0) |
| 2b | T18, T20d | **KALDI (betik)**: yalnızca `%5.00` ↔ `%5.0`; T20d'nin geri kalanı beklendiği gibi (eski rapor yeniden kaydı OK, artış reddedildi, `1×5 iptal`, PM yeniden açtı) |
| 5 | Parmak izi | Oturum 0 ile birebir · GEÇTİ |

Kontrol 3 ayrıntısı (`f1_adim3_etki.sql`):

| Proje | İlerleme (kayıtlı / önce → sonra) | overall_pct | Kategori ağırlık özeti | Görev: S-eğrisi / ilerleme kalemi / şantiye / özet |
|---|---|---|---|---|
| ADN1 | 0 / 0 → 0 | 0,0 → 0,0 | 7a5c9143 = | 120 / 120 / 6 / 120 |
| ADN2 | 0 / 0 → 0 | 0,0 → 0,0 | e5081ed3 = | 59 / 59 / 5 / 59 |
| TIZ | 13 / 13 → 13 | 23,7 → 23,7 | ecf44961 = | 35 / 35 / 16 / 35 |
| TKY | 27 / 27 → 27 | 27,2 → 27,2 | ed593b8e = | 14 / 14 / 11 / 14 |

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
