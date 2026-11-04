"""PDF/Word okuma, kurallı metin taraması, proje eşlemesi (alan/etiket) ve
gerekli doküman (EK-11) kontrolü. Yalnızca sentetik veri kullanır."""
import zipfile

import pytest

from orkestrator import yukle
from orkestrator.calistirici import AjanVeri, _gerekli_dokuman_kontrolu, metin_degerleri
from orkestrator.capraz import anahtar_ayarlari
from orkestrator.projeler import proje_yukle
from orkestrator.veri import VeriDeposu, katla, sayi_coz
from orkestrator.yapilandirma import KOK


def docx_yaz(yol, satirlar):
    yol.parent.mkdir(parents=True, exist_ok=True)
    govde = "".join(f"<w:p><w:r><w:t>{s}</w:t></w:r></w:p>" for s in satirlar)
    with zipfile.ZipFile(yol, "w") as z:
        z.writestr("word/document.xml", f'<w:document xmlns:w="x"><w:body>{govde}</w:body></w:document>')


@pytest.mark.parametrize("metin,beklenen", [
    ("120.400", 120400), ("120.400,00", 120400), ("1.300.000", 1300000), ("1,29", 1.29), ("8450", 8450),
])
def test_turkce_sayi_cozumleme(metin, beklenen):
    assert sayi_coz(metin) == beklenen


def test_katla_turkce():
    assert katla("NEBATİ TOPRAK SIYIRMA") == "nebati toprak siyirma"
    assert katla("Kazı Çit Şev Göl Üst Ğ") == "kazi cit sev gol ust g"


def _tarama(satirlar):
    return {(d["anahtar"], d["deger"]) for d in
            metin_degerleri([("s.1", "\n".join(satirlar))], "x.pdf", anahtar_ayarlari(KOK))}


def test_metin_taramasi_en_yakin_ifadeye_atar():
    assert _tarama(["Toplam kazı 300.000 m³  ·  Toplam yol dolgusu 150.000 m³"]) == \
        {("kazi_hacmi_m3", 300000), ("yol_dolgusu_m3", 150000)}
    assert _tarama(["NEBATİ TOPRAK SIYIRMA: 120.400,00 m³"]) == {("siyirma_hacmi_m3", 120400)}


def test_metin_taramasi_belirsiz_kaliplari_almaz():
    # "kazı-dolgu" ayrı bir kavram; ara toplamlı ifade; birimi farklı (cm)
    assert _tarama(["≈ 640.000 m³ sıyırma + 1.300.000 m³ kazı-dolgu"]) == {("siyirma_hacmi_m3", 640000)}
    assert _tarama(["sıyırma 100.000 + 20.400 = 120.400 m³"]) == set()
    assert _tarama(["30 cm nebati sıyırma"]) == set()


@pytest.fixture
def proje(tmp_path):
    k = tmp_path / "PROJE"
    E = "EK-11 DOKÜMANLAR"
    docx_yaz(k / E / "EK11-Liste.docx", ["Teklif Dosyasında Bulunması Gereken Dokümanlar",
                                         "Hafriyat Planı", "Drenaj Projesi", "Saha Yerleşim Planı"])
    docx_yaz(k / E / "10-Hafriyat Planı" / "Hafriyat_Plani_Rev05.docx",
             ["Hafriyat", "Nebati toprak sıyırma: 120.400 m³"])
    (k / E / "1-Saha Yerleşim Planı").mkdir(parents=True)
    (k / E / "1-Saha Yerleşim Planı" / "Yerlesim.dwg").write_bytes(b"AC1032")
    (k / E / "1-Saha Yerleşim Planı" / "Yerlesim.bak").write_bytes(b"x")
    (k / "EK-18 FORM").mkdir()
    (k / "EK-18 FORM" / "Degerlendirme.txt").write_text("Teklif toplam fiyatı 99.000.000 $", encoding="utf-8")
    yaml_yol = tmp_path / "p.yaml"
    yaml_yol.write_text(f"""ad: test-proje
klasor: '{k.as_posix()}'
alanlar:
  "{E}/10-Hafriyat Planı": hafriyat
  "{E}/1-Saha Yerleşim Planı": tasarim
  "{E}/EK11-Liste.docx": evrak
etiketler:
  "ek-18 form": ticari
gerekli_dokumanlar: "{E}/EK11-Liste.docx"
""", encoding="utf-8")
    p = proje_yukle(yaml_yol)
    yapi = yukle()
    return p, VeriDeposu(p.klasor, yapi, yapi.klasor_etiketleri, p.alanlar, p.etiketler)


def test_proje_eslemesi_alan_ve_ticari_etiket(proje):
    p, d = proje
    dosyalar = {b.dosya: b for b in d.dosyalar("hafriyat")}
    assert dosyalar["EK-11 DOKÜMANLAR/10-Hafriyat Planı/Hafriyat_Plani_Rev05.docx"].alan == "hafriyat"
    assert dosyalar["EK-11 DOKÜMANLAR/10-Hafriyat Planı/Hafriyat_Plani_Rev05.docx"].surum == "REV05"
    assert not any(x.endswith(".bak") for x in dosyalar)                 # yedek dosyalar yok sayılır
    assert not any(x.startswith("EK-18") for x in dosyalar)              # klasör adında "ticari" geçmese de
    assert any(b.dosya.startswith("EK-18") for b in d.dosyalar("teklif_maliyet"))


def test_word_satir_konumu_dogrulanir(proje):
    _, d = proje
    rel = "EK-11 DOKÜMANLAR/10-Hafriyat Planı/Hafriyat_Plani_Rev05.docx"
    assert "satır 2: Nebati toprak sıyırma: 120.400 m³" in d.oku("hafriyat", rel)
    assert d.kaynak_dogrula(rel, "satır 2", 120400)[0] == "dogrulandi"
    assert d.kaynak_dogrula(rel, "satır 1", 120400)[0] == "uyusmuyor"
    assert d.kaynak_dogrula(rel, "s.40", 120400)[0] == "dogrulanamadi"


def test_gerekli_dokuman_kontrolu(proje):
    p, d = proje
    kaynaklar, riskler, aksiyonlar = _gerekli_dokuman_kontrolu(AjanVeri(d, "evrak_takip", ["evrak"], p.gerekli_dokumanlar))
    metin = "\n".join(riskler)
    assert "EKSİK DOKÜMAN: 'Drenaj Projesi'" in metin
    assert "'Saha Yerleşim Planı': yalnızca DWG" in metin
    assert not any("'Hafriyat Planı'" in r for r in riskler)             # mevcut, okunur, revizyonlu
    assert kaynaklar[0]["dosya"].endswith("EK11-Liste.docx")
    assert any("Drenaj" in a["aciklama"] for a in aksiyonlar)
