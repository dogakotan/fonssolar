"""Deneme modunda, henüz devrede olmayan (taslak) ajanların verdiği ÖRNEK raporlar.

Yalnızca proje verisi verilmeden çalıştırıldığında (tanıtım) kullanılır: taslak
ajanlarda ve proje verisi olmayan devredeki uzmanlarda.
Bunlar gerçek proje verisi değildir; yalnızca akışı, çapraz kontrolü ve onay
kapısını göstermek içindir. Kasıtlı olarak bir tutarsızlık içerir:
tasarımdaki modül adedi (21.600) ile satın alma listesi (21.528) farklıdır.
"""
from __future__ import annotations


def _kaynak(dosya: str) -> dict:
    return {"dosya": dosya, "surum": "deneme", "tarih": "2026-11-04"}


ORNEKLER: dict[str, dict] = {
    "proje_tasarim": {
        "ozet": "[DENEME VERİSİ] Tasarım: 21.600 modül, 12,42 MWp DC. Kablo hendeği metrajı 8.450 m.",
        "veri_kaynaklari": [_kaynak("deneme/tasarim_ornek.xlsx"), _kaynak("deneme/hafriyat_ornek.xlsx")],
        "varsayimlar": ["Modül gücü 575 Wp kabul edildi (tasarım dosyası)"],
        "riskler": ["Hendek güzergâhı drenaj kanalını iki noktada kesiyor"],
        "onerilen_aksiyonlar": [{"aciklama": "Hendek güzergâhını drenaj planıyla birlikte revize et", "tur": "oneri"}],
        "guven": {"seviye": "orta", "neden": "Deneme verisi; tek revizyon incelendi"},
        "sayisal_degerler": [
            {"anahtar": "modul_adedi", "deger": 21600, "birim": "adet",
             "kaynak_dosya": "deneme/tasarim_ornek.xlsx", "kaynak_konum": "Yerleşim!C12"},
            {"anahtar": "dc_guc_mwp", "deger": 12.42, "birim": "MWp",
             "kaynak_dosya": "deneme/tasarim_ornek.xlsx", "kaynak_konum": "Özet!B4"},
            {"anahtar": "kablo_hendegi_m", "deger": 8450, "birim": "m",
             "kaynak_dosya": "deneme/hafriyat_ornek.xlsx", "kaynak_konum": "Hendek!F30"},
        ],
    },
    "satin_alma": {
        "ozet": "[DENEME VERİSİ] Satın alma listesinde 21.528 modül var; modül siparişi için en geç tarih yaklaşıyor.",
        "veri_kaynaklari": [_kaynak("deneme/satin_alma_listesi_ornek.xlsx")],
        "varsayimlar": ["Liste 2026-10-28 revizyonudur"],
        "riskler": ["Modül tedarik süresi 10 hafta; sipariş gecikirse montaj başlangıcı kayar"],
        "onerilen_aksiyonlar": [{"aciklama": "21.528 adet modül siparişi ver", "tur": "siparis"}],
        "guven": {"seviye": "orta", "neden": "Deneme verisi"},
        "sayisal_degerler": [
            {"anahtar": "modul_adedi", "deger": 21528, "birim": "adet",
             "kaynak_dosya": "deneme/satin_alma_listesi_ornek.xlsx", "kaynak_konum": "BOQ!D7"},
        ],
    },
    "elektrik_sefi": {
        "ozet": "[DENEME VERİSİ] Saha mobilizasyonu tamam; kablo hendeği kazısına başlanmadı.",
        "veri_kaynaklari": [_kaynak("deneme/gunluk_rapor_ornek.pdf")],
        "varsayimlar": [],
        "riskler": [],
        "onerilen_aksiyonlar": [],
        "guven": {"seviye": "orta", "neden": "Deneme verisi"},
        "sayisal_degerler": [
            {"anahtar": "kablo_hendegi_m", "deger": 8450, "birim": "m",
             "kaynak_dosya": "deneme/gunluk_rapor_ornek.pdf", "kaynak_konum": "s.2"},
        ],
    },
}
