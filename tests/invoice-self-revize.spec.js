import { test, expect } from '@playwright/test'
import { signIn, loginUi } from './helpers.js'

// FaturaDetayModal'a 18.09.2026'da eklenen "Geri Çek ve Düzenle" (self-revize)
// aksiyonunu doğrular — muhasebe, "Yönetici Onayında" bir faturada kendi
// hatasını (yanlış tutar/ürün vb.) fark ederse yöneticinin "Düzeltme İste"sini
// beklemeden faturayı kendisi geri çekip düzenleyebiliyor. Yeni bir RPC yok —
// mevcut invoice_approvals 'bekliyor'→'duzeltme_istendi' geçişini
// (fn_invoice_approval_cascade) muhasebe kendi adına tetikliyor; RLS
// (invoice_approvals_update) ve trigger zaten role-agnostik. Ama bu geçiş
// öncesinde çalışan fn_validate_invoice_status_transition (invoices BEFORE
// UPDATE) muhasebeye kapalıydı — allow_muhasebe_self_revize_invoice_from_manager_approval
// migration'ı bu tek geçişe muhasebe'yi ekledi (bkz. CLAUDE.md "Son değişiklik").
test('muhasebe yönetici_onayındaki faturayı kendisi geri çekip düzenleyebilir', async ({ page }) => {
  const { client, user } = await signIn(process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)
  // Temizlik admin client'ıyla yapılır — invoices üzerinde DELETE yalnızca
  // admin'e izinli (bkz. faz-e.spec.js'teki aynı not), muhasebe client'ıyla
  // silmeye çalışmak RLS'te sessizce 0 satır etkiler, artık kalır.
  const { client: admin } = await signIn(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD)
  const invoiceNo = `TEST-SELFREVIZE-${Date.now()}`

  const { data: inserted, error: insertError } = await client.from('invoices').insert({
    project_id: process.env.TEST_PROJECT_IZMIR,
    amount: 1000, vat_rate: 20, currency: 'TRY', category: 'malzeme',
    status: 'taslak', source: 'manuel',
    invoice_no: invoiceNo, invoice_date: new Date().toISOString().slice(0, 10),
    created_by: user.id,
  }).select('id').single()
  expect(insertError).toBeNull()

  // Onaya Gönder — gerçek uygulama akışıyla birebir (bkz. FaturaFormModal.jsx
  // handleOnayaGonder): invoice insert'i invoice_approvals satırını otomatik
  // oluşturmuyor, fn_invoice_approval_submitted bu INSERT'e tepki verip
  // invoices.status'u 'yönetici_onayında'ya çekiyor.
  const { error: submitError } = await client.from('invoice_approvals').insert({
    invoice_id: inserted.id, step: 1, step_label: 'Yönetici Onayı', status: 'bekliyor',
  })
  expect(submitError).toBeNull()

  try {
    const { data: pending } = await client.from('invoices').select('status').eq('id', inserted.id).single()
    expect(pending.status).toBe('yönetici_onayında')

    await loginUi(page, process.env.TEST_MUHASEBE_EMAIL, process.env.TEST_MUHASEBE_PASSWORD)
    await page.getByText('Finans', { exact: true }).first().click()
    await page.getByPlaceholder('Fatura no, tedarikçi veya proje ara').fill(invoiceNo)

    const row = page.locator('tr', { hasText: invoiceNo })
    await expect(row).toBeVisible()
    await row.click()

    const detailModal = page.locator('.invoice-detail-modal')
    await expect(detailModal.getByText('Yönetici Onayında', { exact: true })).toBeVisible()
    // Admin/proje_yoneticisi'nin OnayReddetActions'ı (Onayla/Düzeltme İste/Reddet)
    // muhasebede hiç görünmemeli — bu durumda tek aksiyon kendi geri çekmesi.
    await expect(detailModal.getByRole('button', { name: 'Reddet' })).toHaveCount(0)
    await expect(detailModal.getByRole('button', { name: 'Geri Çek ve Düzenle' })).toBeVisible()

    await detailModal.getByRole('button', { name: 'Geri Çek ve Düzenle' }).click()
    // Modal içindeki aynı isimli buton (gönder) ile tetikleyici butonu ayırt
    // etmek için modal'a scope edilmiş bir locator kullanılıyor.
    const modal = page.getByRole('dialog')
    await modal.getByPlaceholder('Geri çekme sebebi (zorunlu)').fill('Yanlış ürün girilmiş, tutar düzeltilecek')
    await modal.getByRole('button', { name: 'Geri Çek ve Düzenle' }).click()

    // Düzenleme formu doğrudan açılmalı — status artık duzeltme_bekliyor
    // olduğundan FaturaFormModal "Tekrar Gönder" etiketini göstermeli (bkz.
    // isDuzeltme, FaturaDetayModal'ın editing dalının effectiveInvoice
    // kullanmasıyla mümkün oldu).
    await expect(page.getByRole('button', { name: 'Tekrar Gönder' })).toBeVisible()
    await page.getByRole('button', { name: 'İptal' }).click()

    const { data: afterInvoice } = await client.from('invoices').select('status').eq('id', inserted.id).single()
    expect(afterInvoice.status).toBe('duzeltme_bekliyor')

    const { data: afterApproval } = await client
      .from('invoice_approvals')
      .select('status, note, reviewer_id')
      .eq('invoice_id', inserted.id)
      .single()
    expect(afterApproval.status).toBe('duzeltme_istendi')
    expect(afterApproval.note).toBe('Yanlış ürün girilmiş, tutar düzeltilecek')
    expect(afterApproval.reviewer_id).toBe(user.id)
  } finally {
    const { error: deleteError } = await admin.from('invoices').delete().eq('id', inserted.id)
    expect(deleteError).toBeNull()
  }
})
