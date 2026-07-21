
CREATE OR REPLACE FUNCTION fn_validate_invoice_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'bekliyor' AND NEW.status = 'muhasebe_onayında') OR
      (OLD.status = 'muhasebe_onayında' AND NEW.status IN ('yönetici_onayında', 'reddedildi')) OR
      (OLD.status = 'yönetici_onayında' AND NEW.status IN ('onaylandı', 'reddedildi')) OR
      (OLD.status = 'onaylandı' AND NEW.status = 'ödendi')
    ) THEN
      RAISE EXCEPTION 'Geçersiz fatura durum geçişi: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_invoice_status_transition
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION fn_validate_invoice_status_transition();

