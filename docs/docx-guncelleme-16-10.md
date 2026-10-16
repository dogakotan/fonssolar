# docx güncellemesi — 16.10.2026 (İş Planı koruma trigger'ları)

Kural 7 kaydı. Canlıya 16.10.2026'da uygulanan iki migration'ın iki dokümantasyon dosyasına eklenecek metni.
Dosyalar bulundu; **bu metin henüz dosyalara işlenmedi**.

- Sistem: `C:\Users\fonss\OneDrive\Masaüstü\fons_solar_sistem_dokumantasyonu.docx`
- Veritabanı: `C:\Users\fonss\Claude\Projects\Fons Solar\fons_solar_veritabani_dokumantasyonu.docx`

Kaynak migration'lar: `20261016115400_task_dependencies_cycle_and_site_chief_guard`,
`20261016115418_project_tasks_site_chief_plan_guard` (geri alma: `supabase/rollback/` altında aynı adlar).

---

## A. fons_solar_sistem_dokumantasyonu.docx

### A1. Kapak satırı ("Son güncelleme: …") — sonuna eklenecek

> · 16.10.2026 (İş Planı koruma trigger'ları: şantiye şefi plan koruması, bağımlılık döngü kontrolü)

### A2. 2.4 Veritabanı Fonksiyon Katmanı → "Otomasyon Trigger'ları" paragrafının sonuna eklenecek

> , fn_task_dependencies_guard (görev bağımlılıkları: iki görev aynı projede, şantiye şefi yazamaz, döngü kontrolü), fn_project_tasks_site_chief_guard (şantiye şefi iş planında yalnızca gerçekleşen alanları yazar).

### A3. İş Planı paragrafından sonra yeni paragraf + tablo

**Başlık:** İş Planı yazma yetkisi (16.10.2026)

> İş planının planı (tarihler, hedef miktar, kalemler ve öncül/ardıl bağları) proje yöneticisi ve admin tarafından yönetilir. Şantiye şefi sahadaki gerçekleşmeyi girer: gerçekleşen başlangıç/bitiş, ilerleme, durum, not ve ekipman notu. Bu ayrım veritabanında iki trigger ile zorunlu tutulur; ekran ya da başka bir istemci yolu atlasa bile değişiklik reddedilir ve kullanıcıya hangi alanın değiştirilemeyeceği yazılır.

| İşlem | admin | proje_yoneticisi | santiye_sefi | muhasebe |
|---|---|---|---|---|
| Gerçekleşen alanlar (gerçekleşen başlangıç/bitiş, ilerleme %, toplam ilerleme, durum, not, ekipman notu) | Evet | Evet | Evet (yalnızca kendi projesi) | Hayır |
| Plan alanları (plan/baseline/tahmini tarihler, hedef miktar, birim, ad, kategori, grup, WBS, alan, disiplin, ekip sayısı) | Evet | Evet | **Hayır** | Hayır |
| Yeni iş kalemi ekleme | Evet | Evet | **Hayır** | Hayır |
| İş kalemi silme | Evet | Evet | Hayır | Hayır |
| Öncül/ardıl bağı ekleme/değiştirme | Evet | Evet | **Hayır** | Hayır |
| Öncül/ardıl bağı silme | Evet | Evet | Hayır | Hayır |

> Günlük rapor ve "İlerleme Gir" akışları şantiye şefi için aynen çalışır; bunlar yalnızca gerçekleşen alanları yazar. Öncül/ardıl eklerken döngü (A, B'nin öncülü iken B'yi A'nın öncülü yapmak, dolaylı zincirler dahil) her rolde reddedilir.

### A4. (İsteğe bağlı) "~55 tablo, 107 SQL fonksiyonu/trigger" sayısı

16.10.2026'da bir trigger fonksiyonu eklendi (`fn_project_tasks_site_chief_guard`). Sayı yaklaşık verildiği için "108" yapılabilir ya da olduğu gibi bırakılabilir.

---

## B. fons_solar_veritabani_dokumantasyonu.docx

### B1. project_tasks açıklamasının sonuna eklenecek cümle

> 16.10.2026'dan beri trg_project_tasks_site_chief_guard (BEFORE INSERT/UPDATE) şantiye şefinin yalnızca actual_start, actual_end, progress_pct, total_progress, status, notes ve equipment_notes kolonlarını değiştirmesine izin verir; diğer kolonlar ve yeni satır ekleme reddedilir (hata kodu 42501). Admin, proje yöneticisi ve oturumsuz bağlam (migration, service role, cron) etkilenmez.

Not: aynı paragraftaki "progress_pct, bağlı progress_items üzerinden trigger ile güncellenir" ifadesi eski (`progress_items` kaldırıldı). Doğrusu: "progress_pct, progress_daily'ye yazılan günlük ilerlemeden sync_task_progress_from_daily trigger'ı ile güncellenir." İsterseniz bu düzeltme de aynı seferde yapılır.

### B2. 2.8 task_dependencies — kısıt satırının yerine geçecek metin

Bugünkü metin:

> UNIQUE (task_id, predecessor_id); görev kendine bağlanamaz; iki görev aynı projede olmalı (fn_task_dependencies_guard). SELECT: proje erişimi; INSERT/UPDATE: admin, PM, kendi ev projesinde şantiye şefi; DELETE: admin, PM

Yeni metin:

> UNIQUE (task_id, predecessor_id); görev kendine bağlanamaz; iki görev aynı projede olmalı. fn_task_dependencies_guard (BEFORE INSERT/UPDATE, 16.10.2026 güncellemesi): (1) şantiye şefi bağ ekleyemez ve değiştiremez (42501); (2) döngü kontrolü — yeni bağ "öncül → görev" için öncülün doğrudan ve dolaylı öncülleri recursive CTE ile taranır, görev aralarındaysa bağ reddedilir (23514); aynı projede eşzamanlı eklemeler proje bazlı advisory kilitle sıraya girer. SELECT: proje erişimi; INSERT/UPDATE: admin, PM (RLS şantiye şefine de izin verir ama trigger reddeder); DELETE: admin, PM.

### B3. Yeni alt başlık (2.8'in hemen altına): "İş Planı koruma trigger'ları"

| Trigger | Tablo | Zaman | Kural | Hata |
|---|---|---|---|---|
| trg_task_dependencies_guard → fn_task_dependencies_guard | task_dependencies | BEFORE INSERT/UPDATE | Aynı proje; project_id görevden türetilir; şantiye şefi yazamaz; döngü kontrolü | 42501 (şef), 23514 (döngü) |
| trg_project_tasks_site_chief_guard → fn_project_tasks_site_chief_guard | project_tasks | BEFORE INSERT/UPDATE | Şantiye şefi yalnızca izin listesindeki kolonları değiştirir; INSERT reddedilir. İzin listesi: actual_start, actual_end, progress_pct, total_progress, status, notes, equipment_notes, updated_at. Hesaplanan kolonlar (duration_days) karşılaştırılmaz. Yeni eklenen her kolon varsayılan olarak korunur | 42501 |

> Rol bilgisi get_my_role() ile oturumun auth.uid()'sinden okunur; SECURITY DEFINER fonksiyonların içinde de çağıranın rolü döner, yani şantiye şefinin add_task_progress ve set_task_milestone_status çağrıları da bu kontrolden geçer (yalnızca izinli kolonlara yazdıkları için geçerler). fn_project_tasks_site_chief_guard'ın EXECUTE yetkisi public/anon/authenticated'dan kaldırıldı.

### B4. Güncelleme tarihi satırı

> Güncelleme Tarihi: 16.10.2026 (İş Planı koruma trigger'ları)
