# İş Planı revizyonu: alınan kararlar

Kaynak: kullanıcı, 15.10.2026 (Faz 2 talimatı; Faz 1 "veri temeli" talimatıyla güncellendi). Dayanak: `docs/is-plani-denetim.md` §10.
Numaralar `İP-n`; CLAUDE.md'deki Proje Kontrol karar numaralarıyla (Karar 0-96) karışmasın diye ayrı.
Faz sırası: Faz 2 (tarih ve Gantt ölçeği) önce yapıldı; Faz 1 (veri temeli) ondan sonra.

| # | Karar | İçerik | Uygulama durumu |
|---|---|---|---|
| İP-1 | Taban dal | `is-plani-revizyon`, `local/entegrasyon`'dan (7de9f10) açıldı. Klasör `GES_Dashboard-is-plani`. `faz-a-proje-kontrol`, `feature/aylik-is-plani` ve `main`'e dokunulmaz | Uygulandı (15.10.2026) |
| İP-2 | Aylık plan toplamı ≠ hedef | Kayıtta **uyarı**, red yok. Baseline dondurma ve dışa aktarma **engellenir** | Baseline dondurma migration'ı bu kontrolü içeriyor (`20261015130300`, yazıldı, çalıştırılmadı). Kayıt uyarısı ve dışa aktarma kontrolü aylık plan düzenleme fazında |
| İP-3 | Öncül/ardıl kaynağı | **15.10.2026 güncellemesi:** öncüller `task_dependencies`'te tutulur. Görev notlarındaki "Öncül: …" metni **silinmez ama kaynak değildir**; hiçbir hesap ve ekran onu okumaz. Karar 92 bu doğrultuda güncellendi | Kayıt (veri değişmedi). Karşılaştırma raporu `docs/is-plani-faz1-veri-temeli.md` §6 |
| İP-4 | Şantiye şefi yetkisi | Şantiye şefi yalnızca gerçekleşen alanları yazar (`actual_*`, `progress_pct`, `total_progress`, `status`, `notes`); plan alanları (`planned_*`, `baseline_*`, `forecast_*`, `target_qty`) ve diğer kolonlar, yeni görev ve bağımlılık yazımı reddedilir. Admin ve proje_yoneticisi serbest | **Canlıya uygulandı (16.10.2026):** `20261016115400`, `20261016115418` |
| İP-5 | Gecikme referansı | **15.10.2026 güncellemesi:** "Riskli" ve risk kayıtları **her zaman bugüne göre** (Europe/Istanbul). Ekranın filtre tarihi yalnızca gecikme ve sapma gösterimini etkiler. Hesaplar `asOf` parametresi alır. Uyarı bandı İP-13 | Faz 2'de `asOf` altyapısı kuruldu. **Açık iş (Faz 1 kapanışı adım 7):** Faz 2 kodunda "Riskli" (KPI, Gantt kırmızısı, görev paneli, "Geciken" filtresi, Detaylı'daki risk etiketi) hâlâ filtre tarihine bağlı; bugüne bağlanacak. Sapma kolonu filtre tarihinde kalır |
| İP-6 | Gantt | Elle yazılmış kalır, kütüphane eklenmez | Uygulandı: Faz 2 ölçeği kütüphanesiz |
| İP-7 | `main`'e birleştirme koşulu | Dal `main`'e birleştirilmeden önce `manual-task-progress` spec'i **test projesi + test admin hesabıyla** koşulur; canlıda koşulmaz (Karar 77) | Bekliyor: test admin hesabı |
| İP-8 | Koruma migration'ları | `20261015130000` (bağımlılık döngü kontrolü + şef yazamaz) ve `20261015130100` (şef plan koruması) canlıya uygulanır. Her birine ters SQL (geri alma) dosyası hazırlanır; uygulamadan önce yedek yenilenir. Her SQL uygulamadan önce gösterilir, onay beklenir | Yedek yenilendi (15.10.2026, iki konum). Ters SQL `supabase/rollback/*.down.sql` yazıldı ve ROLLBACK provasında çalıştı (fonksiyon gövdesi md5 birebir geri geldi). **Uygulandı (16.10.2026)**; kullanıcı mesai dışı ve yedek koşulunu bu iki migration için kaldırdı. Prova 8/8, parmak izi değişmedi |
| İP-9 | Şef izin listesi | `equipment_notes` (ekipman notu) şantiye şefinin izin listesine eklenir. `team_size` yasak kalır. Değişiklik 4 rolle ROLLBACK provasında yeniden test edilir (ilerleme girişi, kilometre taşı, plan alanı reddi dahil) | 130100'e eklendi; 4 rol provası geçti (15.10.2026). **Canlıda (16.10.2026)** |
| İP-10 | WBS eşleştirmesi ve kod standardı | Şalt Sahası → `hv`; Kamera & Aydınlatma → `ac`; Mobilizasyon → `civil`. Kodlar kısa kalır: MOB, MEK, ELK-DC, ELK-DC-TM, ELK-OG, SALT, ENH, KAM, KABUL. **Şirket standardı:** tüm projelerde aynı kodlar kullanılır. Bir projede yalnızca görevi olan WBS düğümleri açılır | Faz 1 kapanışı adım 5 |
| İP-11 | Uygulama sırası | DYB2'deki bilinçsiz 7 görevin (Ş1-Ş5, N1-N2) geri alınması → WBS → baseline. **Baseline dondurma bu fazda uygulanmaz** (plan Excel'de revize ediliyor). Silme ayrı onayla, tek işlemde; beklenen sonuç DYB2'de 27 görev, 40 bağımlılık | Faz 1 kapanışı adım 4-6. Baseline ve (silme bitene kadar) WBS migration'ı `supabase/bekleyen/`'e taşınır |
| İP-12 | Süre kuralı (Faz 5, kritik yol) | Süre uç günler dahil: bitiş − başlangıç + 1. Veritabanındaki `duration_days` (hesaplanan, uçları saymaz) kritik yol motorunda **kullanılmaz**. Faz 5'te Excel planının hangi kurala uyduğu ölçülür | Faz 5 |
| İP-13 | Seçili tarih uyarısı | Filtre tarihi bugünden farklıysa ekranda "Seçili tarihe göre görünüm; risk durumu bugüne göre" uyarısı gösterilir | Faz 1 kapanışı adım 7 |

