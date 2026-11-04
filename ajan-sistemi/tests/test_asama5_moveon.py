"""Aşama 5 kabul testleri: Move On entegrasyonu (salt okunur, yalnızca Lojistik).
Yalnızca sentetik dışa aktarım kullanılır. API'siz."""
import csv
import json

import pytest

from orkestrator import yukle
from orkestrator.akis import Orkestrator, sunum_bul
from orkestrator.calistirici import CanliCalistirici, DenemeCalistirici
from orkestrator.moveon import (VARSAYILAN_SUTUNLAR, MoveOnAyari, MoveOnHatasi, MoveOnKaynagi,
                                ornek_disa_aktarim)
from orkestrator.ornek_proje import olustur
from orkestrator.projeler import ProjeAyari
from orkestrator.yapilandirma import dogrula

KISISEL = ("Sentetik Sürücü", "0000 000 00", "34 SNT", "18500", "42000", "Şoför", "Telefon", "Plaka", "Navlun")


def kaynak(klasor, **ek):
    return MoveOnKaynagi(MoveOnAyari(klasor=klasor, sutunlar={k: list(v) for k, v in VARSAYILAN_SUTUNLAR.items()}, **ek))


@pytest.fixture
def mo(tmp_path):
    ornek_disa_aktarim(tmp_path / "moveon")
    return kaynak(tmp_path / "moveon")


# ------------------------------------------------------------- okuyucu

def test_yalnizca_izinli_sutunlar_okunur(mo):
    ad, satirlar, uyarilar = mo.satirlar("lojistik")
    assert ad.startswith("moveon:SENTETIK_moveon_sevkiyat_") and len(satirlar) == 4
    assert set(satirlar[0]) == {"sevkiyat_no", "proje", "malzeme", "miktar", "birim", "cikis_tarihi",
                                "planlanan_teslim", "gerceklesen_teslim", "durum", "satir"}
    metin = json.dumps(satirlar, ensure_ascii=False)
    for iz in KISISEL:
        assert iz not in metin, iz
    assert any("4 sütun izin listesinde olmadığı için okunmadı" in u for u in uyarilar)


def test_proje_filtresi(mo):
    _, satirlar, _ = mo.satirlar("lojistik", "Örnek GES")
    assert {s["sevkiyat_no"] for s in satirlar} == {"MO-2026-0141", "MO-2026-0138", "MO-2026-0130"}


@pytest.mark.parametrize("ajan", ["satin_alma", "depocu", "proje_direktoru", "satin_alma_muduru", "muhendis"])
def test_lojistik_disinda_kimse_okuyamaz(mo, ajan):
    with pytest.raises(MoveOnHatasi, match="yetkisi yok"):
        mo.satirlar(ajan)


def test_yazma_yetenegi_yok():
    yasak = ("yaz", "write", "sil", "delete", "post", "put", "patch", "gonder", "send", "update", "guncelle")
    for ad in dir(MoveOnKaynagi):
        assert not any(y in ad.lower() for y in yasak), ad


def test_turkce_excel_csv_ve_farkli_sutun_adlari(tmp_path):
    k = tmp_path / "mo"
    k.mkdir()
    with open(k / "disa.csv", "w", encoding="cp1254", newline="") as f:     # Türkçe Excel'in varsayılan kodlaması
        csv.writer(f, delimiter=";").writerows([["Sefer No", "Ürün", "Miktar", "Termin", "Durum"],
                                                ["S-1", "Çelik profil", "12", "01.01.2020", "Yolda"]])
    mo = MoveOnKaynagi(MoveOnAyari(klasor=k, sutunlar={**{a: list(v) for a, v in VARSAYILAN_SUTUNLAR.items()},
                                                        "sevkiyat_no": ["Sefer No"], "planlanan_teslim": ["Termin"]}))
    _, satirlar, uyarilar = mo.satirlar("lojistik")
    assert satirlar[0]["sevkiyat_no"] == "S-1" and satirlar[0]["malzeme"] == "Çelik profil"
    assert not uyarilar


