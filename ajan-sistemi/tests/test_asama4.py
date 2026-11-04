"""Aşama 4 kabul testleri: saha kolu ve ticari kol. Kollar arası bilgi yalnızca
Proje Direktörü üzerinden akar; ticari veri saha ve proje kollarına sızmaz. API'siz."""
import json

import pytest

from orkestrator import Kayitci, Yonlendirici, yukle
from orkestrator.akis import Orkestrator, sunum_bul
from orkestrator.calistirici import CanliCalistirici, DenemeCalistirici
from orkestrator.kapi import OnayKapisi, OnaysizIslem
from orkestrator.ornek_proje import olustur
from orkestrator.yapilandirma import dogrula

SAHA = {"saha_koordinatoru", "saha_sefi", "elektrik_sefi", "mekanik_sef", "depocu", "kaliteci"}
TICARI = {"ticari_direktor", "satin_alma_muduru", "teklif_maliyet", "satin_alma", "lojistik"}


def _mesajlar(runs, dosya="_tum_mesajlar.jsonl"):
    return [json.loads(s) for p in runs.glob(f"*/{dosya}") for s in p.read_text(encoding="utf-8").splitlines()]


class Kaydet(DenemeCalistirici):
    def __init__(self):
        self.akt = []

    async def calistir(self, akt):
        self.akt.append(akt)
        return await super().calistir(akt)


@pytest.fixture(scope="module")
def tam(tmp_path_factory):
    proje = olustur(tmp_path_factory.mktemp("veri") / "ornek-ges")
    runs = tmp_path_factory.mktemp("runs")
    k = Kaydet()
    ork = Orkestrator(yukle(), runs, calistirici=k, veri_klasoru=proje)
    sonuc = ork.talep_isle("Örnek GES genel durum: saha, ticari ve proje kollarını kontrol et")
    return ork, sonuc, runs, k


def test_iki_kol_da_devrede():
    yapi = yukle()
    for a in SAHA | TICARI:
        assert yapi.ajanlar[a].ham["durum"] == "aktif", a
    assert dogrula(yapi) == []


def test_tam_akis_sunum_ve_hiyerarsi(tam):
    _, sonuc, runs, _ = tam
    assert sonuc.durum == "sunuldu", sonuc.neden
    m = _mesajlar(runs)
    yapi = yukle()
    for x in m:   # her iletilen mesaj izin tablosunda olmalı (yönlendirici zaten zorlar; çift kontrol)
        assert x["tur"] in yapi.izinler[(x["gonderen"], x["alici"])]
    assert not any({x["gonderen"], x["alici"]} == {"saha_koordinatoru", "ticari_direktor"} for x in m)


def test_sahadaki_eksik_proje_direktoru_uzerinden_ticariye_gorev_olur(tam):
    _, sonuc, runs, _ = tam
    m = _mesajlar(runs)
    i_saha = next(i for i, x in enumerate(m) if x["gonderen"] == "saha_koordinatoru" and "EKSİK MALZEME" in x["icerik"])
    tedarik = [i for i, x in enumerate(m) if x["gonderen"] == "proje_direktoru" and x["alici"] == "ticari_direktor"
               and "[TEDARİK]" in x["icerik"]]
    assert tedarik and tedarik[0] > i_saha
    assert "DC kablo 6 mm²" in m[tedarik[0]]["icerik"] and "Topraklama şeridi" in m[tedarik[0]]["icerik"]
    # Satın Alma sipariş ÖNERİR; öneri insan onayı kuyruğuna düşer ve onaysız yürütülemez
    kapi = OnayKapisi(runs)
    siparisler = {k: v for k, v in kapi.liste("bekliyor").items() if v["aksiyon"]["tur"] == "siparis"}
    assert any("DC kablo" in v["aksiyon"]["aciklama"] and v["oneren"] == "satin_alma" for v in siparisler.values())
    with pytest.raises(OnaysizIslem):
        kapi.yurut(next(iter(siparisler)))


