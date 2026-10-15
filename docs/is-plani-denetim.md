# İş Planı denetimi (15.10.2026)

Kapsam: İş Planı sayfasının bugünkü hali. Bu adımda kod, migration ve veri değişmedi.
Canlıya yalnızca salt okunur SELECT yapıldı. Tarih hesaplarındaki hatalar Node'da
`TZ=Europe/Istanbul` ile, kaynak koddan birebir kopyalanan fonksiyonlarla doğrulandı.

**Hangi kod denetlendi.** İş Planı kodu üç dala dağılmış durumda. Denetim, üçünü
birleştiren yerel `local/entegrasyon` dalında (`GES_Dashboard-entegrasyon` klasörü) yapıldı:

| Parça | `main` | `faz-a-proje-kontrol` | `feature/aylik-is-plani` |
|---|---|---|---|
| `TabIsPlan.jsx`, `TabIsPlaniDetay.jsx` (Genel + Detaylı) | var | var + Adım 5 kolonları | var + Aylık sekmesi |
| `TabIsPlaniAylik.jsx`, `utils/aylikPlan.js` | yok | yok | var |
| `useProjectStructure.js`, `is-plani/`, `proje-ayarlari/` (Adım 5) | yok | var | yok |

Revizyon hangi dalda yapılacaksa önce bu iki dalın birleşme sırası belirlenmeli (bkz. Riskler R1).

---

## 1. Dosyalar

### Bileşenler

| Dosya | Satır | Görev |
|---|---|---|
| `src/pages/dashboard/components/TabIsPlan.jsx` | 1089 | Sayfa kabuğu: veri çekme, bölüm seçici (`?view=gantt\|detay\|aylik`), KPI şeridi, Gantt çizimi, görev detay paneli. Ortak yardımcıları da dışa aktarıyor: `buildGroupTree`, `collectNodeTasks`, `groupConfigFor`, `resolveGroup`, `fmtDate`, `daysBetween`, `statusLabel`, `riskSeverityLabel`, `GROUP_ORDER`, `GROUP_INDENT_PX` |
| `src/pages/dashboard/components/TabIsPlaniDetay.jsx` | 637 | Detaylı tablo: Plan/Gerçek/Sapma, filtre ve sıralama, ilerleme girişi (`ProgressEntryModal`), kilometre taşı durumu (`InlineMilestoneStatus`); Adım 5'te Activity ID/Disiplin/Alan/WBS kolonları, seçim, Toplu ata, Kod ata, Sınıflandır, İptal et |
| `src/pages/dashboard/components/TabIsPlaniAylik.jsx` | 333 | Aylık ızgara (salt okunur): görev × ay, Plan / Plan-Gerçek / Kümülatif % modları |
| `src/pages/dashboard/components/is-plani/GorevSiniflandirmaModals.jsx` | 347 | `GorevDuzenleModal`, `IptalModal`, `TopluAtaModal`, `KodAtaModal` |
| `src/pages/dashboard/components/is-plani/modalStyles.js` | 20 | Modal stilleri, `MAX_SELECTION` (500) |
| `src/pages/dashboard/components/proje-ayarlari/{ProjeAyarlari,WbsAlanlar,WbsAlanImportModal}.jsx` | 476 | WBS ve alan ekranı. ProjeDetay bağlantısı yok (Karar 53/58) |

**Sayfanın açıldığı iki yer:**
- `src/pages/dashboard/components/ProjeDetay.jsx:1419`: proje içi "İş Planı" sekmesi; `filterDate` ve `reportPeriod` verir.
- `src/pages/dashboard/index.jsx:423`: yalnızca şantiye şefinin üst menüdeki `is-plani` sekmesi; `siteChiefView` ile açılır, `filterDate` vermez (bugün).

### Hook'lar

| Hook | Kullanım |
|---|---|
| `src/hooks/useDashboardData.js` | `get_project_gantt` çağrısı; loading/refreshing/error |
| `src/hooks/useRealtimeRefresh.js` | `project_tasks`, `progress_daily`, `daily_reports`, `purchase_requests` değişince yeniden çeker |
| `src/hooks/useProjectStructure.js` | `task_disciplines`, `project_wbs`, `project_areas`, `area_wbs`. `task_disciplines` 404 dönerse `available=false` olur ve Adım 5 arayüzü gizlenir; canlıda bugün böyle |

