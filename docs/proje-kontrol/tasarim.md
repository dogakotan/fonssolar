# Proje Kontrol: tasarım (v3) — Claude Code için kaynak dosya

> **v3, 07.10.2026.** Canlı şemaya ve onaylanan kararlara göre yeniden yazıldı. Bu dosya v2'nin ve
> `FONS_Diyarbakir_Sistem_Revizyon_Yol_Haritasi.docx` (v1) dosyasının YERİNE geçer. Çelişkide öncelik sırası:
> **onaylı kararlar (CLAUDE.md "Proje Kontrol (Faz A)") > canlı şema (`canli-sema-ozeti.md`) > bu dosya.**
>
> **v2'den başlıca farklar:**
> - **Tablo adları canlıdaki gibi:** `project_wbs`, `project_areas`, `area_wbs`, `project_actions`, `technical_submittals`.
> - **Ayrı Action tablosu:** Action, ticket genişletmesi değil ayrı bir tablo (`project_actions`).
> - **Revizyon modeli:** tek doküman, çok revizyon (`documents` + `document_revisions`, tek `is_current`); `supersedes_id` zinciri yok.
> - **Numara biçimi:** `{TÜR}-{PROJE_KODU}-{SIRA}`, kırpmasız, uygulandı. Önekler DOC/DRW/RFI/TS/MA/DEC/ACT; proje kodları ADN1, ADN2, TIZ, TKY.
> - **Depolama sınırları:** ücretsiz planda (500 MB veritabanı, 1 GB dosya) PDF tam metni kalıcı saklanmaz (`document_texts` yok); audit yalnızca değişen alanları tutar.
> - **Dosya sağlayıcısı karar bekliyor:** Supabase Storage + Pro ya da ayrı Gmail hesabında Drive (OAuth). v2'deki "servis hesabı + Shared Drive" varsayımı bu karara bağlandı (§4.5).
> - **NCR ve Inspection:** ilk tasarımda yok.
>
> **Doküman yapısı:** Bölüm 1-4. Bölüm numaraları (4.1-4.9) v2 ile aynıdır, eski atıflar geçerlidir. Yeni bölüm: **4.10 Faz B kalan iş paketleri**.
>
> **Teknik ayrıntı:** her tablonun kolon, kısıt, policy ve yetki ayrıntısı `canli-sema-ozeti.md`'dedir. Bu dosya özetler ve hedefi anlatır.

# Bölüm 1 · Yol haritası

## Özet

Hedef: 1 Ocak 2027 saha mobilizasyonunda Document, Drawing, RFI ve Action register'ları dosya deposu + Supabase + AI
ile uçtan uca çalışıyor olsun; kalan register'lar mobilizasyondan sonra aynı iskelete eklensin.

Beş ilke:

1. Supabase tek kayıt kaynağı, dosya deposu (§4.5'teki karara göre Supabase Storage veya Drive) tek dosya kaynağı. Excel yalnızca şablon, import ve export.
2. Ekle, bozma. Satın alma, finans, günlük rapor, ticket ve risk modülleri çalışmaya devam eder.
3. Dikey dilim. Her faz sonunda kullanıcının gerçekten kullanabildiği bir özellik çıkar.
4. AI taslak üretir, yetkili kişi onaylar. Onay akışı ve audit çekirdekte baştan vardır.
5. Register'lar projeden bağımsızdır. Diyarbakır ilk kullanıcıdır; aynı yapı sonraki projelerde açılır (proje kodu `project_register_settings`'e eklenerek).

## Sistem değişiklikleri

