# Register öncelikli plan (Karar 66-74)

Tarih: 14.10.2026. Onay: kullanıcı, 14.10.2026. Hiçbir adım uygulanmadı.

## Sıra

1. **Yedek** (Karar 67): `pg_dump` ile şema + veri + auth. Kullanıcı PostgreSQL 17 Command Line Tools'u kurup `.env.local`'i (Session pooler) hazırlar ve iki komutu kendisi çalıştırır. Ayrıntı: `scripts/db-backup/README.md`.
2. **Adım 6a — canlıya DB omurgası** (Karar 68):
   - **Kapsam:** B1, B2, B4, F1 A1-A3 (A4 hariç), AID, Adım 4 SQL ve Adım 5'ten yalnızca A7 (Ç-6 RLS daraltması).
   - **Prova:** psql ile tam zincir provası:
     - aktif bağlantı kontrolü ve parmak izi;
     - tek işlem: B1 → B2 → B4 → F1 → AID → Adım 4 → A7;
     - `f1_dogrulama.sql` R1-R27, ardından ROLLBACK;
     - parmak izi; `lock_timeout` 3s, `statement_timeout` 180s, mesai dışı.
   - **Prova yönetimi:** prova SQL'i ve çalıştırma planı önce gösterilir; kullanıcı "başla" demeden koşulmaz.
   - **F1 A1-A3 öne alındı (Karar 85):** uygulanınca 6a'nın F1 parçası yalnızca A4 olur; `prova-6a.mjs`'deki "F1 A1-A3" kurulum segmenti çıkarılır, `f1_dogrulama.sql` §1-3 zaten canlıdaki duruma bakar.
   - **14.10.2026: prova askıda (Karar 83).** Betik `scripts/proje-kontrol/prova-6a.mjs` hazır (`--build` SQL üretir, `--run` psql ile koşar). `psql` kurulumu ve yedek kullanıcıdan bekleniyor.
   - **Kalıcı uygulama:** paket paket `apply_migration` ile:
     - her paketin SQL'i önce gösterilir, kullanıcı "uygula" deyince uygulanır, her seferinde yedek hatırlatılır;
     - her paketten sonra kendi doğrulaması koşulur;
     - en sonda mevcut ekranlar `PW_TARGET=live` ile kontrol edilir.
   - **Docx:** şema değiştiği için `fons_solar_*` docx'lerinin güncellenmesi gerekir (kural 7).
3. **Faz 2** (B5 hariç): B3, B6, dört göz, S4a (`four_eyes_enabled` admin fonksiyonu), S4b (Karar 64 istisnası), kalıcı G-01 çözümü ve **test bildirim süzgeci** (Karar 75; Faz 3 UI testlerinden önce uygulanır). Test: Adım 2 yöntemi, canlıda ROLLBACK, psql ile (Karar 70).
4. **Faz 3:** RFI pilot → Document, Drawing (external link) → Action, Risk (kritik kapanış onayı, `created_by`, RSK, Karar 14/65) → Decision. UI testleri canlıda yalnızca TIZ, `PW_TARGET=live` (Karar 72).
5. **6b:** Docker ve yerel ortam, Adım 5 testleri, Adım 5 SQL + frontend (sihirbaz Ç-B ve **Riskler adımı düzeltmesi**, `faz1-adim5-tasarim.md` §3.4), Excel v8 import deploy, Diyarbakır (Karar 74), F1 A4.
6. **Faz 4**, ardından **MVP canlıya alma**.
7. **Baseline migration:** Ocak 2027 (Karar 71).

## Dal (Karar 73)

- **`faz-2-3-register`:** `main`'den açıldı. Taslak SQL'ler, `docs/proje-kontrol/`, CLAUDE.md ve `scripts/db-backup/` buraya alındı. Faz 2-3 işleri bu dalda yapılır.
  - Çalışma kopyası ayrı bir klasörde (`git worktree`): `C:\Users\fonss\OneDrive\Masaüstü\GES_Dashboard-faz23`. Ana klasördeki commit'lenmemiş dosyalara dokunmamak için böyle açıldı.
