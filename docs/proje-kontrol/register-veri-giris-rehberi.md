# Register veri giriş rehberi (Supabase panelinden doğrudan giriş)

Tarih: 14.10.2026. Kaynak: canlı katalog, yalnızca salt okunur SELECT. Canlıda hiçbir şey değiştirilmedi.

Bu rehber, register ekranları (Faz 3) hazır olana kadar kayıtları **Supabase panelinden** (Table Editor ya da SQL
Editor) girecek kişi içindir. Kullanmadan önce §0'daki "Onay bekleyen noktalar" kapanmalı.

## 0. Onay bekleyen noktalar (kural 8: talimat ile kararlar/canlı şema çelişiyor)

| # | Çelişki | Öneri |
|---|---|---|
| R1 | Kayıtlar yalnızca RPC ile yazılacaktı (CLAUDE.md "Ücretsiz plan sınırları", G-01, CONVENTIONS §4). Panel `postgres` rolüyle çalışır (`rolbypassrls = true`), RLS'i ve rol yetkilerini atlar | Panel girişi **geçici istisna** olarak açıkça kabul edilsin; panele kimin erişeceği sınırlı tutulsun (§2) |
| R2 | Talimat "numara elle yazılır (RFI-TIZ-0001)" diyor. Canlıda numarayı trigger üretiyor (`fn_assign_register_no` → `next_register_no`, sayaç `project_register_counters`). Bu sayaç **zaten canlıda**, B1 ile gelmiyor. Elle yazılan numara sayacı ilerletmez; sonraki otomatik numara onunla çakışır | Numara kolonu **boş bırakılsın**, trigger doldursun. Elle numara yalnızca kağıt arşivinden taşınan kayıtta ve §4'teki eşitleme ile |
| R3 | Talimat SharePoint linkini `storage_provider = 'sharepoint'` + `url` ile yazmayı öneriyor. Canlıda `url` kolonu yok. CONVENTIONS §5: `sharepoint` SharePoint/Graph öğe kimliği (`driveId:itemId`) için ayrıldı; tarayıcıdaki `https://` adresi `external` ile ve `storage_file_id`'ye yazılır | Paylaşım linki için `external`. SharePoint öğe kimliği kullanılacaksa ayrı karar (biçim "geçiş anında kesinleşir") |
| R4 | B3 taslağı (Faz 2) register tablolarında satır varsa **duruyor** (A0: "record_state geri doldurma planı gerekir"). B5'in yeni kısıtı (`current_is_ready`) mevcut `is_current` revizyonlarda başarısız olur | Panel girişi başlarsa B3 ve B5 taslaklarına geri doldurma adımı eklenir (§5) |
| R5 | Change, Claim, Interface Faz 5'te (Karar 13, 66). Karar 63: PM erişimi Faz 5 Claim/Change'den önce yeniden açılır. Karar 10: change/claim'de dört göz. Panelde dört göz uygulanamaz | Tablo taslağı yalnızca gösterildi (`taslak-sql/f5_changes_claims_interfaces.sql`); uygulama kararı ve önekler (CHG/CLM/ITF önerisi) kullanıcıda |
| R6 | Register kayıtları uygulamada hiçbir ekranda görünmüyor (Faz 3). Yalnızca panele erişen görür | Bilgi; Faz 3'e kadar paylaşım için panelden CSV dışa aktarma |

## 1. Canlıdaki register tabloları (14.10.2026)

