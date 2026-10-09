# 16 register — eksik analizi (gap)

Tarih: 09.10.2026. Bu dosya yeni bir keşif değil; mevcut dosyaların üzerine eksikleri tamamlar.

**Kaynaklar:**
- `canli-sema-ozeti.md`, `sema-dogrulama.md`, `v3-uyum-notlari.md`, `frontend-tasarim-notu.md`;
- `tasarim.md` v3 (§ "16 register", §4.2-4.8);
- `faz-b-migration-plani.md` ve B1-B6 taslakları;
- 09.10.2026'da satın alma ve finans tablolarına yapılan salt okunur sorgular (kolon listesi, CHECK'ler, satır sayıları).

**Kurallar:** `CONVENTIONS.md` (önek yok, tabloya özel numara, 4 rol, canlı öncelikli).

**Durum kısaltmaları:**
- **CANLI:** canlıda var.
- **B1-B6:** ilgili taslakta hazır; uygulanmadı, yalnızca `BEGIN…ROLLBACK` ile denendi.
- **YOK:** ne canlıda ne taslakta.

## a. Register başına durum

| # | Register | Karar | Tablo | Gerekçe ve eksikler |
|---|---|---|---|---|
| 1 | Document | **Mevcut, genişletilecek** | `documents` + `document_revisions` | Kimlik, revizyon ve dosya kolonları canlıda. Ortak kolonları B3 ekler. Yükleme durumu, bucket ve politikalar B5'te (patron onayı). Klasörlü gezgin YOK (Faz C frontend) |
| 2 | Drawing | **Mevcut** | `drawings` | Dokümana bire bir uzantı; numara, revizyon ve onay durumu dokümandan gelir. Saha ve BOQ etkisi alanları YOK (tasarımda da istenmiyor) |
| 3 | RFI | **Mevcut, genişletilecek** | `rfis` | Ortak kolonlar ve `created_by` B3'te. `raised_by_party`, `schedule_impact_days`, `cost_impact`, `contract_ref` YOK; Faz C'de (C1) eklenecek |
| 4 | Technical Submittal | **Mevcut, genişletilecek** | `technical_submittals` | `created_by` ve ortak kolonlar B3'te. Durum geçmişi trigger'ı yok, iz B2 audit'ten gelir. Spec referansı ve submittal türü YOK |
| 5 | Material Approval | **Mevcut, genişletilecek** | `material_approvals` | B3 aynı şekilde. BOM bağı ters yönde var (`procurement_items` / `purchase_requests.material_approval_id`, boş). "Sahada gerekli tarih" YOK |
| 6 | Procurement | **Mevcut, köprü** (yeni tablo yok) | `purchase_requests` (+ `purchase_request_items`, `purchase_offers`, `procurement_items`, `procurement_monthly_plan`) | Register yalnızca okuma görünümü. Yazma mevcut satın alma akışında kalır. Ayrıntı b. |
| 7 | Subcontractor | **Genişletilecek + belirsiz** | `suppliers` (+ olası yeni proje kapsamlı tablo) | `party_type` D3'te. Taşeron sözleşmesinin tutulacağı yer yok. Ayrıntı b. |
| 8 | Action | **Mevcut, genişletilecek** | `project_actions` | Karar 1. Ortak kolonları B3 ekler |
| 9 | Decision | **Mevcut, genişletilecek** | `decisions` | Ortak kolonlar B3'te. `supersedes_id` YOK (durum `superseded` var, hangi kararın yerini aldığı tutulmuyor) |
| 10 | Risk | **Mevcut, genişletilecek** | `project_risks` | Otomatik risk motoru canlı akış; 6 kFK kolonu var, boş. `record_state`, onay alanları, `source='ai'` ve numara kolonu YOK (D2). Durum ve şiddet değerleri Türkçe (`açık`, `kritik`); RPC normalleştirir. Numara öneki (RSK) ve kolon adı **belirsiz** |
| 11 | Change / Variation | **Yeni** | `changes` (D1) | Tasarım §4.2 B'de alan listesi var. Önek tanımlı değil |
| 12 | Claim & Notice | **Yeni** | `claims` (D1) | `change_id` bağı, olay ve bildirim tarihleri. `project_register_settings`'e ihbar süresi kolonu gerekir (YOK) |
| 13 | NCR | **Belirsiz** | — | Karar 8: pilotta yok. Kalite modülü bilinçli olarak kaldırılmıştı; geri dönüş ayrı karar ister |
| 14 | Inspection | **Belirsiz** | — | Karar 8, NCR ile aynı |
| 15 | Interface | **Yeni** | `interfaces` (E1) | Taraf A/B, termin, durum. Faz E |
| 16 | Payment | **Mevcut, köprü + belirsiz** | `invoices`, `invoice_payments`, `financial_transactions`, `financial_transaction_payments` | Tedarikçiye ödeme (borç) tarafı canlıda tam. İşverenden alınacak hakediş (alacak) tarafı sistemde yok. Register'ın hangisi olduğu belirsiz. Ayrıntı b. |

