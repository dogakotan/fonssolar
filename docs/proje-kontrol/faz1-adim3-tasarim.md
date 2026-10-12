# Faz 1 · Adım 3 — Activity ID üretimi ve Ç16 yazma kuralı (tasarım)

Tarih: 09.10.2026. Kararlar: CLAUDE.md Karar 18, 20, 30, 37-43.
Taslak: `taslak-sql/f1_aid_activity_id.sql`. Doğrulama: `taslak-sql/f1_dogrulama.sql` (R6-R16).
Testler: `taslak-sql/f1_adim3_testler_oturum1b.sql`, `f1_adim3_testler_oturum2.sql`. Sonuçlar: `faz1-adim3-sonuclar.md`.
Durum: **taslak, uygulanmadı.** Adım 6'da ayrı migration olarak, B4'ten sonra uygulanır (Karar 42).

## 1. Disiplin listesi (Karar 37)

Canlıda disiplin için DB listesi yoktu: `project_tasks.discipline` serbest metin, CHECK/enum/tablo yok, 228 görevin
hepsinde boş. "Canlıdaki liste" (mechanical, dc, ac, mv, enh, civil, general) yalnızca `tasarim.md`'deki ekran
sözlüğüydü.

`task_disciplines` tablosu (yalnızca okuma; satırları migration ekler) ve `project_tasks.discipline` → FK (boş serbest):

| Anahtar | Kısaltma | Ad |
|---|---|---|
| mechanical | MEC | Mekanik |
| dc | DC | DC Elektrik |
| ac | AC | AC Elektrik |
| mv | MV | OG (MV) |
| hv | HV | YG (HV) |
| enh | EIH | Enerji İletim Hattı |
| civil | CIV | İnşaat |
| scada | SCA | SCADA |
| general | GEN | Genel |

`project_wbs.discipline`, `documents.discipline` ve `technical_submittals.discipline` bu adımın kapsamı dışında kalır.

## 2. Kod önerme ve atama

- `assign_activity_ids(p_task_ids uuid[], p_dry_run boolean default true)` ve tekil
  `assign_activity_id(p_task_id uuid, p_dry_run boolean default true)`.
- Yetki: yalnızca admin ve proje_yoneticisi, önizleme dahil (Karar 35, 43).
- Çağrı başına en fazla 500 görev ve tek proje (Karar 41).
- **Biçim** `{PROJE}-{KISALTMA}-{ALAN}-{NNNN}`:
  - grup = proje + disiplin + alan; onar artar;
  - 4 haneye kadar sıfırla doldurulur, 9990'dan sonra 10000 (kırpma yok);
  - aynı çağrıda grup içinde planlanan başlangıç tarihi, sonra görev kodu sırası.
- **Görev başına hatalar** (hepsi birlikte listelenir):
  - `project_code_missing`, `already_assigned`;
  - `discipline_missing`, `discipline_unknown`;
  - `area_missing`, `area_inactive`, `area_code_invalid`;
  - `wbs_missing`, `wbs_inactive`;
  - `area_wbs_not_linked`.
- **Uyarılar:** `area_wbs_undefined`, `discipline_wbs_mismatch`.
- **Alan-WBS kuralı (Karar 38):** WBS'te veya üst WBS'lerinde alan bağı tanımlıysa görevin alanı aralarında olmalı (engel). Hiç bağ yoksa uyarı verilir ve atama yapılır.
- **Önizleme:** hiçbir şey yazmaz, sayaca da dokunmaz. Gerçek atamada tek hata bile varsa `validation` döner, ayrıntıda hatalı görevler listelenir ve hiçbir şey yazılmaz.
- **Eşzamanlılık:**
  1. Görev satırları ID sırasıyla `FOR UPDATE` kilitlenir; kilitten sonra durum yeniden okunur.
  2. `activity_id_counters` satırları (disiplin, alan kodu) sırasıyla `FOR UPDATE` kilitlenir. Sabit sıra kilitlenmeyi önler.
  3. Sonraki numara, sayaç ile gruptaki mevcut en büyük numaradan büyük olanın 10 fazlasıdır. B4 ile elle verilmiş bir numara da atlanmaz.
  4. Sayaç ile görev yazımı aynı işlemde birlikte geri alınır. Benzersizlik indeksi son güvencedir; çakışırsa `duplicate` döner.
  5. Silinen ya da temizlenen bir numara tekrar kullanılmaz.