| Register | Tablo | Satır | Numara kolonu / önek | Uygulamada ekran |
|---|---|---|---|---|
| Document | `documents` (+ `document_revisions`) | 0 | `document_no` / `DOC` | Yok |
| Drawing | `documents` (`document_type = 'drawing'`) + `drawings` | 0 | `document_no` / `DRW` | Yok |
| RFI | `rfis` | 0 | `rfi_no` / `RFI` | Yok |
| Action | `project_actions` | 0 | `action_no` / `ACT` | Yok |
| Decision | `decisions` | 0 | `decision_no` / `DEC` | Yok |
| Technical Submittal | `technical_submittals` | 0 | `submittal_no` / `TS` | Yok |
| Material Approval | `material_approvals` | 0 | `approval_no` / `MA` | Yok |
| Risk | `project_risks` | 55 | Yok (RSK Faz 3'te, Karar 14) | **Var**: proje düzenleme sihirbazı › Riskler, Satın Alma › Riskler |
| (yardımcı) | `project_register_settings` | 4 | Proje kodu | — |
| (yardımcı) | `project_register_counters` | 0 | Sayaç | — |
| (yardımcı) | `register_status_history` | 0 | Durum geçmişi (trigger yazar) | — |
| (ana veri) | `project_wbs`, `project_areas`, `area_wbs` | 0 / 0 / 0 | — | Yok (Adım 5) |

Canlıda tablosu **olmayan** register'lar: Change, Claim, Interface (Faz 5), NCR, Inspection (ertelendi, Karar 8),
Procurement, Subcontractor, Payment (mevcut satın alma ve finans tablolarının köprü görünümü, Faz 4/6). Son üçü
için panelden giriş yapılmaz; veri zaten Satın Alma ve Finans ekranlarından giriliyor.

## 2. Genel kurallar (her register için)

**Panelden doğrudan giriş yapılabilir mi?** Evet.
- Panel `postgres` rolüyle yazar ve RLS'e takılmaz.
- Uygulama kullanıcısı (`authenticated`) ise bu tablolara yazamaz; G-01 gereği yalnızca SELECT yetkisi var.
- Trigger'lar, CHECK'ler, NOT NULL ve FK'ler panelde de çalışır.

**Proje (`project_id`):** metin anahtarlar.

| Proje | `project_id` | Kod |
|---|---|---|
| Kaptan Demir Çelik (Adana GES-1) | `kaptan-demir-adana-arazi-faz1` | ADN1 |
| Kaptan Demir Çelik (Adana GES-2) | `kaptan-demir-adana-arazi-faz2` | ADN2 |
| Ege Enerji İzmir GES TEST | `test-izmir-ges-2026` | TIZ |
| Kayseri Develi GES | `test-kayseri-develi-ges` | TKY |

Kodu olmayan projeye kayıt açılamaz: "Proje kodu tanımlı değil (project_register_settings)". Diyarbakır henüz yok;
6b'de oluşturulur (Karar 74).

**Numara:**
- Numara kolonunu **boş bırakın**. Kayıt eklenince `{ÖNEK}-{PROJE_KODU}-{SIRA}` biçiminde dolar (ör. `RFI-TIZ-0001`).
- Sıra proje ve register bazında artar, 4 haneye kadar sıfırla doldurulur, kırpılmaz (`RFI-TIZ-10000`).
- Kayıttan sonra numarayı **değiştirmeyin**; panelde engel yok, ama numara başka belgelerde geçiyorsa bağ kopar.
- Table Editor'ın NOT NULL numara kolonunu boş kabul edip etmediği **doğrulanamadı**. Kabul etmezse SQL Editor'de
  numara kolonunu hiç yazmadan `insert` kullanın (§3'te örnekler).
- Silinen kaydın numarası geri gelmez; boşluk kabul.

**Kim girdi (`created_by`):** panelde oturum kullanıcısı yok (`auth.uid()` boş).
- `created_by` kolonu olan tablolarda (documents, document_revisions, drawings, decisions, project_actions) kaydı
  açan kişinin `profiles.id`'sini yazın: SQL Editor'de `select id, full_name, role_key from profiles order by full_name`.
- `rfis`'te karşılığı `raised_by`. `technical_submittals` ve `material_approvals`'ta bu kolon yok (B3 ekler), kim
  girdiyse `description`/not alanına yazın.
- `register_status_history.changed_by` panel girişinde hep boş kalır.

**Görev bağı (`task_id`): BOŞ bırakın (Karar 69).** Sihirbaz düzeltmesi (Ç-B) 6b'de yayına çıkana kadar register
kaydı göreve bağlanmaz; ADN1/ADN2'de sihirbaz kaydı kırılabilir.

**WBS ve alan (`wbs_id`, `area_id`):** bugün canlıda WBS ve alan kaydı yok (0 satır), bu yüzden şimdilik boş.
WBS/alan da panelden girilecekse §3.9'daki biçim kurallarına uyun; yoksa 6a'da migration durur.

**Bağlantılı kayıtlar (`rfi_id`, `decision_id`, `risk_id`, `document_id` …):** kompozit FK; bağlanan kayıt **aynı
projede** olmalı, yoksa "violates foreign key constraint" hatası.

**Bildirim:** register tablolarında bildirim trigger'ı yok; panel girişi kimseye bildirim göndermez.

**Silme:** panelde silme yapmayın. Kaydı iş durumuyla kapatın (`cancelled`, `void`, `superseded`). Doküman silinirse
revizyonları da silinir (`ON DELETE CASCADE`).

**Panele erişim:** Supabase panel hesabı veritabanının tamamına yazar (finans dahil). Panel erişimi yalnızca kayıt
girecek kişiyle sınırlı tutulmalı.

## 3. Register bazında

Kısaltmalar: **Z** = zorunlu (NOT NULL, varsayılanı yok), **V** = varsayılanı var, boş bırakılabilir.

### 3.1 Document — `documents` + `document_revisions`

`documents` doküman kimliğidir; dosya ve revizyon `document_revisions`'ta.

| Kolon | | Değer |
|---|---|---|
| `project_id` | Z | §2 tablosu |
| `title` | Z | Doküman adı |
| `document_no` | — | Boş bırakın → `DOC-TIZ-0001` |
| `document_type` | | Serbest metin (ör. `spec`, `report`, `procedure`). **`drawing` yazmayın**: çizim için §3.2 |
| `discipline` | | Serbest metin; ileride uyum için şu listeden: `mechanical`, `dc`, `ac`, `mv`, `hv`, `enh`, `civil`, `scada`, `general` |
| `status` | V | `active` (varsayılan) veya `void` |
| `created_by` | | Açan kişinin `profiles.id`'si |
| `task_id` | | **Boş** (Karar 69) |

Revizyon ve dosya linki — `document_revisions`:

| Kolon | | Değer |
|---|---|---|
| `project_id` | Z | Dokümanınkiyle aynı |
| `document_id` | Z | `documents.id` |
| `revision_no` | Z | Büyük harf/rakamla başlar, en fazla 10 karakter, `[A-Z0-9.-]`: `00`, `01`, `A`, `B.1` |
| `revision_status` | Z | `ifr` (görüş için), `ifa` (onay için), `ifc` (uygulama için), `as_built` |
| `is_current` | V | `false` varsayılan. Doküman başına **tek** `true` |
| `storage_provider` | | SharePoint/OneDrive paylaşım linki için **`external`** (bkz. §0 R3) |
| `storage_file_id` | | Tam `https://…` adresi |
| `file_name` | | Dosya adı (ör. `TIZ-Elektrik-Sartname-Rev01.pdf`) |
| `issue_date` | | `YYYY-MM-DD` |
| `mime_type`, `size_bytes`, `sha256` | | Boş bırakılabilir; `sha256` doluysa 64 küçük hex karakter |
| `created_by` | | Açan kişi |

- Aynı dokümanda aynı `revision_no` iki kez girilemez.
- Yeni revizyonu güncel yapmak için önce eskisini `is_current = false`, sonra yenisini `true` yapın. Tersi sırada
  "document_revisions_one_current" hatası alınır.

### 3.2 Drawing — `documents` + `drawings`

İki adım:
1. `documents`'a satır: `document_type = 'drawing'` (numara `DRW-TIZ-0001` olur), `title`, `project_id`.
2. `drawings`'e satır: `project_id`, `document_id` (1. adımdaki `id`), `drawing_type` (serbest: `layout`, `single_line`,
   `detail` …). `document_type` kolonu `drawing` varsayılanıyla gelir, değiştirmeyin.

Çizimin numarası ve revizyonu dokümandan gelir; revizyon ve link §3.1'deki gibi `document_revisions`'a.
Bir doküman yalnızca bir çizime bağlanır; `document_type`'ı `drawing` olmayan dokümana çizim bağlanamaz.

SQL Editor örneği (kurgu değerler):

```sql
with d as (
  insert into public.documents (project_id, title, document_type, discipline, created_by)
  values ('test-izmir-ges-2026', 'Genel Yerleşim Planı', 'drawing', 'civil', '<profiles.id>')
  returning project_id, id)
insert into public.drawings (project_id, document_id, drawing_type)
select project_id, id, 'layout' from d
returning document_id;
```

### 3.3 RFI — `rfis`

| Kolon | | Değer |
|---|---|---|
| `project_id` | Z | |
| `subject` | Z | Konu |
| `question` | Z | Soru metni |
| `rfi_no` | — | Boş → `RFI-TIZ-0001` |
| `status` | V | `open` (varsayılan), `under_review`, `answered`, `closed`, `rejected` |
| `priority` | V | `low`, `medium` (varsayılan), `high`, `critical` |
| `raised_date` | V | Bugün; geçmiş tarihli RFI'da elle `YYYY-MM-DD` |
| `raised_by` | | Soran kişinin `profiles.id`'si (sistem dışı kişi ise boş, adını `description`'a) |
| `assigned_to` | | Yanıtlayacak kullanıcı |
| `responsible_discipline` | | §3.1 disiplin listesi |
| `due_date`, `answered_date` | | `YYYY-MM-DD` |
| `response` | | Yanıt metni |
| `drawing_id`, `document_id`, `decision_id` | | Aynı projedeki kayıt |
| `task_id` | | **Boş** |

