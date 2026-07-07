# Bekleyen İşler

Bu dosya, denetim/canlı-veri görevleri sırasında tespit edilen ama bilinçli
olarak ERTELENMİŞ kararları tutar — unutulmasın diye. Her madde hangi görevde
ele alınacağını belirtir.

---

## 1. `get_project_dashboard` / `ProjectDashboard` orphan dalı + `get_project_overview`

**Tespit:** `TabGenel.jsx`'in `projectId` prop'u hiçbir yerden geçirilmediği
için `ProjectDashboard` bileşeni (Ring/DualRing ilerleme grafikleri, S-Eğrisi,
kritik yol timeline'ı, maliyet/ticket/kalite özetleri — tam donanımlı,
~1080 satır) hiçbir zaman render edilmiyor. Gerçek "proje detayı" akışı
`ProjeDetay.jsx`'in 7 sekmeli çalışma alanına gidiyor (Genel Proje / İş Planı /
Satın Alma / Finans / Ticket / Raporlar / Ekip), o da `get_proje_detay`
(yalnızca 3 alan: project/work_packages/progress_summary) + dağınık ham
sorgularla kendi verisini topluyor. `get_project_overview` (17 alanlı, ayrı
kapsamlı bir RPC) da benzer şekilde hiçbir dosyadan çağrılmıyor.

