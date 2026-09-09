import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

// 3 aşamalı Teklif Toplama → Pazarlık → Sipariş akışının (03.09-08.09.2026
// arası eklendi, bkz. CLAUDE.md "Satın alma akışı") kalıcı regresyon testi —
// önceden yalnızca canlı/manuel Playwright ile doğrulanmıştı, hiç suite'e
// girmemişti (08.09.2026'da bir kod incelemesinde bulundu).
const marker = `E2E_NEGOTIATION_${Date.now()}`

test.describe.serial('Teklif toplama → pazarlık → sipariş akışı', () => {
  let admin, pm, santiye, adminId, pmId, projectId, supplierId
  const requestIds = []

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    adminId = (await admin.auth.getUser()).data.user.id
    pmId = (await pm.auth.getUser()).data.user.id
    projectId = process.env.TEST_PROJECT_IZMIR

    const { data: suppliers } = await pm.from('suppliers').select('id').limit(1)
    expect(suppliers?.[0]).toBeTruthy()
    supplierId = suppliers[0].id
  })

  test.afterAll(async () => {
    // purchase_offers, request_id üzerinden ON DELETE CASCADE ile bağlı —
    // ayrı bir temizlik gerekmiyor.
    if (requestIds.length) await admin.from('purchase_requests').delete().in('id', requestIds)
    if (requestIds.length) {
      await Promise.all([admin, pm, santiye].map(client =>
        client.from('notifications').delete().in('entity_id', requestIds)
      ))
    }
  })

  async function createRequest(title) {
    const { data: requestId, error } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: projectId,
      p_title: title,
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: 'Negotiation test kalemi', quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(error).toBeNull()
    requestIds.push(requestId)
    return requestId
  }

  test('yeni talep teklif_toplama ile başlar, teklif ekle/sil yalnızca bu aşamada çalışır', async () => {
    const requestId = await createRequest(`${marker}_OFFERS`)
    const { data: created } = await pm.from('purchase_requests').select('status').eq('id', requestId).single()
    expect(created.status).toBe('teklif_toplama')

    // Yetkisiz rol (santiye_sefi) teklif ekleyemez.
    const { error: forbiddenError } = await santiye.rpc('add_purchase_offer', {
      p_request_id: requestId, p_supplier_id: supplierId, p_amount: 1000,
    })
    expect(forbiddenError?.message).toContain('yetkiniz yok')

    // Tedarikçi de serbest metin de verilmezse reddedilir.
    const { error: noSupplierError } = await pm.rpc('add_purchase_offer', {
      p_request_id: requestId, p_amount: 1000,
    })
    expect(noSupplierError?.message).toContain('Tedarikçi seçin')

    const { data: offerId, error: offerError } = await pm.rpc('add_purchase_offer', {
      p_request_id: requestId, p_supplier_id: supplierId, p_amount: 1000, p_currency: 'TRY', p_notes: marker,
    })
    expect(offerError).toBeNull()
    expect(offerId).toBeTruthy()

    const { data: freetextOfferId, error: freetextError } = await pm.rpc('add_purchase_offer', {
      p_request_id: requestId, p_supplier_name_freetext: `${marker} Serbest Tedarikçi`, p_amount: 1200,
    })
    expect(freetextError).toBeNull()

    const { count: offerCountBeforeDelete } = await pm.from('purchase_offers')
      .select('id', { count: 'exact', head: true }).eq('request_id', requestId)
    expect(offerCountBeforeDelete).toBe(2)

    const { error: deleteError } = await pm.rpc('delete_purchase_offer', { p_offer_id: freetextOfferId })
    expect(deleteError).toBeNull()
    const { count: offerCountAfterDelete } = await pm.from('purchase_offers')
      .select('id', { count: 'exact', head: true }).eq('request_id', requestId)
    expect(offerCountAfterDelete).toBe(1)

    // Yanlış rol pazarlığa gönderemez.
    const { error: wrongRoleSubmit } = await admin.rpc('submit_purchase_request_for_negotiation', { p_request_id: requestId })
    expect(wrongRoleSubmit?.message).toContain('yalnızca proje yöneticisi')

    // 3'ten az teklifle bile RPC seviyesinde engellenmez (yalnızca frontend'de
    // uyarı gösterilir, bkz. CLAUDE.md) — burada tek teklifle gönderiliyor.
    const { data: submitResult, error: submitError } = await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: requestId })
    expect(submitError).toBeNull()
    expect(submitResult).toMatchObject({ status: 'pazarlik_onay_bekliyor' })

    // Artık teklif toplama aşamasında olmadığından yeni teklif eklenemez.
    const { error: lateOfferError } = await pm.rpc('add_purchase_offer', {
      p_request_id: requestId, p_supplier_id: supplierId, p_amount: 900,
    })
    expect(lateOfferError?.message).toContain('teklif toplama aşamasında')
  })

  test('admin pazarlık onayını reddeder (teklif_toplama\'ya geri döner), sonra onaylar', async () => {
    const requestId = await createRequest(`${marker}_GATE`)
    expect((await pm.rpc('add_purchase_offer', {
      p_request_id: requestId, p_supplier_id: supplierId, p_amount: 500,
    })).error).toBeNull()
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: requestId })).error).toBeNull()

    // Yanlış rol (proje yöneticisi) pazarlık kapısını değerlendiremez.
    const { error: wrongRoleGate } = await pm.rpc('review_purchase_request_negotiation_gate', {
      p_request_id: requestId, p_approve: true,
    })
    expect(wrongRoleGate?.message).toContain('yalnızca yönetici')

    // Red, gerekçesiz reddedilir.
    const { error: noNoteError } = await admin.rpc('review_purchase_request_negotiation_gate', {
      p_request_id: requestId, p_approve: false,
    })
    expect(noNoteError?.message).toContain('açıklama girmelisiniz')

    const { data: rejected, error: rejectError } = await admin.rpc('review_purchase_request_negotiation_gate', {
      p_request_id: requestId, p_approve: false, p_note: `${marker} red gerekçesi`,
    })
    expect(rejectError).toBeNull()
    expect(rejected).toMatchObject({ status: 'teklif_toplama' })

    const { data: afterReject } = await admin.from('purchase_requests')
      .select('status,stage_rejection_note').eq('id', requestId).single()
    expect(afterReject).toMatchObject({ status: 'teklif_toplama', stage_rejection_note: `${marker} red gerekçesi` })

    // Kapı reddi terminal değil — PM tekrar gönderebilir.
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: requestId })).error).toBeNull()
    const { data: approved, error: approveError } = await admin.rpc('review_purchase_request_negotiation_gate', {
      p_request_id: requestId, p_approve: true,
    })
    expect(approveError).toBeNull()
    expect(approved).toMatchObject({ status: 'pazarlik' })

    const { data: afterApprove } = await admin.from('purchase_requests')
      .select('status,stage_approved_by,stage_rejection_note').eq('id', requestId).single()
    expect(afterApprove).toMatchObject({ status: 'pazarlik', stage_approved_by: adminId, stage_rejection_note: null })
  })

  test('tam akış: pazarlık → sipariş → teslim alma (satin_alindi)', async () => {
    const requestId = await createRequest(`${marker}_FULL`)
    const { data: offerId } = await pm.rpc('add_purchase_offer', {
      p_request_id: requestId, p_supplier_id: supplierId, p_amount: 800,
    })
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: requestId })).error).toBeNull()
    expect((await admin.rpc('review_purchase_request_negotiation_gate', { p_request_id: requestId, p_approve: true })).error).toBeNull()

    // Kazanan teklif seçilmeden siparişe geçilemez.
    const { error: earlyOrderError } = await pm.rpc('advance_purchase_request_to_order', { p_request_id: requestId })
    expect(earlyOrderError?.message).toContain('kazanan teklifi seçmelisiniz')

    // Başka bir talebin teklifi bu talep için seçilemez.
    const otherRequestId = await createRequest(`${marker}_OTHER`)
    const { data: otherOfferId } = await pm.rpc('add_purchase_offer', {
      p_request_id: otherRequestId, p_supplier_id: supplierId, p_amount: 700,
    })
    const { error: crossRequestError } = await pm.rpc('save_purchase_request_negotiation', {
      p_request_id: requestId, p_selected_offer_id: otherOfferId, p_negotiated_amount: 750,
    })
    expect(crossRequestError?.message).toContain('bu talebe ait değil')

    const { error: negotiationError } = await pm.rpc('save_purchase_request_negotiation', {
      p_request_id: requestId, p_selected_offer_id: offerId, p_negotiated_amount: 780, p_negotiation_notes: marker,
    })
    expect(negotiationError).toBeNull()
    const { data: negotiated } = await admin.from('purchase_requests')
      .select('selected_offer_id,negotiated_amount,negotiated_currency,negotiated_by')
      .eq('id', requestId).single()
    expect(negotiated).toMatchObject({
      selected_offer_id: offerId, negotiated_currency: 'TRY', negotiated_by: pmId,
    })
    expect(Number(negotiated.negotiated_amount)).toBe(780)

    const { data: orderResult, error: advanceError } = await pm.rpc('advance_purchase_request_to_order', { p_request_id: requestId })
    expect(advanceError).toBeNull()
    expect(orderResult).toMatchObject({ status: 'siparis' })

    // Adet/fiyat girilmeden teslim alınıp tamamlanamaz.
    const { error: earlyDeliveryError } = await pm.rpc('complete_purchase_request_delivery', { p_request_id: requestId })
    expect(earlyDeliveryError?.message).toContain('sipariş adet/fiyat bilgisini kaydetmelisiniz')

    const orderDate = new Date().toISOString().slice(0, 10)
    const { error: orderError } = await pm.rpc('save_purchase_request_order', {
      p_request_id: requestId, p_quantity: 3, p_unit_price: 260, p_order_date: orderDate, p_supplier_id: supplierId,
    })
    expect(orderError).toBeNull()
    const { data: itemAfterOrder } = await admin.from('purchase_request_items')
      .select('quantity,unit_price,total_price').eq('request_id', requestId).single()
    expect(Number(itemAfterOrder.quantity)).toBe(3)
    expect(Number(itemAfterOrder.unit_price)).toBe(260)
    expect(Number(itemAfterOrder.total_price)).toBe(780)

    const { data: delivered, error: deliveryError } = await pm.rpc('complete_purchase_request_delivery', { p_request_id: requestId })
    expect(deliveryError).toBeNull()
    expect(delivered).toMatchObject({ status: 'satin_alindi' })

    const { data: finalRequest } = await admin.from('purchase_requests')
      .select('status,purchased_by,delivery_status,delivery_note,order_date,supplier_id')
      .eq('id', requestId).single()
    expect(finalRequest).toMatchObject({
      status: 'satin_alindi', purchased_by: pmId, delivery_status: 'tam', delivery_note: null,
      order_date: orderDate, supplier_id: supplierId,
    })
  })

  test('eksik/hasarlı teslimat: not zorunlu, delivery_status/delivery_note doğru yazılır', async () => {
    const requestId = await createRequest(`${marker}_DAMAGED`)
    const { data: offerId } = await pm.rpc('add_purchase_offer', {
      p_request_id: requestId, p_supplier_id: supplierId, p_amount: 400,
    })
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: requestId })).error).toBeNull()
    expect((await admin.rpc('review_purchase_request_negotiation_gate', { p_request_id: requestId, p_approve: true })).error).toBeNull()
    expect((await pm.rpc('save_purchase_request_negotiation', {
      p_request_id: requestId, p_selected_offer_id: offerId, p_negotiated_amount: 400,
    })).error).toBeNull()
    expect((await pm.rpc('advance_purchase_request_to_order', { p_request_id: requestId })).error).toBeNull()
    expect((await pm.rpc('save_purchase_request_order', {
      p_request_id: requestId, p_quantity: 1, p_unit_price: 400,
    })).error).toBeNull()

    // Geçersiz teslimat durumu.
    const { error: invalidStatusError } = await pm.rpc('complete_purchase_request_delivery', {
      p_request_id: requestId, p_delivery_status: 'gecersiz',
    })
    expect(invalidStatusError?.message).toContain('Geçersiz teslimat durumu')

    // Not verilmeden 'hasarli' kabul edilmez.
    const { error: missingNoteError } = await pm.rpc('complete_purchase_request_delivery', {
      p_request_id: requestId, p_delivery_status: 'hasarli',
    })
    expect(missingNoteError?.message).toContain('açıklama zorunludur')

    const { data: delivered, error: deliveryError } = await pm.rpc('complete_purchase_request_delivery', {
      p_request_id: requestId, p_delivery_status: 'hasarli', p_delivery_note: `${marker} kutular ezilmiş`,
    })
    expect(deliveryError).toBeNull()
    expect(delivered).toMatchObject({ status: 'satin_alindi' })

    const { data: finalRequest } = await admin.from('purchase_requests')
      .select('delivery_status,delivery_note').eq('id', requestId).single()
    expect(finalRequest).toMatchObject({ delivery_status: 'hasarli', delivery_note: `${marker} kutular ezilmiş` })
  })

  test('iptal, akışın 4 aşamasından da (gerekçeli) çağrılabilir', async () => {
    // teklif_toplama aşamasından iptal.
    const teklifRequestId = await createRequest(`${marker}_CANCEL_TEKLIF`)
    const { error: noNoteCancel } = await pm.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: teklifRequestId, p_note: '',
    })
    expect(noNoteCancel?.message).toContain('açıklama girmelisiniz')
    expect((await pm.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: teklifRequestId, p_note: `${marker} iptal 1`,
    })).error).toBeNull()
    const { data: cancelledTeklif } = await admin.from('purchase_requests').select('status').eq('id', teklifRequestId).single()
    expect(cancelledTeklif.status).toBe('iptal')

    // pazarlik_onay_bekliyor aşamasından iptal — yetkisiz rol önce reddedilir.
    const gateRequestId = await createRequest(`${marker}_CANCEL_GATE`)
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: gateRequestId })).error).toBeNull()
    const { error: forbiddenCancel } = await santiye.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: gateRequestId, p_note: marker,
    })
    expect(forbiddenCancel?.message).toContain('yalnızca proje yöneticisi veya yönetici')
    expect((await admin.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: gateRequestId, p_note: `${marker} iptal 2`,
    })).error).toBeNull()
    const { data: cancelledGate } = await admin.from('purchase_requests').select('status').eq('id', gateRequestId).single()
    expect(cancelledGate.status).toBe('iptal')

    // pazarlik aşamasından iptal.
    const negotiationRequestId = await createRequest(`${marker}_CANCEL_NEGOTIATION`)
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: negotiationRequestId })).error).toBeNull()
    expect((await admin.rpc('review_purchase_request_negotiation_gate', { p_request_id: negotiationRequestId, p_approve: true })).error).toBeNull()
    expect((await pm.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: negotiationRequestId, p_note: `${marker} iptal 3`,
    })).error).toBeNull()
    const { data: cancelledNegotiation } = await admin.from('purchase_requests').select('status').eq('id', negotiationRequestId).single()
    expect(cancelledNegotiation.status).toBe('iptal')

    // siparis aşamasından iptal.
    const orderRequestId = await createRequest(`${marker}_CANCEL_ORDER`)
    const { data: orderOfferId } = await pm.rpc('add_purchase_offer', {
      p_request_id: orderRequestId, p_supplier_id: supplierId, p_amount: 300,
    })
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: orderRequestId })).error).toBeNull()
    expect((await admin.rpc('review_purchase_request_negotiation_gate', { p_request_id: orderRequestId, p_approve: true })).error).toBeNull()
    expect((await pm.rpc('save_purchase_request_negotiation', {
      p_request_id: orderRequestId, p_selected_offer_id: orderOfferId, p_negotiated_amount: 300,
    })).error).toBeNull()
    expect((await pm.rpc('advance_purchase_request_to_order', { p_request_id: orderRequestId })).error).toBeNull()
    expect((await admin.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: orderRequestId, p_note: `${marker} iptal 4`,
    })).error).toBeNull()
    const { data: cancelledOrder } = await admin.from('purchase_requests').select('status,notes').eq('id', orderRequestId).single()
    expect(cancelledOrder.status).toBe('iptal')
    expect(cancelledOrder.notes).toContain(`${marker} iptal 4`)

    // satin_alindi'ye ulaşmış bir talep artık bu akıştan iptal edilemez.
    const doneRequestId = await createRequest(`${marker}_CANCEL_TOO_LATE`)
    const { data: doneOfferId } = await pm.rpc('add_purchase_offer', {
      p_request_id: doneRequestId, p_supplier_id: supplierId, p_amount: 200,
    })
    expect((await pm.rpc('submit_purchase_request_for_negotiation', { p_request_id: doneRequestId })).error).toBeNull()
    expect((await admin.rpc('review_purchase_request_negotiation_gate', { p_request_id: doneRequestId, p_approve: true })).error).toBeNull()
    expect((await pm.rpc('save_purchase_request_negotiation', {
      p_request_id: doneRequestId, p_selected_offer_id: doneOfferId, p_negotiated_amount: 200,
    })).error).toBeNull()
    expect((await pm.rpc('advance_purchase_request_to_order', { p_request_id: doneRequestId })).error).toBeNull()
    expect((await pm.rpc('save_purchase_request_order', {
      p_request_id: doneRequestId, p_quantity: 1, p_unit_price: 200,
    })).error).toBeNull()
    expect((await pm.rpc('complete_purchase_request_delivery', { p_request_id: doneRequestId })).error).toBeNull()
    const { error: tooLateCancelError } = await admin.rpc('cancel_purchase_request_negotiation_flow', {
      p_request_id: doneRequestId, p_note: marker,
    })
    expect(tooLateCancelError?.message).toContain('artık bu akıştan iptal edilemez')
  })
})
