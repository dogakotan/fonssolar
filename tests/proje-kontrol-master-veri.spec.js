// Proje Kontrol — master veri tabloları (project_wbs, project_areas, area_wbs) yetki testi.
// Bu tablolar 05.10.2026 migration'ıyla canlıya geldi ve G-01 geçici kapatmasının KAPSAMI DIŞINDA
// (WBS/Alan ekranı doğrudan yazacak). Bu dosya mevcut policy'lerin başka projeye yazmayı engelleyip
// engellemediğini ÖLÇER, düzeltmez; sonuçlar docs/proje-kontrol/guvenlik-bulgulari.md G-10'da.
//
// Fikstürler yalnızca iki test projesinde (İzmir, Kayseri) açılır, afterAll'da admin tarafından
// silinir (sıra: area_wbs → project_areas → project_wbs; FK'ler restrict). Mevcut project_tasks
// satırlarına yazılmaz: identity_guard denemesi yalnızca reddedilmesi beklenen bir UPDATE'tir.
import { test, expect } from '@playwright/test'
import { makeClient, signIn } from './helpers.js'

const stamp = Date.now()
const code = suffix => `E2E-PK-${stamp}-${suffix}`

const denied = ({ data, error }) => Boolean(error) || (Array.isArray(data) && data.length === 0)

