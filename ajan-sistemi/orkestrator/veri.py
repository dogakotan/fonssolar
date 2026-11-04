"""Proje verisine erişim: ajanların TEK veri kaynağı.

- Ajan yalnızca seçili proje klasörünün içini görebilir (klasör dışına çıkış,
  mutlak yol ve bağlantı engellenir). Proje klasöründe hiçbir şey değiştirilmez.
- Her dosyanın bir ALANI (hafriyat, evrak, tasarim ...) ve ETİKETLERİ (ör.
  ticari) vardır. Alan/etiket, proje yapılandırmasındaki klasör eşlemesinden
  (config/projeler/<ad>.yaml) veya klasör adından gelir.
- Etiketi göremeyen ajan dosyayı listede bile görmez; okumaya çalışırsa
  "bulunamadı" yanıtı alır.
- Her okuma kaydedilir; ajanın raporda gösterebileceği kaynaklar okuduğu
  dosyalarla sınırlıdır (bkz. akis.py kaynak kontrolü).
- Okunabilen biçimler: xlsx/xlsm (hücre adresli), pdf (sayfa numaralı metin),
  docx/txt/md/csv (satır numaralı). DWG ve taranmış PDF okunamaz.
"""
from __future__ import annotations

import csv
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

from .yapilandirma import Yapilandirma

OKUNABILIR = {".xlsx", ".xlsm", ".csv", ".txt", ".md", ".pdf", ".docx"}
YOKSAY = {".bak", ".tmp", ".lnk", ".dwl", ".dwl2", ".lock"}
_SURUM = re.compile(r"(?:^|[_\-\s.])(R\d+|rev\.?\s?\d+|v\d+)(?=[_\-\s.]|$)", re.IGNORECASE)
_HUCRE = re.compile(r"^(?P<sayfa>[^!]+)!(?P<hucre>[A-Z]{1,3}[0-9]{1,7})$")
_SAYFA_KONUM = re.compile(r"^\s*(?:s\.|sayfa\s*)(\d+)\s*$", re.IGNORECASE)
_SATIR_KONUM = re.compile(r"^\s*satır\s*(\d+)\s*$", re.IGNORECASE)
_SAYI = re.compile(r"(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\.\d{1,2}(?![\d])|\d+(?:,\d+)?)(?![\d])")
OZET_SAYFALARI = {"özet", "ozet"}


class VeriErisimHatasi(Exception):
    pass


def katla(metin: str) -> str:
    """Türkçe karakterleri sadeleştirip küçük harfe çevirir (karşılaştırma için)."""
    m = str(metin).replace("İ", "i").replace("I", "ı").lower()
    m = m.translate(str.maketrans("ıışçğöü", "iiscgou"))
    return unicodedata.normalize("NFKD", m).encode("ascii", "ignore").decode()


def sayi_coz(metin: str) -> float | None:
    """'120.400' -> 120400, '120.400,00' -> 120400.0, '1,29' -> 1.29."""
    s = metin.strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def sayilar(metin: str) -> list[float]:
    return [v for v in (sayi_coz(x) for x in _SAYI.findall(metin)) if v is not None]


@dataclass
class DosyaBilgisi:
    dosya: str              # proje klasörüne göre yol
    surum: str
    tarih: str              # son değişiklik tarihi (YYYY-MM-DD)
    alan: str               # hafriyat / evrak / tasarim / ...
    etiketler: tuple[str, ...]
    okunabilir: bool

    def sozluk(self) -> dict:
        return {"dosya": self.dosya, "surum": self.surum, "tarih": self.tarih, "alan": self.alan,
                "etiketler": list(self.etiketler), "okunabilir": self.okunabilir}


@lru_cache(maxsize=64)
def _pdf_sayfalari(yol: str, mtime: float) -> tuple[str, ...]:
    from pypdf import PdfReader
    try:
        return tuple((p.extract_text() or "") for p in PdfReader(yol).pages)
    except Exception:  # noqa: BLE001  bozuk/şifreli PDF: metin yok say
        return ()


@lru_cache(maxsize=64)
def _docx_satirlari(yol: str, mtime: float) -> tuple[str, ...]:
    xml = zipfile.ZipFile(yol).read("word/document.xml").decode("utf-8", errors="replace")
    xml = re.sub(r"<w:tab/>", "\t", xml)
    metin = re.sub(r"<[^>]+>", "", re.sub(r"</w:p>", "\n", xml))
    metin = metin.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    return tuple(s.strip() for s in metin.splitlines() if s.strip())


