# Veri sözlüğü: İş Planı (görevler, tarihler, WBS ve alan)

Canlı şemadan doğrulandı (15.10.2026, proje `bshhgvdzemgfijkzhcrf`). Çelişki olursa canlı şema geçerlidir.

## 1. İlerleme: `progress_pct` ve `total_progress`

| Kolon | Tür | Anlamı | Kim yazar |
|---|---|---|---|
| `project_tasks.target_qty` | numeric | Görevin **hedef miktarı**, görevin biriminde (`unit`: m, adet, kWp…). 0 ya da boş ise görev **kilometre taşıdır** (miktarla ölçülmez). | Plan alanı: admin, proje_yoneticisi, Excel import |
| `project_tasks.total_progress` | numeric | **Kümülatif gerçekleşen miktar**, görevin biriminde: görevin bütün `progress_daily.qty_added` satırlarının toplamı. Yüzde değil. | `sync_task_progress_from_daily` (progress_daily trigger'ı) |
| `project_tasks.progress_pct` | numeric(5,2) | **Yüzde** (0-100). Miktarlı görevde `min(100, total_progress / target_qty × 100)`, 1 ondalık. Kilometre taşında durumdan: tamamlandı 100, beklemede/iptal 0, diğerlerinde elle girilen değer korunur. | `sync_task_progress_from_daily`, `set_task_milestone_status` |
| `progress_daily.qty_added` | numeric | Bir günlük rapordaki **o günün eklenen miktarı** (görev biriminde). | Günlük rapor (`save_daily_report`), `add_task_progress` |
| `projects.progress` | integer | Proje yüzdesi: kategori ağırlıklı ortalama (`project_category_weights`), ağırlık yoksa süre ağırlıklı. | `fn_sync_project_progress` (görevde `progress_pct` veya plan tarihleri değişince) |

Notlar:
- `progress_pct` her zaman **yüzde**, `total_progress` her zaman **miktar**. Ekranda "İlerleme %" `progress_pct`'ten;
  "Tamamlanan" ve "Kalan" (`target_qty − total_progress`) miktardan gösterilir.
- `get_project_gantt.task_progress`, seçilen tarihe kadarki `progress_daily` toplamından **o tarihteki** yüzdeyi
  hesaplar (geçmişe dönük görünüm). `project_tasks.progress_pct` ise bugünkü değerdir.
- Aylık planlanan miktar: `task_monthly_plan.planned_qty` (görev biriminde). Bir görevin aylık toplamı
  `target_qty`'ye eşit olmalı (İP-2; eşit değilse baseline dondurulamaz).

## 2. Tarih alanları

Tüm tarih kolonları `date` (saat yok, saat dilimi yok). Ön yüzde `YYYY-MM-DD` metni olarak taşınır
(`src/lib/isPlan/dates.js`); "bugün" Europe/Istanbul'a göredir.

| Kolon çifti | Anlamı | Kim yazar | Şantiye şefi |
|---|---|---|---|
| `planned_start` / `planned_end` | **Güncel plan.** Görevin bugün geçerli planlanan başlangıç ve bitişi. Gantt çubuğu, gecikme ve otomatik risk buna göre. `planned_start` NOT NULL. | Admin, proje_yoneticisi, sihirbaz, Excel import | Yazamaz (İP-4) |
| `baseline_start` / `baseline_end` | **Dondurulmuş temel plan** (teklif/sözleşme planı). Bir kez, onayla dondurulur; sonraki plan değişiklikleri buna göre sapma olarak ölçülür. İsdemir'de henüz boş; dondurma ayrı onay adımı (`20261015130300`). Kaptan Demir, TIZ ve TKY'de dolu. | Dondurma migration'ı / ileride admin | Yazamaz |
| `actual_start` / `actual_end` | **Gerçekleşen.** İlk ilerleme girildiği gün `actual_start` (sync trigger'ı, boşsa `CURRENT_DATE`); kilometre taşı tamamlandığında `actual_end`. Miktarlı görev %100 olunca `actual_end` **otomatik yazılmıyor** (bugünkü davranış). | Trigger'lar, `set_task_milestone_status`, elle | Yazabilir |
| `forecast_start` / `forecast_end` | **Tahmin.** Gerçekleşen ve kalan işe göre beklenen tarih. Bugün hiçbir projede dolu değil; hesaplayan bir mekanizma yok (kritik yol fazı). | Henüz kimse | Yazamaz |
| `duration_days` | Hesaplanan kolon (GENERATED): `planned_end − planned_start`. **Uç günleri dahil etmez** (1 Eki → 31 Eki = 30). Ekrandaki "Süre" ise uçlar dahil sayılır (`daysInclusive`, 31). | Veritabanı | — |

Sapma tanımları (ön yüz, `src/lib/isPlan/delay.js`):
- **Sapma (Detaylı tablo):** gerçek bitiş varsa `actual_end − planned_end`; yoksa ve plan bitişi geçmişse açık
  görevde `asOf − planned_end`. `asOf` ekranın filtre tarihi (İP-5).
- **Riskli / geciken:** plan bitişi bugünden önce ve görev tamamlandı/iptal değil. Risk motoru
  (`fn_recompute_auto_risks`) da `current_date` ile aynı kuralı kullanır.

## 3. WBS, alan ve disiplin

```
projects ─┬─ project_wbs   (ağaç: parent_id, level; wbs_code proje içinde tekil)
          ├─ project_areas (ağaç: parent_id; area_code proje içinde tekil, ^[A-Z0-9]+$)
          ├─ area_wbs      (çoka çok: bir alan birden çok WBS'te, bir WBS birden çok alanda)
          └─ project_tasks ─ wbs_id  → project_wbs  (proje bileşik FK, ON DELETE RESTRICT)
                           ─ area_id → project_areas (proje bileşik FK, ON DELETE RESTRICT)
                           ─ discipline (metin; Karar 20 anahtarları)
```

| Kavram | Anlamı | Biçim |
|---|---|---|
| **WBS** (`project_wbs`) | İşin **ne** olduğu: iş kırılımı (Mekanik › Kolon montajı gibi). Hiyerarşik; `level` trigger'la hesaplanır (kök 1). | `wbs_code` `^[A-Z0-9][A-Z0-9-]*$`, örn. `ELK-DC-TM`; `name` serbest |
| **Alan** (`project_areas`) | İşin **nerede** yapıldığı: saha bölümü (blok, inverter istasyonu, trafo merkezi…). `area_type` sabit listeden. | `area_code` `^[A-Z0-9]+$` (tiresiz, Karar 32) |
| **Alan-WBS bağı** (`area_wbs`) | Hangi WBS'in hangi alanlarda yürüdüğü. Activity ID atamasında (Karar 38) görevin alanı, WBS zincirindeki bağlı alanlardan biri olmalı. | — |
| **Disiplin** (`project_tasks.discipline`, `project_wbs.discipline`) | İşi yapan mühendislik kolu. | Anahtarlar (Karar 20): mechanical, dc, ac, mv, hv, enh, civil, scada, general. Canlıda bugün sözlük tablosu (`task_disciplines`) ve FK yok; 6a ile gelecek (Karar 37) |
| **group_label** | Ekrandaki gruplama metni ("A › B" = alt seviye). WBS'in eski/serbest hâli; İsdemir'de WBS bundan türetildi. Ekran bugün hâlâ `group_label`'a göre gruplar. | Serbest metin |
| **Activity ID** (`activity_id`) | Sistemin ürettiği görev kimliği `{PROJE}-{DİSİPLİN}-{ALAN}-{NNNN}` (Karar 18). Atandıktan sonra değişmez. Canlıda hiç atanmadı (Karar 69). | `^[A-Z0-9][A-Z0-9-]*$` |

Bugünkü durum (15.10.2026): `project_wbs`, `project_areas`, `area_wbs` boş; hiçbir görevde `wbs_id`, `area_id`,
`discipline` dolu değil. İsdemir WBS'i migration `20261015130200` ile dolacak (onay bekliyor).
