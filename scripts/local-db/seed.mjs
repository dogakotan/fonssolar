// Yerel tohum verisi (Faz 1 Adım 5). Yalnızca setup.mjs çağırır; yerel adres ve anahtarlar ortam değişkeniyle gelir.
// Bütün veri KURGU. Canlıdan veri kopyalanmaz. Şifreler rastgele üretilir, ekrana yazılmaz; yalnızca
// supabase/.local/seed-env.json'a (gitignore) yazılır ve Playwright oradan okur.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const url = process.env.LOCAL_SUPABASE_URL
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('LOCAL_SUPABASE_URL / LOCAL_SERVICE_ROLE_KEY yok (setup.mjs ile çalıştırın)')
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error('Tohum yalnızca yerel adrese yazılır')
const drafts = process.env.LOCAL_DRAFTS === '1'

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const must = async (label, p) => { const { data, error } = await p; if (error) throw new Error(`${label}: ${error.message}`); return data }
const pw = () => randomBytes(18).toString('base64url')

const IZMIR = 'test-izmir-ges-2026'
const KAYSERI = 'test-kayseri-develi-ges'
const today = new Date()
const day = (n) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10)

// ── Projeler ve kodları ──
await must('projeler', sb.from('projects').insert([
  { id: IZMIR, name: 'Ege Enerji İzmir GES – TEST', location: 'İzmir', capacity_kwp: 4800, start_date: day(-60), target_date: day(120), total_days: 180, status: 'aktif', project_type: 'arazi' },
  { id: KAYSERI, name: 'Kayseri Develi GES', location: 'Kayseri', capacity_kwp: 2500, start_date: day(-20), target_date: day(160), total_days: 180, status: 'aktif', project_type: 'arazi' },
]))
await must('proje kodları', sb.from('project_register_settings').insert([
  { project_id: IZMIR, prefix: 'TIZ' }, { project_id: KAYSERI, prefix: 'TKY' },
]))

// ── Kullanıcılar (handle_new_user profili ve proje erişimini meta veriden kurar) ──
// Osman Karadoğan ve Cem Aslan kimlikleri canlıdaki fonksiyon gövdelerinde sabit (onaylayıcı rol yönlendirmesi).
const users = {
  ADMIN:             { email: 'admin@fons.local', role_key: 'admin', full_name: 'Yerel Admin' },
  PROJEYONETICISI:   { email: 'pm@fons.local', role_key: 'proje_yoneticisi', full_name: 'Yerel Proje Yöneticisi', project_id: IZMIR },
  IZMIR:             { email: 'santiye.izmir@fons.local', role_key: 'santiye_sefi', full_name: 'Yerel Şantiye Şefi', project_id: IZMIR },
  MUHASEBE:          { email: 'muhasebe@fons.local', role_key: 'muhasebe', full_name: 'Yerel Muhasebe' },
  OSMANKARADOGAN:    { email: 'osman@fons.local', role_key: 'admin', full_name: 'Osman Karadoğan', id: 'c87088e5-40b2-4d04-9403-1b22babbc31e' },
  CEMASLAN:          { email: 'cem@fons.local', role_key: 'admin', full_name: 'Cem Aslan', id: '30431df3-a9ae-4f06-9031-335488f8f656' },
}
const seedEnv = { TEST_PROJECT_IZMIR: IZMIR, TEST_PROJECT_KAYSERI: KAYSERI }
const ids = {}
for (const [key, u] of Object.entries(users)) {
  const password = pw()
  const { data, error } = await sb.auth.admin.createUser({
    ...(u.id ? { id: u.id } : {}),
    email: u.email, password, email_confirm: true,
    user_metadata: { role_key: u.role_key, full_name: u.full_name, ...(u.project_id ? { project_id: u.project_id } : {}) },
  })
  if (error) throw new Error(`kullanıcı ${key}: ${error.message}`)
  ids[key] = data.user.id
  // Tetikleyici yoksa ya da farklı çalıştıysa profili garanti et
  await must(`profil ${key}`, sb.from('profiles').upsert({ id: data.user.id, email: u.email, full_name: u.full_name, role_key: u.role_key, project_id: u.project_id ?? null }))
  seedEnv[`TEST_${key}_EMAIL`] = u.email
  seedEnv[`TEST_${key}_PASSWORD`] = password
}

// ── İzmir: grup etiketli, bir kısmı ilerlemeli görevler (yalnızca varsayılan ağırlıklı kategoriler) ──
const T = (code, name, category, group, s, e, extra = {}) => ({
  project_id: IZMIR, task_code: code, task_name: name, category, group_label: group,
  planned_start: day(s), planned_end: day(e), ...extra,
})
const tasks = await must('görevler', sb.from('project_tasks').insert([
  T('M-010', 'Kolon montajı Blok 1', 'kolon_montaji', 'Mekanik Bölüm › Blok 1', -50, -10, { unit: 'adet', target_qty: 400 }),
  T('M-020', 'Kiriş montajı Blok 1', 'kiris_montaji', 'Mekanik Bölüm › Blok 1', -40, 5, { unit: 'adet', target_qty: 400 }),
  T('M-030', 'Aşık montajı Blok 1', 'asik_montaji', 'Mekanik Bölüm › Blok 1', -30, 15, { unit: 'adet', target_qty: 800 }),
  T('M-040', 'Panel montajı Blok 1', 'panel_montaji', 'Mekanik Bölüm › Blok 1', -20, 30, { unit: 'adet', target_qty: 5000 }),
  T('M-110', 'Kolon montajı Blok 2', 'kolon_montaji', 'Mekanik Bölüm › Blok 2', -10, 30, { unit: 'adet', target_qty: 400 }),
  T('E-010', 'DC kablo çekimi Inverter-1', 'elektrik_dc', 'Elektriksel Bölüm › Inverter-1 › DC', -15, 25, { unit: 'm', target_qty: 12000 }),
  T('E-020', 'AC kablo çekimi Inverter-1', 'elektrik_ac', 'Elektriksel Bölüm › Inverter-1 › AC', -5, 35),
  T('E-030', 'OG hücre montajı', 'elektrik_og', 'Elektriksel Bölüm › OG', 10, 50),
  T('E-040', 'Topraklama', 'topraklama', 'Elektriksel Bölüm › Topraklama', -25, 20, { unit: 'm', target_qty: 3000 }),
  T('K-010', 'Köşk trafo yerleşimi', 'kosk_trafo', 'Elektriksel Bölüm › Köşk', 20, 60),
  T('D-010', 'Devreye alma testleri', 'devreye_alma', 'Kabul', 70, 110),
]).select('id, task_code'))
const tid = Object.fromEntries(tasks.map((t) => [t.task_code, t.id]))