- Her atama `register_audit`'e yazılır.

## 3. Ç16 — Activity ID yalnızca bu fonksiyon ve B4 ile yazılır

**Yöntem: trigger + işlem içi bayrak + çalışan kullanıcı kontrolü.** `fn_project_tasks_identity_guard`'ın son hali
Adım 3'tedir (Karar 42) ve şu kuralları uygular:

| Durum | İzin |
|---|---|
| INSERT, `activity_id` dolu | Her zaman red |
| Boş → değer | Bayrak `fons.activity_id_assign` (ya da `fix`) açık **ve** çalışan kullanıcı ilgili SECURITY DEFINER fonksiyonun sahibi |
| Değer → başka değer / boş | Yalnızca `fons.activity_id_fix` + `admin_correct_task_activity_id` sahibi |
| ID'li görevde disiplin/alan değişikliği | Yalnızca `fix` (Karar 39) |
| ID'li görevde proje değişikliği | Her zaman red |
| ID'li görevi silme | Proje hâlâ varsa red; proje silinirken izin (Karar 40) |
| ID'li görevde WBS değişikliği | Serbest; `register_audit`'e yazılır (Karar 39) |

**Kolon yetkisi neden seçilmedi:**
- `authenticated` bugün `project_tasks`'ın tamamına INSERT/UPDATE yetkisine sahip (sihirbaz ve Excel bunu kullanıyor).
- Kolon yetkisine geçmek için yaklaşık 40 kolonun tek tek verilmesi gerekir. Sonradan eklenen her kolon sessizce yazılamaz hale gelir.
- `service_role` kolon yetkisinden etkilenmez.
- "Boş → değer" ile "değiştirme" ayrımı ve "yalnızca bu fonksiyon" kuralı kolon yetkisiyle ifade edilemez.

**İstemciden taklit edilemezlik:**

1. **Tabloya doğrudan yazma** (PostgREST, GraphQL) `authenticated` kullanıcısıyla çalışır. `current_user`, fonksiyon sahibi (`postgres`) değildir; bayrak taklit edilse bile red. T14 ve R7 bunu ölçüyor.
2. **`service_role`** RLS'i atlar ama trigger'ı atlamaz; `current_user = service_role` olduğu için red (T14).
3. **Bayrak RPC üzerinden açılamaz.** `public` şemasında `set_config` çağıran fonksiyonlar yalnızca bu iki atama/düzeltme fonksiyonudur. Ayar adını değişkenden alan fonksiyon yok (R12, T19).
4. **`postgres` sahipli diğer DEFINER fonksiyonlar** (`set_task_milestone_status`, `sync_task_progress_from_daily`) bayrak açmaz. Gövdelerinde `activity_id` de geçmez (canlıda kontrol edildi).
5. **`set_config`'in doğrudan RPC olarak çağrılamaması:** fonksiyon `pg_catalog`'da. PostgREST yalnızca "exposed schemas" listesindeki şemaları RPC olarak açar. İstek başlıkları yalnızca `request.*` ayarlarını doldurur.
   - **Doğrulandı (12.10.2026):** PostgREST'in açtığı şemalar yalnızca `public, graphql_public`. `pg_catalog` açık değil, yani `set_config` RPC olarak çağrılamaz. Madde 5 kapandı.
   - Yöntem (kullanıcının tarif ettiği, yalnızca okuma): yayınlanabilir (anon) anahtarla `Accept-Profile: pg_catalog` başlıklı GET.
     - Önce `/rest/v1/` kökü denendi: `401 Secret API key required` döndü, şema bilgisi gelmedi.
     - Ardından `/rest/v1/pg_class?limit=0` denendi: `406 PGRST106 — "Only the following schemas are exposed: public, graphql_public"`, `"Invalid schema: pg_catalog"`.
     - PostgREST şemayı tabloya bakmadan reddettiği için hiçbir satıra erişilmedi; hiçbir şey değişmedi.
   - Panelde `pg_catalog` (veya başka bir şema) exposed listesine eklenirse bu madde yeniden açılır. Madde 1 ve 2 yine tek başına yeterlidir.
