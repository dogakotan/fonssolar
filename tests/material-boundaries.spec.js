import { test, expect } from '@playwright/test'
import { signIn } from './helpers.js'

const marker = `E2E_BOM_BOUNDARY_${Date.now()}`

test.describe.serial('Malzeme listesi sınır durumları', () => {
  let admin, pm, projectId, itemId
  const changeIds = []

  async function addRequest(name, qty) {
    const result = await pm.rpc('create_procurement_item_add_request', {
      p_project_id: projectId,
      p_equipment: name,
      p_unit: 'Adet',
      p_category: 'Genel',
      p_planned_qty: qty,
      p_note: marker,
    })
    if (result.data) changeIds.push(result.data)
    return result
  }

  async function changeRequest(qty) {
    const result = await pm.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: itemId,
      p_new_planned_qty: qty,
      p_note: marker,
    })
    if (result.data) changeIds.push(result.data)
    return result
  }

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    projectId = process.env.TEST_PROJECT_IZMIR

    const { data: addId, error } = await addRequest(marker, 10)
    expect(error).toBeNull()
    expect((await admin.rpc('review_procurement_item_change_request', {
      p_id: addId, p_approve: true, p_review_note: marker,
    })).error).toBeNull()
    const { data: item } = await admin.from('procurement_items')
      .select('id').eq('project_id', projectId).eq('equipment', marker).single()
    itemId = item.id
  })

  test.afterAll(async () => {
    for (const id of changeIds) {
      await admin.rpc('review_procurement_item_change_request', {
        p_id: id, p_approve: false, p_review_note: marker,
      })
    }
    if (changeIds.length) await admin.from('procurement_item_change_requests').delete().in('id', changeIds)
    if (itemId) await admin.from('procurement_items').delete().eq('id', itemId)
  })

  test('aynı kalem için ikinci bekleyen değişiklik reddedilir', async () => {
    const first = await changeRequest(11)
    const second = await changeRequest(12)
    expect(first.error).toBeNull()
    expect(second.error?.message).toContain('zaten onay bekleyen')
    const { count } = await admin.from('procurement_item_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('procurement_item_id', itemId).eq('status', 'bekliyor')
    expect(count).toBe(1)
    expect((await admin.rpc('review_procurement_item_change_request', {
      p_id: first.data, p_approve: false, p_review_note: marker,
    })).error).toBeNull()
  })

  test('aynı proje ve malzeme adıyla yeni talep reddedilir', async () => {
    const duplicate = await addRequest(`  ${marker.toLowerCase()}  `, 5)
    expect(duplicate.error?.message).toContain('aynı isimde bir malzeme')
    expect(duplicate.data).toBeNull()
  })

  test('sıfır ve negatif miktar talepleri reddedilir', async () => {
    const zero = await addRequest(`${marker}_ZERO`, 0)
    const negative = await changeRequest(-1)
    expect(zero.error?.message).toContain('sıfırdan büyük')
    expect(negative.error?.message).toContain('sıfırdan büyük')
    expect(zero.data).toBeNull()
    expect(negative.data).toBeNull()
  })

  test('aynı admin onayı ikinci kez uygulanamıyor', async () => {
    const single = await addRequest(`${marker}_DOUBLE_REVIEW`, 3)
    expect(single.error).toBeNull()
    expect((await admin.rpc('review_procurement_item_change_request', {
      p_id: single.data, p_approve: false, p_review_note: marker,
    })).error).toBeNull()
    const secondReview = await admin.rpc('review_procurement_item_change_request', {
      p_id: single.data, p_approve: true, p_review_note: marker,
    })
    expect(secondReview.error?.message).toContain('zaten sonuçlandırılmış')
  })
})
