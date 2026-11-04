"""Standart rapor formatı ve doğrulaması.

Her ajan üstüne bu formatta rapor verir. Format kodla doğrulanır; uymayan
rapor yönlendirici tarafından reddedilir (ajan düzeltip yeniden göndermeli).

  1. ozet                 Özet
  2. veri_kaynaklari      Veri kaynağı (dosya adı, sürüm, tarih)
  3. varsayimlar          Varsayımlar
  4. riskler              Riskler ve tutarsızlıklar
  5. onerilen_aksiyonlar  Önerilen aksiyon
  6. guven                Güven seviyesi (dusuk/orta/yuksek) ve nedeni
  +  sayisal_degerler     Raporda geçen her sayı ve kaynağı (izlenebilirlik)
"""
from __future__ import annotations

import json
import re

GUVEN_SEVIYELERI = ("dusuk", "orta", "yuksek")

# Aksiyon türleri. "oneri" dışındakilerin hepsi dış etkilidir ve insan onayı
# kapısından geçmeden asla yürütülmez (bkz. kapi.py).
AKSIYON_TURLERI = ("oneri", "siparis", "teklif_gonderme", "saha_talimati", "dis_sistem_yazma")
DIS_ETKILI_TURLER = frozenset(AKSIYON_TURLERI[1:])

# Ajan "oneri" dese bile metni dış etkili bir işi anlatıyorsa temkinli davranılır.
_DIS_ETKILI_IPUCU = re.compile(
    r"sipariş|siparis|satın al|satin al|teklif gönder|teklif gonder|talimat|ödeme yap|odeme yap"
    r"|sözleşme imza|sozlesme imza|e-?posta gönder|mail gönder|sisteme yaz|kaydı güncelle",
    re.IGNORECASE,
)

RAPOR_SEMASI: dict = {
    "type": "object",
    "required": ["ozet", "veri_kaynaklari", "varsayimlar", "riskler",
                 "onerilen_aksiyonlar", "guven", "sayisal_degerler"],
    "properties": {
        "ozet": {"type": "string", "description": "Kısa özet. Veri yoksa 'veri yok' yazın."},
        "veri_kaynaklari": {
            "type": "array",
            "description": "Kullanılan her dosya. Uydurma kaynak yazmayın.",
            "items": {"type": "object", "required": ["dosya", "surum", "tarih"],
                      "properties": {"dosya": {"type": "string"}, "surum": {"type": "string"},
                                     "tarih": {"type": "string", "description": "YYYY-MM-DD veya 'veri yok'"}}},
        },
        "varsayimlar": {"type": "array", "items": {"type": "string"}},
        "riskler": {"type": "array", "items": {"type": "string"},
                    "description": "Riskler ve tespit edilen tutarsızlıklar"},
        "onerilen_aksiyonlar": {
            "type": "array",
            "items": {"type": "object", "required": ["aciklama", "tur"],
                      "properties": {"aciklama": {"type": "string"},
                                     "tur": {"type": "string", "enum": list(AKSIYON_TURLERI)}}},
        },
        "guven": {"type": "object", "required": ["seviye", "neden"],
                  "properties": {"seviye": {"type": "string", "enum": list(GUVEN_SEVIYELERI)},
                                 "neden": {"type": "string"}}},
        "sayisal_degerler": {
            "type": "array",
            "description": "Raporda geçen her sayı. anahtar için config/capraz_anahtarlar.yaml listesini kullanın.",
            "items": {"type": "object", "required": ["anahtar", "deger", "birim", "kaynak_dosya", "kaynak_konum"],
                      "properties": {"anahtar": {"type": "string"},
                                     "deger": {"type": ["number", "null"], "description": "Bilinmiyorsa null"},
                                     "birim": {"type": "string"},
                                     "kaynak_dosya": {"type": "string"},
                                     "kaynak_konum": {"type": "string", "description": "sayfa/sekme/hücre"}}},
        },
    },
}


def _liste(d: dict, alan: str, h: list[str]) -> list:
    v = d.get(alan)
    if not isinstance(v, list):
        h.append(f"'{alan}' bir liste olmalı")
        return []
    return v


