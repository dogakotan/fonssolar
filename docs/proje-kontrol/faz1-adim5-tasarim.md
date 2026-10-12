# Faz 1 · Adım 5 — Ekranlar, sihirbaz düzeltmesi ve test ortamı (tasarım)

Tarih: 12.10.2026. Durum:
- Tasarım onaylandı (Karar 52-59).
- Kod yazıldı ama test edilmedi; yerel ortam bekleniyor (Ek B).
- Canlıya ve edge function'lara hiçbir şey uygulanmadı.
- §9'daki sorular kararlarla kapandı. Yeni açık: Ç5-6 (Ek B).

Kararlar: CLAUDE.md Karar 18-59. Önceki adımlar: `faz1-adim3-tasarim.md`, `faz1-adim4-tasarim.md`.
Kaynak tarama (12.10.2026):
- repo kodu (satır numaralarıyla aşağıda);
- canlıda salt okunur SELECT:
  - `project_tasks` (project_id, task_code) UNIQUE indeksi var, boş kod 0, tekrar 0;
  - `project_wbs`/`project_areas`/`area_wbs` policy listesi.

## Kural 8 — çelişkiler ve onay gereken noktalar (önce)

| # | Konu | Çelişki | Öneri |
|---|---|---|---|
| Ç5-1 | Günlük rapor listesinde iptal filtresi | Görev sorgusu, sizin commit'lenmemiş dosyanız `src/pages/DailyReportList.jsx` içinde (Excel export, satır ~265). "8 dosyama dokunma" kuralı | Bu dosyadaki tek satırlık değişikliği siz yapın ya da izin verin. `DailyReportForm.jsx` (İlerleme Girişi) sizin listenizde değil, orada yapılabilir |
| Ç5-2 | "Kopya olarak yükle" yeni kod ister | İstemci köprüsü `src/utils/projectExcelBridge.js` de sizin commit'lenmemiş dosyanız; `code` alanını göndermesi gerekiyor | Aynı: izin veya değişikliği sizin yapmanız |
| Ç5-3 | İptal et yalnızca admin/PM | Karar 44 "iptal etmeye dokunulmaz" dedi. Bugün şantiye şefi `project_tasks` UPDATE RLS'iyle görevi API'den iptal edebiliyor; yalnızca yeniden açma korunuyor | Ekranda yalnızca admin/PM görür. DB'de de kısıtlansın mı? Kısıtlanırsa A8b trigger'ı iptal etmeyi de kapsar (Karar 44 değişir) |
| Ç5-4 | Kod ata 500'lük parçalar | Karar 41 "çağrı başına 500, hepsi ya da hiçbiri". Birden fazla parça ayrı işlemlerde yazılır: 2. parça hata verirse 1. parça yazılmış kalır | Öneri: tek "Kod ata" işleminde en fazla 500 görev seçilebilsin (§2.4). Seçenek: sırayla parçalar, ilk hatada dur, rapor |
| Ç5-5 | Ç-6 şantiye şefi yalnızca okuma | Canlı RLS şantiye şefine `project_areas` insert/update ve `area_wbs` insert/delete veriyor (G-01'de bilinçli dışarıda bırakılmıştı: "WBS/Alan ekranı doğrudan yazacak") | Görüşüm aşağıda (§1.5). Uygulanırsa küçük bir RLS migration'ı gerekir; Adım 4 T32/T33'teki şantiye şefi satırları değişir |

## 0. Test ortamı

### 0.1 Bugün Playwright neye karşı koşuyor

- **Hedef:** `playwright.config.js`, `.env.test`'i yükler. `baseURL` = `BASE_URL` ya da `http://localhost:5173`. `webServer` olarak `npm run dev` çalışır (mevcut sunucu yeniden kullanılır); tek worker.
- **Hangi Supabase projesi:** Vite'ın `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` değişkenlerinden okunur.
  - `.env` dosyaları okunmadığı için **doğrulanamadı**.
  - Repoda ikinci bir proje ya da yerel yığın tanımı yok. CLAUDE.md "Test ortamı" bölümü, testlerin canlıdaki iki test projesini (TIZ, TKY) ve 5 profili kullandığını söylüyor. Yani pratikte **canlıya** karşı koşuyor.
- **Veri yazımı:** 35 spec'in 26'sı kullanıcı oturumlarıyla canlıya yazıyor (insert/update/delete/RPC) ve `afterAll`'da temizliyor. Service role kullanan test yok.
- **Sorun:**
  - Yeni ekranlar canlıda olmayan nesneleri kullanacak: B1/B2/B4/F1/AID/Adım 4 tabloları, RPC'leri ve kolonları.
  - Bu ekranlar canlıya karşı test edilemez. Önce migration'ları uygulayıp sonra test etmek, Karar 31'e ("Faz 2'den itibaren lokal Docker testi zorunlu") ve "önce test" ilkesine ters.

### 0.2 Engel: migration klasörü sıfırdan şema kuramıyor

- `supabase/migrations` 425 dosya içeriyor. Ama ilk migration (`20260616125943_create_daily_reports.sql`) `projects` ve `profiles` tablolarına başvuruyor ve bu tabloları kuran bir migration yok: temel şema migration geçmişinden önce.
- Ayrıca 13 müşteri verisi migration'ı bilinçli olarak yok (CLAUDE.md, kalıcı karar).
- **Sonuç:** `supabase db reset` ilk dosyada düşer. Yerel ortamın tabanı canlı şemanın dökümü olmalı.

### 0.3 Önerilen plan: yerel Supabase (Docker) + canlı şema dökümü

1. **Taban:**
   - `npm run db:backup` (zaten var, `.env.local` ister) yalnızca şema dökümü üretir. Bu dökümde veri yok; fonksiyon gövdeleri ve RLS dahil.
   - Döküm `supabase/.local/` altında gitignore'lu tutulur (her yenilemede büyük diff üretmesin).
   - Bağlantı adresi çıktıya yazılmaz.
2. **Yığın:** `supabase start` (Docker), tabanı yükle.
3. **Faz 1 taslakları:** Adım 6 sırasıyla yerel veritabanına uygulanır: B1 → B2 → B4 → F1 A1-A3 → AID → Adım 4 → Adım 5'in yeni DB parçaları (§2, §3, §5). Bu, Adım 6 provasının yerel hali de olur.
4. **Tohum veri:** `scripts/local-db/seed.mjs`. Yalnızca yerel, kurgu veri:
   - 4 rolün auth kullanıcısı yerel service role ile oluşturulur;
   - profiller;
   - iki proje (TIZ benzeri ve TKY benzeri);
   - ilerlemeli görevler, kategori ağırlıkları, WBS/alan şablonu (`docs/proje-kontrol/sablon/`).
   - Canlıdan veri kopyalanmaz.
5. **Vite ve Playwright:**
   - `npm run dev -- --mode localdb` yalnızca yerel adres ve yerel anon anahtarı okur. Yerel anahtarlar Supabase'in herkese açık varsayılanlarıdır, yine de `.env.localdb` gitignore'da kalır.
   - Playwright `PW_TARGET=localdb` ile o dosyayı yükler.
   - Mevcut `.env.test` akışı değişmez.
6. **Edge function:** `supabase functions serve import-project-excel` yerelde. Canlıya deploy yalnızca Adım 6'da ve onayla.
7. **Kalibrasyon:** Önce mevcut suite, yalnızca taban + tohum üzerinde koşulur; taslaklar uygulanmaz.
   - Veriye bağımlı testler (Kaptan Demir projesi, Osman Karadoğan hesabı gibi) burada ayrıştırılır. Bunlar ya tohuma eklenir ya da `localdb`'de atlanır.
   - Bu liste "beklenen fark" olarak yazılır. "Mevcut suite yeşil" ölçütü bu kalibre edilmiş listeye göre okunur.

### 0.4 Sizden gerekenler (Docker kurulumu)

Bu makinede kontrol edildi (12.10.2026): `docker` yok, `supabase` CLI yok (global de, `npx` içinde de değil).

1. **WSL2'yi açın.** Yönetici PowerShell'de `wsl --install` çalıştırıp yeniden başlatın. Windows 11 Home'da Docker Desktop WSL2 ile çalışır.
2. **Docker Desktop'ı kurun** (docker.com, Windows, WSL2 arka ucu).
   - İlk açılışta lisans koşullarını kendiniz değerlendirin: küçük işletmeler için ücretsiz, büyük kuruluşlarda ücretli. Fons'un durumu **doğrulanamadı**.
   - Doğrulama: `docker run hello-world`.
3. **Kaynak:** Supabase yığını yaklaşık 2-4 GB RAM ve 5-10 GB disk kullanır (yaklaşık değerler; **doğrulanamadı**). Docker Desktop ayarlarında en az 4 GB bellek önerilir.
4. **Supabase CLI:** benim önerim projeye geliştirme bağımlılığı olarak eklemek (`npm i -D supabase`, `package.json` değişir; onayınızla). Alternatif: scoop ile global kurulum.
5. **Şema dökümü:** `.env.local` sizde. `npm run db:backup`'ı siz çalıştırın ya da çalıştırmam için açık izin verin; dosya içeriğini okumam gerekmez.

### 0.5 Alternatif: ayrı bir Supabase projesi (bulut)

| | Yerel Docker (öneri) | Ayrı bulut projesi | Supabase branching |
|---|---|---|---|
| Maliyet | 0 (Docker Desktop lisansı kurum büyüklüğüne bağlı) | Free planda organizasyon başına 2 aktif ücretsiz proje sınırı. Boş yer olup olmadığı **doğrulanamadı** (başka bir proje görüldü, aynı organizasyonda mı bilinmiyor). Pro'da proje başı ek hesaplama ücreti (yaklaşık 10 $/ay; **doğrulanamadı**, fiyat sayfası kontrol edilmeli) | Pro gerektirir |
| Taban | Canlı şema dökümü | Aynı döküm buluta yüklenir | Migration geçmişinden kurar: §0.2 yüzünden **çalışmaz** |
| Risk | Makineye bağlı; Docker kurulumu | Test kullanıcıları ve anahtarları bulutta (sızıntı yüzeyi). Free proje 1 hafta işlemsizlikte duraklar. Canlıyla karışma riski (yanlış URL). Edge function'lar ayrıca deploy edilir | — |
| Hız / çevrimdışı | Hızlı, çevrimdışı | Ağa bağlı | — |
| CI ile kullanım | Docker'lı CI gerekir | Kolay | — |

**Öneri:** yerel Docker. Bulut projesi ancak Docker kurulamazsa ikinci seçenek.

## 1. Proje ayarları › WBS ve Alanlar

### 1.1 Yer

- Bugün proje ayarları ekranı yok. `ProjeDetay.jsx`'in 7 sekmesi: Genel Proje, İş Planı, Satın Alma, Finans, Ticket, Raporlar, Ekip.
- **Öneri:** yeni bir "Proje Ayarları" sekmesi; ilk alt sekmesi "WBS ve Alanlar".
  - İleride proje kodu ve kategori ağırlıkları görünümü de buraya gelir.
  - Ayrı üst seviye sidebar ekranı açılmaz (hafıza notu: önce mevcut ekrana alt sekme).
- **Görünürlük:**
  - Proje erişimi olan herkes görür.
  - Yazma yalnızca admin ve proje yöneticisi (§1.5).
  - Muhasebe ProjeDetay'a zaten ulaşamıyor (`projeler` sekmesi yok).

### 1.2 Görünüm

- **Sol: WBS ağacı.**
  - Koda göre sıralı (Karar 46), seviyeye göre girintili.
  - Her satırda kod, ad, disiplin, görev sayısı ve Activity ID'li görev sayısı.
  - Pasif kayıtlar gri; "Pasifleri göster" anahtarı.
- **Sağ: alan listesi.** Üst alana göre ağaç; alan tipi, aynı sayaçlar, pasifler gri.
- **Alt panel, alan-WBS eşleştirme:** bir WBS seçilince alanlar onay kutusu listesi olarak görünür.
  - Doğrudan bağlar işaretli.
  - Üst WBS'ten gelen bağlar gri ve işaretli, değiştirilemez; "TIZ-200 üzerinden" açıklaması var.
  - "Etkin küme" satırı Karar 38'in görevlere uygulayacağı alan listesini gösterir.
  - Hiç bağ yoksa "Bağ tanımsız: bu WBS'te her alan kullanılabilir" yazar.
- **Ekle / Düzenle modali.**
  - **WBS alanları:** kod, ad, üst, disiplin (`task_disciplines`'ten), not, aktif.
  - **Alan alanları:** kod, ad, tip, üst, not, aktif.
  - **Kod alanı:** görevi olan kayıtta kilitli. Kilit simgesi ve "Bu kodu kullanan N görev var; kod değiştirilemez" açıklaması.
  - **Üst değişikliği:** Activity ID'li görev etkileniyorsa kilitli.
  - **Silme düğmesi yok** (istenmedi). Silme yalnızca proje silinirken olur.
- **Yazma yolu:** doğrudan tablo yazımı (RLS + Adım 4 trigger'ları zorunlu kılar; G-01 notu). Her işlem tek satırdır; çoklu tablo yazan işlem yok.
  - Eşleştirme kaydı bir istisna: bir WBS'in onay kutuları birden çok satır ekler/siler. Atomik olsun diye `save_area_wbs_links(p_wbs_id, p_area_ids uuid[])` RPC'si önerilir (SECURITY INVOKER: RLS ve trigger'lar aynen çalışır).

### 1.3 Excel içe aktarma akışı

1. "Şablonu indir" (`buildTemplateWorkbook`) ve "Excel yükle".
2. **Dosya seçilir:** `parseWbsAreaWorkbook` istemcide okur. Sayfa veya başlık hatası varsa (`sheet_missing`, `header_mismatch`) RPC çağrılmadan gösterilir.
3. **Önizleme:** `import_wbs_areas(proje, payload, true)`. Rapor panelinde:
   - özet kartları (WBS / alan / bağ × ekle-güncelle-değişmez-hata);
   - **hata tablosu:** sayfa, Excel satırı, Türkçe kural açıklaması, ayrıntı. Kural kodları `wbs-alan-sablonu.md`'deki tabloyla birebir;
   - **`aid_impact` tablosu:** satır, Activity ID, açıklama. Başlık: "Bu değişiklikler Activity ID'li görevleri etkiliyor; import engellenir";
   - **`not_in_file`:** "Dosyada olmayan kayıtlar silinmez", liste;
   - güncellenecek satırlarda değişen alanlar.
4. "Onayla ve içe aktar" düğmesi yalnızca `error_count = 0` ve `aid_impact_count = 0` iken açık. Gerçek çağrı yapılır, `written` özeti gösterilir, ağaç yenilenir.
5. Önizlemeden sonra başka biri yazmışsa gerçek çağrı farklı sonuç verebilir; bu durumda rapor yeniden gösterilir.

### 1.4 Hata mesajları (trigger → kullanıcı)

- Yeni `src/utils/wbsAreaErrors.js` kural listesi, mevcut `src/utils/errors.js` `toUserMessage` deseniyle.
- Trigger mesajları zaten Türkçe; kurallar yalnızca "ne yapmalı" cümlesini ekler.

| Trigger mesajı (başı) | Kullanıcıya |
|---|---|
| `Kullanımdaki WBS/alan kodu değiştirilemez` | "Bu kodu kullanan görevler var. Yeni kodla yeni kayıt açın, eskisini pasifleştirin." |
| `Activity ID'li görevin … pasifleştirilemez` | "Bu kayıtta Activity ID'li görev var (ilk 5 ID). Önce görevleri başka alana/WBS'e taşıyın (admin düzeltmesi) veya iptal edin." |
| `… taşınamaz` | "Activity ID'li görevi olan kayıt başka üste taşınamaz." |
| `… silinemez` | "Activity ID'li görevi olan kayıt silinemez." |
| `Alan-WBS bağı eklenemez` | "Bu bağ, bazı Activity ID'li görevlerin alanını izin verilen kümenin dışında bırakır. Önce o görevlerin alanını da bağlayın." |
| `Alan-WBS bağı kaldırılamaz` | "Bu bağ kaldırılırsa Activity ID'li görevlerin alanı kümeden çıkar." |
| `Aktif alt … pasifleştirilemez` | "Önce alt kayıtları pasifleştirin." |
| `Üst … pasifken alt … aktif olamaz` | "Üst kayıt pasif; önce üstü aktifleştirin." |
| `… kendi alt dalına taşınamaz` | "Bir kayıt kendi altına taşınamaz." |
| `Activity ID'li görevin alanı (…) yeni WBS'e …` (Karar 51) | "Görevin alanı bu WBS'e bağlı değil. Bağı ekleyin ya da bağlı bir WBS seçin." |
| RLS / 42501 | "Bu işlem için yetkiniz yok." (ortak kural) |
| `project_areas_code_format` | "Alan kodu yalnızca büyük harf ve rakam içerebilir (tire yok)." |

### 1.5 Ç-6 — şantiye şefi yalnızca okuma

**Görüşüm: katılıyorum.**
- WBS ve alan yapısı planlama kararı; Activity ID'nin parçası (alan kodu).
- Sahadan eklenen tutarsız alanlar Diyarbakır gibi büyük projede raporlamayı bozar.

**Karşı görüş ve cevabı:**
- Sahada beklenmedik bir yer çıkabilir (yeni depo veya laydown alanı) ve şantiye şefi ofisi beklemek istemeyebilir.
- Önerim: bunun yolu Ticket'tan "alan talebi". Proje yöneticisi aynı gün ekler.
- Activity ID kuralları trigger'da olduğu için güvenlik riski yok; konu veri kalitesi.

**Uygulama:**
- Küçük bir RLS migration'ı (Adım 6 paketine eklenir). Şantiye şefi `project_areas` INSERT/UPDATE'ten ve `area_wbs` INSERT/DELETE'ten çıkarılır. SELECT kalır.
- Mevcut policy ifadeleri migration yazılırken okunur ve aynen korunur; yalnızca rol koşulu daralır.
- Testlerde değişecek beklentiler:
  - Adım 4 T32'de şantiye şefi satırları RLS reddine (`OK(0)` veya 42501) döner;
  - T33'teki şantiye şefi işlemleri admin/PM'e taşınır.

## 2. İş Planı

### 2.1 Veri

- Bugün görevler `get_project_gantt(p_project_id, p_filter_date)` RPC'sinden geliyor (`TabIsPlan.jsx` 453-457). Bu RPC disiplin, alan, WBS ve Activity ID döndürmüyor; iptali de süzmüyor.
- **Öneri:** yeni çıktı alanları `activity_id`, `discipline`, `area_id`, `area_code`, `wbs_id`, `wbs_code`.
  - Dönüş tipi `TABLE` ise imza değişir. O durumda kural 2 gereği yeni `get_project_gantt_v2` yazılır, eski fonksiyon ayrı bir temizlik migration'ıyla kalkar.
  - Hangisi olduğu uygulama sırasında canlıdan okunacak.
- Seçim listeleri için bir okuma: `project_wbs`, `project_areas`, `area_wbs` (RLS SELECT) ve `task_disciplines`. Etkin küme istemcide hesaplanır: WBS + üstlerinin bağları.

### 2.2 Kolonlar

- **Detaylı İş Planı tablosu** (`TabIsPlaniDetay.jsx`): Activity ID, Disiplin, Alan, WBS kolonları. "Kolonlar" menüsüyle gizlenebilir; varsayılan açık.
- **Gantt sol listesi:** görev adının altında küçük gri Activity ID.
- **Filtreler:** disiplin, alan, WBS, "ID'si yok" ve "İptalleri göster" (varsayılan kapalı).

### 2.3 Düzenleme formu

- Bugün görev düzenleme formu yok; yan panel (`TaskDetailPanel`, 965-1023) salt okunur.
- **Öneri:** yan panele admin/PM için "Düzenle" modu. Alanlar:
  - **Disiplin:** `task_disciplines`'ten açılır liste (Karar 20: yeni atamada zorunlu).
  - **WBS:** ağaç seçici. Alan seçiliyse yalnızca etkin kümesi bu alanı içeren veya bağı olmayan WBS'ler seçilebilir; diğerleri gri ve gerekçeli.
  - **Alan:** WBS seçiliyse ve etkin küme doluysa yalnızca kümedeki alanlar seçilebilir. Küme boşsa bütün aktif alanlar seçilebilir; "Bu WBS'te bağ tanımsız" uyarısı gösterilir.
  - Pasif alan ve WBS listede yok.
- **Activity ID atanmış görevde** (Karar 39, 51):
  - **Disiplin ve alan:** salt okunur, kilit simgeli. İpucu: "Activity ID atanmış; düzeltme yalnızca admin (gerekçeli)".
  - **Admin:** "Düzelt" düğmesi B4 modalını açar: yeni ID, disiplin, alan ve zorunlu gerekçe. Önerilen ID otomatik doldurulur, elle değiştirilebilir.
  - **WBS:** değiştirilebilir ama yalnızca Karar 51'e uyan WBS'ler listelenir.
- **Kaydetme:** tek satır doğrudan UPDATE. Hata §1.4 kurallarıyla çevrilir.
- **Şantiye şefi:** formu görmez. İlerleme ve durum kontrolleri bugünkü gibi kalır.

### 2.4 Toplu atama ve "Kod ata"

- **Seçim:** admin/PM'e onay kutusu kolonu. Üstte seçim çubuğu: "N görev seçili · Toplu ata · Kod ata · Seçimi temizle".
- **Toplu ata:**
  - Modal: disiplin / alan / WBS (her biri isteğe bağlı) → önizleme → onay.
  - Yeni RPC: `set_tasks_classification(p_task_ids uuid[], p_discipline text, p_area_id uuid, p_wbs_id uuid, p_dry_run boolean default true)`.
    - SECURITY INVOKER: RLS ve bütün trigger'lar aynen çalışır.
    - Yalnızca admin/PM; tek proje, en fazla 500 görev.
    - Görev başına sonuç: ok veya hata (ID'li görevde disiplin/alan kilidi, Karar 51, pasif kayıt, alan-WBS kümesi dışı).
    - Gerçek çağrı hepsi ya da hiçbiri (kural 6).
- **Kod ata:** tekil (satır menüsü) ve toplu (seçim).
  - Önce `assign_activity_ids(ids, true)` önizlemesi. Tabloda önerilen ID, hata ve uyarılar görünür.
  - "Onayla" yalnızca hata yoksa açık; gerçek çağrı yapılır. Uyarılı satırlar sarı ama atanır.
- **500 sınırı (Ç5-4):** önerim seçimi 500 ile sınırlamak. 500'ü aşınca "En fazla 500 görev; WBS/alan filtresiyle daraltın" uyarısı gösterilir. Böylece Karar 41'in "hepsi ya da hiçbiri" vaadi ekranda da geçerli kalır.
  - Parçalı seçenek isterseniz: parçalar sırayla gider, ilk hatada durur, "1-500 yazıldı, 501-800 yazılmadı" raporu verilir.

### 2.5 İptal et / Yeniden aç

- **Satır menüsü (yalnızca admin/PM):**
  - "İptal et": onay diyaloğu. Activity ID'li görevler silinemediği için tek yol budur.
  - "Yeniden aç": A8b trigger'ı DB'de de admin/PM ile sınırlı.
- İptal görev listede gri ve üstü çizili, rozetli. Filtre kapalıyken gizli.
- DB'de iptal etmeyi de kısıtlamak Ç5-3'te sizin kararınız.

### 2.6 İptalin hariç tutulması

| Yer | Bugün | Değişiklik |
|---|---|---|
| İş Planı "Toplam Görev" KPI (`TabIsPlan.jsx` 651, 759, 908-913) | `tasks.length`, iptal dahil | İptal hariç. "Devam Eden" zaten durumla sayıyor; "Riskli/Geciken" iptali zaten hariç tutuyor |
| Günlük rapor formu İlerleme Girişi (`DailyReportForm.jsx` 438-442) | iptal süzülmüyor; tarihi geçmiş iptal görev "gecikmiş" görünür | `.neq('status','iptal')` (DB zaten reddediyor, Karar 44) |
| Günlük rapor listesi Excel export (`DailyReportList.jsx` ~265) | iptal süzülmüyor | Ç5-1: sizin dosyanız |
| Şantiye şefi ekranı (`get_santiye_dashboard`) | — | AID A7 zaten iptali çıkarıyor; ekran değişmez |
| `SantiyeSefiDashboard.jsx` ayrı görev sorgusu (186-196) | gecikme hesabı iptali hariç tutuyor, liste göstermiyor | Değişmez |

## 3. Sihirbaz Ç-B düzeltmesi

### 3.1 Bugün

- `Adim8Tamamlandi.jsx` (107-118) ve `ProjeEditWizard.jsx` (110-117), düzenlemede görevleri `delete().eq('project_id')` ile silip yeniden ekliyor.
- **Sonuçlar:**
  - İlerlemesi olan projede `progress_daily_task_id_fkey` ile düşüyor.
  - İlerleme yoksa bile görev ID'leri değişiyor. Activity ID'li görevlerde silme Karar 40 trigger'ıyla reddedilecek, yani kayıt hiç yapılamayacak.
  - **Yeni bulgu (12.10.2026):** `Adim2IsKalemleri.jsx` `handleSave` (125, 138-155) `id`'yi atıyor ve `group_label`, `responsible_role`, `duration_days`'i gönderen yükte yok. Düzenleme sihirbazından geçen her kayıt **`group_label`'ı siliyor**. Bu, İş Planı hiyerarşisini düzleştiriyor; Kaptan Demir gibi projelerde görünür bir veri kaybı.

### 3.2 Yeni akış

- Yeni RPC: `save_project_tasks(p_project_id text, p_tasks jsonb, p_dry_run boolean default true)`.
  - SECURITY INVOKER (RLS ve trigger'lar geçerli); yalnızca admin/PM; atomik.
- **Eşleşme:**
  - Satırda `id` varsa id ile eşleşir. Düzenleme modu satırları zaten id ile yükleniyor; `handleSave` artık id'yi atmaz.
  - `id` yoksa `task_code` ile eşleşir (canlıda `(project_id, task_code)` UNIQUE, boş kod 0).
  - Sihirbazda görev kodu zorunlu olur (bugün `|| null`).
- **Güncelleme:** yalnızca yükte gelen kolonlar yazılır; gelmeyen kolon (`group_label` gibi) korunur. Sihirbaz yüküne `group_label` da eklenir.
- **Dosyadan veya formdan çıkarılan görev:**
  - Activity ID'si varsa ya da ilerlemesi varsa (`progress_daily` satırı veya `total_progress > 0`) durumu `iptal` yapılır.
  - Yoksa silinir.
- **Önizleme raporu:** her biri listeyle birlikte eklenecek / güncellenecek (değişen alanlar) / değişmeyecek / iptal edilecek (gerekçe: "Activity ID'si var" veya "ilerlemesi var") / silinecek.
- **Hatalar:**
  - kod tekrarı, boş kod;
  - ağırlıksız kategori (§5);
  - ID'li görevde disiplin/alan değişikliği (kilit);
  - Karar 51.
- **Sihirbaz:**
  - Son adımda "Kaydet" önce önizleme modalını açar; "Onayla" gerçek çağrıyı yapar.
  - `ProjeEditWizard`'ın adım bazlı "Kaydet"i aynı RPC'yi kullanır.
- **Kapsam dışı (not):** aynı sil-yeniden-yaz deseni `project_risks` ve `budget_lines` için de var (`TABLE_MAP`). Risklerde otomatik risk kayıtları ve `closed_at` bundan etkilenebilir. Bu adımda düzeltilmez, "Bilinen açık noktalar"a yazılır.
- Sihirbaz bütünü (proje satırı + ağırlıklar + görevler) bugün de tek işlem değil; bu değişmiyor. Görev kaydı kendi içinde atomik.

### 3.3 Zorunlu test

Tohumda ilerlemesi olan proje kurulur (TIZ benzeri; bazı görevlerde `progress_daily` ve Activity ID var). Playwright, PM ile sihirbazdan düzenleme yapar:
1. Bir görevin adını değiştirir → güncellenir, ID ve ilerleme aynı kalır.
2. İlerlemeli bir görevi listeden çıkarır → `iptal` olur, satırı ve ilerlemesi durur.
3. Yeni eklenmiş, ilerlemesiz bir görevi çıkarır → silinir.
4. Activity ID'li görevi çıkarır → `iptal` olur.
5. `group_label` korunur.
6. Proje ilerleme yüzdesi iptal görevi hariç hesaplanır.

Önizleme modalındaki sayılar DB sonucu ile karşılaştırılır.

## 4. Proje oluşturma

Ayrıntı ve diff: `f1-import-project-excel-diff.md` (Adım 1).
- **Sihirbaz Adım 1:**
  - "Proje Kodu *" alanı: 2-5 karakter, harfle başlar, büyük harf ve rakam (Karar 28); büyük harfe otomatik çevrilir.
  - Düzenlemede salt okunur; `project_register_settings.prefix`'ten okunur.
- **Adım 8:** yeni projede `projects` insert yerine `create_project_with_code(p_project, p_code)`. `duplicate` / `validation` hataları alan bazında Türkçe gösterilir. Ardından ağırlıklar ve görevler (§3).
- **Excel şablonu v8:**
  - B13 "Proje Kodu *", E13 kod, H13 açıklama. E13 bugün boş; import E12'den sonra doğrudan E15'i okuyor (canlı kodda doğrulandı).
  - **Senkron güncellenmesi gereken dört yer:**
    - statik `public/excel/fons-solar-proje-sablonu.xlsx` ve Kullanım Kılavuzu;
    - `import-project-excel`;
    - `export-project-excel` (E13'e kodu yazar);
    - `src/utils/projectExcelImport.js` (kod alanı yok, yalnızca not).
  - **Yeni projede** E13 zorunlu.
  - **Güncellemede** E13 projenin kodundan farklıysa red: "Proje kodu değiştirilemez (mevcut: TIZ)". Boşsa yok sayılır.
- **"Yeni bir kopya olarak yükle":**
  - Çakışma modalında yeni kod alanı açılır. Kopya, aslının kodunu kullanamaz (prefix UNIQUE).
  - İstemci köprüsü sizin dosyanız (Ç5-2).
- **Edge function deploy'u yalnızca Adım 6'da ve onayla.** Yerelde `functions serve` ile test edilir.

## 5. Ağırlıksız kategori: uyarı mı red mi

**Görüşüm: red. Eğiliminize katılıyorum.**
- Sessizce yanlış ilerleme göstermek, uyarıyı atlamaktan daha kötü.
- Bugün dört projenin dördünde görülüyor; TIZ/TKY'de 10 görevin ilerlemesi yüzdeye yansımıyor.
- Uyarı, Excel importu gibi toplu akışlarda kolayca geçilir.
- Mesaj: "Bu kategori için ağırlık tanımlayın; fiziksel değilse %0 girin" ve kategori adı.

**Nerede uygulanmalı — öneri: DB trigger'ı:**
- `project_tasks` BEFORE INSERT OR UPDATE OF category; yalnızca yeni görevde ya da kategori gerçekten değiştiğinde.
- Proje ağırlık tablosunda satır varsa ve kategori orada yoksa red.
- Böylece sihirbaz, Excel import ve doğrudan yazma tek yerden kapsanır.
- Mevcut eksik kategorili görevler (TIZ/TKY/ADN1/ADN2) dokunulmadıkça etkilenmez. Günlük ilerleme ve durum güncellemeleri kategoriye dokunmadığı için kırılmaz.

**Ters yön:** `save_project_category_weights`, projede görevi olan bir kategoriyi tablodan çıkaran kaydı da reddetmeli. Yoksa kural ağırlık ekranından aşılır.
- Yan etkisi: bugün ADN2'nin ağırlıkları kaydedilmek istenirse önce eksik 5 kategorinin (%0 dahil) eklenmesi gerekir. Bu istenen davranış.

**Ekran:**
- Sihirbazın Kategori Ağırlıkları adımı, görevlerde kullanılıp tabloda olmayan kategorileri kırmızı satır olarak listeler; "%0 ile ekle" düğmesi var.
- `save_project_tasks` önizlemesi ve Excel import hatası aynı listeyi gösterir.

**Not:** Diyarbakır importundan önce ağırlık tablosunun tüm kategorileri kapsaması zaten Adım 6 ön koşulu (§9 madde 3a). Bu trigger o koşulu kalıcı kural yapar.

## 6. Playwright

- **Koşum yeri:** `PW_TARGET=localdb` (§0.3).
- **Mevcut suite:** önce taban + tohum ile kalibre edilir. Sonra Faz 1 taslakları uygulanmışken yeniden koşulur. Kalibre listesinin dışında kırmızı yoksa yeşil sayılır.

| Ekran / akış | admin | proje_yoneticisi | santiye_sefi | muhasebe |
|---|---|---|---|---|
| Proje Ayarları › WBS ve Alanlar görüntüleme | ✓ | ✓ | ✓ (düzenleme düğmeleri yok) | sekmeye ulaşamaz (ProjeDetay yok) |
| WBS/alan ekle-düzenle-pasifleştir, kod kilidi, ID'li kayıt pasifleştirme hatası (Türkçe mesaj) | ✓ | ✓ | API'den yazma reddi (Ç-6 onaylanırsa) | API reddi |
| Excel import: önizleme raporu (hata, `not_in_file`, `aid_impact`), onay, ikinci yüklemede "değişmez" | ✓ | ✓ | düğme yok; RPC `forbidden` | RPC `forbidden` |
| İş Planı kolonları ve filtreleri | ✓ | ✓ | ✓ (salt okunur) | — |
| Düzenleme formu: alan/WBS süzme, ID'li görevde kilit, Karar 51 reddi | ✓ (B4 düzelt dahil) | ✓ (B4 yok) | form yok | — |
| Toplu ata (önizleme + gerçek, hepsi ya da hiçbiri) | ✓ | ✓ | seçim kolonu yok | — |
| Kod ata tekil ve toplu (önizleme = gerçek, 500 sınırı) | ✓ | ✓ | yok; RPC `forbidden` | RPC `forbidden` |
| İptal et / yeniden aç; KPI iptali saymıyor | ✓ | ✓ | menü yok; yeniden açma DB reddi | — |
| Günlük rapor İlerleme Girişi'nde iptal görev yok | — | ✓ | ✓ | — |
| Sihirbaz düzenleme, ilerlemeli proje (§3.3) | ✓ | ✓ | — | — |
| Yeni proje: kodlu oluşturma, kod çakışması, düzenlemede kod salt okunur | ✓ | ✓ | — | — |
| Excel proje import v8: E13 zorunlu, kopya yeni kod ister, kod değiştirme reddi | ✓ | ✓ | — | — |
| Ağırlıksız kategori reddi (sihirbaz + Excel) ve "%0 ile ekle" | ✓ | ✓ | — | — |

## 7. Adım 5'in DB'ye eklediği yeni parçalar (taslak; Adım 2 yöntemiyle test edilir)

1. `get_project_gantt` yeni alanlar (veya `_v2`).
2. `save_area_wbs_links` (INVOKER).
3. `set_tasks_classification` (INVOKER, önizleme varsayılan).
4. `save_project_tasks` (INVOKER, önizleme varsayılan).
5. Ağırlıksız kategori trigger'ı + `save_project_category_weights` ters yön kontrolü.
6. Ç-6 RLS daraltması (onaylanırsa).
7. Ç5-3 iptal kısıtı (onaylanırsa).

Hepsi ayrı taslak dosyasında (`f1_adim5_ekran_rpc.sql`), BÖLÜM A/B. Önce yerelde, sonra canlıda ROLLBACK + parmak izi.

## 8. Uygulama sırası (onaydan sonra)

1. **5a:**
   - yerel ortam (Docker kurulumu sizde);
   - taban döküm;
   - tohum;
   - mevcut suite kalibrasyonu.
2. **5b:** §7 DB taslakları; kural 10 ön kontrolü; yerel ve canlı ROLLBACK testleri.
3. **5c:** ekranlar (WBS ve Alanlar → İş Planı → sihirbaz → proje oluşturma/Excel v8).
4. **5d:** Playwright matrisi + mevcut suite.
5. **5e:** dokümantasyon; durum tablosu; Adım 5 kapanışı.

## 9. Sizden beklenen kararlar

1. Test ortamı: yerel Docker (öneri) mi, ayrı bulut projesi mi? Docker kurulumu ve `npm run db:backup` ile şema dökümü.
2. Ç5-1 / Ç5-2: commit'lenmemiş iki dosyanızdaki (`DailyReportList.jsx`, `projectExcelBridge.js`) değişiklikler.
3. Ç5-3: iptal etme DB'de de admin/PM ile sınırlansın mı (Karar 44 değişir)?
4. Ç5-4: Kod ata 500 ile sınırlı seçim (öneri) mi, parçalı yazma mı?
5. Ç5-5 / Ç-6: şantiye şefi WBS/alan/bağda yalnızca okuma (öneri) onayı.
6. §5: ağırlıksız kategoride DB trigger'ıyla red ve ağırlık ekranında ters yön kontrolü.
7. §4: Excel güncellemede E13 farklıysa red.
8. §1.1: "Proje Ayarları" sekmesinin ProjeDetay'da yeni sekme olarak yeri.

## Ek A — Sizin commit'lenmemiş dosyalarınızda hazır bekleyen değişiklikler (Karar 53)

Bu dosyalara dokunulmadı. Siz kendi değişikliklerinizi commit edip haber verince aşağıdakiler uygulanacak.

1. **`src/pages/DailyReportList.jsx`** (Excel export görev sorgusu, ~265. satır): iptal görev rapor dışına.
   ```diff
   - supabase.from('project_tasks').select('id, task_code, task_name, category, unit, target_qty, notes').eq('project_id', exportProjectId).gt('target_qty', 0).order('planned_start'),
   + supabase.from('project_tasks').select('id, task_code, task_name, category, unit, target_qty, notes').eq('project_id', exportProjectId).gt('target_qty', 0).neq('status', 'iptal').order('planned_start'),
   ```
2. **`src/utils/projectExcelBridge.js`**: kopya için yeni proje kodu (Karar 57).
   - `TabProjeYonetimi.jsx` bu argümanı zaten gönderiyor; köprü şimdilik yok sayıyor.
   - Edge function'ın 400 hata gövdeleri (`need_code`, `code_mismatch`) mevcut `friendlyError` yoluyla gösteriliyor mu, uygulamada doğrulanacak.
   ```diff
   - export async function importProjectExcel(file, mode = 'ask') {
   + export async function importProjectExcel(file, mode = 'ask', code = null) {
       const formData = new FormData()
       formData.append('file', file)
       formData.append('mode', mode)
   +   if (code) formData.append('code', code)
   ```
3. **`src/pages/dashboard/components/ProjeDetay.jsx`**: Proje Ayarları sekmesi (Karar 58).
   - Bileşen `proje-ayarlari/ProjeAyarlari.jsx`'te hazır.
   - `index.jsx`'te sekme anahtarı kısıtı yok (kontrol edildi).
   ```diff
   + import ProjeAyarlari from './proje-ayarlari/ProjeAyarlari'
     export default function ProjeDetay({ projectId, … }) {
   +   const { role } = useAuth()
     …
           <button onClick={() => setTab('ekip')} style={tab === 'ekip' ? tabBtnActive : tabBtn}>Ekip</button>
   +       <button onClick={() => setTab('ayarlar')} style={tab === 'ayarlar' ? tabBtnActive : tabBtn}>Proje Ayarları</button>
     …
   -   {tab === 'ekip' ? (
   +   {tab === 'ayarlar' ? (
   +     <ProjeAyarlari projectId={projectId} role={role} />
   +   ) : tab === 'ekip' ? (
   ```

## Ek B — Kararlardan sonra uygulama durumu (12.10.2026, 14. tur)

### Kod (commit'li, push yok; canlıya ve edge function'lara hiçbir şey uygulanmadı)

| Parça | Dosya | Durum |
|---|---|---|
| DB taslağı | `taslak-sql/f1_adim5_ekran_rpc.sql` | Yazıldı (A1-A7). Test edilmedi; yerel ortamda koşulacak |
| Karar 44 güncellemesi | `taslak-sql/f1_aid_activity_id.sql` A8b | İptal etme de admin/PM |
| Regresyon | `taslak-sql/f1_dogrulama.sql` §7 R28-R31; R15 güncellendi | Koşulmadı |
| Yerel ortam | `scripts/local-db/setup.mjs`, `seed.mjs`, `supabase/local/`, `playwright.config.js` | Çalıştırılmadı (Docker yok) |
| İş Planı | `TabIsPlan.jsx`, `TabIsPlaniDetay.jsx`, `is-plani/*`, `hooks/useProjectStructure.js`, `utils/wbsAreaErrors.js` | Yazıldı |
| WBS ve Alanlar | `proje-ayarlari/*` | Yazıldı; ProjeDetay bağlantısı Ek A |
| Sihirbaz | `Adim1`, `Adim2`, `Adim3`, `Adim8`, `ProjeEditWizard`, `GorevKayitOnizleme`, `saveProjectTasks.js` | Yazıldı |
| Proje kodu / Excel v8 | `import-project-excel`, `export-project-excel` (+ `template_builder.ts`), `public/excel/fons-solar-proje-sablonu.xlsx`, `scripts/proje-kontrol/sablon-v8.mjs`, `TabProjeYonetimi.jsx` | Yazıldı; **deploy yok** |
| Günlük rapor | `DailyReportForm.jsx` | İptal görev İlerleme Girişi'nde yok |
| Testler | `tests/proje-kontrol-adim5.spec.js` | Yazıldı; yerel + taslaklı ortamda koşar, aksi halde atlar |

Doğrulama: `npm run build` başarılı; değişen dosyalarda ESLint hatası yok.

### Uygulamada verilen ara kararlar (onayınıza sunulur)

- **`set_tasks_classification` ve `save_project_tasks` SECURITY DEFINER** (tasarım INVOKER diyordu).
  - Gerekçe: iç yardımcılar `authenticated`'a kapalı.
  - Yetki (admin/PM) ve `has_project_access` fonksiyon içinde kontrol ediliyor. Kimlik ve iptal korumaları trigger'da olduğu için DEFINER bunları aşmıyor: bayrak açılmıyor, `get_my_role()` çağıranın rolünü döndürüyor.
  - `save_area_wbs_links` INVOKER kaldı (RLS Ç-6'yı zorunlu kılar).
- **Ağırlıksız kategori kontrolleri ertelenebilir constraint trigger** olarak yazıldı.
  - Görev tarafı başlangıçta anında, ağırlık tarafı başlangıçta ertelenmiş.
  - Sihirbaz bugün görevleri ağırlıklardan önce kaydediyor. İki ayrı çağrıda yeni kategori ile kategori silme birbirini kilitlerdi. Bu yüzden `save_project_tasks` isteğe bağlı `p_weights` alıyor: ikisi tek işlemde yazılıyor, kontrol commit anında.
- **Çıkarılan görev hangi durumda silinmez:** Activity ID ya da ilerlemenin yanında, `project_tasks`'a NO ACTION FK ile bağlı bir kayıt varsa da (satın alma talebi, BOM kalemi, risk, register kayıtları; canlı FK listesi 12.10.2026) görev iptal edilir (`fn_task_keep_reason`). Yoksa silme FK hatasıyla düşerdi.
- **Sihirbaz görevlerde disiplin/alan/WBS göndermiyor.** Bunlar İş Planı'ndan yönetiliyor; `save_project_tasks` yükte olmayan kolonu korur.
- **Görev kodu sihirbazda zorunlu ve tekil.** Canlıda kolon zaten NOT NULL ve proje içinde UNIQUE.
- **Karar 44 sonucu:** service role ile çalışan Excel import, görev durumunu iptale çekemez veya iptalden çıkaramaz (oturumsuz bağlam). İptal ekrandan yapılır.
- **Karar 57'nin yorumu:** güncellemede boş E13 de uyuşmazlık sayıldı. Eski v7 dosyalarıyla güncelleme reddedilir; kullanıcı v8 ile indirilen dosyayı kullanmalı. Boş E13'ün yok sayılmasını isterseniz tek satırlık değişiklik.
- **Geriye uyum:** `create_project_with_code`, `save_project_tasks` ve `task_disciplines` veritabanında yoksa (Faz 1 migration'ı öncesi) ekranlar eski yola düşer ya da yeni özellikleri gizler.

### Yeni çakışma (kural 8) — Ç5-6

- **Çakışma:** Karar 58 "şantiye şefi WBS ve Alanlar'ı görür, düzenleyemez" diyor. Ama şantiye şefinin `projeler` sekmesi yok, ProjeDetay'a hiç ulaşamıyor (`frontend-giris-karari.md`). Proje Ayarları yalnızca admin ve PM'e görünür olur.
- **Seçenekler:**
  - (a) Şantiye şefinin kendi "İş Planı" sekmesine salt okunur bir "WBS ve Alanlar" bölümü (aynı bileşen, `role=santiye_sefi`). En küçük değişiklik; önerim bu.
  - (b) Şantiye şefine ProjeDetay erişimi açmak. Daha geniş bir navigasyon kararı.
- Karar bekliyor; testte şantiye şefi görünümü bu yüzden yok.
