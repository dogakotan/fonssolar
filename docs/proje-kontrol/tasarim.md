# Proje Kontrol: tasarım (v3) — Claude Code için kaynak dosya

> Bu dosya önceki tasarım sürümlerinin ve `FONS_Diyarbakir_Sistem_Revizyon_Yol_Haritasi.docx` dosyasının YERİNE geçer. Çelişirse bu dosya geçerlidir; yalnızca kolon düzeyindeki canlı şema konusunda `docs/proje-kontrol/canli-sema-ozeti.md` geçerlidir (canlı veritabanı tasarımdan önce gelir, fark bulursan bu dosyayı düzelt).
> v3 farkları: dosya deposu Supabase Storage'dır (Fons içi klasörlü dosya gezgini); Google Drive ve SharePoint YOKTUR (şirkette Microsoft 365 ve Google Workspace yok). Canlı şema 07.10.2026 itibarıyla esas alınmıştır. Karar 0-4 onaylanmış ve uygulanmıştır; Karar 5 (dosya deposu ve Supabase Pro planı) patron onayı beklemektedir.
> Diyagramlar yalnızca Word sürümünde görsel olarak yer alır; içerikleri metinde de anlatılmıştır.

# Bölüm 1 · Yol haritası

## Özet

Hedef: 1 Ocak 2027 saha mobilizasyonunda Document, Drawing, RFI ve Action register'ları Supabase + AI ile uçtan uca çalışıyor olsun; kalan register'lar mobilizasyondan sonra aynı iskelete eklensin. Kayıtlar veritabanında, dosyalar Supabase Storage'da tutulur ve kullanıcı bunlara Fons içindeki klasörlü bir dosya gezgininden ulaşır.

Beş ilke:

1. Supabase tek kayıt ve dosya kaynağıdır: kayıtlar veritabanında, dosyalar özel bir Storage bucket'ında. Excel yalnızca şablon, import ve export.
2. Ekle, bozma. Satın alma, finans, günlük rapor, ticket ve risk modülleri çalışmaya devam eder; ortak olanlar genişletilir, kopyalanmaz.
3. Dikey dilim. Her faz sonunda kullanıcının gerçekten kullanabildiği bir özellik çıkar.
4. AI taslak üretir, yetkili kişi onaylar. Onay akışı ve audit çekirdekte baştan vardır.
5. Register'lar projeden bağımsızdır. Diyarbakır ilk kullanıcıdır; aynı yapı sonraki projelerde proje kodu tanımlanarak açılır.

Önceki sürümlerden farklar:

| Konu | v1 | v3 |
|---|---|---|
| Yapı | 12 faz, sıralı | 5 faz, dikey dilim, takvimli |
| Güvenlik | Baştan yeniden yap | Mevcut durumu testle doğrula, açıkları kapat (yapıldı) |
| Dosya kaynağı | Supabase Storage, SharePoint ileride | Supabase Storage, Fons içi klasörlü dosya gezgini; SharePoint ve Google Drive kullanılmıyor (şirkette Microsoft 365 ve Google Workspace yok) |
| AI | Önce embedding ve vektör arama | Önce yapılandırılmış çıkarım; embedding yalnızca arama için, sonra |
| Onay ve audit | Faz 10 | Faz B, çekirdek |
| Kapsam | 16 register birden | Pilotta 4 register (Action ayrı tabloda), hazır tablolara köprü, kalanlar sonra |
| Action | Ticket'ın genişletilmesi | Ayrı tablo (project_actions); ticket sahadan bildirim olarak kalır |

## Güncel durum (7 Ekim 2026)

Yapılanlar:

- Canlı veritabanındaki 05.10 şeması (WBS/Alan tabloları ve 7 register tablosu) incelendi, tasarımla hizalandı: project_actions, document_revisions (tek doküman, çok revizyon), project_register_settings (proje kodları ADN1, ADN2, TIZ, TKY), kırpmayan numaralama, is_critical kaldırıldı.
- Güvenlik: G-01 (register tablolarına doğrudan yazma kapatıldı), G-02 ve G-03 (başka projenin fotoğraf ve ek dosyalarının indirilebilmesi) kapatıldı. Tam Playwright seti 118/118 geçti.
- Sistem dokümantasyonu ve CLAUDE.md güncellendi.

Açık kalanlar: yazma RPC'leri ve yetki tablosu (Faz B), doküman deposu ve klasörlü gezgin (Faz B-C), G-04, G-12, G-13, FK indeksleri, tam şema yedeği, İsdemir OYAK izni, AI ölçüm seti, patron onayı (dosya deposu ve Supabase Pro planı).

## Sistem değişiklikleri

