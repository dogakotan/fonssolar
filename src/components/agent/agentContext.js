/**
 * agentContext.js
 * Her dashboard tab'ı için Supabase'den ilgili verileri çeker ve
 * Claude'a enjekte edilecek formatlanmış bir metin döndürür.
 */

import { supabase } from '../../lib/supabase'

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function fmt(val) {
  if (val === null || val === undefined) return '—'
  return String(val)
}

/**
 * selectedDate varsa o günün sonuna kadar olan verileri filtrele.
 * Dönen değer Supabase .lte() için ISO string, yoksa null.
 */
function dateCeiling(selectedDate) {
  if (!selectedDate) return null
  const d = new Date(selectedDate)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

/** Sorguya opsiyonel tarih filtresi ekle */
function withDateFilter(query, ceiling) {
  if (!ceiling) return query
  return query.lte('created_at', ceiling)
}

function section(title, rows) {
  if (!rows?.length) return ''
  return `\n### ${title}\n${rows.join('\n')}`
}

// ─── Tab context fetch fonksiyonları ─────────────────────────────────────────

async function ctxGenel(projectId, selectedDate) {
  const pid     = projectId && projectId !== 'genel' ? projectId : null
  const ceiling = dateCeiling(selectedDate)

  const [wpRes, ticketRes, procRes, progressRes] = await Promise.allSettled([
    withDateFilter(
      supabase.from('project_tasks').select('status, progress_pct').match(pid ? { project_id: pid } : {}),
      ceiling
    ),
    withDateFilter(
      supabase.from('tickets').select('severity, status').neq('status', 'kapatıldı'),
      ceiling
    ),
    withDateFilter(
      supabase.from('purchase_requests').select('status', { count: 'exact', head: true }).eq('status', 'bekliyor'),
      ceiling
    ),
    supabase
      .from('progress_items')
      .select('category, name, target_qty, total_progress')
      .match(pid ? { project_id: pid } : {}),
  ])

  const wps      = wpRes.status      === 'fulfilled' ? (wpRes.value.data      || []) : []
  const tickets  = ticketRes.status  === 'fulfilled' ? (ticketRes.value.data  || []) : []
  const pendingPR = procRes.status   === 'fulfilled' ? (procRes.value.count   || 0)  : 0
  const progress = progressRes.status === 'fulfilled' ? (progressRes.value.data || []) : []

  const wpSummary = ['tamamlandi', 'devam_ediyor', 'askida', 'beklemede'].map(s => {
    const count = wps.filter(w => w.status === s).length
    const label = { tamamlandi: 'Tamamlandı', devam_ediyor: 'Devam Ediyor', askida: 'Askıda', beklemede: 'Beklemede' }[s]
    return `  - ${label}: ${count}`
  })

  const ticketLines = tickets.slice(0, 5).map(t =>
    `  - Severity: ${t.severity}, Durum: ${t.status}`
  )

  const progressLines = progress.map(p => {
    const pct = p.target_qty > 0 ? Math.round((p.total_progress / p.target_qty) * 100) : 0
    return `  - [${p.category}] ${p.name}: %${pct} (${fmt(p.total_progress)}/${fmt(p.target_qty)})`
  })

  return [
    section('İş Paketi Durumu', wpSummary),
    section('Açık Ticketlar', ticketLines),
    section('Bekleyen Satın Alma Talebi', [`  - Bekleyen: ${pendingPR} adet`]),
    section('İmalat İlerlemesi', progressLines),
  ].filter(Boolean).join('\n')
}

async function ctxIsPlan(projectId, selectedDate) {
  const pid     = projectId && projectId !== 'genel' ? projectId : null
  const ceiling = dateCeiling(selectedDate)

  const [wpRes, schedRes, progRes] = await Promise.allSettled([
    withDateFilter(
      supabase.from('project_tasks')
        .select('task_name, status, progress_pct, planned_end, category')
        .match(pid ? { project_id: pid } : {})
        .order('planned_end', { ascending: true })
        .limit(30),
      ceiling
    ),
    withDateFilter(
      supabase.from('schedule_activities')
        .select('activity_name, status, completion_pct, priority')
        .match(pid ? { project_id: pid } : {})
        .order('activity_no', { ascending: true }),
      ceiling
    ),
    supabase
      .from('progress_items')
      .select('category, name, target_qty, total_progress')
      .match(pid ? { project_id: pid } : {}),
  ])

  const wps  = wpRes.status    === 'fulfilled' ? (wpRes.value.data    || []) : []
  const acts = schedRes.status === 'fulfilled' ? (schedRes.value.data || []) : []
  const progs = progRes.status === 'fulfilled' ? (progRes.value.data  || []) : []

  const wpLines = wps.map(w =>
    `  - [${w.status}] ${w.task_name} | İlerleme: %${fmt(w.progress_pct)} | Bitiş: ${fmt(w.planned_end)}`
  )

  const actLines = acts.map(a =>
    `  - [${a.status}] ${a.activity_name} | %${fmt(a.completion_pct)} | Öncelik: ${fmt(a.priority)}`
  )

  const progLines = progs.map(p => {
    const pct = p.target_qty > 0 ? Math.round((p.total_progress / p.target_qty) * 100) : 0
    return `  - [${p.category}] ${p.name}: %${pct}`
  })

  return [
    section('İş Paketleri', wpLines),
    section('Aktivite Planı', actLines),
    section('İmalat İlerlemesi', progLines),
  ].filter(Boolean).join('\n')
}

async function ctxSatinAlma(projectId, selectedDate) {
  const pid     = projectId && projectId !== 'genel' ? projectId : null
  const ceiling = dateCeiling(selectedDate)

  const [prRes, procRes] = await Promise.allSettled([
    withDateFilter(
      supabase.from('purchase_requests')
        .select('title, status, urgency, created_at')
        .match(pid ? { project_id: pid } : {})
        .order('created_at', { ascending: false })
        .limit(20),
      ceiling
    ),
    withDateFilter(
      supabase.from('procurement_items')
        .select('category, equipment, status, priority, expected_delivery, supplier')
        .match(pid ? { project_id: pid } : {})
        .order('priority', { ascending: true })
        .limit(30),
      ceiling
    ),
  ])

  const reqs  = prRes.status   === 'fulfilled' ? (prRes.value.data   || []) : []
  const items = procRes.status === 'fulfilled' ? (procRes.value.data || []) : []

  const reqLines = reqs.map(r =>
    `  - [${r.status}] ${r.title} | Aciliyet: ${fmt(r.urgency)} | Tarih: ${fmt(r.created_at?.slice(0, 10))}`
  )

  const itemLines = items.map(i =>
    `  - [${i.status}] ${i.equipment} | Öncelik: ${fmt(i.priority)} | Tedarikçi: ${fmt(i.supplier)} | Termin: ${fmt(i.expected_delivery)}`
  )

  return [
    section('Satın Alma Talepleri', reqLines),
    section('Tedarik Kalemleri', itemLines),
  ].filter(Boolean).join('\n')
}

async function ctxFinans(projectId, selectedDate) {
  const pid     = projectId && projectId !== 'genel' ? projectId : null
  const ceiling = dateCeiling(selectedDate)

  const [invRes, budgetRes, approvalRes] = await Promise.allSettled([
    withDateFilter(
      supabase.from('invoices')
        .select('invoice_no, amount, total_amount, status, invoice_date, category')
        .match(pid ? { project_id: pid } : {})
        .order('invoice_date', { ascending: false })
        .limit(15),
      ceiling
    ),
    supabase.from('budget_lines')
      .select('category, name, planned_amount')
      .match(pid ? { project_id: pid } : {}),
    withDateFilter(
      supabase.from('invoice_approvals')
        .select('step_label, status')
        .eq('status', 'bekliyor'),
      ceiling
    ),
  ])

  const invoices  = invRes.status      === 'fulfilled' ? (invRes.value.data      || []) : []
  const budget    = budgetRes.status   === 'fulfilled' ? (budgetRes.value.data   || []) : []
  const approvals = approvalRes.status === 'fulfilled' ? (approvalRes.value.data || []) : []

  const totalAmount  = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0)
  const plannedTotal = budget.reduce((s, b) => s + Number(b.planned_amount || 0), 0)

  const invLines = invoices.map(i =>
    `  - [${i.status}] No:${i.invoice_no} | ${fmt(i.category)} | Tutar: ${Number(i.total_amount || 0).toLocaleString('tr-TR')} ₺ | Tarih: ${fmt(i.invoice_date)}`
  )

  const budgetLines = budget.map(b =>
    `  - [${b.category}] ${b.name}: ${Number(b.planned_amount || 0).toLocaleString('tr-TR')} ₺`
  )

  return [
    section('Özet', [
      `  - Toplam Fatura Tutarı (KDV dahil): ${totalAmount.toLocaleString('tr-TR')} ₺`,
      `  - Planlanan Bütçe: ${plannedTotal.toLocaleString('tr-TR')} ₺`,
      `  - Onay Bekleyen Fatura Adımı: ${approvals.length}`,
    ]),
    section('Son Faturalar', invLines),
    section('Bütçe Kalemleri', budgetLines),
  ].filter(Boolean).join('\n')
}