def test_ticari_veri_saha_ve_proje_kollarina_sizmaz(tam):
    ork, _, runs, k = tam
    m = _mesajlar(runs)
    disari = [x for x in m if x["alici"] in SAHA or ork.yapi.ajanlar.get(x["alici"]) and
              ork.yapi.ajanlar[x["alici"]].kol == "proje"]
    assert disari
    metin = json.dumps(disari, ensure_ascii=False)
    for iz in ("birim_fiyat", "61.5", "61,5", "modul_birim_fiyat_usd"):
        assert iz not in metin, iz
    assert all("ticari" not in x["etiketler"] for x in disari)
    # saha/proje ajanlarının hiçbiri ticari dosya OKUMADI ve listelerinde görmedi
    for a in SAHA | {"proje_muduru", "hafriyat", "evrak_takip"}:
        assert not any(d.startswith("ticari/") for d in ork.veri.okunanlar.get(a, set())), a
        assert all(not b.dosya.startswith("ticari/") for b in ork.veri.dosyalar(a)), a
    # canlı modda bu ajanların bağlamına (istem + gelen kutusu) da fiyat girmedi
    for akt in k.akt:
        if akt.ajan.ad in SAHA or akt.ajan.kol == "proje":
            assert "61.5" not in akt.gelen_metni and "birim_fiyat" not in akt.gelen_metni, akt.ajan.ad


def test_teklif_maliyet_ciktisi_her_zaman_ticari_etiketli(tam):
    _, _, runs, _ = tam
    m = _mesajlar(runs)
    tm = [x for x in m if x["gonderen"] == "teklif_maliyet"]
    assert tm and all("ticari" in x["etiketler"] for x in tm)
    # etiket zincir boyunca taşınır: Satın Alma Müdürü -> Ticari Direktör -> Proje Direktörü
    assert any(x["gonderen"] == "ticari_direktor" and "ticari" in x["etiketler"] for x in m)


def test_ticari_gormus_pd_sahaya_gorev_veremez(tam, tmp_path):
    """Tam akış sonrasında Proje Direktörü ticari etiketli bağlama sahip; sahaya yeni görev reddedilir."""
    ork, _, _, _ = tam
    assert "ticari" in ork._baglam_etiketleri("proje_direktoru")
    ork.y = Yonlendirici(ork.yapi, Kayitci(tmp_path))
    with pytest.raises(Exception, match="ticari"):
        ork._gonder("proje_direktoru", "saha_koordinatoru", "gorev", "kablo 3 hafta sonra gelir")


def test_saha_kolu_bulgulari_sunumda(tam):
    _, sonuc, runs, _ = tam
    md = sonuc.sunum_yolu.read_text(encoding="utf-8")
    assert "EKSİK MALZEME: DC kablo 6 mm² — 3600 m eksik" in md
    assert "NCR-004" in md and "NCR-005" not in md            # yalnızca açık uygunsuzluk
    s = sunum_bul(runs, sonuc.gorev_no)
    assert "kablo_hendegi_m" in [t["anahtar"] for t in s["tutarsizliklar"]]


def test_yoneticiler_ikinci_turda_onceki_raporlari_gorur(tam):
    _, _, _, k = tam
    pd = [a for a in k.akt if a.ajan.ad == "proje_direktoru"]
    assert len(pd) == 3                     # talep, ilk raporlar (-> tedarik görevi), tedarik raporu (-> sunum)
    assert "DAHA ÖNCE aldığın raporlar" in pd[2].gelen_metni
    assert {g for g, _ in pd[2].alinan_raporlar} >= {"saha_koordinatoru", "ticari_direktor", "proje_muduru"}


def test_canli_mod_arac_setleri(tam, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    ork, _, _, k = tam
    c = CanliCalistirici(ork.yapi.model_ayari)
    beklenen = {"depocu": ["mcp__fons__dosya_listele", "mcp__fons__dosya_oku", "mcp__fons__rapor_ver"],
                "saha_sefi": ["mcp__fons__gorev_ver", "mcp__fons__rapor_ver"],
                "ticari_direktor": ["mcp__fons__gorev_ver", "mcp__fons__rapor_ver"],
                "teklif_maliyet": ["mcp__fons__dosya_listele", "mcp__fons__dosya_oku", "mcp__fons__rapor_ver"]}
    for ajan, araclar in beklenen.items():
        akt = next(a for a in k.akt if a.ajan.ad == ajan)
        s = c.secenekler(akt)
        assert sorted(s.allowed_tools) == araclar and s.tools == [], ajan


def test_ajan_etiketi_yetkisiz_ajana_verilemez(tmp_path):
    yapi = yukle()
    yapi.ajan_etiketleri["depocu"] = {"ticari"}
    assert any("görme yetkisine sahip değil" in h for h in dogrula(yapi))
