import { CANONICAL_CATEGORY_WEIGHTS, TASK_CAT_TO_LABEL } from "./mapping.ts";

const NAVY = "FF1B3A6B", BLUE = "FF2563EB", HEADTXT = "FFFFFFFF", INPUT = "FFEFF4FB";
const LOCKED = "FFF1F3F5";
const THIN = { style: "thin", color: { argb: "FFB8C4D9" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const N = 304;

const CAT_TASK = "Mobilizasyon,Kolon Montajı,Kiriş Montajı,Aşık Montajı,Panel Montajı,Elektrik DC,Elektrik AC,Elektrik OG,Köşk Trafo,Topraklama,ENH,Devreye Alma,Evrak Süreci,Satın Alma,Mekanik";
const ST_TASK = "beklemede,devam_ediyor,tamamlandi,askida,iptal";
const CAT_BUDGET = "panel,inverter,mekanik,elektrik_dc,elektrik_ac,elektrik_og,enh,altyapi,iscilik,izin,denetim,diger";
const ST_RISK = "açık,azaltıldı,kabul_edildi,kapatıldı";
const CAT_RISK = "İş Kalemi,Satın Alma,Diğer";
const CAT_BOM = "Mekanik,Elektrik,İnşaat,İSG,Genel";
const PRIO_BOM = "kritik,önemli,normal";
const YN = "Evet,Hayır";

function band(ws, title, subtitle, span) {
  ws.mergeCells(1, 1, 1, span);
  ws.mergeCells(2, 1, 2, span);
  const t = ws.getCell(1, 1);
  t.value = "  FONS SOLAR   |   " + title;
  t.font = { bold: true, size: 14, color: { argb: HEADTXT } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 10, italic: true, color: { argb: HEADTXT } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  s.alignment = { vertical: "middle" };
  ws.getRow(2).height = 18;
}

function header(ws, headers) {
  const hr = ws.getRow(4);
  headers.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: HEADTXT } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    c.border = BORDER;
  });
  hr.height = 30;
}

function dv(ws, range, list) {
  ws.dataValidations.add(range, { type: "list", allowBlank: true, formulae: ['"' + list + '"'] });
}

function fill(ws, cols, from, to, formulaFns = {}) {
  for (let r = from; r <= to; r++) {
    for (const col of cols) {
      const c = ws.getCell(`${col}${r}`);
      c.border = BORDER;
      if (formulaFns[col]) c.value = { formula: formulaFns[col](r) };
    }
  }
}

