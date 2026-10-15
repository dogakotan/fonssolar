# Faz 1 · Adım 5 — Yerel test ortamı ve baseline migration önerisi

Tarih: 12.10.2026; güncelleme 13.10.2026.
Kararlar:
- Karar 52: yerel Docker; Playwright varsayılan hedefi yerel.
- Karar 53: kullanıcının üç dosyası (`ProjeDetay.jsx`, `DailyReportList.jsx`, `projectExcelBridge.js`) beklemede.
- Karar 61: baseline migration **ertelendi** (Faz 1 kapandıktan sonra, Faz 2'den önce ayrı paket). Yerel ortam şimdilik yalnızca şema dökümüyle kurulur.
- Karar 62: DEFINER RPC'ler için yetki matrisi testi zorunlu (§2.1).

Durum:
- Kurulum betikleri yazıldı ama **çalıştırılmadı**. Bu makinede Docker yok; kullanıcı kuracak.

## 1. Kullanıcı adımları (sırayla)

1. **WSL2 ve Docker Desktop:**
   - Kurulum: `faz1-adim5-tasarim.md` §0.4.
   - Doğrulama: `docker run hello-world`.
2. **Şema dökümü:**
   - `npm run db:backup` çalıştırılır. Çıktı `scripts/db-backup/backups/dump_*.sql`; yalnızca şema, veri yok.
   - Bu betik `.env.local`'ı kendisi okur; ben okumam.
3. Haber verirsiniz.

## 2. Benim adımlarım (haber gelince)

```
node scripts/local-db/setup.mjs --no-drafts   # kalibrasyon: taban + referans + tohum, taslaksız
npm run test:e2e                              # mevcut suite yerelde (varsayılan hedef artık yerel)
node scripts/local-db/setup.mjs               # taslaklar Adım 6 sırasıyla + Adım 5
psql … -f docs/proje-kontrol/taslak-sql/f1_dogrulama.sql   # R1-R32; 'DOGRULAMA SONUCU: OK' ile biter, geri alınır
npm run test:e2e                              # mevcut suite + Adım 5 testleri (yetki matrisi dahil)
```

Herhangi bir adımda fark çıkarsa raporlanır ve durulur.

### 2.1 Yetki matrisi (zorunlu, Karar 62)

Kapsam: Ek B'de DEFINER olarak onaylanan ve aynı yolu kullanan yazma RPC'leri:

| İş | RPC | Güvenlik |
|---|---|---|
| Toplu atama | `set_tasks_classification` | DEFINER |
| Görev kaydı (sihirbaz) | `save_project_tasks` | DEFINER |
| Alan-WBS bağ kaydı | `save_area_wbs_links` | INVOKER (RLS); aynı üç kontrol uygulanır |
| Kod ata | `assign_activity_ids`, `assign_activity_id` (sarmalayıcı) | DEFINER |
| WBS/alan import | `import_wbs_areas` | DEFINER |

Her biri için üç kontrol:

1. **anon EXECUTE yok** (authenticated var): katalogda `has_function_privilege` (`f1_dogrulama.sql` R32 a) ve API'den anon anahtarla çağrı reddi (`proje-kontrol-adim5.spec.js` "yetki matrisi").
2. **Şantiye şefi ve muhasebe çağıramaz:** `forbidden` (R32 b; spec aynı test).
3. **A projesinin PM'i B projesine yazamaz:** R32 c.
   - **Çakışma Ç5-7:** PM canlıda `cross_project=true`; `has_project_access` PM'e her projede true döner. Bu yüzden test, kendi alt işleminde `cross_project=false` yapıp PM'e yalnızca A için `user_project_access` verir. Beklenen: B'de 4 RPC `forbidden` + "Bu projeye erişim yetkiniz yok", `save_area_wbs_links` `not_found` (INVOKER; RLS B'nin WBS'ini gizler), B'deki bağ sayısı değişmez; A'da yetki geçilir. Alt işlem geri alınır, `roles` satırı değişmez (R32 bunu da kontrol eder).
   - API düzeyinde (Playwright) bu ölçülemez: PM'in erişimi model gereği tüm projeler.

**Doğrulanamayanlar** (ilk koşuda görülecek): anon çağrısındaki PostgREST hata kodu (42501 bekleniyor); `import_wbs_areas`'ın boş yükle önizlemesinin sonucu (R32 yetki geçildiyse `validation` da kabul edilir).

- **Supabase CLI:** `node_modules`'ta varsa onu kullanır, yoksa `npx supabase@latest`. Kalıcı olması için `npm i -D supabase` öneriyorum (`package.json` değişir).
- **Yığın:** `supabase/local/stack` çalışma dizininden başlar: proje kimliği `fons-local`, portlar 55321-55324 (kökteki config'ten ayrı).
  - Bu dizinde migration yok, çünkü kök `supabase/migrations` sıfırdan kurulamıyor (§3).
  - Taban, referans veri, taslaklar ve tohum psql ile veritabanı konteynerine (`supabase_db_fons-local`) yüklenir.
- **Referans veri** (`supabase/local/reference_data.sql`), şema dökümünün almadığı parçalardır:
  - `auth.users` üzerindeki `on_auth_user_created` tetikleyicisi (auth şeması döküme girmez);
  - `roles`, `role_allowed_tabs`, `role_sidebar_items` satırları;
  - üç storage bucket'ı.
  - Hepsi 12.10.2026'da canlıdan salt okunur SELECT ile alındı; kişisel veri yok.
- **Tohum** (`scripts/local-db/seed.mjs`), tamamen kurgu:
  - **Kullanıcılar:** admin, proje yöneticisi, İzmir şantiye şefi, muhasebe. Ayrıca onaylayıcı yönlendirme testleri için iki admin; bunların kimlikleri canlıdaki fonksiyon gövdelerinde sabit. Şifreler rastgele, yalnızca `supabase/.local/` (gitignore).
  - **Projeler:** İzmir (`test-izmir-ges-2026`, TIZ) ve Kayseri (`test-kayseri-develi-ges`, TKY).
  - **İzmir görevleri:** 11 görev. `group_label` hiyerarşili (`Mekanik Bölüm › Blok 1`, `Elektriksel Bölüm › Inverter-1 › DC`). 4 görevde günlük rapor ilerlemesi var; bu, Karar 59'daki zorunlu "ilerlemeli ve grup etiketli düzenleme" testinin verisi.
  - **WBS/alan:** WBS, alan ve bağlar şablondaki kurgu yapıyla.
  - Yalnızca varsayılan ağırlıklı kategoriler kullanılır, böylece Karar 56 trigger'ı açıkken de geçerli.
- **Playwright** (`playwright.config.js`):
  - **Varsayılan hedef yerel.**
    - `supabase/.local/env.json` yoksa açık bir hatayla durur; canlıya düşmez.
    - Yerel adres dışında bir URL görürse durur.
    - Vite 5183 portunda, ayrı süreçte çalışır; mevcut sunucuyu yeniden kullanmaz. Arka planda canlıya bağlı bir dev sunucusu açık olabilir.
  - **Canlıya karşı koşum:** yalnızca `PW_TARGET=live` ile; eski davranış.
  - **Not:** DB'siz saf testler (ör. `proje-kontrol-wbs-alan-excel.spec.js`) de yerel ortam hazır olmadan koşmaz. İstenirse bunlar için ayrı bir proje tanımı eklenir.

**Doğrulanamayanlar** (ilk kurulumda görülecek):
- `supabase db dump` çıktısının boş bir yerel veritabanına hatasız yüklenip yüklenmediği (uzantılar, sahiplik, `storage` policy'leri);
- `supabase status -o json` alan adları;
- `auth.admin.createUser`'ın sabit `id` kabul edip etmediği.

Sorun çıkarsa duracağım ve raporlayacağım.

## 3. Baseline migration önerisi — **ERTELENDİ (Karar 61, 13.10.2026)**

**Zamanlama:** Faz 1 kapandıktan sonra, Faz 2'den önce ayrı paket. Şimdi uygulanmaz; yerel ortam yalnızca şema dökümüyle kurulur (§2).

**O paketin ilk adımı (dosya oluşturmadan önce gösterilir):**
- canlıya migration'ların bugüne kadar hangi yollarla uygulandığı (MCP `apply_migration`, SQL editörü, CLI; tracking boşluğu bulgularıyla);
- canlının `supabase_migrations.schema_migrations` geçmişinin baseline ile nasıl uzlaştırılacağı (ör. `supabase migration repair`; canlıya yazma olduğu için ayrı onay ve yedek hatırlatmasıyla). Aşağıdaki 5. maddedeki "repair çalıştırılmaz" varsayımı o pakette yeniden değerlendirilir.

Aşağıdaki metin 12.10.2026 önerisidir; paket başladığında güncellenir.

**Sorun:** `supabase/migrations` (425 dosya) veritabanını sıfırdan kuramıyor.
- İlk dosya `projects` ve `profiles` tablolarına dayanıyor; bu tabloları kuran migration yok, temel şema migration geçmişinden önce.
- Ayrıca 13 müşteri verisi migration'ı bilinçli olarak yok.
- Bu yüzden `supabase db reset` ilk dosyada düşer.

**Öneri:** canlı şema dökümünü, temizlenmiş haliyle, repoda tek bir baseline migration yapmak.

1. **Kaynak:** kullanıcının aldığı `npm run db:backup` dökümü. Yalnızca şema: tablolar, kısıtlar, indeksler, fonksiyonlar, trigger'lar, RLS, görünümler, yetkiler.
2. **Temizlik (otomatik tarama + elle gözden geçirme):** dosya taranır, bulgular raporlanır, gerekenler çıkarılır veya maskelenir.
   - e-posta deseni;
   - JWT/anahtar deseni (`eyJ…`, `sb_…`, `service_role` değeri);
   - şifreli bağlantı adresi;
   - `ALTER ROLE … PASSWORD`;
   - vault sırları;
   - yorumlarda kişi adları.
   - Fonksiyon gövdelerindeki iki sabit kullanıcı UUID'si iş kuralının parçası (onaylayıcı yönlendirmesi); kimlik bilgisi değil. Ayrıca sizin onayınıza sunulur.
   - **Veri satırı yok.** Müşteri verisi (Kaptan Demir WBS/plan) baseline'a girmez; 15.09.2026 kararı korunur.
3. **Ek parçalar:** `reference_data.sql`'deki auth tetikleyicisi, roller/navigasyon ve bucket'lar (yapılandırma verisi). Döküme girmediği görülürse storage policy'leri de eklenir.
4. **Dosya düzeni:**
   - `supabase/migrations/20261012000000_baseline_schema.sql`: canlıdaki son uygulanmış migration'dan (20261007072501) sonraki durum.
   - Mevcut 425 dosya `supabase/migrations_arsiv/` altına taşınır (git geçmişi korunur; CLI bu klasörü okumaz).
   - Sonraki Faz 1 migration'ları (Adım 6) baseline'dan sonra gelir.
5. **Canlıya etkisi yok:**
   - Canlıya migration'lar MCP `apply_migration` ile uygulanıyor; `supabase db push` kullanılmıyor.
   - Canlının `schema_migrations` tablosuna dokunulmaz; `migration repair` çalıştırılmaz (canlıya yazmak olurdu).
   - Repo ile canlı tracking tablosu arasındaki sürüm farkı bugün de var (CLAUDE.md "Migration tracking boşluğu"), yeni bir risk değil.
   - **Kural:** bu repoda `supabase db push` ve `supabase link` + `migration repair` kullanılmaz; README'ye yazılır.
6. **Doğrulama:**
   - Yerelde `supabase db reset` (kök config ile) çalıştırılır. Parmak izinin katalog kısmı (`taslak-sql/parmak_izi.sql`: fonksiyon, kısıt, trigger, indeks, policy, görünüm, yetki md5'leri) canlıyla karşılaştırılır; birebir olmalı.
   - Fark çıkarsa raporlanır.
7. **Sonuç:**
   - `setup.mjs` sadeleşir: `supabase db reset` + taslaklar + tohum. Ayrı yığın dizini gerekmez.
   - CI'da da aynı komut çalışır.
8. **CLAUDE.md'nin değişecek iki kuralı:**
   - "`supabase/migrations/` canlıya uygulanan SQL'in birebir aynısı" kuralı: baseline öncesi dosyalar artık arşivde.
   - Migration tracking boşluğu maddesine baseline notu eklenir.

**Onaydan sonra sıra:**
1. dökümü tarayıp bulgu raporunu göstermek;
2. onayınızla dosyayı oluşturup arşiv taşımasını yapmak;
3. yerel `db reset` ve parmak izi karşılaştırması;
4. commit (push yok).
