"""Ajan çalıştırıcıları.

  DenemeCalistirici : API çağrısı yok, ücretsiz. Kurallı, öngörülebilir davranış.
  CanliCalistirici  : Claude Agent SDK ile gerçek model. ANTHROPIC_API_KEY gerekir.

Her iki çalıştırıcı da ajana yalnızca orkestratörün bağladığı araçları verir
(gorev_ver / rapor_ver / muhendise_sun). Gönderen kimliği araca gömülüdür;
ajan başka biri adına mesaj atamaz.
"""
from __future__ import annotations

import json
import os
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .capraz import capraz_kontrol
from .mesaj import Mesaj
from .rapor import RAPOR_SEMASI, veri_yok_raporu
from .yapilandirma import YASAK_ARACLAR, AjanTanimi


@dataclass
class AjanAraclari:
    gorev_ver: Callable[[str, str], str] | None = None
    rapor_ver: Callable[[dict], str] | None = None
    muhendise_sun: Callable[[dict, str, str, list], str] | None = None
    dosya_listele: Callable[[], str] | None = None
    dosya_oku: Callable[..., str] | None = None
    moveon_oku: Callable[..., str] | None = None

    def adlar(self) -> list[str]:
        return [a for a in ("gorev_ver", "rapor_ver", "muhendise_sun", "dosya_listele", "dosya_oku", "moveon_oku")
                if getattr(self, a)]


class AjanVeri:
    """Deneme çalıştırıcısının veri erişimi: aynı erişim denetimleri, aynı okuma kaydı."""
    def __init__(self, depo, ajan: str, ilgili_klasorler: list[str], gerekli_dokumanlar: str | None = None):
        self._depo, self._ajan = depo, ajan
        self.ilgili = {k.lower() for k in ilgili_klasorler}
        self.gerekli_dokumanlar = gerekli_dokumanlar

    def dosyalar(self, yalniz_ilgili: bool = True):
        return [b for b in self._depo.dosyalar(self._ajan) if not yalniz_ilgili or b.alan in self.ilgili]

    def metin_parcalari(self, dosya: str):
        return self._depo.metin_parcalari(self._ajan, dosya)

    def ozet_degerleri(self, dosya: str) -> list[dict]:
        return self._depo.ozet_degerleri(self._ajan, dosya)

    def tablo(self, dosya: str, sayfa: str):
        return self._depo.tablo(self._ajan, dosya, sayfa)


@dataclass
class Aktivasyon:
    ajan: AjanTanimi
    gelenler: list[Mesaj]
    araclar: AjanAraclari
    alt_ajanlar: list[str]
    bekleyen_alt: set[str]
    gorev_no: str
    kalan_butce_usd: float
    sistem_istemi: str = ""
    gelen_metni: str = ""
    capraz_ayar: dict = field(default_factory=dict)
    veri: AjanVeri | None = None
    alinan_raporlar: list[tuple[str, dict]] = field(default_factory=list)   # bu görevde alınan tüm raporlar
    onceki_gorevler: list[tuple[str, str]] = field(default_factory=list)    # bu ajanın verdiği görevler
    moveon: Callable[[], tuple] | None = None   # yalnızca Lojistik Ajanı'na bağlanır


# ---------------------------------------------------------------- deneme ---