6. **Bilinen istisna:** trigger'ı kapatabilen veritabanı yöneticisi (migration). Kapsam dışı.

**Ekranlar ve Excel import Activity ID gönderiyor mu?**

| Yer | Gönderiyor mu | Not |
|---|---|---|
| `src/` genelinde | Hayır | `activity_id`/`discipline` hiç geçmiyor |
| `Adim2IsKalemleri.jsx` | Hayır | `select('*')` ile okuyor ama yazılan alanlar tek tek seçili |
| `ProjeEditWizard.jsx` / `Adim8Tamamlandi.jsx` (düzenleme) | Hayır | Görevleri **silip yeniden ekliyor** (Ç-B, aşağıda) |
| `import-project-excel` | Hayır | Görev koduna göre günceller, silmez; Activity ID/WBS/alan korunur |
| `TabIsPlan.jsx`, `export-project-excel` | Hayır | Yalnızca okur |

## 4. Kontrol (a): iptal durumu ve görev durumunu okuyan hesaplar

`task_status` enum'unda `iptal` zaten var (bugün 0 görevde). Hesaplar:

| Hesap | Bugün iptali hariç tutuyor mu | Taslakta |
|---|---|---|
| `fn_sync_project_progress` (proje ilerlemesi, `projects.progress`) | Hayır | İptal hariç; ayrıca trigger artık durum değişikliğinde de çalışır |
| `save_project_category_weights` (ağırlık kaydında ilerleme) | Hayır | İptal hariç |
| `get_project_by_date`: `overall_pct`, `category_weights` | Hayır | İptal hariç |
| `get_project_by_date`: `tasks` (S-eğrisi) ve `progress_items` | Hayır | İptal hariç |
| `get_santiye_dashboard.progress_items` (ilerleme girilecek kalemler) | Hayır | İptal hariç |
| `vw_project_progress_summary.total_tasks` | Hayır | İptal hariç (`delayed_tasks` zaten hariç tutuyordu) |
| `sync_task_progress_from_daily` | Hayır: iptal göreve ilerleme girilince durum `devam_ediyor`a dönüyor | Durum `iptal` kalır |
| `add_task_progress` | Hayır | İptal göreve ilerleme reddedilir |
| `save_daily_report` ve `progress_daily`'ye doğrudan yazma (rapor sahibi) | Hayır | A8: tablo trigger'ı reddeder; eski raporun aynen yeniden kaydı korunur |
| `project_tasks` durum güncellemesi (şantiye şefi kendi projesinde yazabiliyor) | İptal görevi herkes yeniden açabiliyor | A8: yalnızca admin ve proje yöneticisi |
| `fn_recompute_auto_risks` (gecikme riski) | **Evet** | Değişmedi |
| `vw_delayed_tasks` | **Evet** | Değişmedi |
| `set_task_milestone_status` | `iptal`i kabul ediyor, %0 yapıyor | Değişmedi |
| `get_project_gantt` | Hayır: görev listesi ve görev başı ilerleme | Değişmedi; Gantt iptal görevi durumuyla göstermeye devam eder |
| `get_proje_detay.work_packages`, `get_daily_report_detail` | Liste / tarihçe | Değişmedi (görüntüleme) |
| `export-project-excel` | Tüm görevler, durumuyla | Değişmedi (Excel gidiş-dönüşü için doğru) |
| `get_dashboard_summary` | `projects.progress` üzerinden | Düzeltme `fn_sync_project_progress` ile gelir |