test.describe('Proje Kontrol — WBS/Alan master veri yetkileri', () => {
  let admin, santiye, muhasebe, pm, anon
  let izmir, kayseri
  const created = { wbs: [], areas: [], links: [] }
  let kWbs, kArea, iWbs, iWbsPassive

  async function adminInsert(table, row) {
    const { data, error } = await admin.from(table).insert(row).select().single()
    expect(error, `${table} fikstürü açılamadı: ${error?.message}`).toBeNull()
    return data
  }

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: santiye } = await signIn(process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD))
    ;({ client: muhasebe } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD))
    ;({ client: pm } = await signIn(process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD))
    anon = makeClient()
    izmir = process.env.TEST_PROJECT_IZMIR
    kayseri = process.env.TEST_PROJECT_KAYSERI

    kWbs = await adminInsert('project_wbs', { project_id: kayseri, wbs_code: code('KW'), name: 'E2E Kayseri WBS' })
    kArea = await adminInsert('project_areas', { project_id: kayseri, area_code: code('KA'), name: 'E2E Kayseri Alan' })
    iWbs = await adminInsert('project_wbs', { project_id: izmir, wbs_code: code('IW'), name: 'E2E İzmir WBS' })
    iWbsPassive = await adminInsert('project_wbs', { project_id: izmir, wbs_code: code('IWP'), name: 'E2E pasif', is_active: false })
    created.wbs.push(kWbs.id, iWbs.id, iWbsPassive.id)
    created.areas.push(kArea.id)
    await adminInsert('area_wbs', { project_id: kayseri, area_id: kArea.id, wbs_id: kWbs.id })
    created.links.push([kArea.id, kWbs.id])
  })

  test.afterAll(async () => {
    // Testlerin kendi açtıkları dahil, bu koşunun bütün fikstürlerini kod önekinden bul ve sil.
    const prefix = `E2E-PK-${stamp}-%`
    const [{ data: areas }, { data: wbs }] = await Promise.all([
      admin.from('project_areas').select('id').like('area_code', prefix),
      admin.from('project_wbs').select('id').like('wbs_code', prefix),
    ])
    const areaIds = (areas ?? []).map(r => r.id)
    const wbsIds = (wbs ?? []).map(r => r.id)
    if (areaIds.length) await admin.from('area_wbs').delete().in('area_id', areaIds)
    if (wbsIds.length) await admin.from('area_wbs').delete().in('wbs_id', wbsIds)
    if (areaIds.length) expect((await admin.from('project_areas').delete().in('id', areaIds)).error).toBeNull()
    if (wbsIds.length) expect((await admin.from('project_wbs').delete().in('id', wbsIds)).error).toBeNull()
    const [{ count: leftAreas }, { count: leftWbs }] = await Promise.all([
      admin.from('project_areas').select('id', { count: 'exact', head: true }).like('area_code', prefix),
      admin.from('project_wbs').select('id', { count: 'exact', head: true }).like('wbs_code', prefix),
    ])
    expect(leftAreas).toBe(0)
    expect(leftWbs).toBe(0)
  })

  test('anon: okuyamaz ve yazamaz', async () => {
    for (const table of ['project_wbs', 'project_areas', 'area_wbs']) {
      expect(denied(await anon.from(table).select('*').limit(1))).toBe(true)
    }
    expect((await anon.from('project_wbs').insert({ project_id: izmir, wbs_code: code('ANON'), name: 'x' })).error).toBeTruthy()
  })

  test('İzmir şantiye şefi Kayseri WBS’ini göremez, ekleyemez, değiştiremez, silemez', async () => {
    expect(denied(await santiye.from('project_wbs').select('id').eq('id', kWbs.id))).toBe(true)
    expect((await santiye.from('project_wbs').insert({ project_id: kayseri, wbs_code: code('S-KW'), name: 'x' }).select()).error).toBeTruthy()
    expect(denied(await santiye.from('project_wbs').update({ name: 'HACK' }).eq('id', kWbs.id).select('id'))).toBe(true)
    expect(denied(await santiye.from('project_wbs').delete().eq('id', kWbs.id).select('id'))).toBe(true)
    const { data } = await admin.from('project_wbs').select('name').eq('id', kWbs.id).single()
    expect(data.name).toBe('E2E Kayseri WBS')
  })

  test('şantiye şefi kendi projesinde de WBS ekleyemez (yalnızca admin/PM)', async () => {
    expect((await santiye.from('project_wbs').insert({ project_id: izmir, wbs_code: code('S-IW'), name: 'x' }).select()).error).toBeTruthy()
  })

  test('İzmir şantiye şefi Kayseri Alanını ekleyemez, değiştiremez, silemez', async () => {
    expect((await santiye.from('project_areas').insert({ project_id: kayseri, area_code: code('S-KA'), name: 'x' }).select()).error).toBeTruthy()
    expect(denied(await santiye.from('project_areas').update({ name: 'HACK' }).eq('id', kArea.id).select('id'))).toBe(true)
    expect(denied(await santiye.from('project_areas').delete().eq('id', kArea.id).select('id'))).toBe(true)
    const { data } = await admin.from('project_areas').select('name').eq('id', kArea.id).single()
    expect(data.name).toBe('E2E Kayseri Alan')
  })

  test('şantiye şefi kendi alanını açabilir ama başka projeye taşıyamaz ve silemez', async () => {
    const own = await santiye.from('project_areas').insert({ project_id: izmir, area_code: code('S-IA'), name: 'E2E şef alanı' }).select().single()
    expect(own.error).toBeNull() // tasarım gereği izinli (05.10 policy'si)
    const move = await santiye.from('project_areas').update({ project_id: kayseri }).eq('id', own.data.id).select('id')
    expect(denied(move)).toBe(true)
    expect(denied(await santiye.from('project_areas').delete().eq('id', own.data.id).select('id'))).toBe(true)
  })

  test('İzmir şantiye şefi Kayseri area_wbs bağını ekleyemez/silemez; projeler arası bağ FK ile reddedilir', async () => {
    const otherArea = await adminInsert('project_areas', { project_id: kayseri, area_code: code('KA2'), name: 'E2E Kayseri Alan 2' })
    expect((await santiye.from('area_wbs').insert({ project_id: kayseri, area_id: otherArea.id, wbs_id: kWbs.id }).select()).error).toBeTruthy()
    expect((await santiye.from('area_wbs').insert({ project_id: izmir, area_id: kArea.id, wbs_id: iWbs.id }).select()).error).toBeTruthy()
    expect(denied(await santiye.from('area_wbs').delete().eq('area_id', kArea.id).select('area_id'))).toBe(true)
    const { data } = await admin.from('area_wbs').select('area_id').eq('area_id', kArea.id)
    expect(data).toHaveLength(1)
  })

  test('muhasebe hiçbir master tabloya yazamaz', async () => {
    expect((await muhasebe.from('project_wbs').insert({ project_id: kayseri, wbs_code: code('M-W'), name: 'x' }).select()).error).toBeTruthy()
    expect((await muhasebe.from('project_areas').insert({ project_id: kayseri, area_code: code('M-A'), name: 'x' }).select()).error).toBeTruthy()
    expect((await muhasebe.from('area_wbs').insert({ project_id: kayseri, area_id: kArea.id, wbs_id: kWbs.id }).select()).error).toBeTruthy()
    expect(denied(await muhasebe.from('project_wbs').update({ name: 'HACK' }).eq('id', kWbs.id).select('id'))).toBe(true)
    expect(denied(await muhasebe.from('project_areas').delete().eq('id', kArea.id).select('id'))).toBe(true)
    expect(denied(await muhasebe.from('area_wbs').delete().eq('area_id', kArea.id).select('area_id'))).toBe(true)
  })

  test('proje yöneticisi (cross_project) her projeye yazabilir — tasarım gereği, bilgi amaçlı', async () => {
    const row = await pm.from('project_wbs').insert({ project_id: kayseri, wbs_code: code('PM-KW'), name: 'E2E PM' }).select().single()
    expect(row.error).toBeNull()
  })

  test('identity_guard: pasif WBS bir aktiviteye atanamaz (mevcut görev değişmeden kalır)', async () => {
    const { data: task } = await admin.from('project_tasks').select('id,wbs_id').eq('project_id', izmir).is('wbs_id', null).limit(1).single()
    const attempt = await admin.from('project_tasks').update({ wbs_id: iWbsPassive.id }).eq('id', task.id).select('id')
    expect(attempt.error?.message).toContain('Pasif WBS')
    const { data: after } = await admin.from('project_tasks').select('wbs_id').eq('id', task.id).single()
    expect(after.wbs_id).toBeNull()
  })
})