class DenemeCalistirici:
    """Kurallı davranış: üstten görev gelince tüm alt ajanlara dağıt; raporlar
    tamamlanınca kaynaklarıyla birleştirip üste ilet (PD ise mühendise sun)."""

    async def calistir(self, akt: Aktivasyon) -> float:
        gorevler = [m for m in akt.gelenler if m.tur in ("gorev", "talep")]
        raporlar = [m for m in akt.gelenler if m.tur == "rapor"]
        if gorevler and akt.alt_ajanlar:
            for alt in akt.alt_ajanlar:
                akt.araclar.gorev_ver(alt, f"[DENEME] {gorevler[-1].icerik}")
            return 0.0
        if akt.bekleyen_alt:
            return 0.0
        if gorevler and not akt.alt_ajanlar:
            if akt.araclar.rapor_ver:
                rapor = self._uzman_raporu(akt, gorevler[-1].icerik)
                if akt.moveon:
                    rapor = _moveon_ekle(rapor, akt, gorevler[-1].icerik)
                akt.araclar.rapor_ver(rapor)
            return 0.0
        # Her alt ajanın EN SON raporu (aynı görevde ikinci tur olabilir)
        son: dict[str, dict] = {}
        for gonderen, r in akt.alinan_raporlar or [(m.gonderen, json.loads(m.icerik)) for m in raporlar]:
            son[gonderen] = r
        alt_raporlar = list(son.items())
        if akt.araclar.muhendise_sun and akt.araclar.gorev_ver:
            # Kural 2: sahadan gelen eksik malzeme bilgisini Ticari Direktör'e GÖREV olarak ilet (bir kez).
            eksikler = _eksik_satirlari([r for a, r in alt_raporlar if a == "saha_koordinatoru"])
            zaten = any(al == "ticari_direktor" and "[TEDARİK]" in ic for al, ic in akt.onceki_gorevler)
            if eksikler and not zaten and "ticari_direktor" in akt.alt_ajanlar:
                akt.araclar.gorev_ver("ticari_direktor", "[DENEME][TEDARİK] Sahadan eksik malzeme bildirildi; "
                                      "tedarik önerisi hazırlayın:\n" + "\n".join(eksikler))
                return 0.0
        birlesik = self._birlestir(akt, alt_raporlar)
        if akt.araclar.muhendise_sun:
            tut = capraz_kontrol(alt_raporlar, akt.capraz_ayar)
            karar = "kosullu_devam" if tut else "devam"
            gerekce = (f"{len(tut)} tutarsızlık bulundu; giderilmeden ilerlenmemeli."
                       if tut else "Alt raporlarda tutarsızlık bulunmadı.")
            kosullar = [f"'{t.anahtar}' değeri kaynaklar arasında netleştirilmeli" for t in tut]
            akt.araclar.muhendise_sun(birlesik, karar, gerekce, kosullar)
        elif akt.araclar.rapor_ver:
            akt.araclar.rapor_ver(birlesik)
        return 0.0

    @staticmethod
    def _uzman_raporu(akt: Aktivasyon, gorev: str = "") -> dict:
        """Deneme modunda uzman: ilgili klasördeki dosyaların envanteri + 'Özet' sayfası
        değerleri (A=anahtar, B=değer, C=birim). İçerik yorumu yapılmaz; o canlı modun işi."""
        if akt.veri is None:
            from .deneme_ornekleri import ORNEKLER
            return ORNEKLER.get(akt.ajan.ad) or veri_yok_raporu("bu ajana proje verisi verilmedi")
        ozel = _UZMAN_KURALLARI.get(akt.ajan.ad)
        ek_aksiyon_gorevden = _siparis_onerileri(gorev) if akt.ajan.ad == "satin_alma" else []
        dosyalar = akt.veri.dosyalar()
        if not dosyalar and not (akt.ajan.ad == "evrak_takip" and akt.veri.gerekli_dokumanlar):
            return veri_yok_raporu(f"ilgili klasörlerde dosya yok: {', '.join(sorted(akt.veri.ilgili))}")
        kaynaklar, sayilar, riskler, aksiyonlar = [], [], [], []
        for b in dosyalar:
            if not b.okunabilir:
                riskler.append(f"{b.dosya} okunamadı (desteklenmeyen biçim); kapsam dışı kaldı")
                continue
            degerler = akt.veri.ozet_degerleri(b.dosya)
            if b.dosya.lower().endswith((".pdf", ".docx", ".txt", ".md")):
                parcalar = akt.veri.metin_parcalari(b.dosya)
                if not any(t.strip() for _, t in parcalar):
                    riskler.append(f"{b.dosya}: metin çıkarılamadı (taranmış PDF olabilir); kapsam dışı kaldı")
                    continue
                degerler += metin_degerleri(parcalar, b.dosya, akt.capraz_ayar)
            ek_risk, ek_aksiyon = ([], [])
            evrak = akt.ajan.ad == "evrak_takip"
            if evrak and b.dosya.lower().endswith((".xlsx", ".xlsm")):
                ek_risk, ek_aksiyon = _evrak_kontrolu(akt.veri, b.dosya)
            elif ozel and b.dosya.lower().endswith((".xlsx", ".xlsm")):
                ek_risk, ek_aksiyon = ozel(akt.veri, b.dosya)
            if degerler or ek_risk or ek_aksiyon or evrak:
                kaynaklar.append({"dosya": b.dosya, "surum": b.surum, "tarih": b.tarih})
            sayilar += degerler
            riskler += ek_risk
            aksiyonlar += ek_aksiyon
        if akt.ajan.ad == "evrak_takip" and akt.veri.gerekli_dokumanlar:
            k, r, a = _gerekli_dokuman_kontrolu(akt.veri)
            kaynaklar += [x for x in k if x not in kaynaklar]
            riskler += r
            aksiyonlar += a
        aksiyonlar += ek_aksiyon_gorevden
        if ek_aksiyon_gorevden:
            riskler.append("Eksik malzeme bildirimi alındı; sipariş önerileri insan onayına sunulacak")
        if not kaynaklar:
            r = veri_yok_raporu("ilgili dosyalarda 'Özet' sayfası bulunamadı; içerik analizi canlı modda yapılır")
            r["riskler"] += riskler
            r["onerilen_aksiyonlar"] += aksiyonlar
            return r
        return {
            "ozet": f"[DENEME] {akt.ajan.gorunen_ad}: {len(kaynaklar)} dosya incelendi, {len(sayilar)} değer okundu"
                    + (f", {len(riskler)} bulgu." if riskler else "."),
            "veri_kaynaklari": kaynaklar,
            "varsayimlar": ["Deneme modu: Excel 'Özet' sayfaları, PDF/Word metninde açık ifadeli miktarlar "
                            "(config/capraz_anahtarlar.yaml > ifadeler) ve kurallı kontroller kullanıldı; "
                            "teknik yorum canlı modda yapılır."],
            "riskler": riskler,
            "onerilen_aksiyonlar": aksiyonlar,
            "guven": {"seviye": "orta" if sayilar else "dusuk",
                      "neden": "Değerler doğrudan dosya hücrelerinden okundu; yorum yapılmadı." if sayilar
                      else "Sayısal değer okunmadı; yalnızca kurallı kontroller yapıldı."},
            "sayisal_degerler": sayilar,
        }

    @staticmethod
    def _birlestir(akt: Aktivasyon, alt_raporlar: list[tuple[str, dict]]) -> dict:
        kaynaklar, sayilar, riskler = [], [], []
        for ajan, r in alt_raporlar:
            for k in r["veri_kaynaklari"]:
                if k not in kaynaklar:
                    kaynaklar.append(k)
            sayilar += r["sayisal_degerler"]
            # Alt rapordaki tutarsızlık satırları burada yeniden hesaplanır; tekrar yazılmaz.
            riskler += [f"{ajan}: {x}" for x in r["riskler"] if not x.startswith("Tutarsızlık:")]
        tut = capraz_kontrol(alt_raporlar, akt.capraz_ayar)
        riskler += [f"Tutarsızlık: {t.anahtar} kaynaklar arasında farklı" for t in tut]
        seviyeler = [r["guven"]["seviye"] for _, r in alt_raporlar] or ["dusuk"]
        guven = "dusuk" if "dusuk" in seviyeler or not kaynaklar else ("orta" if tut or "orta" in seviyeler else "yuksek")
        return {
            "ozet": f"[DENEME] {akt.ajan.gorunen_ad}: {len(alt_raporlar)} alt rapor birleştirildi.",
            "veri_kaynaklari": kaynaklar,
            "varsayimlar": ["Deneme modu: kurallı birleştirme, model kullanılmadı."],
            "riskler": riskler,
            "onerilen_aksiyonlar": [{"aciklama": "Tutarsız değerlerin kaynak dokümanlarını mühendisle netleştir.",
                                     "tur": "oneri"}] if tut else [],
            "guven": {"seviye": guven, "neden": "Deneme verisi; alt raporların en düşük güven seviyesi esas alındı."},
            "sayisal_degerler": sayilar,
        }