// İlerleme: iki günlük rapor, şantiye şefi adına (sync trigger'ları görev ve proje yüzdesini günceller)
const reports = await must('günlük raporlar', sb.from('daily_reports').insert([
  { project_id: IZMIR, report_date: day(-3), created_by: ids.IZMIR, weather: 'açık', general_status: 'normal', worker_count: 42 },
  { project_id: IZMIR, report_date: day(-2), created_by: ids.IZMIR, weather: 'açık', general_status: 'normal', worker_count: 45 },
]).select('id, report_date'))
const rep = Object.fromEntries(reports.map((r) => [r.report_date, r.id]))
await must('ilerleme', sb.from('progress_daily').insert([
  { report_id: rep[day(-3)], task_id: tid['M-010'], qty_added: 220, source: 'daily_report', entered_by: ids.IZMIR },
  { report_id: rep[day(-2)], task_id: tid['M-010'], qty_added: 120, source: 'daily_report', entered_by: ids.IZMIR },
  { report_id: rep[day(-3)], task_id: tid['M-020'], qty_added: 150, source: 'daily_report', entered_by: ids.IZMIR },
  { report_id: rep[day(-2)], task_id: tid['E-010'], qty_added: 2500, source: 'daily_report', entered_by: ids.IZMIR },
  { report_id: rep[day(-2)], task_id: tid['E-040'], qty_added: 900, source: 'daily_report', entered_by: ids.IZMIR },
]))

// Kayseri: birkaç basit görev
await must('kayseri görevleri', sb.from('project_tasks').insert([
  { project_id: KAYSERI, task_code: 'KY-010', task_name: 'Kolon montajı', category: 'kolon_montaji', planned_start: day(-10), planned_end: day(30), unit: 'adet', target_qty: 200 },
  { project_id: KAYSERI, task_code: 'KY-020', task_name: 'Panel montajı', category: 'panel_montaji', planned_start: day(5), planned_end: day(60), unit: 'adet', target_qty: 3000 },
]))

// ── WBS / alan (İzmir; şablondaki kurgu yapı) ──
const wbsRows = [
  ['TIZ-100', 'Mobilizasyon', null, 'general'], ['TIZ-200', 'Mekanik Montaj', null, 'mechanical'],
  ['TIZ-210', 'Kazık Çakımı', 'TIZ-200', 'mechanical'], ['TIZ-220', 'Konstrüksiyon Montajı', 'TIZ-200', 'mechanical'],
  ['TIZ-300', 'DC Elektrik', null, 'dc'], ['TIZ-310', 'DC Kablo Çekimi', 'TIZ-300', 'dc'],
]
const wbsId = {}
for (const [code, name, parent, disc] of wbsRows) {
  const row = await must(`WBS ${code}`, sb.from('project_wbs').insert({
    project_id: IZMIR, wbs_code: code, name, parent_id: parent ? wbsId[parent] : null, ...(drafts ? { discipline: disc } : {}),
  }).select('id').single())
  wbsId[code] = row.id
}
const areaRows = [['GES', 'TIZ GES Sahası', 'ges', null], ['B1', 'PV Blok 1', 'pv_blok', 'GES'], ['B2', 'PV Blok 2', 'pv_blok', 'GES'],
  ['INV1', 'İnverter İstasyonu 1', 'inverter_station', 'B1'], ['DEPO', 'Saha Deposu', 'depo', null]]
const areaId = {}
for (const [code, name, type, parent] of areaRows) {
  const row = await must(`alan ${code}`, sb.from('project_areas').insert({
    project_id: IZMIR, area_code: code, name, area_type: type, parent_id: parent ? areaId[parent] : null,
  }).select('id').single())
  areaId[code] = row.id
}
await must('alan-WBS', sb.from('area_wbs').insert([
  { project_id: IZMIR, area_id: areaId.B1, wbs_id: wbsId['TIZ-210'] },
  { project_id: IZMIR, area_id: areaId.B2, wbs_id: wbsId['TIZ-210'] },
  { project_id: IZMIR, area_id: areaId.B1, wbs_id: wbsId['TIZ-310'] },
]))

mkdirSync(path.join(root, 'supabase', '.local'), { recursive: true })
writeFileSync(path.join(root, 'supabase', '.local', 'seed-env.json'), JSON.stringify(seedEnv, null, 2))
console.log(`  · 2 proje, ${Object.keys(users).length} kullanıcı, ${tasks.length + 2} görev, 2 rapor, 6 WBS, 5 alan, 3 bağ`)
