from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime


def simdi() -> str:
    """Yerel saat dilimiyle ISO-8601 zaman damgası."""
    return datetime.now().astimezone().isoformat(timespec="seconds")


@dataclass(frozen=True)
class Mesaj:
    gonderen: str
    alici: str
    tur: str                    # gorev | rapor | talep | sunum
    gorev_no: str               # G-YYYYMMDD-NNNN; bir talebin tüm alt mesajları aynı numarayı taşır
    icerik: str
    etiketler: tuple[str, ...] = ()   # veri etiketleri (ör. "ticari")
    mesaj_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    zaman: str = field(default_factory=simdi)

    def sozluk(self) -> dict:
        d = asdict(self)
        d["etiketler"] = list(self.etiketler)
        return d