**Karar (uygulanmadı, ayrı bir görevde ele alınacak):**
**3. seçenek (birleştirme)** — `ProjeDetay.jsx`'in "Genel Proje" sekmesinin
veri katmanı `get_project_dashboard`'a geçirilecek (dağınık ham sorgular ve
`get_proje_detay` kaldırılacak), Ring/DualRing/S-Eğrisi görselleri o sekmeye
taşınacak, ardından `ProjectDashboard`/`get_project_dashboard`'ın artık
gereksiz kalan orijinal orphan dalı (`TabGenel.jsx`'teki `if (projectId)` dalı)
silinecek. `get_project_overview`'un "Proje Raporu" sayfası olarak
bağlanmasıyla birlikte, aynı görevde iki orphan RPC birden değerlendirilecek.

**Neden şimdi değil:** Bu iş bir UI/veri-katmanı birleştirmesi — canlı veri
görevinin (kapsam seçici/yenileme deseni) kapsamı dışında. Refactor görevinin
FAZ 3/4'üne (sorgu taşıma + arayüz eksikleri) daha uygun.

---

## 2. Finans/Satın Alma tekil-proje RPC'lerinde `get_project_scope` yetki kontrolü eksik

**Tespit:** `get_finans_overview(p_project_id, p_as_of_date)` ve
`get_satin_alma_overview(p_project_id)` çağıranın `p_project_id`'ye erişimi
olup olmadığını hiç kontrol etmiyor (çift kapsam `_all` fonksiyonlarıyla
sağlanmış ama tekil-proje fonksiyonları yetkisiz bir `p_project_id` ile
çağrılırsa veri döndürüyor). Canlı veri görevinin "Hiçbir RPC kapsam
kontrolsüz kalmayacak" kuralı bunları da kapsıyor.

**Karar:** Çözüldü — canlı veri görevinin dikey dilim döngüsüne dahil edildi
(2. ve 3. dilimler). `get_finans_overview`/`get_finans_overview_all` Dilim 2'de,
`get_satin_alma_overview`/`get_satin_alma_overview_all` Dilim 3'te tamamlandı
(her ikisinde de `_all` fonksiyonu hiçbir yetki kontrolü yapmıyordu — düzeltildi).
Madde kapandı.

---

## 3. `user_can_access_report` artık `get_project_scope` çağırıyor — performans takibi

**Tespit:** Dilim 1'de (`get_daily_report_detail`) `user_can_access_report`
`get_project_scope`'a yönlendirildi; bu fonksiyon 4 RLS politikasının
(`dt_select`, `ml_select`, `pd_select`, `ple_select`) `USING` ifadesinde
satır bazlı çağrılıyor. Artık her çağrıda `roles`/`profiles`/`projects`
sorgusu da dönüyor. Test verisinde (78 rapor) hissedilmez.

**Takip:** Canlı projede rapor listesi büyüdüğünde (personel/makine/ilerleme
sorgularında) yavaşlama görülürse ilk bakılacak yer burası — gerekirse
`get_project_scope` sonucu oturum başına önbelleklenebilir veya
`user_can_access_report` için ayrı, daha hafif bir yol düşünülebilir.

---

## 4. "Harcanan" (actual) tanımı iki fonksiyonda farklı

**Tespit:** `get_dashboard_summary`'de `spent_amount` = `status IN
('ödendi','yönetici_onayında','muhasebe_onayında')` (onay sürecindeki
faturalar da "harcanan" sayılıyor) — `get_finans_overview`/`get_finans_overview_all`'da
`totalActual`/`kpi.totalActual` = `status IN ('onaylandı','ödendi')` (yalnızca
tamamen onaylanmış/ödenmiş). Aynı proje için "Genel Bakış" ile "Finans"
ekranları farklı bir "harcanan tutar" gösterebilir.

**Karar:** İş kararı bekliyor — hangi tanım doğru kabul edilecek. Netleşince
iki fonksiyon TEK migration'la hizalanacak. Şimdilik ikisinin de mevcut
mantığına dokunulmadı (Dilim 2 kapsamı dışı, kullanıcı talimatıyla).

---

## 5. `get_santiye_dashboard`'da satın alma durum eşleşmesi hatası (önceden var olan bug)

**Tespit:** Dilim 6 sırasında bulundu. `v_status_pr` `chr()` ile kurulmuştu
(`'bekliyor'`, `'onayland' || chr(305)`) ve gerçek `purchase_requests.status`
değerleriyle (`talep_olusturuldu, onaylandi, satin_alindi, fatura_onay_bekliyor,
faturasi_kesildi`) hiç eşleşmiyordu — `'bekliyor'` diye bir DB değeri hiç yok,
`'onaylandı'` (noktalı-ı) ile gerçek `'onaylandi'` (düz ASCII) farklı karakterler.
Kanıt: `chr(305)` ifadesi canlı, hiç değiştirilmemiş fonksiyonda halen mevcuttu —
bu görev öncesinden gelen bir bug. Sonuç: şantiye şefi ekranındaki "bekleyen
satın alma" listesi ve sayacı aylardır hep boş/0 dönüyordu.

**Karar:** Çözüldü — `v_status_pr = ['talep_olusturuldu', 'onaylandi',
'fatura_onay_bekliyor']` (süreci kapanmamış talepler; `satin_alindi`/
`faturasi_kesildi` şef için bitmiş iş sayılır), ayrı migration'la
(`fix_santiye_dashboard_pr_status_values`) uygulandı. Doğrulama: İzmir
santiye_sefi kimliğiyle `pr_count` 0 → 8'e çıktı, 8 gerçek açık talep
(4 `talep_olusturuldu` + 4 `onaylandi`) artık listede — bug kapandı.

---

## 6. Satın alma/finans liste ekranları var olan RPC'leri kullanmıyor

**Tespit:** Dilim 8 kapanışında yapılan final `grep -rn "supabase.from" src/`
envanterinde (gerçek sayı 221 — tek satırlık grep çok satırlı
`supabase\n.from(...)` zincirlerini kaçırıyor, dikkat) bulundu. Şu ekranlar
kendi ham `purchase_requests`/`invoices` sorgularını koşuyor, halbuki
karşılığı olan ve Dilim 2-3'te yetki kontrolü eklenen RPC'ler zaten mevcut:
- `TabSatinAlmaTalepListesi.jsx`, `ProjeTabTalepListesi.jsx` → `get_satin_alma_overview`/`_all` yerine kendi `purchase_requests`+`purchase_request_items`+`profiles` join'i.
- `FaturaListesi.jsx`, `OnayKuyrugu.jsx`, `ProjeTabFaturaListesi.jsx`, `ProjeTabOnayKuyrugu.jsx` → `get_finans_overview`/`_all` yerine kendi `invoices` sorguları.

Ayrıca `TabGenel.jsx` satır ~252-365 (genel/tüm-projeler sayfasının proje
kartı listesi için canlı ilerleme hesaplama: `progress_items`,
`daily_reports`, `progress_daily`, `vw_project_progress_summary` fallback)
madde 1'in kapsamına (yalnızca `ProjeDetay.jsx` adı geçiyordu) hiç
girmemiş, aynı "orphan/dağınık sorgu" ailesinden.

**Neden şimdi değil:** Bu ekranların RPC'ye taşınması hem satır/güncelleme
(update/insert — durum değiştirme, yorum ekleme) mantığını hem de mevcut
`onChanged`/`refresh` callback zincirini etkileyecek, canlı veri görevinin
(yetki/kapsam/yenileme deseni) kapsamından daha geniş bir refactor —
"tüm supabase.from() sorgularını RPC'ye taşı" başlıklı orijinal refactor
görevinin (FAZ 3) doğal parçası. Güvenlik açısından acil değil: bu
ekranların okuduğu veriler zaten kendi RLS politikalarına tabi (`invoices`/
`purchase_requests` için proje bazlı RLS var), sadece "tek kaynak RPC"
tutarlılığı eksik.

**Diğer küçük/kapsam dışı bulgular (aksiyon gerekmiyor):** kimlik doğrulama
(`AuthContext.jsx`), tek satırlık dropdown/sayaç sorguları, ticket/talep/
fatura modallerinin CRUD akışları, wizard adımları. `DailyReportForm.jsx`'in
ham delete+insert deseni ayrı, daha öncelikli bir madde olarak aşağıda
madde 7'de ele alınıyor.

---

## 7. `DailyReportForm.jsx` — `save_daily_report` RPC'si dururken ham delete+insert kullanıyor

**Öncelik notu:** Bu madde madde 6'dan daha öncelikli — madde 6 bir
tutarlılık/temizlik konusu, bu madde ise veri bütünlüğü riski taşıyor.

**Tespit:** Dilim 8 kapanışındaki final `supabase.from` denetiminde bulundu.
`save_daily_report(p_project_id, p_report_date, p_created_by, p_general_status,
p_worker_count, p_weather, p_weather_note, p_notes, p_personnel, p_machinery,
p_progress)` RPC'si (tek transaction'da atomik yazan, `CLAUDE.md` kural 6'nın
örneği olarak gösterilen fonksiyon) zaten var ve doğrulanmış RPC katmanının
parçası — ama `DailyReportForm.jsx` bunu **hiç çağırmıyor**. Form kendi
`daily_reports` + 7 alt tablo (`personnel_log_entries`, `machinery_logs`,
`daily_tasks`, `progress_daily`, `daily_report_material_usage`,
`daily_report_issues`, muhtemelen `daily_report_photos`) için ham
delete+insert deseni koşuyor (DENETIM_RAPORU.md §A'da da "save_daily_report
RPC'si hiç çağrılmıyor" olarak zaten tespit edilmişti — bu, o bulgunun hâlâ
geçerli olduğunun doğrulanması).

**Risk:** Delete+insert tek transaction'da olsa bile client-side birden çok
ayrı `supabase.from()` çağrısı zinciri şeklinde yürütülüyorsa (transaction
garantisi yok), ağ kesintisi/hata durumunda "yarım kayıt" oluşabilir (örn.
personel silinmiş ama yeni personel eklenmemiş). Ayrıca `progress_daily`
tablosuna yazan trigger zincirinin (`update_task_progress_pct()` +
`sync_progress_item_total()` → `progress_items.total_progress`,
`project_tasks.progress_pct`, `fn_sync_project_progress()`) ham
delete+insert sırasında beklenen sırada/eksiksiz tetiklenip
tetiklenmediği doğrulanmadı — RPC içindeyken bu triggerlar tek transaction
sınırında güvenilir çalışır, client-side ayrı çağrılarda garanti farklı olabilir.

**Neden şimdi değil:** Bu, canlı veri görevinin (yetki/kapsam/RPC-okuma)
kapsamı dışında — saha ekibinin en sık kullandığı formu (mobil öncelikli,
günlük veri girişi) etkileyen bir değişiklik, dikkatli ayrı bir görev
gerektirir (mevcut `save_daily_report` RPC'sinin form alanlarıyla tam
örtüşüp örtüşmediğinin doğrulanması dahil).

---

## 8. Realtime (Faz D) — ölçek notu ve belgelenmemiş UPDATE/DELETE RLS davranışı

**Tespit 1 (ölçek):** P0 kümesi (`daily_reports, progress_daily, progress_items,
purchase_requests, invoices, tickets, project_tasks`) `supabase_realtime`
publication'ına eklendi, hepsine `REPLICA IDENTITY FULL` verildi (DELETE/UPDATE
olaylarında RLS'in ihtiyaç duyduğu `project_id`/`report_id`/`requested_by`
kolonlarının WAL'da eksiksiz gelmesi için — varsayılan PK-only replica identity
yetmiyordu). Supabase dokümantasyonu Postgres Changes'i "hızlı test/düşük
bağlantı sayısı" için öneriyor, üretim ölçeğinde Broadcast-from-database'e
geçişi tavsiye ediyor. **Karar:** Bu projenin ölçeğinde (2 test projesi, az
kullanıcı) şimdilik sorun değil, dokunulmadı. **İleride Broadcast'e geçiş
değerlendirilirse `REPLICA IDENTITY FULL` kararı da birlikte gözden
geçirilmeli** — Broadcast farklı bir mekanizma (trigger tabanlı, `realtime.messages`
üzerinden) kullandığı için FULL'un WAL boyutu/performans maliyeti o noktada
gereksiz kalabilir.

**Tespit 2 (belgelenmemiş davranış — ÖLÇÜLDÜ):** Üç bağımsız kaynak taraması
(Supabase dokümantasyonu + `get_advisors` + kendi RLS politika sorgum) bu
davranışı belgelemiyordu, bu yüzden gerçek bir WebSocket bağlantısıyla
(İzmir santiye_sefi test hesabı, `@supabase/supabase-js` ile canlı oturum)
ampirik olarak ölçtüm:

- **INSERT/UPDATE:** RLS beklendiği gibi çalışıyor. Aynı transaction'da hem
  İzmir hem Kayseri projesine `purchase_requests` INSERT'i yapıldığında,
  İzmir istemcisi yalnızca kendi projesinin olayını (tam satır içeriğiyle)
  aldı; Kayseri'ninki hiç ulaşmadı (`DONE []`).
- **DELETE — filtresiz kanalda:** RLS DELETE'te uygulanmıyor. İzmir
  istemcisi hem kendi projesindeki hem Kayseri'deki DELETE olaylarını aldı.
  Ancak payload yalnızca `{"id": "<uuid>"}` (yalnızca PK) — `project_id`,
  `title` gibi hiçbir alan yok, `REPLICA IDENTITY FULL` ayarına rağmen
  (Realtime, DELETE payload'ını bilerek PK'ya indiriyor). **Sonuç: veri
  sızıntısı yok** (hangi projeye ait olduğu bile görünmüyor), ama
  kullanıcının öngördüğü ikinci senaryo gerçekleşiyor — gereksiz refetch
  gürültüsü.
- **DELETE — kanal filtresiyle (`filter: project_id=eq.<value>`):** Aynı
  test kanal seviyesinde `project_id` eşitlik filtresiyle tekrarlandığında,
  Kayseri'nin INSERT'i VE DELETE'i İzmir istemcisine hiç ulaşmadı — filtre
  DELETE gürültüsünü tamamen kapatıyor (filtre sunucu tarafında ham WAL
  verisine uygulanıyor, RLS'ten önce ve payload küçültmeden bağımsız).

**Karar/uygulama:** `useRealtimeRefresh` hook'u ve tek-proje ekranlarının
tamamı (ProjeTabFinans, ProjeTabSatinAlma, TabIsPlan, ProjeDetay,
SantiyeSefiDashboard, ProjectOverviewDashboard, DailyReportList tek-proje
modu) zaten `filter: {column: 'project_id', value: projectId}` ile
bağlandı — DELETE gürültüsü bu ekranlarda kapatılmış durumda. Yalnızca
"Tüm Projeler" modundaki ekranlar (TabGenel genel görünüm, TabFinans_all,
TabSatinAlma_all, DailyReportList Tüm Projeler modu) filtre kullanamıyor
(tek bir project_id yok) — bu ekranlarda çapraz-proje DELETE'leri hâlâ
gereksiz ama zararsız bir refetch tetikleyecek, kabul edilebilir.
