"""Aşama 6 kabul testleri: Proje Tasarım, Drenaj ve CCTV/Telcit ajanları; tüm hiyerarşi devrede."""
import json

import pytest

from orkestrator import yukle
from orkestrator.akis import Orkestrator, sunum_bul
from orkestrator.calistirici import DenemeCalistirici, metin_degerleri
from orkestrator.capraz import anahtar_ayarlari
from orkestrator.ornek_proje import olustur
from orkestrator.veri import sayi_coz, sayilar
from orkestrator.yapilandirma import KOK


def test_tum_ajanlar_devrede():
    yapi = yukle()
    assert all(a.ham["durum"] == "aktif" for a in yapi.ajanlar.values())
    assert len(yapi.ajanlar) == 18


@pytest.fixture(scope="module")
def tam(tmp_path_factory):
    proje = olustur(tmp_path_factory.mktemp("veri") / "ornek-ges")
    runs = tmp_path_factory.mktemp("runs")
    ork = Orkestrator(yukle(), runs, calistirici=DenemeCalistirici(), veri_klasoru=proje, moveon=None)
    return ork, ork.talep_isle("Tasarım, drenaj ve güvenlik dahil genel durum"), runs


def _rapor(runs, ajan):
    return [json.loads(m["icerik"]) for p in runs.glob("*/_tum_mesajlar.jsonl")
            for m in map(json.loads, p.read_text(encoding="utf-8").splitlines()) if m["gonderen"] == ajan]


def test_yeni_uzmanlar_proje_mudurune_rapor_verir(tam):
    _, sonuc, runs = tam
    assert sonuc.durum == "sunuldu"
    for ajan, anahtar in [("proje_tasarim", "modul_adedi"), ("drenaj", "q50_debi_m3s"), ("cctv_telcit", "tel_cit_m")]:
        r = _rapor(runs, ajan)[0]
        assert anahtar in [v["anahtar"] for v in r["sayisal_degerler"]], ajan
    assert any("kamera_yerlesim.dwg okunamadı" in x for x in _rapor(runs, "cctv_telcit")[0]["riskler"])


def test_kollar_arasi_capraz_kontrol_modul_adedi(tam):
    _, sonuc, runs = tam
    t = {x["anahtar"]: x for x in sunum_bul(runs, sonuc.gorev_no)["tutarsizliklar"]}
    assert {g["ajan"] for g in t["modul_adedi"]["gozlemler"]} == {"proje_tasarim", "satin_alma"}


def test_yeni_degerler_kaynakta_dogrulanir(tam):
    _, sonuc, runs = tam
    d = [x for x in sunum_bul(runs, sonuc.gorev_no)["kaynak_dogrulama"]
         if x["kaynak_dosya"].split("/")[0] in ("tasarim", "drenaj", "cctv")]
    assert len(d) >= 6 and all(x["durum"] == "dogrulandi" for x in d)


def _tarama(satir):
    return {(d["anahtar"], d["deger"]) for d in metin_degerleri([("s.1", satir)], "x.pdf", anahtar_ayarlari(KOK))}


def test_ingilizce_ondalik_ve_debi_ifadeleri():
    assert sayi_coz("100.00") == 100 and sayilar("System power: 100.00 MWp") == [100.0]
    assert _tarama("System power: 100.00 MWp") == {("pvsyst_sistem_gucu_mwp", 100.0)}
    assert _tarama("En büyük debi Q50            3,72 m³/s") == {("q50_debi_m3s", 3.72)}
    # ara toplamlar / bölümlere ayrılmış değerler deneme modunda kurala bağlanmaz
    assert _tarama("ADA-A  140,50 ha çit 9.210 m · kanal 31.400 m") == set()
    assert _tarama("Q50 rasyonel: C=0,40 · i=70 mm/sa · q=0,110 m³/s/ha") == set()