_BIRIM_DESENI = {"m3/s": r"m3/s(?![a-z/])", "m3": r"m3(?!/)", "m2": r"m2", "m": r"m(?![0-9a-z/])",
                 "mwp": r"mwp", "mwe": r"mwe",
                 "kwp": r"kwp", "wp": r"wp", "adet": r"adet", "ha": r"ha(?![a-z])"}
# Türkçe (120.400,00) ve İngilizce ondalık (100.00) yazımlar; sayı başka bir sayının parçası olamaz
_SAYI_KATLI = r"(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\.\d{1,2}(?![\d])|\d+(?:,\d+)?)"
_ONCE_AYRAC = re.compile(r"^[\s:=(\-–—≈~]*$")
_SONRA_ARA = re.compile(r"^\s*(?:[a-z]+\s+){0,2}$")


def metin_degerleri(parcalar: list[tuple[str, str]], dosya: str, ayar: dict) -> list[dict]:
    """Deneme modu kurallı tarama: '<ifade>: 120.400 m³' veya '640.000 m³ (nebati) sıyırma' kalıpları.
    Yalnızca config'teki açık ifadeler; her (anahtar, değer) için dosyadaki ilk konum alınır."""
    from .veri import katla, sayi_coz
    kurallar = []
    for anahtar, tanim in (ayar.get("anahtarlar") or {}).items():
        birim = str((tanim or {}).get("birim", "")).lower()
        for ifade in (tanim or {}).get("ifadeler") or []:
            if birim in _BIRIM_DESENI:
                kurallar.append((anahtar, tanim.get("birim", ""), katla(ifade), _BIRIM_DESENI[birim]))
    birim_desenleri = {d for *_, d in kurallar}
    sonuc, gorulen = [], set()
    for konum, metin in parcalar:
        for satir in metin.splitlines():
            k = katla(satir)
            for birim_d in birim_desenleri:
                for m in re.finditer(_SAYI_KATLI + r"\s*" + birim_d, k):
                    # Sayıyı en yakın ifadeye ata (önce gelen ifade eşitlikte kazanır); böylece
                    # "toplam kazı 300.000 m³ · toplam yol dolgusu 150.000 m³" doğru ayrılır.
                    adaylar = []
                    for anahtar, birim, ifade, d in kurallar:
                        if d != birim_d:
                            continue
                        for i in re.finditer(re.escape(ifade), k):
                            if i.end() <= m.start() and _ONCE_AYRAC.match(k[i.end():m.start()]):
                                adaylar.append((m.start() - i.end(), 0, anahtar, birim))
                            elif i.start() >= m.end() and _SONRA_ARA.match(k[m.end():i.start()]):
                                adaylar.append((i.start() - m.end(), 1, anahtar, birim))
                    deger = sayi_coz(m.group(1))
                    if not adaylar or deger is None:
                        continue
                    _, _, anahtar, birim = min(adaylar)
                    if (anahtar, deger) not in gorulen:
                        gorulen.add((anahtar, deger))
                        sonuc.append({"anahtar": anahtar, "deger": deger, "birim": birim,
                                      "kaynak_dosya": dosya, "kaynak_konum": konum})
    return sonuc


