# Fons Solar — Hiyerarşik Ajan Sistemi

GES projelerinin takibi için yapay zekâ ajanlarından oluşan bir sistem. Ajanlar hiyerarşik çalışır: her ajan yalnızca bir üstünden görev alır ve yalnızca bir üstüne rapor verir. Mühendise giden her çıktı Proje Direktörü'nden geçer. Ajanlar yalnızca öneri üretir; kararı mühendis verir.

> **Durum: 6 aşamanın tamamı bitti.** 18 ajanın tümü devrede. Move On salt okunur bağlı ve yalnızca Lojistik Ajanı erişebiliyor.
> - **Proje kolu:** Proje Direktörü, Proje Müdürü, Proje Tasarım Ajanı, Hafriyat Ajanı, Evrak Takip Uzmanı, Drenaj Ajanı, CCTV/Telcit Ajanı
> - **Saha kolu:** Saha Koordinatörü, Saha Şefi, Elektrik Şefi, Mekanik Şef, Depocu, Kaliteci
> - **Ticari kol:** Ticari Direktör, Satın Alma Müdürü, Teklif & Maliyet Ajanı, Satın Alma Ajanı, Lojistik Ajanı
>
> Kollar arasındaki bilgi yalnızca Proje Direktörü üzerinden geçer. Ticari veri saha ve proje kollarına sızmaz; bu durum testlerle doğrulanır.
>
> Varsayılan `mod: deneme` API anahtarı gerektirmez ve **ücretsizdir**. Bu modda içerik yorumu yapılmaz, yalnızca kurallı okuma yapılır. Gerçek analiz için canlı moda geçilmelidir (bkz. "Canlı moda geçiş"). **Canlı mod henüz gerçek bir modelle denenmedi.**

> ⚠️ **Bu depo herkese açık (public).** Gerçek proje verisini, Excel/CSV/PDF dosyalarını, `runs/` kayıtlarını ve API anahtarlarını **asla commit etmeyin**. `.gitignore` bunları dışarıda tutar, ama dosyayı yine de doğru klasöre koyun (`veri/`, `inbox/`).

## Kurulum (Windows)

