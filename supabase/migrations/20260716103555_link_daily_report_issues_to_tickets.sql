
-- 1. tickets.severity: allow 'kritik' so daily_report_issues.priority maps 1:1
ALTER TABLE tickets DROP CONSTRAINT tickets_severity_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_severity_check
  CHECK (severity = ANY (ARRAY['düşük'::text, 'orta'::text, 'yüksek'::text, 'kritik'::text]));

-- 2. daily_report_issues: track which ticket was auto-created from this issue
ALTER TABLE daily_report_issues
  ADD COLUMN ticket_id uuid REFERENCES tickets(id);

-- 3. BEFORE INSERT: auto-create a ticket for every new daily report issue
CREATE OR REPLACE FUNCTION fn_create_ticket_from_daily_report_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket_id uuid;
  v_created_by uuid;
  v_assigned_to uuid;
BEGIN
  -- Reporter of the daily report becomes the ticket creator
  SELECT created_by INTO v_created_by FROM daily_reports WHERE id = NEW.report_id;

  -- Best-effort match of the free-text assignee name to a profile
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT id INTO v_assigned_to FROM profiles
     WHERE lower(full_name) = lower(NEW.assigned_to)
     LIMIT 1;
  END IF;

  INSERT INTO tickets (project_id, created_by, assigned_to, title, description, category, severity, status)
  VALUES (
    NEW.project_id,
    v_created_by,
    v_assigned_to,
    NEW.topic,
    NEW.description,
    'genel',
    NEW.priority,   -- düşük/orta/yüksek/kritik now match on both sides
    CASE NEW.resolution_status
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

CREATE TRIGGER trg_create_ticket_from_daily_report_issue
BEFORE INSERT ON daily_report_issues
FOR EACH ROW EXECUTE FUNCTION fn_create_ticket_from_daily_report_issue();

-- 4. AFTER UPDATE: keep the linked ticket's status in sync when the site
--    manager updates resolution_status directly on the daily report issue
CREATE OR REPLACE FUNCTION fn_sync_ticket_status_from_daily_report_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.ticket_id IS NOT NULL AND NEW.resolution_status IS DISTINCT FROM OLD.resolution_status THEN
    UPDATE tickets
       SET status = CASE NEW.resolution_status
                       WHEN 'açık' THEN 'açık'
                       WHEN 'devam ediyor' THEN 'işlemde'
                       WHEN 'çözüldü' THEN 'kapatıldı'
                       ELSE status
                     END,
           resolved_at = CASE WHEN NEW.resolution_status = 'çözüldü' THEN now() ELSE resolved_at END,
           updated_at = now()
     WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_ticket_status_from_daily_report_issue
AFTER UPDATE ON daily_report_issues
FOR EACH ROW EXECUTE FUNCTION fn_sync_ticket_status_from_daily_report_issue();

