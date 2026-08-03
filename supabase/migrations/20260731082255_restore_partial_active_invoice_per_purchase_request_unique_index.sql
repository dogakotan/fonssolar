-- BUG DÜZELTME: 20260721104806_harden_purchase_invoice_singleton_and_stage_guard
-- migration'ı invoices.purchase_request_id üzerindeki kısmi (yalnızca aktif/
-- reddedilmemiş faturalarda tekillik) unique index'i (invoices_active_purchase_request_id_unique,
-- WHERE status <> 'reddedildi') KOŞULSUZ bir index'e (invoices_purchase_request_id_unique,
-- WHERE purchase_request_id IS NOT NULL) çevirmişti.
--
-- Bu, sync_purchase_request_from_invoice/fn_invoice_approval_cascade'in tasarımıyla
-- doğrudan çelişiyordu: bir fatura reddedilince talep otomatik satin_alindi'ye dönüp
-- invoice_id null'lanıyor (yeniden faturalanabilir görünüyor) ama koşulsuz unique index
-- yüzünden İKİNCİ bir fatura oluşturma denemesi "duplicate key" hatasıyla başarısız
-- oluyordu — bir talebin faturası bir kez reddedilince o talep KALICI olarak
-- faturalanamaz hale geliyordu. resubmit_rejected_invoice/delete_rejected_invoice
-- RPC'lerinin 2026-07-24'te kaldırılma gerekçesi de ("artık otomatik satin_alindi'ye
-- dönüyor, yeniden faturalanabiliyor") bu index'in kısmi olmasını gerektiriyordu.
--
-- procurement-two-initiators.spec.js'in gerçek RPC zinciriyle uçtan uca testi
-- (reddet → yeni fatura oluştur) sırasında bulundu.
DROP INDEX public.invoices_purchase_request_id_unique;

CREATE UNIQUE INDEX invoices_active_purchase_request_id_unique
  ON public.invoices (purchase_request_id)
  WHERE purchase_request_id IS NOT NULL AND status <> 'reddedildi';
