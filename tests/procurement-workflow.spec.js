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

    const muhasebeId = (await muhasebe.auth.getUser()).data.user.id
    const { error: earlyInvoiceError } = await muhasebe.from('invoices').insert({
      project_id: projectId,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: `${marker}_EARLY`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 100,
      vat_rate: 20,
      category: 'malzeme',
      source: 'satin_alma',
      status: 'bekliyor',
      created_by: muhasebeId,
    })
    expect(earlyInvoiceError?.message).toContain('fatura eklemeye uygun değil')

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

    const asOfDate = new Date().toISOString().slice(0, 10)
    const { data: financeBefore, error: financeBeforeError } = await admin.rpc('get_finans_overview', {
      p_project_id: projectId, p_as_of_date: asOfDate,
    })
    expect(financeBeforeError).toBeNull()

    const { data: otherProject } = await admin.from('projects').select('id').neq('id', projectId).limit(1).single()
    const { error: wrongProjectInvoiceError } = await muhasebe.from('invoices').insert({
      project_id: otherProject.id,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: `${marker}_WRONG_PROJECT`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 100,
      vat_rate: 20,
      category: 'malzeme',
      source: 'satin_alma',
      status: 'bekliyor',
      created_by: muhasebeId,
    })
    expect(wrongProjectInvoiceError?.message).toContain('aynı olmalıdır')

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

    const [{ data: persistedInvoice }, { data: awaitingInvoice }, { data: financePending }] = await Promise.all([
      admin.from('invoices').select('status,amount,vat_rate,vat_amount,total_amount,project_id,category').eq('id', invoiceId).single(),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', requestId).single(),
      admin.rpc('get_finans_overview', { p_project_id: projectId, p_as_of_date: asOfDate }),
    ])
    expect(persistedInvoice.status).toBe('yönetici_onayında')
    expect(Number(persistedInvoice.amount)).toBe(100)
    expect(Number(persistedInvoice.vat_rate)).toBe(20)
    expect(Number(persistedInvoice.vat_amount)).toBe(20)
    expect(Number(persistedInvoice.total_amount)).toBe(120)
    expect(persistedInvoice.project_id).toBe(projectId)
    expect(persistedInvoice.category).toBe('malzeme')
    expect(awaitingInvoice).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: invoiceId })
    expect(Number(financePending.kpi.totalActual)).toBe(Number(financeBefore.kpi.totalActual))
    expect(Number(financePending.kpi.pendingAmount)).toBe(Number(financeBefore.kpi.pendingAmount) + 120)

    const { data: forbiddenRows, error: forbiddenApproval } = await muhasebe.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: muhasebeId,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor').select('id')
    expect(forbiddenApproval).toBeNull()
    expect(forbiddenRows).toHaveLength(0)

    const { error: rejectError } = await admin.from('invoice_approvals').update({
      status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString(), note: marker,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')
    expect(rejectError).toBeNull()

    const [{ data: rejectedInvoice }, { data: requestAfterReject }, { data: hiddenFromAccounting }] = await Promise.all([
      muhasebe.from('invoices').select('status').eq('id', invoiceId).single(),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', requestId).single(),
      muhasebe.from('purchase_requests').select('id').eq('id', requestId),
    ])
    expect(rejectedInvoice.status).toBe('reddedildi')
    expect(requestAfterReject).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: invoiceId })
    expect(hiddenFromAccounting).toHaveLength(0)

    const { error: secondInvoiceError } = await muhasebe.from('invoices').insert({
      project_id: projectId,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: `${marker}_SECOND`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 100,
      vat_rate: 20,
      category: 'malzeme',
      source: 'satin_alma',
      status: 'bekliyor',
      created_by: muhasebeId,
    })
    expect(secondInvoiceError).toBeTruthy()

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

    const [{ data: completed }, { data: allocation }, { data: financeApproved }] = await Promise.all([
      admin.from('purchase_requests').select('status').eq('id', requestId).single(),
      admin.from('cost_allocations').select('invoice_id,project_id,amount,category').eq('invoice_id', invoiceId).single(),
      admin.rpc('get_finans_overview', { p_project_id: projectId, p_as_of_date: asOfDate }),
    ])
    expect(completed.status).toBe('faturasi_kesildi')
    expect(allocation.project_id).toBe(projectId)
    expect(allocation.category).toBe('malzeme')
    expect(Number(allocation.amount)).toBe(132)
    expect(Number(financeApproved.kpi.pendingAmount)).toBe(Number(financeBefore.kpi.pendingAmount))
    expect(Number(financeApproved.kpi.totalActual)).toBe(Number(financeBefore.kpi.totalActual) + 132)
    expect(Number(financeApproved.kpi.remainingBudget)).toBe(Number(financeBefore.kpi.remainingBudget) - 132)
    expect(Number(financeApproved.costBuckets.totalActual)).toBe(Number(financeBefore.costBuckets.totalActual) + 132)

    const { count: notificationsBeforeRepeat } = await admin.from('notifications')
      .select('id', { count: 'exact', head: true }).eq('entity_id', invoiceId)
    const { data: repeatedApprovalRows, error: repeatedApprovalError } = await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor').select('id')
    expect(repeatedApprovalError).toBeNull()
    expect(repeatedApprovalRows).toHaveLength(0)

    const [{ count: allocationCount }, { count: notificationsAfterRepeat }] = await Promise.all([
      admin.from('cost_allocations').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId),
      admin.from('notifications').select('id', { count: 'exact', head: true }).eq('entity_id', invoiceId),
    ])
    expect(allocationCount).toBe(1)
    expect(notificationsAfterRepeat).toBe(notificationsBeforeRepeat)
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

    const financeDate = new Date().toISOString().slice(0, 10)
    const { data: financeBeforeRejected } = await admin.rpc('get_finans_overview', {
      p_project_id: projectId, p_as_of_date: financeDate,
    })

    const { data: deleteInvoice, error: invoiceError } = await muhasebe.from('invoices').insert({
      project_id: projectId, purchase_request_id: deleteRequestId, supplier_id: supplierId,
      invoice_no: deleteMarker, invoice_date: new Date().toISOString().slice(0, 10), amount: 50,
      vat_rate: 20, category: 'diger', description: deleteMarker, source: 'satin_alma',
      status: 'bekliyor', created_by: muhasebeId,
    }).select('id').single()
    expect(invoiceError).toBeNull()
    invoiceIds.push(deleteInvoice.id)

    expect((await admin.from('invoice_approvals').update({ status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString() }).eq('invoice_id', deleteInvoice.id).eq('status', 'bekliyor')).error).toBeNull()
    const { data: financeAfterReject } = await admin.rpc('get_finans_overview', {
      p_project_id: projectId, p_as_of_date: financeDate,
    })
    expect(Number(financeAfterReject.kpi.totalActual)).toBe(Number(financeBeforeRejected.kpi.totalActual))
    expect(Number(financeAfterReject.kpi.pendingAmount)).toBe(Number(financeBeforeRejected.kpi.pendingAmount))

    expect((await muhasebe.rpc('delete_rejected_invoice', { p_invoice_id: deleteInvoice.id })).error).toBeNull()

    const [{ data: removedInvoice }, { data: resetRequest }, { data: financeAfterDelete }] = await Promise.all([
      admin.from('invoices').select('id').eq('id', deleteInvoice.id).maybeSingle(),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', deleteRequestId).single(),
      admin.rpc('get_finans_overview', { p_project_id: projectId, p_as_of_date: financeDate }),
    ])
    expect(removedInvoice).toBeNull()
    expect(resetRequest).toMatchObject({ status: 'satin_alindi', invoice_id: null })
    expect(Number(financeAfterDelete.kpi.totalActual)).toBe(Number(financeBeforeRejected.kpi.totalActual))
    expect(Number(financeAfterDelete.kpi.pendingAmount)).toBe(Number(financeBeforeRejected.kpi.pendingAmount))
  })

  test('onaylı faturayı yönetici iptal eder; muhasebe düzeltir veya silip yenisini ekler', async () => {
    const siteUserId = (await santiye.auth.getUser()).data.user.id
    const adminId = (await admin.auth.getUser()).data.user.id
    const pmId = (await projeYoneticisi.auth.getUser()).data.user.id
    const muhasebeId = (await muhasebe.auth.getUser()).data.user.id
    const cancelMarker = `${marker}_APPROVED_CANCEL`

    const { data: cancelRequestId, error: createError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: projectId, p_title: cancelMarker, p_urgency: 'normal', p_category: 'diger',
      p_request_note: cancelMarker, p_requested_by: siteUserId,
      p_items: [{ name: 'Onaylı fatura iptal testi', quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(createError).toBeNull()
    requestIds.push(cancelRequestId)
    expect((await admin.from('purchase_requests').update({ status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString() }).eq('id', cancelRequestId)).error).toBeNull()
    expect((await projeYoneticisi.from('purchase_requests').update({ supplier_id: supplierId, purchase_date: new Date().toISOString().slice(0, 10), purchased_by: pmId }).eq('id', cancelRequestId)).error).toBeNull()

    const makeInvoice = invoiceNo => ({
      project_id: projectId, purchase_request_id: cancelRequestId, supplier_id: supplierId,
      invoice_no: invoiceNo, invoice_date: new Date().toISOString().slice(0, 10), amount: 80,
      vat_rate: 20, category: 'diger', description: cancelMarker, source: 'satin_alma',
      status: 'bekliyor', created_by: muhasebeId,
    })
    const { data: firstInvoice, error: firstInvoiceError } = await muhasebe.from('invoices')
      .insert(makeInvoice(cancelMarker)).select('id').single()
    expect(firstInvoiceError).toBeNull()
    invoiceIds.push(firstInvoice.id)
    expect((await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', firstInvoice.id).eq('status', 'bekliyor')).error).toBeNull()
    expect((await admin.from('cost_allocations').select('id').eq('invoice_id', firstInvoice.id).single()).data).toBeTruthy()

    expect((await admin.from('invoices').update({ status: 'reddedildi' }).eq('id', firstInvoice.id)).error).toBeNull()
    const [{ data: cancelled }, { count: allocationAfterCancel }, { data: requestAfterCancel }] = await Promise.all([
      muhasebe.from('invoices').select('status').eq('id', firstInvoice.id).single(),
      admin.from('cost_allocations').select('id', { count: 'exact', head: true }).eq('invoice_id', firstInvoice.id),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', cancelRequestId).single(),
    ])
    expect(cancelled.status).toBe('reddedildi')
    expect(allocationAfterCancel).toBe(0)
    expect(requestAfterCancel).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: firstInvoice.id })
    expect((await admin.rpc('resubmit_rejected_invoice', { p_invoice_id: firstInvoice.id })).error?.message).toContain('yalnızca muhasebe')
    expect((await admin.rpc('delete_rejected_invoice', { p_invoice_id: firstInvoice.id })).error?.message).toContain('yalnızca muhasebe')

    expect((await muhasebe.from('invoices').update({ invoice_no: `${cancelMarker}_REV`, amount: 90 }).eq('id', firstInvoice.id)).error).toBeNull()
    expect((await muhasebe.rpc('resubmit_rejected_invoice', { p_invoice_id: firstInvoice.id })).error).toBeNull()
    expect((await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', firstInvoice.id).eq('status', 'bekliyor')).error).toBeNull()
    expect((await admin.from('invoices').update({ status: 'reddedildi' }).eq('id', firstInvoice.id)).error).toBeNull()
    expect((await muhasebe.rpc('delete_rejected_invoice', { p_invoice_id: firstInvoice.id })).error).toBeNull()

    const { data: waitingAgain } = await admin.from('purchase_requests').select('status,invoice_id').eq('id', cancelRequestId).single()
    expect(waitingAgain).toMatchObject({ status: 'satin_alindi', invoice_id: null })
    const { data: replacementInvoice, error: replacementError } = await muhasebe.from('invoices')
      .insert(makeInvoice(`${cancelMarker}_NEW`)).select('id').single()
    expect(replacementError).toBeNull()
    invoiceIds.push(replacementInvoice.id)
    const { data: linkedAgain } = await admin.from('purchase_requests').select('status,invoice_id').eq('id', cancelRequestId).single()
    expect(linkedAgain).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: replacementInvoice.id })
  })
})