Gereken: [Python 3.10 veya üstü](https://www.python.org/downloads/) ve Git.

```powershell
git clone https://github.com/dogakotan/fonssolar.git
cd fonssolar\ajan-sistemi
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

PowerShell `Activate.ps1` dosyasını engellerse önce `Set-ExecutionPolicy -Scope Process RemoteSigned` komutunu çalıştırın.

macOS/Linux için `python3 -m venv .venv` ve `source .venv/bin/activate` kullanın.

## Kullanım

```powershell
python -m orkestrator dogrula                                     # yapılandırma tutarlı mı?
python -m orkestrator tablo                                       # hiyerarşi, modeller, devredeki ajanlar
python -m orkestrator talep "Modül ve hendek durumunu kontrol et" # mühendis talebi -> sunum
python -m orkestrator kaynak G-20261104-0001 modul_adedi          # "bu sayı nereden geldi?"
python -m orkestrator bekleyenler                                 # onay bekleyen dış etkili işlemler
python -m orkestrator onayla G-20261104-0001-A1 --onaylayan "Ad Soyad"
python -m orkestrator reddet G-20261104-0001-A1 --reddeden "Ad Soyad"
python -m orkestrator yurut  G-20261104-0001-A1                   # yalnızca onaylıysa çalışır
python -m orkestrator kural-denemesi                              # izin kurallarını API'siz gösterir
python -m pytest -q                                               # kabul testleri
```

### Pilot: örnek proje ile uçtan uca

```powershell
python -m orkestrator ornek-proje                 # veri/ornek-ges klasörüne SENTETİK örnek proje üretir
python -m orkestrator talep "Hafriyat metrajı ve evrak durumunu kontrol et" --proje veri/ornek-ges
```

Örnek projede bilerek yerleştirilmiş bulgular var. Sunum bunların hepsini göstermelidir:

- **Kablo hendeği farkı:** Metraj dosyasında 8.450 m, güzergâh dosyasında 8.120 m yazıyor. Fark çapraz kontrolde işaretlenir.
- **Evrak sorunları:** Yapı ruhsatı eksik, ENH izninin süresi dolmuş, İSG planının süresi 30 gün içinde doluyor.
- **Okunamayan dosya:** Zemin etüdü bir PDF; okunamadığı için "kapsam dışı" olarak raporlanır.
- **Ticari dosya:** `ticari/` altındaki birim fiyatlar Hafriyat ve Evrak ajanlarına hiç görünmez.

### Gerçek proje verisi

Gerçek bir proje klasörünü bağlamanın iki yolu var:

**1. Proje eşlemesi (önerilen).** Bu yolda dosyaları taşımanız gerekmez. Örneğin OneDrive'daki bir teklif klasörü **olduğu gibi ve salt okunur** kullanılır.

```powershell
copy config\projeler\ornek.yaml config\projeler\ornek-teklif.yaml   # sonra dosyayı düzenleyin
python -m orkestrator talep "Hafriyat miktarları ve EK-11 doküman durumunu kontrol et" --proje ornek-teklif
```

Eşleme dosyasında üç alan doldurulur:
- `alanlar`: Hangi klasörün hangi ajanın alanı olduğunu söyler (ör. `.../10-Hafriyat Planı: hafriyat`).
- `etiketler`: Hangi klasörün ticari olduğunu söyler. Örneğin EK-18 değerlendirme formu teklif fiyatı içerdiği için `ticari` olarak işaretlenmelidir.
- `gerekli_dokumanlar`: EK-11 gibi şart listesinin yeri. Evrak Takip Uzmanı her maddeyi klasörde arar ve şu durumları raporlar: doküman eksik, yalnızca DWG olarak var (okunamıyor), dosya adında revizyon işareti yok.

`config/projeler/*.yaml` dosyaları yerel yol ve müşteri klasör adları içerdiği için **git'e girmez**. Yalnızca `ornek.yaml` paylaşılır.

**2. Klasör kopyalama.** Dosyaları `veri/<proje-adı>/` altına kopyalayın. Bu klasör git'e girmez. Klasör adları alan adı olarak kullanılır:

| Klasör | Kim görür |
|---|---|
| `hafriyat/` | Hafriyat Ajanı'nın alanı |
| `evrak/` | Evrak Takip Uzmanı'nın alanı |
| `metodoloji/` | Hafriyat Ajanı da okur (miktar çapraz kontrolü için) |
| `depo/`, `elektrik/`, `mekanik/`, `kalite/` | Depocu, Elektrik Şefi, Mekanik Şef, Kaliteci |
| `satin_alma/`, `lojistik/` | Satın Alma Ajanı, Lojistik Ajanı (etiketsiz; fiyat içermemeli) |
| `tasarim/`, `drenaj/`, `cctv/` … | İlgili uzmanların alanı (sonraki aşamalarda) |
| `ticari/`, `teklifler/`, `sozlesmeler/`, `fiyatlar/` | Yalnızca ticari kol (`config/veri_erisimi.yaml`) |

- **Okunabilen biçimler:**
  - `.xlsx`, `.xlsm`: hücre adresli okunur (`Sayfa!C12`).
  - `.pdf`: sayfa numaralı metin olarak okunur (`s.3`).
  - `.docx`, `.txt`, `.md`, `.csv`: satır numaralı okunur (`satır 120`).
  - DWG ve taranmış PDF okunamaz; raporda "kapsam dışı" olarak belirtilir. `.bak` yedek dosyaları yok sayılır.
- **Sürüm:** Dosya adındaki `R2`, `rev3` veya `v4` gibi işaretten okunur. Tarih, dosyanın son değişiklik tarihidir.
- **Deneme modu (modelsiz):**
  - Excel dosyalarında yalnızca **"Özet" sayfası** okunur. Bu sayfada A sütunu anahtar (ör. `kablo_hendegi_m`), B sütunu değer, C sütunu birim olmalıdır.
  - Bazı ajanlar belirli bir sayfayı okur. Sayfaların başlıkları şöyle olmalıdır:
    - Evrak listesinde **"Evrak"**: Evrak, Revizyon, Tarih, Durum, Geçerlilik Bitiş.
    - Depo dosyasında **"Stok"**: Malzeme, Birim, Stok, İhtiyaç. Stok ihtiyaçtan azsa `EKSİK MALZEME` olarak raporlanır.
    - Kalite dosyasında **"Uygunsuzluk"**: No, Konu, Durum, Önem. Yalnızca açık kayıtlar raporlanır.
  - PDF ve Word metninde yalnızca **açık ifadeli miktarlar** okunur (ör. "Nebati toprak sıyırma: 120.400 m³"). İfadeler `config/capraz_anahtarlar.yaml > ifadeler` listesinde tanımlıdır. Her sayı, belirsizliği önlemek için en yakın ifadeye atanır.
  - İçeriği yorumlayarak analiz yapmak canlı modun işidir.

### Kodla zorlanan veri kuralları

- **Kaynak uydurma engeli:** Bir ajan raporunda yalnızca bu görevde **okuduğu** dosyaları veya alt raporlardan gelen kaynakları gösterebilir. Diğer her kaynak reddedilir.
- **Konum doğrulaması:** Raporda bir sayının kaynağı olarak bir konum gösterilir: Excel'de hücre (`Sayfa!C12`), PDF'de sayfa (`s.3`), Word'de satır (`satır 120`). Sistem o sayının gösterilen konumda gerçekten geçtiğini kontrol eder ve geçmiyorsa raporu reddeder. Aralık ya da hesap ifadesi (`Detay!C2:C9 toplamı`) kabul edilir, ama sunumda "doğrulanamadı" olarak işaretlenir.
- **Etiket yayılımı:** Ticari dosya okuyan veya ticari etiketli mesaj alan bir ajanın sonraki mesajları da `ticari` etiketi taşır. Örneğin fiyatı gören Proje Direktörü, Proje Müdürü'ne görev verdiğinde bu görev reddedilir; fiyat dolaylı yoldan da sızamaz.
- **Koşulsuz ajan etiketi:** Teklif & Maliyet Ajanı'nın işi fiyat olduğu için her mesajı `ticari` etiketlidir, ne okuduğundan bağımsız olarak (`config/veri_erisimi.yaml > ajan_etiketleri`). Bu etiket zincir boyunca Satın Alma Müdürü → Ticari Direktör → Proje Direktörü olarak taşınır.
- **Bilinen sınırlama:** Ticari etiketli bir rapor alan Proje Direktörü, **aynı görevde** saha veya proje koluna yeni görev veremez. Tedarik tarihi gibi fiyat içermeyen bilgiler de bu kurala takılır. Bu güvenli tarafta kalan bir kısıttır. Böyle bir bilgi mühendis üzerinden yeni bir taleple iletilmelidir.
- **Klasör sınırı:** Proje klasörünün dışına çıkılamaz. `..`, mutlak yol ve bağlantı (link) engellenir. Bir ajanın göremediği dosya, o ajana "bulunamadı" olarak döner.

### Move On entegrasyonu (salt okunur)

**Araştırma sonucu (2026-11-04):** Move On'un herkese açık bir API'si veya dışa aktarım biçimi hakkında doğrulanmış bir bilgi bulunamadı. Aynı adla uygulama mağazasında yer alan "MOVE ON Teknoloji A.Ş." uygulaması bir tarım platformu olarak tanıtılıyor; bunun şirketin kullandığı uygulama olup olmadığı da doğrulanamadı.

Bu yüzden geçici çözüm kullanılıyor: Move On'dan alınan sevkiyat dışa aktarımı (CSV veya Excel) `inbox/moveon/` klasörüne bırakılır. Bu klasör git'e girmez.

```powershell
python -m orkestrator ornek-moveon                 # SENTETİK örnek dışa aktarım (deneme için)
python -m orkestrator moveon --proje "Örnek GES"   # Lojistik Ajanı'nın gördüğü haliyle göster
python -m orkestrator talep "Genel durum ve sevkiyatlar" --proje ornek
```

**Kodla zorlanan kurallar:**
- **Yalnızca Lojistik Ajanı erişebilir.** Yetki kodda sabittir (`MOVEON_YETKILI`). Başka bir ajanın tanımına `moveon_oku` yazılırsa sistem açılmaz. Doğrulama bir şekilde atlatılsa bile araç yalnızca Lojistik Ajanı'na bağlanır.
- **Yalnızca okuma yapılır.** `moveon.py` içinde yazma, silme veya dış sisteme istek yapan bir fonksiyon yoktur ve bu durum testle doğrulanır. Sevkiyat değişikliği gerekirse ajan bunu `dis_sistem_yazma` türünde **önerir**; öneri onay kapısına düşer. Move On'a yazma, ileride ayrı ve onaylı bir yürütücü olarak eklenecek.
- **Yalnızca izinli sütunlar okunur:** sevkiyat no, proje, malzeme, miktar, birim, tarihler, durum. **Şoför adı, telefon, plaka, navlun bedeli ajana hiç verilmez.** Testler bu bilgilerin mesajlara, sunuma ve model bağlamına girmediğini doğrular.
- **Sayılar doğrulanır.** Move On'dan alınan bir sayı `moveon:<dosya>` kaynağı ve `satır N` konumuyla gösterilir, ve o satırda gerçekten geçip geçmediği kontrol edilir.

**Sütun adları farklıysa:** `config/moveon.yaml > sutunlar` bölümüne ekleyin (ör. `sevkiyat_no: ["Sefer No"]`). Projeye ait satırları ayırmak için proje eşlemesine `moveon_proje: "<Move On'daki proje adı>"` yazın.

**Deneme modunda yapılan kontroller:**
- Planlanan teslim tarihi geçmiş ama teslim edilmemiş sevkiyatlar (`GECİKEN SEVKİYAT`).
- Gecikmeli teslim edilmiş sevkiyatlar.
- Sahadan gelen eksik malzeme için Move On'da yolda olan bir sevkiyat olup olmadığı (`Tedarik durumu`).

**Move On API'si ortaya çıkarsa:** Aynı `satirlar()` arayüzünü sağlayan bir API okuyucusu `MoveOnKaynagi`nın yerine geçer. API anahtarı yalnızca orkestratörün ortam değişkeninde tutulur ve ajana gösterilmez.

### Kollar arası akış örneği: "kablo eksik"

1. Depocu, stok listesinde DC kablonun eksik olduğunu bulur. Bunu `EKSİK MALZEME` olarak bildirir ve ilettiği şey yalnızca bir öneridir; sipariş vermez.
2. Bilgi kademe kademe yukarı çıkar: Depocu → Saha Şefi → Saha Koordinatörü → Proje Direktörü. Saha Koordinatörü'nün Ticari Direktör'e doğrudan yazması kodla engellidir.
3. Proje Direktörü eksikleri Ticari Direktör'e `[TEDARİK]` görevi olarak iletir.
4. Görev Ticari Direktör → Satın Alma Müdürü → Satın Alma Ajanı yoluyla aşağı iner. Satın Alma Ajanı her eksik kalem için **sipariş önerisi** (`tur: siparis`) üretir.
5. Sipariş önerileri mühendis sunumunda ⛔ işaretiyle görünür ve onay kuyruğuna düşer. Bir kişi adıyla onaylamadan yürütülmezler.

Örnek projede bu akışı görmek için:

```powershell
python -m orkestrator talep "Genel durum" --proje veri/ornek-ges
```

### Bir talebin yolculuğu

1. Mühendis `talep` komutunu verir. Orkestratör bir görev numarası (`G-YYYYMMDD-NNNN`) açar ve talebi Proje Direktörü'ne iletir.
2. Proje Direktörü ilgili baş ajanlara görev verir, onlar da kendi altlarına. Aktarım otomatiktir; elle aktarım yoktur.
3. Her ajan üstüne **standart rapor** verir. Formata uymayan rapor reddedilir.
4. Bir ajan, altındaki tüm raporlar gelmeden yeniden çalıştırılmaz. Bu, maliyeti düşük tutar.
5. Proje Direktörü `muhendise_sun` aracıyla karar önerisini gönderir: Devam, Koşullu devam veya Durdur. Orkestratör sunuma iki şey ekler ve Proje Direktörü bunları çıkaramaz:
   - görevdeki tüm raporların kodla yapılmış **sayısal çapraz kontrolü**,
   - **rapor zincirinin** tamamı.
6. Sunum `runs/<tarih>/muhendis/sunum_<görev-no>.md` dosyasına (ayrıca `.json` olarak) yazılır.
7. Dış etkili öneriler **onay kuyruğuna** düşer: sipariş, teklif gönderme, sahaya talimat, dış sisteme yazma. Bunlar ancak bir kişinin adıyla verilen onaydan sonra yürütülebilir. Şu an hiçbir otomatik yürütücü tanımlı değil, yani sistem dış sisteme hiçbir şey yazmaz.

### Standart rapor formatı

Şema `orkestrator/rapor.py` dosyasındadır. Bir rapor şu alanlardan oluşur:

| Alan | İçerik |
|---|---|
| `ozet` | Özet. Veri yoksa "veri yok" yazılır. |
| `veri_kaynaklari` | Kullanılan kaynaklar: dosya, sürüm, tarih |
| `varsayimlar` | Varsayımlar |
| `riskler` | Riskler ve tutarsızlıklar |
| `onerilen_aksiyonlar` | Önerilen aksiyonlar ve türü: `oneri`, `siparis`, `teklif_gonderme`, `saha_talimati`, `dis_sistem_yazma` |
| `guven` | Güven seviyesi (`dusuk`, `orta`, `yuksek`) ve nedeni |
| `sayisal_degerler` | Her sayı için anahtar, değer, birim, dosya ve konum (sayfa, sekme veya hücre) |

Kod şu raporları reddeder:

- kaynağı gösterilmemiş bir sayı içeren rapor,
- `veri_kaynaklari` listesinde olmayan bir dosyaya dayanan sayı içeren rapor,
- hiç kaynak göstermeden "yüksek" veya "orta" güven bildiren rapor.

Çapraz kontrol anahtarları ve toleranslar `config/capraz_anahtarlar.yaml` dosyasındadır.

## Klasör yapısı

| Yol | İçerik |
|---|---|
| `config/izinler.yaml` | **İzin tablosu**: kim kime, hangi tür mesaj atabilir. Tabloda yazmayan her şey yasaktır. |
| `config/veri_erisimi.yaml` | Hangi ajan hangi veri etiketini (ör. `ticari`) görebilir. |
| `config/modeller.yaml` | Model, tur sınırı, bütçe, adım sınırı ve çalışma modu (`deneme` / `canli`). |
| `config/capraz_anahtarlar.yaml` | Çapraz kontrol edilen sayısal konular ve toleransları. |
| `knowledge/beceriler/` | Ajanların bilgi tabanı: solar beceri dosyaları. Git'e girmez (bkz. "Bilgi tabanı"). |
| `agents/<ajan>.yaml` | Her ajanın tanımı: rol, üst ajan, yapabilecekleri, yapamayacakları, araçları, rapor formatı. |
| `orkestrator/` | Yönlendirici, kayıt ve yapılandırma kodu. |
| `runs/<tarih>/` | Mesaj kayıtları (git'e girmez). |
| `tests/` | Kabul testleri. |

## Kurallar kodda nasıl zorlanıyor?

1. **Ajanların birbirini çağıracak aracı yok.** Her mesaj `Yonlendirici.gonder()` üzerinden geçer. Ajan tanımına `Agent`, `Task`, `Bash`, `Read`, `WebFetch` gibi bir araç yazılırsa sistem açılmaz. Bu liste koddadır (`YASAK_ARACLAR`), yapılandırma dosyasıyla gevşetilemez.
2. **Varsayılan kural yasaktır.** Bir mesajın geçmesi için izin tablosunda o yön ve o tür için açık bir satır bulunmalıdır. Reddedilen her mesaj `runs/<tarih>/_reddedilenler.jsonl` ve `runs/<tarih>/<gönderen>/reddedilen.jsonl` dosyalarına nedeniyle birlikte kaydedilir.
3. **Kesin yasak:** Saha Koordinatörü ile Ticari Direktör arasında hiçbir yönde, hiçbir türde mesaj geçmez. Bu çift izin tablosuna yanlışlıkla eklense bile sistem açılmaz.
4. **Tablo hiyerarşiyle birebir aynı olmalı.** `agents/*.yaml` içindeki `ust:` alanından olması gereken tablo türetilir ve `config/izinler.yaml` ile karşılaştırılır. Fazla bir izin (ör. yanal iletişim) veya eksik bir izin varsa sistem açılmaz.
5. **Veri ayrımı:** `ticari` etiketli bir mesaj, bu etiketi görme yetkisi olmayan ajana gönderilemez.
6. **Kayıt:** Her mesajda gönderen, alıcı, zaman, görev numarası (`G-YYYYMMDD-NNNN`), tür ve mesaj kimliği bulunur.
7. **Mühendise yalnızca Proje Direktörü'nün onayladığı sunum gider.** Sunumda Proje Direktörü onay kaydı, çapraz kontrol sonucu ve rapor zinciri bulunmalıdır. Biri eksikse sunum reddedilir.
8. **Gönderen kimliği araca gömülüdür.** Ajan başka bir ajan adına mesaj atamaz. Proje Direktörü rapor veremez, uzmanlar görev veremez.
9. **Canlı modda ajan yalnızca orkestratör araçlarını kullanabilir.** Bunu şu ayarlar sağlar: `tools=[]`, `strict_mcp_config`, `setting_sources=[]`, `permission_mode="dontAsk"` ve boş bir çalışma dizini. Ajanın dosyaya, kabuğa, internete, alt ajanlara ve ortam değişkenlerine erişimi yoktur. API anahtarı orkestratör sürecinde kalır.

## Hiyerarşiyi veya modeli değiştirmek

- **Yeni ajan eklemek:** `agents/` klasörüne bir dosya ekleyin (`ust:` alanını doldurun). Ardından `config/izinler.yaml` dosyasına `gorev` ve `rapor` satırlarını ekleyin. Son olarak `python -m orkestrator dogrula` komutunu çalıştırın.
- **Model değiştirmek:** Yalnızca `config/modeller.yaml` dosyasını düzenleyin.

## Bilgi tabanı (solar beceri dosyaları)

Ajanların alan bilgisi `knowledge/beceriler/*.md` dosyalarından okunur. Bu dosyalar şirket hesabındaki solar becerilerinin kopyasıdır. Depo herkese açık olduğu için **git'e eklenmezler**. Ekip arkadaşları dosyaları şirket içi yoldan alıp bu klasöre koymalıdır. Dosya yoksa ajan bilgi tabanı olmadan çalışır.

## Canlı moda geçiş (ücretli)

1. [platform.claude.com](https://platform.claude.com/) üzerinde şirket adına bir hesap açın ve aylık harcama limiti koyun.
2. Bir API anahtarı oluşturun. Anahtarı yalnızca kendi oturumunuzda ortam değişkeni olarak tanımlayın (`$env:ANTHROPIC_API_KEY = "..."`), hiçbir dosyaya yazmayın.
3. `pip install -r requirements.txt` komutunu çalıştırın (Claude Agent SDK dahil).
4. `config/modeller.yaml` dosyasında `mod: canli` yapın.

## Maliyet

- `mod: deneme` ile hiçbir API çağrısı yapılmaz ve hiçbir ücret oluşmaz.
- Gerçek ajanlar (`mod: canli`, Aşama 2 ve sonrası) bir Anthropic API anahtarı gerektirir ve kullandıkça ücretlendirilir. Claude Agent SDK, claude.ai abonelik girişini bu tür uygulamalar için desteklemez.
- Maliyeti düşük tutmak için uzman ajanlar en ucuz modeli (Haiku), yönetici ajanlar Sonnet'i kullanır. Her çalıştırmanın bir dolar üst sınırı vardır (`calistirma_butcesi_usd`).
- Anahtar yalnızca orkestratörün ortam değişkeninde (`ANTHROPIC_API_KEY`) tutulur. Hiçbir ajan anahtara erişemez.

## Yol haritası

1. ✅ İskelet, izin tablosu, orkestratör çekirdeği
2. ✅ Proje Direktörü ajanı, standart rapor şeması, çapraz kontrol, onay kapısı, mühendise sunum
3. ✅ Pilot kol: Proje Müdürü, Hafriyat Ajanı ve Evrak Takip Uzmanı; proje verisi aracı, kaynak/konum doğrulaması; PDF/Word okuma, proje eşlemesi, EK-11 kontrolü
4. ✅ Saha kolu ve ticari kol; kollar arası aktarma, koşulsuz ticari etiket, sızıntı testleri
5. ✅ Move On (salt okunur, dışa aktarım klasörü; yalnızca Lojistik; kişisel/ticari sütunlar filtrelenir)
6. ✅ Proje Tasarım, Drenaj ve CCTV/Telcit ajanları (kollar arası çapraz kontrol: tasarım ↔ satın alma)

**Sıradaki adımlar (henüz yapılmadı):**
- Canlı modun gerçek bir API anahtarıyla denenmesi.
- Move On'un gerçek bir dışa aktarım dosyasıyla denenmesi.
- Mühendis arayüzü.
- Move On'a yazma (insan onayıyla).

## Kabul ölçütleri ve doğrulayan testler

`python -m pytest -q` komutuyla çalıştırılır. Testler API çağrısı yapmaz ve yalnızca sentetik veri kullanır.

| Ölçüt | Testler |
|---|---|
| Saha Koordinatörü'nden Ticari Direktör'e doğrudan mesaj teknik olarak başarısız oluyor ve kayda geçiyor | `test_yonlendirici.py::test_saha_ticari_arasi_her_yonde_her_turde_reddedilir` (2 yön × 4 tür), `test_asama4.py::test_tam_akis_sunum_ve_hiyerarsi` |
| Yanal ve kademe atlayan iletişim yok | `test_yonlendirici.py::test_yanal_ve_kademe_atlayan_mesaj_reddedilir`, `test_yanal_izin_eklenirse_yapilandirma_reddedilir` |
| Ajanların başka ajan çağırma aracı yok | `test_ajana_baska_ajan_cagirma_veya_dosya_araci_verilemez`, `test_canli_mod_ajan_secenekleri_kilitli` |
| Her ajan çıktısı standart rapor formatında | `test_asama2.py::test_eksik_veya_uydurma_kaynakli_rapor_reddedilir`, `test_muhendise_yalnizca_pd_onayli_tek_sunum_gider` |
| Proje Direktörü onayı olmadan mühendise çıktı gitmiyor | `test_pd_onaysiz_veya_pd_disi_sunum_reddedilir`, `test_muhendise_yalnizca_proje_direktoru_ulasir` |
| Dış etkili işlemler insan onayı olmadan çalışmıyor | `test_dis_etkili_aksiyon_onay_kuyruguna_duser_ve_onaysiz_yurutulmez`, `test_dis_etkili_yurutucu_kapı_disindan_calismaz` |
| Ticari veri saha ve proje kollarına sızmıyor | `test_asama4.py::test_ticari_veri_saha_ve_proje_kollarina_sizmaz`, `test_ticari_gormus_pd_sahaya_gorev_veremez`, `test_asama3.py::test_ticari_veri_goren_pd_bunu_proje_koluna_aktaramaz` |
| Sayıların kaynağı izlenebilir; uydurma kaynak veya değer reddediliyor | `test_uydurma_kaynak_ve_yanlis_hucre_reddedilir`, `test_word_satir_konumu_dogrulanir`, `test_uydurma_moveon_degeri_reddedilir` |
| Move On'a yalnızca Lojistik Ajanı erişiyor ve yalnızca okuyabiliyor | `test_asama5_moveon.py::test_lojistik_disinda_kimse_okuyamaz`, `test_yazma_yetenegi_yok`, `test_moveon_araci_baska_ajana_verilemez` |
| Sırlar ajana ulaşmıyor | `test_canli_mod_ajan_secenekleri_kilitli` (API anahtarı istemde ve gelen kutusunda yok; ajanın kabuk ve ortam değişkeni erişimi yok) |