_DOKUMAN_DOLGU = {"ve", "ile", "projesi", "proje", "plani", "planlari", "dosya", "dokuman"}


def _gerekli_dokuman_kontrolu(veri: AjanVeri) -> tuple[list[dict], list[str], list[dict]]:
    """Şart listesindeki (ör. EK-11) her doküman için klasörde karşılık arar."""
    from .veri import katla
    liste = veri.gerekli_dokumanlar
    try:
        parcalar = veri.metin_parcalari(liste)
        b_liste = next(b for b in veri.dosyalar(False) if b.dosya == liste)
    except Exception as e:  # noqa: BLE001
        return [], [f"Gerekli doküman listesi okunamadı ({liste}): {e}"], []
    kaynaklar = [{"dosya": b_liste.dosya, "surum": b_liste.surum, "tarih": b_liste.tarih}]
    dosyalar = [b for b in veri.dosyalar(False) if b.dosya != liste]
    riskler, aksiyonlar = [], []
    maddeler = [(konum, t.strip()) for konum, t in parcalar[1:] if len(t.strip()) > 3]
    for konum, madde in maddeler:
        kelimeler = [w for w in re.split(r"[^a-z0-9]+", katla(madde)) if len(w) >= 3 and w not in _DOKUMAN_DOLGU]
        if not kelimeler:
            continue
        eslesen = [b for b in dosyalar
                   if sum(w in re.sub(r"[^a-z0-9]", "", katla(b.dosya)) for w in kelimeler) >= max(1, round(len(kelimeler) * 0.75))]
        yer = f"{Path(liste).name} › {konum}"
        if not eslesen:
            riskler.append(f"EKSİK DOKÜMAN: '{madde}' teklif dosyasında bulunamadı ({yer})")
            aksiyonlar.append({"aciklama": f"'{madde}' dokümanını teklif dosyasına ekle veya yerini teyit et",
                               "tur": "oneri"})
            continue
        okunur = [b for b in eslesen if b.okunabilir]
        revizyonlu = [b for b in eslesen if b.surum != "veri yok"]
        if not okunur:
            turler = ", ".join(sorted({Path(b.dosya).suffix.upper().lstrip(".") for b in eslesen}))
            riskler.append(f"'{madde}': yalnızca {turler} biçiminde mevcut; içerik okunamadı, kapsam dışı ({yer})")
        if not revizyonlu:
            riskler.append(f"'{madde}': dosya adında revizyon işareti yok, güncel sürüm teyit edilemiyor ({yer})")
    return kaynaklar, riskler, aksiyonlar