İlk eklemede ve her durum değişikliğinde `register_status_history`'ye satır düşer.

### 3.4 Action — `project_actions`

| Kolon | | Değer |
|---|---|---|
| `project_id`, `title` | Z | |
| `action_no` | — | Boş → `ACT-TIZ-0001` |
| `status` | V | `open`, `in_progress`, `done`, `cancelled` |
| `priority` | V | `low`, `medium`, `high`, `critical` |
| `source_type` | V | `manual` (varsayılan), `risk`, `rfi`, `decision`, `meeting`, `other` |
| `assigned_to` | | Sistem kullanıcısı; dış taraf ise boş, adı `responsible`'a |
| `due_date` | | `YYYY-MM-DD` |
| `completed_at` | | `done` yapıldığında elle (trigger doldurmuyor) |
| `risk_id`, `rfi_id`, `decision_id` | | Kaynağa göre, aynı proje |
| `created_by` | | Açan kişi |
| `task_id` | | **Boş** |

### 3.5 Decision — `decisions`

| Kolon | | Değer |
|---|---|---|
| `project_id`, `title` | Z | |
| `decision_text` | Z | Kararın metni |
| `decision_no` | — | Boş → `DEC-TIZ-0001` |
| `status` | V | `proposed` (varsayılan), `approved`, `superseded`, `cancelled` |
| `decision_date` | | `YYYY-MM-DD` |
| `decision_maker` | | Serbest metin (kişi/kurum) |
| `rfi_id`, `risk_id` | | Aynı proje |
| `created_by` | | Açan kişi |
| `task_id` | | **Boş** |

