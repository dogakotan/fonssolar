import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

const marker = `E2E_RACE_${Date.now()}`

test.describe.serial('Satın alma eşzamanlılık ve idempotency', () => {
  let adminA, adminB, muhasebeA, muhasebeB, pm
  let adminId, pmId, muhasebeId, projectId, supplierId, invoiceId
  const requestIds = []

  const createRequest = async suffix => {
    const { data, error } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: projectId,
      p_title: `${marker}_${suffix}`,
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: `${marker}_${suffix}`, quantity: 1, unit: 'adet', bom_item_id: null }],
    })
    expect(error).toBeNull()
    requestIds.push(data)
    return data
  }

  test.beforeAll(async () => {
    ;({ client: adminA } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: adminB } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: muhasebeA } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: muhasebeB } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;[adminId, pmId, muhasebeId] = await Promise.all([
      adminA.auth.getUser().then(r => r.data.user.id),
      pm.auth.getUser().then(r => r.data.user.id),
      muhasebeA.auth.getUser().then(r => r.data.user.id),
    ])
    projectId = process.env.TEST_PROJECT_IZMIR
    const { data: supplier } = await pm.from('suppliers').select('id').limit(1).single()
    supplierId = supplier.id
  })

  test.afterAll(async () => {
    if (invoiceId) await adminA.from('invoices').delete().eq('id', invoiceId)
    if (requestIds.length) await adminA.from('purchase_requests').delete().in('id', requestIds)
  })

  test('çakışan yönetici kararlarından yalnız biri uygulanır', async () => {
    const requestId = await createRequest('ADMIN')
    const results = await Promise.all([
      adminA.from('purchase_requests').update({ status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString() }).eq('id', requestId).eq('status', 'talep_olusturuldu').select('id'),
      adminB.from('purchase_requests').update({ status: 'reddedildi' }).eq('id', requestId).eq('status', 'talep_olusturuldu').select('id'),
    ])
    expect(results.filter(result => result.data?.length === 1)).toHaveLength(1)
    const { data } = await adminA.from('purchase_requests').select('status').eq('id', requestId).single()
    expect(['onaylandi', 'reddedildi']).toContain(data.status)
  })

  test('çakışan proje yöneticisi kararlarından yalnız biri uygulanır', async () => {
    const requestId = await createRequest('PM')
    expect((await adminA.from('purchase_requests').update({ status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString() }).eq('id', requestId)).error).toBeNull()
    const results = await Promise.all([
      pm.from('purchase_requests').update({ supplier_id: supplierId, purchase_date: new Date().toISOString().slice(0, 10), purchased_by: pmId }).eq('id', requestId).eq('status', 'onaylandi').select('id'),
      pm.from('purchase_requests').update({ status: 'iptal' }).eq('id', requestId).eq('status', 'onaylandi').select('id'),
    ])
    expect(results.filter(result => result.data?.length === 1)).toHaveLength(1)
    const { data } = await adminA.from('purchase_requests').select('status').eq('id', requestId).single()
    expect(['satin_alindi', 'iptal']).toContain(data.status)
  })

  test('eşzamanlı fatura ve fatura kararı tek kayıt/sonuç üretir', async () => {
    const requestId = await createRequest('INVOICE')
    expect((await adminA.from('purchase_requests').update({ status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString() }).eq('id', requestId)).error).toBeNull()
    expect((await pm.from('purchase_requests').update({ supplier_id: supplierId, purchase_date: new Date().toISOString().slice(0, 10), purchased_by: pmId }).eq('id', requestId)).error).toBeNull()

    const invoicePayload = suffix => ({
      project_id: projectId,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: `${marker}_${suffix}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 100,
      vat_rate: 20,
      category: 'diger',
      description: marker,
      source: 'satin_alma',
      status: 'taslak',
      created_by: muhasebeId,
    })
    // İkisi de aynı purchase_request_id için — invoices_active_purchase_request_id_unique
    // (kısmi index, yalnızca aktif/reddedilmemiş faturalarda tekillik) ikisinden yalnızca
    // birinin başarılı olmasını garanti eder.
    const invoiceResults = await Promise.all([
      muhasebeA.from('invoices').insert(invoicePayload('A')).select('id').single(),
      muhasebeB.from('invoices').insert(invoicePayload('B')).select('id').single(),
    ])
    const successfulInvoices = invoiceResults.filter(result => result.data?.id)
    expect(successfulInvoices).toHaveLength(1)
    invoiceId = successfulInvoices[0].data.id

    // Onaya Gönder — invoice insert'i artık invoice_approvals satırını otomatik
    // oluşturmuyor (bkz. fn_invoice_approval_submitted).
    expect((await muhasebeA.from('invoice_approvals').insert({
      invoice_id: invoiceId, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
    })).error).toBeNull()

    // 'created' bildirimi artık admin'e değil proje yöneticisine gidiyor
    // (fn_invoice_approval_submitted, notify_role('proje_yoneticisi', ...)). Bu kontrol
    // reddetme/onaylama yarışından ÖNCE yapılmalı — pm bu talebin requested_by'ı da
    // olduğundan, fatura reddedilince trg_notify_invoice_status pm'e AYNI (recipient,
    // entity_type, entity_id) satırını 'rejected' event_type'ıyla üzerine yazar
    // (notifications_recipient_entity_unique tek satır garantisi, dedupe_notifications_by_entity).
    const { count: notificationCount } = await pm.from('notifications').select('id', { count: 'exact', head: true })
      .eq('entity_id', invoiceId).eq('event_type', 'created')
    expect(notificationCount).toBe(1)

    const { data: approvals } = await adminA.from('invoice_approvals').select('id').eq('invoice_id', invoiceId).eq('status', 'bekliyor')
    expect(approvals).toHaveLength(1)
    const results = await Promise.all([
      adminA.from('invoice_approvals').update({ status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString() }).eq('id', approvals[0].id).eq('status', 'bekliyor').select('id'),
      adminB.from('invoice_approvals').update({ status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString() }).eq('id', approvals[0].id).eq('status', 'bekliyor').select('id'),
    ])
    expect(results.filter(result => result.data?.length === 1)).toHaveLength(1)

    // requires_payment_tracking varsayılan true olduğundan onay genelde doğrudan
    // 'onaylandı' değil 'odeme_bekliyor'a düşer — sync_cost_allocation_from_invoice
    // ikisini de (kismen_odendi/ödendi ile birlikte) "gerçekleşen maliyet" sayar.
    const { data: invoice } = await adminA.from('invoices').select('status').eq('id', invoiceId).single()
    const { count: allocationCount } = await adminA.from('cost_allocations').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId)
    expect(allocationCount).toBe(['onaylandı', 'odeme_bekliyor', 'kismen_odendi', 'ödendi'].includes(invoice.status) ? 1 : 0)
  })
})
