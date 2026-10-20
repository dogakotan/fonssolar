import { defineConfig } from '@playwright/test'

// Register ekranı — ağ taklitli Playwright kurulumu (canlı veya yerel Supabase GEREKMEZ).
// Vite, var olmayan bir Supabase adresiyle (127.0.0.1:54399) ayrı portta başlatılır; bütün istekler test içinde
// page.route ile karşılanır. Ortam değişkeni .env dosyasından önce gelir (Vite kuralı), canlıya istek gidemez;
// spec ayrıca supabase.co'ya giden isteği yakalarsa testi düşürür. Koşturma:
//   npx playwright test -c playwright.register-mock.config.js
const PORT = 5191
export const MOCK_SUPABASE_URL = 'http://127.0.0.1:54399'

export default defineConfig({
  testDir: './tests-register-mock',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      VITE_SUPABASE_URL: MOCK_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
    },
  },
})
