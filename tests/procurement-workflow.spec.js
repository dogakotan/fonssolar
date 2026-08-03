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
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: 'Geçersiz test talebi', quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(missingProjectError?.message).toContain('Proje seçimi zorunludur')
  })

  test('tam akış, red sonrası fatura kurtarma (yeni fatura ile devam)', async () => {
    const quantity = Math.max(1, Math.min(2, Number(bomItem.planned_qty) || 1))
    const { data: createdId, error: createError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: projectId,
      p_title: `${marker} Malzeme`,
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
      status: 'taslak',
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
      status: 'taslak',
      created_by: muhasebeId,
    })
    expect(wrongProjectInvoiceError?.message).toContain('aynı olmalıdır')

    // taslak'tan başlar — 'bekliyor' artık invoices_status_check'te yok.
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
      status: 'taslak',
      created_by: muhasebeId,
    }).select('id,status').single()
    expect(invoiceError).toBeNull()
    invoiceId = invoice.id
    invoiceIds.push(invoiceId)

    // taslak halindeyken talep zaten fatura_onay_bekliyor'a düşer (sync_purchase_request_from_invoice,
    // invoice.status'tan bağımsız — INSERT'in kendisi tetikler) ama invoices.status henüz
    // 'yönetici_onayında' değil, "Onaya Gönder" (invoice_approvals INSERT) ile geçer.
    expect((await muhasebe.from('invoice_approvals').insert({
      invoice_id: invoiceId, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
    })).error).toBeNull()

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

    // muhasebe RLS düzeyinde invoice_approvals'ı güncelleyebilir (kaba taneli rol
    // kontrolü) ama fn_validate_invoice_status_transition muhasebenin invoices.status'u
    // 'yönetici_onayında' -> 'onaylandı'ya taşımasına izin vermez — cascade trigger'ı
    // bu yüzden gerçek bir hata fırlatır (satır sessizce filtrelenmez).
    const { error: forbiddenApproval } = await muhasebe.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: muhasebeId,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor').select('id')
    expect(forbiddenApproval).not.toBeNull()

    const { error: rejectError } = await admin.from('invoice_approvals').update({
      status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString(), note: marker,
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor')
    expect(rejectError).toBeNull()

    // Reddedilme, sync_purchase_request_from_invoice ile talebi ANINDA satin_alindi'ye
    // döndürüp invoice_id'yi null'lar (20260729130000_fix_purchase_request_revert_on_invoice_rejection'dan
    // beri — öncesinde yanlışlıkla fatura_onay_bekliyor'da bırakıyordu). Bu durumda talep
    // muhasebenin kapsamına (satin_alindi/fatura_bekliyor) tekrar girdiğinden artık görünür.
    const [{ data: rejectedInvoice }, { data: requestAfterReject }, { data: visibleToAccountingAfterReject }] = await Promise.all([
      muhasebe.from('invoices').select('status').eq('id', invoiceId).single(),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', requestId).single(),
      muhasebe.from('purchase_requests').select('id').eq('id', requestId),
    ])
    expect(rejectedInvoice.status).toBe('reddedildi')
    expect(requestAfterReject).toMatchObject({ status: 'satin_alindi', invoice_id: null })
    expect(visibleToAccountingAfterReject).toHaveLength(1)

    // Reddedilen fatura NİHAİ bir durumdadır — düzenlenip yeniden gönderilemez (eski
    // resubmit_rejected_invoice RPC'si bu yüzden kaldırıldı). "Fatura kurtarma": talep
    // zaten satin_alindi'ye döndüğünden, kısmi unique index (yalnızca aktif faturalarda
    // tekillik, bkz. invoices_active_purchase_request_id_unique) ikinci bir fatura
    // oluşturmayı engellemez.
    const { data: secondInvoice, error: secondInvoiceError } = await muhasebe.from('invoices').insert({
      project_id: projectId,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: `${marker}_SECOND`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 110,
      vat_rate: 20,
      category: 'malzeme',
      description: marker,
      source: 'satin_alma',
      status: 'taslak',
      created_by: muhasebeId,
    }).select('id').single()
    expect(secondInvoiceError).toBeNull()
    const secondInvoiceId = secondInvoice.id
    invoiceIds.push(secondInvoiceId)

    expect((await muhasebe.from('invoice_approvals').insert({
      invoice_id: secondInvoiceId, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
    })).error).toBeNull()
    const { data: resubmitted } = await admin.from('invoices').select('status,invoice_no').eq('id', secondInvoiceId).single()
    expect(resubmitted).toMatchObject({ status: 'yönetici_onayında', invoice_no: `${marker}_SECOND` })

    const { error: finalApprovalError } = await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', secondInvoiceId).eq('status', 'bekliyor')
    expect(finalApprovalError).toBeNull()

    const [{ data: completed }, { data: allocation }, { data: financeApproved }] = await Promise.all([
      admin.from('purchase_requests').select('status').eq('id', requestId).single(),
      admin.from('cost_allocations').select('invoice_id,project_id,amount,category').eq('invoice_id', secondInvoiceId).single(),
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
      .select('id', { count: 'exact', head: true }).eq('entity_id', secondInvoiceId)
    const { data: repeatedApprovalRows, error: repeatedApprovalError } = await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', secondInvoiceId).eq('status', 'bekliyor').select('id')
    expect(repeatedApprovalError).toBeNull()
    expect(repeatedApprovalRows).toHaveLength(0)

    const [{ count: allocationCount }, { count: notificationsAfterRepeat }] = await Promise.all([
      admin.from('cost_allocations').select('id', { count: 'exact', head: true }).eq('invoice_id', secondInvoiceId),
      admin.from('notifications').select('id', { count: 'exact', head: true }).eq('entity_id', secondInvoiceId),
    ])
    expect(allocationCount).toBe(1)
    expect(notificationsAfterRepeat).toBe(notificationsBeforeRepeat)
  })

  test('red sonrası talep otomatik satın alındıya döner, fatura silinmeden kalır, finans sayıları sıfırlanır', async () => {
    const siteUserId = (await santiye.auth.getUser()).data.user.id
    const adminId = (await admin.auth.getUser()).data.user.id
    const pmId = (await projeYoneticisi.auth.getUser()).data.user.id
    const muhasebeId = (await muhasebe.auth.getUser()).data.user.id
    const deleteMarker = `${marker}_DELETE`

    const { data: deleteRequestId, error: createError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: projectId, p_title: deleteMarker, p_category: 'diger',
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
      status: 'taslak', created_by: muhasebeId,
    }).select('id').single()
    expect(invoiceError).toBeNull()
    invoiceIds.push(deleteInvoice.id)
    expect((await muhasebe.from('invoice_approvals').insert({
      invoice_id: deleteInvoice.id, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
    })).error).toBeNull()

    // taslaktan yönetici_onayında'ya geçtiğinde pendingAmount 60 (50+%20 KDV) artar.
    const { data: financePending } = await admin.rpc('get_finans_overview', {
      p_project_id: projectId, p_as_of_date: financeDate,
    })
    expect(Number(financePending.kpi.pendingAmount)).toBe(Number(financeBeforeRejected.kpi.pendingAmount) + 60)

    expect((await admin.from('invoice_approvals').update({ status: 'reddedildi', reviewer_id: adminId, reviewed_at: new Date().toISOString() }).eq('invoice_id', deleteInvoice.id).eq('status', 'bekliyor')).error).toBeNull()
    const { data: financeAfterReject } = await admin.rpc('get_finans_overview', {
      p_project_id: projectId, p_as_of_date: financeDate,
    })
    expect(Number(financeAfterReject.kpi.totalActual)).toBe(Number(financeBeforeRejected.kpi.totalActual))
    expect(Number(financeAfterReject.kpi.pendingAmount)).toBe(Number(financeBeforeRejected.kpi.pendingAmount))

    // Reddedilen fatura NİHAİ bir durumdadır — artık silinmez (eski delete_rejected_invoice
    // RPC'si bu yüzden kaldırıldı, hiçbir rol için invoices üzerinde DELETE RLS policy'si
    // yok). Satır DB'de 'reddedildi' olarak kalır, talep otomatik satin_alindi'ye döner.
    const [{ data: keptInvoice }, { data: resetRequest }] = await Promise.all([
      admin.from('invoices').select('id,status').eq('id', deleteInvoice.id).maybeSingle(),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', deleteRequestId).single(),
    ])
    expect(keptInvoice).toMatchObject({ id: deleteInvoice.id, status: 'reddedildi' })
    expect(resetRequest).toMatchObject({ status: 'satin_alindi', invoice_id: null })
  })

  test('onaylı faturayı yönetici iptal eder; talep otomatik satın alındıya döner ve yeniden faturalanır (iki kez)', async () => {
    const siteUserId = (await santiye.auth.getUser()).data.user.id
    const adminId = (await admin.auth.getUser()).data.user.id
    const pmId = (await projeYoneticisi.auth.getUser()).data.user.id
    const muhasebeId = (await muhasebe.auth.getUser()).data.user.id
    const cancelMarker = `${marker}_APPROVED_CANCEL`

    const { data: cancelRequestId, error: createError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: projectId, p_title: cancelMarker, p_category: 'diger',
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
      status: 'taslak', created_by: muhasebeId,
    })
    const submitForApproval = invoiceId => muhasebe.from('invoice_approvals').insert({
      invoice_id: invoiceId, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
    })

    const { data: firstInvoice, error: firstInvoiceError } = await muhasebe.from('invoices')
      .insert(makeInvoice(cancelMarker)).select('id').single()
    expect(firstInvoiceError).toBeNull()
    invoiceIds.push(firstInvoice.id)
    expect((await submitForApproval(firstInvoice.id)).error).toBeNull()
    expect((await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', firstInvoice.id).eq('status', 'bekliyor')).error).toBeNull()
    expect((await admin.from('cost_allocations').select('id').eq('invoice_id', firstInvoice.id).single()).data).toBeTruthy()

    // Yönetici (admin) onaylı/ödeme-bekleyen bir faturayı doğrudan invoices tablosuna
    // yazarak iptal edebilir (invoices_update RLS'i admin/muhasebe'ye açık) — bu,
    // proje_yoneticisi'nin invoice_approvals üzerinden hareket etmesinden farklı bir yol.
    expect((await admin.from('invoices').update({ status: 'reddedildi' }).eq('id', firstInvoice.id)).error).toBeNull()
    const [{ data: cancelled }, { count: allocationAfterCancel }, { data: requestAfterCancel }] = await Promise.all([
      muhasebe.from('invoices').select('status').eq('id', firstInvoice.id).single(),
      admin.from('cost_allocations').select('id', { count: 'exact', head: true }).eq('invoice_id', firstInvoice.id),
      admin.from('purchase_requests').select('status,invoice_id').eq('id', cancelRequestId).single(),
    ])
    expect(cancelled.status).toBe('reddedildi')
    expect(allocationAfterCancel).toBe(0)
    // sync_purchase_request_from_invoice bu UPDATE'te de aynı şekilde talebi anında
    // satin_alindi'ye döndürüp invoice_id'yi null'lar (reddedildi'ye giden HER geçişte
    // aynı davranış — ilk reddetme mi yoksa onaylı bir faturanın sonradan iptali mi
    // olduğu farketmiyor).
    expect(requestAfterCancel).toMatchObject({ status: 'satin_alindi', invoice_id: null })

    // Reddedilen fatura NİHAİ — düzenlenip yeniden gönderilemez, silinemez (eski
    // resubmit_rejected_invoice/delete_rejected_invoice RPC'leri bu yüzden kaldırıldı,
    // invoices üzerinde hiçbir role DELETE RLS policy'si yok). Talep zaten satin_alindi'ye
    // döndüğünden muhasebe doğrudan YENİ bir fatura oluşturur — bu kez tekrar onaylanıp
    // gerçekten "faturasi_kesildi"ye ulaşır (bir önceki testte bu adım hiç doğrulanmamıştı).
    const { data: secondInvoice, error: secondInvoiceError } = await muhasebe.from('invoices')
      .insert(makeInvoice(`${cancelMarker}_REV`)).select('id').single()
    expect(secondInvoiceError).toBeNull()
    invoiceIds.push(secondInvoice.id)
    const { data: linkedAgain } = await admin.from('purchase_requests').select('status,invoice_id').eq('id', cancelRequestId).single()
    expect(linkedAgain).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: secondInvoice.id })

    expect((await submitForApproval(secondInvoice.id)).error).toBeNull()
    expect((await admin.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: adminId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', secondInvoice.id).eq('status', 'bekliyor')).error).toBeNull()

    // İkinci iptal — talep yine satin_alindi'ye döner, muhasebe yine yeni bir fatura
    // oluşturabilir ("fatura kurtarma" bir kerelik bir istisna değil, tekrarlanabilir).
    expect((await admin.from('invoices').update({ status: 'reddedildi' }).eq('id', secondInvoice.id)).error).toBeNull()
    const { data: waitingAgain } = await admin.from('purchase_requests').select('status,invoice_id').eq('id', cancelRequestId).single()
    expect(waitingAgain).toMatchObject({ status: 'satin_alindi', invoice_id: null })

    const { data: replacementInvoice, error: replacementError } = await muhasebe.from('invoices')
      .insert(makeInvoice(`${cancelMarker}_NEW`)).select('id').single()
    expect(replacementError).toBeNull()
    invoiceIds.push(replacementInvoice.id)
    const { data: linkedThirdTime } = await admin.from('purchase_requests').select('status,invoice_id').eq('id', cancelRequestId).single()
    expect(linkedThirdTime).toMatchObject({ status: 'fatura_onay_bekliyor', invoice_id: replacementInvoice.id })
  })
})
