"""Komut satırı.

  python -m orkestrator dogrula                         yapılandırmayı kontrol eder
  python -m orkestrator tablo                           hiyerarşiyi ve modelleri gösterir
  python -m orkestrator talep "metin" [--proje klasör]  mühendis talebini işler, sunumu üretir
  python -m orkestrator ornek-proje [klasör]            sentetik örnek proje verisi üretir
  python -m orkestrator ornek-moveon                    sentetik Move On dışa aktarımı üretir
  python -m orkestrator moveon [--proje ad]             Move On dışa aktarımını (Lojistik'in gördüğü haliyle) gösterir
  python -m orkestrator kaynak <görev-no> <konu>        bir sayının nereden geldiğini gösterir
  python -m orkestrator bekleyenler                     insan onayı bekleyen dış etkili işlemler
  python -m orkestrator onayla <id> --onaylayan "Ad"    dış etkili işlemi onaylar
  python -m orkestrator reddet <id> --reddeden "Ad"     dış etkili işlemi reddeder
  python -m orkestrator yurut <id>                      onaylı işlemi yürütür
  python -m orkestrator kural-denemesi                  izin kurallarını API'siz gösterir
"""
from __future__ import annotations

import argparse
import json
import sys

from .akis import Orkestrator, sunum_bul
from .projeler import proje_yukle
from .kapi import OnayKapisi, OnaysizIslem
from .moveon import MoveOnHatasi
from .kayit import Kayitci
from .rapor import veri_yok_raporu
from .yapilandirma import KOK, MUHENDIS, YapilandirmaHatasi, yukle
from .yonlendirici import IzinReddi, Yonlendirici

RUNS = KOK / "runs"


def _utf8():
    for akis in (sys.stdout, sys.stderr):
        try:
            akis.reconfigure(encoding="utf-8")
        except AttributeError:
            pass


def dogrula_komutu(_):
    yapi = yukle()
    aktif = [a.gorunen_ad for a in yapi.ajanlar.values() if a.ham.get("durum") == "aktif"]
    print(f"Yapılandırma geçerli: {len(yapi.ajanlar)} ajan, {len(yapi.izinler)} izin satırı.")
    print(f"Devredeki ajanlar: {', '.join(aktif) or 'yok'}")
    print(f"Çalışma modu: {yapi.modeller.get('mod')}, bütçe: {yapi.modeller.get('calistirma_butcesi_usd')} USD/çalıştırma")


def tablo_komutu(_):
    yapi = yukle()
    cocuklar: dict[str, list[str]] = {}
    for a in yapi.ajanlar.values():
        cocuklar.setdefault(a.ust, []).append(a.ad)

    def yaz(ad: str, girinti: int):
        a = yapi.ajanlar.get(ad)
        if a:
            etiket = "devrede" if a.ham.get("durum") == "aktif" else "taslak"
            satir = f"- {a.gorunen_ad} ({ad})  [{yapi.model_ayari(ad).get('model')}, {etiket}]"
        else:
            satir = "- Mühendis (insan)"
        print("  " * girinti + satir)
        for c in cocuklar.get(ad, []):
            yaz(c, girinti + 1)

    yaz(MUHENDIS, 0)
    print("\nKesin yasaklar:", ", ".join(" <-> ".join(sorted(c)) for c in yapi.kesin_yasaklar))


def talep_komutu(args):
    yapi = yukle()
    proje = proje_yukle(args.proje) if args.proje else None
    ork = Orkestrator(yapi, RUNS, proje=proje)
    if proje:
        print(f"Proje: {proje.ad} ({proje.klasor})")
    print(f"Mod: {ork.mod}. Talep işleniyor...")
    s = ork.talep_isle(args.metin)
    print(f"Görev numarası: {s.gorev_no}")
    if s.durum != "sunuldu":
        print(f"SONUÇ YOK: {s.neden}")
        return 2
    print(f"Sunum hazır: {s.sunum_yolu}")
    print(f"Tahmini maliyet: {s.maliyet_usd:.4f} USD")
    if s.onay_bekleyenler:
        print("İnsan onayı bekleyen dış etkili işlemler: " + ", ".join(s.onay_bekleyenler))
    return 0