async function ctxTickets(projectId, selectedDate) {
  const pid     = projectId && projectId !== 'genel' ? projectId : null
  const ceiling = dateCeiling(selectedDate)

  const query = withDateFilter(
    supabase.from('tickets')
      .select('title, category, severity, status, created_at')
      .match(pid ? { project_id: pid } : {})
      .neq('status', 'kapatıldı')
      .order('created_at', { ascending: false })
      .limit(20),
    ceiling
  )
  const { data } = await query

  const lines = (data || []).map(t =>
    `  - [${t.severity}] ${t.title} | Kategori: ${t.category} | Durum: ${t.status}`
  )

  return section('Açık Ticketlar', lines)
}

async function ctxRaporlar(projectId, selectedDate) {
  const pid     = projectId && projectId !== 'genel' ? projectId : null
  const ceiling = dateCeiling(selectedDate)

  let query = supabase
    .from('agent_reports')
    .select('agent_role, risk_level, report_text, created_at')
    .match(pid ? { project_id: pid } : {})
    .order('created_at', { ascending: false })
    .limit(5)

  // Geçmiş tarih seçildiyse o güne ait raporlara filtrele
  if (ceiling) {
    const dayStart = new Date(selectedDate)
    dayStart.setHours(0, 0, 0, 0)
    query = query
      .gte('created_at', dayStart.toISOString())
      .lte('created_at', ceiling)
  }

  const { data } = await query

  const lines = (data || []).map(r =>
    `  - [${r.agent_role}] Risk: ${fmt(r.risk_level)} | Tarih: ${fmt(r.created_at?.slice(0, 10))}\n    ${(r.report_text || '').slice(0, 150)}…`
  )

  return section('AI Raporları', lines)
}

