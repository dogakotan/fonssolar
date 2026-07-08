import { createClient } from '@supabase/supabase-js'
import { expect } from '@playwright/test'

export function makeClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
}

export async function signIn(email, password) {
  const client = makeClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`)
  return { client, user: data.user }
}

export async function loginUi(page, email, password) {
  await page.goto('/login')
  await page.getByPlaceholder('E-posta adresinizi giriniz').fill(email)
  await page.getByPlaceholder('Şifrenizi giriniz').fill(password)
  await page.getByRole('button', { name: 'Giriş Yap' }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

// "73.182.750 ₺" / "₺73.182.750" gibi yerelleştirilmiş para metinlerinden
// sadece rakamları çıkarıp sayıya çevirir — tam string eşleşmesi yerine
// (sembol/boşluk yerleşimi ICU sürümüne göre değişebilir) sağlam bir karşılaştırma.
export function parseTRY(text) {
  const digits = (text || '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : NaN
}

export async function waitForRealtimeLive(page, timeout = 15000) {
  await expect(page.getByText('Canlı', { exact: true }).first()).toBeVisible({ timeout })
}

export function financeCard(page) {
  return page.locator('.stat-card', { has: page.locator('.stat-label', { hasText: 'Finans Özeti' }) })
}

export function totalBudgetValue(page) {
  return financeCard(page).locator('.stat-value').first()
}

export function spentAmountValue(page) {
  return page.locator('span:text-is("Gerçekleşen") + strong')
}

export function scopeSelect(page) {
  return page.locator('select[title="Görüntülenecek proje kapsamı"]')
}
