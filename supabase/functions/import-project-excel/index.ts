// import-project-excel — Fons Solar v6 sablonunu Supabase'e aktarir (upsert)
import { createClient } from "npm:@supabase/supabase-js@2";
import ExcelJS from "npm:exceljs@4.4.0";
import {
  toStr, toNumber, toInt, toDate,
  projectTypeToCode, taskCategoryToCode, CANONICAL_CATEGORY_WEIGHTS, riskCategoryToCode,
} from "./mapping.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Yeni proje olusturmaya izinli roller (2026-07-21 eklendi) — oncesinde bu dal
// hic rol kontrolu yapmiyordu, herhangi bir authenticated kullanici yeni proje
// olusturabiliyordu. Mevcut proje guncellemesi user_has_project_access ile
// zaten korunuyordu, degismedi.
const ALLOWED_NEW_PROJECT_ROLES = ["admin", "proje_yoneticisi"];

function cell(ws, addr) { return ws ? ws.getCell(addr).value : null; }

// startRow: sayfanın başlık satırından SONRAKİ ilk veri satırı — İş
// Kalemleri/Riskler/Malzeme Listesi'nde başlık 4. satırda (veri 5'ten
// başlar), ama Bütçe sayfasında başlık 5. satırda (veri 6'dan başlar).
// Bu fark gözetilmezse Bütçe'nin başlık satırının kendisi ("Kategori" /
// "Kalem Adı" / ₺0) her yüklemede geçerli bir bütçe kalemi sanılıp
// eklenirdi (2026-07-30'da bulunan bug, bkz. CLAUDE.md).
function rows(ws, keyCol, maxCol, startRow = 5) {
  const out = [];
  if (!ws) return out;
  const last = ws.rowCount || startRow;
  let blanks = 0;
  for (let r = startRow; r <= last + startRow; r++) {
    const key = toStr(ws.getCell(`${keyCol}${r}`).value);
    if (key === null) { blanks++; if (blanks > 30 && r > last) break; continue; }
    blanks = 0;
    const rec = { _row: r };
    for (const [name, col] of Object.entries(maxCol)) rec[name] = ws.getCell(`${col}${r}`).value;
    out.push(rec);
  }
  return out;
}

async function upsertByKey(sb, table, projectId, keyCols, records, log) {
  if (!records.length) { log[table] = { inserted: 0, updated: 0 }; return; }
  const keyOf = (o) => keyCols.map((k) => String(o[k] ?? "")).join("||");
  const { data: existing, error: selErr } = await sb.from(table)
    .select(["id", ...keyCols].join(",")).eq("project_id", projectId);
  if (selErr) throw new Error(`${table} select: ${selErr.message}`);
  const idByKey = new Map((existing ?? []).map((e) => [keyOf(e), e.id]));
  const toInsert = [], toUpdate = [];
  for (const rec of records) {
    const id = idByKey.get(keyOf(rec));
    if (id) toUpdate.push({ id, rec }); else toInsert.push(rec);
  }
  if (toInsert.length) {
    const { error } = await sb.from(table).insert(toInsert);
    if (error) throw new Error(`${table} insert: ${error.message}`);
  }
  for (const u of toUpdate) {
    const { error } = await sb.from(table).update(u.rec).eq("id", u.id);
    if (error) throw new Error(`${table} update: ${error.message}`);
  }
  log[table] = { inserted: toInsert.length, updated: toUpdate.length };
}

