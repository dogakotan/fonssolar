-- Tedarikçi bakiyesi / Finans Raporları çoklu para birimini karıştırıyordu
-- (bkz. CLAUDE.md "Bilinen açık noktalar") — v_invoice_payment_overview
-- yalnızca invoices.total_amount'ı (faturanın kendi para biriminde) döndürüyordu,
-- invoices.total_amount_try (TRY karşılığı, generated column) view'a hiç
-- yansımamıştı. Bu, frontend'in USD/EUR faturaları TRY faturalarla aynı
-- toplamda karıştırmasına yol açıyordu.
--
-- Kısmi/hızlı çözüm (kullanıcı kararı, 2026-07-31): yalnızca total_amount_try
-- eklendi, paid_amount/remaining_amount kapsam dışı bırakıldı — ödeme takibi
-- hâlâ faturanın kendi para biriminde kalır (ödeme tarihindeki kur farkını da
-- hesaba katan tam çözüm ayrı, daha büyük bir görev olarak ertelendi).
CREATE OR REPLACE VIEW public.v_invoice_payment_overview
WITH (security_invoker = on) AS
SELECT
    id,
    invoice_no,
    project_id,
    supplier_id,
    status,
    currency,
    total_amount,
    paid_amount,
    remaining_amount,
    due_date,
    CASE
        WHEN status = ANY (ARRAY['odeme_bekliyor'::text, 'kismen_odendi'::text]) AND due_date < CURRENT_DATE THEN 'vadesi_gecti'::text
        WHEN status = ANY (ARRAY['odeme_bekliyor'::text, 'kismen_odendi'::text]) AND due_date <= (CURRENT_DATE + '7 days'::interval) THEN 'vadesi_yaklasiyor'::text
        ELSE NULL::text
    END AS vade_durumu,
    total_amount_try
FROM invoices i;
