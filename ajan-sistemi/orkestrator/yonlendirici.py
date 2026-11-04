"""Mesaj yönlendirici: ajanlar arası TEK iletişim kanalı.

Ajanların birbirini çağırma aracı yoktur; her mesaj buradan geçer.
Kontroller (sırasıyla) ve herhangi biri başarısızsa mesaj iletilmez,
reddedilenler kaydına yazılır ve IzinReddi fırlatılır:
  1. Gönderen ve alıcı tanımlı mı?
  2. Kesin yasaklı çift mi? (ör. Saha Koordinatörü <-> Ticari Direktör)
  3. İzin tablosunda bu yön + bu tür için açık izin var mı? (varsayılan: YASAK)
  4. Mesajın veri etiketlerini alıcı görebilir mi? (ör. "ticari")
  5. Görev numarası var mı?
  6. Rapor ise standart rapor formatında mı? Sunum ise Proje Direktörü
     onaylı ve çapraz kontrolden geçmiş mi?
"""
from __future__ import annotations

from collections import defaultdict, deque

from .kayit import Kayitci
from .mesaj import Mesaj
from .rapor import rapor_hatalari
from .sunum import sunum_hatalari
from .yapilandirma import MESAJ_TURLERI, Yapilandirma


class IzinReddi(Exception):
    def __init__(self, mesaj: Mesaj, neden: str):
        super().__init__(f"REDDEDİLDİ {mesaj.gonderen} -> {mesaj.alici} [{mesaj.tur}]: {neden}")
        self.mesaj = mesaj
        self.neden = neden


class Yonlendirici:
    def __init__(self, yapi: Yapilandirma, kayitci: Kayitci):
        self.yapi = yapi
        self.kayitci = kayitci
        self._kutular: dict[str, deque[Mesaj]] = defaultdict(deque)

    def kontrol(self, m: Mesaj) -> str | None:
        """Mesaj geçerliyse None, değilse red nedenini döndürür."""
        kat = self.yapi.katilimcilar
        if m.gonderen not in kat:
            return f"bilinmeyen gönderen: {m.gonderen}"
        if m.alici not in kat:
            return f"bilinmeyen alıcı: {m.alici}"
        if m.gonderen == m.alici:
            return "ajan kendisine mesaj gönderemez"
        if frozenset({m.gonderen, m.alici}) in self.yapi.kesin_yasaklar:
            return "kesin yasak: bu iki ajan hiçbir şekilde doğrudan iletişim kuramaz; bilgi Proje Direktörü üzerinden geçmeli"
        if m.tur not in MESAJ_TURLERI:
            return f"bilinmeyen mesaj türü: {m.tur}"
        izinli = self.yapi.izinler.get((m.gonderen, m.alici))
        if not izinli:
            return "izin tablosunda bu yönde iletişim izni yok (yanal veya kademe atlayan iletişim yasak)"
        if m.tur not in izinli:
            return f"bu yönde yalnızca {sorted(izinli)} türü gönderilebilir"
        for et in m.etiketler:
            if not self.yapi.etiketi_gorebilir(m.alici, et):
                return f"veri erişimi: '{m.alici}' '{et}' etiketli veriyi göremez"
        if not m.gorev_no:
            return "görev numarası eksik"
        if m.tur == "rapor":
            hatalar = rapor_hatalari(m.icerik)
            if hatalar:
                return "standart rapor formatına uymuyor: " + "; ".join(hatalar)
        if m.tur == "sunum":
            hatalar = sunum_hatalari(m.icerik, m.gonderen)
            if hatalar:
                return "sunum reddedildi: " + "; ".join(hatalar)
        return None

    def gonder(self, gonderen: str, alici: str, tur: str, icerik: str,
               gorev_no: str, etiketler: tuple[str, ...] | list[str] = ()) -> Mesaj:
        m = Mesaj(gonderen=gonderen, alici=alici, tur=tur, gorev_no=gorev_no,
                  icerik=icerik, etiketler=tuple(etiketler))
        neden = self.kontrol(m)
        if neden:
            self.kayitci.reddedildi(m, neden)
            raise IzinReddi(m, neden)
        self.kayitci.iletildi(m)
        self._kutular[alici].append(m)
        return m

    def gelen_kutusu(self, ajan: str) -> list[Mesaj]:
        """Ajanın bekleyen mesajlarını alır ve kutuyu boşaltır."""
        kutu = self._kutular[ajan]
        mesajlar = list(kutu)
        kutu.clear()
        return mesajlar
