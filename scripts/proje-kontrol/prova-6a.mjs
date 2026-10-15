// Faz 1 · Adım 6a tam zincir provası (Karar 68) — psql ile, tek işlem, sonunda ROLLBACK.
//   node scripts/proje-kontrol/prova-6a.mjs --build [--out <dosya>]   → yalnızca SQL üretir, veritabanına bağlanmaz
//   node scripts/proje-kontrol/prova-6a.mjs --run                     → SQL'i üretir ve psql ile koşar (kullanıcı "başla" dedikten sonra)
// Bağlantı: scripts/db-backup ile aynı .env.local (FONS_BACKUP_ENV → C:\fons-yedek\.env.local → repo içi). Adres ekrana yazılmaz.
// Çıktılar (SQL ve günlük) FONS_BACKUP_DIR'in yanındaki "prova" klasörüne ya da C:\fons-yedek\prova'ya yazılır.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const sqlDir = path.join(root, 'docs', 'proje-kontrol', 'taslak-sql')
const args = process.argv.slice(2)
const mode = args.includes('--run') ? 'run' : args.includes('--build') ? 'build' : null
if (!mode) {
  console.error('Kullanım: --build [--out <dosya>] | --run')
  process.exit(1)
}

const read = f => readFileSync(path.join(sqlDir, f), 'utf8').replace(/\r\n/g, '\n')
const md5 = s => createHash('md5').update(s).digest('hex').slice(0, 12)

// BÖLÜM A: "begin;" ile "commit;" arası (ilk çift). Opsiyonel olarak bir başlık işaretinden başlayıp bir başkasında biter.
function partA(file, { from = null, until = null } = {}) {
  const src = read(file)
  const a0 = src.indexOf('\nbegin;\n')
  const a1 = src.indexOf('\ncommit;\n', a0)
  if (a0 < 0 || a1 < 0) throw new Error(`${file}: BÖLÜM A begin/commit bulunamadı`)
  let body = src.slice(a0 + '\nbegin;\n'.length, a1)
  if (from) {
    const i = body.indexOf(from)
    if (i < 0) throw new Error(`${file}: başlangıç işareti yok: ${from}`)
    body = body.slice(i)
  }
  if (until) {
    const i = body.indexOf(until)
    if (i < 0) throw new Error(`${file}: bitiş işareti yok: ${until}`)
    body = body.slice(0, i)
  }
  return body
}
// Doğrulama dosyası: tek DO bloğu (do $$ … end $$;). Olduğu gibi alınır.
function wholeDo(file) {
  const src = read(file)
  if (!/^do \$\$/m.test(src)) throw new Error(`${file}: DO bloğu yok`)
  return src
}

const A7_CHECK = `do $a7$
declare v_ss uuid; v_res text; v_n int;
begin
  select count(*) into v_n from pg_policies pol
   where pol.schemaname = 'public'
     and pol.policyname in ('project_areas_insert', 'project_areas_update', 'area_wbs_insert', 'area_wbs_delete');
  if v_n <> 4 then raise exception 'A7: 4 policy bekleniyordu, % bulundu', v_n; end if;
  if exists (select 1 from pg_policies pol
              where pol.schemaname = 'public'
                and pol.policyname in ('project_areas_insert', 'project_areas_update', 'area_wbs_insert', 'area_wbs_delete')
                and coalesce(pol.qual, '') || coalesce(pol.with_check, '') like '%santiye_sefi%') then
    raise exception 'A7: santiye_sefi dalı policy''lerde duruyor';
  end if;
  -- Davranış: TIZ şantiye şefi kendi projesinde alan açamaz (alt işlem; her durumda geri alınır)
  select pr.id into v_ss from public.profiles pr
   where pr.role_key = 'santiye_sefi' and pr.project_id = 'test-izmir-ges-2026' order by pr.id limit 1;
  if v_ss is null then raise exception 'A7: TIZ şantiye şefi profili yok'; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_ss, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.project_areas (project_id, area_code, name) values ('test-izmir-ges-2026', 'ZZA7PROVA', 'A7 prova');
    v_res := 'EKLENDI';
    raise exception 'GERI_AL';
  exception when others then
    if v_res is null then v_res := sqlerrm; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if v_res not like 'new row violates row-level security policy%' then
    raise exception 'A7: şantiye şefi alan ekleyebildi ya da beklenmeyen hata: %', v_res;
  end if;
  raise exception 'DOGRULAMA SONUCU: OK | A7 | 4 policy, santiye_sefi dalı yok, şantiye şefi alan ekleyemedi (RLS)';
end $a7$;`

