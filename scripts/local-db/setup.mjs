// Yerel test ortamını kurar (Faz 1 Adım 5, Karar 52). Canlıya HİÇBİR ŞEY yazmaz; yalnızca yerel Docker yığını.
//
//   node scripts/local-db/setup.mjs [--baseline <döküm.sql>] [--no-drafts] [--f1-a4] [--no-seed]
//
// Adımlar:
//   1. Docker ve Supabase CLI kontrolü
//   2. Yığını supabase/local/stack çalışma dizininden başlatır (migration'sız) ve veritabanını sıfırlar
//   3. Taban şema: --baseline ile verilen ya da scripts/db-backup/backups/ altındaki en yeni dump_*.sql
//      (npm run db:backup çıktısı; kullanıcı çalıştırır, bu betik .env dosyası okumaz)
//   4. supabase/local/reference_data.sql (auth tetikleyicisi, roller/navigasyon, bucket'lar)
//   5. Faz 1 taslakları Adım 6 sırasıyla (--no-drafts ile atlanır; kalibrasyon koşusu için):
//      B1 → B2 → B4 → F1 A1-A3 (--f1-a4 ile A4 de) → AID → Adım 4 → Adım 5
//   6. Tohum veri (seed.mjs) ve supabase/.local/env.json (Playwright ve yerel Vite bunu okur; gitignore'da)
// Anahtarlar ve şifreler ekrana yazılmaz.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const stackDir = path.join(root, 'supabase', 'local', 'stack')
const draftsDir = path.join(root, 'docs', 'proje-kontrol', 'taslak-sql')
const outDir = path.join(root, 'supabase', '.local')
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
// npx doğrudan node ile çağrılır: Windows'ta .cmd dosyası shell'siz çalıştırılamıyor, repo yolu boşluk/ü içeriyor.
// Proje bağımlılığı olarak kurulmuşsa (npm i -D supabase) yerel CLI kullanılır.
const localCli = path.join(root, 'node_modules', 'supabase', 'bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase')
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
const npx = existsSync(localCli) ? localCli : process.execPath
const CLI = existsSync(localCli) ? [] : [npxCli, '--yes', 'supabase@latest']
const DB_CONTAINER = 'supabase_db_fons-local'

function run(cmd, cmdArgs, { input, quiet = false, allowFail = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, input, encoding: 'utf8', shell: false, maxBuffer: 256 * 1024 * 1024 })
  if (r.error) throw new Error(`${cmd} başlatılamadı: ${r.error.message}`)
  if (r.status !== 0 && !allowFail) {
    if (!quiet) process.stderr.write((r.stderr || '').slice(-4000))
    throw new Error(`${cmd} ${cmdArgs.slice(0, 3).join(' ')} … başarısız (çıkış ${r.status})`)
  }
  return r
}
const supa = (a, o) => run(npx, [...CLI, ...a, '--workdir', stackDir], o)

function psqlFile(label, sql) {
  process.stdout.write(`  · ${label} … `)
  const r = run('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: sql, allowFail: true })
  if (r.status !== 0) {
    console.log('HATA')
    process.stderr.write((r.stderr || '').slice(-4000) + '\n')
    throw new Error(`${label} uygulanamadı`)
  }
  console.log('tamam')
}

// Taslak dosyasının BÖLÜM A gövdesi (ilk "begin;" ile onu izleyen "commit;" arası), isteğe bağlı bir bölümden önce kesilir
function partA(file, stopAt = null) {
  const L = readFileSync(path.join(draftsDir, file), 'utf8').split(/\r?\n/)
  const s = L.findIndex((l) => l.trim() === 'begin;')
  const e = L.findIndex((l, i) => i > s && l.trim() === 'commit;')
  if (s < 0 || e < 0) throw new Error(`BÖLÜM A bulunamadı: ${file}`)
  let end = e
  if (stopAt) {
    const k = L.findIndex((l, i) => i > s && l.startsWith(stopAt))
    if (k < 0) throw new Error(`${stopAt} bulunamadı: ${file}`)
    end = k
  }
  return 'begin;\n' + L.slice(s + 1, end).join('\n') + '\ncommit;\n'
}

function latestDump() {
  const dir = path.join(root, 'scripts', 'db-backup', 'backups')
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => /^dump_.*\.sql$/.test(f)).sort()
  return files.length ? path.join(dir, files[files.length - 1]) : null
}

