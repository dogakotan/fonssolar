"""Yapılandırma dosyalarını yükler ve birbirleriyle tutarlılığını doğrular.

Kaynaklar:
  config/izinler.yaml       -> kim kime hangi tür mesaj atabilir
  config/veri_erisimi.yaml  -> hangi ajan hangi veri etiketini görebilir
  config/modeller.yaml      -> model ve parametreler
  agents/*.yaml             -> ajan tanımları (ust alanı hiyerarşiyi belirler)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

MUHENDIS = "muhendis"
MESAJ_TURLERI = {"gorev", "rapor", "talep", "sunum"}

# Hiçbir ajan tanımında bulunamayacak araçlar. Kodda sabittir; yapılandırma
# dosyasıyla gevşetilemez. Agent/Task/SendMessage başka ajan çağırır; diğerleri
# orkestratörü atlayıp dosya sistemine, kabuğa veya internete erişir.
YASAK_ARACLAR = frozenset({
    "Agent", "Task", "SendMessage", "Workflow",
    "Bash", "PowerShell", "Read", "Write", "Edit", "NotebookEdit", "Glob", "Grep",
    "WebFetch", "WebSearch",
})

# Orkestratörün ajanlara verebildiği araçlar. Bunların dışındaki bir ad ajan
# tanımında geçerse yapılandırma geçersizdir.
ORKESTRATOR_ARACLARI = frozenset({"gorev_ver", "rapor_ver", "muhendise_sun", "dosya_listele", "dosya_oku",
                                  "moveon_oku"})
# Move On verisine erişebilecek TEK ajan. Kodda sabittir; yapılandırmayla genişletilemez.
MOVEON_YETKILI = frozenset({"lojistik"})
VERI_ARACLARI = frozenset({"dosya_listele", "dosya_oku"})

KOK = Path(__file__).resolve().parent.parent


class YapilandirmaHatasi(Exception):
    pass


@dataclass
class AjanTanimi:
    ad: str
    gorunen_ad: str
    ust: str
    kol: str
    ham: dict = field(repr=False)

    @property
    def araclar(self) -> list[str]:
        return list(self.ham.get("araclar") or [])


@dataclass
class Yapilandirma:
    ajanlar: dict[str, AjanTanimi]
    izinler: dict[tuple[str, str], frozenset[str]]   # (gonderen, alici) -> izinli türler
    kesin_yasaklar: set[frozenset[str]]
    veri_erisimi: dict[str, set[str]]                # etiket -> görebilenler
    modeller: dict
    klasor_etiketleri: dict[str, str] = field(default_factory=dict)   # alt klasör -> etiket
    ajan_etiketleri: dict[str, set[str]] = field(default_factory=dict)  # ajan -> koşulsuz etiketler

    @property
    def katilimcilar(self) -> set[str]:
        return set(self.ajanlar) | {MUHENDIS}

    def etiketi_gorebilir(self, katilimci: str, etiket: str) -> bool:
        if etiket not in self.veri_erisimi:      # kısıtsız etiket ("genel" vb.)
            return True
        return katilimci in self.veri_erisimi[etiket]

    def model_ayari(self, ajan: str) -> dict:
        ayar = dict(self.modeller.get("varsayilan") or {})
        ayar.update((self.modeller.get("ajanlar") or {}).get(ajan) or {})
        return ayar


def _oku(yol: Path) -> dict:
    with open(yol, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def yukle(kok: Path = KOK) -> Yapilandirma:
    ajanlar: dict[str, AjanTanimi] = {}
    for dosya in sorted((kok / "agents").glob("*.yaml")):
        h = _oku(dosya)
        ad = h.get("ad")
        if ad != dosya.stem:
            raise YapilandirmaHatasi(f"{dosya.name}: 'ad' alanı dosya adıyla aynı olmalı ({ad!r})")
        ajanlar[ad] = AjanTanimi(ad=ad, gorunen_ad=h.get("gorunen_ad", ad),
                                 ust=h.get("ust"), kol=h.get("kol"), ham=h)

    iz = _oku(kok / "config" / "izinler.yaml")
    izinler: dict[tuple[str, str], frozenset[str]] = {}
    for satir in iz.get("izinler") or []:
        anahtar = (satir["gonderen"], satir["alici"])
        if anahtar in izinler:
            raise YapilandirmaHatasi(f"İzin tablosunda tekrar eden satır: {anahtar}")
        izinler[anahtar] = frozenset(satir["turler"])
    kesin = {frozenset(c) for c in iz.get("kesin_yasaklar") or []}

    ve = _oku(kok / "config" / "veri_erisimi.yaml")
    veri_erisimi = {et: set(lst or []) for et, lst in (ve.get("erisim") or {}).items()}

    modeller = _oku(kok / "config" / "modeller.yaml")

    klasor_etiketleri = {str(k).lower(): str(v) for k, v in (ve.get("klasor_etiketleri") or {}).items()}
    ajan_etiketleri = {a: set(e or []) for a, e in (ve.get("ajan_etiketleri") or {}).items()}
    yapi = Yapilandirma(ajanlar, izinler, kesin, veri_erisimi, modeller, klasor_etiketleri, ajan_etiketleri)
    hatalar = dogrula(yapi)
    if hatalar:
        raise YapilandirmaHatasi("Yapılandırma tutarsız:\n  - " + "\n  - ".join(hatalar))
    return yapi


def hiyerarsiden_beklenen_izinler(yapi: Yapilandirma) -> dict[tuple[str, str], frozenset[str]]:
    """agents/*.yaml içindeki `ust` alanlarından olması gereken izin tablosunu türetir."""
    beklenen: dict[tuple[str, str], frozenset[str]] = {}
    for a in yapi.ajanlar.values():
        if a.ust == MUHENDIS:
            beklenen[(MUHENDIS, a.ad)] = frozenset({"talep"})
            beklenen[(a.ad, MUHENDIS)] = frozenset({"sunum"})
        else:
            beklenen[(a.ust, a.ad)] = frozenset({"gorev"})
            beklenen[(a.ad, a.ust)] = frozenset({"rapor"})
    return beklenen


def dogrula(yapi: Yapilandirma) -> list[str]:
    """Tüm tutarlılık kontrollerini yapar; bulunan hataların listesini döndürür."""
    h: list[str] = []
    kat = yapi.katilimcilar

    # Ajan tanımları
    for a in yapi.ajanlar.values():
        if a.ust not in kat:
            h.append(f"{a.ad}: üst ajan '{a.ust}' tanımlı değil")
        yasak = YASAK_ARACLAR.intersection(a.araclar)
        if yasak:
            h.append(f"{a.ad}: yasak araç(lar) tanımlanmış: {sorted(yasak)}")
        if "moveon_oku" in a.araclar and a.ad not in MOVEON_YETKILI:
            h.append(f"{a.ad}: Move On aracı yalnızca Lojistik Ajanı'na verilebilir")
        bilinmeyen = set(a.araclar) - ORKESTRATOR_ARACLARI - YASAK_ARACLAR
        if bilinmeyen:
            h.append(f"{a.ad}: bilinmeyen araç(lar): {sorted(bilinmeyen)}")
        if a.ham.get("durum", "taslak") not in ("aktif", "taslak"):
            h.append(f"{a.ad}: durum 'aktif' veya 'taslak' olmalı")
    ust_muhendis = [a.ad for a in yapi.ajanlar.values() if a.ust == MUHENDIS]
    if ust_muhendis != ["proje_direktoru"]:
        h.append(f"Mühendise yalnızca proje_direktoru bağlı olmalı, bulunan: {ust_muhendis}")

    # İzin tablosu
    for (g, a), turler in yapi.izinler.items():
        for k in (g, a):
            if k not in kat:
                h.append(f"İzin tablosunda bilinmeyen katılımcı: {k}")
        bilinmeyen = turler - MESAJ_TURLERI
        if bilinmeyen:
            h.append(f"İzin tablosunda bilinmeyen mesaj türü {sorted(bilinmeyen)}: {g}->{a}")
        if frozenset({g, a}) in yapi.kesin_yasaklar:
            h.append(f"Kesin yasaklı çift izin tablosunda yer alıyor: {g}->{a}")

    # Tablo hiyerarşiyle birebir aynı olmalı (fazla veya eksik izin yok)
    beklenen = hiyerarsiden_beklenen_izinler(yapi)
    for k in sorted(set(yapi.izinler) - set(beklenen)):
        h.append(f"İzin tablosunda hiyerarşide olmayan fazladan izin: {k[0]}->{k[1]}")
    for k in sorted(set(beklenen) - set(yapi.izinler)):
        h.append(f"İzin tablosunda eksik izin: {k[0]}->{k[1]}")
    for k in sorted(set(beklenen) & set(yapi.izinler)):
        if yapi.izinler[k] != beklenen[k]:
            h.append(f"{k[0]}->{k[1]}: tür {sorted(yapi.izinler[k])} olmamalı, beklenen {sorted(beklenen[k])}")

    # Veri erişimi
    for et, kisiler in yapi.veri_erisimi.items():
        for k in kisiler - kat:
            h.append(f"veri_erisimi '{et}': bilinmeyen katılımcı {k}")
    for ajan, ets in yapi.ajan_etiketleri.items():
        if ajan not in yapi.ajanlar:
            h.append(f"ajan_etiketleri: bilinmeyen ajan {ajan}")
        for et in ets:
            if et not in yapi.veri_erisimi:
                h.append(f"ajan_etiketleri '{ajan}': '{et}' etiketi için erişim listesi yok")
            elif ajan not in yapi.veri_erisimi[et]:
                h.append(f"ajan_etiketleri '{ajan}': ajan kendi etiketini ({et}) görme yetkisine sahip değil")
    for klasor, et in yapi.klasor_etiketleri.items():
        if et not in yapi.veri_erisimi:
            h.append(f"klasor_etiketleri '{klasor}': '{et}' etiketi için erişim listesi tanımlı değil")

    return h
