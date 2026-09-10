import { test, expect } from '@playwright/test'
import { signIn, loginUi } from './helpers.js'

// 09.09.2026'da eklenen Şirket seçici (Fons Solar / PV Solution) hiç test
// kapsamında değildi — bu dosya iki riski doğrular: (1) PV Solution kaydı
// projesiz oluşturulabiliyor ve cost_allocations'a hiç yansımıyor (bilinçli
// tasarım, kazara bir maliyet sızıntısı olmamalı), (2) Fons Solar yolu
// (varsayılan, mevcut davranış) hâlâ normal şekilde cost_allocations'a
// yansıyor — Şirket seçici eklenirken bu yol kazara bozulmamış.
//
// Not: financial_transactions'ta client-erişimli bir DELETE policy'si yok
// (kayıtlar hiç hard-delete edilmiyor, invoices/purchase_requests'teki
// "iptal" deseninin aynısı) — temizlik status='iptal'e çekilerek yapılıyor,
// bu da trg_financial_transaction_cost_allocation'ı tetikleyip bağlı
// cost_allocations satırını da otomatik siliyor. cost_allocations'ın kendisi
// admin-only SELECT/DELETE (muhasebe göremez) olduğundan o kontrol admin
// client'ı ile yapılıyor.
test.describe('Şirket seçici (Fons Solar / PV Solution)', () => {
  test('PV Solution harcaması projesiz oluşturulabilir ve cost_allocations etkilenmez', async () => {
    const { client } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)
    const { client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    const transactionNo = `TEST-PV-${Date.now()}`

    const { data: row, error } = await client.from('financial_transactions').insert({
      transaction_no: transactionNo,
      transaction_type: 'diger',
      company: 'pv_solution',
      project_id: null,
      beneficiary_name: 'Test Alacaklı PV',
      transaction_date: new Date().toISOString().slice(0, 10),
      amount: 1234,
      currency: 'TRY',
      description: 'Playwright test — PV Solution genel harcama',
    }).select().single()

    expect(error).toBeNull()
    expect(row.company).toBe('pv_solution')
    expect(row.project_id).toBeNull()

    const { data: allocations } = await admin
      .from('cost_allocations')
      .select('id')
      .eq('transaction_id', row.id)
    expect(allocations).toHaveLength(0)

    await client.from('financial_transactions').update({ status: 'iptal' }).eq('id', row.id)
  })

  test('Fons Solar harcaması cost_allocations\'a yansımaya devam ediyor', async () => {
    const { client } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)
    const { client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
    const transactionNo = `TEST-FONS-${Date.now()}`

    const { data: row, error } = await client.from('financial_transactions').insert({
      transaction_no: transactionNo,
      transaction_type: 'diger',
      company: 'fons_solar',
      project_id: process.env.TEST_PROJECT_IZMIR,
      beneficiary_name: 'Test Alacaklı Fons',
      transaction_date: new Date().toISOString().slice(0, 10),
      amount: 4321,
      currency: 'TRY',
      description: 'Playwright test — Fons Solar genel harcama',
    }).select().single()

    expect(error).toBeNull()

    const { data: allocations } = await admin
      .from('cost_allocations')
      .select('id, amount, category')
      .eq('transaction_id', row.id)
    expect(allocations).toHaveLength(1)
    expect(Number(allocations[0].amount)).toBe(4321)

    // status='iptal'e çekmek trg_financial_transaction_cost_allocation'ı
    // tekrar tetikleyip bağlı cost_allocations satırını da otomatik siliyor.
    await client.from('financial_transactions').update({ status: 'iptal' }).eq('id', row.id)
    const { data: afterCancel } = await admin
      .from('cost_allocations')
      .select('id')
      .eq('transaction_id', row.id)
    expect(afterCancel).toHaveLength(0)
  })

  test('arayüzde PV Solution seçilince Proje ve Bağlı Talep kartı gizlenir', async ({ page }) => {
    await loginUi(page, process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)

    await page.getByText('Finans', { exact: true }).first().click()
    await page.getByRole('button', { name: '＋ Fatura / Harcama Ekle', exact: true }).click()

    await expect(page.getByText('Proje ve Bağlı Talep')).toBeVisible()

    await page.getByRole('button', { name: 'PV Solution', exact: true }).click()
    await expect(page.getByText('Proje ve Bağlı Talep')).toHaveCount(0)

    await page.getByRole('button', { name: 'Fons Solar', exact: true }).click()
    await expect(page.getByText('Proje ve Bağlı Talep')).toBeVisible()

    await page.getByRole('button', { name: 'İptal' }).click()
  })
})
