# Fons Solar — Canlı Veri Denetim Raporu (FAZ A)

Değişiklik içermez, yalnızca tespit. Kaynaklar: tüm dashboard/rapor bileşenleri,
14 RPC'nin `pg_get_functiondef` çıktısı, `vw_progress_timeline` view tanımı,
`grep -rn` ile realtime/mock/interval taraması. Bu rapor `DENETIM_RAPORU.md`
(FAZ 1) ile örtüşen bulguları tekrar etmez, sadece canlılık/kapsam/zaman serisi
açısından yeni olanları ekler.

## Özet — 4 garanti şu an ne durumda

| Garanti | Durum |
|---|---|
| 1. Canlılık (mock yok) | ✅ Statik/mock veri **bulunamadı** — tüm sayısal değerler RPC'den geliyor. Sabit diziler yalnızca dropdown etiketleri (renk/label eşlemesi), veri değil. |
| 2. Çift kapsam | ⚠️ Yalnızca **Finans** ve **Satın Alma**'da var (`_all` deseni). Diğer 8 RPC'nin hiçbirinde tek-proje/tüm-proje geçişi yok. `get_dashboard_summary` ise tam tersi bir sorun: hiç parametre almıyor, **her zaman ve herkese** tüm veritabanının toplamını dönüyor. |
| 3. Otomatik güncelleme | ❌ Sistemde **tek bir yerde** Supabase Realtime kullanılıyor: `useSantiyeData.js`. Geri kalan tüm dashboard'lar yalnızca mount'ta / bağımlılık değiştiğinde çekiyor, arka planda kendini yenilemiyor. |
| 4. Kesintisizlik | ❌ Ortak bir veri-çekme hook'u yok; her bileşen kendi `loading`/`error` state'ini ayrı yönetiyor. Yenileme sırasında ekranın boşalıp boşalmadığı bileşen bazında değişiyor (çoğu `loading` true olunca eski veriyi値 `EMPTY_*` sabitleriyle geçici olarak eziyor — bkz. aşağıda). Zaman serisi tarafında tek gerçek örnek (finans aylık akış) zaten boşluksuz. |

---

## 1) Dashboard/Rapor Sayfaları Envanteri

| Ekran | Dosya | RPC | Ne zaman çekiliyor | Kapsam |
|---|---|---|---|---|
| Genel Bakış (özet kartlar) | `TabGenel.jsx` | `get_dashboard_summary()` | Mount'ta, tek sefer | **Parametre yok** — her zaman tüm veritabanı, kapsam seçimi mümkün değil |
| Genel Bakış (proje detay bölümü) | `TabGenel.jsx` (aynı dosya, ayrı fonksiyon) | `get_project_dashboard(p_project_id, p_effective_date)` | `[projectId, effectiveDate]` değişince | Tek proje, `_all` yok |
| Finans — Genel (tüm projeler) | `TabFinans.jsx` | `get_finans_overview_all(p_as_of_date)` | Mount'ta (tab yeniden seçilince tab bileşeni remount olduğu için fiilen yenilenir) | **Çift kapsam VAR** |
| Finans — proje özel | `ProjeTabFinans.jsx` | `get_finans_overview(p_project_id, p_as_of_date)` | `[projectId, asOfDate]` değişince | **Çift kapsam VAR** |
| Satın Alma — Genel | `TabSatinAlma.jsx` | `get_satin_alma_overview_all()` | Mount'ta | **Çift kapsam VAR** |
| Satın Alma — proje özel | `ProjeTabSatinAlma.jsx` | `get_satin_alma_overview(p_project_id)` | `[projectId]` değişince | **Çift kapsam VAR** |
| Şantiye Şefi Dashboard | `SantiyeSefiDashboard.jsx` → `useSantiyeData.js` | `get_santiye_dashboard(p_project_id, p_today)` | Mount + **Realtime** (aşağıda) + modal kapanışında manuel `refetch()` | Tek proje (saha rolü zaten tek projeye atanmış); `_all` yok, gerekliliği tartışmalı |
| Günlük Rapor Listesi | `DailyReportList.jsx` | `get_daily_reports_list(...)` | `[projectId, start, end, page]` değişince; rapor kaydından dönüşte `reportViewKey` ile zorla remount (event-tetiklemeli ama realtime değil) | Tek proje |
| Günlük Rapor Detayı | `DailyReportDetail.jsx` | `get_daily_report_detail(p_report_id)` | Mount'ta | Tekil kayıt |
| Proje Detay | `ProjeDetay.jsx` | `get_proje_detay(p_project_id)` + ayrıca ham sorgularla günlük rapor detayı (bkz. `DENETIM_RAPORU.md` §A.1) | `[projectId]` değişince | Tek proje |
| İş Planı / Gantt | `TabIsPlan.jsx` | `get_project_gantt(p_project_id, p_filter_date)` | `[projectId, filterDate]` değişince | Tek proje; kavramsal olarak "tüm proje Gantt'ı" anlamlı olmayabilir |
| Proje Genel Bakış (tarihli) | `ProjectOverviewDashboard.jsx` | `get_project_by_date(p_project_id, p_date)` | `[projectId, date]` değişince | Tek proje |
| — | — | `get_project_overview(p_project_id, p_start, p_end)` | **Hiçbir dosyada çağrılmıyor** | Ölü RPC — 17 farklı veri bölümü (görevler, ilerleme, bütçe, riskler, ticket, fotoğraf...) döndüren, tamamlanmış ama hiç bağlanmamış kapsamlı bir "proje özet raporu" fonksiyonu. `ProjeDetay.jsx`/`TabGenel.jsx`'in kendi ham sorgularının yerini büyük ölçüde alabilir. |