**Ön yüz (Adım 5'e eklendi, bu adımda değişmedi):**
- `TabIsPlan.jsx`'te KPI "Toplam Görev" iptali sayıyor (`deriveTaskStatusAt` ve gecikme hesabı iptali zaten hariç tutuyor).
- `DailyReportForm.jsx:438` ilerleme girilecek görev listesi iptali süzmüyor.
- `ProjectOverviewDashboard.jsx`'teki S-eğrisi RPC'nin `tasks` listesinden beslendiği için taslaktaki RPC düzeltmesiyle düzelir. Dosyaya dokunulmadı.

Bugünkü durum Oturum 1b'de ölçüldü: iptal görev eklenince ve göreve ilerleme girilince metrikler değişiyor. Taslaktan
sonraki ölçüm Oturum 2b'de (T20-T20d) yapılacak.

### 4.1 A8 — iptal göreve ilerleme ve yeniden açma (12.10.2026'da eklendi)

İlk taslak iptal göreve ilerlemeyi yalnızca `add_task_progress`'te reddediyordu. Günlük rapor yolu bilinçli olarak
açık bırakılmıştı, eski raporların yeniden kaydı kırılmasın diye. Kullanıcı kararıyla kapatıldı:

- **A8a** `trg_progress_daily_cancelled_guard` (BEFORE INSERT/UPDATE, `progress_daily`):
  - iptal göreve yeni satır, başka göreve taşıma veya miktar artışı reddedilir: `İptal edilmiş göreve ilerleme girilemez`;
  - azaltma ve silme serbest, böylece rapor ve proje silme zinciri çalışır;
  - tablo seviyesinde olduğu için `save_daily_report`, `add_task_progress` ve rapor sahibinin doğrudan yazmasını aynı kural kapsar.
- **A8b** `trg_project_tasks_reopen_guard` (BEFORE UPDATE OF status): `iptal`den çıkışı yalnızca admin ve proje yöneticisi yapabilir. Şantiye şefi bugün `project_tasks_update` ile kendi projesinde durum yazabiliyor. Oturumsuz bağlam (postgres, service_role) da reddedilir. İptal etmeye dokunulmadı.
- **A8c** `save_daily_report`: rapor her kayıtta `progress_daily` satırlarını silip yeniden yazıyor. Yalnızca A8a olsaydı iptal görev satırı olan eski bir raporun aynen yeniden kaydı da reddedilirdi. Bu yüzden:
  - iptal görevin mevcut satırı silinmez, dondurulur;
  - aynı miktarla gelirse yeniden yazılmaz;
  - farklı miktar veya yeni satır A8a'ya takılır.
- Bunun bedeli: iptal görevin eski ilerlemesi rapordan da düşürülemez. Görev yeniden açılırsa düzeltilebilir.
- Testler:
  - T20c: şantiye şefi rapor, doğrudan satır ve yeniden açmayı dener; üçü de reddedilir, görev iptal kalır, metrik farkı yok;
  - T20d: ilerlemesi olan görev iptal edilir; eski rapor aynen yeniden kaydedilir, miktar artışı reddedilir, PM görevi yeniden açar.

## 5. Kontrol (b): `activity_id` biçim kontrolü

Canlıda biçim kontrolü:

```
project_tasks_activity_id_format: CHECK ((activity_id IS NULL) OR (activity_id ~ '^[A-Z0-9][A-Z0-9-]*$'))
```

Uzunluk sınırı yok. 5 haneli numaraya (`TIZ-GEN-B2-10000`) ve uzun alan kodlarına izin veriyor; güncelleme gerekmedi.
Alan kodu kontrolünde de (F1 A2, `^[A-Z0-9]+$`) uzunluk sınırı yok. Sınırlar T9b'de (9980 → 9990 → 10000) ve
T9c'de (40 karakterlik alan kodu) test edilir. Tam biçim (`{PROJE}-{KISALTMA}-{ALAN}-[0-9]{4,}`) atama fonksiyonu ve
genişletilmiş B4 içinde doğrulanır; tablo kontrolü gevşek kalır.

## 6. Genişletilmiş B4 (Karar 39)

`admin_correct_task_activity_id(p_task_id, p_new_activity_id, p_reason, p_discipline default null, p_area_id default null)`.
B4'ün 3 parametreli sürümünün yerine geçer; 3 parametreli çağrılar varsayılanlar sayesinde aynen çalışır.

- Yalnızca admin, gerekçe zorunlu.
- Yeni ID, görevin (yeni) proje kodu, disiplin kısaltması ve alan koduyla uyumlu olmalı. NULL verilirse ID temizlenir.
- Değişen alanlar `register_audit`'e gerekçesiyle yazılır.

## 7. Ç-B — sihirbazın düzenleme kaydı (bugün canlıda, Faz 1'den bağımsız)

`ProjeEditWizard.jsx:112-117` ve `Adim8Tamamlandi.jsx:107-118` düzenlemede projenin bütün görevlerini silip yeniden
ekliyor. Oturum 1b'de TIZ'de (35 görev, 16'sında ilerleme) proje yöneticisi olarak bu silme adımı denendi:

```
update or delete on table "project_tasks" violates foreign key constraint "progress_daily_task_id_fkey" on table "progress_daily"
```

Yani ilerleme girilmiş bir projede sihirbazın İş Kalemleri kaydı bugün hata veriyor. İlerleme yoksa silme başarılı
olur, ama görev ID'leri değişir ve görevlere bağlı her şey kopar. Adım 3 kurulunca ID'li görev de silinemeyeceği için
(Karar 40) aynı akış ID'li projelerde de hata verir. Düzeltme Adım 5'te: görev koduna göre güncelleme (Karar 40).
Adım 6 deploy'unun ön koşulu.

## 8. Adım 5'e eklenenler

- Sihirbazın görev kaydı: sil-yeniden-yaz yerine görev koduna göre güncelleme (Karar 40, Ç-B).
- Görevi silme yerine "İptal et" eylemi. ID'li görevde sil düğmesi yok.
- İş Planı KPI'sı ve günlük rapor ilerleme listesi iptal görevleri hariç tutsun. Eski raporu düzenlerken iptal görevin
  satırı salt okunur gösterilsin (A8: miktar değişirse kayıt reddedilir).
- "Yeniden aç" eylemi yalnızca admin ve proje yöneticisine görünsün (A8b).
- Ağırlık tablosunda olmayan kategoriyle görev yazılırken (Excel import ve sihirbaz) uyarı mı red mi olacağı için
  öneri (§9, madde 3).

## 9. Adım 6 ön koşulları

Adım 6 yalnızca kullanıcı "uygula" dediğinde başlar. Aşağıdakiler tamamlanmadan başlamaz:

1. **Yedek.** `npm run db:backup` ve `npm run db:backup:data` (`.env.local` gerekli, `scripts/db-backup/README.md`).
2. **Sihirbaz görev kaydı (Ç-B, Karar 40).** Sil-yeniden-yaz yerine görev koduna göre güncelleme (Adım 5).
3. **Kategori ağırlıkları (12.10.2026'da eklendi, "Bilinen açık noktalar" kaydı).**
   - a) Diyarbakır importundan önce projenin ağırlık tablosu, projede kullanılan tüm kategorileri kapsar.
     - Fiziksel ilerlemesi olmayan kategoriler (ör. `evrak_sureci`, `satin_alma`) tabloda açıkça %0 olarak yer alır.
     - Toplam %100.
     - Hangi kategoriye ne ağırlık verileceği iş kararıdır; kullanıcı bildirir.
   - b) Excel import ve sihirbaz, ağırlık tablosunda olmayan bir kategoriyle görev yazarken uyarı verir veya reddeder. Hangisinin olacağı Adım 5 tasarımında önerilir.
4. **Ç16 madde 5 (exposed schemas).** 12.10.2026'da doğrulandı: yalnızca `public, graphql_public`. Adım 6 öncesi aynı GET ile yeniden kontrol edilir; liste değiştiyse dur.
- Disiplin açılır listesi `task_disciplines`'ten okunsun.
