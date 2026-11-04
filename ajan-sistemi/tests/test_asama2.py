"""Aşama 2 kabul testleri: standart rapor, çapraz kontrol, Proje Direktörü onayı,
mühendise sunum ve insan onayı kapısı. API çağrısı yapmaz."""
import asyncio
import json

import pytest

from orkestrator import IzinReddi, Kayitci, Yonlendirici, yukle
from orkestrator.akis import Orkestrator, sunum_bul
from orkestrator.calistirici import CanliCalistirici, DenemeCalistirici
from orkestrator.capraz import anahtar_ayarlari, capraz_kontrol
from orkestrator.kapi import OnayKapisi, OnaysizIslem, dis_etkili
from orkestrator.rapor import aksiyon_dis_etkili_mi, rapor_hatalari, veri_yok_raporu
from orkestrator.yapilandirma import KOK, YASAK_ARACLAR


def gecerli_rapor(**ek):
    r = {
        "ozet": "Hendek metrajı kontrol edildi.",
        "veri_kaynaklari": [{"dosya": "hafriyat.xlsx", "surum": "R2", "tarih": "2026-10-30"}],
        "varsayimlar": [], "riskler": [], "onerilen_aksiyonlar": [],
        "guven": {"seviye": "orta", "neden": "tek revizyon"},
        "sayisal_degerler": [{"anahtar": "kablo_hendegi_m", "deger": 8450, "birim": "m",
                              "kaynak_dosya": "hafriyat.xlsx", "kaynak_konum": "Hendek!F30"}],
    }
    r.update(ek)
    return r


class Kaydedici:
    """Deneme çalıştırıcısını sarar, her etkinleştirmeyi saklar."""
    def __init__(self):
        self.ic = DenemeCalistirici()
        self.aktivasyonlar = []

    async def calistir(self, akt):
        self.aktivasyonlar.append(akt)
        return await self.ic.calistir(akt)


@pytest.fixture
def calisma(tmp_path):
    k = Kaydedici()
    ork = Orkestrator(yukle(), tmp_path / "runs", calistirici=k)
    sonuc = ork.talep_isle("12 MWp sahada modül ve hendek durumunu kontrol et")
    return ork, sonuc, k, tmp_path / "runs"


def _tum_mesajlar(runs):
    return [json.loads(s) for p in runs.glob("*/_tum_mesajlar.jsonl")
            for s in p.read_text(encoding="utf-8").splitlines()]


# ------------------------------------------------------------ standart rapor

def test_gecerli_ve_veri_yok_raporu_kabul_edilir():
    assert rapor_hatalari(gecerli_rapor()) == []
    assert rapor_hatalari(veri_yok_raporu("dosya yok")) == []


@pytest.mark.parametrize("bozuk,beklenen", [
    ({"ozet": ""}, "ozet"),
    ({"guven": {"seviye": "cok", "neden": "x"}}, "guven"),
    ({"veri_kaynaklari": [{"dosya": "a.xlsx", "surum": "", "tarih": ""}]}, "veri_kaynaklari"),
    ({"sayisal_degerler": [{"anahtar": "modul_adedi", "deger": 100, "birim": "adet",
                            "kaynak_dosya": "", "kaynak_konum": ""}]}, "kaynak_dosya"),
    ({"sayisal_degerler": [{"anahtar": "modul_adedi", "deger": 100, "birim": "adet",
                            "kaynak_dosya": "uydurma.xlsx", "kaynak_konum": "A1"}]}, "listesinde yok"),
    ({"veri_kaynaklari": [], "sayisal_degerler": [], "guven": {"seviye": "yuksek", "neden": "x"}}, "dusuk"),
    ({"onerilen_aksiyonlar": [{"aciklama": "x", "tur": "bilinmeyen"}]}, "tur"),
])
def test_eksik_veya_uydurma_kaynakli_rapor_reddedilir(bozuk, beklenen):
    h = rapor_hatalari(gecerli_rapor(**bozuk))
    assert h and any(beklenen in x for x in h)


