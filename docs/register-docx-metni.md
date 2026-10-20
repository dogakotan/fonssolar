# Docx güncelleme metni — Register ekranı (yalnızca okuma) ve okuma fonksiyonları

Bu metin `fons_solar_sistem_dokumantasyonu.docx` ve `fons_solar_veritabani_dokumantasyonu.docx`'e işlenir (CLAUDE.md
kural 7). **20.10.2026: A.1, B.1, B.2 iki belgeye işlendi** (yedekler `*.yedek-20-10.docx`: sistem belgesi Masaüstü, veritabanı belgesi `C:/Users/fonss/Claude/Projects/Fons Solar/`); A.2, A.3, B.3 Adım 4 sonrası. Her bölüm, ilgili yayın adımı canlıda doğrulandıktan sonra işlenir
(`docs/register-yayin-sirasi.md`); `<tarih>` ve `<sürüm>` o gün doldurulur.

| Bölüm | Ne zaman işlenir |
|---|---|
| A.1, B.1, B.2 | Adım 1 (okuma fonksiyonları) doğrulandıktan sonra |
| A.2, A.3, B.3 | Adım 4 (navigasyon satırları) doğrulandıktan sonra |
| Kapak tarih satırı | Son işlenen bölümün tarihiyle |

Kapak tarih satırı:
> … · <tarih> (Register ekranı — yalnızca okuma; register okuma fonksiyonları)

---

## A. fons_solar_sistem_dokumantasyonu.docx

### A.1 Rol ve yetki bölümüne — register görüntüleme kuralı

> **Register görüntüleme kuralı (<tarih>).** Proje kontrol kayıtlarını (register) hangi rolün görebileceği yetki
> matrisine (Karar 6, "görüntüleme" kolonu) göre belirlenir:
> - Admin ve proje yöneticisi bütün register'ları görür.
> - Şantiye şefi RFI, Doküman (çizimler dahil), Karar, Aksiyon, Teknik Sunum, Malzeme Onayı ve Arayüz (Interface)
>   register'larını görür; Değişiklik ve Hak Talebi'ni görmez.
> - Muhasebe yalnızca Değişiklik ve Hak Talebi register'larını görür.
>
> Kural ekranda ve okuma fonksiyonunda uygulanır. Okuma fonksiyonu çağıranın yetkisiyle çalışır; tabloların kendi
> erişim kurallarının izin vermediği hiçbir satırı ya da alanı döndürmez (örneğin şantiye şefi tedarikçi adını görmez).
> Yetki matrisi tablosu (B1) devreye girdiğinde kural oradan okunacak.

### A.2 Ekranlar bölümüne — Register ekranı

> **Register (<tarih>).** Sol menüde "Register" öğesi proje kontrol kayıtlarını tek ekranda toplar. İlk sürüm
> yalnızca görüntüleme içindir; kayıt ekleme ve düzenleme bu ekranda yoktur (kayıtlar şimdilik yönetici tarafından
> girilir).
> - Üstte register türleri sekme olarak yer alır: RFI, Doküman, Karar, Aksiyon, Teknik Sunum, Malzeme Onayı,
>   Değişiklik, Hak Talebi, Arayüz (Interface; disiplinler arası arayüz). Kullanıcı yalnızca rolünün görebildiği
>   sekmeleri görür. Risk kayıtları bu ekranda değil, Satın Alma › Riskler'de kalır.
> - Birden fazla projeye erişimi olan kullanıcı proje seçer; tek projeli kullanıcıda proje otomatik seçilir.
>   Başlıkta projenin register kodu görünür (ör. "Proje kodu: DYB2").
> - Kayıt numaraları sistemin ürettiği biçimde gösterilir: tür, proje kodu ve sıra (ör. RFI-DYB2-0001, DRW-TIZ-0003).
> - Tablo aranabilir ve sıralanabilir; "Sütunlar" menüsünden ek alanlar açılır (disiplin, revizyon, WBS, alan,
>   oluşturma tarihi vb.). Durum ve öncelik renkli nokta ve metinle gösterilir. Sayfa başına 10 kayıt.
> - Doküman sekmesinde "Yalnızca çizimler" süzgeci vardır.
> - Kayda tıklayınca sağda bir panel açılır: kaydın bütün alanları ve durum geçmişi (kim, ne zaman, hangi durumdan
>   hangisine). Doküman, Teknik Sunum ve Malzeme Onayı için durum geçmişi tutulmaz; panel bunu belirtir.
> - Kaydın bağlı olduğu iş kalemi "Görev" sütununda salt okunur görünür; bu ekrandan bağ kurulmaz.
> - Disiplin alanı Türkçe gösterilir (İnşaat, Mekanik, DC, AC, Orta gerilim, Yüksek gerilim, ENH, SCADA, Genel);
>   listede olmayan değer girildiği gibi görünür.
> - Adres açık sekmeyi ve kaydı taşır (`/dashboard/register?tur=rfi&kayit=…`); sayfa yenilenince aynı görünüm gelir.

