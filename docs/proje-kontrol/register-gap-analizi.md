# 16 register — eksik analizi (gap)

## Durum tablosu (güncel)

> Bu tablo her adım ve faz kapanışında güncellenir (CLAUDE.md kural 9).

**Son güncelleme:** 12.10.2026, Faz 1 Adım 4 kapandı (WBS/alan bütünlüğü ve Excel importu: ROLLBACK oturumları 4a-4e
geçti, uygulanmadı; gerçek Diyarbakır Excel'i projesiz kontrol için bekleniyor). MVP senaryosu (b) seçildi (Karar 45).
Önceki: 12.10.2026, Faz 1 Adım 3 kapandı.
Ek (13.10.2026, kapanış değil): "Kullanıcıdan beklenen girdiler" ve Faz 5 başlangıç kontrol listesi eklendi (Karar 63).
Ek (14.10.2026, kapanış değil): register öncelikli sıra (Karar 66-74); faz tarihleri yeniden yazıldı, MVP canlı tahmini 16 Aralık (paralelde 14 Aralık).
Ek (13.10.2026, kapanış değil): Karar 6 ve 10 onaylandı; Faz 3'e kritik risk kapanış onayı eklendi (+1 iş günü), Faz 3-4 ve MVP canlı tahmini kaydı (11 → 14 Aralık).

**Faz 1 parçaları:**
- **B1** yetki matrisi;
- **B2** audit + FK indeksleri + G-13;
- **B4** Activity ID düzeltme;
- **F1** proje kodu kuralı + `create_project_with_code` + alan kodu;
- **AID** Activity ID üretimi (Adım 3);
- **WA** WBS/alan bütünlüğü ve Excel importu (Adım 4), WBS/alan ekranı (Adım 5).

B1, B2, B4, F1 (Adım 2), AID (Adım 3, iptal görev koruması A8 dahil) ve WA'nın veritabanı kısmı (Adım 4) canlıda
ROLLBACK ile doğrulandı, uygulanmadı (Adım 6). WA ekranı Adım 5'te.

| # | Register | Faz | Güncel durum | Bağımlı olduğu Faz 1 parçası |
|---|---|---|---|---|
| 1 | Document | 3 (ekran external link ile; dosya yükleme B5 onayından sonra, Karar 45) | Canlıda (`documents`, `document_revisions`); yazma/okuma taslakta (B3, B6); dosya deposu taslakta (B5, patron onayı) | B1, B2, F1 (DOC numarası koda bağlı) |
| 2 | Drawing | 3 | Canlıda (`drawings`); yazma/okuma taslakta (B3, B6) | B1, B2, F1 (DRW numarası) |
| 3 | RFI (pilot) | 3 | Canlıda (`rfis`); yazma/okuma taslakta (B3, B6) | B1, B2, F1; aktivite bağı için AID |
| 4 | Technical Submittal | Ocak 2027 (MVP dışı, Karar 45) | Canlıda; yazma/okuma taslakta (B3, B6) | B1, B2, F1 |
| 5 | Material Approval | Ocak 2027 (MVP dışı, Karar 45) | Canlıda; yazma/okuma taslakta (B3, B6) | B1, B2, F1 |
| 6 | Procurement | 4 | Kaynak tablolar canlıda; köprü görünümü, "sahada gerekli tarih", `purchase_documents` yok | B1 (görme yetkisi); WBS/aktivite bağı için WA, AID |
| 7 | Subcontractor | 6 | Yok (`party_type`, `subcontracts`) | B1; WA (sözleşmenin WBS/alan bağı) |
| 8 | Action | 3 | Canlıda (`project_actions`); yazma/okuma taslakta (B3, B6) | B1, B2, F1 |
| 9 | Decision | 3 | Canlıda; yazma/okuma taslakta (B3, B6) | B1, B2, F1 |
| 10 | Risk | 3 | Canlıda (`project_risks`, otomatik motor çalışıyor); RSK numarası ve onay alanları yok | B1, F1 (RSK numarası proje koduna bağlı, Ç7), AID (görev bağı) |
| 11 | Change / Variation | 5 | Yok | B1, B2, F1 |
| 12 | Claim & Notice | 5 | Yok | B1, B2, F1 |
| 13 | NCR | Ertelendi (Karar 8) | Ertelendi; tip kodu B1'de ayrıldı (taslakta) | B1 |
| 14 | Inspection | Ertelendi (Karar 8) | Ertelendi; tip kodu B1'de ayrıldı (taslakta) | B1 |
| 15 | Interface | 5 | Yok | B1, B2, F1, WA |
| 16 | Payment | 4 (tedarikçi görünümü) + 6 (`progress_payments`) | Kaynak tablolar canlıda; görünüm ve `progress_payments` yok | B1; Faz 6'daki fatura WBS/aktivite bağı için WA, AID |

**Fazların tahmini bitişi (15 Aralık 2026 MVP hedefine göre; MVP = Faz 1-4, Karar 24; senaryo (b), Karar 45):**

Tahmin varsayımları:
- Kararlar ve girdiler en geç 2 iş gününde gelir (Excel, proje kodu, patron onayı, kategori ağırlıkları).
- Hafta sonu çalışılmaz.
- Kayma olursa tablo güncellenir.

**12.10 değişikliği (Adım 4 kapanışı):**
- Senaryo (b) seçildi: Technical Submittal ve Material Approval Ocak 2027'ye; Document ekranı external link ile başlar,
  Storage yüklemesi B5 onayından sonra. Ç6 kapandı: Faz 3 kapsamı Document, Drawing, RFI, Action, Risk, Decision.
- Adım 4 planlanan 2 iş gününden önce kapandı. Faz 1 tarihi değiştirilmedi (Adım 5 kapsamı Adım 4'te büyüdü:
  Ç-6 kararı ve görev tarafındaki Karar 38 açığı, `faz1-adim4-tasarim.md` §8).

**14.10 değişikliği (Karar 66, register öncelikli sıra):** 6a → Faz 2 → Faz 3 → 6b → Faz 4 → canlıya alma.
29 Ekim (Cumhuriyet Bayramı) çalışılmaz. Plan: `register-oncelikli-plan.md`.

| Faz | İçerik | Tahmini bitiş | MVP'ye (15 Aralık) göre | Ana risk |
|---|---|---|---|---|
| 1 · 6a | DB omurgası canlıya: B1, B2, B4, F1 A1-A3, AID, Adım 4, A7 (önce yedek + psql tam zincir provası) | 19 Ekim 2026 | 57 gün önce | Yedek araçlarının (pg_dump, psql) zamanında hazır olması; sihirbaz düzeltmesi yokken koşullu kırılmalar (Karar 69) |
| 2 | Ortak altyapı: B3, B6, dört göz, S4a, S4b (Karar 64), G-01 kalıcı (B5 hariç) | 28 Ekim 2026 | 48 gün önce | Testler canlıda ROLLBACK (Karar 70); B5 patron onayı paralel |
| 3 | 6 register standardı + UI. Sıra: RFI pilot (**ekranda 5 Kasım**) → Document, Drawing (external link) → Action, Risk (RSK, onay alanları, kritik kapanış onayı, `created_by`; Karar 14, 10, 65) → Decision | 16 Kasım 2026 | 29 gün önce | UI testleri canlıda TIZ'de (Karar 72); bildirim süzgeci ve test hesapları önce; görev bağı alanı gizli (Karar 69) |
| 1 · 6b | Docker + yerel ortam; Adım 5 testleri; Adım 5 SQL + frontend (WBS/alan ekranı, Kod ata, sihirbaz düzeltmesi); Excel v8 import deploy; Diyarbakır (Karar 74); F1 A4. **Faz 1 burada kapanır** | 26 Kasım 2026 | 19 gün önce | Diyarbakır Excel'i, proje kodu ve kategori ağırlıkları; Adım 5 kodu ilk kez test ediliyor |
| 4 | Köprüler (procurement, sahada gerekli tarih, `purchase_documents`, tedarikçi ödeme görünümü) | 10 Aralık 2026 | 5 gün önce | Satın alma ve finans regresyonu |
| 4+ | **MVP canlıya alma:** Diyarbakır gerçek verisinin doğrulanması (1 iş günü); kullanıcı hesapları ve rol/proje atamaları (0,5): canlıdaki test hesaplarının gözden geçirilmesi (test e-postasına benzeyen PM hesabı dahil); genel "Admin" hesabını kullananlara kişisel hesap açılması ve ardından genel hesabın kapatılması (Karar 64; o zamana kadar hesap B3'teki istisnayla register onayı yapamaz); kısa eğitim dokümanı (rol başına 1-2 sayfa; 1,5). Hazırlık 3 iş günü (11, 14, 15 Aralık); ardından canlıya alma ve ilk hafta destek (5 iş günü) | Canlı: **16 Aralık 2026** (Docker Faz 3 sırasında paralel kurulursa 14 Aralık); destek 16-22 Aralık | 1 gün sonra (paralelde 1 gün önce); 1 Ocak 2027 sınırından 16 gün önce | Gerçek veride çıkan düzeltmeler; kullanıcıların hesap/eğitime zamanında katılması |
| 5 | Change, Claim, Interface; Technical Submittal ve Material Approval ekranları (Karar 45) | Ocak 2027 (MVP sonrası) | — | — |
| 6 | `subcontracts`, `progress_payments`, fatura WBS/aktivite bağı | Şubat 2027 | — | Ç8, Ç10, Ç11 Faz 6 başında |
| 7 | Aktivite 360, KPI | Mart 2027 | — | — |
| 8 | Alarmlar | Mart 2027 | — | — |
| 9 | Import, test, go-live | Nisan 2027 | — | — |
| Ayrı faz | AI akışları (Karar 23) | Faz 7 sonrası | — | Karar 7 (İsdemir OYAK izni) |

Karşılaştırma için senaryo (a) (mevcut kapsam, seçilmedi): Faz 2 11 Kasım, Faz 3 2 Aralık, Faz 4 16 Aralık, canlı 22 Aralık 2026.
Senaryo (b) tasarrufları kaba tahmindir; B5 yine Faz 2'de yapılır, ama MVP'yi bekletmez.

Faz 5-9 tarihleri kaba tahmindir; MVP'den sonra kapasiteye göre yeniden yazılır.

**Kullanıcıdan beklenen girdiler (MVP'yi bekletenler; 13.10.2026):**

| Girdi | Gerektiği yer | En geç |
|---|---|---|
| PostgreSQL 17 Command Line Tools + `.env.local` (Session pooler) + `npm run db:backup` ve `db:backup:data` (Karar 67) | 6a | 15 Ekim |
| Docker kurulumu | 6b (yerel ortam, Adım 5 testleri) | 17 Kasım (Faz 3 sırasında kurulursa 2 gün kazanılır) |
| Bildirim süzgeci ve test hesapları planının onayı (Karar 72) | Faz 3 UI testleri | 30 Ekim |
| `ProjeDetay.jsx`, `DailyReportList.jsx`, `projectExcelBridge.js` commit'i ve haber (Karar 53) | Adım 5 Ek A | Adım 5 kapanışı |
| Kategori ağırlık değerleri (tüm kategoriler, fiziksel olmayanlar %0) | Adım 6, Diyarbakır importu | Adım 6 |
| Diyarbakır Excel'i ve proje kodu (DYB / DYB1 / DYB2) | Adım 6 | Adım 6 |
| ~~Karar 6 — yetki matrisi~~ | **Onaylandı 13.10.2026** (`karar-6-10-yetki-ve-dort-goz.md`); B1 seed'i güncellendi | — |
| ~~Karar 10 — dört göz~~ | **Onaylandı 13.10.2026** | — |
| Genel "Admin" hesabını kimlerin kullandığı (Karar 64: şimdi M1, canlıya almada kişisel hesaplar açılıp genel hesap kapatılır) | Kişisel hesapların açılması; B3'teki istisna listesinin ilk satırı | B3 uygulaması (Faz 2 başı) için hesap kimliği; kullanıcı listesi 9 Aralık |
| Canlı test hesaplarının gözden geçirilmesi | MVP canlıya alma › kullanıcı hesapları | 9 Aralık |
| Karar 5 — dosya deposu patron onayı | B5; MVP kritik yolunda değil (Document ekranı external link ile başlar, Karar 45) | Bekletmez; paralel |

Açık kararlar 6-10'un MVP etkisi (13.10.2026; 6 ve 10 aynı gün onaylandı):
- **6** Roller / register yetki matrisi — onaylandı (B1 Faz 1 Adım 6'da uygulanır).
- **7** AI sağlayıcı ve gizlilik (İsdemir OYAK izni) — bekletmez (AI Faz 7 sonrası, Karar 23).
- **8** NCR ve Inspection — bekletmez (pilotta yok; tip kodları B1'de ayrıldı, Karar 16, 25).
- **9** Agent kimliği ve ilk agent'lar — bekletmez (AI/agent Faz 7 sonrası, Karar 23).
- **10** Dört göz kuralı — onaylandı; ön koşulu genel Admin hesabı kararı (yukarıdaki tablo).

**Faz başlangıç kontrol listeleri:**
- **Faz 5 (Change, Claim, Interface) başlamadan önce:**
  - Karar 63'ü yeniden aç: PM'in tüm projelere erişimi (`roles.proje_yoneticisi.cross_project = true`) Claim/Change yetkisi için hâlâ uygun mu? Projeye özel PM ya da dış kullanıcı (müşavir, işveren, taşeron) girecekse proje kapsamlı erişim modeli tasarlanır.
  - R32'nin (c) bölümü (kısıtlı PM ile erişim kontrolü) yeni Claim/Change RPC'lerine de uygulanır.
  - Karar 10: Change ve Claim'de admin onayı ilkesinin ayrıntısı (onay adımları, tutar eşiği vb.) netleşir.
  - Karar 6: PM'in Change ve Claim onay yetkisi (bugün H) yeniden değerlendirilir.

---

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

## d. Çakışmalar ve mantık sorunları

**Durum (09.10.2026, Karar 17-26 sonrası):**

| Ç | Durum |
|---|---|
| Ç1 | **Çözüldü (Karar 22):** `register_links` açılmıyor; Faz 4'te `purchase_documents` ara tablosu. Karar 15 düzeltildi |
| Ç2 | **Çözüldü (Karar 17):** B1, B2, B4 Faz 1'e taşındı |
| Ç3 | **Çözüldü (Karar 23):** RFI pilotu AI'sız; AI Faz 7 sonrası ayrı faz |
| Ç4 | **Çözüldü (Karar 24):** MVP = Faz 1-4, hedef 15.12.2026 |
| Ç5 | **Çözüldü (Karar 17):** B5 Faz 2'de tek başına, patron onayı paralel |
| Ç6 | **Kapandı (12.10.2026, Karar 45):** Faz 3 kapsamı Document, Drawing, RFI, Action, Risk, Decision; Technical Submittal ve Material Approval Ocak 2027 |
| Ç7 | **Çözüldü (Karar 21)**, ancak uygulaması Ç14 ve Ç15'e bağlı |
| Ç8, Ç10, Ç11 | Ertelendi: Faz 6 başında (Karar 26) |
| Ç9 | Açık (Faz 6 varsayımı sürüyor) |
| Ç12 | **Çözüldü (Karar 25):** B1 taslağına işlendi (seed 64 satır) |
| Ç13 | **Çözüldü (Karar 27):** mekanizma pilotu TIZ; Diyarbakır Adım 6'da Excel ile oluşturulur |
| Ç14 | **Çözüldü (Karar 28):** `^[A-Z][A-Z0-9]{1,4}$`; taslak F1 A1 |
| Ç15 | **Çözüldü (Karar 29):** `create_project_with_code` + ertelenmiş kural; taslak F1 A3-A4, edge diff'i `f1-import-project-excel-diff.md` |
| Ç16 | **Çözüldü (Karar 30):** Adım 3'te |
| Ç17 | **Çözüldü (Karar 31):** Adım 2 canlıda ROLLBACK ile |
| Ç18 | **Çözüldü (Karar 32):** `^[A-Z0-9]+$`; taslak F1 A2 |

**Yeni çakışmalar (Karar 18-21 ile canlı arasında):**

- **Ç13 · Diyarbakır İsdemir projesi canlıda yok.**
  - Canlıda 4 proje var: ADN1, ADN2 (Kaptan Demir Adana) ve iki test projesi (TIZ, TKY).
  - 228 görevin dağılımı: 120 / 59 / 35 / 14.
  - Pilotun yapılabilmesi için önce Diyarbakır projesinin oluşturulması (kod ve iş planıyla) gerekiyor. Bunun Faz 1'in içinde mi, dışında mı yapılacağı belirsiz.
- **Ç14 · Proje kodu biçimi.**
  - Karar 21 "2-5 büyük harf" diyor.
  - Canlıdaki CHECK `^[A-Z0-9]{2,6}$` (rakam serbest, 6 karaktere kadar).
  - Karar 2 ile onaylanan ADN1 ve ADN2 rakam içeriyor. Harf zorunluluğu bu iki kodu geçersiz kılar.
  - Seçenekler:
    - (a) `^[A-Z][A-Z0-9]{1,4}$`: harfle başlar, 2-5 karakter, rakam serbest. ADN1/ADN2 geçerli kalır.
    - (b) Yalnızca harf. ADN1 ve ADN2 yeniden adlandırılır; register kaydı olmadığı için numara kaybı yok.
- **Ç15 · "NOT NULL" nerede.**
  - Kod `projects` üzerinde değil, ayrı `project_register_settings` tablosunda (prefix zaten NOT NULL + UNIQUE).
  - "Her projenin kodu olsun" kuralı iki yoldan biriyle kurulur:
    - (a) `projects`'e `code` kolonu. İki kaynak olur; `project_register_settings.prefix` ile senkron gerekir.
    - (b) Proje oluşturma tek bir RPC'ye taşınır ve `projects` + `project_register_settings` aynı işlemde yazılır. Buna ek olarak ayar satırı olmayan projeyi reddeden ertelenmiş bir constraint trigger konur.
  - Proje bugün iki yoldan oluşuyor:
    - sihirbaz: istemciden doğrudan `projects` insert;
    - `import-project-excel` edge function.
  - (b) seçilirse edge function'ın da değişip yeniden deploy edilmesi gerekir; bu, ayrıca onay ister.
- **Ç16 · "Elle yazılmaz" kuralı DB'de yok.** Bugün `project_tasks` UPDATE yetkisi olan herkes `activity_id`'yi NULL'dan ilk kez doldurabiliyor (guard yalnızca sonraki değişikliği engelliyor). Karar 18 için guard, değeri yalnızca kod atama fonksiyonu ve B4 üzerinden kabul edecek şekilde değişmeli. Bu, Adım 3'te yazılacak.
- **Ç17 · Lokal test ortamı yok.**
  - Bu bilgisayarda Docker ve Supabase CLI yok.
  - Canlı şema kopyası için dökümü (`npm run db:backup`) `scripts/db-backup/.env.local` gerektiriyor; bu dosya yok ve Claude okumaz.
  - Repodaki migration'lar canlıyı birebir üretmiyor: 13 dosya kalıcı olarak eksik, 05.10 migration'ları yalnızca `docs/` altında.
  - Adım 2 için gerekenler:
    1. Docker Desktop kurulumu;
    2. `.env.local` hazırlanıp şema dökümünün alınması;
    3. Bu döküm lokale yüklenir.
- **Ç18 (küçük) · Alan kodunda tire.** `area_code` CHECK'i tireye izin veriyor (`^[A-Z0-9][A-Z0-9-]*$`). Activity ID `{PROJE}-{DİSİPLİN}-{ALAN}-{NNNN}` biçiminde tire ayırıcı olduğundan, tireli bir alan kodu ID'yi ayrıştırmayı belirsizleştirir. Öneri: ID'de kullanılacak alan kodunu tiresiz zorunlu kılmak.

**Önceki maddeler (tarihçe):**

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
- **Ç6 · "Mevcut 8 register".** Bu dosyada Document, Drawing, RFI, Submittal, MA, Action, Decision, Risk olarak alındı. Doğrulaman gerekiyor. **Kapandı (12.10.2026, Karar 45):** Faz 3 = Document, Drawing, RFI, Action, Risk, Decision; Submittal ve MA Ocak 2027.
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