### Supabase çağrıları

| Çağrı | Yer | Tür |
|---|---|---|
| `rpc('get_project_gantt', {p_project_id, p_filter_date})` | TabIsPlan | okuma, DEFINER, `get_project_scope` |
| `from('project_tasks')` (projesiz görünüm, tüm projeler) | TabIsPlan:500 | okuma, RLS |
| `from('profiles')` (şantiye şefi adı), `from('project_tasks')` (target_qty), `from('daily_reports')`, `from('progress_daily')` | TabIsPlan:545-573 | okuma; günlük ilerleme için 3-4 ek sorgu |
| `from('vw_task_monthly_plan_vs_actual')` + `from('task_monthly_plan')` | TabIsPlaniAylik:107-116 | okuma; 1000'lik sayfalarla. Görünüm `source_qty/unit/code` döndürmediği için tabloyla birleştiriliyor |
| `rpc('add_task_progress')` | Detay:191 | yazma; yalnızca santiye_sefi/proje_yoneticisi |
| `rpc('set_task_milestone_status')` | Detay:134 | yazma; yalnızca santiye_sefi/proje_yoneticisi; `actual_start/end` yazar |
| `from('project_tasks').update(...)` | GorevSiniflandirma:98, :330 | doğrudan yazma (sınıflandırma, iptal/yeniden aç); DB trigger'ları korur |
| `rpc('set_tasks_classification')`, `rpc('assign_activity_ids')`, `rpc('admin_correct_task_activity_id')` | GorevSiniflandirma | **canlıda yok (6a/6b)** |
| `rpc('import_wbs_areas')`, `rpc('save_area_wbs_links')` | proje-ayarlari | **canlıda yok** |

### Tipler

Proje JavaScript; TypeScript ve üretilmiş Supabase tipi yok. Veri şekli yalnızca
`get_project_gantt` gövdesinde ve bileşen yorumlarında belli. Canlıdaki `tasks` alanları:
`id, task_code, task_name, group_label, category, sub_category, planned_start/end,
actual_start/end, duration_days, progress_pct, status, responsible, responsible_role,
team_size, equipment_notes, notes, target_qty, unit, total_progress, risk_severity`.
faz-a'daki Adım 5 taslağı buna `activity_id, discipline, area_id/code, wbs_id/code`
ekliyor; bunlar canlıda yok, bu yüzden Detaylı'daki yapı kolonları canlıda görünmüyor.