// Ayni Proje ID zaten varken benzersiz bir "-kopya" varyanti uretir — "Yeni
// Proje" akisinda kullanici mevcut bir projeyi farkinda olmadan guncellemek
// yerine bilinçli olarak kopyalamayi secince kullanilir (bkz. mode==='duplicate').
async function nextDuplicateId(sb, baseId) {
  let candidate = `${baseId}-kopya`;
  let suffix = 2;
  // deno-lint-ignore no-constant-condition
  while (true) {
    const { data: row } = await sb.from("projects").select("id").eq("id", candidate).maybeSingle();
    if (!row) return candidate;
    candidate = `${baseId}-kopya-${suffix++}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    let buf;
    let mode = "ask"; // 'ask' | 'update' | 'duplicate' — bkz. asagidaki collision kontrolu
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file") ?? form.get("excel");
      if (!f || typeof f === "string") return json({ error: "form-data icinde 'file' bulunamadi" }, 400);
      buf = await f.arrayBuffer();
      const modeField = form.get("mode");
      if (typeof modeField === "string" && ["ask", "update", "duplicate"].includes(modeField)) mode = modeField;
    } else {
      buf = await req.arrayBuffer();
    }
    if (!buf || buf.byteLength < 100) return json({ error: "Excel dosyasi bos/eksik" }, 400);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = (n) => wb.getWorksheet(n);
    const log = {};

    const p = ws("Proje Bilgileri");
    if (!p) return json({ error: "'Proje Bilgileri' sayfasi yok" }, 400);
    const projectId = toStr(cell(p, "E5"));
    const projectName = toStr(cell(p, "E6"));
    if (!projectId || !projectName) return json({ error: "Proje ID ve Proje Adi zorunludur (E5, E6)" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: uinfo } = await userClient.auth.getUser();
    if (!uinfo?.user) return json({ error: "Yetkisiz: gecerli oturum yok" }, 401);
    const { data: existsRow } = await sb.from("projects").select("id, name").eq("id", projectId).maybeSingle();

    // ID zaten varsa ve istemci henuz bir secim yapmadiysa (ilk deneme): hicbir
    // yazma yapmadan once "mevcut projeyi guncelle" / "yeni kopya olustur"
    // secimini istemciye sorduruyoruz — aksi halde "Yeni Proje" butonuyla
    // farkinda olmadan mevcut bir projenin verisi ezilebilirdi (2026-07-30'da
    // bulunan bug: eskiden bu dal sessizce guncelliyordu, bkz. CLAUDE.md).
    if (existsRow && mode === "ask") {
      return json({ conflict: true, existing_id: existsRow.id, existing_name: existsRow.name }, 409);
    }

    let projectIdToUse = projectId;
    let isNewProject = !existsRow;
    let duplicated = false;

    if (existsRow && mode === "duplicate") {
      const { data: callerProfile } = await sb.from("profiles").select("role_key").eq("id", uinfo.user.id).single();
      if (!ALLOWED_NEW_PROJECT_ROLES.includes(callerProfile?.role_key)) {
        return json({ error: "Yeni proje olusturma yetkiniz yok." }, 403);
      }
      projectIdToUse = await nextDuplicateId(sb, projectId);
      isNewProject = true;
      duplicated = true;
    } else if (existsRow) {
      // mode === 'update'
      const { data: allowed, error: accErr } = await userClient.rpc("user_has_project_access", { p_project_id: projectId });
      if (accErr) throw new Error(`erisim kontrolu: ${accErr.message}`);
      if (!allowed) return json({ error: `Bu projeye erisim yetkiniz yok: ${projectId}` }, 403);
    } else {
      const { data: callerProfile } = await sb.from("profiles").select("role_key").eq("id", uinfo.user.id).single();
      if (!ALLOWED_NEW_PROJECT_ROLES.includes(callerProfile?.role_key)) {
        return json({ error: "Yeni proje olusturma yetkiniz yok." }, 403);
      }
    }

    const projectRow = {
      id: projectIdToUse,
      name: duplicated ? `${projectName} (Kopya)` : projectName,
      location: toStr(cell(p, "E7")),
      project_type: projectTypeToCode(cell(p, "E8")),
      status: toStr(cell(p, "E9")) ?? "aktif",
      start_date: toDate(cell(p, "E10")),
      target_date: toDate(cell(p, "E11")),
      total_days: toInt(cell(p, "E12")),
      capacity_kwp: toNumber(cell(p, "E15")),
      capacity_kwe: toNumber(cell(p, "E16")),
      storage_kwh: toNumber(cell(p, "E17")),
      panel_brand: toStr(cell(p, "E20")),
      panel_count: toInt(cell(p, "J20")),
      inverter_brand: toStr(cell(p, "E21")),
      inverter_count: toInt(cell(p, "J21")),
      battery_brand: toStr(cell(p, "E22")),
      battery_power_kw: toNumber(cell(p, "J22")),
      battery_count: toInt(cell(p, "J23")),
    };
    Object.keys(projectRow).forEach((k) => projectRow[k] === null && delete projectRow[k]);
    const { error: pe } = await sb.from("projects").upsert(projectRow, { onConflict: "id" });
    if (pe) throw new Error(`projects upsert: ${pe.message}`);
    log["projects"] = { id: projectIdToUse, saved: true };

    if (isNewProject) {
      const { error: cwErr } = await sb.from("project_category_weights").insert(
        CANONICAL_CATEGORY_WEIGHTS.map((w) => ({ project_id: projectIdToUse, category: w.category, weight_pct: w.weight_pct }))
      );
      if (cwErr && !String(cwErr.message).includes("duplicate")) throw new Error(`project_category_weights seed: ${cwErr.message}`);
      log["project_category_weights"] = { note: "yeni proje - varsayilan agirliklar seed edildi (DB trigger de ayrica garantiliyor)" };
    } else {
      log["project_category_weights"] = { note: "mevcut proje - agirliklar degistirilmedi (Excel'den okunmaz)" };
    }

    const taskRows = rows(ws("İş Kalemleri"), "A", {
      task_code: "A", task_name: "B", category: "C", sub_category: "D", group_label: "E",
      planned_start: "F", planned_end: "G", status: "I", responsible: "J", responsible_role: "K",
      team_size: "L", notes: "M", unit: "N", target_qty: "O",
    }).map((r) => ({
      project_id: projectIdToUse,
      task_code: toStr(r.task_code),
      task_name: toStr(r.task_name),
      category: taskCategoryToCode(r.category),
      sub_category: toStr(r.sub_category),
      group_label: toStr(r.group_label),
      planned_start: toDate(r.planned_start),
      planned_end: toDate(r.planned_end),
      status: toStr(r.status) ?? "beklemede",
      responsible: toStr(r.responsible),
      responsible_role: toStr(r.responsible_role),
      team_size: toInt(r.team_size),
      unit: toStr(r.unit),
      target_qty: toNumber(r.target_qty),
    })).filter((r) => r.task_code && r.task_name && r.planned_start && r.planned_end);
    await upsertByKey(sb, "project_tasks", projectIdToUse, ["task_code"], taskRows, log);

    // Riskler sayfasi normalde SADECE mevcut proje guncellemesinde okunur —
    // gercek "yeni, bomboş" bir projede henuz gorev/satin alma verisi olmadigi
    // icin risk anlamsizdir. Kopya modunda ise (duplicated) proje aslinda
    // BAŞKA bir projenin dolu Excel'i ile olusturuldugu icin Riskler sayfasi
    // da doludur — bu yuzden kopya modunda risklerin de tasinmasi tutarlidir.
    if (!isNewProject || duplicated) {
      const riskRows = rows(ws("Riskler"), "B", {
        title: "B", description: "C", probability: "D", impact: "E", severity: "G", status: "H", mitigation: "I", category: "J",
      }).map((r) => {
        const prob = toInt(r.probability), imp = toInt(r.impact);
        let sev = toStr(r.severity);
        if (!sev && prob && imp) { const s = prob * imp; sev = s >= 15 ? "kritik" : s >= 9 ? "yuksek" : s >= 4 ? "orta" : "dusuk"; }
        return {
          project_id: projectIdToUse,
          title: toStr(r.title),
          description: toStr(r.description),
          probability: prob, impact: imp,
          severity: sev ?? "orta",
          status: toStr(r.status) ?? "acik",
          mitigation: toStr(r.mitigation),
          category: riskCategoryToCode(r.category),
        };
      }).filter((r) => r.title);
      await upsertByKey(sb, "project_risks", projectIdToUse, ["title"], riskRows, log);
    } else {
      log["project_risks"] = { note: "yeni proje - Riskler sayfasi Excel'den icoeri aktarilmadi (henuz gorev/satin alma verisi yok, risk olusturmak anlamsiz)" };
    }

    const budgetRows = rows(ws("Bütçe"), "B", {
      category: "A", name: "B", planned_amount: "C", order_index: "D",
    }, 6).map((r) => ({
      project_id: projectIdToUse,
      category: toStr(r.category),
      name: toStr(r.name),
      planned_amount: toNumber(r.planned_amount) ?? 0,
      order_index: toInt(r.order_index) ?? 0,
    })).filter((r) => r.name && r.category && !/^toplam/i.test(r.name));
    await upsertByKey(sb, "budget_lines", projectIdToUse, ["category", "name"], budgetRows, log);

    const procRows = rows(ws("Malzeme Listesi"), "C", {
      item_no: "A", category: "B", equipment: "C", spec_ref: "D", unit: "E",
      planned_qty: "F", priority: "G", lead_time_days: "H", warranty_years: "I",
      brand_criteria: "J", notes: "K",
    }).map((r) => ({
      project_id: projectIdToUse,
      item_no: toInt(r.item_no),
      category: toStr(r.category),
      equipment: toStr(r.equipment),
      spec_ref: toStr(r.spec_ref),
      unit: toStr(r.unit),
      planned_qty: toNumber(r.planned_qty),
      priority: toStr(r.priority) ?? "normal",
      lead_time_days: toInt(r.lead_time_days),
      warranty_years: toInt(r.warranty_years),
      brand_criteria: toStr(r.brand_criteria),
      notes: toStr(r.notes),
    })).filter((r) => r.equipment);
    await upsertByKey(sb, "procurement_items", projectIdToUse, ["equipment"], procRows, log);

    return json({ ok: true, project_id: projectIdToUse, created: isNewProject, duplicated, summary: log });
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
