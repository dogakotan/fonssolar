-- Kök neden: 3 eski fatura (INV-2026-016, INV-KAY-2026-006, INV-KAY-2026-010 —
-- 2026-06-24/2026-07-06'da oluşturulmuş, requires_payment_tracking sütunu ve
-- odeme_bekliyor ayrımından önce) requires_payment_tracking=true olduğu halde
-- status='onaylandı'da kalmıştı — bugünkü fn_invoice_approval_cascade mantığı
-- bu kombinasyonu asla üretmez (true ise her zaman odeme_bekliyor'a gider),
-- yani seed/eski veri, muhtemelen trigger'ı hiç tetiklemeden doğrudan SQL ile
-- yazılmış. Toplam ₺975.600 gerçek ödeme hiçbir ekranda (Ödeme Takibi dahil)
-- görünmüyordu, askıda kalmıştı. fn_validate_invoice_status_transition
-- 'onaylandı'->'odeme_bekliyor' geçişini normal rol bağlamında izin listesine
-- almadığından (migration bağlamında get_my_role() da null döner), trigger
-- CLAUDE.md'de zaten belgelenen desenle geçici kapatılıp açılır.
alter table public.invoices disable trigger trg_validate_invoice_status_transition;

update public.invoices
set status = 'odeme_bekliyor', updated_at = now()
where invoice_no in ('INV-2026-016', 'INV-KAY-2026-006', 'INV-KAY-2026-010');

alter table public.invoices enable trigger trg_validate_invoice_status_transition;
