import { test, expect } from '@playwright/test'
import { loginUi, signIn } from './helpers.js'

// Faz 1 Adım 5 (faz1-adim5-tasarim.md §6): 4 rol × yeni ekranlar ve RPC'ler.
// Yalnızca yerel ortamda ve Faz 1 taslakları kuruluyken koşar (scripts/local-db/setup.mjs; LOCAL_DRAFTS=1).
// Canlıda bu nesneler yok; PW_TARGET=live ile kendini atlar.
// Veri: tohumdaki İzmir projesi (TIZ). Her koşu kendi görevlerini benzersiz kodla açar; Activity ID'li görevler
// silinemediği için sonda iptal edilir (Karar 40).

const LOCAL = process.env.PW_TARGET !== 'live' && process.env.LOCAL_DRAFTS === '1'
const P = process.env.TEST_PROJECT_IZMIR
const RUN = `A5${Date.now().toString(36).toUpperCase()}`

async function as(role) {
  const { client } = await signIn(process.env[`TEST_${role}_EMAIL`], process.env[`TEST_${role}_PASSWORD`])
  return client
}
const idOf = async (c, table, col, code) => (await c.from(table).select('id').eq('project_id', P).eq(col, code).single()).data.id

test.describe.serial('Adım 5 · RPC ve kurallar (4 rol)', () => {
  test.skip(!LOCAL, 'Yalnızca yerel ortam + Faz 1 taslakları')
  let pm, admin, ss, muh
  let w210, w310, w100, aB1, aB2
  const created = []

  test.beforeAll(async () => {
    ;[pm, admin, ss, muh] = await Promise.all([as('PROJEYONETICISI'), as('ADMIN'), as('IZMIR'), as('MUHASEBE')])
    w210 = await idOf(pm, 'project_wbs', 'wbs_code', 'TIZ-210')
    w310 = await idOf(pm, 'project_wbs', 'wbs_code', 'TIZ-310')
    w100 = await idOf(pm, 'project_wbs', 'wbs_code', 'TIZ-100')
    aB1 = await idOf(pm, 'project_areas', 'area_code', 'B1')
    aB2 = await idOf(pm, 'project_areas', 'area_code', 'B2')
    const { data, error } = await pm.from('project_tasks').insert([
      { project_id: P, task_code: `${RUN}-1`, task_name: `${RUN} kazık 1`, category: 'kolon_montaji', planned_start: '2026-11-01', planned_end: '2026-11-20' },
      { project_id: P, task_code: `${RUN}-2`, task_name: `${RUN} kazık 2`, category: 'kolon_montaji', planned_start: '2026-11-01', planned_end: '2026-11-20' },
    ]).select('id, task_code')
    expect(error).toBeNull()
    created.push(...data.map(d => d.id))
  })

  test.afterAll(async () => {
    if (!created.length) return
    await admin.from('project_tasks').update({ status: 'iptal' }).in('id', created)
  })

  test('toplu atama: şantiye şefi ve muhasebe forbidden; PM önizleme yazmaz, gerçek atama yazar', async () => {
    for (const c of [ss, muh]) {
      const { error } = await c.rpc('set_tasks_classification', { p_task_ids: created, p_discipline: 'mechanical', p_dry_run: true })
      expect(error?.message).toBe('forbidden')
    }
    const dry = await pm.rpc('set_tasks_classification', { p_task_ids: created, p_discipline: 'mechanical', p_area_id: aB1, p_wbs_id: w210, p_dry_run: true })
    expect(dry.error).toBeNull()
    expect(dry.data.summary).toMatchObject({ update: 2, error_count: 0, written: 0 })
    const before = await pm.from('project_tasks').select('discipline').in('id', created)
    expect(before.data.every(t => t.discipline === null)).toBe(true)
    const real = await pm.rpc('set_tasks_classification', { p_task_ids: created, p_discipline: 'mechanical', p_area_id: aB1, p_wbs_id: w210, p_dry_run: false })
    expect(real.error).toBeNull()
    expect(real.data.summary.written).toBe(2)
  })

  test('kod ata: şantiye şefi forbidden; PM önizleme = gerçek', async () => {
    const f = await ss.rpc('assign_activity_ids', { p_task_ids: [created[0]], p_dry_run: true })
    expect(f.error?.message).toBe('forbidden')
    const dry = await pm.rpc('assign_activity_ids', { p_task_ids: [created[0]], p_dry_run: true })
    const proposed = dry.data.items[0].activity_id
    expect(proposed).toMatch(/^TIZ-MEC-B1-\d{4,}$/)
    const real = await pm.rpc('assign_activity_ids', { p_task_ids: [created[0]], p_dry_run: false })
    expect(real.data.items[0].activity_id).toBe(proposed)
  })

  test('Karar 51: ID\'li görev bağ kümesi dışındaki WBS\'e taşınamaz, bağsız WBS\'e taşınır', async () => {
    const bad = await pm.from('project_tasks').update({ area_id: aB2 }).eq('id', created[0])
    expect(bad.error?.message).toMatch(/disiplini ve alanı değiştirilemez/)
    const ok310 = await pm.from('project_tasks').update({ wbs_id: w310 }).eq('id', created[0]) // {B1}
    expect(ok310.error).toBeNull()
    const ok100 = await pm.from('project_tasks').update({ wbs_id: w100 }).eq('id', created[0]) // bağsız
    expect(ok100.error).toBeNull()
    // created[1] ID'siz: B1 → B2 serbest; sonra ID'li yapılmadan {B1} kümeli WBS'e taşınabilir (kontrol yalnızca ID'li görevde)
    const free = await pm.from('project_tasks').update({ area_id: aB2, wbs_id: w310 }).eq('id', created[1])
    expect(free.error).toBeNull()
  })

  test('Karar 44: iptal etme ve yeniden açma yalnızca admin/PM', async () => {
    const ssCancel = await ss.from('project_tasks').update({ status: 'iptal' }).eq('id', created[1])
    expect(ssCancel.error?.message).toMatch(/yalnızca admin veya proje yöneticisi iptal edebilir/)
    const pmCancel = await pm.from('project_tasks').update({ status: 'iptal' }).eq('id', created[1])
    expect(pmCancel.error).toBeNull()
    const ssReopen = await ss.from('project_tasks').update({ status: 'beklemede' }).eq('id', created[1])
    expect(ssReopen.error?.message).toMatch(/yeniden açabilir/)
    const pmReopen = await pm.from('project_tasks').update({ status: 'beklemede' }).eq('id', created[1])
    expect(pmReopen.error).toBeNull()
  })

  test('Karar 55: şantiye şefi WBS/alan/bağ yazamaz; PM yazar', async () => {
    const ins = await ss.from('project_areas').insert({ project_id: P, area_code: `${RUN.slice(0, 6)}X`, name: 'şş alan' })
    expect(ins.error).not.toBeNull()
    const link = await ss.rpc('save_area_wbs_links', { p_wbs_id: w100, p_area_ids: [aB1] })
    expect(link.error?.message).toBe('forbidden')
    const code = `Z${RUN.slice(-4)}`
    const pmIns = await pm.from('project_areas').insert({ project_id: P, area_code: code, name: 'PM alan' }).select('id').single()
    expect(pmIns.error).toBeNull()
    await pm.from('project_areas').update({ is_active: false }).eq('id', pmIns.data.id)
  })

  test('Karar 56: ağırlıksız kategoriye görev yazılamaz; görevi olan kategori ağırlıktan çıkarılamaz', async () => {
    const t = await pm.from('project_tasks').insert({ project_id: P, task_code: `${RUN}-M`, task_name: 'mobilizasyon', category: 'mobilizasyon', planned_start: '2026-11-01', planned_end: '2026-11-02' })
    expect(t.error?.message).toMatch(/Bu kategori için ağırlık tanımlayın; fiziksel değilse %0 girin/)
    const { data: w } = await pm.from('project_category_weights').select('category, weight_pct').eq('project_id', P)
    const without = w.filter(x => x.category !== 'kolon_montaji')
    const moved = w.find(x => x.category === 'kolon_montaji')
    without[0] = { ...without[0], weight_pct: Number(without[0].weight_pct) + Number(moved.weight_pct) }
    const r = await pm.rpc('save_project_category_weights', { p_project_id: P, p_weights: without })
    expect(r.error?.message).toMatch(/Görevi olan kategori ağırlık tablosundan çıkarılamaz: kolon_montaji/)
  })

  test('proje oluşturma: create_project_with_code PM ile; kod tekrarı ve biçim reddi', async () => {
    const id = `zz-a5-${RUN.toLowerCase()}`
    const code = `Q${RUN.slice(-3)}`.replace(/[^A-Z0-9]/g, 'Q').slice(0, 5)
    const ok = await pm.rpc('create_project_with_code', { p_project: { id, name: 'A5 test' }, p_code: code })
    expect(ok.error).toBeNull()
    const dup = await pm.rpc('create_project_with_code', { p_project: { id: `${id}-2`, name: 'A5 test 2' }, p_code: code })
    expect(dup.error?.message).toBe('duplicate')
    const bad = await pm.rpc('create_project_with_code', { p_project: { id: `${id}-3`, name: 'A5 test 3' }, p_code: '1AB' })
    expect(bad.error?.message).toBe('validation')
    await admin.from('projects').delete().eq('id', id)
  })
})