### A.3 Rol × sekme tablosu (A.2'nin altına)

| Register | Admin | Proje yöneticisi | Şantiye şefi | Muhasebe |
|---|---|---|---|---|
| RFI | ✓ | ✓ | ✓ | – |
| Doküman (çizimler dahil) | ✓ | ✓ | ✓ | – |
| Karar | ✓ | ✓ | ✓ | – |
| Aksiyon | ✓ | ✓ | ✓ | – |
| Teknik Sunum | ✓ | ✓ | ✓ | – |
| Malzeme Onayı | ✓ | ✓ | ✓ | – |
| Değişiklik | ✓ | ✓ | – | ✓ |
| Hak Talebi | ✓ | ✓ | – | ✓ |
| Arayüz (Interface) | ✓ | ✓ | ✓ | – |

---

## B. fons_solar_veritabani_dokumantasyonu.docx

### B.1 RPC listesine — üç fonksiyon

| Fonksiyon | Tür | Açıklama |
|---|---|---|
| `register_view_allowed(p_role, p_register)` | yardımcı (immutable) | Karar 6 görüntüleme matrisi. `document`, `drawing`, `rfi`, `action`, `decision`, `submittal`, `material_approval`, `interface` → admin, proje_yoneticisi, santiye_sefi; `change`, `claim` → admin, proje_yoneticisi, muhasebe; diğerleri false. B1 uygulanınca gövdesi `register_can(p_register, 'view')` olur |
| `get_register_list(p_project_id, p_register)` | okuma, SECURITY INVOKER | Proje erişimi + matris kontrolünden sonra register'ın satırlarını `{authorized, register, prefix, rows}` olarak döndürür; yetkisizse `{authorized: false}`. `drawing` doküman tablosunda `document_type = 'drawing'` süzgecidir. Satırlarda numara, başlık, durum, öncelik, tarihler, WBS/alan/görev kodu ve adı; Teknik Sunum ve Malzeme Onayı'nda tedarikçi adı (tedarikçi tablosu kuralına tabi) |
| `get_register_status_history(p_register, p_record_id)` | okuma, SECURITY INVOKER | Kaydın `register_status_history` satırları (eski/yeni durum, değiştiren, zaman). Kayıt çağıranın erişebildiği ana tablodan okunamıyorsa ya da matris izin vermiyorsa `{authorized: false}`; geçmiş tutulmayan register'larda (`document`, `submittal`, `material_approval`) `tracked: false` |

> Üçü de `authenticated` rolüne açık; `anon` ve PUBLIC'e kapalı. Çağıranın yetkisiyle çalıştıkları için tabloların
> satır düzeyi kurallarından geniş veri döndüremezler. Migration: `20261020080127_register_okuma_rpc` (20.10.2026).

### B.2 Güvenlik notu (B.1'in altına)

> `register_status_history` tablosunun okuma kuralı yalnızca proje erişimine bakar; tablo doğrudan sorgulanırsa
> şantiye şefi Değişiklik/Hak Talebi, muhasebe Arayüz kayıtlarının durum geçişlerini (başlıksız) görebilir. Ekran
> geçmişi yalnızca `get_register_status_history` üzerinden okur ve bu süzgeci uygular. Tablo kuralının daraltılması
> B3 kapsamındadır. Aynı şekilde muhasebe bugün teknik register tablolarını doğrudan okuyabilir; ekran ve fonksiyon
> Karar 6'ya göre daraltır.

### B.3 Navigasyon tabloları — `register` satırları

> `role_sidebar_items`'a dört rol için (`admin`, `proje_yoneticisi`, `santiye_sefi`, `muhasebe`) ve
> `role_allowed_tabs`'a üç rol için (`proje_yoneticisi`, `santiye_sefi`, `muhasebe`; admin kısıtsız) `register`
> satırı eklendi. Hangi alt sekmenin görüneceği bu tablolarda değil, ekranda ve `register_view_allowed`'da belirlenir.
> Migration: `<sürüm>_register_navigasyon`.