def test_yonlendirici_format_disi_raporu_reddeder(tmp_path):
    y = Yonlendirici(yukle(), Kayitci(tmp_path))
    with pytest.raises(IzinReddi, match="standart rapor"):
        y.gonder("hafriyat", "proje_muduru", "rapor", "hendek 8450 m", "G-1")
    y.gonder("hafriyat", "proje_muduru", "rapor", json.dumps(gecerli_rapor()), "G-1")


def test_dis_etkili_aksiyon_metinden_de_yakalanir():
    assert aksiyon_dis_etkili_mi({"aciklama": "Modül siparişi ver", "tur": "oneri"})
    assert aksiyon_dis_etkili_mi({"aciklama": "x", "tur": "saha_talimati"})
    assert not aksiyon_dis_etkili_mi({"aciklama": "Güzergâhı revize et", "tur": "oneri"})


# ------------------------------------------------------------ çapraz kontrol

def _rapor_deger(anahtar, deger, birim, dosya):
    return gecerli_rapor(veri_kaynaklari=[{"dosya": dosya, "surum": "1", "tarih": "2026-11-01"}],
                         sayisal_degerler=[{"anahtar": anahtar, "deger": deger, "birim": birim,
                                            "kaynak_dosya": dosya, "kaynak_konum": "A1"}])


def test_capraz_kontrol_modul_adedi_farkini_bulur():
    ayar = anahtar_ayarlari(KOK)
    t = capraz_kontrol([("proje_tasarim", _rapor_deger("modul_adedi", 21600, "adet", "tasarim.xlsx")),
                        ("satin_alma", _rapor_deger("modul_adedi", 21528, "adet", "boq.xlsx"))], ayar)
    assert len(t) == 1 and t[0].anahtar == "modul_adedi" and t[0].tur == "deger"
    assert {g.kaynak_dosya for g in t[0].gozlemler} == {"tasarim.xlsx", "boq.xlsx"}


def test_capraz_kontrol_tolerans_birim_ve_tekrar():
    ayar = anahtar_ayarlari(KOK)
    # kazı hacminde %1 tolerans: %0,5 fark tutarsızlık değildir
    assert capraz_kontrol([("a", _rapor_deger("kazi_hacmi_m3", 1000, "m3", "x.xlsx")),
                           ("b", _rapor_deger("kazi_hacmi_m3", 1005, "m3", "y.xlsx"))], ayar) == []
    # birim farklıysa işaretlenir
    t = capraz_kontrol([("a", _rapor_deger("dc_guc_mwp", 12.4, "MWp", "x.xlsx")),
                        ("b", _rapor_deger("dc_guc_mwp", 12400, "kWp", "y.xlsx"))], ayar)
    assert t[0].tur == "birim"
    # üst ajanın aynı kaynağı taşıması tutarsızlık sayılmaz
    r = _rapor_deger("modul_adedi", 100, "adet", "x.xlsx")
    assert capraz_kontrol([("alt", r), ("ust", r)], ayar) == []


# --------------------------------------------- Proje Direktörü onayı / sunum

def test_uctan_uca_deneme_sunum_uretir(calisma):
    ork, sonuc, _, runs = calisma
    assert sonuc.durum == "sunuldu", sonuc.neden
    md = sonuc.sunum_yolu.read_text(encoding="utf-8")
    assert "DENEME MODU" in md and "Proje Direktörü onayından geçti" in md
    assert "modul_adedi" in md and "Tutarsızlıklar" in md
    s = sunum_bul(runs, sonuc.gorev_no)
    assert [t["anahtar"] for t in s["tutarsizliklar"]] == ["modul_adedi"]
    assert s["karar"] == "kosullu_devam"


