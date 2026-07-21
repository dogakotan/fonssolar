import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

const marker = `E2E_SINGLE_ITEM_${Date.now()}`

test.describe.serial('Satın alma talebi tek kalem kuralı', () => {
  let admin, pm, pmId, projectId
  const requestIds = []

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    pmId = (await pm.auth.getUser()).data.user.id
    projectId = process.env.TEST_PROJECT_IZMIR
  })

  test.afterAll(async () => {
    if (requestIds.length) await admin.from('purchase_requests').delete().in('id', requestIds)
  })

  test('çok kalemli RPC isteği atomik olarak reddedilir', async () => {
    const title = `${marker}_MULTI`
    const { data, error } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: projectId,
      p_title: title,
      p_urgency: 'normal',
      p_category: 'malzeme',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [
        { name: 'Kalem A', quantity: 1, unit: 'Adet', bom_item_id: null },
        { name: 'Kalem B', quantity: 1, unit: 'Adet', bom_item_id: null },
      ],
    })
    expect(data).toBeNull()
    expect(error?.message).toContain('tam olarak bir kalem')
    const { count } = await admin.from('purchase_requests')
      .select('id', { count: 'exact', head: true }).eq('title', title)
    expect(count).toBe(0)
  })

  test('normal tek kalemli talep oluşur, ikinci kalem doğrudan eklenemez', async () => {
    const { data: requestId, error } = await pm.rpc('create_purchase_request_with_items', {
      p_project_id: projectId,
      p_title: `${marker}_NORMAL`,
      p_urgency: 'normal',
      p_category: 'diger',
      p_request_note: marker,
      p_requested_by: pmId,
      p_items: [{ name: 'Tek Kalem', quantity: 1, unit: 'Adet', bom_item_id: null }],
    })
    expect(error).toBeNull()
    requestIds.push(requestId)

    const second = await pm.from('purchase_request_items').insert({
      request_id: requestId, name: 'Kaçak İkinci Kalem', quantity: 1, unit: 'Adet',
    })
    expect(second.error?.message).toContain('yalnızca bir kalem')

    const { count } = await admin.from('purchase_request_items')
      .select('id', { count: 'exact', head: true }).eq('request_id', requestId)
    expect(count).toBe(1)
  })

  test('eş zamanlı iki ilk kalemden yalnızca biri kabul edilir', async () => {
    const { data: request, error } = await pm.from('purchase_requests').insert({
      project_id: projectId,
      title: `${marker}_CONCURRENT`,
      urgency: 'normal',
      category: 'diger',
      request_note: marker,
      status: 'talep_olusturuldu',
      requested_by: pmId,
    }).select('id').single()
    expect(error).toBeNull()
    requestIds.push(request.id)

    const results = await Promise.all([
      pm.from('purchase_request_items').insert({ request_id: request.id, name: 'Eş Zamanlı A', quantity: 1, unit: 'Adet' }),
      pm.from('purchase_request_items').insert({ request_id: request.id, name: 'Eş Zamanlı B', quantity: 1, unit: 'Adet' }),
    ])
    expect(results.filter(result => !result.error)).toHaveLength(1)
    expect(results.filter(result => result.error)).toHaveLength(1)
    expect(results.find(result => result.error).error.message).toContain('yalnızca bir kalem')

    const { count } = await admin.from('purchase_request_items')
      .select('id', { count: 'exact', head: true }).eq('request_id', request.id)
    expect(count).toBe(1)
  })
})
