import { defineConfig } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import dotenv from 'dotenv'

// Hedef (Karar 52): varsayılan YEREL Supabase (scripts/local-db/setup.mjs). Canlıya karşı koşmak yalnızca açık
// PW_TARGET=live ile mümkün; o durumda eski davranış: .env.test + npm run dev (5173).
// Yerel modda .env dosyası okunmaz: adres, anon anahtar ve test kullanıcıları supabase/.local/env.json'dan
// (setup.mjs yazar, gitignore) okunur ve hem test sürecine hem Vite'a ortam değişkeni olarak verilir.
// Yerel Vite ayrı portta (5183) ve reuseExistingServer kapalı: arka planda açık, canlıya bağlı bir dev sunucusu
// yanlışlıkla yeniden kullanılmasın.
const TARGET = process.env.PW_TARGET === 'live' ? 'live' : 'local'

let BASE_URL
let webServer
if (TARGET === 'live') {
  dotenv.config({ path: '.env.test' })
  BASE_URL = process.env.BASE_URL || 'http://localhost:5173'
  webServer = { command: 'npm run dev', url: BASE_URL, reuseExistingServer: true, timeout: 30000 }
} else {
  const envFile = 'supabase/.local/env.json'
  if (!existsSync(envFile)) {
    throw new Error(
      'Yerel test ortamı hazır değil (supabase/.local/env.json yok). Önce: node scripts/local-db/setup.mjs. ' +
      'Canlıya karşı koşmak için açıkça PW_TARGET=live verin.')
  }
  const localEnv = JSON.parse(readFileSync(envFile, 'utf8'))
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(localEnv.VITE_SUPABASE_URL || '')) {
    throw new Error('supabase/.local/env.json yerel bir adres göstermiyor; durduruldu.')
  }
  for (const [k, v] of Object.entries(localEnv)) process.env[k] = String(v)
  BASE_URL = 'http://localhost:5183'
  process.env.BASE_URL = BASE_URL
  webServer = {
    command: 'node node_modules/vite/bin/vite.js --port 5183 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60000,
    env: { VITE_SUPABASE_URL: localEnv.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: localEnv.VITE_SUPABASE_ANON_KEY },
  }
}
process.env.PW_TARGET = TARGET

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer,
})
