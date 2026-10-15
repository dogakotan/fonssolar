# Görev silme koruması (veritabanı katmanı) — tasarım notu

Durum: **tasarım; migration yazılmadı, uygulanmadı.** 15.10.2026. Ön yüz kilidi (`src/utils/projectTaskLock.js`,
dal `hotfix-sihirbaz-kilidi`) birinci katman; bu not ikinci katmanı (sihirbazın eski bir sekmesi, eski taslak ya da
başka bir istemci yolu) tasarlıyor.

## 1. Sorun

`project_tasks` satırı silinince:

| Bağlı tablo | FK silme kuralı | Sonuç |
|---|---|---|
| `task_dependencies` (`task_id`, `predecessor_id`) | CASCADE | uyarısız silinir |
| `task_monthly_plan` | CASCADE | uyarısız silinir |
| `progress_daily`, register tabloları, `project_risks`, `procurement_items`, `purchase_requests` | NO ACTION | silme hata verir (zaten korumalı) |
| `daily_tasks` | SET NULL | görev bağı kopar |
| `wbs_id` (görevin kendi kolonu) | — | sihirbaz yeniden eklerken yazmıyor, kaybolur |

Korunması gereken: CASCADE ile giden iki tablo ve `wbs_id`. Diğerleri FK ile zaten korunuyor.

## 2. Görevleri kim siliyor (canlı kod, `main` 2e3ff8e)

1. **Sihirbaz düzenleme** — `ProjeEditWizard.jsx` adım 2 "Kaydet" ve `Adim8Tamamlandi.jsx` "Projeyi Güncelle":
   `from('project_tasks').delete().eq('project_id', …)`, ardından insert. **Engellenmesi gereken yol.**
2. **Proje silme** — `TabProjeYonetimi.jsx` `handleDelete`: istemcide sıralı, ayrı ayrı REST çağrıları (tek işlem
   değil). Önce bağlı tablolar (ticket, fatura, talep, günlük rapor alt tabloları), sonra `SUB_TABLES` sırasıyla
   (`project_tasks` ilk sırada, sonra `project_risks`, `procurement_*`, `budget_lines`), en son `projects`.
   **Engellenmemesi gereken yol.**
3. **Sihirbaz yeni proje** — yalnızca insert; trigger'dan etkilenmez.
4. **Excel aktarımı** (`import-project-excel`) — görev silmez, `task_code` ile günceller (upsert); etkilenmez.

Canlı FK: `project_tasks.project_id → projects` **ON DELETE CASCADE**; `task_dependencies.project_id → projects`
CASCADE. Yani `projects` satırı silinince görevler veritabanının kendi zinciriyle silinir.

Veritabanı açısından 1. ve 2. yoldaki görev silme **aynı SQL**: `DELETE FROM project_tasks WHERE project_id = …`,
aynı rol, ayrı HTTP isteği. Ayırt etmenin yolu aşağıdaki seçeneklerde.

## 3. "Proje siliniyor" durumunu ayırt etme seçenekleri

### A. İstemciden oturum bayrağı — **uygulanamaz**
Her REST çağrısı ayrı işlem; `set_config` ile kurulan yerel bayrak sonraki çağrıya taşınmaz. `set_config`
PostgREST'ten çağrılamaz (`pg_catalog` açık değil). İstemci bayrağı güvenilir olsaydı bile herkes kurabilirdi.

### B. Ayrı RPC + işlem içi bayrak
`delete_project(p_project_id)` (SECURITY DEFINER, admin/PM, `has_project_access`): bütün silme zincirini tek işlemde
yapar, başta `set_config('fons.project_delete', p_project_id, true)` kurar. Trigger, bayrak silinen görevin
projesine eşitse izin verir.
- Artı: proje silme atomik olur (bugün yarıda kalırsa veri yarım silinmiş kalıyor).
- Eksi: `handleDelete`'in ~20 tablolu zincirinin SQL'e taşınması gerekir; bir tablo unutulursa proje silinemez.
  Daha büyük değişiklik, daha çok test. Bayrağı başka bir DEFINER fonksiyon da kurabilir (yalnızca kod
  disipliniyle korunur).

### C. "Proje satırı artık yok" kontrolü — **öneri**
Trigger: silinen görevin projesi `projects`'te **yoksa** (silme `projects`'ten CASCADE ile geliyorsa) izin verir.
Proje hâlâ varsa ve görevin bağımlılığı, aylık planı ya da `wbs_id`'si varsa reddeder. Veri taşımayan görev her
durumda silinebilir.
- Ön yüz değişikliği: `TabProjeYonetimi.jsx` `SUB_TABLES` listesinden `'project_tasks'` çıkarılır; görevler
  `projects` silinirken CASCADE ile gider. Görevi engelleyen NO ACTION bağları (`project_risks`,
  `procurement_items`) zaten `SUB_TABLES`'ta `projects`'ten önce siliniyor.
