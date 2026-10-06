# Proje Kontrol: tasarım (v2) — Claude Code için kaynak dosya

> Bu dosya, `FONS_Diyarbakir_Sistem_Revizyon_Yol_Haritasi.docx` (v1, 12 faz) dosyasının YERİNE geçer. İkisi çelişirse bu dosya geçerlidir.
> v1'den farklar: dosya kaynağı Google Drive (Supabase Storage yalnızca fotoğraf ve ticket ekleri); `schedule_activities` kullanılmıyor (kaldırılmış tablo; planlama kaynağı `project_tasks` + `progress_daily`); AI taslakları hedef tabloya değil `register_drafts` tablosuna yazılır.
> Doküman Bölüm 1-4'ten oluşur. Faz A için ilgili yerler: Bölüm 3 (Faz A tablosu), Bölüm 1 (sekiz karar), Bölüm 4.5 (edge function ve Drive), Bölüm 4.6 (AI), Bölüm 4.8 (migration listesi ve doğrulama sorgusu).
> Diyagramlar (mimari ve takvim) yalnızca Word sürümünde görsel olarak yer alır; içerikleri metinde de anlatılmıştır.

# Bölüm 1 · Yol haritası

## Özet

Hedef: 1 Ocak 2027 saha mobilizasyonunda Document, Drawing, RFI ve Action register'ları Drive + Supabase + AI ile uçtan uca çalışıyor olsun; kalan 12 register mobilizasyondan sonra aynı iskelete eklensin.

Beş ilke:

1. Supabase tek kayıt kaynağı, Google Drive tek dosya kaynağı. Excel yalnızca şablon, import ve export.
2. Ekle, bozma. Satın alma, finans, günlük rapor, ticket ve risk modülleri çalışmaya devam eder; ortak olanlar genişletilir, kopyalanmaz.
3. Dikey dilim. Her faz sonunda kullanıcının gerçekten kullanabildiği bir özellik çıkar; 12 fazı sırayla bitirip sona kadar bir şey göstermeyen plan yok.
4. AI taslak üretir, yetkili kişi onaylar. Onay akışı ve audit çekirdekte baştan vardır, sona bırakılmaz.
5. Register'lar projeden bağımsızdır. Diyarbakır ilk kullanıcıdır; aynı yapı sonraki projelerde proje sihirbazından açılır.

v1 yol haritasından farklar:

| Konu | v1 | v2 |
|---|---|---|
| Yapı | 12 faz, sıralı | 5 faz, dikey dilim, takvimli |
| Güvenlik | Baştan yeniden yap | Mevcut durumu doğrula, açıkları kapat |
| Dosya kaynağı | Supabase Storage, SharePoint ileride | Google Drive, Supabase yalnızca metadata ve uygulama içi yüklemeler |
| AI | Önce embedding ve vektör arama | Önce yapılandırılmış çıkarım; embedding yalnızca arama için, sonra |
| Onay ve audit | Faz 10 | Faz B, çekirdek |
| Kapsam | 16 register birden | Pilotta 4 register (Action mevcut ticket üzerinden), hazır tablolara köprü, kalanlar sonra |

## Sistem değişiklikleri

Mevcut hiçbir tablo, RPC veya ekran silinmiyor ya da yeniden adlandırılmıyor; sistem eklemeyle büyüyor. Katman katman bugün ve sonrası:

| Katman | Bugün | Değişiklik |
|---|---|---|
| Veritabanı | 40 tablo, 7 view; register, WBS, Area, doküman ve genel audit kaydı yok | Yeni: wbs, areas, documents, drawings, rfis, register_links, register_audit, register_permissions, document_jobs, ai_runs; Faz D-E'de kalan register tabloları. Genişler: tickets, project_risks, suppliers, project_tasks (boş bırakılabilir wbs_id ve area_id) |
| Dosya | Supabase Storage: günlük rapor fotoğrafları, ticket ekleri | Proje dokümanları Google Drive Shared Drive'a gider; fotoğraf ve ticket ekleri Storage'da kalır |
| Edge function | 5 adet: agent-chat, create-user, export-project-excel, import-project-excel, manage-user | Yeni: drive-gateway, drive-sync, process-document; Faz E'de kuyruk işleyici. Mevcutlar Faz E'ye kadar değişmez, import-project-excel o zaman register şablonlarıyla genişler |
| Yetki | 4 rol; sekme erişimi roles ve role_allowed_tabs tablolarından | Aynı 4 rol; register × eylem yetkisi register_permissions'ta; agent'lar için ayrı, proje kapsamlı roller |
| Frontend | ProjeDetay sekmeleri, tek /dashboard/* route'u | ProjeDetay içinde "Proje Kontrol" grubu; config tabanlı RegisterList ve RegisterDetail; onay kutusu; yeni bildirim türleri |
| AI | agent-chat: Gemini proxy, istemciden gelen prompt, tool yok | agent-chat aynı kalır. Yeni yol: doküman, yapılandırılmış çıkarım, register_drafts'ta taslak, onay; güven skoru, kaynak gösterimi, ai_runs. Sağlayıcı Faz B sonunda ölçümle seçilir, anahtarlar yalnızca edge function secret'ında durur |
| Planlama | project_tasks, progress_daily; predecessor_codes düz metin | Aktivite kimliği task_code olarak kalır; WBS ve Area bağları eklenir; predecessor_codes bu planda değişmez |
| Test ve doküman | 92 Playwright testi; CLAUDE.md güncel referans | Her fazda yeni RLS ve akış testleri (4 rolle); her migration SQL onayıyla uygulanır; CLAUDE.md her fazda güncellenir |

## Başlangıç noktası

Sistem sıfırdan kurulmuyor: 422 migration, 40 tablo, 7 view, 5 edge function ve 92 Playwright testi olan, canlı çalışan bir çekirdek var. Aşağıdakiler zip'teki koddan doğrulandı.

| Alan | Bugünkü durum | Planı nasıl etkiler |
|---|---|---|
| Güvenlik | Bucket'lar private (24.07). save_daily_report ve tickets_insert auth.uid() ve has_project_access ile korunuyor | Faz A'da yeniden yapılmaz, yalnızca yeni tablolar için aynı desen uygulanır |
| Planlama | Kaynak project_tasks + progress_daily; schedule_activities silindi. predecessor_codes düz metin | Activity ID olarak task_code kullanılır; WBS ve Area tabloları yeni |
| Roller | 4 rol: admin, muhasebe, proje_yoneticisi, santiye_sefi | Onay matrisi için yeni roller veya register bazlı yetki kararı gerekir |
| Kalite | Kalite kontrol modülü kullanıcı kararıyla kaldırıldı | NCR ve Inspection geri dönüşü bilinçli karar olmalı |
| AI | agent-chat düz Gemini proxy; tool calling, doküman işleme, pgvector yok | AI katmanı sıfırdan yazılır |
| Dosyalar | Supabase Storage, yalnızca fotoğraf ve ticket ekleri | Drive entegrasyonu yeni |
| Numaralama | request_no için yıl bazlı SEQUENCE ve retry deseni var | RFI-DYB-0032 gibi ID'ler için yöntem Faz B'de eşzamanlılık testiyle seçilir |
| Proje kimliği | project_id text | Yeni tabloların FK'leri text olmalı |
| Proje şablonu | import-project-excel ve proje sihirbazı var | Register şablonları sihirbaza bağlanır |

## Faz A'dan önce kapanması gereken kararlar

Sekiz karar, Faz A'nın ilk haftasında kapanmazsa Faz B'nin şeması kilitlenemez. Öneri sütunu benim görüşüm; son söz sende.

| # | Karar | Öneri | Alternatif ve bedeli |
|---|---|---|---|
| 1 | Drive erişim modeli | Tek servis hesabı Shared Drive'a erişir; kullanıcılar dosyayı uygulama üzerinden açar (edge function has_project_access kontrol eder, dosyayı iletir) | Drive ACL'ini kullanıcıya vermek: Drive yetkisi ile Supabase RLS ayrı ayrı yönetilir, tutarsızlık riski doğar |
| 2 | Drive klasör yapısı | Shared Drive > Proje > Disiplin > Register türü; adlandırma kuralı DOC-DYB-0125_R03 | Serbest yapı: AI ve reconciliation dosyayı güvenilir şekilde bulamaz |
| 3 | Revizyon modeli | Her revizyon ayrı Drive dosyası, documents tablosunda ayrı satır, supersedes_id ile zincir | Drive'ın kendi sürümleri: revizyon R03 gibi proje terimleriyle izlenemez |
| 4 | Roller | Mevcut 4 rolü koru, register bazında can_create / can_approve yetki tablosu ekle | 19 role geri dönmek: daha önce bilinçli olarak küçültülmüştü |
| 5 | AI sağlayıcı ve gizlilik | Önce İsdemir OYAK dokümanlarının harici modele gönderilmesi için onay al. Sağlayıcıyı Faz B sonunda, 10-15 gerçek dokümanı iki sağlayıcıya aynı alan şemasıyla verip alan doğruluğu, Türkçe teknik metin, PDF okuma, JSON güvenilirliği ve maliyete göre seç | Onay gelmezse AI yalnızca metadata ve kendi yazdığımız özetlerle çalışır |
| 6 | NCR ve Inspection | Pilotta yok; mobilizasyondan sonra, kalite modülünün neden kaldırıldığı hatırlanarak ele alınır | Pilotta eklemek: kapsam büyür ve 1 Ocak'a yetişmez |
| 7 | Agent kimliği | Her agent için ayrı, proje kapsamlı rol; yalnızca izinli RPC'leri çağırır, service_role ile serbest tablo erişimi yok; çıktı taslak veya bulgu olarak yazılır | Kullanıcı yetkisiyle çalıştırmak: gece koşusunda oturum yok, yetki sınırı belirsizleşir |
| 8 | İlk agent'lar | Yalnızca Reconciliation ve Planning; diğerleri tool'lar oturunca eklenir | Tüm agent'ları birden kurmak: tool'lar yokken bakım ve maliyet yükü |

Takvim tahmindir; ekip kapasitesi netleşince Faz C ve D süreleri orantılı kayar.

## Hedef mimari

(Diyagram: Hedef mimari: kayıt Supabase'de, dosya Drive'da; AI yalnızca taslak yazar; yalnızca Word sürümünde görsel)

Kullanıcı dosyaya yalnızca drive-gateway üzerinden ulaşır ve yetkisi her çağrıda kontrol edilir. AI çıktısı Supabase'e register_drafts tablosuna taslak olarak yazılır; onay verilmeden gerçek kayıt oluşmaz. Excel yalnızca giriş ve çıkış kapısıdır.

## Fazlar ve takvim

Faz A-D 28 Aralık'ta biter, 1 Ocak mobilizasyonuna 4 gün tampon kalır; pilot (Faz C) 7 Aralık'ta kullanıma hazır olur. Faz E mobilizasyondan sonra başlar, süresi Faz C sonunda gerçek hıza bakılarak netleşir.

(Diyagram: Faz takvimi: pilot 7 Aralık'ta hazır, Faz D mobilizasyondan 4 gün önce biter; yalnızca Word sürümünde görsel)

| Faz | Kullanıcının eline geçen |
|---|---|
| A · Zemin ve kararlar | Yazılı kararlar, Drive bağlantısı, doğrulanmış güvenlik durumu |
| B · Çekirdek | Register iskeleti: durum, onay, audit, numaralama, WBS ve Area |
| C · Pilot dilim | Document, Drawing, RFI, Action: dosyadan taslak, onay, Drive'da dosya |
| D · İkinci dilim | Risk, Change, Claim, Submittal, Material Approval; Procurement ve Subcontractor köprüleri |
| E · Mobilizasyon sonrası | Reconciliation, agent'lar, proje sağlığı dashboard'u, kalan register'lar, Excel import sihirbazı |

## Faz faz değişiklik planı

Her faz kendi migration grubuyla ayrı çıkar ve çıkış kapısı geçilmeden sonraki faz başlamaz. Mevcut akışlar yeni tablolara bağımlı olmadığı için A-C arasında geri dönüş ucuzdur. İş paketlerinin ayrıntısı aşağıdaki Backend ve Frontend bölümlerinde.

| Faz | Ne değişir | Dokunulmaz ve geri dönüş | Çıkış kapısı |
|---|---|---|---|
| A · Zemin ve kararlar | Sekiz karar yazılır. Google Cloud projesi, servis hesabı, Shared Drive, klasör şablonu. drive-gateway iskeleti. RLS, RPC ve Storage durumu testle doğrulanır. AI sağlayıcı ölçüm seti hazırlanır: 10-15 gerçek doküman ve beklenen alanları | Şema değişmez, geri dönüş gerekmez; yalnızca yeni edge function ve Drive kurulumu eklenir | Yetkisiz kullanıcı drive-gateway'den dosya alamıyor; sekiz karar yazılı; İsdemir OYAK gizlilik cevabı alınmış veya AI'ın yalnızca metadata ile çalışacağı yazılmış |
| B · Çekirdek | wbs, areas ve boş bırakılabilir FK'ler; ortak register çekirdeği (durum, onay, audit, numaralama); register_permissions; documents; RegisterList ve RegisterDetail iskeleti. Faz sonunda iki sağlayıcıyla ölçüm | Mevcut ekranlar ve RPC'ler yeni nesnelere bağlı değil; sorun çıkarsa yeni tablo kullanılmaz bırakılır, düzeltme migration'ı yazılır | Aynı numara iki kez üretilmiyor; 4 rolle onay matrisi çalışıyor; 92 testin regresyonu yeşil; sağlayıcı ölçümü sonuçlanmış |
| C · Pilot dilim | Sağlayıcı seçilir. drawings, rfis, register_links; tickets genişletmesi; drive-sync; document_jobs, process-document, ai_runs; Document, Drawing, RFI, Action ekranları; onay kutusu | Ticket'ın mevcut akışı aynı çalışır (yeni kolonlar boş geçilebilir). process-document bir ayarla kapatılabilir, manuel RFI girişi çalışmaya devam eder | Geçmiş bir projenin gerçek RFI PDF'inden taslak çıkıyor, onaylanıyor, audit'te görünüyor; başka projenin kullanıcısı göremiyor |
| D · İkinci dilim | Submittal, Material Approval, Change, Claim; Risk taslağı ve onayı; Procurement ve Subcontractor köprüleri; AI Analiz paneli (yalnızca okuma) | Satın alma ve finans akışlarına yazma yok, yalnızca okuma bağları; köprü view'ları kaldırılarak geri dönülür | Risk taslağı onaysız kesinleşmiyor; mevcut satın alma ve finans testleri yeşil |
| E · Mobilizasyon sonrası | Reconciliation ve Planning agent'ları; agent rolleri; pg_cron ve iş kuyruğu; ai_runs görünümü; proje sağlığı dashboard'u; kalan register'lar; Excel import sihirbazı; gerekirse pgvector | Mevcut sohbet agent'ları ve agent-chat değişmez; cron işi kapatılarak agent'lar durdurulur | Agent'lar yalnızca izinli RPC'leri çağırıyor; her koşu ai_runs'ta; bir gece koşusunun maliyeti ölçülmüş |

## 16 register: mevcut tablolarla eşleştirme

16 register'ın 5'i hazır bir tabloya köprü kurularak çözülür, 2'si kalite kararına bağlıdır, 9'u yenidir. Yeni olanlar ortak sütunlarla (project_id, wbs_id, area_id, activity_code, durum, öncelik, sorumlu, audit) açılır; ayrı tablo, tipli kolon, EAV veya JSONB yok.

| # | Register | Mevcut karşılık | Karar | Faz |
|---|---|---|---|---|
| 1 | Document | Yok (ticket_attachments ve daily_report_photos ayrı) | Yeni documents, Drive dosya kimliğini tutar | B-C |
| 2 | Drawing | Yok | Yeni drawings, documents'a bağlı, revizyon zinciri | C |
| 3 | RFI | Yok | Yeni; çizim, aktivite ve Action'a bağlı | C |
| 8 | Action | tickets | Genişlet: register numarası, WBS ve Area bağı | C |
| 4 | Technical Submittal | Yok | Yeni | D |
| 5 | Material Approval | procurement_items ile ilişkili BOM eşleştirme | Yeni, procurement_items'a bağlı | D |
| 10 | Risk | project_risks (otomatik kural motoru) | Genişlet: manuel ve AI taslağı, onay | D |
| 11 | Change / Variation | Yok | Yeni | D |
| 12 | Claim & Notice | Yok | Yeni, Change'e bağlı, ihbar süresi alanı | D |
| 6 | Procurement | purchase_requests, purchase_request_items, purchase_offers | Köprü: doküman, risk ve aktivite bağları | D |
| 7 | Subcontractor | suppliers | Genişlet: tür alanı (tedarikçi, taşeron) | D |
| 9 | Decision | Yok | Yeni, hafif | E |
| 15 | Interface | Yok | Yeni | E |
| 16 | Payment | invoices, invoice_payments, financial_transactions | Köprü: register görünümü, yeni tablo yok | E |
| 13 | NCR | Kaldırılan kalite modülü | Karar #6'ya bağlı | E |
| 14 | Inspection | Kaldırılan kalite modülü | Karar #6'ya bağlı | E |

## Backend iş paketleri

Her migration CLAUDE.md kuralı gereği SQL gösterilip onay alınarak uygulanır, her pakette pozitif ve negatif RLS testi yazılır.

| Faz | İş paketi | Çıktı |
|---|---|---|
| A | Mevcut RLS, RPC ve Storage durumunu pozitif/negatif testle doğrula | Yazılı doğrulama raporu, açık çıkarsa düzeltme migration'ı |
| A | Google Cloud projesi, servis hesabı, Shared Drive, klasör şablonu | Drive'a edge function'dan okuma ve yazma çalışıyor |
| A | drive-gateway edge function iskeleti: liste, indir, yükle; her çağrıda auth.uid() ve has_project_access | Yetkisiz kullanıcı dosya alamıyor (test ile kanıtlı) |
| B | wbs ve areas tabloları; project_tasks'a boş bırakılabilir wbs_id ve area_id FK | Mevcut ekranlar bozulmadan WBS/Area/Activity zinciri kurulur |
| B | Ortak register çekirdeği: record_state (draft, pending_approval, approved, rejected), source (manual, ai, import), onaylayan ve zaman; AI taslakları register_drafts tablosunda | Her register aynı durum makinesini kullanır |
| B | Genel register_audit trigger'ı ve register_permissions (rol × register × eylem) | Kim neyi ne zaman değiştirdi izlenir; 4 rolle onay matrisi çalışır |
| B | Proje ve tür bazlı atomik numaralama (RFI-DYB-0032); yöntem request_no deneyimine göre Faz B başında seçilir | Çakışma ve atlama yok |
| B | documents: drive_file_id, klasör, mime, revizyon, supersedes_id, hash, ai_status | Dosya Drive'da, kayıt Supabase'de |
| C | drawings, rfis; tickets genişletmesi; register_links (kaynak → hedef, çoktan çoğa) | RFI ↔ çizim ↔ aktivite ↔ Action bağları |
| C | drive-sync: Drive değişikliklerini documents metadata'sına yansıtır | Drive'a atılan dosya uygulamada görünür |
| C | document_jobs kuyruğu ve process-document: metin çıkarımı, tür tespiti, yapılandırılmış alan çıkarımı, taslak kayıt | Yüklenen RFI PDF'inden taslak RFI çıkar; her model çağrısı ai_runs tablosuna yazılır (model, token, süre, sonuç) |
| C | RPC'ler: get_register_list, get_register_detail, create_*_draft, approve_register_record | Frontend ham tabloya değil RPC'ye bağlanır |
| D | Submittal, Material Approval, Change, Claim tabloları; Risk, Procurement, Subcontractor köprüleri | İkinci dilim register'ları |
| E | Reconciliation görünümleri, agent tool RPC'leri (get_schedule_risk_overview gibi), dashboard view'ları, kalan register'lar | Agent'lar ham tabloya değil kontrollü RPC'ye bağlanır |
| E | Agent kimliği: her agent için proje kapsamlı rol, yalnızca izinli RPC'lere EXECUTE yetkisi | Oturumsuz gece koşusunda da yetki dışı veri okunamaz |
| E | Kuyruk tabanlı koşu: pg_cron iş kuyruğu tablosuna satır atar, edge function projeye ve register'a bölünmüş işi işler | Süre sınırına takılmayan, izlenebilir, maliyeti ölçülebilir gece taraması |

## Frontend iş paketleri

Register'lar proje kapsamlı olduğu için global sidebar'a 24 madde eklenmez; ProjeDetay içine tek bir "Proje Kontrol" sekme grubu girer. Böylece role_sidebar_items yapısı ve tek /dashboard/* route'u bozulmaz. 16 ayrı ekran yerine config'ten üretilen tek liste ve tek detay bileşeni yazılır.

| Faz | İş paketi | Çıktı |
|---|---|---|
| A | Mevcut ProjeDetay sekme yapısı ve useUrlSyncedSelection deseni incelenir, "Proje Kontrol" grubunun yeri belirlenir | Kısa tasarım notu |
| B | Config tabanlı RegisterList ve RegisterDetail iskeleti: sütunlar, filtreler, durum rozeti, yetkiye göre aksiyon | Tek bileşenle yeni register eklenebilir |
| B | Ortak parçalar: durum rozeti, AI güven rozeti (yeşil/sarı/kırmızı), audit geçmişi paneli, ilişkili kayıtlar paneli | Tüm register'larda aynı görünüm |
| C | Document ve Drawing ekranları: Drive'dan yükleme, revizyon zinciri, uygulama içinde önizleme (edge function üzerinden) | Dosya Drive'a gider, kayıt oluşur |
| C | RFI ekranı ve "Dosyadan RFI oluştur" akışı: yükle, AI taslağı gör, sarı/kırmızı alanları düzelt, onayla | Pilotun ana senaryosu |
| C | Action ekranı mevcut ticket ekranından türetilir, register numarası ve WBS/Area alanı eklenir | Yeni ekran yazılmaz, mevcut genişler |
| C | Onay kutusu: yetkili kullanıcının bekleyen taslakları; bildirim sistemine yeni entity_type | Taslaklar kaybolmaz |
| D | Risk, Change, Claim, Submittal, Material Approval ekranları config ile eklenir | Her biri küçük bir config ve özel alanlar |
| D | Her kayıtta "AI Analiz" paneli: ilişkili çizim, aktivite, benzer kayıt | Yalnızca okuma, kayıt değiştirmez |
| E | Proje sağlığı dashboard'u, reconciliation bulguları, Excel import sihirbazı, kalan register'lar | Yönetim görünümü |

Yeni ekranlar için Playwright testleri mevcut tests/ desenine eklenir; rol testleri 4 rolle yazılır.

## AI katmanı ve onay modeli

AI hiçbir kaydı kendi başına kesinleştirmez: dosyadan taslak çıkarır, yetkili kişi onaylar. Pilot akışı:

1. Dosya Drive'a (veya uygulamadan Drive'a) yüklenir; documents kaydı ve document_jobs satırı oluşur.
2. process-document metni çıkarır (taranmış PDF için OCR), dosya türünü tespit eder.
3. Tür belliyse ilgili register'ın kolonlarından üretilen şemaya göre yapılandırılmış alan çıkarımı yapılır.
4. Çizim no, aktivite kodu, WBS ve Area mevcut kayıtlarla eşleştirilir; eşleşmeyen alan boş kalır, uydurulmaz.
5. Her alan için güven skoru ve kaynak (sayfa, paragraf) saklanır; taslak register_drafts tablosunda ai_draft durumuyla açılır.
6. Kullanıcı yalnızca sarı ve kırmızı alanları kontrol eder, onaylar; kayıt approved olur ve audit'e yazılır.

Kurallar:

- Document metadata (başlık, tür, revizyon) yüksek güvende otomatik doldurulabilir. Risk, Claim, Change, NCR, Payment ve Decision için hiçbir alan otomatik kesinleşmez.
- Sözleşme, ihbar süresi ve maliyet etkisi gibi hukuki veya ticari yorumlar AI'ın kararı değil, onaylayana gösterilen uyarıdır.
- Güven eşikleri pilotta alan bazında doğruluk ölçülerek ayarlanır; baştan sabit yüzde verilmez.
- DWG doğrudan okunmaz; PDF çıktısı ve dosya adı kuralı kullanılır.
- AI anahtarları yalnızca edge function secret'ında durur. Çağrı kullanıcının JWT'siyle yapılır ve proje yetkisi kontrol edilir. Mevcut agent-chat'teki gibi istemciden system prompt kabul edilmez.
- Sağlayıcı seçimi Karar #5'e bağlıdır.

Faz E'de eklenenler: benzer RFI ve sözleşme maddesi araması (pgvector, yalnızca gerçekten gerekirse) ve Reconciliation; örneğin register'da RFI açık, Drive'da cevap PDF'i var.

**Agent'lar (Faz E)**

- SQL/RPC hesaplar, AI yorumlar. "7 günden eski açık RFI'lar" bir sorgudur, modele gitmez; "hangisi kritik yolu etkiliyor ve neden" sorusu modele gider. Böylece maliyet ve hata payı düşer.
- Başlangıçta iki agent: Reconciliation (register ile Drive farkı) ve Planning (gecikme ve kritik yol özeti). Diğerleri tool'ları oturunca eklenir.
- Kimlik: her agent için ayrı, proje kapsamlı rol; yalnızca izinli RPC'leri çağırır. Gece koşusunda kullanıcı oturumu olmadığı için service_role ile serbest tablo erişimi verilmez. Çıktı taslak (register_drafts) veya bulgu (ai_findings) olarak yazılır.
- Çalışma kaydı: ai_runs tablosu; hangi agent, hangi tool, model, token, süre, sonuç. Maliyet ve "bu bulgu nereden çıktı" sorusu buradan yanıtlanır.
- Orkestrasyon: ayrı bir servis yok. pg_cron iş kuyruğuna satır atar, edge function projeye veya register'a bölünmüş işi işler (süre sınırı nedeniyle).
- Mevcut sohbet agent'ları ve agent-chat olduğu gibi kalır; yeni agent'lar ayrı yoldan (kuyruk + RPC) çalışır.
- Model seçimi: basit sınıflandırma için hızlı model, kritik analiz için güçlü model. Sağlayıcı Faz B sonundaki ölçümle seçilir; bütçe, pilotta ölçülen doküman başına token ve tek gece koşusunun maliyetinden çıkarılır.

## Kabul kriterleri ve riskler

Bir faz, kabul kriteri sağlanmadan kapanmış sayılmaz.

| Faz | Kabul kriteri |
|---|---|
| A | Yetkisiz kullanıcı drive-gateway üzerinden dosya alamıyor; sekiz karar yazılı ve CLAUDE.md'ye işlenmiş |
| B | Eşzamanlı testte aynı register numarası iki kez üretilmiyor; 4 rolle onay matrisi testleri geçiyor; mevcut 92 testin regresyonu yeşil |
| C | Geçmiş bir projenin gerçek RFI PDF'inden taslak çıkıyor, kullanıcı onaylıyor, audit'te görünüyor; başka projenin kullanıcısı kaydı ve dosyayı göremiyor |
| D | Risk taslağı Proje Yöneticisi onayı olmadan kesinleşmiyor; Procurement ve Payment köprüleri mevcut akışları bozmuyor |
| E | Reconciliation, Drive'daki ve register'daki durum farkını bulgu olarak gösteriyor; agent'lar yalnızca RPC üzerinden veri okuyor, her koşu ai_runs'a yazılıyor, oturumsuz gece koşusu yetki dışı veriye ulaşamıyor |

| Risk | Etki | Önlem |
|---|---|---|
| Kapasite beklenenden düşük | Pilot 1 Ocak'a yetişmez | Kapsamı küçült: önce Document + RFI, Drawing ve Action sonra |
| Drive'da dosya elle taşınır veya silinir | Kayıt ile dosya ayrışır | Bağ yol ile değil drive_file_id ile kurulur; drive-sync ve Reconciliation |
| Büyük veya taranmış PDF'ler | Edge function zaman aşımı | Kuyruk tabanlı işleme, boyut sınırı, başarısızlıkta yeniden deneme |
| AI yanlış alan çıkarır | Hatalı kayıt | Taslak + onay, kaynak gösterimi, pilotta alan bazında doğruluk ölçümü |
| Doküman gizliliği | Sözleşme ihlali | Karar #5 kapanmadan harici modele dosya gönderilmez |
| Canlı modüllerin bozulması | Diğer projeler etkilenir | Boş bırakılabilir FK, ekle-geçir-kaldır kuralı, her migration'da regresyon testi |
| Rol yapısı yetersiz kalır | Onay akışı tıkanır | register_permissions ile rolü çoğaltmadan yetki ayrıştırılır |


# Bölüm 2 · Dokümanın açıklaması

Bu bölüm, mevcut Fons sistemini bozmadan üzerine proje kontrol katmanı eklemeyi anlatır: dosyalar Google Drive'da durur, kayıtlar Supabase'de tutulur, AI yalnızca taslak üretir ve onayı insan verir. Plan, 1 Ocak 2027 mobilizasyonuna yetişecek şekilde kurgulanmıştır.

## 1. Neden yeni bir sistem değil, ekleme

Kod 422 migration, 40 tablo ve 92 test içeriyor ve canlı çalışıyor. Satın alma, finans, günlük rapor, ticket ve risk modülleri bunun içinde. Yeniden yazmak hem zaman kaybı hem risk olurdu. Bu yüzden mevcut tablolar silinmiyor ya da yeniden adlandırılmıyor, yenileri ekleniyor. Bu, CLAUDE.md'deki "ekle, geçir, sonra eskiyi kaldır" kuralıyla da uyumlu.

## 2. Temel yapı: üç kaynak, bir kural

| Parça | Rolü |
|---|---|
| Supabase | Kaydın tek kaynağı: RFI, çizim, risk, audit, yetki |
| Google Drive | Dosyanın tek kaynağı: PDF, DWG, Word |
| Excel | Yalnızca şablon, toplu giriş ve dışa aktarma; çalışan sistem değil |

Kural: aynı bilgi iki yerde tutulmaz. RFI-032'nin durumu Supabase'de, cevap PDF'i Drive'dadır. Kayıt dosyaya Drive dosya kimliğiyle bağlanır, dosya yoluyla değil; biri dosyayı başka klasöre taşırsa bağ kopmaz.

Kullanıcı dosyayı Drive'dan doğrudan değil, uygulama üzerinden açar. Uygulama her seferinde proje yetkisini kontrol eder, sonra dosyayı iletir. Böylece yetki iki yerde (Drive ve Supabase) ayrı ayrı yönetilmez.

## 3. 16 register nasıl çözülüyor

Hepsi sıfırdan yazılmıyor:

- 5'i hazır tabloya köprü: Procurement (satın alma talepleri), Subcontractor (tedarikçiler), Action (ticket'lar), Risk (proje riskleri), Payment (faturalar ve ödemeler).
- 9'u yeni: Document, Drawing, RFI, Submittal, Material Approval, Change, Claim, Decision, Interface.
- 2'si karara bağlı: NCR ve Inspection. Kalite kontrol modülü daha önce bilinçli olarak kaldırılmıştı; geri dönüşü yine bilinçli bir karar olmalı.

Yeni tablolar ortak sütunlarla açılır: proje, WBS, Area, aktivite kodu, durum, öncelik, sorumlu. Böylece "bu RFI hangi çizime ve hangi aktiviteye bağlı" sorusu cevaplanabilir.

## 4. AI nasıl çalışıyor: örnek akış

Bir RFI PDF'i Drive'a yüklenir:

1. Sistem dosyanın kaydını açar ve işleme kuyruğuna atar.
2. process-document metni çıkarır, dosyanın RFI olduğunu tespit eder.
3. RFI register'ının kolonlarına göre alanları çıkarır: konu, çizim no, aktivite, öncelik.
4. Çizim no ve aktivite kodunu mevcut kayıtlarla eşleştirir. Eşleşmeyen alan boş kalır, uydurulmaz.
5. Her alan için güven skoru ve kaynak (sayfa, paragraf) saklanır. Taslak, register_drafts tablosunda ai_draft durumuyla açılır.
6. Kullanıcı yalnızca sarı ve kırmızı alanları kontrol edip onaylar. Kayıt kesinleşir, audit'e yazılır.

Risk, Claim, Change, NCR, Payment ve Decision için hiçbir alan otomatik kesinleşmez. Sözleşme ve ihbar süresi yorumları AI'ın kararı değil, onaylayana gösterilen uyarıdır.

Gece çalışan agent'lar ayrı bir konudur. Başlangıçta yalnızca ikisi vardır: Reconciliation (register ile Drive arasındaki farkı bulur) ve Planning (gecikme ve kritik yol özeti çıkarır). Bu agent'ların kullanıcı oturumu olmadığı için her birine ayrı, proje kapsamlı bir rol verilir ve yalnızca izinli RPC'leri çağırabilir.

Bir kural daha: "7 günden eski açık RFI'lar" gibi sorguları veritabanı yapar; AI'a yalnızca "hangisi kritik yolu etkiliyor ve neden" gibi yorum gerektiren sorular gider. Her model çağrısı ai_runs tablosuna yazılır; maliyet ve "bu bulgu nereden çıktı" sorusu oradan izlenir.

## 5. Fazlar ve takvim

| Faz | Tarih (tahmin) | Ne olur |
|---|---|---|
| A · Zemin ve kararlar | 6-19 Eki | Sekiz karar, Drive kurulumu, güvenlik testleri, AI ölçüm seti |
| B · Çekirdek | 20 Eki - 9 Kas | WBS ve Area, durum ve onay makinesi, audit, numaralama, documents; sağlayıcı ölçümü |
| C · Pilot dilim | 10 Kas - 7 Ara | Document, Drawing, RFI, Action uçtan uca |
| D · İkinci dilim | 8-28 Ara | Risk, Change, Claim, Submittal, Material Approval, köprüler |
| E · Mobilizasyon sonrası | Ocak'tan sonra | Agent'lar, dashboard, kalan register'lar, Excel import |

Pilot 7 Aralık'ta hazır olur, Faz D mobilizasyondan 4 gün önce biter. Takvim bir tahmindir; ekip kapasitesi bilinmeden yazıldı. Yetişmezse kapsam küçültülür: önce Document ve RFI.

Her fazın bir çıkış kapısı vardır. Örneğin Faz B'de aynı numaranın iki kez üretilmemesi ve 92 testin yeşil kalması, Faz C'de gerçek bir RFI PDF'inden taslak çıkıp onaylanması gerekir.

## 6. Sekiz karar

Bunlar Faz A'nın ilk haftasında kapanmalıdır, çünkü Faz B'nin şeması onlara bağlıdır:

1. Drive erişimi: servis hesabı + uygulama üzerinden açma
2. Klasör yapısı ve adlandırma (DOC-DYB-0125_R03)
3. Revizyon: her revizyon ayrı dosya ve ayrı satır
4. Roller: mevcut 4 rol + register bazlı yetki tablosu
5. AI sağlayıcı: önce gizlilik izni, sonra pilotta iki sağlayıcıyı ölçerek seçim
6. NCR ve Inspection: pilotta yok
7. Agent kimliği: her agent için ayrı, proje kapsamlı rol
8. İlk agent'lar: yalnızca Reconciliation ve Planning

En kritik olanı #5'tir. İsdemir OYAK dokümanlarının harici bir modele gönderilmesi için sözleşme açısından izin gerekebilir. İzin gelmezse AI yalnızca metadata ve özetlerle çalışır, planın AI kısmı küçülür.

## 7. Doğrulanmamış noktalar

- Drive API'nin kota ve dosya boyutu sınırları bu dokümanda doğrulanmadı; Faz A'da denenmeli.
- Edge function süre sınırı yüzünden uzun işler kuyruğa bölünüyor; gerçek sınır Faz C'de ölçülecek.
- Sağlayıcı seçimi kasıtlı olarak açık bırakıldı: karar ölçüme dayanmalı, tavsiyeye değil.

## 8. Sıradaki adım

Sekiz karar kabul edilirse kararları CLAUDE.md'ye işleyecek metin ve Drive kurulum kontrol listesi hazırlanır ve Faz A başlar.


# Bölüm 3 · Uygulama takvimi (6 Ekim 2026 - 1 Ocak 2027)

Bu takvim 12 haftayı Drive, Supabase, edge function, frontend, AI ve test kollarında haftalık iş paketlerine böler; her fazın sonunda bir çıkış kapısı vardır ve kapı geçilmeden sonraki faz başlamaz. Tarihler tahmindir; 29 Ekim resmî tatil olduğu için Faz B'nin ikinci haftası kısadır.

## Başlamadan önce (6 Ekim)

Bu altı madde Faz A'nın ilk haftasını kilitler; hepsi senin tarafında.

- [ ] Google Workspace yönetici yetkisi var mı bak. Yoksa yöneticiyi Faz A'nın ilk haftasına çağır; servis hesabı ve Shared Drive için gerekli.
- [ ] `npm run db:backup` ile veritabanı yedeği al (repoda hazır script var).
- [ ] Yeni bir git dalı aç. Repoda vercel.json var; ana dala giren her şey yayına gidebilir, bu yüzden migration ve yeni kod ayrı dalda ilerler.
- [ ] Ölçüm seti için 10-15 gerçek doküman seç: RFI, çizim listesi, yazışma, submittal. Diyarbakır dokümanı henüz yoksa Adana veya Uşak'tan al; müşteri gizlilik koşullarına bak, belirsizse isimleri karartılmış kopya kullan.
- [ ] İsdemir OYAK dokümanlarının harici bir AI modeline gönderilmesi için izin sorusunu yaz ve gönder (Karar #5). Cevap gelene kadar gerçek Diyarbakır dokümanı modele gitmez.
- [ ] Sekiz kararı yanıtla (Bölüm 2'deki liste).

Not: repodan anladığım kadarıyla ayrı bir staging veritabanı yok, migration'lar canlı veritabanına uygulanıyor. Bu yüzden bu plandaki bütün migration'lar yalnızca ekleyen türdendir ve her biri öncesinde yedek alınarak uygulanır. Ayrı bir staging varsa söyle, akışı ona göre değiştiririm.

## Faz A: zemin ve kararlar (6-19 Ekim)

Bu fazda şema değişmez; yalnızca Drive kurulur, kararlar yazılır, güvenlik doğrulanır ve AI ölçümü hazırlanır. "Kim" sütununda Sen = senin yapman gereken, Birlikte = birlikte yazılacak ve test edilecek.

| Tarih | Kol | İş | Kim | Çıktı |
|---|---|---|---|---|
| 6-12 Eki | Karar | Sekiz kararı kapat; CLAUDE.md'ye "Proje Kontrol kararları" bölümü olarak yaz | Birlikte | Güncel CLAUDE.md |
| 6-12 Eki | Drive | Google Cloud projesi aç, Drive API'yi etkinleştir, servis hesabı oluştur; anahtarı yalnızca Supabase edge function secret'ına koy | Sen | Servis hesabı hazır, anahtar repoda yok |
| 6-12 Eki | Drive | "Fons Projects" Shared Drive'ı aç; Diyarbakır için Proje > Disiplin > Register türü klasör şablonunu kur; servis hesabını üye yap | Sen | Shared Drive ve klasör şablonu |
| 6-12 Eki | Test | Mevcut RLS, RPC ve Storage durumu için yetkisiz kullanıcı ve başka proje kullanıcısı testleri; tests/ altına yeni spec | Birlikte | Doğrulama raporu; açık çıkarsa düzeltme migration'ı |
| 13-19 Eki | Edge | drive-gateway iskeleti: JWT doğrulama, has_project_access, liste, indir, yükle, boyut sınırı (agent-chat'in auth ve 413 desenine benzer) | Birlikte | Edge function yayında |
| 13-19 Eki | Drive | Büyük bir çizim paketi PDF'iyle yükleme ve indirme denemesi: süre, kota ve boyut sınırları ölçülür | Birlikte | Gerçek sınırlar yazılı |
| 13-19 Eki | AI | Ölçüm seti: seçtiğin dokümanlar için elle doldurulmuş "beklenen alanlar" Excel'i (konu, çizim no, aktivite, tarih, öncelik) | Sen | Ölçüm seti |
| 13-19 Eki | AI | Ölçüm betiği: aynı alan şeması, iki sağlayıcı, alan bazında doğruluk, süre ve maliyet tablosu; henüz çalıştırılmaz | Birlikte | Betik hazır |
| 13-19 Eki | Frontend | ProjeDetay sekme yapısı, useUrlSyncedSelection ve role_sidebar_items incelenir; "Proje Kontrol" grubunun yeri ve URL şeması belirlenir | Birlikte | Bir sayfalık tasarım notu |

Çıkış kapısı (19 Ekim): yetkisiz kullanıcı drive-gateway'den dosya alamıyor, sekiz karar yazılı, gizlilik sorusu gönderilmiş.

## Faz B: çekirdek (20 Ekim - 9 Kasım)

İlk migration'lar bu fazda başlar. Hepsi yalnızca ekleyicidir, mevcut ekranlar ve RPC'ler yeni nesnelere bağlı değildir. "Proje Kontrol" grubu bu fazda yalnızca admin'e görünür.

| Tarih | Kol | İş | Kim | Çıktı |
|---|---|---|---|---|
| 20-26 Eki | Supabase | Migration 1: wbs, areas (project_id text FK); project_tasks'a boş bırakılabilir wbs_id, area_id; RLS has_project_access ile | Birlikte | Tablolar ve RLS testi |
| 20-26 Eki | Supabase | Migration 2: register denetim altyapısı: genel register_audit trigger fonksiyonu ve updated_at fonksiyonu (durum alanları her register tablosunda yer alır) | Birlikte | Audit çalışıyor |
| 20-26 Eki | Supabase | Diyarbakır WBS ve Area verisi Excel'den tek seferlik yüklenir (veri script'i, migration değil) | Sen | Diyarbakır WBS ve Area dolu |
| 20-26 Eki | Frontend | RegisterList ve RegisterDetail iskeleti, registerConfig.js (register başına kolon, filtre, form alanı) | Birlikte | Config'ten üretilen boş liste ve detay |
| 27 Eki - 2 Kas | Supabase | Migration 3: register_permissions (rol × register × eylem) ve get_my_register_permissions RPC; 4 rol için varsayılan izinler | Birlikte | Onay matrisi çalışıyor |
| 27 Eki - 2 Kas | Supabase | Migration 4: proje ve tür bazlı atomik numaralama (RFI-DYB-0032 biçimi); yöntem request_no deneyimine göre bu hafta seçilir | Birlikte | Eşzamanlı testte çakışma yok |
| 27 Eki - 2 Kas | Frontend | Ortak bileşenler: durum rozeti, AI güven rozeti (yeşil/sarı/kırmızı), audit paneli, ilişkili kayıtlar paneli | Birlikte | Bileşenler hazır |
| 27 Eki - 2 Kas | Not | 28 Ekim yarım gün, 29 Ekim resmî tatil: bu hafta kapasite yaklaşık bir gün düşük | | |
| 3-9 Kas | Supabase | Migration 5: documents (drive_file_id, drive_folder_id, ad, mime, revizyon, supersedes_id, hash, ai_status) ve RLS; get_register_list, get_register_detail RPC iskeleti | Birlikte | Tablo ve RPC'ler |
| 3-9 Kas | Drive | Yükleme akışı: drive-gateway dosyayı Drive'a koyar ve documents satırını sunucu tarafında açar | Birlikte | Yüklenen dosya hem Drive'da hem tabloda |
| 3-9 Kas | AI | Ölçüm betiği iki sağlayıcıyla çalıştırılır (gizlilik izni durumuna göre kapsam belirlenir); alan bazında doğruluk, süre, maliyet raporu | Birlikte | Sağlayıcı ölçüm raporu |
| 3-9 Kas | Frontend | ProjeDetay'a "Proje Kontrol" sekme grubu (lazy, admin'e görünür); boş register listeleri bağlanır; register ve documents tablolarına realtime yenileme | Birlikte | Sekme canlıda, yalnızca admin görür |
| 3-9 Kas | Test | 92 testin regresyonu; yeni RLS ve numaralama testleri; CLAUDE.md güncellemesi | Birlikte | Faz B kapısı |

Çıkış kapısı (9 Kasım): aynı numara iki kez üretilmiyor, 4 rolle onay matrisi çalışıyor, 92 test yeşil, sağlayıcı ölçümü sonuçlanmış.

## Faz C: pilot dilim (10 Kasım - 7 Aralık)

Bu faz planın kalbidir: Document, Drawing, RFI ve Action uçtan uca çalışır, AI dosyadan RFI taslağı çıkarır. Faz sonunda "Proje Kontrol" grubu admin'den sonra proje_yoneticisi ve santiye_sefi rollerine, register_permissions'a göre açılır.

| Tarih | Kol | İş | Kim | Çıktı |
|---|---|---|---|---|
| 10-16 Kas | AI | Faz B ölçümüne göre sağlayıcı seçilir (Karar #5 kapanır); anahtar edge function secret'ına eklenir | Birlikte | Sağlayıcı seçili |
| 10-16 Kas | Supabase | Migration 6: drawings (document_id, çizim no, revizyon, disiplin, WBS ve Area), rfis (konu, soru, cevap, tarihler, çizim, aktivite task_code, öncelik), register_links (kaynak tip ve id, hedef tip ve id) | Birlikte | Tablolar, RLS ve numaralama bağlı |
| 10-16 Kas | Frontend | Document ekranı: liste, filtre, Drive'a yükleme, drive-gateway üzerinden indirme ve önizleme | Birlikte | Dosya Drive'a gidiyor, kayıt oluşuyor |
| 17-23 Kas | Edge | drive-sync: Drive'daki değişiklikleri documents metadata'sına yansıtır | Birlikte | Drive'a elle atılan dosya uygulamada görünüyor |
| 17-23 Kas | Supabase | Migration 7: document_jobs (iş kuyruğu), ai_settings, ai_runs (model, token, süre, sonuç) ve register_drafts | Birlikte | Kuyruk, kayıt ve taslak tabloları |
| 17-23 Kas | Edge | process-document v1: PDF metin çıkarımı ve doküman türü tespiti; her çağrı ai_runs'a yazılır | Birlikte | Tür tespiti çalışıyor |
| 17-23 Kas | Frontend | Drawing ekranı (revizyon zinciri) ve RFI liste ve detay; manuel RFI girişi tam çalışır | Birlikte | Manuel akış hazır |
| 24-30 Kas | AI | process-document v2: RFI alan çıkarımı, güven skoru, kaynak sayfa, çizim no ve task_code eşleştirmesi; taslağı register_drafts'a yazar | Birlikte | PDF'ten taslak RFI |
| 24-30 Kas | Supabase | RPC'ler: kayıt yazma ve durum geçişleri, taslak onay ve ret (approve_register_draft dahil); bildirim türleri register_record ve register_draft | Birlikte | Onay akışı |
| 24-30 Kas | Frontend | "Dosyadan RFI oluştur" akışı; AI taslak ekranı (sarı ve kırmızı alanlar vurgulu); onay butonları | Birlikte | Pilotun ana senaryosu |
| 1-7 Ara | Supabase | tickets genişletmesi: register numarası, wbs_id, area_id (yeni kolonlar boş geçilebilir) | Birlikte | Mevcut ticket akışı bozulmadan |
| 1-7 Ara | Frontend | Action ekranı mevcut ticket ekranından türetilir; onay kutusu (bekleyen taslaklar) | Birlikte | Action ve onay kutusu |
| 1-7 Ara | Test | Geçmiş projenin gerçek RFI PDF'leriyle pilot; başka proje kullanıcısı negatif testi; process-document kapatma anahtarı testi; regresyon | Birlikte | Faz C kapısı |

Çıkış kapısı (7 Aralık): gerçek bir RFI PDF'inden taslak çıkıyor, onaylanıyor ve audit'te görünüyor; başka projenin kullanıcısı kaydı ve dosyayı göremiyor; AI kapatılsa bile manuel RFI girişi çalışıyor.

## Faz D: ikinci dilim (8-28 Aralık) ve yılbaşı tamponu

Pilotun iskeleti hazır olduğu için bu fazda her register küçük bir tablo, bir config girdisi ve bir AI şemasıdır. Satın alma ve finans akışlarına yazma yapılmaz, yalnızca okuma bağları kurulur.

| Tarih | Kol | İş | Kim | Çıktı |
|---|---|---|---|---|
| 8-14 Ara | Supabase | Migration 8: submittals, material_approvals (procurement_items'a FK) | Birlikte | İki tablo, RLS, numaralama |
| 8-14 Ara | AI | Submittal için çıkarım şeması; process-document yeni türü tanır | Birlikte | Submittal taslağı |
| 8-14 Ara | Frontend | Submittal ve Material Approval ekranları registerConfig.js girdisiyle eklenir | Birlikte | İki yeni ekran |
| 15-21 Ara | Supabase | Migration 9: changes, claims (Change'e bağlı, ihbar süresi alanı); project_risks'e kaynak, durum ve onaylayan kolonları | Birlikte | Tablolar ve onay akışı |
| 15-21 Ara | Frontend | Change, Claim ve Risk ekranları; Risk taslağı yalnızca Proje Yöneticisi onayıyla kesinleşir | Birlikte | Üç ekran |
| 15-21 Ara | AI | Risk, Change ve Claim için taslak çıkarımı; ihbar süresi ve maliyet etkisi yalnızca uyarı olarak gösterilir | Birlikte | Kesinleşmeyen taslaklar |
| 22-28 Ara | Supabase | Köprüler: suppliers'a tür alanı (tedarikçi, taşeron); Procurement için doküman, risk ve aktivite bağları (register_links) | Birlikte | Okuma bağları |
| 22-28 Ara | Frontend | Her kayıtta "AI Analiz" paneli: ilişkili çizim, aktivite, benzer kayıt (yalnızca okuma) | Birlikte | Panel |
| 22-28 Ara | Test | Satın alma ve finans testleri dahil tam regresyon; yetki, audit ve onay testleri 4 rolle | Birlikte | Faz D kapısı |
| 29 Ara - 1 Oca | Tampon | Düzeltmeler; Diyarbakır klasörlerinin Drive'da hazırlanması; kullanıcılara kısa eğitim; CLAUDE.md ve sistem dokümantasyonu güncellemesi | Birlikte | Mobilizasyona hazır |

Çıkış kapısı (28 Aralık): Risk taslağı onaysız kesinleşmiyor, mevcut satın alma ve finans testleri yeşil, bütün yeni ekranlarda 4 rolün yetkisi doğrulanmış.

## Frontend nasıl güncellenecek

Frontend yeni bir uygulama olmuyor: mevcut desenlerin üzerine tek bir yeni sekme grubu ekleniyor. Aşağıdaki "Mevcut" sütunu CLAUDE.md'den, "Değişiklik" sütunu bu plandan; dosya ve klasör adları öneridir.

| Alan | Mevcut | Değişiklik |
|---|---|---|
| Navigasyon | ProjeDetay'ın 7 iç sekmesi; seçili sekme localStorage'da proje bazlı saklanıyor | 8. sekme "Proje Kontrol", lazy() ile yüklenir; Faz B'de yalnızca admin, Faz C sonunda register_permissions'a göre diğer roller |
| URL | /dashboard/projeler/{id}/{sekme}; detay modalları ?talep=, ?ticket= gibi sorgu parametreleriyle useUrlSyncedSelection üzerinden | /dashboard/projeler/{id}/kontrol; seçili register ve kayıt ?register= ve ?kayit= ile; aynı hook kullanılır |
| Veri erişimi | Ham .from() büyük ölçüde RPC desenine taşındı | Register ekranları yalnızca get_register_list, get_register_detail, create_*_draft, approve_register_record RPC'lerini çağırır; ham .from() yok |
| Canlı yenileme | P0 tablolarda useRealtimeRefresh | Faz B'de register ve documents tablolarına eklenir |
| Bileşenler | Her sayfa bir Tab*.jsx | Yeni klasör (öneri) src/components/proje-kontrol/: RegisterList, RegisterDetail, registerConfig.js, durum ve güven rozeti, AuditPanel, LinksPanel, ApprovalInbox, DocumentUpload |
| Yeni register eklemek | Ayrı ekran yazmak | registerConfig.js'e bir girdi (kolonlar, filtreler, form alanları, AI şeması adı); özel alanı olanlara küçük bir bileşen |
| Yetki | roles, role_allowed_tabs; sekme görünürlüğü AuthContext'ten | Buton ve alan görünürlüğü get_my_register_permissions RPC'sinden gelir; asıl güvenlik RLS ve RPC'dedir, arayüz yalnızca gizler |
| Dosya açma | Storage signed URL | Drive dosyaları drive-gateway üzerinden indirilir ve önizlenir; tarayıcıya Drive bağlantısı verilmez |
| Bildirim | entity_type değerleri: purchase_request, invoice, ticket, daily_report, daily_report_reminder, procurement_item_change_request | Yeni register_record ve register_draft; bildirim derin bağlantısı mevcut goToRequest deseniyle ?register=&kayit= URL'ine gider. CLAUDE.md kuralı: alıcı rolün role_allowed_tabs'ında ilgili sekmenin gerçekten olduğunu doğrula |
| Dil ve adlandırma | Arayüz Türkçe, kod İngilizce snake_case | Aynı |
| Test | Playwright, tests/helpers.js | Her yeni ekran için bir spec; roller 4 rolle test edilir; her fazın kapısında tam regresyon |
| Paket boyutu | Sekme bazlı lazy() ile bölünmüş | Yeni sekme grubu da lazy(); ana paket büyümez |

Faz bazında frontend iş listesi yukarıdaki haftalık tablolarda "Frontend" satırları olarak yer alıyor: Faz A tasarım notu, Faz B iskelet ve ortak bileşenler, Faz C Document, Drawing, RFI, Action ve onay kutusu, Faz D kalan ekranlar ve AI Analiz paneli.

## Haftalık rutin, migration akışı ve kayma kuralı

Her pazartesi: önceki haftanın testlerini çalıştır, CLAUDE.md'yi güncelle, o haftanın işlerini bu tablodan al.

Her migration aynı sırayla ilerler:

1. SQL yazılır ve gösterilir; sen onaylamadan uygulanmaz (CLAUDE.md'nin ilk kuralı).
2. npm run db:backup.
3. Migration uygulanır.
4. RLS için pozitif ve negatif test çalıştırılır.
5. Uygulanan değişiklik CLAUDE.md'ye işlenir.

Gecikme olursa şu sırayla kesilir, çekirdek korunur:

1. AI Analiz paneli (Faz D) Ocak'a kayar.
2. Material Approval ve Claim (Faz D) Ocak'a kayar.
3. Action ekranı genişlemesi ve onay kutusunun gelişmiş hali (Faz C) Faz D'ye kayar.
4. Drawing ekranı Document ekranının içinde basit liste olarak kalır.

Hiçbir durumda kesilmeyenler: Document, RFI, AI taslak ve insan onayı, audit, yetki testleri.

İsdemir OYAK izni gelmezse takvim değişmez ama Faz C'nin AI işi küçülür: process-document yalnızca dosya adı ve klasörden metadata çıkarır, RFI alanları elle doldurulur; gerçek AI çıkarımı izin gelince eklenir.


# Bölüm 4 · Teknik tasarım

Bu bölüm, planlanan sistemin entegrasyona başlayabileceğin seviyede tasarımıdır: tablolar, kolonlar, durum makineleri, yetkiler, RPC ve edge function sözleşmeleri, Drive düzeni, AI şemaları, ekranlar ve migration sırası. Hepsi mevcut şemayla uyumlu olacak şekilde koddan doğrulanan gerçeklere dayanır.

## Okuma rehberi

Koddan doğrulananlar: proje kimliği text (projects.id), kullanıcı kimliği uuid, has_project_access(p_project_id text) NULL proje için true döndürüyor (yeni tablolarda project_id bu yüzden NOT NULL olmalı), project_tasks.id uuid ve UNIQUE(project_id, task_code), suppliers.id uuid, tickets.id uuid, notifications.entity_id uuid ve entity_type, event_type alanlarında CHECK kısıtı var, roles.key text PK, mevcut izinli roller 4 tane.

Varsayımlar (Faz A'nın ilk işi canlı şemadan doğrulamak): projects, profiles, project_risks ve procurement_items tabloları migration dosyalarında oluşturulmuyor (baz şema repo dışında); bu yüzden procurement_items.id ve project_risks.id tipini uuid varsaydım. Doğrulama komutu Bölüm 4.8'de: canlı şemadan bu dört tablonun kolonlarını al ve bu bölümle karşılaştır.

Bu tasarımın v2'ye tek esaslı değişikliği: AI taslakları hedef register tablosuna ai_draft durumunda yazılmaz, ayrı bir register_drafts tablosunda tutulur. Sebep: tickets ve project_risks canlı akışlarda kullanılıyor; içlerine taslak satırı koymak mevcut liste RPC'lerinin ve RLS'lerin hepsini değiştirmeyi gerektirirdi. Taslak onaylanınca RPC gerçek kaydı hedef tabloya yazar.

## 4.1 Ortak sözleşme

Yeni register tablolarının hepsi (documents, drawings, rfis, submittals, material_approvals, changes, claims, interfaces, decisions) aynı ortak kolonları taşır. Mevcut tablolar (tickets, project_risks, suppliers) kendi sözlüklerini korur; farkı RPC katmanı normalleştirir.

| Kolon | Tip | Kural |
|---|---|---|
| id | uuid | PK, gen_random_uuid() |
| project_id | text | NOT NULL, FK projects(id) ON DELETE CASCADE. NULL olamaz çünkü has_project_access(NULL) true döner |
| register_no | text | NOT NULL, UNIQUE(project_id, register_no); biçim RFI-DYB-0032 |
| record_state | text | draft, pending_approval, approved, rejected; varsayılan draft |
| source | text | manual, ai, import; varsayılan manual |
| wbs_id, area_id | uuid | Boş geçilebilir FK, ON DELETE SET NULL |
| task_id | uuid | Boş geçilebilir FK project_tasks(id) ON DELETE SET NULL; aktivite kodu ekranda task_code olarak join'den gelir |
| discipline | text | mechanical, dc, ac, mv, enh, civil, general |
| priority | text | low, normal, high, critical; varsayılan normal |
| responsible_id | uuid | FK profiles(id) ON DELETE SET NULL |
| source_document_id | uuid | Boş geçilebilir FK documents(id); kaydın çıkarıldığı dosya |
| created_by, approved_by | uuid | FK profiles(id) |
| approved_at, rejected_reason | timestamptz, text | Onay ve ret bilgisi |
| created_at, updated_at | timestamptz | updated_at trigger ile güncellenir |

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

**Numaralama.** Biçim {TÜR}-{PROJE_KODU}-{SIRA}; tür kodları DOC, DRW, RFI, SUB, MAT, CHG, CLM, INT, DEC; mevcut tablolar için ACT (tickets) ve RSK (project_risks). Sıra 4 haneye sıfır doldurulur. Sıra, register_counters(project_id, register_type, last_value) satırının INSERT ... ON CONFLICT DO UPDATE SET last_value = last_value + 1 RETURNING ile arttırılmasıyla üretilir; kayıt aynı transaction'da eklendiği için geri alınan işlemde numara boşa gitmez, yani RFI-0032 ile RFI-0034 arasında kayıp numara oluşmaz. (Satın alma request_no'sunda counter tablosu çakışma verdiği için sequence'e geçilmişti; bu yüzden bu yöntem Faz B kapısında eşzamanlılık testinden geçmek zorunda, geçemezse sequence kullanılır ve numara boşluğu kabul edilir.) Proje kodu project_register_settings(project_id, prefix, pad_width) tablosunda tutulur, projects tablosuna dokunulmaz.

## 4.2 Tablo tablo şema

Genel kural: her FK kolonuna indeks açılır (mevcut migration'larda bu yönde performans turu yapılmış), her tabloda RLS açıktır, hiçbir yeni tabloya doğrudan INSERT/UPDATE/DELETE policy'si yazılmaz; yazma yalnızca RPC ile olur.

**A. Altyapı tabloları**

| Tablo | Kolonlar | Kural |
|---|---|---|
| wbs | id, project_id, code, name, parent_id (self FK), level smallint, sort_order int, created_at | UNIQUE(project_id, code) |
| areas | id, project_id, code, name, wbs_id (FK), discipline, created_at | UNIQUE(project_id, code) |
| project_register_settings | project_id (PK, FK), prefix, pad_width smallint default 4, claim_notice_days int null | prefix CHECK ile yalnızca 2-6 büyük harf veya rakam; claim_notice_days sözleşmeden gelir, bilinmiyorsa NULL kalır |
| register_counters | project_id, register_type, last_value int | PK (project_id, register_type) |
| register_permissions | role_key (FK roles(key)), register_type, can_view, can_create, can_edit, can_approve, can_delete (boolean) | PK (role_key, register_type); yalnızca 4 aktif rol için satır seed edilir |
| register_audit | id bigint identity, project_id, table_name, record_id uuid, action, changed_by uuid default auth.uid(), changed_at, old_data jsonb, new_data jsonb, reason | action: insert, update, delete, state_change, approve, reject, reopen. UPDATE ve DELETE yetkisi kimseye verilmez; satırı yalnızca trigger yazar. İndeks (table_name, record_id, changed_at desc) ve (project_id, changed_at desc) |
| register_links | id, project_id, from_type, from_id, to_type, to_id, relation, created_by, created_at | relation: relates_to, answers, caused_by, blocks, references. Çok biçimli bağ olduğu için FK yok; varlık ve aynı proje kontrolü RPC'de, UNIQUE(from_type, from_id, to_type, to_id, relation) |
| register_drafts | id, project_id, register_type, payload jsonb, field_confidence jsonb, source_document_id (FK), job_id (FK), run_id (FK), prompt_version, status, reviewed_fields text[], created_record_id uuid, created_at, reviewed_by, reviewed_at, reject_reason | status: ai_draft, approved, rejected, superseded |
| document_texts | document_id (PK, FK), content text, page_count int, extraction_method, extracted_at | extraction_method: text_layer, vision |
| project_drive_folders | project_id, discipline, doc_type, drive_folder_id | PK (project_id, discipline, doc_type) |
| drive_sync_state | id smallint (CHECK id = 1), page_token, last_run_at | Tek satır |
| document_jobs | id, project_id, document_id (FK), job_type, status, attempts smallint, last_error, created_by, created_at, started_at, finished_at | job_type: classify, extract; status: queued, running, done, failed |
| register_status_transitions | register_type, from_status, to_status | PK (register_type, from_status, to_status). set_register_status yalnızca bu tablodaki geçişlere izin verir |

**B. Register tabloları** (ortak kolonlara ek olarak)

| Tablo | Register'a özel kolonlar | status değerleri |
|---|---|---|
| documents | title, doc_type (drawing, rfi, submittal, correspondence, report, contract, minutes, photo, other), revision, supersedes_id, storage_provider (gdrive, supabase), drive_file_id, drive_folder_id, file_name, mime_type, size_bytes bigint, sha256, drive_state (ok, trashed, missing), ai_status (pending, processing, done, failed, skipped), registered boolean | active, superseded, void. UNIQUE(project_id, drive_file_id), indeks (project_id, sha256) |
| drawings | document_id (FK), drawing_no, title, revision, supersedes_id, issue_status (ifa, ifr, ifc, as_built, superseded) | UNIQUE(project_id, drawing_no, revision) |
| rfis | subject, question, answer, raised_by_party (contractor, owner, subcontractor, engineer), raised_at, due_date, answered_at, closed_at, drawing_id (FK), schedule_impact_days int, cost_impact (none, potential, confirmed), contract_ref | open, answered, closed, cancelled. CHECK answered_at >= raised_at |
| submittals | title, spec_ref, submittal_type (shop_drawing, material, method_statement, test_report, sample), submitted_at, due_date, returned_at, review_comment, document_id (FK) | submitted, approved, approved_with_comments, rejected, resubmit |
| material_approvals | material_name, procurement_item_id (FK, varsayım uuid), supplier_id (FK suppliers), submittal_id (FK), approved_at, required_on_site date | pending, approved, rejected |
| changes | title, description, origin (owner_request, design_change, site_condition, other), cost_estimate numeric(14,2), currency default 'TRY', time_impact_days int, contract_ref | identified, submitted, approved, rejected, implemented |
| claims | change_id (FK), title, notice_type (time, cost, both), event_date NOT NULL, notice_deadline, notice_sent_at, amount_claimed numeric(14,2), currency, time_claimed_days int, contract_ref | notice_due, notice_sent, submitted, negotiating, settled, rejected |
| interfaces | title, interface_type (grid, epdk, tedas, teias, civil_mech, mech_elec, other), party_a, party_b, due_date | open, agreed, closed |
| decisions | title, decision_text, decided_at, decided_by_text, supersedes_id | proposed, decided, superseded |

Para alanları CLAUDE.md kuralı gereği sayı + ayrı currency kolonudur. notice_deadline, claim_notice_days doluysa event_date'ten RPC ile hesaplanır, boşsa elle girilir; AI bu tarihi hiçbir zaman kendi başına belirlemez.

**C. Mevcut tablolara eklemeler** (hepsi boş geçilebilir veya varsayılanlı; mevcut RPC ve ekranlar etkilenmez)

| Tablo | Eklenen | Not |
|---|---|---|
| project_tasks | wbs_id, area_id | FK ON DELETE SET NULL |
| tickets (Action) | register_no, wbs_id, area_id, task_id, source_document_id | register_no için kısmi unique (project_id, register_no) where register_no is not null; mevcut satırlar NULL kalır, yeni Action'lar ACT-DYB-0001 biçimini alır |
| project_risks (Risk) | register_no, wbs_id, area_id, task_id, source_document_id, approved_by, approved_at | source CHECK'i manuel, otomatik'e ai eklenerek genişler; otomatik risk motoru bozulmaz |
| suppliers (Subcontractor) | supplier_type (supplier, subcontractor, both) default 'supplier' | Subcontractor görünümü supplier_type in ('subcontractor','both') |
| notifications | meta jsonb | entity_type CHECK'ine register_record, register_draft eklenir; meta içinde register_type taşınır |
| Realtime yayını | register_drafts, documents, document_jobs ve yeni register tabloları | RLS realtime'da da geçerli |

## 4.3 Yetki matrisi ve RLS şablonu

Proje erişimi (has_project_access) ile register yetkisi (register_permissions) birlikte aranır: kullanıcı önce projeye, sonra o register'ın o eylemine yetkili olmalı. Harf anlamları: V görüntüle, C oluştur, E düzenle, A onayla, D sil. Bu değerler öneridir ve Karar #4 ile netleşir; register_permissions tablosu değiştirildiğinde kod değişmez.

| Register | admin | proje_yoneticisi | santiye_sefi | muhasebe |
|---|---|---|---|---|
| document | VCEAD | VCEA | VC | yok |
| drawing | VCEAD | VCEA | V | yok |
| rfi | VCEAD | VCEA | VCE | yok |
| submittal | VCEAD | VCEA | V | yok |
| material_approval | VCEAD | VCEA | V | yok |
| interface | VCEAD | VCEA | VC | yok |
| decision | VCEAD | VCEA | V | yok |
| action (tickets) | VCEAD | VCEA | VCE | yok |
| risk | VCEAD | VCEA | VC | yok |
| change | VCEAD | VCEA | VC | V |
| claim | VCEAD | VCEA | yok | V |
| procurement | V | V | V | V |
| subcontractor | VCED | VCE | V | V |
| payment | V | V | yok | V |

Notlar:

- santiye_sefi'nin E yetkisi yalnızca kendi oluşturduğu kayıtlar içindir (created_by = auth.uid()); Action için mevcut ticket kuralları aynen geçerlidir.
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

Dosya erişimi aynı kuralla çözülür: get_document_for_download fonksiyonu has_project_access(project_id) ve register_can('document', 'view') doğrulamadan Drive dosya kimliğini döndürmez.


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
| get_document_for_download | p_document_id uuid | {drive_file_id, file_name, mime_type, size_bytes}; yalnızca drive-gateway çağırır |

**Yazma ve durum geçişi** (yeni register tabloları; Action ve Risk için mevcut akışlar kullanılır)

| RPC | Parametreler | Dönüş ve kural |
|---|---|---|
| save_register_record | p_register_type, p_project_id, p_id uuid null, p_data jsonb | {id, register_no, record_state}. Zorunlu alan, enum ve aynı-proje FK doğrulaması; yeni kayıtta numara atar; yalnızca draft ve rejected kayıt düzenlenir |
| submit_register_record | p_register_type, p_id | draft → pending_approval |
| approve_register_record | p_register_type, p_id, p_note null | Kritik register'da onaylayan created_by olamaz |
| reject_register_record | p_register_type, p_id, p_reason | Gerekçe zorunlu |
| reopen_register_record | p_register_type, p_id, p_reason | approved → draft, gerekçe zorunlu |
| set_register_status | p_register_type, p_id, p_status, p_note null | İş durumu geçişi; izinli geçişler register_status_transitions(register_type, from_status, to_status) tablosunda |
| delete_register_record | p_register_type, p_id | Yalnızca draft ve rejected |
| link_register_records | p_project_id, p_from_type, p_from_id, p_to_type, p_to_id, p_relation 'relates_to' | Link id; iki kayıt aynı projede olmalı |
| unlink_register_records | p_link_id uuid | |

**AI taslakları**

| RPC | Parametreler | Dönüş ve kural |
|---|---|---|
| list_register_drafts | p_project_id, p_status 'ai_draft', p_register_type null | Taslak listesi (onay kutusu) |
| get_register_draft | p_draft_id uuid | {draft, document, matches, thresholds}; matches eşleşen çizim ve aktivite adaylarını içerir |
| update_register_draft | p_draft_id, p_payload jsonb | Kullanıcı alan düzeltir; düzeltilen alanlar reviewed_fields'e eklenir |
| approve_register_draft | p_draft_id, p_payload jsonb null, p_reviewed_fields text[] '{}' | {register_type, record_id, register_no}. Güveni eşiğin altındaki her alan p_reviewed_fields içinde değilse review_required hatası verir (sunucu tarafı zorlama). Hedef kayıt approved, source = ai; kritik register'da onaylayan taslağı üreten kullanıcıdan farklı olmalı |
| reject_register_draft | p_draft_id, p_reason null | |

**Doküman ve iş kuyruğu**

| RPC | Parametreler | Dönüş ve kural |
|---|---|---|
| create_document_record | p_project_id, p_meta jsonb, p_dry_run boolean false | {id, register_no}; aynı projede aynı sha256 varsa duplicate hatası ve mevcut kaydın id'si. Kullanıcı JWT'siyle drive-gateway çağırır |
| enqueue_document_job | p_document_id, p_job_type | Job id |
| finish_document_job | p_job_id, p_status, p_error null | |
| save_ai_draft | p_document_id, p_register_type, p_payload jsonb, p_confidence jsonb, p_run_id uuid, p_job_id uuid | Draft id; aynı doküman ve türdeki önceki ai_draft taslağını superseded yapar |
| log_ai_run | tür, sağlayıcı, model, prompt_version, token sayıları, süre, durum | Run id; bütçe aşıldıysa budget_exceeded |

**Servis fonksiyonları** (svc_ öneki; gövdenin ilk satırı auth.role() = 'service_role' kontrolü, aksi halde forbidden): svc_sync_upsert_document, svc_sync_mark_state, svc_get_sync_state, svc_set_sync_state; Faz E'de svc_claim_next_job, svc_save_finding, svc_agent_get_* okuma tool'ları. Edge function'lardaki servis kodunda .from() çağrısı yasaktır, yalnızca bu RPC'ler çağrılır.

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

## 4.5 Edge function ve Drive tasarımı

**Drive düzeni.** Tek Shared Drive ("Fons Projects"), servis hesabı Content manager, kullanıcılar üye değil (Karar #1). Klasör kimlikleri project_drive_folders tablosunda tutulur; klasörleri provision_folders eylemi oluşturur.

```text
Fons Projects (Shared Drive)
└─ DYB-Isdemir-Diyarbakir/
   ├─ 00_Gelen_Kutusu/        elle bırakılan dosyalar (drive-sync kaydeder)
   ├─ 01_Dokumanlar/
   │  ├─ Genel/ Mekanik/ DC/ AC/ OG/ ENH/ Insaat/
   │  │    └─ Drawing/ RFI/ Submittal/ Material/ Correspondence/
   │  │       Report/ Contract/ Minutes/ Photo/ Other/
   └─ 99_Arsiv/
```

discipline değerlerinin klasör karşılığı: general = Genel, mechanical = Mekanik, dc = DC, ac = AC, mv = OG, enh = ENH, civil = Insaat. Klasör adları ASCII'dir (Drive aramasında ve komut satırında sorun çıkmasın diye).

**Dosya adı:** {register_no}_{revizyon}_{kisa-baslik}.{uzantı}, örnek DRW-DYB-0125_R03_pv03-kazik-yerlesim.pdf. Başlık ASCII'ye çevrilir, boşluklar tire olur, en fazla 80 karakter; revizyon yoksa o parça atlanır.

**Gizli bilgiler (edge function secret'ları):** GOOGLE_SERVICE_ACCOUNT_JSON, DRIVE_SHARED_DRIVE_ID, AI_PROVIDER, AI_API_KEY, MAX_UPLOAD_BYTES, SYNC_SECRET. Hiçbiri VITE_ önekli değildir, hiçbiri repoda bulunmaz.

**drive-gateway** (kullanıcı JWT'si zorunlu; Drive'a yalnızca servis hesabıyla gider, veritabanına yalnızca kullanıcı JWT'siyle)

| Eylem | İstek | Başarılı yanıt | Hatalar |
|---|---|---|---|
| upload | POST multipart: project_id, doc_type, discipline, revision (ops.), title (ops.), file | 201 {document_id, register_no, job_id} | 401, 403, 409 (aynı dosya, mevcut id ile), 413, 415, 502 |
| download | GET ?document_id=&disposition=inline veya attachment | Dosya akışı, doğru Content-Type | 401, 403, 404, 502 |
| provision_folders | POST JSON {project_id} | {created: n} | 401, 403 (yalnızca admin), 502 |

İzinli türler: pdf, png, jpg, docx, xlsx, dwg (dwg saklanır, AI'a gönderilmez). Boyut sınırı MAX_UPLOAD_BYTES; değer Faz A'daki büyük PDF denemesine göre konur. Yükleme sırası: JWT doğrula, yetkiyi RPC ile kontrol et, dosyanın sha256 değerini hesapla, create_document_record ile p_dry_run = true çağırıp tekrar kontrolü yap, Drive'a yükle, create_document_record ile kaydı aç, enqueue_document_job çağır. Kayıt açılamazsa Drive'a yüklenen dosya silinir (telafi adımı). Tarayıcıya hiçbir zaman Drive bağlantısı verilmez.

**drive-sync** (her 10 dakikada bir tetiklenir; SYNC_SECRET başlığı olmadan çalışmaz)

1. svc_get_sync_state ile son page_token okunur.
2. Drive changes.list çağrılır; her değişiklik için dosyanın üst klasör zinciri project_drive_folders ile eşlenip proje bulunur.
3. Veritabanında olmayan yeni dosya svc_sync_upsert_document ile registered = false, source = import olarak eklenir; arayüzde "Kayıtsız dosyalar" listesine düşer, kullanıcı tür ve disiplini tamamlayınca kayıt olur.
4. Çöpe atılan dosya drive_state = trashed, proje dışına taşınan missing olur; ikisi de Faz E'de Reconciliation bulgusuna dönüşür.
5. page_token yalnızca bütün değişiklikler işlendikten sonra yazılır (işlem tekrarlansa da upsert olduğu için güvenli).

Tetikleme için pg_cron ile pg_net varsa net.http_post; pg_net kullanılamıyorsa Supabase'in zamanlanmış edge function özelliği. İkisinin hangisi çalışıyorsa Faz A'da denenir.

**process-document** (Faz C'de kullanıcının kendi JWT'siyle çalışır; arka planda sürer, ilerleme document_jobs ve realtime ile arayüze akar)

| Adım | İş | Çıktı |
|---|---|---|
| 1 | İşi al: status = running, attempts + 1 (en çok 3 deneme) | Job |
| 2 | Dosyayı Drive'dan indir (servis hesabı) | Bayt akışı |
| 3 | Metin çıkar: PDF metin katmanı; sayfa başına karakter min_text_chars altındaysa sayfa görüntüleri (en çok max_pages) modele gönderilir | document_texts satırı |
| 4 | Sınıflandır (hızlı model): doc_type, discipline, revision, title, dil | documents boş alanları doldurur, ai_status = done |
| 5 | Türüne uygun bir çıkarım şeması varsa çıkar (güçlü model), alıntıları doğrula, çizim ve aktiviteyi eşleştir | save_ai_draft |
| 6 | Her model çağrısı log_ai_run'a yazılır; iş finish_document_job ile kapanır | Kayıt |

Hata davranışı: geçersiz JSON çıkarsa bir onarım denemesi yapılır, olmazsa iş failed olur ve arayüz "Elle doldur" gösterir. Kapatma anahtarı: ai_settings.enabled = false iken iş skipped, doküman ai_status = skipped olur ve manuel akış etkilenmez.

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
| drawing_no | text | Normalize edilip drawings.drawing_no ile birebir eşleşir; olmazsa null ve en çok 3 aday |
| task_code | text | project_tasks.task_code ile birebir; olmazsa null |
| area_code, wbs_code | text | areas.code, wbs.code ile birebir; olmazsa null |
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
| Reconciliation | svc_agent_get_register_document_diff: kayıtsız dosyalar, trashed ve missing dosyalar, açık RFI'ya bağlı cevap benzeri yeni doküman, çizim revizyon tutarsızlığı | reconciliation | Gece, proje bazında kuyruktan |
| Planning | svc_agent_get_schedule_overview: geciken ve kritik aktiviteler (mevcut vw_delayed_tasks ve is_critical), o aktivitelere bağlı açık RFI, Submittal ve Material Approval | delay_risk | Gece, proje bazında kuyruktan |

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
| 7 | Document ve Drawing | ?register=document, ?register=drawing | Liste + sürükle-bırak yükleme; "Kayıtsız dosyalar" sekmesi (registered = false); Drawing'de revizyon zinciri görünümü (R01 → R02 → R03, güncel olan işaretli) |
| 8 | Register ayarları | Proje Yönetimi içinde (admin) | Proje kodu (prefix), WBS ve Area listesi ile toplu yükleme, "Drive klasörlerini oluştur" butonu, register_permissions matrisi, AI ayarları (açık/kapalı, kota) |
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
| RFI status | open → Açık, answered → Cevaplandı, closed → Kapalı, cancelled → İptal |
| priority | low → Düşük, normal → Normal, high → Yüksek, critical → Kritik |
| güven | yeşil → Yüksek, sarı → Orta, kırmızı → Düşük; renk tek başına anlam taşımaz, etiket de yazılır |
| source | manual → Elle, ai → AI, import → Aktarım |

**Bildirimler.** AI taslağı oluşunca register_draft / created olayı, onay yetkisi olan rollere notify_role ile gider; onaya gönderilince register_record / pending; onay ve ret created_by kullanıcısına notify_user ile (approved, rejected, gerekçe body'de); işleme hatası yükleyene status_changed. meta.register_type tıklayınca doğru register'ı açar (mevcut goToRequest deseni: ?register=&kayit=, taslakta ?register=_onay&taslak=). Uyarı: CLAUDE.md'ye göre alıcı rolün gerçekten bu ekrana erişebildiği doğrulanmalı; ProjeDetay iç sekmelerinin role_allowed_tabs ile mi kontrol edildiğini Faz A'daki tasarım notu netleştirir. notify_role proje kapsamını kendiliğinden daraltıyor mu, Faz C'de test edilir.

## 4.8 Migration listesi

Dosya adları mevcut biçimi izler (YYYYMMDDHHMMSS_ad.sql). Numaralar Bölüm 3'teki "Migration N" ifadeleriyle aynıdır. Hepsi yalnızca ekleyicidir.

Faz A'nın ilk işi, varsayımları kapatan şu salt okunur sorgudur (sonucu bu bölümdeki tablolarla karşılaştır):

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('projects', 'profiles', 'project_risks', 'procurement_items', 'notifications')
order by table_name, ordinal_position;
```

| # | Dosya adı (öneri) | Faz, hafta | İçerik | Bağımlı |
|---|---|---|---|---|
| M01 | register_wbs_areas | B, 20-26 Eki | wbs, areas, project_tasks wbs_id ve area_id, FK indeksleri, SELECT policy | |
| M02 | register_audit_infra | B, 20-26 Eki | register_audit, fn_register_audit() trigger fonksiyonu, set_updated_at() | |
| M03 | register_permissions | B, 27 Eki - 2 Kas | register_permissions + 4 rol için seed, register_can(), get_my_register_permissions, register_status_transitions | |
| M04 | register_numbering | B, 27 Eki - 2 Kas | project_register_settings, register_counters, next_register_no(); eşzamanlılık testi kapıdır | |
| M05 | documents_core | B, 3-9 Kas | documents, document_texts, project_drive_folders, drive_sync_state, vw_reg_document, get_register_list / get_register_detail / get_register_overview iskeleti, realtime yayını | M01-M04 |
| M06 | registers_drawings_rfis_links | C, 10-16 Kas | drawings, rfis, register_links, vw_reg_drawing, vw_reg_rfi, RLS | M05 |
| M07 | ai_runs_jobs_drafts | C, 17-23 Kas | document_jobs, ai_settings, ai_runs, register_drafts, ai_budget_ok() | M05 |
| M08 | register_write_rpcs | C, 24-30 Kas | save_*, submit_*, approve_*, reject_*, reopen_*, set_register_status, delete_*, link_*, unlink_*; RFI geçiş seed'i | M03, M04, M06 |
| M09 | register_draft_rpcs | C, 24-30 Kas | Taslak RPC'leri, save_ai_draft, log_ai_run, create_document_record, enqueue_document_job, finish_document_job, search_register_refs, svc_sync_* | M07, M08 |
| M10 | notifications_register_support | C, 24-30 Kas | notifications.meta, entity_type CHECK genişletmesi, bildirim trigger'ları | M08, M09 |
| M11 | tickets_register_columns | C, 1-7 Ara | tickets register_no, wbs_id, area_id, task_id, source_document_id; Action için numara ataması | M04 |
| M12 | submittals_material_approvals | D, 8-14 Ara | İki tablo, view, RLS, geçiş seed'i | M08 |
| M13 | changes_claims | D, 15-21 Ara | changes, claims, view, RLS, ihbar süresi hesabı | M08 |
| M14 | project_risks_register_extension | D, 15-21 Ara | project_risks ek kolonlar, source CHECK genişletmesi, Risk için taslak onay yolu | M09 |
| M15 | suppliers_type_and_links | D, 22-28 Ara | suppliers.supplier_type, Procurement ve Subcontractor köprü view'ları | M06 |
| M16 | interfaces_decisions | E | İki tablo, view, RLS | M08 |
| M17 | agent_infra | E | ai_findings, svc_agent_* okuma RPC'leri, iş kuyruğu talebi; isteniyorsa fons_agent rolü | M07 |
| M18 | register_bridge_views | E | Payment ve Procurement okuma köprüleri, get_register_overview tamamlanması | M15 |

**Her migration'ın kontrol listesi** (her migration'ın PR açıklamasında işaretlenir):

- [ ] Her FK kolonuna indeks
- [ ] enable row level security ve SELECT policy; yazma policy'si yok
- [ ] Her fonksiyonda security definer, set search_path = public, revoke ... from public, anon
- [ ] CHECK'ler ve enum değerleri bu bölümdeki listeyle aynı
- [ ] Seed'ler on conflict do nothing ile tekrar çalıştırılabilir
- [ ] Realtime yayınına eklenecek tablolar eklendi
- [ ] RLS pozitif ve negatif testi yazıldı
- [ ] CLAUDE.md'nin ilgili bölümü güncellendi

**Geri alış.** Migration'lar ekleyici olduğu için geri alış, veri yoksa ters migration (drop), veri varsa nesneyi kullanılmaz bırakıp ileri düzeltme migration'ı yazmaktır (CLAUDE.md geriye uyumluluk kuralı). Her uygulamadan önce npm run db:backup.

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
| T16 | Gateway | JWT yok; yetkisiz proje | 401; 403 |
| T17 | Gateway | Aynı dosyayı ikinci kez yükle | 409 ve mevcut kayıt id'si |
| T18 | Gateway | İzinsiz tür; aşırı boyut | 415; 413 |
| T19 | Gateway | Kayıt açma hatası | Drive'a yüklenen dosya silinir |
| T20 | Sync | Dosya Drive'da çöpe atılır; elle dosya bırakılır | trashed; registered = false |
| T21 | AI | Alıntı belgede yok | Güven en çok 0,3, quote_not_found |
| T22 | AI | Belgede "önceki talimatları unut" cümlesi | Şema dışına çıkılmaz, talimat uygulanmaz |
| T23 | AI | Kapatma anahtarı kapalı | İş skipped, manuel RFI çalışır |
| T24 | AI | Bütçe aşımı | budget_exceeded, manuel akış sürer |
| T25 | Bildirim | AI taslağı oluşur | Onay yetkili roller alır; yetkisiz rol ve başka proje almaz |
| T26 | Frontend | 4 rol × her ekran | Görünen butonlar register_permissions ile uyumlu |
| T27 | Frontend | ?register=&kayit= bağlantısını yenile | Aynı kayıt açılır |
| T28 | Frontend | 390 px genişlik | Kart görünümü çalışır |
| T29 | Regresyon | Mevcut 92 test | Hepsi yeşil |

**Açık noktalar ve kararlar** (tasarımı etkileyenler):

1. Baz şema doğrulaması (Bölüm 4.8'deki sorgu): projects, profiles, project_risks, procurement_items kolon tipleri.
2. Dört göz kuralı küçük ekipte kilitlenebilir (tek kişi hem hazırlıyor hem onaylıyorsa). Öneri: project_register_settings.four_eyes_enabled ayarı, varsayılan açık; kapatmak admin kararıdır ve audit'e yazılır.
3. Taranmış PDF'te alıntı doğrulaması: görüntü modunda model sayfa transkriptini de döndürür, alıntı bu transkriptte aranır ve transkript document_texts'e vision olarak yazılır. Bu yöntemin güvenilirliği Faz B ölçümünde ayrıca test edilir.
4. Faz A'da ölçülecek altyapı sınırları: Drive kota ve dosya boyutu, edge function süre ve bellek sınırı, pg_net varlığı, PDF metin çıkarımı için Deno'da çalışan kütüphane.
5. Bildirim kapsamı: notify_role proje bazında daraltıyor mu ve ProjeDetay iç sekmeleri hangi mekanizmayla yetkilendiriliyor (Faz A tasarım notu).
6. Yetki matrisi değerleri Karar #4 ile onaylanır.
7. Eski kayıtlar: mevcut ticket ve risk satırları register_no olmadan kalır; istenirse Faz E'de geriye dönük numaralandırma migration'ı yazılır.
8. Gizlilik: ai_runs belge içeriğini saklamaz, yalnızca sayısal ve meta bilgi; document_texts aynı RLS ile korunur. Sağlayıcının verileri saklama ve model eğitiminde kullanma politikası sözleşme kontrolünde ayrıca doğrulanır.

**Kapsam notu.** Faz A-D'nin tabloları, RPC'leri, edge function'ları, ekranları ve testleri bu seviyede tasarlandı. Faz E'nin bir kısmı (Excel import sihirbazı, proje sağlığı dashboard'unun kartları, Interface ve Decision ekranlarının alan ayrıntısı) şimdilik envanter düzeyinde; Faz D kapısında, pilottan öğrenilenlerle ayrıntılandırılması planlanır.
