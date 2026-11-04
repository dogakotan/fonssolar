"""Aşama 1 kabul testleri: izin tablosu, kural reddi ve kayıt.
API çağrısı yapmaz, ücretsiz çalışır:  python -m pytest -q
"""
import json
import shutil
from pathlib import Path

import pytest
import yaml

from orkestrator import IzinReddi, Kayitci, Yonlendirici, yukle
from orkestrator.rapor import veri_yok_raporu
from orkestrator.yapilandirma import KOK, YapilandirmaHatasi, dogrula

RAPOR = json.dumps(veri_yok_raporu("test"), ensure_ascii=False)


@pytest.fixture
def ortam(tmp_path):
    yapi = yukle()
    kayitci = Kayitci(tmp_path / "runs")
    return Yonlendirici(yapi, kayitci), kayitci


def _jsonl(yol: Path) -> list[dict]:
    return [json.loads(s) for s in yol.read_text(encoding="utf-8").splitlines() if s.strip()]


def _tek_gun(kayitci: Kayitci) -> Path:
    gunler = [p for p in kayitci.kok.iterdir() if p.is_dir()]
    assert len(gunler) == 1
    return gunler[0]


# --- Kabul ölçütü: Saha Koordinatörü -> Ticari Direktör teknik olarak başarısız ve kayıtlı ---

@pytest.mark.parametrize("tur", ["gorev", "rapor", "talep", "sunum"])
@pytest.mark.parametrize("gon,al", [("saha_koordinatoru", "ticari_direktor"),
                                    ("ticari_direktor", "saha_koordinatoru")])
def test_saha_ticari_arasi_her_yonde_her_turde_reddedilir(ortam, gon, al, tur):
    y, kayitci = ortam
    with pytest.raises(IzinReddi) as e:
        y.gonder(gon, al, tur, "kablo eksik", "G-TEST-0001")
    assert "kesin yasak" in e.value.neden
    assert y.gelen_kutusu(al) == []
    gun = _tek_gun(kayitci)
    red = _jsonl(gun / "_reddedilenler.jsonl")
    assert len(red) == 1
    assert red[0]["gonderen"] == gon and red[0]["alici"] == al
    assert red[0]["durum"] == "REDDEDILDI" and red[0]["red_nedeni"]
    assert (gun / gon / "reddedilen.jsonl").exists()
    assert not (gun / "_tum_mesajlar.jsonl").exists()


def test_saha_bilgisi_ticariye_proje_direktoru_uzerinden_ulasir(ortam):
    y, _ = ortam
    y.gonder("saha_koordinatoru", "proje_direktoru", "rapor", RAPOR, "G-1")
    y.gonder("proje_direktoru", "ticari_direktor", "gorev", "kablo tedarik önerisi", "G-1")
    assert [m.icerik for m in y.gelen_kutusu("ticari_direktor")] == ["kablo tedarik önerisi"]


# --- Yanal ve kademe atlayan iletişim ---

@pytest.mark.parametrize("gon,al,tur", [
    ("hafriyat", "evrak_takip", "rapor"),              # aynı müdür altındaki uzmanlar
    ("teklif_maliyet", "lojistik", "rapor"),
    ("elektrik_sefi", "mekanik_sef", "gorev"),
    ("proje_muduru", "saha_koordinatoru", "rapor"),    # baş ajanlar arası yanal
    ("proje_direktoru", "hafriyat", "gorev"),          # görev kademe atlayamaz
    ("hafriyat", "proje_direktoru", "rapor"),          # rapor kademe atlayamaz
    ("saha_sefi", "ticari_direktor", "rapor"),         # kollar arası
    ("lojistik", "depocu", "rapor"),
])
def test_yanal_ve_kademe_atlayan_mesaj_reddedilir(ortam, gon, al, tur):
    y, _ = ortam
    with pytest.raises(IzinReddi):
        y.gonder(gon, al, tur, "x", "G-1")


def test_yon_ve_tur_uyumsuzlugu_reddedilir(ortam):
    y, _ = ortam
    with pytest.raises(IzinReddi, match="yalnızca"):
        y.gonder("proje_muduru", "hafriyat", "rapor", "x", "G-1")   # üst alta rapor vermez
    with pytest.raises(IzinReddi, match="yalnızca"):
        y.gonder("hafriyat", "proje_muduru", "gorev", "x", "G-1")   # alt üste görev vermez


# --- Mühendis yalnızca Proje Direktörü ile konuşur ---

@pytest.mark.parametrize("gon", ["proje_muduru", "saha_koordinatoru", "ticari_direktor", "hafriyat"])
def test_muhendise_yalnizca_proje_direktoru_ulasir(ortam, gon):
    y, _ = ortam
    with pytest.raises(IzinReddi):
        y.gonder(gon, "muhendis", "sunum", "x", "G-1")


