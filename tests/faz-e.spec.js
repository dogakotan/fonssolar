import { test, expect } from '@playwright/test'
import {
  signIn, loginUi, parseTRY, waitForRealtimeLive,
  totalBudgetValue, spentAmountValue, scopeSelect,
} from './helpers.js'

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD
const IZMIR_EMAIL = process.env.TEST_IZMIR_EMAIL
const IZMIR_PASSWORD = process.env.TEST_IZMIR_PASSWORD
const PROJECT_IZMIR = process.env.TEST_PROJECT_IZMIR
const PROJECT_KAYSERI = process.env.TEST_PROJECT_KAYSERI

const IZMIR_PLANNED = 43962750
const KAYSERI_PLANNED = 29220000
const ALL_PLANNED = IZMIR_PLANNED + KAYSERI_PLANNED

// Bu suite'in kendi oluşturduğu her satırı kendi temizlemesi gerekiyor (madde 4).
// invoices/purchase_requests admin DELETE hakkına sahip (bkz. migration
// add_purchase_requests_admin_delete_policy) — tickets'ta yok, o yüzden
// debounce testi de invoices üzerinden kuruldu.
const TEST_MARKER = 'FAZ_E_SUITE_TEST'

test.describe.configure({ mode: 'serial' })

test.describe('Faz E — otomatik regresyon suite', () => {
  test('A: kapsam seçici ve rol testi', async ({ page }) => {
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)

    const select = scopeSelect(page)
    await expect(select).toBeVisible()
    const optionTexts = await select.locator('option').allTextContents()
    expect(optionTexts).toHaveLength(3)
    expect(optionTexts).toContain('Tüm Projeler')

    // Varsayılan: Tüm Projeler
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(ALL_PLANNED)

    // İzmir'e geç
    await select.selectOption({ value: PROJECT_IZMIR })
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(IZMIR_PLANNED)

    // Kayseri'ye geç
    await select.selectOption({ value: PROJECT_KAYSERI })
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(KAYSERI_PLANNED)

    await page.evaluate(() => localStorage.clear())

    // santiye_sefi (İzmir test hesabı) — kapsam seçici hiç görünmemeli
    await loginUi(page, IZMIR_EMAIL, IZMIR_PASSWORD)
    await expect(scopeSelect(page)).toHaveCount(0)
  })

  test('B: realtime canlı güncelleme (invoice INSERT/DELETE)', async ({ page }) => {
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await scopeSelect(page).selectOption({ value: PROJECT_IZMIR })
    // Kapsam geçişinin RPC refetch'i tamamlamasını bekle — aksi halde "before"
    // hâlâ "Tüm Projeler" anındaki değeri yakalar (bkz. test D'deki aynı hata).
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(IZMIR_PLANNED)
    await waitForRealtimeLive(page)

    const before = parseTRY(await spentAmountValue(page).textContent())

    const { client } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const amount = 12345
    const { data: inserted, error: insertError } = await client
      .from('invoices')
      .insert({
        project_id: PROJECT_IZMIR, amount, status: 'muhasebe_onayında', source: 'manuel',
        invoice_no: `${TEST_MARKER}_B`, invoice_date: new Date().toISOString().split('T')[0],
        description: TEST_MARKER,
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    try {
      await expect.poll(async () => parseTRY(await spentAmountValue(page).textContent()), { timeout: 10000, intervals: [500] })
        .toBe(before + amount)
    } finally {
      const { error: deleteError } = await client.from('invoices').delete().eq('id', inserted.id)
      expect(deleteError).toBeNull()
    }

    await expect.poll(async () => parseTRY(await spentAmountValue(page).textContent()), { timeout: 10000, intervals: [500] })
      .toBe(before)
  })

  test('C: debounce — 5 hızlı kayıt → tek yenileme', async ({ page }) => {
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await scopeSelect(page).selectOption({ value: PROJECT_IZMIR })
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(IZMIR_PLANNED)
    await waitForRealtimeLive(page)

    let mutationCount = 0
    await page.exposeFunction('__onLastUpdateMutation', () => { mutationCount += 1 })
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('*')]
        .find(el => el.children.length === 0 && el.textContent?.includes('Son güncelleme:'))
      if (!label) throw new Error('Son güncelleme etiketi bulunamadı')
      const observer = new MutationObserver(() => window.__onLastUpdateMutation())
      observer.observe(label, { characterData: true, childList: true, subtree: true })
      window.__fazEObserver = observer
    })

    const { client } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const today = new Date().toISOString().split('T')[0]
    const rows = Array.from({ length: 5 }, (_, i) => ({
      project_id: PROJECT_IZMIR, amount: 100 + i, status: 'bekliyor', source: 'manuel',
      invoice_no: `${TEST_MARKER}_DEBOUNCE_${i}`, invoice_date: today, description: TEST_MARKER,
    }))
    const { data: insertedRows, error: insertError } = await client.from('invoices').insert(rows).select('id')
    expect(insertError).toBeNull()

    // Debounce 2sn + tampon — 6sn bekleyip mutasyon sayısını kontrol et.
    await page.waitForTimeout(6000)
    await page.evaluate(() => window.__fazEObserver?.disconnect())

    const ids = insertedRows.map(r => r.id)
    const { error: deleteError } = await client.from('invoices').delete().in('id', ids)
    expect(deleteError).toBeNull()

    expect(mutationCount).toBe(1)
  })

  test('D: bağlantı kopması → Çevrimdışı → Canlı', async ({ page, context }) => {
    test.setTimeout(150000)
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await scopeSelect(page).selectOption({ value: PROJECT_IZMIR })
    // Kapsam değişikliğinin RPC refetch'i tamamlamasını bekle — aksi halde
    // aşağıdaki kpiBefore hâlâ "Tüm Projeler" değerini yakalar.
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(IZMIR_PLANNED)
    await waitForRealtimeLive(page)

    const kpiBefore = await totalBudgetValue(page).textContent()

    // context.setOffline yeni istekleri engeller ama zaten açık bir WebSocket'i
    // anında kapatmayabilir (CDP sınırlaması) — Realtime'ın kendi heartbeat'i
    // kopukluğu fark edip soketi kapatana kadar beklemek gerekebilir.
    await context.setOffline(true)
    await expect(page.getByText('Çevrimdışı', { exact: true }).first()).toBeVisible({ timeout: 60000 })
    // Son veri ekranda kalmalı, kaybolmamalı.
    await expect(totalBudgetValue(page)).toHaveText(kpiBefore)

    await context.setOffline(false)
    await expect(page.getByText('Canlı', { exact: true }).first()).toBeVisible({ timeout: 60000 })
  })

  test('E: sızıntı testi — Kayseri INSERT+DELETE İzmir istemcisine ulaşmamalı', async ({ page }) => {
    await loginUi(page, IZMIR_EMAIL, IZMIR_PASSWORD)
    // santiye_sefi'nin kendi "Genel Bakış" ekranı — project_id filtreli realtime kanalı.
    await waitForRealtimeLive(page)

    let mutationCount = 0
    await page.exposeFunction('__onLeakMutation', () => { mutationCount += 1 })
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('*')]
        .find(el => el.children.length === 0 && el.textContent?.includes('Son güncelleme:'))
      if (!label) throw new Error('Son güncelleme etiketi bulunamadı')
      const observer = new MutationObserver(() => window.__onLeakMutation())
      observer.observe(label, { characterData: true, childList: true, subtree: true })
      window.__fazELeakObserver = observer
    })

    const { client } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const { data: inserted, error: insertError } = await client
      .from('purchase_requests')
      .insert({ project_id: PROJECT_KAYSERI, title: `${TEST_MARKER}_LEAK` })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    await page.waitForTimeout(3000)

    const { error: deleteError } = await client.from('purchase_requests').delete().eq('id', inserted.id)
    expect(deleteError).toBeNull()

    await page.waitForTimeout(3000)
    await page.evaluate(() => window.__fazELeakObserver?.disconnect())

    expect(mutationCount).toBe(0)
  })

  test('Ekstra (negatif): Finans, purchase_requests değişikliğinde yenilenmemeli', async ({ page }) => {
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await scopeSelect(page).selectOption({ value: PROJECT_IZMIR })
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(IZMIR_PLANNED)
    await waitForRealtimeLive(page)

    let mutationCount = 0
    await page.exposeFunction('__onNegativeMutation', () => { mutationCount += 1 })
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('*')]
        .find(el => el.children.length === 0 && el.textContent?.includes('Son güncelleme:'))
      if (!label) throw new Error('Son güncelleme etiketi bulunamadı')
      const observer = new MutationObserver(() => window.__onNegativeMutation())
      observer.observe(label, { characterData: true, childList: true, subtree: true })
      window.__fazENegObserver = observer
    })

    const { client } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const { data: inserted, error: insertError } = await client
      .from('purchase_requests')
      .insert({ project_id: PROJECT_IZMIR, title: `${TEST_MARKER}_NEGATIVE` })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    await page.waitForTimeout(5000)
    await page.evaluate(() => window.__fazENegObserver?.disconnect())

    const { error: deleteError } = await client.from('purchase_requests').delete().eq('id', inserted.id)
    expect(deleteError).toBeNull()

    // TabGenel yalnızca tickets/invoices dinliyor — purchase_requests INSERT'i tetiklememeli.
    expect(mutationCount).toBe(0)
  })

  test('F: zaman serisi — aylık grafik boşluksuz (API seviyesinde)', async () => {
    const { client } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const { data, error } = await client.rpc('get_finans_overview_all', { p_as_of_date: new Date().toISOString().split('T')[0] })
    expect(error).toBeNull()
    const curve = data.curve || []
    expect(curve.length).toBeGreaterThan(0)

    const currentMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    for (const point of curve) {
      // planned kümülatif EV eğrisi — gelecek aylar dahil hep dolu olmalı (boşluk yok).
      expect(point.planned).not.toBeNull()
      expect(typeof point.planned).toBe('number')
      // actual yalnızca bugüne kadarki aylarda dolu olmalı; gelecek aylarda
      // henüz gerçekleşmediği için bilinçli olarak null (0'dan farklı bir anlam).
      const pointMonth = new Date(`${point.month}T00:00:00Z`)
      if (pointMonth.getTime() <= currentMonthStart.getTime()) {
        expect(point.actual).not.toBeNull()
        expect(typeof point.actual).toBe('number')
      }
    }

    for (let i = 1; i < curve.length; i++) {
      const prev = new Date(`${curve[i - 1].month}T00:00:00Z`)
      const cur = new Date(`${curve[i].month}T00:00:00Z`)
      const expectedNext = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1))
      expect(cur.getTime()).toBe(expectedNext.getTime())
    }
  })

  test.afterAll(async () => {
    const { client } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const { data: leftoverInvoices } = await client.from('invoices').select('id').ilike('description', `${TEST_MARKER}%`)
    const { data: leftoverRequests } = await client.from('purchase_requests').select('id').ilike('title', `${TEST_MARKER}%`)
    expect(leftoverInvoices || [], 'invoices tablosunda test kalıntısı kalmamalı').toHaveLength(0)
    expect(leftoverRequests || [], 'purchase_requests tablosunda test kalıntısı kalmamalı').toHaveLength(0)
  })
})