- Artı: bayrak yok, istemcinin taklit edebileceği bir şey yok; küçük değişiklik.
- Eksi: proje silme hâlâ atomik değil (bugünkü durum, değişmiyor).
- **Doğrulanması gereken varsayım:** FK CASCADE ile tetiklenen görev silmesinde trigger içindeki
  `select … from projects where id = old.project_id` silinmiş proje satırını görmemeli (RI eylemleri ana
  DELETE'ten sonraki komut kimliğinde çalışır). ROLLBACK provasında ölçülür; tutmazsa B'ye geçilir.

## 4. Önerilen trigger (C) — taslak metin, migration değil

```sql
create or replace function public.fn_project_tasks_delete_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  -- Proje satırı yoksa silme projects'ten CASCADE ile geliyor: proje siliniyor, izin ver.
  if not exists (select 1 from projects p where p.id = old.project_id) then
    return old;
  end if;
  if old.wbs_id is not null
     or exists (select 1 from task_dependencies d where d.task_id = old.id or d.predecessor_id = old.id)
     or exists (select 1 from task_monthly_plan m where m.task_id = old.id) then
    raise exception 'Görev silinemez (%): öncül/ardıl bağımlılığı, aylık planı veya WBS bağı var. Görevi iptal edin ya da önce bu verileri kaldırın.',
      coalesce(old.task_code, old.id::text)
      using errcode = '23503';
  end if;
  return old;
end
$fn$;
revoke all on function public.fn_project_tasks_delete_guard() from public, anon, authenticated;
create trigger trg_project_tasks_delete_guard
  before delete on public.project_tasks
  for each row execute function public.fn_project_tasks_delete_guard();
```

- SECURITY DEFINER: varlık kontrolü RLS'ten bağımsız olsun (görünmeyen satır yüzünden yanlış "izin" olmasın).
- Satır başına üç indeksli arama (`task_dependencies_task_idx`, `task_dependencies_pred_idx`,
  `task_monthly_plan_unique (task_id, month)` canlıda var).
- `errcode 23503` FK ihlaliyle aynı sınıf; sihirbazın mevcut hata gösterimi mesajı olduğu gibi gösterir.

**Ters SQL:**
```sql
drop trigger if exists trg_project_tasks_delete_guard on public.project_tasks;
drop function if exists public.fn_project_tasks_delete_guard();
```

## 5. Sıra ve riskler

1. Ön yüz kilidi (`hotfix-sihirbaz-kilidi`) yayına çıkar.
2. `TabProjeYonetimi.jsx` `SUB_TABLES` değişikliği yayına çıkar (aynı hotfix'e eklenebilir; ayrı onay).
3. ROLLBACK provası (canlı, iz bırakmadan; öncesi/sonrası parmak izi):
   - P1 sihirbaz yolu: DYB1'de `delete from project_tasks where project_id = …` → red; bağımlılık/aylık plan sayısı aynı.
   - P2 veri taşımayan proje (ADN2) → görev silme geçer.
   - P3 proje silme: DYB1'de `projects` satırı silinince görevler, bağımlılıklar, aylık plan CASCADE ile gider (3.C varsayımı).
   - P4 yeni proje: insert etkilenmez.
   - P5 tek görev: bağımlılığı olan görev silinemez; bağımlılık silindikten sonra silinir.
   - P6 rol: admin ve PM aynı sonucu alır.
4. Migration (onay + mesai dışı).

Riskler:
- 2. adım 4'ten önce çıkmazsa bağımlılıklı bir projeyi silmek trigger hatasıyla yarıda kalır. Bu hata açıktır,
  veri kaybı yoktur ama istemci zinciri atomik olmadığı için önceki adımlarda silinen bağlı veriler (ticket vb.)
  silinmiş kalır. Bugün yalnızca DYB1/DYB2'yi ilgilendirir.
- 6b'deki `save_project_tasks` taslağı (d) bu kurala uymalı: bağımlılığı/aylık planı/WBS'i olan görevi silmez,
  iptal eder. Uymazsa trigger hatası verir (sessiz kayıp değil).
- `wbs_id` kuralı WBS doldurulduktan (Faz 1 kapanışı adım 5) sonra veri taşımayan eski projelerde de görev
  silmeyi engeller; bu istenen davranış.
