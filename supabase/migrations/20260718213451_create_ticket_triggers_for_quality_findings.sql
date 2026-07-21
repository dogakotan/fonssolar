CREATE OR REPLACE FUNCTION fn_create_ticket_from_quality_finding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_created_by uuid;
  v_assigned_to uuid;
  v_title text;
BEGIN
  IF NEW.severity NOT IN ('yüksek', 'kritik') THEN
    RETURN NEW;
  END IF;

  SELECT created_by INTO v_created_by FROM quality_inspections WHERE id = NEW.inspection_id;

  IF NEW.assigned_to IS NOT NULL THEN
    SELECT id INTO v_assigned_to FROM profiles
     WHERE lower(full_name) = lower(NEW.assigned_to)
     LIMIT 1;
  END IF;

  v_title := 'Kalite Bulgusu' || CASE WHEN NEW.location IS NOT NULL THEN ' — ' || NEW.location ELSE '' END;

  INSERT INTO tickets (project_id, created_by, assigned_to, title, description, category, severity, status)
  VALUES (
    NEW.project_id, v_created_by, v_assigned_to, v_title, NEW.description, 'genel', NEW.severity,
    CASE NEW.status
      WHEN 'devam ediyor' THEN 'işlemde'
      WHEN 'çözüldü' THEN 'kapatıldı'
      ELSE 'gönderildi'
    END
  )
  RETURNING id INTO v_ticket_id;

  NEW.ticket_id := v_ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_ticket_from_quality_finding
BEFORE INSERT ON quality_inspection_findings
FOR EACH ROW
EXECUTE FUNCTION fn_create_ticket_from_quality_finding();

CREATE OR REPLACE FUNCTION fn_sync_ticket_status_from_quality_finding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE tickets
       SET status = CASE NEW.status
                       WHEN 'açık' THEN 'açık'
                       WHEN 'devam ediyor' THEN 'işlemde'
                       WHEN 'çözüldü' THEN 'kapatıldı'
                       ELSE status
                     END,
           resolved_at = CASE WHEN NEW.status = 'çözüldü' THEN now() ELSE resolved_at END,
           updated_at = now()
     WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_ticket_status_from_quality_finding
AFTER UPDATE ON quality_inspection_findings
FOR EACH ROW
EXECUTE FUNCTION fn_sync_ticket_status_from_quality_finding();

