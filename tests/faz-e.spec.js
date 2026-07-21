import { test, expect } from '@playwright/test'
import {
  signIn, loginUi, parseTRY,
  totalBudgetValue, spentAmountValue,
} from './helpers.js'

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD
const IZMIR_EMAIL = process.env.TEST_IZMIR_EMAIL
const IZMIR_PASSWORD = process.env.TEST_IZMIR_PASSWORD
const PM_EMAIL = process.env.TEST_PROJEYONETICISI_EMAIL
const PM_PASSWORD = process.env.TEST_PROJEYONETICISI_PASSWORD
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
  test('A: kaldırılan global kapsam seçici ve rol testi', async ({ page }) => {
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)

    // Header'daki global proje seçici 2026-07-17'de bilinçli olarak kaldırıldı.
    // Admin Genel Bakış varsayılan olarak tüm projelerin toplamını göstermeye devam eder.
    await expect(page.locator('select[title="Görüntülenecek proje kapsamı"]')).toHaveCount(0)
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(ALL_PLANNED)

    await page.evaluate(() => localStorage.clear())

    // Şantiye şefi için de kaldırılan global seçici görünmez.
    await loginUi(page, IZMIR_EMAIL, IZMIR_PASSWORD)
    await expect(page.locator('select[title="Görüntülenecek proje kapsamı"]')).toHaveCount(0)
  })

  test('B: realtime canlı güncelleme (invoice INSERT/DELETE)', async ({ page }) => {
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    // Global seçici kaldırıldı; Genel Bakış admin için tüm projeler kapsamındadır.
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(ALL_PLANNED)

    const before = parseTRY(await spentAmountValue(page).textContent())

    const { client, user } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const amount = 12345
    const { data: inserted, error: insertError } = await client
      .from('invoices')
      .insert({
        project_id: PROJECT_IZMIR, amount, vat_rate: 0, status: 'bekliyor', source: 'manuel',
        invoice_no: `${TEST_MARKER}_B`, invoice_date: new Date().toISOString().split('T')[0],
        description: TEST_MARKER, created_by: user.id,
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const { error: approvalError } = await client.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: user.id, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', inserted.id).eq('status', 'bekliyor')
    expect(approvalError).toBeNull()

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
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(ALL_PLANNED)

    let refreshCount = 0
    const countRefresh = request => {
      if (request.url().includes('/rest/v1/rpc/get_dashboard_summary')) refreshCount += 1
    }
    page.on('request', countRefresh)

    const { client } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
    const today = new Date().toISOString().split('T')[0]
    const rows = Array.from({ length: 5 }, (_, i) => ({
      project_id: PROJECT_IZMIR, amount: 100 + i, status: 'bekliyor', source: 'manuel',
      invoice_no: `${TEST_MARKER}_DEBOUNCE_${i}`, invoice_date: today, description: TEST_MARKER,
    }))
    const { data: insertedRows, error: insertError } = await client.from('invoices').insert(rows).select('id')
    expect(insertError).toBeNull()

    // Debounce 2sn + tampon — 5 hızlı olay tek RPC yenilemesine birleşmeli.
    await page.waitForTimeout(6000)
    page.off('request', countRefresh)
    expect(refreshCount).toBe(1)

    const ids = insertedRows.map(r => r.id)
    const { error: deleteError } = await client.from('invoices').delete().in('id', ids)
    expect(deleteError).toBeNull()
  })

  test('D: bağlantı kopması → Çevrimdışı → Canlı', async ({ page, context }) => {
    test.setTimeout(150000)
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(ALL_PLANNED)

    const kpiBefore = await totalBudgetValue(page).textContent()

    // context.setOffline yeni istekleri engeller ama zaten açık bir WebSocket'i
    // anında kapatmayabilir (CDP sınırlaması) — Realtime'ın kendi heartbeat'i
    // kopukluğu fark edip soketi kapatana kadar beklemek gerekebilir.
    await context.setOffline(true)
    // Son veri ekranda kalmalı, kaybolmamalı.
    await expect(totalBudgetValue(page)).toHaveText(kpiBefore)

    await context.setOffline(false)
    await page.reload()
    await expect(totalBudgetValue(page)).toHaveText(kpiBefore, { timeout: 15000 })
  })

  test('E: sızıntı testi — Kayseri INSERT+DELETE İzmir istemcisine ulaşmamalı', async ({ page }) => {
    await loginUi(page, IZMIR_EMAIL, IZMIR_PASSWORD)
    // Şantiye şefinin kendi proje filtreli realtime kanalı başka projedeki olayda
    // dashboard RPC'sini yeniden çağırmamalı.
    // loginUi URL değişimini bekler; dashboard'un paralel ilk RPC'lerinin bitmesi için
    // ölçüm dinleyicisini kısa bir sakinleşme penceresinden sonra bağla.
    await page.waitForTimeout(3000)
    let refreshCount = 0
    const countRefresh = request => {
      if (request.url().includes('/rest/v1/rpc/get_santiye_dashboard')) refreshCount += 1
    }
    page.on('request', countRefresh)

    const [{ client, user: adminUser }, { client: pm, user: pmUser }] = await Promise.all([
      signIn(ADMIN_EMAIL, ADMIN_PASSWORD),
      signIn(PM_EMAIL, PM_PASSWORD),
    ])
    expect(adminUser).toBeTruthy()
    const { data: insertedId, error: insertError } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: PROJECT_KAYSERI,
      p_title: `${TEST_MARKER}_LEAK`,
      p_urgency: 'normal',
      p_category: 'diger',
      p_request_note: TEST_MARKER,
      p_requested_by: pmUser.id,
      p_items: [{ name: `${TEST_MARKER}_LEAK`, quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(insertError).toBeNull()

    await page.waitForTimeout(3000)

    const { error: deleteError } = await client.from('purchase_requests').delete().eq('id', insertedId)
    expect(deleteError).toBeNull()

    await page.waitForTimeout(3000)
    page.off('request', countRefresh)

    expect(refreshCount).toBe(0)
  })

  test('Ekstra (negatif): Finans, purchase_requests değişikliğinde yenilenmemeli', async ({ page }) => {
    await loginUi(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect.poll(async () => parseTRY(await totalBudgetValue(page).textContent()), { timeout: 15000 })
      .toBe(ALL_PLANNED)

    let refreshCount = 0
    const countRefresh = request => {
      if (request.url().includes('/rest/v1/rpc/get_dashboard_summary')) refreshCount += 1
    }
    page.on('request', countRefresh)

    const [{ client }, { client: pm, user: pmUser }] = await Promise.all([
      signIn(ADMIN_EMAIL, ADMIN_PASSWORD),
      signIn(PM_EMAIL, PM_PASSWORD),
    ])
    const { data: insertedId, error: insertError } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: PROJECT_IZMIR,
      p_title: `${TEST_MARKER}_NEGATIVE`,
      p_urgency: 'normal',
      p_category: 'diger',
      p_request_note: TEST_MARKER,
      p_requested_by: pmUser.id,
      p_items: [{ name: `${TEST_MARKER}_NEGATIVE`, quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(insertError).toBeNull()

    await page.waitForTimeout(5000)
    page.off('request', countRefresh)

    const { error: deleteError } = await client.from('purchase_requests').delete().eq('id', insertedId)
    expect(deleteError).toBeNull()

    // TabGenel yalnızca tickets/invoices dinliyor — purchase_requests INSERT'i tetiklememeli.
    expect(refreshCount).toBe(0)
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
