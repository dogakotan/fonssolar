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
