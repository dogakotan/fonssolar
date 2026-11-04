"""Mühendise sunum: yapı, doğrulama ve Markdown çıktısı.

Sunumu yalnızca Proje Direktörü'nün `muhendise_sun` aracı oluşturabilir.
Orkestratör sunuma kendi çapraz kontrol sonucunu ve görevin tüm rapor
zincirini ekler; Proje Direktörü bunları çıkaramaz.
"""
from __future__ import annotations

import json

from .rapor import aksiyon_dis_etkili_mi, rapor_hatalari

KARARLAR = {"devam": "Devam", "kosullu_devam": "Koşullu devam", "durdur": "Durdur"}
GUVEN_AD = {"dusuk": "Düşük", "orta": "Orta", "yuksek": "Yüksek"}


def sunum_hatalari(sunum, gonderen: str) -> list[str]:
    if isinstance(sunum, str):
        try:
            sunum = json.loads(sunum)
        except json.JSONDecodeError:
            return ["sunum JSON değil"]
    h: list[str] = []
    onay = sunum.get("pd_onayi") or {}
    if onay.get("onaylayan") != "proje_direktoru" or gonderen != "proje_direktoru" or not onay.get("zaman"):
        h.append("Proje Direktörü onayı yok: mühendise yalnızca Proje Direktörü'nün onayladığı çıktı gider")
    if sunum.get("karar") not in KARARLAR:
        h.append(f"karar şunlardan biri olmalı: {', '.join(KARARLAR)}")
    if not str(sunum.get("karar_gerekcesi") or "").strip():
        h.append("karar gerekçesi boş olamaz")
    if not isinstance(sunum.get("tutarsizliklar"), list):
        h.append("çapraz kontrol sonucu eksik")
    if not isinstance(sunum.get("rapor_zinciri"), list):
        h.append("rapor zinciri eksik")
    h += [f"Proje Direktörü raporu: {x}" for x in rapor_hatalari(sunum.get("pd_raporu"))]
    return h


def dis_etkili_aksiyonlar(sunum: dict) -> list[tuple[str, str, dict]]:
    """(aksiyon_id, oneren_ajan, aksiyon) — sunumdaki tüm dış etkili aksiyonlar."""
    sonuc = []
    adaylar = [("proje_direktoru", a) for a in sunum["pd_raporu"].get("onerilen_aksiyonlar", [])]
    for r in sunum.get("rapor_zinciri", []):
        adaylar += [(r["hazirlayan"], a) for a in r["rapor"].get("onerilen_aksiyonlar", [])]
    for ajan, a in adaylar:
        if aksiyon_dis_etkili_mi(a):
            sonuc.append((f"{sunum['gorev_no']}-A{len(sonuc) + 1}", ajan, a))
    return sonuc


def _tablo(basliklar: list[str], satirlar: list[list]) -> str:
    def h(x):
        return str(x).replace("|", "\\|").replace("\n", " ")
    out = ["| " + " | ".join(basliklar) + " |", "|" + "---|" * len(basliklar)]
    out += ["| " + " | ".join(h(c) for c in s) + " |" for s in satirlar]
    return "\n".join(out)


def _kisa(yol: str) -> str:
    """Tablolarda uzun klasör yollarını kısalt (tam yol JSON'da ve `kaynak` komutunda durur)."""
    p = str(yol or "").split("/")
    return "…/" + "/".join(p[-2:]) if len(p) > 2 else str(yol or "")


def _sayi(x) -> str:
    if x is None:
        return "veri yok"
    return f"{x:,.2f}".rstrip("0").rstrip(".").replace(",", "X").replace(".", ",").replace("X", ".")