def test_bos_klasor_acik_hata(tmp_path):
    (tmp_path / "bos").mkdir()
    with pytest.raises(MoveOnHatasi, match="dosya yok"):
        kaynak(tmp_path / "bos").satirlar("lojistik")


def test_kaynak_dogrulama(mo):
    ad, _, _ = mo.satirlar("lojistik")
    assert mo.dogrula(ad, "satır 2", 2000)[0] == "dogrulandi"
    assert mo.dogrula(ad, "satır 2", 9999)[0] == "uyusmuyor"
    assert mo.dogrula(ad, "satır 2", 18500)[0] == "uyusmuyor"      # navlun sütunu izinli değil -> doğrulanamaz
    assert mo.dogrula("moveon:eski_dosya.csv", "satır 2", 2000)[0] == "uyusmuyor"


# ------------------------------------------------------------ yapılandırma

def test_moveon_araci_baska_ajana_verilemez():
    yapi = yukle()
    assert "moveon_oku" in yapi.ajanlar["lojistik"].araclar
    yapi.ajanlar["satin_alma"].ham["araclar"] = ["dosya_oku", "rapor_ver", "moveon_oku"]
    assert any("Move On aracı yalnızca Lojistik" in h for h in dogrula(yapi))


def test_orkestrator_araci_yalniz_lojistige_baglar(mo, tmp_path):
    yapi = yukle()
    yapi.ajanlar["depocu"].ham["araclar"] = ["moveon_oku", "rapor_ver"]     # doğrulama atlatılmış olsa bile
    ork = Orkestrator(yapi, tmp_path / "runs", moveon=mo)
    assert ork._moveon_araci("lojistik") and not ork._moveon_araci("depocu")
    assert "moveon_oku" not in ork._araclar("depocu", {}).adlar()
    assert "moveon_oku" in ork._araclar("lojistik", {}).adlar()


# ------------------------------------------------------------- uçtan uca

class Kaydet(DenemeCalistirici):
    def __init__(self):
        self.akt = []

    async def calistir(self, akt):
        self.akt.append(akt)
        return await super().calistir(akt)


@pytest.fixture(scope="module")
def tam(tmp_path_factory):
    proje_k = olustur(tmp_path_factory.mktemp("veri") / "ornek-ges")
    mo_k = tmp_path_factory.mktemp("moveon")
    ornek_disa_aktarim(mo_k)
    runs = tmp_path_factory.mktemp("runs")
    k = Kaydet()
    ork = Orkestrator(yukle(), runs, calistirici=k, moveon=kaynak(mo_k),
                      proje=ProjeAyari(ad="ornek-ges", klasor=proje_k, moveon_proje="Örnek GES"))
    return ork, ork.talep_isle("Genel durum ve sevkiyatlar"), runs, k


def _mesajlar(runs):
    return [json.loads(s) for p in runs.glob("*/_tum_mesajlar.jsonl") for s in p.read_text(encoding="utf-8").splitlines()]


def test_lojistik_geciken_sevkiyat_ve_tedarik_durumu(tam):
    _, sonuc, runs, _ = tam
    assert sonuc.durum == "sunuldu", sonuc.neden
    loj = [json.loads(m["icerik"]) for m in _mesajlar(runs) if m["gonderen"] == "lojistik"]
    assert len(loj) == 2                                   # ilk görev + [TEDARİK] görevi
    ilk, ikinci = "\n".join(loj[0]["riskler"]), "\n".join(loj[1]["riskler"])
    assert "GECİKEN SEVKİYAT: MO-2026-0138" in ilk
    assert not any(s.startswith("GECİKEN SEVKİYAT: MO-2026-0130") for s in loj[0]["riskler"])   # teslim edilmiş
    assert any(s.startswith("Gecikmeli teslim edildi: MO-2026-0130") for s in loj[0]["riskler"])
    assert not any("incelenemedi" in s for s in loj[0]["riskler"])
    assert "Tedarik durumu: DC kablo 6 mm²: 2000 m sevkiyatta (MO-2026-0141" in ikinci
    assert "Tedarik durumu: Topraklama şeridi: Move On'da bekleyen sevkiyat yok" in ikinci
    md = sonuc.sunum_yolu.read_text(encoding="utf-8")
    assert "GECİKEN SEVKİYAT: MO-2026-0138" in md and "MO-2026-0150" not in md      # başka proje filtrelendi