Mevcut hiçbir tablo, RPC veya ekran silinmiyor ya da yeniden adlandırılmıyor (07.10 uyum migration'ı dünkü boş register tablolarını hizalamıştır). Katman katman durum:

| Katman | Durum | Değişiklik |
|---|---|---|
| Veritabanı | Canlıda: project_wbs, project_areas, area_wbs, documents, document_revisions, drawings, rfis, project_actions, decisions, technical_submittals, material_approvals, register_status_history, project_register_counters, project_register_settings (hepsi boş, yazma kapalı) | Faz B-C'de eklenecek: register_permissions, register_audit (yalnızca değişen alanlar), register_drafts, ai_runs, ai_settings, document_jobs; sonra Change, Claim, Interface. FK kolonlarına indeks |
| Dosya | Supabase Storage: günlük rapor fotoğrafları ve ticket ekleri (private bucket'lar) | Yeni özel bucket'ta proje dokümanları; klasör ağacı arayüzde doküman kayıtlarından üretilir. Fotoğraf ve ticket ekleri yerinde kalır |
| Edge function | Canlıda 4 adet: create-user, export-project-excel, import-project-excel, manage-user (agent-chat repoda var ama deploy edilmemiş, G-09) | Yeni: yalnızca process-document (AI taslağı). Dosya erişimi için ayrı bir function gerekmez |
| Yetki | 4 rol; sekme erişimi roles ve role_allowed_tabs tablolarından | Aynı 4 rol; register × eylem yetkisi register_permissions'ta; agent'lar için ayrı, proje kapsamlı roller (Faz E) |
| Frontend | ProjeDetay sekmeleri, tek /dashboard/* route'u; şantiye şefi ve muhasebe rollerinin "Projeler" sekmesi yok | "Proje Kontrol" grubu; şantiye şefi için ayrı üst seviye giriş (kararı Faz B'de); config tabanlı RegisterList ve RegisterDetail; klasörlü dosya gezgini; onay kutusu |
| AI | agent-chat: Gemini proxy, istemciden gelen prompt, tool yok | agent-chat aynı kalır. Yeni yol: doküman, yapılandırılmış çıkarım, register_drafts'ta taslak, onay; güven skoru, kaynak gösterimi, ai_runs. Sağlayıcı Faz B sonunda ölçümle seçilir (ChatGPT dahil), anahtarlar yalnızca edge function secret'ında |
| Planlama | project_tasks (+ wbs, alan, activity_id, baseline kolonları, identity_guard trigger'ı), progress_daily | Activity ID kuralı canlıda; Faz B'de yalnızca admin'in kullanabildiği düzeltme RPC'si |
| Test ve doküman | 118 Playwright testi (3 test Faz B yazma yolunu bekliyor) | Her fazda yeni RLS ve akış testleri; her migration SQL onayıyla uygulanır; CLAUDE.md her fazda güncellenir |

## Kararlar ve durumları

Faz B'nin şeması bu kararlara dayanır.

| # | Karar | Durum ve içerik |
|---|---|---|
| 0 | Dünkü (05.10) canlı şema | ONAYLANDI ve UYGULANDI (07.10): korunup tasarıma hizalandı |
| 1 | Action | ONAYLANDI: ayrı tablo project_actions; ticket sahadan bildirim olarak kalır |
| 2 | Numara biçimi | ONAYLANDI: {TÜR}-{PROJE_KODU}-{SIRA}, örnek RFI-ADN1-0007; yıl ve disiplin kodda yok; sıra kırpılmaz |
| 3 | Revizyon | ONAYLANDI: tek doküman, çok revizyon (document_revisions), her dokümanın tek güncel revizyonu |
| 4 | Submittal ve Material Approval | ONAYLANDI: iki ayrı tablo (technical_submittals, material_approvals) |
| 5 | Dosya deposu | KARAR VERİLDİ, PATRON ONAYI BEKLİYOR: dosyalar Supabase Storage'da özel bucket'ta, Fons içinde klasörlü gezgin. Supabase Pro planına geçiş (aylık 25 $ sabit) önerilir |
| 6 | Roller | Mevcut 4 rolü koru, register bazında yetki tablosu (register_permissions) ekle |
| 7 | AI sağlayıcı ve gizlilik | AÇIK: önce İsdemir OYAK dokümanlarının harici modele gönderilmesi için onay; sağlayıcı Faz B sonunda 10-15 gerçek dokümanla iki sağlayıcıyı (ChatGPT dahil) ölçerek seçilir |
| 8 | NCR ve Inspection | Pilotta yok, aksiyon kaynak listesinden çıkarıldı; mobilizasyondan sonra ele alınır |
| 9 | Agent kimliği ve ilk agent'lar | Her agent için ayrı, proje kapsamlı rol; yalnızca izinli RPC'ler; başlangıçta yalnızca Reconciliation ve Planning (Faz E) |
| 10 | Dört göz kuralı | AÇIK: kritik register'larda (risk, change, claim, decision) onaylayan hazırlayandan farklı olmalı; küçük ekipte kilitlenirse project_register_settings'te proje bazlı kapatılır |

Bu sayfadaki tarihler tahmindir; ekip kapasitesi netleşince Faz C ve D süreleri orantılı kayar.

## Hedef mimari

(Diyagram: Hedef mimari: kayıt ve dosya Supabase'de, AI yalnızca taslak yazar; yalnızca Word sürümünde görsel)

Kullanıcı dosyaya yalnızca Fons arayüzünden ulaşır; her açışta proje ve register yetkisi veritabanı kurallarıyla kontrol edilir ve tarayıcıya süreli imzalı adres verilir. AI çıktısı register_drafts tablosuna taslak olarak yazılır; onay verilmeden gerçek kayıt oluşmaz. Excel yalnızca giriş ve çıkış kapısıdır.

## Fazlar ve takvim

Faz A-D 28 Aralık'ta biter, 1 Ocak mobilizasyonuna 4 gün tampon kalır; pilot (Faz C) 7 Aralık'ta kullanıma hazır olur. Faz A'nın şema ve güvenlik işleri 7 Ekim'de tamamlandı. Faz E mobilizasyondan sonra başlar.

(Diyagram: Faz takvimi: pilot 7 Aralık'ta hazır, Faz D mobilizasyondan 4 gün önce biter; yalnızca Word sürümünde görsel)

| Faz | Kullanıcının eline geçen |
|---|---|
| A · Zemin ve kararlar | Kararlar, hizalanmış canlı şema, kapatılmış güvenlik açıkları (büyük kısmı yapıldı); AI ölçüm seti ve izin soruları açık |
| B · Çekirdek | Yetki, audit, yazma fonksiyonları, doküman deposu ve yükleme akışı, register iskeleti |
| C · Pilot dilim | Document (klasörlü gezgin), Drawing, RFI, Action: dosyadan taslak, onay |
| D · İkinci dilim | Risk, Change, Claim, Submittal, Material Approval, Decision ekranları; Procurement ve Subcontractor köprüleri |
| E · Mobilizasyon sonrası | Reconciliation, agent'lar, proje sağlığı dashboard'u, kalan register'lar, Excel import sihirbazı |

## Faz faz değişiklik planı

Her faz kendi migration grubuyla ayrı çıkar ve çıkış kapısı geçilmeden sonraki faz başlamaz. Mevcut akışlar yeni nesnelere bağımlı olmadığı için geri dönüş ucuzdur. İş paketlerinin ayrıntısı aşağıdaki Backend ve Frontend bölümlerinde.

| Faz | Ne değişir | Dokunulmaz ve geri dönüş | Çıkış kapısı |
|---|---|---|---|
| A · Zemin ve kararlar | YAPILDI: şema doğrulama, G-01/G-02/G-03, uyum migration'ı, canlı şema özeti. AÇIK: AI ölçüm seti, İsdemir OYAK izni, patron onayı, tam yedek | Canlı akışlar korunur; her değişiklik geri alma SQL'iyle birlikte uygulandı | Yetkisiz kullanıcı başka projenin dosyasını göremiyor (sağlandı); kararlar yazılı; patron onayı alınmış |
| B · Çekirdek | register_permissions, audit (yalnızca değişen alanlar), yazma RPC'leri (G-01'i kalıcı kurala çevirir), doküman deposu (bucket, politikalar, yükleme RPC'leri), list/detail RPC'leri, FK indeksleri, G-04, G-12, G-13, identity_guard düzeltme RPC'si, RegisterList ve RegisterDetail iskeleti | Mevcut ekranlar ve RPC'ler yeni nesnelere bağlı değil; sorun çıkarsa yeni nesne kullanılmaz bırakılır, düzeltme migration'ı yazılır | Numara çakışmıyor; 4 rolle onay matrisi çalışıyor; yükleme ve yetkisiz erişim testleri yeşil; mevcut testlerin regresyonu yeşil; sağlayıcı ölçümü sonuçlanmış |
| C · Pilot dilim | Sağlayıcı seçilir. register_drafts, document_jobs, ai_runs, ai_settings; process-document; Document (klasörlü gezgin), Drawing, RFI, Action ekranları; onay kutusu | Ticket'ın mevcut akışı aynı çalışır. process-document bir ayarla kapatılabilir, manuel RFI girişi çalışmaya devam eder | Geçmiş bir projenin gerçek RFI PDF'inden taslak çıkıyor, onaylanıyor, audit'te görünüyor; başka projenin kullanıcısı göremiyor |
| D · İkinci dilim | Submittal, Material Approval, Decision ekranları; Change, Claim tabloları; Risk taslağı ve onayı; Procurement ve Subcontractor köprüleri; AI Analiz paneli | Satın alma ve finans akışlarına yazma yok, yalnızca okuma bağları | Risk taslağı onaysız kesinleşmiyor; mevcut satın alma ve finans testleri yeşil |
| E · Mobilizasyon sonrası | Reconciliation ve Planning agent'ları; agent rolleri; pg_cron ve iş kuyruğu; ai_findings; proje sağlığı dashboard'u; kalan register'lar; Excel import sihirbazı; gerekirse pgvector | Mevcut sohbet agent'ları ve agent-chat değişmez; cron işi kapatılarak agent'lar durdurulur | Agent'lar yalnızca izinli RPC'leri çağırıyor; her koşu ai_runs'ta; bir gece koşusunun maliyeti ölçülmüş |

## 16 register: canlı tablolarla eşleştirme

| # | Register | Canlı karşılık | Karar | Faz |
|---|---|---|---|---|
| 1 | Document | documents + document_revisions (boş) | Yazma RPC'leri ve Storage bağlantısı Faz B'de | B-C |
| 2 | Drawing | drawings (dokümana bire bir bağlı uzantı) | Çizim numarası dokümanın numarasıdır (DRW öneki) | C |
| 3 | RFI | rfis | Yazma RPC'leri ve ekranlar | C |
| 8 | Action | project_actions (ayrı tablo) | Ticket genişletilmez; kaynak bağı ile ilişkilendirilir | C |
| 4 | Technical Submittal | technical_submittals (TS öneki) | Ekran ve AI şeması | D |
| 5 | Material Approval | material_approvals (MA öneki) | procurement_items'a bağlı | D |
| 9 | Decision | decisions | Ekran | D |
| 10 | Risk | project_risks (otomatik kural motoru) | Genişlet: manuel ve AI taslağı, onay | D |
| 11 | Change / Variation | Yok | Yeni | D |
| 12 | Claim & Notice | Yok | Yeni, Change'e bağlı | D |
| 6 | Procurement | purchase_requests, purchase_request_items, purchase_offers | Köprü: doküman, risk ve aktivite bağları | D |
| 7 | Subcontractor | suppliers | Genişlet: tür alanı | D |
| 15 | Interface | Yok | Yeni | E |
| 16 | Payment | invoices, invoice_payments, financial_transactions | Köprü: register görünümü, yeni tablo yok | E |
| 13 | NCR | Kaldırılan kalite modülü | Pilotta yok (Karar 8) | E+ |
| 14 | Inspection | Kaldırılan kalite modülü | Pilotta yok (Karar 8) | E+ |

## Backend iş paketleri

Her migration CLAUDE.md kuralı gereği SQL gösterilip onay alınarak uygulanır, her pakette pozitif ve negatif RLS testi yazılır, uygulamadan önce yedek veya değişen nesnelerin anlık görüntüsü alınır.

| Faz | İş paketi | Çıktı |
|---|---|---|
| A (yapıldı) | RLS, RPC ve Storage durumunun testle doğrulanması; G-01, G-02, G-03; uyum migration'ı | Rapor ve uygulanmış migration'lar |
| B | register_permissions (rol × register × eylem), register_can(), get_my_register_permissions, durum geçiş tablosu | 4 rolle onay matrisi çalışıyor |
| B | register_audit: yalnızca değişen alanları saklayan genel trigger | Kim neyi ne zaman değiştirdi izlenir, veritabanı şişmez |
| B | Yazma RPC'leri: kaydet, onaya gönder, onayla, reddet, yeniden aç, durum değiştir, bağla, sil; G-01'in kalıcı kurala çevrilmesi | Frontend ham tabloya değil RPC'ye bağlanır |
| B | Doküman deposu: özel bucket, Storage politikaları (G-04'ün bu bucket için çözümü), begin_document_upload, complete_document_upload, abort_document_upload, terk edilmiş yüklemeleri temizleyen zamanlanmış iş | Dosya ve kayıt tutarlı; yetim dosya kalmaz |
| B | get_register_list, get_register_detail, get_register_overview ve vw_reg_* görünümleri | Liste ve detay ekranları RPC ile beslenir |
| B | FK kolonlarına indeks; G-13 (WBS tablolarında TRUNCATE yetkisini geri çek); identity_guard için yalnızca-admin düzeltme RPC'si | Performans ve güvenlik temizliği |
| C | register_drafts, document_jobs, ai_runs, ai_settings, ai_budget_ok(); taslak RPC'leri (listele, getir, güncelle, onayla, reddet) | Taslak akışı |
| C | process-document: Storage'dan okur, metin ve alan çıkarır, taslak yazar | Yüklenen RFI PDF'inden taslak RFI çıkar |
| C | Bildirim desteği: yeni entity_type değerleri ve bildirim trigger'ları | Taslaklar kaybolmaz |
| D | Change, Claim tabloları; Risk, Procurement, Subcontractor köprüleri; submittal ve material approval geçişleri | İkinci dilim register'ları |
| E | Agent kimliği, ai_findings, kuyruk tabanlı gece koşusu, Reconciliation ve Planning RPC'leri | Agent'lar ham tabloya değil kontrollü RPC'ye bağlanır |

## Frontend iş paketleri

Register'lar proje kapsamlı olduğu için global sidebar'a 24 madde eklenmez; ProjeDetay içine tek bir "Proje Kontrol" sekme grubu girer. Şantiye şefi ve muhasebe rollerinin "Projeler" sekmesi olmadığı için bu roller için ayrı bir giriş kararı Faz B'de verilir. 16 ayrı ekran yerine config'ten üretilen tek liste ve tek detay bileşeni yazılır.

| Faz | İş paketi | Çıktı |
|---|---|---|
| A (yapıldı) | ProjeDetay sekme yapısı, URL senkronu ve bildirim derin bağlantıları incelendi; frontend tasarım notu yazıldı | docs/proje-kontrol/frontend-tasarim-notu.md |
| B | Config tabanlı RegisterList ve RegisterDetail iskeleti; durum, güven ve audit bileşenleri | Tek bileşenle yeni register eklenebilir |
| B | "Proje Kontrol" sekme grubu (admin'e görünür); şantiye şefi girişi kararı | Boş register listeleri bağlı |
| C | Document ekranı: klasörlü dosya gezgini (proje, disiplin, tür), sürükle-bırak yükleme, süreli imzalı adresle açma ve indirme, revizyon geçmişi | Dosya yüklenir, kayıt oluşur |
| C | Drawing ve RFI ekranları; "Dosyadan RFI oluştur" akışı: yükle, AI taslağı gör, sarı/kırmızı alanları düzelt, onayla | Pilotun ana senaryosu |
| C | Action ekranı (project_actions); onay kutusu | Bekleyen taslaklar görünür |
| D | Submittal, Material Approval, Decision, Change, Claim, Risk ekranları config ile; AI Analiz paneli | Her biri küçük bir config ve özel alanlar |
| E | Proje sağlığı dashboard'u, reconciliation bulguları, Excel import sihirbazı, kalan register'lar | Yönetim görünümü |

Yeni ekranlar için Playwright testleri mevcut tests/ desenine eklenir; rol testleri 4 rolle yazılır.

## AI katmanı ve onay modeli

AI hiçbir kaydı kendi başına kesinleştirmez: dosyadan taslak çıkarır, yetkili kişi onaylar. Pilot akışı:

1. Dosya Fons'ta yüklenir (Supabase Storage); documents ve document_revisions kaydı oluşur, document_jobs satırı açılır.
2. process-document dosyayı kullanıcının yetkisiyle Storage'dan okur, metni çıkarır (taranmış PDF için görüntü modunda okunur), dosya türünü tespit eder.
3. Tür belliyse ilgili register'ın kolonlarından üretilen şemaya göre yapılandırılmış alan çıkarımı yapılır.
4. Çizim no, aktivite kodu, WBS ve Area mevcut kayıtlarla eşleştirilir; eşleşmeyen alan boş kalır, uydurulmaz.
5. Her alan için güven skoru ve kaynak (sayfa, paragraf) saklanır; taslak register_drafts tablosunda ai_draft durumuyla açılır.
6. Kullanıcı yalnızca sarı ve kırmızı alanları kontrol eder, onaylar; kayıt approved olur ve audit'e yazılır.

Kurallar:

- Dokümanın tam metni veritabanında kalıcı saklanmaz (ücretsiz plan sınırı ve gizlilik); metin yalnızca işlem sırasında kullanılır. Sonuç olarak alanlar, güven skorları ve kısa kaynak alıntıları saklanır.
- Document metadata (başlık, tür, revizyon) yüksek güvende otomatik doldurulabilir. Risk, Claim, Change ve Decision için hiçbir alan otomatik kesinleşmez.
- Sözleşme, ihbar süresi ve maliyet etkisi gibi hukuki veya ticari yorumlar AI'ın kararı değil, onaylayana gösterilen uyarıdır.
- Güven eşikleri pilotta alan bazında doğruluk ölçülerek ayarlanır; baştan sabit yüzde verilmez.
- DWG doğrudan okunmaz; PDF çıktısı kullanılır.
- AI anahtarları yalnızca edge function secret'ında durur. Çağrı kullanıcının JWT'siyle yapılır ve proje yetkisi kontrol edilir. İstemciden system prompt kabul edilmez.
- Sağlayıcı seçimi Karar 7'ye bağlıdır; belge içeriği harici modele gitmeden önce izin alınır.

Faz E'de eklenenler: benzer RFI ve sözleşme maddesi araması (pgvector, yalnızca gerçekten gerekirse) ve Reconciliation; örneğin register'da RFI açık, dosya deposunda cevap PDF'i var.

**Agent'lar (Faz E)**

- SQL/RPC hesaplar, AI yorumlar. "7 günden eski açık RFI'lar" bir sorgudur, modele gitmez; "hangisi kritik yolu etkiliyor ve neden" sorusu modele gider.
- Başlangıçta iki agent: Reconciliation ve Planning. Diğerleri tool'ları oturunca eklenir.
- Kimlik: her agent için ayrı, proje kapsamlı rol; yalnızca izinli RPC'leri çağırır. service_role ile serbest tablo erişimi verilmez. Çıktı taslak (register_drafts) veya bulgu (ai_findings) olarak yazılır.
- Çalışma kaydı: ai_runs tablosu; hangi agent, hangi tool, model, token, süre, sonuç.
- Orkestrasyon: ayrı bir servis yok. pg_cron iş kuyruğuna satır atar, edge function projeye veya register'a bölünmüş işi işler.
- Mevcut sohbet agent'ları ve agent-chat olduğu gibi kalır; yeni agent'lar ayrı yoldan çalışır.
- Model seçimi: basit sınıflandırma için hızlı model, kritik analiz için güçlü model. Sağlayıcı ölçümle seçilir; bütçe pilotta ölçülen doküman başına token ve tek gece koşusunun maliyetinden çıkarılır.

## Kabul kriterleri ve riskler

Bir faz, kabul kriteri sağlanmadan kapanmış sayılmaz.

| Faz | Kabul kriteri |
|---|---|
| A | Yetkisiz kullanıcı başka projenin dosyasını göremiyor (sağlandı); kararlar yazılı; patron onayı alınmış; İsdemir OYAK izni veya "yalnızca metadata" kararı yazılı |
| B | Eşzamanlı testte aynı register numarası iki kez üretilmiyor; 4 rolle onay matrisi testleri geçiyor; yüklenen dosyayı yalnızca yetkili kullanıcı açabiliyor; mevcut testlerin regresyonu yeşil |
| C | Geçmiş bir projenin gerçek RFI PDF'inden taslak çıkıyor, kullanıcı onaylıyor, audit'te görünüyor; başka projenin kullanıcısı kaydı ve dosyayı göremiyor |
| D | Risk taslağı Proje Yöneticisi onayı olmadan kesinleşmiyor; Procurement ve Payment köprüleri mevcut akışları bozmuyor |
| E | Reconciliation, dosya deposu ile register arasındaki farkı bulgu olarak gösteriyor; agent'lar yalnızca RPC üzerinden veri okuyor, her koşu ai_runs'a yazılıyor, oturumsuz gece koşusu yetki dışı veriye ulaşamıyor |

| Risk | Etki | Önlem |
|---|---|---|
| Kapasite beklenenden düşük | Pilot 1 Ocak'a yetişmez | Kapsamı küçült: önce Document + RFI, Drawing ve Action sonra |
| Supabase ücretsiz plan sınırları (1 GB dosya, 500 MB veritabanı, tek dosya 50 MB, otomatik yedek yok, 1 hafta işlem olmazsa duraklama) | Dosya ve yedek riski | Pilot dokümanlarından önce Pro plan (aylık 25 $ sabit); kullanım izleme ve %70'te uyarı; düzenli şema ve veri yedeği |
| Patron SharePoint beklentisini sürdürür | Tasarım tartışılır, geç değişiklik | Erken yazılı onay; dosya bağlantısı alanı genel tutulduğu için ileride SharePoint bağlantısı eklenebilir |
| Fotoğraflar ve dokümanlar dosya alanını doldurur | Yükleme durur | İstemci tarafında küçültme; doluluk izleme; mobilizasyondan sonra arşiv kararı |
| AI yanlış alan çıkarır | Hatalı kayıt | Taslak + onay, kaynak gösterimi, pilotta alan bazında doğruluk ölçümü |
| Doküman gizliliği | Sözleşme ihlali | Karar 7 kapanmadan harici modele dosya gönderilmez |
| Canlı modüllerin bozulması | Diğer projeler etkilenir | Boş bırakılabilir FK, ekle-geçir-kaldır kuralı, her migration'da regresyon testi |
| Rol yapısı yetersiz kalır | Onay akışı tıkanır | register_permissions ile rolü çoğaltmadan yetki ayrıştırılır |


# Bölüm 2 · Dokümanın açıklaması

Bu bölüm, mevcut Fons sistemini bozmadan üzerine proje kontrol katmanı eklemeyi anlatır: kayıtlar ve dosyalar Supabase'de durur, kullanıcı hepsine Fons'un içinden ulaşır, AI yalnızca taslak üretir ve onayı insan verir. Plan, 1 Ocak 2027 mobilizasyonuna yetişecek şekilde kurgulanmıştır.

## 1. Neden yeni bir sistem değil, ekleme

Kod yüzlerce migration, 55 tablo ve 118 test içeriyor ve canlı çalışıyor. Satın alma, finans, günlük rapor, ticket ve risk modülleri bunun içinde. Yeniden yazmak hem zaman kaybı hem risk olurdu. Bu yüzden mevcut tablolar silinmiyor, yenileri ekleniyor. Bu, CLAUDE.md'deki "ekle, geçir, sonra eskiyi kaldır" kuralıyla da uyumlu.

## 2. Temel yapı: iki kaynak, bir kural

| Parça | Rolü |
|---|---|
| Supabase veritabanı | Kayıtların tek kaynağı: RFI, çizim, risk, audit, yetki |
| Supabase Storage (özel bucket) | Dosyaların tek kaynağı: PDF, Word, Excel, fotoğraf. Kullanıcı bunu Fons içindeki klasörlü dosya gezgininden görür |
| Excel | Yalnızca şablon, toplu giriş ve dışa aktarma; çalışan sistem değil |

Kural: aynı bilgi iki yerde tutulmaz. RFI-ADN1-0032'nin durumu veritabanında, cevap PDF'i dosya deposundadır ve kayıt dosyaya bağlıdır.

Kullanıcı dosyayı dış bir sistemden değil, Fons içinden açar. Her açışta proje ve register yetkisi kontrol edilir ve tarayıcıya yalnızca süreli bir adres verilir. SharePoint ve Google Drive bu planda yok, çünkü şirkette Microsoft 365 ve Google Workspace hesapları bulunmuyor. Yapı, ileride SharePoint bağlantısı eklemeye engel değildir.

## 3. 16 register nasıl çözülüyor

Hepsi sıfırdan yazılmıyor, ve canlıda bugün hazır tablolar var:

- Canlıda hazır (boş): Document ve Drawing (documents, document_revisions, drawings), RFI, Action (project_actions), Decision, Technical Submittal, Material Approval.
- Mevcut tabloya köprü: Procurement (satın alma talepleri), Subcontractor (tedarikçiler), Risk (proje riskleri), Payment (faturalar ve ödemeler).
- Yeni: Change, Claim, Interface.
- Pilotta yok: NCR ve Inspection. Kalite kontrol modülü daha önce bilinçli olarak kaldırılmıştı; geri dönüşü yine bilinçli bir karar olmalı.

Yeni tablolar ortak sütunlarla açılır: proje, WBS, Area, aktivite kodu, durum, öncelik, sorumlu. Böylece "bu RFI hangi çizime ve hangi aktiviteye bağlı" sorusu cevaplanabilir.

## 4. AI nasıl çalışıyor: örnek akış

Bir RFI PDF'i Fons'ta yüklenir:

1. Sistem dosyayı özel depoya koyar, kaydı açar ve işleme kuyruğuna atar.
2. process-document metni çıkarır, dosyanın RFI olduğunu tespit eder.
3. RFI register'ının kolonlarına göre alanları çıkarır: konu, çizim no, aktivite, öncelik.
4. Çizim no ve aktivite kodunu mevcut kayıtlarla eşleştirir. Eşleşmeyen alan boş kalır, uydurulmaz.
5. Her alan için güven skoru ve kaynak (sayfa, paragraf) saklanır. Taslak, register_drafts tablosunda ai_draft durumuyla açılır.
6. Kullanıcı yalnızca sarı ve kırmızı alanları kontrol edip onaylar. Kayıt kesinleşir, audit'e yazılır.

Dokümanın tam metni veritabanında saklanmaz; yalnızca çıkarılan alanlar, güven skorları ve kısa alıntılar saklanır. Risk, Claim, Change ve Decision için hiçbir alan otomatik kesinleşmez. Sözleşme ve ihbar süresi yorumları AI'ın kararı değil, onaylayana gösterilen uyarıdır.

Gece çalışan agent'lar ayrı bir konudur ve mobilizasyondan sonra gelir. Başlangıçta yalnızca ikisi vardır: Reconciliation ve Planning. Bunların kullanıcı oturumu olmadığı için her birine ayrı, proje kapsamlı bir rol verilir ve yalnızca izinli RPC'leri çağırabilir.

Bir kural daha: "7 günden eski açık RFI'lar" gibi sorguları veritabanı yapar; AI'a yalnızca yorum gerektiren sorular gider. Her model çağrısı ai_runs tablosuna yazılır; maliyet ve "bu bulgu nereden çıktı" sorusu oradan izlenir.

## 5. Fazlar ve takvim

| Faz | Tarih (tahmin) | Ne olur |
|---|---|---|
| A · Zemin ve kararlar | 6-19 Eki | Büyük kısmı yapıldı: şema hizalama, güvenlik açıkları; açık: ölçüm seti, izinler, patron onayı |
| B · Çekirdek | 20 Eki - 9 Kas | Yetki, audit, yazma fonksiyonları, doküman deposu ve yükleme; sağlayıcı ölçümü |
| C · Pilot dilim | 10 Kas - 7 Ara | Document (klasörlü gezgin), Drawing, RFI, Action uçtan uca |
| D · İkinci dilim | 8-28 Ara | Risk, Change, Claim, Submittal, Material Approval, Decision, köprüler |
| E · Mobilizasyon sonrası | Ocak'tan sonra | Agent'lar, dashboard, kalan register'lar, Excel import |

Pilot 7 Aralık'ta hazır olur, Faz D mobilizasyondan 4 gün önce biter. Takvim bir tahmindir; ekip kapasitesi bilinmeden yazıldı. Yetişmezse kapsam küçültülür: önce Document ve RFI.

## 6. Kararlar

Onaylananlar: Action ayrı tablo (project_actions); numara biçimi RFI-ADN1-0032 (yıl ve disiplin yok, kırpma yok); tek doküman, çok revizyon; Submittal ve Material Approval iki ayrı tablo; dünkü canlı şemanın korunup hizalanması.

Bekleyenler:

1. **Dosya deposu ve Supabase Pro planı (patron onayı):** Dosyalar Fons içinde, Supabase Storage'da tutulur. Ücretsiz planda 1 GB dosya alanı, 500 MB veritabanı ve tek dosya için 50 MB sınırı var, otomatik yedek ve süreli duraklama durumu da bulunuyor; pilot dokümanlarından önce aylık 25 $'lık sabit Pro planı öneriliyor.
2. **AI sağlayıcı ve gizlilik:** İsdemir OYAK dokümanlarının harici modele gönderilmesi için izin gerekebilir. Sağlayıcı Faz B sonunda, aynı 10-15 gerçek dokümanı iki sağlayıcıya (ChatGPT dahil) vererek ölçümle seçilir. İzin gelmezse AI yalnızca metadata ile çalışır.
3. **Dört göz kuralı:** Kritik kayıtlarda onaylayan hazırlayandan farklı olmalı; küçük ekipte kilitlenirse proje bazında kapatılır.

## 7. Doğrulanmamış noktalar

- Edge function süre sınırı yüzünden uzun işler kuyruğa bölünüyor; gerçek sınır Faz C'de ölçülecek.
- Dosya yükleme boyutu sınırı plana göre değişir; Pro planda üst sınırın nasıl ayarlanacağı Faz B'de denenecek.
- Sağlayıcı seçimi kasıtlı olarak açık bırakıldı: karar ölçüme dayanmalı, tavsiyeye değil.

## 8. Sıradaki adım

Patrona dosya deposu ve Pro plan mesajı gönderilir, onay gelince Faz B (yetki, audit, yazma fonksiyonları ve doküman deposu) başlar. Bu arada AI ölçüm seti, İsdemir OYAK izni ve tam yedek hazırlanır.


# Bölüm 3 · Uygulama takvimi (6 Ekim 2026 - 1 Ocak 2027)

Bu takvim 12 haftayı veritabanı, dosya deposu, edge function, frontend, AI ve test kollarında haftalık iş paketlerine böler; her fazın sonunda bir çıkış kapısı vardır ve kapı geçilmeden sonraki faz başlamaz. Tarihler tahmindir; 29 Ekim resmî tatil olduğu için Faz B'nin ikinci haftası kısadır. Faz A'nın şema ve güvenlik işleri 7 Ekim'de tamamlandı, bu yüzden takvim planın önündedir.

## Şimdi (7 Ekim sonrası): senin açık işlerin

- [ ] **Patrona mesaj gönder:** dosyalar SharePoint yerine Fons içinde klasörlü dokümanlarda tutulacak; maliyet yalnızca Supabase Pro (aylık 25 $ sabit). Onay gelmeden dosya gezgininin geliştirmesine başlama; kayıt ve yetki işleri beklemeden sürer.
- [ ] İsdemir OYAK dokümanlarının harici bir AI modeline gönderilmesi için izin sorusunu yaz ve gönder (Karar 7). Cevap gelene kadar gerçek Diyarbakır dokümanı modele gitmez.
- [ ] Ölçüm seti için 10-15 gerçek doküman seç ve beklenen alanları bir Excel'e yaz (RFI için konu, çizim no, aktivite, tarih, öncelik). Müşteri gizlilik koşullarına bak, belirsizse isimleri karartılmış kopya kullan.
- [ ] Tam şema yedeği: `scripts/db-backup/.env.local` dosyasını hazırla ve `npm run db:backup` komutunun çalıştığını gör. Ücretsiz planda otomatik yedek olmadığı için tek güvencen bu; Faz B veri değiştiren migration'lara girmeden önce şart.
- [ ] Faz A dalını (`faz-a-proje-kontrol`) kendi gözünle kontrol ettikten sonra push et; main'e birleştirme (Vercel main'den yayın alır).
- [ ] Elle deneme: test projesinde günlük rapora fotoğraf yükle, ticket'a ek ekle, ikisini de aç; İş Planı sayfasını aç.

Not: ayrı bir staging veritabanı yok, migration'lar canlıya uygulanıyor. Bu yüzden her migration yalnızca ekleyen türdendir ve öncesinde geri alma SQL'i ve değişen nesnelerin anlık görüntüsü hazırlanır. Ayrı bir staging varsa söyle, akışı ona göre değiştiririz.

## Faz A: zemin ve kararlar (6-19 Ekim)

| Tarih | Kol | İş | Kim | Durum |
|---|---|---|---|---|
| 6-7 Eki | Karar | Kararlar CLAUDE.md'ye yazıldı; Karar 0 ve dört şema kararı onaylandı | Birlikte | Yapıldı |
| 6-7 Eki | Veritabanı | Canlı şema doğrulaması (30 iddia, 24'ü doğru); canlı şema özeti | Birlikte | Yapıldı |
| 6-7 Eki | Güvenlik | Güvenlik testleri; G-01 (register tablolarına yazma kapatma), G-02 ve G-03 (fotoğraf ve ek sızıntısı) uygulandı | Birlikte | Yapıldı |
| 6-7 Eki | Veritabanı | Uyum migration'ı: project_actions, document_revisions, project_register_settings, kırpmayan numaralama, is_critical kaldırma | Birlikte | Yapıldı |
| 6-7 Eki | Test | Tam Playwright seti 118/118 | Birlikte | Yapıldı |
| 6-7 Eki | Frontend | ProjeDetay yapısı ve bildirim derin bağlantıları incelendi, tasarım notu yazıldı | Birlikte | Yapıldı |
| 8-19 Eki | Karar | Dosya deposu ve Pro plan için patron onayı | Sen | Açık |
| 8-19 Eki | AI | Ölçüm seti ve beklenen alanlar Excel'i | Sen | Açık |
| 8-19 Eki | AI | İsdemir OYAK izin sorusu | Sen | Açık |
| 8-19 Eki | Yedek | Tam şema yedeği çalışır hâle gelir | Sen | Açık |
| 8-19 Eki | Doküman | tasarim.md ve Word dokümanının v3 sürümü Claude Code'a verilir | Sen | Bu dosya |

Çıkış kapısı (19 Ekim): yetkisiz kullanıcı başka projenin dosyasını göremiyor (sağlandı), kararlar yazılı (sağlandı), patron onayı alınmış, gizlilik sorusu gönderilmiş, yedek çalışıyor.

## Faz B: çekirdek (20 Ekim - 9 Kasım)

Bu fazda canlıdaki boş register tablolarına yazma yolu açılır, ama yalnızca RPC üzerinden. "Proje Kontrol" grubu bu fazda yalnızca admin'e görünür.

| Tarih | Kol | İş | Kim | Çıktı |
|---|---|---|---|---|
| 20-26 Eki | Veritabanı | register_permissions (rol × register × eylem), register_can(), get_my_register_permissions, durum geçiş tablosu; 4 rol için varsayılan izinler | Birlikte | Onay matrisi çalışıyor |
| 20-26 Eki | Veritabanı | register_audit: yalnızca değişen alanları saklayan genel trigger; FK kolonlarına indeksler; G-13 (TRUNCATE yetkisini geri çek) | Birlikte | Audit çalışıyor, güvenlik temizlendi |
| 20-26 Eki | Frontend | RegisterList ve RegisterDetail iskeleti, registerConfig.js (kolon, filtre, form alanı) | Birlikte | Config'ten üretilen boş liste ve detay |
| 27 Eki - 2 Kas | Veritabanı | Yazma RPC'leri: kaydet, onaya gönder, onayla, reddet, yeniden aç, durum değiştir, bağla, sil (rfis, drawings, project_actions, decisions, technical_submittals, material_approvals). G-01'in geçici kapatması kalıcı kurala dönüşür | Birlikte | Tablolara yalnızca RPC ile yazılabiliyor |
| 27 Eki - 2 Kas | Veritabanı | identity_guard için yalnızca-admin düzeltme RPC'si; yazma yolunu bekleyen 3 testin açılması | Birlikte | Yanlış girilen Activity ID düzeltilebiliyor |
| 27 Eki - 2 Kas | Frontend | Ortak bileşenler: durum rozeti, AI güven rozeti, audit paneli, ilişkili kayıtlar paneli; şantiye şefi ve muhasebe için giriş kararı | Birlikte | Bileşenler hazır |
| 27 Eki - 2 Kas | Not | 28 Ekim yarım gün, 29 Ekim resmî tatil: bu hafta kapasite yaklaşık bir gün düşük | | |
| 3-9 Kas | Dosya deposu | Özel bucket, Storage politikaları (G-04'ün bu bucket için çözümü), begin_document_upload, complete_document_upload, abort_document_upload, terk edilmiş yüklemeleri temizleyen zamanlanmış iş (patron onayı gerekir) | Birlikte | Dosya yüklenir, kayıt oluşur, yetim dosya kalmaz |
| 3-9 Kas | Veritabanı | get_register_list, get_register_detail, get_register_overview ve vw_reg_* görünümleri; realtime yayını | Birlikte | Liste ve detay RPC ile besleniyor |
| 3-9 Kas | AI | Ölçüm betiği iki sağlayıcıyla (ChatGPT dahil) çalıştırılır (gizlilik izni durumuna göre kapsam belirlenir); alan bazında doğruluk, süre, maliyet raporu | Birlikte | Sağlayıcı ölçüm raporu |
| 3-9 Kas | Frontend | "Proje Kontrol" sekme grubu (lazy, admin'e görünür); boş register listeleri bağlanır; G-12 (ticket ek hatası kullanıcıya gösterilsin) | Birlikte | Sekme canlıda, yalnızca admin görür |
| 3-9 Kas | Test | Regresyon; yeni RLS, yükleme ve numaralama testleri; CLAUDE.md güncellemesi | Birlikte | Faz B kapısı |

Çıkış kapısı (9 Kasım): aynı numara iki kez üretilmiyor, 4 rolle onay matrisi çalışıyor, yüklenen dosyayı yalnızca yetkili kullanıcı açabiliyor, mevcut testler yeşil, sağlayıcı ölçümü sonuçlanmış.

## Faz C: pilot dilim (10 Kasım - 7 Aralık)

Bu faz planın kalbidir: Document, Drawing, RFI ve Action uçtan uca çalışır, AI dosyadan RFI taslağı çıkarır. Faz sonunda "Proje Kontrol" grubu admin'den sonra proje_yoneticisi ve santiye_sefi rollerine, register_permissions'a göre açılır.

| Tarih | Kol | İş | Kim | Çıktı |
|---|---|---|---|---|
| 10-16 Kas | AI | Faz B ölçümüne göre sağlayıcı seçilir; anahtar edge function secret'ına eklenir | Birlikte | Sağlayıcı seçili |
| 10-16 Kas | Frontend | Document ekranı: klasörlü dosya gezgini (proje, disiplin, tür), sürükle-bırak yükleme, süreli imzalı adresle açma ve indirme, revizyon geçmişi | Birlikte | Dosya yüklenir, kayıt oluşur, klasör ağacı görünür |
| 10-16 Kas | Frontend | Drawing ekranı (dokümana bağlı uzantı, revizyon zinciri) | Birlikte | Çizim ekranı |
| 17-23 Kas | Veritabanı | register_drafts, document_jobs, ai_runs, ai_settings, ai_budget_ok() | Birlikte | Kuyruk, kayıt ve taslak tabloları |
| 17-23 Kas | Edge | process-document v1: Storage'dan okur, PDF metin çıkarımı ve doküman türü tespiti; her çağrı ai_runs'a yazılır | Birlikte | Tür tespiti çalışıyor |
| 17-23 Kas | Frontend | RFI liste ve detay; manuel RFI girişi tam çalışır | Birlikte | Manuel akış hazır |
| 24-30 Kas | AI | process-document v2: RFI alan çıkarımı, güven skoru, kaynak sayfa, çizim no ve task_code eşleştirmesi; taslağı register_drafts'a yazar | Birlikte | PDF'ten taslak RFI |
| 24-30 Kas | Veritabanı | Taslak RPC'leri (listele, getir, güncelle, onayla, reddet), bildirim türleri ve trigger'ları | Birlikte | Onay akışı |
| 24-30 Kas | Frontend | "Dosyadan RFI oluştur" akışı; AI taslak ekranı (sarı ve kırmızı alanlar vurgulu); onay butonları | Birlikte | Pilotun ana senaryosu |
| 1-7 Ara | Frontend | Action ekranı (project_actions); onay kutusu (bekleyen taslaklar) | Birlikte | Action ve onay kutusu |
| 1-7 Ara | Test | Geçmiş projenin gerçek RFI PDF'leriyle pilot; başka proje kullanıcısı negatif testi; process-document kapatma anahtarı testi; regresyon | Birlikte | Faz C kapısı |

Çıkış kapısı (7 Aralık): gerçek bir RFI PDF'inden taslak çıkıyor, onaylanıyor ve audit'te görünüyor; başka projenin kullanıcısı kaydı ve dosyayı göremiyor; AI kapatılsa bile manuel RFI girişi çalışıyor.

## Faz D: ikinci dilim (8-28 Aralık) ve yılbaşı tamponu

Pilotun iskeleti hazır olduğu için bu fazda her register küçük bir config girdisi, yazma RPC'si ve bir AI şemasıdır. Satın alma ve finans akışlarına yazma yapılmaz, yalnızca okuma bağları kurulur.

| Tarih | Kol | İş | Kim | Çıktı |
|---|---|---|---|---|
| 8-14 Ara | Frontend | Submittal, Material Approval ve Decision ekranları registerConfig.js girdisiyle eklenir (tablolar canlıda) | Birlikte | Üç ekran |
| 8-14 Ara | AI | Submittal için çıkarım şeması; process-document yeni türü tanır | Birlikte | Submittal taslağı |
| 15-21 Ara | Veritabanı | changes, claims (Change'e bağlı, ihbar süresi alanı); project_risks'e kaynak, durum ve onaylayan kolonları | Birlikte | Tablolar ve onay akışı |
| 15-21 Ara | Frontend | Change, Claim ve Risk ekranları; Risk taslağı yalnızca Proje Yöneticisi onayıyla kesinleşir | Birlikte | Üç ekran |
| 15-21 Ara | AI | Risk, Change ve Claim için taslak çıkarımı; ihbar süresi ve maliyet etkisi yalnızca uyarı olarak gösterilir | Birlikte | Kesinleşmeyen taslaklar |
| 22-28 Ara | Veritabanı | Köprüler: suppliers'a tür alanı (tedarikçi, taşeron); Procurement için doküman, risk ve aktivite bağları | Birlikte | Okuma bağları |
| 22-28 Ara | Frontend | Her kayıtta "AI Analiz" paneli: ilişkili çizim, aktivite, benzer kayıt (yalnızca okuma) | Birlikte | Panel |
| 22-28 Ara | Test | Satın alma ve finans testleri dahil tam regresyon; yetki, audit ve onay testleri 4 rolle | Birlikte | Faz D kapısı |
| 29 Ara - 1 Oca | Tampon | Düzeltmeler; Diyarbakır projesinin kodu ve klasör yapısının canlıda hazırlanması; kullanıcılara kısa eğitim; CLAUDE.md ve sistem dokümantasyonu güncellemesi | Birlikte | Mobilizasyona hazır |

Çıkış kapısı (28 Aralık): Risk taslağı onaysız kesinleşmiyor, mevcut satın alma ve finans testleri yeşil, bütün yeni ekranlarda 4 rolün yetkisi doğrulanmış.

## Frontend nasıl güncellenecek

Frontend yeni bir uygulama olmuyor: mevcut desenlerin üzerine tek bir yeni sekme grubu ekleniyor. Aşağıdaki "Mevcut" sütunu CLAUDE.md'den, "Değişiklik" sütunu bu plandan; dosya ve klasör adları öneridir.

| Alan | Mevcut | Değişiklik |
|---|---|---|
| Navigasyon | ProjeDetay'ın 7 iç sekmesi; seçili sekme localStorage'da proje bazlı saklanıyor | 8. sekme "Proje Kontrol", lazy() ile yüklenir; Faz B'de yalnızca admin, Faz C sonunda register_permissions'a göre diğer roller. Şantiye şefi ve muhasebe için ayrı üst seviye giriş kararı Faz B'de |
| URL | /dashboard/projeler/{id}/{sekme}; detay modalları ?talep=, ?ticket= gibi sorgu parametreleriyle useUrlSyncedSelection üzerinden | /dashboard/projeler/{id}/kontrol; seçili register ve kayıt ?register= ve ?kayit= ile; aynı hook kullanılır |
| Veri erişimi | Ham .from() büyük ölçüde RPC desenine taşındı | Register ekranları yalnızca RPC çağırır; ham .from() yok |
| Canlı yenileme | P0 tablolarda useRealtimeRefresh | Faz B'de register ve doküman tablolarına eklenir |
| Bileşenler | Her sayfa bir Tab*.jsx | Yeni klasör (öneri) src/components/proje-kontrol/: RegisterList, RegisterDetail, registerConfig.js, durum ve güven rozeti, AuditPanel, LinksPanel, ApprovalInbox, DocumentExplorer, DocumentUpload |
| Yeni register eklemek | Ayrı ekran yazmak | registerConfig.js'e bir girdi (kolonlar, filtreler, form alanları, AI şeması adı) |
| Yetki | roles, role_allowed_tabs; sekme görünürlüğü AuthContext'ten | Buton ve alan görünürlüğü get_my_register_permissions RPC'sinden gelir; asıl güvenlik RLS ve RPC'dedir, arayüz yalnızca gizler |
| Dosya açma | Fotoğraf ve ekler Storage'da, süreli imzalı adresle | Proje dokümanları da aynı desenle: klasör ağacı doküman kayıtlarından üretilir, dosya süreli imzalı adresle açılır; yükleme begin/complete RPC'leri üzerinden |
| Bildirim | entity_type değerleri: purchase_request, invoice, ticket, daily_report, daily_report_reminder, procurement_item_change_request | Yeni register_record ve register_draft; derin bağlantı mevcut goToRequest deseniyle ?register=&kayit= URL'ine gider. CLAUDE.md kuralı: alıcı rolün ilgili sekmeyi gerçekten görebildiğini doğrula |
| Dil ve adlandırma | Arayüz Türkçe, kod İngilizce snake_case | Aynı |
| Test | Playwright, tests/helpers.js | Her yeni ekran için bir spec; roller 4 rolle test edilir; her fazın kapısında tam regresyon |
| Paket boyutu | Sekme bazlı lazy() ile bölünmüş | Yeni sekme grubu da lazy(); ana paket büyümez |

## Haftalık rutin, migration akışı ve kayma kuralı

Her pazartesi: önceki haftanın testlerini çalıştır, CLAUDE.md'yi güncelle, o haftanın işlerini bu tablodan al.

Her migration aynı sırayla ilerler:

1. SQL yazılır ve gösterilir; sen onaylamadan uygulanmaz (CLAUDE.md'nin ilk kuralı).
2. Yedek: tam şema yedeği (npm run db:backup) veya değişen nesnelerin anlık görüntüsü; veri değiştiren migration'larda veri yedeği şarttır.
3. Taslak mümkünse tek bir BEGIN ... ROLLBACK bloğunda denenir.
4. Migration uygulanır; supabase/migrations/ altına aynı sürüm numarasıyla dosyası yazılır.
5. RLS için pozitif ve negatif test çalıştırılır.
6. Uygulanan değişiklik CLAUDE.md ve sistem dokümantasyonuna işlenir.

Gecikme olursa şu sırayla kesilir, çekirdek korunur:

1. AI Analiz paneli (Faz D) Ocak'a kayar.
2. Material Approval ve Claim (Faz D) Ocak'a kayar.
3. Decision ekranı ve onay kutusunun gelişmiş hali Faz D'ye kayar.
4. Drawing ekranı Document ekranının içinde basit liste olarak kalır.

Hiçbir durumda kesilmeyenler: Document, RFI, AI taslak ve insan onayı, audit, yetki testleri.

İsdemir OYAK izni gelmezse takvim değişmez ama Faz C'nin AI işi küçülür: process-document yalnızca dosya adı ve klasörden metadata çıkarır, RFI alanları elle doldurulur; gerçek AI çıkarımı izin gelince eklenir.

Patron dosya deposunu onaylamazsa ve SharePoint isterse: kayıtlar, yetki, audit, taslak akışı ve register ekranları aynı kalır; yalnızca dosya yükleme ve açma bölümü (Faz B'nin dosya deposu işi ve Faz C'nin Document ekranı) o sağlayıcıya göre yeniden yazılır. Bu yüzden onay beklenirken dosya dışındaki işlere devam edilir.


# Bölüm 4 · Teknik tasarım

Bu bölüm, sistemin entegrasyonuna başlayabileceğin seviyede tasarımıdır: tablolar, kolonlar, durum makineleri, yetkiler, RPC ve edge function sözleşmeleri, dosya deposu, AI şemaları, ekranlar ve migration durumu. Canlı şema 07.10.2026 itibarıyla esas alınmıştır; kolon düzeyindeki kesin canlı tanım docs/proje-kontrol/canli-sema-ozeti.md dosyasındadır ve bu bölümle çelişirse canlı şema geçerlidir (bu bölüm ona göre güncellenir).

## Okuma rehberi

Koddan ve canlı şemadan doğrulananlar: proje kimliği text (projects.id), kullanıcı kimliği uuid, has_project_access(p_project_id text) NULL proje için true döndürüyor (yeni tablolarda project_id bu yüzden NOT NULL olmalı), project_tasks.id uuid ve UNIQUE(project_id, task_code), tickets.id uuid, notifications.entity_id uuid ve entity_type, event_type alanlarında CHECK kısıtı var, roles.key text PK, aktif roller 4 tane. Canlıda 07.10'dan beri: project_wbs, project_areas, area_wbs, documents, document_revisions, drawings, rfis, project_actions, decisions, technical_submittals, material_approvals, register_status_history, project_register_counters, project_register_settings (hepsi boş; authenticated kullanıcılar yalnızca okuyabilir).

Hâlâ doğrulanması gerekenler: baz şema (projects, profiles, project_risks, procurement_items) migration dosyalarında bulunmuyor; bu tabloların kolon tipleri canli-sema-ozeti.md ve canlı sorgularla teyit edilir.

Bu tasarımın temel ilkesi: AI taslakları hedef register tablosuna yazılmaz, ayrı bir register_drafts tablosunda tutulur. Sebep: project_risks gibi canlı akışlarda kullanılan tablolara taslak satırı koymak mevcut liste RPC'lerinin ve RLS'lerin hepsini değiştirmeyi gerektirirdi. Taslak onaylanınca RPC gerçek kaydı hedef tabloya yazar.

## 4.1 Ortak sözleşme

Register tablolarının hepsi (documents, drawings, rfis, project_actions, decisions, technical_submittals, material_approvals; ileride changes, claims, interfaces) aynı ortak kolonları taşır. Mevcut tablolar (project_risks, suppliers, tickets) kendi sözlüklerini korur; farkı RPC katmanı normalleştirir.

| Kolon | Tip | Kural |
|---|---|---|
| id | uuid | PK, gen_random_uuid() |
| project_id | text | NOT NULL, FK projects(id) ON DELETE CASCADE. NULL olamaz çünkü has_project_access(NULL) true döner |
| Numara (tabloya özel ad) | text | Canlıda kolon adı tabloya özeldir: document_no, rfi_no, action_no, decision_no, submittal_no, approval_no (drawings'te yok, çizimin numarası dokümanınkidir). Hepsi NOT NULL, UNIQUE(project_id, &lt;no&gt;); boş gelirse trigger doldurur. Okuma görünümleri ve RPC'ler bunu ortak `register_no` adıyla döndürür. Biçim RFI-DYB-0032 |
| record_state | text | draft, pending_approval, approved, rejected; varsayılan draft. Canlıda yok, B3 ekler (documents dahil; drawings dokümanınkini kullanır) |
| source | text | manual, ai, import; varsayılan manual. Canlıda yok, B3 ekler |
| wbs_id, area_id | uuid | Boş geçilebilir kompozit FK (project_id, x) → hedef (project_id, id), ON DELETE NO ACTION; bağın aynı projede kalmasını veritabanı garanti eder |
| task_id | uuid | Aynı kompozit FK, project_tasks'a; aktivite kodu ekranda task_code olarak join'den gelir |
| discipline | text | Canlıda serbest metin, CHECK yok (documents, technical_submittals; rfis'te responsible_discipline). Ekran sözlüğü: mechanical, dc, ac, mv, enh, civil, general |
| priority | text | low, medium, high, critical; varsayılan medium (yalnızca rfis ve project_actions'ta var) |
| assigned_to | uuid | FK profiles(id) ON DELETE SET NULL (rfis, project_actions). project_actions'ta ayrıca serbest metin responsible (dış taraf) |
| source_document_id | uuid | Kaydın çıkarıldığı dosya. Canlıda yok; AI taslak akışıyla Faz C'de (C1) eklenir. Canlıdaki document_id "ilişkili doküman" anlamındadır (rfis, technical_submittals, material_approvals) |
| created_by | uuid | FK profiles(id). rfis, technical_submittals ve material_approvals'ta yok, B3 ekler (rfis'te ayrıca raised_by var) |
| approved_by, approved_at, rejected_reason | uuid, timestamptz, text | Onay ve ret bilgisi. Canlıda yok, B3 ekler |
| created_at, updated_at | timestamptz | updated_at trigger ile güncellenir (document_revisions'ta updated_at yok) |

İki eksenli durum: record_state kaydın geçerliliğini, status (her register'a özel) işin yaşam döngüsünü tutar. Örneğin RFI-032 approved bir kayıttır ve status alanı open, answered, closed olarak ilerler.

**record_state geçişleri** (yalnızca RPC ile; geçersiz geçiş hata verir):

| Nereden | Nereye | Kim | Not |
|---|---|---|---|
| (yeni) | draft | create izni olan | Elle giriş |
| draft | pending_approval | kaydın sahibi veya edit izni olan | submit_register_record |
| pending_approval | approved | approve izni olan | Kritik register'larda onaylayan created_by'dan farklı olmalı (dört göz) |
| pending_approval | rejected | approve izni olan | Gerekçe zorunlu |
| rejected | draft | kaydın sahibi | Düzeltip yeniden gönderir |
| approved | draft | approve izni olan | reopen_register_record; gerekçe zorunlu, audit'e yazılır |

Onaylı kayıtta alanlar kilitlidir; yalnızca status geçişi, not ekleme ve bağlantı eklemek serbesttir. Doküman kaydı istisnadır: elle yüklenen doküman doğrudan approved açılır.

**AI taslağı** (register_drafts) ayrı bir yaşam döngüsü izler: ai_draft → approved | rejected | superseded (aynı dosyadan yeniden çıkarım yapılırsa eski taslak). Onaylanınca hedef tabloya record_state = approved, source = ai olarak yazılır.

**Numaralama (canlıda).** Biçim {TÜR}-{PROJE_KODU}-{SIRA}, örnek RFI-ADN1-0007. Yıl ve disiplin numaranın içinde yoktur (disiplin ayrı kolondur). Proje kodu project_register_settings tablosunda tutulur (2-6 karakter, büyük harf veya rakam, projeler arasında benzersiz; canlıda ADN1, ADN2, TIZ, TKY). Doküman numaraları: çizim türündeki dokümanlar DRW, diğerleri DOC öneki alır ve her önek kendi sırasında ilerler; çizimin numarası bağlı olduğu dokümanın numarasıdır. Submittal TS, malzeme onayı MA önekini taşır. Sıra project_register_counters tablosundaki satırın aynı işlemde arttırılmasıyla üretilir; başarısız bir kayıt denemesi sayacı ilerletmez (kayıp numara oluşmaz). Sıra 4 haneye kadar sıfır doldurulur, 10000 ve üstü kırpılmaz (07.10'da düzeltilen G-11). Kodu tanımlı olmayan projede numara istenirse açık bir hata döner; Faz B yazma fonksiyonları numarayı dışarıdan kabul etmez.

## 4.2 Tablo tablo şema

Genel kural: her FK kolonuna indeks açılır (canlıda WBS, alan ve görev bağlarında var; register'lar arası bağlar ve kişi/tedarikçi FK'leri dahil 30 FK'nin indeksi yok, B2'de eklenecek), her tabloda RLS açıktır, hiçbir register tablosuna doğrudan INSERT/UPDATE/DELETE yetkisi verilmez; yazma yalnızca RPC ile olur (bugün yazma tamamen kapalı, Faz B'de RPC'ler açılacak).

**A. Altyapı tabloları**

| Tablo | Durum | Kolonlar ve kurallar |
|---|---|---|
| project_wbs, project_areas, area_wbs | CANLI | WBS ve alan hiyerarşisi (üst kayıt, kod, ad, disiplin/tür, aktif mi); alan–WBS çoktan çoğa bağ (area_wbs). UNIQUE(project_id, wbs_code / area_code); üst kayıt bağı kompozit FK ON DELETE RESTRICT; silmek yerine pasife alınır; guard trigger'ları seviye, döngü ve kullanımdaki kodu korur. project_tasks'ta wbs_id, area_id (kompozit FK, RESTRICT), activity_id, discipline, baseline_start/end, forecast_start/end, primavera_id kolonları ve atanmış Activity ID'yi kilitleyen identity_guard trigger'ı |
| project_register_settings | CANLI | project_id (PK, FK), prefix (proje kodu, 2-6 büyük harf/rakam, projeler arasında UNIQUE). B3 taslağı four_eyes_enabled (varsayılan true, Karar 10) ekler; claim bildirim süresi Faz D'de |
| project_register_counters | CANLI | project_id, register_code, last_value; authenticated erişimi yok, yalnızca numara fonksiyonları kullanır |
| register_status_history | CANLI | Durum geçmişi; yalnızca okunabilir. Trigger'ı yalnızca rfis, decisions ve project_actions'ta var (technical_submittals ve material_approvals'ta yok; onların durum izi register_audit'ten gelir) |
| register_permissions | YENİ (Faz B, B1) | role_key (FK roles(key)), register_type, can_view, can_create, can_edit, can_approve, can_delete (boolean), edit_scope (all / own: santiye_sefi'nin "yalnızca kendi kaydı" kuralı veride tutulur). PK (role_key, register_type); yalnızca 4 aktif rol için satır |
| register_status_transitions | YENİ (Faz B) | register_type, from_status, to_status. set_register_status yalnızca bu tablodaki geçişlere izin verir |
| register_audit | YENİ (Faz B, B2) | id (bigint), project_id, table_name, record_id, action, changed_by (varsayılan auth.uid()), changed_at, changed_fields jsonb (yalnızca değişen alanların eski ve yeni değeri; silmede satırın son hali), reason. Tam satırı iki kez saklamaz (ücretsiz plan veritabanı sınırı). project_id'de FK yok: proje silinirken zincirleme silinen kayıtların audit satırı FK'ye takılıp proje silmeyi engellemesin diye; audit kaydı kaydın kendisinden uzun yaşar. UPDATE ve DELETE yetkisi kimseye verilmez, satırı yalnızca trigger yazar |
| register_links | Kurulmuyor (şimdilik) | Canlıda register'lar arası bağlar tablolardaki kompozit FK kolonlarıyla tutuluyor (rfis.drawing_id/document_id/decision_id, project_actions.rfi_id/risk_id/decision_id, decisions.rfi_id/risk_id, technical_submittals.document_id, material_approvals.document_id/technical_submittal_id, project_risks.rfi_id/action_id/decision_id). Bu bağlar aynı projeyi veritabanında garanti ediyor; B3'ün link/unlink RPC'leri bu kolonları yazar. Çok biçimli bağ tablosu yalnızca kolonla karşılanamayan bir ilişki gerekirse açılır |
| register_drafts | YENİ (Faz C) | id, project_id, register_type, payload jsonb, field_confidence jsonb, source_document_id, job_id, run_id, prompt_version, status (ai_draft, approved, rejected, superseded), reviewed_fields text[], created_record_id, created_at, reviewed_by, reviewed_at, reject_reason |
| document_jobs | YENİ (Faz C) | id, project_id, document_id, job_type (classify, extract), status (queued, running, done, failed), attempts, last_error, created_by, zaman damgaları |

Dokümanın tam metni için ayrı bir tablo yoktur: metin yalnızca işlem sırasında kullanılır (500 MB'lık ücretsiz veritabanı sınırı ve gizlilik).

**B. Register tabloları** (hedef alanlar; canlıdaki kesin kolonlar canli-sema-ozeti.md'de)

| Tablo | Durum | Register'a özel alanlar |
|---|---|---|
| documents | CANLI | Doküman kimliği: document_no (DOC ya da DRW öneki), title, document_type, discipline, wbs_id, area_id, task_id, status (active, void), created_by. document_type'ta CHECK yok; değer listesi (drawing, rfi, submittal, correspondence, report, contract, minutes, photo, other) B3 RPC'sinde doğrulanır. 'drawing' değeri DRW numarası ve çizim bağı için anlamlıdır. Revizyon ve dosya bilgisi burada değil document_revisions'ta |
| document_revisions | CANLI, yükleme alanları Faz B (B5) | revision_no (CHECK `^[A-Z0-9][A-Z0-9.-]{0,9}$`, doküman içinde UNIQUE), revision_status (ifr, ifa, ifc, as_built), is_current (dokümanın tek güncel revizyonu, kısmi unique index), issue_date, notes, created_by. Dosya kolonları canlıda zaten var: storage_provider (CHECK onedrive, sharepoint, google_drive, supabase_storage, external), storage_file_id, file_name, mime_type, size_bytes, sha256 (64 hex). B5 yalnızca upload_status (uploading, ready, aborted) ve zaman damgalarını ekler; dosya yolu storage_file_id'de (storage_provider = supabase_storage), yükleyen created_by'dadır. Yazma policy'si yok |
| drawings | CANLI | Dokümana bire bir bağlı uzantı (document_id UNIQUE); çizim yalnızca çizim türündeki dokümana bağlanabilir ve bağlı dokümanın türü sonradan değiştirilemez (3 kolonlu FK). Kendi kolonu yalnızca drawing_type; saha ve BOQ etkisi alanları canlıda yok |
| rfis | CANLI | rfi_no, subject, question, description, response, status (open, under_review, answered, closed, rejected), priority, raised_by, assigned_to, responsible_discipline, raised_date, due_date, answered_date, drawing_id, document_id, decision_id. raised_by_party, schedule_impact_days, cost_impact, contract_ref canlıda yok; AI şeması rfi_v1 ile Faz C'de (C1) eklenir |
| project_actions | CANLI | Ayrı aksiyon tablosu (ticket'tan bağımsız): action_no, title, description, status (open, in_progress, done, cancelled), priority, assigned_to, responsible (serbest metin), due_date, completed_at, source_type (manual, risk, rfi, decision, meeting, other; inspection ve ncr yok), rfi_id, risk_id, decision_id |
| decisions | CANLI | decision_no, title, decision_text, decision_date, decision_maker (serbest metin), status (proposed, approved, superseded, cancelled), rfi_id, risk_id. supersedes_id yok |
| technical_submittals | CANLI | TS öneki; submittal_no, title, description, discipline, supplier_id, status (draft, submitted, under_review, approved, approved_with_comments, rejected, resubmit_required), submitted_date, due_date, reviewed_date, reviewer_id, revision, document_id. Spec referansı ve tür alanları canlıda yok |
| material_approvals | CANLI | MA öneki; approval_no, material_name, manufacturer, model, supplier_id, status (draft, submitted, approved, approved_with_comments, rejected, expired), submitted_date, approved_date, revision, technical_submittal_id, document_id. BOM bağı ters yönde: procurement_items.material_approval_id ve purchase_requests.material_approval_id. Sahada gerekli tarih alanı yok |
| changes | YENİ (Faz D) | Başlık, açıklama, köken, maliyet (sayı + ayrı currency), süre etkisi (gün), sözleşme maddesi. status: identified, submitted, approved, rejected, implemented |
| claims | YENİ (Faz D) | change_id, tür (time, cost, both), olay tarihi (zorunlu), bildirim son tarihi, bildirim gönderim tarihi, talep tutar ve süre, sözleşme maddesi. status: notice_due, notice_sent, submitted, negotiating, settled, rejected |
| interfaces | YENİ (Faz E) | Başlık, tür, taraf A ve B, termin. status: open, agreed, closed |

Para alanları sayı + ayrı currency kolonudur. Bildirim son tarihi, proje ayarında sözleşme süresi doluysa olay tarihinden RPC ile hesaplanır, boşsa elle girilir; AI bu tarihi hiçbir zaman kendi başına belirlemez.

**C. Mevcut tablolara eklemeler**

| Tablo | Durum | Eklenen |
|---|---|---|
| project_tasks | CANLI | wbs_id, area_id (kompozit FK, RESTRICT), activity_id (atandıktan sonra kilitli), discipline, baseline_start/end, forecast_start/end, primavera_id |
| project_risks, purchase_requests, procurement_items | CANLI (kolonlar boş) | Register bağları için 15 kompozit FK kolonu: project_risks'te wbs, area, task, rfi, action, decision (6); purchase_requests'te wbs, area, task, material_approval, technical_submittal (5); procurement_items'ta wbs, area, task, material_approval (4). project_risks'e Faz D'de kaynak, durum ve onaylayan kolonları eklenecek, source CHECK'ine ai değeri |
| tickets | DEĞİŞMEZ | Ticket sahadan bildirim olarak kalır, genişletilmez; Action ayrı tablodadır |
| suppliers | Faz D | Canlıda supplier_type zaten başka anlamla var (malzeme_ekipman, hizmet, nakliye, diger). Tedarikçi/taşeron ayrımı için yeni kolon: party_type (supplier, subcontractor, both); varsayılan supplier |
| notifications | Faz C | meta jsonb; entity_type CHECK'ine register_record ve register_draft eklenir |
| Realtime yayını | Faz B-C | register_drafts, document_revisions, document_jobs ve register tabloları (RLS realtime'da da geçerli) |

## 4.3 Yetki matrisi ve RLS şablonu

Proje erişimi (has_project_access) ile register yetkisi (register_permissions) birlikte aranır: kullanıcı önce projeye, sonra o register'ın o eylemine yetkili olmalı. Harf anlamları: V görüntüle, C oluştur, E düzenle, A onayla, D sil. Bu değerler öneridir ve Karar 6 ile netleşir; register_permissions tablosu değiştirildiğinde kod değişmez.

| Register | admin | proje_yoneticisi | santiye_sefi | muhasebe |
|---|---|---|---|---|
| document | VCEAD | VCEA | VC | yok |
| drawing | VCEAD | VCEA | V | yok |
| rfi | VCEAD | VCEA | VCE | yok |
| submittal | VCEAD | VCEA | V | yok |
| material_approval | VCEAD | VCEA | V | yok |
| interface | VCEAD | VCEA | VC | yok |
| decision | VCEAD | VCEA | V | yok |
| action (project_actions) | VCEAD | VCEA | VCE | yok |
| risk | VCEAD | VCEA | VC | yok |
| change | VCEAD | VCEA | VC | V |
| claim | VCEAD | VCEA | yok | V |
| procurement | V | V | V | V |
| subcontractor | VCED | VCE | V | V |
| payment | V | V | yok | V |

Notlar:

- santiye_sefi'nin E yetkisi yalnızca kendi oluşturduğu kayıtlar içindir (created_by = auth.uid()); Action (project_actions) için aynı kural geçerlidir; ticket yetkileri değişmez.
- procurement, subcontractor ve payment için register yalnızca bir köprü görünümüdür; bu tablolara yazma mevcut satın alma ve finans akışlarından devam eder. Muhasebe'nin satın alma kapsamı mevcut _internal RPC'lerinin sınırıyla aynı kalır, köprü bunu genişletmez.
- Kritik register'lar (dört göz kuralı): risk, change, claim, decision. Bunlarda onaylayan kişi created_by'dan farklı olmak zorundadır; admin için de geçerlidir.
- Silme yalnızca draft ve rejected kayıtlar içindir; onaylı kayıt silinmez, status ile iptal edilir.

**RLS şablonu** (her yeni register tablosu için aynı):

```sql
alter table public.rfis enable row level security;

create policy rfis_select on public.rfis
  for select to authenticated
  using (public.has_project_access(project_id) and public.register_can('rfi', 'view'));

-- INSERT, UPDATE, DELETE için policy yok: yazma yalnızca SECURITY DEFINER RPC'lerle yapılır.
```

register_can(p_type text, p_action text) returns boolean SECURITY DEFINER, STABLE, search_path = public; get_my_role() ile bulunan rolün register_permissions satırını okur. CLAUDE.md'deki uyarı gereği her yeni fonksiyonda revoke execute ... from public, anon ve grant execute ... to authenticated yazılır; trigger fonksiyonlarından authenticated da çıkarılır.

Dosya erişimi aynı kuralla çözülür: dosya depolama politikası, yoldaki projeye erişimi ve register_can('document', 'view') yetkisini doğrulamadan dosyayı vermez; ayrıntı 4.5'tedir.


## 4.4 RPC sözleşmeleri

İsimlendirme mevcut desenle aynı: okuma get_*, yazma save_*, create_* ve eylem fiilleri. Hepsi SECURITY DEFINER, search_path = public, ilk satırda has_project_access ve register_can kontrolü; anon ve PUBLIC EXECUTE yetkisi kapalı. Kimlik hiçbir zaman parametreden gelmez, auth.uid() kullanılır.

**Okuma**

| RPC | Parametreler | Dönüş |
|---|---|---|
| get_my_register_permissions | p_project_id text | {role, registers: {rfi: {view, create, edit, approve, delete}, ...}} |
| get_register_overview | p_project_id text | Register başına {total, open, pending_approval, overdue} ve bekleyen AI taslağı sayısı (sol menü rozetleri) |
| get_register_list | p_project_id, p_register_type, p_filters jsonb '{}', p_search text null, p_sort text null, p_limit int 50, p_offset int 0 | {items: [...], total}; veri vw_reg_<tür> view'larından (security_invoker = on), tür beyaz listeden CASE ile seçilir, dinamik SQL yok |
| get_register_detail | p_register_type, p_id uuid | {record, links, documents, permissions, allowed_status_transitions} |
| get_register_audit | p_register_type, p_id, p_limit 50, p_before bigint null | {items: [...]} audit satırları |
| search_register_refs | p_project_id, p_ref_type (drawing, document, task, area, wbs, rfi...), p_query text, p_limit 10 | [{id, label, sublabel}] (bağlantı seçici için) |

**Yazma ve durum geçişi** (register tabloları; Risk için mevcut akış Faz D'ye kadar kullanılır)

| RPC | Parametreler | Dönüş ve kural |
|---|---|---|
| save_register_record | p_register_type, p_project_id, p_id uuid null, p_data jsonb | {id, register_no, record_state}. Zorunlu alan, enum ve aynı-proje FK doğrulaması; yeni kayıtta numara atar; yalnızca draft ve rejected kayıt düzenlenir |
| submit_register_record | p_register_type, p_id | draft → pending_approval |
| approve_register_record | p_register_type, p_id, p_note null | Kritik register'da onaylayan created_by olamaz |
| reject_register_record | p_register_type, p_id, p_reason | Gerekçe zorunlu |
| reopen_register_record | p_register_type, p_id, p_reason | approved → draft, gerekçe zorunlu |
| set_register_status | p_register_type, p_id, p_status, p_note null | İş durumu geçişi; yalnızca approved kayıtta; izinli geçişler register_status_transitions(register_type, from_status, to_status) tablosunda. Yan alanları RPC doldurur: RFI answered'da p_note cevap (response) olur ve zorunludur, answered_date bugün; action done'da completed_at; submittal ve material approval'da gönderim/inceleme/onay tarihleri; document active → void'de p_note zorunlu |
| delete_register_record | p_register_type, p_id | Yalnızca draft ve rejected. Doküman ve çizim silinmez, void edilir |
| link_register_records | p_project_id, p_from_type, p_from_id, p_to_type, p_to_id | Bağ tablosu yok: kaynak tablodaki ilgili kompozit FK kolonunu yazar (ör. rfi → drawing için rfis.drawing_id). Desteklenen çiftler 4.2'deki register_links satırında; diğerleri validation. Onaylı kayıtta da izinli |
| unlink_register_records | p_project_id, p_from_type, p_from_id, p_to_type | Aynı kolonu boşaltır |

**AI taslakları**

| RPC | Parametreler | Dönüş ve kural |
|---|---|---|
| list_register_drafts | p_project_id, p_status 'ai_draft', p_register_type null | Taslak listesi (onay kutusu) |
| get_register_draft | p_draft_id uuid | {draft, document, matches, thresholds}; matches eşleşen çizim ve aktivite adaylarını içerir |
| update_register_draft | p_draft_id, p_payload jsonb | Kullanıcı alan düzeltir; düzeltilen alanlar reviewed_fields'e eklenir |
| approve_register_draft | p_draft_id, p_payload jsonb null, p_reviewed_fields text[] '{}' | {register_type, record_id, register_no}. Güveni eşiğin altındaki her alan p_reviewed_fields içinde değilse review_required hatası verir (sunucu tarafı zorlama). Hedef kayıt approved, source = ai; kritik register'da onaylayan taslağı üreten kullanıcıdan farklı olmalı |
| reject_register_draft | p_draft_id, p_reason null | |

**Doküman yükleme ve iş kuyruğu**

| RPC | Parametreler | Dönüş ve kural |
|---|---|---|
| begin_document_upload | p_project_id, p_document_id null, p_meta jsonb, p_file_name, p_size, p_mime, p_sha256 | {document_id, revision_id, storage_path}. Yetki, tür ve boyut kontrolü; aynı projede aynı sha256 varsa duplicate. uploading durumunda revizyon satırı açar (dosya yoluna izin bu satırla verilir) |
| complete_document_upload | p_revision_id | Dosyanın depoda var olduğunu ve boyutunu doğrular; tek işlemde eski güncel revizyonu is_current = false, yenisini true yapar, upload_status = ready yazar, document_jobs satırı açar |
| abort_document_upload | p_revision_id | Yarım kalan yüklemeyi iptal eder, satırı ve varsa dosyayı siler |
| void_document | p_document_id, p_reason | Onaylı dokümanı silmek yerine iptal eder; dosya saklanır |
| get_storage_usage | (yok) | Yalnızca admin: toplam dosya kullanımı ve bucket başına doluluk |
| get_stale_uploads | (yok) | Yalnızca admin: dosyası depoda kalmış aborted revizyonlar (yol listesi); dosyalar Storage API'siyle silinir |
| enqueue_document_job, finish_document_job | p_document_id, p_job_type; p_job_id, p_status, p_error null | Job id; iş kapanışı |
| save_ai_draft | p_document_id, p_register_type, p_payload jsonb, p_confidence jsonb, p_run_id uuid, p_job_id uuid | Draft id; aynı doküman ve türdeki önceki ai_draft taslağını superseded yapar |
| log_ai_run | tür, sağlayıcı, model, prompt_version, token sayıları, süre, durum | Run id; bütçe aşıldıysa budget_exceeded |

**Servis fonksiyonları (Faz E):** svc_ öneki; gövdenin ilk satırı auth.role() = 'service_role' kontrolü, aksi halde forbidden: svc_claim_next_job, svc_save_finding, svc_agent_get_* okuma tool'ları. Edge function'lardaki servis kodunda .from() çağrısı yasaktır, yalnızca bu RPC'ler çağrılır. Faz C'de process-document kullanıcının kendi yetkisiyle çalıştığı için servis fonksiyonu gerektirmez.

**Hata sözleşmesi:** RPC'ler raise exception ile kısa bir kod fırlatır, ayrıntıyı detail içinde JSON olarak verir; frontend kodu Türkçe mesaja çevirir.

| Kod | Anlamı |
|---|---|
| forbidden | Proje erişimi veya register yetkisi yok |
| not_found | Kayıt yok veya başka projede |
| invalid_state | Bu record_state veya status geçişi yasak |
| validation | Zorunlu alan, enum veya FK hatası; detail alan listesini verir |
| review_required | Düşük güvenli alanlar gözden geçirilmedi; detail alan listesini verir |
| duplicate | Aynı dosya (sha256) zaten kayıtlı; detail mevcut id'yi verir |
| budget_exceeded | AI bütçesi doldu |

## 4.5 Dosya deposu ve edge function tasarımı

**Depo.** Yeni özel bucket proje-dokumanlari (adı öneri); public değil, dosya boyutu sınırı plan sınırına eşit veya altında (ücretsiz planda tek dosya 50 MB). Mevcut saha-fotolari ve ticket-ekleri bucket'ları yerinde kalır. Yol biçimi: {project_id}/{document_id}/{revision_id}_{güvenli_dosya_adı}. Yolun ilk klasörü proje kimliğidir (saha-fotolari ile aynı desen); dosya adı ASCII'ye çevrilir ve 80 karakterle sınırlanır.

**Klasör ağacı arayüzdedir, depoda değil:** Proje > Disiplin > Doküman türü > Doküman, altında revizyonlar; hepsi documents ve document_revisions kayıtlarından üretilir. Kullanıcı klasör açmaz veya taşımaz, disiplin ve tür değerlerini listeden seçer. Böylece klasör kayması ve taşıma hatası doğmaz.

**Storage politikaları (bu bucket için; 07.10'daki G-02/G-03 deseni ve G-04'ün çözümü):**

- SELECT: yoluyla eşleşen bir document_revisions kaydı olan, kullanıcının o projeye erişimi ve register_can('document', 'view') yetkisi bulunan dosya.
- INSERT: yalnızca upload_status = 'uploading' ve created_by = auth.uid() olan, yolu (storage_file_id) birebir aynı bir revizyon satırı varsa (begin_document_upload önceden açar); yolun projesi kayıtla eşleşmeli.
- UPDATE: kullanıcıya kapalı. DELETE: yalnızca kendi yüklemesi olan ve durumu uploading veya aborted olan revizyonun dosyası için (abort sonrası istemci dosyayı Storage API'siyle siler); ready dosya hiçbir kullanıcı tarafından silinemez, onaylı doküman void ile iptal edilir.
- Canlıda doğrulandı (07.10.2026): storage.objects üzerindeki protect_objects_delete trigger'ı SQL'den doğrudan silmeyi engelliyor ("Use the Storage API instead"). Bu yüzden veritabanı fonksiyonları ve pg_cron dosyanın kendisini silemez, yalnızca kayıtları işaretler; dosya silme Storage API'si üzerinden olur.

**Yükleme akışı:**

1. Tarayıcı dosyanın sha256 değerini hesaplar.
2. begin_document_upload yetkiyi, türü, boyutu ve tekrarı (aynı sha256) kontrol eder, uploading durumunda revizyon satırı ve yolu döndürür.
3. Tarayıcı dosyayı o yola Storage'a yükler.
4. complete_document_upload dosyanın depoda olduğunu doğrular; tek işlemde eski güncel revizyonu is_current = false, yenisini true yapar, upload_status = ready yazar, document_jobs satırı açar.
5. Yarıda kalırsa abort_document_upload revizyonu aborted yapar, istemci varsa dosyayı Storage API'siyle siler. Zamanlanmış iş (pg_cron, saatlik) 1 saatten eski uploading revizyonları aborted yapar ve dosyası depoda olmayan aborted satırları siler. Dosyası depoda kalmış aborted satırlar get_stale_uploads (yalnızca admin) ile listelenir ve dosyalar Storage API'siyle silinir (ayarlar ekranında "Yarım yüklemeleri temizle"); tamamen otomatik silme için pg_net + bir edge function gerekir (karar Faz B). Böylece yetim kayıt kalmaz, yetim dosya admin ekranında görünür.

İzinli türler: pdf, png, jpg, docx, xlsx, dwg (dwg saklanır, AI'a gönderilmez). Açma ve indirme: tarayıcı kısa ömürlü imzalı adres ister, politika yetkiyi denetler; kalıcı adres hiçbir yerde saklanmaz.

**Kullanım izleme.** get_storage_usage toplam kullanımı döndürür; ayarlar ekranında doluluk gösterilir ve %70'te uyarı verilir (ücretsiz plan 1 GB, Pro plan 100 GB). Fotoğraflar için istemci tarafında yüklemeden önce küçültme (yaklaşık 1600 px, JPEG %80) uygulanır.

**Genişletilebilirlik.** document_revisions'ta dosya sağlayıcısı alanı canlıda zaten var: storage_provider (onedrive, sharepoint, google_drive, supabase_storage, external) ve storage_file_id. İleride SharePoint bağlantısı istenirse register'lar değişmeden yalnızca dosya bölümü genişler.

**process-document** (Faz C; kullanıcının kendi JWT'siyle çalışır; arka planda sürer, ilerleme document_jobs ve realtime ile arayüze akar)

| Adım | İş | Çıktı |
|---|---|---|
| 1 | İşi al: status = running, attempts + 1 (en çok 3 deneme) | Job |
| 2 | Dosyayı Storage'dan indir (kullanıcının yetkisiyle) | Bayt akışı |
| 3 | Metin çıkar: PDF metin katmanı; sayfa başına karakter min_text_chars altındaysa sayfa görüntüleri (en çok max_pages) modele gönderilir. Metin yalnızca bellekte kullanılır, kalıcı saklanmaz | Geçici metin |
| 4 | Sınıflandır (hızlı model): doc_type, disiplin, revizyon, başlık, dil | Doküman boş alanlarını doldurur |
| 5 | Türüne uygun bir çıkarım şeması varsa çıkar (güçlü model), alıntıları doğrula, çizim ve aktiviteyi eşleştir | save_ai_draft |
| 6 | Her model çağrısı log_ai_run'a yazılır; iş finish_document_job ile kapanır | Kayıt |

Hata davranışı: geçersiz JSON çıkarsa bir onarım denemesi yapılır, olmazsa iş failed olur ve arayüz "Elle doldur" gösterir. Kapatma anahtarı: ai_settings.enabled = false iken iş skipped olur ve manuel akış etkilenmez.

**Gizli bilgiler (edge function secret'ları):** AI_PROVIDER, AI_API_KEY. Başka harici anahtar yoktur (Google veya Microsoft entegrasyonu yok); hiçbiri VITE_ önekli değildir ve hiçbiri repoda bulunmaz.

## 4.6 AI tasarımı

**İlkeler.** Model çıktısı serbest metin değil şemalı JSON'dur; sıcaklık 0. Her alan {value, confidence, source: {page, quote}} biçiminde döner, belgede olmayan alan null gelir. Çıkarım çağrısında model hiçbir araç (tool) çağıramaz. Belge içindeki cümleler talimat değil veridir; sistem mesajı bunu açıkça söyler (belgeye gömülü "önceki talimatları unut" türü metinlere karşı). Prompt ve şemalar repoda sürümlü dosyalardır: supabase/functions/process-document/prompts/rfi_v1.md ve schemas/rfi_v1.json; sürüm adı ai_runs.prompt_version'a ve taslağa yazılır, değişiklik yeni sürüm dosyasıdır.

**Sınıflandırma çıktısı** (hızlı model): doc_type, discipline, revision, title, language. **RFI çıkarım şeması (rfi_v1):**

| Alan | Tip | Doğrulama ve eşleştirme |
|---|---|---|
| subject | text | Zorunlu |
| question | text | Zorunlu; belgedeki soru metni |
| raised_by_party | enum | contractor, owner, subcontractor, engineer; emin değilse null |
| raised_at | date | ISO tarih; belgede yoksa null |
| due_date | date | Belgede açıkça yazılı değilse null |
| drawing_no | text | Normalize edilip çizim türündeki dokümanın document_no'su ile birebir eşleşir (drawings'in kendi numarası yok); olmazsa null ve en çok 3 aday |
| task_code | text | project_tasks.task_code ile birebir; olmazsa null |
| area_code, wbs_code | text | project_areas.area_code, project_wbs.wbs_code ile birebir; olmazsa null |
| contract_ref | text | Belgede geçen madde numarası |
| schedule_impact_days | int | Yalnızca belgede sayı olarak yazılıysa |
| priority | enum | Yalnızca öneri; kullanıcı belirler |

**Alıntı doğrulaması.** source.quote belge metninde (boşluk ve büyük-küçük harf normalize edilerek) birebir bulunmuyorsa o alanın güveni en çok 0,3 yapılır ve alan quote_not_found ile işaretlenir. Bu, modelin uydurduğu bir değeri yüksek güvenle göstermesini engelleyen asıl önlemdir.

**Güven eşikleri.** Başlangıç değeri: yeşil 0,9 ve üzeri, sarı 0,7-0,9, kırmızı 0,7 altı. Bunlar varsayımdır; Faz B ölçümünden sonra ai_settings.thresholds içinde kalibre edilir. Sunucu zorlaması: approve_register_draft, eşiğin altındaki her alan p_reviewed_fields içinde değilse review_required verir.

**Hiç doldurulmayan alanlar** (öneri olarak gösterilir, taslak değerine yazılmaz): iş durumu (status), priority = critical, tutarlar ve para birimi, ihbar tarihleri (notice_deadline, notice_sent_at), onay alanları. Kritik register'lar (risk, change, claim, decision) için taslak üretilir ama her dolu alan gözden geçirilmiş sayılmadan onaylanamaz.

**Veri tabloları**

| Tablo | Kolonlar |
|---|---|
| ai_runs | id, project_id, run_type (classify, extract, agent), agent_name null, document_id null, job_id null, user_id null, provider, model, prompt_version, input_tokens, output_tokens, cost_estimate numeric(10,4) null, duration_ms, status (ok, error, timeout, rejected), error, created_at |
| ai_settings | project_id (null = genel), enabled boolean, monthly_token_cap bigint null, max_pages int, min_text_chars int, thresholds jsonb, provider, model_fast, model_strong. Sayısal varsayılanlar Faz B ölçümüyle belirlenir, bu dokümanda uydurulmadı |
| ai_findings (Faz E) | id, project_id, agent_name, finding_type (reconciliation, delay_risk), severity (low, normal, high, critical), title, detail jsonb, related_type, related_id, status (open, acknowledged, dismissed, converted), run_id, created_at |

log_ai_run her çağrıdan önce ai_budget_ok(project_id) kontrolü yapar; bütçe doluysa budget_exceeded döner, iş failed olur ve manuel akış etkilenmez.

**Faz B ölçüm protokolü.** Aynı 10-15 doküman, aynı şema ve aynı prompt ile iki sağlayıcıya verilir; beklenen alanlar Faz A'da senin hazırladığın Excel'dir. Raporlanan metrikler: alan bazında doğruluk, doğru boş bırakma oranı, hatalı doldurma oranı, **yüksek güvenle yanlış** alan sayısı (en tehlikelisi), süre ve belge başına maliyet. Seçim kuralı: yüksek güvenle yanlış sayısı en düşük olan, eşitlikte maliyeti düşük olan. Kabul eşiği (örneğin hangi doğruluğun yeterli olduğu) veriyi görmeden belirlenmez.

**Agent'lar (Faz E).** Agent çıktıları kayıt değil ai_findings satırıdır; sayılar SQL'den gelir, model yalnızca yorumlar.

| Agent | Veri araçları (yalnızca okuma RPC) | Bulgu | Zamanlama |
|---|---|---|---|
| Reconciliation | svc_agent_get_register_document_diff: yüklemesi yarım kalmış revizyonlar, kayıtla eşleşmeyen dosyalar, açık RFI'ya bağlı cevap benzeri yeni doküman, çizim revizyon tutarsızlığı | reconciliation | Gece, proje bazında kuyruktan |
| Planning | svc_agent_get_schedule_overview: geciken aktiviteler ve plan sapması (mevcut vw_delayed_tasks, baseline/forecast tarihleri; is_critical kolonu 07.10.2026'da kaldırıldı), o aktivitelere bağlı açık RFI, Submittal ve Material Approval | delay_risk | Gece, proje bazında kuyruktan |

Kimlik: Faz E'de iki seçenek var. Başlangıç seçeneği: edge function service_role ile çalışır ama kodunda .from() yasaktır ve yalnızca svc_* RPC'lerini çağırır. Sıkı seçenek: fons_agent adlı, yalnızca bu RPC'lere EXECUTE hakkı olan bir veritabanı rolü; edge function bu role ait kısa ömürlü bir JWT üretir. İkincisi daha güvenli ama JWT sırrının fonksiyona verilmesini gerektirir; Faz E başında seçilir.


## 4.7 Frontend tasarımı

Arayüz Türkçe, kod İngilizce. Her ekran dört durumu açıkça ele alır: yükleniyor (iskelet satırlar), boş (açıklama ve "Yeni" butonu), hata (mesaj ve "Yeniden dene"), yetkisiz ("Bu register için yetkiniz yok"). Mobilde tablo yerine kart listesi (mevcut invoice-mobile-list deseni) kullanılır.

**Ekran envanteri**

| # | Ekran | URL | İçerik |
|---|---|---|---|
| 1 | Proje Kontrol kabuğu | /dashboard/projeler/{id}/kontrol | Sol menü: Dokümanlar (Document, Drawing), Teknik (RFI, Submittal, Material Approval, Interface), Yönetim (Action, Risk, Decision), Ticari (Change, Claim, Procurement, Subcontractor, Payment). Her satırda sayı ve rozet (bekleyen onay, geciken). Üstte Onay Kutusu rozeti. Mobilde açılır liste |
| 2 | RegisterList | ?register=rfi | Arama, config'ten gelen filtreler, sunucu taraflı sayfalama (50), sıralama, "Yeni" ve "Dosyadan oluştur" butonları (yetkiye göre). Satır rozetleri: kayıt durumu, iş durumu, AI kaynaklı, termin geçti |
| 3 | RegisterDetail | ?register=rfi&kayit={uuid} | Sağdan açılan panel (mevcut TalepDetayModal deseni). Başlık: numara, başlık, rozetler, eylem butonları (Düzenle, Onaya gönder, Onayla, Reddet, Yeniden aç, Durum değiştir). Sekmeler: Genel, Dokümanlar, İlişkiler, AI Analiz (Faz D), Geçmiş |
| 4 | Kayıt formu | Detay panelinin içinde | formSections config'inden üretilir; istemci doğrulaması + sunucu validation hatasının alana bağlanması; "Kaydet" taslak açar, "Onaya gönder" ayrı eylemdir; onaylı kayıtta kilitli alanlar salt okunur |
| 5 | Dosyadan Oluştur | ?register=rfi&sihirbaz=dosya | 4 adım: (1) dosya seç veya sürükle, (2) işleme durumu (realtime document_jobs), (3) inceleme: solda PDF önizleme, sağda alanlar yeşil/sarı/kırmızı, alanın kaynak alıntısı üzerine gelince görünür ve tıklayınca PDF ilgili sayfaya gider (#page=N), (4) Onayla, Reddet veya "Elle doldur" |
| 6 | Onay Kutusu | ?register=_onay | İki sekme: AI taslakları (list_register_drafts) ve Onay bekleyen kayıtlar; satırda yaş ve kaynak doküman; toplu onay yok (kritik alanlar tek tek incelenir) |
| 7 | Document ve Drawing | ?register=document, ?register=drawing | Klasörlü dosya gezgini: solda proje > disiplin > tür ağacı, ortada doküman listesi, sürükle-bırak yükleme, açma ve indirme (kısa ömürlü imzalı adres), revizyon geçmişi (R01 → R02 → R03, güncel olan işaretli), tekrar yüklenen dosya için uyarı. Yükleme sırasında ilerleme çubuğu ve yarıda kesilirse "Yüklemeyi iptal et" |
| 8 | Register ayarları | Proje Yönetimi içinde (admin) | Proje kodu, WBS ve Area listesi ile toplu yükleme, register_permissions matrisi, AI ayarları (açık/kapalı, kota), dosya deposu doluluğu ve uyarı eşiği |
| 9 | Bulgular ve proje sağlığı (Faz E) | ?register=_bulgular | ai_findings listesi (durumu: yeni, görüldü, reddedildi, kayda dönüştü); register sağlığı özet kartları |

**Bileşen ağacı** (öneri: src/components/proje-kontrol/)

```text
ProjeKontrolTab
├─ RegisterNav
├─ RegisterList
│   ├─ RegisterToolbar
│   └─ RegisterTable | RegisterCards (mobil) + Pagination
├─ RegisterDetail
│   ├─ DetailHeader (StatusBadge, ConfidenceBadge, eylem butonları)
│   ├─ RecordForm (registerConfig'ten)
│   ├─ DocumentsPanel + DocumentUpload
│   ├─ LinksPanel + RefPicker (search_register_refs)
│   ├─ AiAnalysisPanel (Faz D)
│   └─ AuditPanel (get_register_audit)
├─ DraftWizard (UploadStep, ProcessingStep, ReviewStep, DoneStep)
├─ ApprovalInbox
└─ RegisterSettings (admin)
```

**Hook'lar:** useRegisterPermissions(projectId) (oturum başına önbellek), useRegisterList(params), useRegisterRecord(type, id), useRegisterDraft(id), useDocumentJob(jobId) (realtime), useRealtimeRefresh register, documents, register_drafts ve document_jobs tablolarında (mevcut hook). Seçili kayıt useUrlSyncedSelection ile ?kayit= parametresine bağlanır; son açık register localStorage'da proje-kontrol-active-register-{projectId} anahtarıyla saklanır (mevcut proje bazlı anahtar deseni).

**registerConfig.js şeması** (yeni register eklemek = bu nesnenin bir örneği):

```js
export const rfiConfig = {
  key: 'rfi',
  label: 'RFI',
  labelPlural: 'RFI Listesi',
  group: 'teknik',
  critical: false,
  supportsDraftFromFile: true,
  aiSchema: 'rfi_v1',
  listColumns: [
    { key: 'register_no', label: 'No', type: 'text', sortable: true },
    { key: 'subject', label: 'Konu', type: 'text' },
    { key: 'area_code', label: 'Area', type: 'text' },
    { key: 'status', label: 'Durum', type: 'enum', enum: 'rfiStatus' },
    { key: 'due_date', label: 'Termin', type: 'date', sortable: true, overdueWhenStatus: 'open' },
    { key: 'record_state', label: 'Kayıt', type: 'recordState' },
  ],
  filters: [
    { key: 'status', type: 'enum', enum: 'rfiStatus' },
    { key: 'area_id', type: 'ref', ref: 'area' },
    { key: 'overdue', type: 'toggle', label: 'Termini geçenler' },
  ],
  formSections: [
    { title: 'Genel', fields: [
      { key: 'subject', label: 'Konu', type: 'text', required: true },
      { key: 'question', label: 'Soru', type: 'textarea', required: true },
      { key: 'drawing_id', label: 'İlgili çizim', type: 'ref', ref: 'drawing' },
      { key: 'task_id', label: 'Aktivite', type: 'ref', ref: 'task' },
    ] },
  ],
  lockedWhenApproved: ['subject', 'question', 'raised_at', 'drawing_id'],
};
```

**Türkçe etiketler** (enum değeri kodda İngilizce, ekranda Türkçe; tek bir labels.js sözlüğünde):

| Alan | Değer → etiket |
|---|---|
| record_state | draft → Taslak, pending_approval → Onay bekliyor, approved → Onaylı, rejected → Reddedildi |
| RFI status | open → Açık, under_review → İncelemede, answered → Cevaplandı, closed → Kapalı, rejected → Reddedildi |
| priority | low → Düşük, medium → Orta, high → Yüksek, critical → Kritik |
| güven | yeşil → Yüksek, sarı → Orta, kırmızı → Düşük; renk tek başına anlam taşımaz, etiket de yazılır |
| source | manual → Elle, ai → AI, import → Aktarım |

**Bildirimler.** AI taslağı oluşunca register_draft / created olayı, onay yetkisi olan rollere notify_role ile gider; onaya gönderilince register_record / pending; onay ve ret created_by kullanıcısına notify_user ile (approved, rejected, gerekçe body'de); işleme hatası yükleyene status_changed. meta.register_type tıklayınca doğru register'ı açar (mevcut goToRequest deseni: ?register=&kayit=, taslakta ?register=_onay&taslak=). Uyarı: CLAUDE.md'ye göre alıcı rolün gerçekten bu ekrana erişebildiği doğrulanmalı; ProjeDetay iç sekmelerinin role_allowed_tabs ile mi kontrol edildiğini Faz A'daki tasarım notu netleştirir. notify_role proje kapsamını kendiliğinden daraltıyor mu, Faz C'de test edilir.

## 4.8 Migration listesi

Dosya adları mevcut biçimi izler (YYYYMMDDHHMMSS_ad.sql). Yapılanlar canlıya uygulanmış ve supabase/migrations/ altına dosyası yazılmıştır (05.10 migration'larının dosyası repoda yoktu, docs/proje-kontrol/canli-05-10-migrations/ altına birebir kopyalandı). Hepsi yalnızca ekleyicidir.

| Sürüm / kod | Ad | Durum | İçerik |
|---|---|---|---|
| 20261005103850 | faz1_wbs_alan_activity | YAPILDI | project_wbs, project_areas, area_wbs; project_tasks'a kolonlar ve identity_guard trigger'ı |
| 20261005125957 | project_control_phase1_core | YAPILDI | 7 register tablosu, sayaç, durum geçmişi, mevcut tablolara FK kolonları |
| 20261005132810 | project_control_phase1b_hardening | YAPILDI | Yetki ayarı |
| 20261007063808 | G-01 geçici yazma kapatma | YAPILDI | 8 register tablosunda authenticated yazma yetkisi geri alındı |
| 20261007063825 | G-02/G-03 metadata sızıntı | YAPILDI | daily_report_photos ve ticket_attachments politikaları ve storage okuma kuralları sıkılaştırıldı |
| 20261007072501 | uyum_project_control_registers | YAPILDI | project_actions, document_revisions, project_register_settings, numaralama düzeltmesi (G-11), is_critical kaldırma |
| B1 | register_permissions | Faz B, taslak | register_permissions (+edit_scope), register_can(), get_my_register_permissions, set_register_permission (admin), register_status_transitions, 4 rol seed'i |
| B2 | register_audit_and_indexes | Faz B, taslak | register_audit (yalnızca değişen alanlar) ve trigger'ı, 30 indekssiz FK'ye indeks, G-13 (TRUNCATE, REFERENCES, TRIGGER ve area_wbs UPDATE yetkisini geri çek) |
| B3 | register_write_rpcs | Faz B, taslak | Ortak kolonlar (record_state, source, approved_by/at, rejected_reason, eksik created_by; project_register_settings.four_eyes_enabled); kaydet, onaya gönder, onayla, reddet, yeniden aç, durum değiştir, bağla/çöz, sil; doğrudan yazma policy'leri düşer, SELECT register_can(view) ile daralır (G-01 kalıcı kural) |
| B4 | identity_guard_admin_fix | Faz B, taslak | Yalnızca admin'in kullanabildiği, gerekçeli ve audit'li Activity ID düzeltme RPC'si; identity_guard bu RPC'ye izin verecek şekilde güncellenir |
| B5 | document_storage | Faz B, taslak, PATRON ONAYI BEKLİYOR | document_revisions'a upload_status ve zaman damgaları (dosya kolonları canlıda var), proje-dokumanlari bucket'ı, Storage politikaları (G-04), begin/complete/abort upload, void_document, get_storage_usage, get_stale_uploads, pg_cron temizlik işi |
| B6 | register_read_rpcs | Faz B, taslak | vw_reg_* görünümleri ve vw_reg_items, get_register_list, get_register_detail, get_register_overview, get_register_audit, realtime yayını |
| C1 | ai_jobs_drafts | Faz C | document_jobs, ai_settings, ai_runs, register_drafts, ai_budget_ok() |
| C2 | register_draft_rpcs | Faz C | Taslak RPC'leri, save_ai_draft, log_ai_run, bildirim desteği (notifications.meta, entity_type değerleri) |
| D1 | changes_claims | Faz D | changes, claims, görünümler, RLS |
| D2 | project_risks_register_extension | Faz D | project_risks ek kolonlar, source CHECK genişletmesi, Risk için taslak onay yolu |
| D3 | suppliers_type_and_links | Faz D | suppliers.party_type (supplier_type adı dolu), Procurement ve Subcontractor köprü görünümleri |
| E1 | interfaces | Faz E | interfaces tablosu ve görünümü |
| E2 | agent_infra | Faz E | ai_findings, svc_agent_* RPC'leri, kuyruk işleyici; isteniyorsa fons_agent rolü |
| E3 | register_bridge_views | Faz E | Payment ve Procurement okuma köprüleri |

**Her migration'ın kontrol listesi** (PR açıklamasında işaretlenir):

- [ ] Her FK kolonuna indeks
- [ ] enable row level security ve SELECT policy; yazma policy'si yok
- [ ] Her fonksiyonda security definer, set search_path = public, revoke ... from public, anon (ve authenticated yalnızca çağrılması gerekiyorsa)
- [ ] Yeni tablolarda varsayılan geniş yetkiler (Supabase varsayılanı) açıkça geri çekildi
- [ ] CHECK'ler ve enum değerleri bu bölümdeki listeyle aynı
- [ ] Seed'ler on conflict do nothing ile tekrar çalıştırılabilir
- [ ] Realtime yayınına eklenecek tablolar eklendi
- [ ] RLS pozitif ve negatif testi yazıldı
- [ ] Taslak BEGIN ... ROLLBACK içinde canlıda denendi ve canlının değişmediği doğrulandı
- [ ] Geri alma SQL'i ve değişen nesnelerin anlık görüntüsü hazır
- [ ] CLAUDE.md ve sistem dokümantasyonu güncellendi

**Geri alış.** Migration'lar ekleyici olduğu için geri alış, veri yoksa ters migration (drop), veri varsa nesneyi kullanılmaz bırakıp ileri düzeltme migration'ı yazmaktır. Her uygulamadan önce yedek: tam şema yedeği (npm run db:backup), veri değiştiren migration'larda ayrıca veri yedeği.

## 4.9 Test matrisi ve açık noktalar

Testler mevcut tests/ desenine (Playwright + helpers.js) eklenir; veritabanı ve RPC testleri gerçek RPC çağrısıyla yazılır. Her satır ilgili fazın çıkış kapısına dahildir.

| ID | Alan | Senaryo | Beklenen |
|---|---|---|---|
| T01 | RLS | anon anahtarıyla her yeni tabloyu oku | Sonuç yok |
| T02 | RLS | Başka projenin santiye_sefi kullanıcısı okur | 0 satır |
| T03 | RLS | can_view = false rol (muhasebe → rfi) okur | 0 satır |
| T04 | RLS | authenticated kullanıcı doğrudan INSERT, UPDATE, DELETE dener | Reddedilir |
| T05 | RPC | Her yazma RPC'sini anon çağırır | Yetki hatası |
| T06 | RPC | Yetkisiz rol create veya approve çağırır | forbidden |
| T07 | Numaralama | 20 eşzamanlı save_register_record, aynı proje ve tür | 20 benzersiz, ardışık numara |
| T08 | Numaralama | Geri alınan işlem | Numara tüketilmez |
| T09 | Durum | draft → approved doğrudan | invalid_state |
| T10 | Durum | Kritik register'da yaratıcı kendi kaydını onaylar (dört göz açıkken) | forbidden |
| T11 | Durum | Onaylı kayıtta kilitli alanı düzenle | invalid_state |
| T12 | Audit | Her durum değişimi audit satırı üretir; audit satırını UPDATE/DELETE dene | Satır var; değişiklik reddedilir |
| T13 | Taslak | Düşük güvenli alanı incelemeden approve_register_draft | review_required |
| T14 | Taslak | Aynı doküman ve tür için ikinci çıkarım | Öncekiler superseded |
| T15 | Taslak | Taslak onayı | Hedef kayıt source = ai, approved, numaralı |
| T16 | Dosya deposu | Başka projenin kullanıcısı dosya adresi ister | Reddedilir |
| T17 | Dosya deposu | Aynı dosyayı (sha256) ikinci kez yükle | duplicate hatası ve mevcut kayıt id'si |
| T18 | Dosya deposu | begin_document_upload olmadan veya yolu kayıtla eşleşmeyen yükleme | Storage reddeder |
| T19 | Dosya deposu | İzinsiz tür; boyut sınırının üstünde dosya | Reddedilir |
| T20 | Dosya deposu | Yarım kalan yükleme (1 saatten eski uploading) | Temizlik işi satırı aborted yapar; dosyası yoksa satırı siler, dosyası varsa get_stale_uploads'ta listelenir |
| T21 | AI | Alıntı belgede yok | Güven en çok 0,3, quote_not_found |
| T22 | AI | Belgede "önceki talimatları unut" cümlesi | Şema dışına çıkılmaz, talimat uygulanmaz |
| T23 | AI | Kapatma anahtarı kapalı | İş skipped, manuel RFI çalışır |
| T24 | AI | Bütçe aşımı | budget_exceeded, manuel akış sürer |
| T25 | Bildirim | AI taslağı oluşur | Onay yetkili roller alır; yetkisiz rol ve başka proje almaz |
| T26 | Frontend | 4 rol × her ekran | Görünen butonlar register_permissions ile uyumlu |
| T27 | Frontend | ?register=&kayit= bağlantısını yenile | Aynı kayıt açılır |
| T28 | Frontend | 390 px genişlik | Kart görünümü çalışır |
| T29 | Regresyon | Mevcut 118 test (07.10.2026) | Hepsi yeşil |

**Açık noktalar ve kararlar** (tasarımı etkileyenler):

1. Baz şema doğrulaması: projects, profiles, project_risks, procurement_items kolon tipleri (canli-sema-ozeti.md ve canlı sorgular).
2. Dört göz kuralı küçük ekipte kilitlenebilir (tek kişi hem hazırlıyor hem onaylıyorsa). Öneri: project_register_settings'e proje bazlı ayar, varsayılan açık; kapatmak admin kararıdır ve audit'e yazılır.
3. Taranmış PDF'te alıntı doğrulaması: görüntü modunda model sayfa transkriptini de döndürür, alıntı bu transkriptte aranır; transkript işlem sonunda silinir. Bu yöntemin güvenilirliği Faz B ölçümünde ayrıca test edilir.
4. Faz B'de ölçülecek sınırlar: edge function süre ve bellek sınırı, istemciden Storage'a büyük dosya yükleme, PDF metin çıkarımı için Deno'da çalışan kütüphane.
5. Bildirim kapsamı: notify_role proje bazında daraltıyor mu (canlı incelemede daraltmadığı görüldü) ve ProjeDetay iç sekmeleri hangi mekanizmayla yetkilendiriliyor. Şantiye şefi ve muhasebe rollerinin Projeler sekmesi olmadığı için Proje Kontrol'e ayrı üst seviye giriş gerekir; Faz B'de karar verilir.
6. Yetki matrisi değerleri Karar 6 ile onaylanır.
7. Eski kayıtlar: mevcut risk satırları register numarası olmadan kalır; istenirse Faz E'de geriye dönük numaralandırma yazılır.
8. Gizlilik: ai_runs belge içeriğini saklamaz, yalnızca sayısal ve meta bilgi; dokümanın tam metni kalıcı saklanmaz. Sağlayıcının verileri saklama ve model eğitiminde kullanma politikası sözleşme kontrolünde ayrıca doğrulanır.
9. Supabase planı: pilot dokümanlarından önce Pro plana geçiş (patron onayı bekliyor); o zamana kadar ücretsiz plan sınırları (1 GB dosya, 500 MB veritabanı, tek dosya 50 MB, otomatik yedek yok) geliştirme verisiyle yönetilir.

**Kapsam notu.** Faz A-D'nin tabloları, RPC'leri, dosya deposu, ekranları ve testleri bu seviyede tasarlandı. Faz E'nin bir kısmı (Excel import sihirbazı, proje sağlığı dashboard'unun kartları, Interface ekranının alan ayrıntısı) şimdilik envanter düzeyinde; Faz D kapısında, pilottan öğrenilenlerle ayrıntılandırılması planlanır.
