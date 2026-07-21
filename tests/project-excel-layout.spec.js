import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import { signIn } from './helpers.js'

test('proje Excel export bütçe özetini ve dinamik ağırlık toplamını üretir', async () => {
  const { client } = await signIn(
    process.env.TEST_PROJEYONETICISI_EMAIL,
    process.env.TEST_PROJEYONETICISI_PASSWORD,
  )
  const session = (await client.auth.getSession()).data.session
  const projectId = process.env.TEST_PROJECT_IZMIR

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
  const budget = workbook.Sheets.Bütçe
  const weights = workbook.Sheets['Kategori Ağırlıkları']
  expect(budget).toBeTruthy()
  expect(weights).toBeTruthy()

  expect(budget.G4.v).toBe('KATEGORİ REHBERİ')
  expect(budget.J4.v).toBe('BÜTÇE ÖZETİ (OTOMATİK)')
  expect(budget.K6.f).toBe('SUMIF($A$6:$A$304,"panel",$C$6:$C$304)')
  expect(budget.K18.f).toBe('SUM(K6:K17)')
  expect(budget.K20.f).toBe('COUNTIF($A$6:$A$304,"<>")')

  const weightRows = XLSX.utils.sheet_to_json(weights, { header: 1, defval: null })
  const totalIndex = weightRows.findIndex(row => row[0] === 'TOPLAM')
  expect(totalIndex).toBeGreaterThan(4)
  const totalRow = totalIndex + 1
  expect(weights[`B${totalRow}`].f).toBe(`SUM(B5:B${totalRow - 1})`)
})