def _moveon_ekle(rapor: dict, akt: Aktivasyon, gorev: str) -> dict:
    """Deneme modu Lojistik: Move On dışa aktarımından gecikmeler ve eksik malzemenin sevkiyat durumu."""
    from .moveon import MoveOnHatasi, eksik_karsilama, gecikme_analizi
    try:
        kaynak, satirlar, uyarilar = akt.moveon()
    except MoveOnHatasi as e:
        rapor = dict(rapor)
        rapor["riskler"] = list(rapor["riskler"]) + [f"Move On verisi okunamadı: {e}"]
        return rapor
    r = dict(rapor)
    bos = not r["veri_kaynaklari"]
    if bos:   # proje klasöründe lojistik dosyası yoksa 'veri yok' satırı Move On verisi varken yanıltıcı olur
        r["riskler"] = []
    r["veri_kaynaklari"] = list(r["veri_kaynaklari"]) + [{"dosya": kaynak, "surum": "dışa aktarım",
                                                         "tarih": "veri yok"}]
    gecikenler = gecikme_analizi(satirlar)
    tedarik = eksik_karsilama([s for s in gorev.splitlines() if s.strip().startswith(_EKSIK)], satirlar)
    r["riskler"] = list(r["riskler"]) + [f"Move On: {u}" for u in uyarilar] + gecikenler + \
        [f"Tedarik durumu: {t}" for t in tedarik]
    if bos:
        r["ozet"] = (f"[DENEME] Lojistik Ajanı: Move On dışa aktarımında {len(satirlar)} sevkiyat incelendi; "
                     f"{len([g for g in gecikenler if g.startswith('GECİKEN')])} geciken sevkiyat.")
        r["varsayimlar"] = ["Move On verisi salt okunur dışa aktarımdan alındı; dosya tarihi güncel kabul edildi."]
        r["guven"] = {"seviye": "orta", "neden": "Değerler doğrudan Move On dışa aktarımından okundu; yorum yok."}
    for s in satirlar:
        try:
            miktar = float(str(s.get("miktar")).replace(".", "").replace(",", "."))
        except ValueError:
            continue
        r["sayisal_degerler"] = list(r["sayisal_degerler"]) + [{
            "anahtar": f"sevkiyat_{s.get('sevkiyat_no')}_miktar", "deger": miktar, "birim": s.get("birim") or "",
            "kaynak_dosya": kaynak, "kaynak_konum": f"satır {s['satir']}"}]
    return r


_EKSIK = "EKSİK MALZEME:"


def _eksik_satirlari(raporlar: list[dict]) -> list[str]:
    """Raporların risk satırlarındaki 'EKSİK MALZEME: ...' ifadeleri (iç içe önekler ayıklanır)."""
    sonuc = []
    for r in raporlar:
        for x in r.get("riskler", []):
            if _EKSIK in x:
                satir = x[x.index(_EKSIK):]
                if satir not in sonuc:
                    sonuc.append(satir)
    return sonuc


def _siparis_onerileri(gorev: str) -> list[dict]:
    return [{"aciklama": f"Sipariş önerisi — {s[len(_EKSIK):].strip()}", "tur": "siparis"}
            for s in gorev.splitlines() if s.strip().startswith(_EKSIK)]


