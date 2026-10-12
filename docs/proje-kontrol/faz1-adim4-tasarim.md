# Faz 1 Adım 4 — WBS/alan bütünlüğü ve Excel importu (tasarım)

Tarih: 12.10.2026. Durum: taslak yazıldı, canlıda yalnızca ROLLBACK ile denendi (`faz1-adim4-sonuclar.md`). Uygulanmadı
(Adım 6).

Teslimler:
- `taslak-sql/f1_wbs_alan_import.sql` (BÖLÜM A uygula / B geri al);
- `taslak-sql/f1_adim4_testler.sql` (T21-T34);
- `taslak-sql/f1_dogrulama.sql` §6 (R17-R26);
- `src/utils/wbsAreaExcel.js`;
- `scripts/proje-kontrol/wbs-alan/{sablon-uret,kontrol}.mjs`;
- `sablon/wbs-alan-sablonu.{xlsx,md}`;
- `tests/proje-kontrol-wbs-alan-excel.spec.js`.

## 1. Kararlar (CLAUDE.md karar tablosu)

| # | Karar |
|---|---|
| 45 | MVP senaryosu (b). Technical Submittal ve Material Approval ekranları Ocak 2027'ye kaydı. Document ekranı external link ile başlar; Storage yüklemesi B5 onayından sonra gelir. Ç6 kapandı: Faz 3 kapsamı Document, Drawing, RFI, Action, Risk, Decision. |
| 46 | WBS'te sıra kolonu yok; liste WBS koduna göre sıralanır. Şablonda "kodları sabit haneli yazın (DYB-020, DYB-100)" notu var. Örnek satırlar kurgudur (TIZ tarzı). Not kolonları şablonda (`notes`). |
| 47 | `project_wbs.discipline` → `task_disciplines` FK (`project_wbs_discipline_fk`). |
| 48 | Activity ID bütünlüğü veritabanında (trigger), yalnızca import'ta değil (§3). |
| 49 | Ç-7 guard düzeltmesi bu adımda yapıldı: aktif alt kaydı olan kayıt pasifleştirilemez; taşınan WBS'in alt WBS'lerinin `level`'ı güncellenir. Import'taki kontrol rapor için kalır. |
| 50 | Import: Excel ön yüzde okunur, JSON olarak tek RPC'ye (`import_wbs_areas`) gider. Kurallar: varsayılan önizleme; yalnızca admin ve proje yöneticisi; hepsi ya da hiçbiri; koda göre eşleşme; silme yok; `aid_impact` raporu; her yazma audit'e. |

## 2. Canlıda bugün ne engelleniyor (salt okunur kontrol, 12.10.2026)

Kaynaklar:
- `fn_project_wbs_guard`, `fn_project_areas_guard` (BEFORE INSERT/UPDATE, invoker);
- `pg_constraint`'teki FK'ler.

