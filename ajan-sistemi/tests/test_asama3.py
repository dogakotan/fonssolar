"""Aşama 3 kabul testleri: pilot kol (Proje Müdürü + Hafriyat + Evrak Takip),
proje verisi erişimi, kaynak/hücre doğrulaması, etiket yayılımı. API'siz."""
import json

import pytest

from orkestrator import yukle
from orkestrator.akis import Orkestrator, sunum_bul
from orkestrator.calistirici import CanliCalistirici, DenemeCalistirici
from orkestrator.ornek_proje import olustur
from orkestrator.veri import VeriDeposu, VeriErisimHatasi
from orkestrator.yapilandirma import KOK


@pytest.fixture(scope="module")
def proje(tmp_path_factory):
    return olustur(tmp_path_factory.mktemp("veri") / "ornek-ges")


def _mesajlar(runs):
    return [json.loads(s) for p in runs.glob("*/_tum_mesajlar.jsonl")
            for s in p.read_text(encoding="utf-8").splitlines()]


# ------------------------------------------------------------ veri erişimi

def test_ticari_dosyalar_proje_koluna_gorunmez_ve_okunamaz(proje):
    yapi = yukle()
    d = VeriDeposu(proje, yapi, yapi.klasor_etiketleri)
    hafriyat = [b.dosya for b in d.dosyalar("hafriyat")]
    assert "ticari/birim_fiyatlar_R1.xlsx" not in hafriyat
    assert "hafriyat/hafriyat_metraj_R2.xlsx" in hafriyat
    with pytest.raises(VeriErisimHatasi, match="bulunamadı"):
        d.oku("hafriyat", "ticari/birim_fiyatlar_R1.xlsx")
    for ajan in ("proje_muduru", "evrak_takip", "saha_sefi", "depocu"):
        assert all(not b.dosya.startswith("ticari/") for b in d.dosyalar(ajan))
    assert "ticari/birim_fiyatlar_R1.xlsx" in [b.dosya for b in d.dosyalar("teklif_maliyet")]


@pytest.mark.parametrize("yol", ["../gizli.txt", "hafriyat/../../x.xlsx", "C:/Windows/win.ini", "/etc/passwd", ""])
def test_proje_klasoru_disina_cikilamaz(proje, yol):
    yapi = yukle()
    with pytest.raises(VeriErisimHatasi):
        VeriDeposu(proje, yapi, yapi.klasor_etiketleri).oku("hafriyat", yol)


def test_okuma_hucre_adresli_ve_kayitli(proje):
    yapi = yukle()
    d = VeriDeposu(proje, yapi, yapi.klasor_etiketleri)
    metin = d.oku("hafriyat", "hafriyat/hafriyat_metraj_R2.xlsx", "Özet")
    assert "B4=8450" in metin and "sürüm: R2" in metin
    assert d.okunanlar["hafriyat"] == {"hafriyat/hafriyat_metraj_R2.xlsx"}
    with pytest.raises(VeriErisimHatasi, match="okunamıyor"):
        d.oku("hafriyat", "hafriyat/hafriyat_plani.dwg")
    assert "Metin çıkarılamadı" in d.oku("hafriyat", "hafriyat/zemin_etudu.pdf")
    assert d.hucre_degeri("hafriyat/hafriyat_metraj_R2.xlsx", "Özet!B4") == 8450
    assert d.hucre_degeri("hafriyat/hafriyat_metraj_R2.xlsx", "Detay!C2:C3 toplamı") is ...


# ------------------------------------------------------------- pilot akış

@pytest.fixture(scope="module")
def pilot(proje, tmp_path_factory):
    runs = tmp_path_factory.mktemp("runs")
    ork = Orkestrator(yukle(), runs, calistirici=DenemeCalistirici(), veri_klasoru=proje)
    sonuc = ork.talep_isle("Hafriyat metrajı ve evrak durumunu kontrol et")
    return ork, sonuc, runs


