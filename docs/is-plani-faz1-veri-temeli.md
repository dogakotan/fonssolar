# İş Planı revizyonu Faz 1: veri temeli (15.10.2026)

Dal `is-plani-revizyon`, commit yok. **Canlıya hiçbir şey uygulanmadı.** Testler canlıda tek işlem içinde,
sonunda hata fırlatılarak geri alındı (ROLLBACK). Parmak izi P0 (öncesi) ve P1 (sonrası) birebir aynı:
şema, trigger, policy, görev, bağımlılık, risk ve proje satırlarının md5'i ile progress_daily, daily_reports ve
bildirim sayıları (bildirim 1273, risk 103).

**Canlıya uygulandı (16.10.2026, kullanıcı "başla"; mesai içi ve yedeksiz, kullanıcı koşulu kaldırdı):** `20261016115400`, `20261016115418`. Önce prova (8/8), sonra her adımda parmak izi (bildirim 1278, risk 103, görev/bağımlılık/proje md5) değişmedi; kalıcı kurulumda şef ilerleme yazabildi, plan alanı reddedildi, admin serbest.

| Migration | Ne yapar | Durum |
|---|---|---|
| `20261016115400_task_dependencies_cycle_and_site_chief_guard.sql` (eski ad 130000) | Bağımlılıkta döngü kontrolü + şantiye şefi yazamaz | **Canlıya uygulandı (16.10.2026)** |
| `20261016115418_project_tasks_site_chief_plan_guard.sql` (eski ad 130100) | Şantiye şefi yalnızca gerçekleşen alanları yazar | **Canlıya uygulandı (16.10.2026)** |
| `20261015130200_isdemir_wbs_from_group_label.sql` | İsdemir WBS + görevlere wbs_id/discipline | ROLLBACK ile test edildi; **eşleştirme tablosu onayı bekliyor** |
| `20261015130300_isdemir_baseline_freeze.sql` | İsdemir baseline ← plan | **Yazıldı, çalıştırılmadı** (ayrı onay: "teklif planı dondurma") |

## 1. Yedek

