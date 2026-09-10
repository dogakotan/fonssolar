import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

// 09.09.2026'da eklenen approver_role yönlendirmesi hiç test kapsamında
// değildi: Osman Karadoğan/Cem Aslan admin hesaplarından açılan malzeme
// değişikliği talepleri proje yöneticisine düşüyor, diğer admin hesapları
// eskisi gibi 'admin'de kalıyor (create_procurement_item_change_request'teki
// hardcoded auth.uid() kontrolü). Bu dosya iki yönü de doğruluyor: doğru
// hesap doğru role yönlendiriliyor VE bu yönlendirme review_procurement_item_change_request'in
// kendi yetki kontrolünü (get_my_role() IN ('admin', approver_role)) fiilen
// etkiliyor — proje yöneticisi yalnızca kendisine yönlendirilen talebi
// onaylayabiliyor, admin'e yönlendirilmiş birini onaylayamıyor.
const marker = `E2E_APPROVER_ROLE_${Date.now()}`

test.describe.serial('Malzeme değişikliği onaylayıcı rol yönlendirmesi', () => {
  let admin, osman, pm, itemId
  const changeIds = []

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: osman } = await signIn(process.env.TEST_OSMANKARADOGAN_EMAIL, process.env.TEST_OSMANKARADOGAN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))

    const { data: item, error } = await admin.from('procurement_items').insert({
      project_id: process.env.TEST_PROJECT_IZMIR,
      equipment: marker,
      unit: 'Adet',
      category: 'diger',
      planned_qty: 10,
      quantity: '10',
    }).select('id').single()
    expect(error).toBeNull()
    itemId = item.id
  })

  test.afterAll(async () => {
    if (changeIds.length) await admin.from('procurement_item_change_requests').delete().in('id', changeIds)
    if (itemId) await admin.from('procurement_items').delete().eq('id', itemId)
  })

  test('Osman Karadoğan\'ın talebi proje yöneticisine düşer ve proje yöneticisi onaylayabilir', async () => {
    const { data: requestId, error: createError } = await osman.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: itemId, p_new_planned_qty: 20, p_note: marker,
    })
    expect(createError).toBeNull()
    changeIds.push(requestId)

    const { data: row } = await admin
      .from('procurement_item_change_requests')
      .select('approver_role, status')
      .eq('id', requestId)
      .single()
    expect(row.approver_role).toBe('proje_yoneticisi')

    const { error: reviewError } = await pm.rpc('review_procurement_item_change_request', {
      p_id: requestId, p_approve: true, p_review_note: marker,
    })
    expect(reviewError).toBeNull()

    const { data: updatedItem } = await admin.from('procurement_items').select('planned_qty').eq('id', itemId).single()
    expect(Number(updatedItem.planned_qty)).toBe(20)
  })

  test('Genel admin hesabının talebi admin onayında kalır, proje yöneticisi onaylayamaz', async () => {
    const { data: requestId, error: createError } = await admin.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: itemId, p_new_planned_qty: 30, p_note: marker,
    })
    expect(createError).toBeNull()
    changeIds.push(requestId)

    const { data: row } = await admin
      .from('procurement_item_change_requests')
      .select('approver_role')
      .eq('id', requestId)
      .single()
    expect(row.approver_role).toBe('admin')

    const { error: pmReviewError } = await pm.rpc('review_procurement_item_change_request', {
      p_id: requestId, p_approve: true, p_review_note: marker,
    })
    expect(pmReviewError).not.toBeNull()

    // Admin (approver_role'ün kendisi) her zaman onaylayabilmeli — talebi
    // kapatıp temiz bırakıyoruz.
    const { error: adminReviewError } = await admin.rpc('review_procurement_item_change_request', {
      p_id: requestId, p_approve: true, p_review_note: marker,
    })
    expect(adminReviewError).toBeNull()
  })
})