def test_pilot_uctan_uca_sunum(pilot):
    _, sonuc, runs = pilot
    assert sonuc.durum == "sunuldu", sonuc.neden
    s = sunum_bul(runs, sonuc.gorev_no)
    assert s["proje"] == "ornek-ges"
    # hendek: hafriyat içi; modül adedi: tasarım (proje kolu) <-> satın alma planı (ticari kol)
    assert sorted(t["anahtar"] for t in s["tutarsizliklar"]) == ["kablo_hendegi_m", "modul_adedi"]
    assert s["karar"] == "kosullu_devam"
    md = sonuc.sunum_yolu.read_text(encoding="utf-8")
    for beklenen in ("Yapı Ruhsatı: evrak eksik", "Enerji Nakil Hattı İzni: geçerlilik süresi",
                     "İSG Planı: geçerlilik 15 gün", "zemin_etudu.pdf: metin çıkarılamadı",
                     "hafriyat_plani.dwg okunamadı", "✓ kaynakta doğrulandı"):
        assert beklenen in md, beklenen


def test_pilot_hiyerarsi_ve_kaynaklar(pilot):
    _, sonuc, runs = pilot
    m = _mesajlar(runs)
    raporlar = {x["gonderen"]: json.loads(x["icerik"]) for x in m if x["tur"] == "rapor"}
    assert {x["alici"] for x in m if x["gonderen"] in ("hafriyat", "evrak_takip")} == {"proje_muduru"}
    assert {k["dosya"].split("/")[0] for k in raporlar["hafriyat"]["veri_kaynaklari"]} == {"hafriyat"}
    assert {k["dosya"].split("/")[0] for k in raporlar["evrak_takip"]["veri_kaynaklari"]} == {"evrak"}
    s = sunum_bul(runs, sonuc.gorev_no)
    hafriyat_dogrulama = [d for d in s["kaynak_dogrulama"] if d["kaynak_dosya"].startswith("hafriyat/")]
    assert hafriyat_dogrulama and all(d["durum"] == "dogrulandi" for d in hafriyat_dogrulama)


def test_pilotta_ticari_veri_proje_ve_saha_koluna_sizmaz(pilot):
    ork, _, runs = pilot
    kol = {a: t.kol for a, t in ork.yapi.ajanlar.items()}
    yasak_kol = [m for m in _mesajlar(runs) if kol.get(m["alici"]) in ("proje", "saha")]
    assert yasak_kol
    metin = json.dumps(yasak_kol, ensure_ascii=False)
    assert "birim_fiyat" not in metin and "61.5" not in metin and "61,5" not in metin
    assert all("ticari" not in m["etiketler"] for m in yasak_kol)


# -------------------------------------------- kaynak uydurma / yanlış hücre

class Senaryo:
    """Her ajan için elle yazılmış davranış (model yerine). Tanımsız ajanlar deneme kurallarıyla çalışır."""
    def __init__(self, davranislar):
        self.d, self.ic, self.cevaplar = davranislar, DenemeCalistirici(), []

    async def calistir(self, akt):
        if akt.ajan.ad in self.d:
            self.cevaplar.append((akt.ajan.ad, self.d[akt.ajan.ad](akt)))
            return 0.0
        return await self.ic.calistir(akt)


def _hafriyat_raporu(dosya, konum, deger):
    return {"ozet": "hendek", "veri_kaynaklari": [{"dosya": dosya, "surum": "R2", "tarih": "2026-11-01"}],
            "varsayimlar": [], "riskler": [], "onerilen_aksiyonlar": [],
            "guven": {"seviye": "orta", "neden": "x"},
            "sayisal_degerler": [{"anahtar": "kablo_hendegi_m", "deger": deger, "birim": "m",
                                  "kaynak_dosya": dosya, "kaynak_konum": konum}]}


@pytest.mark.parametrize("oku,konum,deger,beklenen", [
    (False, "Özet!B4", 8450, "okunmadı"),            # okunmamış dosya kaynak gösterilemez
    (True, "Özet!B4", 9999, "konumunda 8450 var"),   # hücredeki değerle uyuşmayan sayı
    (True, "Özet!B4", 8450, "İLETİLDİ"),             # doğru
    (True, "Detay!C2:C3 toplamı", 48200, "İLETİLDİ"),  # aralık/hesap: doğrulanamaz ama kabul
])
def test_uydurma_kaynak_ve_yanlis_hucre_reddedilir(proje, tmp_path, oku, konum, deger, beklenen):
    dosya = "hafriyat/hafriyat_metraj_R2.xlsx"

    def hafriyat(akt):
        if oku:
            akt.araclar.dosya_oku(dosya)
        return akt.araclar.rapor_ver(_hafriyat_raporu(dosya, konum, deger))

    sen = Senaryo({"hafriyat": hafriyat})
    ork = Orkestrator(yukle(), tmp_path / "runs", calistirici=sen, veri_klasoru=proje)
    sonuc = ork.talep_isle("hendek kontrolü")
    cevap = dict(sen.cevaplar)["hafriyat"]
    assert beklenen in cevap
    # Reddedilen ajan üstünü kilitlemez: orkestratör 'rapor üretmedi' raporuyla akışı tamamlar.
    assert sonuc.durum == "sunuldu"