console.log('1 · Ön kontrol')
run('docker', ['info'], { quiet: true })
console.log('  · Docker çalışıyor')
const ver = supa(['--version'], { quiet: true })
console.log(`  · Supabase CLI ${ver.stdout.trim()}`)

const baseline = opt('--baseline') ? path.resolve(opt('--baseline')) : latestDump()
if (!baseline || !existsSync(baseline)) {
  throw new Error('Taban şema dökümü yok. Önce `npm run db:backup` (kullanıcı) ya da --baseline <dosya>.')
}
console.log(`  · Taban: ${path.relative(root, baseline)} (${(statSync(baseline).size / 1024).toFixed(0)} KB)`)

console.log('2 · Yerel yığın')
supa(['start'])
supa(['db', 'reset'])
const status = JSON.parse(supa(['status', '-o', 'json'], { quiet: true }).stdout)
const apiUrl = status.API_URL
const anonKey = status.ANON_KEY
const serviceKey = status.SERVICE_ROLE_KEY
if (!apiUrl || !anonKey || !serviceKey) throw new Error('supabase status çıktısında API_URL / ANON_KEY / SERVICE_ROLE_KEY yok')
console.log(`  · API ${apiUrl}`)

console.log('3 · Taban şema ve referans veri')
psqlFile('taban şema', readFileSync(baseline, 'utf8'))
psqlFile('referans veri', readFileSync(path.join(root, 'supabase', 'local', 'reference_data.sql'), 'utf8'))

if (!flag('--no-drafts')) {
  console.log('4 · Faz 1 taslakları (Adım 6 sırası)')
  psqlFile('B1 register_permissions', partA('b1_register_permissions.sql'))
  psqlFile('B2 register_audit + indeksler', partA('b2_register_audit_indexes.sql'))
  psqlFile('B4 kimlik koruması', partA('b4_identity_guard_admin_fix.sql'))
  psqlFile(flag('--f1-a4') ? 'F1 A1-A4' : 'F1 A1-A3', partA('f1_proje_kodu_ve_olusturma.sql', flag('--f1-a4') ? null : '-- ── A4'))
  psqlFile('AID Activity ID', partA('f1_aid_activity_id.sql'))
  psqlFile('Adım 4 WBS/alan', partA('f1_wbs_alan_import.sql'))
  psqlFile('Adım 5 ekran RPC', partA('f1_adim5_ekran_rpc.sql'))
} else {
  console.log('4 · Taslaklar atlandı (--no-drafts)')
}

let env = { VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: anonKey }
if (!flag('--no-seed')) {
  console.log('5 · Tohum veri')
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'local-db', 'seed.mjs')], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, LOCAL_SUPABASE_URL: apiUrl, LOCAL_ANON_KEY: anonKey, LOCAL_SERVICE_ROLE_KEY: serviceKey,
           LOCAL_DRAFTS: flag('--no-drafts') ? '0' : '1' },
  })
  process.stdout.write(r.stdout || '')
  if (r.status !== 0) { process.stderr.write((r.stderr || '').slice(-4000)); throw new Error('Tohum başarısız') }
  env = { ...env, ...JSON.parse(readFileSync(path.join(outDir, 'seed-env.json'), 'utf8')) }
}

mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, 'env.json'), JSON.stringify({ ...env, LOCAL_DRAFTS: flag('--no-drafts') ? '0' : '1' }, null, 2))
console.log('6 · supabase/.local/env.json yazıldı (gitignore). Testler: npm run test:e2e')
