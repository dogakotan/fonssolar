import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

const marker = `E2E_TWO_ACTORS_${Date.now()}`

test.describe.serial('Şantiye şefi ve proje yöneticisi satın alma akışları', () => {
  let admin, muhasebe, santiye, pm
  let adminId, muhasebeId, santiyeId, pmId, siteProjectId, alternateProjectId, supplierId, bom
  const requestIds = []
  const invoiceIds = []

  async function createRequest(client, userId, projectId, suffix, category = 'diger') {
    const item = category === 'malzeme'
      ? { name: bom.equipment, quantity: 1, unit: bom.unit || 'Adet', bom_item_id: bom.id }
      : { name: `${marker} ${suffix}`, quantity: 1, unit: 'Adet', bom_item_id: null }
    const { data, error } = await client.rpc('create_purchase_request_with_items', {
      p_project_id: projectId,
      p_title: `${marker} ${suffix}`,
      p_urgency: 'normal',
      p_category: category,
      p_request_note: marker,
      p_requested_by: userId,
      p_items: [item],
    })
    expect(error).toBeNull()
    requestIds.push(data)
    return data
  }

  async function approveRequest(requestId) {
    const { error } = await admin.from('purchase_requests').update({
      status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString(),
    }).eq('id', requestId)
    expect(error).toBeNull()
  }

  async function procure(requestId) {
    const { error } = await pm.from('purchase_requests').update({
      supplier_id: supplierId,
      purchase_date: new Date().toISOString().slice(0, 10),
      purchased_by: pmId,
    }).eq('id', requestId)
    expect(error).toBeNull()
    expect((await pm.from('purchase_requests').select('status').eq('id', requestId).single()).data.status).toBe('satin_alindi')
  }

  async function createInvoice(requestId, projectId, suffix, category = 'diger') {
    const { data, error } = await muhasebe.from('invoices').insert({
      project_id: projectId,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: `${marker}_${suffix}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 75,
      vat_rate: 20,
      category,
      description: marker,
      source: 'satin_alma',
      status: 'bekliyor',
      created_by: muhasebeId,
    }).select('id').single()
    expect(error).toBeNull()
    invoiceIds.push(data.id)
    return data.id
  }

  async function expectNotification(client, entityId) {
    const { count, error } = await client.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', entityId)
    expect(error).toBeNull()
    expect(count).toBeGreaterThan(0)
  }

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    ;[adminId, muhasebeId, santiyeId, pmId] = await Promise.all(
      [admin, muhasebe, santiye, pm].map(async client => (await client.auth.getUser()).data.user.id)
    )
    siteProjectId = process.env.TEST_PROJECT_IZMIR
    const [{ data: projects }, { data: suppliers }, { data: bomRow }] = await Promise.all([
      pm.rpc('get_my_projects'),
      pm.from('suppliers').select('id').limit(1),
      santiye.from('procurement_items').select('id,equipment,unit').eq('project_id', siteProjectId).limit(1).single(),
    ])
    alternateProjectId = projects.find(project => project.id !== siteProjectId)?.id || siteProjectId
    supplierId = suppliers[0].id
    bom = bomRow
  })

  test.afterAll(async () => {
    if (invoiceIds.length) await admin.from('invoices').delete().in('id', invoiceIds)
    if (requestIds.length) await admin.from('purchase_requests').delete().in('id', requestIds)
    const ids = [...invoiceIds, ...requestIds]
    if (ids.length) {
      await Promise.all([admin, muhasebe, santiye, pm].map(client =>
        client.from('notifications').delete().in('entity_id', ids)
      ))
    }
  })

  test('şantiye şefi: red edilen fatura düzenlenir, yeniden gönderilir ve onaylanır', async () => {
    const requestId = await createRequest(santiye, santiyeId, siteProjectId, 'SITE_FULL', 'malzeme')
    await expectNotification(admin, requestId)
    await approveRequest(requestId)
    await expectNotification(pm, requestId)
    await procure(requestId)
    await expectNotification(muhasebe, requestId)

    const invoiceId = await createInvoice(requestId, siteProjectId, 'SITE_INV', 'malzeme')
    await expectNotification(admin, invoiceId)
    expect((await admin.from('purchase_requests').select('status,invoice_id').eq('id', requestId).single()).data)
      .toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: invoiceId })

    expect((await admin.from('invoice_approvals').update({
      status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString(), note: marker,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')).error).toBeNull()
    expect((await muhasebe.from('invoices').select('status').eq('id', invoiceId).single()).data.status).toBe('reddedildi')
    await expectNotification(muhasebe, invoiceId)

    expect((await muhasebe.from('invoices').update({ amount: 90, invoice_no: `${marker}_SITE_REV` }).eq('id', invoiceId)).error).toBeNull()
    expect((await muhasebe.rpc('resubmit_rejected_invoice', { p_invoice_id: invoiceId })).error).toBeNull()
    expect((await admin.from('invoices').select('status').eq('id', invoiceId).single()).data.status).toBe('yönetici_onayında')

    expect((await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')).error).toBeNull()
    expect((await admin.from('purchase_requests').select('status').eq('id', requestId).single()).data.status).toBe('faturasi_kesildi')
    expect((await admin.from('cost_allocations').select('id').eq('invoice_id', invoiceId).single()).data).toBeTruthy()
  })

  test('proje yöneticisi: farklı proje, fatura reddi ve muhasebe silme/iptal', async () => {
    const requestId = await createRequest(pm, pmId, alternateProjectId, 'PM_FULL')
    expect((await pm.from('purchase_requests').select('project_id,status').eq('id', requestId).single()).data)
      .toMatchObject({ project_id: alternateProjectId, status: 'talep_olusturuldu' })
    await expectNotification(admin, requestId)
    await approveRequest(requestId)
    await expectNotification(pm, requestId)
    await procure(requestId)
    await expectNotification(muhasebe, requestId)

    const invoiceId = await createInvoice(requestId, alternateProjectId, 'PM_INV')
    await expectNotification(admin, invoiceId)
    expect((await admin.from('invoice_approvals').update({
      status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString(), note: marker,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')).error).toBeNull()
    await expectNotification(muhasebe, invoiceId)
    expect((await muhasebe.rpc('delete_rejected_invoice', { p_invoice_id: invoiceId })).error).toBeNull()

    expect((await admin.from('invoices').select('id').eq('id', invoiceId).maybeSingle()).data).toBeNull()
    expect((await admin.from('purchase_requests').select('status,invoice_id').eq('id', requestId).single()).data)
      .toMatchObject({ status: 'satin_alindi', invoice_id: null })
  })

  for (const actor of ['santiye', 'pm']) {
    test(`${actor}: yönetici talep reddi akışı kapatır`, async () => {
      const client = actor === 'santiye' ? santiye : pm
      const userId = actor === 'santiye' ? santiyeId : pmId
      const projectId = actor === 'santiye' ? siteProjectId : alternateProjectId
      const requestId = await createRequest(client, userId, projectId, `${actor}_ADMIN_REJECT`)
      expect((await admin.from('purchase_requests').update({ status: 'reddedildi' }).eq('id', requestId)).error).toBeNull()
      expect((await client.from('purchase_requests').select('status').eq('id', requestId).single()).data.status).toBe('reddedildi')
      await expectNotification(client, requestId)
    })

    test(`${actor}: admin onayından sonra proje yöneticisi iptali akışı kapatır`, async () => {
      const client = actor === 'santiye' ? santiye : pm
      const userId = actor === 'santiye' ? santiyeId : pmId
      const projectId = actor === 'santiye' ? siteProjectId : alternateProjectId
      const requestId = await createRequest(client, userId, projectId, `${actor}_PM_CANCEL`)
      await approveRequest(requestId)
      expect((await pm.from('purchase_requests').update({ status: 'iptal', notes: marker }).eq('id', requestId)).error).toBeNull()
      expect((await client.from('purchase_requests').select('status').eq('id', requestId).single()).data.status).toBe('iptal')
      await expectNotification(client, requestId)
    })
  }
})
