CREATE OR REPLACE FUNCTION public.fn_validate_invoice_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'bekliyor' AND NEW.status = 'muhasebe_onayında') OR
      (OLD.status = 'muhasebe_onayında' AND NEW.status IN ('yönetici_onayında', 'reddedildi')) OR
      (OLD.status = 'yönetici_onayında' AND NEW.status IN ('onaylandı', 'reddedildi')) OR
      (OLD.status = 'onaylandı' AND NEW.status IN ('ödendi', 'reddedildi'))
    ) THEN
      RAISE EXCEPTION 'Geçersiz fatura durum geçişi: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