| İşlem | Bugün | Not |
|---|---|---|
| Alan kodu değiştirme | **Engelli**: herhangi bir görev (ID'li ya da ID'siz) alanı kullanıyorsa "Kullanımdaki alan kodu değiştirilemez" | Kural 1'den sıkı; korundu |
| WBS kodu değiştirme | **Engelli**: görev WBS'i doğrudan kullanıyorsa. Üst WBS'in kodu serbest | WBS kodu Activity ID'de yok; üst kod serbest kalabilir |
| Alan / WBS pasifleştirme | **Serbest** (ID'li görev olsa da). Üst pasifleştirilirken aktif alt kontrolü yok (Ç-7) | Adım 4'te kapatıldı |
| Alan / WBS taşıma | **Serbest** (yalnızca döngü kontrolü). Taşınan WBS'in altlarının `level`'ı güncellenmiyor (Ç-7) | Adım 4'te kapatıldı |
| `area_wbs` INSERT / DELETE | **Kontrolsüz** (yalnızca RLS) | Adım 4'te kapatıldı |
| Alan / WBS silme | **Engelli**, görevden referans varsa (FK `project_tasks_area_fk` / `project_tasks_wbs_fk`, ON DELETE RESTRICT; teknik FK mesajı). `area_wbs` FK'leri CASCADE (alan veya WBS silinince bağları gider). Üst kayıt FK'si RESTRICT | Adım 4'te ID'li görev için açık mesaj eklendi |

Diğer tablolar da alan/WBS'e FK ile bağlı ve hepsi NO ACTION, yani referans varsa silme engelli:
`procurement_items`, `purchase_requests`, `project_risks`, `documents`, `decisions`, `rfis`, `project_actions`,
`technical_submittals`, `material_approvals`.

## 3. Veritabanı koruması (Karar 48)

Bütün kontroller SECURITY DEFINER yardımcılarla yapılır, böylece çağıranın RLS'inden bağımsızdır (şantiye şefi dahil):
- `fn_wbs_subtree_activity_ids`
- `fn_area_activity_ids`
- `fn_aid_area_wbs_violations`

| Kural | Yer | Mesaj |
|---|---|---|
| 1. Kod değişikliği | Guard (canlı kural aynen; görevi olan kaydın kodu değişmez) | "Kullanımdaki … kodu değiştirilemez" |
| 2a. ID'li görevin alanı pasifleştirilemez / taşınamaz | `fn_project_areas_guard` | "Activity ID'li görevin alanı pasifleştirilemez / taşınamaz" |
| 2b. ID'li görevin WBS'i veya üst WBS'i pasifleştirilemez / taşınamaz (WBS'in alt ağacında ID'li görev varsa) | `fn_project_wbs_guard` | "Activity ID'li görevin WBS'i veya üst WBS'i …" |
| 3a. Karar 38'i bozan bağ eklenemez | `trg_area_wbs_aid_guard` (AFTER ROW) | "Alan-WBS bağı eklenemez …" |
| 3b. ID'li görevin alanını kümeden çıkaran bağ silinemez | `trg_area_wbs_aid_guard` | "Alan-WBS bağı kaldırılamaz …" |
| 4. ID'li görevin alanı / WBS'i silinemez | `trg_project_areas_delete_guard`, `trg_project_wbs_delete_guard` (BEFORE DELETE; FK RESTRICT zaten engelliyor, bu katman açık mesaj verir) | "Activity ID'li görevin … silinemez" |
| Ç-7a. Aktif alt kaydı olan kayıt pasifleştirilemez | İki guard | "Aktif alt … olan … pasifleştirilemez" |
| Ç-7b. Taşınan WBS'in alt WBS'lerinin level'ı yeniden hesaplanır | `trg_project_wbs_level_cascade` (AFTER UPDATE, `level` değişince) | — |

Ayrıntılar:
- **3a, AFTER ROW:** çok satırlı INSERT'te satırların hepsi eklendikten sonraki kümeye bakılır, yani satır sırasından
  bağımsızdır.
- **Kural:** WBS'in (ve alt WBS'lerinin) ID'li görevleri için zincirdeki bağ kümesi doluysa, görevin alanı kümede olmalı.
- **3b:** görevin alanı silinen bağın alanıysa ve küme artık o alanı içermiyorsa (küme boşalsa bile) reddedilir.
- **Proje silme zinciri** çalışır. Proje satırı görünmüyorsa silme ve `area_wbs` kontrolleri atlanır
  (`fn_project_tasks_delete_guard` deseni). R26 bunu hiyerarşi, bağ ve ID'li görevle doğrular.

**Audit:**
- `project_wbs` ve `project_areas`: B2'nin `fn_register_audit`'i.
- `area_wbs`: ayrı `fn_area_wbs_audit`. Tabloda `id` yok; kayıt = `area_id`, değişen = `wbs_id`.
- Doğrudan ekran yazımı da kaydedilir (T33).

### B4 muafiyeti: önerilmiyor

- **Bu kurallar B4'ün dokunduğu tabloda değil.** Kurallar `project_wbs`, `project_areas` ve `area_wbs`'te; B4
  (`admin_correct_task_activity_id`) ise `project_tasks`'ı değiştirir.