// Sıra: Karar 68; Adım 2 Oturum 1 gibi B1, B2, B4, F1 kurulup doğrulanır, sonra AID, Adım 4, A7. F1'de A4 hariç ("── A4 ·" başlığından önce kesilir). Adım 5'ten yalnızca A7.
const installs = [
  { id: 'B1', file: 'b1_register_permissions.sql', sql: partA('b1_register_permissions.sql') },
  { id: 'B2', file: 'b2_register_audit_indexes.sql', sql: partA('b2_register_audit_indexes.sql') },
  { id: 'B4', file: 'b4_identity_guard_admin_fix.sql', sql: partA('b4_identity_guard_admin_fix.sql') },
  { id: 'F1 A1-A3', file: 'f1_proje_kodu_ve_olusturma.sql', sql: partA('f1_proje_kodu_ve_olusturma.sql', { until: '-- ── A4 ·' }) },
]
const checksEarly = [
  { id: 'B1 doğrulama', file: 'b1_dogrulama.sql', sql: wholeDo('b1_dogrulama.sql'), expect: 'DOGRULAMA SONUCU: OK | B1' },
  { id: 'B2 doğrulama', file: 'b2_dogrulama.sql', sql: wholeDo('b2_dogrulama.sql'), expect: 'DOGRULAMA SONUCU: OK | B2' },
  { id: 'B4 doğrulama', file: 'b4_dogrulama.sql', sql: wholeDo('b4_dogrulama.sql'), expect: 'DOGRULAMA SONUCU: OK | B4' },
]
const installs2 = [
  { id: 'AID', file: 'f1_aid_activity_id.sql', sql: partA('f1_aid_activity_id.sql') },
  { id: 'Adım 4', file: 'f1_wbs_alan_import.sql', sql: partA('f1_wbs_alan_import.sql') },
  { id: 'Adım 5 A7', file: 'f1_adim5_ekran_rpc.sql', sql: partA('f1_adim5_ekran_rpc.sql', { from: '-- ── A7 ·' }) },
]
const checksLate = [
  { id: 'F1 doğrulama (R1-R27)', file: 'f1_dogrulama.sql', sql: wholeDo('f1_dogrulama.sql'), expect: 'DOGRULAMA SONUCU: OK | F1' },
  { id: 'A7 doğrulama', file: '(prova-6a.mjs)', sql: A7_CHECK, expect: 'DOGRULAMA SONUCU: OK | A7' },
]

// Güvenlik denetimi: hiçbir parçada işlem sonlandıran ifade ya da psql meta komutu kalmamalı.
for (const s of [...installs, ...checksEarly, ...installs2, ...checksLate]) {
  if (/^\s*(commit|end\s+transaction|rollback|begin\s*;|start\s+transaction)\b/im.test(s.sql.replace(/^\s*--.*$/gm, ''))) {
    throw new Error(`${s.id}: parçada işlem kontrol ifadesi var (commit/rollback/begin)`)
  }
  if (/^\s*\\/m.test(s.sql)) throw new Error(`${s.id}: parçada psql meta komutu var`)
  if (s.id === 'F1 A1-A3' && /project_code_missing|trg_projects_require_code/.test(s.sql)) {
    throw new Error('F1 A4 parçaya karıştı')
  }
}

const echo = t => `\\echo '== ${t}'`
const lines = [
  '-- 6a tam zincir provası — ÜRETİLMİŞ DOSYA, elle düzenlemeyin (scripts/proje-kontrol/prova-6a.mjs).',
  '-- Tek işlem; hiçbir yerde COMMIT yok; sonda ROLLBACK. Kurulum hatasında psql durur, bağlantı kapanır, işlem geri alınır.',
  '\\set ON_ERROR_STOP on',
  '\\pset pager off',
  "\\set VERBOSITY default",
  "select 'PROVA BASLADI' as durum, now() as zaman, current_user as kullanici, current_setting('server_version') as surum;",
  'begin;',
  "set local lock_timeout = '3s';",
  "set local statement_timeout = '180s';",
  "set local idle_in_transaction_session_timeout = '300s';",
  `do $guard$ begin
  if (select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()
        and state is not null and state <> 'idle' and backend_type = 'client backend') > 0
     or (select count(*) from pg_stat_activity where xact_start < now() - interval '5 minutes' and pid <> pg_backend_pid()) > 0 then
    raise exception 'PROVA DURDU: aktif bağlantı veya uzun açık işlem var';
  end if;
end $guard$;`,
  "select current_setting('lock_timeout') as lock_timeout, current_setting('statement_timeout') as statement_timeout;",
]
const pushInstall = s => lines.push(echo(`KURULUM ${s.id} (${s.file}, md5 ${md5(s.sql)})`), s.sql)
const pushCheck = (s, n) => lines.push(
  echo(`DOGRULAMA ${s.id} (${s.file}, md5 ${md5(s.sql)})`),
  `savepoint d${n};`, s.sql, `rollback to savepoint d${n};`)