def test_kisisel_ve_navlun_verisi_hicbir_yere_gitmez(tam):
    _, sonuc, runs, k = tam
    metin = json.dumps(_mesajlar(runs), ensure_ascii=False) + sonuc.sunum_yolu.read_text(encoding="utf-8")
    metin += "".join(a.gelen_metni + a.sistem_istemi for a in k.akt)
    for iz in KISISEL:
        assert iz not in metin, iz


def test_moveon_kaynakli_sayilar_dogrulanir(tam):
    _, sonuc, runs, _ = tam
    s = sunum_bul(runs, sonuc.gorev_no)
    mo_d = [d for d in s["kaynak_dogrulama"] if str(d["kaynak_dosya"]).startswith("moveon:")]
    assert mo_d and all(d["durum"] == "dogrulandi" for d in mo_d)


def test_uydurma_moveon_degeri_reddedilir(mo, tmp_path):
    cevap = {}

    class Senaryo(DenemeCalistirici):
        async def calistir(self, akt):
            if akt.ajan.ad == "lojistik":
                ad = json.loads(akt.araclar.moveon_oku())["kaynak"]
                cevap["r"] = akt.araclar.rapor_ver({
                    "ozet": "x", "veri_kaynaklari": [{"dosya": ad, "surum": "-", "tarih": "-"}],
                    "varsayimlar": [], "riskler": [], "onerilen_aksiyonlar": [],
                    "guven": {"seviye": "orta", "neden": "x"},
                    "sayisal_degerler": [{"anahtar": "kablo_yolda_m", "deger": 5000, "birim": "m",
                                          "kaynak_dosya": ad, "kaynak_konum": "satır 2"}]})
                return 0.0
            return await super().calistir(akt)

    Orkestrator(yukle(), tmp_path / "runs", calistirici=Senaryo(), moveon=mo).talep_isle("sevkiyat")
    assert cevap["r"].startswith("REDDEDİLDİ") and "konumunda" in cevap["r"]


def test_canli_modda_moveon_yalniz_lojistikte(tam, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    ork, _, _, k = tam
    c = CanliCalistirici(ork.yapi.model_ayari)
    for akt in k.akt:
        izin = c.secenekler(akt).allowed_tools
        assert ("mcp__fons__moveon_oku" in izin) == (akt.ajan.ad == "lojistik"), akt.ajan.ad
    loj = next(a for a in k.akt if a.ajan.ad == "lojistik")
    assert "Move On (salt okunur)" in loj.sistem_istemi


def test_sentetik_dosya_gercek_disa_aktarim_varken_secilmez(tmp_path):
    import os
    import time
    k = tmp_path / "mo"
    gercek = k / "moveon_gercek.csv"
    k.mkdir()
    gercek.write_text("Sevkiyat No;Malzeme;Durum\nG-1;Kablo;Yolda\n", encoding="utf-8")
    sentetik = ornek_disa_aktarim(k)
    os.utime(sentetik, (time.time() + 100, time.time() + 100))          # sentetik daha yeni olsa bile
    assert kaynak(k).son_dosya() == gercek


def test_eslemesiz_projede_moveon_okunmaz(mo, tmp_path):
    proje_k = olustur(tmp_path / "p")
    ork = Orkestrator(yukle(), tmp_path / "runs", moveon=mo, proje=ProjeAyari(ad="eslemesiz", klasor=proje_k))
    sonuc = ork.talep_isle("sevkiyat")
    md = sonuc.sunum_yolu.read_text(encoding="utf-8")
    assert "Move On eşlemesi tanımlı değil" in md and "MO-2026-0141" not in md
