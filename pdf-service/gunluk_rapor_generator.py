#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FONS SOLAR  —  Günlük Şantiye Raporu PDF Generator
===================================================
Excel şablonundan (fons-solar-gunluk-rapor.xlsx) veri okur,
DenizBank örneğindeki gibi profesyonel bir PDF raporu üretir.

Kullanım:
    python gunluk_rapor_generator.py rapor.xlsx
    python gunluk_rapor_generator.py rapor.xlsx --foto ./saha_fotograflari --cikti cikti.pdf
"""

import sys, os, argparse, glob, tempfile, urllib.request, urllib.parse, json
from datetime import datetime
from pathlib import Path

import openpyxl
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─── Font Kaydı (Türkçe karakter desteği — Windows + Linux) ──────────────────
def _find_font(name):
    candidates = {
        "regular": [
            "C:/Windows/Fonts/calibri.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/tahoma.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ],
        "bold": [
            "C:/Windows/Fonts/calibrib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/tahomabd.ttf",
            "C:/Windows/Fonts/segoeuib.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ],
        "italic": [
            "C:/Windows/Fonts/calibrii.ttf",
            "C:/Windows/Fonts/ariali.ttf",
            "C:/Windows/Fonts/segoeuii.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf",
        ],
    }
    for path in candidates.get(name, []):
        if os.path.exists(path):
            return path
    return None

def _register_fonts():
    r = _find_font("regular")
    b = _find_font("bold")
    i = _find_font("italic")
    if not r:
        raise FileNotFoundError("Türkçe destekli font bulunamadı.")
    pdfmetrics.registerFont(TTFont("FS",   r))
    pdfmetrics.registerFont(TTFont("FS-B", b or r))
    pdfmetrics.registerFont(TTFont("FS-I", i or r))
    pdfmetrics.registerFontFamily("FS", normal="FS", bold="FS-B", italic="FS-I")
    return "FS", "FS-B", "FS-I"

try:
    BASE_FONT, BASE_BOLD, BASE_ITAL = _register_fonts()
    print(f"Font: {_find_font('regular')}")
except Exception as e:
    print(f"Font yuklenemedi ({e}), Latin-1 modunda devam ediliyor.")
    BASE_FONT = "Helvetica"
    BASE_BOLD = "Helvetica-Bold"
    BASE_ITAL = "Helvetica-Oblique"

# ─── Renk Paleti ──────────────────────────────────────────────────────────────
NAVY       = colors.HexColor('#1F3864')
BLUE       = colors.HexColor('#2F5496')
MID_BLUE   = colors.HexColor('#4472C4')
LIGHT_BLUE = colors.HexColor('#BDD7EE')
XLIGHT     = colors.HexColor('#DEEAF1')
ROW_ALT    = colors.HexColor('#F2F7FC')
BORDER     = colors.HexColor('#8EA9C1')
CAT_BG     = colors.HexColor('#D6E4F0')
L_GRAY     = colors.HexColor('#F5F5F5')
WHITE      = colors.white
TEXT       = colors.HexColor('#1A1A1A')
GREEN      = colors.HexColor('#70AD47')
ORANGE     = colors.HexColor('#FF9900')
RED_C      = colors.HexColor('#C00000')

W, H   = A4
MARGIN = 12 * mm

# ─── Supabase Bağlantı Ayarları ───────────────────────────────────────────────
SUPABASE_URL    = "https://bshhgvdzemgfijkzhcrf.supabase.co"
SUPABASE_BUCKET = "saha-fotolari"
SUPABASE_ANON   = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzaGhndmR6ZW1nZmlqa3poY3JmIiwicm9sZSI"
    "6ImFub24iLCJpYXQiOjE3ODE0ODk5MTcsImV4cCI6MjA5NzA2NTkxN30"
    ".s--tDbXd_1VxWwoOQ5th5lmlSqrJJWjiFh2fVDbY57Y"
)


def fetch_supabase_photos(project_id: str, tarih: str) -> list:
    """
    Supabase daily_report_photos tablosundan verilen proje + tarih için
    fotoğraf URL'lerini çeker, dosyaları geçici klasöre indirir.
    tarih formatı: YYYY-MM-DD
    """
    endpoint = (
        f"{SUPABASE_URL}/rest/v1/daily_report_photos"
        f"?project_id=eq.{urllib.parse.quote(project_id)}"
        f"&report_date=eq.{tarih}"
        f"&select=storage_path,caption"
    )
    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey":        SUPABASE_ANON,
            "Authorization": f"Bearer {SUPABASE_ANON}",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            records = json.loads(resp.read().decode())
    except Exception as e:
        print(f"Supabase sorgusu basarisiz: {e}")
        return []

    if not records:
        print(f"  {project_id} / {tarih} icin fotograf bulunamadi.")
        return []

    tmp_dir = tempfile.mkdtemp(prefix="fons_foto_")
    paths   = []
    for i, rec in enumerate(records):
        sp   = rec.get("storage_path", "")
        url  = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{sp}"
        ext  = os.path.splitext(sp)[-1] or ".jpg"
        dest = os.path.join(tmp_dir, f"foto_{i:03d}{ext}")
        try:
            urllib.request.urlretrieve(url, dest)
            paths.append(dest)
        except Exception as e:
            print(f"  Indirilemedi: {sp} - {e}")

    return paths

# ─── Paragraph yardımcısı ─────────────────────────────────────────────────────
def ST(size=7, bold=False, color=TEXT, align=TA_LEFT):
    return ParagraphStyle(
        f"auto_{size}_{bold}_{id(color)}",
        fontName=BASE_BOLD if bold else BASE_FONT,
        fontSize=size, textColor=color,
        alignment=align,
        leading=size * 1.35,
        wordWrap='CJK',
        spaceAfter=0, spaceBefore=0,
    )

def P(text, size=7, bold=False, color=TEXT, align=TA_LEFT):
    return Paragraph(str(text) if text is not None else "", ST(size, bold, color, align))

def SP(n=2):
    return Spacer(1, n * mm)

def pct_color(pct_str):
    try:
        v = float(str(pct_str).replace('%','').replace(',','.').strip())
        if v >= 100: return GREEN
        if v >= 50:  return MID_BLUE
        if v >= 20:  return ORANGE
        return RED_C
    except Exception:
        return TEXT

# ─── Ortak tablo stili ────────────────────────────────────────────────────────
BASE_STYLE = [
    ('GRID',         (0, 0), (-1, -1), 0.3, BORDER),
    ('TOPPADDING',   (0, 0), (-1, -1), 2),
    ('BOTTOMPADDING',(0, 0), (-1, -1), 2),
    ('LEFTPADDING',  (0, 0), (-1, -1), 4),
    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
]

def col_hdr(*labels):
    return [P(l, 6.5, bold=True, color=WHITE, align=TA_CENTER) for l in labels]

def section_header(label, w=None):
    if w is None:
        w = W - 2 * MARGIN
    t = Table([[P(label, 7.5, bold=True, color=WHITE)]], colWidths=[w])
    t.setStyle(TableStyle(BASE_STYLE + [
        ('BACKGROUND', (0,0), (-1,-1), BLUE),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING',(0,0),(-1,-1), 4),
    ]))
    return t


# ─── Excel Okuyucu ────────────────────────────────────────────────────────────
class ExcelData:
    def __init__(self, path):
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb.active
        self._rows = list(ws.iter_rows(values_only=True))
        self._parse()

    def _c(self, row, col, default=""):
        """1-indexed hücre okuma"""
        try:
            v = self._rows[row - 1][col - 1]
            if v is None:
                return default
            if isinstance(v, float) and v == int(v):
                return int(v)
            return v
        except IndexError:
            return default

    def _parse(self):
        # Satir  5: Proje / Tarih / Rapor No / Hava / Olusturan
        # Satir  9-11: Personel
        # Satir 16-23: Ekipman
        # Satir 26-32: Bugun yapilan isler
        # Satir 35-41: Yarin yapilacak isler
        # Satir 45-81: Is kalemleri
        # Satir 86-92: Gelen malzeme
        # Satir 109-114: Notlar / ISG

        self.proje     = str(self._c(5,  2))
        tarih          = self._c(5,  5)
        self.tarih     = tarih.strftime("%d.%m.%Y") if hasattr(tarih,'strftime') else str(tarih)
        self.rapor_no  = str(self._c(5,  8))
        self.hava      = str(self._c(5, 10))
        self.olusturan = str(self._c(5, 12))

        keys = ['idari', 'mekanik', 'elektrik', 'yevmiyeci', 'diger']
        self.personel = {}
        for ri, role in enumerate(['muhendis', 'usta', 'isci'], start=9):
            self.personel[role] = {k: (self._c(ri, 4 + ci) or 0) for ci, k in enumerate(keys)}

        ekip_isimleri = [
            'Ekskavatör', 'Rok Delgi Makinesi', 'Kolon Çakım Makinesi',
            'Forklift', 'Vinç', 'JCB / Loder', 'Kamyon / Nakliye', 'Jeneratör',
        ]
        self.ekipman = []
        for i, isim in enumerate(ekip_isimleri):
            r = 16 + i
            self.ekipman.append({
                'isim':  isim,
                'adet':  self._c(r, 5),
                'durum': self._c(r, 6),
                'alan':  self._c(r, 7),
                'not':   self._c(r, 11),
            })

        self.bugun = [self._c(26 + i, 3) for i in range(7)]
        self.yarin = [self._c(35 + i, 3) for i in range(7)]

        self.e_data = []
        for r in range(46, 96):   # frontend row=46+index, max 50 kalem
            code   = self._c(r, 2)
            name   = self._c(r, 3)
            unit   = self._c(r, 4)
            hedef  = self._c(r, 5, 0)
            gunluk = self._c(r, 7, 0)
            kumul  = self._c(r, 8, 0)
            pct    = self._c(r, 9, 0)
            note   = self._c(r, 11)

            # Kod veya isim dolu olan her satırı oku (GES- ön eki şartı yok)
            if code and str(code).strip() and name and str(name).strip():
                try:
                    pv = float(str(pct).replace('%','').strip())
                    pct_str = f"%{int(pv * 100)}" if pv <= 1.0 else f"%{int(pv)}"
                except Exception:
                    pct_str = str(pct) if pct else "—"

                self.e_data.append({
                    'is_cat': False,
                    'code':   str(code),
                    'name':   str(name),
                    'unit':   str(unit)   if unit   else '',
                    'hedef':  hedef  or 0,
                    'gunluk': gunluk or 0,
                    'kumul':  kumul  or 0,
                    'pct':    pct_str,
                    'note':   str(note) if note else '',
                })
            elif name and '▶' in str(name):
                cat = str(name).replace('  ▶  ','').replace('▶','').strip()
                self.e_data.append({'is_cat': True, 'name': cat})

        self.malzeme = []
        for r in range(86, 93):
            ad = self._c(r, 3)
            if not ad:
                continue
            self.malzeme.append({
                'ad':        str(ad),
                'tedarikci': str(self._c(r, 4)),
                'miktar':    str(self._c(r, 5)),
                'birim':     str(self._c(r, 6)),
                'not':       str(self._c(r, 11)),
            })

        self.isg        = ""
        self.olaganDisi = ""
        self.diger_not  = ""
        self.hazirlayan = ""

        for r in range(109, 115):
            label = str(self._c(r, 2))
            val   = str(self._c(r, 3)) if self._c(r, 3) else ""
            if label == 'İSG':
                self.isg = val
            elif 'Olağandışı' in label:
                self.olaganDisi = val
            elif 'Diğer' in label:
                self.diger_not = val
            elif 'Hazırlayan' in label:
                self.hazirlayan = val


# ─── Üst / Alt Bilgi ─────────────────────────────────────────────────────────
class HeaderFooter:
    def __init__(self, d: ExcelData):
        self.proje    = d.proje or "PROJE ADI"
        self.tarih    = d.tarih
        self.rapor_no = d.rapor_no
        self.hava     = d.hava

    def __call__(self, canv, doc):
        canv.saveState()
        m = MARGIN

        bh = 30 * mm
        bw = W - 2 * m
        bx = m
        by = H - m - bh

        canv.setFillColor(NAVY)
        canv.roundRect(bx, by, bw, bh, 3, fill=1, stroke=0)

        canv.setFillColor(MID_BLUE)
        canv.roundRect(bx + 2*mm, by + 2*mm, 42*mm, bh - 4*mm, 2, fill=1, stroke=0)
        canv.setFillColor(WHITE)
        canv.setFont(BASE_BOLD, 12)
        canv.drawCentredString(bx + 23*mm, by + bh - 10*mm, "FONS SOLAR")
        canv.setFont(BASE_FONT, 7)
        canv.drawCentredString(bx + 23*mm, by + bh - 17*mm, "Santiye Yonetimi")

        canv.setFillColor(WHITE)
        canv.setFont(BASE_BOLD, 11)
        canv.drawCentredString(W/2, by + bh - 10*mm, "GUNLUK SANTIYE RAPORU")
        canv.setFont(BASE_FONT, 8)
        canv.drawCentredString(W/2, by + bh - 18*mm, str(self.proje))

        rx = W - m - 2*mm
        canv.setFont(BASE_BOLD, 7.5)
        canv.drawRightString(rx, by + bh - 9*mm,  f"TARIH: {self.tarih}")
        canv.drawRightString(rx, by + bh - 16*mm, f"RAPOR NO: {self.rapor_no}")
        canv.setFont(BASE_FONT, 7)
        canv.drawRightString(rx, by + bh - 23*mm, f"HAVA: {self.hava or '-'}")

        canv.setFillColor(NAVY)
        canv.rect(m, m - 2*mm, bw, 7*mm, fill=1, stroke=0)
        canv.setFillColor(WHITE)
        canv.setFont(BASE_FONT, 6)
        canv.drawString(m + 2*mm, m + 0.5*mm, str(self.proje))
        canv.drawRightString(W - m - 2*mm, m + 0.5*mm, f"Sayfa {doc.page}")

        canv.restoreState()


# ─── Tablo Oluşturucular ──────────────────────────────────────────────────────

def build_personnel_table(d: ExcelData):
    uw = W - 2 * MARGIN
    cw = [uw * f for f in [0.27, 0.12, 0.12, 0.12, 0.12, 0.12, 0.13]]

    header = col_hdr('Personel Tipi', 'Idari', 'Mekanik', 'Elektrik', 'Yevmiyeci', 'Diger', 'TOPLAM')

    def fmt(v):
        try:
            return str(int(v)) if v and int(v) > 0 else "—"
        except Exception:
            return str(v) if v else "—"

    rows = [header]
    labels = [
        ('muhendis', 'Muhendis / Tekniker'),
        ('usta',     'Usta / Teknisyen'),
        ('isci',     'Isci / Yardimci'),
    ]
    for key, label in labels:
        pd = d.personel.get(key, {})
        vals = [pd.get(k, 0) for k in ['idari','mekanik','elektrik','yevmiyeci','diger']]
        tot  = sum(v for v in vals if isinstance(v, (int, float)))
        rows.append(
            [P(label, 7, bold=True)] +
            [P(fmt(v), 7, align=TA_CENTER) for v in vals] +
            [P(fmt(tot), 7, bold=True, align=TA_CENTER)]
        )

    col_tots = [
        sum(d.personel.get(role,{}).get(k,0) or 0 for role in ['muhendis','usta','isci'])
        for k in ['idari','mekanik','elektrik','yevmiyeci','diger']
    ]
    grand = sum(col_tots)
    rows.append(
        [P("TOPLAM", 7, bold=True)] +
        [P(fmt(v), 7, bold=True, align=TA_CENTER) for v in col_tots] +
        [P(fmt(grand), 7, bold=True, align=TA_CENTER)]
    )

    t = Table(rows, colWidths=cw)
    t.setStyle(TableStyle(BASE_STYLE + [
        ('BACKGROUND',    (0, 0), (-1, 0), MID_BLUE),
        ('BACKGROUND',    (0,-1), (-1,-1), LIGHT_BLUE),
        ('ROWBACKGROUNDS',(0, 1), (-1,-2), [WHITE, ROW_ALT]),
        ('FONTNAME',      (0,-1), (-1,-1), BASE_BOLD),
    ]))
    return t


def build_equipment_table(d: ExcelData):
    uw = W - 2 * MARGIN
    cw = [uw * f for f in [0.30, 0.08, 0.15, 0.26, 0.21]]
    rows = [col_hdr('Ekipman', 'Adet', 'Durum', 'Kullanim Alani', 'Not')]

    # Sadece o gun kullanilan ekipmanlar (adet > 0)
    aktif = [e for e in d.ekipman if e['adet'] and str(e['adet']).strip() not in ('', '0')]

    if not aktif:
        rows.append([
            P("—", 7, align=TA_CENTER),
            P("", 7), P("", 7),
            P("Bugun aktif ekipman bulunmamaktadir.", 7, color=colors.gray),
            P("", 7),
        ])
    else:
        for e in aktif:
            rows.append([
                P(e['isim'], 7, bold=True),
                P(str(e['adet']), 7, align=TA_CENTER),
                P(str(e['durum']) if e['durum'] else "—", 7, align=TA_CENTER),
                P(str(e['alan'])  if e['alan']  else "—", 7),
                P(str(e['not'])   if e['not']   else "",  7),
            ])
    t = Table(rows, colWidths=cw)
    t.setStyle(TableStyle(BASE_STYLE + [
        ('BACKGROUND',    (0, 0), (-1, 0), MID_BLUE),
        ('ROWBACKGROUNDS',(0, 1), (-1,-1), [WHITE, ROW_ALT]),
    ]))
    return t


def build_today_tomorrow(d):
    """Bugun / Yarin listelerini yan yana iki sutunda gosterir."""
    uw  = W - 2 * MARGIN
    gap = 4 * mm
    hw  = (uw - gap) / 2   # her yarinin genisligi

    def make_list(items, title):
        hdr_t = Table(
            [[P(title, 7.5, bold=True, color=WHITE)]],
            colWidths=[hw]
        )
        hdr_t.setStyle(TableStyle(BASE_STYLE + [
            ('BACKGROUND',    (0,0),(-1,-1), BLUE),
            ('TOPPADDING',    (0,0),(-1,-1), 4),
            ('BOTTOMPADDING', (0,0),(-1,-1), 4),
        ]))
        rows = [col_hdr('#', 'Aciklama')]
        for i, item in enumerate(items):
            rows.append([
                P(str(i+1), 7, align=TA_CENTER),
                P(str(item) if item else "", 7),
            ])
        body = Table(rows, colWidths=[hw * 0.07, hw * 0.93])
        body.setStyle(TableStyle(BASE_STYLE + [
            ('BACKGROUND',    (0,0),(-1,0), MID_BLUE),
            ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE, ROW_ALT]),
        ]))
        return [hdr_t, body]

    left  = make_list(d.bugun, "C   BUGUN YAPILAN ISLER")
    right = make_list(d.yarin, "D   YARIN YAPILACAK ISLER")

    # Iki sutunu ayni satirda Table icerisinde birlestir
    wrapper = Table(
        [[left, right]],
        colWidths=[hw, hw],
        hAlign='LEFT',
        spaceAfter=0,
    )
    wrapper.setStyle(TableStyle([
        ('LEFTPADDING',  (0,0),(-1,-1), 0),
        ('RIGHTPADDING', (0,0),(-1,-1), 0),
        ('TOPPADDING',   (0,0),(-1,-1), 0),
        ('BOTTOMPADDING',(0,0),(-1,-1), 0),
        ('LEFTPADDING',  (1,0),(1,0), int(gap)),
    ]))
    return wrapper


def build_progress_table(d: ExcelData):
    """
    Sadece o gun gunluk ilerleme > 0 olan kalemleri gosterir.
    """
    uw = W - 2 * MARGIN
    cw = [uw * f for f in [0.04, 0.33, 0.07, 0.08, 0.10, 0.10, 0.09, 0.19]]

    progressed = [item for item in d.e_data
                  if not item['is_cat'] and item.get('gunluk', 0) not in (0, '', None)]

    rows = [col_hdr('#', 'Is Kalemi', 'Birim', 'Hedef', 'Gunluk\nIlerleme', 'Kumulatif', 'Ilerleme %', 'Aciklama')]
    ts   = list(BASE_STYLE) + [('BACKGROUND', (0, 0), (-1, 0), MID_BLUE)]
    ri   = 1

    if not progressed:
        rows.append([
            P("—", 7, align=TA_CENTER),
            P("Bugun icin ilerleme kaydedilmemistir.", 7, color=colors.gray),
            P(""), P(""), P(""), P(""), P(""), P("")
        ])
        ts += [('SPAN', (1, 1), (7, 1)), ('BACKGROUND', (0, 1), (-1, 1), L_GRAY)]
        ri += 1
    else:
        last_cat = None
        idx = 1
        for item in d.e_data:
            if item['is_cat']:
                last_cat = item['name']
                continue
            if item.get('gunluk', 0) in (0, '', None):
                continue
            if last_cat is not None:
                rows.append([P(f"   {last_cat}", 7, bold=True, color=NAVY)] + [""] * 7)
                ts += [
                    ('SPAN',          (0, ri), (7, ri)),
                    ('BACKGROUND',    (0, ri), (-1, ri), CAT_BG),
                    ('TOPPADDING',    (0, ri), (-1, ri), 3),
                    ('BOTTOMPADDING', (0, ri), (-1, ri), 3),
                ]
                ri += 1
                last_cat = None

            pc = item['pct']
            bg = WHITE if ri % 2 == 0 else ROW_ALT
            ts.append(('BACKGROUND', (0, ri), (-1, ri), bg))
            rows.append([
                P(str(idx), 7, align=TA_CENTER),
                P(item['name'], 7),
                P(item['unit'], 7, align=TA_CENTER),
                P(str(item['hedef']),  7, align=TA_CENTER),
                P(str(item['gunluk']), 7, bold=True, align=TA_CENTER),
                P(str(item['kumul']),  7, align=TA_CENTER),
                P(pc, 7, bold=True, color=pct_color(pc), align=TA_CENTER),
                P(item['note'], 6.5),
            ])
            idx += 1
            ri += 1

        total_gunluk = sum(
            (item.get('gunluk', 0) or 0) for item in d.e_data
            if not item['is_cat'] and isinstance(item.get('gunluk'), (int, float))
        )
        rows.append([
            P(""),
            P("GUNLUK TOPLAM ILERLEME", 7, bold=True),
            P(""), P(""),
            P(str(total_gunluk), 7, bold=True, align=TA_CENTER),
            P(""), P(""), P("")
        ])
        ts += [
            ('BACKGROUND',   (0, ri), (-1, ri), LIGHT_BLUE),
            ('FONTNAME',     (0, ri), (-1, ri), BASE_BOLD),
            ('TOPPADDING',   (0, ri), (-1, ri), 4),
            ('BOTTOMPADDING',(0, ri), (-1, ri), 4),
        ]

    t = Table(rows, colWidths=cw)
    t.setStyle(TableStyle(ts))
    return t


def build_notes_block(d: ExcelData):
    uw = W - 2 * MARGIN
    rows = [
        [P("ISG (Is Sagligi & Guvenligi)", 7, bold=True, color=NAVY),
         P(d.isg or "Rutin kontrol ve tedbirlerle calismalara devam edilmistir.", 7)],
        [P("Olagandisi Olay / Santiye Ziyaretleri", 7, bold=True, color=NAVY),
         P(d.olaganDisi or "Olagan disi bir olay yasanmamistir.", 7)],
        [P("Diger Notlar", 7, bold=True, color=NAVY),
         P(d.diger_not or "—", 7)],
    ]
    t = Table(rows, colWidths=[uw*0.30, uw*0.70])
    t.setStyle(TableStyle(BASE_STYLE + [
        ('BACKGROUND',    (0, 0), (0, -1), XLIGHT),
        ('ROWBACKGROUNDS',(1, 0), (1, -1), [WHITE, ROW_ALT, WHITE]),
        ('TOPPADDING',    (0, 0), (-1,-1), 4),
        ('BOTTOMPADDING', (0, 0), (-1,-1), 4),
    ]))
    return t


def build_signature_row(d: ExcelData):
    uw = W - 2 * MARGIN
    t = Table(
        [[
            P("Raporu Hazirlayan:", 7, bold=True),
            P(str(d.hazirlayan) if d.hazirlayan else str(d.olusturan), 7),
            P("Tarih:", 7, bold=True),
            P(d.tarih, 7),
            P("Imza / Onay:", 7, bold=True),
            P("", 7),
        ]],
        colWidths=[uw*0.18, uw*0.22, uw*0.08, uw*0.14, uw*0.15, uw*0.23]
    )
    t.setStyle(TableStyle(BASE_STYLE + [
        ('BACKGROUND', (0,0), (0,0), XLIGHT),
        ('BACKGROUND', (2,0), (2,0), XLIGHT),
        ('BACKGROUND', (4,0), (4,0), XLIGHT),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0),(-1,-1), 5),
        ('ROWHEIGHT',  (0,0), (-1,-1), 10*mm),
    ]))
    return t


# ─── Fotograf Sayfasi ─────────────────────────────────────────────────────────

def build_photo_story(foto_dir, hazirlayan, photo_paths=None):
    story  = []
    uw     = W - 2 * MARGIN

    story.append(section_header("G   SAHA FOTOGRAFLARI"))

    story.append(SP(3))

    photos = []
    if photo_paths:
        photos = photo_paths
    elif foto_dir and os.path.isdir(foto_dir):
        for f in sorted(os.listdir(foto_dir)):
            if f.lower().endswith(('.jpg','.jpeg','.png')):
                photos.append(os.path.join(foto_dir, f))

    img_w = (uw - 2 * 2 * mm) / 3
    img_h = img_w * 0.72

    if not photos:
        story.append(Paragraph(
            "Fotograf bulunamadi. Supabase'e fotograf yuklediginden emin olun.",
            ParagraphStyle('nophoto', fontName=BASE_ITAL, fontSize=8,
                           textColor=colors.gray, alignment=TA_CENTER, leading=13)
        ))
        rows = []
        for ri in range(2):
            row = []
            for ci in range(3):
                row.append(P(f"Fotograf {ri*3+ci+1}", 8, color=colors.lightgrey, align=TA_CENTER))
            rows.append(row)
        ph = Table(rows, colWidths=[img_w]*3, rowHeights=[img_h]*2)
        ph.setStyle(TableStyle([
            ('GRID',           (0,0),(-1,-1), 0.5, BORDER),
            ('BACKGROUND',     (0,0),(-1,-1), L_GRAY),
            ('VALIGN',         (0,0),(-1,-1), 'MIDDLE'),
            ('ALIGN',          (0,0),(-1,-1), 'CENTER'),
            ('TOPPADDING',     (0,0),(-1,-1), 4),
            ('BOTTOMPADDING',  (0,0),(-1,-1), 4),
        ]))
        story.append(ph)
    else:
        rows = []
        row  = []
        for photo in photos:
            try:
                img = Image(photo, width=img_w, height=img_h, kind='proportional')
            except Exception:
                img = P(f"[ {os.path.basename(photo)} ]", 7, color=RED_C, align=TA_CENTER)
            row.append(img)
            if len(row) == 3:
                rows.append(row)
                row = []
        if row:
            while len(row) < 3:
                row.append(P(""))
            rows.append(row)
        ph = Table(rows, colWidths=[img_w]*3, rowHeights=[img_h]*len(rows))
        ph.setStyle(TableStyle([
            ('GRID',          (0,0),(-1,-1), 0.5, BORDER),
            ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
            ('ALIGN',         (0,0),(-1,-1), 'CENTER'),
            ('TOPPADDING',    (0,0),(-1,-1), 2),
            ('BOTTOMPADDING', (0,0),(-1,-1), 2),
            ('LEFTPADDING',   (0,0),(-1,-1), 2),
            ('RIGHTPADDING',  (0,0),(-1,-1), 2),
        ]))
        story.append(ph)

    story.append(SP(4))
    story.append(Table(
        [[P(f"Raporu Hazirlayan:  {hazirlayan}", 8, bold=True, color=NAVY, align=TA_RIGHT)]],
        colWidths=[uw]
    ))
    return story


# ─── Ana PDF Olusturucu ───────────────────────────────────────────────────────

def generate_pdf(excel_path: str, foto_dir: str = None, output_path: str = None,
                 proje_id: str = None, tarih: str = None) -> str:
    print(f"\n  Excel okunuyor: {excel_path}")
    d = ExcelData(excel_path)

    if not output_path:
        stem = Path(excel_path).stem
        output_path = str(Path(excel_path).parent / f"{stem}_RAPOR.pdf")

    if not tarih:
        tarih = d.tarih
        try:
            tarih_api = datetime.strptime(tarih, "%d.%m.%Y").strftime("%Y-%m-%d")
        except Exception:
            tarih_api = datetime.today().strftime("%Y-%m-%d")
    else:
        tarih_api = tarih

    supabase_photos = []
    if proje_id:
        print(f"  Supabase'den fotograflar cekiliyor: {proje_id} / {tarih_api}")
        supabase_photos = fetch_supabase_photos(proje_id, tarih_api)

    if not supabase_photos and not foto_dir:
        base = Path(excel_path).parent
        for name in ['saha_fotograflari', 'fotograflar', 'photos', 'foto', 'images']:
            p = base / name
            if p.is_dir():
                foto_dir = str(p)
                print(f"  Yerel fotograf klasoru: {foto_dir}")
                break

    hf  = HeaderFooter(d)
    TOP = MARGIN + 32 * mm
    BOT = MARGIN + 10 * mm

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        topMargin=TOP, bottomMargin=BOT,
        leftMargin=MARGIN, rightMargin=MARGIN,
    )

    story = []

    story.append(section_header("A   PERSONEL DURUMU"))
    story.append(SP(1))
    story.append(build_personnel_table(d))
    story.append(SP(3))

    story.append(section_header("B   IS MAKINALARI VE EKIPMAN"))
    story.append(SP(1))
    story.append(build_equipment_table(d))
    story.append(SP(3))

    story.append(build_today_tomorrow(d))
    story.append(SP(3))

    story.append(section_header("E   BUGUN ILERLEYEN IS KALEMLERI"))
    story.append(SP(1))
    story.append(build_progress_table(d))
    story.append(SP(3))

    story.append(section_header("F   NOTLAR / ISG / OLAGANDISI OLAYLAR"))
    story.append(SP(1))
    story.append(build_notes_block(d))
    story.append(SP(3))

    story.append(build_signature_row(d))

    story.append(PageBreak())
    story.extend(build_photo_story(
        foto_dir,
        d.hazirlayan or d.olusturan,
        photo_paths=supabase_photos or None,
    ))

    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"  PDF olusturuldu: {output_path}")
    return output_path


# ─── CLI Arayuzu ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description='FONS SOLAR Gunluk Santiye Raporu – PDF Generator',
        epilog='Ornek: python gunluk_rapor_generator.py rapor.xlsx --foto ./fotograflar'
    )
    ap.add_argument('excel',    help='Excel rapor dosyasi (.xlsx)')
    ap.add_argument('--foto',   help='Yerel saha fotograflari klasoru', default=None)
    ap.add_argument('--cikti',  help='Cikti PDF yolu', default=None)
    ap.add_argument('--proje',  help='Supabase proje ID (ornek: test-izmir-ges-2026)', default=None)
    ap.add_argument('--tarih',  help='Fotograf tarihi YYYY-MM-DD', default=None)
    args = ap.parse_args()
    generate_pdf(args.excel, args.foto, args.cikti, args.proje, args.tarih)
