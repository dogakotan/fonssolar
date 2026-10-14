# Docx güncelleme metni — 14.10.2026 (Change, Claim, Interface; panelden register girişi)

Bu metni `fons_solar_sistem_dokumantasyonu.docx` ve `fons_solar_veritabani_dokumantasyonu.docx`'e kullanıcı işler.

**Ne zaman işlenir:** Change, Claim, Interface tabloları canlıya uygulandıktan sonra. Uygulama mesai dışında
yapılacak (Karar 84). Uygulama yapılmazsa yalnızca A.4 ve A.5 işlenir.

**Kaynak:** canlı katalog (14.10.2026, salt okunur) ve `taslak-sql/f5_changes_claims_interfaces.sql`.

**Dosyaların yeri:**
- `fons_solar_sistem_dokumantasyonu.docx` Masaüstü'nde. Başlıkları aşağıda birebir verildi.
- `fons_solar_veritabani_dokumantasyonu.docx` bu bilgisayarda bulunamadı. Sistem dokümanı kolon düzeyi için
  `fons_solar_teknik_veritabani_v2.docx`'i gösteriyor; o da bulunamadı. Bölüm B, yapısını bilmeden tablo tablo yazıldı.

---

## A. fons_solar_sistem_dokumantasyonu.docx

### A.1 Kapaktaki tarih satırı

Değiştir:
> … Son güncelleme: 07.10.2026 (Proje Kontrol register şeması)

