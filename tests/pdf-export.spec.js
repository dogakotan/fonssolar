import { test, expect } from '@playwright/test'
import { loginUi } from './helpers.js'

test('proje günlük PDF raporu Python servisiyle indirilebilir', async ({ page }) => {
  await loginUi(page, process.env.TEST_PROJEYONETICISI_EMAIL, process.env.TEST_PROJEYONETICISI_PASSWORD)
  await page.getByText('Projeler', { exact: true }).first().click()
  await page.getByText('Ege Enerji İzmir GES TEST', { exact: true }).first().click()
  await page.getByRole('button', { name: /Dışa Aktar/ }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Günlük PDF raporu', exact: true }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
  expect(await download.failure()).toBeNull()
})