def _sayi_mi(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _stok_kontrolu(veri: AjanVeri, dosya: str) -> tuple[list[str], list[dict]]:
    """'Stok' sayfası kuralı (başlıklar: Malzeme, Birim, Stok, İhtiyaç)."""
    riskler, aksiyonlar = [], []
    for satir_no, r in veri.tablo(dosya, "Stok"):
        stok, ihtiyac = r.get("Stok"), r.get("İhtiyaç")
        if _sayi_mi(stok) and _sayi_mi(ihtiyac) and stok < ihtiyac:
            ad, birim = r.get("Malzeme") or f"satır {satir_no}", r.get("Birim") or ""
            eksik = ihtiyac - stok
            riskler.append(f"{_EKSIK} {ad} — {eksik:g} {birim} eksik (stok {stok:g}, ihtiyaç {ihtiyac:g}; "
                           f"{dosya} › Stok!satır {satir_no})")
            aksiyonlar.append({"aciklama": f"{ad} eksiğini tedarik için üst kademeye bildir", "tur": "oneri"})
    return riskler, aksiyonlar


def _uygunsuzluk_kontrolu(veri: AjanVeri, dosya: str) -> tuple[list[str], list[dict]]:
    """'Uygunsuzluk' sayfası kuralı (başlıklar: No, Konu, Durum, Önem)."""
    riskler = []
    for satir_no, r in veri.tablo(dosya, "Uygunsuzluk"):
        if "kapal" not in str(r.get("Durum") or "").lower():
            riskler.append(f"Açık uygunsuzluk {r.get('No') or satir_no}: {r.get('Konu')} "
                           f"(önem: {r.get('Önem') or 'veri yok'}; {dosya} › Uygunsuzluk!satır {satir_no})")
    return riskler, []


_UZMAN_KURALLARI = {"depocu": _stok_kontrolu, "kaliteci": _uygunsuzluk_kontrolu}


def _evrak_kontrolu(veri: AjanVeri, dosya: str) -> tuple[list[str], list[dict]]:
    """'Evrak' sayfası kuralı (başlıklar: Evrak, Revizyon, Tarih, Durum, Geçerlilik Bitiş)."""
    from datetime import date, datetime
    riskler, aksiyonlar = [], []
    bugun = date.today()
    for satir_no, r in veri.tablo(dosya, "Evrak"):
        ad = r.get("Evrak") or f"satır {satir_no}"
        durum = str(r.get("Durum") or "").strip().lower()
        konum = f"{dosya} › Evrak!satır {satir_no}"
        bitis = r.get("Geçerlilik Bitiş")
        if isinstance(bitis, datetime):
            bitis = bitis.date()
        if "eksik" in durum or not durum:
            riskler.append(f"{ad}: evrak eksik ({konum})")
            aksiyonlar.append({"aciklama": f"{ad} evrakının tamamlanması için sorumluyu belirle", "tur": "oneri"})
        elif "bekl" in durum:
            riskler.append(f"{ad}: onay bekliyor ({konum})")
        if isinstance(bitis, date):
            kalan = (bitis - bugun).days
            if kalan < 0:
                riskler.append(f"{ad}: geçerlilik süresi {bitis.isoformat()} tarihinde dolmuş ({konum})")
                aksiyonlar.append({"aciklama": f"{ad} için yenileme başvurusunu planla", "tur": "oneri"})
            elif kalan <= 30:
                riskler.append(f"{ad}: geçerlilik {kalan} gün içinde bitiyor ({bitis.isoformat()}, {konum})")
    return riskler, aksiyonlar


# ----------------------------------------------------------------- canlı ---

def api_erisimi_var() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_CODE_USE_BEDROCK")
                or os.environ.get("CLAUDE_CODE_USE_VERTEX") or os.environ.get("CLAUDE_CODE_USE_FOUNDRY"))


