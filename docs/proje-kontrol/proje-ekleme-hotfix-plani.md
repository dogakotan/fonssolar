# Proje ekleme hotfix'i — plan (14.10.2026)

Amaç: manuel sihirbaz ve Excel ile yeni proje eklemenin admin ve proje yöneticisinde sorunsuz çalışması. Kararlar 85-88.
Durum: plan; kod yazılmadı. Her parça ayrı gösterilip onaylanır.

## 1. Bugünkü durum (14.10.2026, canlıda ROLLBACK testi)

| Yol | Admin | Proje yöneticisi |
|---|---|---|
| Manuel sihirbaz | Proje açılır ama **proje kodu yok** (register kullanılamaz). Tedarik adımı "Devam"la değil adım listesinden atlanırsa son kayıt "yalnızca proje yöneticisi" hatasıyla yarıda kalır | **Açamaz:** `projects` INSERT RLS yalnızca admin |
| Excel (`import-project-excel` v22) | Proje açılır, **kod yok**. Güncellemede durumu boş risk satırı yüklemeyi yarıda keser (`acik`/`yuksek`/`dusuk`) | Aynı. Ayrıca güncelleme yolunda rol kontrolü yok (muhasebe, şantiye şefi fonksiyonu doğrudan çağırabilir) |

## 2. Parçalar ve sıra