- `C:\fons-yedek\yedek-2026-10-15-is-plani\` (repo ve OneDrive dışında): 6 tablo × JSON + CSV, `MANIFEST.json` (SHA-256).
  - project_tasks 320, task_dependencies 116, task_monthly_plan 176, project_wbs 0, project_areas 0, area_wbs 0 satır.
  - SQL sayımlarıyla aynı.
- **Yöntem:** PostgREST, `.env.test`'teki admin hesabıyla (RLS altında admin her projeyi görür). Değerler ekrana basılmadı.
  `pg_dump` bu bilgisayarda kurulu değil; `C:\fons-yedek\.env.local` yok, `npm run db:backup` çalışmaz.
- **Free plan (Supabase dokümanı, 15.10.2026):**
  - Günlük otomatik yedek yalnızca Pro, Team ve Enterprise'da; Free'de yok.
  - Point-in-Time Recovery Pro + eklenti (aylık ~100 $'dan).
  - Branching Pro gerektiriyor; projede yalnızca `main` var, önizleme branch'i yok.
  - Supabase'in Free için önerisi düzenli dışa aktarım (`supabase db dump`).

## 2. Trigger riski: wbs_id / discipline toplu güncellemesi

`project_tasks` trigger'ları (canlı):

| Trigger | Zaman / olay | Fonksiyon | Bu güncellemede |
|---|---|---|---|
| `trg_project_tasks_identity_guard` | BEFORE INSERT/UPDATE (tüm kolonlar) | Activity ID değişmezliği; pasif WBS/alan atanamaz | Çalışır; yeni WBS'ler aktif, geçer. Yan etkisi yok |
| `trg_project_tasks_updated_at` | BEFORE UPDATE | `updated_at = now()` | Çalışır; yalnızca kendi satırı |
| `trg_sync_project_progress` | AFTER … **UPDATE OF progress_pct, planned_start, planned_end** | `projects.progress` yeniden hesaplar | **Tetiklenmez** |
| `trg_tasks_recompute_risks` | AFTER … **UPDATE OF planned_end, status** | `fn_recompute_auto_risks` → `project_risks` | **Tetiklenmez** |
| (yeni) `trg_project_tasks_site_chief_guard` | BEFORE INSERT/UPDATE | Şantiye şefi plan koruması | Oturumsuz (migration) bağlamda rol yok, etkisiz |

- **Bildirim:** `project_tasks`'ta bildirim üreten trigger yok. Bildirimler `daily_reports`, `invoices`, `purchase_requests`,
  `tickets` trigger'larından ve `add_task_progress` gibi fonksiyonlardan geliyor.
- **Realtime:** `project_tasks` realtime yayınında. Güncelleme açık İş Planı ekranlarına 92 UPDATE olayı olarak gider;
  ekranlar 2 saniyelik toplu yenilemeyle bir kez yeniden çeker. Bildirim satırı değildir.
- **Kanıt (Prova A, migration'ın birebir içeriği, ROLLBACK):**
  - bildirim 1273 → 1273;
  - risk sayısı 103 → 103 ve bütün risk satırları (updated_at dahil) aynı;
  - `projects` satırları aynı;
  - görevlerin `wbs_id`, `discipline`, `updated_at` dışındaki kolonları aynı.
- Migration bu karşılaştırmayı **kendi içinde de** yapıyor: fark varsa her şeyi geri alıp hata veriyor.
- Devre dışı bırakma gerekmedi.

## 3. WBS eşleştirmesi (onay bekliyor)

Kodlar iki projede aynı (kod proje içinde tekil). `›` alt seviyeyi belirtir. Görev disiplini = WBS disiplini;
kategorisi `elektrik_ac` olan görev `ac` (DYB1 EK1).

| group_label | wbs_code | Seviye (üst) | WBS disiplini | DYB1 görev | DYB2 görev |
|---|---|---|---|---|---|
| Mobilizasyon | `MOB` | 1 | civil | 3 (ŞM1-3) | 1 (M0) |
| Mekanik | `MEK` | 1 | mechanical | 8 (M1-M8) | 7 (M1-M7) |
| Elektriksel — DC | `ELK-DC` | 1 | dc | 6 (E1-E6) | 6 (E1-E5, E11) |
| Elektriksel — DC › Trafo Merkezi | `ELK-DC-TM` | 2 (ELK-DC) | dc | 7 (E7-E12, EK1→ac) | 5 (E6-E10) |
| Elektriksel — OG | `ELK-OG` | 1 | mv | 8 (E13-E20) | 7 (E13-E19) |
| Şalt Sahası | `SALT` | 1 | mv | 9 (ŞS1-ŞS9) | 5 (Ş1-Ş5) ⚠ |
| ENH | `ENH` | 1 | enh | 5 (N1-N5) | 2 (N1, N2) ⚠ |
| Kamera & Aydınlatma | `KAM` | 1 | ac | 5 (K1-K5) | — |
| KABUL | `KABUL` | 1 | general | 7 (T1-T3, İK1-İK4) | 1 (S4) |
| **Toplam** | | | | **58** (9 WBS) | **34** (8 WBS) |

- ⚠ DYB2'deki Ş1-Ş5 ve N1-N2 (7 görev) bilinçli olmayan değişiklikle eklendi (Karar 93: ENH ve şalt DYB1'de).
  Kullanıcı bunları ayrı oturumda geri alacak.
  - WBS bunlardan **önce** uygulanırsa: görev silinince `project_tasks.wbs_id` FK'si silmeyi engellemez (FK görev → WBS yönünde).
  - Ama DYB2'de boş kalan `SALT`/`ENH` WBS kayıtları elle silinmeli; WBS silme, görevi varken `ON DELETE RESTRICT` ile reddedilir.
  - Öneri: WBS'i 7 görev geri alındıktan **sonra** uygulamak. O zaman DYB2'de 6 WBS ve 27 görev olur, migration'daki kontroller kendiliğinden uyar.
- **Kod seçimi:** kısa anlamlı kodlar (MOB, MEK…). Alternatif sabit haneli sayısal (`DYB1-010`, Karar 46 şablon notu).
- **Disiplin soruları:** Şalt Sahası `mv` mi `hv` mi; Kamera & Aydınlatma `ac` mi `scada` mı;
  Mobilizasyon (hafriyat, depo alanı, işletme binası) `civil` mi.
- **Müşteri verisi:** migration yalnızca genel bölüm adlarını ve iki proje kimliğini içeriyor (ikisi de repoda zaten var).
  Görev adı ya da miktar yok.

## 4. Döngü kontrolü (Prova B, ROLLBACK)

`fn_task_dependencies_guard`'a recursive CTE eklendi. Yeni bağ "öncül → görev"; öncülün (doğrudan ya da dolaylı)
öncülleri arasında görev varsa reddedilir. Aynı projede eşzamanlı eklemeler proje bazlı advisory kilitle sıraya girer.
UPDATE'te satırın kendi eski bağı hesaba katılmaz.

DYB1'deki gerçek zincir E1 → E2 → E3 üzerinde:

| Deneme | Sonuç |
|---|---|
| E3'ü E1'in öncülü yap (dolaylı döngü) | **RED** 23514 "Döngüsel bağımlılık: E1 görevi, E3 görevinin zaten (doğrudan ya da dolaylı) öncülü. E3 görevini E1 görevinin öncülü yapmak döngü oluşturur." |
| E2'yi E1'in öncülü yap (doğrudan döngü) | **RED** 23514 |
| E1'i kendine öncül yap | **RED** 23514 |
| E1'i E3'ün öncülü yap (döngü yok) | **KABUL** |
| Güncelleme: E2'nin öncülünü E1 → E3 yap | **RED** 23514 |

## 5. Şantiye şefi trigger'ı (İP-4) — 4 rol, ROLLBACK

**Ön okuma (canlı gövdeler):**
- `get_my_role()` rolü `auth.uid()`'den okur. SECURITY DEFINER fonksiyonun içinde de **çağıranın** rolünü döndürür, yani trigger şantiye şefinin DEFINER akışlarında da çalışır.
- Bu akışların yazdığı kolonlar:
  - `sync_task_progress_from_daily`: total_progress, progress_pct, status, actual_start, updated_at;
  - `set_task_milestone_status`: status, progress_pct, actual_start, actual_end, updated_at;
  - `add_task_progress` görev satırına doğrudan yazmaz; `progress_daily` ekler, sync trigger'ı yazar.
- Hepsi izin listesinde.

**İlk prova bir hata yakaladı:**
- `duration_days` hesaplanan (GENERATED) kolon (`planned_end − planned_start`); BEFORE trigger'da `NEW` içinde henüz hesaplanmamış görünüyor.
- Şantiye şefinin `add_task_progress` ve `set_task_milestone_status` çağrıları dahil **her** güncellemesi "duration_days değişti" diye reddedildi.
- Trigger artık hesaplanan kolonları katalogdan okuyup karşılaştırmaya almıyor; aşağıdaki sonuçlar düzeltilmiş hâliyle.

Test: TIZ görevleri (E2 miktarlı, D1 kilometre taşı). Her rol gerçek kullanıcı kimliğiyle (`request.jwt.claims` + `authenticated` rolü, RLS açık).

| Deneme | admin | proje_yoneticisi | santiye_sefi | muhasebe |
|---|---|---|---|---|
| planned_end / planned_start | kabul | kabul | **red** | 0 satır (RLS) |
| target_qty | kabul | kabul | **red** | 0 satır |
| baseline_end / baseline_start | kabul | kabul | **red** | 0 satır |
| forecast_end / forecast_start | kabul | kabul | **red** | 0 satır |
| task_name, discipline | kabul | kabul | **red** | 0 satır |
| notes + actual_start, actual_end | kabul | kabul | **kabul** | 0 satır |
| status + progress_pct + total_progress | kabul | kabul | **kabul** | 0 satır |
| Yeni görev ekleme | kabul | kabul | **red** | red (RLS) |
| Bağımlılık ekleme | kabul | kabul | **red** | red (RLS) |
| `add_task_progress` (+1) | red (fonksiyon: yalnız şef/PM) | kabul | **kabul** (toplam 14 → 15) | red (fonksiyon) |
| `set_task_milestone_status` | red (fonksiyon) | kabul | **kabul** | red (fonksiyon) |

- Şantiye şefinin hata mesajı, reddedilen kolonu adıyla söylüyor: "Şantiye şefi plan alanlarını değiştiremez (planned_end). Yalnızca gerçekleşen başlangıç/bitiş, ilerleme, durum ve not güncellenebilir."
- **İzin listesi yaklaşımı:** İP-4'ün "yalnızca gerçekleşen alanlar" ifadesine göre adımda sayılmayan kolonlar da kapalı
  (task_name, category, unit, group_label, wbs_id, area_id, discipline, equipment_notes…). `equipment_notes` açılmalı mı: soru.
- Günlük rapor yolu (`save_daily_report` → `progress_daily` → sync trigger'ı) ayrıca koşulmadı. Aynı sync trigger'ını kullandığı ve
  yalnızca izinli kolonlara yazdığı gövdeden doğrulandı; uygulamadan sonra şantiye şefi hesabıyla bir günlük rapor
  denemesi (test projesinde) önerilir.

## 6. Öncül karşılaştırması (notlar ↔ task_dependencies, veri değişmedi)

| Proje | Notlu görev | Not çifti | Tablo kaydı | Eşleşen | Notta olup tabloda olmayan | Tabloda olup notta olmayan |
|---|---|---|---|---|---|---|
| DYB1 | 53 | 74 | 74 | 74 | 0 | 0 |
| DYB2 | 31 | 40 | 42 | 40 | 0 | 2 |
| **Toplam** | **84** | **114** | **116** | **114** | **0** | **2** |

- **Tabloda olup notta olmayan (DYB2):** `E19 ← Ş5` (SS, 0 gün) ve `S4 ← N2` (FS, 0 gün). İkisi de bilinçsiz eklenen 7 görevden
  birine bağlı. Karar 93'e göre E19'un Ş5 öncülü nota dönmüştü ("Ortak şalt sahası enerjilendirmesi DYB1 ŞS7'ye bağlı");
  bu iki kayıt o değişikliğin parçası, geri almada silinmeli.
- **Tip ve gecikme farkı:** notlar yalnızca görev kodu taşıyor ("Öncül: E5,E9"); tip ve gecikme bilgisi yok, karşılaştırılamaz.
  - Eşleşen 114 bağın 67'si SS: DYB1'de 44, DYB2'de 23; gecikmeler 0-242 gün (en büyüğü DYB1 ŞS6 ← ŞS3, SS+242).
  - 47'si FS ve 0 gün. Notu okuyan biri hepsini "bitince başlar" sanabilir.
  - İP-3 ile kaynak tablo; not yalnızca bilgi.
- Sorgu: aşağıdaki §10.

## 7. Baseline dondurma (yazıldı, çalıştırılmadı)

`20261015130300_isdemir_baseline_freeze.sql` iki İsdemir projesinde `baseline_* ← planned_*` yazar. Ön koşulları:
1. **İP-2:** her görevin aylık plan toplamı = `target_qty`;
2. baseline daha önce dondurulmamış;
3. plan tarihleri dolu.

Biri tutmazsa hiçbir şey yazmaz; bildirim, risk ve proje değişmezliğini kendi içinde doğrular.
Kaptan, Kayseri ve İzmir'e dokunmaz.

**Kontrol sorgusunun bugünkü sonucu (salt okunur):** DYB1 58/58, DYB2 34/34 görevde aylık toplam = hedef; baseline boş.
Dondurma bugün **izinli**. Ama DYB2'nin 7 bilinçsiz görevi geri alınmadan dondurulursa bunlar baseline'a girer. Öneri: önce geri alma.

Not: dosya `supabase/migrations` altında. Bu projede migration'lar `apply_migration` ile tek tek uygulandığı için
kendiliğinden çalışmaz; ama biri `supabase db push` kullanırsa uygulanır. İsterseniz dondurma onayına kadar
`supabase/migrations-bekleyen/`'e taşıyabilirim.

## 8. Uygulama sırası önerisi (onaydan sonra)

1. `20261015130000` (bağımlılık döngü + şef koruması) ve `20261015130100` (görev şef koruması).
   - Mesai dışı kuralı ve yedek kuralı (Karar 67) geçerli; yedek bu sefer REST dışa aktarımı.
2. DYB2'nin 7 görevi geri alındıktan sonra `20261015130200` (WBS); önce/sonra bildirim ve risk sayıları.
3. "Teklif planı dondurma" onayıyla `20261015130300`.
4. Kural 7: iki docx'e `project_wbs` doluluğu, şantiye şefi trigger'ı ve döngü kontrolü eklenmeli.

## 9. Açık sorular

1. Şalt Sahası `mv`/`hv`, Kamera & Aydınlatma `ac`/`scada`, Mobilizasyon `civil` onayı.
2. WBS kodları: kısa kodlar (MOB, MEK…) mı, sabit haneli sayısal mı?
3. Şantiye şefi `equipment_notes` yazabilsin mi?
4. WBS ve baseline, DYB2 geri alındıktan sonra mı (öneri) uygulanacak?
5. Baseline migration'ı `supabase/migrations`'ta mı kalsın, bekleyen klasöre mi taşınsın?
6. İP-5 kod değişikliği ("Riskli" her zaman bugüne göre) bir sonraki ön yüz adımında yapılacak.

## 9b. Faz 1 kapanışı adım 3 — 130100 ön kontrolü (15.10.2026, salt okunur)

**Veritabanı** (`pg_proc.prosrc`, `public`; dinamik SQL yok):

| Fonksiyon | Tür | project_tasks'a yazdığı kolonlar | İzin listesinde mi |
|---|---|---|---|
| `sync_task_progress_from_daily` | DEFINER, `progress_daily` AFTER trigger'ı | total_progress, progress_pct, status, actual_start, updated_at | Evet |
| `set_task_milestone_status` | DEFINER RPC (şef, PM) | status, progress_pct, actual_start, actual_end, updated_at | Evet |

- `project_tasks`'a INSERT eden fonksiyon yok; `task_dependencies`'e yazan fonksiyon yok.
- `add_task_progress` görev satırına yazmıyor; `progress_daily`'ye ekliyor, yazımı sync trigger'ı yapıyor.
- Okuyanlar: get_project_gantt, get_project_by_date, fn_recompute_auto_risks, fn_sync_project_progress vb.
- `import-project-excel` (edge function) yazmayı servis anahtarıyla yapıyor: rol bağlamı yok, trigger etkisiz.
  Çağıran yalnızca admin/PM olabiliyor (fonksiyonun kendi kontrolü).

**Ön yüz** (`origin/main` 2e3ff8e = canlıdaki kod, ve `is-plani-revizyon`):

| Yol | Yazdığı | Ekran / rol |
|---|---|---|
| Sihirbaz `Adim8Tamamlandi` / `ProjeEditWizard` (main): `from(table).delete()` + `.insert()` | project_tasks'ın bütün kolonları | Proje Yönetimi; yalnız admin, PM (şefte `projeler`/`proje-ekle` sekmesi yok) |
| `TabProjeYonetimi` proje silme | project_tasks delete | admin, PM |
| `TabIsPlaniDetay` → `add_task_progress` | (sync trigger'ı) izinli kolonlar | şef, PM |
| `TabIsPlaniDetay` → `set_task_milestone_status` | izinli kolonlar | şef, PM |
| `DailyReportForm` → `save_daily_report` | progress_daily → sync trigger'ı, izinli kolonlar | şef (ve raporu açan roller) |
| Dalda (faz-a, canlıda yok): `GorevSiniflandirmaModals` update (sınıflandırma, iptal), `save_project_tasks`, `set_tasks_classification`, `assign_activity_ids` | sınıflandırma kolonları, status | yalnız admin, PM (`canManage`) |
| `task_dependencies` | — | Ön yüzde hiç yazan yok |

**Sonuç:** şantiye şefinin ekranlarından izin listesi dışında bir kolona (responsible, responsible_role, team_size,
group_label…) yazan yol yok. Şefin bugün bu kolonlara yazabilmesinin tek yolu doğrudan API çağrısı (RLS izin
veriyor); 130100 tam olarak onu kapatıyor.

## 10. Karşılaştırma sorgusu (salt okunur)

```sql
with note_pairs as (
  select t.project_id, t.id task_id, t.task_code, btrim(tok) pred_code
  from project_tasks t
  cross join lateral regexp_split_to_table(substring(t.notes from 'Öncül:\s*([^\n]*)'), '\s*[,;]\s*') tok
  where t.project_id like 'isdemir-diyarbakir-arazi-faz%' and t.notes ~ 'Öncül:' and btrim(tok) <> ''
), note_res as (
  select n.*, p.id pred_id from note_pairs n
  left join project_tasks p on p.project_id = n.project_id and p.task_code = n.pred_code
), deps as (
  select d.project_id, d.task_id, t.task_code, d.predecessor_id pred_id, p.task_code pred_code, d.dep_type, d.lag_days
  from task_dependencies d join project_tasks t on t.id = d.task_id join project_tasks p on p.id = d.predecessor_id
  where d.project_id like 'isdemir-diyarbakir-arazi-faz%'
)
select 'notta_var_tabloda_yok' tur, n.project_id, n.task_code, n.pred_code, null dep_type, null::int lag_days
  from note_res n where not exists (select 1 from deps d where d.task_id = n.task_id and d.pred_id = n.pred_id)
union all
select 'tabloda_var_notta_yok', d.project_id, d.task_code, d.pred_code, d.dep_type, d.lag_days
  from deps d where not exists (select 1 from note_res n where n.task_id = d.task_id and n.pred_id = d.pred_id)
union all
select 'eslesen_tip_gecikmeli', d.project_id, d.task_code, d.pred_code, d.dep_type, d.lag_days
  from deps d where exists (select 1 from note_res n where n.task_id = d.task_id and n.pred_id = d.pred_id)
   and (d.dep_type <> 'FS' or d.lag_days <> 0)
order by 1, 2, 3, 4;
```
