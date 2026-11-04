"""İnsan onayı kapısı: dış etkili işlemler (sipariş, teklif gönderme, sahaya
talimat, dış sisteme yazma) yalnızca bir insanın açık onayından sonra yürütülür.

- Ajanların bu sınıfa erişen bir aracı yoktur; onay yalnızca komut satırından
  (`python -m orkestrator onayla ...`) verilir.
- Dış etkili bir yürütücü `@dis_etkili` ile işaretlenir ve yalnızca
  `OnayKapisi.yurut()` içinden çalışabilir; doğrudan çağrılırsa hata verir.
- Her onaylı talep en fazla bir kez yürütülür. Tüm adımlar
  runs/onay_kuyrugu.json ve runs/onay_kayitlari.jsonl dosyalarına yazılır.
"""
from __future__ import annotations

import contextvars
import functools
import json
import threading
from pathlib import Path

from .mesaj import simdi

_yetkili_talep: contextvars.ContextVar[str | None] = contextvars.ContextVar("_yetkili_talep", default=None)


class OnaysizIslem(Exception):
    pass


def dis_etkili(fonksiyon):
    """Dış etkili yürütücüleri işaretler: onay kapısı dışından çalıştırılamaz."""
    @functools.wraps(fonksiyon)
    def sarmal(*args, **kwargs):
        if _yetkili_talep.get() is None:
            raise OnaysizIslem(f"{fonksiyon.__name__}: dış etkili işlem onay kapısı dışından çağrılamaz")
        return fonksiyon(*args, **kwargs)
    sarmal.dis_etkili = True
    return sarmal


class OnayKapisi:
    def __init__(self, kok: Path):
        self.kok = Path(kok)
        self._kilit = threading.Lock()
        self._yurutuculer: dict[str, callable] = {}   # aksiyon türü -> @dis_etkili fonksiyon

    @property
    def _kuyruk_yolu(self) -> Path:
        return self.kok / "onay_kuyrugu.json"

    def _oku(self) -> dict:
        return json.loads(self._kuyruk_yolu.read_text(encoding="utf-8")) if self._kuyruk_yolu.exists() else {}

    def _yaz(self, veri: dict) -> None:
        self.kok.mkdir(parents=True, exist_ok=True)
        self._kuyruk_yolu.write_text(json.dumps(veri, ensure_ascii=False, indent=2), encoding="utf-8")

    def _gunluk(self, kayit: dict) -> None:
        with open(self.kok / "onay_kayitlari.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(kayit | {"zaman": simdi()}, ensure_ascii=False) + "\n")

    def yurutucu_kaydet(self, tur: str, fonksiyon) -> None:
        if not getattr(fonksiyon, "dis_etkili", False):
            raise ValueError("yürütücü @dis_etkili ile işaretlenmeli")
        self._yurutuculer[tur] = fonksiyon

    def talep_ekle(self, talep_id: str, gorev_no: str, oneren: str, aksiyon: dict) -> None:
        with self._kilit:
            veri = self._oku()
            if talep_id not in veri:
                veri[talep_id] = {"gorev_no": gorev_no, "oneren": oneren, "aksiyon": aksiyon,
                                  "durum": "bekliyor", "olusturma": simdi()}
                self._yaz(veri)
                self._gunluk({"olay": "talep", "talep_id": talep_id, "oneren": oneren, "aksiyon": aksiyon})

    def liste(self, durum: str | None = None) -> dict:
        veri = self._oku()
        return {k: v for k, v in veri.items() if durum is None or v["durum"] == durum}

    def _karar(self, talep_id: str, durum: str, kisi: str, notu: str) -> dict:
        kisi = (kisi or "").strip()
        if not kisi:
            raise ValueError("onaylayan/reddeden kişinin adı zorunlu")
        with self._kilit:
            veri = self._oku()
            t = veri.get(talep_id)
            if not t:
                raise KeyError(f"talep bulunamadı: {talep_id}")
            if t["durum"] != "bekliyor":
                raise ValueError(f"talep zaten '{t['durum']}' durumunda")
            t.update(durum=durum, karar_veren=kisi, karar_notu=notu, karar_zamani=simdi())
            self._yaz(veri)
            self._gunluk({"olay": durum, "talep_id": talep_id, "kisi": kisi, "not": notu})
            return t

    def onayla(self, talep_id: str, onaylayan: str, notu: str = "") -> dict:
        return self._karar(talep_id, "onaylandi", onaylayan, notu)

    def reddet(self, talep_id: str, reddeden: str, notu: str = "") -> dict:
        return self._karar(talep_id, "reddedildi", reddeden, notu)

    def yurut(self, talep_id: str) -> str:
        with self._kilit:
            veri = self._oku()
            t = veri.get(talep_id)
            if not t:
                raise KeyError(f"talep bulunamadı: {talep_id}")
            if t["durum"] != "onaylandi":
                self._gunluk({"olay": "yurutme_reddedildi", "talep_id": talep_id, "durum": t["durum"]})
                raise OnaysizIslem(f"{talep_id}: insan onayı yok (durum: {t['durum']}); işlem yürütülmedi")
            fonk = self._yurutuculer.get(t["aksiyon"].get("tur"))
            if fonk is None:
                sonuc = ("Bu işlem türü için otomatik yürütücü tanımlı değil; onaylı işlemi ilgili kişi "
                         "elle uygulamalıdır. (Sistem dış sisteme hiçbir şey yazmadı.)")
            else:
                belirtec = _yetkili_talep.set(talep_id)
                try:
                    sonuc = str(fonk(t))
                finally:
                    _yetkili_talep.reset(belirtec)
            t.update(durum="yurutuldu", yurutme_zamani=simdi(), yurutme_sonucu=sonuc)
            self._yaz(veri)
            self._gunluk({"olay": "yurutuldu", "talep_id": talep_id, "sonuc": sonuc})
            return sonuc