| # | Parça | Nerede | Onay |
|---|---|---|---|
| P1 | **F1 A1-A3** (`create_project_with_code`, proje kodu ve alan kodu CHECK'leri) | Canlı DB, `apply_migration` | **UYGULANDI 14.10.2026** (`20261014102306`); doğrulama canlıda 7/7 |
| P2 durum | Hotfix kodu `hotfix/proje-ekleme` `678806a` | Yerel dal | Push yok; fark gösterildi, onay bekliyor |
| P4 durum | `taslak-sql/kategori_agirlik_varsayilan.sql` (DB), `mapping.ts` (hotfix'te) | — | Karar 89; DB için "uygula" bekliyor |
| P2 | **Ön yüz**: sihirbaz proje kodu + `create_project_with_code`; tedarik isteğe bağlı; şablon v8 | `hotfix/proje-ekleme` dalı (`main`'den), klasör `GES_Dashboard-hotfix` | Kod gösterilir, siz push + merge |
| P3 | **`import-project-excel` + `export-project-excel`** (v8, E13; risk varsayılanları; güncellemede rol kontrolü; yazmadan önce doğrulama) | Edge function deploy | "deploy" |
| P4 | **Varsayılan kategori ağırlıkları** (yalnızca yeni projeler) | DB trigger + `mapping.ts` | Değerler sizde (§6) |
| P5 | Ara çözüm: kodsuz projeye kod ekleme şablonu | Rehber §4.14 | Hazır, test edildi |

**Sıra:** P1 → P2 (merge, Vercel yayını) → P3 → (P4).
- P2 P1'den önce yayına çıkarsa sihirbaz `create_project_with_code` bulamaz.
- P3 P2'den önce çıkarsa sitedeki şablon hâlâ v7 olur (E13 yok), Excel'le yeni proje "proje kodu zorunlu" hatası verir.
- P2 ile P3 arası kısa tutulmalı. Bu arada eski import v8 dosyasını kabul eder; E13'ü yok sayar, kodsuz proje açar. O aralıkta açılan projeye kod §4.14 şablonuyla eklenir.

## 3. P2 — değişecek dosyalar ve 6b birleştirmesinde çakışma

İlke: `faz-a-proje-kontrol`'deki aynı amaçlı parçalar **birebir** taşınır; hotfix'e özgü ek düzeltmeler `faz-a`'ya da
aynen işlenir. Böylece 6b'de iki dalda aynı satırlar olur ve Git çakışma çıkarmaz.

| Dosya | Hotfix değişikliği | `faz-a`'da | 6b çakışması |
|---|---|---|---|
| `wizard/Adim1ProjeBilgileri.jsx` | Proje Kodu alanı ve doğrulaması | +31 satır, aynı amaç | **Yok** (faz-a hunk'ları birebir alınır) |
| `wizard/Adim8Tamamlandi.jsx` | Yeni projede `projects` insert yerine `create_project_with_code`; tedarik RPC'si yalnızca `completed === true` iken | +75/-38 (görev kaydı `save_project_tasks` ile, Ç-B) | **Var, kesin.** 6b'de `faz-a` sürümü alınır ve hotfix'in iki küçük değişikliği (tedarik koşulu, kod çağrısı) onda var mı diye kontrol edilir. faz-a'da tedarik koşulu yok; hotfix'ten sonra faz-a'ya da işlenir |
| `wizard/Adim5Tedarik.jsx` | Yeni projede "onaylamadan devam" (isteğe bağlı) | Değişmedi | Yok |
| `public/excel/fons-solar-proje-sablonu.xlsx` | Şablon v8 (E13) | v8 hazır | **Yok** (faz-a dosyası birebir kopyalanır; ikili dosya, aynı içerik) |
| `functions/import-project-excel/index.ts` | faz-a'nın E13 / `create_project_with_code` parçaları + risk varsayılanları + güncellemede rol kontrolü + yazmadan önce doğrulama + kopya kodu | +39/-5 | **Yok**, aynı dosya hotfix'ten sonra faz-a'ya da kopyalanırsa |
| `functions/import-project-excel/mapping.ts` | (P4 onaylanırsa) `CANONICAL_CATEGORY_WEIGHTS` | Değişmedi | Yok, aynı kopyalanırsa |
| `functions/export-project-excel/index.ts` | E13 yazımı (faz-a hunk'ı birebir) | +3/-1 | Yok |
| `src/utils/projectExcelBridge.js` | **Dokunulmaz** (Karar 53). Sunucu hata metnini zaten kullanıcıya gösteriyor | — | — |
| `components/TabProjeYonetimi.jsx` | Dokunulmaz | +18/-4 | — |

**14.10.2026 durum:** hotfix'e özgü değişiklikler `faz-a`'ya işlendi: Adim5, `import-project-excel/index.ts` ve
`mapping.ts` birebir; Adim8'e tedarik koşulu. `git merge-tree faz-a-proje-kontrol hotfix/proje-ekleme` denemesinde
**kalan tek çakışma `Adim8Tamamlandi.jsx`**: yeni proje bloğu (`faz-a`'da `fail()` yardımcısı ve fonksiyon yoksa eski
yola dönüş, hotfix'te satır içi hata). 6b'de `faz-a` sürümü alınır; iki davranış (`create_project_with_code`, tedarik
koşulu) onda zaten var. Diğer bütün dosyalar otomatik birleşiyor.

**14.10.2026 yayın sonrası güncelleme:** `faz-a` ile güncel `main` (01763a9) birleşmesinde çakışan dosyalar
**`Adim8Tamamlandi.jsx` ve `export-project-excel/template_builder.ts`**. `template_builder.ts`'te iki dalda farklı
Proje Kodu etiketi ve kılavuz metni var; `faz-a` sürümünde 6b'ye ait ek not ("ağırlıksız kategoriye görev yazılamaz") da
duruyor. 6b'de iki dosyada da `faz-a` sürümü alınır; E13 doğrulama satırı `faz-a`'ya da eklendi.

**Kopya ("yeni kopya olarak yükle") yolu:** faz-a sürümü yeni kodu ayrı form alanından (`code`) bekliyor. Bu alan
`projectExcelBridge.js`'te gönderilmediği için (Karar 53, dosyaya dokunulmuyor) hotfix sunucusu şunu kabul eder:
- form alanı varsa onu, yoksa **E13'te yazan kod asıl projenin kodundan farklıysa** onu kullanır;
- aynıysa "Kopya için Excel'de E13'e yeni bir proje kodu yazın" der.

Aynı kural faz-a'ya da işlenir.

## 4. Deploy — nasıl yayına çıkıyor, sizin adımlarınız

Bilinen: repoda `vercel.json` var. CLAUDE.md geçmişine göre `main`'e her merge Vercel'de production deploy'u tetikliyor
("PR #15-#18 main'e merge edildi, her birinde production deploy doğrulandı"). Vercel paneline bakılarak **doğrulanamadı**.
Edge function'lar Vercel'le gitmez, ayrı deploy edilir (MCP `deploy_edge_function` ya da `supabase functions deploy`).
DB değişiklikleri `apply_migration` ile.

Sizin adımlarınız (P1 uygulandıktan, P2 kodunu onayladıktan sonra):
1. `C:\Users\fonss\OneDrive\Masaüstü\GES_Dashboard-hotfix` klasöründe dalı gözden geçirin (`git log`, `git diff main`).
2. Dalı gönderin: `git push -u origin hotfix/proje-ekleme`.
3. GitHub'da `main`'e Pull Request açın. Vercel önizleme adresi oluşursa sihirbazı ve Excel indirmeyi orada deneyin.
   Önizleme açık mı **doğrulanamadı**.
4. PR'ı `main`'e birleştirin. Vercel production deploy'u başlar; Vercel panelinde "Ready" görün.
5. Bana "P3 deploy" deyin. Edge function'ları deploy edip canlıda ROLLBACK'siz, test projesiyle uçtan uca deneriz.
   Test projesi sonra silinir; ayrıntısı o adımda gösterilir.
6. Ekip duyurusunu (§5) gönderin.

## 5. Ekip duyurusu (taslak)

> Proje Excel şablonu yenilendi (v8): Proje Bilgileri sayfasına **Proje Kodu (E13)** alanı eklendi. Eski Excel
> dosyalarıyla mevcut bir proje artık güncellenemez; önce projeyi Proje Yönetimi'nden **dışa aktarın** ve yeni indirilen
> dosya üzerinde çalışın. Yeni projede proje kodu zorunludur (harfle başlar, 2-5 karakter, ör. DYB).

## 7. P3 — edge function deploy ve uçtan uca test (14.10.2026 planı; "P3 deploy" ile uygulanır)

**Durum (14.10.2026):**
- **Ön yüz yayında:**
  - PR #36 (`916a421`) ve #37 (`01763a9`) `main`'e birleşti, Vercel production "success".
  - fonssolar.vercel.app'teki şablonun md5'i repo v8 ile aynı.
  - Canlı JS paketinde `create_project_with_code` var.
- **#37 ne düzeltti:** export çalışma kitabını `template_builder.ts` ile ürettiği için E13'ün etiketi yoktu. #37 etiketi, doğrulamayı ve v8 notunu ekledi; yerelde üretilip yeniden okunarak doğrulandı.
- **Edge function'lar deploy edildi:** `export-project-excel` v21 → **v22**, `import-project-excel` v22 → **v23** (ikisi de ACTIVE, `verify_jwt` true).
- **Doğrulananlar:** Oturum 0 ve sonrası veritabanı parmak izi aynı.
- **Henüz yapılmadı:** uçtan uca test T1-T12. Fonksiyonlar `verify_jwt` ile korunuyor; site yeni biçim anahtar (`sb_publishable_…`) kullanıyor. Girişsiz smoke test mümkün değil; test bir kullanıcı oturumu gerektiriyor (`.env.test` hesaplarının durumu bekleniyor).
- **Geri dönüş:** eski import v22 ve export v21 içerikleri `get_edge_function` çıktısında (bu oturum) ve `main`'in 468b224 sürümünde.

**Ön koşul:** hotfix `main`'e birleşti ve Vercel'de "Ready" (sitedeki şablon v8, sihirbazda Proje Kodu alanı var).
Durum (14.10): P1 ve Karar 89 canlıda; ADN1/ADN2 ağırlıkları PM onayı bekliyor (P3'ü etkilemez).

### 7.1 Deploy sırası
1. **Oturum 0 (salt okunur):** aktif bağlantı, parmak izi (projeler, kodlar, sayaçlar, ağırlıklar, bildirim sayısı), iki fonksiyonun canlı sürüm numarası (import 22).
2. **`export-project-excel`** (`index.ts` + `mapping.ts` + `template_builder.ts`, `hotfix/proje-ekleme` dalından). Önce bu,
   çünkü dışa aktarılan dosyalar E13'ü taşımazsa yeni import onları "eski şablon" diye reddeder. Eski import E13'ü yok
   saydığı için bu sıra bir şey kırmaz.
3. **`import-project-excel`** (`index.ts` + `mapping.ts`), birkaç dakika içinde.
4. Her deploy'dan sonra `get_edge_function` ile kodun dal dosyasıyla aynı olduğu kontrol edilir (`verify_jwt` aynı kalır: true).
5. **Geri dönüş:** sorun çıkarsa iki fonksiyon `main`'in eski sürümüyle (import v22 içeriği) yeniden deploy edilir. DB değişikliği gerekmez; `create_project_with_code` eski import'u etkilemez.

### 7.2 Uçtan uca test (canlı, yalnızca `zz-p3-*` test projeleri)
Test kimlikleri `.env.test`'teki hesaplar; değerler okunmaz, chat'e yazılmaz. Bu hesapların gerçek kişi mi test hesabı
mı olduğu hâlâ bilinmiyor: test sırasında kısa süre `zz-p3-*` projeleri bütün admin/PM'lerin proje listesinde görünür.
Bildirim üretmez (aşağıda). Adımlar Playwright (`PW_TARGET=live`, `faz-a` klasöründen, `tests/proje-ekleme-hotfix.spec.js`, P3'ten önce yazılır) ve MCP ile salt okunur kontroller.

| # | Adım | Beklenen |
|---|---|---|
| T1 | Admin: Proje Yönetimi › Manuel doldur; ID `zz-p3-admin`, kod `ZZPA`, 1 görev (kategori `kolon_montaji`), ağırlık adımı varsayılan, **Tedarik işaretlenmeden**, Bütçe atlanır, Kaydet | Proje + `project_register_settings` = ZZPA; `procurement_completed` false; ağırlıklar görev kategorisine göre; hata yok |
| T2 | PM: aynı akış, `zz-p3-pm`, kod `ZZPP` | Proje açılır (eskiden RLS hatası); kod ZZPP |
| T3 | Sihirbaz kod hatası: kod `1AB` ve kullanılan kod `TIZ` | Adım 1'de biçim hatası; `TIZ` için son adımda "Bu proje kodu başka bir projede kullanılıyor"; proje oluşmaz |
| T4 | Excel v8 yeni proje: siteden şablon indir, E5 `zz-p3-excel`, E6 ad, E13 `ZZPE`, 2 görev; ikinci görevin Notlar (M) hücresi iki satır: "Öncül: P1" ve "Test notu" → Yeni Proje | Proje + kod ZZPE; 15 varsayılan ağırlık (Karar 89); görevler yazıldı; **ikinci görevin `project_tasks.notes`'u hücreyle birebir (öncül ve not veritabanında, Karar 92)** |
| T5 | Excel v8 eksik kod: E13 boş yeni proje | "Proje kodu zorunludur (Proje Bilgileri, E13)"; proje oluşmaz |
| T6 | Eski v7 dosyası: `main`'in eski şablonuyla (E13 yok) `zz-p3-excel` → çakışma penceresi → "Mevcut projeyi güncelle" | "Bu dosya eski şablon (v7). Projeyi dışa aktarıp yeni dosya üzerinde çalışın."; hiçbir şey yazılmaz |
| T7 | E13 uyuşmazlığı: `zz-p3-excel` dışa aktar, E13'ü `ZZPX` yap, güncelle | "Proje kodu degistirilemez: Excel'de ZZPX, projede ZZPE"; hiçbir şey yazılmaz |
| T8 | Doğrulama: dışa aktarılan dosyada bir görevin durumunu `bitti` yap, güncelle | "Excel'de 1 hata var, hiçbir şey kaydedilmedi: İş Kalemleri satır …"; görevler değişmez |
| T9 | Dışa aktarma: `zz-p3-excel` dışa aktar | E13 = ZZPE |
| T10 | Rol: test şantiye şefi oturumuyla import fonksiyonuna doğrudan güncelleme isteği (`zz-p3-excel`; Karar 90, muhasebe test hesabı yok) | 403 "Proje güncelleme yetkiniz yok." |
| T11 | RFI: rehber §4.4 şablonu, proje kodu `ZZPA` (MCP, gerçek ekleme) | Numara `RFI-ZZPA-0001` |
| T12 | Temizlik: `delete from projects where id like 'zz-p3-%'` (MCP; kod, sayaç, ağırlık, görev, RFI, durum geçmişi CASCADE) | `zz-p3-*` ve bağlı satır 0; parmak izi Oturum 0 ile aynı (bildirim sayısı dahil) |

**Bildirim:** senaryoda bildirim üreten adım yok.
- Proje oluşturma, görev, ağırlık, RFI ve proje silme bildirim trigger'ı tetiklemez (14.10 katalog listesi: bildirimler
  günlük rapor, fatura, satın alma, ticket ve ilerleme girişinden).
- Tedarik onayı (`set_project_procurement_completed`) bildirim üretmese de istendiği gibi senaryoda yok (T1/T2'de işaretlenmez).
- Satın alma, Malzeme Listesi ve Bütçe sayfaları Excel'de boş bırakılır.
- Görevlerin plan tarihleri gelecekte seçilir, böylece otomatik risk motoru gecikme riski açmaz.

**Durma kuralı:** beklenmeyen sonuçta durulur. Test projeleri yine T12 ile temizlenir; temizlik silme olduğu için önce
sorulur. Fonksiyon geri dönüşü (7.1/5) de onayla yapılır.

### 7.3 `.env.test` hesap kontrolü (14.10.2026)
`.env.test` yalnızca bu karşılaştırma için okundu (kullanıcı izni). E-postalar ekrana yazılmadı: tuzlu SHA-256 özeti
canlı `auth.users` ile eşleştirildi.
- **admin:** gerçek. Genel "Admin" hesabı, kişiye ait değil ama ortak işletim hesabı (Karar 64).
- **pm:** test hesabı ("TEST PROJE YÖNETİCİSİ").
- **muhasebe:** gerçek kişi.

Bu yüzden T1-T12 başlamadı. **Karar 90:** test admin hesabını kullanıcı Kullanıcılar sayfasından açar ve `.env.test`'e
kendisi yazar; muhasebe test hesabı açılmaz, T10 test şantiye şefiyle yapılır. T1-T12, kullanıcı haber verince ve
Notlar düzeltmesi (Karar 92) deploy edildikten sonra koşulur. Test geçmeden Diyarbakır import'u yapılmaz.

### 7.4 Dal tabanı (14.10.2026, `git merge-tree`, diske yazılmadı)
- **`faz-a-proje-kontrol`:** taban `938e0d3`; `origin/main` 10 commit ileride (PR #31-37). Çakışma yalnızca
  `Adim8Tamamlandi.jsx` ve `export-project-excel/template_builder.ts` (6b listesi değişmedi). Kullanıcının 8
  commit'lenmemiş dosyası `main` tarafında değişmemiş.
- **`faz-2-3-register`:** taban `468b224` (bayat); `origin/main` 86 commit ileride. Çakışma yalnızca `CLAUDE.md`. Dalın
  CLAUDE.md'si `faz-a`'dan alındığı için `main`'in 938e0d3'e kadarki içeriğini zaten taşıyor; `main`'in CLAUDE.md'si
  938e0d3'ten beri değişmedi. `package.json` dalda değişmediği için birleşmede `main`'inki (exceljs, react-router v7) gelir.

## 6. Kategori ağırlıkları (P4) — öneri, değerler sizin onayınızda

**Bugünkü varsayılan** (yeni projeye DB trigger'ı `fn_seed_default_category_weights` ve Excel import'u
`CANONICAL_CATEGORY_WEIGHTS` yazar; ikisi aynı):

| Kategori | % |
|---|---|
| kolon_montaji | 10 |
| kiris_montaji | 10 |
| asik_montaji | 10 |
| panel_montaji | 20 |
| elektrik_dc | 10 |
| elektrik_ac | 10 |
| elektrik_og | 10 |
| kosk_trafo | 5 |
| topraklama | 5 |
| devreye_alma | 10 |
| **Toplam** | **100** |

**Canlıda görevlerde kullanılan ama listede olmayanlar** (14.10.2026):

| Kategori | Görev | Proje | İlerlemesi olan görev |
|---|---|---|---|
| mobilizasyon | 23 | ADN1, ADN2, TIZ, TKY | 10 |
| satin_alma | 13 | ADN2 | 0 |
| evrak_sureci | 9 | ADN2 | 2 |
| enh | 7 | ADN1, ADN2, TIZ, TKY | 1 |
| mekanik | 6 | ADN2 | 0 |

Not: manuel sihirbazın Kategori Ağırlıkları adımı yeni projede görevlerin kategorilerinden eşit dağıtımla başlar; varsayılan
liste yalnızca o adım atlanırsa ve Excel'le açılan projede geçerli. Sihirbazın yeni görev varsayılanı `mekanik`.

**Öneri** (15 kategorinin hepsi, toplam 100):

| Kategori | Bugün | Öneri | Fark |
|---|---|---|---|
| kolon_montaji | 10 | 10 | 0 |
| kiris_montaji | 10 | 8 | -2 |
| asik_montaji | 10 | 7 | -3 |
| panel_montaji | 20 | 17 | -3 |
| mekanik | — | 5 | +5 |
| elektrik_dc | 10 | 10 | 0 |
| elektrik_ac | 10 | 10 | 0 |
| elektrik_og | 10 | 8 | -2 |
| kosk_trafo | 5 | 5 | 0 |
| topraklama | 5 | 5 | 0 |
| enh | — | 7 | +7 |
| devreye_alma | 10 | 8 | -2 |
| mobilizasyon | — | 0 | fiziksel değil |
| evrak_sureci | — | 0 | fiziksel değil |
| satin_alma | — | 0 | fiziksel değil |
| **Toplam** | **100** | **100** | |

- Gerekçe: ENH (enerji nakil hattı) ve genel mekanik iş fiziksel imalat olduğu için ağırlık alır. Bu 12 puan, montaj ve
  OG/devreye alma kalemlerinden orantılı kesilerek karşılandı. %0'lı kategoriler listede durur, böylece "ağırlıksız
  kategori" sayılmazlar (6b'deki Karar 56 kuralı bunları reddetmez).
- **Kapsam:** yalnızca bundan sonra açılan projeler. Mevcut 4 projenin ağırlıkları değişmez. ADN1/ADN2 için ayrı karar
  gerekir; "Bilinen açık noktalar"daki kategori ağırlığı maddesi.
- Değerleri onaylarsanız trigger migration'ı ve `mapping.ts` değişikliği ayrıca gösterilir.