**Karar 10:** decision'ı yalnızca admin onaylar ve oluşturan kendi kaydını onaylayamaz. Panelde bu kontrol yok:
`approved` yalnızca, oluşturandan farklı bir admin onay verdiyse yazılsın; onaylayanın adı `decision_maker`'a.

### 3.6 Technical Submittal — `technical_submittals`

Karar 45: ekranı Ocak 2027'de; tablo bugün kullanılabilir.

| Kolon | | Değer |
|---|---|---|
| `project_id`, `title` | Z | |
| `submittal_no` | — | Boş → `TS-TIZ-0001` |
| `status` | V | `draft`, `submitted`, `under_review`, `approved`, `approved_with_comments`, `rejected`, `resubmit_required` |
| `revision` | V | `00` |
| `discipline` | | §3.1 listesi |
| `supplier_id` | | `suppliers.id` |
| `submitted_date`, `due_date`, `reviewed_date` | | `YYYY-MM-DD` |
| `reviewer_id` | | Sistem kullanıcısı |
| `document_id` | | Ekli doküman (§3.1) |
| `task_id` | | **Boş** |

`created_by` kolonu yok (B3 ekler); girenin adını `description`'a yazın.

### 3.7 Material Approval — `material_approvals`

| Kolon | | Değer |
|---|---|---|
| `project_id` | Z | |
| `material_name` | Z | |
| `approval_no` | — | Boş → `MA-TIZ-0001` |
| `status` | V | `draft`, `submitted`, `approved`, `approved_with_comments`, `rejected`, `expired` |
| `revision` | V | `00` |
| `manufacturer`, `model` | | |
| `supplier_id` | | `suppliers.id` |
| `submitted_date`, `approved_date` | | `YYYY-MM-DD` |
| `technical_submittal_id`, `document_id` | | Aynı proje |
| `task_id` | | **Boş** |