def aksiyon_dis_etkili_mi(aksiyon: dict) -> bool:
    return aksiyon.get("tur") in DIS_ETKILI_TURLER or bool(_DIS_ETKILI_IPUCU.search(aksiyon.get("aciklama", "")))


def rapor_hatalari(rapor) -> list[str]:
    """Rapor geçerliyse boş liste, değilse hata listesi döndürür."""
    if isinstance(rapor, str):
        try:
            rapor = json.loads(rapor)
        except json.JSONDecodeError:
            return ["rapor JSON değil"]
    if not isinstance(rapor, dict):
        return ["rapor bir nesne olmalı"]
    h: list[str] = []

    if not str(rapor.get("ozet") or "").strip():
        h.append("'ozet' boş olamaz (veri yoksa 'veri yok' yazılmalı)")

    kaynak_dosyalar = set()
    for i, k in enumerate(_liste(rapor, "veri_kaynaklari", h)):
        if not isinstance(k, dict) or not all(str(k.get(a) or "").strip() for a in ("dosya", "surum", "tarih")):
            h.append(f"veri_kaynaklari[{i}]: dosya, surum ve tarih dolu olmalı ('veri yok' yazılabilir)")
        else:
            kaynak_dosyalar.add(k["dosya"].strip())

    for alan in ("varsayimlar", "riskler"):
        for i, s in enumerate(_liste(rapor, alan, h)):
            if not isinstance(s, str):
                h.append(f"{alan}[{i}] metin olmalı")

    for i, a in enumerate(_liste(rapor, "onerilen_aksiyonlar", h)):
        if not isinstance(a, dict) or not str(a.get("aciklama") or "").strip():
            h.append(f"onerilen_aksiyonlar[{i}]: 'aciklama' dolu olmalı")
        elif a.get("tur") not in AKSIYON_TURLERI:
            h.append(f"onerilen_aksiyonlar[{i}]: 'tur' şunlardan biri olmalı: {', '.join(AKSIYON_TURLERI)}")

    g = rapor.get("guven")
    if not isinstance(g, dict) or g.get("seviye") not in GUVEN_SEVIYELERI or not str(g.get("neden") or "").strip():
        h.append("'guven' alanında seviye (dusuk/orta/yuksek) ve neden olmalı")
    elif not kaynak_dosyalar and g.get("seviye") != "dusuk":
        h.append("veri kaynağı gösterilmeyen raporun güven seviyesi 'dusuk' olmalı")

    for i, s in enumerate(_liste(rapor, "sayisal_degerler", h)):
        if not isinstance(s, dict) or not str(s.get("anahtar") or "").strip():
            h.append(f"sayisal_degerler[{i}]: 'anahtar' dolu olmalı")
            continue
        deger = s.get("deger")
        if deger is not None and (isinstance(deger, bool) or not isinstance(deger, (int, float))):
            h.append(f"sayisal_degerler[{i}] ({s['anahtar']}): 'deger' sayı veya null olmalı")
        if deger is not None:
            kd = str(s.get("kaynak_dosya") or "").strip()
            if not kd or not str(s.get("kaynak_konum") or "").strip():
                h.append(f"sayisal_degerler[{i}] ({s['anahtar']}): kaynak_dosya ve kaynak_konum zorunlu")
            elif kd not in kaynak_dosyalar:
                h.append(f"sayisal_degerler[{i}] ({s['anahtar']}): kaynak_dosya '{kd}' veri_kaynaklari listesinde yok")
    return h


def veri_yok_raporu(neden: str) -> dict:
    """Ajan devrede değilken veya veri bulunamadığında kullanılan dürüst boş rapor."""
    return {
        "ozet": f"veri yok — {neden}",
        "veri_kaynaklari": [],
        "varsayimlar": [],
        "riskler": [f"Bu kalem incelenemedi: {neden}"],
        "onerilen_aksiyonlar": [],
        "guven": {"seviye": "dusuk", "neden": neden},
        "sayisal_degerler": [],
    }
