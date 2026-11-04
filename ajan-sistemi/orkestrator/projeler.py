"""Proje yapılandırması: gerçek proje klasörlerini ajan alanlarına eşler.

config/projeler/<ad>.yaml örneği (bkz. config/projeler/ornek.yaml):

  ad: ornek-teklif
  klasor: C:\\Users\\...\\TEKLIF            # proje klasörü (salt okunur kullanılır)
  alanlar:                                   # klasör öneki -> alan (en uzun önek kazanır)
    "EK-11 .../10-Hafriyat Planı": hafriyat
  etiketler:                                 # klasör öneki -> veri etiketi
    "EK-18 PROJE DEĞERLENDİRME FORMU": ticari
  gerekli_dokumanlar: "EK-11 .../EK11-....docx"   # Evrak Takip'in şart listesi (isteğe bağlı)

Bu dosyalar yerel yol ve müşteri klasör adları içerdiği için git'e eklenmez.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .yapilandirma import KOK


@dataclass
class ProjeAyari:
    ad: str
    klasor: Path
    alanlar: dict[str, str] = field(default_factory=dict)
    etiketler: dict[str, str] = field(default_factory=dict)
    gerekli_dokumanlar: str | None = None
    moveon_proje: str | None = None          # Move On dışa aktarımında bu projenin adı (satır filtresi)


def proje_yukle(arg: str | Path, kok: Path = KOK) -> ProjeAyari:
    """arg: config/projeler altındaki bir proje adı, bir .yaml yolu veya doğrudan bir klasör."""
    arg = str(arg)
    adaylar = [kok / "config" / "projeler" / f"{arg}.yaml", Path(arg)]
    for yol in adaylar:
        if yol.is_file() and yol.suffix in (".yaml", ".yml"):
            with open(yol, encoding="utf-8") as f:
                d = yaml.safe_load(f) or {}
            klasor = Path(d["klasor"])
            if not klasor.is_absolute():
                klasor = (kok / klasor).resolve()
            return ProjeAyari(ad=d.get("ad", yol.stem), klasor=klasor, alanlar=d.get("alanlar") or {},
                              etiketler=d.get("etiketler") or {}, gerekli_dokumanlar=d.get("gerekli_dokumanlar"),
                              moveon_proje=d.get("moveon_proje"))
    klasor = Path(arg)
    if not klasor.is_absolute():
        klasor = (Path.cwd() / klasor).resolve()
    return ProjeAyari(ad=klasor.name, klasor=klasor)