`created_by` ve `description` kolonu yok. Girenin adı için yer yok; ayrı bir not tutun.

### 3.8 Risk — `project_risks`

**Panelden değil uygulamadan girin:** Proje Yönetimi › projeyi düzenle › Riskler adımı. Liste Satın Alma › Riskler'de.
Panelden girilecekse:

| Kolon | | Değer |
|---|---|---|
| `project_id`, `title` | Z | |
| `severity` | V | `kritik`, `yüksek`, `orta` (varsayılan), `düşük` |
| `status` | V | `açık` (varsayılan), `azaltıldı`, `kabul_edildi`, `kapatıldı` (kapanış tarihi trigger'la dolar) |
| `probability`, `impact` | | 1-5 |
| `category` | V | `is_kalemi`, `satin_alma`, `diger` (varsayılan) |
| `source` | V | **`manuel`** bırakın. `otomatik` ve `rule_code` risk motoruna ait |
| `mitigation` | | |
| `task_id` | | **Boş** |

- Numara yok (RSK Faz 3'te, Karar 14).
- `created_by` yok; kritik kapanış onayı Faz 3'te. Eski riskler için Karar 65 geçerli.

### 3.9 Ana veri — WBS ve alan (yalnızca gerekirse)

Karar 19: ilk yükleme Excel import'u ile yapılacak; import (`import_wbs_areas`) 6a ile gelir. Mümkünse 6a'yı bekleyin.
Panelden girilirse:
- **Alan kodu (`project_areas.area_code`): yalnızca büyük harf ve rakam, tire yok** (`PB01`, `INV03`). Canlı kural
  tireye izin veriyor ama 6a'daki F1 kuralı (`^[A-Z0-9]+$`) mevcut satırları da denetler; tireli kod 6a'yı durdurur.
- `area_type`: `genel`, `ges`, `pv_blok`, `inverter_station`, `mv_feeder`, `tm`, `eih_section`, `depo`, `laydown`,
  `kamp`, `yol`, `diger`.
- **WBS kodu:** `^[A-Z0-9][A-Z0-9-]*$`, sabit haneli (`DYB-020`), proje içinde tekil.
- **WBS disiplini: yalnızca** `mechanical`, `dc`, `ac`, `mv`, `hv`, `enh`, `civil`, `scada`, `general` ya da boş.
  Adım 4'te gelen FK başka değeri reddeder ve 6a durur.
- `level` trigger'la hesaplanır; `parent_id` aynı projede olmalı.

## 4. Elle numara yazılırsa (kağıt arşivinden taşıma)

Elle numara yazmanın tek gerekçesi, sahada zaten kullanılmış bir numaranın korunması. Biçim
`{ÖNEK}-{PROJE_KODU}-{4 hane}`, örnek `RFI-TIZ-0012`. Elle girişten sonra, bir sonraki otomatik numaradan önce sayaç
eşitlenmeli, yoksa trigger aynı numarayı üretip "duplicate key … rfis_project_id_rfi_no_key" hatası verir.
Kontrol ve eşitleme 6a planında (`register-oncelikli-plan.md` › "Panelden girilen register kayıtları").
Eşitleme bir veri yazımıdır: SQL'i gösterilir, "uygula" ile ve yedek hatırlatılarak yapılır.

## 5. Panelden girişin riskleri ve 6a / Faz 2 sonrası durum

### 5.1 Riskler

| Risk | Açıklama | Azaltma |
|---|---|---|
| Doğrulama atlanır | Karar 6 yetki matrisi, şantiye şefinin "yalnızca kendi kaydı", durum geçiş kuralları (B1 `register_status_transitions`), dört göz (Karar 10) panelde uygulanmaz. CHECK dışında her durumdan her duruma geçilebilir | Girişi tek kişi/küçük grup yapsın; `approved` durumunu yalnızca onaylayan admin yazdırsın |
| Kim yaptı belirsiz | `auth.uid()` boş: `created_by` elle yazılmazsa boş; `register_status_history.changed_by` her zaman boş | `created_by`/`raised_by`'ı elle doldurun; bir giriş defteri tutun |
| Audit yok | B2 (6a) öncesi `register_audit` yok; yalnızca 3 tabloda (rfis, decisions, project_actions) durum geçmişi var. B2 sonrası her değişiklik izlenir ama kişi boş görünür | 6a'yı geciktirmeyin; 6a sonrası panel düzeltmesi yapılırsa nedeni nota yazın |
| Numara çakışması | Elle numara sayacı ilerletmez (§4). Numara sonradan değiştirilirse dış belgelerdeki referans kopar | Numarayı boş bırakın; değiştirmeyin |
| Geniş yetki | Panel hesabı tüm veritabanına yazar; yanlış tabloda silme/güncelleme geri alınamaz (otomatik yedek yok) | Panel erişimini daraltın; giriş günlerinde `npm run db:backup:data` |
| Görünmezlik | Kayıtlar uygulamada görünmez (Faz 3) | Paylaşım için CSV dışa aktarma |
| Görev bağı | Karar 69 | `task_id` boş |
| Biçim uyumsuzluğu | Tireli alan kodu, listede olmayan WBS disiplini 6a'yı durdurur | §3.9 |

### 5.2 6a uygulandığında

- **B1:** yalnızca yetki tabloları; mevcut kayıtlar etkilenmez. Panel girişi B1'den sonra da çalışır.
- **B2:** audit trigger'ları kurulur; **önceki kayıtların izi yoktur** (geriye doldurulmaz). İsteğe bağlı temizlik:
  her mevcut kayıt için `reason = 'panel girişi, B2 öncesi'` olan bir `insert` audit satırı (ayrı onaylı SQL).
- **B4, AID:** register kayıtlarına dokunmaz (`task_id` boşsa).
- **F1 A1-A3:** `project_areas` için tiresiz kod kuralı mevcut satırları da denetler; tireli kod varsa migration durur.
- **Adım 4:** `project_wbs.discipline` FK'si listede olmayan değeri reddeder; varsa migration durur.
- **A7:** yalnızca WBS/alan tablolarında şantiye şefi RLS'i; panel etkilenmez.
- **Prova:** prova ROLLBACK'li, register satırlarına dokunmaz; ama prova sırasında panel girişi yapılmamalı
  (Oturum 0 ile 5 arası; açık panel bağlantısı provanın aktif bağlantı kontrolüne takılıp onu durdurabilir).

### 5.3 Faz 2 uygulandığında (ek iş gerekir)

- **B3 A0 durur** (register tablolarında satır varsa). Taslağa geri doldurma eklenmeli:
  - `record_state`: iş durumundan türetme önerisi: `decisions.approved` → `approved`, `technical_submittals` /
    `material_approvals` onaylı durumlar → `approved`, diğerleri `draft`. `approved_by`/`approved_at` kim onayladıysa
    elle; bilinmiyorsa boş ve not.
  - `source`: panel kayıtları `import` (CHECK `manual`, `ai`, `import`), ileride ayırt edilsin diye.
  - `created_by` (B3'ün eklediği `rfis` (= `raised_by`), `technical_submittals`, `material_approvals`): bilinen kişiyle.
- **B3 sonrası:** yazma policy'leri düşer, SELECT `register_can(..., 'view')` ile daralır. Uygulamadan yazma yalnızca
  RPC. `created_by` boş kayıtları şantiye şefi düzenleyemez (edit_scope own); admin/PM düzenler. Dört göz `created_by`
  boşsa Karar 65'teki gibi herhangi bir yetkili onaylar (Faz 2'de netleşmeli).
- **Sayaç:** B3 RPC'leri de `next_register_no` kullanır; elle numara girildiyse B3'ten önce §4 eşitlemesi.
- **B5 (patron onayı sonrası):** `upload_status` varsayılanı `uploading`, yeni kısıt `is_current` revizyonun `ready`
  olmasını istiyor. Mevcut `external` revizyonlar kısıta takılır; B5'e
  `update document_revisions set upload_status = 'ready', uploaded_at = created_at where storage_provider <> 'supabase_storage'`
  adımı eklenmeli (kısıttan önce).
- **B6:** görünümler mevcut kayıtları gösterir; ek iş yok.
- **Faz 3:** risk numarası (Karar 14) mevcut 55 risk ve panel riskleri için aynı göç ile verilir.

**Özet:** 6a'dan önce temizlik yalnızca biçim uyumu (alan kodu, WBS disiplini) ve gerekirse sayaç eşitlemesi.
Faz 2'de B3 ve B5 taslaklarına geri doldurma adımı yazılmalı; bu adımlar ayrıca gösterilip onaylanır.
