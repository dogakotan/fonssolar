import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

// Aylık Satın Alma Planı → talep bağlantısı (create_purchase_request_from_monthly_plan,
// 12.08.2026'da eklendi; fn_release_monthly_plan_link_on_request_terminal_status
// trigger'ı 07.09.2026'da eklendi) — önceden hiç kalıcı regresyon testi yoktu
// (08.09.2026'da bir kod incelemesinde bulundu).
const marker = `E2E_MONTHLY_PLAN_${Date.now()}`

test.describe.serial('Aylık Satın Alma Planı → talep bağlantısı', () => {
  let admin, pm, santiye, adminId, pmId, projectId
  const planIds = []
  const requestIds = []

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    adminId = (await admin.auth.getUser()).data.user.id
    pmId = (await pm.auth.getUser()).data.user.id
    projectId = process.env.TEST_PROJECT_IZMIR
  })

  test.afterAll(async () => {
    if (requestIds.length) await admin.from('purchase_requests').delete().in('id', requestIds)
    if (requestIds.length) {
      await Promise.all([admin, pm, santiye].map(client =>
        client.from('notifications').delete().in('entity_id', requestIds)
      ))
    }
    if (planIds.length) await admin.from('procurement_monthly_plan').delete().in('id', planIds)
  })

  async function createPlanItem(kalemAdi, overrides = {}) {
    const { data, error } = await pm.from('procurement_monthly_plan').insert({
      project_id: projectId,
      ay_no: 1,
      kategori: 'Malzeme',
      kalem_adi: kalemAdi,
      birim: 'Adet',
      miktar: 5,
      ...overrides,
    }).select('id').single()
    expect(error).toBeNull()
    planIds.push(data.id)
    return data.id
  }

  test('plan kaleminden talep oluşturulur, ikinci talep aynı kalem için engellenir', async () => {
    const planId = await createPlanItem(`${marker}_ITEM`)

    // Yetkisiz rol (santiye_sefi) plandan talep oluşturamaz.
    const { error: forbiddenError } = await santiye.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: planId, p_quantity: 2,
    })
    expect(forbiddenError?.message).toContain('yetkiniz yok')

    // Miktar sıfır veya altı reddedilir.
    const { error: invalidQuantityError } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: planId, p_quantity: 0,
    })
    expect(invalidQuantityError?.message).toContain('sıfırdan büyük olmalıdır')

    const { data: requestId, error: createError } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: planId, p_quantity: 2, p_request_note: marker,
    })
    expect(createError).toBeNull()
    requestIds.push(requestId)

    const { data: created } = await admin.from('purchase_requests')
      .select('status,category,title,procurement_plan_id,requested_by')
      .eq('id', requestId).single()
    expect(created).toMatchObject({
      status: 'teklif_toplama', category: 'malzeme', title: `${marker}_ITEM`,
      procurement_plan_id: planId, requested_by: pmId,
    })

    const { data: item } = await admin.from('purchase_request_items')
      .select('quantity,unit').eq('request_id', requestId).single()
    expect(Number(item.quantity)).toBe(2)
    expect(item.unit).toBe('Adet')

    // Aynı plan kalemi için ikinci bir talep oluşturulamaz (RPC'nin kendi kontrolü).
    const { error: duplicateError } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: planId, p_quantity: 1,
    })
    expect(duplicateError?.message).toContain('zaten bir talep oluşturulmuş')
  })

  test('hizmet kategorisi doğru sınıflandırılır, olmayan plan kalemi reddedilir', async () => {
    const planId = await createPlanItem(`${marker}_SERVICE`, { kategori: 'Hizmet', birim: 'Gün' })
    const { data: requestId, error } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: planId, p_quantity: 3,
    })
    expect(error).toBeNull()
    requestIds.push(requestId)

    const { data: created } = await admin.from('purchase_requests').select('category').eq('id', requestId).single()
    expect(created.category).toBe('hizmet')

    const { error: missingPlanError } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: '00000000-0000-0000-0000-000000000000', p_quantity: 1,
    })
    expect(missingPlanError?.message).toContain('bulunamadı')
  })

  test('talep reddedilince/iptal olunca plan bağlantısı kopar, kalem yeniden talebe açılır', async () => {
    // Red senaryosu.
    const rejectPlanId = await createPlanItem(`${marker}_REJECT`)
    const { data: rejectRequestId } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: rejectPlanId, p_quantity: 1,
    })
    requestIds.push(rejectRequestId)
    expect((await admin.from('purchase_requests').select('procurement_plan_id').eq('id', rejectRequestId).single()).data)
      .toMatchObject({ procurement_plan_id: rejectPlanId })

    expect((await admin.from('purchase_requests').update({ status: 'reddedildi' }).eq('id', rejectRequestId)).error).toBeNull()
    const { data: afterReject } = await admin.from('purchase_requests')
      .select('status,procurement_plan_id').eq('id', rejectRequestId).single()
    expect(afterReject).toMatchObject({ status: 'reddedildi', procurement_plan_id: null })

    // Bağlantı koptuğundan aynı plan kalemi için tekrar talep oluşturulabilir.
    const { data: secondRequestId, error: recreateError } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: rejectPlanId, p_quantity: 4,
    })
    expect(recreateError).toBeNull()
    requestIds.push(secondRequestId)
    expect((await admin.from('purchase_requests').select('procurement_plan_id').eq('id', secondRequestId).single()).data)
      .toMatchObject({ procurement_plan_id: rejectPlanId })

    // İptal senaryosu — ayrı bir plan kalemiyle.
    const cancelPlanId = await createPlanItem(`${marker}_CANCEL`)
    const { data: cancelRequestId } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: cancelPlanId, p_quantity: 1,
    })
    requestIds.push(cancelRequestId)
    expect((await admin.from('purchase_requests').update({ status: 'iptal' }).eq('id', cancelRequestId)).error).toBeNull()
    const { data: afterCancel } = await admin.from('purchase_requests')
      .select('status,procurement_plan_id').eq('id', cancelRequestId).single()
    expect(afterCancel).toMatchObject({ status: 'iptal', procurement_plan_id: null })

    const { data: thirdRequestId, error: recreateAfterCancelError } = await pm.rpc('create_purchase_request_from_monthly_plan', {
      p_plan_id: cancelPlanId, p_quantity: 2,
    })
    expect(recreateAfterCancelError).toBeNull()
    requestIds.push(thirdRequestId)
  })
})