**Ayrıca ölü/kullanılmayan yazma RPC'leri** (bu rapor kapsamında değil ama canlılıkla dolaylı ilgili — `DENETIM_RAPORU.md` §A.1'de detaylandırıldı): `save_daily_report`, `increment_progress_total` — hiç çağrılmıyor, günlük rapor kaydı bunların yerine 9+ ham sorguyla yapılıyor.

### Mock/statik veri taraması sonucu

`mock|dummy|örnek veri|sample data` ve büyük harfli sabit dizi (`const [A-Z_]+ = [{...`)
desenleriyle tüm `src/` tarandı. Bulunan tek eşleşmeler `Adim4Riskler.jsx` ve
`Adim5Tedarik.jsx`'teki `PRI_OPTS`/`STA_OPTS` gibi dropdown etiket sabitleri —
bunlar veri değil, form seçenek listeleri (CHECK constraint değerleriyle
eşleşiyor). **Gerçek anlamda statik/mock veri bulunamadı** — bu konuda sistem
temiz.

---

## 2) RPC Kapsam Matrisi

| RPC | Tek proje | Tüm projeler | Not |
|---|---|---|---|
| `get_finans_overview` / `get_finans_overview_all` | ✅ | ✅ | Desen doğru uygulanmış (bu oturumda kuruldu) |
| `get_satin_alma_overview` / `get_satin_alma_overview_all` | ✅ | ✅ | Desen doğru uygulanmış |
| `get_dashboard_summary` | — | ⚠️ "var" ama parametresiz | **SORUNLU**: Rol/proje ayrımı yapmıyor. Fonksiyon gövdesinde `project_id` filtresi hiç yok — `tickets`, `budget_lines`, `invoices` tablolarının tamamını sayıyor. SECURITY DEFINER olduğu için RLS de bypass ediliyor. FAZ B'nin öngördüğü "saha rolü yalnızca erişebildiği projelerin toplamını görür" kuralı şu an bu RPC'de **hiç yok** — herkes her şeyi görüyor. |
| `get_project_dashboard` | ✅ | ❌ | `_all` yok; FAZ B'de `p_project_id IS NULL` dalı eklenebilir |
| `get_project_overview` | ✅ (parametreli ama) | ❌ | **Hiç çağrılmıyor** |
| `get_project_gantt` | ✅ | ❌ | Muhtemelen gerekmez (Gantt tek proje kavramı) |
| `get_santiye_dashboard` | ✅ | ❌ | Saha rolü zaten tek projeli; gerekliliği düşük |
| `get_proje_detay` | ✅ | ❌ | — |
| `get_project_by_date` | ✅ | ❌ | — |
| `get_daily_reports_list` | ✅ | ❌ | Muhtemelen gerekmez (kullanıcının kendi projesinin raporları) |

