# 16 register — eksik analizi (gap)

Tarih: 09.10.2026 (2. sürüm, Karar 11-16 sonrası). Bu dosya yeni bir keşif değil; mevcut dosyaların üzerine
eksikleri tamamlar.

**Kaynaklar:**
- `canli-sema-ozeti.md`, `sema-dogrulama.md`, `v3-uyum-notlari.md`, `frontend-tasarim-notu.md`;
- `tasarim.md` v3;
- `faz-b-migration-plani.md` ve B1-B6 taslakları;
- 09.10.2026 tarihli salt okunur sorgular.

**Kurallar:** `CONVENTIONS.md`.
**Kararlar:** CLAUDE.md karar tablosu, Karar 0-16.

**Durum etiketleri:**
- **CANLI:** canlıda var.
- **TASLAK:** B taslağında hazır ama test edilmemiş. Yalnızca 07.10'da `BEGIN…ROLLBACK` denemesinden geçti; uygulanmadı, Playwright ile test edilmedi.
- **TASLAK\*:** taslak denemeden sonra değişti, yeniden test bekliyor (B5).
- **YOK:** hiçbir yerde yok.

## a. Register başına durum

| # | Register | Karar | Tablo | Gerekçe ve eksikler | Faz |
|---|---|---|---|---|---|
| 1 | Document | Mevcut, genişletilecek | `documents` + `document_revisions` | Kimlik, revizyon ve dosya kolonları canlı. Ortak kolonlar B3'te, yükleme akışı B5'te. Klasörlü gezgin yok | 2-3 |
| 2 | Drawing | Mevcut | `drawings` | Numara, revizyon ve onay durumu dokümandan gelir | 3 |
| 3 | RFI | Mevcut, genişletilecek (pilot) | `rfis` | Ortak kolonlar B3'te. `raised_by_party`, `schedule_impact_days`, `cost_impact`, `contract_ref` yok | 3 |
| 4 | Technical Submittal | Mevcut, genişletilecek | `technical_submittals` | `created_by` ve ortak kolonlar B3'te. Spec referansı ve tür yok | 3 |
| 5 | Material Approval | Mevcut, genişletilecek | `material_approvals` | B3 aynı şekilde. BOM bağı ters yönde mevcut (boş) | 3 |
| 6 | Procurement | Mevcut, köprü (Karar 15) | `purchase_requests` (+ `items`, `offers`, `procurement_items`, `procurement_monthly_plan`) | Okuma görünümü + nullable "sahada gerekli tarih". Doküman bağı ortak links yapısıyla. `SAT-YYYY-NNN` değişmez | 4 |
| 7 | Subcontractor | Genişletilecek + yeni (Karar 12) | `suppliers.party_type` + yeni `subcontracts` | `party_type` (tedarikci, taseron, ikisi); `subcontracts` kapsam, bedel, süre ve teminat tutar | 6 (`party_type` fazı için bkz. Ç9) |
| 8 | Action | Mevcut, genişletilecek | `project_actions` | Ortak kolonlar B3'te | 3 |
| 9 | Decision | Mevcut, genişletilecek | `decisions` | Ortak kolonlar B3'te. `supersedes_id` yok | 3 |
| 10 | Risk | Mevcut, genişletilecek (Karar 14) | `project_risks` | RSK numarası (otomatikler dahil, boşluk kabul), `source` (manuel, otomatik) mevcut. `record_state` ve onay alanları yok. Durum değerleri Türkçe | 3 |
| 11 | Change / Variation | Yeni | `changes` | — | 5 |
| 12 | Claim & Notice | Yeni | `claims` | İhbar süresi ayarı yok | 5 |
| 13 | NCR | Ertelendi (Karar 8, 16) | — | Tip kodu `ncr` Faz 2'de ayrılır | Ertelenen |
| 14 | Inspection | Ertelendi (Karar 8, 16) | — | Tip kodu `inspection` Faz 2'de ayrılır | Ertelenen |
| 15 | Interface | Yeni | `interfaces` | — | 5 |
| 16 | Payment | Köprü + yeni (Karar 11) | Şimdi `invoices`, `invoice_payments`, `financial_transactions`; Faz 6'da `progress_payments` | Tedarikçi ödemesi görünümü Faz 4'te. Taşeron ve işveren hakedişi `progress_payments`'ta (`direction`: alacak, borç). `financial_transactions.hakedis` yalnızca nakit hareketi | 4 + 6 |

