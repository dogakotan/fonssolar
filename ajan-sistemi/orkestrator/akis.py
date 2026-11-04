"""Orkestratör akışı: mühendisin talebini alır, ajanları sırayla çalıştırır,
mesajları yönlendirir ve Proje Direktörü onaylı sunumu mühendise teslim eder.

İnsan yalnızca en üstte (mühendis) devreye girer; ajanlar arası aktarım
tamamen otomatiktir.

Kodla yapılan ek denetimler:
- Kaynak kontrolü: ajan raporunda yalnızca bu görevde OKUDUĞU dosyaları veya
  alt raporlardan GELEN kaynakları gösterebilir; uydurma kaynak reddedilir.
- Hücre doğrulaması: 'Sayfa!C12' gibi tek hücreye dayanan her sayı dosyadaki
  değerle karşılaştırılır; uyuşmazsa rapor reddedilir.
- Etiket yayılımı: etiketli (ör. ticari) veri gören ajanın sonraki tüm
  mesajları o etiketi taşır; böylece veri yetkisiz kola dolaylı yoldan da geçemez.
"""
from __future__ import annotations

import asyncio
import json
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

from .calistirici import AjanAraclari, AjanVeri, Aktivasyon, CanliCalistirici, DenemeCalistirici
from .capraz import anahtar_ayarlari, capraz_kontrol
from .deneme_ornekleri import ORNEKLER
from .istem import gelen_kutusu_metni, sistem_istemi
from .kapi import OnayKapisi
from .kayit import Kayitci
from .mesaj import Mesaj, simdi
from .rapor import veri_yok_raporu
from .sunum import dis_etkili_aksiyonlar, markdown
from .moveon import ONEK as MOVEON_ONEK
from .moveon import MoveOnHatasi, MoveOnKaynagi
from .moveon import ayar_yukle as moveon_ayari
from .projeler import ProjeAyari
from .veri import VeriDeposu, VeriErisimHatasi
from .yapilandirma import KOK, MOVEON_YETKILI, MUHENDIS, VERI_ARACLARI, Yapilandirma
from .yonlendirici import IzinReddi, Yonlendirici

PD = "proje_direktoru"


@dataclass
class Sonuc:
    gorev_no: str
    durum: str                          # "sunuldu" | "durdu"
    neden: str = ""
    sunum_yolu: Path | None = None
    maliyet_usd: float = 0.0
    onay_bekleyenler: list[str] = field(default_factory=list)