## Kapanan çelişkiler

- **Ç-İP-1 (İP-3 ↔ Karar 92):** kapandı. Notlar silinmez, kaynak değil; Karar 92 güncellendi.
  Excel aktarımının öncülü ayrıca `task_dependencies`'e yazması ayrı iş (bağımlılık fazı).
- **Ç-İP-2 (İP-4 hangi fazda):** kapandı. Faz 1 "veri temeli"nde yazıldı; uygulama onaya bağlı.
- **Ç-İP-3 (İP-5 yorumu):** kapandı. Riskli = bugün; filtre tarihi yalnızca gecikme ve sapma gösterimi için.

## Faz 1 raporu §9 soruları — kapandı (15.10.2026)

- Disiplin eşleştirmesi ve WBS kodları → İP-10.
- Şefin `equipment_notes` yazması → İP-9 (evet; `team_size` hayır).
- DYB2'nin 7 görevi ve baseline sırası → İP-11.
- Baseline migration'ının yeri → İP-11 (`supabase/bekleyen/`).
- İP-5 ön yüz değişikliği → İP-13 ile birlikte Faz 1 kapanışı adım 7.

## Yedekler

| Tarih | Konum | İçerik |
|---|---|---|
| 15.10.2026 (Faz 1) | `C:\fons-yedek\yedek-2026-10-15-is-plani\` | 6 tablo |
| 15.10.2026 (Faz 1 kapanışı, İP-8) | `C:\fons-yedek\yedek-2026-10-15-is-plani-2\` ve kopyası `D:\fons-yedek\yedek-2026-10-15-is-plani-2\` | 6 tablo + `projects`, JSON + CSV, `MANIFEST.json` (SHA-256). C: ve D: aynı fiziksel diskin iki bölümü; disk arızasına karşı koruma için harici disk ya da başka bir makine gerekir |
