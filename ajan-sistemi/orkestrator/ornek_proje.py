"""Sentetik örnek proje üretici ("Örnek GES"). Tamamen uydurma ve zararsız
veridir; yalnızca pilot akışını göstermek ve test etmek için kullanılır.

Kasıtlı olarak içerdiği bulgular:
- Kablo hendeği: metraj dosyasında 8.450 m, güzergâh dosyasında 8.120 m (çapraz kontrol yakalamalı)
- Evrak: yapı ruhsatı eksik, ENH izninin süresi dolmuş, İSG planı 30 gün içinde bitiyor
- zemin_etudu.pdf'ten metin çıkmaz, hafriyat_plani.dwg okunamaz (kapsam dışı olarak raporlanmalı)
- ticari/ klasöründeki birim fiyatlar proje ve saha kolu ajanlarına görünmemeli
- Depo: DC kablo 3.600 m ve topraklama şeridi 600 m eksik -> Proje Direktörü Ticari Direktör'e iletmeli
- Kalite: NCR-004 açık
- Satın alma planındaki modül adedi (21.528) tasarımdan (21.600) farklı
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path


def _kitap(sayfalar: dict[str, list[list]], yol: Path) -> None:
    from openpyxl import Workbook
    wb = Workbook()
    wb.remove(wb.active)
    for ad, satirlar in sayfalar.items():
        ws = wb.create_sheet(ad)
        for s in satirlar:
            ws.append(s)
    yol.parent.mkdir(parents=True, exist_ok=True)
    wb.save(yol)


def olustur(hedef: Path) -> Path:
    hedef = Path(hedef)
    bugun = date.today()
    (hedef).mkdir(parents=True, exist_ok=True)
    (hedef / "BENIOKU.txt").write_text(
        "Bu klasör SENTETİK örnek veridir (Örnek GES, 12,42 MWp). Gerçek proje verisi değildir.\n",
        encoding="utf-8")

    _kitap({
        "Özet": [["kazi_hacmi_m3", 48200, "m3"], ["dolgu_hacmi_m3", 45100, "m3"],
                 ["siyirma_hacmi_m3", 18600, "m3"], ["kablo_hendegi_m", 8450, "m"], ["saha_yolu_m", 3200, "m"]],
        "Detay": [["Kalem", "Bölge", "Miktar", "Birim"],
                  ["Kazı", "Blok A", 21400, "m3"], ["Kazı", "Blok B", 26800, "m3"],
                  ["Dolgu", "Blok A", 19900, "m3"], ["Dolgu", "Blok B", 25200, "m3"],
                  ["Kablo hendeği", "DC + AC", 8450, "m"]],
    }, hedef / "hafriyat" / "hafriyat_metraj_R2.xlsx")
    _kitap({
        "Özet": [["kablo_hendegi_m", 8120, "m"]],
        "Güzergâh": [["Hat", "Başlangıç", "Bitiş", "Uzunluk (m)"],
                     ["DC-1", "Blok A", "İnverter 1", 4010], ["DC-2", "Blok B", "İnverter 2", 3260],
                     ["AC", "İnverter", "Köşk", 850]],
    }, hedef / "hafriyat" / "kablo_guzergah_R1.xlsx")
    (hedef / "hafriyat" / "zemin_etudu.pdf").write_bytes(b"%PDF-1.4\n% sentetik, okunamaz\n")
    (hedef / "hafriyat" / "hafriyat_plani.dwg").write_bytes(b"AC1032 sentetik")

    _kitap({
        "Evrak": [["Evrak", "Revizyon", "Tarih", "Durum", "Geçerlilik Bitiş"],
                  ["ÇED Gerekli Değildir Kararı", "R0", bugun - timedelta(days=200), "Onaylı", None],
                  ["İmar Durumu", "R1", bugun - timedelta(days=150), "Onaylı", None],
                  ["Zemin Etüdü Raporu", "R1", bugun - timedelta(days=40), "Onay bekliyor", None],
                  ["Enerji Nakil Hattı İzni", "R0", bugun - timedelta(days=400), "Onaylı", bugun - timedelta(days=20)],
                  ["Yapı Ruhsatı", "", None, "Eksik", None],
                  ["İSG Planı", "R2", bugun - timedelta(days=60), "Onaylı", bugun + timedelta(days=15)]],
    }, hedef / "evrak" / "evrak_listesi_R4.xlsx")

    _kitap({"Özet": [["modul_adedi", 21600, "adet"], ["dc_guc_mwp", 12.42, "MWp"], ["inverter_adedi", 40, "adet"]]},
           hedef / "tasarim" / "tasarim_ozet_R3.xlsx")
    _kitap({"Özet": [["modul_birim_fiyat_usd", 61.5, "USD"]],
            "Birim Fiyat": [["Kalem", "Birim", "Birim Fiyat (USD)"], ["PV modül 575 Wp", "adet", 61.5],
                            ["Kazı", "m3", 3.2]]},
           hedef / "ticari" / "birim_fiyatlar_R1.xlsx")
    # --- saha kolu
    _kitap({"Stok": [["Malzeme", "Birim", "Stok", "İhtiyaç"], ["DC kablo 6 mm²", "m", 1200, 4800],
                     ["MC4 konnektör", "adet", 5000, 4000], ["Topraklama şeridi", "m", 300, 900]]},
           hedef / "depo" / "depo_stok_R1.xlsx")
    _kitap({"Özet": [["kablo_hendegi_acilan_m", 3200, "m"], ["inverter_montaj_adedi", 12, "adet"]]},
           hedef / "elektrik" / "elektrik_ilerleme_R1.xlsx")
    _kitap({"Özet": [["kazik_adedi", 9800, "adet"], ["modul_montaj_adedi", 6400, "adet"]]},
           hedef / "mekanik" / "montaj_ilerleme_R1.xlsx")
    _kitap({"Uygunsuzluk": [["No", "Konu", "Durum", "Önem"],
                            ["NCR-004", "Kazık gömme boyu eksik (Blok A, 14 kazık)", "Açık", "Yüksek"],
                            ["NCR-005", "Modül kelepçe torku kayıtsız", "Kapalı", "Orta"]]},
           hedef / "kalite" / "uygunsuzluk_R1.xlsx")
    # --- proje kolu: drenaj ve CCTV/tel çit
    _kitap({"Özet": [["drenaj_kanali_m", 7400, "m"], ["menfez_adedi", 14, "adet"], ["q50_debi_m3s", 1.85, "m3/s"]]},
           hedef / "drenaj" / "drenaj_projesi_R1.xlsx")
    _kitap({"Özet": [["tel_cit_m", 5200, "m"], ["kamera_adedi", 38, "adet"]]},
           hedef / "cctv" / "cctv_telcit_R2.xlsx")
    (hedef / "cctv" / "kamera_yerlesim.dwg").write_bytes(b"AC1032 sentetik")
    # --- ticari kol (etiketsiz satın alma planı; fiyat içermez)
    _kitap({"Özet": [["modul_adedi", 21528, "adet"]]}, hedef / "satin_alma" / "tedarik_plani_R2.xlsx")
    return hedef