export function buildWorkbook(ExcelJS, categoryWeights = CANONICAL_CATEGORY_WEIGHTS) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fons Solar";

  {
    const ws = wb.addWorksheet("Proje Bilgileri");
    for (let i = 1; i <= 12; i++) ws.getColumn(i).width = i === 2 || i === 3 || i === 4 ? 12 : (i === 8 ? 20 : 14);
    ws.getColumn(2).width = 16;
    band(ws, "PROJE BİLGİLERİ", "Adım 1 — Kimlik · Tarihler · Güç · Ekipman  →  Supabase: projects", 12);
    const section = (r, txt) => {
      ws.mergeCells(r, 1, r, 12);
      const c = ws.getCell(r, 1); c.value = txt;
      c.font = { bold: true, color: { argb: "FF1B3A6B" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
    };
    const label = (r, txt, hint) => {
      ws.mergeCells(r, 2, r, 4);
      const b = ws.getCell(r, 2); b.value = txt; b.font = { bold: true };
      ws.mergeCells(r, 5, r, 6);
      const e = ws.getCell(r, 5); e.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT } }; e.border = BORDER;
      if (hint) { const h = ws.getCell(r, 8); h.value = hint; h.font = { italic: true, size: 9, color: { argb: "FF8A94A6" } }; }
    };
    section(4, "TEMEL BİLGİLER");
    label(5, "Proje ID *", "örn: izmir-evsel-001");
    label(6, "Proje Adı *", "örn: İzmir Kemalpaşa Evsel GES");
    label(7, "Konum *", "İl / İlçe / Mahalle / Adres");
    label(8, "Proje Türü *", "Listeden seçin");
    label(9, "Durum", "Listeden seçin");
    label(10, "Başlangıç Tarihi *", "GG.AA.YYYY");
    label(11, "Hedef Bitiş *", "GG.AA.YYYY");
    label(12, "Toplam Gün", "otomatik");
    ws.getCell("E12").value = { formula: 'IFERROR(E11-E10,"")' };
    ws.getCell("E10").numFmt = "dd.mm.yyyy"; ws.getCell("E11").numFmt = "dd.mm.yyyy";
    dv(ws, "E8", "Arazi GES,Endüstriyel Çatı GES,Evsel GES");
    dv(ws, "E9", "aktif,beklemede,tamamlandı,iptal edildi");
    section(14, "GÜÇ BİLGİLERİ");
    label(15, "DC Güç (kWp) *", null);
    label(16, "AC Güç (kWe)", null);
    label(17, "Depolama (kWh)", null);
    section(19, "EKİPMAN BİLGİLERİ");
    const dual = (r, lbl, rlbl) => {
      label(r, lbl, null);
      const h = ws.getCell(r, 8); h.value = rlbl; h.font = { bold: true };
      const j = ws.getCell(r, 10); j.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT } }; j.border = BORDER;
    };
    dual(20, "Panel Markası", "Panel Sayısı");
    dual(21, "İnvertör Markası", "İnvertör Sayısı");
    dual(22, "Batarya Markası", "Batarya Gücü (kW)");
    { const h = ws.getCell(23, 8); h.value = "Batarya Adedi"; h.font = { bold: true };
      const j = ws.getCell(23, 10); j.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT } }; j.border = BORDER; }
    ws.mergeCells(25, 1, 25, 12);
    ws.getCell(25, 1).value = "Zorunlu alanlar * ile isaretli. Bu sayfa projects tablosuna aktarilir";
    ws.getCell(25, 1).font = { italic: true, size: 9, color: { argb: "FF8A94A6" } };
  }

  {
    const ws = wb.addWorksheet("İş Kalemleri", { views: [{ state: "frozen", ySplit: 4 }] });
    band(ws, "İŞ KALEMLERİ", "Adım 2 — Görev listesi · Kategori · Tarih · Durum · Hedef Miktar · Kritik Yol  →  Supabase: project_tasks", 18);
    header(ws, ["Görev\nKodu","Görev Adı","Kategori","Alt\nKategori","Grup\nEtiketi","Plan\nBaşlangıç","Plan\nBitiş","Süre\n(Gün)","Durum","Sorumlu","Sorumlu\nRol","Ekip\nSayısı","Notlar","Birim","Hedef\nMiktar","Dashboard\nGöster","Dashboard\nSıra","Kritik\nmi?"]);
    [10,26,16,14,14,13,13,9,14,16,14,9,26,10,12,13,12,9].forEach((w,i)=>ws.getColumn(i+1).width=w);
    fill(ws, ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R"], 5, N, { H:(r)=>`IFERROR(G${r}-F${r},"")` });
    for (let r=5;r<=N;r++){ ws.getCell(`F${r}`).numFmt="dd.mm.yyyy"; ws.getCell(`G${r}`).numFmt="dd.mm.yyyy"; }
    dv(ws, `C5:C${N}`, CAT_TASK); dv(ws, `I5:I${N}`, ST_TASK); dv(ws, `P5:P${N}`, YN); dv(ws, `R5:R${N}`, YN);
  }

  {
    const ws = wb.addWorksheet("Kategori Ağırlıkları");
    band(ws, "KATEGORİ AĞIRLIKLARI", "Genel proje ilerlemesi bu 10 kategorinin ağırlıklı ortalamasıdır  →  Supabase: project_category_weights  (SALT OKUNUR)", 4);
    header(ws, ["Kategori","Ağırlık\n(%)","İş Kalemleri'nde bu\nkategoriye atanan görev sayısı kadar\nilerleme buraya yansır",""]);
    [22,12,50,4].forEach((w,i)=>ws.getColumn(i+1).width=w);
    categoryWeights.forEach((row, i) => {
      const r = 5 + i;
      ws.getCell(`A${r}`).value = TASK_CAT_TO_LABEL[row.category] ?? row.category;
      ws.getCell(`B${r}`).value = row.weight_pct;
      ws.getCell(`C${r}`).value = "İş Kalemleri sayfasında Kategori = \"" + (TASK_CAT_TO_LABEL[row.category] ?? row.category) + "\" seçilen görevlerin ortalama ilerlemesi";
      for (const col of ["A","B","C","D"]) {
        const c = ws.getCell(`${col}${r}`);
        c.border = BORDER;
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LOCKED } };
      }
    });
    const tR = 5 + categoryWeights.length;
    ws.getCell(`A${tR}`).value = "TOPLAM";
    ws.getCell(`A${tR}`).font = { bold: true };
    ws.getCell(`B${tR}`).value = { formula: `SUM(B5:B${tR - 1})`, result: 0 };
    ws.getCell(`B${tR}`).font = { bold: true };
    for (const col of ["A","B"]) ws.getCell(`${col}${tR}`).border = BORDER;
    ws.mergeCells(tR + 2, 1, tR + 2, 4);
    ws.getCell(tR + 2, 1).value = "Bu sayfa degistirilemez: agirliklar sistemde sabittir, buradan iceri aktarilmaz. Sadece bilgi amaclidir.";
    ws.getCell(tR + 2, 1).font = { italic: true, size: 9, color: { argb: "FF8A94A6" } };
    ws.getCell(tR + 2, 1).alignment = { wrapText: true };
  }

  {
    const ws = wb.addWorksheet("Riskler", { views: [{ state: "frozen", ySplit: 4 }] });
    band(ws, "RİSKLER", "Adım 4 — Risk tanımı · Olasılık · Etki · Önlem · Kategori  →  Supabase: project_risks", 10);
    header(ws, ["Risk\nNo","Risk Başlığı","Açıklama","Olasılık\n(1-5)","Etki\n(1-5)","Risk\nSkoru","Şiddet","Durum","Aksiyon / Önlem","Kategori"]);
    [8,26,34,10,9,9,10,14,34,14].forEach((w,i)=>ws.getColumn(i+1).width=w);
    fill(ws, ["A","B","C","D","E","F","G","H","I","J"], 5, N, {
      F:(r)=>`IFERROR(D${r}*E${r},"")`,
      G:(r)=>`IF(F${r}="","",IF(F${r}>=15,"kritik",IF(F${r}>=9,"yüksek",IF(F${r}>=4,"orta","düşük"))))`,
    });
    dv(ws, `D5:E${N}`, "1,2,3,4,5"); dv(ws, `H5:H${N}`, ST_RISK); dv(ws, `J5:J${N}`, CAT_RISK);
  }

  {
    const ws = wb.addWorksheet("Bütçe", { views: [{ state: "frozen", ySplit: 5 }] });
    band(ws, "BÜTÇE", "Adım 5 — Planlanan bütçe kalemleri (hedef maliyet)  →  Supabase: budget_lines", 11);
    ws.mergeCells("A3:K3");
    ws.getCell("A3").value = 'Bu sayfaya SADECE planlanan (hedef) tutarları girin. "Gerçekleşen" tutar bu sayfada YOKTUR; sistemde onaylı faturalar girildikçe otomatik hesaplanır. Kategori sağdaki rehbere göre seçilmelidir.';
    ws.getCell("A3").font = { italic: true, size: 9, color: { argb: "FF8A94A6" } };
    ws.getCell("A3").alignment = { wrapText: true };
    ws.getRow(3).height = 28;

    ws.mergeCells("G4:H4");
    ws.getCell("G4").value = "KATEGORİ REHBERİ";
    ws.mergeCells("J4:K4");
    ws.getCell("J4").value = "BÜTÇE ÖZETİ (OTOMATİK)";
    for (const address of ["G4", "J4"]) {
      const c = ws.getCell(address);
      c.font = { bold: true, size: 10, color: { argb: HEADTXT } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = BORDER;
    }

    ["Kategori","Kalem Adı","Planlanan Tutar (₺)","Sıra","Notlar"].forEach((h, i) => {
      const c = ws.getCell(5, i + 1);
      c.value = h; c.font = { bold: true, size: 10, color: { argb: HEADTXT } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; c.border = BORDER;
    });
    for (const [address, value] of [["G5","Kod"],["H5","Açıklama"],["J5","Kategori"],["K5","Planlanan Toplam (₺)"]]) {
      const c = ws.getCell(address); c.value = value; c.font = { bold: true, size: 10, color: { argb: HEADTXT } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; c.border = BORDER;
    }

    [16,34,20,8,30,3,16,55,3,16,22].forEach((w,i)=>ws.getColumn(i+1).width=w);
    fill(ws, ["A","B","C","D","E"], 6, N);
    for (let r=6;r<=N;r++) ws.getCell(`C${r}`).numFmt='#,##0.00';
    dv(ws, `A6:A${N}`, CAT_BUDGET);

    const budgetGuide = [
      ["panel", "Güneş paneli malzeme, nakliye ve gümrük bedelleri"],
      ["inverter", "İnvertör ve güç elektroniği ekipmanları"],
      ["mekanik", "Konstrüksiyon, kolon/kiriş/aşık imalat ve montaj malzemesi"],
      ["elektrik_dc", "DC kablo, konnektör, DC pano/kutu ve DC saha malzemesi"],
      ["elektrik_ac", "AC kablo, AC pano ve AC saha ekipmanları"],
      ["elektrik_og", "OG hattı, şalt sahası, köşk/trafo yatırımları"],
      ["enh", "Enerji Nakil Hattı (ENH) yatırım kalemleri"],
      ["altyapi", "Yol, saha hazırlığı, drenaj ve çevre düzenleme işleri"],
      ["iscilik", "Montaj ve saha işçiliği hizmet bedelleri"],
      ["izin", "Ruhsat, resmi izin, harç ve danışmanlık giderleri"],
      ["denetim", "İşveren mühendisliği, TSE ve bağımsız denetim hizmetleri"],
      ["diger", "Yukarıdaki kategorilere girmeyen diğer kalemler"],
    ];
    budgetGuide.forEach(([code, description], i) => {
      const r = 6 + i;
      ws.getCell(`G${r}`).value = code; ws.getCell(`H${r}`).value = description;
      ws.getCell(`J${r}`).value = code;
      ws.getCell(`K${r}`).value = { formula: `SUMIF($A$6:$A$${N},"${code}",$C$6:$C$${N})`, result: 0 };
      ws.getCell(`K${r}`).numFmt = '#,##0.00';
      for (const col of ["G","H","J","K"]) {
        const c = ws.getCell(`${col}${r}`); c.border = BORDER;
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 ? "FFF7F9FC" : LOCKED } };
      }
    });
    const totalRow = 6 + budgetGuide.length;
    ws.getCell(`J${totalRow}`).value = "TOPLAM";
    ws.getCell(`K${totalRow}`).value = { formula: `SUM(K6:K${totalRow - 1})`, result: 0 };
    ws.getCell(`K${totalRow}`).numFmt = '#,##0.00';
    for (const col of ["J","K"]) {
      const c = ws.getCell(`${col}${totalRow}`); c.font = { bold: true }; c.border = BORDER;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F5" } };
    }
    ws.getCell(`J${totalRow + 2}`).value = "Girilmiş Kalem Sayısı";
    ws.getCell(`K${totalRow + 2}`).value = { formula: `COUNTIF($A$6:$A$${N},"<>")`, result: 0 };
    for (const col of ["J","K"]) ws.getCell(`${col}${totalRow + 2}`).border = BORDER;
  }

  {
    const ws = wb.addWorksheet("Malzeme Listesi", { views: [{ state: "frozen", ySplit: 4 }] });
    band(ws, "MALZEME LİSTESİ (BOM)", "Adım 6 — Planlanan malzeme/ekipman listesi  →  Supabase: procurement_items", 11);
    header(ws, ["Sıra","Kategori","Malzeme / Ekipman","Model / Şartname","Birim","Planlanan\nMiktar","Öncelik","Tedarik\nSüresi (gün)","Garanti\n(yıl)","Marka Kriteri","Notlar"]);
    [6,12,28,22,8,10,10,12,9,20,26].forEach((w,i)=>ws.getColumn(i+1).width=w);
    fill(ws, ["A","B","C","D","E","F","G","H","I","J","K"], 5, N);
    dv(ws, `B5:B${N}`, CAT_BOM); dv(ws, `G5:G${N}`, PRIO_BOM);
  }

  {
    const ws = wb.addWorksheet("📘 Kullanım Kılavuzu");
    band(ws, "KULLANIM KILAVUZU", "Şablon v6 (16.07.2026: Riskler'e Kategori kolonu eklendi)", 4);
    [6,34,70].forEach((w,i)=>ws.getColumn(i+1).width=w);
    const rowsG = [
      ["1","Proje Bilgileri -> projects","Proje ID: kucuk harf, bosluksuz, tire."],
      ["2","İş Kalemleri -> project_tasks","Kategori/Durum dropdown. Kritik mi?=Evet isaretlenen gorevler kritik yol sayilir."],
      ["3","Kategori Ağırlıkları (salt okunur) -> project_category_weights","Panel montaji %20, digerleri %10/%5, toplam %100."],
      ["4","Riskler -> project_risks","Manuel + otomatik (gorev gecikmesi, malzeme fazla talebi) riskler. Kategori: Is Kalemi/Satin Alma/Diger. Sadece MEVCUT proje guncellemesinde iceri aktarilir, yeni proje olusturmada bu sayfa okunmaz."],
      ["5","Bütçe -> budget_lines","Planlanan tutarlar."],
      ["6","Malzeme Listesi -> procurement_items","BOM planlanan miktarlar."],
    ];
    rowsG.forEach((g, i) => {
      const r = 5 + i;
      ws.getCell(r,1).value=g[0]; ws.getCell(r,2).value=g[1]; ws.getCell(r,3).value=g[2];
      ws.getCell(r,2).font={bold:true}; ws.getCell(r,3).alignment={wrapText:true};
    });
  }

  return wb;
}