class Orkestrator:
    def __init__(self, yapi: Yapilandirma, runs_kok: Path, calistirici=None, kok: Path = KOK,
                 veri_klasoru: Path | None = None, proje: ProjeAyari | None = None, moveon="varsayilan"):
        self.yapi = yapi
        self.kok = kok
        self.kayitci = Kayitci(runs_kok)
        self.kapi = OnayKapisi(runs_kok)
        self.capraz_ayar = anahtar_ayarlari(kok)
        self.mod = yapi.modeller.get("mod", "deneme")
        if calistirici is None:
            calistirici = DenemeCalistirici() if self.mod == "deneme" else CanliCalistirici(yapi.model_ayari)
        self.calistirici = calistirici
        if proje is None and veri_klasoru:
            proje = ProjeAyari(ad=Path(veri_klasoru).name, klasor=Path(veri_klasoru))
        self.proje = proje
        self.veri_klasoru = proje.klasor if proje else None
        if moveon == "varsayilan":
            ayar = moveon_ayari(kok)
            moveon = MoveOnKaynagi(ayar) if ayar and ayar.klasor.is_dir() else None
        self.moveon: MoveOnKaynagi | None = moveon
        self.veri: VeriDeposu | None = None
        self.cocuklar: dict[str, list[str]] = {}
        for a in yapi.ajanlar.values():
            self.cocuklar.setdefault(a.ust, []).append(a.ad)
        self.gorunen_ad = {k: v.gorunen_ad for k, v in yapi.ajanlar.items()} | {MUHENDIS: "Mühendis"}

    # ------------------------------------------------------------ yardımcılar
    def _aktif(self, ajan: str) -> bool:
        return self.yapi.ajanlar[ajan].ham.get("durum") == "aktif"

    def _veri_araclari(self, ajan: str) -> bool:
        return self.veri is not None and bool(VERI_ARACLARI & set(self.yapi.ajanlar[ajan].araclar))

    def _baglam_etiketleri(self, ajan: str) -> set[str]:
        """Ajanın bu görevde gördüğü verinin etiketleri (okuduğu dosyalar + aldığı mesajlar)."""
        et = set(self.etiketli.get(ajan, set())) | set(self.yapi.ajan_etiketleri.get(ajan, set()))
        if self.veri:
            for dosya in self.veri.okunanlar.get(ajan, set()):
                et |= set(self.veri.bilgi(ajan, dosya).etiketler)
        return et

    def _gonder(self, gonderen, alici, tur, icerik, etiketler=()) -> Mesaj:
        etiketler = set(etiketler)
        if gonderen != MUHENDIS and tur in ("gorev", "rapor"):
            etiketler |= self._baglam_etiketleri(gonderen)
        m = self.y.gonder(gonderen, alici, tur, icerik, self.gorev_no, tuple(sorted(etiketler)))
        if alici != MUHENDIS:
            self.sira.append(alici)
            self.etiketli.setdefault(alici, set()).update(m.etiketler)
        if tur == "gorev":
            self.bekleyen_alt.setdefault(gonderen, set()).add(alici)
            self.gonderilen_gorevler.setdefault(gonderen, []).append((alici, icerik))
        if tur == "rapor":
            self.bekleyen_alt.get(alici, set()).discard(gonderen)
            rapor = json.loads(icerik)
            self.rapor_zinciri.append({"hazirlayan": gonderen, "alici": alici, "zaman": m.zaman, "rapor": rapor,
                                       "etiketler": list(m.etiketler)})
            self.alinan_kaynaklar.setdefault(alici, set()).update(k["dosya"] for k in rapor["veri_kaynaklari"])
        return m

    def _kaynak_kontrol(self, ajan: str, rapor: dict) -> tuple[list[str], list[dict]]:
        """(hatalar, doğrulama satırları). Hata varsa rapor reddedilir."""
        izinli = set(self.alinan_kaynaklar.get(ajan, set()))
        if self.moveon:
            izinli |= self.moveon.okunanlar.get(ajan, set())
        if self.veri:
            izinli |= self.veri.okunanlar.get(ajan, set())
        elif self.mod == "deneme":
            # Proje verisi olmayan tanıtım çalıştırması: yalnızca 'deneme/' örnek kaynakları
            izinli |= {k.get("dosya") for k in rapor.get("veri_kaynaklari") or []
                       if str(k.get("dosya", "")).startswith("deneme/")}
        hatalar, dogrulama = [], []
        for k in rapor.get("veri_kaynaklari") or []:
            d = str(k.get("dosya", "")).strip()
            if d and d.lower() != "veri yok" and d not in izinli:
                hatalar.append(f"'{d}' bu görevde okunmadı ve alt raporlardan gelmedi; kaynak gösterilemez")
        for v in rapor.get("sayisal_degerler") or []:
            if v.get("deger") is None:
                continue
            durum = "dogrulanamadi"
            if str(v.get("kaynak_dosya", "")).startswith(MOVEON_ONEK) and self.moveon:
                durum, bulunan = self.moveon.dogrula(v["kaynak_dosya"], v.get("kaynak_konum", ""), v["deger"])
                if durum == "uyusmuyor":
                    hatalar.append(f"{v['anahtar']}: {v['kaynak_dosya']} › {v['kaynak_konum']} konumunda "
                                   f"{bulunan!r} var, raporda {v['deger']} yazılmış")
            elif self.veri:
                durum, bulunan = self.veri.kaynak_dogrula(v.get("kaynak_dosya", ""), v.get("kaynak_konum", ""),
                                                          v["deger"])
                if durum == "uyusmuyor":
                    hatalar.append(f"{v['anahtar']}: {v['kaynak_dosya']} › {v['kaynak_konum']} konumunda "
                                   f"{bulunan!r} var, raporda {v['deger']} yazılmış")
            dogrulama.append({"anahtar": v["anahtar"], "deger": v["deger"], "birim": v.get("birim", ""),
                              "kaynak_dosya": v.get("kaynak_dosya"), "kaynak_konum": v.get("kaynak_konum"),
                              "durum": durum})
        return hatalar, dogrulama

    def _araclar(self, ajan: str, durum: dict) -> AjanAraclari:
        def gorev_ver(alici: str, gorev: str) -> str:
            try:
                self._gonder(ajan, alici, "gorev", gorev)
                return f"İLETİLDİ: görev {self.gorunen_ad.get(alici, alici)} ajanına gönderildi."
            except IzinReddi as e:
                return f"REDDEDİLDİ: {e.neden}"

        def rapor_ver(rapor: dict) -> str:
            if self.bekleyen_alt.get(ajan):
                return "REDDEDİLDİ: şu alt ajanlardan rapor bekleniyor: " + ", ".join(sorted(self.bekleyen_alt[ajan]))
            hatalar, _ = self._kaynak_kontrol(ajan, rapor)
            if hatalar:
                return "REDDEDİLDİ: kaynak kontrolü: " + "; ".join(hatalar)
            try:
                self._gonder(ajan, self.yapi.ajanlar[ajan].ust, "rapor", json.dumps(rapor, ensure_ascii=False))
                durum["rapor_verdi"] = True
                return "İLETİLDİ: rapor üst ajana ulaştı."
            except IzinReddi as e:
                return f"REDDEDİLDİ: {e.neden}"

        def muhendise_sun(rapor: dict, karar: str, gerekce: str, kosullar: list) -> str:
            if self.bekleyen_alt.get(PD):
                return "REDDEDİLDİ: şu ajanlardan rapor bekleniyor: " + ", ".join(sorted(self.bekleyen_alt[PD]))
            hatalar, _ = self._kaynak_kontrol(PD, rapor)
            if hatalar:
                return "REDDEDİLDİ: kaynak kontrolü: " + "; ".join(hatalar)
            # Önce alt raporlar: tutarsızlık değerin ilk kaynağına (uzmana) atfedilsin.
            tum = [(r["hazirlayan"], r["rapor"]) for r in self.rapor_zinciri] + [(PD, rapor)]
            dogrulama, gorulen = [], set()
            for a, r in tum:
                for d in self._kaynak_kontrol(a, r)[1]:
                    imza = (d["anahtar"], d["deger"], d["kaynak_dosya"], d["kaynak_konum"])
                    if imza not in gorulen:
                        gorulen.add(imza)
                        dogrulama.append(d | {"ajan": a})
            sunum = {
                "gorev_no": self.gorev_no, "talep": self.talep, "mod": self.mod,
                "proje": self.proje.ad if self.proje else None,
                "karar": karar, "karar_gerekcesi": gerekce, "kosullar": list(kosullar or []),
                "pd_raporu": rapor, "pd_onayi": {"onaylayan": PD, "zaman": simdi()},
                "tutarsizliklar": [t.sozluk() for t in capraz_kontrol(tum, self.capraz_ayar)],
                "kaynak_dogrulama": dogrulama,
                "rapor_zinciri": self.rapor_zinciri, "maliyet_usd": self.harcanan,
            }
            try:
                self._gonder(PD, MUHENDIS, "sunum", json.dumps(sunum, ensure_ascii=False))
            except IzinReddi as e:
                return f"REDDEDİLDİ: {e.neden}"
            self.sunum = sunum
            return "İLETİLDİ: sunum mühendise ulaştı."

        def dosya_listele() -> str:
            ilgili = {k.lower() for k in self.yapi.ajanlar[ajan].ham.get("ilgili_klasorler") or []}
            liste = [b.sozluk() | {"ilgili": b.alan in ilgili} for b in self.veri.dosyalar(ajan)]
            return json.dumps(liste, ensure_ascii=False)

        def dosya_oku(dosya: str, sayfa: str | None = None, baslangic: int = 1) -> str:
            try:
                return self.veri.oku(ajan, dosya, sayfa, int(baslangic or 1))
            except VeriErisimHatasi as e:
                return f"HATA: {e}"

        def moveon_oku(proje: str | None = None) -> str:
            try:
                kaynak, satirlar, uyarilar = self._moveon_satirlari(ajan)
            except MoveOnHatasi as e:
                return f"HATA: {e}"
            return json.dumps({"kaynak": kaynak, "dosya_tarihi": self.moveon.tarih_bilgisi(),
                               "uyarilar": uyarilar, "satir_sayisi": len(satirlar),
                               "satirlar": satirlar[:300]}, ensure_ascii=False, default=str)

        a = AjanAraclari()
        if self.cocuklar.get(ajan):
            a.gorev_ver = gorev_ver
        if ajan == PD:
            a.muhendise_sun = muhendise_sun
        else:
            a.rapor_ver = rapor_ver
        if self._veri_araclari(ajan):
            a.dosya_listele, a.dosya_oku = dosya_listele, dosya_oku
        if self._moveon_araci(ajan):
            a.moveon_oku = moveon_oku
        return a

    def _moveon_satirlari(self, ajan: str):
        """Proje bağlamında Move On yalnızca projenin Move On adıyla süzülerek okunur; eşleme yoksa
        başka projelerin (veya sentetik) sevkiyatları karışmasın diye hiç okunmaz."""
        if self.proje and not self.proje.moveon_proje:
            raise MoveOnHatasi(f"'{self.proje.ad}' projesi için Move On eşlemesi tanımlı değil "
                               f"(config/projeler/{self.proje.ad}.yaml > moveon_proje); sevkiyat verisi okunmadı")
        return self.moveon.satirlar(ajan, self.proje.moveon_proje if self.proje else None)

    def _moveon_araci(self, ajan: str) -> bool:
        # Üç koşul birden: kodda sabit yetki + ajan tanımında araç + yapılandırılmış kaynak
        return (ajan in MOVEON_YETKILI and "moveon_oku" in self.yapi.ajanlar[ajan].araclar
                and self.moveon is not None)

    def _taslak_yanit(self, ajan: str) -> None:
        """Henüz devrede olmayan ajan. Proje verisi yoksa (tanıtım) deneme modunda örnek
        rapor; gerçek proje verisiyle veya canlı modda dürüst 'veri yok' raporu."""
        if self.mod == "deneme" and self.veri is None and ajan in ORNEKLER:
            rapor = ORNEKLER[ajan]
        else:
            rapor = veri_yok_raporu(f"{self.gorunen_ad[ajan]} henüz devrede değil")
        self._gonder(ajan, self.yapi.ajanlar[ajan].ust, "rapor", json.dumps(rapor, ensure_ascii=False))

    # ------------------------------------------------------------------ akış
    def talep_isle(self, metin: str) -> Sonuc:
        return asyncio.run(self.talep_isle_async(metin))

    async def talep_isle_async(self, metin: str) -> Sonuc:
        self.y = Yonlendirici(self.yapi, self.kayitci)
        self.veri = (VeriDeposu(self.proje.klasor, self.yapi, self.yapi.klasor_etiketleri,
                                self.proje.alanlar, self.proje.etiketler) if self.proje else None)
        if self.moveon:
            self.moveon.okunanlar = {}
        self.gorev_no = self.kayitci.yeni_gorev_no()
        self.talep = metin
        self.sira: deque[str] = deque()
        self.bekleyen_alt: dict[str, set[str]] = {}
        self.etiketli: dict[str, set[str]] = {}
        self.alinan_kaynaklar: dict[str, set[str]] = {}
        self.gonderilen_gorevler: dict[str, list[tuple[str, str]]] = {}
        self.rapor_zinciri: list[dict] = []
        self.sunum: dict | None = None
        self.harcanan = 0.0
        butce = float(self.yapi.modeller.get("calistirma_butcesi_usd", 1.0))
        sinir = int(self.yapi.modeller.get("calistirma_adim_siniri", 40))

        self._gonder(MUHENDIS, PD, "talep", metin)
        adim, neden = 0, ""
        while self.sunum is None:
            ajan = self._siradaki()
            if ajan is None:
                neden = "akış tamamlanmadan durdu: Proje Direktörü sunum yapmadı"
                break
            if adim >= sinir:
                neden = f"adım sınırına ulaşıldı ({sinir})"
                break
            if self.mod == "canli" and self.harcanan >= butce:
                neden = f"bütçe sınırına ulaşıldı ({butce} USD)"
                break
            adim += 1
            gelenler = self.y.gelen_kutusu(ajan)
            if not self._aktif(ajan):
                if any(m.tur == "gorev" for m in gelenler):
                    self._taslak_yanit(ajan)
                continue
            durum = {"rapor_verdi": False}
            tanim = self.yapi.ajanlar[ajan]
            akt = Aktivasyon(
                ajan=tanim, gelenler=gelenler, araclar=self._araclar(ajan, durum),
                alt_ajanlar=self.cocuklar.get(ajan, []), bekleyen_alt=set(self.bekleyen_alt.get(ajan, set())),
                gorev_no=self.gorev_no, kalan_butce_usd=butce - self.harcanan, capraz_ayar=self.capraz_ayar,
                sistem_istemi=sistem_istemi(self.yapi, tanim, self.cocuklar.get(ajan, []), self.capraz_ayar,
                                            self.kok, veri_var=self._veri_araclari(ajan),
                                            moveon_var=self._moveon_araci(ajan)),
                gelen_metni=gelen_kutusu_metni(gelenler, self.gorunen_ad, self.bekleyen_alt.get(ajan, set()),
                                               onceki_raporlar=[(r["hazirlayan"], r["zaman"], r["rapor"])
                                                                for r in self.rapor_zinciri if r["alici"] == ajan
                                                                and r["zaman"] and not any(
                                                                    m.tur == "rapor" and m.gonderen == r["hazirlayan"]
                                                                    and json.loads(m.icerik) == r["rapor"]
                                                                    for m in gelenler)]),
                alinan_raporlar=[(r["hazirlayan"], r["rapor"]) for r in self.rapor_zinciri if r["alici"] == ajan],
                moveon=(lambda a=ajan: self._moveon_satirlari(a))
                if self._moveon_araci(ajan) else None,
                onceki_gorevler=list(self.gonderilen_gorevler.get(ajan, [])),
                veri=AjanVeri(self.veri, ajan, tanim.ham.get("ilgili_klasorler") or [],
                              self.proje.gerekli_dokumanlar if self.proje else None)
                if self._veri_araclari(ajan) else None,
                # (Move On erişimi yukarıda yalnızca yetkili ajana bağlanır)
            )
            self.harcanan += await self.calistirici.calistir(akt)
            # Görevi alıp ne alt görev ne rapor üreten ajan, üstünü sonsuza dek bekletmesin.
            if (ajan != PD and not durum["rapor_verdi"] and not self.bekleyen_alt.get(ajan)
                    and any(m.tur == "gorev" for m in gelenler)):
                self._gonder(ajan, tanim.ust, "rapor", json.dumps(
                    veri_yok_raporu(f"{self.gorunen_ad[ajan]} geçerli bir rapor üretmedi"), ensure_ascii=False))

        if self.sunum is None:
            return Sonuc(self.gorev_no, "durdu", neden, maliyet_usd=self.harcanan)
        return self._teslim_et()

    def _siradaki(self) -> str | None:
        """Gelen kutusu dolu ve çalışmaya hazır ilk ajan. Alt ajanlarından rapor
        bekleyen ajan, raporlar tamamlanmadan yeniden çalıştırılmaz (maliyet)."""
        for _ in range(len(self.sira)):
            ajan = self.sira.popleft()
            kutu = self.y._kutular.get(ajan)
            if not kutu:
                continue
            yalniz_rapor = all(m.tur == "rapor" for m in kutu)
            if yalniz_rapor and self.bekleyen_alt.get(ajan):
                self.sira.append(ajan)
                continue
            return ajan
        return None

    def _teslim_et(self) -> Sonuc:
        s = self.sunum
        klasor = self.kayitci.kok / s["pd_onayi"]["zaman"][:10] / MUHENDIS
        klasor.mkdir(parents=True, exist_ok=True)
        (klasor / f"sunum_{self.gorev_no}.json").write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")
        md = klasor / f"sunum_{self.gorev_no}.md"
        md.write_text(markdown(s, self.gorunen_ad), encoding="utf-8")
        bekleyen = []
        for talep_id, ajan, aksiyon in dis_etkili_aksiyonlar(s):
            self.kapi.talep_ekle(talep_id, self.gorev_no, ajan, aksiyon)
            bekleyen.append(talep_id)
        return Sonuc(self.gorev_no, "sunuldu", sunum_yolu=md, maliyet_usd=self.harcanan, onay_bekleyenler=bekleyen)


def sunum_bul(runs_kok: Path, gorev_no: str) -> dict:
    for yol in Path(runs_kok).glob(f"*/{MUHENDIS}/sunum_{gorev_no}.json"):
        return json.loads(yol.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"sunum bulunamadı: {gorev_no}")