def ornek_moveon_komutu(args):
    from .moveon import ayar_yukle, ornek_disa_aktarim
    ayar = ayar_yukle()
    print(f"Sentetik Move On dışa aktarımı oluşturuldu: {ornek_disa_aktarim(ayar.klasor)}")


def moveon_komutu(args):
    from .moveon import MoveOnKaynagi, ayar_yukle
    ayar = ayar_yukle()
    k = MoveOnKaynagi(ayar)
    kaynak, satirlar, uyarilar = k.satirlar("lojistik", args.proje)
    print(f"Kaynak: {kaynak} (klasör: {ayar.klasor})")
    for u in uyarilar:
        print(f"UYARI: {u}")
    print(f"Okunan alanlar: {', '.join(sorted({a for s in satirlar for a in s}))}")
    for s in satirlar:
        print("  " + " | ".join(f"{a}={s[a]}" for a in s))


def ornek_proje_komutu(args):
    from .ornek_proje import olustur
    print(f"Sentetik örnek proje oluşturuldu: {olustur(args.hedef)}")


def kaynak_komutu(args):
    s = sunum_bul(RUNS, args.gorev_no)
    anahtar = args.konu.strip().lower()
    tum = [(r["hazirlayan"], r["rapor"]) for r in s["rapor_zinciri"]] + [("proje_direktoru", s["pd_raporu"])]
    izler: dict[tuple, list] = {}   # aynı değer + aynı kaynak -> taşıyan ajanlar zinciri
    for ajan, rapor in tum:
        surumler = {k["dosya"]: k for k in rapor["veri_kaynaklari"]}
        for v in rapor["sayisal_degerler"]:
            if v["anahtar"].lower() == anahtar:
                imza = (v["deger"], v["birim"], v.get("kaynak_dosya"), v.get("kaynak_konum"))
                izler.setdefault(imza, [surumler.get(v.get("kaynak_dosya"), {})]).append(ajan)
    bulundu = bool(izler)
    for (deger, birim, dosya, konum), (k, *ajanlar) in izler.items():
        print(f"- {deger if deger is not None else 'veri yok'} {birim}")
        print(f"    kaynak : {dosya} › {konum} (sürüm {k.get('surum', '?')}, tarih {k.get('tarih', '?')})")
        print(f"    zincir : {' → '.join(ajanlar)} → mühendis")
    if not bulundu:
        print(f"'{args.konu}' için kayıtlı değer yok.")
    for t in s["tutarsizliklar"]:
        if t["anahtar"] == anahtar:
            print(f"⚠️  TUTARSIZLIK: kaynaklar arasında fark var ({t['tur']}).")


def bekleyenler_komutu(_):
    liste = OnayKapisi(RUNS).liste("bekliyor")
    if not liste:
        print("Onay bekleyen işlem yok.")
    for k, v in liste.items():
        print(f"- {k} [{v['aksiyon']['tur']}] {v['aksiyon']['aciklama']}  (öneren: {v['oneren']})")


def onayla_komutu(args):
    t = OnayKapisi(RUNS).onayla(args.id, args.onaylayan, args.notu or "")
    print(f"ONAYLANDI: {args.id} — {t['karar_veren']}. Yürütmek için: python -m orkestrator yurut {args.id}")


def reddet_komutu(args):
    OnayKapisi(RUNS).reddet(args.id, args.reddeden, args.notu or "")
    print(f"REDDEDİLDİ: {args.id}")


def yurut_komutu(args):
    print(OnayKapisi(RUNS).yurut(args.id))


