
-- =====================================================
-- ADIM 2: Status Check Constraint'leri
-- =====================================================

-- purchase_requests.status geçerli değerleri
ALTER TABLE purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

ALTER TABLE purchase_requests
  ADD CONSTRAINT purchase_requests_status_check
  CHECK (status = ANY (ARRAY[
    'bekliyor',
    'onaylandı',
    'reddedildi',
    'satın_alındı',
    'iptal'
  ]));

-- purchase_requests.urgency geçerli değerleri (mevcut verilere göre)
ALTER TABLE purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_urgency_check;

ALTER TABLE purchase_requests
  ADD CONSTRAINT purchase_requests_urgency_check
  CHECK (urgency = ANY (ARRAY[
    'normal',
    'acil',
    'çok_acil'
  ]));

-- procurement_items.status geçerli değerleri
ALTER TABLE procurement_items
  DROP CONSTRAINT IF EXISTS procurement_items_status_check;

ALTER TABLE procurement_items
  ADD CONSTRAINT procurement_items_status_check
  CHECK (status = ANY (ARRAY[
    'planlandı',
    'sipariş_verildi',
    'teslim_edildi',
    'iptal',
    'gecikmiş'
  ]));

-- invoices.status (mevcut değerler yeterli ama belgelensin)
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY[
    'bekliyor',
    'muhasebe_onayında',
    'yönetici_onayında',
    'onaylandı',
    'reddedildi',
    'ödendi'
  ]));

-- invoice_approvals.status
ALTER TABLE invoice_approvals
  DROP CONSTRAINT IF EXISTS invoice_approvals_status_check;

ALTER TABLE invoice_approvals
  ADD CONSTRAINT invoice_approvals_status_check
  CHECK (status = ANY (ARRAY[
    'bekliyor',
    'onaylandı',
    'reddedildi'
  ]));