- **`faz-a-proje-kontrol`:** Adım 5 frontend'i burada, 6b'ye kadar bekler.
- **Günlük rapor iptal filtresi:** ilk Faz 3 deploy'unda yeni dala alınır (Karar 69).

## 6a'nın mevcut ekranlara etkisi (13.10.2026 değerlendirmesi)

- Yeni kırılma yok. Koşullu riskler:
  - Activity ID ataması veya register'ın göreve bağlanması (Karar 69: 6b'ye kadar yapılmaz, register formlarında görev bağı alanı gizli);
  - iptal görev + eski günlük rapor formu;
  - Excel'de durumu "iptal" yapılan görev (oturumsuz import reddedilir, import yarım kalır).
- Kullanıcı duyurusu: 6b'ye kadar görev iptal edilmez, Excel'de görev durumu "iptal" yapılmaz.

## Panelden girilen register kayıtları (14.10.2026 eki)

Kullanıcı Faz 3'ten önce register'ları panelden dolduruyor (Karar 78-82; `register-veri-giris-rehberi.md`):

- **Numara sayacı canlıda zaten var** (`project_register_counters` + `next_register_no`, uyum migration'ı). B1 numara
  sayacı getirmiyor. Numara boş bırakılırsa ek iş yok.
- **Elle numara girildiyse:** 6a Oturum 0'da ve B3'ten önce aşağıdaki salt okunur kontrol koşulur. `fark > 0` olan
  satır varsa sayaç, en büyük numaraya ayrı bir veri SQL'i ile eşitlenir (SQL gösterilir, "uygula" + yedek
  hatırlatması). 6a'nın kendi paketleri numara üretmediği için eşitleme 6a'yı bekletmez; B3'ü bekletir.

  ```sql
  with n as (
    select project_id, 'RFI' reg, rfi_no no from rfis
    union all select project_id, 'ACT', action_no from project_actions
    union all select project_id, 'DEC', decision_no from decisions
    union all select project_id, 'TS', submittal_no from technical_submittals
    union all select project_id, 'MA', approval_no from material_approvals
    union all select project_id, case when document_type = 'drawing' then 'DRW' else 'DOC' end, document_no from documents)
  select n.project_id, n.reg,
         max(nullif(substring(n.no from '-(\d+)$'), '')::int) as en_buyuk,
         coalesce(c.last_value, 0) as sayac,
         max(nullif(substring(n.no from '-(\d+)$'), '')::int) - coalesce(c.last_value, 0) as fark,
         count(*) filter (where n.no !~ ('^' || n.reg || '-[A-Z0-9]+-\d{4,}$')) as bicim_disi
  from n left join project_register_counters c on c.project_id = n.project_id and c.register_code = n.reg
  group by n.project_id, n.reg, c.last_value
  order by 1, 2;
  ```

- **Biçim ön kontrolü (6a Oturum 0, salt okunur):** tireli alan kodu F1 A2'yi, listede olmayan WBS disiplini
  Adım 4 A1'i durdurur. İkisi de 0 olmalı:

  ```sql
  select (select count(*) from project_areas where area_code !~ '^[A-Z0-9]+$') as tireli_alan,
         (select count(*) from project_wbs where discipline is not null and discipline not in
            ('mechanical','dc','ac','mv','hv','enh','civil','scada','general')) as gecersiz_disiplin,
         (select count(*) from documents where task_id is not null)
       + (select count(*) from rfis where task_id is not null)
       + (select count(*) from project_actions where task_id is not null)
       + (select count(*) from decisions where task_id is not null)
       + (select count(*) from technical_submittals where task_id is not null)
       + (select count(*) from material_approvals where task_id is not null) as gorev_bagli;  -- Karar 69: 0
  ```