"Mevcut 8 register" (Faz 3) bu dosyada 1-5, 8, 9 ve 10 olarak alındı. Doğrulaması için bkz. Ç6.

## b. Procurement, Subcontractor, Payment ↔ satın alma ve finans tabloları

### Procurement (Karar 15, Faz 4)

**Canlıda:**
- `purchase_requests`:
  - `request_no SAT-YYYY-NNN`, kendi durum zinciri;
  - tedarikçi, teklif, pazarlık, sipariş ve teslim alanları;
  - Proje Kontrol kFK'leri `wbs_id`, `area_id`, `task_id`, `material_approval_id`, `technical_submittal_id` (boş).
- `procurement_items`: `lead_time_days`, `spec_ref`, `material_approval_id`.
- Dosyalar URL ve yol kolonlarında: `photo_url`, `delivery_document_url`, `purchase_offers.storage_path`.

**Eklenecekler:**
- Nullable "sahada gerekli tarih" kolonu (ad Faz 4 taslağında; öneri `required_on_site_date`).
- `vw_reg_procurement` okuma görünümü. `request_no` görünümde `register_no` olarak döner.
- Doküman bağı ortak links yapısıyla (bkz. Ç1).

**Yeni tablo gerekmiyor.** Yetki: `procurement` için 4 rolde yalnızca V. Muhasebe kapsamı mevcut `_internal` RPC sınırını aşmaz.

### Subcontractor (Karar 12, Faz 6)

**Canlıda:**
- `suppliers` şirket genelinde, proje bağı yok.
- `supplier_type` başka anlamla dolu: malzeme_ekipman, hizmet, nakliye, diger.
- 7 tedarikçi var.

**Eklenecekler:**
- `suppliers.party_type`: tedarikci, taseron, ikisi; varsayılan tedarikci. Tasarımdaki İngilizce değerlerin yerine Karar 12 geçerli; mevcut `suppliers` sözlüğü de Türkçe.
- Yeni `subcontracts` tablosu: `project_id`, `supplier_id` (party_type taseron ya da ikisi), numara kolonu (önek henüz tanımlı değil), kapsam, bedel + `currency`, başlangıç ve bitiş, teminat (tutar ve tür), `status`, `wbs_id` / `area_id` + ortak kolonlar. Kolon listesi Faz 6 taslağında kesinleşir.

### Payment (Karar 11, Faz 4 ve 6)

**Canlıda:**
- `invoices`: 49 satır. 8 durumlu onay, kur alanları (`*_try`), `company` (PV Solution kayıtlarında `project_id` boş).
- `invoice_payments`: 12 satır. Kısmi ödeme, kur, iptal.
- `financial_transactions`: 21 satır, hiçbiri `hakedis` ya da `avans` değil.
- `financial_transaction_payments`.

**Faz 4:**
- Tedarikçi ödemesi okuma görünümü.
- Yalnızca `project_id` dolu satırları gösterir.
- `security_invoker`; mevcut RLS geçerli.
- Yeni tablo yok.

**Faz 6:**
- `progress_payments` tablosu.
  - `direction` alacak (işveren hakedişi) ya da borç (taşeron hakedişi).
  - Taşeron satırı `subcontracts`'a bağlanır.
  - Dönem, kümülatif tutar ve kesintiler.
  - Nakit hareketi `financial_transactions`'ta (`transaction_type='hakedis'`) kalır; iki tablo bağla ilişkilendirilir.
- Faturalara (`invoices`) WBS ve aktivite kFK'leri. `financial_transactions` için aynı bağ kararlarda yok (bkz. Ç10).

## c. Faz durum tablosu (Karar 13)

### Tasarım fazlarının (A-E) ve B paketlerinin Faz 0-9 karşılığı