def kural_denemesi_komutu(_):
    """Kurallarda verilen örnek: sahadan 'kablo eksik' bilgisi Ticari Direktör'e
    ancak Proje Direktörü üzerinden ulaşabilir."""
    yapi = yukle()
    kayitci = Kayitci(RUNS)
    y = Yonlendirici(yapi, kayitci)
    g = kayitci.yeni_gorev_no()
    r = json.dumps(veri_yok_raporu("kural denemesi"), ensure_ascii=False)
    print(f"Görev numarası: {g}\n")
    adimlar = [
        ("saha_sefi", "saha_koordinatoru", "rapor", r, ()),
        ("saha_koordinatoru", "ticari_direktor", "gorev", "Kablo siparişi verin", ()),                 # YASAK
        ("saha_koordinatoru", "proje_direktoru", "rapor", r, ()),
        ("proje_direktoru", "ticari_direktor", "gorev", "DC kablo eksiği için tedarik önerisi hazırlayın", ()),
        ("hafriyat", "evrak_takip", "rapor", r, ()),                                                    # YASAK (yanal)
        ("hafriyat", "proje_muduru", "rapor", "hendek 8450 m", ()),                                    # YASAK (format)
        ("proje_direktoru", "proje_muduru", "gorev", "Birim fiyatlar ekte", ("ticari",)),             # YASAK (veri)
        ("proje_muduru", MUHENDIS, "sunum", "{}", ()),                                                  # YASAK (PD dışı)
    ]
    for gon, al, tur, icerik, et in adimlar:
        try:
            y.gonder(gon, al, tur, icerik, g, et)
            print(f"  İLETİLDİ    {gon:>18} -> {al:<18} [{tur}]")
        except IzinReddi as e:
            print(f"  REDDEDİLDİ  {gon:>18} -> {al:<18} [{tur}]  neden: {e.neden[:110]}")
    print(f"\nKayıtlar: {kayitci.kok}")


def main(argv=None):
    _utf8()
    p = argparse.ArgumentParser(prog="python -m orkestrator", description="Fons Solar ajan orkestratörü")
    alt = p.add_subparsers(dest="komut", required=True)
    alt.add_parser("dogrula").set_defaults(f=dogrula_komutu)
    alt.add_parser("tablo").set_defaults(f=tablo_komutu)
    t = alt.add_parser("talep"); t.add_argument("metin")
    t.add_argument("--proje", help="config/projeler/<ad>.yaml adı veya proje klasörü (ör. veri/ornek-ges)"); t.set_defaults(f=talep_komutu)
    op = alt.add_parser("ornek-proje"); op.add_argument("hedef", nargs="?", default=str(KOK / "veri" / "ornek-ges"))
    op.set_defaults(f=ornek_proje_komutu)
    alt.add_parser("ornek-moveon").set_defaults(f=ornek_moveon_komutu)
    mo = alt.add_parser("moveon"); mo.add_argument("--proje"); mo.set_defaults(f=moveon_komutu)
    k = alt.add_parser("kaynak"); k.add_argument("gorev_no"); k.add_argument("konu"); k.set_defaults(f=kaynak_komutu)
    alt.add_parser("bekleyenler").set_defaults(f=bekleyenler_komutu)
    o = alt.add_parser("onayla"); o.add_argument("id"); o.add_argument("--onaylayan", required=True)
    o.add_argument("--not", dest="notu"); o.set_defaults(f=onayla_komutu)
    r = alt.add_parser("reddet"); r.add_argument("id"); r.add_argument("--reddeden", required=True)
    r.add_argument("--not", dest="notu"); r.set_defaults(f=reddet_komutu)
    yy = alt.add_parser("yurut"); yy.add_argument("id"); yy.set_defaults(f=yurut_komutu)
    alt.add_parser("kural-denemesi").set_defaults(f=kural_denemesi_komutu)
    args = p.parse_args(argv)
    try:
        return args.f(args) or 0
    except (YapilandirmaHatasi, KeyError, ValueError, OnaysizIslem, FileNotFoundError, RuntimeError,
            MoveOnHatasi) as e:
        print(f"HATA: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
