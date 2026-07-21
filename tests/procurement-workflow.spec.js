import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

const marker = `E2E_WF_${Date.now()}`

test.describe.serial('Satın alma → tedarik → fatura workflow', () => {
  let admin, muhasebe, santiye, projeYoneticisi
  let requestId, invoiceId, projectId, supplierId, bomItem
  const requestIds = []
  const invoiceIds = []

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: projeYoneticisi } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    projectId = process.env.TEST_PROJECT_IZMIR

    const [{ data: bom }, { data: suppliers }] = await Promise.all([
      santiye.from('procurement_items').select('id,equipment,unit,planned_qty').eq('project_id', projectId).limit(1).single(),
      projeYoneticisi.from('suppliers').select('id').limit(1),
    ])
    expect(bom).toBeTruthy()
    expect(suppliers?.[0]).toBeTruthy()
    bomItem = bom
    supplierId = suppliers[0].id
  })

  test.afterAll(async () => {
    if (invoiceIds.length) await admin.from('invoices').delete().in('id', invoiceIds)
    if (requestIds.length) await admin.from('purchase_requests').delete().in('id', requestIds)
    const ids = [...invoiceIds, ...requestIds]
    if (ids.length) {
      await Promise.all([admin, muhasebe, santiye, projeYoneticisi].map(client =>
        client.from('notifications').delete().in('entity_id', ids)
      ))
    }
  })

  test('proje yöneticisi tüm projelerden zorunlu seçimle talep oluşturabilir', async () => {
    const pmId = (await projeYoneticisi.auth.getUser()).data.user.id
    const [{ data: availableProjects, error: projectsError }, { count: projectCount, error: countError }] = await Promise.all([
      projeYoneticisi.rpc('get_my_projects'),
      admin.from('projects').select('id', { count: 'exact', head: true }),
    ])
    expect(projectsError).toBeNull()
    expect(countError).toBeNull()
    expect(availableProjects).toHaveLength(projectCount)

    const selectedProject = availableProjects.find(project => project.id !== projectId) || availableProjects[0]
    expect(selectedProject).toBeTruthy()

    const { data: pmRequestId, error: createError } = await projeYoneticisi.rpc('create_purchase_request_with_items', {
      p_project_id: selectedProject.id,
      p_title: `${marker} PM`,
      p_urgency: 'normal',
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: 'Proje yöneticisi test talebi', quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(createError).toBeNull()
    requestIds.push(pmRequestId)

    const { data: created } = await projeYoneticisi.from('purchase_requests')
      .select('project_id,status,requested_by')
      .eq('id', pmRequestId)
      .single()
    expect(created).toMatchObject({
      project_id: selectedProject.id,
      status: 'talep_olusturuldu',
      requested_by: pmId,
    })

    const { error: missingProjectError } = await projeYoneticisi.rpc('create_purchase_request_with_items', {
      p_project_id: null,
      p_title: `${marker} PM NULL`,
      p_urgency: 'normal',
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: 'Geçersiz test talebi', quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(missingProjectError?.message).toContain('Proje seçimi zorunludur')
  })

  test('tam akış, red sonrası düzenleme ve yeniden gönderme', async () => {
    const quantity = Math.max(1, Math.min(2, Number(bomItem.planned_qty) || 1))
    const { data: createdId, error: createError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: projectId,
      p_title: `${marker} Malzeme`,
      p_urgency: 'normal',
      p_category: 'malzeme',
      p_request_note: marker,
      p_requested_by: (await santiye.auth.getUser()).data.user.id,
      p_items: [{ name: bomItem.equipment, quantity, unit: bomItem.unit || 'Adet', bom_item_id: bomItem.id }],
    })
    expect(createError).toBeNull()
    requestId = createdId
    requestIds.push(requestId)

    const { data: initial } = await santiye.from('purchase_requests').select('status,project_id').eq('id', requestId).single()
    expect(initial).toMatchObject({ status: 'talep_olusturuldu', project_id: projectId })

    const adminId = (await admin.auth.getUser()).data.user.id
    const { error: approveRequestError } = await admin.from('purchase_requests').update({
      status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString(),
    }).eq('id', requestId)
    expect(approveRequestError).toBeNull()

    const pmId = (await projeYoneticisi.auth.getUser()).data.user.id
    const { error: procurementError } = await projeYoneticisi.from('purchase_requests').update({
      supplier_id: supplierId,
      purchase_date: new Date().toISOString().slice(0, 10),
      purchased_by: pmId,
    }).eq('id', requestId)
    expect(procurementError).toBeNull()

    const { data: procured } = await projeYoneticisi.from('purchase_requests').select('status').eq('id', requestId).single()
    expect(procured.status).toBe('satin_alindi')

    const muhasebeId = (await muhasebe.auth.getUser()).data.user.id
    const { data: invoice, error: invoiceError } = await muhasebe.from('invoices').insert({
      project_id: projectId,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: marker,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 100,
      vat_rate: 20,
      category: 'malzeme',
      description: marker,
      source: 'satin_alma',
      status: 'bekliyor',
      created_by: muhasebeId,
    }).select('id,status').single()
    expect(invoiceError).toBeNull()
    invoiceId = invoice.id
    invoiceIds.push(invoiceId)

    const [{ data: persistedInvoice }, { data: awaitingInvoice }] = await Promise.all([
      admin.from('invoices').select('status').eq('id', invoiceId).single(),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', requestId).single(),
    ])
    expect(persistedInvoice.status).toBe('yönetici_onayında')
    expect(awaitingInvoice).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: invoiceId })

    const { data: forbiddenRows, error: forbiddenApproval } = await muhasebe.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: muhasebeId,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor').select('id')
    expect(forbiddenApproval).toBeNull()
    expect(forbiddenRows).toHaveLength(0)

    const { error: rejectError } = await admin.from('invoice_approvals').update({
      status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString(), note: marker,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')
    expect(rejectError).toBeNull()

    const [{ data: rejectedInvoice }, { data: requestAfterReject }] = await Promise.all([
      muhasebe.from('invoices').select('status').eq('id', invoiceId).single(),
      muhasebe.from('purchase_requests').select('status,invoice_id').eq('id', requestId).single(),
    ])
    expect(rejectedInvoice.status).toBe('reddedildi')
    expect(requestAfterReject).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: invoiceId })

    const { error: editError } = await muhasebe.from('invoices').update({ invoice_no: `${marker}_REV`, amount: 110 }).eq('id', invoiceId)
    expect(editError).toBeNull()
    const { error: resubmitError } = await muhasebe.rpc('resubmit_rejected_invoice', { p_invoice_id: invoiceId })
    expect(resubmitError).toBeNull()

    const { data: resubmitted } = await admin.from('invoices').select('status,invoice_no').eq('id', invoiceId).single()
    expect(resubmitted).toMatchObject({ status: 'yönetici_onayında', invoice_no: `${marker}_REV` })

    const { error: finalApprovalError } = await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')
    expect(finalApprovalError).toBeNull()

    const [{ data: completed }, { data: allocation }] = await Promise.all([
      admin.from('purchase_requests').select('status').eq('id', requestId).single(),
      admin.from('cost_allocations').select('invoice_id,amount').eq('invoice_id', invoiceId).single(),
    ])
    expect(completed.status).toBe('faturasi_kesildi')
    expect(Number(allocation.amount)).toBeGreaterThan(0)
  })

  test('red sonrası muhasebe faturayı siler ve talep fatura bekleyene döner', async () => {
    const siteUserId = (await santiye.auth.getUser()).data.user.id
    const adminId = (await admin.auth.getUser()).data.user.id
    const pmId = (await projeYoneticisi.auth.getUser()).data.user.id
    const muhasebeId = (await muhasebe.auth.getUser()).data.user.id
    const deleteMarker = `${marker}_DELETE`

    const { data: deleteRequestId, error: createError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: projectId, p_title: deleteMarker, p_urgency: 'normal', p_category: 'diger',
      p_request_note: deleteMarker, p_requested_by: siteUserId,
      p_items: [{ name: 'Test diğer talep', quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(createError).toBeNull()
    requestIds.push(deleteRequestId)

    expect((await admin.from('purchase_requests').update({ status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString() }).eq('id', deleteRequestId)).error).toBeNull()
    expect((await projeYoneticisi.from('purchase_requests').update({ supplier_id: supplierId, purchase_date: new Date().toISOString().slice(0, 10), purchased_by: pmId }).eq('id', deleteRequestId)).error).toBeNull()

    const { data: deleteInvoice, error: invoiceError } = await muhasebe.from('invoices').insert({
      project_id: projectId, purchase_request_id: deleteRequestId, supplier_id: supplierId,
      invoice_no: deleteMarker, invoice_date: new Date().toISOString().slice(0, 10), amount: 50,
      vat_rate: 20, category: 'diger', description: deleteMarker, source: 'satin_alma',
      status: 'bekliyor', created_by: muhasebeId,
    }).select('id').single()
    expect(invoiceError).toBeNull()
    invoiceIds.push(deleteInvoice.id)

    expect((await admin.from('invoice_approvals').update({ status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString() }).eq('invoice_id', deleteInvoice.id).eq('status', 'bekliyor')).error).toBeNull()
    expect((await muhasebe.rpc('delete_rejected_invoice', { p_invoice_id: deleteInvoice.id })).error).toBeNull()

    const [{ data: removedInvoice }, { data: resetRequest }] = await Promise.all([
      admin.from('invoices').select('id').eq('id', deleteInvoice.id).maybeSingle(),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', deleteRequestId).single(),
    ])
    expect(removedInvoice).toBeNull()
    expect(resetRequest).toMatchObject({ status: 'satin_alindi', invoice_id: null })
  })
})
