import { existsSync, mkdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dotenv from 'dotenv'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(scriptDir, '.env.local')

if (!existsSync(envPath)) {
  console.error(`HATA: ${envPath} bulunamadi.`)
  console.error('Once .env.local.example dosyasini ayni klasorde .env.local olarak kopyalayip SUPABASE_DB_URL degiskenini doldurun.')
  process.exit(1)
}

dotenv.config({ path: envPath })

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('HATA: SUPABASE_DB_URL bos. .env.local dosyasini kontrol edin.')
  process.exit(1)
}

const backupDir = path.join(scriptDir, 'backups')
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const outFile = path.join(backupDir, `dump_${stamp}.sql`)

console.log(`Yedek aliniyor -> ${outFile}`)

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(npxCmd, ['supabase@latest', 'db', 'dump', '--db-url', dbUrl, '-f', outFile], {
  stdio: 'inherit',
})

if (result.error) {
  console.error('Yedek alma baslatilamadi:', result.error.message)
  process.exit(1)
}
if (result.status !== 0) {
  console.error('Yedek alma basarisiz oldu (supabase CLI hata verdi).')
  process.exit(result.status ?? 1)
}
if (!existsSync(outFile)) {
  console.error('HATA: Dump dosyasi olusmadi.')
  process.exit(1)
}

const sizeKb = (statSync(outFile).size / 1024).toFixed(1)
console.log(`Tamamlandi: ${outFile} (${sizeKb} KB)`)