- **Prova sırasında** (Oturum 0-5) panelden giriş yapılmaz.
- **Faz 2 etkisi (Karar 81, taslaklara işlendi 14.10):** B3 A0 artık durmuyor; A1b mevcut kayıtları geri dolduruyor
  (`record_state`, `source = 'import'`, `rfis.created_by`). B5 A1 kısıttan önce Supabase Storage dışı revizyonları
  `upload_status = 'ready'` yapıyor. İkisi de yeniden test bekliyor. Ayrıntı rehber §5.3.

## 6a mevcut ekran kontrolü (Karar 77)

Canlıda yalnızca bildirim üretmeyen spec'ler koşar: `PW_TARGET=live`, ana klasörden (`faz-a-proje-kontrol`). Yeni dalda proje-kontrol testleri yok.

**Bildirim üreten akışlar** (canlı kataloğundan, 14.10.2026):
- trigger'lar: `daily_reports`, `invoices` (durum), `invoice_approvals` (gönderim ve onay), `purchase_requests` (ekleme ve durum), `tickets` (ekleme ve durum), `ticket_comments`;
- fonksiyonlar: `add_task_progress`, `create_procurement_item_add_request`, `create_procurement_item_change_request`, `review_procurement_item_change_request`.

**Hariç tutulan spec'ler** (yukarıdakilerden birini çalıştırıyor):

| Spec | Bildirim kaynağı |
|---|---|
| `procurement-workflow`, `procurement-security`, `procurement-concurrency`, `procurement-two-initiators`, `procurement-role-acceptance`, `procurement-negotiation-flow`, `procurement-monthly-plan-link`, `purchase-single-item`, `notification-realtime` | Satın alma talebi oluşturma ve durum değişikliği |
| `invoice-self-revize`, `faz-e` | Fatura ve fatura onayı |
| `manual-task-progress` | `add_task_progress` (proje yöneticisine/şefe bildirim) |
| `material-list-excel`, `material-boundaries`, `approver-role-routing`, `onaylar-tab-ve-talep-eden-filtresi` | Malzeme değişiklik/ekleme talebi ve onayı |