def markdown(sunum: dict, gorunen_ad: dict[str, str]) -> str:
    ad = lambda k: gorunen_ad.get(k, k)  # noqa: E731
    pd = sunum["pd_raporu"]
    s: list[str] = [f"# Mühendis Sunumu — {sunum['gorev_no']}", ""]
    if sunum.get("mod") == "deneme" and sunum.get("proje"):
        s += [f"> **DENEME MODU** (proje: `{sunum['proje']}`): Raporlar model kullanılmadan, dosyaların 'Özet' "
              "sayfaları ve kurallı kontrollerle üretildi; teknik yorum içermez.", ""]
    elif sunum.get("mod") == "deneme":
        s += ["> **DENEME MODU:** Bu sunumdaki raporlar örnek veridir, gerçek proje verisi değildir.", ""]
    s += [f"> Proje Direktörü onayından geçti ({sunum['pd_onayi']['zaman']}). "
          "Bu bir **öneridir**; nihai karar mühendisindir.", "",
          f"**Talep:** {sunum.get('talep', '')}", "",
          f"## Karar önerisi: {KARARLAR[sunum['karar']]}", "", sunum["karar_gerekcesi"], ""]
    if sunum.get("kosullar"):
        s += ["Koşullar:", *[f"- {k}" for k in sunum["kosullar"]], ""]

    t = sunum["tutarsizliklar"]
    s += [f"## ⚠️ Tutarsızlıklar (otomatik çapraz kontrol): {len(t)} adet", ""]
    if t:
        satir = []
        for x in t:
            for g in x["gozlemler"]:
                fark = f"%{_sayi(x['fark_yuzde'])}" if x["tur"] == "deger" else "BİRİM FARKLI"
                satir.append([f"**{x['anahtar']}**", fark, ad(g["ajan"]), f"{_sayi(g['deger'])} {g['birim']}",
                              f"{_kisa(g['kaynak_dosya'])} › {g['kaynak_konum']}"])
        s += [_tablo(["Konu", "Fark", "Kaynak ajan", "Değer", "Dosya › konum"], satir), ""]
    else:
        s += ["Karşılaştırılabilen değerlerde tutarsızlık bulunmadı.", ""]

    s += ["## Proje Direktörü özeti", "", pd["ozet"], "",
          f"**Güven:** {GUVEN_AD[pd['guven']['seviye']]} — {pd['guven']['neden']}", ""]
    if pd.get("riskler"):
        s += ["**Riskler:**", *[f"- {r}" for r in pd["riskler"]], ""]

    tum = [(r["hazirlayan"], r["rapor"]) for r in sunum["rapor_zinciri"]] + [("proje_direktoru", pd)]
    dogrulama = {(d["anahtar"], d["deger"], d["kaynak_dosya"], d["kaynak_konum"]): d["durum"]
                 for d in sunum.get("kaynak_dogrulama") or []}
    simge = {"dogrulandi": "✓ kaynakta doğrulandı", "dogrulanamadi": "– doğrulanamadı"}
    sayilar, gorulen = [], set()
    for a, r in tum:   # üst ajanların taşıdığı aynı değer tekrar yazılmaz; ilk kaynak (uzman) gösterilir
        for v in r.get("sayisal_degerler", []):
            imza = (v["anahtar"], v["deger"], v.get("kaynak_dosya"), v.get("kaynak_konum"))
            if imza not in gorulen:
                gorulen.add(imza)
                sayilar.append([ad(a), v["anahtar"], f"{_sayi(v['deger'])} {v['birim']}",
                                _kisa(v.get("kaynak_dosya", "")), v.get("kaynak_konum", ""),
                                simge.get(dogrulama.get(imza), "– doğrulanamadı")])
    s += ["## Sayısal değerler ve kaynakları", ""]
    s += [_tablo(["İlk raporlayan", "Konu", "Değer", "Dosya", "Konum", "Kaynak kontrolü"], sayilar) if sayilar else "Sayısal değer yok.", ""]
    s += [f"Bir değerin izini sürmek için: `python -m orkestrator kaynak {sunum['gorev_no']} <konu>`", ""]

    aks = dis_etkili_aksiyonlar(sunum)
    s += ["## Önerilen aksiyonlar", ""]
    ids = {id(a): i for i, _, a in aks}
    for ajan, r in tum:
        for a in r.get("onerilen_aksiyonlar", []):
            if id(a) in ids:
                s.append(f"- ⛔ **[{ids[id(a)]}] {a['aciklama']}** ({ad(ajan)}) — dış etkili, insan onayı olmadan "
                         f"yürütülmez: `python -m orkestrator onayla {ids[id(a)]} --onaylayan \"Ad Soyad\"`")
            else:
                s.append(f"- {a['aciklama']} ({ad(ajan)})")
    if not any(r.get("onerilen_aksiyonlar") for _, r in tum):
        s.append("Önerilen aksiyon yok.")
    s.append("")

    s += ["## Rapor zinciri", ""]
    for r in sunum["rapor_zinciri"]:
        rp = r["rapor"]
        s += [f"### {ad(r['hazirlayan'])} → {ad(r['alici'])} ({r['zaman']})", "", rp["ozet"], "",
              f"- **Güven:** {GUVEN_AD[rp['guven']['seviye']]} — {rp['guven']['neden']}"]
        if rp["veri_kaynaklari"]:
            s.append("- **Veri kaynakları:** " + "; ".join(
                f"{k['dosya']} (sürüm {k['surum']}, {k['tarih']})" for k in rp["veri_kaynaklari"]))
        else:
            s.append("- **Veri kaynakları:** veri yok")
        if rp["varsayimlar"]:
            s.append("- **Varsayımlar:** " + "; ".join(rp["varsayimlar"]))
        if rp["riskler"]:
            s.append("- **Riskler ve tutarsızlıklar:** " + "; ".join(rp["riskler"]))
        s.append("")
    s += ["---", f"Çalışma modu: {sunum.get('mod')} · Tahmini maliyet: {sunum.get('maliyet_usd', 0):.4f} USD"]
    return "\n".join(s) + "\n"
