"""Kalıcı, dosya tabanlı mesaj kaydı.

Dizin düzeni (tarih = mesajın gönderildiği gün):
  runs/<tarih>/_tum_mesajlar.jsonl     iletilen tüm mesajlar
  runs/<tarih>/_reddedilenler.jsonl    reddedilen tüm mesajlar + red nedeni
  runs/<tarih>/<ajan>/giden.jsonl      ajanın gönderdiği (iletilen) mesajlar
  runs/<tarih>/<ajan>/gelen.jsonl      ajana ulaşan mesajlar
  runs/<tarih>/<ajan>/reddedilen.jsonl ajanın reddedilen gönderim denemeleri
  runs/sayac.json                      görev numarası sayacı

runs/ klasörü git'e girmez (.gitignore): gerçek proje verisi içerebilir.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path

from .mesaj import Mesaj


class Kayitci:
    def __init__(self, kok: Path):
        self.kok = Path(kok)
        self._kilit = threading.Lock()

    def _ekle(self, yol: Path, kayit: dict) -> None:
        yol.parent.mkdir(parents=True, exist_ok=True)
        with open(yol, "a", encoding="utf-8") as f:
            f.write(json.dumps(kayit, ensure_ascii=False) + "\n")

    def _gun(self, m: Mesaj) -> Path:
        return self.kok / m.zaman[:10]

    def iletildi(self, m: Mesaj) -> None:
        k = m.sozluk()
        with self._kilit:
            gun = self._gun(m)
            self._ekle(gun / "_tum_mesajlar.jsonl", k)
            self._ekle(gun / m.gonderen / "giden.jsonl", k)
            self._ekle(gun / m.alici / "gelen.jsonl", k)

    def reddedildi(self, m: Mesaj, neden: str) -> None:
        k = m.sozluk() | {"durum": "REDDEDILDI", "red_nedeni": neden}
        with self._kilit:
            gun = self._gun(m)
            self._ekle(gun / "_reddedilenler.jsonl", k)
            self._ekle(gun / m.gonderen / "reddedilen.jsonl", k)

    def yeni_gorev_no(self) -> str:
        """G-YYYYMMDD-NNNN biçiminde, gün içinde artan görev numarası üretir."""
        with self._kilit:
            yol = self.kok / "sayac.json"
            veri = json.loads(yol.read_text(encoding="utf-8")) if yol.exists() else {}
            gun = datetime.now().strftime("%Y%m%d")
            sira = veri.get(gun, 0) + 1
            veri[gun] = sira
            yol.parent.mkdir(parents=True, exist_ok=True)
            yol.write_text(json.dumps(veri), encoding="utf-8")
            return f"G-{gun}-{sira:04d}"