class VeriDeposu:
    def __init__(self, klasor: Path, yapi: Yapilandirma, klasor_etiketleri: dict[str, str],
                 alan_haritasi: dict[str, str] | None = None, etiket_haritasi: dict[str, str] | None = None):
        self.klasor = Path(klasor).resolve()
        if not self.klasor.is_dir():
            raise VeriErisimHatasi(f"proje klasörü bulunamadı: {klasor}")
        self.yapi = yapi
        self.klasor_etiketleri = klasor_etiketleri
        # önek eşlemesi: en uzun eşleşen önek kazanır
        self.alan_haritasi = sorted(((katla(k).rstrip("/"), v) for k, v in (alan_haritasi or {}).items()),
                                    key=lambda x: -len(x[0]))
        self.etiket_haritasi = [(katla(k).rstrip("/"), v) for k, v in (etiket_haritasi or {}).items()]
        self.okunanlar: dict[str, set[str]] = {}       # ajan -> okuduğu dosyalar

    # ---------------------------------------------------------------- yardımcı
    @staticmethod
    def _onek_uyar(rel_k: str, onek: str) -> bool:
        return rel_k == onek or rel_k.startswith(onek + "/")

    def _alan(self, rel: str) -> str:
        rel_k = katla(rel)
        for onek, alan in self.alan_haritasi:
            if self._onek_uyar(rel_k, onek):
                return alan
        parcalar = Path(rel).parts
        return katla(parcalar[0]) if len(parcalar) > 1 else ""

    def _etiketler(self, rel: str) -> tuple[str, ...]:
        et = {self.klasor_etiketleri[katla(p)] for p in Path(rel).parts[:-1] if katla(p) in self.klasor_etiketleri}
        rel_k = katla(rel)
        et |= {e for onek, e in self.etiket_haritasi if self._onek_uyar(rel_k, onek)}
        return tuple(sorted(et))

    def _bilgi(self, yol: Path) -> DosyaBilgisi:
        rel = yol.relative_to(self.klasor).as_posix()
        m = _SURUM.search(yol.stem)
        return DosyaBilgisi(rel, m.group(1).upper().replace(" ", "").replace(".", "") if m else "veri yok",
                            date.fromtimestamp(yol.stat().st_mtime).isoformat(),
                            self._alan(rel), self._etiketler(rel), yol.suffix.lower() in OKUNABILIR)

    def _gorebilir(self, ajan: str, b: DosyaBilgisi) -> bool:
        return all(self.yapi.etiketi_gorebilir(ajan, e) for e in b.etiketler)

    def _guvenli_yol(self, rel: str) -> Path:
        if not rel or Path(rel).is_absolute() or ".." in Path(rel).parts or ":" in rel:
            raise VeriErisimHatasi(f"geçersiz dosya yolu: {rel}")
        yol = (self.klasor / rel).resolve()
        if self.klasor not in yol.parents or not yol.is_file():
            raise VeriErisimHatasi(f"dosya bulunamadı: {rel}")
        return yol

    def _erisim(self, ajan: str, rel: str) -> tuple[Path, DosyaBilgisi]:
        yol = self._guvenli_yol(rel)
        b = self._bilgi(yol)
        if not self._gorebilir(ajan, b) or yol.suffix.lower() in YOKSAY:
            raise VeriErisimHatasi(f"dosya bulunamadı: {rel}")      # var olduğunu bile açık etme
        return yol, b

    def _kaydet(self, ajan: str, b: DosyaBilgisi) -> None:
        self.okunanlar.setdefault(ajan, set()).add(b.dosya)

    # ------------------------------------------------------------------- arayüz
    def dosyalar(self, ajan: str) -> list[DosyaBilgisi]:
        sonuc = []
        for yol in sorted(self.klasor.rglob("*")):
            if (yol.is_file() and not yol.is_symlink() and not yol.name.startswith(("~$", "."))
                    and yol.suffix.lower() not in YOKSAY and yol.name.lower() != "desktop.ini"):
                b = self._bilgi(yol)
                if self._gorebilir(ajan, b):
                    sonuc.append(b)
        return sonuc

    def bilgi(self, ajan: str, rel: str) -> DosyaBilgisi:
        return self._erisim(ajan, rel)[1]

    def metin_parcalari(self, ajan: str, rel: str) -> list[tuple[str, str]]:
        """Kurallı tarama için: [(konum, metin)] — pdf'de 's.N', diğer metinlerde 'satır N'."""
        yol, b = self._erisim(ajan, rel)
        suf = yol.suffix.lower()
        mt = yol.stat().st_mtime
        if suf == ".pdf":
            parcalar = [(f"s.{i}", t) for i, t in enumerate(_pdf_sayfalari(str(yol), mt), 1)]
        elif suf == ".docx":
            parcalar = [(f"satır {i}", t) for i, t in enumerate(_docx_satirlari(str(yol), mt), 1)]
        elif suf in (".txt", ".md"):
            parcalar = [(f"satır {i}", t) for i, t in
                        enumerate(yol.read_text(encoding="utf-8", errors="replace").splitlines(), 1)]
        else:
            return []
        self._kaydet(ajan, b)
        return parcalar

    def oku(self, ajan: str, rel: str, sayfa: str | None = None, baslangic: int = 1,
            en_fazla_satir: int = 300) -> str:
        """Dosyayı konum adresli metin olarak döndürür (ajan kaynak gösterebilsin diye).
        sayfa: Excel'de sayfa adı, PDF'de sayfa numarası. baslangic: metin/PDF'de ilk satır/sayfa."""
        yol, b = self._erisim(ajan, rel)
        if not b.okunabilir:
            raise VeriErisimHatasi(f"{rel}: bu biçim okunamıyor ({yol.suffix}); kapsam dışı bırakılmalı")
        suf = yol.suffix.lower()
        bas = f"Dosya: {b.dosya} | sürüm: {b.surum} | tarih: {b.tarih} | alan: {b.alan}\n"
        if suf in (".xlsx", ".xlsm"):
            self._kaydet(ajan, b)
            return bas + self._xlsx_metni(yol, sayfa, en_fazla_satir)
        if suf == ".csv":
            self._kaydet(ajan, b)
            with open(yol, encoding="utf-8-sig", errors="replace", newline="") as f:
                satirlar = list(csv.reader(f))
            secim = satirlar[baslangic - 1: baslangic - 1 + en_fazla_satir]
            return bas + "\n".join(f"satır {i}: " + " | ".join(s) for i, s in enumerate(secim, baslangic)) + \
                self._devam(len(satirlar), baslangic, en_fazla_satir, "satır")
        parcalar = self.metin_parcalari(ajan, rel)
        if suf == ".pdf":
            if not any(t.strip() for _, t in parcalar):
                return bas + "Metin çıkarılamadı (taranmış PDF olabilir); içerik kapsam dışı."
            if sayfa and str(sayfa).isdigit():
                baslangic, en_fazla = int(sayfa), 1
            else:
                en_fazla = 10
            secim = parcalar[baslangic - 1: baslangic - 1 + en_fazla]
            return bas + f"Toplam {len(parcalar)} sayfa\n" + "\n".join(f"\n[{k}]\n{t}" for k, t in secim) + \
                self._devam(len(parcalar), baslangic, en_fazla, "sayfa")
        secim = parcalar[baslangic - 1: baslangic - 1 + en_fazla_satir]
        return bas + "\n".join(f"{k}: {t}" for k, t in secim) + \
            self._devam(len(parcalar), baslangic, en_fazla_satir, "satır")

    @staticmethod
    def _devam(toplam: int, bas: int, adet: int, birim: str) -> str:
        son = bas - 1 + adet
        return f"\n... (toplam {toplam} {birim}; devamı için baslangic={son + 1})" if son < toplam else ""

    @staticmethod
    def _xlsx_metni(yol: Path, sayfa: str | None, en_fazla_satir: int) -> str:
        from openpyxl import load_workbook
        wb = load_workbook(yol, read_only=True, data_only=True)
        try:
            sayfalar = [sayfa] if sayfa else wb.sheetnames
            out = [f"Sayfalar: {', '.join(wb.sheetnames)}"]
            for ad in sayfalar:
                if ad not in wb.sheetnames:
                    out.append(f"[{ad}] sayfa yok")
                    continue
                out.append(f"\n[{ad}]")
                n = 0
                for satir in wb[ad].iter_rows():
                    hucreler = [f"{c.coordinate}={c.value!r}" for c in satir
                                if c.value is not None and hasattr(c, "coordinate")]
                    if hucreler:
                        out.append(" | ".join(hucreler))
                        n += 1
                        if n >= en_fazla_satir:
                            out.append(f"... (ilk {en_fazla_satir} dolu satır gösterildi; tek sayfa için sayfa= verin)")
                            break
            return "\n".join(out)
        finally:
            wb.close()

    def tablo(self, ajan: str, rel: str, sayfa: str) -> list[tuple[int, dict]]:
        """Deneme çalıştırıcısı için: ilk satır başlık kabul edilerek (satır_no, {başlık: değer})."""
        yol, b = self._erisim(ajan, rel)
        if yol.suffix.lower() not in (".xlsx", ".xlsm"):
            return []
        from openpyxl import load_workbook
        wb = load_workbook(yol, read_only=True, data_only=True)
        try:
            if sayfa not in wb.sheetnames:
                return []
            self._kaydet(ajan, b)
            satirlar = list(wb[sayfa].iter_rows(values_only=True))
        finally:
            wb.close()
        if not satirlar:
            return []
        basliklar = [str(x).strip() if x is not None else "" for x in satirlar[0]]
        return [(i, dict(zip(basliklar, s))) for i, s in enumerate(satirlar[1:], 2) if any(v is not None for v in s)]

    def ozet_degerleri(self, ajan: str, rel: str) -> list[dict]:
        """'Özet' sayfası kuralı: A=anahtar, B=değer, C=birim. Kaynak hücresiyle döner."""
        yol, b = self._erisim(ajan, rel)
        if yol.suffix.lower() not in (".xlsx", ".xlsm"):
            return []
        from openpyxl import load_workbook
        wb = load_workbook(yol, read_only=True, data_only=True)
        try:
            ad = next((s for s in wb.sheetnames if s.strip().lower() in OZET_SAYFALARI), None)
            if ad is None:
                return []
            self._kaydet(ajan, b)
            sonuc = []
            for i, (a, d, birim, *_) in enumerate(wb[ad].iter_rows(min_row=1, max_col=3, values_only=True), 1):
                if isinstance(a, str) and isinstance(d, (int, float)) and not isinstance(d, bool):
                    sonuc.append({"anahtar": a.strip(), "deger": d, "birim": str(birim or "").strip(),
                                  "kaynak_dosya": b.dosya, "kaynak_konum": f"{ad}!B{i}"})
            return sonuc
        finally:
            wb.close()

    def kaynak_dogrula(self, rel: str, konum: str, deger: float) -> tuple[str, object]:
        """Bir sayının gösterilen konumda gerçekten bulunup bulunmadığını kontrol eder.
        ('dogrulandi'|'uyusmuyor'|'dogrulanamadi', bulunan)."""
        try:
            yol = self._guvenli_yol(rel)
        except VeriErisimHatasi:
            return "dogrulanamadi", None
        suf, konum = yol.suffix.lower(), str(konum or "").strip()
        esit = lambda a: abs(float(a) - float(deger)) <= 1e-6 * max(1.0, abs(float(a)))  # noqa: E731
        m = _HUCRE.match(konum)
        if m and suf in (".xlsx", ".xlsm"):
            from openpyxl import load_workbook
            wb = load_workbook(yol, data_only=True)
            try:
                v = wb[m["sayfa"]][m["hucre"]].value if m["sayfa"] in wb.sheetnames else None
            finally:
                wb.close()
            ok = isinstance(v, (int, float)) and not isinstance(v, bool) and esit(v)
            return ("dogrulandi" if ok else "uyusmuyor"), v
        ms, ml = _SAYFA_KONUM.match(konum), _SATIR_KONUM.match(konum)
        if (ms and suf == ".pdf") or (ml and suf in (".docx", ".txt", ".md")):
            mt = yol.stat().st_mtime
            parcalar = _pdf_sayfalari(str(yol), mt) if suf == ".pdf" else (
                _docx_satirlari(str(yol), mt) if suf == ".docx"
                else tuple(yol.read_text(encoding="utf-8", errors="replace").splitlines()))
            i = int((ms or ml).group(1))
            if not 1 <= i <= len(parcalar):
                return "uyusmuyor", None
            bulunan = sayilar(parcalar[i - 1])
            return ("dogrulandi" if any(esit(x) for x in bulunan) else "uyusmuyor"), bulunan[:12]
        return "dogrulanamadi", None

    def hucre_degeri(self, rel: str, konum: str):
        """Geriye uyumluluk: tek hücre değeri; doğrulanamazsa ... döner."""
        m = _HUCRE.match(str(konum or "").strip())
        try:
            yol = self._guvenli_yol(rel)
        except VeriErisimHatasi:
            return ...
        if not m or yol.suffix.lower() not in (".xlsx", ".xlsm"):
            return ...
        from openpyxl import load_workbook
        wb = load_workbook(yol, data_only=True)
        try:
            return wb[m["sayfa"]][m["hucre"]].value if m["sayfa"] in wb.sheetnames else None
        finally:
            wb.close()