def test_muhendise_yalnizca_pd_onayli_tek_sunum_gider(calisma):
    _, sonuc, _, runs = calisma
    m = _tum_mesajlar(runs)
    muhendise = [x for x in m if x["alici"] == "muhendis"]
    assert len(muhendise) == 1
    assert muhendise[0]["gonderen"] == "proje_direktoru" and muhendise[0]["tur"] == "sunum"
    assert json.loads(muhendise[0]["icerik"])["pd_onayi"]["onaylayan"] == "proje_direktoru"
    # tüm iletilen raporlar standart formatta
    assert all(rapor_hatalari(x["icerik"]) == [] for x in m if x["tur"] == "rapor")
    # her mesajda zorunlu alanlar
    assert all(x["gorev_no"] == sonuc.gorev_no and x["zaman"] for x in m)


def test_pd_onaysiz_veya_pd_disi_sunum_reddedilir(tmp_path):
    y = Yonlendirici(yukle(), Kayitci(tmp_path))
    onaysiz = {"karar": "devam", "karar_gerekcesi": "x", "pd_raporu": gecerli_rapor(),
               "tutarsizliklar": [], "rapor_zinciri": []}
    with pytest.raises(IzinReddi, match="Proje Direktörü onayı yok"):
        y.gonder("proje_direktoru", "muhendis", "sunum", json.dumps(onaysiz), "G-1")
    onayli = onaysiz | {"pd_onayi": {"onaylayan": "proje_direktoru", "zaman": "2026-11-04T10:00:00+03:00"}}
    with pytest.raises(IzinReddi):
        y.gonder("proje_muduru", "muhendis", "sunum", json.dumps(onayli), "G-1")
    eksik = {k: v for k, v in onayli.items() if k != "tutarsizliklar"}
    with pytest.raises(IzinReddi, match="çapraz kontrol"):
        y.gonder("proje_direktoru", "muhendis", "sunum", json.dumps(eksik), "G-1")
    y.gonder("proje_direktoru", "muhendis", "sunum", json.dumps(onayli), "G-1")


def test_pd_raporlar_tamamlanmadan_sunamaz_ve_yalniz_bir_kez_calisir(calisma):
    _, _, k, _ = calisma
    pd = [a for a in k.aktivasyonlar if a.ajan.ad == "proje_direktoru"]
    # 1) talep -> görev dağıtımı, 2) üç rapor birlikte -> sunum (ara raporlar için boşuna çalışmaz)
    assert len(pd) == 2
    assert len([m for m in pd[1].gelenler if m.tur == "rapor"]) == 3


def test_bekleyen_rapor_varken_muhendise_sun_reddedilir(tmp_path):
    ork = Orkestrator(yukle(), tmp_path / "runs")
    sonuc_metni = {}

    class Erken:
        async def calistir(self, akt):
            if akt.ajan.ad == "proje_direktoru" and akt.gelenler[0].tur == "talep":
                akt.araclar.gorev_ver("proje_muduru", "kontrol et")
                sonuc_metni["s"] = akt.araclar.muhendise_sun(gecerli_rapor(), "devam", "acele", [])
            return 0.0

    ork.calistirici = Erken()
    ork.talep_isle("x")
    assert sonuc_metni["s"].startswith("REDDEDİLDİ") and "rapor bekleniyor" in sonuc_metni["s"]


# ----------------------------------------------------------- onay kapısı

def test_dis_etkili_aksiyon_onay_kuyruguna_duser_ve_onaysiz_yurutulmez(calisma):
    _, sonuc, _, runs = calisma
    kapi = OnayKapisi(runs)
    assert sonuc.onay_bekleyenler, "deneme verisindeki sipariş önerisi kuyruğa düşmeli"
    tid = sonuc.onay_bekleyenler[0]
    assert kapi.liste("bekliyor")[tid]["aksiyon"]["tur"] == "siparis"
    with pytest.raises(OnaysizIslem):
        kapi.yurut(tid)
    with pytest.raises(ValueError):
        kapi.onayla(tid, "  ")                       # isimsiz onay geçersiz
    kapi.onayla(tid, "Test Mühendis")
    assert "elle uygulamalıdır" in kapi.yurut(tid)   # yürütücü yok: dış sisteme hiçbir şey yazılmaz
    with pytest.raises(OnaysizIslem):
        kapi.yurut(tid)                              # ikinci kez yürütülemez
    log = (runs / "onay_kayitlari.jsonl").read_text(encoding="utf-8")
    assert "yurutme_reddedildi" in log and "onaylandi" in log and "yurutuldu" in log