**Sonuç:** 10 dashboard RPC'sinden yalnızca 2'si (Finans, Satın Alma) çift
kapsamı destekliyor. `get_dashboard_summary` ayrı bir öncelik — parametre
eksikliği hem "çift kapsam" hem "RLS/yetki" ihlali (bkz. yukarı, madde 2 ve
`DENETIM_RAPORU.md` §B'deki `anon`/rol kontrolsüz RPC bulgusuyla aynı aile).

---

## 3) Zaman Serisi / Boşluk Doldurma

| Kaynak | Granülerlik | Boşluk dolduruluyor mu? |
|---|---|---|
| `get_finans_overview(_all)` → `curve[]` | Aylık (proje start_date→target_date) | ✅ **Evet** — `generate_series(date_trunc('month', ...), ..., interval '1 month')` ile her ay üretiliyor, kayıt olmayan aylar da `planned` değeriyle (S-eğrisi) görünüyor, `actual` gelecek aylar için `NULL`. |
| `vw_progress_timeline` (view) | Günlük | ❌ **Hayır** — `daily_reports` üzerinden `GROUP BY report_date`; yalnızca **rapor girilen günler** satır üretiyor. Şu an `get_project_overview` içinde `ORDER BY report_date DESC LIMIT 1` ile sadece son nokta kullanıldığı için sorun görünmüyor (ve `get_project_overview` zaten hiç çağrılmıyor) — ama bu view doğrudan bir "İlerleme Zaman Çizelgesi" grafiğine bağlanırsa hafta sonları/rapor girilmeyen günler grafik çizgisinde sıçrama/kopukluk olarak görünür. |
| `vw_monthly_progress`, `vw_weekly_progress` | Aylık/haftalık | Kontrol edilemedi — **hiçbir frontend dosyasında veya bilinen RPC'de kullanılmıyor**, muhtemelen yetim view (muhtemelen aynı "sadece kayıt olan dönem" mantığı, `vw_progress_timeline` ile aynı CTE ailesinden). |
| Diğer tüm RPC'ler (`get_santiye_dashboard`, `get_proje_detay`, `get_project_dashboard`, `get_project_gantt`, `get_project_by_date`, `get_daily_reports_list`) | — | Zaman serisi **döndürmüyorlar** — yalnızca anlık toplam/liste/durum. Boşluk doldurma kavramı bu RPC'ler için geçerli değil. |

**Sonuç:** Sistemde tek gerçek "tarih aralığı boyunca seri" örneği finans aylık
akışı ve o zaten doğru dolduruluyor. FAZ B'nin 3. maddesi (genel boşluk doldurma
kuralı) şu an için yalnızca **gelecekte** `vw_progress_timeline`/`vw_monthly_progress`/`vw_weekly_progress`
tabanlı bir grafik RPC'si yazılırsa devreye girecek bir kural — bugün aktif bir
ihlal yok, ama bu view'lar kullanılmaya başlanırsa `generate_series` ile
tarih iskeletine LEFT JOIN edilmeleri gerekecek.

---

## 4) Otomatik Güncelleme — mevcut durum

`grep -rn "postgres_changes\|\.channel(\|setInterval\|visibilitychange" src/`
sonucu **tek dosya**: `src/hooks/useSantiyeData.js` — 3 kanal (`ss-tickets`,
`ss-prs`, `ss-daily`), kendi projesine filtreli, `fetchAll` callback'ini
tetikliyor. Debounce yok (her olayda anında yeniden çekiyor) — art arda kayıtta
(örn. toplu personel girişi) ekran birden fazla kez yenilenebilir, FAZ D'nin
öngördüğü debounce henüz yok.

Başka hiçbir yerde `setInterval`, `visibilitychange` dinleyicisi veya
`supabase.channel(...)` kullanımı yok. Yani Finans, Satın Alma, Genel Bakış,
Gantt, Proje Detay, Günlük Rapor Listesi ekranları **sekmede açık dursa bile
kendiliğinden yenilenmiyor** — kullanıcı sekme değiştirip geri dönmedikçe
(veya sayfayı yenilemedikçe) veri bayatlar.

---

## 5) Ortak veri çekme deseni — tutarsızlıklar

- Her ekran kendi `EMPTY_*` sabit objesini tanımlıyor (`EMPTY_KPI`, `EMPTY_SAPMA`,
  `EMPTY_COST_BUCKETS` vb. — `ProjeTabFinans.jsx`/`TabFinans.jsx`'te ikişer kopya)
  ve `loading` true olduğunda genelde bu boş objeyle render ediyor (ekran
  boşalmıyor ama sıfırlanıyor) — FAZ C'nin "önceki veri ekranda kalsın" kuralı
  şu an bileşen bazında tutarsız uygulanıyor.
- Hata durumunda çoğu bileşen `console.error` + boş/`EMPTY_*` state'e düşüyor,
  kullanıcıya görünür bir Türkçe hata bandı yok (`DailyReportList.jsx` istisna —
  orada `loadError` state'i ve görünür mesaj var).
- Ortak bir `useDashboardData`/`useRealtimeRefresh` hook'u yok; her dosya kendi
  `useEffect(() => { supabase.rpc(...).then(...) }, [...])` desenini ayrı ayrı
  yazmış (10+ tekrar).

---

## Onay Beklentisi

Bu rapor bir tespit dokümanıdır, değişiklik yapılmadı. FAZ B'ye geçmeden önce
şu öncelik sırasını öneriyorum ve onayınızı bekliyorum:

1. `get_dashboard_summary`'e rol/proje bazlı kapsam ekle (şu an herkese tüm
   veritabanını açık veriyor — güvenlik + kapsam sorunu bir arada).
2. Kalan 8 tek-proje RPC'sine `p_project_id NULL → erişilebilir projelerin
   toplamı` deseni ekle (öncelik: `get_project_dashboard`, `get_proje_detay`).
3. Ortak `useDashboardData` hook'u + Türkçe hata bandı standardı (FAZ C).
4. Realtime'ı `useSantiyeData.js` dışındaki dashboard'lara yay + debounce ekle
   (FAZ D).
5. `get_project_overview` için karar: kullanılmaya başlanacak mı, yoksa
   kaldırılacak mı? (Şu an ne kullanılıyor ne silinmiş, belirsiz durumda.)
