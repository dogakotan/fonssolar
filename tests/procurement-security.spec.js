import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

const marker = `E2E_SECURITY_${Date.now()}`

test.describe.serial('Satın alma yetki ve RLS güvenliği', () => {
  let admin, muhasebe, santiye, pm, anon
  let adminId, muhasebeId, pmId, siteId, siteProjectId, foreignProjectId
  let requestId, invoiceId, supplierId

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    anon = makeClient()

    ;[adminId, muhasebeId, siteId, pmId] = await Promise.all(
      [admin, muhasebe, santiye, pm].map(async client => (await client.auth.getUser()).data.user.id)
    )
    siteProjectId = process.env.TEST_PROJECT_IZMIR
    const [{ data: projects }, { data: suppliers }] = await Promise.all([
      admin.from('projects').select('id').neq('id', siteProjectId).limit(1),
      pm.from('suppliers').select('id').limit(1),
    ])
    expect(projects?.[0]).toBeTruthy()
    expect(suppliers?.[0]).toBeTruthy()
    foreignProjectId = projects[0].id
    supplierId = suppliers[0].id

    const { data: createdId, error: createError } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: foreignProjectId,
      p_title: marker,
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: marker, quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(createError).toBeNull()
    requestId = createdId
  })

  test.afterAll(async () => {
    const entityIds = [requestId, invoiceId].filter(Boolean)
    if (entityIds.length) {
      await Promise.all([admin, muhasebe, santiye, pm].map(client =>
        client.from('notifications').delete().in('entity_id', entityIds)
      ))
    }
    if (invoiceId) {
      const { error } = await admin.from('invoices').delete().eq('id', invoiceId)
      expect(error).toBeNull()
    }
    if (requestId) {
      const { error } = await admin.from('purchase_requests').delete().eq('id', requestId)
      expect(error).toBeNull()
    }
  })

  test('şantiye şefi başka projeyi listeleyemez, okuyamaz, yazamaz ve export edemez', async () => {
    const { data: visibleProjects, error: projectError } = await santiye.rpc('get_my_projects')
    expect(projectError).toBeNull()
    expect(visibleProjects.map(project => project.id)).not.toContain(foreignProjectId)

    const { data: projectRows, error: selectProjectError } = await santiye.from('projects')
      .select('id').eq('id', foreignProjectId)
    expect(selectProjectError).toBeNull()
    expect(projectRows).toHaveLength(0)

    const { data: requestRows, error: selectRequestError } = await santiye.from('purchase_requests')
      .select('id').eq('id', requestId)
    expect(selectRequestError).toBeNull()
    expect(requestRows).toHaveLength(0)

    const { data: detail, error: detailError } = await santiye.rpc('get_purchase_request_detail', { p_id: requestId })
    expect(detailError).toBeNull()
    expect(detail?.authorized).toBe(false)

    const { error: foreignCreateError } = await santiye.rpc('create_purchase_request_with_items', {
      p_project_id: foreignProjectId,
      p_title: `${marker}_FORBIDDEN`,
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: siteId,
      p_items: [{ name: marker, quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(foreignCreateError?.message).toContain('erişim yetkiniz yok')

    const { data: updatedRows, error: updateError } = await santiye.from('purchase_requests')
      .update({ title: `${marker}_HACKED` }).eq('id', requestId).select('id')
    expect(updateError).toBeNull()
    expect(updatedRows).toHaveLength(0)

    const session = (await santiye.auth.getSession()).data.session
    const exportResponse = await fetch(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/export-project-excel?project_id=${encodeURIComponent(foreignProjectId)}`,
      { headers: { Authorization: `Bearer ${session.access_token}`, apikey: process.env.VITE_SUPABASE_ANON_KEY } },
    )
    expect(exportResponse.status).toBe(403)
  })

  test('cross-project proje yöneticisi projects tablosunu doğrudan tüm kapsamıyla okuyabilir', async () => {
    const { data: projectRows, error } = await pm.from('projects').select('id')

    expect(error).toBeNull()
    expect(projectRows.map(project => project.id)).toEqual(
      expect.arrayContaining([siteProjectId, foreignProjectId]),
    )
  })

  test('tedarik ve teslimat tamamlandı onayını yalnızca proje yöneticisi verebilir', async () => {
    const { data: initial, error: initialError } = await pm.from('projects')
      .select('procurement_completed,procurement_completed_at,procurement_completed_by')
      .eq('id', foreignProjectId)
      .single()
    expect(initialError).toBeNull()
    expect(initial.procurement_completed).toBe(false)

    const { error: adminError } = await admin.rpc('set_project_procurement_completed', {
      p_project_id: foreignProjectId,
      p_completed: true,
    })
    expect(adminError?.message).toContain('yalnızca proje yöneticisi')

    const { error: siteError } = await santiye.rpc('set_project_procurement_completed', {
      p_project_id: foreignProjectId,
      p_completed: true,
    })
    expect(siteError?.message).toContain('yalnızca proje yöneticisi')

    const { error: completeError } = await pm.rpc('set_project_procurement_completed', {
      p_project_id: foreignProjectId,
      p_completed: true,
    })
    expect(completeError).toBeNull()

    const { data: completed, error: readError } = await pm.from('projects')
      .select('procurement_completed,procurement_completed_at,procurement_completed_by')
      .eq('id', foreignProjectId)
      .single()
    expect(readError).toBeNull()
    expect(completed).toMatchObject({
      procurement_completed: true,
      procurement_completed_by: pmId,
    })
    expect(completed.procurement_completed_at).toBeTruthy()

    const { error: restoreError } = await pm.rpc('set_project_procurement_completed', {
      p_project_id: foreignProjectId,
      p_completed: false,
    })
    expect(restoreError).toBeNull()
  })

  test('oturumsuz kullanıcı hassas yazma RPC’lerini çağıramaz', async () => {
    const attempts = await Promise.all([
      anon.rpc('create_purchase_request_with_items', {
        p_project_id: siteProjectId, p_title: marker, p_category: 'diger',
        p_request_note: marker, p_requested_by: siteId,
        p_items: [{ name: marker, quantity: 1, unit: 'Adet', bom_item_id: null }],
      }),
      anon.rpc('create_procurement_item_add_request', {
        p_project_id: siteProjectId, p_equipment: marker, p_unit: 'Adet',
        p_category: 'Genel', p_planned_qty: 1, p_note: marker,
      }),
      anon.rpc('review_procurement_item_change_request', {
        p_id: '00000000-0000-0000-0000-000000000000', p_approve: true, p_review_note: marker,
      }),
      anon.rpc('resubmit_rejected_invoice', { p_invoice_id: '00000000-0000-0000-0000-000000000000' }),
      anon.rpc('delete_rejected_invoice', { p_invoice_id: '00000000-0000-0000-0000-000000000000' }),
      anon.rpc('set_project_procurement_completed', { p_project_id: siteProjectId, p_completed: true }),
      anon.rpc('complete_project_manager_purchase_request', { p_request_id: requestId }),
    ])
    for (const result of attempts) expect(result.error).toBeTruthy()
  })

  test('yalnızca yönetici (admin/proje yöneticisi) fatura onayını değiştirebilir', async () => {
    expect((await admin.from('purchase_requests').update({
      status: 'onaylandi', approved_by: adminId, approved_at: new Date().toISOString(),
    }).eq('id', requestId)).error).toBeNull()

    const adminCompletion = await admin.rpc('complete_project_manager_purchase_request', {
      p_request_id: requestId,
    })
    expect(adminCompletion.error?.message).toContain('yalnızca proje yöneticisi')

    const siteCompletion = await santiye.rpc('complete_project_manager_purchase_request', {
      p_request_id: requestId,
    })
    expect(siteCompletion.error?.message).toContain('yalnızca proje yöneticisi')

    const pmCompletion = await pm.rpc('complete_project_manager_purchase_request', {
      p_request_id: requestId,
    })
    expect(pmCompletion.error).toBeNull()
    expect(pmCompletion.data).toMatchObject({
      request_id: requestId,
      project_id: foreignProjectId,
      status: 'satin_alindi',
    })

    const duplicateCompletion = await pm.rpc('complete_project_manager_purchase_request', {
      p_request_id: requestId,
    })
    expect(duplicateCompletion.error?.message).toContain('proje yöneticisinde bekleyen')

    const { data: completedRequest, error: completedRequestError } = await admin
      .from('purchase_requests')
      .select('status,purchase_date,purchased_by')
      .eq('id', requestId)
      .single()
    expect(completedRequestError).toBeNull()
    expect(completedRequest).toMatchObject({
      status: 'satin_alindi',
      purchased_by: pmId,
    })
    expect(completedRequest.purchase_date).toBeTruthy()

    // taslak'tan başlar — 'bekliyor' artık invoices_status_check'te yok (akış
    // taslak'tan başlıyor, bkz. CLAUDE.md "Fatura onay akışı").
    const { data: invoice, error: invoiceError } = await muhasebe.from('invoices').insert({
      project_id: foreignProjectId,
      purchase_request_id: requestId,
      supplier_id: supplierId,
      invoice_no: marker,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount: 100,
      vat_rate: 20,
      category: 'diger',
      description: marker,
      source: 'satin_alma',
      status: 'taslak',
      created_by: muhasebeId,
    }).select('id').single()
    expect(invoiceError).toBeNull()
    invoiceId = invoice.id

    // Onaya Gönder — invoice_approvals'a step=1 satırı INSERT edilir (artık
    // invoice insert'i bunu otomatik oluşturmuyor, bkz. fn_invoice_approval_submitted).
    expect((await muhasebe.from('invoice_approvals').insert({
      invoice_id: invoiceId, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
    })).error).toBeNull()

    // muhasebe invoice_approvals'ı RLS düzeyinde güncelleyebilir (kaba taneli rol
    // kontrolü, bkz. CLAUDE.md) ama asıl geçiş kuralı fn_validate_invoice_status_transition'da
    // merkezi — muhasebenin invoices.status'u 'yönetici_onayında' -> 'onaylandı'ya
    // taşıması izinli değil, cascade trigger'ı bu yüzden hata fırlatır (satır RLS'te
    // sessizce filtrelenmez, gerçek bir exception olur).
    const muhasebeAttempt = await muhasebe.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: muhasebeId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor').select('id')
    expect(muhasebeAttempt.error).not.toBeNull()

    const { data: stillPending } = await admin.from('invoice_approvals')
      .select('status').eq('invoice_id', invoiceId).eq('status', 'bekliyor').single()
    expect(stillPending.status).toBe('bekliyor')

    // proje yöneticisi ("Yönetici") de admin gibi doğrudan invoices tablosuna yazamaz —
    // invoices_update RLS'i yalnızca admin/muhasebe'ye açık, proje_yoneticisi yalnızca
    // invoice_approvals üzerinden (SECURITY DEFINER cascade ile) hareket edebilir.
    const { data: pmInvoiceUpdate, error: pmInvoiceError } = await pm.from('invoices')
      .update({ status: 'onaylandı' }).eq('id', invoiceId).select('id')
    expect(pmInvoiceError).toBeNull()
    expect(pmInvoiceUpdate).toHaveLength(0)

    // Gerçek onay — tek onaylayıcı "Yönetici" artık proje_yoneticisi (admin da aynı
    // yetkiyle aksiyon alabilir, bkz. CLAUDE.md "Fatura onay akışı").
    const { data: approvedRows, error: pmApprovalError } = await pm.from('invoice_approvals').update({
      status: 'onaylandı', reviewer_id: pmId, reviewed_at: new Date().toISOString(),
    }).eq('invoice_id', invoiceId).eq('status', 'bekliyor').select('id')
    expect(pmApprovalError).toBeNull()
    expect(approvedRows).toHaveLength(1)
  })

  test('kimlik alanları değiştirilerek yetki yükseltilemez', async () => {
    const { data: requesterMutation, error: requesterError } = await pm.from('purchase_requests')
      .update({ requested_by: adminId }).eq('id', requestId).select('requested_by')
    expect(requesterError).toBeTruthy()
    expect(requesterMutation).toBeNull()

    const { data: projectMutation, error: projectMutationError } = await pm.from('purchase_requests')
      .update({ project_id: siteProjectId }).eq('id', requestId).select('project_id')
    expect(projectMutationError).toBeTruthy()
    expect(projectMutation).toBeNull()

    const { data: persisted } = await admin.from('purchase_requests')
      .select('requested_by,project_id').eq('id', requestId).single()
    expect(persisted).toMatchObject({ requested_by: pmId, project_id: foreignProjectId })
  })
})