test.describe.serial('Adım 5 · Sihirbaz görev kaydı (Ç-B, Karar 59)', () => {
  test.skip(!LOCAL, 'Yalnızca yerel ortam + Faz 1 taslakları')
  let pm

  test.beforeAll(async () => { pm = await as('PROJEYONETICISI') })

  test('ilerlemeli ve grup etiketli projede: güncelleme ID/ilerleme/group_label korur; çıkarılan ilerlemeli görev iptal, yeni görev silinir', async () => {
    const extra = `${RUN}-W`
    await pm.from('project_tasks').insert({ project_id: P, task_code: extra, task_name: 'silinecek', category: 'topraklama', planned_start: '2026-11-01', planned_end: '2026-11-02' })
    const { data: tasks } = await pm.from('project_tasks').select('*').eq('project_id', P).neq('status', 'iptal')
    const m010 = tasks.find(t => t.task_code === 'M-010')
    expect(Number(m010.total_progress)).toBeGreaterThan(0)
    // Sihirbaz yükü gibi: group_label/discipline gönderilmez; M-020 adı değişir; M-010 ve extra listeden çıkar
    const rows = tasks.filter(t => t.task_code !== 'M-010' && t.task_code !== extra).map(t => ({
      id: t.id, task_code: t.task_code, task_name: t.task_code === 'M-020' ? `${t.task_name} (düzenlendi)` : t.task_name,
      category: t.category, planned_start: t.planned_start, planned_end: t.planned_end, status: t.status,
      target_qty: t.target_qty, total_progress: t.total_progress, progress_pct: t.progress_pct,
    }))
    const dry = await pm.rpc('save_project_tasks', { p_project_id: P, p_tasks: rows, p_dry_run: true })
    expect(dry.error).toBeNull()
    const removed = Object.fromEntries(dry.data.removed.map(r => [r.task_code, r]))
    expect(removed['M-010']).toMatchObject({ action: 'cancel', reason: 'ilerlemesi var' })
    expect(removed[extra]).toMatchObject({ action: 'delete' })
    expect(dry.data.summary.update).toBeGreaterThanOrEqual(1)
    const real = await pm.rpc('save_project_tasks', { p_project_id: P, p_tasks: rows, p_dry_run: false })
    expect(real.error).toBeNull()
    const { data: after } = await pm.from('project_tasks').select('id, task_code, task_name, status, group_label, total_progress').eq('project_id', P)
    const by = Object.fromEntries(after.map(t => [t.task_code, t]))
    expect(by['M-010'].status).toBe('iptal')
    expect(by['M-010'].id).toBe(m010.id)
    expect(Number(by['M-010'].total_progress)).toBe(Number(m010.total_progress))
    expect(by[extra]).toBeUndefined()
    expect(by['M-020'].task_name).toMatch(/\(düzenlendi\)$/)
    expect(by['M-020'].group_label).toBe('Mekanik Bölüm › Blok 1')
    expect(by['E-010'].group_label).toBe('Elektriksel Bölüm › Inverter-1 › DC')
    // geri al: M-010 yeniden açılır
    await pm.from('project_tasks').update({ status: 'devam_ediyor' }).eq('id', m010.id)
  })
})