# ---------------------------------------------------------- etiket yayılımı

def test_ticari_veri_goren_pd_bunu_proje_koluna_aktaramaz(proje, tmp_path):
    yapi = yukle()
    td = yapi.ajanlar["ticari_direktor"].ham
    td.update(durum="aktif", araclar=["dosya_listele", "dosya_oku", "rapor_ver"], ilgili_klasorler=["ticari"])
    cevap = {}

    def ticari(akt):
        metin = akt.araclar.dosya_oku("ticari/birim_fiyatlar_R1.xlsx")
        assert "61.5" in metin
        return akt.araclar.rapor_ver({
            "ozet": "Modül birim fiyatı 61,5 USD", "varsayimlar": [], "riskler": [], "onerilen_aksiyonlar": [],
            "veri_kaynaklari": [{"dosya": "ticari/birim_fiyatlar_R1.xlsx", "surum": "R1", "tarih": "2026-11-01"}],
            "guven": {"seviye": "orta", "neden": "x"}, "sayisal_degerler": []})

    def pd(akt):
        if any(m.tur == "talep" for m in akt.gelenler):
            return akt.araclar.gorev_ver("ticari_direktor", "fiyatları özetle")
        cevap["gorev"] = akt.araclar.gorev_ver("proje_muduru", "Modül fiyatı 61,5 USD; güzergâhı buna göre seç")
        return akt.araclar.muhendise_sun(
            {"ozet": "ticari özet", "veri_kaynaklari": [], "varsayimlar": [], "riskler": [],
             "onerilen_aksiyonlar": [], "guven": {"seviye": "dusuk", "neden": "x"}, "sayisal_degerler": []},
            "devam", "özet", [])

    ork = Orkestrator(yapi, tmp_path / "runs", calistirici=Senaryo({"ticari_direktor": ticari,
                                                                    "proje_direktoru": pd}), veri_klasoru=proje)
    sonuc = ork.talep_isle("fiyat")
    assert cevap["gorev"].startswith("REDDEDİLDİ") and "ticari" in cevap["gorev"]
    assert sonuc.durum == "sunuldu"                      # mühendis ticari veriyi görebilir
    m = _mesajlar(tmp_path / "runs")
    assert next(x for x in m if x["gonderen"] == "ticari_direktor")["etiketler"] == ["ticari"]
    assert not any(x["alici"] == "proje_muduru" for x in m)
    red = [json.loads(s) for p in (tmp_path / "runs").glob("*/_reddedilenler.jsonl")
           for s in p.read_text(encoding="utf-8").splitlines()]
    assert red and red[0]["alici"] == "proje_muduru" and red[0]["etiketler"] == ["ticari"]


# --------------------------------------------------------- canlı mod ayarları

def test_canli_modda_uzman_yalniz_veri_ve_rapor_araci_alir(proje, tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    kayit = []

    class Kaydet(DenemeCalistirici):
        async def calistir(self, akt):
            kayit.append(akt)
            return await super().calistir(akt)

    ork = Orkestrator(yukle(), tmp_path / "runs", calistirici=Kaydet(), veri_klasoru=proje)
    ork.talep_isle("x")
    akt = next(a for a in kayit if a.ajan.ad == "hafriyat")
    s = CanliCalistirici(ork.yapi.model_ayari).secenekler(akt)
    assert sorted(s.allowed_tools) == ["mcp__fons__dosya_listele", "mcp__fons__dosya_oku", "mcp__fons__rapor_ver"]
    assert s.tools == [] and s.model == "claude-haiku-5-5"
    assert "Proje verisi" in akt.sistem_istemi
    if (KOK / "knowledge" / "beceriler" / "solar-hafriyat-metraj.md").exists():
        assert "Bilgi tabanı" in akt.sistem_istemi
    pm = next(a for a in kayit if a.ajan.ad == "proje_muduru")
    assert sorted(CanliCalistirici(ork.yapi.model_ayari).secenekler(pm).allowed_tools) == \
        ["mcp__fons__gorev_ver", "mcp__fons__rapor_ver"]