| Katman | Bugün (07.10.2026) | Hedef (Faz B-D) |
|---|---|---|
| Veritabanı | 55 tablo, 7 view, 437 migration. Proje Kontrol için canlıda: project_wbs, project_areas, area_wbs, documents, document_revisions, drawings, rfis, project_actions, decisions, technical_submittals, material_approvals, register_status_history, project_register_counters, project_register_settings (hepsi boş; proje kodları dolu) | Eklenecek: register_permissions, register_audit (yalnızca değişen alanlar), register_status_transitions, register_links, register_drafts, document_jobs, ai_runs, ai_settings; ortak kolonlar (record_state, source, approved_*). Changes/claims/interfaces Faz D-E |
| Dosya | Supabase Storage: günlük rapor fotoğrafları, ticket ekleri, teklif ekleri (private bucket'lar) | Proje dokümanları §4.5'teki karara göre Storage'a ya da Drive'a gider; fotoğraf ve ekler Storage'da kalır |
| Edge function | Canlıda 4: create-user, manage-user, import-project-excel, export-project-excel. Repoda deploy edilmemiş: agent-chat, drive-gateway (iskelet, 28 birim testi) | Dosya ağ geçidi (drive-gateway, sağlayıcıya göre adaptör), process-document; Drive seçilirse drive-sync |
| Yetki | 4 rol. Register tablolarında RLS okuma `user_has_project_access`; yazma G-01 ile geçici kapalı | register_permissions × register_can(); yazma yalnızca SECURITY DEFINER RPC (G-01 kalıcılaşır) |
| Frontend | Proje Kontrol ekranı yok | ProjeDetay içinde "Proje Kontrol" sekmesi + santiye_sefi/muhasebe için üst seviye `kontrol` sekmesi (frontend-tasarim-notu.md); config tabanlı RegisterList/RegisterDetail |
| AI | agent-chat (Gemini proxy); ölçüm iskeleti `scripts/proje-kontrol/ai-olcum/` | Yapılandırılmış çıkarım → register_drafts → onay; ai_runs ile ölçüm |
| Planlama | project_tasks (+activity_id, baseline_*, forecast_*, wbs_id, area_id), progress_daily | Değişmez; WBS/Area bağları kullanılmaya başlar |
| Test | 121 Playwright testi (118 geçiyor, 3 Faz B'yi bekleyen fixme) | Her fazda RLS + akış testleri (4 rol) |

## Başlangıç noktası (07.10.2026, canlıdan doğrulandı)

| Alan | Durum |
|---|---|
| Kimlikler | projects.id text; profiles, project_tasks, project_risks, procurement_items, suppliers id uuid. project_tasks'ta hem `task_code` (UNIQUE project_id, task_code) hem `activity_id` (kısmi unique, değiştirilemez) var |
| Güvenlik | G-02/G-03 (sahte metadata ile başka projenin dosyası) düzeltildi; G-01 geçici; G-11 (numara kırpma) düzeltildi; açık: G-04, G-12, G-13 (bkz. guvenlik-bulgulari.md) |
| Numaralama | `next_register_no` + `project_register_counters` + `project_register_settings`; eşzamanlılık SQL tarafında doğru (satır kilidi), 20 eşzamanlı istek testi yazma RPC'si gelince |
| Kalite | Kalite kontrol modülü kararla kaldırıldı; NCR/Inspection ilk tasarımda yok |
| Eklentiler | pg_cron var; pg_net ve pgvector yok |
| Yedek | Ücretsiz planda otomatik yedek yok; `npm run db:backup` henüz çalışmıyor (`scripts/db-backup/.env.local` yok) |

## Kararlar

| # | Karar | Durum |
|---|---|---|
| 0 | 05.10 ön şeması korunur ve hizalanır (0.1 project_actions, 0.2 numara biçimi, 0.4 submittal/material ayrı, 0.5 is_critical kaldırıldı) | **ONAYLANDI 07.10**, migration uygulandı (`20261007072501`) |
| 1 | Dosya erişim modeli: kullanıcı dosyaya yalnızca uygulama üzerinden (gateway, her çağrıda JWT + proje yetkisi) ulaşır | İlke kabul; **sağlayıcı seçimi BEKLİYOR** (§4.5: A Storage+Pro / B Gmail Drive OAuth) |
| 2 | Klasör/yol yapısı ve dosya adı `{register_no}_{rev}_{kisa-baslik}.{ext}` | Sağlayıcı kararına bağlı (§4.5) |
| 3 | Revizyon: tek doküman, çok revizyon, tek is_current | **ONAYLANDI 07.10**, uygulandı |
| 4 | Roller: 4 rol korunur; register × eylem yetkisi register_permissions'ta (§4.3 öneridir) | ONAY BEKLİYOR (Faz B ilk paketinden önce) |
| 5 | AI sağlayıcı ve gizlilik: önce İsdemir OYAK izni, sonra iki sağlayıcı ölçümü | ONAY BEKLİYOR; gizlilik sorusunun gönderildiği doğrulanamadı |
| 6 | NCR ve Inspection: ilk tasarımda yok (project_actions.source_type'tan ncr/inspection çıkarıldı) | Fiilen uygulandı (0.1 ile); ayrı onay kaydı yok |
| 7 | Agent kimliği: proje kapsamlı, yalnızca izinli RPC | ONAY BEKLİYOR (Faz E) |
| 8 | İlk agent'lar: Reconciliation ve Planning | ONAY BEKLİYOR (Faz E) |

Ek kararlar (07.10): proje kodları ADN1, ADN2, TIZ, TKY (DYB Diyarbakır açılınca); önekler DOC/DRW/RFI/TS/MA/DEC/ACT; depolama: PDF tam metni kalıcı saklanmaz, audit yalnızca değişen alanları tutar.

## Hedef mimari

Kayıt Supabase'de, dosya seçilen depoda. Kullanıcı dosyaya yalnızca gateway üzerinden ulaşır; yetki her çağrıda
kontrol edilir. AI çıktısı `register_drafts`'a taslak olarak yazılır; onaysız gerçek kayıt oluşmaz. Register
tablolarına yazma yalnızca SECURITY DEFINER RPC'lerle yapılır. İstisna: WBS/Alan master verisi; onlar RLS ile
doğrudan yazılır.

## Fazlar ve takvim

| Faz | Tarih (tahmin) | Kullanıcının eline geçen |
|---|---|---|
| A · Zemin ve kararlar | 6-19 Eki | Kararlar, doğrulanmış güvenlik, uyumlu şema, gateway iskeleti, ölçüm iskeleti |
| B · Çekirdek | 20 Eki - 9 Kas (kapsam küçüldü; erken bitebilir) | Yetki matrisi, yazma RPC'leri, audit, dosya akışı, RegisterList/Detail iskeleti |
| C · Pilot dilim | 10 Kas - 7 Ara | Document, Drawing, RFI, Action uçtan uca; dosyadan RFI taslağı |
| D · İkinci dilim | 8-28 Ara | Submittal, Material Approval, Risk taslağı, Change/Claim; Procurement/Subcontractor köprüleri |
| E · Mobilizasyon sonrası | Ocak'tan sonra | Agent'lar, dashboard, kalan register'lar, Excel import |

Faz B kapsamının küçülmesinin nedeni: v2'nin M01 (WBS/Area) ve M04 (numaralama) migration'ları, M05/M06/M12/M16'nın tablo kısımları canlıda var (§4.8). Kalan iş §4.10'da.

## Faz faz değişiklik planı

| Faz | Ne değişir | Dokunulmaz / geri dönüş | Çıkış kapısı |
|---|---|---|---|
| A | Kararlar, güvenlik doğrulaması, uyum migration'ı (yapıldı), gateway iskeleti, ölçüm iskeleti, sağlayıcı kararı | Uyum migration'ı geri alınabilir (`yedek-uyum-07-10.sql`) | Bkz. Bölüm 3 Faz A kapısı |
| B | §4.10 paketleri | Mevcut ekranlar yeni nesnelere bağlı değil; boş tablolarda ters migration ucuz | Aynı numara iki kez üretilmiyor (20 eşzamanlı); 4 rolle onay matrisi; doğrudan yazma reddediliyor; tam regresyon yeşil; sağlayıcı ölçümü sonuçlanmış |
| C | process-document, drawings/rfis/actions ekranları, onay kutusu, register_links | Manuel giriş AI kapalıyken çalışır | Gerçek RFI PDF'inden taslak → onay → audit; başka proje göremiyor |
| D | Submittal/Material ekranları, Risk taslağı, Change/Claim, köprüler | Satın alma/finansa yazma yok | Risk taslağı onaysız kesinleşmiyor; satın alma ve finans testleri yeşil |
| E | Agent'lar, dashboard, kalan register'lar | agent-chat değişmez | Agent'lar yalnızca RPC ile okuyor, her koşu ai_runs'ta |

## 16 register: mevcut tablolarla eşleştirme

| # | Register | Canlıdaki karşılık | Durum | Faz |
|---|---|---|---|---|
| 1 | Document | `documents` + `document_revisions` | Tablo var | B-C |
| 2 | Drawing | `drawings` (dokümana bire bir uzantı, DRW numarası) | Tablo var | C |
| 3 | RFI | `rfis` | Tablo var | C |
| 8 | Action | `project_actions` (ticket'tan ayrı) | Tablo var | C |
| 4 | Technical Submittal | `technical_submittals` (TS) | Tablo var | D |
| 5 | Material Approval | `material_approvals` (MA); BOM bağı ters yönde: procurement_items/purchase_requests.material_approval_id | Tablo var | D |
| 9 | Decision | `decisions` (DEC) | Tablo var | E (ekran) |
| 10 | Risk | `project_risks` (+ wbs/area/task/rfi/action/decision kFK) | Genişletme kısmen | D |
| 6 | Procurement | purchase_requests (+ wbs/area/task/material_approval/technical_submittal kFK) | Köprü | D |
| 7 | Subcontractor | suppliers (`supplier_type` adı başka anlamla dolu) | Köprü; ad çakışması çözülmeli | D |
| 11 | Change / Variation | yok | Yeni | D |
| 12 | Claim & Notice | yok | Yeni | D |
| 15 | Interface | yok | Yeni | E |
| 16 | Payment | invoices, invoice_payments, financial_transactions | Köprü | E |
| 13-14 | NCR, Inspection | yok | İlk tasarımda yok (Karar #6) | — |

## Backend ve frontend iş paketleri (özet)

Backend paketleri §4.10'da, frontend paketleri §4.7'de. Her migration CLAUDE.md kuralı gereği SQL gösterilip onayla uygulanır; her pakette pozitif ve negatif RLS testi yazılır.

## AI katmanı ve onay modeli

AI hiçbir kaydı kendi başına kesinleştirmez. Pilot akışı:

1. Dosya gateway ile yüklenir; `documents` + `document_revisions` satırı ve `document_jobs` işi açılır.
2. process-document metni **bellekte** çıkarır (taranmış PDF için sayfa görüntüsü). Metin veritabanına kalıcı yazılmaz.
3. Tür belliyse register şemasına göre yapılandırılmış çıkarım yapılır.
4. Çizim no, `task_code`/`activity_id`, WBS ve Alan mevcut kayıtlarla eşleştirilir; eşleşmeyen alan boş kalır.
5. Her alan için güven ve kaynak (sayfa, kısa alıntı) `register_drafts.field_confidence`'a yazılır.
6. Kullanıcı sarı/kırmızı alanları kontrol edip onaylar; RPC hedef tabloya yazar, audit'e değişen alanlar düşer.

Kurallar: Risk, Claim, Change, Decision ve Payment için hiçbir alan otomatik kesinleşmez. Hukuki ve ticari yorumlar
uyarıdır. DWG okunmaz. AI anahtarı yalnızca edge function secret'ında durur. Gizlilik izni (Karar #5) gelmeden
gerçek doküman harici modele gitmez (`AI_OLCUM_GIZLILIK_ONAYI` kapısı).

## Kabul kriterleri ve riskler

| Faz | Kabul kriteri |
|---|---|
| A | Bölüm 3 Faz A kapısı |
| B | Eşzamanlı 20 istekte numara benzersiz ve ardışık; 4 rolle onay matrisi; doğrudan INSERT/UPDATE/DELETE reddediliyor; audit yalnızca değişen alanları yazıyor; tam regresyon yeşil |
| C | Gerçek RFI PDF'inden taslak çıkıyor, onaylanıyor, audit'te görünüyor; başka projenin kullanıcısı kayıt ve dosyayı göremiyor; AI kapalıyken manuel giriş çalışıyor |
| D | Risk taslağı PM onayı olmadan kesinleşmiyor; köprüler satın alma/finansı bozmuyor |
| E | Agent'lar yalnızca RPC ile okuyor, her koşu ai_runs'ta |

| Risk | Etki | Önlem |
|---|---|---|
| Ücretsiz plan sınırları (500 MB DB, 1 GB dosya, otomatik yedek yok) | Doküman deposu dolar; veri kaybında geri dönüş yok | §4.5 karar; metin ve audit şişmesi engellendi; db:backup çalışır hale getirilmeli |
| Elle verilen register numarası sayaçla çakışır | O türde kayıt açılamaz | Yazma RPC'leri `*_no` almaz |
| Drive (B seçeneği) tek kişisel hesaba bağlı | Hesap kilitlenirse dosyaya erişim kesilir | Ayrı, şirket kontrolünde hesap; refresh token secret'ta; düzenli dışa aktarım |
| AI yanlış alan çıkarır | Hatalı kayıt | Taslak + onay, alıntı doğrulaması, "yüksek güvenle yanlış" ölçümü |
| Canlı modüllerin bozulması | Diğer projeler etkilenir | Yalnızca ekleyici migration; her migration'da tam regresyon |
| Kapasite | Pilot yetişmez | Önce Document + RFI |


# Bölüm 2 · Dokümanın açıklaması

## 1. Neden yeni bir sistem değil, ekleme

Kod 437 migration, 55 tablo ve 121 test içeriyor ve canlı çalışıyor. Mevcut modüller korunuyor; Proje Kontrol
tabloları yanlarına eklendi (05.10) ve onaylanan kararlara göre hizalandı (07.10).

## 2. Temel yapı: üç kaynak, bir kural

| Parça | Rolü |
|---|---|
| Supabase (veritabanı) | Kaydın tek kaynağı: RFI, doküman kimliği, revizyon, risk, audit, yetki |
| Dosya deposu | Dosyanın tek kaynağı: PDF, DWG, Word. Supabase Storage (A) veya Drive (B), §4.5 |
| Excel | Yalnızca şablon, toplu giriş, dışa aktarma |

Kural: aynı bilgi iki yerde tutulmaz. Kayıt dosyaya depo dosya kimliğiyle (`document_revisions.storage_file_id`)
bağlanır. Kullanıcı dosyayı uygulama üzerinden açar; tarayıcıya kalıcı depo bağlantısı verilmez.

## 3. 16 register nasıl çözülüyor

- 7'si canlıda tablo olarak var: Document, Drawing, RFI, Action, Technical Submittal, Material Approval, Decision.
- 5'i köprü: Procurement, Subcontractor, Risk, Payment (ve Material Approval'ın BOM bağı).
- 3'ü yeni: Change, Claim, Interface.
- NCR ve Inspection ilk tasarımda yok.

Numara biçimi her register'da aynı: `RFI-DYB-0032` (tür, proje kodu, 4 haneye kadar sıfır doldurulmuş sıra; daha uzun
sayı kırpılmaz).

## 4. AI nasıl çalışıyor: örnek akış

Bir RFI PDF'i uygulamadan yüklenir → kayıt ve iş açılır → metin bellekte çıkarılır → RFI alanları şemaya göre
çıkarılır → çizim no ve aktivite eşleştirilir → taslak `register_drafts`'a yazılır → kullanıcı sarı/kırmızı alanları
düzeltip onaylar → RPC kaydı `rfis`'e yazar, numara verir, audit'e değişen alanlar düşer. Sorgu gerektiren işler
("7 günden eski açık RFI'lar") veritabanında yapılır; modele yalnızca yorum gerektiren sorular gider.

## 5. Fazlar ve takvim

Bkz. Bölüm 1 ve Bölüm 3. Pilot 7 Aralık'ta hazır; Faz D mobilizasyondan 4 gün önce biter. Faz A takvimden önde (7 Ekim
itibarıyla şema ve güvenlik işleri bitti).

## 6. Kararlar

Bkz. Bölüm 1 "Kararlar" tablosu. Açık kalan en kritik iki karar: **dosya sağlayıcısı** (§4.5; Pro plan ödemesi
sorusuna bağlı) ve **AI gizlilik izni** (#5).

## 7. Doğrulanmamış noktalar

- Seçilen depo için gerçek yükleme süresi ve boyut sınırları (`scripts/proje-kontrol/drive-limit-test.mjs` hazır, çalıştırılmadı).
- Supabase Pro planının güncel fiyat ve kotaları; satın almadan önce supabase.com/pricing'den doğrulanmalı.
- Google'ın OAuth "Testing" durumunda refresh token'ı 7 günde düşürmesi ve `drive.file` kapsamının doğrulama gerektirmemesi. Bunlar bilinen davranışlar; B seçilirse kurulumda doğrulanmalı.
- Edge function süre ve bellek sınırı; PDF metin çıkarımı için Deno'da çalışan kütüphane.

## 8. Sıradaki adım

Sağlayıcı kararı (Pro ödemesi) ve db:backup; ardından Faz B'nin ilk paketi (register_permissions + Karar #4 onayı).


# Bölüm 3 · Uygulama takvimi (6 Ekim 2026 - 1 Ocak 2027)

## Başlamadan önce (6 Ekim) — durum

- [x] Git dalı açıldı: `faz-a-proje-kontrol`.
- [ ] `npm run db:backup` çalışır hale getirilecek (`.env.local` yok; muhtemelen Docker gerekiyor). 07.10'daki değişikliklerde nesne anlık görüntüsü kullanıldı.
- [ ] Dosya sağlayıcısı kararı (§4.5). Drive seçilirse Google hesabı ve OAuth istemcisi; Storage seçilirse Pro plan.
- [ ] Ölçüm seti: 10-15 doküman + beklenen alanlar (kullanıcıda).
- [ ] İsdemir OYAK gizlilik sorusu (kullanıcıda; gönderildiği doğrulanamadı).
- [x] Karar #0 ve #3 onaylandı; #1/#2 sağlayıcı kararına bağlandı; #4-#8 açık.

## Faz A: zemin ve kararlar (6-19 Ekim)

| İş | Durum |
|---|---|
| Canlı şema doğrulaması (`sema-dogrulama.md`) ve 05.10 ön şemasının bulunması | Yapıldı (06.10) |
| Güvenlik testleri (`tests/proje-kontrol-guvenlik.spec.js`, 8 senaryo) | Yapıldı; 8/8 |
| G-02/G-03 düzeltmesi, G-01 geçici kapatma | Uygulandı (07.10) |
| WBS/Alan yetki testi (`tests/proje-kontrol-master-veri.spec.js`) | Yapıldı; 9/9 (G-10 açık yok) |
| Karar #0 alt kararları, uyum migration'ı (numara, revizyon, project_actions, is_critical) | Uygulandı (07.10); `tests/proje-kontrol-uyum.spec.js` 7 + 3 fixme |
| Canlı şema özeti (`canli-sema-ozeti.md`) ve bu tasarım v3 | Yapıldı (07.10) |
| drive-gateway iskeleti (kontrol sırası, 28 birim testi) | Yapıldı; deploy edilmedi; sağlayıcı adaptörü karara bağlı |
| Depo sınır betiği | Hazır; çalıştırılmadı (kimlik bilgisi/sağlayıcı yok) |
| AI ölçüm iskeleti (`scripts/proje-kontrol/ai-olcum/`) | Hazır; ölçüm seti yok |
| Frontend tasarım notu (`frontend-tasarim-notu.md`) | Yapıldı |
| Dosya sağlayıcısı kararı | **Açık** |
| db:backup | **Açık** |
| Gizlilik sorusu, ölçüm seti | **Açık** (kullanıcıda) |
| Karar #4 (yetki matrisi) | **Açık**; Faz B ilk paketinden önce gerekli |

**Faz A çıkış kapısı (19 Ekim):**

| Madde | Durum |
|---|---|
| Mevcut güvenlik durumu testle doğrulandı, YÜKSEK açıklar kapandı | Kapandı (G-02/G-03 düzeltildi, G-01 geçici) |
| Proje Kontrol şeması kararlarla uyumlu | Kapandı |
| Kararlar yazılı ve CLAUDE.md'de | Kısmen: #0, #3 onaylı; #1/#2 sağlayıcıya bağlı; #4-#8 açık |
| Yetkisiz kullanıcı gateway'den dosya alamıyor | Açık: iskelet ve birim testi var, deploy ve uçtan uca test sağlayıcı kararından sonra |
| Gizlilik sorusu gönderildi veya AI'ın yalnızca metadata ile çalışacağı yazıldı | Açık |
| Yedek alınabiliyor (db:backup) | Açık |

## Faz B: çekirdek (20 Ekim - 9 Kasım)

v2'deki Migration 1 (WBS/Area) ve Migration 4 (numaralama) yapıldı; Migration 5'in tablo kısmı (documents) yapıldı.
Kalan paketler ve sırası §4.10'da. Önerilen haftalık dağılım:

| Hafta | İş |
|---|---|
| 20-26 Eki | B1 G-13 + FK indeksleri + ortak kolonlar; B2 register_permissions (Karar #4 onayıyla); B3 audit |
| 27 Eki - 2 Kas | B4 yazma RPC'leri (G-01 kalıcı); 20 eşzamanlı numara testi; RegisterList/Detail iskeleti (28 Ekim yarım gün, 29 Ekim tatil) |
| 3-9 Kas | B5 dosya akışı (seçilen sağlayıcı); B6 document_jobs, register_drafts, ai_runs, ai_settings; sağlayıcı ölçümü; G-04, G-12; Proje Kontrol sekmesi (yalnızca admin) |

Çıkış kapısı (9 Kasım): Bölüm 1 "Kabul kriterleri" B satırı.

## Faz C: pilot dilim (10 Kasım - 7 Aralık)

| Hafta | İş |
|---|---|
| 10-16 Kas | Sağlayıcı seçimi (Karar #5); register_links; Document ekranı (yükleme, revizyon listesi, gateway ile indirme) |
| 17-23 Kas | process-document v1 (metin bellekte, tür tespiti, ai_runs); Drawing ve RFI ekranları; manuel RFI tam çalışır; (Drive seçildiyse) drive-sync |
| 24-30 Kas | process-document v2 (RFI çıkarımı, güven, alıntı doğrulama, eşleştirme); taslak RPC'leri; "Dosyadan RFI oluştur" |
| 1-7 Ara | Action ekranı (`project_actions`); onay kutusu; bildirim türleri; pilot testleri |

## Faz D: ikinci dilim (8-28 Aralık) ve yılbaşı tamponu

| Hafta | İş |
|---|---|
| 8-14 Ara | Submittal ve Material Approval ekranları (tablolar var); geçiş seed'leri; Submittal AI şeması |
| 15-21 Ara | changes, claims; project_risks onay/source genişlemesi; Risk taslağı yalnızca PM onayıyla |
| 22-28 Ara | suppliers ad çakışmasının çözümü (`party_type` önerisi) ve köprüler; AI Analiz paneli; tam regresyon |
| 29 Ara - 1 Oca | Tampon, eğitim, DYB proje kodu ve klasörleri, doküman güncellemesi |

## Frontend nasıl güncellenecek

Ayrıntı `frontend-tasarim-notu.md` ve §4.7. Özet:
- ProjeDetay'a "Proje Kontrol" sekmesi; ProjeDetay iç sekmelerinin rol bazlı yetki mekanizması yok.
- santiye_sefi ve muhasebe ProjeDetay'a ulaşamadığı için bu rollere üst seviye `kontrol` sekmesi açılır (`role_allowed_tabs` + `role_sidebar_items` satırı + Sidebar.jsx girdisi).
- URL: `/dashboard/projeler/{id}/kontrol?register=&kayit=`, `useUrlSyncedSelection` deseni. index.jsx'te birden fazla parametreyi tek seferde güncelleyen bir `syncEntityParams` yardımcısı gerekir.
- Bileşenler `src/components/proje-kontrol/`. Veri yalnızca RPC'lerden gelir, ham `.from()` kullanılmaz.

## Haftalık rutin, migration akışı ve kayma kuralı

Her migration:
1. SQL yazılır ve gösterilir.
2. Kullanıcı onaylar.
3. Değişecek nesnelerin anlık görüntüsü alınır; db:backup çalışır hale gelince o.
4. Gerekiyorsa ROLLBACK'li deneme ve parmak izi karşılaştırması yapılır.
5. Migration uygulanır; aynı sürümle `supabase/migrations/` dosyası yazılır.
6. Doğrulama sorgusu ve pozitif/negatif RLS testi çalıştırılır.
7. Tam regresyon koşulur.
8. CLAUDE.md güncellenir.

Yeni tablo ve fonksiyonlarda yetki açıkça geri çekilir. `pg_default_acl`, yeni tablolarda `authenticated`'a tüm yetkileri, yeni fonksiyonlarda `anon`/`authenticated`'a EXECUTE veriyor.

Gecikmede kesilme sırası:
1. AI Analiz paneli.
2. Material Approval ekranı ve Claim.
3. Onay kutusunun gelişmiş hali.
4. Drawing ekranı Document içinde basit liste olarak kalır.

Kesilmeyenler: Document, RFI, taslak + insan onayı, audit, yetki testleri.


# Bölüm 4 · Teknik tasarım

## Okuma rehberi

Canlıdan doğrulananlar (07.10.2026):
- `projects.id` text; diğer kimlikler uuid.
- `has_project_access(NULL)` true döner; bu yüzden her yeni tabloda `project_id` NOT NULL olmalı.
- `project_tasks`'ta `task_code` (UNIQUE) ve `activity_id` (değiştirilemez) var.
- Register tablolarında aynı-proje bütünlüğü kompozit FK (kFK) `(project_id, x) → (project_id, id)` ile sağlanır.
- Kolon düzeyinde ayrıntı `canli-sema-ozeti.md`'de. Bu bölüm canlı durumu ve Faz B-D hedefini birlikte verir; **"canlı"** ve **"eklenecek"** ayrı işaretlidir.

Esaslı tasarım kararı (v2'den beri): AI taslakları hedef tabloya değil `register_drafts`'a yazılır; onayla RPC hedefe yazar.

## 4.1 Ortak sözleşme

**Canlı olan ortak yapı:**
- **Kimlik:** `id uuid` PK; `project_id text NN` FK projects ON DELETE CASCADE; `UNIQUE (project_id, id)`.
- **Bağlar:** `wbs_id`, `area_id`, `task_id`: kFK → project_wbs, project_areas, project_tasks; ON DELETE NO ACTION. SET NULL kullanılmaz, çünkü kompozit FK'de SET NULL `project_id`'yi de boşaltırdı.
- **Kayıt no:** tabloya özel ad. Hepsi NOT NULL, UNIQUE (project_id, x), boş gelirse trigger doldurur. drawings'in kendi numarası yok.

  | Tablo | Kolon |
  |---|---|
  | documents | document_no |
  | rfis | rfi_no |
  | project_actions | action_no |
  | decisions | decision_no |
  | technical_submittals | submittal_no |
  | material_approvals | approval_no |

  Liste RPC'si ve view'lar bunları `register_no` olarak normalleştirir.
- **Zaman:** `created_at`, `updated_at` (`update_updated_at_column` trigger'ı).
- **İş durumu:** `status` her tabloya özel CHECK (§4.2).
- **Öncelik:** `priority` low / **medium** / high / critical, varsayılan medium. Yalnızca rfis ve project_actions'ta var; canlı sözlük korunur.

**Faz B'de eklenecek ortak kolonlar** (register tablolarının hepsine, boş tablolar olduğu için ucuz):

| Kolon | Tip | Kural |
|---|---|---|
| record_state | text NN default 'draft' | draft, pending_approval, approved, rejected |
| source | text NN default 'manual' | manual, ai, import |
| approved_by, approved_at, rejected_reason | uuid FK profiles, timestamptz, text | Onay/ret bilgisi |
| created_by | uuid FK profiles | rfis, technical_submittals ve material_approvals'ta eksik; eklenir |
| source_document_id | uuid, kFK → documents | Kaydın çıkarıldığı dosya. Var olan `document_id` "ilişkili doküman" anlamında kalır |
| discipline | text | CHECK mechanical, dc, ac, mv, enh, civil, general (project_wbs.discipline ile aynı sözlük) |

**İki eksenli durum:** `record_state` kaydın geçerliliğini, `status` işin yaşam döngüsünü tutar. record_state geçişleri yalnızca RPC ile yapılır:

| Nereden | Nereye | Kim |
|---|---|---|
| (yeni) | draft | create izni |
| draft | pending_approval | sahibi veya edit izni |
| pending_approval | approved | approve izni; kritik register'da (risk, change, claim, decision) onaylayan ≠ created_by |
| pending_approval | rejected | approve izni, gerekçe zorunlu |
| rejected | draft | sahibi |
| approved | draft | approve izni, gerekçe zorunlu (reopen) |

Onaylı kayıtta alanlar kilitlidir. Elle yüklenen doküman doğrudan approved açılabilir.

**Numaralama (canlı, 07.10.2026):**
- Biçim `{TÜR}-{PROJE_KODU}-{SIRA}`.
- **Proje kodu:** `project_register_settings.prefix` (2-6 büyük harf/rakam, projeler arasında benzersiz). Kodu olmayan projede kayıt açılamaz, açık hata verir.
- **Sıra:** `project_register_counters (project_id, register_code)`. Kaydı ekleyen transaction içinde `insert … on conflict do update … returning` ile artar; geri alınan işlemde numara tüketilmez.
- **Biçim:** 4 haneye kadar sıfır doldurulur; 10000 ve üstü olduğu gibi yazılır.
- **Önekler:** RFI, DEC, ACT, TS, MA (trigger argümanı). documents'ta `document_type='drawing'` → DRW, değilse DOC.
- **Yeni register önekleri:** CHG, CLM, INT (Faz D-E).
- **Mevcut kayıtlar:** ticket ve risk satırlarına numara verilmez.
- **Kural:** Yazma RPC'leri `*_no` kolonunu girdi olarak kabul etmez. Elle verilen numara sayaçla çakışır.

## 4.2 Tablo tablo şema

Genel kural:
- Her FK kolonuna indeks (bugün eksikler var, §4.10 B1).
- Her tabloda RLS açık.
- Register tablolarında yazma yalnızca RPC ile (B4'te doğrudan yazma policy'leri düşürülür).
- Master veri (project_wbs, project_areas, area_wbs) istisna: RLS ile doğrudan yazılır.

**A. Altyapı tabloları**

| Tablo | Durum | Özet |
|---|---|---|
| project_wbs | Canlı | wbs_code (CHECK `^[A-Z0-9][A-Z0-9-]*$`, UNIQUE proje içi), parent_id (kFK RESTRICT), level (trigger), discipline, default_owner_role, is_active, notes. Guard trigger: proje değişmez, kullanımdaki kod değişmez, pasif üst altında aktif alt yok, döngü yok. Yazma: admin, PM (+erişim). Eklenebilir: sort_order |
| project_areas | Canlı | area_code, parent_id (hiyerarşi), area_type (12 değer), responsible_user, is_active. Guard aynı. Yazma: admin, PM, santiye_sefi (yalnızca kendi projesi); silme admin/PM |
| area_wbs | Canlı | Alan ↔ WBS çoktan çoğa; kFK CASCADE; UPDATE policy'si yok |
| project_register_settings | Canlı | project_id PK, prefix (UNIQUE). Eklenebilir: four_eyes_enabled (varsayılan açık), claim_notice_days (Faz D) |
| project_register_counters | Canlı | (project_id, register_code) PK, last_value. Erişim yalnızca DEFINER fonksiyonlarla |
| register_status_history | Canlı | Durum değişiklikleri (rfis, decisions, project_actions trigger'ı). register_audit gelince yerini ona bırakır ya da yalnızca durum zaman çizelgesi olarak kalır (B3'te karar) |
| register_permissions | Eklenecek (B2) | role_key FK roles, register_type, can_view, can_create, can_edit, can_approve, can_delete; PK (role_key, register_type) |
| register_status_transitions | Eklenecek (B2) | (register_type, from_status, to_status) PK |
| register_audit | Eklenecek (B3) | id bigint identity, project_id, table_name, record_id, action (insert, update, delete, state_change, approve, reject, reopen), changed_by default auth.uid(), changed_at, **changed jsonb** (yalnızca değişen alanlar: `{alan: [eski, yeni]}`; INSERT'te yalnızca dolu alanlar, büyük metin alanları kısaltılır), reason. Satırı yalnızca trigger yazar; UPDATE/DELETE yetkisi yok. İndeks (table_name, record_id, changed_at desc), (project_id, changed_at desc) |
| register_links | Eklenecek (C) | from_type, from_id, to_type, to_id, relation (relates_to, answers, caused_by, blocks, references). Doğrudan kFK bağlarının karşılamadığı çoktan çoğa ilişkiler için |
| register_drafts | Eklenecek (B6) | project_id, register_type, payload jsonb, field_confidence jsonb (alan → {confidence, page, quote ≤ 200 karakter}), source_document_id, source_revision_id, job_id, run_id, prompt_version, status (ai_draft, approved, rejected, superseded), reviewed_fields text[], created_record_id, reviewed_by/at, reject_reason. Onaylanan ve reddedilen taslakların payload'ı 90 gün sonra temizlenebilir (depolama) |
| document_jobs | Eklenecek (B6) | project_id, document_id, revision_id, job_type (classify, extract), status (queued, running, done, failed, skipped), attempts, last_error, zaman damgaları |
| ai_runs, ai_settings | Eklenecek (B6) | §4.6 |
| document_texts | **Kurulmayacak** (depolama kararı) | Metin işlem sırasında bellekte tutulur; yeniden işleme gerekirse dosyadan tekrar çıkarılır |
| project_drive_folders, drive_sync_state | Yalnızca B seçeneğinde (Drive) | §4.5 |

**B. Register tabloları** (ayrıntı `canli-sema-ozeti.md` §2)

| Tablo | Durum | Register'a özel kolonlar | status değerleri |
|---|---|---|---|
| documents | Canlı | document_no, title, document_type (CHECK yok), discipline, wbs/area/task. Ek UNIQUE (project_id, id, document_type) | active, void |
| document_revisions | Canlı | document_id (kFK CASCADE), revision_no (CHECK biçim, UNIQUE doküman içi), revision_status, is_current (kısmi unique: tek güncel), issue_date, storage_provider, storage_file_id, file_name, mime_type, size_bytes, sha256, notes | ifr, ifa, ifc, as_built |
| drawings | Canlı | document_id (UNIQUE, NN), drawing_type, document_type='drawing' (3 kolonlu FK yalnızca çizim türü dokümana bağlar) | (yok; durum revizyonda) |
| rfis | Canlı | rfi_no, subject, question, description, response, raised_by (iç kullanıcı), assigned_to, responsible_discipline, raised_date, due_date, answered_date, drawing_id, document_id, decision_id | open, under_review, answered, closed, rejected |
| project_actions | Canlı | action_no, title, description, assigned_to, responsible (serbest), due_date, completed_at, source_type (manual, risk, rfi, decision, meeting, other), decision_id, rfi_id, risk_id | open, in_progress, done, cancelled |
| decisions | Canlı | decision_no, title, decision_text, decision_date, decision_maker, rfi_id, risk_id | proposed, approved, superseded, cancelled |
| technical_submittals | Canlı | submittal_no, title, description, discipline, supplier_id, submitted/due/reviewed_date, reviewer_id, revision | draft, submitted, under_review, approved, approved_with_comments, rejected, resubmit_required |
| material_approvals | Canlı | approval_no, material_name, manufacturer, model, supplier_id, submitted/approved_date, revision, technical_submittal_id | draft, submitted, approved, approved_with_comments, rejected, expired |
| changes | Eklenecek (D) | title, description, origin (owner_request, design_change, site_condition, other), cost_estimate numeric(14,2) + currency, time_impact_days, contract_ref | identified, submitted, approved, rejected, implemented |
| claims | Eklenecek (D) | change_id, title, notice_type (time, cost, both), event_date NN, notice_deadline, notice_sent_at, amount_claimed + currency, time_claimed_days, contract_ref | notice_due, notice_sent, submitted, negotiating, settled, rejected |
| interfaces | Eklenecek (E) | title, interface_type, party_a, party_b, due_date | open, agreed, closed |

**Faz C-D'de değerlendirilecek alan ekleri:**
- **rfis:** raised_by_party, closed_at, schedule_impact_days, cost_impact, contract_ref; CHECK answered_date ≥ raised_date.
- **technical_submittals:** spec_ref, submittal_type, review_comment.
- **material_approvals:** required_on_site.
- **decisions:** supersedes_id.

Hepsi AI şemasında ihtiyaç doğarsa, tablolar boşken eklenir.

**C. Mevcut tablolara eklemeler**

| Tablo | Canlı | Eklenecek |
|---|---|---|
| project_tasks | activity_id (değiştirilemez), wbs_id, area_id (kFK RESTRICT), discipline, baseline_start/end, forecast_start/end, primavera_id; is_critical yok | Yalnızca-admin activity_id düzeltme RPC'si (B7) |
| project_risks | wbs/area/task + rfi_id, action_id, decision_id (kFK) | register_no (RSK), approved_by/at, source CHECK'e 'ai' (Faz D) |
| purchase_requests, procurement_items | wbs/area/task + material_approval_id (+ technical_submittal_id) kFK, boş | Satın alma akışı bunlara yazmaz; köprü Faz D'de yalnızca okuma |
| suppliers | supplier_type (malzeme_ekipman, hizmet, nakliye, diger) | Taşeron ayrımı için **party_type** (supplier, subcontractor, both). supplier_type adı dolu olduğu için yeni ad |
| tickets | Değişmedi | Değişiklik yok (Action ayrı tablo) |
| notifications | Değişmedi | meta jsonb; entity_type'a register_record, register_draft (Faz C) |
| Realtime | Proje Kontrol tablolarının hiçbiri yayında değil | documents, document_revisions, document_jobs, register_drafts ve ekranı olan register tabloları (Faz B-C) |

## 4.3 Yetki matrisi ve RLS şablonu

Kullanıcı önce projeye (`has_project_access`), sonra register eylemine (`register_can`) yetkili olmalı. V görüntüle,
C oluştur, E düzenle, A onayla, D sil. **Öneridir; Karar #4 ile onaylanır.** Tablo değişince kod değişmez.

| Register | admin | proje_yoneticisi | santiye_sefi | muhasebe |
|---|---|---|---|---|
| document | VCEAD | VCEA | VC | yok |
| drawing | VCEAD | VCEA | V | yok |
| rfi | VCEAD | VCEA | VCE | yok |
| technical_submittal | VCEAD | VCEA | V | yok |
| material_approval | VCEAD | VCEA | V | yok |
| decision | VCEAD | VCEA | V | yok |
| action | VCEAD | VCEA | VCE | yok |
| risk | VCEAD | VCEA | VC | yok |
| change | VCEAD | VCEA | VC | V |
| claim | VCEAD | VCEA | yok | V |
| interface | VCEAD | VCEA | VC | yok |
| procurement, subcontractor, payment | köprü; mevcut satın alma/finans yetkileri aynen | | | |

Notlar:
- santiye_sefi'nin E yetkisi yalnızca kendi oluşturduğu kayıtlar içindir.
- Kritik register'larda dört göz kuralı geçerlidir: risk, change, claim, decision.
- Silme yalnızca draft ve rejected kayıtlar içindir; onaylı kayıt `status` ile iptal edilir.

**Bugün canlıda:**
- Okuma `user_has_project_access`: muhasebe ve proje yöneticisi bütün projelerde her register'ı okur.
- Yazma policy'leri (`can_write_project_control` / `can_manage_project_control`) duruyor ama G-01 ile yetki yok.

**Hedef RLS** (B2 + B4):

```sql
-- okuma
create policy rfis_select on public.rfis for select to authenticated
  using (public.has_project_access(project_id) and public.register_can('rfi', 'view'));
-- INSERT/UPDATE/DELETE policy'si yok; eski rfis_insert/_update/_delete policy'leri düşürülür,
-- authenticated'a yalnızca SELECT GRANT'i kalır (G-01 kalıcılaşır).
```

`register_can(p_type, p_action)`:
- SECURITY DEFINER, STABLE, `search_path=public`.
- Rolü `get_my_role()` ile bulur.
- Her yeni fonksiyonda `revoke … from public, anon` yazılır; trigger fonksiyonlarından `authenticated` da çıkarılır.

Dosya erişimi: indirme RPC'si `has_project_access` ve `register_can('document','view')` doğrulamadan depo dosya kimliğini döndürmez.

## 4.4 RPC sözleşmeleri

Ortak kurallar:
- Okuma `get_*`; yazma `save_*`, `create_*` ve eylem fiilleri.
- Hepsi SECURITY DEFINER, `search_path=public`.
- İlk satırda `has_project_access` + `register_can` kontrolü.
- anon/PUBLIC EXECUTE kapalı.
- Kimlik her zaman `auth.uid()`'den alınır.
- Register numarası parametre olarak alınmaz.

**Okuma**

| RPC | Parametreler | Dönüş |
|---|---|---|
| get_my_register_permissions | p_project_id | {role, registers: {rfi: {view, create, edit, approve, delete}, ...}} |
| get_register_overview | p_project_id | Register başına {total, open, pending_approval, overdue} + bekleyen taslak sayısı |
| get_register_list | p_project_id, p_register_type, p_filters jsonb, p_search, p_sort, p_limit 50, p_offset 0 | {items, total}; vw_reg_<tür> view'larından (security_invoker), tür beyaz listeden |
| get_register_detail | p_register_type, p_id | {record, links, documents, revisions, permissions, allowed_status_transitions} |
| get_register_audit | p_register_type, p_id, p_limit 50, p_before | Audit satırları (değişen alanlar) |
| search_register_refs | p_project_id, p_ref_type, p_query, p_limit 10 | [{id, label, sublabel}] |
| get_revision_for_download | p_revision_id (null ise güncel revizyon için p_document_id) | {storage_provider, storage_file_id, file_name, mime_type, size_bytes}; yalnızca gateway çağırır |

**Yazma ve durum geçişi**

| RPC | Kural |
|---|---|
| save_register_record(p_register_type, p_project_id, p_id null, p_data jsonb) | {id, register_no, record_state}. Zorunlu alan, enum, aynı-proje FK doğrulaması; yeni kayıtta numara trigger'dan; yalnızca draft/rejected düzenlenir |
| submit / approve / reject / reopen_register_record | §4.1 tablosu; reject ve reopen'da gerekçe zorunlu; kritik register'da dört göz |
| set_register_status(p_register_type, p_id, p_status, p_note) | Yalnızca register_status_transitions'taki geçişler |
| delete_register_record | Yalnızca draft/rejected |
| link_ / unlink_register_records | Aynı proje şartı (Faz C) |
| add_document_revision(p_document_id, p_meta) | Yeni revizyon; is_current değişiminde önce eskisi false, sonra yenisi true (kısmi unique ertelenemez) |
| admin_correct_task_activity_id(p_task_id, p_new_activity_id, p_reason) | Yalnızca admin; identity_guard'ı kontrollü atlatır, gerekçe ve eski/yeni değer audit'e yazılır (B7) |

**AI taslakları** (Faz B tablo, Faz C RPC):
- list_register_drafts, get_register_draft, update_register_draft.
- approve_register_draft: eşik altındaki her alan `p_reviewed_fields` içinde değilse `review_required` hatası verir. Hedef kayıt approved ve source = ai olarak yazılır.
- reject_register_draft.

**Doküman ve iş kuyruğu:**
- create_document_record: p_dry_run; aynı projede aynı sha256 varsa `duplicate` hatası ve mevcut id döner.
- enqueue_document_job, finish_document_job, save_ai_draft, log_ai_run.

**Servis fonksiyonları:**
- `svc_` öneki; ilk satır `auth.role() = 'service_role'` kontrolü.
- Edge function'daki servis kodunda `.from()` yasaktır.

**Hata kodları:** forbidden, not_found, invalid_state, validation, review_required, duplicate, budget_exceeded.

## 4.5 Edge function ve dosya deposu tasarımı

**Değişmeyen ilke (Karar #1):**
- Kullanıcı dosyaya yalnızca gateway üzerinden ulaşır.
- Gateway kontrol sırası: JWT (401) → girdi (400; boş `project_id` dahil, çünkü `has_project_access(NULL)=true`) → proje erişimi ve register yetkisi (403) → tür/boyut (415/413) → depo yapılandırması (501).
- Veritabanına yalnızca kullanıcı JWT'siyle gidilir.
- Tarayıcıya kalıcı depo bağlantısı verilmez.
- Yükleme sırası:
  1. JWT ve yetki kontrolü.
  2. sha256 hesaplanır.
  3. `create_document_record(dry_run)`.
  4. Depoya yükleme.
  5. Kayıt + revizyon açılır.
  6. `enqueue_document_job`.

  Kayıt açılamazsa yüklenen dosya silinir.
- İzinli türler: pdf, png, jpg, docx, xlsx, dwg (dwg AI'a gitmez).
- Dosya adı: `{register_no}_{revision_no}_{kisa-baslik}.{ext}` (ASCII, en çok 80 karakter).

Mevcut iskelet: `supabase/functions/drive-gateway/`. `handler.ts` (kontrol sırası) sağlayıcıdan bağımsız. Depo
çağrıları `driveClient.ts` arayüzünde; seçilen seçeneğe göre bu dosya ve secret'lar değişir.

### Dosya sağlayıcısı — KARAR BEKLİYOR (seçim yapılmadı)

**A) Supabase Storage + Pro plan (aylık ~25 $, fiyat ve kotalar satın almadan önce doğrulanmalı)**

| Konu | Değişiklik |
|---|---|
| Depo | Yeni private bucket (ör. `proje-dokumanlari`); yol `{project_id}/{document_id}/{revision_no}/{dosya_adı}` |
| Adaptör | `driveClient.ts` yerine `storageClient.ts`. Yükleme gateway'den yapılır; bucket'ta `authenticated` için doğrudan INSERT/UPDATE/DELETE policy'si yazılmaz. İndirme iki yoldan biriyle: gateway akış olarak döndürür ya da yetki kontrolünden sonra kısa ömürlü (ör. 60 sn) signed URL verir. G-02/G-03 dersi: SELECT policy'si yazılırsa yolun ilk klasörü `project_id` olmalı, metadata satırıyla birlikte doğrulanmalı |
| Kimlik | Depo yazımı gateway içinde servis kimliğiyle (Drive'daki servis hesabının karşılığı). Veritabanı yazımı kullanıcı JWT'siyle. service_role anahtarı yalnızca edge function ortamında; frontend'e girmez |
| Senkron | drive-sync gerekmez: depoya yalnızca uygulama yazar. "Gelen kutusu" (elle bırakılan dosya) yok |
| Secret'lar | Otomatik gelen SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY; ek olarak MAX_UPLOAD_BYTES. Google secret'ı yok |
| Artı | Tek sistem; RLS ve yedek aynı yerde; Pro planla günlük otomatik yedek ve daha büyük veritabanı kotası gelir (db:backup sorununu da hafifletir) |
| Eksi | Aylık maliyet; dosyalar Drive gibi elle göz atılamaz (gerekirse dışa aktarım) |

**B) Ayrı (şirket kontrolünde) Gmail hesabında Google Drive, OAuth**

| Konu | Değişiklik |
|---|---|
| Neden servis hesabı değil | Servis hesaplarının kendi Drive depolama kotası yok, yalnızca Shared Drive'a yazabilir. Shared Drive ise Workspace gerektirir. Kişisel hesapta servis hesabı kullanılamaz (kurulumda doğrulanmalı) |
| Adaptör | `driveClient.ts`: servis hesabı JWT'si yerine OAuth refresh token ile erişim token'ı alınır (`grant_type=refresh_token`). Dosyalar hesabın "Drive'ım" altındaki bir kök klasörde açılır; `supportsAllDrives`/`driveId` parametreleri kaldırılır. Klasör kimlikleri project_drive_folders'ta tutulur |
| Kapsam | `drive.file`: uygulama yalnızca kendi oluşturduğu dosyaları görür. Elle Drive'a bırakılan dosyaları göremez. Bu yüzden "Gelen kutusu" ve drive-sync yalnızca uygulamanın yüklediği dosyalar için çalışır (çöpe atılma/taşınma takibi). Tüm Drive'ı okumak `drive` kapsamı ister, o da kısıtlı kapsamdır ve Google güvenlik değerlendirmesi gerektirir |
| Yayın durumu | OAuth uygulaması "Testing"de kalırsa refresh token 7 günde geçersiz olur; **"In production"a alınmalı**. drive.file hassas olmayan bir kapsam olduğundan doğrulama gerektirmemesi beklenir (kurulumda doğrulanmalı) |
| Senkron | drive-sync (changes.list) yalnızca uygulamanın dosyaları için; pg_net yok, tetikleme zamanlanmış edge function ile |
| Secret'lar | GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN, DRIVE_ROOT_FOLDER_ID, MAX_UPLOAD_BYTES, SYNC_SECRET (drive-sync varsa). Hiçbiri VITE_ önekli değildir, hiçbiri repoda bulunmaz |
| Artı | Ücretsiz (15 GB; Gmail ve Fotoğraflar'la paylaşımlı); dosyalar Drive'da görülebilir |
| Eksi | Tek hesaba bağımlılık (parola değişince ya da güvenlik olayında token iptal olur, sistem dosyaya erişemez); kota paylaşımlı; drive.file kısıtı; ikinci bir yetki sistemi (hesabın kendisi) korunmalı |

v2'deki "servis hesabı + Shared Drive" seçeneği yalnızca Google Workspace varsa geçerlidir. Workspace yönetici yetkisi
alınırsa üçüncü seçenek olarak geri gelir; secret'ları GOOGLE_SERVICE_ACCOUNT_JSON, DRIVE_SHARED_DRIVE_ID.

**Ortak secret'lar (iki seçenekte de):** MAX_UPLOAD_BYTES (varsayılan 25 MiB, sınır betiğiyle ayarlanır), ileride AI_PROVIDER, AI_API_KEY.

**process-document** (Faz C; kullanıcı JWT'siyle, ilerleme document_jobs + realtime):

| Adım | İş | Çıktı |
|---|---|---|
| 1 | İşi al: status = running, attempts + 1 (en çok 3) | Job |
| 2 | Dosyayı depodan indir (gateway'in adaptörüyle) | Bayt akışı (bellekte) |
| 3 | Metin çıkar (metin katmanı; az metinli sayfalar görüntü olarak) | **Bellekte**; kalıcı yazılmaz |
| 4 | Sınıflandır (hızlı model) | documents/revizyon boş alanları |
| 5 | Şema varsa çıkar, alıntıları doğrula, eşleştir | save_ai_draft |
| 6 | Her çağrı log_ai_run; iş finish_document_job ile kapanır | ai_runs |

Kapatma anahtarı: `ai_settings.enabled = false` iken iş skipped olur, manuel akış etkilenmez.

## 4.6 AI tasarımı

**İlkeler:**
- Şemalı JSON, sıcaklık 0.
- Her alan `{value, confidence, source: {page, quote}}` biçiminde döner; belgede olmayan alan null gelir.
- Çıkarım çağrısında araç (tool) yok.
- Belge metni veridir, talimat değildir.
- Prompt ve şemalar sürümlüdür: `scripts/proje-kontrol/ai-olcum/prompts/rfi_v1.md` ve `schemas/rfi_v1.json`. Faz C'de process-document'a taşınır.

**RFI çıkarım şeması (rfi_v1)** — canlı kolonlara eşlenir:

| Alan | Hedef | Eşleştirme |
|---|---|---|
| subject, question | rfis.subject, rfis.question | Zorunlu |
| raised_by_party | rfis.raised_by_party (Faz C'de eklenirse) | contractor, owner, subcontractor, engineer; emin değilse null |
| raised_at, due_date | rfis.raised_date, due_date | Belgede açıkça yoksa null |
| drawing_no | rfis.drawing_id | Belgedeki çizim no `documents.document_no` (DRW-…) ile birebir; olmazsa null + en çok 3 aday |
| task_code | rfis.task_id | project_tasks.task_code veya activity_id ile birebir; olmazsa null |
| area_code, wbs_code | rfis.area_id, wbs_id | project_areas.area_code, project_wbs.wbs_code ile birebir |
| contract_ref, schedule_impact_days | Faz C'de eklenirse | Yalnızca belgede yazılıysa |
| priority | rfis.priority | Yalnızca öneri (low, medium, high, critical) |

**Alıntı doğrulaması:** Alıntı belge metninde bulunmazsa alanın güveni en çok 0,3 olur ve alan `quote_not_found` ile işaretlenir. Belge metni bu kontrol sırasında bellektedir.

**Güven eşikleri:** Başlangıç yeşil ≥ 0,9, sarı 0,7-0,9, kırmızı < 0,7. Ölçümden sonra `ai_settings.thresholds` içinde kalibre edilir.

**Hiç doldurulmayan alanlar:** status, priority=critical, tutarlar, ihbar tarihleri, onay alanları.

**Veri tabloları** (B6):

| Tablo | Kolonlar |
|---|---|
| ai_runs | id, project_id, run_type (classify, extract, agent), agent_name, document_id, revision_id, job_id, user_id, provider, model, prompt_version, input_tokens, output_tokens, cost_estimate, duration_ms, status (ok, error, timeout, rejected), error (kısa), created_at. **Belge içeriği saklanmaz** |
| ai_settings | project_id (null = genel), enabled, monthly_token_cap, max_pages, min_text_chars, thresholds jsonb, provider, model_fast, model_strong |
| ai_findings (Faz E) | project_id, agent_name, finding_type, severity, title, detail jsonb, related_type, related_id, status, run_id |

**Ölçüm protokolü (Faz B sonu):**
- 10-15 doküman, aynı şema, iki sağlayıcı.
- Metrikler: alan bazında doğruluk, doğru boş bırakma, hatalı doldurma, **yüksek güvenle yanlış**, süre, maliyet.
- Seçim: yüksek güvenle yanlışı en az olan; eşitlikte maliyeti düşük olan.
- Betik: `scripts/proje-kontrol/ai-olcum/run.mjs`; gizlilik kapısı `AI_OLCUM_GIZLILIK_ONAYI=evet`.

**Agent'lar (Faz E):**
- Reconciliation: register ↔ depo farkı.
- Planning: geciken aktiviteler (`vw_delayed_tasks`, baseline/forecast sapması) ve onlara bağlı açık RFI/Submittal/Material.

  `is_critical` kolonu kaldırıldığı için kritik yol bilgisi kullanılmaz.
- Kimlik: Karar #7.

## 4.7 Frontend tasarımı

Arayüz Türkçe, kod İngilizce. Her ekran dört durumu ele alır: yükleniyor, boş, hata, yetkisiz. Mobilde kart listesi
kullanılır (invoice-mobile-list deseni).

**Giriş noktaları** (frontend-tasarim-notu.md):
- admin ve proje_yoneticisi: `/dashboard/projeler/{id}/kontrol` (ProjeDetay sekmesi).
- santiye_sefi ve muhasebe: `/dashboard/kontrol` (üst seviye sekme).

  Bunun için `role_allowed_tabs` + `role_sidebar_items` satırları ve Sidebar.jsx girdisi gerekir. ProjeDetay iç
  sekmelerinin rol bazlı yetki mekanizması yok; görünürlük `get_my_register_permissions`'tan gelir.

**Ekranlar:**

| # | Ekran | URL | İçerik |
|---|---|---|---|
| 1 | Kabuk | …/kontrol | Sol menü: Dokümanlar (Document, Drawing), Teknik (RFI, Submittal, Material Approval), Yönetim (Action, Decision, Risk), Ticari (Change, Claim, Procurement, Subcontractor, Payment). Rozetler: bekleyen onay, geciken |
| 2 | RegisterList | ?register=rfi | Arama, filtre, sunucu taraflı sayfalama (50), "Yeni" / "Dosyadan oluştur" |
| 3 | RegisterDetail | ?register=rfi&kayit={uuid} | Sağ panel; sekmeler Genel, Dokümanlar, İlişkiler, AI Analiz (Faz D), Geçmiş (değişen alanlar) |
| 4 | Kayıt formu | Detay içinde | formSections config'inden; "Kaydet" taslak, "Onaya gönder" ayrı |
| 5 | Dosyadan oluştur | ?register=rfi&sihirbaz=dosya | Yükle → işleme (realtime) → inceleme (PDF önizleme + alanlar) → onay |
| 6 | Onay kutusu | ?register=_onay | AI taslakları ve onay bekleyen kayıtlar; toplu onay yok |
| 7 | Document / Drawing | ?register=document, drawing | Liste + yükleme; revizyon listesi (`document_revisions`, güncel işaretli) |
| 8 | Register ayarları | Proje Yönetimi (admin) | Proje kodu (prefix), WBS ve Alan yönetimi (doğrudan yazma), register_permissions matrisi, AI ayarları; Drive seçilirse "klasörleri oluştur" |

**Bileşenler:** `src/components/proje-kontrol/`:
- ProjeKontrolTab, RegisterNav, RegisterList, RegisterDetail.
- RecordForm, DocumentsPanel, RevisionList, DocumentUpload.
- LinksPanel, AuditPanel, DraftWizard, ApprovalInbox, RegisterSettings.

**Hook'lar:**
- useRegisterPermissions, useRegisterList, useRegisterRecord, useRegisterDraft, useDocumentJob.
- useRealtimeRefresh: ilgili tablolar yayına eklenince.
- Seçim `useUrlSyncedSelection` ile; çoklu parametre için `syncEntityParams`.

**registerConfig.js** (alan adları canlı kolonlarla):

```js
export const rfiConfig = {
  key: 'rfi', label: 'RFI', group: 'teknik', critical: false,
  supportsDraftFromFile: true, aiSchema: 'rfi_v1',
  listColumns: [
    { key: 'register_no', label: 'No', type: 'text', sortable: true }, // view'da rfi_no as register_no
    { key: 'subject', label: 'Konu', type: 'text' },
    { key: 'area_code', label: 'Alan', type: 'text' },
    { key: 'status', label: 'Durum', type: 'enum', enum: 'rfiStatus' },
    { key: 'due_date', label: 'Termin', type: 'date', sortable: true, overdueWhenStatus: ['open', 'under_review'] },
    { key: 'record_state', label: 'Kayıt', type: 'recordState' },
  ],
  formSections: [{ title: 'Genel', fields: [
    { key: 'subject', label: 'Konu', type: 'text', required: true },
    { key: 'question', label: 'Soru', type: 'textarea', required: true },
    { key: 'drawing_id', label: 'İlgili çizim', type: 'ref', ref: 'drawing' },
    { key: 'task_id', label: 'Aktivite', type: 'ref', ref: 'task' },
  ] }],
  lockedWhenApproved: ['subject', 'question', 'raised_date', 'drawing_id'],
};
```

**Türkçe etiketler:**

| Alan | Değer → etiket |
|---|---|
| record_state | draft → Taslak, pending_approval → Onay bekliyor, approved → Onaylı, rejected → Reddedildi |
| RFI status | open → Açık, under_review → İncelemede, answered → Cevaplandı, closed → Kapalı, rejected → Reddedildi |
| Action status | open → Açık, in_progress → Devam ediyor, done → Tamamlandı, cancelled → İptal |
| revision_status | ifr → İnceleme için (IFR), ifa → Onay için (IFA), ifc → Uygulama için (IFC), as_built → As-Built |
| priority | low → Düşük, medium → Orta, high → Yüksek, critical → Kritik |
| source | manual → Elle, ai → AI, import → Aktarım |

**Bildirimler (Faz C):**
- notifications'a `meta` alanı ve `register_record` / `register_draft` entity türleri eklenir.
- Derin bağlantı `?register=&kayit=` biçimindedir.
- Alıcı rolün ilgili ekrana gerçekten erişebildiği doğrulanmalı (CLAUDE.md kuralı). Bu yüzden santiye_sefi ve muhasebe bildirimleri üst seviye `kontrol` sekmesine gider.

## 4.8 Migration listesi

Durum, canlı şemaya göre (07.10.2026; değerlendirme `canli-sema-ozeti.md` §7). **yapıldı** = canlıda; **kısmen** =
tablo var, eksik parça §4.10'da; **yapılmadı**; **gereksiz** = kararla düştü.

| # | v2 adı | v2 içeriği | Durum | Canlıdaki karşılık / kalan |
|---|---|---|---|---|
| M01 | register_wbs_areas | wbs, areas, project_tasks bağları | **yapıldı** | `20261005103850_faz1_wbs_alan_activity` (project_wbs, project_areas, area_wbs, activity_id, baseline_*) |
| M02 | register_audit_infra | register_audit, trigger | **yapılmadı** | Yalnızca register_status_history; B3'te "değişen alanlar" audit'i |
| M03 | register_permissions | register_permissions, register_can, transitions | **yapılmadı** | B2 |
| M04 | register_numbering | settings, counters, next_register_no | **yapıldı** | `20261005125957` + `20261007072501` (biçim, kırpma, proje kodu) |
| M05 | documents_core | documents, document_texts, drive tabloları, view, RPC, realtime | **kısmen** | documents + document_revisions var; document_texts **gereksiz** (depolama kararı); view/RPC/realtime B4-B5; drive tabloları yalnızca B seçeneğinde |
| M06 | registers_drawings_rfis_links | drawings, rfis, register_links, view | **kısmen** | drawings, rfis var; register_links ve view'lar Faz C |
| M07 | ai_runs_jobs_drafts | document_jobs, ai_settings, ai_runs, register_drafts | **yapılmadı** | B6 |
| M08 | register_write_rpcs | yazma RPC'leri, geçiş seed'i | **yapılmadı** | B4 (G-01 kalıcı) |
| M09 | register_draft_rpcs | taslak ve iş RPC'leri | **yapılmadı** | Faz C (tablolar B6) |
| M10 | notifications_register_support | meta, entity_type | **yapılmadı** | Faz C |
| M11 | tickets_register_columns | tickets'a register_no | **gereksiz** | Action ayrı tablo (`project_actions`) |
| M12 | submittals_material_approvals | iki tablo | **kısmen** | Tablolar var (05.10); view, geçiş seed'i, eksik alanlar Faz D |
| M13 | changes_claims | iki tablo | **yapılmadı** | Faz D |
| M14 | project_risks_register_extension | ek kolonlar, source | **kısmen** | wbs/area/task/rfi/action/decision kFK var; register_no, onay, source Faz D |
| M15 | suppliers_type_and_links | supplier_type | **yapılmadı** | Faz D; ad `party_type` (supplier_type dolu) |
| M16 | interfaces_decisions | iki tablo | **kısmen** | decisions var; interfaces Faz E |
| M17 | agent_infra | ai_findings, svc_agent_* | **yapılmadı** | Faz E |
| M18 | register_bridge_views | köprü view'ları | **yapılmadı** | Faz D-E |
| — | (v2'de yoktu) uyum migration'ı | project_actions, numara, revizyon, is_critical | **yapıldı** | `20261007072501_uyum_project_control_registers` |
| — | (v2'de yoktu) G-01, G-02/G-03 | güvenlik | **yapıldı** | `20261007063808`, `20261007063825` |

**Her migration'ın kontrol listesi:**
- [ ] Her FK kolonuna indeks.
- [ ] RLS açık, SELECT policy var, register tablolarında yazma policy'si yok.
- [ ] Yeni tablo ve fonksiyonda açık REVOKE (`pg_default_acl` notu).
- [ ] CHECK'ler bu dosyayla aynı.
- [ ] Seed'ler `on conflict do nothing`.
- [ ] Realtime eklemesi yapıldı.
- [ ] Pozitif ve negatif RLS testi yazıldı.
- [ ] CLAUDE.md güncellendi.
- [ ] Önce anlık görüntü / db:backup alındı.

**Geri alış:**
- Veri yoksa ters migration.
- Veri varsa nesne kullanılmaz bırakılır ve ileri düzeltme yazılır.
- Uyum migration'ının geri alınması için `taslak-sql/uyum_migration_taslak.sql` BÖLÜM B ve `yedek-uyum-07-10.sql` kullanılır.

## 4.9 Test matrisi ve açık noktalar

**Mevcut testler (07.10.2026):**
- `proje-kontrol-guvenlik.spec.js` 8.
- `proje-kontrol-master-veri.spec.js` 9.
- `proje-kontrol-uyum.spec.js` 7 + 3 fixme.
- `supabase/functions/drive-gateway/handler.test.ts` 28.
- `taslak-sql/uyum_migration_dogrulama.sql`: kendini geri alan SQL doğrulaması.

**Hedef matris:**

| ID | Alan | Senaryo | Beklenen | Durum |
|---|---|---|---|---|
| T01 | RLS | anon her yeni tabloyu okur | Sonuç yok | Var (uyum spec) |
| T02 | RLS | Başka projenin santiye_sefi'si okur | 0 satır | Fikstür gerektirir (B4 sonrası RPC ile) |
| T03 | RLS | can_view=false rol (muhasebe → rfi) okur | 0 satır | B2 |
| T04 | RLS | authenticated doğrudan INSERT/UPDATE/DELETE | Reddedilir | Var (uyum spec) |
| T05 | RPC | Yazma RPC'lerini anon çağırır | Yetki hatası | B4 |
| T06 | RPC | Yetkisiz rol create/approve | forbidden | B4 |
| T07 | Numaralama | 20 eşzamanlı save_register_record | 20 benzersiz, ardışık | fixme (B4) |
| T08 | Numaralama | Geri alınan işlem | Numara tüketilmez | Var (SQL doğrulama) |
| T08b | Numaralama | 1/9/10/999/1000/1001/10000. kayıt | Kırpma yok | Var (SQL doğrulama) |
| T09-T11 | Durum | Geçersiz geçiş, dört göz, kilitli alan | invalid_state / forbidden | B4 |
| T12 | Audit | Değişiklik audit üretir, yalnızca değişen alanlar; audit UPDATE/DELETE reddedilir | | B3 |
| T13-T15 | Taslak | review_required, superseded, source=ai | | Faz C |
| T16-T19 | Gateway | 401/403, 409 tekrar, 415/413, telafi silme | | Birim testi var; uçtan uca sağlayıcı sonrası |
| T20 | Sync | Çöpe atma/taşınma | trashed/missing | Yalnızca B seçeneği |
| T21-T24 | AI | Alıntı yok, enjeksiyon, kapatma anahtarı, bütçe | | Faz C |
| T25 | Bildirim | Taslak bildirimi doğru rollere | | Faz C |
| T26-T28 | Frontend | 4 rol × ekran, URL yenileme, 390 px | | Faz B-C |
| T29 | Regresyon | Tam set | Yeşil | Var (121; 118 geçiyor + 3 fixme) |
| T30 | Revizyon | İkinci is_current reddi; çizim yalnızca çizim türü dokümana | | Var (SQL doğrulama); Playwright fixme |

**Açık noktalar:**
1. Dosya sağlayıcısı (§4.5).
2. Karar #4 yetki matrisi.
3. Dört göz kuralı küçük ekipte kilitlenebilir; `four_eyes_enabled` ayarı önerisi.
4. Taranmış PDF'te alıntı doğrulaması görüntü transkriptiyle yapılır; transkript kalıcı saklanmaz, yalnızca taslaktaki kısa alıntı kalır.
5. Altyapı sınırları: depo yükleme süresi ve boyutu, edge function süre ve bellek, Deno'da PDF metin kütüphanesi.
6. register_status_history ile register_audit'in birlikte mi kalacağı (B3).
7. db:backup.
8. Gizlilik: ai_runs içerik saklamaz; sağlayıcının veri saklama politikası sözleşme kontrolünde doğrulanır.

## 4.10 Faz B kalan iş paketleri

Sıra bağımlılığa göredir. Her paket ayrı migration, SQL onayıyla uygulanır, ROLLBACK'li denemeyle doğrulanır.

| # | Paket | İçerik | Bağımlılık | Kabul |
|---|---|---|---|---|
| B1 | Hijyen | **G-13:** project_wbs, project_areas, area_wbs'ten `authenticated`'ın TRUNCATE/REFERENCES/TRIGGER yetkisi geri çekilir. **FK indeksleri:** register'lar arası kFK'ler (rfis.drawing_id/document_id/decision_id, project_actions.rfi_id/risk_id/decision_id, decisions.rfi_id/risk_id, technical_submittals.document_id, material_approvals.document_id/technical_submittal_id) ile kişi/tedarikçi FK'leri (created_by, assigned_to, raised_by, reviewer_id, supplier_id). **Ortak kolonlar** (§4.1): record_state, source, approved_*, created_by eksikleri, source_document_id, discipline CHECK | — | Advisor'da indekssiz FK yok; yetki sorgusu temiz |
| B2 | Yetki | register_permissions + 4 rol seed'i (Karar #4); register_can(); get_my_register_permissions; register_status_transitions + seed; SELECT policy'leri `has_project_access AND register_can(type,'view')` olarak değişir | B1, Karar #4 | T03; muhasebe yetkisiz register'ı göremiyor |
| B3 | Audit | register_audit (yalnızca değişen alanlar, `changed jsonb`), fn_register_audit trigger'ı register tablolarına; UPDATE/DELETE yetkisi yok | B1 | T12; satır boyu ölçülür (büyük metin kısaltma) |
| B4 | Yazma RPC'leri | save/submit/approve/reject/reopen/set_status/delete_register_record, add_document_revision. **G-01 kalıcılaşır:** register tablolarındaki `*_insert/_update/_delete` policy'leri düşürülür, `can_write/can_manage_project_control` kullanılmıyorsa kaldırılır; GRANT'ler yalnızca SELECT kalır. RPC'ler `*_no` almaz | B2, B3 | T04-T07, T09-T11; 20 eşzamanlı numara testi (fixme açılır) |
| B5 | Dosya akışı | Seçilen sağlayıcıya göre gateway adaptörü (§4.5), get_revision_for_download, create_document_record; dosya alanları `document_revisions`'ta var. Seçime göre: A → bucket + yol kuralı; B → project_drive_folders, drive_sync_state | Sağlayıcı kararı, B4 | T16-T19 uçtan uca; yetkisiz kullanıcı dosya alamıyor |
| B6 | AI altyapısı | register_drafts, document_jobs, ai_runs, ai_settings (tablolar + RLS; RPC'ler Faz C) | B1 | Tablolar boş, RLS testleri |
| B7 | Düzeltmeler | **G-04:** storage silme/yükleme sahiplik ve rol kontrolü (saha-fotolari, ticket-ekleri). **G-12:** YeniTicketModal ek yükleme hatasını kullanıcıya gösterir. **identity_guard:** yalnızca-admin `admin_correct_task_activity_id` RPC'si (gerekçe zorunlu, audit'e yazılır) | B3 (audit için) | G-04/G-12 testleri; RPC yalnızca admin |
| B8 | Frontend iskeleti | RegisterList/RegisterDetail, ortak rozetler, AuditPanel; Proje Kontrol sekmesi yalnızca admin'e | B4 | Ekran testleri |
| B9 | Ölçüm | Sağlayıcı ölçümü (gizlilik iznine göre kapsam) | Ölçüm seti, Karar #5 | Ölçüm raporu |

Faz B'nin eski M01/M04 işleri bittiği için B1-B4 ilk iki haftaya sığar. B5 sağlayıcı kararına, B9 ölçüm setine bağlı.
