import { test, expect } from '@playwright/test'
import { signIn, loginUi } from './helpers.js'

test.describe('Muhasebe rol kapsamı', () => {
  test('API yalnızca muhasebe alanındaki verileri açar', async () => {
    const [{ client: muhasebe, user }, { client: admin }] = await Promise.all([
      signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD),
      signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD),
    ])

    const [
      purchaseList,
      rawRequests,
      procurementItems,
      budgetLines,
      costAllocations,
      financeAll,
      financeProject,
      invoicesList,
      notifications,
      adminFinance,
    ] = await Promise.all([
      muhasebe.rpc('get_purchase_requests_list', { p_project_id: null, p_filter_date: null, p_only_pending: false }),
      muhasebe.from('purchase_requests').select('id,status'),
      muhasebe.from('procurement_items').select('id'),
      muhasebe.from('budget_lines').select('id'),
      muhasebe.from('cost_allocations').select('id'),
      muhasebe.rpc('get_finans_overview_all', { p_as_of_date: new Date().toISOString().slice(0, 10) }),
      muhasebe.rpc('get_finans_overview', { p_project_id: process.env.TEST_PROJECT_IZMIR, p_as_of_date: new Date().toISOString().slice(0, 10) }),
      muhasebe.rpc('get_invoices_list', { p_project_id: null, p_filter_date: null }),
      muhasebe.from('notifications').select('recipient_id'),
      admin.rpc('get_finans_overview_all', { p_as_of_date: new Date().toISOString().slice(0, 10) }),
    ])

    expect(purchaseList.error).toBeNull()
    expect(purchaseList.data.authorized).toBe(true)
    expect(purchaseList.data.requests.every(row => ['satin_alindi', 'fatura_bekliyor'].includes(row.status))).toBe(true)

    expect(rawRequests.error).toBeNull()
    expect(rawRequests.data.every(row => ['satin_alindi', 'fatura_bekliyor'].includes(row.status))).toBe(true)
    expect(procurementItems.data).toHaveLength(0)
    expect(budgetLines.data).toHaveLength(0)
    expect(costAllocations.data).toHaveLength(0)
    expect(financeAll.data).toMatchObject({ authorized: false })
    expect(financeProject.data).toMatchObject({ authorized: false })
    expect(invoicesList.error).toBeNull()
    expect(invoicesList.data.authorized).toBe(true)
    expect(notifications.data.every(row => row.recipient_id === user.id)).toBe(true)
    expect(adminFinance.data?.authorized).not.toBe(false)
  })

  test('arayüzde yalnız muhasebe sekmeleri görünür', async ({ page }) => {
    await loginUi(page, process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)

    await expect(page.getByRole('button', { name: 'Faturalar', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Genel', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Onay Kuyruğu', exact: true })).toHaveCount(0)
    await expect(page.getByText('Maliyet Tablosu', { exact: true })).toHaveCount(0)
  })
})