def test_dis_etkili_yurutucu_kapı_disindan_calismaz(tmp_path):
    cagrilar = []

    @dis_etkili
    def siparis_ver(talep):
        cagrilar.append(talep)
        return "sipariş gönderildi"

    with pytest.raises(OnaysizIslem):
        siparis_ver({"x": 1})
    kapi = OnayKapisi(tmp_path)
    kapi.yurutucu_kaydet("siparis", siparis_ver)
    kapi.talep_ekle("G-1-A1", "G-1", "satin_alma", {"aciklama": "modül siparişi", "tur": "siparis"})
    with pytest.raises(OnaysizIslem):
        kapi.yurut("G-1-A1")
    assert cagrilar == []
    kapi.reddet("G-1-A1", "Test Mühendis")
    with pytest.raises(OnaysizIslem):
        kapi.yurut("G-1-A1")
    kapi.talep_ekle("G-1-A2", "G-1", "satin_alma", {"aciklama": "modül siparişi", "tur": "siparis"})
    kapi.onayla("G-1-A2", "Test Mühendis")
    assert kapi.yurut("G-1-A2") == "sipariş gönderildi" and len(cagrilar) == 1
    with pytest.raises(ValueError):
        kapi.yurutucu_kaydet("siparis", lambda t: "işaretsiz")


# ------------------------------------------------- canlı mod güvenlik ayarları

def test_canli_mod_ajan_secenekleri_kilitli(calisma, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-GIZLI-DEGER")
    ork, _, k, _ = calisma
    canli = CanliCalistirici(ork.yapi.model_ayari)
    pd = next(a for a in k.aktivasyonlar if a.ajan.ad == "proje_direktoru")
    s = canli.secenekler(pd)
    assert s.tools == [] and s.strict_mcp_config and s.setting_sources == []
    assert s.permission_mode == "dontAsk"
    assert sorted(s.allowed_tools) == ["mcp__fons__gorev_ver", "mcp__fons__muhendise_sun"]
    assert {"Agent", "Task", "Bash", "Read", "WebFetch"} <= set(s.disallowed_tools) == set(YASAK_ARACLAR)
    assert s.model == "claude-sonnet-5-5" and s.max_budget_usd <= 1.0
    assert "sk-test-GIZLI-DEGER" not in pd.sistem_istemi + pd.gelen_metni
    assert "muhendise_sun" in pd.sistem_istemi
    if (KOK / "knowledge" / "beceriler" / "solar-proje-direktoru.md").exists():
        assert "Bilgi tabanı" in pd.sistem_istemi


def test_pd_rapor_veremez_uzman_gorev_veremez(calisma):
    ork, _, _, _ = calisma
    pd = ork._araclar("proje_direktoru", {})
    assert pd.adlar() == ["gorev_ver", "muhendise_sun"]
    assert ork._araclar("hafriyat", {}).adlar() == ["rapor_ver"]
    assert ork._araclar("proje_muduru", {}).adlar() == ["gorev_ver", "rapor_ver"]


def test_canli_mod_anahtarsiz_acik_hata_verir(calisma, monkeypatch):
    for d in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"):
        monkeypatch.delenv(d, raising=False)
    ork, _, k, _ = calisma
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        asyncio.run(CanliCalistirici(ork.yapi.model_ayari).calistir(k.aktivasyonlar[0]))