// ─── Ana export ───────────────────────────────────────────────────────────────

/**
 * Aktif tab, proje ID'si ve opsiyonel selectedDate'e göre Supabase'den ilgili veriyi çeker.
 * Dönen string doğrudan system prompt'a eklenir.
 */
export async function fetchTabContext(activeTab, projectId, selectedDate = null) {
  try {
    let data = ''
    const dateLabel = selectedDate
      ? selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null

    switch (activeTab) {
      case 'genel':
        data = await ctxGenel(projectId, selectedDate)
        break
      case 'is-plani':
        data = await ctxIsPlan(projectId, selectedDate)
        break
      case 'satin-alma':
        data = await ctxSatinAlma(projectId, selectedDate)
        break
      case 'finans':
        data = await ctxFinans(projectId, selectedDate)
        break
      case 'tickets':
        data = await ctxTickets(projectId, selectedDate)
        break
      case 'raporlar':
        data = await ctxRaporlar(projectId, selectedDate)
        break
      case 'projeler':
        data = await ctxGenel(projectId, selectedDate)
        break
      default:
        data = ''
    }

    if (!data.trim()) return ''

    const header = dateLabel
      ? `\n\n---\n## Geçmiş Proje Verisi — ${dateLabel}\n> Not: Aşağıdaki veriler ${dateLabel} tarihine kadar olan kayıtları göstermektedir.\n`
      : `\n\n---\n## Güncel Proje Verisi (Supabase'den canlı)\n`

    return `${header}${data}\n---`
  } catch (err) {
    console.warn('[agentContext] Veri çekme hatası:', err)
    return ''
  }
}
