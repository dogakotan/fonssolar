import { test, expect } from '@playwright/test'
import { loginUi, signIn } from './helpers.js'

test.describe.serial('İş planından manuel ilerleme', () => {
  const reportDate = '2099-12-30'
  const projectId = process.env.TEST_PROJECT_IZMIR
  const foreignProjectId = process.env.TEST_PROJECT_KAYSERI
  let admin, pm, siteChief, accounting
  let pmId, siteChiefId
  let task
  let riskTask
  let reportId
  let initialTaskTotal

  test.beforeAll(async () => {
    ;({ client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD))
    ;({ client: pm, user: { id: pmId } } = await signIn(
      process.env.TEST_PROJEYONETICISI_EMAIL,
      process.env.TEST_PROJEYONETICISI_PASSWORD,
    ))
    ;({ client: siteChief, user: { id: siteChiefId } } = await signIn(
      process.env.TEST_IZMIR_EMAIL,
      process.env.TEST_IZMIR_PASSWORD,
    ))
    ;({ client: accounting } = await signIn(
      process.env.TEST_MUHASEBE_EMAIL,
      process.env.TEST_MUHASEBE_PASSWORD,
    ))

    const { data: tasks, error } = await admin
      .from('project_tasks')
      .select('id, task_code, task_name, target_qty, total_progress, unit')
      .eq('project_id', projectId)
      .gt('target_qty', 0)
      .limit(1)
    expect(error).toBeNull()
    task = tasks[0]
    initialTaskTotal = Number(task.total_progress || 0)

    const { data: risks } = await admin
      .from('project_risks')
      .select('subject_ref')
      .eq('project_id', projectId)
      .eq('rule_code', 'gorev_gecikmesi')
      .neq('status', 'kapatıldı')
      .limit(1)
    if (risks?.[0]?.subject_ref) {
      riskTask = (await admin
        .from('project_tasks')
        .select('task_name')
        .eq('project_id', projectId)
        .eq('task_code', risks[0].subject_ref)
        .maybeSingle()).data
    }
  })

  test.afterAll(async () => {
    if (reportId) {
      await admin.from('notifications').delete().eq('entity_type', 'daily_report').eq('entity_id', reportId)
      await admin.from('daily_reports').delete().eq('id', reportId)
    }
  })

  test('yetkisiz rol ve proje dışı kullanıcı ilerleme ekleyemez', async () => {
    const accountingAttempt = await accounting.rpc('add_task_progress', {
      p_task_id: task.id,
      p_qty: 0.1,
      p_note: 'Yetkisiz muhasebe denemesi',
      p_report_date: reportDate,
    })
    expect(accountingAttempt.error).not.toBeNull()

    const { data: foreignTasks, error: foreignTaskError } = await admin
      .from('project_tasks')
      .select('id')
      .eq('project_id', foreignProjectId)
      .gt('target_qty', 0)
      .limit(1)
    expect(foreignTaskError).toBeNull()
    expect(foreignTasks).not.toHaveLength(0)

    const crossProjectAttempt = await siteChief.rpc('add_task_progress', {
      p_task_id: foreignTasks[0].id,
      p_qty: 0.1,
      p_note: 'Proje dışı ilerleme denemesi',
      p_report_date: reportDate,
    })
    expect(crossProjectAttempt.error).not.toBeNull()
  })

  test('proje yöneticisi ve şantiye şefi aynı günlük raporda ilerlemeyi biriktirir', async () => {
    const first = await pm.rpc('add_task_progress', {
      p_task_id: task.id,
      p_qty: 0.1,
      p_note: 'E2E proje yöneticisi manuel ilerleme',
      p_report_date: reportDate,
    })
    expect(first.error).toBeNull()
    reportId = first.data.report_id

    const second = await siteChief.rpc('add_task_progress', {
      p_task_id: task.id,
      p_qty: 0.2,
      p_note: 'E2E şantiye şefi manuel ilerleme',
      p_report_date: reportDate,
    })
    expect(second.error).toBeNull()
    expect(second.data.report_id).toBe(reportId)

    const { data: report } = await admin
      .from('daily_reports')
      .select('auto_created_from_progress')
      .eq('id', reportId)
      .single()
    expect(report.auto_created_from_progress).toBe(true)

    const { data: rows } = await admin
      .from('progress_daily')
      .select('qty_added, source, entered_by')
      .eq('report_id', reportId)
      .eq('task_id', task.id)
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.source === 'manual')).toBe(true)
    expect(new Set(rows.map(row => row.entered_by))).toEqual(new Set([pmId, siteChiefId]))
    expect(rows.reduce((sum, row) => sum + Number(row.qty_added), 0)).toBeCloseTo(0.3)

    const { data: notifications } = await admin
      .from('notifications')
      .select('id, title')
      .eq('entity_type', 'daily_report')
      .eq('entity_id', reportId)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toContain('iş planına ilerleme girildi')
  })

  test('rapor kaydı manuel ilerlemeyi korur, PDF/KPI okuyucusuna toplamı verir', async () => {
    const saved = await siteChief.rpc('save_daily_report', {
      p_project_id: projectId,
      p_report_date: reportDate,
      p_created_by: siteChiefId,
      p_general_status: 'normal',
      p_worker_count: 0,
      p_weather: 'açık',
      p_weather_note: null,
      p_notes: null,
      p_personnel: [],
      p_machinery: [],
      p_progress: [],
      p_daily_tasks: [],
      p_materials: [],
      p_issues: [],
      p_task_progress: [{ task_id: task.id, qty_added: 0.4, note: 'E2E rapor içi ilerleme' }],
    })
    expect(saved.error).toBeNull()
    expect(saved.data).toBe(reportId)

    const extra = await pm.rpc('add_task_progress', {
      p_task_id: task.id,
      p_qty: 0.1,
      p_note: 'E2E rapor sonrası ilerleme',
      p_report_date: reportDate,
    })
    expect(extra.error).toBeNull()
    expect(extra.data.report_updated).toBe(true)

    const { data: detail, error: detailError } = await admin.rpc('get_daily_report_detail', {
      p_report_id: reportId,
    })
    expect(detailError).toBeNull()
    expect(detail.report.auto_created_from_progress).toBe(false)
    expect(detail.progress.reduce((sum, row) => sum + Number(row.qty_added), 0)).toBeCloseTo(0.8)
    expect(detail.progress.some(row => row.source === 'daily_report')).toBe(true)
    expect(detail.progress.filter(row => row.source === 'manual')).toHaveLength(2)

    const { data: updatedTask } = await admin
      .from('project_tasks')
      .select('total_progress')
      .eq('id', task.id)
      .single()
    expect(Number(updatedTask.total_progress)).toBeCloseTo(initialTaskTotal + 0.8)

    const { data: notifications } = await admin
      .from('notifications')
      .select('id, title')
      .eq('entity_type', 'daily_report')
      .eq('entity_id', reportId)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toContain('günlük raporu güncellendi')
  })

  test('şantiye şefi arayüzünde sade metinler, risk derecesi ve ilerleme butonu görünür', async ({ page }) => {
    await loginUi(page, process.env.TEST_IZMIR_EMAIL, process.env.TEST_IZMIR_PASSWORD)

    await page.getByText('İş Planı', { exact: true }).first().click()
    await expect(page.getByText('Gantt İş Planı', { exact: true })).toBeVisible()
    await page.getByText(task.task_name, { exact: false }).first().click()
    await expect(page.getByRole('button', { name: '+ İlerleme Gir', exact: true })).toBeVisible()
    if (riskTask?.task_name) {
      await expect(page.getByText(new RegExp(`${riskTask.task_name} \\(.+\\)`)).first()).toBeVisible()
    }

    await page.getByText('Tickets', { exact: true }).first().click()
    await page.getByRole('button', { name: '+ Yeni Ticket', exact: true }).click()
    await expect(page.getByText('Genel (projeye bağlı değil)', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '×', exact: true }).click()

    await page.getByText('Raporlarım', { exact: true }).first().click()
    await page.getByRole('button', { name: '+ Yeni Rapor Gir', exact: true }).click()
    await expect(page.getByText('Fotoğraflar (Opsiyonel)', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Notlar (Opsiyonel)', { exact: true })).toHaveCount(0)
  })
})