Yeni:
> … Son güncelleme: 14.10.2026 (Change, Claim, Interface register'ları; panelden register girişi)

### A.2 "2.1 Backend – Supabase Projesi" altındaki özet satırı

Değiştir:
> Supabase üzerinde PostgreSQL 17; ~55 tablo, 107 SQL fonksiyonu/trigger, …

Yeni:
> Supabase üzerinde PostgreSQL 17; 58 tablo, 116 SQL fonksiyonu/trigger, …

Notlar:
- 116 fonksiyon 14.10'da canlıda sayıldı. 107 zaten eskimişti; F5 yeni fonksiyon eklemiyor.
- 58 tablo F5 uygulandıktan sonraki sayı; bugün 55.

"3. Veritabanı" giriş paragrafındaki "~55 tablo + 7 view" → "58 tablo + 7 view".

### A.3 "3.1 Modül – Tablo Haritası" › "Proje kontrol (register)" satırı

Tablolar hücresine sona ekle:
> …, register_status_history, **changes, claims, interfaces**

### A.4 "6.8 Proje Kontrol Register'ları" — başlık ve son cümle

Başlığı değiştir: `6.8 Proje Kontrol Register'ları (07.10.2026)` → `6.8 Proje Kontrol Register'ları (07.10.2026, güncelleme 14.10.2026)`.

Paragrafın son iki cümlesini değiştir:
> Register tablolarına doğrudan yazma geçici olarak kapalıdır (güvenlik bulgusu G-01); yazma Faz B RPC'leriyle açılacaktır. Ayrıntı: CLAUDE.md "Proje Kontrol (Faz A)" ve docs/proje-kontrol/.

Yeni:
> Uygulama kullanıcılarının register tablolarına doğrudan yazması kapalıdır (güvenlik bulgusu G-01); yazma Faz 2
> RPC'leriyle açılacaktır. Register ekranları gelene kadar (Faz 3) kayıtlar geçici olarak yalnızca admin'ler
> tarafından Supabase SQL Editor'den, hazır şablonlarla girilir (Karar 78). Numara alanı boş bırakılır, sistem üretir
> (Karar 79). SharePoint'teki dosyanın linki revizyonun dosya alanına "external" sağlayıcısıyla yazılır; link yalnızca
> SharePoint'te erişimi olanlarda açılır (Karar 80). Listeler panelden CSV ile paylaşılır (Karar 82). Rehber:
> docs/proje-kontrol/register-veri-giris-rehberi.md. Ayrıntı: CLAUDE.md "Proje Kontrol" ve docs/proje-kontrol/.

### A.5 6.5 "Otomatik Risk Motoru" sonuna yeni paragraf (bilinen sorun)

> **Bilinen sorun (14.10.2026):** Proje düzenleme sihirbazının Riskler adımında "Kaydet", projenin bütün risklerini
> silip yeniden yazıyor. Otomatik riskler bu sırada manuel riske dönüşüyor, kural bağlarını kaybediyor ve risk motoru
> aynı konular için yeni kayıt açtığı için kopyalar oluşuyor. Düzeltme 6b sihirbaz paketinde: yalnızca manuel riskler
> güncellenecek, otomatik risklere dokunulmayacak. O zamana kadar sihirbazın Riskler adımı kullanılmaz; manuel risk
> SQL Editor şablonuyla girilir.

### A.6 6.8'in altına yeni alt başlık: "6.8.1 Change, Claim, Interface (14.10.2026)"

> Faz 5 kapsamındaki üç register'ın tabloları erkenden açıldı: **changes** (değişiklik talebi, numara CHG),
> **claims** (hak talebi ve ihbar, CLM) ve **interfaces** (taraflar arası arayüz, ITF). Numara diğer register'larla
> aynı biçimdedir (ör. CHG-TIZ-0001) ve aynı sayaç tablosunu kullanır. Durum değişiklikleri register_status_history'ye
> yazılır.
>
> - **Değişiklik talebi:** köken (işveren talebi, tasarım değişikliği, saha koşulu, diğer), tahmini maliyet ve para
>   birimi, süre etkisi, sözleşme maddesi. Durumlar: tespit edildi → gönderildi → onaylandı / reddedildi → uygulandı.
> - **Hak talebi:** tür (süre, maliyet, ikisi), olay tarihi, ihbar son tarihi (olaydan önce olamaz), talep edilen tutar
>   ve süre, isteğe bağlı bağlı değişiklik talebi. Durumlar: ihbar bekleniyor → ihbar gönderildi → sunuldu →
>   müzakere → uzlaşıldı / reddedildi.
> - **Arayüz:** iki taraf (farklı olmalı), tür, termin. Durumlar: açık → mutabık → kapalı.
>
> **Görme yetkisi** (Karar 6): değişiklik ve hak talebini admin, proje yöneticisi ve muhasebe; arayüzü admin, proje
> yöneticisi ve şantiye şefi görür. Uygulama kullanıcıları bu tablolara yazamaz. Kayıtlar şimdilik SQL Editor
> şablonlarıyla girilir. Değişiklik ve hak talebinin onayı Karar 10'a tabidir: kaydı girenden farklı bir admin
> onaylar. Onay akışı, dört göz denetimi ve ekranlar Faz 5'te gelecek.

### A.7 "3.3 Migration Geçmişi" sonuna satır

> 14.10.2026 — Change, Claim, Interface register tabloları (changes, claims, interfaces): yalnızca yeni tablolar,
> mevcut tablolar değişmedi; yedeksiz uygulandı (Karar 84), geri alma SQL'i test edildi.

(Migration'ın gerçek sürüm numarası uygulamadan sonra eklenir.)

---

## B. fons_solar_veritabani_dokumantasyonu.docx (kolon düzeyi)

Ortak kurallar (üç tablo):
- **Kimlik ve proje:** `id uuid` PK; `project_id text NOT NULL` FK `projects(id) ON DELETE CASCADE`; `UNIQUE (project_id, id)`.
- **WBS/alan/görev bağları:** `wbs_id`, `area_id`, `task_id` kompozit FK `(project_id, x)` → `project_wbs` /
  `project_areas` / `project_tasks`. Karar 69 gereği görev bağı 6b'ye kadar boş.
- **Onay ve kaynak kolonları:**
  - `record_state` (draft, pending_approval, approved, rejected; varsayılan draft);
  - `source` (manual, ai, import; varsayılan manual);
  - `created_by` (varsayılan `auth.uid()`), `approved_by` FK `profiles ON DELETE SET NULL`, `approved_at`,
    `rejected_reason`.
- **Zaman damgaları:** `created_at`, `updated_at` NOT NULL varsayılan `now()`.
- **Trigger'lar (tablo başına 3):**
  - BEFORE INSERT `fn_assign_register_no(<numara kolonu>, <önek>)`: boş numarayı doldurur;
  - AFTER INSERT OR UPDATE OF status `fn_log_register_status(<tip>)`;
  - BEFORE UPDATE `update_updated_at_column()`.
- **RLS:** açık; tek kural SELECT, `has_project_access(project_id)` ve rol listesi. INSERT/UPDATE/DELETE kuralı yok.
  `authenticated` yalnızca SELECT, `anon` yetkisiz.
- **İndeksler:** her nullable FK kolonunda kısmi indeks (`WHERE x IS NOT NULL`).

### B.1 changes

| Kolon | Tip | Kısıt / varsayılan |
|---|---|---|
| change_no | text NOT NULL | `UNIQUE (project_id, change_no)`; trigger CHG |
| title | text NOT NULL | |
| description | text | |
| origin | text NOT NULL | varsayılan `other`; owner_request, design_change, site_condition, other |
| status | text NOT NULL | varsayılan `identified`; identified, submitted, approved, rejected, implemented |
| priority | text NOT NULL | varsayılan `medium`; low, medium, high, critical |
| cost_estimate | numeric(14,2) | |
| currency | text NOT NULL | varsayılan `TRY`; TRY, USD, EUR |
| time_impact_days | integer | |
| contract_ref | text | |
| assigned_to | uuid | FK profiles ON DELETE SET NULL |
| due_date | date | |
| + ortak kolonlar | | |

RLS görme: admin, proje_yoneticisi, muhasebe. Durum geçmişi tipi `change`.

### B.2 claims

| Kolon | Tip | Kısıt / varsayılan |
|---|---|---|
| claim_no | text NOT NULL | `UNIQUE (project_id, claim_no)`; trigger CLM |
| change_id | uuid | kompozit FK `(project_id, change_id)` → `changes(project_id, id)` |
| title | text NOT NULL | |
| description | text | |
| notice_type | text NOT NULL | time, cost, both |
| event_date | date NOT NULL | |
| notice_deadline | date | `notice_deadline >= event_date` |
| notice_sent_at | timestamptz | |
| amount_claimed | numeric(14,2) | |
| currency | text NOT NULL | varsayılan `TRY`; TRY, USD, EUR |
| time_claimed_days | integer | ≥ 0 |
| contract_ref | text | |
| status | text NOT NULL | varsayılan `notice_due`; notice_due, notice_sent, submitted, negotiating, settled, rejected |
| assigned_to | uuid | FK profiles ON DELETE SET NULL |
| + ortak kolonlar | | |

Ek indeks: `(project_id, notice_deadline) WHERE status = 'notice_due'`. RLS görme: admin, proje_yoneticisi, muhasebe.
Durum geçmişi tipi `claim`. İhbar süresi proje ayarı (`claim_notice_days`) yok; son tarih elle girilir.

### B.3 interfaces

| Kolon | Tip | Kısıt / varsayılan |
|---|---|---|
| interface_no | text NOT NULL | `UNIQUE (project_id, interface_no)`; trigger ITF |
| title | text NOT NULL | |
| description | text | |
| interface_type | text | serbest |
| party_a, party_b | text NOT NULL | `party_a <> party_b` |
| status | text NOT NULL | varsayılan `open`; open, agreed, closed |
| priority | text NOT NULL | varsayılan `medium`; low, medium, high, critical |
| assigned_to | uuid | FK profiles ON DELETE SET NULL |
| due_date | date | |
| + ortak kolonlar | | |

RLS görme: admin, proje_yoneticisi, santiye_sefi. Durum geçmişi tipi `interface`.

### B.4 Mevcut tablolara etkisi (şema değişmedi)

- `project_register_counters.register_code` yeni değerler alır: CHG, CLM, ITF.
- `register_status_history.register_code` yeni değerler alır: change, claim, interface.
- `document_revisions.storage_provider`: panelden girilen SharePoint linkleri `external` (Karar 80); şema aynı.
