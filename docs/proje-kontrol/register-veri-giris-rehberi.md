# Register veri giriş rehberi (Supabase SQL Editor ile)

Tarih: 14.10.2026. Kaynak: canlı katalog, yalnızca salt okunur SELECT. Şablonlar canlıda BEGIN…ROLLBACK ile denendi (§4).

> **UYARI — önce okuyun**
> - Supabase panel hesabı (Table Editor, SQL Editor) **veritabanının tamamına** yazabilir: satın alma, fatura,
>   kullanıcılar dahil. Rol ve proje kısıtları (RLS) panelde **çalışmaz**.
> - **Otomatik yedek yok** (ücretsiz plan). Yanlış bir UPDATE veya DELETE geri alınamaz.
> - **Yalnızca §4'teki şablonları kullanın.** Table Editor'da hücre düzenleme, satır silme veya serbest SQL yazmayın.
> - **Register dışı hiçbir tabloda değişiklik yapmayın.** Şablonların yazdığı tablolar: `documents`,
>   `document_revisions`, `drawings`, `rfis`, `project_actions`, `decisions`, `technical_submittals`,
>   `material_approvals`, `project_risks`, `changes`, `claims`, `interfaces`.
> - UPDATE şablonlarında `where` satırını silmeyin ve değiştirmeden bırakmayın; her zaman tek kaydın numarasını yazın.
> - Toplu giriş günlerinde önce `npm run db:backup:data` (Karar 67).

Bu yol **geçicidir** (Karar 78): Faz 3 register ekranları gelince sona erer. Panel ve SQL Editor erişimi yalnızca
admin'lerdedir.

## 0. Kararlar (14.10.2026)

| Karar | İçerik |
|---|---|
| 78 | Panelden giriş G-01'e geçici istisna; panel/SQL Editor erişimi yalnızca admin'lerde; Faz 3 ekranları gelince sona erer |
| 79 | Numara kolonu boş bırakılır, trigger üretir |
| 80 | SharePoint linki: `storage_provider = 'external'`, link `storage_file_id`'de |
| 81 | B3 ve B5 taslaklarına mevcut kayıtları dolduran adımlar eklendi (§5.3) |
| 82 | Paylaşım için panelden CSV (§4.10) |
| 83 | 6a provası askıda; `psql` kurulumu kullanıcıdan beklenen girdi |