- **B4 bu trigger'lara hiç takılmaz.**
- **Admin'in ID'li görevin alanını pasifleştirmek istediği durumda doğru sıra:**
  1. B4 ile görevin alanını (ve ID'sini) gerekçeli olarak düzeltmek;
  2. sonra eski alanı pasifleştirmek.
- **Muafiyet açılmamalı.** Açılırsa trigger'ların "ID'li görevi hiçbir yazma yolu bozamaz" garantisi bir bayrağa bağlanır.

## 4. Import mimarisi (Karar 50)

**Akış:**
1. Excel ön yüzde (veya betikte) `src/utils/wbsAreaExcel.js` ile okunur.
2. JSON olarak `import_wbs_areas(p_project_id, p_payload, p_dry_run default true)`'ya gider.
   - Fonksiyon SECURITY DEFINER, `search_path=public`.
   - `anon`'a kapalı, `authenticated`'a açık.

**Edge function seçilmedi, çünkü:**
- `import-project-excel` `service_role` ile çalışıyor ve yazımları ayrı ayrı yapıyor (hepsi ya da hiçbiri değil).
- Tek RPC, tek işlemde atomik (kural 6).
- Rol ve proje kontrolü fonksiyonun içinde.

**Davranış:**
- **Yetki:** `get_my_role()` admin veya proje_yoneticisi değilse `forbidden`. Proje erişimi `has_project_access`; önizleme de dahil.
- **Rapor:**
  - `summary`: sayfa başına ekle / güncelle / değişmez / hata, `error_count`, `aid_impact_count`;
  - `items`: satır başına işlem ve değişen alanlar;
  - `errors`: {sheet, row, code, field, message};
  - `aid_impact`: {sheet, row, activity_id, message};
  - `not_in_file`: dosyada olmayan WBS, alan ve bağlar.
- **Gerçek import:**
  - Hata veya `aid_impact` varsa `validation` döner, hiçbir şey yazmaz.
  - Proje satırı `FOR UPDATE` ile kilitlenir.
  - Yazma sırası:
    1. üstten alta ekle/güncelle (pasifleştirme hariç);
    2. alttan üste pasifleştir;
    3. bağları ekle.
  - Yazma sırasında bir guard reddederse hepsi geri alınır ve mesajla birlikte `validation` döner.
  - Gerekçe `fons.audit_reason = 'WBS/alan import: <dosya adı>'`.
- **Eşleştirme koda göre:** kod değişikliği "yeni kayıt + dosyada olmayan eski kayıt" görünür. Silme yok; bağlar yalnızca eklenir.
- **Çalışma tabloları:** her çağrıda düşürülüp yeniden kurulan, işlem sonunda düşen geçici tablolar (`_iwa_*`). Çağıranın aynı adla açtığı bir geçici tablo yeniden kullanılmaz.

## 5. Doğrulama kuralları

Kod listesi `sablon/wbs-alan-sablonu.md`'de. Projesiz kurallar iki yerde aynı mantıkla çalışır:
- `validateWbsAreaPayload` (JS);
- `import_wbs_areas(null, …)`.

Proje gerektiren kurallar yalnızca RPC'de: `deactivate_with_active_children`, `aid_impact`, üst kod ve bağ kodunun
projede bulunması.

Kayma kontrolü: T26 dosyaları için canlıdaki projesiz sonuçlar (ROLLBACK, 4b) JS spec'inde beklenen değer olarak duruyor.
İkisi aynı listeyi veriyor.

## 6. Projesiz doğrulama (Diyarbakır)

`node scripts/proje-kontrol/wbs-alan/kontrol.mjs <dosya.xlsx>`:
- veritabanına bağlanmaz, anahtar istemez;
- raporu `<dosya>.kontrol.md`'ye yazar;
- çıkış kodu: 0 hata yok, 1 hata var, 2 okunamadı.

Proje oluşturulunca aynı dosya `import_wbs_areas(proje, …, true)` ile proje kurallarına göre de önizlenir.

## 7. Adım 6 sırası

F1-AID'den sonra ayrı migration: B1 → B2 → B4 → F1 A1-A3 → F1-AID → **Adım 4** → … → F1 A4 (Karar 34).

Adım 4 şunlara bağlı:
- `task_disciplines` (AID);
- `register_audit` ve `fn_register_audit` (B2);
- `register_raise` (B1).

`f1_dogrulama.sql` §6 (R17-R26) Adım 6'da diğer bölümlerle birlikte çalışır.

## 8. Açık noktalar

1. **Ç-6: şantiye şefinin alan ve alan-WBS yazma yetkisi.**
   - Canlı RLS izin veriyor: `project_areas` insert/update ve `area_wbs` insert/delete kendi projesinde.
   - Import'u admin/PM'e kısıtlamak bu yolu kapatmaz; ama Activity ID kuralları artık trigger'da olduğu için şantiye şefi de ID'li görevi bozamaz (T32).
   - Karar Adım 5'te ekranla birlikte verilecek.
2. **Görev tarafında Karar 38 açığı — KAPANDI (Karar 51, 12.10.2026).** Kullanıcı karma kuralı onayladı; ayrı bir
   SECURITY DEFINER trigger olarak AID taslağına (A3b) eklendi, T35a-e ve R27 ROLLBACK ile geçti
   (`faz1-adim4-sonuclar.md` "Karar 51"). Orijinal bulgu:
   - Adım 4 trigger'ları alan/WBS/bağ tablolarını koruyor.
   - Ama ID'li görevin WBS'i Karar 39 gereği serbestçe değiştirilebiliyor (yalnızca audit'e yazılıyor). `fn_project_tasks_identity_guard` yeni WBS'in bağ kümesinin görevin alanını içerip içermediğine bakmıyor.
   - B4'ün alan düzeltmesi de bu kontrolü yapmıyor.
   - Sonuç: görev tarafından Karar 38 bozulabilir.
   - Öneri: identity guard'a "ID'li görevde WBS veya alan değişince yeni zincirin bağ kümesi doluysa görevin alanı içinde olmalı" kuralı. Karar 39'un "WBS değişikliği serbest" ifadesini daraltacağı için onay gerekiyor.
3. **Import'ta aynı dosyada iki işlem birden yapılamıyor:**
   - üst kaydı pasifleştirmek,
   - ve onun aktif alt kaydını başka bir üste taşımak.

   Guard yazma sırasında reddeder ve import hiçbir şey yazmadan `validation` döner. İki ayrı import ile yapılır. Önizleme
   bu durumu bugün öngörmüyor (yalnızca yazma reddediyor).
4. **Kural 10 metninde boolean ifadesi yanlış.**
   - 12.10.2026'da canlıda SELECT ile doğrulandı:
     - `true::text` → `true`;
     - `concat_ws` / `format('%s')` ile ham boolean → `t`.
   - CLAUDE.md'deki metin buna göre düzeltildi.
