import { test, expect } from '@playwright/test'
import { signIn, loginUi } from './helpers.js'

const marker = `E2E_NOTIFY_RT_${Date.now()}`

test.describe.serial('Bildirim gerçek zaman ve kullanıcı izolasyonu', () => {
  let admin, pm, adminId, pmId, requestId, notificationId

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;[adminId, pmId] = await Promise.all([
      admin.auth.getUser().then(result => result.data.user.id),
      pm.auth.getUser().then(result => result.data.user.id),
    ])
  })

  test.afterAll(async () => {
    if (requestId) await admin.from('purchase_requests').delete().eq('id', requestId)
  })

  test('yönetici bildirimi yenilemeden görür, yalnız sahibi okuyabilir ve tekilleşir', async ({ page }) => {
    await loginUi(page, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Bildirimler', exact: true }).click()
    await expect(page.getByText('Bildirimler', { exact: true }).first()).toBeVisible()

    const { data: createdId, error: createError } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: process.env.TEST_PROJECT_IZMIR,
      p_title: marker,
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: marker, quantity: 1, unit: 'adet', bom_item_id: null }],
    })
    expect(createError).toBeNull()
    requestId = createdId

    await expect.poll(async () => {
      const { data } = await admin.from('notifications')
        .select('id,is_read,recipient_id').eq('entity_id', requestId).eq('event_type', 'created')
      if (data?.length === 1) {
        notificationId = data[0].id
        return { count: data.length, recipient: data[0].recipient_id, read: data[0].is_read }
      }
      return { count: data?.length || 0 }
    }).toEqual({ count: 1, recipient: adminId, read: false })

    const notification = page.locator(`[data-entity-id="${requestId}"]`)
    await expect(notification).toBeVisible({ timeout: 15000 })
    await expect(notification.getByText(/satın alma talebi/i)).toBeVisible()

    const { data: foreignRead } = await pm.from('notifications').select('id').eq('id', notificationId)
    expect(foreignRead).toHaveLength(0)
    const { data: foreignUpdate, error: foreignUpdateError } = await pm.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() }).eq('id', notificationId).select('id')
    expect(foreignUpdateError).toBeNull()
    expect(foreignUpdate).toHaveLength(0)

    await notification.click()
    await expect.poll(async () => {
      const { data } = await admin.from('notifications').select('is_read,read_at').eq('id', notificationId).single()
      return Boolean(data?.is_read && data?.read_at)
    }).toBe(true)

    const { count } = await admin.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('entity_id', requestId).eq('event_type', 'created')
    expect(count).toBe(1)
  })
})