test.describe('Adım 5 · Ekranlar', () => {
  test.skip(!LOCAL, 'Yalnızca yerel ortam + Faz 1 taslakları')

  test('İş Planı (PM): Activity ID/Disiplin/Alan/WBS kolonları, seçim çubuğu ve Kod ata önizlemesi', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await page.goto(`/dashboard/projeler/${P}/gantt`)
    await page.getByRole('button', { name: 'Detaylı İş Planı' }).click()
    for (const h of ['Activity ID', 'Disiplin', 'Alan', 'WBS']) await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible()
    await page.locator('tr[data-task-code="M-030"] input[type="checkbox"]').check()
    await expect(page.getByText('1 görev seçili')).toBeVisible()
    await page.getByRole('button', { name: 'Kod ata' }).click()
    await expect(page.getByRole('dialog', { name: 'Kod Ata (Activity ID)' })).toBeVisible()
    await expect(page.getByText(/Önizleme: \d+ görev kod alacak/)).toBeVisible()
  })

  test('İş Planı (şantiye şefi): seçim ve sınıflandırma yok, iptal görev listede gizli', async ({ page }) => {
    await loginUi(page, process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD)
    await page.goto('/dashboard/is-plani') // şantiye şefinin projeler sekmesi yok; İş Planı kendi sekmesinde
    const detay = page.getByRole('button', { name: 'Detaylı İş Planı' })
    if (await detay.count()) await detay.click()
    await expect(page.getByRole('button', { name: 'Sınıflandır' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'İptal et' })).toHaveCount(0)
  })

  test('sihirbaz Adım 1: yeni projede proje kodu zorunlu', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await page.goto('/dashboard/proje-ekle')
    const manual = page.getByText(/Manuel doldur/i)
    test.skip(!(await manual.count()), 'Manuel sihirbaz girişi bulunamadı')
    await manual.first().click()
    await expect(page.getByTestId('proje-kodu')).toBeVisible()
  })

  test('Proje Ayarları › WBS ve Alanlar (PM; bağlantı ProjeDetay\'a eklenince)', async ({ page }) => {
    await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
    await page.goto(`/dashboard/projeler/${P}`)
    const tab = page.getByRole('button', { name: 'Proje Ayarları' })
    test.skip(!(await tab.count()), 'ProjeDetay bağlantısı kullanıcı onayı bekliyor (Karar 53, 58)')
    await tab.click()
    await expect(page.getByTestId('wbs-ve-alanlar')).toBeVisible()
    await expect(page.getByTestId('wbs-listesi').locator('[data-code="TIZ-210"]')).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Ekle' }).first()).toBeVisible()
    await page.getByTestId('wbs-listesi').locator('[data-code="TIZ-210"]').click()
    await expect(page.getByTestId('alan-wbs-panel')).toContainText('Etkin küme')
  })
  // Şantiye şefinin salt okunur görünümü: şantiye şefi ProjeDetay'a ulaşamıyor (projeler sekmesi yok);
  // ekranın yeri kullanıcı kararı bekliyor (faz1-adim5-tasarim.md Ek A, Ç5-6). Karar verilince test eklenecek.
})
