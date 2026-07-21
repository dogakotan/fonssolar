
-- AFTER → BEFORE yap (NEW.reviewed_at set edebilmek için)
drop trigger if exists trg_invoice_approval_cascade on invoice_approvals;

create trigger trg_invoice_approval_cascade
before update on invoice_approvals
for each row
execute function fn_invoice_approval_cascade();

