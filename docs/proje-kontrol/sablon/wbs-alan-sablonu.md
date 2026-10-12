# WBS ve alan Excel şablonu

Dosya: `wbs-alan-sablonu.xlsx`. Yeniden üretmek için:

```
node scripts/proje-kontrol/wbs-alan/sablon-uret.mjs          # kurgu örnek satırlarla
node scripts/proje-kontrol/wbs-alan/sablon-uret.mjs out.xlsx --bos   # örneksiz
```

Şablondaki örnek satırlar kurgudur: TIZ test projesine benzer ama gerçek proje verisi değildir. Kendi verinizi yazmadan önce
bu satırları silin.

## Sayfa düzeni

Her sayfanın 1. satırı başlıktır, 2. satırı açıklamadır, 3. satırı kolon başlıklarıdır. Veri 4. satırdan başlar. Hata
raporlarındaki satır numarası Excel'deki satır numarasıdır. Boş satırlar atlanır. Kolon başlıklarını değiştirmeyin; değişen
başlık "header_mismatch" hatası verir. Sayfa başına en fazla 5.000 satır yazılabilir.

### WBS

| Kolon | Zorunlu | Kural |
|---|---|---|
| WBS Kodu | Evet | Büyük harf, rakam ve tire; harf veya rakamla başlar (`DYB-020`). |
| Ad | Evet | |
| Üst WBS Kodu | Hayır | Boşsa kök WBS. Dosyada veya projede bulunmalı. |
| Disiplin | Hayır | `mechanical`, `dc`, `ac`, `mv`, `hv`, `enh`, `civil`, `scada`, `general` (açılır liste). |
| Aktif | Hayır | `Evet` / `Hayır`; boşsa Evet. |
| Not | Hayır | |

**Sıra kolonu yoktur. WBS listesi koda göre sıralanır.** Kodları sabit haneli yazın: `DYB-020`, `DYB-100`.
`DYB-20` yazılırsa `DYB-100`'den sonra sıralanır.

### Alanlar

| Kolon | Zorunlu | Kural |
|---|---|---|
| Alan Kodu | Evet | Yalnızca büyük harf ve rakam, **tire yok** (`B1`, `INV12`). Alan kodu Activity ID'nin parçasıdır. |
| Ad | Evet | |
| Alan Tipi | Hayır | `genel`, `ges`, `pv_blok`, `inverter_station`, `mv_feeder`, `tm`, `eih_section`, `depo`, `laydown`, `kamp`, `yol`, `diger` (açılır liste). Boşsa `diger`. |
| Üst Alan Kodu | Hayır | Boşsa kök alan. |
| Aktif | Hayır | `Evet` / `Hayır`; boşsa Evet. |
| Not | Hayır | |

### Alan-WBS

| Kolon | Zorunlu | Kural |
|---|---|---|
| Alan Kodu | Evet | Alanlar sayfasında veya projede bulunmalı. |
| WBS Kodu | Evet | WBS sayfasında veya projede bulunmalı. |

Bir WBS'e (veya üst WBS'lerinden birine) alan bağlanırsa, bu WBS'te Activity ID alacak görevlerin alanı bağlı alanlardan
biri olmalıdır (Karar 38). Bağ tanımlanmayan WBS'te her alan kullanılabilir.

## Kurallar

| Kod | Ne zaman |
|---|---|
| `required_missing` | Kod veya ad boş |
| `code_format` | WBS veya alan kodu biçime uymuyor |
| `value_invalid` | Aktif Evet/Hayır değil, alan tipi listede yok |
| `discipline_unknown` | Disiplin listede yok |
| `duplicate_in_file` | Aynı kod veya aynı alan-WBS çifti dosyada ikinci kez geçiyor (ilk satır geçerli sayılır) |
| `parent_missing` | Üst kod ne dosyada ne projede var |
| `self_parent` | Kayıt kendi üstü |
| `cycle` | Üst zinciri döngü oluşturuyor |
| `inactive_parent_active_child` | Aktif kayıt pasif bir üstün altında |
| `deactivate_with_active_children` | Pasifleştirilen kaydın dosyada olmayan aktif alt kaydı var (yalnızca projeyle) |
| `link_area_missing`, `link_wbs_missing` | Alan-WBS satırındaki kod tanımlı değil |
| `row_limit` | Sayfada 5.000'den fazla satır |
| `aid_impact` | Değişiklik Activity ID'li bir görevi etkiliyor (yalnızca projeyle; import engellenir) |

## Kontrol ve import

- **Proje olmadan kontrol:**
  - `node scripts/proje-kontrol/wbs-alan/kontrol.mjs dosya.xlsx`
  - Veritabanına bağlanmaz.
  - Raporu konsola ve `dosya.kontrol.md`'ye yazar.
- **Projeye import:** `import_wbs_areas(proje, dosya içeriği, önizleme)` (yalnızca admin ve proje yöneticisi).
  - Önce önizleme yapılır. Önizleme hiçbir şey yazmaz; eklenecek, güncellenecek, değişmeyecek ve hatalı satırları gösterir.
  - Gerçek import hepsi ya da hiçbiri şeklinde çalışır: bir hata veya Activity ID etkisi varsa hiçbir satır yazılmaz.
  - Kayıtlar koda göre eşleşir.
  - Dosyada olmayan kayıtlar silinmez, yalnızca raporlanır. Alan-WBS bağları yalnızca eklenir.
  - Kod değiştirmek için yeni kod yeni kayıt olarak eklenir; eski kayıt dosyada `Aktif = Hayır` yazılarak ya da ekrandan
    pasifleştirilir. Görevi olan kaydın kodu değiştirilemez; Activity ID'li görevin alanı/WBS'i pasifleştirilemez.