class CanliCalistirici:
    def __init__(self, model_ayari: Callable[[str], dict]):
        self.model_ayari = model_ayari
        self._bos_klasor = tempfile.mkdtemp(prefix="fons-ajan-")   # ajanın çalışma dizini: boş

    def secenekler(self, akt: Aktivasyon):
        """SDK seçeneklerini kurar (test edilebilir olsun diye ayrı)."""
        from claude_agent_sdk import ClaudeAgentOptions, create_sdk_mcp_server, tool

        def metin(s: str) -> dict:
            return {"content": [{"type": "text", "text": s}]}

        araclar = []
        if akt.araclar.gorev_ver:
            @tool("gorev_ver", "Doğrudan altındaki bir ajana görev verir.",
                  {"type": "object", "required": ["alici", "gorev"],
                   "properties": {"alici": {"type": "string", "enum": akt.alt_ajanlar},
                                  "gorev": {"type": "string"}}})
            async def _gorev(a):
                return metin(akt.araclar.gorev_ver(a["alici"], a["gorev"]))
            araclar.append(_gorev)
        if akt.araclar.rapor_ver:
            @tool("rapor_ver", "Üst ajanına standart formatta rapor verir.",
                  {"type": "object", "required": ["rapor"], "properties": {"rapor": RAPOR_SEMASI}})
            async def _rapor(a):
                return metin(akt.araclar.rapor_ver(a["rapor"]))
            araclar.append(_rapor)
        if akt.araclar.muhendise_sun:
            @tool("muhendise_sun", "Onayladığın çıktıyı mühendise sunar (yalnızca Proje Direktörü).",
                  {"type": "object", "required": ["rapor", "karar", "karar_gerekcesi"],
                   "properties": {"rapor": RAPOR_SEMASI,
                                  "karar": {"type": "string", "enum": ["devam", "kosullu_devam", "durdur"]},
                                  "karar_gerekcesi": {"type": "string"},
                                  "kosullar": {"type": "array", "items": {"type": "string"}}}})
            async def _sun(a):
                return metin(akt.araclar.muhendise_sun(a["rapor"], a["karar"], a["karar_gerekcesi"],
                                                       a.get("kosullar") or []))
            araclar.append(_sun)

        if akt.araclar.dosya_listele:
            @tool("dosya_listele", "Proje klasöründe görebildiğin dosyaları (sürüm, tarih, ilgili mi) listeler.",
                  {"type": "object", "properties": {}})
            async def _liste(a):
                return metin(akt.araclar.dosya_listele())
            araclar.append(_liste)
        if akt.araclar.dosya_oku:
            @tool("dosya_oku", "Bir proje dosyasını konum adresleriyle okur (xlsx hücre, pdf sayfa, docx/txt satır).",
                  {"type": "object", "required": ["dosya"],
                   "properties": {"dosya": {"type": "string"},
                                  "sayfa": {"type": "string", "description": "Excel'de sayfa adı, PDF'de sayfa no"},
                                  "baslangic": {"type": "integer", "description": "Metin/PDF'de başlangıç satırı/sayfası"}}})
            async def _oku(a):
                return metin(akt.araclar.dosya_oku(a["dosya"], a.get("sayfa"), a.get("baslangic", 1)))
            araclar.append(_oku)

        if akt.araclar.moveon_oku:
            @tool("moveon_oku", "Move On sevkiyat dışa aktarımını SALT OKUNUR okur (yalnızca izinli sütunlar).",
                  {"type": "object", "properties": {"proje": {"type": "string",
                                                              "description": "Proje adı filtresi (isteğe bağlı)"}}})
            async def _moveon(a):
                return metin(akt.araclar.moveon_oku(a.get("proje")))
            araclar.append(_moveon)

        sunucu = create_sdk_mcp_server("fons", tools=araclar)
        ayar = self.model_ayari(akt.ajan.ad)
        return ClaudeAgentOptions(
            system_prompt=akt.sistem_istemi,
            model=ayar.get("model"),
            effort=ayar.get("effort"),
            max_turns=int(ayar.get("max_turns", 6)),
            max_budget_usd=max(akt.kalan_butce_usd, 0.0),
            tools=[],                                            # hiçbir yerleşik araç yok
            allowed_tools=[f"mcp__fons__{a}" for a in akt.araclar.adlar()],
            disallowed_tools=sorted(YASAK_ARACLAR),
            mcp_servers={"fons": sunucu},
            strict_mcp_config=True,                              # başka MCP sunucusu yüklenmez
            setting_sources=[],                                  # kullanıcı/proje ayarları, CLAUDE.md, beceriler yüklenmez
            permission_mode="dontAsk",                           # izinli listede olmayan her şey reddedilir
            cwd=self._bos_klasor,
            env={"CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS": "1", "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "1"},
        )

    async def calistir(self, akt: Aktivasyon) -> float:
        if not api_erisimi_var():
            raise RuntimeError("Canlı mod için ANTHROPIC_API_KEY ortam değişkeni tanımlı değil. "
                               "Ücretsiz deneme için config/modeller.yaml içinde 'mod: deneme' kullanın.")
        from claude_agent_sdk import ResultMessage, query
        maliyet = 0.0
        async for mesaj in query(prompt=akt.gelen_metni, options=self.secenekler(akt)):
            if isinstance(mesaj, ResultMessage):
                maliyet = float(mesaj.total_cost_usd or 0.0)
        return maliyet