**Koşacak spec'ler:**
- **İş/finans ekranları:** `accounting-scope` (salt okuma), `bom-matching`, `purchase-risk-classification` (saf fonksiyon), `category-weights` (ağırlık RPC'si), `company-selector` (faturasız kayıt; bildirim trigger'ı yok), `is-plani-hiyerarsi` (görev ekler/siler), `pdf-export`, `project-excel-layout`.
- **Kullanıcı:** `user-management` (geçici kullanıcı açar ve siler; bildirim yok, `user_management_audit`'e yazar).
- **Proje Kontrol:**
  - `proje-kontrol-guvenlik`: saldırı denemeleri reddedilmeli; reddedilmezse kayıt ve bildirim oluşur, bu zaten test hatasıdır.
  - `proje-kontrol-master-veri`: 14.10'da A7 ve tiresiz alan koduna uyarlandı.
  - `proje-kontrol-uyum`, `proje-kontrol-b1-yetki`, `proje-kontrol-b2-audit`, `proje-kontrol-b4-activity` (yeni 5 parametreli imza geriye uyumlu), `proje-kontrol-wbs-alan-excel`.
- **Kendiliğinden atlananlar:** `proje-kontrol-b3/b5/b6` (paket yok), `proje-kontrol-adim5` (canlıda atlar).

**Hariç tutulan ekranların doğrulaması:**
- **Yazma yolları:** 6a'nın değiştirdiği yazma yolları (`save_daily_report`, `add_task_progress`, görev durumu, iptal koruması) psql provasında ROLLBACK içinde test edilir (R6-R16, A8 testleri). Bildirimler de geri alındığı için kimseye gitmez.
- **Ekranlar:** ekranlar canlıda yalnızca açılış ve okuma düzeyinde elle kontrol edilir; **kaydetme yapılmaz**, çünkü kaydetme gerçek kişilere bildirim gönderir.

| # | Ekran (rol) | Kontrol |
|---|---|---|
| 1 | Satın Alma › Talepler, Malzeme Listesi, Riskler, Onaylar, Teklif/Pazarlık/Sipariş (admin, PM) | Listeler ve sayılar 6a öncesiyle aynı; bir talep detayı açılıyor; "Yeni Talep" formu açılıyor, kategori ve malzeme listesi doluyor (kaydetmeden kapat) |
| 2 | Finans › Faturalar, Onay Kuyruğu, Ödeme Takibi (admin, PM, muhasebe) | Liste, sekme sayıları, bir fatura detayı; "Fatura / Harcama Ekle" sihirbazı açılıyor (kaydetmeden kapat) |
| 3 | Tickets (admin, PM, şantiye şefi) | Liste ve detay; "Yeni Ticket" formu açılıyor (kaydetmeden kapat) |
| 4 | Günlük rapor formu (şantiye şefi, TIZ) | Form açılıyor; İlerleme Girişi'nde görev listesi doluyor; taslak otomatik kaydı hata vermiyor (taslak tablosunda bildirim yok) |
| 5 | Günlük rapor listesi ve detayı (PM) | Mevcut raporlar açılıyor; PDF/Excel indirme |
| 6 | İş Planı (PM, şantiye şefi) | Gantt ve Detaylı İş Planı açılıyor; görev sayısı ve yüzdeler 6a öncesiyle aynı; "İlerleme Gir" penceresi açılıyor (kaydetmeden kapat) |
| 7 | Genel Proje ve Genel Bakış (admin) | İlerleme yüzdesi, S-eğrisi ve kategori kartı 6a öncesiyle aynı (iptal görev yok, değişmemeli) |
| 8 | Proje Yönetimi (admin) | Proje listesi; Excel dışa aktarma indiriliyor; düzenleme sihirbazı açılıyor (kaydetmeden kapat). Excel içe aktarma yapılmaz |
| 9 | Bildirimler (admin) | Liste açılıyor; 6a sırasında yeni bildirim oluşmadı (sayı öncesiyle aynı) |

Karşılaştırma için 6a'dan önce aynı ekranların ekran görüntüsü veya sayıları alınır.

## Test bildirimleri (Karar 72 eki; 14.10.2026 salt okunur kontrol)

**Bulgular:**
- Register tablolarında (`rfis`, `documents`, `drawings`, `project_actions`, `decisions`, `project_risks`, submittal/approval) bildirim üreten trigger yok. Yalnızca numara, durum geçmişi, `updated_at` ve risk `closed_at` trigger'ları var.
- B1-B6 taslaklarında da `notify_*` çağrısı yok.
- **Sonuç:** Faz 2-3 taslaklarıyla bir RFI veya onay akışı bugün kimseye bildirim göndermez.
- Ama mevcut bildirim fonksiyonları **proje bazlı değil, rol bazlı**:
  - `notify_role(p_role_key, …)` o roldeki tüm profillere gider;
  - `notify_managers` tüm `is_manager` rollerine (admin, muhasebe) gider;
  - proje kimliği yalnızca bildirim satırına yazılır.

  Bu yüzden TIZ'de satın alma, fatura, ticket veya günlük rapor üreten her test bugün de gerçek kişilere bildirim gönderir.
- **TIZ "üyeliği":** proje erişimi rol bazlı.
  - Admin ve muhasebe (`is_manager`) ile PM (`cross_project`) her projeye erişir.
  - TIZ'e özel bağlı tek hesap: ev projesi TIZ olan 1 şantiye şefi hesabı (test hesabına benziyor).
  - `user_project_access`'te TIZ satırı yok.
- **Hesaplar** (rol bazında toplam / test e-postasına benzeyen; e-posta deseni ile, isim yok):

  | Rol | Toplam | Test e-postasına benzeyen |
  |---|---|---|
  | admin | 3 | 0 |
  | muhasebe | 2 | 0 |
  | proje_yoneticisi | 3 | 1 |
  | santiye_sefi | 2 | 2 |

  - Admin ve muhasebe tarafında test hesabı görünmüyor.
  - Playwright'ın `.env.test`'teki admin ve muhasebe hesaplarının gerçek kişilere mi ait olduğu doğrulanamadı (`.env.test` okunmuyor).

**Plan — ONAYLANDI (14.10.2026, Karar 75), Faz 2 kapsamında; Faz 3 UI testlerinden önce uygulanır. Her adımın SQL'i gösterilip onaylanır:**
1. **Test hesapları:**
   - 4 rol için ayrı test hesapları: admin ve muhasebe için yeni; PM ve şantiye şefi için mevcut test hesapları ya da yenileri.
   - E-postalar ayırt edilebilir olur (ör. `…+e2e@…`).
   - Hesaplar `create-user` edge function ile açılır; şifreleri kullanıcı `.env.test`'e yazar. Şifreler sohbete yazılmaz.
   - Şantiye şefi test hesabının ev projesi TIZ.
2. **Test projesi ve test hesabı işaretleri** (küçük bir DB değişikliği; SQL gösterilip onaylanır):
   - `projects.is_test boolean default false` (TIZ, TKY = true);
   - `profiles.is_test_account boolean default false`.
3. **Bildirim süzgeci:** `notify_role`, `notify_managers` ve `notify_user` güncellenir.
   - **Kural:** `p_project_id` bir test projesiyse bildirim yalnızca test hesaplarına gider; gerçek projelerin bildirimi test hesaplarına gitmez.
   - **Uyumluluk:** imzalar değişmez (kural 2); yalnızca alıcı seçimine bir koşul eklenir.
   - **Doğrulama:** canlıda ROLLBACK ile test edilir; TIZ'de talep oluşturulunca yalnızca test hesaplarına bildirim düştüğü gösterilir.
4. **Erişim:** TIZ erişimini yalnızca test hesaplarıyla sınırlamak rol modeli yüzünden mümkün değil (Karar 63: admin/PM/muhasebe her projeye erişir). Bu yüzden asıl önlem bildirim süzgeci; erişim değiştirilmez.
5. **Faz 3'te register bildirimi eklenirse** aynı süzgeçten geçer; alıcılar rol bazlı değil, proje erişimine göre seçilir.

## Takvim (14.10.2026 tahmini; hafta sonu ve 29 Ekim çalışılmaz, girdiler en geç 2 iş gününde)

Faz 2'ye bildirim süzgeci ve test hesapları eklendi (+1 iş günü).

| Adım | Tarih |
|---|---|
| Yedek araçları | 14-15 Ekim |
| 6a | 16-19 Ekim |
| Faz 2 (süzgeç dahil) | 20-30 Ekim |
| İlk register ekranda (RFI pilot, canlıda TIZ) | **6 Kasım** |
| Faz 3 | 17 Kasım |
| 6b | 18-27 Kasım |
| Faz 4 | 30 Kasım - 11 Aralık |
| Canlıya alma hazırlığı | 14, 15, 16 Aralık |
| MVP canlı | **17 Aralık** (sıralı). Docker Faz 3 sırasında paralel kurulursa **15 Aralık** |

## Repo yeri (Karar 76)

- **Durum:** Repo OneDrive içinde ve iki çalışma klasörü var (`GES_Dashboard`, `GES_Dashboard-faz23`; aynı `.git`).
- **Riskler:**
  - OneDrive eşitlemesi `.git` dosyalarında çakışma üretebilir;
  - `.gitignore`'daki gizli dosyalar (`.env.test`, `supabase/.local/`) buluta gider;
  - iki klasör aynı anda eşitlenir.
- **Plan:** MVP öncesi repo OneDrive dışına taşınır (ör. `C:\dev\GES_Dashboard`). Tarihi kullanıcı belirler; taşımadan önce çalışma ağaçları `git worktree list` ile kontrol edilir ve yeni yolda yeniden bağlanır.