**Özet:**
- Mevcut (ortak kolon ya da alanla genişletilecek): 8 (1-5, 8, 9, 10).
- Köprü: 2 (6, 16; 16'nın kapsamı belirsiz).
- Genişletme + belirsiz: 1 (7).
- Yeni: 3 (11, 12, 15).
- Belirsiz: 2 (13, 14).

## b. Procurement, Subcontractor, Payment ↔ satın alma ve finans tabloları

### Procurement

**Canlıda olanlar:**
- `purchase_requests`:
  - `request_no` (`SAT-YYYY-NNN`);
  - kendi durum zinciri (teklif_toplama → … → satin_alindi → fatura);
  - `supplier_id`, `selected_offer_id`, sipariş, teslim ve pazarlık alanları;
  - Proje Kontrol bağları `wbs_id`, `area_id`, `task_id`, `material_approval_id`, `technical_submittal_id` (kFK, hepsi boş).
- `purchase_request_items`: tek kalem kuralı, `bom_item_id` → `procurement_items`.
- `procurement_items` (BOM): `lead_time_days`, `spec_ref`, `responsible`, `material_approval_id`.
- `purchase_offers` (teklifler, `storage_path` ile dosya).
- `procurement_monthly_plan`.

**Eksikler:**

| Alan | Durum | Öneri |
|---|---|---|
| Register numarası | `request_no` farklı biçimde (yıl bazlı, Karar 2 biçimi değil) | Yeniden numaralanmaz. Görünüm `request_no`'yu `register_no` olarak döndürür. Karar 2 bu tabloya uygulanmaz |
| Doküman bağı (RFQ, PO, irsaliye) | `documents`'a bağ yok; dosyalar URL kolonlarında (`photo_url`, `delivery_document_url`, `purchase_offers.storage_path`) | Gerekirse `purchase_requests.document_id` (kFK, boş bırakılabilir). Faz D, **belirsiz** |
| Sahada gerekli tarih | Yok (`delivery_date` teslim tarihi) | Gecikme riski için `required_on_site` (MA'da da yok). **Belirsiz** |
| Aktivite bağı | `task_id` var, boş | Doldurma akışı (frontend) YOK |
| record_state / onay | Kendi durum zinciri var | Eklenmez. Köprü yalnızca okur (tasarım: "yazma yok") |

**Yeni tablo gerekmiyor.** Gerekenler:
- `vw_reg_procurement` görünümü (D3 / E3);
- `register_permissions`'ta `procurement` için yalnızca V. Muhasebe kapsamı mevcut `_internal` RPC sınırını aşmamalı.

### Subcontractor

**Canlıda olanlar:**
- `suppliers` şirket genelinde, proje bağı yok. Kolonlar: ad, vergi no ve vergi dairesi, iletişim, `currency`, `status` (aktif/pasif), adres, `notes`.
- `supplier_type` başka anlamda kullanılıyor (malzeme_ekipman, hizmet, nakliye, diger).
- Canlıda 7 tedarikçi var, hiçbiri `hizmet` türünde değil.

**Eksikler:**

| Alan | Durum | Öneri |
|---|---|---|
| Tedarikçi / taşeron ayrımı | Yok | `party_type` (supplier, subcontractor, both), D3 taslağı |
| Projeye atama | Yok (suppliers global) | Proje kapsamlı bir tablo gerekir. Register `project_id` taşımak zorunda, suppliers taşımıyor |
| Taşeron sözleşmesi (sözleşme no, kapsam, bedel + currency, başlangıç/bitiş, teminat mektubu, sigorta, sorumlu WBS/alan, durum) | Yok | **Yeni tablo önerisi** `subcontracts`: `project_id`, `supplier_id`, `subcontract_no` (yeni önek), `scope`, `contract_value`, `currency`, `start_date`, `end_date`, `status`, `wbs_id`, `area_id`, `document_id` + ortak kolonlar. Tasarımda yok: tasarım yalnızca `party_type` öngörüyor. **Belirsiz** |
| Personel / ekipman sayısı | Günlük raporda (`personnel_log_entries`) firma bağı yok | Kapsam dışı; istenirse ayrı iş |

### Payment

**Canlıda olanlar:**
- `invoices`:
  - proje, tedarikçi, `purchase_request_id`;
  - 8 durumlu onay zinciri;
  - `currency`, `exchange_rate`, `total_amount_try`;
  - `paid_amount(_try)`, `remaining_amount(_try)`;
  - `company` (fons_solar / pv_solution; PV Solution kayıtlarında `project_id` boş).
  - 49 satır.
- `invoice_payments`: çoklu kısmi ödeme, `payment_method` CHECK, `reference_no`, `exchange_rate`, `amount_try`, iptal alanları. 12 satır.
- `financial_transactions`: faturasız ödeme, `purchase_request_id`, `transaction_type` (masraf, avans, **hakedis**, vergi_harc, personel, diger). Canlıda 21 satır var; hiçbiri `hakedis` ya da `avans` değil.
- `financial_transaction_payments`: `invoice_payments`'ın eşi.

**Eksikler:**

| Alan | Durum | Öneri |
|---|---|---|
| WBS / alan / aktivite bağı | Faturada ve ödemede yok | Register için gerekirse `invoices.task_id` / `wbs_id` (kFK). Satın alma talebinden türetilebilir (`purchase_requests.task_id`). **Belirsiz** |
| Taşeron hakedişi (dönem, kümülatif miktar, önceki hakediş, avans mahsubu, teminat kesintisi, KDV ve stopaj) | Yok; yalnızca `transaction_type = 'hakedis'` etiketi var | Taşeron hakedişi takip edilecekse yeni tablo (`subcontract_payment_certificates`, `subcontracts`'a bağlı). **Belirsiz** |
| İşverene kesilen hakediş / alacak (gelir tarafı) | Sistemde hiç yok | Payment register bunu kastediyorsa yeni tablo gerekir. **Belirsiz**, en önemli soru |
| Proje kapsamı | `company = 'pv_solution'` kayıtlarında `project_id` boş | Register görünümü yalnızca `project_id` dolu satırları gösterir |
| Yetki | Muhasebe V, santiye_sefi yok (tasarım 4.3) | Köprü görünümü `security_invoker`. Mevcut fatura ve ödeme RLS'i geçerli kalır |

**Sonuç:** Tedarikçi ödemesi için yeni tablo gerekmiyor; `invoices` + `invoice_payments` + `financial_transactions` üzerinde bir görünüm (E3) yeterli. Taşeron hakedişi ya da işveren alacağı kastediliyorsa yeni tablo gerekir.

## c. Faz durum tablosu

**Faz numaraları:**
- Faz 1 ve Faz 2 senin tanımın.
- Faz 3-8'in tanımı `docs/proje-kontrol/` dosyalarında yok. Aşağıdaki gruplama **varsayımdır**: tasarımın C/D/E sırası 6 gruba bölündü. Kendi Faz 3-8 tanımını verirsen tablo ona göre düzeltilir.
- Tasarımdaki A-E fazlarıyla eşleşme her satırın "Tasarım fazı" sütununda.

| Faz | Kalem | Durum | Not | Tasarım fazı |
|---|---|---|---|---|
| **1 · WBS / Area / Activity** | `project_wbs`, `project_areas`, `area_wbs` | CANLI | Satır yok (0) | A |
| | `project_tasks.wbs_id/area_id/activity_id`, baseline/forecast, `primavera_id` | CANLI | activity_id 0/228 dolu, baseline 228/228 | A |
| | identity guard (atanmış Activity ID kilidi) | CANLI | | A |
| | Admin Activity ID düzeltme RPC'si | B4 | | B |
| | Master tablolarda gereksiz yetkiler (G-13) | B2 | | B |
| | WBS/Alan yönetim ekranı, Activity ID toplu atama / Primavera içe aktarma | YOK | | B-E |
| **2 · Numaralama** | `project_register_settings`, `project_register_counters`, `next_register_no`, 7 önek (DOC, DRW, RFI, TS, MA, DEC, ACT) | CANLI | 4 proje kodu | A |
| | `four_eyes_enabled` | B3 | Karar 10 açık | B |
| | CHG, CLM, INT, RSK ve taşeron önekleri | YOK | | D-E |
| **2 · Links** | Register'lar arası kompozit FK kolonları + 15 köprü kolonu | CANLI | Hepsi boş | A |
| | `link_register_records` / `unlink_register_records` | B3 | 11 çift | B |
| | Detayda giden/gelen bağlar | B6 | | B |
| | `register_links` çok biçimli tablo | Kurulmuyor (karar) | | — |
| **2 · Files** | `document_revisions` dosya kolonları, `storage_provider` (supabase_storage, sharepoint, external …) | CANLI | | A |
| | Bucket, Storage politikaları, begin/complete/abort, `void_document`, `get_storage_usage`, temizlik işi | B5 | Patron onayı | B |
| | SharePoint / adres bağlama RPC'si (`link_external_revision`) | YOK | Şema hazır, `CONVENTIONS.md` §5 | M365 geçişinde |
| | Klasörlü dosya gezgini, yükleme ekranı | YOK | | C |
| **2 · History** | `register_status_history` (rfis, decisions, project_actions) | CANLI | TS ve MA'da trigger yok | A |
| | `register_audit` (yalnızca değişen alanlar) + 8 tablo trigger'ı | B2 | | B |
| | `get_register_audit` | B6 | | B |
| **2 · Yetki** | `can_write_project_control`, `can_manage_project_control` (geçici); G-01 yazma kapalı | CANLI | | A |
| | `register_permissions`, `register_status_transitions`, `register_can`, `get_my_register_permissions`, `set_register_permission` | B1 | Karar 6 açık | B |
| | Yazma policy'lerinin düşmesi, SELECT'in `register_can` ile daralması, yazma RPC'leri | B3 | | B |
| | Okuma RPC'leri ve `vw_reg_*` | B6 | | B |
| | `RegisterList` / `RegisterDetail`, yetkiye göre buton gizleme, "Proje Kontrol" girişi | YOK | `frontend-giris-karari.md` | B |
| **3 (varsayım) · Pilot: Document, Drawing, RFI, Action** | Tablolar | CANLI | | — |
| | Yazma/okuma, B5 dosya | B3, B6, B5 | | B |
| | `register_drafts`, `document_jobs`, `ai_runs`, `ai_settings`, `process-document`, taslak RPC'leri, bildirim türleri, ekranlar | YOK | Karar 7 açık | C |
| **4 (varsayım) · Submittal, Material Approval, Decision** | Tablolar | CANLI | | — |
| | Yazma/okuma | B3, B6 | | B |
| | Ekranlar, submittal AI şeması | YOK | | D |
| **5 (varsayım) · Risk, Change, Claim** | `project_risks` | CANLI | Onay alanları YOK (D2) | D |
| | `changes`, `claims`, ihbar süresi ayarı | YOK | | D |
| **6 (varsayım) · Procurement, Subcontractor, Payment köprüleri** | Kaynak tablolar | CANLI | | — |
| | `party_type`, köprü görünümleri | YOK | D3, E3 taslağı yok | D-E |
| | `subcontracts`, hakediş tabloları | YOK | Belirsiz (b.) | — |
| **7 (varsayım) · Interface** | `interfaces` | YOK | E1 | E |
| **8 (varsayım) · NCR, Inspection** | — | YOK | Karar 8 | E+ |
| *Tümü* | Agent'lar, `ai_findings`, proje sağlığı dashboard'u, Excel içe aktarma | YOK | Karar 9 | E |

## Belirsiz noktalar (karar gerekiyor)

1. **Payment register'ı ne demek:** tedarikçiye yapılan ödemeler (köprü yeter) mi, taşeron hakedişleri mi, işverenden alınacak hakediş mi (iki durumda da yeni tablo)?
2. **Subcontractor:** yalnızca `suppliers.party_type` mı (tasarım), yoksa proje kapsamlı `subcontracts` tablosu da mı?
3. **Faz 3-8 tanımı:** yukarıdaki gruplama varsayım. Senin tanımın nedir?
4. **Risk numarası:** `project_risks`'e RSK önekli numara kolonu eklenecek mi? Otomatik riskler de numara alacak mı?
5. **Procurement'a doküman ve "sahada gerekli tarih" bağı:** Faz D'de eklensin mi?
6. **NCR / Inspection (Karar 8):** mobilizasyondan sonra yeniden mi değerlendirilsin?