| Tasarım / paket | Yeni faz |
|---|---|
| A (yapıldı: şema hizalama, G-01/02/03, uyum migration'ı) | Faz 0 (kapandı) |
| B1 yetki matrisi | Faz 2 |
| B2: audit | Faz 2 |
| B2: FK indeksleri | Faz 2 |
| B2: G-13 (WBS/alan tablolarında gereksiz yetkiler) | Faz 1 kapsamında ama B2'nin içinde (Ç2) |
| B3 ortak kolonlar | Faz 2-3 sınırı |
| B3 yazma RPC'leri, link/unlink | Faz 2 |
| B4 Activity ID düzeltme | Faz 1 (B1 ve B2'ye bağlı, Ç2) |
| B5 doküman deposu | Faz 2 (files) |
| B6 okuma RPC'leri ve görünümler | Faz 2; liste ve detay UI'ı Faz 3 |
| C pilot ekranları: Document, Drawing, RFI, Action | Faz 3 |
| C AI katmanı (`register_drafts`, `document_jobs`, `ai_runs`, `process-document`) | **Karşılığı yok (Ç3)** |
| D: Submittal, MA, Decision, Risk ekranları ve Risk genişletmesi | Faz 3 |
| D: Change, Claim | Faz 5 |
| D: Procurement köprüsü | Faz 4 |
| D: `party_type` | Faz 6 (Ç9) |
| D: AI Analiz paneli | Karşılığı yok (Ç3) |
| E: Interface | Faz 5 |
| E: Payment köprüsü | Faz 4 |
| E: proje sağlığı dashboard'u | Faz 7 |
| E: Excel import | Faz 9 |
| E: agent'lar, `ai_findings` | Karşılığı yok (Ç3; Faz 8 alarmlarıyla örtüşebilir) |
| E+: NCR, Inspection | Ertelenen |

### Faz başına durum

| Faz | Kalem | CANLI | TASLAK (test edilmedi) | YOK |
|---|---|---|---|---|
| **1 · WBS, Area, Activity kodu** | `project_wbs`, `project_areas`, `area_wbs` + guard trigger'ları | ✔ (0 satır) | | |
| | `project_tasks.activity_id`, `wbs_id`, `area_id`, `discipline`, baseline/forecast, `primavera_id` | ✔ (activity_id 0/228, baseline 228/228) | | |
| | `trg_project_tasks_identity_guard` (atanmış Activity ID kilidi) | ✔ | | |
| | Admin Activity ID düzeltme RPC'si | | B4 | |
| | Master tablolarda gereksiz yetkilerin geri alınması (G-13) | | B2 | |
| | WBS/Alan yönetim ekranı; Activity ID atama ya da içe aktarma | | | ✔ |
| **2 · Ortak altyapı** | Numaralama: settings, counters, `next_register_no`, 7 önek | ✔ | | |
| | `four_eyes_enabled` | | B3 | |
| | RSK, CHG, CLM, INT önekleri; `subcontracts` öneki | | | ✔ |
| | Links: kFK kolonları + 15 köprü kolonu | ✔ (boş) | | |
| | `link_register_records` / `unlink_register_records`; detaydaki bağlar | | B3, B6 | |
| | Satın alma ↔ doküman gibi kolonsuz bağ (Karar 15) | | | ✔ (Ç1) |
| | Files: `document_revisions` dosya kolonları, `storage_provider` | ✔ | | |
| | Bucket, politikalar, yükleme RPC'leri, temizlik | | B5 (TASLAK\*, patron onayı) | |
| | History: `register_status_history` (3 tablo) | ✔ | | |
| | `register_audit` + `get_register_audit` | | B2, B6 | |
| | Yetki: geçici `can_write` / `can_manage` + G-01 | ✔ | | |
| | `register_permissions`, `register_can`, geçiş tablosu | | B1 | |
| | `ncr`, `inspection` tip kodları (Karar 16) | | | ✔ (B1 CHECK'i 14 tip; değişiklik gerekir) |
| | Okuma RPC'leri, `vw_reg_*` | | B6 | |
| **3 · 8 register standardı + UI, RFI pilot** | 8 register tablosu | ✔ | | |
| | Ortak kolonlar ve yazma RPC'leri (risk hariç 7 tablo) | | B3 | |
| | Risk: RSK numarası, `record_state` / onay alanları (Karar 14) | | | ✔ |
| | `RegisterList` / `RegisterDetail`, yetkiye göre UI, "Proje Kontrol" girişi | | | ✔ (giriş önerisi onay bekliyor) |
| | RFI pilot ekranı | | | ✔ |
| **4 · Köprüler** | Kaynak tablolar (satın alma, fatura, ödeme) | ✔ | | |
| | "Sahada gerekli tarih", `vw_reg_procurement`, tedarikçi ödeme görünümü | | | ✔ |
| **5 · Change, Claim, Interface** | `changes`, `claims`, `interfaces`, ihbar süresi ayarı | | | ✔ |
| **6 · Ticari** | `suppliers` | ✔ | | |
| | `party_type`, `subcontracts`, `progress_payments`, fatura WBS/aktivite kFK'leri | | | ✔ |
| **7 · Aktivite 360 ve KPI** | Aktivite başına bağlı kayıtlar (kFK'ler var) | ✔ (kolonlar) | | |
| | Görünüm, RPC, ekran, KPI tanımları | | | ✔ |
| **8 · Alarmlar** | `notifications` + pg_cron (tek iş: günlük rapor hatırlatma) | ✔ | | |
| | B5'in temizlik cron'u | | B5 | |
| | Register alarm kuralları, yeni `entity_type`'lar | | | ✔ |
| **9 · Import, test, go-live** | Playwright altyapısı, 118 test; Faz B test taslakları (paket yoksa kendini atlar) | ✔ | ✔ | |
| | Excel import sihirbazı, go-live kontrol listesi | | | ✔ |

## d. Çakışmalar ve mantık sorunları (değiştirilmedi, kararını bekliyor)

- **Ç1 · Links yapısı ve Karar 15.**
  - Karar 15 doküman bağını "kolon değil, ortak links yapısı" ile istiyor.
  - Ama v3 uyumunda ortak links tablosu kurulmaması kararlaştırıldı ("`register_links` kurulmuyor"). Bugünkü links bağları kompozit FK kolonlarıyla tutuluyor; B3'ün link/unlink RPC'leri de yalnızca kolon yazıyor.
  - Satın alma ↔ doküman bağı ancak iki yoldan biriyle kurulur:
    - (a) `purchase_requests.document_id` kolonu. Karar 15'e aykırı.
    - (b) Faz 2'de çok biçimli (FK'siz) bir links tablosu açılır. "Kurulmuyor" kararı değişir; aynı proje garantisi FK yerine RPC ve trigger'la sağlanır.
  - Bir talebe birden fazla doküman bağlanabilmesi (teklif isteme belgesi, sipariş, irsaliye) (b)'yi destekliyor.
- **Ç2 · Faz 1, Faz 2'ye bağımlı.** Faz 1'e ait B4, B1 ve B2'ye bağlı (`register_can` ve `register_audit`). Faz 1'e ait G-13 de B2'nin içinde. Ya B1 + B2 Faz 1'den önce uygulanır, ya B4 ve G-13 ayrı bir pakete bölünür.
- **Ç3 · AI ve agent'ların fazı yok.** Faz 1-9 tanımlarında karşılığı olmayanlar:
  - tasarımın AI katmanı (`register_drafts`, `document_jobs`, `ai_runs`, `ai_settings`, `process-document`; Karar 7);
  - AI Analiz paneli;
  - agent'lar (Karar 9).

  RFI pilotu (Faz 3) tasarımda "PDF'ten AI taslağı" olarak tanımlıydı; Faz 3 RFI pilotu AI'sız mı?
- **Ç4 · Takvim.**
  - Tasarımda hedef: 1 Ocak 2027 mobilizasyonuna kadar Document, Drawing, RFI ve Action uçtan uca çalışıyor; pilot 7 Aralık.
  - Yeni sırada go-live Faz 9'da, Faz 4-8'den sonra.
  - 1 Ocak'a hangi fazın yetişmesi gerektiği tanımlı değil.
- **Ç5 · Faz 2 patron onayına bağlı.** Faz 2'nin "files" kalemi B5'tir ve patron onayı (Karar 5) bekliyor. Faz 3 Document ekranı da buna bağlı. Faz 2'nin B5'siz kapanıp kapanamayacağı tanımlı değil.
- **Ç6 · "Mevcut 8 register".** Bu dosyada Document, Drawing, RFI, Submittal, MA, Action, Decision, Risk olarak alındı. Doğrulaman gerekiyor.
  - Risk'in standarda getirilmesi (RSK, `record_state`) canlı otomatik risk motorunu değiştirir. Diğer 7 tablo boş, `project_risks` dolu (55 otomatik risk).
- **Ç7 · RSK numarası ve proje kodu zorunluluğu.**
  - `next_register_no`, proje kodu tanımsızsa hata verir.
  - Otomatik riskler satın alma, görev ve günlük rapor trigger'larından açıldığı için, kodu olmayan yeni bir projede bu canlı yazmalar hata vermeye başlar.
  - Bugün 4 projenin 4'ünde kod var (09.10 SELECT).
  - Seçenekler: proje oluştururken (sihirbaz ve Excel içe aktarma) kod zorunlu olur, ya da RSK numarası kod yoksa boş kalır.
- **Ç8 · Karar 2 ile Karar 14.** Karar 2 "sıra boşluksuz" diyor, Karar 14 RSK'de boşluğu kabul ediyor. Üretim anında sayaç yine boşluksuz; boşluk silme ya da iptal sonucu oluşur, bu da taslak silmede tüm register'larda zaten mümkün. Çelişki küçük; Karar 2'nin metnine "üretimde boşluksuz, silmeyle boşluk olabilir" notu eklenmesi önerilir.
- **Ç9 · `party_type`'ın fazı.** Karar 12 `subcontracts` için Faz 6 diyor, `party_type` için faz belirtmiyor. Faz 6 varsayıldı. Faz 4 köprüsü taşeronları ayırt etmek isterse daha önce gerekir.
- **Ç10 · Faturasız ödemelerde WBS/aktivite bağı.** Faz 6 bağı faturalara koyuyor. Faturasız ödemeler (`financial_transactions`) kapsam dışı kalırsa aktivite maliyeti eksik çıkar (Faz 7 KPI'ları).
- **Ç11 · İşveren hakedişinin karşı tarafı.**
  - `progress_payments.direction='alacak'` satırının karşı tarafı (işveren) için tablo yok; `suppliers` yalnızca tedarikçi ve taşeron.
  - `projects`'te müşteri alanı olup olmadığı bu turda doğrulanmadı.
- **Ç12 · Tip kodu ayırma (Karar 16).** `ncr` ve `inspection` için B1 taslağındaki CHECK (14 tip) ve seed değişmeli. Bu oturumda taslaklara dokunulmadı; Faz 2 taslak revizyonunda yapılır.

## e. Faz 1 kapsamı

**Faz 1 kapsamı (WBS, Area, Activity kodu):**
- **Canlıda zaten var olanlar:** Faz 1'in veri yapısı tamamen canlıda, ama hiç veri yok.
  - `project_wbs`, `project_areas` ve `area_wbs` tabloları: seviye, döngü ve kullanımdaki kodu koruyan guard trigger'ları ve proje erişimine bağlı RLS ile; 0 satır.
  - `project_tasks` üzerinde `activity_id` (biçim CHECK'li, proje içinde benzersiz, 0/228 dolu), `wbs_id` / `area_id` (kompozit FK, RESTRICT, 0 dolu), `discipline`, `baseline_start/end` (228/228 dolu), `forecast_start/end` ve `primavera_id`.
  - Atanmış Activity ID'yi kilitleyen `trg_project_tasks_identity_guard`.
- **Faz 1'e ait B taslakları:**
  - B4: yalnızca admin'in kullanabildiği, gerekçeli ve audit'li Activity ID düzeltme RPC'si.
  - B2'nin içindeki G-13: WBS/alan tablolarındaki gereksiz TRUNCATE/REFERENCES/TRIGGER ve `area_wbs` UPDATE yetkisinin geri alınması.
  - İkisi de B1 ve B2'ye bağlı (Ç2).
- **Canlıda ve taslakta olmayanlar:** WBS ve Alan yönetim ekranı, Activity ID atama ya da içe aktarma yolu.
- **Başlamadan önce senden alınması gereken kararlar:**
  1. **B1 + B2 sırası (Ç2):** Faz 1'den önce mi uygulanacak, yoksa B4 ve G-13 ayrı bir pakete mi bölünecek?
  2. **Activity ID'nin kaynağı ve biçimi:** Primavera'dan mı gelecek, mevcut `task_code`'dan mı türetilecek, elle mi girilecek? Atandıktan sonra kilitlendiği için bu kritik.
  3. **WBS ve Alan verisinin girişi:** Faz 1'de ekranla mı girilecek, yoksa Faz 9'daki içe aktarmayı beklemeden Excel ile mi? Hangi projeyle başlanacak?
  4. **`discipline` sözlüğü:** Kolonda bugün CHECK yok; ekrandaki mechanical, dc, ac, mv, enh, civil, general listesi zorunlu kılınacak mı?
