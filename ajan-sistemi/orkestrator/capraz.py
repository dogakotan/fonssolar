"""Çapraz tutarlılık kontrolü (kodla, ajandan bağımsız).

Bir görevdeki tüm raporların sayisal_degerler listeleri anahtar bazında
toplanır; aynı anahtara farklı değer veya farklı birim veren kaynaklar
tutarsızlık olarak döndürülür.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Gozlem:
    ajan: str
    deger: float
    birim: str
    kaynak_dosya: str
    kaynak_konum: str


@dataclass
class Tutarsizlik:
    anahtar: str
    tur: str                       # "deger" | "birim"
    gozlemler: list[Gozlem] = field(default_factory=list)
    fark_yuzde: float | None = None

    def sozluk(self) -> dict:
        return {"anahtar": self.anahtar, "tur": self.tur, "fark_yuzde": self.fark_yuzde,
                "gozlemler": [g.__dict__ for g in self.gozlemler]}


def anahtar_ayarlari(kok: Path) -> dict:
    yol = kok / "config" / "capraz_anahtarlar.yaml"
    if not yol.exists():
        return {"varsayilan_tolerans_yuzde": 0.0, "anahtarlar": {}}
    with open(yol, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _normal(anahtar: str) -> str:
    return anahtar.strip().lower().replace(" ", "_")


def capraz_kontrol(raporlar: list[tuple[str, dict]], ayar: dict) -> list[Tutarsizlik]:
    """raporlar: (hazirlayan_ajan, rapor_sozlugu) listesi."""
    gruplar: dict[str, list[Gozlem]] = {}
    gorulen: set[tuple] = set()
    for ajan, rapor in raporlar:
        for s in rapor.get("sayisal_degerler") or []:
            if s.get("deger") is None:
                continue
            # Üst ajan alt raporun değerini kaynağıyla taşıdığında aynı gözlem iki kez sayılmasın.
            imza = (_normal(s["anahtar"]), float(s["deger"]), s.get("kaynak_dosya"), s.get("kaynak_konum"))
            if imza in gorulen:
                continue
            gorulen.add(imza)
            gruplar.setdefault(_normal(s["anahtar"]), []).append(
                Gozlem(ajan, float(s["deger"]), str(s.get("birim", "")).strip(),
                       s.get("kaynak_dosya", ""), s.get("kaynak_konum", "")))

    varsayilan = float(ayar.get("varsayilan_tolerans_yuzde") or 0.0)
    tanimlar = ayar.get("anahtarlar") or {}
    sonuc: list[Tutarsizlik] = []
    for anahtar, gozlemler in sorted(gruplar.items()):
        if len(gozlemler) < 2:
            continue
        birimler = {g.birim.lower() for g in gozlemler}
        if len(birimler) > 1:
            sonuc.append(Tutarsizlik(anahtar, "birim", gozlemler))
            continue
        degerler = [g.deger for g in gozlemler]
        enk, enb = min(degerler), max(degerler)
        if enk == enb:
            continue
        taban = max(abs(enk), abs(enb))
        fark = (enb - enk) / taban * 100 if taban else 100.0
        tol = float((tanimlar.get(anahtar) or {}).get("tolerans_yuzde", varsayilan))
        if fark > tol:
            sonuc.append(Tutarsizlik(anahtar, "deger", gozlemler, round(fark, 3)))
    return sonuc
