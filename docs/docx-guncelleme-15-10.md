# docx dokümantasyon güncellemesi — 15.10.2026

CLAUDE.md kural 7 gereği: `task_monthly_plan`, `vw_task_monthly_plan_vs_actual` ve `task_dependencies`
iki dokümana işlendi. Dosyalar repo dışında; bu not yapılan değişikliğin kaydıdır.

| Dosya | Yer | Yedek (değişiklik öncesi) |
|---|---|---|
| `fons_solar_sistem_dokumantasyonu.docx` | `OneDrive\Masaüstü\` | `fons_solar_sistem_dokumantasyonu.yedek-15-10.docx` (aynı klasör) |
| `fons_solar_veritabani_dokumantasyonu.docx` | `C:\Users\fonss\Claude\Projects\Fons Solar\` | `fons_solar_veritabani_dokumantasyonu.yedek-15-10.docx` (aynı klasör) |

Yalnızca `word/document.xml` değişti; diğer parçalar (stiller, yazı tipleri, görseller) bayt bayt aynı.
Yeni paragraf ve tablolar dokümandaki mevcut blokların kopyasıdır (biçim aynı); kopyalanan
paragraf kimlikleri (`w14:paraId`) benzersiz yenilendi.

## Sistem dokümantasyonu
- **Başlık altı tarih satırı:** "· 15.10.2026 (Aylık İş Planı: task_monthly_plan, vw_task_monthly_plan_vs_actual, task_dependencies)" eklendi.
- **3.1 Modül – Tablo Haritası:** "Proje yönetimi" satırına `task_monthly_plan (görev × ay planı)`, `task_dependencies (öncül/ardıl ilişkileri)`.
- **5.2 Proje Detayı:** İş Planı tanımına "Aylık: görev × ay plan ızgarası, salt okunur".
- **Yeni 6.9 Aylık İş Planı ve Görev Bağımlılıkları (15.10.2026):**
  - bölüm seçimi ve `?view=`;
  - ızgara, hücre modları ve renk eşikleri;
  - görünümün veri kaynağı;
  - `task_monthly_plan` kolonları, kaynak türleri ve yetki;
  - `task_dependencies` (FS/SS/FF/SF + `lag_days`, aynı proje kuralı, ekranda henüz yok).

## Veritabanı dokümantasyonu
- **Yeni 2.7 `task_monthly_plan` — Görev Aylık Planı:**
  - açıklama;
  - kolon tablosu: id, project_id/task_id bileşik FK, month, planned_qty, source, source_code/qty/unit, note, zaman damgaları, unique + RLS.
- **Yeni 2.8 `task_dependencies` — Görev Bağımlılıkları:**
  - açıklama;
  - kolon tablosu: id, project_id, task_id, predecessor_id, dep_type, lag_days, zaman damgaları, kısıtlar + guard trigger + RLS.
- **12.1 View'lar:** `vw_task_monthly_plan_vs_actual` satırı eklendi.

## Bu güncellemede olmayanlar
- **Diğer sayılar:** Sistem dokümanındaki "~55 tablo + 7 view" sayısı ve diğer bayat bölümler değiştirilmedi. Veritabanı dokümanı 09.07.2026 sürümüdür; yalnızca yeni nesneler eklendi.
- **14.10.2026 F5 metni:** Change, Claim, Interface metni (`faz-a-proje-kontrol` dalında `docs/proje-kontrol/docx-guncelleme-14-10.md`) bu dosyalara henüz işlenmemiş görünüyor. Sistem dokümanı en son 07.10'da değişmişti. Bu güncellemenin kapsamı dışında.
- **Risk motoru:** Sahipsiz gecikme risklerini kapatan migration onay bekliyor. Uygulanınca sistem dokümanının 6.5 bölümüne ayrıca eklenecek.
