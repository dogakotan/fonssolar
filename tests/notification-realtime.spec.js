import { test, expect } from '@playwright/test'
import { signIn, loginUi } from './helpers.js'

const marker = `E2E_NOTIFY_RT_${Date.now()}`

// 03.09.2026: 3 aşamalı satın alma akışına geçişle create_purchase_request_with_items
// artık admin'i değil proje yöneticisini bildiriyor (teklif toplama aşaması PM'in işi,
// bkz. CLAUDE.md "Satın alma akışı"). Bu test artık PM'i alıcı olarak kullanıyor —
// talebi PM'in KENDİSİ değil santiye şefi oluşturuyor (notify_role kendi requested_by'ını
// hariç tutuyor, aksi halde PM kendi talebinden bildirim almaz).
test.describe.serial('Bildirim gerçek zaman ve kullanıcı izolasyonu', () => {
  let admin, pm, santiye, adminId, pmId, santiyeId, requestId, notificationId

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;[adminId, pmId, santiyeId] = await Promise.all([
      admin.auth.getUser().then(result => result.data.user.id),
      pm.auth.getUser().then(result => result.data.user.id),
      santiye.auth.getUser().then(result => result.data.user.id),
    ])
  })

  test.afterAll(async () => {
    if (requestId) await admin.from('purchase_requests').delete().eq('id', requestId)
  })

  test('proje yöneticisi bildirimi yenilemeden görür, yalnız sahibi okuyabilir ve tekilleşir', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await page.getByRole('button', { name: 'Bildirimler', exact: true }).click()
    await expect(page.getByText('Bildirimler', { exact: true }).first()).toBeVisible()
    // TabBildirimler.jsx'in postgres_changes kanalı `.subscribe()` handshake'ini
    // tamamlamadan RPC ateşlenirse, o INSERT olayı Realtime'da (push-only, geç
    // abone olana "yakalama/replay" YOK) sonsuza kadar kaçırılıyordu — timeout'u
    // ne kadar uzatırsak uzatalım element asla görünmüyordu (07.09.2026'da bulunan
    // gerçek kök neden — timeout artırmak yanlış düzeltmeydi, teşhis edilip
    // düzeltildi). Diagnostik ölçümde kanal SUBSCRIBED durumuna ~250ms'de
    // ulaşıyor; burada bolca pay bırakan sabit bir bekleme kullanılıyor.
    await page.waitForTimeout(2000)

    const { data: createdId, error: createError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: process.env.TEST_PROJECT_IZMIR,
      p_title: marker,
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: santiyeId,
      p_items: [{ name: marker, quantity: 1, unit: 'adet', bom_item_id: null }],
    })
    expect(createError).toBeNull()
    requestId = createdId

    await expect.poll(async () => {
      const { data } = await pm.from('notifications')
        .select('id,is_read,recipient_id').eq('entity_id', requestId).eq('event_type', 'created')
      if (data?.length === 1) {
        notificationId = data[0].id
        return { count: data.length, recipient: data[0].recipient_id, read: data[0].is_read }
      }
      return { count: data?.length || 0 }
    }).toEqual({ count: 1, recipient: pmId, read: false })

    const notification = page.locator(`[data-entity-id="${requestId}"]`)
    await expect(notification).toBeVisible({ timeout: 15000 })
    await expect(notification.getByText(/satın alma talebi/i)).toBeVisible()

    const { data: foreignRead } = await admin.from('notifications').select('id').eq('id', notificationId)
    expect(foreignRead).toHaveLength(0)
    const { data: foreignUpdate, error: foreignUpdateError } = await admin.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() }).eq('id', notificationId).select('id')
    expect(foreignUpdateError).toBeNull()
    expect(foreignUpdate).toHaveLength(0)

    await notification.click()
    await expect.poll(async () => {
      const { data } = await pm.from('notifications').select('is_read,read_at').eq('id', notificationId).single()
      return Boolean(data?.is_read && data?.read_at)
    }).toBe(true)

    const { count } = await pm.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('entity_id', requestId).eq('event_type', 'created')
    expect(count).toBe(1)
  })
})
