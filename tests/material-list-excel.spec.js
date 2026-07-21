import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import { signIn } from './helpers.js'

const marker = `E2E_BOM_EXCEL_${Date.now()}`

test.describe.serial('Malzeme listesi onayları ve proje Excel export', () => {
  let admin, pm, projectId, itemId
  const changeIds = []

  async function exportMaterialRows() {
    const session = (await pm.auth.getSession()).data.session
    const response = await fetch(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/export-project-excel?project_id=${encodeURIComponent(projectId)}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: process.env.VITE_SUPABASE_ANON_KEY,
        },
      },
    )
    expect(response.status).toBe(200)
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' })
    const sheet = workbook.Sheets['Malzeme Listesi']
    expect(sheet).toBeTruthy()
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }).slice(4)
  }

  function findExportedMaterial(rows) {
    return rows.find(row => row[2] === marker)
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
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    projectId = process.env.TEST_PROJECT_IZMIR
  })

  test.afterAll(async () => {
    if (changeIds.length) await admin.from('procurement_item_change_requests').delete().in('id', changeIds)
    if (itemId) await admin.from('procurement_items').delete().eq('id', itemId)
  })

  test('yeni malzeme beklerken Excel’e girmez, onaylanınca yeni satır olur', async () => {
    const { data: addRequestId, error } = await pm.rpc('create_procurement_item_add_request', {
      p_project_id: projectId,
      p_equipment: marker,
      p_unit: 'Adet',
      p_category: 'Elektrik',
      p_planned_qty: 12,
      p_note: marker,
    })
    expect(error).toBeNull()
    changeIds.push(addRequestId)
    await expectNotification(admin, addRequestId)

    expect(findExportedMaterial(await exportMaterialRows())).toBeUndefined()

    expect((await admin.rpc('review_procurement_item_change_request', {
      p_id: addRequestId, p_approve: true, p_review_note: marker,
    })).error).toBeNull()
    await expectNotification(pm, addRequestId)

    const { data: item, error: itemError } = await admin.from('procurement_items')
      .select('id,equipment,planned_qty,quantity')
      .eq('project_id', projectId)
      .eq('equipment', marker)
      .single()
    expect(itemError).toBeNull()
    itemId = item.id
    expect(Number(item.planned_qty)).toBe(12)
    expect(Number(item.quantity)).toBe(12)

    const exported = findExportedMaterial(await exportMaterialRows())
    expect(exported).toBeTruthy()
    expect(Number(exported[5])).toBe(12)
  })

  test('miktar değişikliği beklerken eski, onaylanınca yeni miktar Excel’e yansır', async () => {
    const { data: changeId, error } = await pm.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: itemId,
      p_new_planned_qty: 25.5,
      p_note: marker,
    })
    expect(error).toBeNull()
    changeIds.push(changeId)
    await expectNotification(admin, changeId)

    expect(Number(findExportedMaterial(await exportMaterialRows())[5])).toBe(12)

    expect((await admin.rpc('review_procurement_item_change_request', {
      p_id: changeId, p_approve: true, p_review_note: marker,
    })).error).toBeNull()
    await expectNotification(pm, changeId)

    const { data: updated } = await admin.from('procurement_items')
      .select('planned_qty,quantity').eq('id', itemId).single()
    expect(Number(updated.planned_qty)).toBe(25.5)
    expect(Number(updated.quantity)).toBe(25.5)
    expect(Number(findExportedMaterial(await exportMaterialRows())[5])).toBe(25.5)
  })

  test('reddedilen miktar değişikliği tabloyu ve Excel’i değiştirmez', async () => {
    const { data: rejectedId, error } = await pm.rpc('create_procurement_item_change_request', {
      p_procurement_item_id: itemId,
      p_new_planned_qty: 99,
      p_note: marker,
    })
    expect(error).toBeNull()
    changeIds.push(rejectedId)

    expect((await admin.rpc('review_procurement_item_change_request', {
      p_id: rejectedId, p_approve: false, p_review_note: marker,
    })).error).toBeNull()
    await expectNotification(pm, rejectedId)

    const { data: unchanged } = await admin.from('procurement_items')
      .select('planned_qty,quantity').eq('id', itemId).single()
    expect(Number(unchanged.planned_qty)).toBe(25.5)
    expect(Number(unchanged.quantity)).toBe(25.5)
    expect(Number(findExportedMaterial(await exportMaterialRows())[5])).toBe(25.5)
  })
})