installs.forEach(pushInstall)
lines.push('\\set ON_ERROR_STOP off')
checksEarly.forEach((s, i) => pushCheck(s, i + 1))
lines.push('\\set ON_ERROR_STOP on')
installs2.forEach(pushInstall)
lines.push('\\set ON_ERROR_STOP off')
checksLate.forEach((s, i) => pushCheck(s, i + 10))
lines.push('\\set ON_ERROR_STOP on', 'rollback;', "select 'PROVA BITTI: ROLLBACK' as durum, now() as zaman;")
const out = lines.join('\n\n') + '\n'

const EXTERNAL_ROOT = process.platform === 'win32' ? 'C:\\fons-yedek' : path.join(process.env.HOME || '/', 'fons-yedek')
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const outIdx = args.indexOf('--out')
const workDir = path.join(EXTERNAL_ROOT, 'prova')
const sqlFile = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(workDir, `prova_6a_${stamp}.sql`)
mkdirSync(path.dirname(sqlFile), { recursive: true })
writeFileSync(sqlFile, out)

const all = [...installs, ...checksEarly, ...installs2, ...checksLate]
console.log(`Uretildi: ${sqlFile} (${(Buffer.byteLength(out) / 1024).toFixed(1)} KB, md5 ${md5(out)})`)
for (const s of all) console.log(`  ${s.id.padEnd(24)} ${s.file.padEnd(34)} ${(Buffer.byteLength(s.sql) / 1024).toFixed(1).padStart(6)} KB  md5 ${md5(s.sql)}`)
if (mode === 'build') process.exit(0)

// ── --run ──
let envPath = process.env.FONS_BACKUP_ENV ? path.resolve(process.env.FONS_BACKUP_ENV)
  : existsSync(path.join(EXTERNAL_ROOT, '.env.local')) ? path.join(EXTERNAL_ROOT, '.env.local')
  : path.join(root, 'scripts', 'db-backup', '.env.local')
if (!existsSync(envPath)) { console.error(`HATA: ${envPath} bulunamadi.`); process.exit(1) }
dotenv.config({ path: envPath, quiet: true })
const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) { console.error('HATA: SUPABASE_DB_URL bos.'); process.exit(1) }

const psqlCandidates = ['psql']
if (process.platform === 'win32') psqlCandidates.push('C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe')
const psql = psqlCandidates.find(b => spawnSync(b, ['--version']).status === 0)
if (!psql) { console.error('HATA: psql bulunamadi (PostgreSQL 17 Command Line Tools).'); process.exit(1) }

const logFile = sqlFile.replace(/\.sql$/, '.log')
const r = spawnSync(psql, ['--dbname', dbUrl, '--no-psqlrc', '--echo-errors', '-f', sqlFile],
  { encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '20', PGAPPNAME: 'fons-prova-6a' }, maxBuffer: 64 * 1024 * 1024 })
const log = `${r.stdout || ''}\n--- stderr ---\n${r.stderr || ''}`
writeFileSync(logFile, log)

const summary = [...checksEarly, ...checksLate].map(s => ({ id: s.id, ok: log.includes(s.expect) }))
const finished = log.includes('PROVA BITTI: ROLLBACK')
console.log(`Gunluk: ${logFile}`)
for (const s of summary) console.log(`  ${s.ok ? 'GECTI' : 'KALDI'}  ${s.id}`)
console.log(finished ? 'Islem ROLLBACK ile bitti.' : 'UYARI: "PROVA BITTI" satiri yok — kurulum asamasinda durdu (baglanti kapandi, islem geri alindi).')
process.exit(finished && summary.every(s => s.ok) ? 0 : 2)