**Canlıda olup arayüzün hiç okumadığı kolonlar:** `baseline_start/end` (4 projede dolu:
Kaptan Demir ×2, TIZ, TKY; DYB'de boş), `forecast_start/end` (hepsinde boş), `primavera_id` (boş).
Bu kolonlar 05.10 migration'ı `faz1_wbs_alan_activity` ile gelmiş.

---

## 2. Aylık plan

**Veri modeli** (`20261015062921_create_task_monthly_plan.sql`):
- `task_monthly_plan`:
  - satır: (task_id, month) tekil; month ayın 1'i;
  - `planned_qty` görev biriminde;
  - `source` ∈ excel_aylik / hesaplanan / manuel;
  - `source_qty/unit/code` Excel'deki ham değer;
  - FK (project_id, task_id) → `project_tasks` (cascade).
- RLS: okuma `user_has_project_access`; yazma admin + proje_yoneticisi.
- Tablo yorumu "toplam = target_qty" diyor ama bunu zorlayan kısıt veya trigger yok.
- `vw_task_monthly_plan_vs_actual` (security_invoker):
  - plan ayları ve gerçekleşen ayları birleştirir;
  - gerçekleşen, `progress_daily.qty_added` toplamıdır; ay, raporun `report_date`'inden alınır;
  - pencere fonksiyonuyla `planned_cum`/`actual_cum` üretir.

**Canlı veri (15.10):**

| Proje | excel_aylik | hesaplanan | Görev | Ay aralığı |
|---|---|---|---|---|
| isdemir-diyarbakir-arazi-faz1 (DYB1) | 107 | 2 | 58 | 2026-09 → 2027-11 |
| isdemir-diyarbakir-arazi-faz2 (DYB2) | 63 | 4 | 34 | 2026-09 → 2027-11 |

Diğer 4 projede aylık plan yok; Aylık sekmesi orada "aylık plan girilmemiş" der.
DYB2'de 34 görev var. Kayıtlı aktarım 27 görevdi; ENH/şalt ekleri bilinçli değil,
kullanıcı ayrı oturumda geri alacak. Geri alındığında o görevlerin aylık plan
satırları da cascade ile silinir.

**İçe aktarma:** uygulamada içe aktarma yolu **yok**.
- Satırlar 15.10.2026 06:31'de başka bir oturumda SQL ile yazıldı.
- `import-project-excel`, şablon v8, sihirbaz ve `projectExcelImport.js` aylık planı bilmiyor.
- Repoda üretim betiği de yok; kaynak `C:\fons-yedek\veri-kaynak\` altında.

**Gösterim:** `TabIsPlaniAylik.jsx` + `utils/aylikPlan.js`.
- Ay aralığı proje başlangıç/hedef aylarıdır; aralık dışında veri varsa genişler.
- Kümülatif değerler satırsız aylara taşınır; `inSpan` görevin ilk ve son satırlı ayıyla sınırlı.
- Renk eşikleri ≥%100 / %70-99 / <%70; gelecek aylar renksiz.
- Görünümün hazır `planned_cum/actual_cum` kolonları kullanılmıyor; aynı hesap istemcide tekrarlanıyor. Bu bilinçli: değer satırsız aya da taşınmalı.
- Hücre düzenleme yok; `MonthCell`'in `editable` özelliği ileride bağlanmak için hazır duruyor.

**Ayrı bir kavram:** `ProjeTabAylikPlan.jsx` (976 satır, Satın Alma › Aylık Satın Alma Planı)
`procurement_monthly_plan` tablosunu kullanır, İş Planı'yla ilgisi yok. Adları çok benziyor;
revizyonda karıştırılmamalı.

---

## 3. Tarih, ilerleme ve kritik yol hesapları

### İlerleme

| Değer | Nerede | Formül |
|---|---|---|
| Görev % (miktarlı, target_qty>0) | DB `get_project_gantt.task_progress` | `min(100, Σ progress_daily.qty_added (report_date ≤ filtre tarihi) / target_qty × 100)`. Filtre tarihine göre geçmişe dönük |
| Görev % (kilometre taşı) | DB `project_tasks.progress_pct` | durumdan; `set_task_milestone_status` yazar |
| Seçilen tarih için görev % | `TabIsPlan.jsx:344 progressFor` | RPC'deki task_progress varsa o, yoksa progress_pct |
| Durum | `TabIsPlan.jsx:366 deriveTaskStatusAt` | kilometre taşında DB durumu; miktarlıda tamamlandi/iptal kesin, ≥100 → tamamlandi, başlangıç ileride → `bekliyor`, >0 → devam_ediyor |
| Grup % | `renderGanttGroupNode`, `buildDetayRows` | görevlerin **ağırlıksız aritmetik ortalaması** (kategori ağırlığı ve süre kullanılmaz) |
| Proje % | DB `fn_sync_project_progress` | kategori ağırlıklı; sayfada gösterilmiyor |
| Günlük % (detay panel) | `TabIsPlan.jsx:408` | o günkü raporun qty_added toplamı / target_qty |

`deriveTaskStatusAt` DB'de olmayan `bekliyor` değerini üretebiliyor; `STATUS_LABELS`
bunu tanımıyor ve ekranda ham metin olarak çıkıyor.

### Tarih

- **Gecikme:** `isTaskLate` (TabIsPlan:387): `planned_end < bugün` ve durum tamamlandi/iptal değil. "Bugün" filtre tarihidir.
  - DB risk motoru (`fn_recompute_auto_risks`) `current_date` kullanır; geçmiş bir tarih seçilince ekran ile risk kaydı ayrışır.
  - Şiddet ekranda hesaplanmaz; `risk_severity` RPC'den gelir.
- **Sapma** (Detay:66 `computeSapma`): `actual_end − planned_end`. actual_end yoksa ve plan bitişi geçmişse `bugün − planned_end`.
- **Süre:** `daysBetween` = uç günler dahil takvim günü. Detaylı tablo önce `duration_days` kullanır, yoksa bunu.
- **Gantt yerleşimi:** `buildTimeline` + `timelineOffsetPct`.
- **Filtre tarihi:** `getEffectiveFilterDate`. Haftalıkta haftanın pazarı, aylıkta ayın son günü olmalı.

**Doğrulanmış hatalar** (kaynaktan birebir kopya, Node, `TZ=Europe/Istanbul`):

| # | Yer | Hata | Ölçülen |
|---|---|---|---|
| H1 | `buildTimeline` / `timelineOffsetPct` | Ay başlığı her aya 7 günlük tik sayısı kadar yer veriyor (31 günlük ay = 5 tik = 35 gün). Çubuklar ise gerçek gün sayısıyla konumlanıyor. Başlık ile çubuk her ay biraz daha kayıyor | DYB aralığında (2026-09 → 2027-11) çubuk, başlıktaki ayından **2026-12'de ≈14, 2027-06'da ≈35, 2027-11'de ≈57 gün** önde. "Bugün" çizgisi de aynı ölçekte |
| H2 | `getEffectiveFilterDate` | Yerel gece yarısı `toISOString()` ile metne çevriliyor; UTC+3'te bir gün geri gidiyor | aylık 2026-10-15 → **2026-10-30** (beklenen 31); haftalık → **2026-10-17 cumartesi** (beklenen 18 pazar) |
| H3 | `computeSapma` (Detay:70) | Aynı sorun: `today.toISOString()` | bugün **2026-10-14** çıkıyor; açık gecikmeler 1 gün az görünüyor |

Benzer desen, doğrulanmamış olası sorunlar:
- `ProgressEntryModal` `p_report_date: new Date().toISOString()` gönderiyor; 00:00-03:00 arası girişi bir önceki güne yazar.
- `isTaskLate` `new Date('YYYY-MM-DD')` (UTC) ile yerel gece yarısını karşılaştırıyor; UTC+3'te sonuç doğru ama saat dilimine bağlı.

### Kritik yol

- **Frontend'de kritik yol hesabı yok.** Ayrı bir "kritik" kavramı da yok: `is_critical` 03.08.2026'da kaldırıldı. Ekrandaki "Riskli" yalnızca gecikme anlamına geliyor.
- `task_dependencies` canlıda dolu ama **hiçbir ekran okumuyor**:

  | Proje | FS | SS | SS gecikmesi |
  |---|---|---|---|
  | DYB1 | 30 | 44 | 0-242 gün |
  | DYB2 | 18 | 24 | 0-91 gün |

- Aynı öncüller DYB görev notlarında da metin olarak duruyor ("Öncül: …": DYB1'de 53, DYB2'de 31 görev). İki kaynak arasında eşitleme yok.
- `forecast_*` kolonları boş; tahmini bitiş hesabı da yok.

---

## 4. Grafik kütüphaneleri ve paket boyutu

- **Gantt kütüphanesi yok.** Gantt, Detaylı tablo ve Aylık ızgara elle yazılmış JSX + CSS:
  - `Dashboard.css`'te 183 `.gantt-*`/`.aylik-*` kuralı (satır 1141-2052);
  - kaydırma senkronu üç ref ile;
  - genişlikler sabit (`W_*`).
- Projede tek grafik kütüphanesi `recharts` (`vendor-charts`, 370 kB, gzip 109 kB). Yalnızca `ProjectOverviewDashboard.jsx` ve `ProjeTabFinansSidebar.jsx` kullanıyor; İş Planı yüklemiyor.
- İş Planı paketi:
  - `TabIsPlan-*.js` 55,5 kB (gzip 17,7 kB);
  - Detaylı ve Aylık statik import edildiği için aynı parçada;
  - entegrasyon build'i, 15.10 11:04.
- `TabIsPlan` hem `index.jsx`'te `lazy` hem `ProjeDetay.jsx`'te statik import ediliyor. Rollup ortak parça çıkarıyor; bugün sorun değil.
- **Değerlendirme:** bir Gantt kütüphanesi (ör. frappe-gantt, dhtmlx) eklemek okları ve sürüklemeyi hazır verir. Bedeli tahminen 50-300 kB, CSS çakışması ve Türkçe/mobil uyarlama (boyutlar ölçülmedi, tahmin). Mevcut elle yazılmış ızgara H1 düzeltilirse ok çizimi SVG katmanıyla eklenebilir. Öneri: önce kütüphanesiz devam (Faz 5'te yeniden bakılır).

---

## 5. Testler (Playwright)

İş Planı'nı doğrudan kapsayanlar:

| Spec | Dal | Kapsam | Canlı/yerel |
|---|---|---|---|
| `tests/is-plani-aylik.spec.js` | aylik | 6 saf yardımcı testi (aylikPlan.js, Node) + 3 UI: `?view` URL'i, M4 6 hücre/63.384/tooltip, filtreler | UI: canlı, DYB1, PM hesabı, salt okunur |
| `tests/is-plani-hiyerarsi.spec.js` | main/faz-a/aylik | Genel ve Detaylı'nın çok seviyeli `group_label` ağacı | canlı, kendi test görevlerini ekler/siler (gelecek tarih, risk temizliği) |
| `tests/manual-task-progress.spec.js` | hepsi | `add_task_progress` yetkisi, rapor biriktirme, şantiye şefi arayüzü (İlerleme Gir) | canlı, **yazar ve bildirim üretir** (Karar 77 listesinde) |
| `tests/proje-kontrol-adim5.spec.js` | faz-a | Adım 5 RPC yetki matrisi, Kod ata, toplu atama, iptal, ekranlar | yalnızca yerel; canlıda kendini atlar |

**Kapsanmayanlar:**
- Gantt çubuk/başlık hizası (H1 bu yüzden yakalanmadı);
- filtre tarihi ve haftalık/aylık dönem (H2);
- sapma (H3);
- KPI sayıları;
- `InlineMilestoneStatus` (yalnızca RPC tarafı dolaylı);
- şantiye şefi menü girişi (`index.jsx:423`);
- mobil Gantt;
- projesiz görünüm (`projectId` yok).

Saf fonksiyonlar `TabIsPlan.jsx` içinde olduğu için Node'dan import edilemiyor: dosya
`lib/supabase` → `import.meta.env` zincirini çekiyor. `is-plani-hiyerarsi` bu yüzden
tarayıcı + canlı veriyle yazılmış.

---

## 6. Rol bazlı erişim ve yetki

**Sayfaya erişim** (DB: `role_allowed_tabs`, canlı):

| Rol | İş Planı'na nasıl ulaşır |
|---|---|
| admin | `tabs_unrestricted`; Projeler › proje › İş Planı |
| proje_yoneticisi | `projeler` sekmesi; tüm projeler (`cross_project=true`) |
| santiye_sefi | üst menü `is-plani` (index.jsx:423, yalnızca kendi `projectId`'si); `projeler` yok |
| muhasebe | **erişemez**: ne `projeler` ne `is-plani` sekmesi var |

**Düzenleme yetkisi: üç katman, birbirinden bağımsız:**

| İşlem | Ön yüz koşulu | DB'de gerçek kural |
|---|---|---|
| İlerleme gir / durum değiştir | `canAddProgress = projectId && role ∈ {santiye_sefi, proje_yoneticisi}` (TabIsPlan:633) | `add_task_progress`, `set_task_milestone_status`: aynı iki rol. **Admin ilerleme giremez** (bilinçli) |
| Sınıflandır, Kod ata, Toplu ata, İptal/Yeniden aç | `canManage = projectId && role ∈ {admin, proje_yoneticisi}` (TabIsPlan:635); yapı kolonları ayrıca `structure.available` ister | RPC'ler canlıda yok; iptal doğrudan UPDATE + trigger (Karar 44 taslakta, canlıda uygulanmadı) |
| Durum seçicide "İptal" | `canCancel = canManage` | canlıda yalnızca RLS |
| Aylık plan yazma | arayüz yok | RLS: admin + proje_yoneticisi |
| Bağımlılık yazma | arayüz yok | RLS: insert/update admin + PM + **santiye_sefi (kendi projesi)**, delete admin + PM |
| `project_tasks` doğrudan UPDATE | — | RLS: admin, PM, santiye_sefi (kendi projesi); **kolon kısıtı yok**. Şantiye şefi istemciden tarih/ad/hedef değiştirebilir. Sınır yalnızca `trg_project_tasks_identity_guard` |
| Görünürlük | `siteChiefView` panelde "Sorumlu" yerine ekipman/not gösterir | okuma `user_has_project_access` |

Rol kontrolleri dağınık: yetki ifadeleri `TabIsPlan.jsx` içinde satır içi yazılmış,
ortak bir yetki yardımcısı yok. Register tarafında planlanan `register_can` (B1) İş Planı'nı
kapsamıyor.

---

## 7. Yeniden kullanılabilir parçalar

- **Gruplama:** `buildGroupTree`, `collectNodeTasks`, `groupConfigFor`, `GROUP_ORDER`. Üç görünüm aynı ağacı paylaşıyor; ağaç sağlam ve testli. Ayrı modüle taşınmaya hazır.
- **Aylık yardımcılar:** `utils/aylikPlan.js`. Saf ve Node'da testli. `monthKey` metin girdide saat dilimi güvenli; tarih yardımcılarının örneği olabilir.
- **Gecikme şiddeti:** `riskSeverityLabel`, `statusLabel`, `TASK_STATUS` + `StatusDot`.
- **Yapı verisi:** `useProjectStructure` (`treeOrder`, `available` ile yumuşak düşüş).
- **Bölüm seçimi:** `?view` + localStorage deseni. Proje bazlı anahtar, `replace`.
- **Liste çekme:** `fetchAll` sayfalama. Başka büyük listeler için genel yardımcıya taşınabilir.
- **Kilometre taşı ve ilerleme:** `ProgressEntryModal`, `InlineMilestoneStatus`.
- **Mevcut veri:** `task_dependencies` ve `task_monthly_plan` tablolarında RLS ve indeks hazır. `baseline_*` 4 projede dolu.

---

## 8. Riskler

| # | Risk | Etki |
|---|---|---|
| R1 | Kod üç dala bölünmüş. `TabIsPlan.jsx`/`TabIsPlaniDetay.jsx` hem faz-a'da (Adım 5) hem aylik'te değişti; entegrasyonda birleşti ama `main`'de yok | Revizyon `main`'den açılırsa iki dalla yeniden çakışır. Önce taban dal kararı |
| R2 | H1 Gantt kayması | Uzun projelerde (DYB 15 ay) tarih okuması yanlış; kullanıcı fark etmeden yanlış karar |
| R3 | H2/H3 saat dilimi | Haftalık/aylık filtre bir gün eksik veri; sapma 1 gün az |
| R4 | Adım 5 RPC'leri canlıda yok | Detaylı'daki yapı kolonları canlıda gizli; entegrasyonda düğmeler kilitli. 6a/6b'ye bağlı |
| R5 | `TabIsPlan.jsx` 1089 satır, veri + hesap + çizim bir arada; saf fonksiyonlar Node'dan test edilemiyor | Her değişiklik geniş regresyon yüzeyi |
| R6 | Aylık plan toplamı = target_qty kuralı yalnızca yorumda | Elle düzenleme gelince plan ile hedef ayrışabilir |
| R7 | Öncüller iki yerde (not metni + `task_dependencies`) | Biri güncellenince diğeri bayatlar |
| R8 | `project_tasks` RLS şantiye şefine kolon sınırsız UPDATE veriyor; `task_dependencies` insert/update'te de şantiye şefi var | Düzenleme arayüzü eklenirse yetki ön yüze bırakılmış olur |
| R9 | Gecikme "bugün"ü ekranda filtre tarihi, risk motorunda `current_date` | Geçmiş tarih seçilince "Riskli" ve risk kartı ayrışır |
| R10 | Ön yüz 4 ek sorguyla günlük % hesaplıyor; projesiz görünüm tüm `project_tasks`'ı limitsiz çekiyor | Görev sayısı büyüdükçe yavaşlar; 1000 satır sınırında sessiz kesilme |
| R11 | `deriveTaskStatusAt` DB'de olmayan `bekliyor` üretiyor | Etiket ham metin; filtreler bu değeri tanımıyor |
| R12 | DYB2'nin bilinçsiz ENH/şalt görevleri aylık planda da satır sahibi | Geri alma sırasında aylık plan satırları da gider; beklenen davranış ama bilinmeli |
| R13 | `ProjeTabAylikPlan` / `TabIsPlaniAylik` ad benzerliği | Yanlış dosyada değişiklik |

---

## 9. Faz önerisi (2-7)

Faz tanımı verilmediği için aşağıdakiler öneridir. Faz 1 bu denetim (Aylık salt okunur
görünüm zaten yapıldı). Her fazın migration SQL'i ayrıca gösterilip onaylanır (kural 1);
şema değişiminde docx hatırlatması (kural 7).

### Faz 2: Hesap düzeltmeleri ve parçalama (DB değişikliği yok)

| Dosya | Değişiklik |
|---|---|
| `src/utils/isPlaniTarih.js` (yeni) | Saat diliminden bağımsız tarih yardımcıları: `todayKey()`, `addDays`, `endOfWeek`, `endOfMonth`, `dayDiff`. `toISOString` yok |
| `src/utils/isPlaniGruplama.js` (yeni) | `buildGroupTree`, `collectNodeTasks`, `groupPath`, `resolveGroup`, `GROUP_ORDER`, `GROUP_CONFIG`, `groupConfigFor` buraya taşınır; `TabIsPlan.jsx` yeniden dışa aktarır (geriye uyum) |
| `src/utils/isPlaniHesap.js` (yeni) | `deriveTaskStatusAt` (`bekliyor` → `beklemede`), `isTaskLate`, `computeSapma`, `progressFor`, `pctFromDailyProgress`, `buildTimeline` (H1: gün bazlı ölçek; ay genişliği = gün sayısı) |
| `TabIsPlan.jsx` | Gantt gövdesi `is-plani/GanttGorunumu.jsx`'e, panel `is-plani/GorevDetayPaneli.jsx`'e, KPI `is-plani/KpiSeridi.jsx`'e; H2 düzeltmesi |
| `TabIsPlaniDetay.jsx` | H3 düzeltmesi; `ProgressEntryModal` tarih |
| `Dashboard.css` | gün bazlı ölçek için `.gantt-months` genişliği |
| `tests/is-plani-hesap.spec.js` (yeni) | Node, `TZ=Europe/Istanbul`: H1-H3 regresyonu, durum türetme, sapma |

### Faz 3: Aylık plan düzenleme (admin, proje_yoneticisi)

| Dosya | Değişiklik |
|---|---|
| migration `save_task_monthly_plan` (yeni RPC, DEFINER) | Bir görevin aylarını tek işlemde yazar; `source='manuel'`; toplam ≠ target_qty ise uyarı veya red (karar sorulacak, R6); audit gerekip gerekmediği sorulacak; `REVOKE … FROM PUBLIC, anon` |
| `TabIsPlaniAylik.jsx` | `MonthCell editable` bağlanır; satır düzenleme paneli; kaydet sonrası yeniden çekme |
| `src/utils/aylikPlan.js` | `rowTotalCheck`, orantılı dağıtım (`hesaplanan` üretimi) saf fonksiyonları |
| `tests/is-plani-aylik.spec.js` | düzenleme: TIZ'de (Karar 72), öncesi/sonrası parmak izi; şantiye şefi düğmeyi görmez |

### Faz 4: Aylık plan içe aktarma

| Dosya | Değişiklik |
|---|---|
| `src/utils/aylikPlanExcel.js` (yeni) | Excel Aylık İş Planı ayrıştırıcı (`wbsAreaExcel.js` deseni: ön yüzde oku → RPC'ye JSON) |
| migration `import_task_monthly_plan(p_project_id, p_payload, p_dry_run default true)` | görev koduyla eşleşme, birim dönüşümü `source_qty/unit`, hepsi ya da hiçbiri, `not_in_file` raporu |
| `is-plani/AylikPlanImportModal.jsx` (yeni) | önizleme → uygula |
| `public/excel/` | aylık plan şablonu; v8 şablona sayfa eklenip eklenmeyeceği karar |
| DYB'nin bugünkü satırları | yeni import ile yeniden üretilip karşılaştırılır (parmak izi), veri değiştirilmez |

### Faz 5: Bağımlılıklar

| Dosya | Değişiklik |
|---|---|
| `get_project_gantt` migration | `dependencies` dizisi eklenir (geriye uyumlu alan) |
| `is-plani/GanttOklari.jsx` (yeni) | SVG ok katmanı (FS/SS/FF/SF + lag) |
| `is-plani/BagimlilikModal.jsx` (yeni) | ekle/sil, döngü kontrolü (DB tarafında da trigger) |
| migration RLS | `task_dependencies` insert/update'ten şantiye şefini çıkarma önerisi (R8, karar) |
| not ↔ tablo | "Öncül:" metninin tek kaynağa indirilmesi (R7, karar: not mu tablo mu) |
| `import-project-excel` | M kolonundaki öncülün tabloya da yazılması (Karar 92 güncellemesi gerekir) |

### Faz 6: Kritik yol, tahmin ve baseline

| Dosya | Değişiklik |
|---|---|
| `src/utils/cpm.js` (yeni, saf) veya DB fonksiyonu | ileri/geri geçiş, bolluk, kritik yol; takvim günü (iş günü takvimi istenirse ayrı karar) |
| `forecast_start/end` | yazacak fonksiyon (gerçekleşen + kalan süre + bağımlılık); risk motoruyla ilişkisi (R9) netleştirilir |
| `get_project_gantt` | `baseline_*`, `forecast_*`, `float_days`, `is_critical_path` alanları |
| Gantt/Detaylı | baseline gölge çubuğu, kritik yol vurgusu, "Sapma" baseline'a göre seçeneği |
| `tests/is-plani-cpm.spec.js` | Node, bilinen ağ örnekleri |

### Faz 7: Yetki birleştirme, performans, mobil, kapanış

| Dosya | Değişiklik |
|---|---|
| `src/utils/isPlaniYetki.js` (yeni) | `canAddProgress`, `canManage`, `canEditPlan`, `canEditDependencies` tek yerde |
| migration (karar) | `project_tasks` UPDATE'inde şantiye şefini yalnızca RPC'ye sınırlama (R8) |
| `TabIsPlan.jsx` | günlük % ek sorgularının `get_project_gantt`'a alınması (R10); projesiz görünümde sayfalama |
| `Dashboard.css` | mobil Gantt (bugün yalnızca Aylık mobil uyumlu) |
| `tests/` | şantiye şefi menü girişi, rol matrisi UI testi, KPI |
| `CLAUDE.md`, iki docx | İş Planı bölümü, tablo haritası, yeni RPC'ler |

**Bağımlılıklar:**
- Faz 2 diğerlerinin ön koşulu.
- Faz 3 ve 4 sırayla yapılır.
- Faz 5, Faz 6'nın ön koşulu.
- Adım 5 yapı kolonları 6a/6b'ye bağlı ve bu planın dışında (R4).
- Taban dal kararı Faz 2'den önce gerekli (R1).

---

## 10. Kullanıcı kararı bekleyen noktalar

1. Revizyonun taban dalı (R1): `local/entegrasyon` içeriğini temsil eden yeni bir dal mı, `main` + sırayla merge mi?
2. Aylık plan toplamı ≠ hedef: uyarı mı, red mi (R6)?
3. Öncül kaynağı: görev notu mu, `task_dependencies` mı (R7)?
4. Şantiye şefinin `project_tasks` ve `task_dependencies` yazma yetkisi daraltılsın mı (R8)?
5. Gecikme tarihi: ekran filtre tarihine mi, `current_date`'e mi bağlı olsun (R9)?
6. Gantt kütüphanesi: elle devam (öneri) mı, kütüphane mi?