def test_muhendis_ajanlara_dogrudan_gorev_veremez(ortam):
    y, _ = ortam
    with pytest.raises(IzinReddi):
        y.gonder("muhendis", "hafriyat", "talep", "x", "G-1")


# --- Veri ayrımı (ticari etiket) ---

@pytest.mark.parametrize("al", ["proje_muduru", "saha_koordinatoru"])
def test_ticari_etiketli_veri_saha_ve_proje_koluna_gecemez(ortam, al):
    y, _ = ortam
    with pytest.raises(IzinReddi, match="veri erişimi"):
        y.gonder("proje_direktoru", al, "gorev", "birim fiyatlar", "G-1", ["ticari"])


def test_ticari_veri_ticari_kol_icinde_gecer(ortam):
    y, _ = ortam
    y.gonder("teklif_maliyet", "satin_alma_muduru", "rapor", RAPOR, "G-1", ["ticari"])
    y.gonder("satin_alma_muduru", "ticari_direktor", "rapor", RAPOR, "G-1", ["ticari"])


# --- Diğer kontroller ---

def test_bilinmeyen_ajan_ve_eksik_gorev_no_reddedilir(ortam):
    y, _ = ortam
    with pytest.raises(IzinReddi, match="bilinmeyen"):
        y.gonder("sahte_ajan", "proje_direktoru", "rapor", "x", "G-1")
    with pytest.raises(IzinReddi, match="görev numarası"):
        y.gonder("hafriyat", "proje_muduru", "rapor", "x", "")


def test_iletilen_mesaj_kaydi_zorunlu_alanlari_icerir(ortam):
    y, kayitci = ortam
    g = kayitci.yeni_gorev_no()
    y.gonder("proje_muduru", "hafriyat", "gorev", "kazı-dolgu dengesini kontrol et", g)
    gun = _tek_gun(kayitci)
    for yol in (gun / "_tum_mesajlar.jsonl", gun / "proje_muduru" / "giden.jsonl",
                gun / "hafriyat" / "gelen.jsonl"):
        k = _jsonl(yol)[0]
        assert {"gonderen", "alici", "zaman", "gorev_no", "tur", "mesaj_id", "icerik"} <= k.keys()
        assert k["gorev_no"] == g and k["gonderen"] == "proje_muduru" and k["alici"] == "hafriyat"


def test_gorev_numarasi_artar(tmp_path):
    k = Kayitci(tmp_path)
    a, b = k.yeni_gorev_no(), k.yeni_gorev_no()
    assert a != b and a.startswith("G-") and b.endswith("0002")


# --- Yapılandırma tutarlılığı ---

def test_gercek_yapilandirma_gecerli():
    yapi = yukle()
    assert dogrula(yapi) == []
    assert len(yapi.ajanlar) == 18


def _kopya(tmp_path) -> Path:
    hedef = tmp_path / "kopya"
    shutil.copytree(KOK / "config", hedef / "config")
    shutil.copytree(KOK / "agents", hedef / "agents")
    return hedef


def test_izin_tablosuna_yasak_satir_eklenirse_yapilandirma_reddedilir(tmp_path):
    k = _kopya(tmp_path)
    yol = k / "config" / "izinler.yaml"
    veri = yaml.safe_load(yol.read_text(encoding="utf-8"))
    veri["izinler"].append({"gonderen": "saha_koordinatoru", "alici": "ticari_direktor", "turler": ["gorev"]})
    yol.write_text(yaml.safe_dump(veri, allow_unicode=True), encoding="utf-8")
    with pytest.raises(YapilandirmaHatasi, match="Kesin yasaklı"):
        yukle(k)


def test_yanal_izin_eklenirse_yapilandirma_reddedilir(tmp_path):
    k = _kopya(tmp_path)
    yol = k / "config" / "izinler.yaml"
    veri = yaml.safe_load(yol.read_text(encoding="utf-8"))
    veri["izinler"].append({"gonderen": "hafriyat", "alici": "evrak_takip", "turler": ["rapor"]})
    yol.write_text(yaml.safe_dump(veri, allow_unicode=True), encoding="utf-8")
    with pytest.raises(YapilandirmaHatasi, match="fazladan izin"):
        yukle(k)


@pytest.mark.parametrize("arac", ["Agent", "Task", "Bash", "Read", "WebFetch"])
def test_ajana_baska_ajan_cagirma_veya_dosya_araci_verilemez(tmp_path, arac):
    k = _kopya(tmp_path)
    yol = k / "agents" / "hafriyat.yaml"
    veri = yaml.safe_load(yol.read_text(encoding="utf-8"))
    veri["araclar"] = [arac]
    yol.write_text(yaml.safe_dump(veri, allow_unicode=True), encoding="utf-8")
    with pytest.raises(YapilandirmaHatasi, match="yasak araç"):
        yukle(k)
