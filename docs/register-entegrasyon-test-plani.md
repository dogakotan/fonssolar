# Register ekranı — entegrasyon test planı (yerel uygulama → canlı veritabanı, yalnızca okuma)

Ne zaman: yayın sırasında Adım 1 (okuma fonksiyonları) canlıya uygulanıp doğrulandıktan sonra, PR açılmadan önce
(`docs/register-yayin-sirasi.md`). Navigasyon satırları henüz yokken yapılır.

Kurallar:
- Yalnızca okuma. Ekranda ekle/düzenle yok; spec yazma isteği görürse düşer.
- Otomatik test yalnızca **admin test hesabıyla** (Karar 90). Gerçek kişi hesabı araçla kullanılmaz; **muhasebe hesabı hiç kullanılmaz**.
- Yalnızca TIZ (Karar 72). DYB2 kontrolü aşağıda, kullanıcının kendi hesabıyla, elle ve yalnızca görerek.
- Kimlik bilgileri sohbete/araca yazılmaz; `.env*` dosyalarını kullanıcı kopyalar.

## 1. Hazırlık (kullanıcı)

1. `.env.test`'teki `TEST_ADMIN_EMAIL`'in **test admin hesabı** olduğunu doğrulayın (14.10.2026'da genel "Admin"
   hesabıydı, Karar 90). Genel hesap ya da kişisel hesapsa önce test admin hesabını açıp `.env.test`'e yazın.
2. `GES_Dashboard-faz23` klasöründe `.env` ve `.env.test` yok (19.10.2026). Ana klasördeki iki dosyayı bu klasöre
   **siz** kopyalayın (içerik araçla okunmaz). Her ikisi de `.gitignore`'da.
3. 5173 portunda başka bir klasörün dev sunucusu çalışıyor (19.10: `GES_Dashboard-entegrasyon`). Playwright
   `reuseExistingServer` ile o sunucuya bağlanır ve **yanlış kodu** test eder. Bu yüzden ayrı port kullanılır (adım 2.1).

## 2. Otomatik test — `tests/register-canli-tiz.spec.js`

PowerShell, `GES_Dashboard-faz23` klasöründe:

```powershell
# 2.1 Bu dalın kodunu canlı veritabanına bağlı, ayrı portta başlat (ayrı pencerede açık kalsın)
node node_modules/vite/bin/vite.js --port 5192 --strictPort

# 2.2 Testi koş (yalnızca admin; navigasyon yokken admin sekmeye adresle girer, menüde "Register" görünmemeli)
$env:PW_TARGET = 'live'
$env:BASE_URL = 'http://localhost:5192'
$env:REGISTER_LIVE_ROLES = 'admin'
npx playwright test tests/register-canli-tiz.spec.js
```

Beklenen (navigasyon öncesi): 1 geçti.
- `get_register_list` canlıda yoksa test "get_register_list canlıda yok" diyerek atlanır.
- Admin: menüde "Register" **yok**; 9 alt sekme; başlıkta "Proje kodu: TIZ"; Teknik Sunum'da "Bu projede henüz Teknik Sunum kaydı yok."
- Yazma isteği yok.

Navigasyon (Adım 4) uygulandıktan sonra aynı komut menüde "Register"in **göründüğünü** doğrular.
PM ve şef test hesapları yalnızca açıkça istenirse eklenir (`REGISTER_LIVE_ROLES='admin,proje_yoneticisi,santiye_sefi'`);
bu hesapların gerçek kişiye ait olmadığı önce doğrulanmalı.

Ağ taklitli testler (veritabanı gerekmez, her zaman koşulabilir):
`npx playwright test -c playwright.register-mock.config.js` (9 test) ve `npm run test:unit`.

## 3. Elle kontrol — DYB2'deki iki RFI (kullanıcının kendi hesabı)

Navigasyon yokken ekran yalnızca admin rolünde adresle açılır: `http://localhost:5192/dashboard/register?tur=rfi`.
Hesabınız admin değilse bu kontrol Adım 4'ten sonra yapılır (rolünüz Karar 6'ya göre RFI'yi görmeli: admin,
proje yöneticisi ya da DYB2'ye bağlı şantiye şefi). Proje seçicide DYB2 projesini seçin ("İsdemir (Diyarbakır GES-2)").

Beklenen değerler 19.10.2026'da canlıdan salt okunur okundu (konu/soru/açıklama metinleri müşteri verisi olduğu için
burada yok; ekrandakini SQL Editor'deki kayıtla karşılaştırın).

**Liste**

| Kontrol | Beklenen |
|---|---|
| Başlıktaki proje kodu | `Proje kodu: DYB2` |
| Kayıt sayısı | 2 kayıt, sayfalama yok |
| Varsayılan sıra | Numara azalan: `RFI-DYB2-0002` üstte |
| Sütunlar (varsayılan) | Numara, Başlık, Durum, Öncelik, Açılış, Termin, Sorumlu, Görev |

| Alan | RFI-DYB2-0001 | RFI-DYB2-0002 |
|---|---|---|
| Durum | ● Açık | ● Açık |
| Öncelik | ● Yüksek | ● Orta |
| Açılış | 2026-10-15 | 2026-10-15 |
| Termin | 2026-10-30 | 2026-12-31 |
| Sorumlu | — (kayıtta boş) | — (kayıtta boş) |
| Görev (Karar 69, salt okunur) | `M6` + görev adı | `E2` + görev adı |

**Sütun menüsünden açılanlar**

| Alan | İkisinde de |
|---|---|
| Açan | — (kayıtta boş; kayıt panelden girildi, Karar 78) |
| Disiplin | `Elektrik / Tasarım` (serbest metin; eşleme tablosunda olmadığı için ham haliyle) |
| Cevap tarihi | — |
| WBS / Alan | — |
| Oluşturulma / Güncellenme | 2026-10-15 |

**Yan panel** (satıra tıklayınca; adres `?tur=rfi&kayit=<id>` olur)

| Kontrol | Beklenen |
|---|---|
| Başlık | Numara + konu metni; altında "Proje kodu DYB2 · sıra 1" (0002 için sıra 2) |
| Soru | Var (0001: 138 karakter, 0002: 116 karakter) |
| Açıklama | Var (0001: 516, 0002: 480 karakter) |
| Cevap | Bölüm görünmez (kayıtta boş) |
| Durum geçmişi | 1 satır: "Açıldı: ● Açık", 15.10.2026 09:08 (İstanbul; UTC 06:08), kaydeden "Sistem / panel" |
| Kapat / Esc | Panel kapanır, adresten `kayit` silinir |

**Genel**
- Hiçbir ekle/düzenle/sil butonu yok.
- Arama kutusuna "RFI-DYB2-0001" yazınca yalnızca o kayıt kalır.
- Sayfa yenilenince (F5) aynı sekme ve açık kayıt geri gelir.
- Tarayıcı geliştirici araçlarında Network: yalnızca `rpc/get_*` POST ve GET istekleri.

## 4. Sonuç kaydı

Sonuçlar `CLAUDE.md` "Son değişiklik"e ve `register-gap-analizi.md` durum tablosuna yazılır. Bir kontrol tutmazsa
PR açılmaz; gerekirse fonksiyon ters SQL'i (`supabase/rollback/20261020090000_register_okuma_rpc.down.sql`) uygulanır
(kullanıcı etkisi yok, ön yüz henüz yayında değil).
