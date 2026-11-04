"""Move On entegrasyonu — Aşama 5: SALT OKUNUR.

Move On'un herkese açık bir API'si veya dışa aktarım biçimi hakkında doğrulanmış
bilgi bulunamadı. Bu yüzden geçici çözüm: Move On'dan alınan CSV/Excel dışa
aktarımı belirli bir klasöre (config/moveon.yaml > klasor) bırakılır, bu modül
en güncel dosyayı okur.

Kurallar (kodla zorlanır):
- YALNIZCA Lojistik Ajanı erişebilir (MOVEON_YETKILI; yapılandırmayla genişletilemez).
- Yalnızca okuma: bu modülde yazma, silme veya dış sisteme istek yapan hiçbir
  fonksiyon yoktur. Yazma, ileride ayrı bir yürütücü olarak ve yalnızca insan
  onayı kapısından (kapi.py) geçerek eklenecektir.
- Yalnızca izinli sütunlar okunur. Şoför adı, telefon, plaka, navlun bedeli gibi
  kişisel veya ticari sütunlar ajana hiç verilmez.
- Okunan her dosya kayda geçer; raporda `moveon:<dosya>` kaynağı ve `satır N`
  konumu ile gösterilir ve doğrulanır.

İleride Move On API'si netleşirse, aynı `satirlar()` arayüzünü sağlayan bir
API okuyucusu bu sınıfın yerine geçebilir.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import yaml

from .veri import katla, sayilar
from .yapilandirma import KOK, MOVEON_YETKILI  # noqa: F401  (yetkili ajanlar kodda sabit)
ONEK = "moveon:"
SENTETIK_ONEK = "SENTETIK_"

# Standart alan -> Move On dışa aktarımında olası sütun adları (büyük/küçük harf ve Türkçe karakter duyarsız)
VARSAYILAN_SUTUNLAR = {
    "sevkiyat_no": ["Sevkiyat No", "Sevkiyat", "İrsaliye No", "Shipment ID", "Shipment No"],
    "proje": ["Proje", "Proje Adı", "Şantiye", "Project"],
    "malzeme": ["Malzeme", "Ürün", "Yük", "Material", "Cargo"],
    "miktar": ["Miktar", "Adet", "Quantity"],
    "birim": ["Birim", "Unit"],
    "cikis_tarihi": ["Çıkış Tarihi", "Yükleme Tarihi", "Departure"],
    "planlanan_teslim": ["Planlanan Teslim", "Tahmini Teslim", "ETA", "Planned Delivery"],
    "gerceklesen_teslim": ["Gerçekleşen Teslim", "Teslim Tarihi", "Delivered"],
    "durum": ["Durum", "Status"],
}


class MoveOnHatasi(Exception):
    pass


@dataclass
class MoveOnAyari:
    klasor: Path
    sutunlar: dict[str, list[str]]
    proje_filtresi: str | None = None


def ayar_yukle(kok: Path = KOK) -> MoveOnAyari | None:
    yol = kok / "config" / "moveon.yaml"
    if not yol.exists():
        return None
    d = yaml.safe_load(yol.read_text(encoding="utf-8")) or {}
    klasor = Path(d.get("klasor") or "inbox/moveon")
    if not klasor.is_absolute():
        klasor = kok / klasor
    sutunlar = {k: list(v) for k, v in VARSAYILAN_SUTUNLAR.items()}
    for k, v in (d.get("sutunlar") or {}).items():
        if k not in VARSAYILAN_SUTUNLAR:
            raise MoveOnHatasi(f"config/moveon.yaml: bilinmeyen standart alan '{k}'")
        sutunlar[k] = list(v) + sutunlar[k]
    return MoveOnAyari(klasor=klasor, sutunlar=sutunlar, proje_filtresi=d.get("proje_filtresi"))


def _tarih(v):
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for bicim in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, bicim).date()
        except ValueError:
            pass
    return None


class MoveOnKaynagi:
    def __init__(self, ayar: MoveOnAyari):
        self.ayar = ayar
        self.okunanlar: dict[str, set[str]] = {}

    def _yetki(self, ajan: str) -> None:
        if ajan not in MOVEON_YETKILI:
            raise MoveOnHatasi(f"{ajan}: Move On verisine erişim yetkisi yok")

    def son_dosya(self) -> Path | None:
        k = self.ayar.klasor
        if not k.is_dir():
            return None
        adaylar = [p for p in k.iterdir() if p.is_file() and not p.is_symlink()
                   and p.suffix.lower() in (".csv", ".xlsx", ".xlsm") and not p.name.startswith(("~$", "."))]
        # Sentetik (tanıtım) dosyası, klasörde gerçek bir dışa aktarım varsa ASLA seçilmez.
        gercek = [p for p in adaylar if not p.name.upper().startswith(SENTETIK_ONEK)]
        secim = gercek or adaylar
        return max(secim, key=lambda p: p.stat().st_mtime) if secim else None

    @staticmethod
    def _ham_satirlar(yol: Path) -> list[list]:
        if yol.suffix.lower() == ".csv":
            veri = yol.read_bytes()
            for kod in ("utf-8-sig", "cp1254"):
                try:
                    metin = veri.decode(kod)
                    break
                except UnicodeDecodeError:
                    continue
            ilk = metin.splitlines()[0] if metin else ""
            ayrac = max([";", ",", "\t"], key=ilk.count)
            return list(csv.reader(io.StringIO(metin), delimiter=ayrac))
        from openpyxl import load_workbook
        wb = load_workbook(yol, read_only=True, data_only=True)
        try:
            return [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
        finally:
            wb.close()

    def _eslestir(self, baslik: list) -> dict[str, int]:
        kat = [katla(str(b or "")).strip() for b in baslik]
        sonuc = {}
        for alan, adlar in self.ayar.sutunlar.items():
            for ad in adlar:
                if katla(ad) in kat:
                    sonuc[alan] = kat.index(katla(ad))
                    break
        return sonuc

    def satirlar(self, ajan: str, proje: str | None = None) -> tuple[str, list[dict], list[str]]:
        """(kaynak_adı, satırlar, uyarılar). Her satır yalnızca standart alanları ve 'satir' numarasını içerir."""
        self._yetki(ajan)
        yol = self.son_dosya()
        if yol is None:
            raise MoveOnHatasi(f"Move On dışa aktarım klasöründe dosya yok: {self.ayar.klasor}")
        ham = self._ham_satirlar(yol)
        if not ham:
            return ONEK + yol.name, [], ["dosya boş"]
        harita = self._eslestir(ham[0])
        uyarilar = []
        eksik = [a for a in ("sevkiyat_no", "malzeme", "durum") if a not in harita]
        if eksik:
            uyarilar.append(f"tanınmayan sütun yapısı; eksik alanlar: {', '.join(eksik)} (config/moveon.yaml > sutunlar)")
        atlanan = len([b for i, b in enumerate(ham[0]) if b not in (None, "") and i not in harita.values()])
        if atlanan:
            uyarilar.append(f"{atlanan} sütun izin listesinde olmadığı için okunmadı (kişisel/ticari veri olabilir)")
        filtre = proje or self.ayar.proje_filtresi
        sonuc = []
        for n, r in enumerate(ham[1:], 2):
            if not any(v not in (None, "") for v in r):
                continue
            d = {alan: (r[i] if i < len(r) else None) for alan, i in harita.items()}
            if filtre and "proje" in d and katla(filtre) not in katla(str(d["proje"] or "")):
                continue
            d["satir"] = n
            sonuc.append(d)
        ad = ONEK + yol.name
        self.okunanlar.setdefault(ajan, set()).add(ad)
        return ad, sonuc, uyarilar

    def tarih_bilgisi(self) -> str:
        yol = self.son_dosya()
        return date.fromtimestamp(yol.stat().st_mtime).isoformat() if yol else "veri yok"

    def dogrula(self, kaynak: str, konum: str, deger: float) -> tuple[str, object]:
        """Kaynak doğrulama: 'satır N' konumundaki izinli alanlarda sayı geçiyor mu."""
        yol = self.son_dosya()
        if yol is None or kaynak != ONEK + yol.name:
            return "uyusmuyor", "bu Move On dosyası artık güncel değil veya yok"
        import re
        m = re.match(r"^\s*satır\s*(\d+)\s*$", str(konum or ""), re.IGNORECASE)
        if not m:
            return "dogrulanamadi", None
        ham = self._ham_satirlar(yol)
        n = int(m.group(1))
        if not 2 <= n <= len(ham):
            return "uyusmuyor", None
        harita = self._eslestir(ham[0])
        izinli = " ".join(str(ham[n - 1][i]) for i in harita.values() if i < len(ham[n - 1]))
        bulunan = sayilar(izinli)
        ok = any(abs(x - float(deger)) <= 1e-6 * max(1.0, abs(x)) for x in bulunan)
        return ("dogrulandi" if ok else "uyusmuyor"), bulunan[:8]


def gecikme_analizi(satirlar: list[dict], bugun: date | None = None) -> list[str]:
    """Deneme modu kuralı: planlanan teslimi geçmiş ve teslim edilmemiş sevkiyatlar."""
    bugun = bugun or date.today()
    riskler = []
    for s in satirlar:
        plan, ger = _tarih(s.get("planlanan_teslim")), _tarih(s.get("gerceklesen_teslim"))
        teslim = ger is not None or "teslim" in katla(str(s.get("durum") or ""))
        if plan and not teslim and plan < bugun:
            riskler.append(f"GECİKEN SEVKİYAT: {s.get('sevkiyat_no')} — {s.get('malzeme')} {s.get('miktar') or ''} "
                           f"{s.get('birim') or ''}, planlanan teslim {plan.isoformat()} ({(bugun - plan).days} gün geç; "
                           f"durum: {s.get('durum')}; Move On › satır {s['satir']})")
        elif plan and ger and ger > plan:
            riskler.append(f"Gecikmeli teslim edildi: {s.get('sevkiyat_no')} — {s.get('malzeme')}, "
                           f"{(ger - plan).days} gün geç (Move On › satır {s['satir']})")
    return riskler


def eksik_karsilama(eksik_satirlari: list[str], satirlar: list[dict]) -> list[str]:
    """Deneme modu: 'EKSİK MALZEME: <ad> — ...' satırları için yolda/bekleyen sevkiyat var mı."""
    sonuc = []
    for e in eksik_satirlari:
        ad = e.split(":", 1)[1].split("—")[0].strip()
        anahtar = [w for w in katla(ad).split() if len(w) >= 2][:2]
        eslesen = [s for s in satirlar if anahtar and all(w in katla(str(s.get("malzeme") or "")) for w in anahtar)
                   and not _tarih(s.get("gerceklesen_teslim"))]
        if eslesen:
            for s in eslesen:
                sonuc.append(f"{ad}: {s.get('miktar')} {s.get('birim') or ''} sevkiyatta ({s.get('sevkiyat_no')}, "
                             f"durum: {s.get('durum')}, planlanan teslim {s.get('planlanan_teslim')}; Move On › satır {s['satir']})")
        else:
            sonuc.append(f"{ad}: Move On'da bekleyen sevkiyat yok")
    return sonuc


def ornek_disa_aktarim(klasor: Path, bugun: date | None = None) -> Path:
    """SENTETİK Move On dışa aktarımı (test/tanıtım). Kişisel ve ticari sütunlar bilerek eklidir:
    okuyucunun bunları ajana VERMEDİĞİ test edilir."""
    from datetime import timedelta
    b = bugun or date.today()
    t = lambda g: (b + timedelta(days=g)).strftime("%d.%m.%Y")  # noqa: E731
    satirlar = [
        ["Sevkiyat No", "Proje", "Malzeme", "Miktar", "Birim", "Çıkış Tarihi", "Planlanan Teslim",
         "Gerçekleşen Teslim", "Durum", "Plaka", "Şoför", "Telefon", "Navlun (TL)"],
        ["MO-2026-0141", "Örnek GES", "DC kablo 6 mm²", "2000", "m", t(-5), t(3), "", "Yolda",
         "34 SNT 001", "Sentetik Sürücü", "0000 000 00 00", "18500"],
        ["MO-2026-0138", "Örnek GES", "PV modül 575 Wp", "3600", "adet", t(-12), t(-2), "", "Yolda",
         "34 SNT 002", "Sentetik Sürücü 2", "0000 000 00 01", "42000"],
        ["MO-2026-0130", "Örnek GES", "Konstrüksiyon profili", "40", "ton", t(-20), t(-10), t(-9), "Teslim edildi",
         "34 SNT 003", "Sentetik Sürücü 3", "0000 000 00 02", "27000"],
        ["MO-2026-0150", "Başka GES", "İnverter", "12", "adet", t(-3), t(4), "", "Yolda",
         "34 SNT 004", "Sentetik Sürücü 4", "0000 000 00 03", "9000"],
    ]
    klasor.mkdir(parents=True, exist_ok=True)
    yol = klasor / f"{SENTETIK_ONEK}moveon_sevkiyat_{b.strftime('%Y%m%d')}.csv"
    with open(yol, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f, delimiter=";").writerows(satirlar)
    return yol