| 84 | Change, Claim, Interface tabloları yedeksiz uygulanabilir (yalnızca yeni tablolar; geri alma SQL'i test edildi) |

Change, Claim, Interface (`changes`, `claims`, `interfaces`): **14.10.2026'da canlıya uygulandı**
(`20261014082055_f5_changes_claims_interfaces`); şablonlar §4.11-4.13. Geri alma SQL'i
`taslak-sql/f5_changes_claims_interfaces.sql` BÖLÜM B'de.

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
| Risk | `project_risks` | 55 (hepsi otomatik) | Yok (RSK Faz 3'te, Karar 14) | Liste: Satın Alma › Riskler. Giriş için sihirbaz **kullanılmaz** (§3.8) |
| (yardımcı) | `project_register_settings` | 4 | Proje kodu | — |
| (yardımcı) | `project_register_counters` | 0 | Sayaç | — |
| (yardımcı) | `register_status_history` | 0 | Durum geçmişi (trigger yazar) | — |
| (ana veri) | `project_wbs`, `project_areas`, `area_wbs` | 0 / 0 / 0 | — | Yok (Adım 5) |

Canlıda tablosu olmayan register'lar: Change, Claim, Interface (Faz 5); NCR, Inspection (ertelendi, Karar 8);
Procurement, Subcontractor, Payment (satın alma ve finans ekranlarından zaten giriliyor; köprü görünümü Faz 4/6).

## 2. Genel kurallar

**Proje:** şablonlar projeyi kodla bulur (`where prefix = 'TIZ'`).

| Proje | Kod | `project_id` |
|---|---|---|
| Kaptan Demir Çelik (Adana GES-1) | ADN1 | `kaptan-demir-adana-arazi-faz1` |
| Kaptan Demir Çelik (Adana GES-2) | ADN2 | `kaptan-demir-adana-arazi-faz2` |
| Ege Enerji İzmir GES TEST | TIZ | `test-izmir-ges-2026` |
| Kayseri Develi GES | TKY | `test-kayseri-develi-ges` |

**Numara (Karar 79):** şablonlarda numara kolonu yok; kayıt eklenince `{ÖNEK}-{KOD}-{SIRA}` biçiminde dolar
(`RFI-TIZ-0001`) ve şablon sonucu olarak ekranda görünür. Sıra proje ve register bazında artar. Silinen kaydın
numarası geri gelmez.

**Kim girdi:** panelde oturum kullanıcısı yok. Şablonlar kişiyi tam adıyla bulur
(`where full_name = 'Ad Soyad'`; 14.10'da 10 profilin adı tekil). Ad yanlış yazılırsa alan sessizce boş kalır; önce
§4.0'daki listeyle doğrulayın. `technical_submittals` ve `material_approvals`'ta bu alan yok; giren kişiyi giriş
defterine yazın.

**Görev bağı (`task_id`): yok (Karar 69).** Şablonlarda görev alanı bulunmaz; 6b'ye kadar eklemeyin.
**WBS/alan (`wbs_id`, `area_id`):** canlıda WBS/alan kaydı yok, şablonlarda yer almaz.

**Dosya linki (Karar 80):** `storage_provider = 'external'`, tam `https://` adres `storage_file_id`'ye.
**Link yalnızca SharePoint'te o dosyaya erişimi olanlarda açılır;** Fons'taki register yetkisi SharePoint iznini vermez.

**Bildirim:** register tablolarında bildirim trigger'ı yok; giriş kimseye bildirim göndermez.

**Silme:** şablon yok. Kaydı iş durumuyla kapatın (`cancelled`, `void`, `superseded`).

## 3. Register bazında alanlar ve geçerli değerler

Z = zorunlu. Tarihler `YYYY-MM-DD`.

### 3.1 Document
- `documents`: `title` (Z); `document_type` serbest (`spec`, `report`, `procedure` …; **`drawing` yazmayın**);
  `discipline`: `mechanical`, `dc`, `ac`, `mv`, `hv`, `enh`, `civil`, `scada`, `general`; `status`: `active`, `void`.
- `document_revisions`: `revision_no` (Z; büyük harf/rakamla başlar, en fazla 10 karakter, `[A-Z0-9.-]`: `00`, `01`,
  `A`); `revision_status` (Z): `ifr` görüş için, `ifa` onay için, `ifc` uygulama için, `as_built`;
  `is_current`: doküman başına tek `true`; aynı dokümanda aynı revizyon no iki kez olmaz.

### 3.2 Drawing
Doküman satırı `document_type = 'drawing'` ile (`DRW` numarası) + `drawings` satırı (`drawing_type` serbest:
`layout`, `single_line`, `detail` …). Revizyon ve link dokümanınki gibi.

### 3.3 RFI
`subject`, `question` (Z); `status`: `open`, `under_review`, `answered`, `closed`, `rejected`; `priority`: `low`,
`medium`, `high`, `critical`; `responsible_discipline` §3.1 listesi; `raised_date` (varsayılan bugün), `due_date`,
`answered_date`, `response`.

### 3.4 Action
`title` (Z); `status`: `open`, `in_progress`, `done`, `cancelled`; `priority` RFI ile aynı; `source_type`: `manual`,
`risk`, `rfi`, `decision`, `meeting`, `other`; sistem dışı sorumlu `responsible`'a; `completed_at` `done`'da şablon yazar.

### 3.5 Decision
`title`, `decision_text` (Z); `status`: `proposed`, `approved`, `superseded`, `cancelled`; `decision_maker` serbest.
**Karar 10:** `approved` yalnızca kaydı oluşturandan farklı bir admin onayladıysa yazılır; onaylayanın adı
`decision_maker`'a.

### 3.6 Technical Submittal
`title` (Z); `status`: `draft`, `submitted`, `under_review`, `approved`, `approved_with_comments`, `rejected`,
`resubmit_required`; `revision` (varsayılan `00`); `discipline` §3.1 listesi.

### 3.7 Material Approval
`material_name` (Z); `status`: `draft`, `submitted`, `approved`, `approved_with_comments`, `rejected`, `expired`;
`revision` (varsayılan `00`); `manufacturer`, `model`.

### 3.8 Risk — sihirbaz kullanılmaz, SQL Editor şablonu (§4.9)

14.10.2026 kod incelemesi (yayındaki `main`; ROLLBACK ile denenmedi):
- **Sihirbazın Riskler adımındaki "Kaydet"** yalnızca riskleri yazar, görevlere dokunmaz (Ç-B'ye takılmaz). Ama
  projenin **bütün** risklerini silip formdaki satırları yeniden ekler ve şu alanları göndermez: `source`, `rule_code`,
  `subject_ref`, `closed_at`. Sonuçları:
  - Canlıdaki 55 riskin hepsi otomatik. Kaydetme bunları `manuel` olarak yeniden yazar, kuralla bağları kopar.
  - Risk motoru aynı gecikme/aşım için yeni otomatik risk açar, yani **kopyalar** oluşur.
  - Risk kimlikleri değişir. Kapalı risklerin kapanış tarihi kaydetme anına kayar.
  - Bir register kaydı riske bağlıysa (`risk_id`) silme FK hatasıyla reddedilir ve kayıt düşer.
- **Sihirbazın son adımındaki "Kaydet"** İş Kalemleri adımı açıldıysa görevleri de silip yeniden yazar (Ç-B):
  ilerlemesi olan projede hata, olmayan projede görev kimlikleri değişir ve `group_label` kaybolur.

Alanlar: `title` (Z); `severity`: `kritik`, `yüksek`, `orta`, `düşük`; `status`: `açık`, `azaltıldı`,
`kabul_edildi`, `kapatıldı` (kapanış tarihi trigger'la dolar); `probability`, `impact`: 1-5; `category`:
`is_kalemi`, `satin_alma`, `diger`; **`source` her zaman `manuel`**, `rule_code`/`subject_ref` boş (otomatik
risklere dokunulmaz). Numara ve `created_by` yok (Faz 3, Karar 14/65).

### 3.9 Change (değişiklik talebi) — `changes`, numara `CHG`
`title` (Z); `origin`: `owner_request` (işveren talebi), `design_change`, `site_condition`, `other`; `status`:
`identified`, `submitted`, `approved`, `rejected`, `implemented`; `priority` RFI ile aynı; `cost_estimate` sayı +
`currency` (`TRY`, `USD`, `EUR`); `time_impact_days` gün; `contract_ref` sözleşme maddesi. **Onay (Karar 10):**
yalnızca kaydı girenden farklı bir admin; onaylayan `approved_by`'a yazılır.

### 3.10 Claim (hak talebi / ihbar) — `claims`, numara `CLM`
`title`, `notice_type` (`time`, `cost`, `both`), `event_date` (Z); `notice_deadline` olay tarihinden önce olamaz
(ihbar süresi proje ayarı yok, tarih elle hesaplanır); `status`: `notice_due`, `notice_sent`, `submitted`,
`negotiating`, `settled`, `rejected`; `amount_claimed` + `currency`; `time_claimed_days`; `change_id` aynı projedeki
bir değişiklik talebi (isteğe bağlı). Onay Change ile aynı (Karar 10).

### 3.11 Interface (arayüz) — `interfaces`, numara `ITF`
`title`, `party_a`, `party_b` (Z; iki taraf farklı olmalı); `interface_type` serbest (`elektrik`, `inşaat`, `izin` …);
`status`: `open`, `agreed`, `closed`; `priority`; `due_date`.

Görme yetkisi (Karar 6, uygulamada Faz 5 ekranları gelince): change ve claim admin, PM, muhasebe; interface admin,
PM, şantiye şefi.

### 3.12 WBS ve alan
Panelden girilmez; ilk yükleme 6a ile gelen Excel import'uyla (Karar 19, 50).

## 4. SQL Editor şablonları

Kullanım: Supabase › SQL Editor › yeni sorgu › şablonu yapıştırın › yalnızca `--` ile işaretli değerleri değiştirin
› Run. Sonuç satırında yeni numara görünür; giriş defterine yazın.

### 4.0 Proje kodları ve kişiler (salt okunur)

```sql
select prefix as proje_kodu, project_id from public.project_register_settings order by prefix;
select full_name, role_key from public.profiles order by full_name;
```

### 4.1 Doküman + ilk revizyon (SharePoint linki)

```sql
with d as (
  insert into public.documents (project_id, title, document_type, discipline, created_by)
  values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
          'Elektrik Teknik Şartnamesi',                                                      -- başlık
          'spec',                                                                            -- tür (drawing değil)
          'ac',                                                                              -- disiplin
          (select id from public.profiles where full_name = 'Ad Soyad'))                    -- giren kişi
  returning project_id, id, document_no, created_by),
r as (
  insert into public.document_revisions (project_id, document_id, revision_no, revision_status, is_current,
                                         issue_date, storage_provider, storage_file_id, file_name, created_by)
  select project_id, id,
         '00',                                                          -- revizyon no
         'ifa',                                                         -- ifr / ifa / ifc / as_built
         true, date '2026-10-14',                                       -- yayın tarihi
         'external',
         'https://ornek.sharepoint.com/sites/proje/Sartname.pdf',       -- SharePoint linki
         'Sartname.pdf',                                                -- dosya adı
         created_by
  from d
  returning revision_no)
select d.document_no, r.revision_no from d, r;
```

### 4.2 Dokümana yeni revizyon (güncel revizyonu değiştirir)

İki ifade sırayla çalışır; önce eski güncel revizyon kapanır, sonra yenisi eklenir.

```sql
update public.document_revisions set is_current = false
 where document_id = (select id from public.documents where document_no = 'DOC-TIZ-0001')   -- doküman no
   and is_current;
insert into public.document_revisions (project_id, document_id, revision_no, revision_status, is_current,
                                       issue_date, storage_provider, storage_file_id, file_name, created_by)
select d.project_id, d.id,
       '01',                                                            -- yeni revizyon no
       'ifc',                                                           -- durum
       true, date '2026-10-20',                                         -- yayın tarihi
       'external',
       'https://ornek.sharepoint.com/sites/proje/Sartname-Rev01.pdf',   -- link
       'Sartname-Rev01.pdf',                                            -- dosya adı
       (select id from public.profiles where full_name = 'Ad Soyad')   -- giren kişi
from public.documents d
where d.document_no = 'DOC-TIZ-0001'                                    -- doküman no (yukarıdakiyle aynı)
returning revision_no;
```

### 4.3 Çizim + ilk revizyon

```sql
with d as (
  insert into public.documents (project_id, title, document_type, discipline, created_by)
  values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
          'Genel Yerleşim Planı',                                                            -- başlık
          'drawing',
          'civil',                                                                           -- disiplin
          (select id from public.profiles where full_name = 'Ad Soyad'))                    -- giren kişi
  returning project_id, id, document_no, created_by),
w as (
  insert into public.drawings (project_id, document_id, drawing_type, created_by)
  select project_id, id, 'layout', created_by from d                   -- çizim türü
  returning document_id),
r as (
  insert into public.document_revisions (project_id, document_id, revision_no, revision_status, is_current,
                                         issue_date, storage_provider, storage_file_id, file_name, created_by)
  select project_id, id, 'A', 'ifc', true, date '2026-10-14',          -- revizyon, durum, tarih
         'external',
         'https://ornek.sharepoint.com/sites/proje/Yerlesim.pdf',       -- link
         'Yerlesim.pdf', created_by                                     -- dosya adı
  from d
  returning revision_no)
select d.document_no, r.revision_no from d, w, r;
```

### 4.4 RFI aç / yanıtla

```sql
insert into public.rfis (project_id, subject, question, priority, responsible_discipline,
                         raised_by, raised_date, due_date)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'Kablo kanalı geçişi',                                                             -- konu
        'Trafo binası girişinde kablo kanalı kotu ne olmalı?',                             -- soru
        'medium',                                                                          -- öncelik
        'civil',                                                                           -- disiplin
        (select id from public.profiles where full_name = 'Ad Soyad'),                    -- soran kişi
        date '2026-10-14', date '2026-10-21')                                              -- açılış, termin
returning rfi_no;
```

```sql
update public.rfis
   set status = 'answered',                                             -- answered / closed / rejected / under_review
       response = 'Kot +0.30 alınacak.',                                -- yanıt
       answered_date = date '2026-10-16'
 where rfi_no = 'RFI-TIZ-0001'                                          -- RFI no
returning rfi_no, status;
```

### 4.5 Aksiyon aç / tamamla

```sql
insert into public.project_actions (project_id, title, description, priority, source_type, responsible,
                                    due_date, created_by)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'Kablo kanalı detayını revize et',                                                 -- başlık
        'RFI yanıtına göre',                                                               -- açıklama
        'high', 'rfi',                                                                     -- öncelik, kaynak
        'Proje ofisi',                                                                     -- sorumlu (metin)
        date '2026-10-25',                                                                 -- termin
        (select id from public.profiles where full_name = 'Ad Soyad'))                    -- giren kişi
returning action_no;
```

```sql
update public.project_actions
   set status = 'done', completed_at = now()                            -- done / in_progress / cancelled
 where action_no = 'ACT-TIZ-0001'                                       -- aksiyon no
returning action_no, status;
```

### 4.6 Karar aç / onayla

```sql
insert into public.decisions (project_id, title, decision_text, decision_date, created_by)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'Kablo kanalı kotu',                                                               -- başlık
        'Trafo binası girişinde kanal kotu +0.30 olarak uygulanacak.',                     -- karar metni
        date '2026-10-16',                                                                 -- tarih
        (select id from public.profiles where full_name = 'Ad Soyad'))                    -- giren kişi
returning decision_no;
```

Onay yalnızca kaydı girenden farklı bir admin onay verdiyse (Karar 10):

```sql
update public.decisions
   set status = 'approved',                                             -- approved / superseded / cancelled
       decision_maker = 'Onaylayan admin adı'                           -- onaylayan
 where decision_no = 'DEC-TIZ-0001'                                     -- karar no
returning decision_no, status;
```

### 4.7 Teknik onay (submittal)

```sql
insert into public.technical_submittals (project_id, title, description, discipline, status, submitted_date, due_date)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'İnverter teknik dokümanı',                                                        -- başlık
        'Giren: Ad Soyad',                                                                 -- açıklama + giren kişi
        'ac', 'submitted',                                                                 -- disiplin, durum
        date '2026-10-14', date '2026-10-28')                                              -- gönderim, termin
returning submittal_no;
```

### 4.8 Malzeme onayı

```sql
insert into public.material_approvals (project_id, material_name, manufacturer, model, status, submitted_date)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'DC solar kablo 6 mm²',                                                            -- malzeme
        'Üretici', 'Model',                                                                -- üretici, model
        'submitted', date '2026-10-14')                                                    -- durum, tarih
returning approval_no;
```

### 4.9 Risk (manuel) aç / durum değiştir

```sql
insert into public.project_risks (project_id, title, description, severity, probability, impact, mitigation,
                                  status, category, source)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'Trafo teslimatı gecikebilir',                                                     -- başlık
        'Tedarikçi üretim takvimi belirsiz',                                               -- açıklama
        'yüksek', 4, 4,                                                                    -- şiddet, olasılık, etki
        'Alternatif tedarikçiden teklif al',                                               -- azaltma
        'açık', 'satin_alma', 'manuel')                                                    -- durum, kategori, manuel
returning id, title;
```

Riskin kimliğini bulmak (salt okunur):

```sql
select id, title, status, severity from public.project_risks
 where project_id = (select project_id from public.project_register_settings where prefix = 'TIZ')   -- proje kodu
   and source = 'manuel'
 order by created_at desc;
```

```sql
update public.project_risks
   set status = 'kapatıldı'                                             -- açık / azaltıldı / kabul_edildi / kapatıldı
 where id = '00000000-0000-0000-0000-000000000000'                      -- risk kimliği (yukarıdaki sorgudan)
   and source = 'manuel'                                                -- otomatik risklere dokunmaz
returning title, status, closed_at;
```

### 4.10 Liste ve CSV (Karar 82)

SQL Editor'de çalıştırıp sonuç tablosundan CSV indirin. Ya da Table Editor'da tabloyu açıp dışa aktarın; bu durumda
**hücre düzenlemeyin**. İki düğmenin yeri bu oturumda panelde doğrulanamadı.

```sql
select r.rfi_no, r.subject, r.status, r.priority, r.raised_date, r.due_date, r.answered_date, p.full_name as soran
  from public.rfis r left join public.profiles p on p.id = r.raised_by
 where r.project_id = (select project_id from public.project_register_settings where prefix = 'TIZ')   -- proje kodu
 order by r.rfi_no;
```

Diğer register'lar için tablo ve numara kolonu değişir: `documents`/`document_no`, `project_actions`/`action_no`,
`decisions`/`decision_no`, `technical_submittals`/`submittal_no`, `material_approvals`/`approval_no`,
`changes`/`change_no`, `claims`/`claim_no`, `interfaces`/`interface_no`.

### 4.11 Change aç / gönder / onayla

```sql
insert into public.changes (project_id, title, description, origin, priority, cost_estimate, currency,
                            time_impact_days, contract_ref, due_date, created_by)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'Trafo köşkü yer değişikliği',                                                     -- başlık
        'İşveren yazısıyla köşk 30 m kuzeye alınacak',                                     -- açıklama
        'owner_request', 'high',                                                           -- köken, öncelik
        250000.00, 'TRY',                                                                  -- tahmini maliyet, para birimi
        10, 'Sözleşme md. 12.3',                                                           -- süre etkisi (gün), madde
        date '2026-11-15',                                                                 -- termin
        (select id from public.profiles where full_name = 'Ad Soyad'))                    -- giren kişi
returning change_no;
```

```sql
update public.changes
   set status = 'submitted'                                             -- submitted / rejected / implemented
 where change_no = 'CHG-TIZ-0001'                                       -- değişiklik no
returning change_no, status;
```

Onay yalnızca kaydı girenden farklı bir admin onay verdiyse (Karar 10):

```sql
update public.changes
   set status = 'approved',
       approved_by = (select id from public.profiles where full_name = 'Onaylayan Admin'),   -- onaylayan admin
       approved_at = now()
 where change_no = 'CHG-TIZ-0001'                                       -- değişiklik no
returning change_no, status;
```

### 4.12 Claim (ihbar) aç / ihbar gönderildi

```sql
insert into public.claims (project_id, title, description, notice_type, event_date, notice_deadline,
                           amount_claimed, currency, time_claimed_days, contract_ref, change_id, created_by)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'Geç saha teslimi',                                                                -- başlık
        'Saha 15 gün geç teslim edildi',                                                   -- açıklama
        'both',                                                                            -- time / cost / both
        date '2026-10-01', date '2026-10-29',                                              -- olay tarihi, ihbar son tarihi
        500000.00, 'TRY', 20,                                                              -- tutar, para birimi, süre (gün)
        'Sözleşme md. 20.1',                                                               -- madde
        (select id from public.changes where change_no = 'CHG-TIZ-0001'),                  -- bağlı değişiklik (yoksa null yazın)
        (select id from public.profiles where full_name = 'Ad Soyad'))                    -- giren kişi
returning claim_no;
```

```sql
update public.claims
   set status = 'notice_sent', notice_sent_at = now()                   -- notice_sent / submitted / negotiating / settled / rejected
 where claim_no = 'CLM-TIZ-0001'                                        -- claim no
returning claim_no, status;
```

### 4.13 Interface aç / mutabakat

```sql
insert into public.interfaces (project_id, title, description, interface_type, party_a, party_b,
                               priority, due_date, created_by)
values ((select project_id from public.project_register_settings where prefix = 'TIZ'),   -- proje kodu
        'OG bağlantı noktası',                                                             -- başlık
        'Bağlantı hücresi ve sayaç yeri',                                                  -- açıklama
        'elektrik',                                                                        -- tür
        'Fons Solar', 'Dağıtım şirketi',                                                   -- taraf A, taraf B
        'high', date '2026-11-30',                                                         -- öncelik, termin
        (select id from public.profiles where full_name = 'Ad Soyad'))                    -- giren kişi
returning interface_no;
```

```sql
update public.interfaces
   set status = 'agreed'                                                -- agreed / closed
 where interface_no = 'ITF-TIZ-0001'                                    -- interface no
returning interface_no, status;
```

## 5. Riskler ve 6a / Faz 2 sonrası durum

### 5.1 Panelden girişin riskleri

| Risk | Açıklama | Azaltma |
|---|---|---|
| Doğrulama atlanır | Karar 6 yetki matrisi, şantiye şefinin "yalnızca kendi kaydı", durum geçiş kuralları, dört göz (Karar 10) uygulanmaz; CHECK dışında her durumdan her duruma geçilir | Yalnızca admin'ler, yalnızca şablonlar; `approved` yalnızca onaylayan admin bilgisiyle |
| Kim yaptı belirsiz | `register_status_history.changed_by` hep boş; ad yanlış yazılırsa `created_by` boş | Giriş defteri (tarih, kişi, numara) |
| Audit yok | B2 (6a) öncesi `register_audit` yok; yalnızca rfis/decisions/project_actions'ta durum geçmişi var | 6a'dan sonra izlenir (kişi boş görünür) |
| Numara çakışması | Elle numara sayacı ilerletmez (Karar 79 ile kapandı); numara sonradan değiştirilirse dış referans kopar | Şablonlarda numara yok; numara değiştirme şablonu yok |
| Geniş yetki | Panel tüm veritabanına yazar, yedek yok | Uyarı kutusu; giriş günlerinde veri yedeği |
| Görünmezlik | Kayıtlar uygulamada görünmez (Faz 3) | CSV (§4.10) |
| Sihirbaz | Riskler adımı otomatik riskleri bozar (§3.8) | Risk yalnızca §4.9 ile |

### 5.2 6a uygulandığında

- **B1:** yalnızca yetki tabloları; mevcut kayıtlar etkilenmez.
- **B2:** audit 6a'dan itibaren; önceki kayıtların izi geriye doldurulmaz.
- **B4, AID:** register kayıtlarına dokunmaz (görev bağı yok).
- **F1 A1-A3 ve Adım 4:** alan kodu ve WBS disiplini kuralları; panelden WBS/alan girilmediği için etkisiz.
  Oturum 0'da ön kontrol sorgusu (`register-oncelikli-plan.md`).
- **A7:** yalnızca WBS/alan RLS'i.
- **Prova sırasında** panelden giriş yapılmaz (açık panel bağlantısı provanın bağlantı kontrolüne takılabilir).

### 5.3 Faz 2 uygulandığında (Karar 81, taslaklara işlendi; yeniden test bekliyor)

- **B3 A0** artık durmuyor, satır sayısını bildiriyor. **A1b** mevcut kayıtları dolduruyor:
  - `source = 'import'` (panel kayıtları ayırt edilir);
  - `record_state`: doküman, RFI, aksiyon `approved`; karar `proposed` ise `draft`, değilse `approved`; teknik onay ve
    malzeme onayı `draft` ise `draft`, değilse `approved`;
  - `approved_at = created_at`, `approved_by` boş (bilinmiyor); dört göz geriye dönük uygulanmaz;
  - `rfis.created_by = raised_by`; teknik onay ve malzeme onayında `created_by` boş;
  - B2 audit'e gerekçeyle yazılır.
- **B3 sonrası:** uygulamadan yazma yalnızca RPC; `created_by` boş kayıtları şantiye şefi düzenleyemez, admin/PM düzenler.
- **B5 A1** kısıttan önce Supabase Storage dışı revizyonları `upload_status = 'ready'` yapıyor; panelden girilen
  SharePoint linkleri yükleme temizliğinden etkilenmez.
- **Sayaç:** numara elle girilmediği sürece eşitleme gerekmez; kontrol sorgusu 6a planında.
- **Faz 3:** risk numarası (Karar 14) mevcut ve panel riskleri için aynı göçle verilir. Faz 3 ekranları gelince bu
  rehber geçersiz olur (Karar 78).
