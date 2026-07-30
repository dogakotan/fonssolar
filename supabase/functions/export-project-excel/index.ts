// export-project-excel — Supabase'den proje verisini çekip v6 şablonunu doldurur
import { createClient } from "npm:@supabase/supabase-js@2";
import { PROJECT_TYPE_TO_LABEL, TASK_CAT_TO_LABEL, CANONICAL_CATEGORY_WEIGHTS, RISK_CAT_TO_LABEL } from "./mapping.ts";
import { buildWorkbook } from "./template_builder.ts";
import ExcelJS from "npm:exceljs@4.4.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const jsonErr = (b, s) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const CAP = 310;                       // temizlenecek son satır
const d = (s) => (s ? new Date(s + "T00:00:00Z") : null);
const yn = (b) => (b ? "Evet" : "Hayır");


// records: [{A:val,B:val,...}]; clearCols: temizlenecek kolonlar
function writeSheet(ws, startRow, records, clearCols) {
  if (!ws) return;
  records.forEach((rec, i) => {
    const r = startRow + i;
    for (const [col, val] of Object.entries(rec)) ws.getCell(`${col}${r}`).value = val ?? null;
  });
  for (let r = startRow + records.length; r <= CAP; r++) {
    for (const col of clearCols) {
      const c = ws.getCell(`${col}${r}`);
      const v = c.value;
      if (v !== null && !(v && typeof v === "object" && "formula" in v)) c.value = null;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    let projectId = new URL(req.url).searchParams.get("project_id");
    if (!projectId && req.method === "POST") {
      try { projectId = (await req.json())?.project_id; } catch { /* ignore */ }
    }
    if (!projectId) return jsonErr({ error: "project_id gerekli (?project_id=... veya JSON body)" }, 400);

    const { data: proj, error: pe } = await sb.from("projects").select("*").eq("id", projectId).maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!proj) return jsonErr({ error: `Proje bulunamadı: ${projectId}` }, 404);

    // --- yetki: gecerli oturum + projeye erisim sarti ---
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: uinfo } = await userClient.auth.getUser();
    if (!uinfo?.user) return jsonErr({ error: "Yetkisiz: gecerli oturum yok" }, 401);
    const { data: allowed, error: accErr } = await userClient.rpc("user_has_project_access", { p_project_id: projectId });
    if (accErr) throw new Error(accErr.message);
    if (!allowed) return jsonErr({ error: `Bu projeye erisim yetkiniz yok: ${projectId}` }, 403);

    const [tasks, risks, budget, proc, weights] = await Promise.all([
      sb.from("project_tasks").select("*").eq("project_id", projectId).order("planned_start").order("task_code"),
      sb.from("project_risks").select("*").eq("project_id", projectId).order("created_at"),
      sb.from("budget_lines").select("*").eq("project_id", projectId).order("order_index"),
      sb.from("procurement_items").select("*").eq("project_id", projectId).order("item_no"),
      sb.from("project_category_weights").select("*").eq("project_id", projectId),
    ]);
    for (const r of [tasks, risks, budget, proc, weights]) if (r.error) throw new Error(r.error.message);

    // kategori bazlı ortalama ilerleme (JS tarafında, RPC'deki aynı mantık)
    const avgByCategory = new Map();
    for (const t of tasks.data ?? []) {
      if (!t.category) continue;
      const arr = avgByCategory.get(t.category) ?? [];
      arr.push(t.progress_pct ?? 0);
      avgByCategory.set(t.category, arr);
    }
    const avgOf = (cat) => {
      const arr = avgByCategory.get(cat);
      if (!arr || !arr.length) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };
    const weightRows = (weights.data?.length ? weights.data : CANONICAL_CATEGORY_WEIGHTS)
      .map((w) => ({ category: w.category, weight_pct: w.weight_pct }));

    const wb = buildWorkbook(ExcelJS, weightRows);
    const ws = (n) => wb.getWorksheet(n);

    /* 1) Proje Bilgileri */
    const p = ws("Proje Bilgileri");
    p.getCell("E5").value = proj.id;
    p.getCell("E6").value = proj.name;
    p.getCell("E7").value = proj.location ?? null;
    p.getCell("E8").value = PROJECT_TYPE_TO_LABEL[proj.project_type] ?? proj.project_type ?? null;
    p.getCell("E9").value = proj.status ?? null;
    p.getCell("E10").value = d(proj.start_date);
    p.getCell("E11").value = d(proj.target_date);
    p.getCell("E15").value = proj.capacity_kwp ?? null;
    p.getCell("E16").value = proj.capacity_kwe ?? null;
    p.getCell("E17").value = proj.storage_kwh ?? null;
    p.getCell("E20").value = proj.panel_brand ?? null;
    p.getCell("J20").value = proj.panel_count ?? null;
    p.getCell("E21").value = proj.inverter_brand ?? null;
    p.getCell("J21").value = proj.inverter_count ?? null;
    p.getCell("E22").value = proj.battery_brand ?? null;
    p.getCell("J22").value = proj.battery_power_kw ?? null;
    p.getCell("J23").value = proj.battery_count ?? null;

    /* 2) İş Kalemleri (H = süre formülü, dokunma; N-Q = ölçülebilir ilerleme hedefi; R = kritik yol) */
    writeSheet(ws("İş Kalemleri"), 5, (tasks.data ?? []).map((t) => ({
      A: t.task_code, B: t.task_name, C: TASK_CAT_TO_LABEL[t.category] ?? t.category,
      D: t.sub_category, E: t.group_label, F: d(t.planned_start), G: d(t.planned_end),
      I: t.status, J: t.responsible, K: t.responsible_role, L: t.team_size, M: t.notes,
      N: t.unit, O: t.target_qty, P: yn(t.dashboard_visible), Q: t.dashboard_order,
      R: yn(t.is_critical),
    })), ["A","B","C","D","E","F","G","I","J","K","L","M","N","O","P","Q","R"]);

    /* 3) Kategori Ağırlıkları (salt okunur özet — İş Kalemleri'nden hesaplanan ortalama ilerleme eklenir) */
    {
      const cw = ws("Kategori Ağırlıkları");
      if (cw) {
        weightRows.forEach((w, i) => {
          const r = 5 + i;
          const avg = avgOf(w.category);
          cw.getCell(`A${r}`).value = TASK_CAT_TO_LABEL[w.category] ?? w.category;
          cw.getCell(`B${r}`).value = w.weight_pct;
          cw.getCell(`C${r}`).value = `Ortalama ilerleme: %${avg.toFixed(1)}`;
        });
      }
    }

    /* 4) Riskler
       - Manuel risk: F skor ve G şiddet şablon formülleriyle hesaplanır.
       - Otomatik risk: olasılık/etki yoktur; Supabase risk motorunun severity değeri
         G sütununa doğrudan yazılır. Aksi halde boş hücreler 0 sayılıp yanlışlıkla
         "düşük" görünüyordu. */
    const riskRows = risks.data ?? [];
    const riskSheet = ws("Riskler");
    writeSheet(riskSheet, 5, riskRows.map((r, i) => ({
      A: i + 1, B: r.title, C: r.description, D: r.probability, E: r.impact,
      H: r.status, I: r.mitigation, J: RISK_CAT_TO_LABEL[r.category] ?? "Diğer",
    })), ["A","B","C","D","E","H","I","J"]);
    riskRows.forEach((risk, index) => {
      const row = 5 + index;
      const hasRiskMatrix = Number(risk.probability) >= 1 && Number(risk.impact) >= 1;
      if (!hasRiskMatrix && risk.severity) {
        riskSheet.getCell(`F${row}`).value = null;
        riskSheet.getCell(`G${row}`).value = String(risk.severity).toLocaleLowerCase("tr-TR");
      }
    });

    /* 5) Bütçe */
    writeSheet(ws("Bütçe"), 6, (budget.data ?? []).map((r) => ({
      A: r.category, B: r.name, C: r.planned_amount, D: r.order_index,
    })), ["A","B","C","D","E"]);

    /* 6) Malzeme Listesi */
    writeSheet(ws("Malzeme Listesi"), 5, (proc.data ?? []).map((r, i) => ({
      A: r.item_no ?? i + 1, B: r.category, C: r.equipment, D: r.spec_ref, E: r.unit,
      F: r.planned_qty, G: r.priority, H: r.lead_time_days, I: r.warranty_years,
      J: r.brand_criteria, K: r.notes,
    })), ["A","B","C","D","E","F","G","H","I","J","K"]);

    const out = await wb.xlsx.writeBuffer();
    return new Response(out, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${projectId}_detayli_proje_takip.xlsx"`,
      },
    });
  } catch (e) {
    return jsonErr({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
